/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020, 2021, 2022.
Russell Goldin, tagyoureit.  russ.goldin@gmail.com

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
import { Inbound } from "../Messages";
import { state, PumpState } from "../../../State";
import { sys, Pump } from "../../../Equipment";
import { logger } from "../../../../logger/Logger";

type PendingRead = {
    startAddr: number;
    quantity: number;
    requestedAt: number;
};

export class NeptuneModbusStateMessage {
    private static pendingReads: Map<number, PendingRead[]> = new Map();

    public static enqueueReadRequest(address: number, startAddr: number, quantity: number) {
        const queue = this.pendingReads.get(address) || [];
        queue.push({ startAddr, quantity, requestedAt: Date.now() });
        this.pendingReads.set(address, queue);
    }

    public static clearReadRequests(address: number) {
        this.pendingReads.delete(address);
    }

    private static dequeueReadRequest(address: number): PendingRead {
        const queue = this.pendingReads.get(address);
        if (!queue || queue.length === 0) return undefined;
        const request = queue.shift();
        if (queue.length === 0) this.pendingReads.delete(address);
        else this.pendingReads.set(address, queue);
        return request;
    }

    private static getNeptunePumpByAddress(address: number): Pump {
        for (let i = 0; i < sys.pumps.length; i++) {
            const pump = sys.pumps.getItemByIndex(i);
            const typeName = sys.board.valueMaps.pumpTypes.getName(pump.type);
            if (typeName === 'neptunemodbus' && pump.address === address) return pump;
        }
        return undefined;
    }

    private static toSigned16(value: number): number {
        return value > 0x7FFF ? value - 0x10000 : value;
    }

    private static decodeModbusException(code: number): string {
        const modbusExceptions = {
            0x01: 'Illegal function',
            0x02: 'Illegal data address',
            0x03: 'Illegal data value',
            0x04: 'Server device failure',
            0x05: 'Acknowledge',
            0x06: 'Server device busy',
            0x08: 'Memory parity error',
            0x0A: 'Gateway path unavailable',
            0x0B: 'Gateway target failed to respond',
        };
        return modbusExceptions[code] || `Unknown Modbus exception ${code}`;
    }

    private static processReadInput(msg: Inbound, address: number, pumpState: PumpState) {
        const request = this.dequeueReadRequest(address);
        const byteCount = msg.extractPayloadByte(0, 0);
        if (byteCount <= 0 || (byteCount % 2) !== 0) {
            logger.debug(`NeptuneModbusStateMessage.processReadInput invalid byte count ${byteCount} (Address: ${address})`);
            return;
        }
        if (msg.payload.length < byteCount + 1) {
            logger.debug(`NeptuneModbusStateMessage.processReadInput short payload (Address: ${address})`);
            return;
        }

        let motorFaultCode = 0;
        let interfaceFaultCode = 0;
        let stoppedState: number = undefined;

        for (let i = 0; i < byteCount; i += 2) {
            const value = (msg.payload[i + 1] << 8) | msg.payload[i + 2];
            const offset = i / 2;
            const registerAddr = request ? request.startAddr + offset : -1;
            switch (registerAddr) {
                case 0: // 30001 Current Speed
                    pumpState.rpm = value;
                    break;
                case 3: // 30004 Motor Power
                    pumpState.watts = value;
                    break;
                case 5: // 30006 Motor Fault Status
                    logger.debug(`Neptune motor fault status ${value} (Address: ${address})`);
                    break;
                case 6: // 30007 Motor Fault Code
                    motorFaultCode = value;
                    break;
                case 30: // 30031 Interface Fault State
                    logger.debug(`Neptune interface fault state ${value} (Address: ${address})`);
                    break;
                case 31: // 30032 Interface Fault Code
                    interfaceFaultCode = value;
                    break;
                case 113: // 30114 Stopped State bit image
                    stoppedState = value;
                    break;
                case 119: // 30120 Target shaft speed (signed)
                    pumpState.targetSpeed = Math.abs(this.toSigned16(value));
                    break;
                default:
                    // Keep MVP mapping focused on existing pump state fields.
                    break;
            }
        }

        const hasFault = motorFaultCode > 0 || interfaceFaultCode > 0;
        if (hasFault) {
            logger.warn(`Neptune fault detected (Address: ${address}) motorFault=${motorFaultCode} interfaceFault=${interfaceFaultCode}`);
            pumpState.status = 16;
            pumpState.driveState = 4;
            pumpState.command = 4;
            return;
        }

        if (typeof stoppedState !== 'undefined') {
            const isStopped = (stoppedState & 0x01) === 1;
            pumpState.driveState = isStopped ? 0 : 2;
            pumpState.command = isStopped ? 4 : 10;
            pumpState.status = isStopped ? 0 : 1;
        }
        else if (pumpState.rpm > 0) {
            pumpState.driveState = 2;
            pumpState.command = 10;
            pumpState.status = 1;
        }
        else {
            pumpState.driveState = 0;
            pumpState.command = 4;
            pumpState.status = 0;
        }
    }

    private static processWriteSingle(msg: Inbound, address: number, pumpState: PumpState) {
        if (msg.payload.length < 4) return;
        const registerAddr = (msg.payload[0] << 8) | msg.payload[1];
        const registerValue = (msg.payload[2] << 8) | msg.payload[3];
        switch (registerAddr) {
            case 0: // 40001 Motor On/Off
                if (registerValue === 0) {
                    pumpState.driveState = 0;
                    pumpState.command = 4;
                    pumpState.status = 0;
                }
                else if (registerValue === 1) {
                    pumpState.driveState = 2;
                    pumpState.command = 10;
                    pumpState.status = 1;
                }
                break;
            case 1: // 40002 Manual speed RPM
                pumpState.rpm = registerValue;
                break;
            default:
                logger.debug(`Neptune write ack for unhandled register ${registerAddr}=${registerValue} (Address: ${address})`);
                break;
        }
    }

    public static process(msg: Inbound) {
        const address = msg.dest;
        const functionCode = msg.action;
        const pumpCfg = this.getNeptunePumpByAddress(address);
        if (typeof pumpCfg === 'undefined') {
            logger.debug(`NeptuneModbusStateMessage.process ignored unconfigured address ${address}`);
            return;
        }
        const pumpState = state.pumps.getItemById(pumpCfg.id, pumpCfg.isActive === true);

        if ((functionCode & 0x80) === 0x80) {
            const exceptionCode = msg.extractPayloadByte(0, 0);
            logger.warn(`Neptune Modbus exception response fn=0x${functionCode.toString(16)} code=${exceptionCode} (${this.decodeModbusException(exceptionCode)}) address=${address}`);
            pumpState.status = 16;
            state.emitEquipmentChanges();
            return;
        }

        switch (functionCode) {
            case 0x04: // Read input registers
                this.processReadInput(msg, address, pumpState);
                break;
            case 0x06: // Write single register
                this.processWriteSingle(msg, address, pumpState);
                break;
            case 0x10: // Write multiple registers
                logger.debug(`Neptune write-multiple response (Address: ${address})`);
                break;
            default:
                logger.debug(`NeptuneModbusStateMessage.process unhandled function 0x${functionCode.toString(16)} (Address: ${address})`);
                break;
        }
        state.emitEquipmentChanges();
    }
}
