/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com

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
import {Inbound} from "../Messages";
import {sys, Pump, PumpCircuit} from "../../../Equipment";
import {state, CircuitState} from "../../../State";
import {ControllerType} from "../../../Constants";
import { logger } from "../../../../logger/Logger";
export class PumpMessage {
    public static process(msg: Inbound): void {
        switch (sys.controllerType) {
            case ControllerType.IntelliCenter:
                PumpMessage.processIntelliCenterPump(msg);
                break;
            case ControllerType.SunTouch:
            case ControllerType.IntelliCom:
            case ControllerType.EasyTouch:
            case ControllerType.IntelliTouch:
                PumpMessage.processPumpConfig_IT(msg);
                break;
        }
    }
    public static processPumpConfig_IT(msg: Inbound) {
        // packet 24/27/152/155 - Pump Config: IntelliTouch
        const pumpId = msg.extractPayloadByte(0);
        let type = msg.extractPayloadByte(1);  // Avoid setting this then setting it back if we are mapping to a different value.
        let isActive = type !== 0 && pumpId <= sys.equipment.maxPumps;
        // RKS: 04-14-21 - Only create the pump if it is available.  If the pump was previously defined as another type
        // then it will be removed and recreated.
        let pump: Pump = sys.pumps.getItemById(pumpId, isActive);
        if(isActive) {
            // Remap the combination pump types.
            switch (type) {
                case 0:
                case 64:
                case 169:
                    break;
                case 255:
                case 128:
                case 134:
                    type = 128;
                    break;
                default:
                    type = 1;
                    break;
            }
            if (pump.type !== type) {
                sys.pumps.removeItemById(pumpId);
                pump = sys.pumps.getItemById(pumpId, isActive);
            }
            pump.address = pumpId + 95;
            pump.master = 0;
            switch (type) {
                case 0: // none
                    pump.type = 0;
                    pump.isActive = false;
                    break;
                case 64: // vsf
                    pump.type = type;
                    pump.isActive = true;
                    PumpMessage.processVSF_IT(msg);
                    break;
                case 255: // vs 3050 on old panels.
                case 128: // vs
                case 134: // vs Ultra Efficiency
                    pump.type = 128;
                    pump.isActive = true;
                    PumpMessage.processVS_IT(msg);
                    break;
                case 169: // vs+svrs
                    pump.type = 169;
                    pump.isActive = true;
                    PumpMessage.processVS_IT(msg);
                    break;
                default: // vf - type is the background circuit
                    pump.type = 1; // force to type 1?
                    pump.isActive = true;
                    PumpMessage.processVF_IT(msg);
                    break;
            }
            if (typeof pump.name === 'undefined') pump.name = sys.board.valueMaps.pumpTypes.get(pump.type).desc;
            const spump = state.pumps.getItemById(pump.id, true);
            spump.name = pump.name;
            spump.type = pump.type;
            spump.isActive = pump.isActive;
            spump.status = 0;
        }
        else {
            // RKS: Remove any pump that is not defined in the system.
            sys.pumps.removeItemById(pumpId);
            state.pumps.removeItemById(pumpId);
        }
        msg.isProcessed = true;
    }
    private static processIntelliCenterPump(msg: Inbound) {
        let pumpId: number;
        let pump: Pump;
        let msgId: number = msg.extractPayloadByte(1);
        // First process the pump types.  This will allow us to add or remove any installed pumps. All subsequent messages will not create pumps in the collection.
        if (msgId === 4) PumpMessage.processPumpType(msg);
        if (msgId <= 15) {
            let circuitId = 1;
            pumpId = msgId + 1;
            pump = sys.pumps.getItemById(pumpId);
            if (pump.type === 1) { // If this is a single speed pump it will have the body stored in the first circuit position.  All other pumps have no
                // reference to the body.
                pump.body = msg.extractPayloadByte(34);
                // Clear the circuits as there should be none.
                pump.circuits.clear();
            }
            else if (pump.type !== 0 && typeof pump.type !== 'undefined') {
                for (let i = 34; i < msg.payload.length && circuitId <= sys.board.valueMaps.pumpTypes.get(pump.type).maxCircuits; i++) {
                    let circuit = msg.extractPayloadByte(i);
                    if (circuit !== 255) pump.circuits.getItemById(circuitId++, true).circuit = circuit + 1;
                    else pump.circuits.removeItemById(circuitId++);
                }
            }
            // Speed/Flow
            if (pump.type > 2) {
                // Filter out the single speed and dual speed pumps.  We have no flow or speed for these.
                circuitId = 1;
                for (let i = 18; i < msg.payload.length && circuitId <= sys.board.valueMaps.pumpTypes.get(pump.type).maxCircuits;) {
                    let circuit: PumpCircuit = pump.circuits.getItemById(circuitId);
                    let rate = msg.extractPayloadInt(i);
                    // If the rate is < 450 then this must be a flow based value.
                    if (rate < 450) {
                        circuit.flow = rate;
                        circuit.units = 1;
                        circuit.speed = undefined;
                    } else {
                        circuit.speed = msg.extractPayloadInt(i);
                        circuit.units = 0;
                        circuit.flow = undefined;
                    }
                    i += 2;
                    circuitId++;
                }
            }
        }
        msg.isProcessed = true;
        switch (msgId) {
            case 0:
                msg.isProcessed = true;
                break;
            case 1:
                PumpMessage.processFlowStepSize(msg);
                break;
            case 2:
                PumpMessage.processMinFlow(msg);
                break;
            case 3:
                PumpMessage.processMaxFlow(msg);
                break;
            case 5:
                PumpMessage.processAddress(msg);
                break;
            case 6:
                PumpMessage.processPrimingTime(msg);
                break;
            case 7:
                PumpMessage.processSpeedStepSize(msg);
                break;
            case 8: // Unknown
            case 9:
            case 10:
            case 11:
            case 12:
            case 13:
            case 14:
            case 15:
                break;
            case 16:
                PumpMessage.processMinSpeed(msg);
                break;
            case 17:
                PumpMessage.processMaxSpeed(msg);
                break;
            case 18:
                PumpMessage.processPrimingSpeed(msg);
                break;
            case 19: // Pump names
            case 20:
            case 21:
            case 22:
            case 23:
            case 24:
            case 25:
            case 26:
                PumpMessage.processPumpNames(msg);
                break;
            default:
                logger.debug(`Unprocessed Config Message ${msg.toPacket()}`)
                break;

        }
    }
    private static processFlowStepSize(msg: Inbound) {
        let pumpId = 1;
        for (let i = 2; i < msg.payload.length && pumpId <= sys.equipment.maxPumps; i++) {
            sys.pumps.getItemById(pumpId++).flowStepSize = msg.extractPayloadByte(i);
        }
    }
    private static processMinFlow(msg: Inbound) {
        let pumpId = 1;
        for (let i = 2; i < msg.payload.length && pumpId <= sys.equipment.maxPumps; i++) {
            sys.pumps.getItemById(pumpId++).minFlow = msg.extractPayloadByte(i);
        }
    }
    private static processMaxFlow(msg: Inbound) {
        let pumpId = 1;
        for (let i = 2; i < msg.payload.length && pumpId <= sys.equipment.maxPumps; i++) {
            sys.pumps.getItemById(pumpId++).maxFlow = msg.extractPayloadByte(i);
        }
    }
    private static processPumpType(msg: Inbound) {
        let pumpId = 1;
        for (let i = 2; i < msg.payload.length && pumpId <= sys.equipment.maxPumps; i++) {
            let type = msg.extractPayloadByte(i);
            let pump: Pump = sys.pumps.getItemById(pumpId++, type !== 0);
            if (type === 0) {
                sys.pumps.removeItemById(pump.id); // Remove the pump if we don't need it.
                state.pumps.removeItemById(pump.id);
            }
            else {
                if (pump.type !== type) {
                    let ptype = sys.board.valueMaps.pumpTypes.transform(type);
                    if (ptype.name === 'ss') pump.circuits.clear();
                    pump.model = 0;
                }
                if (typeof pump.model === 'undefined') pump.model = 0;
                pump.type = type;
                pump.master = 0;
                let spump = state.pumps.getItemById(pump.id, true);
                spump.type = pump.type;
                spump.isActive = pump.isActive = true;
            }
        }
    }
    private static processAddress(msg: Inbound) {
        let pumpId = 1;
        for (let i = 2; i < msg.payload.length && pumpId <= sys.equipment.maxPumps; i++) {
            sys.pumps.getItemById(pumpId++).address = msg.extractPayloadByte(i);
        }
    }
    private static processPrimingTime(msg: Inbound) {
        let pumpId = 1;
        for (let i = 2; i < msg.payload.length && pumpId <= sys.equipment.maxPumps; i++) {
            sys.pumps.getItemById(pumpId++).primingTime = msg.extractPayloadByte(i);
        }
    }
    private static processSpeedStepSize(msg: Inbound) {
        let pumpId = 1;
        for (let i = 2; i < msg.payload.length && pumpId <= sys.equipment.maxPumps; i++) {
            sys.pumps.getItemById(pumpId++).speedStepSize = msg.extractPayloadByte(i) * 10;
        }
    }
    private static processMinSpeed(msg: Inbound) {
        let pumpId = 1;
        for (let i = 2; i < msg.payload.length && pumpId <= sys.equipment.maxPumps;) {
            sys.pumps.getItemById(pumpId++).minSpeed = msg.extractPayloadInt(i);
            i += 2;
        }
    }
    private static processMaxSpeed(msg: Inbound) {
        let pumpId = 1;
        for (let i = 2; i < msg.payload.length && pumpId <= sys.equipment.maxPumps;) {
            sys.pumps.getItemById(pumpId++).maxSpeed = msg.extractPayloadInt(i);
            i += 2;
        }
    }
    private static processPrimingSpeed(msg: Inbound) {
        let pumpId = 1;
        for (let i = 2; i < msg.payload.length && pumpId <= sys.equipment.maxPumps;) {
            sys.pumps.getItemById(pumpId++).primingSpeed = msg.extractPayloadInt(i);
            i += 2;
        }
    }
    private static processPumpNames(msg: Inbound) {
        let pumpId = (msg.extractPayloadByte(1) - 19) * 2 + 1;
        if (pumpId <= sys.equipment.maxPumps) {
            let pump = sys.pumps.getItemById(pumpId);
            pump.name = msg.extractPayloadString(2, 16);
            if (pump.isActive) state.pumps.getItemById(pumpId).name = pump.name;
            pumpId++;
        }
        if (pumpId <= sys.equipment.maxPumps) {
            let pump = sys.pumps.getItemById(pumpId);
            pump.name = msg.extractPayloadString(18, 16);
            if (pump.isActive) state.pumps.getItemById(pumpId).name = pump.name;
            pumpId++;
        }
    }
    private static processVS_IT(msg: Inbound) {
        // Sample Packet
        // [255, 0, 255], [165, 33, 15, 16, 27, 46], [1, 128, 1, 2, 0, 1, 6, 2, 12, 4, 9, 11, 7, 6, 7, 128, 8, 132, 3, 15, 5, 3, 234, 128, 46, 108, 58, 2, 232, 220, 232, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [8, 5]
        const pumpId = msg.extractPayloadByte(0);
        const pump = sys.pumps.getItemById(pumpId);
        // [1, 128, 0, 2, 0, 6, 5, 1, 5, 158, 9, 2, 10, 0, 3, 0, 3, 0, 3, 0, 3, 3, 120, 20, 146, 240, 232, 232, 232, 232, 232]
        // byte | val |
        // 0    | 1   | PumpId = 1
        // 1    | 128 | Pump Type = VS
        // 2    | 0   | Priming Time = 0
        // 3    | 2   | Unknown
        // 4    | 0   | Unknown
        // 5    | 6   | Circuit Speed #1 = Pool
        // 6    | 5   | Big endian for the speed (1400 rpm with byte(22))
        // 7    | 1   | Circuit Speed #2 = Spa
        // 8    | 5   | Big endian for the speed (1300 rpm with byte(23))
        // 9    | 158 | Circuit Speed #3 = Solar
        // 10   | 9   | Big endian for the speed (2450 rpm with byte(24))
        // 11   | 2   | Circuit Speed #4 = Air blower (Aux-2)
        // 12   | 10  | Big endian speed for the speed (2800 rpm with byte(25))
        // 13   | 0   | Circuit Speed #5 = No circuit
        // 14   | 3   | Big endian speed for the speed (1000 rpm with byte(26))
        // 15   | 0   | Circuit speed #6 = No circuit
        // 16   | 3   | Big endian speed for the speed (1000 rpm with byte(27))
        // 17   | 0   | Circuit speed #7 = No circuit
        // 18   | 3   | Big endian speed for the speed (1000 rpm with byte(28))
        // 19   | 0   | Circuit speed #8 = No circuit
        // 20   | 3   | Big endian speed for the speed (1000 rpm with byte(29))
        // 21   | 3   | Big eniand speed for the priming speed (1000 rpm with byte(30))
        // All 30 bytes on this message are accounted for except for byte 3 & 4.
        if (typeof pump.model === 'undefined') pump.model = 0;
        for (let circuitId = 1; circuitId <= sys.board.valueMaps.pumpTypes.get(pump.type).maxCircuits; circuitId++) {
            let _circuit = msg.extractPayloadByte(circuitId * 2 + 3); 
            if (_circuit !== 0) {
                let circuit = pump.circuits.getItemById(circuitId, true);
                circuit.circuit = _circuit;
                circuit.speed =
                    msg.extractPayloadByte(circuitId * 2 + 4) * 256 +
                    msg.extractPayloadByte(circuitId + 21);
                circuit.units = 0;
            }
            else {
                pump.circuits.removeItemById(circuitId);
            }
        }
        pump.primingSpeed = msg.extractPayloadByte(21) * 256 + msg.extractPayloadByte(30);
        pump.primingTime = msg.extractPayloadByte(2);
        pump.minSpeed = sys.board.valueMaps.pumpTypes.get(pump.type).minSpeed;
        pump.maxSpeed = sys.board.valueMaps.pumpTypes.get(pump.type).maxSpeed;
        pump.speedStepSize = sys.board.valueMaps.pumpTypes.get(pump.type).speedStepSize;
    }
    private static processVF_IT(msg: Inbound) {
        // Sample Packet
        // [255, 0, 255], [165, 33, 15, 16, 27, 46], [2, 6, 15, 2, 0, 1, 29, 11, 35, 0, 30, 0, 30, 0, 30, 0, 30, 0, 30, 0, 30, 30, 55, 5, 10, 60, 5, 1, 50, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [3, 41]
        const pumpId = msg.extractPayloadByte(0);
        const pump = sys.pumps.getItemById(pumpId);
        if (typeof pump.model === 'undefined') pump.model = 0;
        for (let circuitId = 1; circuitId <= sys.board.valueMaps.pumpTypes.get(pump.type).maxCircuits; circuitId++) {
            let _circuit = msg.extractPayloadByte(circuitId * 2 + 3);
            if (_circuit !== 0) {
                const circuit: PumpCircuit = pump.circuits.getItemById(circuitId, true);
                circuit.circuit = _circuit;
                circuit.flow = msg.extractPayloadByte(circuitId * 2 + 4);
                circuit.units = 1;
            }
            else {
                pump.circuits.removeItemById(_circuit);
            }
        }
        pump.backgroundCircuit = msg.extractPayloadByte(1);
        pump.filterSize = msg.extractPayloadByte(2) * 1000;
        pump.turnovers = msg.extractPayloadByte(3);
        pump.manualFilterGPM = msg.extractPayloadByte(21);
        pump.primingSpeed = msg.extractPayloadByte(22);
        pump.primingTime = (msg.extractPayloadByte(23) & 0xf);
        pump.minFlow = sys.board.valueMaps.pumpTypes.get(pump.type).minFlow;
        pump.maxFlow = sys.board.valueMaps.pumpTypes.get(pump.type).maxFlow;
        pump.flowStepSize = sys.board.valueMaps.pumpTypes.get(pump.type).flowStepSize;
        pump.maxSystemTime = msg.extractPayloadByte(23) >> 4;
        pump.maxPressureIncrease = msg.extractPayloadByte(24);
        pump.backwashFlow = msg.extractPayloadByte(25);
        pump.backwashTime = msg.extractPayloadByte(26);
        pump.rinseTime = msg.extractPayloadByte(27);
        pump.vacuumFlow = msg.extractPayloadByte(28);
        pump.vacuumTime = msg.extractPayloadByte(30);
    }
    private static processVSF_IT(msg: Inbound) {
        // Sample packet
        //[255, 0, 255][165, 33, 15, 16, 27, 46][2, 64, 0, 0, 2, 1, 33, 2, 4, 0, 30, 0, 30, 0, 30, 0, 30, 0, 30, 0, 30, 0, 0, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [2, 94]
        //[255, 0, 255][165,  1, 15, 16, 24, 31][1, 64, 0, 0, 0, 6, 5, 2, 8, 1, 11, 7, 13, 0, 0, 0, 0, 0, 0, 0, 0, 0, 220, 152, 184, 122, 0, 0, 0, 0, 0][4, 24]
        const pumpId = msg.extractPayloadByte(0);
        const pump = sys.pumps.getItemById(pumpId);
        if (typeof pump.model === 'undefined') pump.model = 0;
        for (let circuitId = 1; circuitId <= sys.board.valueMaps.pumpTypes.get(pump.type).maxCircuits; circuitId++) {
            let _circuit = msg.extractPayloadByte(circuitId * 2 + 3);
            if (_circuit !== 0){
                const circuit: PumpCircuit = pump.circuits.getItemById(circuitId, true);
                circuit.circuit = _circuit;
                circuit.units = (msg.extractPayloadByte(4) >> circuitId - 1 & 1) === 0 ? 1 : 0;
                if (circuit.units) circuit.flow = msg.extractPayloadByte(circuitId * 2 + 4);
                else circuit.speed = msg.extractPayloadByte(circuitId * 2 + 4) * 256 + msg.extractPayloadByte(circuitId + 21);
            }
            else {
                pump.circuits.removeItemById(_circuit);
            }
        }
        pump.speedStepSize = sys.board.valueMaps.pumpTypes.get(pump.type).speedStepSize;
        pump.flowStepSize = sys.board.valueMaps.pumpTypes.get(pump.type).flowStepSize;
        pump.minFlow = sys.board.valueMaps.pumpTypes.get(pump.type).minFlow;
        pump.maxFlow = sys.board.valueMaps.pumpTypes.get(pump.type).maxFlow;
        pump.minSpeed = sys.board.valueMaps.pumpTypes.get(pump.type).minSpeed;
        pump.maxSpeed = sys.board.valueMaps.pumpTypes.get(pump.type).maxSpeed;
    }
}
