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
import { ncp } from "../nixie/Nixie";
import { NixieHeaterBase } from "../nixie/heaters/Heater";
import { Timestamp, utils } from '../Constants';
import {SystemBoard, byteValueMap, BodyCommands, FilterCommands, PumpCommands, SystemCommands, CircuitCommands, FeatureCommands, ValveCommands, HeaterCommands, ChlorinatorCommands, ChemControllerCommands, EquipmentIdRange} from './SystemBoard';
import { logger } from '../../logger/Logger';
import { state, CircuitState, ICircuitState, ICircuitGroupState, LightGroupState, ValveState, FilterState, BodyTempState, FeatureState } from '../State';
import { sys, Equipment, General, PoolSystem, CircuitGroupCircuit, CircuitGroup, ChemController, Circuit, Feature, Valve, ICircuit, Heater, LightGroup, LightGroupCircuit, ControllerType, Filter } from '../Equipment';
import { BoardProcessError, EquipmentNotFoundError, InvalidEquipmentDataError, InvalidEquipmentIdError, ServiceParameterError } from '../Errors';
import { delayMgr } from '../Lockouts';
import { webApp } from "../../web/Server";
import { setTimeout } from 'timers/promises';
import { setTimeout as setTimeoutSync } from 'timers';

export class NixieBoard extends SystemBoard {
    constructor (system: PoolSystem){
        super(system);
        this._statusInterval = 3000;
        this.equipmentIds.circuits = new EquipmentIdRange(1, function () { return this.start + sys.equipment.maxCircuits - 1; });
        this.equipmentIds.features = new EquipmentIdRange(function () { return 129; }, function () { return this.start + sys.equipment.maxFeatures - 1; });
        this.equipmentIds.circuitGroups = new EquipmentIdRange(function () { return this.start; }, function () { return this.start + sys.equipment.maxCircuitGroups - 1; });
        this.equipmentIds.virtualCircuits = new EquipmentIdRange(function () { return this.start; }, function () { return 277; });
        this.equipmentIds.features.start = 129;
        this.equipmentIds.circuitGroups.start = 193;
        this.equipmentIds.virtualCircuits.start = 237;
        this.valueMaps.equipmentMaster = new byteValueMap([
            [1, { val: 1, name: 'ncp', desc: 'Nixie Control Panel' }],
            [2, { val: 2, name: 'ext', desc: 'External Control Panel'}]
        ]);
        this.valueMaps.panelModes = new byteValueMap([
            [0, { name: 'auto', desc: 'Auto' }],
            [1, { name: 'service', desc: 'Service' }],
            [128, { name: 'timeout', desc: 'Timeout' }],
            [255, { name: 'error', desc: 'System Error' }]
        ]);
        this.valueMaps.featureFunctions = new byteValueMap([
            [0, { name: 'generic', desc: 'Generic' }],
            [1, { name: 'spillway', desc: 'Spillway' }],
            [2, { name: 'spadrain', desc: 'Spa Drain' }]
        ]);
        this.valueMaps.circuitFunctions = new byteValueMap([
            [0, { name: 'generic', desc: 'Generic' }],
            [1, { name: 'spillway', desc: 'Spillway' }],
            [2, { name: 'mastercleaner', desc: 'Master Cleaner', body: 1 }],
            [3, { name: 'chemrelay', desc: 'Chem Relay' }],
            [4, { name: 'light', desc: 'Light', isLight: true }],
            [5, { name: 'intellibrite', desc: 'Intellibrite', isLight: true, theme: 'intellibrite' }],
            [6, { name: 'globrite', desc: 'GloBrite', isLight: true, theme: 'intellibrite' }],
            [7, { name: 'globritewhite', desc: 'GloBrite White', isLight: true }],
            [8, { name: 'magicstream', desc: 'Magicstream', isLight: true, theme: 'magicstream' }],
            [9, { name: 'dimmer', desc: 'Dimmer', isLight: true }],
            [10, { name: 'colorcascade', desc: 'ColorCascade', isLight: true, theme: 'intellibrite' }],
            [11, { name: 'mastercleaner2', desc: 'Master Cleaner 2', body: 2 }],
            [12, { name: 'pool', desc: 'Pool', hasHeatSource: true, body: 1 }],
            [13, { name: 'spa', desc: 'Spa', hasHeatSource: true, body: 2 }],
            [14, { name: 'colorlogic', desc: 'ColorLogic', isLight: true, theme: 'colorlogic' }],
            [15, { name: 'spadrain', desc: 'Spa Drain' }],
            [16, { name: 'pooltone', desc: 'Pool Tone', isLight: true, theme: 'pooltone' }],
            [17, { name: 'watercolors', desc: 'WaterColors', isLight: true, theme: 'watercolors' }],
        ]);
        this.valueMaps.pumpTypes = new byteValueMap([
            [1, { name: 'ss', desc: 'Single Speed', maxCircuits: 8, hasAddress: false, hasBody: false, maxRelays: 1, relays: [{ id: 1, name: 'Pump On/Off' }]}],
            [2, { name: 'ds', desc: 'Two Speed', maxCircuits: 8, hasAddress: false, hasBody: false, maxRelays: 2, relays: [{ id: 1, name: 'Low Speed' }, { id: 2, name: 'High Speed' }]}],
            [3, { name: 'vs', desc: 'Intelliflo VS', maxPrimingTime: 6, minSpeed: 450, maxSpeed: 3450, maxCircuits: 8, hasAddress: true }],
            [4, { name: 'vsf', desc: 'Intelliflo VSF', minSpeed: 450, maxSpeed: 3450, minFlow: 15, maxFlow: 130, maxCircuits: 8, hasAddress: true }],
            [5, { name: 'vf', desc: 'Intelliflo VF', minFlow: 15, maxFlow: 130, maxCircuits: 8, hasAddress: true }],
            [6, { name: 'hwvs', desc: 'Hayward Eco/TriStar VS', minSpeed: 450, maxSpeed: 3450, maxCircuits: 8, hasAddress: true }],
            [7, { name: 'hwrly', desc: 'Hayward Relay VS', hasAddress: false, maxCircuits: 8, maxRelays: 4, maxSpeeds: 8, relays: [{ id: 1, name: 'Step #1' }, { id: 2, name: 'Step #2'}, { id: 3, name: 'Step #3' }, { id: 4, name: 'Pump On' }] }],
            [100, { name: 'sf', desc: 'SuperFlo VS', hasAddress: false, maxCircuits: 8, maxRelays: 4, equipmentMaster: 1, maxSpeeds: 4, relays: [{ id: 1, name: 'Program #1' }, { id: 2, name: 'Program #2' }, { id: 3, name: 'Program #3' }, { id: 4, name: 'Program #4' }]}]
        ]);
        // RSG - same as systemBoard definition; can delete.
        this.valueMaps.heatModes = new byteValueMap([
            [0, { name: 'off', desc: 'Off' }],
            [3, { name: 'heater', desc: 'Heater' }],
            [5, { name: 'solar', desc: 'Solar Only' }],
            [12, { name: 'solarpref', desc: 'Solar Preferred' }]
        ]);
        this.valueMaps.scheduleDays = new byteValueMap([
            [1, { name: 'mon', desc: 'Monday', dow: 1, bitval: 1 }],
            [2, { name: 'tue', desc: 'Tuesday', dow: 2, bitval: 2 }],
            [3, { name: 'wed', desc: 'Wednesday', dow: 3, bitval: 4 }],
            [4, { name: 'thu', desc: 'Thursday', dow: 4, bitval: 8 }],
            [5, { name: 'fri', desc: 'Friday', dow: 5, bitval: 16 }],
            [6, { name: 'sat', desc: 'Saturday', dow: 6, bitval: 32 }],
            [7, { name: 'sun', desc: 'Sunday', dow: 0, bitval: 64 }]
        ]);
        this.valueMaps.groupCircuitStates = new byteValueMap([
            [1, { name: 'on', desc: 'On/Off' }],
            [2, { name: 'off', desc: 'Off/On' }],
            [3, { name: 'ignore', desc: 'Ignore' }],
            [4, { name: 'on+ignore', desc: 'On/Ignore' }],
            [5, { name: 'off+ignore', desc: 'Off/Ignore' }]
        ]);
        this.valueMaps.chlorinatorModel = new byteValueMap([
            [0, { name: 'unknown', desc: 'unknown', capacity: 0, chlorinePerDay: 0, chlorinePerSec: 0 }],
            [1, { name: 'intellichlor--15', desc: 'IntelliChlor IC15', capacity: 15000, chlorinePerDay: 0.60, chlorinePerSec: 0.60 / 86400 }],
            [2, { name: 'intellichlor--20', desc: 'IntelliChlor IC20', capacity: 20000, chlorinePerDay: 0.70, chlorinePerSec: 0.70 / 86400 }],
            [3, { name: 'intellichlor--40', desc: 'IntelliChlor IC40', capacity: 40000, chlorinePerDay: 1.40, chlorinePerSec: 1.4 / 86400 }],
            [4, { name: 'intellichlor--60', desc: 'IntelliChlor IC60', capacity: 60000, chlorinePerDay: 2, chlorinePerSec: 2 / 86400 }],
            [5, { name: 'aquarite-t15', desc: 'AquaRite T15', capacity: 40000, chlorinePerDay: 1.47, chlorinePerSec: 1.47 / 86400 }],
            [6, { name: 'aquarite-t9', desc: 'AquaRite T9', capacity: 30000, chlorinePerDay: 0.98, chlorinePerSec: 0.98 / 86400 }],
            [7, { name: 'aquarite-t5', desc: 'AquaRite T5', capacity: 20000, chlorinePerDay: 0.735, chlorinePerSec: 0.735 / 86400 }],
            [8, { name: 'aquarite-t3', desc: 'AquaRite T3', capacity: 15000, chlorinePerDay: 0.53, chlorinePerSec: 0.53 / 86400 }],
            [9, { name: 'aquarite-925', desc: 'AquaRite 925', capacity: 25000, chlorinePerDay: 0.98, chlorinePerSec: 0.98 / 86400 }],
            [10, { name: 'aquarite-940', desc: 'AquaRite 940', capacity: 40000, chlorinePerDay: 1.47, chlorinePerSec: 1.47 / 86400 }]
        ]);


        // Keep this around for now so I can fart with the custom names array.
        //this.valueMaps.customNames = new byteValueMap(
        //    sys.customNames.get().map((el, idx) => {
        //        return [idx + 200, { name: el.name, desc: el.name }];
        //    })
        //);
        this.valueMaps.scheduleDays.toArray = function () {
            let arrKeys = Array.from(this.keys());
            let arr = [];
            for (let i = 0; i < arrKeys.length; i++) arr.push(extend(true, { val: arrKeys[i] }, this.get(arrKeys[i])));
            return arr;
        }
        this.valueMaps.scheduleDays.transform = function (byte) {
            let days = [];
            let b = byte & 0x007F;
            for (let bit = 6; bit >= 0; bit--) {
                if ((byte & (1 << bit)) > 0) days.push(extend(true, {}, this.get(bit + 1)));
            }
            return { val: b, days: days };
        };
        this.valueMaps.expansionBoards = new byteValueMap([
            [0, { name: 'nxp', part: 'NXP', desc: 'Nixie Single Body', bodies: 1, valves: 0, single: true, shared: false, dual: false }],
            [1, { name: 'nxps', part: 'NXPS', desc: 'Nixie Shared Body', bodies: 2, valves: 2, shared: true, dual: false, chlorinators: 1, chemControllers: 1 }],
            [2, { name: 'nxpd', part: 'NXPD', desc: 'Nixie Dual Body', bodies: 2, valves: 0, shared: false, dual: true, chlorinators: 2, chemControllers: 2 }],
            [255, { name: 'nxnb', part: 'NXNB', desc: 'Nixie No Body', bodies: 0, valves: 0, shared: false, dual: false, chlorinators: 0, chemControllers: 0 }]
        ]);
        this.valueMaps.virtualCircuits = new byteValueMap([
            [237, { name: 'heatBoost', desc: 'Heat Boost' }],
            [238, { name: 'heatEnable', desc: 'Heat Enable' }],
            [239, { name: 'pumpSpeedUp', desc: 'Pump Speed +' }],
            [240, { name: 'pumpSpeedDown', desc: 'Pump Speed -' }],
            [244, { name: 'poolHeater', desc: 'Pool Heater' }],
            [245, { name: 'spaHeater', desc: 'Spa Heater' }],
            [246, { name: 'freeze', desc: 'Freeze' }],
            [247, { name: 'poolSpa', desc: 'Pool/Spa' }],
            [251, { name: 'heater', desc: 'Heater' }],
            [252, { name: 'solar', desc: 'Solar' }],
            [253, { name: 'solar1', desc: 'Solar Body 1' }],
            [254, { name: 'solar2', desc: 'Solar Body 2' }],
            [255, { name: 'solar3', desc: 'Solar Body 3' }],
            [256, { name: 'solar4', desc: 'Solar Body 4' }],
            [257, { name: 'poolHeatEnable', desc: 'Pool Heat Enable' }],
            [258, { name: 'anyHeater', desc: 'Any Heater' }],
            [259, { name: 'heatpump', desc: 'Heat Pump'}]
        ]);
        this.valueMaps.scheduleTimeTypes.merge([
            [1, { name: 'sunrise', desc: 'Sunrise' }],
            [2, { name: 'sunset', desc: 'Sunset' }]
        ]);

        this.valueMaps.lightThemes = new byteValueMap([
            // IntelliBrite Themes
            [0, { name: 'white', desc: 'White', types: ['intellibrite', 'magicstream'], sequence: 11 }],
            [1, { name: 'green', desc: 'Green', types: ['intellibrite', 'magicstream'], sequence: 9 }],
            [2, { name: 'blue', desc: 'Blue', types: ['intellibrite', 'magicstream'], sequence: 8 }],
            [3, { name: 'magenta', desc: 'Magenta', types: ['intellibrite', 'magicstream'], sequence: 12 }],
            [4, { name: 'red', desc: 'Red', types: ['intellibrite', 'magicstream'], sequence: 10 }],
            [5, { name: 'sam', desc: 'SAm Mode', types: ['intellibrite', 'magicstream'], sequence: 1 }],
            [6, { name: 'party', desc: 'Party', types: ['intellibrite', 'magicstream'], sequence: 2 }],
            [7, { name: 'romance', desc: 'Romance', types: ['intellibrite', 'magicstream'], sequence: 3 }],
            [8, { name: 'caribbean', desc: 'Caribbean', types: ['intellibrite', 'magicstream'], sequence: 4 }],
            [9, { name: 'american', desc: 'American', types: ['intellibrite', 'magicstream'], sequence: 5 }],
            [10, { name: 'sunset', desc: 'Sunset', types: ['intellibrite', 'magicstream'], sequence: 6 }],
            [11, { name: 'royal', desc: 'Royal', types: ['intellibrite', 'magicstream'], sequence: 7 }],
            // ColorLogic Themes
            [20, { name: 'cloudwhite', desc: 'Cloud White', types: ['colorlogic'], sequence: 7 }],
            [21, { name: 'deepsea', desc: 'Deep Sea', types: ['colorlogic'], sequence: 2 }],
            [22, { name: 'royalblue', desc: 'Royal Blue', types: ['colorlogic'], sequence: 3 }],
            [23, { name: 'afternoonskies', desc: 'Afternoon Skies', types: ['colorlogic'], sequence: 4 }],
            [24, { name: 'aquagreen', desc: 'Aqua Green', types: ['colorlogic'], sequence: 5 }],
            [25, { name: 'emerald', desc: 'Emerald', types: ['colorlogic'], sequence: 6 }],
            [26, { name: 'warmred', desc: 'Warm Red', types: ['colorlogic'], sequence: 8 }],
            [27, { name: 'flamingo', desc: 'Flamingo', types: ['colorlogic'], sequence: 9 }],
            [28, { name: 'vividviolet', desc: 'Vivid Violet', types: ['colorlogic'], sequence: 10 }],
            [29, { name: 'sangria', desc: 'Sangria', types: ['colorlogic'], sequence: 11 }],
            [30, { name: 'voodoolounge', desc: 'Voodoo Lounge', types: ['colorlogic'], sequence: 1 }],
            [31, { name: 'twilight', desc: 'Twilight', types: ['colorlogic'], sequence: 12 }],
            [32, { name: 'tranquility', desc: 'Tranquility', types: ['colorlogic'], sequence: 13 }],
            [33, { name: 'gemstone', desc: 'Gemstone', types: ['colorlogic'], sequence: 14 }],
            [34, { name: 'usa', desc: 'USA', types: ['colorlogic'], sequence: 15 }],
            [35, { name: 'mardigras', desc: 'Mardi Gras', types: ['colorlogic'], sequence: 16 }],
            [36, { name: 'coolcabaret', desc: 'Cabaret', types: ['colorlogic'], sequence: 17 }],
            // Sunseeker PoolTone Themes
            [40, { name: 'eveningsea', desc: 'Evening Sea', types: ['pooltone'], sequence: 1 }],
            [41, { name: 'eveningrivers', desc: 'Evening Rivers', types: ['pooltone'], sequence: 2 }],
            [42, { name: 'riviera', desc: 'Riviera', types: ['pooltone'], sequence: 3 }],
            [43, { name: 'neutralwhite', desc: 'Neutral White', types: ['pooltone'], sequence: 4 }],
            [44, { name: 'rainbow', desc: 'Rainbow', types: ['pooltone'], sequence: 5 }],
            [45, { name: 'colorriver', desc: 'Color River', types: ['pooltone'], sequence: 6 }],
            [46, { name: 'disco', desc: 'Disco', types: ['pooltone'], sequence: 7 }],
            [47, { name: 'fourseasons', desc: 'Four Seasons', types: ['pooltone'], sequence: 8 }],
            [48, { name: 'Party', desc: 'Party', types: ['pooltone'], sequence: 9 }],
            [49, { name: 'sunwhite', desc: 'Sun White', types: ['pooltone'], sequence: 10 }],
            [50, { name: 'red', desc: 'Red', types: ['pooltone'], sequence: 11 }],
            [51, { name: 'green', desc: 'Green', types: ['pooltone'], sequence: 12 }],
            [52, { name: 'blue', desc: 'Blue', types: ['pooltone'], sequence: 13 }],
            [53, { name: 'greenblue', desc: 'Green-Blue', types: ['pooltone'], sequence: 14 }],
            [54, { name: 'redgreen', desc: 'Red-Green', types: ['pooltone'], sequence: 15 }],
            [55, { name: 'bluered', desc: 'Blue-red', types: ['pooltone'], sequence: 16 }],
            // Jandy Pro Series WaterColors Themes
            [56, { name: 'alpinewhite', desc: 'Alpine White', types: ['watercolors'], sequence: 1 }],
            [57, { name: 'skyblue', desc: 'Sky Blue', types: ['watercolors'], sequence: 2 }],
            [58, { name: 'cobaltblue', desc: 'Cobalt Blue', types: ['watercolors'], sequence: 3 }],
            [59, { name: 'caribbeanblue', desc: 'Caribbean Blue', types: ['watercolors'], sequence: 4 }],
            [60, { name: 'springgreen', desc: 'Spring Green', types: ['watercolors'], sequence: 5 }],
            [61, { name: 'emeraldgreen', desc: 'Emerald Green', types: ['watercolors'], sequence: 6 }],
            [62, { name: 'emeraldrose', desc: 'Emerald Rose', types: ['watercolors'], sequence: 7 }],
            [63, { name: 'magenta', desc: 'Magenta', types: ['watercolors'], sequence: 8 }],
            [64, { name: 'violet', desc: 'Violet', types: ['watercolors'], sequence: 9 }],
            [65, { name: 'slowcolorsplash', desc: 'Slow Color Splash', types: ['watercolors'], sequence: 10 }],
            [66, { name: 'fastcolorsplash', desc: 'Fast Color Splash', types: ['watercolors'], sequence: 11 }],
            [67, { name: 'americathebeautiful', desc: 'America the Beautiful', types: ['watercolors'], sequence: 12 }],
            [68, { name: 'fattuesday', desc: 'Fat Tuesday', types: ['watercolors'], sequence: 13 }],
            [69, { name: 'discotech', desc: 'Disco Tech', types: ['watercolors'], sequence: 14 }],
            [255, { name: 'none', desc: 'None' }]
        ]);
        this.valueMaps.lightColors = new byteValueMap([
            [0, { name: 'white', desc: 'White' }],
            [16, { name: 'lightgreen', desc: 'Light Green' }],
            [32, { name: 'green', desc: 'Green' }],
            [48, { name: 'cyan', desc: 'Cyan' }],
            [64, { name: 'blue', desc: 'Blue' }],
            [80, { name: 'lavender', desc: 'Lavender' }],
            [96, { name: 'magenta', desc: 'Magenta' }],
            [112, { name: 'lightmagenta', desc: 'Light Magenta' }]
        ]);
        this.valueMaps.heatSources = new byteValueMap([
            [1, { name: 'off', desc: 'Off' }],
            [2, { name: 'heater', desc: 'Heater' }],
            [3, { name: 'solar', desc: 'Solar Only' }],
            [4, { name: 'solarpref', desc: 'Solar Preferred' }],
            [5, { name: 'ultratemp', desc: 'Ultratemp Only' }],
            [6, { name: 'ultratemppref', desc: 'Ultratemp Pref' }],
            [9, { name: 'heatpump', desc: 'Heatpump Only' }],
            [25, { name: 'heatpumppref', desc: 'Heatpump Pref' }],
            [32, { name: 'nochange', desc: 'No Change' }]
        ]);
        this.valueMaps.heatStatus = new byteValueMap([
            [0, { name: 'off', desc: 'Off' }],
            [1, { name: 'heater', desc: 'Heater' }],
            [2, { name: 'solar', desc: 'Solar' }],
            [3, { name: 'cooling', desc: 'Cooling' }],
            [6, { name: 'mtheat', desc: 'Heater' }],
            [4, { name: 'hpheat', desc: 'Heating' }],
            [8, { name: 'hpcool', desc: 'Cooling' }],
            [128, {name: 'cooldown', desc: 'Cooldown'}]
        ]);
        this.valueMaps.scheduleTypes = new byteValueMap([
            [0, { name: 'runonce', desc: 'Run Once', startDate: true, startTime: true, endTime: true, days: false, heatSource: true, heatSetpoint: true }],
            [128, { name: 'repeat', desc: 'Repeats', startDate: false, startTime: true, endTime: true, days: 'multi', heatSource: true, heatSetpoint: true }]
        ]);
        this.valueMaps.remoteTypes = new byteValueMap([
            [0, { name: 'none', desc: 'Not Installed', maxButtons: 0 }],
            [1, { name: 'is4', desc: 'iS4 Spa-Side Remote', maxButtons: 4 }],
            [2, { name: 'is10', desc: 'iS10 Spa-Side Remote', maxButtons: 10 }],
            [3, { name: 'quickTouch', desc: 'Quick Touch Remote', maxButtons: 4 }],
            [4, { name: 'spaCommand', desc: 'Spa Command', maxButtons: 10 }]
        ]);
    }
    public async closeAsync() {
        logger.info(`Closing Nixie Board`);
        await ncp.closeAsync();
    }
    public async checkConfiguration() {
        state.status = sys.board.valueMaps.controllerStatus.transform(0, 0);
        state.emitControllerChange();
        // Set all the schedule data based upon the config.
        for (let i = 0; i < sys.schedules.length; i++) {
            let sched = sys.schedules.getItemByIndex(i);
            let ssched = state.schedules.getItemById(sched.id, true);
            ssched.circuit = sched.circuit;
            ssched.scheduleDays = sched.scheduleDays;
            ssched.scheduleType = sched.scheduleType;
            ssched.changeHeatSetpoint = sched.changeHeatSetpoint;
            ssched.heatSetpoint = sched.heatSetpoint;
            ssched.coolSetpoint = sched.coolSetpoint;
            ssched.heatSource = sched.heatSource;
            ssched.startTime = sched.startTime;
            ssched.endTime = sched.endTime;
            ssched.startTimeType = sched.startTimeType;
            ssched.endTimeType = sched.endTimeType;
            ssched.startDate = sched.startDate;
            ssched.isActive = sched.isActive = true;
            sched.disabled = sched.disabled;
            ssched.display = sched.display;

        }

        state.status = sys.board.valueMaps.controllerStatus.transform(1, 100);
        state.emitControllerChange();
    }
    public async initNixieBoard() {
        try {
            this.killStatusCheck();
            let self = this;
            sys.general.options.clockSource = 'server';
            state.status = sys.board.valueMaps.controllerStatus.transform(0, 0);
            // First lets clear out all the messages.
            state.equipment.messages.removeItemByCode('EQ')
            // Set up all the default information for the controller.  This should be done
            // for the startup of the system.  The equipment installed at module 0 is the main
            // system descriptor.
            let mod = sys.equipment.modules.getItemById(0, true);
            mod.master = 1;
            //[0, { name: 'nxp', part: 'NXP', desc: 'Nixie Single Body', bodies: 1, valves: 2, shared: false, dual: false }],
            //[1, { name: 'nxps', part: 'NXPS', desc: 'Nixie Shared Body', bodies: 2, valves: 4, shared: true, dual: false, chlorinators: 1, chemControllers: 1 }],
            //[2, { name: 'nxpd', part: 'NXPD', desc: 'Nixe Dual Body', bodies: 2, valves: 2, shared: false, dual: true, chlorinators: 2, chemControllers: 2 }],
            //[255, { name: 'nxu', part: 'Unspecified', desc: 'Nixie No Body', bodies: 0, valves: 0, shared: false, dual: false, chlorinators: 0, chemControllers: 0 }]
            let type = typeof mod.type !== 'undefined' ? this.valueMaps.expansionBoards.transform(mod.type) : this.valueMaps.expansionBoards.transform(0);
            logger.info(`Initializing Nixie Control Panel for ${type.desc}`);

            state.equipment.shared = sys.equipment.shared = type.shared;
            state.equipment.dual = sys.equipment.dual = type.dual;
            state.equipment.single = sys.equipment.single = sys.equipment.shared === false && sys.equipment.dual === false;
            sys.equipment.controllerFirmware = '1.0.0';
            mod.type = type.val;
            mod.part = type.part;
            let md = mod.get();
            md['bodies'] = type.bodies;
            md['part'] = type.part;
            md['valves'] = type.valves;
            mod.name = type.name;
            sys.equipment.model = mod.desc = type.desc;
            state.equipment.maxValves = sys.equipment.maxValves = 32;
            state.equipment.maxCircuits = sys.equipment.maxCircuits = 40;
            state.equipment.maxFeatures = sys.equipment.maxFeatures = 32;
            state.equipment.maxHeaters = sys.equipment.maxHeaters = 16;
            state.equipment.maxLightGroups = sys.equipment.maxLightGroups = 16;
            state.equipment.maxCircuitGroups = sys.equipment.maxCircuitGroups = 16;
            state.equipment.maxSchedules = sys.equipment.maxSchedules = 100;
            state.equipment.maxPumps = sys.equipment.maxPumps = 16;
            state.equipment.controllerType = sys.controllerType;
            sys.equipment.maxCustomNames = 0;
            state.equipment.model = type.desc;
            state.equipment.maxBodies = sys.equipment.maxBodies = type.bodies;
            let bodyUnits = sys.general.options.units === 0 ? 1 : 2;
            sys.equipment.single = typeof type.single !== 'undefined' ? type.single : false;

            if (typeof state.temps.units === 'undefined' || state.temps.units < 0) state.temps.units = sys.general.options.units;
            if (type.bodies > 0) {
                let pool = sys.bodies.getItemById(1, true);
                let sbody = state.temps.bodies.getItemById(1, true);
                if (typeof pool.type === 'undefined') pool.type = 0;
                if (typeof pool.name === 'undefined') pool.name = type.dual ? 'Body 1' : 'Pool';
                if (typeof pool.capacity === 'undefined') pool.capacity = 0;
                if (typeof pool.setPoint === 'undefined') pool.setPoint = 0;
                pool.circuit = 6;
                pool.isActive = true;
                pool.master = 1;
                pool.capacityUnits = bodyUnits;
                sbody.name = pool.name;
                sbody.setPoint = pool.setPoint;
                sbody.circuit = pool.circuit;
                sbody.type = pool.type;
                // We need to add in a circuit for 6.
                let circ = sys.circuits.getItemById(6, true, { name: pool.name, showInFeatures: false });
                let scirc = state.circuits.getItemById(6, true);
                //[12, { name: 'pool', desc: 'Pool', hasHeatSource: true }],
                //[13, { name: 'spa', desc: 'Spa', hasHeatSource: true }]
                circ.type = 12;
                if (typeof circ.showInFeatures === 'undefined') circ.showInFeatures = false;
                circ.isActive = true;
                circ.master = 1;
                scirc.showInFeatures = circ.showInFeatures;
                scirc.type = circ.type;
                scirc.name = circ.name;
                if (type.shared || type.dual) {
                    // We are going to add two bodies and prune off the othergood ls.
                    let spa = sys.bodies.getItemById(2, true);
                    if (typeof spa.type === 'undefined') spa.type = type.dual ? 0 : 1;
                    if (typeof spa.name === 'undefined') spa.name = type.dual ? 'Body 2' : 'Spa';
                    if (typeof spa.capacity === 'undefined') spa.capacity = 0;
                    if (typeof spa.setPoint === 'undefined') spa.setPoint = 0;
                    circ = sys.circuits.getItemById(1, true, {name: spa.name, showInFeatures: false });
                    circ.type = type.dual ? 12 : 13;
                    circ.isActive = true;
                    circ.master = 1;
                    spa.circuit = 1;
                    spa.isActive = true;
                    spa.master = 1;
                    sbody = state.temps.bodies.getItemById(2, true);
                    sbody.name = spa.name;
                    sbody.setPoint = spa.setPoint;
                    sbody.circuit = spa.circuit;
                    sbody.type = spa.type;
                    spa.capacityUnits = bodyUnits;
                    scirc = state.circuits.getItemById(1, true);
                    scirc.showInFeatures = circ.showInFeatures;
                    scirc.type = circ.type;
                    scirc.name = circ.name;
                }
                else {
                    // Remove the items that are not part of our board.
                    sys.bodies.removeItemById(2);
                    state.temps.bodies.removeItemById(2);
                    sys.circuits.removeItemById(1);
                    state.circuits.removeItemById(1);
                }
            }
            else {
                sys.bodies.removeItemById(1);
                sys.bodies.removeItemById(2);
                state.temps.bodies.removeItemById(1);
                state.temps.bodies.removeItemById(2);
                sys.circuits.removeItemById(1);
                state.circuits.removeItemById(1);
                sys.circuits.removeItemById(6);
                state.circuits.removeItemById(6);
            }

            sys.equipment.setEquipmentIds();
            sys.board.bodies.initFilters();
            state.status = sys.board.valueMaps.controllerStatus.transform(2, 0);
            // Add up all the stuff we need to initialize.
            let total = sys.bodies.length;
            total += sys.circuits.length;
            total += sys.heaters.length;
            total += sys.chlorinators.length;
            total += sys.chemControllers.length;
            total += sys.filters.length;
            total += sys.pumps.length;
            total += sys.valves.length;
            total += sys.schedules.length;
            this.initValves();
            sys.board.heaters.initTempSensors();
            await this.verifySetup();
            await ncp.initAsync(sys);
            sys.board.heaters.updateHeaterServices();
            state.cleanupState();
            logger.info(`${sys.equipment.model} control board initialized`);
            //state.status = sys.board.valueMaps.controllerStatus.transform(1, 100);
            state.mode = sys.board.valueMaps.panelModes.encode('auto');
            // At this point we should have the start of a board so lets check to see if we are ready or if we are stuck initializing.
            await setTimeout(5000);
            state.status = sys.board.valueMaps.controllerStatus.transform(1, 100);
            await self.processStatusAsync();
        } catch (err) { state.status = 255; logger.error(`Error Initializing Nixie Control Panel ${err.message}`); }
    }
    public initValves() {
        logger.info(`Initializing Intake/Return valves`);
        let iv = sys.valves.find(elem => elem.isIntake === true);
        let rv = sys.valves.find(elem => elem.isReturn === true);
        if (sys.equipment.shared) {
            if (typeof iv === 'undefined') iv = sys.valves.getItemById(sys.valves.getMaxId(false, 0) + 1, true);
            iv.isIntake = true;
            iv.isReturn = false;
            iv.type = 0;
            iv.name = 'Intake';
            iv.circuit = 247;
            iv.isActive = true;
            iv.master = 1;
            if (typeof rv === 'undefined') rv = sys.valves.getItemById(sys.valves.getMaxId(false, 0) + 1, true);
            rv.isIntake = false;
            rv.isReturn = true;
            rv.name = 'Return';
            rv.type = 0;
            rv.circuit = 247;
            rv.isActive = true;
            rv.master = 1;

        }
        else {
            if (typeof iv !== 'undefined') {
                sys.valves.removeItemById(iv.id);
                state.valves.removeItemById(iv.id);
            }
            if (typeof rv !== 'undefined') {
                sys.valves.removeItemById(rv.id);
                state.valves.removeItemById(rv.id);
            }
        }
    }
    public async verifySetup() {
        try {
            // In here we are going to attempt to check all the nixie relays.  We will not check the other equipment just the items
            // that make up a raw pool like the circuits.  The other stuff is the stuff of the equipment control.
            let circs = sys.circuits.toArray().filter((val) => { return val.controller === 1; });
            for (let i = 0; i < circs.length; i++) {
                let circ = circs[i];
                // Make sure we have a circuit identified in the ncp if it is controlled by Nixie.
                let c = await ncp.circuits.initCircuitAsync(circ);
                // Now we should have the circuit from nixie so check the status to see if it can be
                // controlled. i.e. The comms are up.
                await c.validateSetupAsync(circ, state.circuits.getItemById(circ.id))
            }
            // Now we need to validate the heaters.  Some heaters will be connected via a relay.  If they have comms we will check it.
            let heaters = sys.heaters.toArray().filter((val) => { return val.controller === 1 });
            for (let i = 0; i < heaters.length; i++) {
                let heater = heaters[i];
                let h = await ncp.heaters.initHeaterAsync(heater);
            }
            // If we have relay based pumps, init them here... ss, ds, superflo
            let pumps = sys.heaters.toArray().filter((val) => { return val.controller === 1 });
            for (let i = 0; i < pumps.length; i++) {
                let pump = pumps[i];
                if (pump.type === 65){ // how are we defining ss and superflo?
                    await ncp.pumps.initPumpAsync(pump);
                }
            }
        } catch (err) { logger.error(`Error verifying setup`); }
    }
    public equipmentMaster = 1;
    public system: NixieSystemCommands = new NixieSystemCommands(this);
    public circuits: NixieCircuitCommands = new NixieCircuitCommands(this);
    public features: NixieFeatureCommands = new NixieFeatureCommands(this);
    //public chlorinator: NixieChlorinatorCommands = new NixieChlorinatorCommands(this);
    public bodies: NixieBodyCommands = new NixieBodyCommands(this);
    public filters: NixieFilterCommands = new NixieFilterCommands(this);
    public pumps: NixiePumpCommands = new NixiePumpCommands(this);
    //public schedules: NixieScheduleCommands = new NixieScheduleCommands(this);
    public heaters: NixieHeaterCommands = new NixieHeaterCommands(this);
    public valves: NixieValveCommands = new NixieValveCommands(this);
    public chemControllers: NixieChemControllerCommands = new NixieChemControllerCommands(this);
    public async setControllerType(obj): Promise<Equipment> {
        try {
            if (typeof obj.model === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Nixie: Controller model not supplied`, 'model', obj.model));
            let mt = this.valueMaps.expansionBoards.findItem(obj.model);
            if (typeof mt === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Nixie: A valid Controller model not supplied ${obj.model}`, 'model', obj.model));
            this.killStatusCheck();
            let mod = sys.equipment.modules.getItemById(0, true);
            mod.type = mt.val;
            await this.initNixieBoard();
            state.emitControllerChange();
            return sys.equipment;
        } catch (err) { logger.error(`Error setting Nixie controller type.`); }
    }
}
export class NixieBodyCommands extends BodyCommands {

}
export class NixieFilterCommands extends FilterCommands {
    public async setFilterStateAsync(filter: Filter, fstate: FilterState, isOn: boolean) {
        try {
            await ncp.filters.setFilterStateAsync(fstate, isOn);
        }
        catch (err) { return Promise.reject(new BoardProcessError(`Nixie: Error setFiterStateAsync ${err.message}`, 'setFilterStateAsync')); }
    }
}
export class NixieSystemCommands extends SystemCommands {
    protected _modeTimer: NodeJS.Timeout;
    public cancelDelay(): Promise<any> {
        delayMgr.cancelPumpValveDelays();
        delayMgr.cancelHeaterCooldownDelays();
        delayMgr.cancelHeaterStartupDelays();
        delayMgr.cancelCleanerStartDelays();
        delayMgr.cancelManualPriorityDelays();
        state.delay = sys.board.valueMaps.delay.getValue('nodelay');
        return Promise.resolve(state.data.delay);
    }
    public setManualOperationPriority(id: number): Promise<any> {
        let cstate = state.circuits.getInterfaceById(id);
        delayMgr.setManualPriorityDelay(cstate);
        return Promise.resolve(cstate);
    }
    public setDateTimeAsync(obj: any): Promise<any> { return Promise.resolve(); }
    public getDOW() { return this.board.valueMaps.scheduleDays.toArray(); }
    public async setGeneralAsync(obj: any): Promise<General> {
        let general = sys.general.get();
        if (typeof obj.alias === 'string') sys.general.alias = obj.alias;
        if (typeof obj.options !== 'undefined') await sys.board.system.setOptionsAsync(obj.options);
        if (typeof obj.location !== 'undefined') await sys.board.system.setLocationAsync(obj.location);
        if (typeof obj.owner !== 'undefined') await sys.board.system.setOwnerAsync(obj.owner);
        return new Promise<General>(function (resolve, reject) { resolve(sys.general); });
    }
    public async setModelAsync(obj: any) {
        try {
            // First things first.

        } catch (err) { return logger.error(`Error setting Nixie Model: ${err.message}`); }
    }
    public async setPanelModeAsync(data: any): Promise<any> {
        let mode = sys.board.valueMaps.panelModes.findItem(data.mode);
        let timeout = parseInt(data.timeout, 10);
        if (typeof mode === 'undefined') return Promise.reject(new ServiceParameterError(`Invalid mode value cannot set mode`, 'setPanelModeAsync', 'mode', data.mode));
        switch (mode.name) {
            case 'timeout':
                if (isNaN(timeout) || timeout <= 0) return Promise.reject(new ServiceParameterError(`Invalid timeout value cannot set mode`, 'setPanelModeAsync', 'timeout', data.timeout));
                await this.initServiceMode(mode, timeout);
                break;
            case 'service':
                await this.initServiceMode(mode);
                break;
            case 'auto':
                // Ok we are switching back to auto.
                // 1. Kill the timeout timer if it exists.
                // 2. Set the mode to auto.
                if (this._modeTimer) clearTimeout(this._modeTimer);
                this._modeTimer = null;
                state.mode = 0;
                webApp.emitToClients('panelMode', { mode: mode, remaining: 0 });
                break;
        }
    }
    private checkServiceTimeout(mode: any, start: number, timeout: number, interval?: number) {
        if (this._modeTimer) clearTimeout(this._modeTimer);
        this._modeTimer = null;
        // The timeout is in seconds so we will need to deal with that.
        let elapsed = (new Date().getTime() - start) / 1000;
        let remaining = timeout - elapsed;
        logger.info(`Timeout: ${timeout} Elapsed: ${elapsed}`);
        if (remaining > 0) {
            webApp.emitToClients('panelMode', { mode: mode, remaining: remaining, elapsed: elapsed, timeout: timeout });
            this._modeTimer = setTimeoutSync(() => { this.checkServiceTimeout(mode, start, timeout, interval || 1000); }, interval || 1000);
        }
        else {
            webApp.emitToClients('panelMode', { mode: sys.board.valueMaps.panelModes.transform(0), remaining: 0 });
            state.mode = 0;
        }
    }
    public async initServiceMode(mode, timeout?: number) {
        if (this._modeTimer) clearTimeout(this._modeTimer);
        for (let i = 0; i < sys.circuits.length; i++) {
            let circ = sys.circuits.getItemByIndex(i);
            if (circ.master === 1) {
                let cstate = state.circuits.getItemById(circ.id);
                if (cstate.isOn) await sys.board.circuits.setCircuitStateAsync(circ.id, false, true);
            }
        }
        delayMgr.clearAllDelays();
        state.mode = mode.val;
        // Shut everything down.
        await ncp.setServiceModeAsync();
        if (timeout > 0) {
            let start = new Date().getTime();
            this.checkServiceTimeout(mode, start, timeout, 1000);
            webApp.emitToClients('panelMode', { mode: mode, remaining: timeout, elapsed: 0, timeout: timeout });
        }
        else {
            webApp.emitToClients('panelMode', { mode: mode });
        }

    }
}
export class NixieCircuitCommands extends CircuitCommands {
    // This is our poll loop for circuit relay states.
    public async syncCircuitRelayStates() {
        try {
            if (state.mode !== 0) return;
            for (let i = 0; i < sys.circuits.length; i++) {
                // Run through all the controlled circuits to see whether they should be triggered or not.
                let circ = sys.circuits.getItemByIndex(i);
                if (circ.master === 1 && circ.isActive) {
                    let cstate = state.circuits.getItemById(circ.id);
                    if (cstate.isOn) await ncp.circuits.setCircuitStateAsync(cstate, cstate.isOn);
                }
            }
        } catch (err) { logger.error(`syncCircuitRelayStates: Error synchronizing circuit relays ${err.message}`); }
    }
    public async setCircuitStateAsync(id: number, val: boolean, ignoreDelays?: boolean): Promise<ICircuitState> {
        sys.board.suspendStatus(true);
        try {
            // We need to do some routing here as it is now critical that circuits, groups, and features
            // have their own processing.  The virtual controller used to only deal with one circuit.
            if (sys.board.equipmentIds.circuitGroups.isInRange(id))
                return await sys.board.circuits.setCircuitGroupStateAsync(id, val);
            else if (sys.board.equipmentIds.features.isInRange(id))
                return await sys.board.features.setFeatureStateAsync(id, val);


            let circuit: ICircuit = sys.circuits.getInterfaceById(id, false, { isActive: false });
            if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Circuit or Feature id ${id} not valid`, id, 'Circuit'));
            let circ = state.circuits.getInterfaceById(id, circuit.isActive !== false);
            if (state.mode !== 0) return circ;
            if (circ.stopDelay) {
                // Send this off so that the relays are properly set.  In the end we cannot change right now.  If this
                // happens to be a body circuit then the relay state will be skipped anyway.
                await ncp.circuits.setCircuitStateAsync(circ, circ.isOn);
                return circ;
            }
            let newState = utils.makeBool(val);
            let ctype = sys.board.valueMaps.circuitFunctions.getName(circ.type);
            // Filter out any special circuit types.
            switch (ctype) {
                case 'pool':
                case 'spa':
                    await this.setBodyCircuitStateAsync(id, newState, ignoreDelays);
                    break;
                case 'mastercleaner':
                case 'mastercleaner2':
                    await this.setCleanerCircuitStateAsync(id, newState, ignoreDelays);
                    break;
                case 'spillway':
                    await this.setSpillwayCircuitStateAsync(id, newState, ignoreDelays);
                    break;
                case 'spadrain':
                    await this.setDrainCircuitStateAsync(id, newState, ignoreDelays);
                    break;
                default:
                    await ncp.circuits.setCircuitStateAsync(circ, newState);
                    break;
            }
            // Let the main nixie controller set the circuit state and affect the relays if it needs to.
            return state.circuits.getInterfaceById(circ.id);
        }
        catch (err) { logger.error(`Nixie: setCircuitState ${err.message}`); return Promise.reject(new BoardProcessError(`Nixie: Error setCircuitStateAsync ${err.message}`, 'setCircuitState')); }
        finally {
            state.emitEquipmentChanges();
            ncp.pumps.syncPumpStates();
            sys.board.suspendStatus(false);
            await sys.board.processStatusAsync();
        }
    }
    protected async setCleanerCircuitStateAsync(id: number, val: boolean, ignoreDelays?: boolean): Promise<ICircuitState> {
        try {
            let cstate = state.circuits.getItemById(id);
            let circuit = sys.circuits.getItemById(id);
            // We know which body the cleaner belongs to by an attribute on the circuit function.
            let ctype = sys.board.valueMaps.circuitFunctions.get(circuit.type);
            let bstate = state.temps.bodies.getItemById(ctype.body || 1);
            // Cleaner lockout should occur when
            // 1. The body circuit is off.
            // 2. The spillway mode is running.

            // Optional modes include
            // 1. The current body is heating with solar.

            // Lockouts are cleared when 
            // 1. The above conditions are no longer true.
            // 2. The user requests the circuit to be off.
            if (!val) {
                // We can always turn a cleaner circuit off. Even if a delay is underway.
                delayMgr.clearCleanerStartDelays(bstate.id);
                await ncp.circuits.setCircuitStateAsync(cstate, false);
            }
            else if (val) {
                logger.info(`Setting cleaner circuit ${cstate.name} to ${val}`);
                // Alright we are turning the cleaner on.
                // To turn on the cleaner circuit we must first ensure the body is on.  If it is not then we abort.
                if (!bstate.isOn) {
                    logger.info(`Cannot turn on cleaner circuit ${cstate.name}. ${bstate.name} is not running`);
                    await ncp.circuits.setCircuitStateAsync(cstate, false);
                    return cstate;
                }
                // If there is a drain circuit going shut that thing off.
                await this.turnOffDrainCircuits(ignoreDelays);
                // If solar is currently on and the cleaner solar delay is set then we need to calculate a delay
                // to turn on the cleaner.
                let delayTime = 0;
                let dtNow = new Date().getTime();
                if (typeof ignoreDelays === 'undefined' || !ignoreDelays) {
                    if (sys.general.options.cleanerSolarDelay && sys.general.options.cleanerSolarDelayTime > 0) {
                        let circBody = state.circuits.getItemById(bstate.circuit);
                        // If the body has not been on or the solar heater has not been on long enough then we need to delay the startup.
                        if (sys.board.valueMaps.heatStatus.getName(bstate.heatStatus) === 'solar') {
                            // Check for the solar delay.  We need to know when the heater first kicked in.  A cleaner and solar
                            // heater can run at the same time but the heater must be on long enough for the timer to expire.

                            // The reasoning behind this is so that the booster pump can be assured that there is sufficient pressure
                            // for it to start and any air from the solar has had time to purge through the system.
                            let heaters = sys.heaters.getSolarHeaters(bstate.id);
                            let startTime = 0;
                            for (let i = 0; i < heaters.length; i++) {
                                let heater = heaters.getItemByIndex(i);
                                let hstate = state.heaters.getItemById(heater.id);
                                startTime = Math.max(startTime, hstate.startTime.getTime());
                            }
                            // Lets see if we have a solar start delay.
                            delayTime = Math.max(Math.round(((sys.general.options.cleanerSolarDelayTime * 1000) - (dtNow - startTime))) / 1000, delayTime);
                        }
                    }
                    if (sys.general.options.cleanerStartDelay && sys.general.options.cleanerStartDelayTime) {
                        let bcstate = state.circuits.getItemById(bstate.circuit);
                        let stime = typeof bcstate.startTime === 'undefined' ? dtNow : (dtNow - bcstate.startTime.getTime());
                        // So we should be started.  Lets determine whethere there should be any delay.
                        delayTime = Math.max(Math.round(((sys.general.options.cleanerStartDelayTime * 1000) - stime) / 1000), delayTime);
                        logger.info(`Cleaner delay time calculated to ${delayTime}`);
                    }
                }
                if (delayTime > 5) delayMgr.setCleanerStartDelay(cstate, bstate.id, delayTime);
                else await ncp.circuits.setCircuitStateAsync(cstate, true);
            }
            return cstate;
        } catch (err) { return Promise.reject(new BoardProcessError(`Nixie: Error setting cleaner circuit state: ${err.message}`, 'setCleanerCircuitStateAsync')); }
    }
    protected async setBodyCircuitStateAsync(id: number, val: boolean, ignoreDelays?: boolean): Promise<CircuitState> {
        try {
            let cstate = state.circuits.getItemById(id);
            let circuit = sys.circuits.getItemById(id);
            let bstate = state.temps.bodies.getBodyByCircuitId(id);
            if (cstate.isOn === val) return; // If body is already in desired state, don't do anything.
            // https://github.com/tagyoureit/nodejs-poolController/issues/361#issuecomment-1186087763
            if (val) {
                // We are turning on a body circuit.
                logger.verbose(`Turning on a body circuit ${bstate.name}`);
                if (sys.equipment.shared === true) {
                    // If we are turning on and this is a shared system it means that we need to turn off
                    // the other circuit.
                    let delayPumps = false;
                    await this.turnOffDrainCircuits(ignoreDelays);
                    if (bstate.id === 2) await this.turnOffSpillwayCircuits();
                    if (sys.general.options.pumpDelay === true && ignoreDelays !== true) {
                        // Now that this is off check the valve positions.  If they are not currently in the correct position we need to delay any attached pump
                        // so that it does not come on while the valve is rotating.  Default 30 seconds.
                        let iValves = sys.valves.getIntake();
                        for (let i = 0; i < iValves.length && !delayPumps; i++) {
                            let vstate = state.valves.getItemById(iValves[i].id);
                            if (vstate.isDiverted === true && circuit.type === 12) delayPumps = true;
                            else if (vstate.isDiverted === false && circuit.type === 13) delayPumps = true;
                        }
                        if (!delayPumps) {
                            let rValves = sys.valves.getReturn();
                            for (let i = 0; i < rValves.length && !delayPumps; i++) {
                                let vstate = state.valves.getItemById(rValves[i].id);
                                if (vstate.isDiverted === true && circuit.type === 12) delayPumps = true;
                                else if (vstate.isDiverted === false && circuit.type === 13) delayPumps = true;
                            }
                        }
                    }
                    // If we are shared we need to turn off the other circuit.
                    let offType = circuit.type === 12 ? 13 : 12;
                    let off = sys.circuits.get().filter(elem => elem.type === offType);
                    let delayCooldown = false;
                    // Turn the circuits off that are part of the shared system.  We are going back to the board
                    // just in case we got here for a circuit that isn't on the current defined panel.
                    for (let i = 0; i < off.length; i++) {
                        let coff = off[i];
                        let bsoff = state.temps.bodies.getBodyByCircuitId(coff.id);
                        let csoff = state.circuits.getItemById(coff.id);
                        // Ensure the cleaner circuits for this body are off.
                        await this.turnOffCleanerCircuits(bsoff);
                        if (csoff.isOn) {
                            logger.verbose(`Turning off shared body ${coff.name} circuit`);
                            delayMgr.clearBodyStartupDelay(bsoff);
                            if (bsoff.heaterCooldownDelay && ignoreDelays !== true) {
                                // In this condition we are requesting that the shared body start when the cooldown delay
                                // has finished.  This will add this request to the cooldown delay code.  The setHeaterCooldownDelay
                                // code is expected to be re-entrant and checks the id so that it does not clear
                                // the original request if it is asked for again.

                                // NOTE:  There is room for improvement here.  For instance, if the result
                                // of turning on the circuit is that the heater(s) requiring cooldown will result in being on
                                // then why not cancel the current cooldown cycle and let the user get on with it.
                                // Consider:
                                // 1. Check each heater attached to the off body to see if it is also attached to the on body.
                                // 2. If the heater is attached check to see if there is any cooldown time left on it.
                                // 3. If the above conditions are true cancel the cooldown cycle.
                                logger.verbose(`${bsoff.name} is already in Cooldown mode`);
                                delayMgr.setHeaterCooldownDelay(bsoff, bstate);
                                delayCooldown = true;
                            }
                            else {
                                // We need to deal with heater cooldown delays here since you cannot turn off the body while the heater is
                                // cooling down.  This means we need to check to see if the heater requires cooldown then set a delay for it
                                // if it does.  The delay manager will shut the body off and start the new body when it is done.
                                let heaters = sys.board.heaters.getHeatersByCircuitId(circuit.id);
                                let cooldownTime = 0;
                                if (ignoreDelays !== true) {
                                    for (let j = 0; j < heaters.length; j++) {
                                        let nheater = ncp.heaters.find(x => x.id === heaters[j].id) as NixieHeaterBase;
                                        cooldownTime = Math.max(nheater.getCooldownTime(), cooldownTime);
                                    }
                                }
                                if (cooldownTime > 0) {
                                    // We need do start a cooldown cycle for the body.  If there is already
                                    // a cooldown underway this will append the on to it.
                                    delayMgr.setHeaterCooldownDelay(bsoff, bstate, cooldownTime * 1000);
                                    delayCooldown = true;
                                }
                                else {
                                    await ncp.circuits.setCircuitStateAsync(csoff, false);
                                    bsoff.isOn = false;
                                }
                            }
                        }
                    }
                    if (delayCooldown) return cstate;
                    if (delayPumps === true) sys.board.pumps.setPumpValveDelays([id, bstate.circuit]);
                }
                // Now we need to set the startup delay for all the heaters.  This is true whether
                // the system is shared or not so lets get a list of all the associated heaters for the body in question.
                if (sys.general.options.heaterStartDelay && sys.general.options.heaterStartDelayTime > 0) {
                    let heaters = sys.board.heaters.getHeatersByCircuitId(circuit.id);
                    for (let j = 0; j < heaters.length; j++) {
                        let hstate = state.heaters.getItemById(heaters[j].id);
                        delayMgr.setHeaterStartupDelay(hstate);
                    }
                }
                await ncp.circuits.setCircuitStateAsync(cstate, val);
                bstate.isOn = val;
            }
            else if (!val) {
                // Alright we are turning off a circuit that will result in a body shutting off.  If this
                // circuit is already under delay it should have been processed out earlier.
                delayMgr.cancelPumpValveDelays();
                delayMgr.cancelHeaterStartupDelays();
                sys.board.heaters.clearPrevHeaterOffTemp();
                if (cstate.startDelay) delayMgr.clearBodyStartupDelay(bstate);
                await this.turnOffCleanerCircuits(bstate);
                if (sys.equipment.shared && bstate.id === 2) await this.turnOffDrainCircuits(ignoreDelays);
                logger.verbose(`Turning off a body circuit ${circuit.name}`);
                if (cstate.isOn) {
                    // Check to see if we have any heater cooldown delays that need to take place.
                    let heaters = sys.board.heaters.getHeatersByCircuitId(circuit.id);
                    let cooldownTime = 0;
                    for (let j = 0; j < heaters.length; j++) {
                        let nheater = ncp.heaters.find(x => x.id === heaters[j].id) as NixieHeaterBase;
                        cooldownTime = Math.max(nheater.getCooldownTime(), cooldownTime);
                    }
                    if (cooldownTime > 0) {
                        logger.info(`Starting a Cooldown Delay ${cooldownTime}sec`);
                        // We need do start a cooldown cycle for the body.
                        delayMgr.setHeaterCooldownDelay(bstate, undefined, cooldownTime * 1000);
                    }
                    else {
                        await ncp.circuits.setCircuitStateAsync(cstate, val);
                        bstate.isOn = val;
                    }
                }
                else {
                    bstate.isOn = val;
                }
            }
            return cstate;
        } catch (err) { logger.error(`Nixie: Error setBodyCircuitStateAsync ${err.message}`); return Promise.reject(new BoardProcessError(`Nixie: Error setBodyCircuitStateAsync ${err.message}`, 'setBodyCircuitStateAsync')); }
    }
    protected async setSpillwayCircuitStateAsync(id: number, val: boolean, ignoreDelays?: boolean): Promise<CircuitState> {
        try {
            let cstate = state.circuits.getItemById(id);
            let delayPumps = false;
            if (cstate.isOn !== val) {
                if (sys.equipment.shared === true) {
                    // First we need to check to see if the pool is on.
                    if (val) {
                        let spastate = state.circuits.getItemById(1);
                        if (spastate.isOn) {
                            logger.warn(`Cannot turn ${cstate.name} on because ${spastate.name} is on`);
                            return cstate;
                        }
                        // If there are any drain circuits or features that are currently engaged we need to turn them off.
                        await this.turnOffDrainCircuits(ignoreDelays);
                        if (sys.general.options.pumpDelay && sys.general.options.valveDelayTime > 0) sys.board.pumps.setPumpValveDelays([6, id]);
                    }
                    else if (!val && !ignoreDelays) {
                        // If we are turning off and there is another circuit that ties to the same pumps then we need set a valve delay.  This means
                        // that if the pool circuit is on then we need to delay the pumps.  However, if there is no other circuit that needs
                        // the pump to be on, then no harm no foul a delay in the pump won't mean anything.

                        // Conditions where this should not delay.
                        // 1. Another spillway circuit or feature is on.
                        // 2. There is no other running circuit that will affect the intake or return.
                        let arrIds = sys.board.valves.getBodyValveCircuitIds(true);
                        if (arrIds.length > 1) {
                            if (sys.general.options.pumpDelay && sys.general.options.valveDelayTime > 0) {
                                sys.board.pumps.setPumpValveDelays([6, id]);
                            }
                        }
                    }
                }
            }
            logger.verbose(`Turning ${val ? 'on' : 'off'} a spillway circuit ${cstate.name}`);
            await ncp.circuits.setCircuitStateAsync(cstate, val);
            return cstate;
        } catch (err) { logger.error(`Nixie: Error setSpillwayCircuitStateAsync ${err.message}`); return Promise.reject(new BoardProcessError(`Nixie: Error setSpillwayCircuitStateAsync ${err.message}`, 'setBodyCircuitStateAsync')); }
    }
    protected async setDrainCircuitStateAsync(id: number, val: boolean, ignoreDelays?: boolean): Promise<CircuitState> {
        try {
            // Drain circuits can be very bad.  This is because they can be turned on then never turned off
            // we may want to create some limits are to how long they can be on or even force them off
            // if for instance the spa is not on.
            // RULES FOR DRAIN CIRCUITS:
            // 1. All spillway circuits must be off.
            let cstate = state.circuits.getItemById(id);
            let delayPumps = false;
            if (cstate.isOn !== val) {
                if (sys.equipment.shared === true) {
                    let spastate = state.temps.bodies.getItemById(2);
                    let poolstate = state.temps.bodies.getItemById(1);
                    // First we need to check to see if the pool is on.
                    if (val) {
                        if (spastate.isOn || spastate.startDelay || poolstate.isOn || poolstate.startDelay) {
                            logger.warn(`Cannot turn ${cstate.name} on because a body is on`);
                            return cstate;
                        }
                        // If there are any spillway circuits or features that are currently engaged we need to turn them off.
                        await this.turnOffSpillwayCircuits(true);
                        // If there are any cleaner circuits on for the main body turn them off.
                        await this.turnOffCleanerCircuits(state.temps.bodies.getItemById(1), true);
                        if (!ignoreDelays && sys.general.options.pumpDelay && sys.general.options.valveDelayTime > 0) sys.board.pumps.setPumpValveDelays([id, 1, 6]);
                    }
                    else if (!val && !ignoreDelays) {
                        if (!ignoreDelays && sys.general.options.pumpDelay && sys.general.options.valveDelayTime > 0) sys.board.pumps.setPumpValveDelays([id, 1, 6]);
                    }
                }
            }
            logger.verbose(`Turning ${val ? 'on' : 'off'} a drain circuit ${cstate.name}`);
            await ncp.circuits.setCircuitStateAsync(cstate, val);
            return cstate;
        } catch (err) { logger.error(`Nixie: Error setDrainCircuitStateAsync ${err.message}`); return Promise.reject(new BoardProcessError(`Nixie: Error setDrainCircuitStateAsync ${err.message}`, 'setDrainCircuitStateAsync')); }
    }

    public toggleCircuitStateAsync(id: number): Promise<ICircuitState> {
        let circ = state.circuits.getInterfaceById(id);
        return this.setCircuitStateAsync(id, !(circ.isOn || false));
    }
    public async setLightThemeAsync(id: number, theme: number) {
        if (sys.board.equipmentIds.circuitGroups.isInRange(id)) {
            await this.setLightGroupThemeAsync(id, theme);
            return Promise.resolve(state.lightGroups.getItemById(id));
        }
        let cstate = state.circuits.getItemById(id);
        if (state.mode !== 0) return cstate;
        let circ = sys.circuits.getItemById(id);
        let thm = sys.board.valueMaps.lightThemes.findItem(theme);
        if (typeof thm !== 'undefined' && typeof thm.sequence !== 'undefined' && circ.master === 1) {
            logger.info(`Setting light theme for ${circ.name} to ${thm.name} [${thm.sequence}]`);
            await ncp.circuits.setLightThemeAsync(id, thm);
        }
        cstate.lightingTheme = theme;
        return Promise.resolve(cstate as ICircuitState);
    }
    public setDimmerLevelAsync(id: number, level: number): Promise<ICircuitState> {
        let circ = state.circuits.getItemById(id);
        circ.level = level;
        return Promise.resolve(circ as ICircuitState);
    }
    public getCircuitReferences(includeCircuits?: boolean, includeFeatures?: boolean, includeVirtual?: boolean, includeGroups?: boolean) {
        let arrRefs = [];
        if (includeCircuits) {
            // RSG: converted this to getItemByIndex because hasHeatSource isn't actually stored as part of the data
            for (let i = 0; i < sys.circuits.length; i++) {
                let c = sys.circuits.getItemByIndex(i);
                arrRefs.push({ id: c.id, name: c.name, type: c.type, equipmentType: 'circuit', nameId: c.nameId, hasHeatSource: c.hasHeatSource });
            }
        }
        if (includeFeatures) {
            let features = sys.features.get();
            for (let i = 0; i < sys.features.length; i++) {
                let c = features[i];
                arrRefs.push({ id: c.id, name: c.name, type: c.type, equipmentType: 'feature', nameId: c.nameId });
            }
        }
        if (includeVirtual) {
            let vcs = sys.board.valueMaps.virtualCircuits.toArray();
            for (let i = 0; i < vcs.length; i++) {
                let c = vcs[i];
                arrRefs.push({ id: c.val, name: c.desc, equipmentType: 'virtual', assignableToPumpCircuit: c.assignableToPumpCircuit });
            }
        }
        if (includeGroups) {
            let groups = sys.circuitGroups.get();
            for (let i = 0; i < groups.length; i++) {
                let c = groups[i];
                arrRefs.push({ id: c.id, name: c.name, equipmentType: 'circuitGroup', nameId: c.nameId });
            }
            groups = sys.lightGroups.get();
            for (let i = 0; i < groups.length; i++) {
                let c = groups[i];
                arrRefs.push({ id: c.id, name: c.name, equipmentType: 'lightGroup', nameId: c.nameId });
            }
        }
        arrRefs.sort((a, b) => { return a.id > b.id ? 1 : a.id === b.id ? 0 : -1; });
        return arrRefs;
    }
    public getLightReferences() {
        let circuits = sys.circuits.get();
        let arrRefs = [];
        for (let i = 0; i < circuits.length; i++) {
            let c = circuits[i];
            let type = sys.board.valueMaps.circuitFunctions.transform(c.type);
            if (type.isLight) arrRefs.push({ id: c.id, name: c.name, type: c.type, equipmentType: 'circuit', nameId: c.nameId });
        }
        return arrRefs;
    }
    public getLightThemes(type?: number) {
        let tobj = (typeof type === 'undefined') ? sys.board.valueMaps.circuitFunctions.transformByName('intellibrite') : sys.board.valueMaps.circuitFunctions.transform(type);
        let arrThemes = sys.board.valueMaps.lightThemes.toArray();
        let arr = [];
        for (let i = 0; i < arrThemes.length; i++) {
            if (tobj.name === arrThemes[i].type) arr.push(arrThemes[i]);
        }
        return arr;
    }
    public getCircuitFunctions() {
        let cf = sys.board.valueMaps.circuitFunctions.toArray();
        if (!sys.equipment.shared) cf = cf.filter(x => { return x.name !== 'spillway' && x.name !== 'spadrain' });
        return cf;
    }
    public getCircuitNames() {
        return [...sys.board.valueMaps.circuitNames.toArray(), ...sys.board.valueMaps.customNames.toArray()];
    }
    public async setCircuitAsync(data: any): Promise<ICircuit> {
        try {
            let id = parseInt(data.id, 10);
            if (id <= 0 || isNaN(id)) {
                // You can add any circuit so long as it isn't 1 or 6.
                id = sys.circuits.getNextEquipmentId(sys.board.equipmentIds.circuits, [1, 6]);
            }
            if (isNaN(id) || !sys.board.equipmentIds.circuits.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid circuit id: ${data.id}`, data.id, 'Circuit'));
            let circuit = sys.circuits.getItemById(id, true);
            let scircuit = state.circuits.getItemById(id, true);
            scircuit.isActive = circuit.isActive = true;
            circuit.master = 1;
            if (data.name) circuit.name = scircuit.name = data.name;
            else if (!circuit.name && !data.name) circuit.name = scircuit.name = Circuit.getIdName(id);
            if (typeof data.type !== 'undefined' || typeof circuit.type === 'undefined') circuit.type = scircuit.type = parseInt(data.type, 10) || 0;
            if (typeof data.freeze !== 'undefined' || typeof circuit.freeze === 'undefined') circuit.freeze = utils.makeBool(data.freeze) || false;
            if (typeof data.showInFeatures !== 'undefined' || typeof data.showInFeatures === 'undefined') circuit.showInFeatures = scircuit.showInFeatures = utils.makeBool(data.showInFeatures);
            if (typeof data.dontStop !== 'undefined' && utils.makeBool(data.dontStop) === true) data.eggTimer = 1440;
            if (typeof data.eggTimer !== 'undefined' || typeof circuit.eggTimer === 'undefined') circuit.eggTimer = parseInt(data.eggTimer, 10) || 0;
            if (typeof data.connectionId !== 'undefined') circuit.connectionId = data.connectionId;
            if (typeof data.deviceBinding !== 'undefined') circuit.deviceBinding = data.deviceBinding;
            circuit.dontStop = circuit.eggTimer === 1440;
            // update end time in case egg timer is changed while circuit is on
            sys.board.circuits.setEndTime(circuit, scircuit, scircuit.isOn, true);
            sys.emitEquipmentChange();
            state.emitEquipmentChanges();
            ncp.circuits.setCircuitAsync(circuit, data);
            return circuit;
        } catch (err) { logger.error(`Error setting circuit data ${err.message}`); }
    }
    public async setCircuitGroupAsync(obj: any): Promise<CircuitGroup> {
        let group: CircuitGroup = null;
        let id = typeof obj.id !== 'undefined' ? parseInt(obj.id, 10) : -1;
        if (id <= 0) {
            // We are adding a circuit group so we need to get the next equipment id.  For circuit groups and light groups, they share ids.
            let range = sys.board.equipmentIds.circuitGroups;
            for (let i = range.start; i <= range.end; i++) {
                if (!sys.lightGroups.find(elem => elem.id === i) && !sys.circuitGroups.find(elem => elem.id === i)) {
                    id = i;
                    break;
                }
            }
        }
        if (typeof id === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Max circuit group id exceeded`, id, 'CircuitGroup'));
        if (isNaN(id) || !sys.board.equipmentIds.circuitGroups.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid circuit group id: ${obj.id}`, obj.id, 'CircuitGroup'));
        group = sys.circuitGroups.getItemById(id, true);
        let sgroup = state.circuitGroups.getItemById(id, true);
        return new Promise<CircuitGroup>((resolve, reject) => {
            if (typeof obj.name !== 'undefined') group.name = sgroup.name = obj.name;
            if (typeof obj.nameId !== 'undefined') sgroup.nameId = group.nameId =obj.nameId;
            if (typeof obj.dontStop !== 'undefined' && utils.makeBool(obj.dontStop) === true) obj.eggTimer = 1440;
            if (typeof obj.eggTimer !== 'undefined') group.eggTimer = Math.min(Math.max(parseInt(obj.eggTimer, 10), 0), 1440);
            if (typeof obj.showInFeatures !== 'undefined') sgroup.showInFeatures = group.showInFeatures = utils.makeBool(obj.showInFeatures);
            sgroup.type = group.type;

            group.dontStop = group.eggTimer === 1440;
            group.isActive = sgroup.isActive = true;

            if (typeof obj.circuits !== 'undefined') {
                for (let i = 0; i < obj.circuits.length; i++) {
                    let c = group.circuits.getItemByIndex(i, true, { id: i + 1 });
                    let cobj = obj.circuits[i];
                    if (typeof cobj.circuit !== 'undefined') c.circuit = cobj.circuit;
                    if (typeof cobj.desiredState !== 'undefined')
                        c.desiredState = parseInt(cobj.desiredState, 10);
                    else if (typeof cobj.desiredStateOn !== 'undefined') {
                        // Shim for prior interfaces that send desiredStateOn.
                        c.desiredState = utils.makeBool(cobj.desiredStateOn) ? 0 : 1;
                        //c.desiredStateOn = utils.makeBool(cobj.desiredStateOn);
                    }
                    //RKS: 09-26-20 There is no such thing as a lighting theme on a circuit group circuit.  That is what lighGroups are for.
                    //if (typeof cobj.lightingTheme !== 'undefined') c.lightingTheme = parseInt(cobj.lightingTheme, 10);
                }
                group.circuits.length = obj.circuits.length;  // RSG - removed as this will delete circuits that were not changed
            }
            // update end time in case group is changed while circuit is on
            sys.board.circuits.setEndTime(group, sgroup, sgroup.isOn, true);
            resolve(group);
        });

    }
    public async setLightGroupAsync(obj: any): Promise<LightGroup> {
        let group: LightGroup = null;
        let id = typeof obj.id !== 'undefined' ? parseInt(obj.id, 10) : -1;
        if (id <= 0) {
            // We are adding a circuit group so we need to get the next equipment id.  For circuit groups and light groups, they share ids.
            let range = sys.board.equipmentIds.circuitGroups;
            for (let i = range.start; i <= range.end; i++) {
                if (!sys.lightGroups.find(elem => elem.id === i) && !sys.circuitGroups.find(elem => elem.id === i)) {
                    id = i;
                    break;
                }
            }
        }
        if (typeof id === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Max circuit light group id exceeded`, id, 'LightGroup'));
        if (isNaN(id) || !sys.board.equipmentIds.circuitGroups.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid circuit group id: ${obj.id}`, obj.id, 'LightGroup'));
        group = sys.lightGroups.getItemById(id, true);
        let sgroup = state.lightGroups.getItemById(id, true);
        return new Promise<LightGroup>((resolve, reject) => {
            if (typeof obj.name !== 'undefined') sgroup.name = group.name = obj.name;
            if (typeof obj.dontStop !== 'undefined' && utils.makeBool(obj.dontStop) === true) obj.eggTimer = 1440;
            if (typeof obj.eggTimer !== 'undefined') group.eggTimer = Math.min(Math.max(parseInt(obj.eggTimer, 10), 0), 1440);
            group.dontStop = group.eggTimer === 1440;
            group.isActive = true;
            if (typeof obj.circuits !== 'undefined') {
                for (let i = 0; i < obj.circuits.length; i++) {
                    let cobj = obj.circuits[i];
                    let c: LightGroupCircuit;
                    if (typeof cobj.id !== 'undefined') c = group.circuits.getItemById(parseInt(cobj.id, 10), true);
                    else if (typeof cobj.circuit !== 'undefined') c = group.circuits.getItemByCircuitId(parseInt(cobj.circuit, 10), true);
                    else c = group.circuits.getItemByIndex(i, true, { id: i + 1 });
                    if (typeof cobj.circuit !== 'undefined') c.circuit = cobj.circuit;
                    if (typeof cobj.lightingTheme !== 'undefined') c.lightingTheme = parseInt(cobj.lightingTheme, 10);
                    if (typeof cobj.color !== 'undefined') c.color = parseInt(cobj.color, 10);
                    if (typeof cobj.swimDelay !== 'undefined') c.swimDelay = parseInt(cobj.swimDelay, 10);
                    if (typeof cobj.position !== 'undefined') c.position = parseInt(cobj.position, 10);
                }
                // RKS: 09-25-21 - This has to be here.  Not sure the goal of not setting the entire circuit array when saving the group.
                // group.circuits.length = obj.circuits.length; // RSG - removed as this will delete circuits that were not changed
                group.circuits.length = obj.circuits.length;
                sgroup.emitEquipmentChange();

            }
            resolve(group);
        });
    }
    public async deleteCircuitGroupAsync(obj: any): Promise<CircuitGroup> {
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) return Promise.reject(new EquipmentNotFoundError(`Invalid group id: ${obj.id}`, 'CircuitGroup'));
        if (!sys.board.equipmentIds.circuitGroups.isInRange(id)) return;
        if (typeof obj.id !== 'undefined') {
            let group = sys.circuitGroups.getItemById(id, false);
            let sgroup = state.circuitGroups.getItemById(id, false);
            sys.circuitGroups.removeItemById(id);
            state.circuitGroups.removeItemById(id);
            group.isActive = false;
            sgroup.isOn = false;
            sgroup.isActive = false;
            sgroup.emitEquipmentChange();
            return new Promise<CircuitGroup>((resolve, reject) => { resolve(group); });
        }
        else
            return Promise.reject(new InvalidEquipmentIdError('Group id has not been defined', id, 'CircuitGroup'));
    }
    public async deleteLightGroupAsync(obj: any): Promise<LightGroup> {
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) return Promise.reject(new EquipmentNotFoundError(`Invalid group id: ${obj.id}`, 'LightGroup'));
        if (!sys.board.equipmentIds.circuitGroups.isInRange(id)) return;
        if (typeof obj.id !== 'undefined') {
            let group = sys.lightGroups.getItemById(id, false);
            let sgroup = state.lightGroups.getItemById(id, false);
            sys.lightGroups.removeItemById(id);
            state.lightGroups.removeItemById(id);
            group.isActive = false;
            sgroup.isOn = false;
            sgroup.isActive = false;
            sgroup.emitEquipmentChange();
            return new Promise<LightGroup>((resolve, reject) => { resolve(group); });
        }
        else
            return Promise.reject(new InvalidEquipmentIdError('Group id has not been defined', id, 'LightGroup'));
    }
    public async deleteCircuitAsync(data: any): Promise<ICircuit> {
        let id = parseInt(data.id, 10);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid circuit id: ${data.id}`, data.id, 'Circuit'));
        if (!sys.board.equipmentIds.circuits.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid circuit id: ${data.id}`, data.id, 'Circuit'));
        let circuit = sys.circuits.getInterfaceById(id);
        let cstate = state.circuits.getInterfaceById(id);
        if (circuit instanceof Circuit) {
            sys.circuits.removeItemById(circuit.id);
            state.circuits.removeItemById(circuit.id);
            cstate.isActive = circuit.isActive = false;
        }
        if (circuit instanceof Feature) {
            sys.features.removeItemById(circuit.id);
            state.features.removeItemById(circuit.id);
            cstate.isActive = circuit.isActive = false;
        }
        cstate.emitEquipmentChange();
        return new Promise<ICircuit>((resolve, reject) => { resolve(circuit); });
    }
    public deleteCircuit(data: any) {
        if (typeof data.id !== 'undefined') {
            let circuit = sys.circuits.getInterfaceById(data.id);
            if (circuit instanceof Circuit) {
                sys.circuits.removeItemById(circuit.id);
                state.circuits.removeItemById(circuit.id);
                return;
            }
            if (circuit instanceof Feature) {
                sys.features.removeItemById(data.id);
                state.features.removeItemById(data.id);
                return;
            }
        }
    }
    public getNameById(id: number) {
        if (id < 200)
            return sys.board.valueMaps.circuitNames.transform(id).desc;
        else
            return sys.customNames.getItemById(id - 200).name;
    }
    public async setLightGroupThemeAsync(id: number, theme: number): Promise<ICircuitState> {
        const grp = sys.lightGroups.getItemById(id);
        const sgrp = state.lightGroups.getItemById(id);
        //grp.lightingTheme = sgrp.lightingTheme = theme;
        let thm = sys.board.valueMaps.lightThemes.transform(theme);
        sgrp.action = sys.board.valueMaps.circuitActions.getValue('lighttheme');

        try {
            // Go through and set the theme for all lights in the group.
            for (let i = 0; i < grp.circuits.length; i++) {
                let c = grp.circuits.getItemByIndex(i);
                //let cstate = state.circuits.getItemById(c.circuit);
                await sys.board.circuits.setLightThemeAsync(c.circuit, theme);
                await sys.board.circuits.setCircuitStateAsync(c.circuit, false);
            }
            await setTimeout(5000);
            // Turn the circuits all back on again.
            for (let i = 0; i < grp.circuits.length; i++) {
                let c = grp.circuits.getItemByIndex(i);
                //let cstate = state.circuits.getItemById(c.circuit);
                await sys.board.circuits.setCircuitStateAsync(c.circuit, true);
            }
            sgrp.lightingTheme = theme;
            return sgrp;
        }
        catch (err) { return Promise.reject(err); }
        finally {
            sgrp.action = 0;
            sgrp.emitEquipmentChange();
        }
    }
    public async setLightGroupAttribsAsync(group: LightGroup): Promise<LightGroup> {
        let grp = sys.lightGroups.getItemById(group.id);
        try {
            grp.circuits.clear();
            for (let i = 0; i < group.circuits.length; i++) {
                let circuit = grp.circuits.getItemByIndex(i);
                grp.circuits.add({ id: i, circuit: circuit.circuit, color: circuit.color, position: i, swimDelay: circuit.swimDelay });
            }
            let sgrp = state.lightGroups.getItemById(group.id);
            sgrp.hasChanged = true; // Say we are dirty but we really are pure as the driven snow.
            return Promise.resolve(grp);
        }
        catch (err) { return Promise.reject(err); }
    }
    //public async runLightCommandAsync(id: number, command: string): Promise<ICircuitState> {
    //    let circ = sys.circuits.getItemById(id);
    //    try {
    //        let type = sys.board.valueMaps.circuitFunctions.transform(circ.type);
    //        let cmd = sys.board.valueMaps.lightCommands.findItem(command);
    //        if (typeof cmd === 'undefined') return Promise.reject(new InvalidOperationError(`Light command ${command} does not exist`, 'runLightCommandAsync'));
    //        if (typeof cmd.sequence !== 'undefined' && circ.master === 1) {
    //            await sys.board.circuits.setCircuitStateAsync(id, true);
    //            await ncp.circuits.sendOnOffSequenceAsync(id, cmd.sequence);
    //        }
    //        return state.circuits.getItemById(id);
    //    }
    //    catch (err) { return Promise.reject(`Error runLightCommandAsync ${err.message}`); }
    //}
    public async sequenceLightGroupAsync(id: number, operation: string): Promise<LightGroupState> {
        let sgroup = state.lightGroups.getItemById(id);
        if (state.mode !== 0) return sgroup;
        let grp = sys.lightGroups.getItemById(id);
        let nop = sys.board.valueMaps.circuitActions.getValue(operation);
        try {
            switch (operation) {
                case 'colorsync':
                    sgroup.action = nop;
                    sgroup.emitEquipmentChange();
                    for (let i = 0; i < grp.circuits.length; i++) {
                        let c = grp.circuits.getItemByIndex(i);
                        await sys.board.circuits.setCircuitStateAsync(c.circuit, false);
                    }
                    await setTimeout(10000);
                    // Turn the circuits all back on again.
                    for (let i = 0; i < grp.circuits.length; i++) {
                        let c = grp.circuits.getItemByIndex(i);
                        await sys.board.circuits.setCircuitStateAsync(c.circuit, true);
                    }
                    break;
                case 'colorset':
                    sgroup.action = nop;
                    sgroup.emitEquipmentChange();
                    await setTimeout(5000);
                    break;
                case 'colorswim':
                    sgroup.action = nop;
                    sgroup.emitEquipmentChange();
                    await setTimeout(5000);
                    break;
            }
            return sgroup;
        } catch (err) { return Promise.reject(err); }
        finally { sgroup.action = 0; sgroup.emitEquipmentChange(); }
    }
    public async setCircuitGroupStateAsync(id: number, val: boolean): Promise<ICircuitGroupState> {
        let grp = sys.circuitGroups.getItemById(id, false, { isActive: false });
        if (grp.dataName !== 'circuitGroupConfig') return await sys.board.circuits.setLightGroupStateAsync(id, val);
        let gstate = state.circuitGroups.getItemById(grp.id, grp.isActive !== false);
        if (state.mode !== 0) return gstate;
        let circuits = grp.circuits.toArray();
        sys.board.circuits.setEndTime(sys.circuits.getInterfaceById(gstate.id), gstate, val);
        gstate.isOn = val;
        let arr = [];
        for (let i = 0; i < circuits.length; i++) {
            let circuit:CircuitGroupCircuit = circuits[i];
            // The desiredState will be as follows.
            // 1 = on, 2 = off, 3 = ignore.
            let cval = true;
            if (circuit.desiredState === 1) cval = val ? true : false;
            else if (circuit.desiredState === 2) cval = val ? false : true;
            else if (circuit.desiredState === 3) continue;
            else if (circuit.desiredState === 4){
                // on/ignore
                if (val) cval = true;
                else continue;
            }
            else if (circuit.desiredState === 5){
                // off/ignore
                if (val) cval = false;
                else continue;
            }
            await sys.board.circuits.setCircuitStateAsync(circuit.circuit, cval);
            //arr.push(sys.board.circuits.setCircuitStateAsync(circuit.circuit, cval));
        }
        return state.circuitGroups.getItemById(grp.id, grp.isActive !== false);
        //return new Promise<ICircuitGroupState>(async (resolve, reject) => {
        //    await Promise.all(arr).catch((err) => { reject(err) });
        //    resolve(gstate);
        //});
    }
    public async setLightGroupStateAsync(id: number, val: boolean): Promise<ICircuitGroupState> {
        let grp = sys.circuitGroups.getItemById(id, false, { isActive: false });
        if (grp.dataName === 'circuitGroupConfig') return await sys.board.circuits.setCircuitGroupStateAsync(id, val);
        let gstate = state.lightGroups.getItemById(grp.id, grp.isActive !== false);
        if (state.mode !== 0) return gstate;
        let circuits = grp.circuits.toArray();
        sys.board.circuits.setEndTime(grp, gstate, val);
        gstate.isOn = val;
        let arr = [];
        for (let i = 0; i < circuits.length; i++) {
            let circuit = circuits[i];
            // RSG 4/3/24 - This function was executing and returing the results to the array; not pushing the fn to the array.
            //arr.push(sys.board.circuits.setCircuitStateAsync(circuit.circuit, val));
            arr.push(async () => { await sys.board.circuits.setCircuitStateAsync(circuit.circuit, val) });
        }
        // return new Promise<ICircuitGroupState>(async (resolve, reject) => {
        //     await Promise.all(arr).catch((err) => { reject(err) });
        //     resolve(gstate);
        // });
        return new Promise<ICircuitGroupState>(async (resolve, reject) => {
            try {
                Promise.all(arr.map(async func => await func()));
                resolve(gstate);
            } catch (err) {
                reject(err);
            };
        });
     };
}
export class NixieFeatureCommands extends FeatureCommands {
    public async setFeatureAsync(obj: any): Promise<Feature> {
        let id = parseInt(obj.id, 10);
        if (id <= 0 || isNaN(id)) {
            id = sys.features.getNextEquipmentId(sys.board.equipmentIds.features);
        }
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid feature id: ${obj.id}`, obj.id, 'Feature'));
        if (!sys.board.equipmentIds.features.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Feature id out of range: ${id}: ${sys.board.equipmentIds.features.start} to ${sys.board.equipmentIds.features.end}`, obj.id, 'Feature'));
        let feature = sys.features.getItemById(id, true);
        let sfeature = state.features.getItemById(id, true);
        feature.isActive = true;
        sfeature.isOn = false;
        if (obj.nameId) {
            feature.nameId = sfeature.nameId = obj.nameId;
            feature.name = sfeature.name = sys.board.valueMaps.circuitNames.get(obj.nameId);
        }
        else if (obj.name) feature.name = sfeature.name = obj.name;
        else if (!feature.name && !obj.name) feature.name = sfeature.name = `feature${obj.id}`;
        if (typeof obj.type !== 'undefined') feature.type = sfeature.type = parseInt(obj.type, 10);
        else if (!feature.type && typeof obj.type !== 'undefined') feature.type = sfeature.type = 0;
        if (typeof obj.freeze !== 'undefined') feature.freeze = utils.makeBool(obj.freeze);
        if (typeof obj.showInFeatures !== 'undefined') feature.showInFeatures = sfeature.showInFeatures = utils.makeBool(obj.showInFeatures);
        if (typeof obj.dontStop !== 'undefined' && utils.makeBool(obj.dontStop) === true) obj.eggTimer = 1440;
        if (typeof obj.eggTimer !== 'undefined') feature.eggTimer = parseInt(obj.eggTimer, 10);
        feature.dontStop = feature.eggTimer === 1440;
        // update end time in case feature is changed while circuit is on
        sys.board.circuits.setEndTime(feature, sfeature, sfeature.isOn, true);
        return new Promise<Feature>((resolve, reject) => { resolve(feature); });
    }
    public async deleteFeatureAsync(obj: any): Promise<Feature> {
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid feature id: ${obj.id}`, obj.id, 'Feature'));
        if (!sys.board.equipmentIds.features.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid feature id: ${obj.id}`, obj.id, 'Feature'));
        if (typeof obj.id !== 'undefined') {
            let feature = sys.features.getItemById(id, false);
            let sfeature = state.features.getItemById(id, false);
            sys.features.removeItemById(id);
            state.features.removeItemById(id);
            feature.isActive = false;
            sfeature.isOn = false;
            sfeature.showInFeatures = false;
            sfeature.isActive = false;
            sfeature.emitEquipmentChange();
            return new Promise<Feature>((resolve, reject) => { resolve(feature); });
        }
        else
            Promise.reject(new InvalidEquipmentIdError('Feature id has not been defined', undefined, 'Feature'));
    }
    public async setFeatureStateAsync(id: number, val: boolean, ignoreDelays?: boolean): Promise<ICircuitState> {
        try {
            if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid feature id: ${id}`, id, 'Feature'));
            if (!sys.board.equipmentIds.features.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid feature id: ${id}`, id, 'Feature'));
            let feature = sys.features.getItemById(id);
            let fstate = state.features.getItemById(feature.id, feature.isActive !== false);
            feature.master = 1;
            if (state.mode !== 0) return fstate;
            let ftype = sys.board.valueMaps.featureFunctions.getName(feature.type);
            if(val && !fstate.isOn) sys.board.circuits.setEndTime(feature, fstate, val);
            switch (ftype) {
                case 'spadrain':
                    this.setDrainFeatureStateAsync(id, val, ignoreDelays);
                    break;
                case 'spillway':
                    this.setSpillwayFeatureStateAsync(id, val, ignoreDelays);
                    break;
                default:
                    fstate.isOn = val;
                    break;
            }
            sys.board.valves.syncValveStates();
            ncp.pumps.syncPumpStates();
            if (!val){
                if (fstate.manualPriorityActive) delayMgr.cancelManualPriorityDelay(fstate.id);
                fstate.manualPriorityActive = false; // if the delay was previously cancelled, still need to turn this off
            }
            state.emitEquipmentChanges();
            return fstate;
        } catch (err) { return Promise.reject(new Error(`Error setting feature state ${err.message}`)); }
    }
    protected async setSpillwayFeatureStateAsync(id: number, val: boolean, ignoreDelays?: boolean): Promise<FeatureState> {
        try {
            let cstate = state.features.getItemById(id);
            if (cstate.isOn !== val) {
                if (sys.equipment.shared === true) {
                    let spastate = state.temps.bodies.getItemById(2);
                    if (val) {
                        if (spastate.isOn || spastate.startDelay) {
                            logger.warn(`Cannot turn ${cstate.name} on because ${spastate.name} is on`);
                            return cstate;
                        }
                        // If there are any drain circuits or features that are currently engaged we need to turn them off.
                        await sys.board.circuits.turnOffDrainCircuits(ignoreDelays);
                        if (!ignoreDelays && sys.general.options.pumpDelay && sys.general.options.valveDelayTime > 0) sys.board.pumps.setPumpValveDelays([id, 6]);
                    }
                    else if (!val) {
                        let arrIds = sys.board.valves.getBodyValveCircuitIds(true);
                        if (arrIds.length > 1) {
                            if (!ignoreDelays && sys.general.options.pumpDelay && sys.general.options.valveDelayTime > 0) sys.board.pumps.setPumpValveDelays([id, 6]);
                        }
                    }
                }
                logger.verbose(`Turning ${val ? 'on' : 'off'} a spillway feature ${cstate.name}`);
                cstate.isOn = val;
            }
            return cstate;
        } catch (err) { logger.error(`Nixie: Error setSpillwayFeatureStateAsync ${err.message}`); return Promise.reject(new BoardProcessError(`Nixie: Error setSpillwayFeatureStateAsync ${err.message}`, 'setSpillwayFeatureStateAsync')); }
    }
    protected async setDrainFeatureStateAsync(id: number, val: boolean, ignoreDelays?: boolean): Promise<FeatureState> {
        try {
            // Drain circuits can be very bad.  This is because they can be turned on then never turned off
            // we may want to create some limits are to how long they can be on or even force them off
            // if for instance the spa is not on.
            // RULES FOR DRAIN CIRCUITS:
            // 1. All spillway circuits must be off.
            let cstate = state.features.getItemById(id);
            if (cstate.isOn !== val) {
                if (sys.equipment.shared === true) {
                    if (val) {
                        // First we need to check to see if the pool is on.
                        let poolstate = state.temps.bodies.getItemById(1);
                        let spastate = state.temps.bodies.getItemById(2);
                        if ((spastate.isOn || spastate.startDelay || poolstate.isOn || poolstate.startDelay) && val) {
                            logger.warn(`Cannot turn ${cstate.name} on because a body circuit is on`);
                            return cstate;
                        }
                        // If there are any spillway circuits or features that are currently engaged we need to turn them off.
                        await sys.board.circuits.turnOffSpillwayCircuits(true);
                        // If there are any cleaner circuits on for the main body turn them off.
                        await sys.board.circuits.turnOffCleanerCircuits(state.temps.bodies.getItemById(1), true);
                        if (!ignoreDelays && sys.general.options.pumpDelay && sys.general.options.valveDelayTime > 0) sys.board.pumps.setPumpValveDelays([id, 1, 6]);
                    }
                    else if (!val) {
                        if (!ignoreDelays && sys.general.options.pumpDelay && sys.general.options.valveDelayTime > 0) sys.board.pumps.setPumpValveDelays([id, 1, 6]);
                    }
                }
                logger.verbose(`Turning ${val ? 'on' : 'off'} a spa drain feature ${cstate.name}`);
                cstate.isOn = val;
            }
            return cstate;
        } catch (err) { logger.error(`Nixie: Error setDrainFeatureStateAsync ${err.message}`); return Promise.reject(new BoardProcessError(`Nixie: Error setDrainFeatureStateAsync ${err.message}`, 'setDrainFeatureStateAsync')); }
    }

    public async toggleFeatureStateAsync(id: number): Promise<ICircuitState> {
        let feat = state.features.getItemById(id);
        return this.setFeatureStateAsync(id, !(feat.isOn || false));
    }
    public syncGroupStates() {
        // The way this should work is that when all of the states are met
        // the group should be on.  Otherwise it should be off.  That means that if
        // you turned on all the group circuits that should be on individually then
        // the group should be on.
        for (let i = 0; i < sys.circuitGroups.length; i++) {
            let grp: CircuitGroup = sys.circuitGroups.getItemByIndex(i);
            let circuits = grp.circuits.toArray();
            if (grp.isActive) {
                let bIsOn = true;
                // Iterate the circuits and break out should we find a condition
                // where the group should be off.
                for (let j = 0; j < circuits.length && bIsOn === true; j++) {
                    let circuit: CircuitGroupCircuit = grp.circuits.getItemByIndex(j);
                    let cstate = state.circuits.getInterfaceById(circuit.circuit);
                    // RSG: desiredState for Nixie is 1=on, 2=off, 3=ignore
                    if (circuit.desiredState === 1 || circuit.desiredState === 4) {
                        // The circuit should be on if the value is 1.
                        // If we are on 'ignore' we should still only treat the circuit as 
                        // desiredstate = 1.
                        if (!utils.makeBool(cstate.isOn)) bIsOn = false;
                    }
                    else if (circuit.desiredState === 2 || circuit.desiredState === 5) { // The circuit should be off.
                        if (utils.makeBool(cstate.isOn)) bIsOn = false;
                    }
                }
                let sgrp = state.circuitGroups.getItemById(grp.id);
                if (bIsOn && typeof sgrp.endTime === 'undefined') {
                    sys.board.circuits.setEndTime(grp, sgrp, bIsOn, true);
                }
                sgrp.isOn = bIsOn;

                if (!sgrp.isOn && sgrp.manualPriorityActive){
                    delayMgr.cancelManualPriorityDelays();
                    sgrp.manualPriorityActive = false; // if the delay was previously cancelled, still need to turn this off
                }
            }
            sys.board.valves.syncValveStates();
        }
        // I am guessing that there will only be one here but iterate
        // just in case we expand.
        for (let i = 0; i < sys.lightGroups.length; i++) {
            let grp: LightGroup = sys.lightGroups.getItemByIndex(i);
            let circuits = grp.circuits.toArray();
            if (grp.isActive) {
                let bIsOn = true;
                for (let j = 0; j < circuits.length && bIsOn === true; j++) {
                    let circuit: LightGroupCircuit = grp.circuits.getItemByIndex(j);
                    let cstate = state.circuits.getInterfaceById(circuit.circuit);
                    if (!utils.makeBool(cstate.isOn)) bIsOn = false;
                }
                let sgrp = state.lightGroups.getItemById(grp.id);
                sgrp.isOn = bIsOn;
                if (sgrp.isOn && typeof sgrp.endTime === 'undefined') sys.board.circuits.setEndTime(grp, sgrp, sgrp.isOn, true);
                if (!sgrp.isOn && sgrp.manualPriorityActive){
                    delayMgr.cancelManualPriorityDelay(grp.id);
                    sgrp.manualPriorityActive = false; // if the delay was previously cancelled, still need to turn this off
                }
            }

            sys.board.valves.syncValveStates();
        }
        state.emitEquipmentChanges();
    }
}
export class NixiePumpCommands extends PumpCommands {
    public async setPumpValveDelays(circuitIds: number[], delay?: number) {
        try {
            logger.info(`Setting pump valve delays: ${JSON.stringify(circuitIds)}`);
            // Alright now we have to delay the pumps associated with the circuit. So lets iterate all our
            // pump states and see where we land.
            for (let i = 0; i < sys.pumps.length; i++) {
                let pump = sys.pumps.getItemByIndex(i);
                let pstate = state.pumps.getItemById(pump.id);
                let pt = sys.board.valueMaps.pumpTypes.get(pump.type);

                //    Old - [1, { name: 'ss', desc: 'Single Speed', maxCircuits: 0, hasAddress: false, hasBody: true, maxRelays: 1 }],
                //     New 07/22 - [1, { name: 'ss', desc: 'Single Speed', maxCircuits: 8, hasAddress: false, hasBody: false, maxRelays: 1, relays: [{ id: 1, name: 'Pump On/Off' }]}],
                //    [2, { name: 'ds', desc: 'Two Speed', maxCircuits: 8, hasAddress: false, hasBody: false, maxRelays: 2 }],
                //    [3, { name: 'vs', desc: 'Intelliflo VS', maxPrimingTime: 6, minSpeed: 450, maxSpeed: 3450, maxCircuits: 8, hasAddress: true }],
                //    [4, { name: 'vsf', desc: 'Intelliflo VSF', minSpeed: 450, maxSpeed: 3450, minFlow: 15, maxFlow: 130, maxCircuits: 8, hasAddress: true }],
                //    [5, { name: 'vf', desc: 'Intelliflo VF', minFlow: 15, maxFlow: 130, maxCircuits: 8, hasAddress: true }],
                //    [100, { name: 'sf', desc: 'SuperFlo VS', hasAddress: false, maxCircuits: 8, maxRelays: 4, equipmentMaster: 1 }]
                switch (pt.name) {
                    case 'ss':{
                        // rsg - ss now has circuit assignments.  will check but still leave existing code
                        if (pt.maxCircuits === 0 || typeof pump.body !== 'undefined'){
                            // If a single speed pump is designated it will be the filter pump but we need to map any settings
                            // to bodies.
                            console.log(`Body: ${pump.body} Pump: ${pump.name} Pool: ${circuitIds.includes(6)} `);
                            if ((pump.body === 255 && (circuitIds.includes(6) || circuitIds.includes(1))) ||
                                (pump.body === 0 && circuitIds.includes(6)) ||
                                (pump.body === 101 && circuitIds.includes(1))) {
                                delayMgr.setPumpValveDelay(pstate);
                            }
                            break;
                        }
                    }
                    default:
                        if (pt.maxCircuits > 0) {
                            for (let j = 0; j < pump.circuits.length; j++) {
                                let circ = pump.circuits.getItemByIndex(j);
                                if (circuitIds.includes(circ.circuit)) {
                                    delayMgr.setPumpValveDelay(pstate);
                                    break;
                                }
                            }
                        }
                        break;
                }
            }
        } catch (err) { }
    }
}
export class NixieValveCommands extends ValveCommands {
    public async setValveAsync(obj: any): Promise<Valve> {
        try {
            let id = typeof obj.id !== 'undefined' ? parseInt(obj.id, 10) : -1;
            obj.master = 1;
            if (isNaN(id) || id <= 0) id = Math.max(sys.valves.getMaxId(false, 49) + 1, 50);

            if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Nixie: Valve Id has not been defined ${id}`, obj.id, 'Valve'));
            // Check the Nixie Control Panel to make sure the valve exist there.  If it needs to be added then we should add it.
            let valve = sys.valves.getItemById(id, true);
            // Set all the valve properies.
            let vstate = state.valves.getItemById(valve.id, true);
            valve.isActive = true;
            valve.circuit = typeof obj.circuit !== 'undefined' ? obj.circuit : valve.circuit;
            valve.name = typeof obj.name !== 'undefined' ? obj.name : valve.name;
            valve.connectionId = typeof obj.connectionId ? obj.connectionId : valve.connectionId;
            valve.deviceBinding = typeof obj.deviceBinding !== 'undefined' ? obj.deviceBinding : valve.deviceBinding;
            valve.pinId = typeof obj.pinId !== 'undefined' ? obj.pinId : valve.pinId;
            await ncp.valves.setValveAsync(valve, obj);
            await sys.board.syncEquipmentItems();
            return valve;
        } catch (err) { logger.error(`Nixie: Error setting valve definition. ${err.message}`); return Promise.reject(err); }
    }
    public async deleteValveAsync(obj: any): Promise<Valve> {
        try {
            let id = parseInt(obj.id, 10);
            // The following code will make sure we do not encroach on any valves defined by the OCP.
            if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Valve Id has not been defined', obj.id, 'Valve'));
            let valve = sys.valves.getItemById(id, false);
            let vstate = state.valves.getItemById(id);
            valve.isActive = false;
            vstate.hasChanged = true;
            vstate.emitEquipmentChange();
            sys.valves.removeItemById(id);
            state.valves.removeItemById(id);
            ncp.valves.removeById(id);
            return valve;
        } catch (err) { logger.error(`Nixie: Error removing valve from system ${obj.id}: ${err.message}`); return Promise.reject(new Error(`Nixie: Error removing valve from system ${ obj.id }: ${ err.message }`)); }
    }
    public async setValveStateAsync(valve: Valve, vstate: ValveState, isDiverted: boolean) {
        try {
            vstate.name = valve.name;
            await ncp.valves.setValveStateAsync(vstate, isDiverted);
        } catch (err) { logger.error(`Nixie: Error setting valve ${vstate.id}-${vstate.name} state to ${isDiverted}: ${err}`); return Promise.reject(err); }
    }
}
export class NixieHeaterCommands extends HeaterCommands {
    public async setHeaterAsync(obj: any): Promise<Heater> {
        try {
            let id = typeof obj.id === 'undefined' || !obj.id ? -1 : parseInt(obj.id, 10);
            if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Heater Id is not valid.', obj.id, 'Heater'));
            else if (id < 256 && id > 0) return Promise.reject(new InvalidEquipmentIdError('Nixie Heaters controlled by njspc must have an Id > 256.', obj.id, 'Heater'));
            let heater: Heater;
            if (id <= 0) {
                // We are adding a heater.  In this case all heaters are virtual.
                let vheaters = sys.heaters.filter(h => h.master === 1);
                id = Math.max(vheaters.getMaxId() + 1 || 0, vheaters.length + 256);
                logger.info(`Adding a new heater with id ${id}`);
            }
            heater = sys.heaters.getItemById(id, true);
            if (typeof obj !== undefined) {
                for (var s in obj) {
                    if (s === 'id') continue;
                    heater[s] = obj[s];
                }
            }
            let hstate = state.heaters.getItemById(id, true);
            //hstate.isVirtual = heater.isVirtual = true;
            hstate.name = heater.name;
            hstate.type = heater.type;
            heater.master = 1;
            await ncp.heaters.setHeaterAsync(heater, obj);
            await sys.board.heaters.updateHeaterServices();
            return heater;
        } catch (err) { return Promise.reject(new Error(`Error setting heater configuration: ${err}`)); }
    }
    public async deleteHeaterAsync(obj: any): Promise<Heater> {
        try {
            let id = parseInt(obj.id, 10);
            if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Cannot delete.  Heater Id is not valid.', obj.id, 'Heater'));
            let heater = sys.heaters.getItemById(id);
            heater.isActive = false;
            await ncp.heaters.deleteHeaterAsync(id);
            sys.heaters.removeItemById(id);
            state.heaters.removeItemById(id);
            sys.board.heaters.updateHeaterServices();
            return heater;
        } catch (err) { return Promise.reject(new BoardProcessError(err.message, 'deleteHeaterAsync')); }
    }
    public updateHeaterServices() {
        let htypes = sys.board.heaters.getInstalledHeaterTypes();
        let solarInstalled = htypes.solar > 0;
        let heatPumpInstalled = htypes.heatpump > 0;
        let gasHeaterInstalled = htypes.gas > 0;
        let ultratempInstalled = htypes.ultratemp > 0;
        let mastertempInstalled = htypes.mastertemp > 0;
        let hybridInstalled = htypes.hybrid > 0;
        // The heat mode options are
        // 1 = Off
        // 2 = Gas Heater
        // 3 = Solar Heater
        // 4 = Solar Preferred
        // 5 = UltraTemp Only
        // 6 = UltraTemp Preferred????  This might be 22
        // 9 = Heat Pump
        // 25 = Heat Pump Preferred
        // ?? = Hybrid


        // The heat source options are
        // 0 = No Change
        // 1 = Off
        // 2 = Gas Heater
        // 3 = Solar Heater
        // 4 = Solar Preferred
        // 5 = Heat Pump
        if (sys.heaters.length > 0) sys.board.valueMaps.heatSources = new byteValueMap([[1, { name: 'off', desc: 'Off' }]]);
        sys.board.valueMaps.heatModes = new byteValueMap([[1, { name: 'off', desc: 'Off' }]]);
        if (hybridInstalled) {
            sys.board.valueMaps.heatModes.merge([
                [7, { name: 'hybheat', desc: 'Gas Only' }],
                [8, { name: 'hybheatpump', desc: 'Heat Pump Only' }],
                [9, { name: 'hybhybrid', desc: 'Hybrid' }],
                [10, { name: 'hybdual', desc: 'Dual Heat' }]
            ]);
            sys.board.valueMaps.heatSources.merge([
                [7, { name: 'hybheat', desc: 'Gas Only' }],
                [8, { name: 'hybheatpump', desc: 'Heat Pump Only' }],
                [9, { name: 'hybhybrid', desc: 'Hybrid' }],
                [10, { name: 'hybdual', desc: 'Dual Heat' }]
            ]);
            // RKS: 08-24-22 The heat modes and sources for the hybrid heater are unique.  Turns out that
            // these should be available if there is a gas heater ganged to the body as well.
            // types cannot be ignored since they are specific to the heater.
            //sys.board.valueMaps.heatModes.merge([
            //    [9, { name: 'heatpump', desc: 'Heat Pump' }],
            //    [2, { name: 'heater', desc: 'Heater' }],
            //    [25, { name: 'heatpumppref', desc: 'Hybrid' }],
            //    [26, { name: 'dual', desc: 'Dual Heat' }]
            //]);
            //sys.board.valueMaps.heatSources.merge([
            //    [2, { name: 'heater', desc: 'Gas Heat' }],
            //    [9, { name: 'heatpump', desc: 'Heat Pump' }],
            //    [20, { name: 'heatpumppref', desc: 'Hybrid' }],
            //    [21, { name: 'dual', desc: 'Dual Heat' }]
            //]);
        }
        if (gasHeaterInstalled) sys.board.valueMaps.heatSources.merge([[2, { name: 'heater', desc: 'Heater' }]]);
        if (mastertempInstalled) sys.board.valueMaps.heatSources.merge([[11, { name: 'mtheater', desc: 'MasterTemp' }]]);
        if (solarInstalled && (gasHeaterInstalled || heatPumpInstalled)) sys.board.valueMaps.heatSources.merge([[3, { name: 'solar', desc: 'Solar Only', hasCoolSetpoint: htypes.hasCoolSetpoint }], [4, { name: 'solarpref', desc: 'Solar Preferred', hasCoolSetpoint: htypes.hasCoolSetpoint }]]);
        else if (solarInstalled) sys.board.valueMaps.heatSources.merge([[3, { name: 'solar', desc: 'Solar', hasCoolSetpoint: htypes.hasCoolSetpoint }]]);
        if (heatPumpInstalled && (gasHeaterInstalled || solarInstalled)) sys.board.valueMaps.heatSources.merge([[9, { name: 'heatpump', desc: 'Heatpump Only' }], [25, { name: 'heatpumppref', desc: 'Heat Pump Pref' }]]);
        else if (heatPumpInstalled) sys.board.valueMaps.heatSources.merge([[9, { name: 'heatpump', desc: 'Heat Pump' }]]);
        if (ultratempInstalled && (gasHeaterInstalled || heatPumpInstalled)) sys.board.valueMaps.heatSources.merge([[5, { name: 'ultratemp', desc: 'UltraTemp Only', hasCoolSetpoint: htypes.hasCoolSetpoint }], [6, { name: 'ultratemppref', desc: 'UltraTemp Pref', hasCoolSetpoint: htypes.hasCoolSetpoint }]]);
        else if (ultratempInstalled) sys.board.valueMaps.heatSources.merge([[5, { name: 'ultratemp', desc: 'UltraTemp', hasCoolSetpoint: htypes.hasCoolSetpoint }]]);
        sys.board.valueMaps.heatSources.merge([[0, { name: 'nochange', desc: 'No Change' }]]);


        if (gasHeaterInstalled) sys.board.valueMaps.heatModes.merge([[2, { name: 'heater', desc: 'Heater' }]]);
        if (mastertempInstalled) sys.board.valueMaps.heatModes.merge([[11, { name: 'mtheater', desc: 'MasterTemp' }]]);
        if (solarInstalled && (gasHeaterInstalled || heatPumpInstalled || mastertempInstalled)) sys.board.valueMaps.heatModes.merge([[3, { name: 'solar', desc: 'Solar Only' }], [4, { name: 'solarpref', desc: 'Solar Preferred' }]]);
        else if (solarInstalled) sys.board.valueMaps.heatModes.merge([[3, { name: 'solar', desc: 'Solar' }]]);
        if (ultratempInstalled && (gasHeaterInstalled || heatPumpInstalled || mastertempInstalled)) sys.board.valueMaps.heatModes.merge([[5, { name: 'ultratemp', desc: 'UltraTemp Only' }], [6, { name: 'ultratemppref', desc: 'UltraTemp Pref' }]]);
        else if (ultratempInstalled) sys.board.valueMaps.heatModes.merge([[5, { name: 'ultratemp', desc: 'UltraTemp' }]]);
        if (heatPumpInstalled && (gasHeaterInstalled || solarInstalled || mastertempInstalled)) sys.board.valueMaps.heatModes.merge([[9, { name: 'heatpump', desc: 'Heatpump Only' }], [25, { name: 'heatpumppref', desc: 'Heat Pump Preferred' }]]);
        else if (heatPumpInstalled) sys.board.valueMaps.heatModes.merge([[9, { name: 'heatpump', desc: 'Heat Pump' }]]);
        // Now set the body data.
        for (let i = 0; i < sys.bodies.length; i++) {
            let body = sys.bodies.getItemByIndex(i);
            let btemp = state.temps.bodies.getItemById(body.id, body.isActive !== false);
            let opts = sys.board.heaters.getInstalledHeaterTypes(body.id);
            btemp.heaterOptions = opts;
        }
        this.setActiveTempSensors();
    }
}
export class NixieChemControllerCommands extends ChemControllerCommands {
    protected async setIntelliChemAsync(data: any): Promise<ChemController> {
        try {
            // Nixie is always in control so let her do her thing.
            let chem = sys.chemControllers.getItemById(data.id, true);
            await ncp.chemControllers.setControllerAsync(chem, data);
            return chem;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async deleteChemControllerAsync(data: any): Promise<ChemController> {
        try {
            let id = typeof data.id !== 'undefined' ? parseInt(data.id, 10) : -1;
            if (typeof id === 'undefined' || isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid Chem Controller Id`, id, 'chemController'));
            let chem = sys.chemControllers.getItemById(id);
            let schem = state.chemControllers.getItemById(chem.id);
            await ncp.chemControllers.removeById(chem.id);
            chem.isActive = schem.isActive = false;
            sys.chemControllers.removeItemById(chem.id);
            state.chemControllers.removeItemById(chem.id);
            schem.emitEquipmentChange();
            return chem;
        }
        catch (err) { return Promise.reject(err); }
    }
}
