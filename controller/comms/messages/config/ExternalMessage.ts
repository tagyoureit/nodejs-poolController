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
import { sys, Body, ICircuitGroup, LightGroup, CircuitGroup, Cover, SecurityRole } from "../../../Equipment";
import { state, ICircuitGroupState, LightGroupState, CircuitGroupState } from "../../../State";
import { ControllerType, Timestamp, utils } from "../../../Constants";
import { logger } from "../../../../logger/Logger";
import { CoverMessage } from "./CoverMessage";
export class ExternalMessage {
    private static normalizePumpBodyCode(rawBody: number): number {
        const poolBody = sys.board.valueMaps.pumpBodies.getValue('pool');
        const spaBody = sys.board.valueMaps.pumpBodies.getValue('spa');
        const poolSpaBody = sys.board.valueMaps.pumpBodies.getValue('poolspa');
        const sharedPool = sys.board.valueMaps.bodies.getValue('pool');
        const sharedSpa = sys.board.valueMaps.bodies.getValue('spa');
        const sharedPoolSpa = sys.board.valueMaps.bodies.getValue('poolspa');
        if (rawBody === sharedPool) return poolBody;
        if (rawBody === sharedSpa) return spaBody;
        if (rawBody === sharedPoolSpa) return poolSpaBody;
        return rawBody;
    }
    private static decodePumpBodyCode(rawBody: number): number | undefined {
        const normalized = ExternalMessage.normalizePumpBodyCode(rawBody);
        return sys.board.valueMaps.pumpBodies.valExists(normalized) ? normalized : undefined;
    }
    private static normalizeIntelliCenterPumpAddress(rawAddress: number): number {
        if (rawAddress > 0 && rawAddress <= 16) return rawAddress + 95;
        return rawAddress;
    }
    public static processIntelliCenter(msg: Inbound): void {
        // IntelliCenter v3.x: treat Wireless/ICP/Indoor -> OCP packets as requests, not source-of-truth.
        // We are a bus listener, so we will see traffic not addressed to us; do not apply those requests to state.
        // Only accept OCP-originated messages here. If/when OCP applies a request, it will broadcast authoritative
        // state/config via other message types (e.g., Action 30 / 204).
        if (sys.equipment.isIntellicenterV3 && msg.dest === 16 && msg.source !== 16) {
            // ISSUE-073 exception: body capacity updates via Action 168 cat 13 sub 4-7 are NOT
            // reliably reflected by a subsequent Action 30 cat 13 broadcast. In the field the OCP
            // re-broadcasts [13,0] (Pool) ~20s after the change, but often NEVER re-broadcasts
            // [13,1] (Spa). Decoding the capacity from the ICP's own Action 168 request (which the
            // OCP is about to ACK) lets njsPC stay in sync without waiting on a broadcast that may
            // never arrive. If the broadcast does arrive later, EquipmentMessage will overwrite with
            // the same value.
            if (msg.action === 168 && msg.extractPayloadByte(0) === 13) {
                const sub = msg.extractPayloadByte(1, 0);
                const selector = msg.extractPayloadByte(2, -1);
                if (sub === 0 && selector >= 4 && selector <= 7) {
                    // Payload layout: [13, 0, selector, capHi, capLo]
                    // selector 4->body1 (Pool), 5->body2 (Spa or Pool2), 6->body3, 7->body4.
                    const bodyId = selector - 3;
                    if (sys.equipment.maxBodies >= bodyId) {
                        const hi = msg.extractPayloadByte(3, 0);
                        const lo = msg.extractPayloadByte(4, 0);
                        const capacity = ((hi << 8) | lo) * 1000;
                        const cbody = sys.bodies.getItemById(bodyId);
                        if (typeof cbody !== 'undefined' && cbody.id === bodyId) {
                            cbody.capacity = capacity;
                            logger.silly(`v3.004+ ICP body capacity: body${bodyId} -> ${capacity} gal`);
                        }
                    }
                }
            }
            // ISSUE-078 Part B: chlorinator live-edit piggyback (Action 168 cat=7 sub=0)
            // — Wireless → OCP request direction. See processIntelliCenterV3Chlor168 for
            // the validated decode and the rationale.
            if (msg.action === 168 && msg.extractPayloadByte(0) === 7 && msg.extractPayloadByte(1) === 0) {
                ExternalMessage.processIntelliCenterV3Chlor168(msg);
            }
            msg.isProcessed = true;
            return;
        }
        // ISSUE-078 Part D (defense-in-depth): OCP-originated Action 168 cat=7 sub=0 broadcasts
        // (src=16, dest=15) were observed in `logs/packetLog(2026-04-19_19-16-39).log`. They
        // bypass the Wireless→OCP guard above and would otherwise fall through to the v1.x
        // `processChlorinator` below, which misdecodes bytes 7/8 and risks a remove if
        // payload[10]=0 ever appears. Route them through the validated v3 decoder instead.
        if (sys.equipment.isIntellicenterV3
            && msg.action === 168
            && msg.extractPayloadByte(0) === 7
            && msg.extractPayloadByte(1) === 0) {
            ExternalMessage.processIntelliCenterV3Chlor168(msg);
            msg.isProcessed = true;
            return;
        }
        switch (msg.extractPayloadByte(0)) {
            case 0: // Setpoints/HeatMode
                ExternalMessage.processTempSettings(msg);
                break;
            case 1: // Circuit Changes
                ExternalMessage.processCircuit(msg);
                break;
            case 2: // Feature Changes
                ExternalMessage.processFeature(msg);
                break;
            case 3: // Schedule Changes
                ExternalMessage.processSchedules(msg);
                break;
            case 4: // Pump Information
                ExternalMessage.processPump(msg);
                break;
            case 5: // Remotes
                break;
            case 6: // Light/Circuit group
                ExternalMessage.processGroupSettings(msg);
                break;
            case 7: // Chlorinator
                ExternalMessage.processChlorinator(msg);
                break;
            case 8: // IntelliChem
                ExternalMessage.processIntelliChem(msg);
                break;
            case 9: // Valves
                ExternalMessage.processValve(msg);
                break;
            case 10: // Heaters
                ExternalMessage.processHeater(msg);
                break;
            case 11: // Security
                ExternalMessage.processSecurity(msg);
                break;
            case 12: // Pool Settings Alias, owner...etc.
                ExternalMessage.processPool(msg);
                break;
            case 13: // Bodies (Manual heat, capacities)
                ExternalMessage.processBodies(msg);
                break;
            case 14: // Covers (ISSUE-075 #5: route A168 cat=14 into CoverMessage so wireless/piggyback
                //             cover edits are ingested without waiting for the OCP's A30 rebroadcast)
                CoverMessage.processA168(msg);
                break;
            case 15: // Circuit, feature, group, and schedule States
                ExternalMessage.processCircuitState(3, msg);
                ExternalMessage.processFeatureState(9, msg);
                ExternalMessage.processScheduleState(15, msg);
                ExternalMessage.processCircuitGroupState(13, msg);
                break;
            default:
                logger.debug(`Unprocessed Message ${msg.toPacket()}`)
                break;
        }
    }
    public static processIntelliChem(msg: Inbound) {
        let id = msg.extractPayloadByte(2) + 1;
        let isActive = utils.makeBool(msg.extractPayloadByte(6));
        //let schem = state.chemchems.getItemById(id, isActive);
        //chem.isActive = schem.isActive = isActive;
        if (isActive) {
            let chem = sys.chemControllers.getItemById(id, true);
            let schem = state.chemControllers.getItemById(id, true);
            // chem.isVirtual = false;
            chem.master = 0;
            chem.ph.tank.capacity = chem.orp.tank.capacity = 6;
            chem.ph.tank.units = chem.orp.tank.units = '';
            schem.type = chem.type = 2;
            schem.name = chem.name = (chem.name || 'IntelliChem' + id);
            schem.body = chem.body = msg.extractPayloadByte(3);
            schem.address = chem.address = msg.extractPayloadByte(5);
            chem.ph.setpoint = schem.ph.setpoint = msg.extractPayloadInt(7) / 100;
            chem.orp.setpoint = schem.orp.setpoint = msg.extractPayloadInt(9);
            chem.calciumHardness = msg.extractPayloadInt(13);
            chem.cyanuricAcid = msg.extractPayloadInt(15);
            chem.alkalinity = msg.extractPayloadInt(17);
        }
        else {
            sys.chemControllers.removeItemById(id);
            state.chemControllers.removeItemById(id);
        }
        msg.isProcessed = true;
    }
    public static processValve(msg: Inbound) {
        let valve = sys.valves.getItemById(msg.extractPayloadByte(2) + 1);
        valve.circuit = msg.extractPayloadByte(3) + 1;
        valve.name = msg.extractPayloadString(4, 16);
        valve.master = 0;
        // valve.isVirtual = false;
        msg.isProcessed = true;
    }
    public static processPool(msg: Inbound) {
        switch (msg.extractPayloadByte(2)) {
            case 0: // Pool Alias
                sys.general.alias = msg.extractPayloadString(3, 16);
                msg.isProcessed = true;
                break;
            case 1: // Address
                sys.general.location.address = msg.extractPayloadString(3, 32);
                msg.isProcessed = true;
                break;
            case 2: // Owner
                sys.general.owner.name = msg.extractPayloadString(3, 16);
                msg.isProcessed = true;
                break;
            case 3: // Email
                sys.general.owner.email = msg.extractPayloadString(3, 32);
                msg.isProcessed = true;
                break;
            case 4: // Email 2
                sys.general.owner.email2 = msg.extractPayloadString(3, 32);
                msg.isProcessed = true;
                break;
            case 5: // Phone
                sys.general.owner.phone = msg.extractPayloadString(3, 16);
                msg.isProcessed = true;
                break;
            case 6: // Phone 2
                sys.general.owner.phone2 = msg.extractPayloadString(3, 16);
                msg.isProcessed = true;
                break;
            case 7: // Zipcode
                sys.general.location.zip = msg.extractPayloadString(3, 6);
                msg.isProcessed = true;
                break;
            case 8: // Country
                sys.general.location.country = msg.extractPayloadString(3, 32);
                msg.isProcessed = true;
                break;
            case 9: // City
                sys.general.location.city = msg.extractPayloadString(3, 32);
                msg.isProcessed = true;
                break;
            case 10: // State
                sys.general.location.state = msg.extractPayloadString(3, 16);
                msg.isProcessed = true;
                break;
            case 11: // Latitute
                sys.general.location.latitude = ((msg.extractPayloadByte(4) * 256) + msg.extractPayloadByte(3)) / 100;
                msg.isProcessed = true;
                break;
            case 12: // Longitude
                sys.general.location.longitude = -((msg.extractPayloadByte(4) * 256) + msg.extractPayloadByte(3)) / 100;
                msg.isProcessed = true;
                break;
            case 13: // Timezone
                sys.general.location.timeZone = msg.extractPayloadByte(3);
                msg.isProcessed = true;
                break;
        }
    }
    public static processGroupSettings(msg: Inbound) {
        // We have 3 potential messages.
        let groupId = msg.extractPayloadByte(2) + sys.board.equipmentIds.circuitGroups.start;
        let group: ICircuitGroup = null;
        let sgroup: ICircuitGroupState = null;
        switch (msg.extractPayloadByte(1)) {
            case 0:
                {
                    // Get the type.
                    let type = msg.extractPayloadByte(3);
                    switch (msg.extractPayloadByte(3)) {
                        case 0:
                            group = sys.circuitGroups.getInterfaceById(groupId);
                            sgroup = group.type === 2 ? state.circuitGroups.getItemById(groupId) : state.lightGroups.getItemById(groupId);
                            sys.lightGroups.removeItemById(groupId);
                            sys.circuitGroups.removeItemById(groupId);
                            state.lightGroups.removeItemById(groupId);
                            sys.circuitGroups.removeItemById(groupId);
                            sgroup.isActive = false;
                            state.emitEquipmentChanges();
                            msg.isProcessed = true;
                            break;
                        case 1:
                            group = sys.lightGroups.getItemById(groupId, true);
                            sgroup = state.lightGroups.getItemById(groupId, true);
                            sys.circuitGroups.removeItemById(groupId);
                            state.circuitGroups.removeItemById(groupId);
                            sgroup.lightingTheme = group.lightingTheme = msg.extractPayloadByte(4) >> 2;
                            sgroup.type = group.type = type;
                            sgroup.isActive = group.isActive = true;
                            msg.isProcessed = true;
                            break;
                        case 2:
                            group = sys.circuitGroups.getItemById(groupId, true);
                            sgroup = state.circuitGroups.getItemById(groupId, true);
                            sgroup.type = group.type = type;
                            if (typeof group.showInFeatures === 'undefined') group.showInFeatures = sgroup.showInFeatures = true;
                            sgroup.showInFeatures = group.showInFeatures;
                            sys.lightGroups.removeItemById(groupId);
                            state.lightGroups.removeItemById(groupId);
                            sgroup.isActive = group.isActive = true;
                            msg.isProcessed = true;
                            break;
                    }
                    if (group.isActive) {
                        for (let i = 0; i < 16; i++) {
                            let circuitId = msg.extractPayloadByte(i + 6);
                            let circuit = group.circuits.getItemById(i + 1, circuitId < 255);
                            if (circuitId === 255) group.circuits.removeItemById(i + 1);
                            circuit.circuit = circuitId + 1;

                        }
                    }
                    if (sys.equipment.isIntellicenterV3) {
                        group.eggTimer = (msg.extractPayloadByte(40) * 60) + msg.extractPayloadByte(41);
                    } else {
                        group.eggTimer = (msg.extractPayloadByte(38) * 60) + msg.extractPayloadByte(39);
                    }
                    group.dontStop = group.eggTimer === 1440;
                    if (type === 1) {
                        let g = group as LightGroup;
                        for (let i = 0; i < 16; i++) {
                            g.circuits.getItemById(i + 1).swimDelay = msg.extractPayloadByte(22 + i);
                        }
                    }
                    state.emitEquipmentChanges();
                    msg.isProcessed = true;
                    break;
                }
            case 1:
                group = sys.circuitGroups.getInterfaceById(groupId);
                sgroup = group.type === 1 ? state.lightGroups.getItemById(groupId) : state.circuitGroups.getItemById(groupId);
                sgroup.name = group.name = msg.extractPayloadString(19, 16);
                if (group.type === 1) {
                    let g = group as LightGroup;
                    for (let i = 0; i < 16; i++) {
                        let circuit = g.circuits.getItemById(i + 1);
                        circuit.color = msg.extractPayloadByte(i + 3);
                    }
                }
                state.emitEquipmentChanges();
                msg.isProcessed = true;
                break;
            case 2:
                group = sys.circuitGroups.getInterfaceById(groupId);
                // Process the group states.
                if (group.type === 2) {
                    let g = group as CircuitGroup;
                    for (let i = 0; i < 16; i++) {
                        let desiredState = msg.extractPayloadByte(i + 19);
                        let circuit = g.circuits.getItemById(i + 1);
                        circuit.desiredState = (desiredState !== 255) ? desiredState : 3;
                    }
                }
                msg.isProcessed = true;
                break;
        }
    }
    public static processIntelliCenterState(msg) {
        // This is called from Action 30 case 15 (config message) - NOT Action 168 case 15 (wireless message).
        // Action 30 and Action 168 have different payload structures!
        // 
        // v1.x: Original offsets (2, 8, 14, 12) - in place since Oct 2019, working.
        // v3.004+: Different structure, requires offsets (3, 9, 15, 13) to match wireless message layout.
        if (sys.equipment.isIntellicenterV3) {
            ExternalMessage.processCircuitState(3, msg);
            ExternalMessage.processFeatureState(9, msg);
            ExternalMessage.processScheduleState(15, msg);
            ExternalMessage.processCircuitGroupState(13, msg);
        } else {
            // v1.x offsets - preserve original behavior since Oct 2019
            ExternalMessage.processCircuitState(2, msg);
            ExternalMessage.processFeatureState(8, msg);
            ExternalMessage.processScheduleState(14, msg);
            ExternalMessage.processCircuitGroupState(12, msg);
        }
    }
    private static processHeater(msg: Inbound) {
        // So a user is changing the heater info.  Lets
        // hijack it and get it ourselves.
        // Installing hybrid heater.
        //[165, 63, 15, 16, 168, 30][10, 0, 2, 5, 32, 5, 6, 3, 0, 6, 112, 72, 121, 98, 114, 105, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 1][4, 230]
        let isActive = msg.extractPayloadByte(3) !== 0;
        let heaterId = msg.extractPayloadByte(2) + 1;
        if (isActive) {
            let heater = sys.heaters.getItemById(heaterId, true);
            let hstate = state.heaters.getItemById(heater.id, true);

            hstate.type = heater.type = msg.extractPayloadByte(3);
            heater.body = msg.extractPayloadByte(4);
            heater.cooldownDelay = msg.extractPayloadByte(5);
            heater.startTempDelta = msg.extractPayloadByte(6);
            heater.stopTempDelta = msg.extractPayloadByte(7);
            heater.coolingEnabled = msg.extractPayloadByte(8) > 0;
            heater.differentialTemp = msg.extractPayloadByte(9);
            heater.address = msg.extractPayloadByte(10);
            hstate.name = heater.name = msg.extractPayloadString(11, 16);
            heater.efficiencyMode = msg.extractPayloadByte(27);
            heater.maxBoostTemp = msg.extractPayloadByte(28);
            heater.economyTime = msg.extractPayloadByte(29);
            heater.master = 0;
        }
        else {
            sys.heaters.removeItemById(heaterId);
            state.heaters.removeItemById(heaterId);
        }
        sys.board.heaters.updateHeaterServices();
        // Check anyway to make sure we got it all.
        //setTimeout(() => sys.checkConfiguration(), 500);
        msg.isProcessed = true;
    }

