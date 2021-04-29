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
import {byteValueMap} from './SystemBoard';
import {logger} from '../../logger/Logger';
import { EasyTouchBoard, TouchConfigQueue, GetTouchConfigCategories, TouchCircuitCommands } from './EasyTouchBoard';
import { state, ICircuitGroupState } from '../State';
import { PoolSystem, sys, ExpansionPanel, ExpansionModule } from '../Equipment';
import { Protocol, Outbound, Message, Response } from '../comms/messages/Messages';

import {conn} from '../comms/Comms';
export class IntelliTouchBoard extends EasyTouchBoard {
    constructor (system: PoolSystem){
        super(system);
        this.equipmentIds.features.start = 41;
        this.equipmentIds.features.end = 50;
        this._configQueue = new ITTouchConfigQueue();
        this.valueMaps.expansionBoards = new byteValueMap([
            [0, { name: 'IT5', part: 'i5+3', desc: 'IntelliTouch i5+3', circuits: 6, shared: true }],
            [1, { name: 'IT7', part: 'i7+3', desc: 'IntelliTouch i7+3', circuits: 7, shared: true }],
            [2, { name: 'IT9', part: 'i9+3', desc: 'IntelliTouch i9+3', circuits: 9, shared: true }],
            [3, { name: 'IT5S', part: 'i5+3S', desc: 'IntelliTouch i5+3S', circuits: 6, shared: false }],
            [4, { name: 'IT9S', part: 'i9+3S', desc: 'IntelliTouch i9+3S', circuits: 9, shared: false }],
            [5, { name: 'IT10D', part: 'i10D', desc: 'IntelliTouch i10D', circuits: 10, shared: false, dual: true }],
            [32, { name: 'IT10X', part: 'i10X', desc: 'IntelliTouch i10X', circuits: 10, shared: false }]
        ]);
    }
    public initExpansionModules(byte1: number, byte2: number) {
        console.log(`Pentair IntelliTouch System Detected!`);
        // Initialize the installed personality board.
        let mt = this.valueMaps.expansionBoards.transform(byte1);
        let mod = sys.equipment.modules.getItemById(0, true);
        mod.name = mt.name;
        mod.desc = mt.desc;
        mod.type = byte1;
        mod.part = mt.part;
        let eq = sys.equipment;
        let md = mod.get();

        eq.maxBodies = md.bodies = typeof mt.bodies !== 'undefined' ? mt.bodies : mt.shared || mt.dual ? 2 : 1;
        eq.maxCircuits = md.circuits = typeof mt.circuits !== 'undefined' ? mt.circuits : 6;
        eq.maxFeatures = md.features = typeof mt.features !== 'undefined' ? mt.features : 10
        eq.maxValves = md.valves = typeof mt.valves !== 'undefined' ? mt.valves : mt.shared ? 4 : 2;
        eq.maxPumps = md.maxPumps = typeof mt.pumps !== 'undefined' ? mt.pumps : 8;
        eq.shared = mt.shared;
        eq.dual = typeof mt.dual !== 'undefined' ? mt.dual : false;
        eq.maxChlorinators = md.chlorinators = 1;
        eq.maxChemControllers = md.chemControllers = 1;
        eq.maxCustomNames = 20;
        eq.maxCircuitGroups = 10; // Not sure why this is 10 other than to allow for those that we are in control of.

        // Calculate out the invalid ids.
        sys.board.equipmentIds.invalidIds.set([]);
        if (!eq.shared) sys.board.equipmentIds.invalidIds.merge([1]);
        // Add in all the invalid ids from the base personality board.
        sys.board.equipmentIds.invalidIds.set([16, 17, 18]); // These appear to alway be invalid in IntelliTouch.
        for (let i = 5; i <= 9; i++) {
            // This will add all the invalid ids between 5 and 9 that are omitted for IntelliTouch models.
            if (i === 6) continue;
            if (i >= eq.maxCircuits - 1) sys.board.equipmentIds.invalidIds.merge([i]);
        }
        // This code should be repeated if we ever see a panel with more than one expansion panel.
        let pnl: ExpansionPanel;
        pnl = sys.equipment.expansions.getItemById(1, true);
        pnl.type = byte2 & 0x20;
        pnl.name = pnl.type === 32 ? 'i10X' : 'none';
        pnl.isActive = pnl.type !== 0;
        // if type is i9 or i10 we can have up to 3 expansion boards.  These expansion boards only add
        // circuits.
        if (pnl.isActive) {
            let emt = this.valueMaps.expansionBoards.transform(pnl.type);
            let emd = pnl.modules.getItemById(1, true).get();
            eq.maxCircuits += emd.circuits = typeof emt.circuits !== 'undefined' ? emt.circuits : 0;
        }
        else pnl.modules.removeItemById(1);

        if (byte1 !== 14) sys.board.equipmentIds.invalidIds.merge([10, 19]);
        state.equipment.model = sys.equipment.model = mt.desc;
        state.equipment.controllerType = 'intellitouch';
        // The code above should be repeated if we ever see a panel with more than one expansion panel.
        sys.equipment.expansions.getItemById(2, true).isActive = false;
        sys.equipment.expansions.getItemById(3, true).isActive = false;
        sys.equipment.shared ? sys.board.equipmentIds.circuits.start = 1 : sys.board.equipmentIds.circuits.start = 2;
        this.initBodyDefaults();
        this.initHeaterDefaults();
        (async () => {
            try { sys.board.bodies.initFilters(); } catch (err) {
                logger.error(`Error initializing IntelliTouch Filters`);
            }
        })();
        state.emitControllerChange();
    }
    public circuits: ITTouchCircuitCommands = new ITTouchCircuitCommands(this);
}
class ITTouchConfigQueue extends TouchConfigQueue {
    public queueChanges() {
        this.reset();
        if (conn.mockPort) {
            logger.info(`Skipping configuration request from OCP because MockPort enabled.`);
        } else {
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
            this.queueItems(GetTouchConfigCategories.spaSideRemote, [0]);
            this.queueItems(GetTouchConfigCategories.valves, [0]);
            this.queueItems(GetTouchConfigCategories.lightGroupPositions);
            this.queueItems(GetTouchConfigCategories.highSpeedCircuits, [0]);
            this.queueRange(GetTouchConfigCategories.pumpConfig, 1, sys.equipment.maxPumps);
            this.queueRange(GetTouchConfigCategories.circuitGroups, 0, sys.equipment.maxFeatures - 1);
            // items not required by ScreenLogic
            if (sys.chlorinators.getItemById(1).isActive)
                this.queueItems(GetTouchConfigCategories.intellichlor, [0]);
        }
        if (this.remainingItems > 0) {
            var self = this;
            setTimeout(() => {self.processNext();}, 50);
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