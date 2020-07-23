/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com

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
        let pump: Pump = sys.pumps.getItemById(pumpId, pumpId <= sys.equipment.maxPumps);
        if (pump.type !== msg.extractPayloadByte(1)) {
            sys.pumps.removeItemById(pumpId);
            pump = sys.pumps.getItemById(pumpId, true);
        }
        pump.type = msg.extractPayloadByte(1);
        pump.address = pumpId + 95;
        pump.isActive = pump.type !== 0;
        switch (pump.type) {
            case 0: // none
                pump.isActive = false;
                break;
            case 64: // vsf
                PumpMessage.processVSF_IT(msg);
                break;
            case 128: // vs
            case 169: // vs+svrs
                PumpMessage.processVS_IT(msg);
                break;
            default: // vf - pumpId is background circuit
                pump.type = 1; // force to type 1?
                PumpMessage.processVF_IT(msg);
                break;
        }
        if (typeof pump.name === 'undefined') pump.name = sys.board.valueMaps.pumpTypes.get(pump.type).desc;
        const spump = state.pumps.getItemById(pump.id, pumpId <= sys.equipment.maxPumps);
        spump.type = pump.type;
        spump.status = 0;
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
        switch (msgId) {
            case 0:
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
                state.pumps.getItemById(pump.id, true).type = pump.type;
                pump.isActive = true;
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
                switch (circuit.circuit) {
                    case 1:
                        {
                            let body = sys.bodies.getItemById(2, sys.equipment.maxBodies >= 2);
                            body.type = 1; // spa
                            body.isActive = true;
                            break;
                        }
                    case 6:
                        {
                            let body = sys.bodies.getItemById(1, sys.equipment.maxBodies >= 1);
                            body.type = 0; // pool
                            body.isActive = true;
                            body.capacity = msg.extractPayloadByte(6) * 1000;
                            break;
                        }
                }
            }
            else {
                pump.circuits.removeItemById(_circuit);
            }
        }
        pump.backgroundCircuit = msg.extractPayloadByte(1);
        pump.turnovers = msg.extractPayloadByte(3);
        pump.primingSpeed = msg.extractPayloadByte(22);
        pump.primingTime = (msg.extractPayloadByte(23) & 0xf);
        pump.minFlow = sys.board.valueMaps.pumpTypes.get(pump.type).minFlow;
        pump.maxFlow = sys.board.valueMaps.pumpTypes.get(pump.type).maxFlow;
        pump.flowStepSize = sys.board.valueMaps.pumpTypes.get(pump.type).flowStepSize;
        pump.manualFilterGPM = msg.extractPayloadByte(21);
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
        // [255, 0, 255], [165, 33, 15, 16, 27, 46], [2, 64, 0, 0, 2, 1, 33, 2, 4, 0, 30, 0, 30, 0, 30, 0, 30, 0, 30, 0, 30, 0, 0, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [2, 94]
        const pumpId = msg.extractPayloadByte(0);
        const pump = sys.pumps.getItemById(pumpId);
        if (typeof pump.model === 'undefined') pump.model = 0;
        for (let circuitId = 1; circuitId <= sys.board.valueMaps.pumpTypes.get(pump.type).maxCircuits; circuitId++) {
            let _circuit = msg.extractPayloadByte(circuitId * 2 + 3);
            if (_circuit !== 0){
                const circuit: PumpCircuit = pump.circuits.getItemById(circuitId, true);
                circuit.circuit = _circuit;
                circuit.units =
                (msg.extractPayloadByte(4) >> circuitId - 1 & 1) === 0 ? 1 : 0;
                if (circuit.units)
                circuit.flow = msg.extractPayloadByte(circuitId * 2 + 4);
                else
                circuit.speed =
                msg.extractPayloadByte(circuitId * 2 + 4) * 256 +
                msg.extractPayloadByte(circuitId + 21);
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
