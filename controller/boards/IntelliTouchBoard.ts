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
import { byteValueMap, EquipmentIdRange, } from './SystemBoard';
import { logger } from '../../logger/Logger';
import { EasyTouchBoard, TouchConfigQueue, GetTouchConfigCategories, TouchCircuitCommands } from './EasyTouchBoard';
import { state, ICircuitGroupState } from '../State';
import { PoolSystem, sys, ExpansionPanel, Equipment } from '../Equipment';

import { conn } from '../comms/Comms';
import { InvalidEquipmentDataError } from '../Errors';
import { log } from 'winston';

export class IntelliTouchBoard extends EasyTouchBoard {
    constructor(system: PoolSystem) {
        super(system);
        // Circuits even in single body IntelliTouch always start at 1.
        this.equipmentIds.circuits.start = 1;
        this.equipmentIds.features.start = 41;
        this.equipmentIds.features.end = 50;
        this.equipmentIds.virtualCircuits = new EquipmentIdRange(154, 162);
        this._configQueue = new ITTouchConfigQueue();
        this.valueMaps.expansionBoards = new byteValueMap([
            [0, { name: 'IT5', part: 'i5+3', desc: 'IntelliTouch i5+3', circuits: 6, shared: true }],
            [1, { name: 'IT7', part: 'i7+3', desc: 'IntelliTouch i7+3', circuits: 8, shared: true }],
            [2, { name: 'IT9', part: 'i9+3', desc: 'IntelliTouch i9+3', circuits: 10, shared: true }],
            [3, { name: 'IT5S', part: 'i5+3S', desc: 'IntelliTouch i5+3S', circuits: 5, single: true, shared: true, bodies: 2, intakeReturnValves: false }],
            [4, { name: 'IT9S', part: 'i9+3S', desc: 'IntelliTouch i9+3S', circuits: 9, single: true, shared: true, bodies: 2, intakeReturnValves: false }],
            [5, { name: 'IT10D', part: 'i10D', desc: 'IntelliTouch i10D', circuits: 10, single: true, shared: false, dual: true }],
            [32, { name: 'IT5X', part: 'i5X', desc: 'IntelliTouch i5X', circuits: 5 }],
            [33, { name: 'IT10X', part: 'i10X', desc: 'IntelliTouch i10X', circuits: 10 }],
            [64, { name: 'Valve Exp', part: '520285', desc: 'Valve Expansion Module', valves: 3 }]
        ]);
        // I don't think these have ever been right.  
        // So far I have seen below based on discussion #436
        // 155 = heater
        // 156 = poolheater
        // 157 = spaheater
        this.valueMaps.virtualCircuits = new byteValueMap([
            [154, { name: 'freeze', desc: 'Freeze', assignableToPumpCircuit: true }],
            [155, { name: 'spaHeater', desc: 'Spa Heater', assignableToPumpCircuit: true }],
            [156, { name: 'poolHeater', desc: 'Pool Heater', assignableToPumpCircuit: true }],
            [157, { name: 'heater', desc: 'Either Heater', assignableToPumpCircuit: true }],
            [158, { name: 'solar', desc: 'Solar', assignableToPumpCircuit: true }],
            [159, { name: 'heatBoost', desc: 'Heat Boost', assignableToPumpCircuit: false }],
            [160, { name: 'heatEnable', desc: 'Heat Enable', assignableToPumpCircuit: false }],
            [161, { name: 'pumpSpeedUp', desc: 'Pump Speed +', assignableToPumpCircuit: false }],
            [162, { name: 'pumpSpeedDown', desc: 'Pump Speed -', assignableToPumpCircuit: false }],
            [255, { name: 'notused', desc: 'NOT USED', assignableToPumpCircuit: true }],
            [258, { name: 'anyHeater', desc: 'Any Heater' }]
        ]);
    }
    public initVirtualCircuits() {
        for (let i = state.virtualCircuits.length - 1; i >= 0; i--) {
            let vc = state.virtualCircuits.getItemByIndex(i);
            if (vc.id > this.equipmentIds.virtualCircuits.end ||
                vc.id < this.equipmentIds.virtualCircuits.start) state.virtualCircuits.removeItemByIndex(i);
        }
        // Now that we removed all the virtual circuits that should not be there we need
        // to update them based upon the data.
    }
    public initValves(eq) {
        if (typeof sys.valves.find((v) => v.id === 1) === 'undefined') {
            let valve = sys.valves.getItemById(1, true);
            valve.isIntake = false;
            valve.isReturn = false;
            valve.type = 0;
            valve.master = 0;
            valve.isActive = true;
            valve.name = 'Valve A';
            logger.info(`Initializing IntelliTouch Valve A`);

        }
        if (typeof sys.valves.find((v) => v.id === 2) === 'undefined') {
            let valve = sys.valves.getItemById(2, true);
            valve.isIntake = false;
            valve.isReturn = false;
            valve.type = 0;
            valve.master = 0;
            valve.isActive = true;
            valve.name = 'Valve B';
            logger.info(`Initializing IntelliTouch Valve B`);
        }
        if (eq.intakeReturnValves) {
            logger.info(`Initializing IntelliTouch Intake/Return Valves`);
            let valve = sys.valves.getItemById(3, true);
            valve.isIntake = true;
            valve.isReturn = false;
            valve.circuit = 6;
            valve.type = 0;
            valve.master = 0;
            valve.isActive = true;
            valve.name = 'Intake';

            valve = sys.valves.getItemById(4, true);
            valve.isIntake = false;
            valve.isReturn = true;
            valve.circuit = 6;
            valve.type = 0;
            valve.master = 0;
            valve.isActive = true;
            valve.name = 'Return';
        }
    }
    public initExpansionModules(byte1: number, byte2: number) {
        console.log(`Pentair IntelliTouch System Detected!`);
        // For i9+3S with valve expansion the bytes are 4, 32 the expectation is
        // that the 32 contains the indicator that there is a valve expansion module.


        // Initialize the installed personality board.
        let mt = this.valueMaps.expansionBoards.transform(byte1);
        let mod = sys.equipment.modules.getItemById(0, true);
        mod.name = mt.name;
        mod.desc = mt.desc;
        mod.type = byte1;
        mod.part = mt.part;
        let eq = sys.equipment;
        let md = mod.get();

        //eq.maxBodies = md.bodies = typeof mt.bodies !== 'undefined' ? mt.bodies : mt.shared || mt.dual ? 2 : 1;
        // There are always 2 bodies on an IntelliTouch even the single body models.
        eq.maxBodies = 2;
        eq.maxCircuits = md.circuits = typeof mt.circuits !== 'undefined' ? mt.circuits : 6;
        eq.maxFeatures = md.features = typeof mt.features !== 'undefined' ? mt.features : 8;
        eq.maxValves = md.valves = typeof mt.valves !== 'undefined' ? mt.valves : mt.shared ? 4 : 2;
        eq.maxPumps = md.maxPumps = typeof mt.pumps !== 'undefined' ? mt.pumps : 8;
        eq.shared = mt.shared;
        eq.dual = typeof mt.dual !== 'undefined' ? mt.dual : false;
        eq.single = typeof mt.single !== 'undefined' ? mt.single : false;
        eq.intakeReturnValves = eq.single ? false : true;
        eq.maxChlorinators = md.chlorinators = 1;
        eq.maxChemControllers = md.chemControllers = 1;
        eq.maxCustomNames = 20;
        eq.maxSchedules = 99;
        eq.maxCircuitGroups = 10; // Not sure why this is 10 other than to allow for those that we are in control of.
        if (eq.single) {
            // Replace the body types with Hi-Temp and Lo-Temp
            sys.board.valueMaps.bodyTypes.merge([[0, { name: 'pool', desc: 'Lo-Temp' }],
                [1, { name: 'spa', desc: 'Hi-Temp' }]]);
        }
        // Calculate out the invalid ids.
        // Add in all the invalid ids from the base personality board.
        sys.board.equipmentIds.invalidIds.set([16, 17, 18]); // These appear to alway be invalid in IntelliTouch.
        for (let i = 7; i <= 10; i++) {
            // This will add all the invalid ids between 7 and 10 that are omitted for IntelliTouch models.
            // For instance an i7+3 can have up to 8 circuits since 1 and 6 are shared but an i7+3S will only have 7.
            if (i > eq.maxCircuits) sys.board.equipmentIds.invalidIds.merge([i]);
        }
        // This code should be repeated if we ever see a panel with more than one expansion panel.
        let pnl1: ExpansionPanel;
        if ((byte2 & 0x40) === 64) {
            // 64 indicates one expansion panel; SL defaults to i10x but it could also be i5x until we know better
            pnl1 = sys.equipment.expansions.getItemById(1, true);
            pnl1.type = 32;
            let emt = this.valueMaps.expansionBoards.transform(pnl1.type);
            pnl1.name = emt.desc;
            pnl1.isActive = true;
            eq.maxCircuits += emt.circuits;
        }
        else sys.equipment.expansions.removeItemById(1);
        let pnl2: ExpansionPanel;
        if ((byte2 & 0x80) === 128) {
            // SL defaults to i5x but it could also be i10x until we know better
            pnl2 = sys.equipment.expansions.getItemById(2, true);
            pnl2.type = 32;
            let emt = this.valueMaps.expansionBoards.transform(pnl2.type);
            pnl2.name = emt.desc;
            pnl2.isActive = true;
            eq.maxCircuits += emt.circuits;
        }
        else sys.equipment.expansions.removeItemById(2);
        let pnl3: ExpansionPanel;
        if ((byte2 & 0xC0) === 192) {
            // SL defaults to i5x but it could also be i10x until we know better
            pnl3 = sys.equipment.expansions.getItemById(3, true);
            pnl3.type = 32;
            let emt = this.valueMaps.expansionBoards.transform(pnl3.type);
            pnl3.name = emt.desc;
            pnl3.isActive = true;
            eq.maxCircuits += emt.circuits;
        }
        else sys.equipment.expansions.removeItemById(3);
        // Detect the valve expansion module.
        if ((byte2 & 0x20) === 20) {
            // The valve expansion module is installed so this should add 3 valves.
            eq.maxValves += 3;
            let vexp = eq.modules.getItemById(1, true);
            vexp.isActive = true;
            let mt = this.valueMaps.expansionBoards.transform(64);
            vexp.name = mt.name;
            vexp.desc = mt.desc;
            vexp.type = byte1;
            vexp.part = mt.part;
        }
        else eq.modules.removeItemById(1);
        if (byte1 !== 14) sys.board.equipmentIds.invalidIds.merge([10, 19]);
        state.equipment.model = sys.equipment.model = mt.desc;
        state.equipment.controllerType = 'intellitouch';
        this.initBodyDefaults();
        this.initHeaterDefaults();
        (async () => {
            try { sys.board.bodies.initFilters(); } catch (err) {
                logger.error(`Error initializing IntelliTouch Filters`);
            }
        })();
        for (let i = 0; i < sys.circuits.length; i++) {
            let c = sys.circuits.getItemByIndex(i);
            if (c.id <= 40) c.master = 0;
        }
        for (let i = 0; i < sys.valves.length; i++) {
            let v = sys.valves.getItemByIndex(i);
            if (v.id < 50) v.master = 0;
        }
        // Clean up any schedules that shouldn't be there.
        for (let i = sys.schedules.length - 1; i > 0; i--) {
            let sched = sys.schedules.getItemByIndex(i);
            if (sched.id < 1) {
                sys.schedules.removeItemByIndex(i);
                state.schedules.removeItemById(sched.id);
            }
            if (sched.id < eq.maxSchedules) sched.master = 0;
            else if (sched.id > eq.maxSchedules && (sched.master === 0 || typeof sched.master === 'undefined')) {
                sys.schedules.removeItemByIndex(i);
                state.schedules.removeItemById(sched.id);
            }
        }
        eq.setEquipmentIds();
        this.initVirtualCircuits();
        this.initValves(eq);
        state.equipment.maxBodies = sys.equipment.maxBodies;
        state.equipment.maxCircuitGroups = sys.equipment.maxCircuitGroups;
        state.equipment.maxCircuits = sys.equipment.maxCircuits;
        state.equipment.maxFeatures = sys.equipment.maxFeatures;
        state.equipment.maxHeaters = sys.equipment.maxHeaters;
        state.equipment.maxLightGroups = sys.equipment.maxLightGroups;
        state.equipment.maxPumps = sys.equipment.maxPumps;
        state.equipment.maxSchedules = sys.equipment.maxSchedules;
        state.equipment.maxValves = sys.equipment.maxValves;
        state.equipment.single = sys.equipment.single;
        state.equipment.shared = sys.equipment.shared;
        state.equipment.dual = sys.equipment.dual;
        
        state.emitControllerChange();

    }
    public circuits: ITTouchCircuitCommands = new ITTouchCircuitCommands(this);
    public async setControllerType(obj): Promise<Equipment> {
        try {
            if (obj.controllerType !== sys.controllerType) {
                return Promise.reject(new InvalidEquipmentDataError(`You may not change the controller type data for ${sys.controllerType} controllers`, 'controllerType', obj.controllerType));
            }

            let mod = sys.equipment.modules.getItemById(0);
            let mt = this.valueMaps.expansionBoards.get(mod.type);
            let _circuits = mt.circuits;
            let pnl1 = sys.equipment.expansions.getItemById(1);
            if (typeof obj.expansion1 !== 'undefined' && obj.expansion1 !== pnl1.type) {
                let emt = this.valueMaps.expansionBoards.transform(obj.expansion1);
                logger.info(`Changing expansion 1 to ${emt.desc}.`);
                pnl1.type = emt.val;
                pnl1.name = emt.desc;
                pnl1.isActive = true;
            }
            let pnl2 = sys.equipment.expansions.getItemById(2);
            if (typeof obj.expansion2 !== 'undefined' && obj.expansion2 !== pnl2.type) {
                let emt = this.valueMaps.expansionBoards.transform(obj.expansion2);
                logger.info(`Changing expansion 2 to ${emt.desc}.`);
                pnl2.type = emt.val;
                pnl2.name = emt.desc;
                pnl2.isActive = true;
            }
            let pnl3 = sys.equipment.expansions.getItemById(3);
            if (typeof obj.expansion3 !== 'undefined' && obj.expansion3 !== pnl3.type) {
                let emt = this.valueMaps.expansionBoards.transform(obj.expansion3);
                logger.info(`Changing expansion 3 to ${emt.desc}.`);
                pnl3.type = emt.val;
                pnl3.name = emt.desc;
                pnl3.isActive = true;
            }
            let prevMaxCircuits = sys.equipment.maxCircuits;
            if (pnl1.isActive) _circuits += this.valueMaps.expansionBoards.get(pnl1.type).circuits;
            if (pnl2.isActive) _circuits += this.valueMaps.expansionBoards.get(pnl2.type).circuits;
            if (pnl3.isActive) _circuits += this.valueMaps.expansionBoards.get(pnl3.type).circuits;
            if (_circuits < prevMaxCircuits) {
                // if we downsize expansions, remove circuits
                for (let i = _circuits + 1; i <= prevMaxCircuits; i++) {
                    sys.circuits.removeItemById(i);
                    state.circuits.removeItemById(i);
                }
            }
            else if (_circuits > prevMaxCircuits) {
                this._configQueue.queueChanges();
            }
            sys.equipment.maxCircuits = _circuits;
            return sys.equipment;
        } catch (err) {
            logger.error(`Error setting expansion panels: ${err.message}`);
        }
    }
    public initBodyDefaults() {
        // Initialize the bodies.  We will need these very soon.
        for (let i = 1; i <= sys.equipment.maxBodies; i++) {
            // Add in the bodies for the configuration.  These need to be set.
            let cbody = sys.bodies.getItemById(i, true);
            let tbody = state.temps.bodies.getItemById(i, true);
            cbody.isActive = true;
            // If the body doesn't represent a spa then we set the type.
            tbody.type = cbody.type = i - 1;  // This will set the first body to pool/Lo-Temp and the second body to spa/Hi-Temp.
            if (typeof cbody.name === 'undefined') {
                let bt = sys.board.valueMaps.bodyTypes.transform(cbody.type);
                tbody.name = cbody.name = bt.desc;
            }
        }
        sys.bodies.removeItemById(3);
        sys.bodies.removeItemById(4);
        state.temps.bodies.removeItemById(3);
        state.temps.bodies.removeItemById(4);
        for (let i = 0; i < sys.bodies.length; i++) {
            let b = sys.bodies.getItemByIndex(i);
            b.master = 0;
        }
        sys.board.heaters.initTempSensors();
        sys.general.options.clockMode = sys.general.options.clockMode || 12;
        sys.general.options.clockSource = sys.general.options.clockSource || 'manual';
    }
}
class ITTouchConfigQueue extends TouchConfigQueue {
    public queueChanges() {
        this.reset();
        logger.info(`Requesting ${sys.controllerType} configuration`);
        this.queueItems(GetTouchConfigCategories.dateTime, [0]);
        this.queueItems(GetTouchConfigCategories.heatTemperature, [0]);
        this.queueItems(GetTouchConfigCategories.solarHeatPump, [0]);
        this.queueRange(GetTouchConfigCategories.customNames, 0, sys.equipment.maxCustomNames - 1);
        this.queueRange(GetTouchConfigCategories.circuits, 1, sys.equipment.maxCircuits); // circuits
        this.queueRange(GetTouchConfigCategories.circuits, 41, 41 + sys.equipment.maxFeatures); // features
        this.queueRange(GetTouchConfigCategories.schedules, 1, sys.equipment.maxSchedules);
        this.queueItems(GetTouchConfigCategories.delays, [0]);
        this.queueItems(GetTouchConfigCategories.settings, [0]);
        this.queueItems(GetTouchConfigCategories.intellifloSpaSideRemotes, [0]);
        this.queueItems(GetTouchConfigCategories.is4is10, [0]);
        this.queueItems(GetTouchConfigCategories.quickTouchRemote, [0]);
        this.queueItems(GetTouchConfigCategories.valves, [0]);
        this.queueItems(GetTouchConfigCategories.lightGroupPositions);
        this.queueItems(GetTouchConfigCategories.highSpeedCircuits, [0]);
        this.queueRange(GetTouchConfigCategories.pumpConfig, 1, sys.equipment.maxPumps);
        this.queueRange(GetTouchConfigCategories.circuitGroups, 0, sys.equipment.maxFeatures - 1);
        this.queueItems(GetTouchConfigCategories.intellichlor, [0]);
        if (this.remainingItems > 0) {
            var self = this;
            setTimeout(() => { self.processNext(); }, 50);
        } else state.status = 1;
        state.emitControllerChange();
    }
}
class ITTouchCircuitCommands extends TouchCircuitCommands {
    public async setCircuitGroupStateAsync(id: number, val: boolean): Promise<ICircuitGroupState> {
        // intellitouch supports groups/macros with id's 41-50 with a macro flag
        let grp = sys.circuitGroups.getItemById(id, false, { isActive: false });
        return new Promise<ICircuitGroupState>(async (resolve, reject) => {
            try {
                await sys.board.circuits.setCircuitStateAsync(id, val);
                resolve(state.circuitGroups.getInterfaceById(id));
            }
            catch (err) { reject(err); }
        });
    }
}