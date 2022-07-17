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
import { sys, Valve } from "../../../Equipment";
import { state, ValveState } from "../../../State";
import { ControllerType } from "../../../Constants";
import { logger } from "../../../../logger/Logger";
export class ValveMessage {
    public static process(msg: Inbound): void {
        switch (sys.controllerType) {
            case ControllerType.IntelliCenter:
                switch (msg.extractPayloadByte(1)) {
                    case 0: // Circuit Data
                        ValveMessage.processCircuit(msg);
                        break;
                    case 1:
                    case 2:
                        ValveMessage.processValveNames(msg);
                        break;
                    case 3: // Skip the secondary intake/return
                        msg.isProcessed = true;
                        break;
                    case 4:
                    case 5:
                    case 6:
                    case 7:
                    case 8:
                    case 9:
                    case 10:
                    case 11:
                    case 12:
                    case 13:
                    case 14:
                        ValveMessage.processValveNames(msg);
                        break;
                    default:
                        logger.debug(`Unprocessed Config Message ${msg.toPacket()}`)
                        break;

                }
                break;
            case ControllerType.IntelliCom:
            case ControllerType.EasyTouch:
            case ControllerType.IntelliTouch:
            case ControllerType.SunTouch:
                switch (msg.action) {
                    case 29:
                        sys.controllerType === ControllerType.SunTouch ? ValveMessage.process_ValveAssignment_ST(msg) : ValveMessage.process_ValveAssignment_IT(msg);
                        break;
                    case 35:
                        ValveMessage.process_ValveOptions_IT(msg);
                        break;
                }
        }
    }
    private static process_ValveOptions_IT(msg: Inbound) {
        // sample packet
        // [165,33,15,16,35,2],[132,0],[1,142]
        //                      ^^^ 128 = Pump off during valve operation
        sys.general.options.pumpDelay = msg.extractPayloadByte(0) >> 7 === 1;
        msg.isProcessed = true;
    }
    private static process_ValveAssignment_ST(msg: Inbound) {
        // SunTouch example
        //[165,1,15,16,29,24][2,0,0,0,20,255,255,1,2,3,4,1,72,0,0,0,3,0,0,63,4,0,0,0][3,167]
        let vA = sys.valves.getItemById(1, true);
        let vB = sys.valves.getItemById(2, true);
        let vC = sys.valves.getItemById(3, true);
        if (sys.equipment.shared) {
            vA.name = 'Intake';
            vB.circuit = vA.circuit = sys.board.valueMaps.virtualCircuits.encode('poolspa');
            vB.name = 'Return';
        }
        else {
            vA.name = 'Valve A';
            vB.name = 'Valve B';
            vA.circuit = msg.extractPayloadByte(1);
            vB.circuit = msg.extractPayloadByte(2);
        }
        vC.circuit = msg.extractPayloadByte(4);
        vC.name = 'Valve C'
    }
    private static process_ValveAssignment_IT(msg: Inbound) {
        // sample packet
        // 165,33,16,34,157,6,0,0,1,255,255,255,4,153  [set]
        // [165,33,15,16,29,24],[2,0,0,0,128,1,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[4,154] [get]
        // [[][255,0,255][165,33,16,34,157,6][0,0,7,255,255,255][4,159]] [set]
        // what is payload[0]?
        for (let ndx = 4, id = 1; id <= sys.equipment.maxValves; ndx++) {
            let valve: Valve = sys.valves.getItemById(id);
            if (id === 3) {
                if (sys.equipment.shared && !sys.equipment.single) {
                    valve = sys.valves.getItemById(id, true);
                    valve.circuit = 6; // pool/spa -- fix
                    valve.name = 'Intake';
                    valve.isIntake = true;
                    valve.isReturn = false;
                    valve.isActive = true;
                    valve.type = 0;
                    let svalve = state.valves.getItemById(id, true);
                    svalve.name = valve.name;
                    svalve.type = valve.type;
                    valve.master = 0;
                }
                else {
                    sys.valves.removeItemById(id);
                    state.valves.removeItemById(id);
                }
            }
            else if (id === 4) {
                if (sys.equipment.shared && !sys.equipment.single) {
                    valve = sys.valves.getItemById(id, true);
                    valve.circuit = 6; // pool/spa -- fix
                    valve.name = 'Return';
                    valve.isIntake = false;
                    valve.isReturn = true;
                    valve.isActive = true;
                    valve.type = 0;
                    let svalve = state.valves.getItemById(id, true);
                    svalve.name = valve.name;
                    svalve.type = valve.type;
                    valve.master = 0;
                }
                else {
                    sys.valves.removeItemById(id);
                    state.valves.removeItemById(id);
                }
            }
            else {
                valve = sys.valves.getItemById(id, true);
                let circ = msg.extractPayloadByte(ndx);
                valve.circuit = circ > 0 && circ < 255 ? circ : 0;
                //valve.circuit = msg.extractPayloadByte(ndx);
                //valve.isActive = valve.circuit > 0 && valve.circuit < 255;
                // RKS: 04-14-21 -- Valves should always be active but shown with no assignment when
                // there is no circuit.  The circuitry for the valve always exists although I am not sure
                // how the valve expansion is represented.
                valve.isActive = true;
                valve.isReturn = false;
                valve.isIntake = false;
                valve.type = 0;
                // Allow users to name the valve whatever they want.  *Touch apparently only allows the valve to be named the same
                // as the circuit but this should be fine if we allow the user to edit it.
                valve.name = (typeof valve.name === 'undefined') ? ValveMessage.getName(id, valve.circuit) : valve.name;
                let svalve = state.valves.getItemById(id, true);
                svalve.name = valve.name;
                svalve.type = valve.type;
                valve.master = 0;
            }
            if (!valve.isActive) {
                sys.valves.removeItemById(id);
                state.valves.removeItemById(id);
            }
            else {
                valve.master = 0;
                valve.type = 0;
            }
            id++;
        }
        // Clean up any valves that are leftovers from previous configs.
        for (let i = sys.valves.length - 1; i >= 0; i--) {
            let v = sys.valves.getItemByIndex(i);
            if (v.master === 0 && v.id > sys.equipment.maxValves) {
                sys.valves.removeItemByIndex(i);
                state.valves.removeItemById(v.id);
            }
        }
        msg.isProcessed = true;
    }
    private static getName(id: number, cir: number) {
        if (cir <= 0 || cir >= 255 || cir === 6) {
            if (id === 3) return 'Intake';
            else if (id === 4) return 'Return';
            // If the id is on the expansion then the intake and return values are removed. So Valve C = 5.
            else return `Valve ${id > 4 ? String.fromCharCode(62 + id) : String.fromCharCode(64 + id)}`;
        }
        else if (cir <= 50)
            return sys.circuits.getInterfaceById(cir).name;
        else
            return sys.board.valueMaps.virtualCircuits.transform(cir).desc;
    }
    private static processCircuit(msg: Inbound) {
        // When it comes to valves there are some interesting numberings
        // going on.  This is due to the fact that the i10d has two sets of intake/returns.
        // NOTE: The previous statement is untrue.  Apparently the intake/returns are completely omitted
        // for i10d.
        let ndx: number = 2;
        let id = 1;
        for (let i = 0; i < sys.equipment.maxValves; i++) {
            if (id === 3 && !sys.equipment.shared) {
                // The intake/return valves are skipped for non-shared systems.
                sys.valves.removeItemById(3);
                sys.valves.removeItemById(4);
                state.valves.removeItemById(3);
                state.valves.removeItemById(4);
                id += 2;
                ndx += 2;
            }
            if (id === 5) {
                // Originally we thought this secondary intake/return was for i10d but as it turns out it doesn't use it either.
                sys.valves.removeItemById(5);
                sys.valves.removeItemById(6);
                state.valves.removeItemById(5);
                state.valves.removeItemById(6);
                id += 2;
                ndx += 2;
            }
            let valve: Valve = sys.valves.getItemById(id, true);
            valve.master = 0;
            // valve.isVirtual = false;
            if (id === 3 || id === 5) {
                valve.circuit = 247; // Hardcode the intake/return to pool/spa;
                valve.isIntake = true;
                valve.isReturn = false;
            }
            else if (id === 4 || id === 6) {
                valve.circuit = 247; // Hardcode the intake/return to pool/spa;
                valve.isIntake = false;
                valve.isReturn = true;
            }
            else {
                valve.circuit = msg.extractPayloadByte(ndx) + 1; // Even the circuit ids are 0 based on the valve messages.
                valve.isIntake = false;
                valve.isReturn = false;
            }
            valve.isActive = i < sys.equipment.maxValves;
            if (valve.isActive) {
                let svalve = state.valves.getItemById(valve.id, true);
                svalve.type = valve.type = 0;
                valve.master = 0;
            }
            ndx++;
            id++;
        }
        // Sort them so they are in valve id order.  This will ensure any OCP valves come first in the list.  Valves ids > 50 are virtual valves.
        sys.valves.sortById();
        msg.isProcessed = true;
    }
    private static processValveNames(msg: Inbound) {
        let byte = msg.extractPayloadByte(1);
        // byte = 4 == 7
        // 2 + 5
        // byte = 3 == 5
        // 0 + 5
        let valveId = byte <= 2 ? ((byte - 1) * 2) + 1 : (byte - 3) * 2 + 5;
        if (typeof sys.valves.find(elem => elem.id === valveId) !== 'undefined') {
            state.valves.getItemById(valveId).name = sys.valves.getItemById(valveId++).name = msg.extractPayloadString(2, 16);
        }
        if (typeof sys.valves.find(elem => elem.id === valveId) !== 'undefined') {
            state.valves.getItemById(valveId).name = sys.valves.getItemById(valveId++).name = msg.extractPayloadString(18, 16);
        }
        msg.isProcessed = true;
    }
}
