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
import * as extend from 'extend';
import { EventEmitter } from 'events';
import { EasyTouchBoard, TouchConfigQueue, GetTouchConfigCategories, TouchCircuitCommands } from './EasyTouchBoard';
import { sys, PoolSystem, Circuit, ICircuit } from '../Equipment';
import { byteValueMap, EquipmentIdRange } from './SystemBoard';
import { state, ICircuitState } from '../State';
import { logger } from '../../logger/Logger';
import { conn } from '../comms/Comms';
import { Outbound } from "../comms/messages/Messages";
import { InvalidEquipmentIdError } from "../Errors";
import { utils } from "../Constants";

export class SunTouchBoard extends EasyTouchBoard {
    constructor(system: PoolSystem) {
        super(system); // graph chain to EasyTouchBoard constructor.
        this.valueMaps.expansionBoards = new byteValueMap([
            [41, { name: 'stshared', part: '520820', desc: 'Pool and Spa controller', bodies: 2, valves: 4, circuits: 5, single: false, shared: true, dual: false, features: 4, chlorinators: 1, chemControllers: 1 }],
            [40, { name: 'stsingle', part: '520819', desc: 'Pool or Spa controller', bodies: 2, valves: 4, circuits: 5, single: true, shared: true, dual: false, features: 4, chlorinators: 1, chemControllers: 1 }]
        ]);
        this._statusInterval = -1;
        this.equipmentIds.circuits = new EquipmentIdRange(1, 6);
        this.equipmentIds.features = new EquipmentIdRange(7, 10);
        this.equipmentIds.virtualCircuits = new EquipmentIdRange(128, 136);
        this.equipmentIds.circuitGroups = new EquipmentIdRange(192, function () { return this.start + sys.equipment.maxCircuitGroups - 1; });
        this.equipmentIds.circuits.start = 1;
        this.equipmentIds.circuits.isInRange = (id: number) => { return [1, 2, 3, 4, 6].includes(id); };
        this.equipmentIds.features.isInRange = (id: number) => { return [7, 8, 9, 10].includes(id); };
        if (typeof sys.configVersion.equipment === 'undefined') { sys.configVersion.equipment = 0; }
        this.valueMaps.heatSources = new byteValueMap([
            [0, { name: 'off', desc: 'Off' }],
            [32, { name: 'nochange', desc: 'No Change' }]
        ]);
        this.valueMaps.heatStatus = new byteValueMap([
            [0, { name: 'off', desc: 'Off' }],
            [1, { name: 'heater', desc: 'Heater' }],
            [2, { name: 'cooling', desc: 'Cooling' }],
            [3, { name: 'solar', desc: 'Solar' }],
            [4, { name: 'hpheat', desc: 'Heatpump' }],
            [5, { name: 'dual', desc: 'Dual' }]
        ]);
        this.valueMaps.circuitFunctions = new byteValueMap([
            [0, { name: 'generic', desc: 'Generic' }],
            [1, { name: 'spa', desc: 'Spa', hasHeatSource: true, body: 2 }],
            [2, { name: 'pool', desc: 'Pool', hasHeatSource: true, body: 1 }],
            [5, { name: 'mastercleaner', desc: 'Master Cleaner', body: 1 }],
            [7, { name: 'light', desc: 'Light', isLight: true }],
            [9, { name: 'samlight', desc: 'SAM Light', isLight: true }],
            [10, { name: 'sallight', desc: 'SAL Light', isLight: true }],
            [11, { name: 'photongen', desc: 'Photon Gen', isLight: true }],
            [12, { name: 'colorwheel', desc: 'Color Wheel', isLight: true }],
            [13, { name: 'valve', desc: 'Valve' }],
            [14, { name: 'spillway', desc: 'Spillway' }],
            [15, { name: 'floorcleaner', desc: 'Floor Cleaner', body: 1 }],  // This circuit function does not seem to exist in IntelliTouch.
            [19, { name: 'notused', desc: 'Not Used' }],
            [63, { name: 'cleaner', desc: 'Cleaner' }],

        ]);
        this.valueMaps.virtualCircuits = new byteValueMap([
            [20, { name: 'solar', desc: 'Solar', assignableToPumpCircuit: true }],
            [129, { name: 'poolspa', desc: 'Pool/Spa' }],
            [130, { name: 'poolHeater', desc: 'Pool Heater', assignableToPumpCircuit: true }],
            [131, { name: 'spaHeater', desc: 'Spa Heater', assignableToPumpCircuit: true }],
            [132, { name: 'freeze', desc: 'Freeze', assignableToPumpCircuit: true }],
            [258, { name: 'anyHeater', desc: 'Any Heater' }]
        ]);
        this.valueMaps.circuitNames = new byteValueMap([
            [3, { name: 'aux1', desc: 'AUX 1' }],
            [4, { name: 'aux2', desc: 'AUX 2' }],
            [5, { name: 'aux3', desc: 'AUX 3' }],
            [6, { name: 'feature1', desc: 'FEATURE 1' }],
            [7, { name: 'feature2', desc: 'FEATURE 2' }],
            [8, { name: 'feature3', desc: 'FEATURE 3' }],
            [9, { name: 'feature4', desc: 'FEATURE 4' }],
            [61, { name: 'pool', desc: 'Pool' }],
            [72, { name: 'spa', desc: 'Spa' }]
        ]);
        this._configQueue = new SunTouchConfigQueue();
    }
    public initExpansionModules(byte1: number, byte2: number) {
        console.log(`Pentair SunTouch System Detected!`);
        sys.equipment.model = 'Suntouch';

        // Initialize the installed personality board.
        let mt = this.valueMaps.expansionBoards.transform(byte1);  // Only have one example of SunTouch and it is a single body system (40).
        let mod = sys.equipment.modules.getItemById(0, true);
        if (mod.name !== mt.name) {
            logger.info(`Clearing SunTouch configuration...`);
            sys.bodies.removeItemById(1);
            sys.bodies.removeItemById(2);
            sys.bodies.removeItemById(3);
            sys.bodies.removeItemById(4);
            sys.circuits.clear(0);
            sys.circuits.removeItemById(1);
            sys.circuits.removeItemById(6);
            sys.features.clear(0);
            state.circuits.clear();
            state.temps.clear();
            sys.filters.clear(0);
            state.filters.clear();
        }
        mod.name = mt.name;
        mod.desc = mt.desc;
        mod.type = byte1;
        mod.part = mt.part;
        let eq = sys.equipment;
        let md = mod.get();
        eq.maxBodies = md.bodies = typeof mt.bodies !== 'undefined' ? mt.bodies : mt.shared ? 2 : 1;
        eq.maxCircuits = md.circuits = typeof mt.circuits !== 'undefined' ? mt.circuits : 3;
        eq.maxFeatures = md.features = typeof mt.features !== 'undefined' ? mt.features : 0
        eq.maxValves = md.valves = typeof mt.valves !== 'undefined' ? mt.valves : 2;
        eq.maxPumps = md.maxPumps = typeof mt.pumps !== 'undefined' ? mt.pumps : 2;
        eq.shared = mt.shared || false;
        eq.dual = mt.dual || false;
        eq.single = mt.single || false;
        eq.maxChlorinators = md.chlorinators = 1;
        eq.maxChemControllers = md.chemControllers = 1;
        eq.maxCustomNames = 0;
        eq.maxSchedules = 6;
        if (sys.equipment.single) {
            sys.board.valueMaps.circuitNames.merge([[61, { name: 'pool', desc: 'LO-Temp' }], [72, { name: 'spa', desc: 'HI-Temp' }]]);
            sys.board.valueMaps.circuitFunctions.merge([[1, { name: 'pool', desc: 'LO-Temp', hasHeatSource: true }], [2, { name: 'spa', desc: 'HI-Temp', hasHeatSource: true }]]);
            sys.board.valueMaps.virtualCircuits.merge([[130, { name: 'poolHeater', desc: 'LO-Temp Heater' }], [131, { name: 'spaHeater', desc: 'HI-Temp Heater' }]]);
            sys.board.valueMaps.bodyTypes.merge([[0, { name: 'pool', desc: 'LO-Temp' }], [1, { name: 'spa', desc: 'HI-Temp' }]]);

        }
        else {
            sys.board.valueMaps.circuitNames.merge([[61, { name: 'pool', desc: 'Pool' }], [72, { name: 'spa', desc: 'Spa' }]]);
            sys.board.valueMaps.circuitFunctions.merge([[1, { name: 'pool', desc: 'Pool', hasHeatsource: true }], [2, { name: 'spa', desc: 'Pool', hasHeatSource: true }]]);
            sys.board.valueMaps.virtualCircuits.merge([[130, { name: 'poolHeater', desc: 'Pool Heater' }], [131, { name: 'spaHeater', desc: 'Spa Heater' }]]);
            sys.board.valueMaps.bodyTypes.merge([[0, { name: 'pool', desc: 'Pool' }], [1, { name: 'spa', desc: 'Spa' }]]);
        }
        // Calculate out the invalid ids.
        sys.board.equipmentIds.invalidIds.set([]);
        // SunTouch bit mapping for circuits and features
        // Bit  Mask Circuit/Feature id
        // 1 = 0x01  Spa             1
        // 2 = 0x02  Aux 1           2
        // 3 = 0x04  Aux 2           3
        // 4 = 0x08  Aux 3           4
        // 5 = 0x10  Feature 1       7
        // 6 = 0x20  Pool            6
        // 7 = 0x40  Feature 2       8
        // 8 = 0x80  Feature 3       9
        // 9 = 0x01  Feature 4       10
        sys.board.equipmentIds.invalidIds.merge([5]);
        state.equipment.model = sys.equipment.model = 'SunTouch';
        sys.equipment.setEquipmentIds();
        this.initBodyDefaults();
        state.emitControllerChange();
    }
    public initBodyDefaults() {
        // Initialize the bodies.  We will need these very soon.
        for (let i = 1; i <= sys.equipment.maxBodies; i++) {
            // Add in the bodies for the configuration.  These need to be set.
            let cbody = sys.bodies.getItemById(i, true);
            let tbody = state.temps.bodies.getItemById(i, true);
            cbody.isActive = true;
            tbody.circuit = cbody.circuit = i === 1 ? 1 : 6;
            tbody.type = cbody.type = i - 1;  // This will set the first body to pool/Lo-Temp and the second body to spa/Hi-Temp.
            if (typeof cbody.name === 'undefined') {
                if (sys.equipment.single) {
                    tbody.name = cbody.name = i === 1 ? 'LO' : 'HI';
                }
                else {
                    let bt = sys.board.valueMaps.bodyTypes.transform(cbody.type);
                    tbody.name = cbody.name = bt.desc;
                }
            }
            let c = sys.circuits.getItemById(tbody.circuit, true, { isActive: false });
            c.master = 0;
            let cstate = state.circuits.getItemById(c.id, true);
            cstate.type = c.type = tbody.circuit === 6 ? sys.board.valueMaps.circuitFunctions.encode('pool') : sys.board.valueMaps.circuitFunctions.encode('spa');
            let name = sys.board.valueMaps.circuitNames.transform(c.id === 6 ? 61 : 72);
            cstate.nameId = c.nameId = name.val;
            // Check to see if the body circuit exists.  We are going to create these so that they start
            // out with the proper type.
            if (!c.isActive) {
                cstate.showInFeatures = c.showInFeatures = false;
                c.isActive = cstate.isActive = true;
                console.log(name);
                cstate.name = c.name = name.desc;
            }
        }
        sys.bodies.removeItemById(3);
        sys.bodies.removeItemById(4);
        state.temps.bodies.removeItemById(3);
        state.temps.bodies.removeItemById(4);
        sys.board.heaters.initTempSensors();
        sys.general.options.clockMode = sys.general.options.clockMode || 12;
        sys.general.options.clockSource = sys.general.options.clockSource || 'manual';
        // We are going to intialize the pool circuits
        let filter = sys.filters.getItemById(1, true);
        if (typeof filter.name === 'undefined') filter.name = 'Filter';
        state.filters.getItemById(1, true).name = filter.name;
    }
    public circuits: SunTouchCircuitCommands = new SunTouchCircuitCommands(this);

}
class SunTouchConfigQueue extends TouchConfigQueue {
    public queueChanges() {
        this.reset();
        logger.info(`Requesting ${sys.controllerType} configuration`);
        // Config categories that do nothing
        // 195 - [0-2]
        // 196 - [0-2]
        // 198 - [0-2]
        // 199 - [0-2]
        // 201 - [0-2]
        // 202 - [0-2] - Custom Names
        // 204 - [0-2]
        // 205 - [0-2]
        // 206 - [0-2]
        // 207 - [0-2]
        // 208 - [0-2]
        // 209 - [0-10] - This returns invalid data about schedules.  It is simply not correct
        // 212 - [0-2]
        // 213 - [0-2]
        // 214 - [0]
        // 215 - [0-2]
        // 216 - [0-4] - This does not return anything about the pumps
        // 218 - [0-2]
        // 219 - [0-2]
        // 220 - [0-2]
        // 223 - [0-2]
        // 224 - [1-2]
        // 226 - [0]
        // 228 - [0-2]
        // 229 - [0-2]
        // 230 - [0-2]
        // 231 - [0-2]
        // 233 - [0-2]
        // 234 - [0-2]
        // 235 - [0-2]
        // 236 - [0-2]
        // 237 - [0-2]
        // 238 - [0-2]
        // 239 - [0-2]
        // 240 - [0-2]
        // 241 - [0-2]
        // 242 - [0-2]
        // 243 - [0-2]
        // 244 - [0-2]
        // 245 - [0-2]
        // 246 - [0-2]
        // 247 - [0-2]
        // 248 - [0-2]
        // 249 - [0-2]
        // 250 - [0-2]
        // 251 - [0-2]

        this.queueItems(GetTouchConfigCategories.version); // 252
        this.queueItems(GetTouchConfigCategories.dateTime, [0]); //197
        this.queueItems(GetTouchConfigCategories.heatTemperature, [0]); // 200
        //this.queueRange(GetTouchConfigCategories.customNames, 0, sys.equipment.maxCustomNames - 1); 202 SunTouch does not appear to support custom names.  No responses
        this.queueItems(GetTouchConfigCategories.solarHeatPump, [0]); // 208
        this.queueRange(GetTouchConfigCategories.circuits, 1, sys.board.equipmentIds.features.end); // 203 circuits & Features
        //this.queueRange(GetTouchConfigCategories.schedules, 1, sys.equipment.maxSchedules); // 209 This return is worthless in SunTouch
        this.queueItems(GetTouchConfigCategories.delays, [0]); // 227
        this.queueItems(GetTouchConfigCategories.settings, [0]); // 232
        this.queueItems(GetTouchConfigCategories.intellifloSpaSideRemotes, [0]); // 225 QuickTouch
        this.queueItems(GetTouchConfigCategories.valves, [0]); // 221

        // Check for these positions to see if we can get it to spit out all the schedules.
        this.queueItems(222, [0]); // First 2 schedules.  This request ignores the payload and does not return additional items.
        this.queueItems(211, [0]);
        this.queueItems(19, [0]);  // If we send this request it will respond with a valid 147.  The correct request however should be 211.
        //this.queueRange(GetTouchConfigCategories.circuitGroups, 0, sys.equipment.maxFeatures - 1);  SunTouch does not support macros
        this.queueItems(GetTouchConfigCategories.intellichlor, [0]); // 217
        //let test = [195, 196, 208, 214, 218, 219, 220, 226, 228, 229, 230, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251];
        //for (let i = 0; i < test.length; i++) {
        //    let cat = test[i];
        //    this.queueRange(cat, 0, 2);
        //}

        if (this.remainingItems > 0) {
            var self = this;
            setTimeout(() => { self.processNext(); }, 50);
        } else state.status = 1;
        state.emitControllerChange();
    }

}
class SunTouchCircuitCommands extends TouchCircuitCommands {
    public async setCircuitStateAsync(id: number, val: boolean, ignoreDelays?: boolean): Promise<ICircuitState> {
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Circuit or Feature id not valid', id, 'Circuit'));
        let c = sys.circuits.getInterfaceById(id);
        if (c.master !== 0) return await super.setCircuitStateAsync(id, val);
        if (id === 192 || c.type === 3) return await sys.board.circuits.setLightGroupThemeAsync(id - 191, val ? 1 : 0);
        if (id >= 192) return await sys.board.circuits.setCircuitGroupStateAsync(id, val);

        // for some dumb reason, if the spa is on and the pool circuit is desired to be on,
        // it will ignore the packet.
        // We can override that by emulating a click to turn off the spa instead of turning
        // on the pool
        if (sys.equipment.maxBodies > 1 && id === 6 && val && state.circuits.getItemById(1).isOn) {
            id = 1;
            val = false;
        }
        let mappedId = id;
        if (id === 7) mappedId = 5;
        else if (id > 6) mappedId = id - 1;
        let cstate = state.circuits.getInterfaceById(id);
        let out = Outbound.create({
            action: 134,
            payload: [mappedId, val ? 1 : 0],
            retries: 3,
            response: true,
            scope: `circuitState${id}`
        });
        await out.sendAsync();
        sys.board.circuits.setEndTime(c, cstate, val);
        cstate.isOn = val;
        state.emitEquipmentChanges();
        return cstate;

    }
    public async setCircuitAsync(data: any): Promise<ICircuit> {
        try {
            // example [255,0,255][165,33,16,34,139,5][17,14,209,0,0][2,120]
            // set circuit 17 to function 14 and name 209
            // response: [255,0,255][165,33,34,16,1,1][139][1,133]
            let id = parseInt(data.id, 10);
            if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Circuit Id is invalid', data.id, 'Feature'));
            if (id >= 255 || data.master === 1) return super.setCircuitAsync(data);
            let circuit = sys.circuits.getInterfaceById(id);
            // Alright check to see if we are adding a nixie circuit.
            if (id === -1 || circuit.master !== 0) {
                let circ = await super.setCircuitAsync(data);
                return circ;
            }
            let typeByte = parseInt(data.type, 10) || circuit.type || sys.board.valueMaps.circuitFunctions.getValue('generic');
            let nameByte = circuit.nameId; // You cannot change the Name Id in SunTouch.
            if (typeof data.nameId !== 'undefined') nameByte = data.nameId;
            let mappedId = id;
            if (id === 7) mappedId = 5;
            else if (id > 6) mappedId = id - 1;

            let out = Outbound.create({
                action: 139,
                payload: [mappedId, typeByte | (utils.makeBool(data.freeze) ? 64 : 0), nameByte, 0, 0],
                retries: 3,
                response: true
            });
            await out.sendAsync();
            circuit = sys.circuits.getInterfaceById(data.id);
            let cstate = state.circuits.getInterfaceById(data.id);
            circuit.nameId = cstate.nameId = nameByte;
            circuit.name = typeof data.name !== 'undefined' ? data.name.toString() : circuit.name;
            circuit.showInFeatures = cstate.showInFeatures = typeof data.showInFeatures !== 'undefined' ? data.showInFeatures : circuit.showInFeatures;
            circuit.freeze = typeof data.freeze !== 'undefined' ? utils.makeBool(data.freeze) : circuit.freeze;
            circuit.type = cstate.type = typeByte;
            circuit.eggTimer = typeof data.eggTimer !== 'undefined' ? parseInt(data.eggTimer, 10) : circuit.eggTimer || 720;
            circuit.dontStop = (typeof data.dontStop !== 'undefined') ? utils.makeBool(data.dontStop) : circuit.eggTimer === 1620;
            cstate.isActive = circuit.isActive = true;
            circuit.master = 0;
            let eggTimer = sys.eggTimers.find(elem => elem.circuit === parseInt(data.id, 10));
            try {
                if (circuit.eggTimer === 720) {
                    if (typeof eggTimer !== 'undefined') await sys.board.schedules.deleteEggTimerAsync({ id: eggTimer.id });
                }
                else {
                    await sys.board.schedules.setEggTimerAsync({ id: typeof eggTimer !== 'undefined' ? eggTimer.id : -1, runTime: circuit.eggTimer, dontStop: circuit.dontStop, circuit: circuit.id });
                }
            }
            catch (err) {
                // fail silently if there are no slots to fill in the schedules
                logger.info(`Cannot set/delete eggtimer on circuit ${circuit.id}.  Error: ${err.message}`);
                circuit.eggTimer = 720;
                circuit.dontStop = false;
            }
            state.emitEquipmentChanges();
            return circuit;
        }
        catch (err) { logger.error(`setCircuitAsync error setting circuit ${JSON.stringify(data)}: ${err}`); return Promise.reject(err); }
    }
}