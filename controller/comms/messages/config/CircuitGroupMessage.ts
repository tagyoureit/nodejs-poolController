import { Inbound } from "../Messages";
import { sys, CircuitGroup, LightGroup, CircuitGroupCircuit, LightGroupCircuit, ICircuitGroup } from"../../../Equipment";
import { state, CircuitGroupState, LightGroupState, ICircuitGroupState } from '../../../State';
export class CircuitGroupMessage {
    private static maxCircuits: number = 16;
    public static process(msg: Inbound): void {
        let groupId;
        let group: ICircuitGroup;
        let sgroup: ICircuitGroupState;
        if (msg.extractPayloadByte(1) <= 15) {
            var circuitId = 1;
            groupId = msg.extractPayloadByte(1) + 1;
            group = sys.circuitGroups.getInterfaceById(groupId);
            if (group.isActive) {
                group.circuits.clear();
                // Circuit #
                for (let i = 2; i < msg.payload.length && circuitId <= this.maxCircuits; i++) {
                    if (msg.extractPayloadByte(i) !== 255) group.circuits.add({ id: circuitId, circuit: msg.extractPayloadByte(i) });
                    circuitId++;
                }
            }
        }
        else if (msg.extractPayloadByte(1) >= 16 && msg.extractPayloadByte(1) <= 31) {
            groupId = msg.extractPayloadByte(1) - 16 + 1;
            if (groupId <= sys.circuitGroups.length + sys.lightGroups.length) {
                group = sys.circuitGroups.getInterfaceById(groupId);
                if (group.isActive) {
                    sgroup = group.type === 1 ? state.lightGroups.getItemById(groupId) : state.circuitGroups.getItemById(groupId);
                    group.name = msg.extractPayloadString(2, 16);
                    sgroup.name = group.name;
                }
            }
        }
        switch (msg.extractPayloadByte(1)) {
            case 32: // Group type for the first 16.
                CircuitGroupMessage.processGroupType(msg);
                break;
            case 33: // Group type for second 16.
                CircuitGroupMessage.processGroupType(msg);
                break;
            case 34:
            case 35:
                CircuitGroupMessage.processEggTimer(msg);
                break;
        }

    }
    private static processGroupType(msg: Inbound) {
        var groupId = 1 + ((msg.extractPayloadByte(1) - 32) * 16);
        let arrlightGrps = [];
        let arrCircuitGrps = [];
        for (let i = 2; i < msg.payload.length && groupId <= sys.equipment.maxCircuitGroups && i <= 17; i++) {
            let type = msg.extractPayloadByte(i);
            let group: ICircuitGroup = type === 1 ? sys.lightGroups.getItemById(groupId++, true) : sys.circuitGroups.getItemById(groupId++ , type !== 0);
            let sgroup: ICircuitGroupState = state.circuitGroups.getItemById(group.id, type !== 0);
            group.type = type;
            if (group.isActive && group.type <= 0) {
                sys.circuitGroups.removeItemById(group.id);
                state.circuitGroups.removeItemById(group.id);
            }
            else {
                if (group.type === 1)
                    arrlightGrps.push(group);
                else
                    arrCircuitGrps.push(group);
            }
            group.isActive = group.type !== 0;
            if (!group.isActive && state.circuitGroups.length > sys.circuitGroups.length) state.circuitGroups.removeItemById(group.id);
            if (group.isActive) sgroup.type = group.type;
        }
        for (let i = 0; i < arrlightGrps.length; i++) {
            let group: LightGroup = arrlightGrps[i];
            let sgroup: LightGroupState = state.lightGroups.getItemById(group.id);
            group.lightingTheme = msg.extractPayloadByte(18 + i) >> 2;
            sgroup.lightingTheme = group.lightingTheme;
            sgroup.emitEquipmentChange();
        }
        for (let i = 0; i < arrCircuitGrps.length; i++) {
            state.circuitGroups.getItemById(arrCircuitGrps[i].id).emitEquipmentChange();
        }
    }
    private static processEggTimer(msg: Inbound) {
        var groupId = ((msg.extractPayloadByte(1) - 34) * 16) + 1;
        for (let i = 2; i < msg.payload.length && groupId <= sys.circuitGroups.length + sys.lightGroups.length && groupId <= sys.equipment.maxCircuitGroups; i++) {
            var group: ICircuitGroup = sys.circuitGroups.getInterfaceById(groupId++);
            if (group.isActive) {
                let sgroup: ICircuitGroupState = group.type === 1 ? state.lightGroups.getItemById(group.id) : state.circuitGroups.getItemById(group.id);
                group.eggTimer = (msg.extractPayloadByte(i + 1) * 60) + msg.extractPayloadByte(i + 16);
                sgroup.eggTimer = group.eggTimer;
            }
        }
    }
}