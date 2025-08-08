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
import { Inbound, Outbound, Protocol } from "../Messages";
import { state } from "../../../State";
import { sys, ControllerType } from "../../../Equipment";
import { conn } from "../../Comms";
import { logger } from "../../../../logger/Logger";

// Create a fault object to hold the fault codes and descriptions
let faultCodes = {
    0x21: "Software overcurrent",
    0x22: "DC overvoltage",
    0x23: "DC undervoltage",
    0x26: "Hardware overcurrent",
    0x2A: "Startup failure",
    0x2D: "Processor - Fatal",
    0x2E: "IGBT over temperature",
    0x2F: "Loss of phase",
    0x30: "Low power",
    0x31: "Processor - Registers",
    0x32: "Processor - Program counter",
    0x33: "Processor - Interrupt/Execution",
    0x34: "Processor - Clock",
    0x35: "Processor - Flash Memory",
    0x36: "Ras fault",
    0x37: "Processor - ADC",
    0x3C: "Keypad fault",
    0x3D: "LVB data flash fault",
    0x3E: "Comm loss fault - LVB & Drive",
    0x3F: "Generic fault",
    0x40: "Coherence fault",
    0x41: "UL fault",
    0x42: "SVRS fault type 1",
    0x43: "SVRS fault type 2",
    0x44: "SVRS fault type 13",
}

let nackErrors = {
    0x01: "Command not recognized / illegal",
    0x02: "Operand out of allowed range",
    0x03: "Data out of range",
    0x04: "General failure: fault mode",
    0x05: "Incorrect command length",
    0x06: "Command cannot be executed now",
    0x09: "Buffer error (not used)",
    0x0A: "Running parameters incomplete (not used)",
}

