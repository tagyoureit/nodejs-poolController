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
import { Inbound } from "../Messages";
import { sys, CircuitGroup, LightGroup, CircuitGroupCircuit, LightGroupCircuit, ICircuitGroup, CircuitGroupCircuitCollection, ControllerType } from "../../../Equipment";
import { state, CircuitGroupState, LightGroupState, ICircuitGroupState } from '../../../State';
import { logger } from "../../../../logger/Logger";
export class CircuitGroupMessage {
    private static maxCircuits: number = 16;
    public static process(msg: Inbound): void {
        if (sys.controllerType === ControllerType.IntelliTouch) {
            CircuitGroupMessage.processITCircuitGroups(msg);
            return;
        }
        let groupId;
        let group: ICircuitGroup;
        let sgroup: ICircuitGroupState;
        let msgId = msg.extractPayloadByte(1);
        switch (msgId) {
            case 32: // Group type for the first 16.
                CircuitGroupMessage.processGroupType(msg);
                break;
            case 33: // Group type for second 16.
                CircuitGroupMessage.processGroupType(msg);
                break;
            case 34:
                CircuitGroupMessage.processEggTimer(msg);
                break;
            case 35:
                CircuitGroupMessage.processEggTimer(msg);
                CircuitGroupMessage.processColor(msg);
                break;
            case 36:
            case 37:
            case 38:
            case 39:
            case 40:
            case 41:
            case 42:
            case 43:
            case 44:
            case 45:
            case 46:
            case 47:
            case 48:
            case 49:
            case 50:
                CircuitGroupMessage.processColor(msg);
                break;
            default:
                if(msgId <= 31) logger.debug(`Unprocessed Config Message ${msg.toPacket()}`)
                break;
                
        }
        if (msgId <= 15) {
            var circuitId = 1;
            groupId = msg.extractPayloadByte(1) + sys.board.equipmentIds.circuitGroups.start;
            group = sys.circuitGroups.getInterfaceById(groupId);
            if (group.isActive) {
                group.circuits.clear();
                // Circuit #
                for (let i = 2; i < msg.payload.length && circuitId <= this.maxCircuits; i++) {
                    if (msg.extractPayloadByte(i) !== 255) {
                        if (group.type === 1 && msg.extractPayloadByte(i + 1) !== 0)
                            group.circuits.add({ id: circuitId, circuit: msg.extractPayloadByte(i) + 1, swimDelay: msg.extractPayloadByte(i + 16) });
                        else
                            group.circuits.add({ id: circuitId, circuit: msg.extractPayloadByte(i) + 1 });

                    }
                    circuitId++;
                }
            }
        }
        else if (msgId >= 16 && msgId <= 31) {
            groupId = msgId - 16 + sys.board.equipmentIds.circuitGroups.start;
            if (sys.board.equipmentIds.circuitGroups.isInRange) {
                group = sys.circuitGroups.getInterfaceById(groupId);
                if (group.isActive) {
                    sgroup = group.type === 1 ? state.lightGroups.getItemById(groupId) : state.circuitGroups.getItemById(groupId);
                    group.name = msg.extractPayloadString(2, 16);
                    sgroup.name = group.name;
                }
            }
        }
    }
    private static processITCircuitGroups (msg: Inbound){
        // [41,15],[4,0,0,0,0,0,0,0,0,192,15,0,0,0,0],[1,208]
        // bytes 1-7 = off circuits
        // bytes 8-14 = on circuits
        
        // start circuitGroup range at 192; same as IntelliCenter
        let groupId = msg.extractPayloadByte(0) + sys.board.equipmentIds.circuitGroups.start + 1;
        let _isActive = msg.payload.slice(1).reduce((accumulator, currentValue) => accumulator + currentValue) > 0;
        if (_isActive){
            let group = sys.circuitGroups.getItemById(groupId, _isActive);
            let sgroup: CircuitGroupState = state.circuitGroups.getItemById(group.id, true);
            let feature = sys.circuits.getInterfaceById(msg.extractPayloadByte(0) + sys.board.equipmentIds.features.start, true);
            feature.isActive = true;
            feature.macro = true;
            group.name = sgroup.name = feature.name;
            group.nameId = sgroup.nameId = feature.nameId;
            group.type = sgroup.type = sys.board.valueMaps.circuitGroupTypes.getValue('circuit'); 
            group.isActive = _isActive;
            let circuits: CircuitGroupCircuitCollection = group.circuits;
            for (let byte = 1; byte <= 7; byte++){
                let offByte = msg.extractPayloadByte(byte);
                let onByte = msg.extractPayloadByte(byte + 7);
                for (let bit = 1; bit < 8; bit++) {
                    let ndx = (byte - 1) * 8 + bit;
                    if (offByte & 1) {
                        let circuit = circuits.getItemById(ndx, true);
                        circuit.circuit = ndx;
                        circuit.desiredStateOn = false;
                    }
                    else if (onByte & 1) {
                        let circuit = circuits.getItemById(ndx, true);
                        circuit.circuit = ndx;
                        circuit.desiredStateOn = true;
                    }
                    else circuits.removeItemById(ndx); 
                    offByte = offByte >> 1;
                    onByte = onByte >> 1;
                }
            }
        }
        else {
            let feature = sys.circuits.getInterfaceById(msg.extractPayloadByte(0) + sys.board.equipmentIds.features.start);
            feature.macro = true;
            sys.circuitGroups.removeItemById(groupId);
            state.circuitGroups.removeItemById(groupId);
        }
        state.emitEquipmentChanges();
    }
    private static processGroupType(msg: Inbound) {
        var groupId = ((msg.extractPayloadByte(1) - 32) * 16) + sys.board.equipmentIds.circuitGroups.start;
        let arrlightGrps = [];
        let arrCircuitGrps = [];
        for (let i = 2; i < msg.payload.length && sys.board.equipmentIds.circuitGroups.isInRange(groupId) && i <= 18; i++) {
            let type = msg.extractPayloadByte(i);
            let group: ICircuitGroup = type === 1 ? sys.lightGroups.getItemById(groupId++, true) : sys.circuitGroups.getItemById(groupId++, type !== 0);
            group.type = type;
            group.isActive = type !== 0;
            if (group.isActive) {
                if (group.type === 1) {
                    arrlightGrps.push(group);
                    sys.circuitGroups.removeItemById(group.id);
                    state.circuitGroups.removeItemById(group.id);
                    group.lightingTheme = msg.extractPayloadByte(16 + i) >> 2;
                }
                else if (group.type === 2) {
                    arrCircuitGrps.push(group);
                    sys.lightGroups.removeItemById(group.id);
                    state.lightGroups.removeItemById(group.id);
                }
            }
            else {
                state.lightGroups.removeItemById(group.id);
                sys.lightGroups.removeItemById(group.id);
                state.circuitGroups.removeItemById(group.id);
                sys.circuitGroups.removeItemById(group.id);
            }
        }
        for (let i = 0; i < arrlightGrps.length; i++) {
            let group: LightGroup = arrlightGrps[i];
            let sgroup: LightGroupState = state.lightGroups.getItemById(group.id, true);
            sgroup.type = group.type;
            sgroup.lightingTheme = group.lightingTheme;
        }
        for (let i = 0; i < arrCircuitGrps.length; i++) {
            let group: CircuitGroup = arrCircuitGrps[i];
            let sgroup: CircuitGroupState = state.circuitGroups.getItemById(group.id, true);
            sgroup.type = group.type;
        }
        state.emitEquipmentChanges();
    }
    private static processColor(msg: Inbound) {
        var groupId = ((msg.extractPayloadByte(1) - 35)) + sys.board.equipmentIds.circuitGroups.start;
        var group: ICircuitGroup = sys.circuitGroups.getInterfaceById(groupId++);
        if (group.isActive && group.type === 1) {
            let lg = group as LightGroup;
            for (let j = 1; j <= 16 && j < msg.payload.length && j <= lg.circuits.length; j++) {
                let circuit = lg.circuits.getItemById(j);
                circuit.color = msg.extractPayloadByte(j + 17);
            }
        }
    }
    private static processEggTimer(msg: Inbound) {
        var groupId = ((msg.extractPayloadByte(1) - 34) * 16) + sys.board.equipmentIds.circuitGroups.start;
        for (let i = 2; i < msg.payload.length && sys.board.equipmentIds.circuitGroups.isInRange(groupId); i++) {
            var group: ICircuitGroup = sys.circuitGroups.getInterfaceById(groupId++);
            if (group.isActive) {
                let sgroup: ICircuitGroupState = group.type === 1 ? state.lightGroups.getItemById(group.id) : state.circuitGroups.getItemById(group.id);
                group.eggTimer = (msg.extractPayloadByte(i) * 60) + msg.extractPayloadByte(i + 16);
                //  sgroup.eggTimer = group.eggTimer;
            }
        }
    }
}