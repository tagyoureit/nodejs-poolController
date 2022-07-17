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
import * as extend from 'extend';
import { EventEmitter } from 'events';
import { EasyTouchBoard, TouchConfigQueue, GetTouchConfigCategories } from './EasyTouchBoard';
import { sys, PoolSystem, Circuit } from '../Equipment';
import { byteValueMap, EquipmentIdRange } from './SystemBoard';
import { state } from '../State';
import { logger } from '../../logger/Logger';
import { conn } from '../comms/Comms';


export class SunTouchBoard extends EasyTouchBoard {
    constructor(system: PoolSystem) {
        super(system); // graph chain to EasyTouchBoard constructor.
        this.valueMaps.expansionBoards = new byteValueMap([
            [0, { name: 'suntouch', part: '', desc: 'SunTouch Pool/Spa controller', bodies: 2, valves: 4, circuits: 5, single: false, shared: true, dual: false, features: 4, chlorinators: 1, chemControllers: 1  }]
        ]);
        this._statusInterval = -1;
        this.equipmentIds.circuits = new EquipmentIdRange(function () { return this.start; }, function () { return this.start + sys.equipment.maxCircuits - 1; });
        this.equipmentIds.features = new EquipmentIdRange(() => { return 7; }, () => { return this.equipmentIds.features.start + sys.equipment.maxFeatures + 1; });
        this.equipmentIds.virtualCircuits = new EquipmentIdRange(128, 136);
        this.equipmentIds.circuitGroups = new EquipmentIdRange(192, function () { return this.start + sys.equipment.maxCircuitGroups - 1; });
        this.equipmentIds.circuits.start = sys.equipment.shared || sys.equipment.dual ? 1 : 2;
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
        ]);
        this.valueMaps.circuitNames = new byteValueMap([
            [0, { name: 'feature4', desc: 'FEATURE 4' }],
            [1, { name: 'aerator', desc: 'Aerator' }],
            [2, { name: 'airblower', desc: 'Air Blower' }],
            [3, { name: 'auxextra', desc: 'AUX EXTRA' }],
            [4, { name: 'aux1', desc: 'AUX 1' }],
            [5, { name: 'aux2', desc: 'AUX 2' }],
            [6, { name: 'aux3', desc: 'AUX 3' }],
            [7, { name: 'feature1', desc: 'FEATURE 1' }],
            [8, { name: 'feature2', desc: 'FEATURE 2' }],
            [9, { name: 'feature3', desc: 'FEATURE 3' }],
            [13, { name: 'backwash', desc: 'Backwash' }],
            [14, { name: 'backlight', desc: 'Back Light' }],
            [15, { name: 'bbqlight', desc: 'BBQ Light' }],
            [16, { name: 'beachlight', desc: 'Beach Light' }],
            [17, { name: 'boosterpump', desc: 'Booster Pump' }],
            [18, { name: 'buglight', desc: 'Bug Light' }],
            [19, { name: 'cabanalts', desc: 'Cabana Lights' }],
            [20, { name: 'chem.feeder', desc: 'Chemical Feeder' }],
            [21, { name: 'chlorinator', desc: 'Chlorinator' }],
            [22, { name: 'cleaner', desc: 'Cleaner' }],
            [23, { name: 'colorwheel', desc: 'Color Wheel' }],
            [24, { name: 'decklight', desc: 'Deck Light' }],
            [25, { name: 'drainline', desc: 'Drain Line' }],
            [26, { name: 'drivelight', desc: 'Drive Light' }],
            [27, { name: 'edgepump', desc: 'Edge Pump' }],
            [28, { name: 'entrylight', desc: 'Entry Light' }],
            [29, { name: 'fan', desc: 'Fan' }],
            [30, { name: 'fiberoptic', desc: 'Fiber Optic' }],
            [31, { name: 'fiberworks', desc: 'Fiber Works' }],
            [32, { name: 'fillline', desc: 'Fill Line' }],
            [33, { name: 'floorclnr', desc: 'Floor CLeaner' }],
            [34, { name: 'fogger', desc: 'Fogger' }],
            [35, { name: 'fountain', desc: 'Fountain' }],
            [36, { name: 'fountain1', desc: 'Fountain 1' }],
            [37, { name: 'fountain2', desc: 'Fountain 2' }],
            [38, { name: 'fountain3', desc: 'Fountain 3' }],
            [39, { name: 'fountains', desc: 'Fountains' }],
            [40, { name: 'frontlight', desc: 'Front Light' }],
            [41, { name: 'gardenlts', desc: 'Garden Lights' }],
            [42, { name: 'gazebolts', desc: 'Gazebo Lights' }],
            [43, { name: 'highspeed', desc: 'High Speed' }],
            [44, { name: 'hi-temp', desc: 'Hi-Temp' }],
            [45, { name: 'houselight', desc: 'House Light' }],
            [46, { name: 'jets', desc: 'Jets' }],
            [47, { name: 'lights', desc: 'Lights' }],
            [48, { name: 'lowspeed', desc: 'Low Speed' }],
            [49, { name: 'lo-temp', desc: 'Lo-Temp' }],
            [50, { name: 'malibults', desc: 'Malibu Lights' }],
            [51, { name: 'mist', desc: 'Mist' }],
            [52, { name: 'music', desc: 'Music' }],
            [53, { name: 'notused', desc: 'Not Used' }],
            [54, { name: 'ozonator', desc: 'Ozonator' }],
            [55, { name: 'pathlightn', desc: 'Path Lights' }],
            [56, { name: 'patiolts', desc: 'Patio Lights' }],
            [57, { name: 'perimeterl', desc: 'Permiter Light' }],
            [58, { name: 'pg2000', desc: 'PG2000' }],
            [59, { name: 'pondlight', desc: 'Pond Light' }],
            [60, { name: 'poolpump', desc: 'Pool Pump' }],
            [61, { name: 'pool', desc: 'Pool' }],
            [62, { name: 'poolhigh', desc: 'Pool High' }],
            [63, { name: 'poollight', desc: 'Pool Light' }],
            [64, { name: 'poollow', desc: 'Pool Low' }],
            [65, { name: 'sam', desc: 'SAM' }],
            [66, { name: 'poolsam1', desc: 'Pool SAM 1' }],
            [67, { name: 'poolsam2', desc: 'Pool SAM 2' }],
            [68, { name: 'poolsam3', desc: 'Pool SAM 3' }],
            [69, { name: 'securitylt', desc: 'Security Light' }],
            [70, { name: 'slide', desc: 'Slide' }],
            [71, { name: 'solar', desc: 'Solar' }],
            [72, { name: 'spa', desc: 'Spa' }],
            [73, { name: 'spahigh', desc: 'Spa High' }],
            [74, { name: 'spalight', desc: 'Spa Light' }],
            [75, { name: 'spalow', desc: 'Spa Low' }],
            [76, { name: 'spasal', desc: 'Spa SAL' }],
            [77, { name: 'spasam', desc: 'Spa SAM' }],
            [78, { name: 'spawtrfll', desc: 'Spa Waterfall' }],
            [79, { name: 'spillway', desc: 'Spillway' }],
            [80, { name: 'sprinklers', desc: 'Sprinklers' }],
            [81, { name: 'stream', desc: 'Stream' }],
            [82, { name: 'statuelt', desc: 'Statue Light' }],
            [83, { name: 'swimjets', desc: 'Swim Jets' }],
            [84, { name: 'wtrfeature', desc: 'Water Feature' }],
            [85, { name: 'wtrfeatlt', desc: 'Water Feature Light' }],
            [86, { name: 'waterfall', desc: 'Waterfall' }],
            [87, { name: 'waterfall1', desc: 'Waterfall 1' }],
            [88, { name: 'waterfall2', desc: 'Waterfall 2' }],
            [89, { name: 'waterfall3', desc: 'Waterfall 3' }],
            [90, { name: 'whirlpool', desc: 'Whirlpool' }],
            [91, { name: 'wtrflght', desc: 'Waterfall Light' }],
            [92, { name: 'yardlight', desc: 'Yard Light' }],
            [93, { name: 'auxextra', desc: 'AUX EXTRA' }]
        ]);
    }
    public initExpansionModules(byte1: number, byte2: number) {
        console.log(`Pentair SunTouch System Detected!`);
        sys.equipment.model = 'Suntouch';

        // Initialize the installed personality board.
        let mt = this.valueMaps.expansionBoards.transform(0);
        let mod = sys.equipment.modules.getItemById(0, true);
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
        eq.shared = mt.shared;
        eq.dual = false;
        eq.single = true;
        eq.maxChlorinators = md.chlorinators = 1;
        eq.maxChemControllers = md.chemControllers = 1;
        eq.maxCustomNames = 0;
        eq.maxSchedules = 6;
        // Calculate out the invalid ids.
        sys.board.equipmentIds.invalidIds.set([]);
        sys.board.equipmentIds.invalidIds.merge([2, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
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
                let bt = sys.board.valueMaps.bodyTypes.transform(cbody.type);
                tbody.name = cbody.name = bt.desc;
            }
            let c = sys.circuits.getItemById(tbody.circuit, true);
            c.master = 0;
            let cstate = state.circuits.getItemById(c.id, true);
            cstate.type = c.type = tbody.circuit === 6 ? sys.board.valueMaps.circuitFunctions.encode('pool') : sys.board.valueMaps.circuitFunctions.encode('spa');
            let name = sys.board.valueMaps.circuitNames.transform(c.id === 6 ? 61 : 72);
            cstate.nameId = c.nameId = name.val;
            // Check to see if the body circuit exists.  We are going to create these so that they start
            // out with the proper type.
            if (!c.isActive) {
                console.log(`THE BULLSHIT SUNTOUCH CONTROLLER DOES NOT HAVE A CIRCUIT ${c.id}`);
                cstate.showInFeatures = c.showInFeatures = false;
                c.isActive = cstate.isActive = true;
                cstate.name = c.name = name.desc;
            }
        }
        if (sys.equipment.maxBodies === 1) sys.board.equipmentIds.invalidIds.merge([1])
        sys.bodies.removeItemById(3);
        sys.bodies.removeItemById(4);
        state.temps.bodies.removeItemById(3);
        state.temps.bodies.removeItemById(4);
        sys.board.heaters.initTempSensors();
        sys.general.options.clockMode = sys.general.options.clockMode || 12;
        sys.general.options.clockSource = sys.general.options.clockSource || 'manual';
        // We are going to intialize the pool circuits
    }
}
class SunTouchConfigQueue extends TouchConfigQueue {
    public queueChanges() {
        this.reset();
        if (conn.mockPort) {
            logger.info(`Skipping configuration request from OCP because MockPort enabled.`);
        } else {
            logger.info(`Requesting ${sys.controllerType} configuration`);
            this.queueItems(GetTouchConfigCategories.dateTime, [0]);
            this.queueItems(GetTouchConfigCategories.heatTemperature, [0]);
            this.queueItems(GetTouchConfigCategories.solarHeatPump, [0]);
            //this.queueRange(GetTouchConfigCategories.customNames, 0, sys.equipment.maxCustomNames - 1);  SunTouch does not appear to support custom names.
            this.queueRange(GetTouchConfigCategories.circuits, 1, sys.equipment.maxCircuits); // circuits
            this.queueRange(GetTouchConfigCategories.circuits, 41, 41 + sys.equipment.maxFeatures); // features
            this.queueRange(GetTouchConfigCategories.schedules, 1, sys.equipment.maxSchedules);
            this.queueItems(GetTouchConfigCategories.delays, [0]);
            this.queueItems(GetTouchConfigCategories.settings, [0]);
            this.queueItems(GetTouchConfigCategories.intellifloSpaSideRemotes, [0]); 
            // this.queueItems(GetTouchConfigCategories.is4is10, [0]); SunTouch does not support is4 or is10 remotes
            //this.queueItems(GetTouchConfigCategories.spaSideRemote, [0]);  SunTouch does not support spaCommand remotes.
            this.queueItems(GetTouchConfigCategories.valves, [0]);
            //this.queueItems(GetTouchConfigCategories.lightGroupPositions);  SunTouch does not support IntelliBrite
            this.queueItems(GetTouchConfigCategories.highSpeedCircuits, [0]);
            //this.queueRange(GetTouchConfigCategories.pumpConfig, 1, sys.equipment.maxPumps);  SunTouch does not keep a speed configuration for VS pumps
            this.queueRange(219, 1, sys.equipment.maxPumps);  // This is an attempt to see if the pump configuration exists on another message for SunTouch
            this.queueItems(19, [0]);  // Let's see if we can get SunTouch to tell us about its configuration for IntelliChem.
            //this.queueRange(GetTouchConfigCategories.circuitGroups, 0, sys.equipment.maxFeatures - 1);  SunTouch does not support macros
            if (sys.chlorinators.getItemById(1).isActive)
                this.queueItems(GetTouchConfigCategories.intellichlor, [0]);
        }
        if (this.remainingItems > 0) {
            var self = this;
            setTimeout(() => { self.processNext(); }, 50);
        } else state.status = 1;
        state.emitControllerChange();
    }

}