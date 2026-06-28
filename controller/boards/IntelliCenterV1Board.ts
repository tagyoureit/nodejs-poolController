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
import {
    IntelliCenterBoard,
    IntelliCenterSystemCommands,
    IntelliCenterCircuitCommands,
    IntelliCenterFeatureCommands,
    IntelliCenterChlorinatorCommands,
    IntelliCenterPumpCommands,
    IntelliCenterBodyCommands,
    IntelliCenterScheduleCommands,
    IntelliCenterHeaterCommands
} from './IntelliCenterBoard';
import { PoolSystem, ExpansionPanel, ExpansionModuleCollection, sys, LightGroup, LightGroupCircuit, CircuitGroup, ICircuitGroup } from '../Equipment';
import { Outbound, Response } from '../comms/messages/Messages';
import { logger } from '../../logger/Logger';
import { state, ICircuitState, ICircuitGroupState, LightGroupState, CircuitGroupState, ChlorinatorState, BodyTempState } from '../State';
import { utils } from '../../controller/Constants';
import { InvalidOperationError } from '../Errors';
import { EquipmentIdRange } from './SystemBoard';

const INTELLICENTER_MAX_NAME_LENGTH = 15;
const normalizeIntelliCenterName = (name: any, fallback: string = ''): string => {
    const source = typeof name !== 'undefined' ? name : fallback || '';
    return source.toString().substring(0, INTELLICENTER_MAX_NAME_LENGTH);
};