    private static processCircuitState(start: number, msg: Inbound) {
        let circuitId = 1;//sys.board.equipmentIds.circuits.start;
        for (let i = start; i < msg.payload.length && sys.board.equipmentIds.circuits.isInRange(circuitId); i++) {
            let byte = msg.extractPayloadByte(i);
            // Shift each bit getting the circuit identified by each value.
            for (let j = 0; j < 8; j++) {
                let circuit = sys.circuits.getItemById(circuitId);
                let cstate = state.circuits.getItemById(circuitId, circuit.isActive);
                if (circuit.isActive) {
                    let isOn = ((byte & (1 << (j))) >> j) > 0;
                    sys.board.circuits.setEndTime(circuit, cstate, isOn);
                    cstate.isOn = isOn;                    
                    cstate.name = circuit.name;
                    cstate.showInFeatures = circuit.showInFeatures;
                    cstate.type = circuit.type;
                    switch (circuit.type) {
                        case 6: // Globrite
                        case 5: // Magicstream
                        case 8: // Intellibrite
                        case 10: // Colorcascade
                            cstate.lightingTheme = circuit.lightingTheme;
                            if (!isOn) cstate.action = 0;
                            break;
                        case 9: // Dimmer
                            cstate.level = circuit.level;
                            break;
                    }
                }
                else
                    state.circuits.removeItemById(circuitId);
                state.emitEquipmentChanges();
                circuitId++;
            }
            msg.isProcessed = true;
        }
        // state.body = body;
    }
    private static processScheduleState(start: number, msg: Inbound) {
        let scheduleId = 1;
        for (let i = start; i < msg.payload.length && scheduleId <= sys.equipment.maxSchedules; i++) {
            let byte = msg.extractPayloadByte(i);
            // Shift each bit getting the schedule identified by each value.
            for (let j = 0; j < 8; j++) {
                let schedule = sys.schedules.getItemById(scheduleId);
                if (schedule.isActive) {
                    if (schedule.circuit > 0) { // Don't get the schedule state if we haven't determined the entire config for it yet.
                        let sstate = state.schedules.getItemById(scheduleId, schedule.isActive);
                        let isOn = ((byte & (1 << (j))) >> j) > 0;
                        sstate.isOn = isOn;
                        sstate.circuit = schedule.circuit;
                        sstate.endTime = schedule.endTime;
                        sstate.startDate = schedule.startDate;
                        sstate.startTime = schedule.startTime;
                        sstate.scheduleDays = schedule.scheduleDays;
                        sstate.scheduleType = schedule.scheduleType;
                        sstate.heatSetpoint = schedule.heatSetpoint;
                        sstate.heatSource = schedule.heatSource;
                        sstate.startTimeType = schedule.startTimeType;
                        sstate.endTimeType = schedule.endTimeType;
                        sstate.startDate = schedule.startDate;
                    }
                }
                else
                    state.schedules.removeItemById(scheduleId);
                scheduleId++;
            }
        }
        state.emitEquipmentChanges();
        msg.isProcessed = true;
    }
    public static processFeatureState(start: number, msg: Inbound) {
        let featureId = sys.board.equipmentIds.features.start;
        let maxFeatureId = sys.features.getMaxId(true, 0);
        //console.log(`Max Feature Id = ${maxFeatureId}`);
        for (let i = start; i < msg.payload.length && featureId <= maxFeatureId; i++) {
            let byte = msg.extractPayloadByte(i);
            // Shift each bit getting the feature identified by each value.
            for (let j = 0; j < 8 && featureId <= maxFeatureId; j++) {
                let feature = sys.features.getItemById(featureId, false, { isActive: false });
                if (feature.isActive !== false) {
                    let fstate = state.features.getItemById(featureId, true);
                    let isOn = (byte & (1 << j)) > 0;
                    sys.board.circuits.setEndTime(feature, fstate, isOn);
                    fstate.isOn = isOn;
                    fstate.name = feature.name;
                }
                else
                    // Just a little insurance to remove the feature from the state.
                    state.features.removeItemById(featureId);
                featureId++;
            }
        }
        state.emitEquipmentChanges();
        msg.isProcessed = true;

    }
    private static processCircuitGroupState(start: number, msg: Inbound) {
        let groupId = sys.board.equipmentIds.circuitGroups.start;
        let maxGroupId = Math.max(sys.lightGroups.getMaxId(true, 0), sys.circuitGroups.getMaxId(true, 0));
        for (let i = start; i < msg.payload.length && groupId <= maxGroupId; i++) {
            let byte = msg.extractPayloadByte(i);
            // Shift each bit getting the group identified by each value.
            for (let j = 0; j < 8; j++) {
                let group = sys.circuitGroups.getInterfaceById(groupId);
                let gstate = group.type === 1 ? state.lightGroups.getItemById(groupId, group.isActive) : state.circuitGroups.getItemById(groupId, group.isActive);
          
                if (group.isActive !== false) {
                    let isOn = ((byte & (1 << (j))) >> j) > 0;
                    sys.board.circuits.setEndTime(group, gstate, isOn);
                    gstate.isOn = isOn;
                    gstate.name = group.name;
                    gstate.type = group.type;
                    // Now calculate out the sync/set/swim operations.
                    if (gstate.dataName === 'lightGroup') {
                        let lg = gstate as LightGroupState;
                        if (!isOn) lg.action = 0;
                        else if (sys.equipment.isIntellicenterV3) {
                        }
                        else if (start === 13) {
                            let ndx = lg.id - sys.board.equipmentIds.circuitGroups.start;
                            let byteNdx = Math.floor(ndx / 4);
                            let bitNdx = (ndx * 2) - (byteNdx * 8);
                            let byte = msg.extractPayloadByte(start + 15 + byteNdx, 255);
                            //console.log(`ndx:${start + 15 + byteNdx} byte: ${byte}, bit: ${bitNdx}`);
                            byte = ((byte >> bitNdx) & 0x0003);
                            // Each light group is represented by two bits on the status byte.  There are 3 status bytes that give us only 12 of the 16 on the config stream but the 168 message
                            // does acutall send 4 so all are represented there.
                            // [10] = Set
                            // [01] = Swim
                            // [00] = Sync
                            // [11] = No sequencing underway.
                            switch (byte) {
                                case 0: // Sync
                                    lg.action = sys.board.valueMaps.circuitActions.getValue('colorsync');
                                    break;
                                case 1: // Color swim
                                    lg.action = sys.board.valueMaps.circuitActions.getValue('colorswim');
                                    break;
                                case 2: // Color set
                                    lg.action = sys.board.valueMaps.circuitActions.getValue('colorset');
                                    break;
                                default:
                                    lg.action = 0;
                                    break;
                            }
                        }
                    }
                    else if(gstate.dataName === 'circuitGroup') {
                        (gstate as CircuitGroupState).showInFeatures  = group.showInFeatures;
                    }
                }
                else {
                    state.circuitGroups.removeItemById(groupId);
                    state.lightGroups.removeItemById(groupId);
                }
                groupId++;
            }
        }
        state.emitEquipmentChanges();
        msg.isProcessed = true;
    }