export class RegalModbusStateMessage {
    public static process(msg: Inbound) {

        // debug log the message object
        logger.debug(`RegalModbusStateMessage.process ${JSON.stringify(msg)}`);

        let addr = msg.header[0];
        let functionCode = msg.header[1];
        let ack = msg.header[2];

        if (ack == 0x20) return;
        if (ack in nackErrors) {
            logger.debug(`RegalModbusStateMessage.process NACK: ${nackErrors[ack]} (Address: ${addr})`);
            return;
        }
        if (ack != 0x10) {
            logger.debug(`RegalModbusStateMessage.process Unknown ACK: ${ack} (Address: ${addr})`);
            return;
        }

        // If we're here, we have an ack=0x10 message

        let pumpCfg = sys.pumps.getPumpByAddress(addr, false, { isActive: false });
        let pumpId = pumpCfg.id;
        let pumpType = sys.board.valueMaps.pumpTypes.transform(pumpCfg.type);
        let pumpState = state.pumps.getItemById(pumpId, pumpCfg.isActive === true);

        logger.debug(`RegalModbusStateMessage.process.pstate ${JSON.stringify(pumpState)}`);


        switch (functionCode) {
            case 0x41: {  // Go
                logger.debug(`RegalModbusStateMessage.process Go (Address: ${addr})`);
                break;
            }
            case 0x42: { // Stop
                logger.debug(`RegalModbusStateMessage.process Stop (Address: ${addr})`);
                break;
            }
            case 0x43: { // Status
                let status = msg.extractPayloadByte(0);
                switch (status) {
                    case 0x00: { // stop mode - motor stopped
                        logger.debug(`RegalModbusStateMessage.process Status: Stop (Address: ${addr})`);
                        pumpState.driveState = 0;
                        pumpState.command = 4;  // dashPanel assumes command = 10 in running state
                        break;
                    }
                    case 0x09: { // run mode - boot (motor is getting ready to spin)
                        logger.debug(`RegalModbusStateMessage.process Status: Boot (Address: ${addr})`);
                        pumpState.driveState = 1;
                        pumpState.command = 10;  // dashPanel assumes command = 10 in running state
                        break;
                    }
                    case 0x0B: { // run mode - vector
                        logger.debug(`RegalModbusStateMessage.process Status: Vector (Address: ${addr})`);
                        pumpState.driveState = 2;
                        pumpState.command = 10;  // dashPanel assumes command = 10 in running state
                        break;
                    }
                    case 0x20: { // fault mode - motor stopped
                        logger.debug(`RegalModbusStateMessage.process Status: Fault (Address: ${addr})`);
                        pumpState.driveState = 4;
                        pumpState.command = 4;  // dashPanel assumes command = 10 in running state
                        break;
                    }
                }
                break;
            }
            case 0x44: { // Set demand
                let mode = msg.extractPayloadByte(0);
                let demandLo = msg.extractPayloadByte(1);
                let demandHi = msg.extractPayloadByte(2);

                switch (mode) {
                    case 0: {  // Speed control, demand = RPM * 4
                        let rpm = RegalModbusStateMessage.demandToRPM(demandLo, demandHi);
                        logger.debug(`RegalModbusStateMessage.process Speed: ${rpm} (Address: ${addr})`);
                        pumpState.rpm = rpm;
                        break;
                    }
                    case 1: {  // Torque control, demand = lbf-ft * 1200
                        logger.debug(`RegalModbusStateMessage.process Ignoring torque: ${demandLo}, ${demandHi} (Address: ${addr})`);
                        break;
                    }
                    case 2: {  // Reserved (used to be flow)
                        logger.debug(`RegalModbusStateMessage.process Ignoring reserved demand mode ${mode}: ${demandLo}, ${demandHi} (Address: ${addr})`);
                        break;
                    }
                    case 3: {  // Reserved
                        logger.debug(`RegalModbusStateMessage.process Ignoring reserved demand mode ${mode}: ${demandLo}, ${demandHi} (Address: ${addr})`);
                        break;
                    }
                }
                break;
            }
            case 0x45: {  // Read sensor
                let page = msg.extractPayloadByte(0);
                let sensorAddr = msg.extractPayloadByte(1);
                let valueLo = msg.extractPayloadByte(2);
                let valueHi = msg.extractPayloadByte(3);
                let raw_value = (valueHi << 8) + valueLo;

                let scaleValue = (value: number, scale: number) => {
                    return value / scale;
                };
                let scaled_value;

                switch (page) {
                    case 0: {
                        switch (sensorAddr) {
                            case 0x00: { // Motor speed
                                scaled_value = scaleValue(raw_value, 4);
                                logger.debug(`RegalModbusStateMessage.process Motor speed: ${scaled_value} (Address: ${addr})`);
                                pumpState.rpm = scaled_value;
                                break;
                            }
                            case 0x01: { // Motor current
                                scaled_value = scaleValue(raw_value, 1000);
                                logger.debug(`RegalModbusStateMessage.process Motor current: ${scaled_value} (Address: ${addr})`);
                                break;
                            }
                            case 0x02: { // Operating mode
                                switch (raw_value) {
                                    case 0: {  // Speed control
                                        logger.debug(`RegalModbusStateMessage.process Operating mode: Speed control (Address: ${addr})`);
                                        break;
                                    }
                                    case 1: {  // Torque control
                                        logger.debug(`RegalModbusStateMessage.process Operating mode: Torque control (Address: ${addr})`);
                                        break;
                                    }
                                }
                                break;
                            }
                            case 0x03: { // Demand sent to motor
                                logger.debug(`RegalModbusStateMessage.process Raw (unscaled) demand sent to motor: ${raw_value} (Address: ${addr})`);
                                break;
                            }
                            case 0x04: { // Torque
                                scaled_value = scaleValue(raw_value, 1200);
                                logger.debug(`RegalModbusStateMessage.process Torque: ${scaled_value} (Address: ${addr})`);
                                break;
                            }
                            case 0x05: { // Inverter input power
                                logger.debug(`RegalModbusStateMessage.process Raw (unscaled) inverter input power: ${raw_value} (Address: ${addr})`);
                                break;
                            }
                            case 0x06: { // DC bus voltage
                                scaled_value = scaleValue(raw_value, 64);
                                logger.debug(`RegalModbusStateMessage.process DC bus voltage: ${scaled_value} (Address: ${addr})`);
                                break;
                            }
                            case 0x07: { // Ambient temperature
                                scaled_value = scaleValue(raw_value, 128);
                                logger.debug(`RegalModbusStateMessage.process Ambient temperature: ${scaled_value} (Address: ${addr})`);
                                break;
                            }
                            case 0x08: {  // Status
                                switch (raw_value) {
                                    case 0x00: { // stop mode - motor stopped
                                        logger.debug(`RegalModbusStateMessage.process Status: Stop (Address: ${addr})`);
                                        pumpState.driveState = 0;
                                        break;
                                    }
                                    case 0x09: { // run mode - boot (motor is getting ready to spin)
                                        logger.debug(`RegalModbusStateMessage.process Status: Boot (Address: ${addr})`);
                                        pumpState.driveState = 1;
                                        break;
                                    }
                                    case 0x0B: { // run mode - vector
                                        logger.debug(`RegalModbusStateMessage.process Status: Vector (Address: ${addr})`);
                                        pumpState.driveState = 2;
                                        break;
                                    }
                                    case 0x20: { // fault mode - motor stopped
                                        logger.debug(`RegalModbusStateMessage.process Status: Fault (Address: ${addr})`);
                                        pumpState.driveState = 4;
                                        break;
                                    }
                                }
                                break;
                            }
                            case 0x09: { // Previous fault
                                if (raw_value in faultCodes) {
                                    logger.debug(`RegalModbusStateMessage.process Previous fault: ${faultCodes[raw_value]} (Address: ${addr})`);
                                } else {
                                    logger.debug(`RegalModbusStateMessage.process Previous fault: Unknown fault code ${raw_value} (Address: ${addr})`);
                                }
                                break;
                            }
                            case 0X0A: { // Output power
                                scaled_value = scaleValue(raw_value, 1);
                                logger.debug(`RegalModbusStateMessage.process Shaft power (W): ${scaled_value} (Address: ${addr})`);
                                pumpState.watts = scaled_value;
                                break;
                            }
                            case 0x0B: {  // SVRS Bypass Status
                                break;
                            }
                            case 0x0C: { // Number of current faults
                                logger.debug(`RegalModbusStateMessage.process Number of current faults: ${raw_value} (Address: ${addr})`);
                                break;
                            }
                            case 0x0D: { // Motor line voltage
                                logger.debug(`RegalModbusStateMessage.process Raw (unscaled) motor line voltage: ${raw_value} (Address: ${addr})`);
                                break;
                            }
                            case 0x0E: { // Ramp status
                                logger.debug(`RegalModbusStateMessage.process Ramp status: ${raw_value} (Address: ${addr})`);
                                break;
                            }
                            case 0x0F: { // Number of total fault
                                logger.debug(`RegalModbusStateMessage.process Number of total faults: ${raw_value} (Address: ${addr})`);
                                break;
                            }
                            case 0x10: { // Prime status
                                switch (raw_value) {
                                    case 0: { // Not priming
                                        logger.debug(`RegalModbusStateMessage.process Prime status: Not priming (Address: ${addr})`);
                                        break;
                                    }
                                    case 1: { // Priming running
                                        logger.debug(`RegalModbusStateMessage.process Prime status: Priming running (Address: ${addr})`);
                                        break;
                                    }
                                    case 2: { // Priming completed
                                        logger.debug(`RegalModbusStateMessage.process Prime status: Priming completed (Address: ${addr})`);
                                        break;
                                    }
                                }
                                break;
                            }
                            case 0x11: { // Motor input power
                                logger.debug(`RegalModbusStateMessage.process Raw (unscaled) motor input power: ${raw_value} (Address: ${addr})`);
                                break;
                            }
                            case 0x12: { // IGBT temperature
                                scaled_value = scaleValue(raw_value, 128);
                                logger.debug(`RegalModbusStateMessage.process IGBT temperature: ${scaled_value} (Address: ${addr})`);
                                break;
                            }
                            case 0x13: { // PCB temperature
                                logger.debug(`RegalModbusStateMessage.process Raw (unscaled) PCB temperature: ${raw_value} (Address: ${addr})`);
                                break;
                            }
                            case 0x14: { // Status of external input
                                switch (raw_value) {
                                    case 0: { // No external input
                                        logger.debug(`RegalModbusStateMessage.process External input: No external input (Address: ${addr})`);
                                        break;
                                    }
                                    case 3: { // PWM
                                        logger.debug(`RegalModbusStateMessage.process External input: PWM (Address: ${addr})`);
                                        break;
                                    }
                                    case 4: { // DI_1 present
                                        logger.debug(`RegalModbusStateMessage.process External input: DI_1 present (Address: ${addr})`);
                                        break;
                                    }
                                    case 5: { // DI_2 present
                                        logger.debug(`RegalModbusStateMessage.process External input: DI_2 present (Address: ${addr})`);
                                        break;
                                    }
                                    case 6: { // DI_3 present
                                        logger.debug(`RegalModbusStateMessage.process External input: DI_3 present (Address: ${addr})`);
                                        break;
                                    }
                                    case 7: { // DI_4 present
                                        logger.debug(`RegalModbusStateMessage.process External input: DI_4 present (Address: ${addr})`);
                                        break;
                                    }
                                    case 8: { // Serial input
                                        logger.debug(`RegalModbusStateMessage.process External input: Serial input (Address: ${addr})`);
                                        break;
                                    }
                                }
                                break;
                            }
                            case 0x15: { // Reference speed
                                scaled_value = scaleValue(raw_value, 4);
                                logger.debug(`RegalModbusStateMessage.process Reference speed: ${scaled_value} (Address: ${addr})`);
                                break;
                            }
                        }
                        break;
                    }
                    default: {
                        logger.debug(`RegalModbusStateMessage.process Page 1: ${page} (Address: ${addr}) - Not yet implemented`);
                        break;
                    }
                }
                break;
            }
            case 0x46: { // Read identification
                logger.debug(`RegalModbusStateMessage.process Read identification (Address: ${addr}) - Not yet implemented`);
                break;
            }
            case 0x64: { // Read/write configuration
                logger.debug(`RegalModbusStateMessage.process Read/write configuration (Address: ${addr}) - Not yet implemented`);
                break;
            }
            default: {
                logger.debug(`RegalModbusStateMessage.process Unknown function code: ${functionCode} (Address: ${addr})`);
                break;
            }
        }
        state.emitEquipmentChanges();
    }