export class IntelliCenterV1Board extends IntelliCenterBoard {
    constructor(system: PoolSystem) {
        super(system);
        this.system = new IntelliCenterV1SystemCommands(this);
        this.circuits = new IntelliCenterV1CircuitCommands(this);
        this.features = new IntelliCenterV1FeatureCommands(this);
        this.chlorinator = new IntelliCenterV1ChlorinatorCommands(this);
        this.bodies = new IntelliCenterV1BodyCommands(this);
        this.pumps = new IntelliCenterV1PumpCommands(this);
        this.schedules = new IntelliCenterV1ScheduleCommands(this);
        this.heaters = new IntelliCenterV1HeaterCommands(this);
    }
    public get commandDestAddress(): number { return 15; }
    public get commandSourceAddress(): number { return 16; }
    protected startAnnounceDeviceInterval(): void { }
    protected startStatePoll(): void { }
    protected async ensureRegisteredAsync(): Promise<void> { }
    protected startRegistrationBootstrapAsync(): void { }
    public applyV3ValueMapOverrides(): void { }
    public processMasterModules(modules: ExpansionModuleCollection, ocpA: number, ocpB: number, inv?) {
        if (typeof inv === 'undefined') inv = { bodies: 0, circuits: 0, valves: 0, shared: false, covers: 0, chlorinators: 0, chemControllers: 0 };
        const hi = (ocpA & 0xF0) >> 4;
        const lo = (ocpA & 0x0F);
        let useV3Order = false;
        if (hi >= 1 && hi <= 7 && (lo === 0 || lo > 7)) useV3Order = true;
        let slot0 = useV3Order ? hi : lo;
        let slot1 = useV3Order ? lo : hi;
        let slot2 = (ocpB & 0xF0) >> 4;
        let slot3 = ocpB & 0xF;
        let mod = modules.getItemById(0, true);
        let mt = this.valueMaps.expansionBoards.transform(slot0);
        mod.name = mt.name;
        mod.desc = mt.desc;
        mod.type = slot0;
        mod.part = mt.part;
        mod.get().bodies = mt.bodies;
        mod.get().circuits = mt.circuits;
        mod.get().valves = mt.valves;
        mod.get().covers = mt.covers;
        mod.get().chlorinators = mt.chlorinators;
        mod.get().chemControllers = mt.chemControllers;
        if (mod.type === 0 || mod.type > 7)
            sys.equipment.model = 'IntelliCenter i5P';
        else
            sys.equipment.model = 'IntelliCenter ' + mod.name;
        state.equipment.model = sys.equipment.model;
        if (typeof mt.bodies !== 'undefined') inv.bodies += mt.bodies;
        if (typeof mt.circuits !== 'undefined') inv.circuits += mt.circuits;
        if (typeof mt.valves !== 'undefined') inv.valves += mt.valves;
        if (typeof mt.covers !== 'undefined') inv.covers += mt.covers;
        if (typeof mt.chlorinators !== 'undefined') inv.chlorinators += mt.chlorinators;
        if (typeof mt.chemControllers !== 'undefined') inv.chemControllers += mt.chemControllers;
        if (typeof mt.single !== 'undefined') inv.single = mt.single;
        if (typeof mt.shared !== 'undefined') inv.shared = mt.shared;
        if (typeof mt.dual !== 'undefined') inv.dual = mt.dual;
        this.processModuleSlot(modules, 1, slot1, inv);
        this.processModuleSlot(modules, 2, slot2, inv);
        this.processModuleSlot(modules, 3, slot3, inv);
    }
    private processModuleSlot(modules: ExpansionModuleCollection, slotId: number, slotVal: number, inv: any) {
        if (slotVal === 0) modules.removeItemById(slotId);
        else {
            let mod = modules.getItemById(slotId, true);
            let mt = this.valueMaps.expansionBoards.transform(slotVal);
            mod.name = mt.name;
            mod.desc = mt.desc;
            mod.type = slotVal;
            mod.part = mt.part;
            mod.get().bodies = mt.bodies;
            mod.get().circuits = mt.circuits;
            mod.get().valves = mt.valves;
            mod.get().covers = mt.covers;
            mod.get().chlorinators = mt.chlorinators;
            mod.get().chemControllers = mt.chemControllers;
            if (typeof mt.bodies !== 'undefined') inv.bodies += mt.bodies;
            if (typeof mt.circuits !== 'undefined') inv.circuits += mt.circuits;
            if (typeof mt.valves !== 'undefined') inv.valves += mt.valves;
            if (typeof mt.covers !== 'undefined') inv.covers += mt.covers;
            if (typeof mt.chlorinators !== 'undefined') inv.chlorinators += mt.chlorinators;
            if (typeof mt.chemControllers !== 'undefined') inv.chemControllers += mt.chemControllers;
        }
    }
    public processExpansionModules(panel: ExpansionPanel, ocpA: number, ocpB: number, inv?) {
        let modules = panel.modules;
        if (typeof inv === 'undefined') inv = { bodies: 0, circuits: 0, valves: 0, shared: false, covers: 0, chlorinators: 0, chemControllers: 0 };
        const hi = (ocpA & 0xF0) >> 4;
        const lo = (ocpA & 0x0F);
        let useV3Order = false;
        if (hi >= 3 && hi <= 7 && (lo === 0 || lo > 7)) useV3Order = true;
        let slot0 = useV3Order ? hi : lo;
        let slot1 = useV3Order ? lo : hi;
        let slot2 = (ocpB & 0xF0) >> 4;
        let slot3 = ocpB & 0xF;
        if (slot0 <= 2) {
            modules.removeItemById(0);
            panel.isActive = false;
        }
        else {
            let mod = modules.getItemById(0, true);
            let mt = slot0 === 6 ? this.valueMaps.expansionBoards.transform(slot0) : this.valueMaps.expansionBoards.transform(255);
            panel.isActive = true;
            mod.name = mt.name;
            mod.desc = mt.desc;
            mod.type = slot0;
            mod.part = mt.part;
            mod.get().bodies = mt.bodies;
            mod.get().circuits = mt.circuits;
            mod.get().valves = mt.valves;
            mod.get().covers = mt.covers;
            mod.get().chlorinators = mt.chlorinators;
            mod.get().chemControllers = mt.chemControllers;
            if (typeof mt.bodies !== 'undefined') inv.bodies += mt.bodies;
            if (typeof mt.circuits !== 'undefined') inv.circuits += mt.circuits;
            if (typeof mt.valves !== 'undefined') inv.valves += mt.valves;
            if (typeof mt.covers !== 'undefined') inv.covers += mt.covers;
            if (typeof mt.chlorinators !== 'undefined') inv.chlorinators += mt.chlorinators;
            if (typeof mt.chemControllers !== 'undefined') inv.chemControllers += mt.chemControllers;
        }
        this.processExpansionSlot(modules, 1, slot1, inv);
        this.processExpansionSlot(modules, 2, slot2, inv);
        this.processExpansionSlot(modules, 3, slot3, inv);
    }
    private processExpansionSlot(modules: any, slotId: number, slotVal: number, inv: any) {
        if (slotVal === 0) modules.removeItemById(slotId);
        else {
            let mod = modules.getItemById(slotId, true);
            let mt = this.valueMaps.expansionBoards.transform(slotVal);
            mod.name = mt.name;
            mod.desc = mt.desc;
            mod.type = slotVal;
            mod.part = mt.part;
            mod.get().bodies = mt.bodies;
            mod.get().circuits = mt.circuits;
            mod.get().valves = mt.valves;
            mod.get().covers = mt.covers;
            mod.get().chlorinators = mt.chlorinators;
            mod.get().chemControllers = mt.chemControllers;
            if (typeof mt.bodies !== 'undefined') inv.bodies += mt.bodies;
            if (typeof mt.circuits !== 'undefined') inv.circuits += mt.circuits;
            if (typeof mt.valves !== 'undefined') inv.valves += mt.valves;
            if (typeof mt.covers !== 'undefined') inv.covers += mt.covers;
            if (typeof mt.chlorinators !== 'undefined') inv.chlorinators += mt.chlorinators;
            if (typeof mt.chemControllers !== 'undefined') inv.chemControllers += mt.chemControllers;
        }
    }
    protected async requestVersionsAsync(dest: number): Promise<void> {
        const verReq = Outbound.create({
            source: 16,
            dest,
            action: 228,
            payload: [0],
            retries: 3,
            response: Response.create({ action: 164 })
        });
        await verReq.sendAsync();
    }
}
class IntelliCenterV1SystemCommands extends IntelliCenterSystemCommands {
    public async cancelDelay(): Promise<any> {
        state.delay = sys.board.valueMaps.delay.getValue('nodelay');
        return state.data.delay;
    }
    protected buildOptionsPayload(obj?: any): number[] {
        const fnToByte = (IntelliCenterSystemCommands as any).fnToByte;
        return [0, 0, 0,
            fnToByte(sys.equipment.tempSensors.getCalibration('water2')),
            fnToByte(sys.equipment.tempSensors.getCalibration('water1')),
            fnToByte(sys.equipment.tempSensors.getCalibration('solar1')),
            fnToByte(sys.equipment.tempSensors.getCalibration('air')),
            fnToByte(0),
            fnToByte(sys.equipment.tempSensors.getCalibration('solar2')),
            fnToByte(sys.equipment.tempSensors.getCalibration('solar3')),
            fnToByte(sys.equipment.tempSensors.getCalibration('solar4')),
            fnToByte(sys.equipment.tempSensors.getCalibration('water3')),
            fnToByte(sys.equipment.tempSensors.getCalibration('water4')), 0,
            0x10 | (sys.general.options.clockMode === 24 ? 0x40 : 0x00) | (sys.general.options.adjustDST ? 0x80 : 0x00) | (sys.general.options.clockSource === 'internet' ? 0x20 : 0x00),
            0, 0,
            sys.general.options.clockSource === 'internet' ? 1 : 0,
            3, 0, 0,
            sys.bodies.getItemById(1, false).setPoint || 100,
            sys.bodies.getItemById(3, false).setPoint || 100,
            sys.bodies.getItemById(2, false).setPoint || 100,
            sys.bodies.getItemById(4, false).setPoint || 100,
            sys.bodies.getItemById(1, false).heatMode || 0,
            sys.bodies.getItemById(2, false).heatMode || 0,
            sys.bodies.getItemById(3, false).heatMode || 0,
            sys.bodies.getItemById(4, false).heatMode || 0,
            15,
            sys.general.options.pumpDelay ? 1 : 0,
            sys.general.options.cooldownDelay ? 1 : 0,
            0, 0, 100, 0, 0, 0, 0,
            sys.general.options.manualPriority ? 1 : 0,
            sys.general.options.manualHeat ? 1 : 0
        ];
    }
    protected async setClockOptionsAsync(obj: any, payload: number[]): Promise<void> {
        if ((typeof obj.clockMode !== 'undefined' && obj.clockMode !== sys.general.options.clockMode) ||
            (typeof obj.adjustDST !== 'undefined' && obj.adjustDST !== sys.general.options.adjustDST)) {
            const effectiveClockSource = (typeof obj.clockSource === 'string') ? obj.clockSource : sys.general.options.clockSource;
            let byte = 0x10 | (effectiveClockSource === 'internet' ? 0x20 : 0x00);
            if (typeof obj.clockMode === 'undefined') byte |= sys.general.options.clockMode === 24 ? 0x40 : 0x00;
            else byte |= obj.clockMode === 24 ? 0x40 : 0x00;
            if (typeof obj.adjustDST === 'undefined') byte |= sys.general.options.adjustDST ? 0x80 : 0x00;
            else byte |= obj.adjustDST ? 0x80 : 0x00;
            payload[2] = 11;
            payload[14] = byte;
            let out = Outbound.create({
                action: 168,
                retries: 5,
                response: IntelliCenterBoard.getAckResponse(168),
                payload: payload
            });
            await out.sendAsync();
            if (typeof obj.clockMode !== 'undefined') sys.general.options.clockMode = obj.clockMode === 24 ? 24 : 12;
            if (typeof obj.adjustDST !== 'undefined') sys.general.options.adjustDST = obj.adjustDST ? true : false;
        }
        if (typeof obj.clockSource != 'undefined' && obj.clockSource !== sys.general.options.clockSource) {
            payload[2] = 11;
            payload[17] = obj.clockSource === 'internet' ? 0x01 : 0x00;
            let out = Outbound.create({
                action: 168,
                retries: 5,
                payload: payload,
                response: IntelliCenterBoard.getAckResponse(168)
            });
            await out.sendAsync();
            if (obj.clockSource === 'internet' || obj.clockSource === 'server' || obj.clockSource === 'manual')
                sys.general.options.clockSource = obj.clockSource;
            sys.board.system.setTZ();
        }
    }
    protected async setUnitsOptionsAsync(obj: any, payload: number[]): Promise<void> {
        if (typeof obj.units === 'undefined') return;
        const requestedUnits = sys.board.valueMaps.tempUnits.encode(obj.units);
        if (isNaN(requestedUnits) || requestedUnits === sys.general.options.units) return;
        const unitsByte = requestedUnits === sys.board.valueMaps.tempUnits.getValue('C') ? 1 : 0;
        payload[2] = 29;
        payload[31] = unitsByte;
        let out = Outbound.create({
            action: 168,
            retries: 5,
            payload: payload,
            response: IntelliCenterBoard.getAckResponse(168)
        });
        await out.sendAsync();
        sys.general.options.units = requestedUnits;
        state.temps.units = requestedUnits;
        const bodyUnits = requestedUnits === sys.board.valueMaps.tempUnits.getValue('C') ? 2 : 1;
        for (let i = 0; i < sys.bodies.length; i++) sys.bodies.getItemByIndex(i).capacityUnits = bodyUnits;
        state.emitEquipmentChanges();
    }
    protected async setDelayOptionsAsync(obj: any, payload: number[]): Promise<void> {
        return;
    }
    protected async setPumpDelayAsync(obj: any, payload: number[]): Promise<void> {
        if (typeof obj.pumpDelay === 'undefined' || obj.pumpDelay === sys.general.options.pumpDelay) return;
        payload[2] = 27;
        payload[30] = obj.pumpDelay ? 0x01 : 0x00;
        let out = Outbound.create({
            action: 168,
            retries: 5,
            response: IntelliCenterBoard.getAckResponse(168),
            payload: payload
        });
        await out.sendAsync();
        sys.general.options.pumpDelay = obj.pumpDelay ? true : false;
    }
    protected async setCooldownDelayAsync(obj: any, payload: number[]): Promise<void> {
        if (typeof obj.cooldownDelay === 'undefined' || obj.cooldownDelay === sys.general.options.cooldownDelay) return;
        payload[2] = 28;
        payload[31] = obj.cooldownDelay ? 0x01 : 0x00;
        let out = Outbound.create({
            action: 168,
            retries: 5,
            payload: payload,
            response: IntelliCenterBoard.getAckResponse(168)
        });
        await out.sendAsync();
        sys.general.options.cooldownDelay = obj.cooldownDelay ? true : false;
    }
    protected async setManualPriorityAsync(obj: any, payload: number[]): Promise<void> {
        if (typeof obj.manualPriority === 'undefined' || obj.manualPriority === sys.general.options.manualPriority) return;
        payload[2] = 36;
        payload[39] = obj.manualPriority ? 0x01 : 0x00;
        let out = Outbound.create({
            action: 168,
            retries: 5,
            payload: payload,
            response: IntelliCenterBoard.getAckResponse(168)
        });
        await out.sendAsync();
        sys.general.options.manualPriority = obj.manualPriority ? true : false;
    }
    protected async setManualHeatAsync(obj: any, payload: number[]): Promise<void> {
        if (typeof obj.manualHeat === 'undefined' || obj.manualHeat === sys.general.options.manualHeat) return;
        payload[2] = 37;
        payload[40] = obj.manualHeat ? 0x01 : 0x00;
        let out = Outbound.create({
            action: 168,
            retries: 5,
            payload: payload,
            response: IntelliCenterBoard.getAckResponse(168)
        });
        await out.sendAsync();
        sys.general.options.manualHeat = obj.manualHeat ? true : false;
    }
}
class IntelliCenterV1CircuitCommands extends IntelliCenterCircuitCommands {
    protected async getConfigAsync(payload: number[]): Promise<boolean> {
        let out = Outbound.create({
            dest: 15,
            action: 222,
            retries: 3,
            payload: payload,
            response: Response.create({ dest: -1, action: 30, payload: payload })
        });
        await out.sendAsync();
        return true;
    }
    public async setCircuitStateAsync(id: number, val: boolean, ignoreDelays?: boolean): Promise<ICircuitState> {
        if (sys.board.equipmentIds.features.isInRange(id)) {
            return await sys.board.circuits.setCircuitStateAsync(id, val);
        }
        if (sys.board.equipmentIds.circuitGroups.isInRange(id)) {
            return await sys.board.circuits.setCircuitStateAsync(id, val);
        }
        let c = sys.circuits.getInterfaceById(id);
        if (c.master !== 0) return await super.setCircuitStateAsync(id, val);
        this.addPendingState(id, val);
        try {
            let out = this.createCircuitStateMessage(id, val);
            out.setPayloadByte(34, 1);
            out.source = 16;
            out.scope = `circuitState${id}`;
            out.retries = 5;
            out.response = IntelliCenterBoard.getAckResponse(168);
            await out.sendAsync();
            let b = await this.getConfigAsync([15, 0]);
            let circ = state.circuits.getInterfaceById(id);
            state.emitEquipmentChanges();
            return circ;
        }
        catch (err) { return Promise.reject(err); }
        finally {
            this.clearPendingState(id);
        }
    }
    public async setCircuitGroupStateAsync(id: number, val: boolean): Promise<ICircuitGroupState> {
        let grp = sys.circuitGroups.getItemById(id, false, { isActive: false });
        let gstate = (grp.dataName === 'circuitGroupConfig') ? state.circuitGroups.getItemById(grp.id, grp.isActive !== false) : state.lightGroups.getItemById(grp.id, grp.isActive !== false);
        let isLightGroup = grp.dataName === 'lightGroupConfig';
        if (isLightGroup && val) {
            let nop = sys.board.valueMaps.circuitActions.getValue('settheme');
            (gstate as LightGroupState).action = nop;
            gstate.emitEquipmentChange();
        }
        try {
            await sys.board.circuits.setCircuitStateAsync(id, val);
            if (isLightGroup && val) {
                setTimeout(() => {
                    (gstate as LightGroupState).action = 0;
                    gstate.emitEquipmentChange();
                }, 15000);
            }
            return state.circuitGroups.getInterfaceById(id);
        }
        catch (err) { return Promise.reject(err); }
    }
    public async runLightGroupCommandAsync(obj: any): Promise<ICircuitState> {
        try {
            let id = parseInt(obj.id, 10);
            let cmd = typeof obj.command !== 'undefined' ? sys.board.valueMaps.lightGroupCommands.findItem(obj.command) : { val: 0, name: 'undefined' };
            if (cmd.val === 0) return Promise.reject(new InvalidOperationError(`Light group command ${cmd.name} does not exist`, 'runLightGroupCommandAsync'));
            if (isNaN(id)) return Promise.reject(new InvalidOperationError(`Light group ${id} does not exist`, 'runLightGroupCommandAsync'));
            let grp = sys.lightGroups.getItemById(id);
            let sgrp = state.lightGroups.getItemById(grp.id);
            let nop = sys.board.valueMaps.circuitActions.getValue(cmd.name);
            sgrp.action = nop;
            sgrp.emitEquipmentChange();
            switch (cmd.name) {
                case 'colorset':
                    await this.sequenceLightGroupAsync(id, 'colorset');
                    break;
                case 'colorswim':
                    await this.sequenceLightGroupAsync(id, 'colorswim');
                    break;
                case 'colorhold':
                    await this.setLightGroupThemeAsync(id, 12);
                    break;
                case 'colorrecall':
                    await this.setLightGroupThemeAsync(id, 13);
                    break;
                case 'lightthumper':
                    break;
            }
            sgrp.action = 0;
            sgrp.emitEquipmentChange();
            return sgrp;
        }
        catch (err) { return Promise.reject(`Error runLightGroupCommandAsync ${err.message}`); }
    }
    public async setCircuitGroupAsync(obj: any): Promise<CircuitGroup> {
        let group: CircuitGroup = null;
        let sgroup: CircuitGroupState = null;
        let id = typeof obj.id !== 'undefined' ? parseInt(obj.id, 10) : -1;
        if (id <= 0) {
            let range = sys.board.equipmentIds.circuitGroups;
            for (let i = range.start; i <= range.end; i++) {
                if (!sys.circuitGroups.find(elem => elem.id === i) && !sys.lightGroups.find(elem => elem.id === i)) {
                    id = i;
                    break;
                }
            }
            group = sys.circuitGroups.getItemById(id, true);
        }
        else group = sys.circuitGroups.getItemById(id, false);
        if (typeof id === 'undefined') return Promise.reject(new Error(`Max circuit group ids exceeded`));
        if (isNaN(id) || !sys.board.equipmentIds.circuitGroups.isInRange(id)) return Promise.reject(new Error(`Invalid circuit group id: ${obj.id}`));
        try {
            sgroup = state.circuitGroups.getItemById(id, true);
            let eggTimer = (typeof obj.eggTimer !== 'undefined') ? parseInt(obj.eggTimer, 10) : group.eggTimer;
            if (isNaN(eggTimer)) eggTimer = 720;
            eggTimer = Math.max(Math.min(1440, eggTimer), 1);
            if (obj.dontStop === true) eggTimer = 1440;
            let eggHours = Math.floor(eggTimer / 60);
            let eggMins = eggTimer - (eggHours * 60);
            obj.dontStop = (eggTimer === 1440);
            let out = Outbound.create({
                action: 168,
                payload: [6, 0, id - sys.board.equipmentIds.circuitGroups.start, 2, 0, 0],
                response: IntelliCenterBoard.getAckResponse(168),
                retries: 5
            });
            if (typeof obj.circuits === 'undefined')
                for (let i = 0; i < 16; i++) {
                    let c = group.circuits.getItemByIndex(i, false);
                    out.payload.push(c.circuit ? c.circuit - 1 : 255);
                }
            else {
                for (let i = 0; i < 16; i++)
                    (i < obj.circuits.length) ? out.payload.push(obj.circuits[i].circuit - 1) : out.payload.push(255);
            }
            for (let i = 0; i < 16; i++) out.payload.push(0);
            out.payload.push(eggHours);
            out.payload.push(eggMins);
            await out.sendAsync();
            group.eggTimer = eggTimer;
            group.dontStop = obj.dontStop;
            sgroup.type = group.type = 2;
            sgroup.isActive = group.isActive = true;
            if (typeof obj.showInFeatures !== 'undefined') group.showInFeatures = utils.makeBool(obj.showInFeatures);
            (sgroup as any).showInFeatures = group.showInFeatures;
            if (typeof obj.circuits !== 'undefined') {
                for (let i = 0; i < obj.circuits.length; i++) {
                    let c = group.circuits.getItemByIndex(i, true);
                    c.id = i + 1;
                    c.circuit = obj.circuits[i].circuit;
                }
                for (let i = obj.circuits.length; i < group.circuits.length; i++)
                    group.circuits.removeItemByIndex(i);
            }
            out = Outbound.create({
                action: 168,
                payload: [6, 1, id - sys.board.equipmentIds.circuitGroups.start],
                response: IntelliCenterBoard.getAckResponse(168),
                retries: 3
            });
            for (let i = 0; i < 16; i++) out.payload.push(255);
            const groupName = normalizeIntelliCenterName(obj.name, group.name);
            out.appendPayloadString(groupName, 16);
            await out.sendAsync();
            if (typeof obj.name !== 'undefined') sgroup.name = group.name = groupName;
            out = Outbound.create({
                action: 168,
                payload: [6, 2, id - sys.board.equipmentIds.circuitGroups.start],
                response: IntelliCenterBoard.getAckResponse(168),
                retries: 3
            });
            for (let i = 0; i < 16; i++) out.payload.push(0);
            if (typeof obj.circuits === 'undefined')
                for (let i = 0; i < 16; i++) {
                    let c = group.circuits.getItemByIndex(i, false);
                    typeof c.desiredState !== 'undefined' ? out.payload.push(c.desiredState) : out.payload.push(255);
                }
            else {
                for (let i = 0; i < 16; i++)
                    (i < obj.circuits.length) ? out.payload.push(obj.circuits[i].desiredState || 1) : out.payload.push(255);
            }
            await out.sendAsync();
            if (typeof obj.circuits !== 'undefined') {
                for (let i = 0; i < obj.circuits.length; i++) {
                    let c = group.circuits.getItemByIndex(i);
                    c.desiredState = obj.circuits[i].desiredState || 1;
                }
            }
            return group;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setLightGroupAsync(obj: any): Promise<LightGroup> {
        let group: LightGroup = null;
        let sgroup: LightGroupState = null;
        let id = typeof obj.id !== 'undefined' ? parseInt(obj.id, 10) : -1;
        if (id <= 0) {
            let range = sys.board.equipmentIds.circuitGroups;
            for (let i = range.start; i <= range.end; i++) {
                if (!sys.lightGroups.find(elem => elem.id === i) && !sys.circuitGroups.find(elem => elem.id === i)) {
                    id = i;
                    break;
                }
            }
            group = sys.lightGroups.getItemById(id, true);
        }
        else group = sys.lightGroups.getItemById(id, false);
        if (typeof id === 'undefined') return Promise.reject(new Error(`Max light group ids exceeded`));
        if (isNaN(id) || !sys.board.equipmentIds.circuitGroups.isInRange(id)) return Promise.reject(new Error(`Invalid light group id: ${obj.id}`));
        try {
            let eggTimer = (typeof obj.eggTimer !== 'undefined') ? parseInt(obj.eggTimer, 10) : group.eggTimer;
            if (isNaN(eggTimer)) eggTimer = 720;
            eggTimer = Math.max(Math.min(1440, eggTimer), 1);
            if (obj.dontStop === true) eggTimer = 1440;
            let eggHours = Math.floor(eggTimer / 60);
            let eggMins = eggTimer - (eggHours * 60);
            obj.dontStop = (eggTimer === 1440);
            sgroup = state.lightGroups.getItemById(id, true);
            let theme = typeof obj.lightingTheme === 'undefined' ? group.lightingTheme || 0 : obj.lightingTheme;
            let out = Outbound.create({
                action: 168,
                payload: [6, 0, id - sys.board.equipmentIds.circuitGroups.start, 1, (theme << 2) + 1, 0],
                response: IntelliCenterBoard.getAckResponse(168),
                retries: 5
            });
            if (typeof obj.circuits === 'undefined') {
                for (let i = 0; i < 16; i++) {
                    let c = group.circuits.getItemByIndex(i, false);
                    out.payload.push(c.circuit ? c.circuit - 1 : 255);
                }
                for (let i = 0; i < 16; i++) {
                    let c = group.circuits.getItemByIndex(i, false);
                    out.payload.push(c.circuit ? c.swimDelay : 255);
                }
            }
            else {
                for (let i = 0; i < 16; i++) {
                    if (i < obj.circuits.length) {
                        let c = parseInt(obj.circuits[i].circuit, 10);
                        out.payload.push(!isNaN(c) ? c - 1 : 255);
                    }
                    else out.payload.push(255);
                }
                for (let i = 0; i < 16; i++) {
                    if (i < obj.circuits.length) {
                        let delay = parseInt(obj.circuits[i].swimDelay, 10);
                        out.payload.push(!isNaN(delay) ? delay : 10);
                    }
                    else out.payload.push(0);
                }
            }
            out.payload.push(eggHours);
            out.payload.push(eggMins);
            await out.sendAsync();
            group.eggTimer = eggTimer;
            group.dontStop = obj.dontStop;
            sgroup.type = group.type = 1;
            sgroup.isActive = group.isActive = true;
            group.lightingTheme = theme;
            sgroup.lightingTheme = theme;
            if (typeof obj.showInFeatures !== 'undefined') group.showInFeatures = utils.makeBool(obj.showInFeatures);
            (sgroup as any).showInFeatures = group.showInFeatures;
            return group;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async toggleCircuitStateAsync(id: number): Promise<ICircuitState> {
        let circ = state.circuits.getInterfaceById(id);
        return sys.board.circuits.setCircuitStateAsync(id, !circ.isOn);
    }
}
class IntelliCenterV1FeatureCommands extends IntelliCenterFeatureCommands {
    protected async getConfigAsync(payload: number[]): Promise<boolean> {
        let out = Outbound.create({
            dest: 15,
            action: 222,
            retries: 3,
            payload: payload,
            response: Response.create({ dest: -1, action: 30, payload: payload })
        });
        await out.sendAsync();
        return true;
    }
    public async setFeatureStateAsync(id: number, val: boolean, ignoreDelays?: boolean): Promise<ICircuitState> {
        return sys.board.circuits.setCircuitStateAsync(id, val);
    }
}
class IntelliCenterV1ChlorinatorCommands extends IntelliCenterChlorinatorCommands {
    public async setChlorAsync(obj: any): Promise<ChlorinatorState> {
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) return Promise.reject(new Error(`Invalid chlorinator id: ${obj.id}`));
        let chlor = sys.chlorinators.getItemById(id, id <= 0);
        if (chlor.master === 1) return await super.setChlorAsync(obj);
        let name = typeof obj.name !== 'undefined' ? obj.name : chlor.name;
        let superChlorHours = typeof obj.superChlorHours !== 'undefined' ? parseInt(obj.superChlorHours, 10) : chlor.superChlorHours;
        let isDosing = typeof obj.isDosing !== 'undefined' ? utils.makeBool(obj.isDosing) : chlor.isDosing;
        let disabled = typeof obj.disabled !== 'undefined' ? utils.makeBool(obj.disabled) : chlor.disabled === true;
        let superChlorinate = typeof obj.superChlorinate !== 'undefined' ? utils.makeBool(obj.superChlorinate) : undefined;
        let isAdd = chlor.id <= 0;
        let poolSetpoint = typeof obj.poolSetpoint !== 'undefined' ? parseInt(obj.poolSetpoint, 10) : chlor.poolSetpoint;
        let spaSetpoint = typeof obj.spaSetpoint !== 'undefined' ? parseInt(obj.spaSetpoint, 10) : chlor.spaSetpoint;
        let saltTarget = typeof obj.saltTarget === 'number' ? parseInt(obj.saltTarget, 10) : chlor.saltTarget;
        let model = typeof obj.model !== 'undefined' ? sys.board.valueMaps.chlorinatorModel.encode(obj.model) : chlor.model || 0;
        let chlorType = typeof obj.type !== 'undefined' ? sys.board.valueMaps.chlorinatorType.encode(obj.type) : chlor.type || 0;
        if (isAdd) {
            if (isNaN(poolSetpoint)) poolSetpoint = 50;
            if (isNaN(spaSetpoint)) spaSetpoint = 10;
            if (isNaN(superChlorHours)) superChlorHours = 8;
            if (typeof superChlorinate === 'undefined') superChlorinate = false;
        }
        else {
            if (isNaN(poolSetpoint)) poolSetpoint = chlor.poolSetpoint || 0;
            if (isNaN(spaSetpoint)) spaSetpoint = chlor.spaSetpoint || 0;
            if (isNaN(superChlorHours)) superChlorHours = chlor.superChlorHours;
            if (typeof superChlorinate === 'undefined') superChlorinate = utils.makeBool(chlor.superChlor);
        }
        if (typeof obj.disabled !== 'undefined') chlor.disabled = utils.makeBool(obj.disabled);
        if (typeof chlor.body === 'undefined') chlor.body = obj.body || 32;
        let body = sys.board.bodies.mapBodyAssociation(typeof obj.body === 'undefined' ? chlor.body || 0 : obj.body);
        if (typeof body === 'undefined') return Promise.reject(new Error(`Chlorinator body association is not valid: ${chlor.body}`));
        if (poolSetpoint > 100 || poolSetpoint < 0) return Promise.reject(new Error(`Chlorinator poolSetpoint is out of range: ${chlor.poolSetpoint}`));
        if (spaSetpoint > 100 || spaSetpoint < 0) return Promise.reject(new Error(`Chlorinator spaSetpoint is out of range: ${chlor.spaSetpoint}`));
        let portId = typeof obj.portId !== 'undefined' ? parseInt(obj.portId, 10) : chlor.portId;
        if (typeof obj.ignoreSaltReading !== 'undefined') chlor.ignoreSaltReading = utils.makeBool(obj.ignoreSaltReading);
        let out = Outbound.create({
            action: 168,
            payload: [7, 0, id - 1, body.val, 1,
                disabled ? 0 : isDosing ? 100 : poolSetpoint,
                disabled ? 0 : isDosing ? 100 : spaSetpoint,
                superChlorinate ? 1 : 0, superChlorHours, 0, 1],
            response: IntelliCenterBoard.getAckResponse(168),
            retries: 5
        });
        await out.sendAsync();
        let schlor = state.chlorinators.getItemById(id, true);
        let cchlor = sys.chlorinators.getItemById(id, true);
        chlor.master = 0;
        schlor.body = chlor.body = body.val;
        chlor.disabled = disabled;
        schlor.model = chlor.model = model;
        schlor.type = chlor.type = chlorType;
        chlor.name = schlor.name = name;
        chlor.isDosing = isDosing;
        chlor.saltTarget = saltTarget;
        schlor.isActive = cchlor.isActive = true;
        schlor.poolSetpoint = cchlor.poolSetpoint = poolSetpoint;
        schlor.spaSetpoint = cchlor.spaSetpoint = spaSetpoint;
        schlor.superChlorHours = cchlor.superChlorHours = superChlorHours;
        schlor.superChlor = cchlor.superChlor = superChlorinate;
        state.emitEquipmentChanges();
        return schlor;
    }
}
class IntelliCenterV1PumpCommands extends IntelliCenterPumpCommands {
    public async setPumpAsync(data: any): Promise<any> {
        let id = (typeof data.id === 'undefined' || data.id <= 0) ? sys.pumps.getNextEquipmentId(sys.board.equipmentIds.pumps) : parseInt(data.id, 10);
        if (isNaN(id)) return Promise.reject(new Error(`Invalid pump id: ${data.id}`));
        let pump = sys.pumps.getItemById(id, false);
        if (data.master > 0 || pump.master > 0) return await super.setPumpAsync(data);
        if (isNaN(id)) return Promise.reject(new Error(`Invalid pump id: ${data.id}`));
        else if (id > sys.equipment.maxPumps) return Promise.reject(new Error(`Pump id out of range: ${id}`));
        let ntype = (typeof data.type === 'undefined' || isNaN(parseInt(data.type, 10))) ? pump.type : parseInt(data.type, 10);
        if (isNaN(ntype) || ntype <= 0) return Promise.reject(new Error(`Invalid pump type: ${data.id} - ${data.type}`));
        let type = sys.board.valueMaps.pumpTypes.transform(ntype);
        if (typeof type.name === 'undefined') return Promise.reject(new Error(`Invalid pump type: ${data.id} - ${ntype}`));
        let outc = Outbound.create({ dest: 15, action: 168, payload: [4, 0, id - 1, ntype, 0] });
        const normalizeNumber = (value: any): number | undefined => {
            const parsed = parseInt(value, 10);
            return isNaN(parsed) ? undefined : parsed;
        };
        const pickNumber = (...candidates: any[]): number | undefined => {
            for (const candidate of candidates) {
                const parsed = normalizeNumber(candidate);
                if (typeof parsed !== 'undefined') return parsed;
            }
            return undefined;
        };
        const toIntelliCenterAddress = (address: number | undefined): number | undefined => {
            if (typeof address === 'undefined') return undefined;
            if (address > 0 && address <= 16) return address + 95;
            return address;
        };
        const resolvedAddress = toIntelliCenterAddress(pickNumber(data.address, pump.address, id + 95));
        const resolvedMinSpeed = pickNumber(data.minSpeed, pump.minSpeed, type.minSpeed, 450);
        const resolvedMaxSpeed = pickNumber(data.maxSpeed, pump.maxSpeed, type.maxSpeed, 3450);
        const resolvedMinFlow = pickNumber(data.minFlow, pump.minFlow, type.minFlow, 0);
        const resolvedMaxFlow = pickNumber(data.maxFlow, pump.maxFlow, type.maxFlow, 130);
        const resolvedFlowStepSize = pickNumber(data.flowStepSize, pump.flowStepSize, type.flowStepSize, 1);
        const resolvedPrimingSpeed = pickNumber(data.primingSpeed, pump.primingSpeed, type.primingSpeed, 2500);
        const resolvedSpeedStepSize = pickNumber(data.speedStepSize, pump.speedStepSize, type.speedStepSize, 10);
        const resolvedPrimingTime = pickNumber(data.primingTime, pump.primingTime, type.maxPrimingTime, 0);
        outc.appendPayloadByte(resolvedAddress, id + 95);
        outc.appendPayloadInt(resolvedMinSpeed, 450);
        outc.appendPayloadInt(resolvedMaxSpeed, 3450);
        outc.appendPayloadByte(resolvedMinFlow, 0);
        outc.appendPayloadByte(resolvedMaxFlow, 130);
        outc.appendPayloadByte(resolvedFlowStepSize, 1);
        outc.appendPayloadInt(resolvedPrimingSpeed, 2500);
        outc.appendPayloadByte(Math.max(1, Math.floor((resolvedSpeedStepSize || 10) / 10)), 1);
        outc.appendPayloadByte(resolvedPrimingTime, 0);
        outc.appendPayloadByte(255);
        outc.appendPayloadBytes(255, 8);
        for (let i = 0; i < 8; i++) outc.appendPayloadByte(0);
        let outn = Outbound.create({ dest: 15, action: 168, payload: [4, 1, id - 1] });
        outn.appendPayloadBytes(0, 16);
        let pumpName = normalizeIntelliCenterName(data.name, pump.name || `Pump ${id}`);
        outn.appendPayloadString(pumpName, 16);
        try {
            outc.retries = 5;
            outc.response = IntelliCenterBoard.getAckResponse(168);
            await outc.sendAsync();
            let spump = state.pumps.getItemById(id, true);
            pump = sys.pumps.getItemById(id, true);
            pump.type = spump.type = ntype;
            pump.name = spump.name = pumpName;
            pump.isActive = true;
            spump.isActive = true;
            if (typeof data.address !== 'undefined') pump.address = parseInt(data.address, 10);
            outn.response = IntelliCenterBoard.getAckResponse(168);
            outn.retries = 2;
            await outn.sendAsync();
            state.emitEquipmentChanges();
            return sys.pumps.getItemById(id);
        }
        catch (err) { return Promise.reject(err); }
    }
    public async deletePumpAsync(data: any): Promise<any> {
        let id = parseInt(data.id);
        if (isNaN(id)) return Promise.reject(new Error(`Cannot Delete Pump, Invalid pump id: ${data.id}`));
        let pump = sys.pumps.getItemById(id, false);
        if (pump.master === 1) return super.deletePumpAsync(data);
        if (typeof pump.type === 'undefined') return Promise.reject(new Error(`Pump #${data.id} does not exist in configuration`));
        let outc = Outbound.create({ action: 168, payload: [4, 0, id - 1, 0, 0, id + 95] });
        outc.appendPayloadInt(450);
        outc.appendPayloadInt(3450);
        outc.appendPayloadByte(15);
        outc.appendPayloadByte(130);
        outc.appendPayloadByte(1);
        outc.appendPayloadInt(1000);
        outc.appendPayloadInt(10);
        outc.appendPayloadByte(5);
        outc.appendPayloadBytes(255, 8);
        outc.appendPayloadBytes(0, 8);
        let outn = Outbound.create({ action: 168, payload: [4, 1, id - 1] });
        outn.appendPayloadBytes(0, 16);
        outn.appendPayloadString('Pump -' + (id + 1), 16);
        try {
            outc.retries = 5;
            outc.response = IntelliCenterBoard.getAckResponse(168);
            await outc.sendAsync();
            let spump = state.pumps.getItemById(id);
            sys.pumps.removeItemById(id);
            state.pumps.removeItemById(id);
            spump.isActive = false;
            spump.emitEquipmentChange();
            outn.response = IntelliCenterBoard.getAckResponse(168);
            outn.retries = 2;
            await outn.sendAsync();
            state.emitEquipmentChanges();
            return pump;
        } catch (err) { return Promise.reject(err); }
    }
}
class IntelliCenterV1BodyCommands extends IntelliCenterBodyCommands {
    protected buildBodyHeatPayload(bhs: any, byte2: number): number[] {
        let fnToByte = function (num) { return num < 0 ? Math.abs(num) | 0x80 : Math.abs(num) || 0; };
        return [0, 0, byte2, 1,
            fnToByte(sys.equipment.tempSensors.getCalibration('water1')),
            fnToByte(sys.equipment.tempSensors.getCalibration('solar1')),
            fnToByte(sys.equipment.tempSensors.getCalibration('air')),
            fnToByte(sys.equipment.tempSensors.getCalibration('water2')),
            fnToByte(sys.equipment.tempSensors.getCalibration('solar2')),
            fnToByte(sys.equipment.tempSensors.getCalibration('water3')),
            fnToByte(sys.equipment.tempSensors.getCalibration('solar3')),
            fnToByte(sys.equipment.tempSensors.getCalibration('water4')),
            fnToByte(sys.equipment.tempSensors.getCalibration('solar4')),
            0,
            0x10 | (sys.general.options.clockMode === 24 ? 0x40 : 0x00) | (sys.general.options.adjustDST ? 0x80 : 0x00) | (sys.general.options.clockSource === 'internet' ? 0x20 : 0x00),
            89, 27, 110, 3, 0, 0,
            bhs.body1.heatSetpoint, bhs.body1.coolSetpoint, bhs.body2.heatSetpoint, bhs.body2.coolSetpoint, bhs.body1.heatMode, bhs.body2.heatMode, 0, 0, 15,
            sys.general.options.pumpDelay ? 1 : 0, sys.general.options.cooldownDelay ? 1 : 0, 0, 100, 0, 0, 0, 0, sys.general.options.manualPriority ? 1 : 0, sys.general.options.manualHeat ? 1 : 0, 0
        ];
    }
    public getHeatSources(bodyId: number) {
        return super.getHeatSources(bodyId);
    }
}
class IntelliCenterV1ScheduleCommands extends IntelliCenterScheduleCommands {
    public async setScheduleAsync(data: any): Promise<any> {
        if (typeof data.id === 'undefined') return super.setScheduleAsync(data);
        let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
        if (id <= 0) id = sys.schedules.getNextEquipmentId(new EquipmentIdRange(1, sys.equipment.maxSchedules));
        if (isNaN(id)) return Promise.reject(new Error(`Invalid schedule id: ${data.id}`));
        let sched = sys.schedules.getItemById(id, data.id <= 0);
        let ssched = state.schedules.getItemById(id, data.id <= 0);
        let schedType = typeof data.scheduleType !== 'undefined' ? data.scheduleType : sched.scheduleType;
        if (typeof schedType === 'undefined') schedType = 0;
        let startTimeType = typeof data.startTimeType !== 'undefined' ? data.startTimeType : sched.startTimeType;
        let endTimeType = typeof data.endTimeType !== 'undefined' ? data.endTimeType : sched.endTimeType;
        let startDate = typeof data.startDate !== 'undefined' ? data.startDate : sched.startDate;
        if (typeof startDate.getMonth !== 'function') startDate = new Date(startDate);
        let heatSource = typeof data.heatSource !== 'undefined' && data.heatSource !== null ? data.heatSource : sched.heatSource || 0;
        let heatSetpoint = typeof data.heatSetpoint !== 'undefined' ? data.heatSetpoint : sched.heatSetpoint;
        let coolSetpoint = typeof data.coolSetpoint !== 'undefined' ? data.coolSetpoint : sched.coolSetpoint || 100;
        let circuit = typeof data.circuit !== 'undefined' ? data.circuit : sched.circuit;
        let startTime = typeof data.startTime !== 'undefined' ? data.startTime : sched.startTime;
        let endTime = typeof data.endTime !== 'undefined' ? data.endTime : sched.endTime;
        let schedDays = sys.board.schedules.transformDays(typeof data.scheduleDays !== 'undefined' ? data.scheduleDays : sched.scheduleDays);
        let display = typeof data.display !== 'undefined' ? data.display : sched.display || 0;
        if (isNaN(startDate.getTime())) startDate = new Date();
        if (typeof startTime === 'undefined') startTime = 480;
        if (typeof endTime === 'undefined') endTime = 1020;
        if (typeof startTimeType === 'undefined') startTimeType = 0;
        if (typeof endTimeType === 'undefined') endTimeType = 0;
        if (heatSetpoint < 0 || heatSetpoint > 104) return Promise.reject(new Error(`Invalid heat setpoint: ${heatSetpoint}`));
        let runOnce = schedType !== 128 ? 129 : 128;
        if (startTimeType !== 0) runOnce |= (1 << (startTimeType + 1));
        if (endTimeType !== 0) runOnce |= (1 << (endTimeType + 3));
        let schedGroup = typeof data.schedGroup !== 'undefined' ? parseInt(data.schedGroup, 10) : sched.schedGroup || 0;
        if (schedGroup === 1) runOnce |= 0x40;
        let startTimeLo = startTime - Math.floor(startTime / 256) * 256;
        let startTimeHi = Math.floor(startTime / 256);
        let endTimeLo = endTime - Math.floor(endTime / 256) * 256;
        let endTimeHi = Math.floor(endTime / 256);
        let out = Outbound.createMessage(168, [
            3, 0, id - 1,
            startTimeLo, startTimeHi,
            endTimeLo, endTimeHi,
            circuit - 1, runOnce, schedDays,
            startDate.getMonth() + 1, startDate.getDate(), startDate.getFullYear() - 2000,
            heatSource, heatSetpoint, coolSetpoint
        ], 0);
        out.response = IntelliCenterBoard.getAckResponse(168);
        out.retries = 5;
        await out.sendAsync();
        sched = sys.schedules.getItemById(id, true);
        ssched = state.schedules.getItemById(id, true);
        sched.circuit = ssched.circuit = circuit;
        sched.scheduleDays = ssched.scheduleDays = schedDays;
        sched.scheduleType = ssched.scheduleType = schedType;
        sched.schedGroup = ssched.schedGroup = schedGroup;
        sched.heatSetpoint = ssched.heatSetpoint = heatSetpoint;
        sched.coolSetpoint = ssched.coolSetpoint = coolSetpoint;
        sched.heatSource = ssched.heatSource = heatSource;
        sched.startTime = ssched.startTime = startTime;
        sched.endTime = ssched.endTime = endTime;
        sched.startTimeType = ssched.startTimeType = startTimeType;
        sched.endTimeType = ssched.endTimeType = endTimeType;
        sched.startDate = ssched.startDate = startDate;
        sched.startMonth = startDate.getMonth() + 1;
        sched.startYear = startDate.getFullYear();
        sched.startDay = startDate.getDate();
        ssched.startDate = startDate;
        ssched.isActive = sched.isActive = true;
        ssched.display = sched.display = display;
        ssched.emitEquipmentChange();
        state.emitEquipmentChanges();
        return sched;
    }
}
class IntelliCenterV1HeaterCommands extends IntelliCenterHeaterCommands {
    protected get heatPumpValue(): number { return 9; }
    protected get heatPumpPrefValue(): number { return 25; }
}