    private static processSecurity(msg: Inbound) {
        const item = msg.extractPayloadByte(1, 0);
        if (item === 0) {
            sys.security.roles.clear();
        }
        const roleId = item + 1;
        const pinNumber = ((msg.extractPayloadByte(3, 0) & 0xFF) << 8) | (msg.extractPayloadByte(4, 0) & 0xFF);
        const roleName = msg.extractPayloadString(5, 16).trim();
        const permissionsBytes = [
            msg.extractPayloadByte(21, 0),
            msg.extractPayloadByte(22, 0),
            msg.extractPayloadByte(23, 0),
            msg.extractPayloadByte(24, 0)
        ];
        const permissionsMask =
            ((permissionsBytes[0] & 0xFF) * 16777216) +
            ((permissionsBytes[1] & 0xFF) * 65536) +
            ((permissionsBytes[2] & 0xFF) * 256) +
            (permissionsBytes[3] & 0xFF);
        const timeout = msg.extractPayloadByte(25, 0);
        const hasRoleData = item === 0 || roleName.length > 0 || permissionsMask > 0;
        if (hasRoleData) {
            const role: SecurityRole = sys.security.roles.getItemById(roleId, true);
            role.name = roleName;
            role.timeout = timeout;
            role.flag1 = msg.extractPayloadByte(2, 0);
            role.flag2 = permissionsBytes[3];
            role.pin = pinNumber.toString().padStart(4, '0');
            role.permissionsMask = permissionsMask;
            role.permissionsBytes = permissionsBytes;
            if (item === 0) {
                sys.security.enabledByte = permissionsBytes[3];
                sys.security.enabled = (permissionsBytes[3] & 0x80) === 0x80;
                sys.security.guestEnabled = (permissionsBytes[3] & 0x40) === 0x40;
            }
        } else {
            sys.security.roles.removeItemById(roleId);
        }
        msg.isProcessed = true;
    }
    private static processBodies(msg: Inbound) {
        let bodyId = 0;
        let cbody: Body = null;
        switch (msg.extractPayloadByte(2)) {
            case 0:
            case 1:
            case 2:
            case 3:
                bodyId = msg.extractPayloadByte(2);
                if (bodyId === 1) bodyId = 3;
                else if (bodyId === 0) bodyId = 1;
                else if (bodyId === 3) bodyId = 4;
                cbody = sys.bodies.getItemById(bodyId);
                cbody.name = msg.extractPayloadString(3, 16);
                state.temps.bodies.getItemById(bodyId, false).name = cbody.name;
                msg.isProcessed = true;
                break;
            case 4:
            case 5:
            case 6:
            case 7:
                bodyId = msg.extractPayloadByte(2) - 4;
                if (bodyId === 1) bodyId = 3;
                else if (bodyId === 0) bodyId = 1;
                else if (bodyId === 3) bodyId = 4;
                cbody = sys.bodies.getItemById(bodyId);
                // v1.x only. On v3.004+ this path is unreachable because the Wireless/ICP->OCP
                // early-return in processIntelliCenter intercepts the 168 (and decodes the BE16
                // capacity there directly). See ISSUE-073.
                if (!sys.equipment.isIntellicenterV3) {
                    cbody.capacity = msg.extractPayloadByte(3) * 1000;
                }
                msg.isProcessed = true;
                break;
            case 12: // Circuit notifications
                if (msg.payload.length > 3) {
                    const value = msg.extractPayloadByte(3, 0);
                    sys.alerts.circuitNotifications = value;
                    sys.alerts.setRaw(12, [value]);
                }
                msg.isProcessed = true;
                break;
            case 13: // Pump notifications
                ExternalMessage.applyAlertNotificationFromExternal(msg, 13, 3);
                msg.isProcessed = true;
                break;
            case 14: // Heater notifications
                ExternalMessage.applyAlertNotificationFromExternal(msg, 14, 3);
                msg.isProcessed = true;
                break;
            case 15: // Chlorinator notifications
                ExternalMessage.applyAlertNotificationFromExternal(msg, 15, 3);
                msg.isProcessed = true;
                break;
        }
        state.emitEquipmentChanges();
    }
    private static applyAlertNotificationFromExternal(msg: Inbound, selector: number, startOffset: number) {
        const raw: number[] = [];
        for (let i = startOffset; i < msg.payload.length; i++) raw.push(msg.extractPayloadByte(i, 0));
        sys.alerts.setRaw(selector, raw);
        if (raw.length === 0) return;
        const mask = raw.length === 1 ? (raw[0] & 0xFF) : (((raw[raw.length - 2] & 0xFF) << 8) | (raw[raw.length - 1] & 0xFF));
        switch (selector) {
            case 13:
                sys.alerts.pumpNotifications = mask;
                break;
            case 14:
                sys.alerts.heaterNotifications = mask;
                break;
            case 15:
                sys.alerts.chlorinatorNotifications = mask;
                break;
        }
    }
    private static processSchedules(msg: Inbound) {
        let schedId = msg.extractPayloadByte(2) + 1;
        // v3.004+: schedule times are big-endian (hi,lo) in Action 168 payloads.
        // v1.x: schedule times are little-endian (lo,hi).
        let startTime: number;
        let endTime: number;
        if (sys.controllerType === ControllerType.IntelliCenter && sys.equipment.isIntellicenterV3) {
            startTime = msg.extractPayloadIntBE(3);
            endTime = msg.extractPayloadIntBE(5);
        } else {
            startTime = msg.extractPayloadInt(3);
            endTime = msg.extractPayloadInt(5);
        }
        let circuit = msg.extractPayloadByte(7) + 1;
        let isActive = (msg.extractPayloadByte(8) & 128) === 128; // Inactive schedules do not have bit 8 set.
        let cfg = sys.schedules.getItemById(schedId, isActive);
        let s = state.schedules.getItemById(schedId, cfg.isActive);
        //cfg.isActive = (circuit !== 256);
        cfg.startTime = startTime;
        cfg.endTime = endTime;
        cfg.circuit = circuit;
        cfg.isActive = isActive;
        let byte = msg.extractPayloadByte(8);
        cfg.scheduleType = (byte & 1 & 0xFF) === 1 ? 0 : 128;
        if ((byte & 4 & 0xFF) === 4) cfg.startTimeType = 1;
        else if ((byte & 8 & 0xFF) === 8) cfg.startTimeType = 2;
        else cfg.startTimeType = 0;

        if ((byte & 16 & 0xFF) === 16) cfg.endTimeType = 1;
        else if ((byte & 32 & 0xFF) === 32) cfg.endTimeType = 2;
        else cfg.endTimeType = 0;
        //cfg.runOnce = byte;
        cfg.scheduleDays = msg.extractPayloadByte(9);
        cfg.startMonth = msg.extractPayloadByte(10);
        cfg.startDay = msg.extractPayloadByte(11);
        cfg.startYear = msg.extractPayloadByte(12);
        let hs = msg.extractPayloadByte(13);
        // RKS: During the transition to 1.047 the heat sources were all screwed up.  O now means no change and 1 means off.
        //if (hs === 1) hs = 0; // Shim for 1.047
        cfg.heatSource = hs;
        cfg.heatSetpoint = msg.extractPayloadByte(14);
        cfg.coolSetpoint = msg.extractPayloadByte(15);
        if (cfg.isActive) {
            let s = state.schedules.getItemById(schedId, cfg.isActive);
            s.isActive = cfg.isActive = true;
            s.startTime = cfg.startTime;
            s.endTime = cfg.endTime;
            s.circuit = cfg.circuit;
            s.scheduleType = cfg.scheduleType;
            s.scheduleDays = cfg.scheduleType === 128 ? cfg.scheduleDays : 0;
            s.heatSetpoint = cfg.heatSetpoint;
            s.coolSetpoint = cfg.coolSetpoint;
            s.heatSource = cfg.heatSource;
            s.startDate = cfg.startDate;
            s.startTimeType = cfg.startTimeType;
            s.endTimeType = cfg.endTimeType;
        }
        else {
            s.isActive = cfg.isActive = false;
            sys.schedules.removeItemById(cfg.id);
            state.schedules.removeItemById(cfg.id);
            s.emitEquipmentChange();
        }
        state.emitEquipmentChanges();
        msg.isProcessed = true;
    }
    // ISSUE-078: Shared v3.008 Action 168 cat=7 sub=0 decoder. Invoked from two paths:
    //   (Part B) Wireless → OCP request direction — gives fast live updates between 222 polls.
    //   (Part D) OCP → broadcast (src=16, dest=15) — keeps decode correct when the OCP
    //            itself rebroadcasts cat=7 (legacy processChlorinator misreads bytes 7/8 on v3).
    // 13-byte payload layout confirmed via packetLog(2026-04-19_23-14-52).log:
    //   [0]=cat 7, [1]=sub 0, [2]=selector (0 for single chlor on i8PS),
    //   [3]=body (32=shared, 0 observed for "Pool only" — NOT reliable as the active-slot signal),
    //   [4]=type,
    //   [5]=poolSetpoint, [6]=spaSetpoint,
    //   [7]=0, [8]=0,
    //   [9]=superChlorHours,
    //   [10]=slot-active flag (1=provisioned). Stayed 1 through body=32→0 toggle.
    //   [11..12]=cover-closed IntelliChlor outputs per body (Part C / ISSUE-075).
    // superChlor on-flag location on v3 is NOT yet characterised — deferred to Part C.
    // Multi-chlor A168 layout (selector != 0) also not characterised; bench is single-chlor i8PS.
    private static processIntelliCenterV3Chlor168(msg: Inbound) {
        const chlorId = 1;
        const slotActive = msg.extractPayloadByte(10, 0) === 1;
        if (!slotActive) {
            sys.chlorinators.removeItemById(chlorId);
            state.chlorinators.removeItemById(chlorId);
        } else {
            const c = sys.chlorinators.getItemById(chlorId, true);
            const sc = state.chlorinators.getItemById(c.id, true);
            c.isActive = sc.isActive = true;
            c.master = 0;
            c.body = msg.extractPayloadByte(3, c.body || 0);
            c.type = msg.extractPayloadByte(4, c.type);
            if (!c.disabled && !c.isDosing) {
                c.poolSetpoint = msg.extractPayloadByte(5);
                c.spaSetpoint = msg.extractPayloadByte(6);
            }
            c.superChlorHours = msg.extractPayloadByte(9);
            c.address = 80;
            if (typeof c.name === 'undefined' || c.name === '') c.name = `Chlorinator ${chlorId}`;
            sc.body = c.body;
            sc.poolSetpoint = c.poolSetpoint;
            sc.spaSetpoint = c.spaSetpoint;
            sc.type = c.type;
            sc.superChlorHours = c.superChlorHours;
        }
        state.emitEquipmentChanges();
    }
    private static processChlorinator(msg: Inbound) {
        // ISSUE-078 Part D: on IntelliCenter v3.008 the cat=7 sub=0 Action 168 payload is row-
        // major stride-9 (see processIntelliCenterV3Chlor168). The legacy decoder below is
        // column-major stride-4 — its byte offsets for bytes 7/8 misdecode on v3 (clobbering
        // superChlor/superChlorHours). Any v3 A168 cat=7 that reaches here slipped past the
        // dedicated v3 routes above; bail out rather than trash state.
        if (sys.equipment.isIntellicenterV3) {
            msg.isProcessed = true;
            return;
        }
        let isActive = msg.extractPayloadByte(10) > 0;
        let chlorId = msg.extractPayloadByte(2) + 1;
        let cfg = sys.chlorinators.getItemById(chlorId, isActive);
        let s = state.chlorinators.getItemById(chlorId, isActive);
        if (!isActive) {
            sys.chlorinators.removeItemById(chlorId);
            state.chlorinators.removeItemById(chlorId);
            s.emitEquipmentChange();
            msg.isProcessed = true;
            return;
        }
        else {

            cfg.body = msg.extractPayloadByte(3);
            cfg.poolSetpoint = msg.extractPayloadByte(5);
            if (!cfg.disabled) {
                // RKS: We don't want theses setpoints if our chem controller
                // disabled the chlorinator.
                cfg.spaSetpoint = msg.extractPayloadByte(6);
                cfg.superChlor = msg.extractPayloadByte(7) > 0;
            }
            cfg.superChlorHours = msg.extractPayloadByte(8);
            s.poolSetpoint = cfg.poolSetpoint;
            s.spaSetpoint = cfg.spaSetpoint;
            s.superChlorHours = cfg.superChlorHours;
            s.body = cfg.body;

            // ISSUE-075 #4 / ISSUE-080: cover-menu "IntelliChlor Output" (per-body, not per-cover)
            // piggybacks on this same A168 cat=7 packet in bytes 11 (Pool, 0-50) and 12 (Spa, 0-10).
            // Per .plan/v3.008/covers-packet-reference.md §4.2. Assign to whichever cover is
            // currently bound to each body by cat=14 flags bit 3.
            if (msg.payload.length > 12) {
                const poolCoverOutput = msg.extractPayloadByte(11);
                const spaCoverOutput = msg.extractPayloadByte(12);
                const poolBodyId = sys.board.valueMaps.bodies.getValue('pool');
                const spaBodyId = sys.board.valueMaps.bodies.getValue('spa');
                const covers = sys.covers.get();
                for (let i = 0; i < covers.length; i++) {
                    const c: Cover = sys.covers.getItemById(covers[i].id);
                    if (!c || !c.isActive) continue;
                    const sc = state.covers.getItemById(c.id, true);
                    const bodyVal = sys.board.valueMaps.bodies.encode(c.body);
                    if (bodyVal === poolBodyId) {
                        c.chlorOutput = poolCoverOutput;
                        sc.chlorOutput = poolCoverOutput;
                    } else if (bodyVal === spaBodyId) {
                        c.chlorOutput = spaCoverOutput;
                        sc.chlorOutput = spaCoverOutput;
                    }
                }
            }
            msg.isProcessed = true;
        }
        state.emitEquipmentChanges();
    }
    private static processPump(msg: Inbound) {
        let pumpId = msg.extractPayloadByte(2) + 1;
        const useBigEndian = sys.controllerType === ControllerType.IntelliCenter && sys.equipment.isIntellicenterV3;
        const readInt = (ndx: number) => useBigEndian ? msg.extractPayloadIntBE(ndx) : msg.extractPayloadInt(ndx);
        if (msg.extractPayloadByte(1) === 0) {
            let type = msg.extractPayloadByte(3);
            let cpump = sys.pumps.getItemById(pumpId, type > 0);
            let spump = state.pumps.getItemById(pumpId, type > 0);
            cpump.type = type;
            spump.type = type;
            if (cpump.type >= 2) {
                const ptype = sys.board.valueMaps.pumpTypes.transform(cpump.type);
                const hasBodyAssociation = ptype.hasBody === true;
                const circuitStartNdx = hasBodyAssociation ? 19 : 18;
                if (hasBodyAssociation) {
                    const decodedBody = ExternalMessage.decodePumpBodyCode(msg.extractPayloadByte(18));
                    if (typeof decodedBody !== 'undefined') cpump.body = decodedBody;
                }
                cpump.address = ExternalMessage.normalizeIntelliCenterPumpAddress(msg.extractPayloadByte(5));
                cpump.minSpeed = readInt(6);
                cpump.maxSpeed = readInt(8);
                cpump.minFlow = msg.extractPayloadByte(10);
                cpump.maxFlow = msg.extractPayloadByte(11);
                cpump.flowStepSize = msg.extractPayloadByte(12);
                cpump.primingSpeed = readInt(13);
                cpump.speedStepSize = msg.extractPayloadByte(15) * 10;
                cpump.primingTime = msg.extractPayloadByte(16);
                cpump.circuits.clear();
                for (let i = circuitStartNdx; i < msg.payload.length && i <= 25; i++) {
                    let circuitId = msg.extractPayloadByte(i);
                    if (circuitId !== 255) {
                        let circuit = cpump.circuits.getItemById(i - (circuitStartNdx - 1), true);
                        circuit.circuit = circuitId + 1;
                        circuit.units = msg.extractPayloadByte(i + 8);
                    }
                }
            }
            else if (cpump.type === 1) {
                cpump.circuits.clear();
                const bodyAt10 = ExternalMessage.decodePumpBodyCode(msg.extractPayloadByte(10));
                const bodyAt18 = ExternalMessage.decodePumpBodyCode(msg.extractPayloadByte(18));
                const decodedBody = typeof bodyAt10 !== 'undefined' ? bodyAt10 : bodyAt18;
                if (typeof decodedBody !== 'undefined') cpump.body = decodedBody;
            }
            if (cpump.type === 0) {
                sys.pumps.removeItemById(cpump.id);
                state.pumps.removeItemById(cpump.id);
            }
        }
        else if (msg.extractPayloadByte(1) === 1) {
            let cpump = sys.pumps.getItemById(pumpId);
            let spump = state.pumps.getItemById(pumpId);
            cpump.name = msg.extractPayloadString(19, 16);
            spump.name = cpump.name;
            if (cpump.type > 2) {
                for (let i = 3, circuitId = 1; i < msg.payload.length && i <= 18; circuitId++) {
                    let circuit = cpump.circuits.getItemById(circuitId);
                    let sp = readInt(i);
                    if (sp < 450)
                        circuit.flow = sp;
                    else
                        circuit.speed = sp;
                    i += 2;
                }
            }
            spump.emitData('pumpExt', spump.getExtended()); // Do this so clients can delete them.
        }
        msg.isProcessed = true;
    }
    private static processFeature(msg: Inbound) {
        let featureId = msg.extractPayloadByte(2) + sys.board.equipmentIds.features.start;
        let type = msg.extractPayloadByte(3);
        let feature = sys.features.getItemById(featureId, type !== 255);
        let fstate = state.features.getItemById(featureId, type !== 255);
        if (type === 255) {
            feature.isActive = false;
            sys.features.removeItemById(featureId);
            state.features.removeItemById(featureId);
        }
        else {
            feature.freeze = msg.extractPayloadByte(4) > 0;
            fstate.freezeProtect = feature.freeze;
            fstate.name = feature.name = msg.extractPayloadString(9, 16);
            fstate.type = feature.type = type;
            fstate.showInFeatures = feature.showInFeatures = msg.extractPayloadByte(5) > 0;
            let hours = msg.extractPayloadByte(6);
            const isV3 = sys.controllerType === ControllerType.IntelliCenter && sys.equipment.isIntellicenterV3;
            if (isV3 && hours >= 24) {
                feature.dontStop = true;
                feature.eggTimer = 1440;
            } else {
                feature.dontStop = isV3 ? false : msg.extractPayloadByte(8) > 0;
                feature.eggTimer = (hours * 60) + msg.extractPayloadByte(7);
            }
        }
        state.emitEquipmentChanges();
        msg.isProcessed = true;
    }
    private static processCircuit(msg: Inbound) {
        let circuitId = msg.extractPayloadByte(2) + 1;
        let circuit = sys.circuits.getItemById(circuitId, false);
        let cstate = state.circuits.getItemById(circuitId, false);
        circuit.showInFeatures = msg.extractPayloadByte(5) > 0;
        circuit.freeze = msg.extractPayloadByte(4) > 0;
        cstate.freezeProtect = circuit.freeze;
        circuit.name = msg.extractPayloadString(10, 16);
        circuit.type = msg.extractPayloadByte(3);
        let hours = msg.extractPayloadByte(7);
        const isV3 = sys.controllerType === ControllerType.IntelliCenter && sys.equipment.isIntellicenterV3;
        if (isV3 && hours >= 24) {
            circuit.dontStop = true;
            circuit.eggTimer = 1440;
        } else {
            if (isV3) circuit.dontStop = false;
            circuit.eggTimer = (hours * 60) + msg.extractPayloadByte(8);
        }
        cstate.type = circuit.type;
        cstate.showInFeatures = circuit.showInFeatures;
        cstate.name = circuit.name;
        switch (circuit.type) {
            case 5:
            case 6:
            case 8:
                circuit.lightingTheme = msg.extractPayloadByte(6);
                cstate.lightingTheme = circuit.lightingTheme;
                break;
            case 9:
                circuit.level = msg.extractPayloadByte(6);
                cstate.level = circuit.level;
                break;
        }
        state.emitEquipmentChanges();
        msg.isProcessed = true;
    }
    private static processTempSettings(msg: Inbound) {
        let fnTranslateByte = (byte: number) => { return (byte & 0x007F) * (((byte & 0x0080) > 0) ? -1 : 1); }
        const decodeFreezeOverride = (raw: number) => raw <= 3 ? (30 + (raw * 60)) : raw;
        
        // v3.004+: Wireless sends the FULL options block, not a single-field notification.
        // v1.x: Used byte[2] as a pivot/index indicating which field changed, then byte[byte[2]+3] = new value.
        // 
        // IMPORTANT: v3 Action 168 from Wireless has DIFFERENT offsets than Action 30 type 0!
        // - Action 30 type 0:    poolHeatNdx=19, spaHeatNdx=21, poolModeNdx=23, spaModeNdx=24
        // - Action 168 Wireless: poolHeatNdx=20, spaHeatNdx=22, poolModeNdx=24, spaModeNdx=25
        // The Wireless payload has an extra byte at position 4, shifting everything by +1.
        const isIntellicenterV3 = (sys.controllerType === ControllerType.IntelliCenter && sys.equipment.isIntellicenterV3);
        
        // Detect v3 full-block format by payload length (v3 sends 41 bytes for msgType 0)
        if (isIntellicenterV3 && msg.payload.length >= 27) {
            // v3.004+ Wireless full options block - different offsets than Action 30.
            // Most captures use offsets [20..25], but some packets include an extra
            // timestamp-like byte before setpoints, shifting to [21..26].
            const buildCandidate = (shift: number) => ({
                shift,
                poolHeat: msg.extractPayloadByte(20 + shift),
                poolCool: msg.extractPayloadByte(21 + shift),
                spaHeat: msg.extractPayloadByte(22 + shift),
                spaCool: msg.extractPayloadByte(23 + shift),
                poolMode: msg.extractPayloadByte(24 + shift),
                spaMode: msg.extractPayloadByte(25 + shift),
                freezeCycleTime: msg.extractPayloadByte(26 + shift, 255),
                freezeOverrideRaw: msg.extractPayloadByte(27 + shift, 255),
                manualPriority: msg.extractPayloadByte(28 + shift, 255)
            });
            const scoreCandidate = (c: { poolHeat: number, poolCool: number, spaHeat: number, spaCool: number, poolMode: number, spaMode: number }) => {
                let score = 0;
                const isTemp = (v: number) => v > 0 && v <= 120;
                const isMode = (v: number) => v > 0 && v <= 100;
                if (isTemp(c.poolHeat)) score += 3;
                if (isTemp(c.spaHeat)) score += 3;
                if (isTemp(c.poolCool)) score += 2;
                if (isTemp(c.spaCool)) score += 2;
                if (isMode(c.poolMode)) score += 1;
                if (isMode(c.spaMode)) score += 1;
                return score;
            };
            let selected = buildCandidate(0);
            if (msg.payload.length >= 27) {
                const shifted = buildCandidate(1);
                if (scoreCandidate(shifted) > scoreCandidate(selected)) selected = shifted;
            }
            if (selected.shift !== 0) {
                logger.silly(`v3.004+ Action 168: using shifted temp offsets (+${selected.shift})`);
            }
            
            // Update Body 1 (Pool)
            let body = sys.bodies.getItemById(1, sys.equipment.maxBodies > 0);
            let sbody = state.temps.bodies.getItemById(1);
            if (body.isActive) {
                const newPoolHeat = selected.poolHeat;
                const newPoolCool = selected.poolCool;
                const newPoolMode = selected.poolMode;
                logger.silly(`v3.004+ Action 168: Pool setpoint ${body.heatSetpoint} → ${newPoolHeat}, coolSetpoint ${body.coolSetpoint} → ${newPoolCool}, mode ${body.heatMode} → ${newPoolMode}`);
                body.heatSetpoint = newPoolHeat;
                body.coolSetpoint = newPoolCool;
                body.heatMode = newPoolMode;
                sbody.heatSetpoint = body.heatSetpoint;
                sbody.coolSetpoint = body.coolSetpoint;
                sbody.heatMode = body.heatMode;
            }
            
            // Update Body 2 (Spa)
            body = sys.bodies.getItemById(2, sys.equipment.maxBodies > 1);
            sbody = state.temps.bodies.getItemById(2);
            if (body.isActive) {
                const newSpaHeat = selected.spaHeat;
                const newSpaCool = selected.spaCool;
                const newSpaMode = selected.spaMode;
                logger.silly(`v3.004+ Action 168: Spa setpoint ${body.heatSetpoint} → ${newSpaHeat}, coolSetpoint ${body.coolSetpoint} → ${newSpaCool}, mode ${body.heatMode} → ${newSpaMode}`);
                body.heatSetpoint = newSpaHeat;
                body.coolSetpoint = newSpaCool;
                body.heatMode = newSpaMode;
                sbody.heatSetpoint = body.heatSetpoint;
                sbody.coolSetpoint = body.coolSetpoint;
                sbody.heatMode = body.heatMode;
            }
            if (selected.freezeCycleTime !== 255) sys.general.options.freezeCycleTime = selected.freezeCycleTime;
            if (selected.freezeOverrideRaw !== 255) sys.general.options.freezeOverride = decodeFreezeOverride(selected.freezeOverrideRaw);
            if (selected.manualPriority !== 255) sys.general.options.manualPriority = selected.manualPriority > 0;
            const unitsRaw = msg.extractPayloadByte(32 + selected.shift, 255);
            if (unitsRaw === 0 || unitsRaw === 1) {
                const mappedUnits = unitsRaw === 1
                    ? sys.board.valueMaps.tempUnits.getValue('C')
                    : sys.board.valueMaps.tempUnits.getValue('F');
                sys.general.options.units = mappedUnits;
                state.temps.units = mappedUnits;
                const bodyUnits = mappedUnits === sys.board.valueMaps.tempUnits.getValue('C') ? 2 : 1;
                for (let i = 0; i < sys.bodies.length; i++) sys.bodies.getItemByIndex(i).capacityUnits = bodyUnits;
            }
            
            state.emitEquipmentChanges();
            msg.isProcessed = true;
            return;
        }
        
        // v1.x: Single-field-changed notification using byte[2] as pivot index.
        // payLoadIndex = byte(2) + 3 where the first 3 bytes indicate what value changed.
        let body: Body = null;
        switch (msg.extractPayloadByte(2)) {
            case 0: // Water Sensor 2 Adj
                sys.equipment.tempSensors.setCalibration('water2', fnTranslateByte(msg.extractPayloadByte(3)));
                msg.isProcessed = true;
                break;
            case 1: // Water Sensor 1 Adj
                sys.equipment.tempSensors.setCalibration('water1', fnTranslateByte(msg.extractPayloadByte(4)));
                msg.isProcessed = true;
                break;
            case 2: // Solar Sensor 1 Adj
                sys.equipment.tempSensors.setCalibration('solar1', fnTranslateByte(msg.extractPayloadByte(5)));
                msg.isProcessed = true;
                break;
            case 3: // Air Sensor Adj
                sys.equipment.tempSensors.setCalibration('air', fnTranslateByte(msg.extractPayloadByte(6)));
                msg.isProcessed = true;
                break;
            case 4: // Water Sensor 2 Adj
                sys.equipment.tempSensors.setCalibration('water2', fnTranslateByte(msg.extractPayloadByte(7)));
                msg.isProcessed = true;
                break;
            case 5: // Solar Sensor 2 Adj
                sys.equipment.tempSensors.setCalibration('solar2', fnTranslateByte(msg.extractPayloadByte(8)));
                msg.isProcessed = true;
                break;
            case 6: // Water Sensor 3 Adj
                sys.equipment.tempSensors.setCalibration('water3', fnTranslateByte(msg.extractPayloadByte(9)));
                msg.isProcessed = true;
                break;
            case 7: // Solar Sensor 3 Adj
                sys.equipment.tempSensors.setCalibration('solar3', fnTranslateByte(msg.extractPayloadByte(10)));
                msg.isProcessed = true;
                break;
            case 8: // Water Sensor 4 Adj
                sys.equipment.tempSensors.setCalibration('water4', fnTranslateByte(msg.extractPayloadByte(11)));
                msg.isProcessed = true;
                break;
            case 9: // Solar Sensor 4 Adj
                sys.equipment.tempSensors.setCalibration('water4', fnTranslateByte(msg.extractPayloadByte(12)));
                msg.isProcessed = true;
                break;
            case 11: // Clock mode
                sys.general.options.clockMode = (msg.extractPayloadByte(14) & 0x0001) == 1 ? 24 : 12;
                msg.isProcessed = true;
                break;
            case 12: // This is byte 15 but we don't know what it is.  Numbers witnessed include 51, 52, 89, 235.
                break;
            case 14: // Clock source
                if ((msg.extractPayloadByte(17) & 0x0040) === 1)
                    sys.general.options.clockSource = 'internet';
                else if (sys.general.options.clockSource !== 'server')
                    sys.general.options.clockSource = 'manual';
                msg.isProcessed = true;
                break;
            case 15: // This is byte 18 but we don't know what it is.  Numbers witnessed include 1, 2, 3, 5, 100.
                break;
            case 18: // Body 1 Heat Setpoint
                body = sys.bodies.getItemById(1, false);
                body.heatSetpoint = msg.extractPayloadByte(21);
                state.temps.bodies.getItemById(1).heatSetpoint = body.heatSetpoint;
                state.emitEquipmentChanges();
                msg.isProcessed = true;
                break;
            case 19: // Body 1 Cool Setpoint
                body = sys.bodies.getItemById(1, false);
                body.coolSetpoint = msg.extractPayloadByte(22);
                state.temps.bodies.getItemById(1).coolSetpoint = body.coolSetpoint;
                state.emitEquipmentChanges();
                msg.isProcessed = true;
                break;
            case 20: // Body 2 Heat Setpoint
                body = sys.bodies.getItemById(2, false);
                body.heatSetpoint = msg.extractPayloadByte(23);
                state.temps.bodies.getItemById(2).heatSetpoint = body.heatSetpoint;
                state.emitEquipmentChanges();
                msg.isProcessed = true;
                break;
            case 21: // Body 2 Cool Setpoint
                body = sys.bodies.getItemById(2, false);
                body.coolSetpoint = msg.extractPayloadByte(24);
                state.temps.bodies.getItemById(2).coolSetpoint = body.coolSetpoint;
                state.emitEquipmentChanges();
                msg.isProcessed = true;
                break;
            case 22: // Body 1 Heat Mode
                body = sys.bodies.getItemById(1, false);
                body.heatMode = msg.extractPayloadByte(25);
                state.temps.bodies.getItemById(1).heatMode = body.heatMode;
                state.emitEquipmentChanges();
                msg.isProcessed = true;
                break;
            case 23: // Body 2 Heat Mode
                body = sys.bodies.getItemById(2, false);
                body.heatMode = msg.extractPayloadByte(26);
                state.temps.bodies.getItemById(2).heatMode = body.heatMode;
                state.emitEquipmentChanges();
                msg.isProcessed = true;
                break;
            case 24: // Body 3 Heat Mode
                body = sys.bodies.getItemById(3, false);
                body.heatMode = msg.extractPayloadByte(27);
                state.temps.bodies.getItemById(3).heatMode = body.heatMode;
                state.emitEquipmentChanges();
                msg.isProcessed = true;
                break;
            case 25: // Body 4 Heat Mode
                body = sys.bodies.getItemById(4, false);
                body.heatMode = msg.extractPayloadByte(28);
                state.temps.bodies.getItemById(4).heatMode = body.heatMode;
                state.emitEquipmentChanges();
                msg.isProcessed = true;
                break;
            case 27: // Pump Valve Delay
                sys.general.options.pumpDelay = msg.extractPayloadByte(30) !== 0;
                msg.isProcessed = true;
                break;
            case 28: // Cooldown Delay
                sys.general.options.cooldownDelay = msg.extractPayloadByte(31) !== 0;
                msg.isProcessed = true;
                break;
            case 36: // Manual Priority
                sys.general.options.manualPriority = msg.extractPayloadByte(39) !== 0;
                msg.isProcessed = true;
                break;
            case 37: // Manual Heat
                sys.general.options.manualHeat = msg.extractPayloadByte(40) !== 0;
                msg.isProcessed = true;
                break;
            case 64: // Vacation mode
                let yy = msg.extractPayloadByte(5) + 2000;
                let mm = msg.extractPayloadByte(6);
                let dd = msg.extractPayloadByte(7);
                sys.general.options.vacation.startDate = new Date(yy, mm - 1, dd);
                yy = msg.extractPayloadByte(8) + 2000;
                mm = msg.extractPayloadByte(9);
                dd = msg.extractPayloadByte(10);
                sys.general.options.vacation.endDate = new Date(yy, mm - 1, dd);
                sys.general.options.vacation.enabled = msg.extractPayloadByte(3) > 0;
                sys.general.options.vacation.useTimeframe = msg.extractPayloadByte(4) > 0;
                msg.isProcessed = true;
                break;
        }
    }
    public static processTouchChlorinator(msg: Inbound) {
        let isActive = (msg.extractPayloadByte(0) & 0x01) === 1;
        let chlor = sys.chlorinators.getItemById(1, isActive);
        let schlor = state.chlorinators.getItemById(1, isActive);
        chlor.isActive = schlor.isActive = isActive;
        if (isActive) {
            if (!chlor.disabled) {
                // RKS: We don't want these setpoints if our chem controller disabled the
                // chlorinator.  These should be 0 anyway.
                schlor.poolSetpoint = chlor.spaSetpoint = msg.extractPayloadByte(0) >> 1;
                schlor.spaSetpoint = chlor.poolSetpoint = msg.extractPayloadByte(1);
                if (typeof chlor.address === 'undefined') chlor.address = 80; // chlor.id + 79;
                schlor.body = chlor.body = sys.equipment.maxBodies >= 1 || sys.equipment.shared === true ? 32 : 0;
            }
            schlor.superChlor = chlor.superChlor = msg.extractPayloadByte(2) - 128 > 0;
            if (schlor.superChlor) {
                schlor.superChlorRemaining = (msg.extractPayloadByte(2) - 128) * 3600;
            }
            else {
                schlor.superChlorRemaining = 0;
            }
            if (state.temps.bodies.getItemById(1).isOn) schlor.targetOutput = chlor.disabled ? 0 : chlor.poolSetpoint;
            else if (state.temps.bodies.getItemById(2).isOn) schlor.targetOutput = chlor.disabled ? 0 : chlor.spaSetpoint;
        }
        else {
            sys.chlorinators.removeItemById(1);
            state.chlorinators.removeItemById(1);
        }
    }
    public static processTouchSetHeatMode(msg: Inbound) {
        // We get here because some other controller is setting the heat
        // mode.  The OCP will emit an 8 later but it can be very slow
        // in doing this. ScreenLogic also captures this message so it
        // doesn't get behind.
        //[165, 1, 16, 34, 136, 4][86, 100, 3, 0][2, 33]
        //payload: [temp1, temp2, mode2 << 2 | mode1, setPoint],
        let bstate1 = state.temps.bodies.getItemById(1);
        let bstate2 = state.temps.bodies.getItemById(2);
        let body1 = sys.bodies.getItemById(1);
        let body2 = sys.bodies.getItemById(2);
        let mode1 = msg.extractPayloadByte(2) & 0x03;
        let mode2 = (msg.extractPayloadByte(2) & 0x0C) >> 2;
        bstate1.setPoint = body1.heatSetpoint = msg.extractPayloadByte(0);
        bstate1.coolSetpoint = body1.coolSetpoint = msg.extractPayloadByte(3);
        bstate2.setPoint = body2.heatSetpoint = msg.extractPayloadByte(1);
        bstate1.heatMode = body1.heatMode = mode1;
        bstate2.heatMode = body2.heatMode = mode2;
        msg.isProcessed = true;
        state.emitEquipmentChanges();

    }
}