    public static rpmToDemand(rpm: number): [number, number] {
        /**
         * Converts an RPM value to a RegalModbus demand payload in speed control mode.
         *
         * @param {number} rpm - Desired motor speed in RPM.
         * @returns {[number, number]} - [demand_lo, demand_hi]
         *   - demand_lo: lower byte of demand
         *   - demand_hi: upper byte of demand
         * @throws {Error} - If RPM is out of valid range for RegalModbus demand (0–16383).
         */
        if (rpm < 0 || rpm * 4 > 0xFFFF) {
            throw new Error("RPM is out of valid range for RegalModbus demand (0–16383)");
        }

        const rawDemand = Math.round(rpm * 4); // Scale RPM by 4
        const demandLo = rawDemand & 0xFF;
        const demandHi = (rawDemand >> 8) & 0xFF;

        return [demandLo, demandHi];
    }

    public static demandToRPM(demandLo: number, demandHi: number): number {
        /**
         * Converts a RegalModbus demand payload to an RPM value.
         *  
         * @param {number} demandLo - Lower byte of demand.
         * @param {number} demandHi - Upper byte of demand.
         * @returns {number} - Motor speed in RPM.
         * @throws {Error} - If demand is out of valid range for RPM (0–16383).
         **/
        const rawDemand = (demandHi << 8) | demandLo; // Combine high and low bytes
        if (rawDemand < 0 || rawDemand > 0xFFFF) {
            throw new Error("Demand is out of valid range for RPM (0–16383)");
        }
        const rpm = Math.round(rawDemand / 4); // Scale back to RPM
        return rpm;
    }
}