import { Inbound } from "../Messages";
import { sys, CircuitGroup, CircuitGroupCircuit } from"../../../Equipment";
import { state, CircuitGroupState, GroupCircuitState } from '../../../State';
export class CircuitGroupMessage {
    private static maxCircuits: number = 16;
    public static process(msg: Inbound): void {
        let groupId;
        let group: CircuitGroup;
        let sgroup: CircuitGroupState;
        if (msg.extractPayloadByte(1) <= 15) {
            var circuitId = 1;
            groupId = msg.extractPayloadByte(1) + 1;
            group = sys.circuitGroups.getItemById(groupId);
            
            group.circuits.clear();
            
            // Circuit #
            for (let i = 2; i < msg.payload.length && circuitId <= this.maxCircuits; i++) {
                if (msg.extractPayloadByte(i) !== 255) group.circuits.add({ id: circuitId, circuit: msg.extractPayloadByte(i) });
                circuitId++;
            }
        }
        else if (msg.extractPayloadByte(1) >= 16 && msg.extractPayloadByte(1) <= 31) {
            groupId = msg.extractPayloadByte(1) - 16 + 1;
            if (groupId <= sys.circuitGroups.length) {
                group = sys.circuitGroups.getItemById(groupId);
                sgroup = state.circuitGroups.getItemById(groupId);
                group.name = msg.extractPayloadString(2, 16);
                sgroup.name = group.name;
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
        for (let i = 2; i < msg.payload.length && groupId <= sys.equipment.maxCircuitGroups && i <= 17; i++) {
            let type = msg.extractPayloadByte(i);
            let group: CircuitGroup = sys.circuitGroups.getItemById(groupId++, type !== 0);
            let sgroup: CircuitGroupState = state.circuitGroups.getItemById(group.id, type !== 0);
            group.type = type;
            if (group.isActive && group.type <= 0) {
                sys.circuitGroups.removeItemById(group.id);
                state.circuitGroups.removeItemById(group.id);
            }
            group.isActive = group.type !== 0;
            if (!group.isActive && state.circuitGroups.length > sys.circuitGroups.length) state.circuitGroups.removeItemById(group.id);
            if (group.isActive) sgroup.type = group.type;
        }
    }
    private static processEggTimer(msg: Inbound) {
        var groupId = ((msg.extractPayloadByte(1) - 34) * 16) + 1;
        for (let i = 2; i < msg.payload.length && groupId <= sys.circuitGroups.length && groupId <= sys.equipment.maxCircuitGroups; i++) {
            var group: CircuitGroup = sys.circuitGroups.getItemById(groupId++);
            let sgroup: CircuitGroupState = state.circuitGroups.getItemById(group.id);
            group.eggTimer = (msg.extractPayloadByte(i + 1) * 60) + msg.extractPayloadByte(i + 16);
            sgroup.eggTimer = group.eggTimer;
        }
    }
}