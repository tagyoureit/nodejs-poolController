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

import { sl } from '../../controller/comms/ScreenLogic';
import * as extend from 'extend';
import { logger } from '../../logger/Logger';
import { conn } from '../comms/Comms';
import { Message, Outbound, Protocol, Response } from '../comms/messages/Messages';
import { ControllerType, Timestamp, utils } from '../Constants';
import { Body, ChemController, ConfigVersion, CustomName, EggTimer, Feature, Heater, ICircuit, LightGroup, LightGroupCircuit, Options, PoolSystem, Pump, Schedule, sys, Valve } from '../Equipment';
import { InvalidEquipmentDataError, InvalidEquipmentIdError, InvalidOperationError } from '../Errors';
import { ncp } from "../nixie/Nixie";
import { BodyTempState, ChlorinatorState, ICircuitGroupState, ICircuitState, LightGroupState, state } from '../State';
import { BodyCommands, byteValueMap, ChemControllerCommands, ChlorinatorCommands, CircuitCommands, ConfigQueue, ConfigRequest, EquipmentIdRange, FeatureCommands, HeaterCommands, PumpCommands, ScheduleCommands, SystemBoard, SystemCommands, ValveCommands } from './SystemBoard';


export class EasyTouchBoard extends SystemBoard {
    public needsConfigChanges: boolean = false;
    constructor(system: PoolSystem) {
        super(system);
        this._statusInterval = -1;
        this.equipmentIds.circuits = new EquipmentIdRange(function () { return this.start; }, function () { return this.start + sys.equipment.maxCircuits - 1; });
        this.equipmentIds.features = new EquipmentIdRange(() => { return 11; }, () => { return this.equipmentIds.features.start + sys.equipment.maxFeatures + 1; });
        this.equipmentIds.features.start = 11;
        this.equipmentIds.virtualCircuits = new EquipmentIdRange(function () { return 128; }, function () { return 136; });
        this.equipmentIds.virtualCircuits.start = 128;
        this.equipmentIds.circuitGroups = new EquipmentIdRange(function () { return 192; }, function () { return this.start + sys.equipment.maxCircuitGroups - 1; });
        this.equipmentIds.circuitGroups.start = 192;
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
        this.valueMaps.customNames = new byteValueMap(
            sys.customNames.get().map((el, idx) => {
                return [idx + 200, { name: el.name, desc: el.name }];
            })
        );
        this.valueMaps.clockSources = new byteValueMap([
            [1, { name: 'manual', desc: 'Manual' }],
            [3, { name: 'server', desc: 'Server' }]
        ]);
        this.valueMaps.circuitNames = new byteValueMap([
            // [0, { name: 'notused', desc: 'Not Used' }],
            [1, { name: 'aerator', desc: 'Aerator' }],
            [2, { name: 'airblower', desc: 'Air Blower' }],
            [3, { name: 'aux1', desc: 'AUX 1' }],
            [4, { name: 'aux2', desc: 'AUX 2' }],
            [5, { name: 'aux3', desc: 'AUX 3' }],
            [6, { name: 'aux4', desc: 'AUX 4' }],
            [7, { name: 'aux5', desc: 'AUX 5' }],
            [8, { name: 'aux6', desc: 'AUX 6' }],
            [9, { name: 'aux7', desc: 'AUX 7' }],
            [10, { name: 'aux8', desc: 'AUX 8' }],
            [11, { name: 'aux9', desc: 'AUX 9' }],
            [12, { name: 'aux10', desc: 'AUX 10' }],
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
            [33, { name: 'floorclnr', desc: 'Floor Cleaner' }],
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
            [93, { name: 'auxextra', desc: 'AUX EXTRA' }],
            [94, { name: 'feature1', desc: 'Feature 1' }],
            [95, { name: 'feature2', desc: 'Feature 2' }],
            [96, { name: 'feature3', desc: 'Feature 3' }],
            [97, { name: 'feature4', desc: 'Feature 4' }],
            [98, { name: 'feature5', desc: 'Feature 5' }],
            [99, { name: 'feature6', desc: 'Feature 6' }],
            [100, { name: 'feature7', desc: 'Feature 7' }],
            [101, { name: 'feature8', desc: 'Feature 8' }]
        ]);
        // We need this because there is a no-pump thing in *Touch.
        // RKS: 05-04-21 The no-pump item was removed as this was only required for -webClient.  deletePumpAsync should remove the pump from operation.  Do not use 255 as EasyTouch reports
        // 255 or 0 for pumps that are not installed.
        this.valueMaps.pumpTypes = new byteValueMap([
            [1, { name: 'vf', desc: 'Intelliflo VF', maxPrimingTime: 6, minFlow: 15, maxFlow: 130, flowStepSize: 1, maxCircuits: 8, hasAddress: true }],
            [64, { name: 'vsf', desc: 'Intelliflo VSF', minSpeed: 450, maxSpeed: 3450, speedStepSize: 10, minFlow: 15, maxFlow: 130, flowStepSize: 1, maxCircuits: 8, hasAddress: true }],
            [65, { name: 'ds', desc: 'Two-Speed', maxCircuits: 4, hasAddress: false, hasBody: true }],
            [128, { name: 'vs', desc: 'Intelliflo VS', maxPrimingTime: 10, minSpeed: 450, maxSpeed: 3450, speedStepSize: 10, maxCircuits: 8, hasAddress: true }],
            [169, { name: 'vssvrs', desc: 'IntelliFlo VS+SVRS', maxPrimingTime: 6, minSpeed: 450, maxSpeed: 3450, speedStepSize: 10, maxCircuits: 8, hasAddress: true }],
            [257, { name: 'ss', desc: 'Single Speed', maxCircuits: 0, hasAddress: false, hasBody: true, equipmentMaster: 1, maxRelays: 1, relays: [{ id: 1, name: 'Pump On/Off' }] }],
            [256, { name: 'sf', desc: 'SuperFlo VS', hasAddress: false, maxCircuits: 8, maxRelays: 4, equipmentMaster: 1, maxSpeeds: 4, relays: [{ id: 1, name: 'Program #1' }, { id: 2, name: 'Program #2' }, { id: 3, name: 'Program #3' }, { id: 4, name: 'Program #4' }] }],
            [258, { name: 'hwrly', desc: 'Hayward Relay VS', hasAddress: false, maxCircuits: 8, maxRelays: 4, equipmentMaster: 1, maxSpeeds: 8, relays: [{ id: 1, name: 'Step #1' }, { id: 2, name: 'Step #2' }, { id: 3, name: 'Step #3' }, { id: 4, name: 'Pump On' }] }],
            [259, { name: 'hwvs', desc: 'Hayward Eco/TriStar VS', minSpeed: 450, maxSpeed: 3450, maxCircuits: 8, hasAddress: true, equipmentMaster: 1 }]
        ]);
        this.valueMaps.heaterTypes = new byteValueMap([
            [0, { name: 'none', desc: 'No Heater', hasAddress: false }],
            [1, { name: 'gas', desc: 'Gas Heater', hasAddress: false }],
            [2, { name: 'solar', desc: 'Solar Heater', hasAddress: false, hasPreference: true }],
            [3, { name: 'heatpump', desc: 'Heat Pump', hasAddress: true, hasPreference: true }],
            [4, { name: 'ultratemp', desc: 'UltraTemp', hasAddress: true, hasCoolSetpoint: true, hasPreference: true }],
            [5, { name: 'hybrid', desc: 'Hybrid', hasAddress: true }],
            [6, { name: 'maxetherm', desc: 'Max-E-Therm', hasAddress: true }],
            [7, { name: 'mastertemp', desc: 'MasterTemp', hasAddress: true }]
        ]);


        this.valueMaps.heatModes = new byteValueMap([
            [0, { name: 'off', desc: 'Off' }],
            [1, { name: 'heater', desc: 'Heater' }]
        ]);

        this.valueMaps.scheduleDays = new byteValueMap([
            [1, { name: 'sun', desc: 'Sunday', dow: 0 }],
            [2, { name: 'mon', desc: 'Monday', dow: 1 }],
            [4, { name: 'tue', desc: 'Tuesday', dow: 2 }],
            [8, { name: 'wed', desc: 'Wednesday', dow: 3 }],
            [16, { name: 'thu', desc: 'Thursday', dow: 4 }],
            [32, { name: 'fri', desc: 'Friday', dow: 5 }],
            [64, { name: 'sat', desc: 'Saturday', dow: 6 }]
        ]);
        this.valueMaps.scheduleTypes = new byteValueMap([
            [0, { name: 'repeat', desc: 'Repeats', startDate: false, startTime: true, endTime: true, days: 'multi', heatSource: true, heatSetpoint: false }],
            [26, { name: 'runonce', desc: 'Run Once', startDate: false, startTime: true, endTime: false, days: 'single', heatSource: true, heatSetpoint: false }]
        ]);
        this.valueMaps.featureFunctions = new byteValueMap([
            [0, { name: 'generic', desc: 'Generic' }],
            [14, { name: 'spillway', desc: 'Spillway' }]
        ]);
        this.valueMaps.msgBroadcastActions.merge([
            [5, { name: 'dateTime', desc: 'Date/Time' }],
            [8, { name: 'heatTemp', desc: 'Heat/Temperature' }],
            [10, { name: 'customNames', desc: 'Custom Names' }],
            [11, { name: 'circuits', desc: 'Circuits' }],
            [17, { name: 'schedules', desc: 'Schedules' }],
            [18, { name: 'schedules', desc: 'Schedules' }],
            [22, { name: 'spaSideRemote', desc: 'Spa Side Remotes' }],
            [23, { name: 'pumpStatus', desc: 'Pump Status' }],
            [24, { name: 'pumpConfig', desc: 'Pump Config' }],
            [25, { name: 'intellichlor', desc: 'IntelliChlor' }],
            [29, { name: 'valves', desc: 'Valves' }],
            [30, { name: 'highSpeedCircuits', desc: 'High Speed Circuits' }],
            [32, { name: 'is4is10', desc: 'IS4/IS10' }],
            [34, { name: 'solarHeatPump', desc: 'Solar Heat Pump' }],
            [35, { name: 'delays', desc: 'Delays' }],
            [37, { name: 'unknown37', desc: 'unknown 37' }],
            [38, { name: 'unknown38', desc: 'unknown 38' }],
            [39, { name: 'lightGroupPositions', desc: 'Light Group Positions' }],
            [40, { name: 'settings', desc: 'Settings' }],
            [41, { name: 'circuitGroups', desc: 'Circuit Groups' }],
            [42, { name: 'unknown42', desc: 'unknown 42' }],
            [96, { name: 'setColor', desc: 'Set Color' }],
            [109, { name: 'iLink1', desc: 'iLink Protocol 1' }],
            [110, { name: 'iLink2', desc: 'iLink Protocol 2' }],
            [111, { name: 'iLink3', desc: 'iLink Protocol 3' }],
            [114, { name: 'setHeatPump', desc: 'Heat Pump Status?' }],
            [131, { name: 'setDelayCancel', desc: 'Set Delay Cancel' }],
            [133, { name: 'setDateTime', desc: 'Set Date/Time' }],
            [134, { name: 'setCircuit', desc: 'Set Circuit' }],
            [136, { name: 'setHeatTemp', desc: 'Set Heat/Temperature' }],
            [137, { name: 'setHeatPump', desc: 'Set heat pump?' }],
            [138, { name: 'setCustomName', desc: 'Set Custom Name' }],
            [139, { name: 'setCircuitNameFunc', desc: 'Set Circuit Name/Function' }],
            [140, { name: 'unknown140', desc: 'unknown 140' }],
            [144, { name: 'setHeatPump2', desc: 'Set Heat Pump' }],
            [145, { name: 'setSchedule', desc: 'Set Schedule' }],
            [146, { name: 'setIntelliChem', desc: 'Set IntelliChem' }],
            [147, { name: 'setIntelli?', desc: 'Set Intelli(?)' }],
            [150, { name: 'setSpaSideRemote', desc: 'Set Intelliflow Spa Side Control' }],
            [152, { name: 'setPumpConfig', desc: 'Set Pump Config' }],
            [153, { name: 'setIntelliChlor', desc: 'Set IntelliChlor' }],
            [155, { name: 'setPumpConfigExtended', desc: 'Set Pump Config (Extended)' }],
            [157, { name: 'setValves', desc: 'Set Valves' }],
            [158, { name: 'setHighSpeedCircuits', desc: 'Set High Speed Circuits for Valves' }],
            [160, { name: 'setIs4Is10', desc: 'Set is4/is10 Spa Side Remote' }],
            [161, { name: 'setQuickTouch', desc: 'Set QuickTouch Spa Side Remote' }],
            [162, { name: 'setSolarHeatPump', desc: 'Set Solar/Heat Pump' }],
            [163, { name: 'setDelay', desc: 'Set Delay' }],
            [167, { name: 'setLightGroup', desc: 'Set Light Groups/Positions' }],
            [168, { name: 'setHeatMode', desc: 'Set Heat Mode' }],
            [197, { name: 'dateTime', desc: 'Get Date/Time' }],
            [200, { name: 'heatTemp', desc: 'Get Heat/Temperature' }],
            [202, { name: 'customNames', desc: 'Get Custom Names' }],
            [203, { name: 'circuits', desc: 'Get Circuits' }],
            [209, { name: 'schedules', desc: 'Get Schedules' }],
            [214, { name: 'spaSideRemote', desc: 'Get Spa Side Remotes' }],
            [215, { name: 'pumpStatus', desc: 'Get Pump Status' }],
            [216, { name: 'pumpConfig', desc: 'Get Pump Config' }],
            [217, { name: 'intellichlor', desc: 'Get IntelliChlor' }],
            [221, { name: 'valves', desc: 'Get Valves' }],
            [222, { name: 'highSpeedCircuits', desc: 'Get High Speed Circuits' }],
            [224, { name: 'is4is10', desc: 'Get IS4/IS10' }],
            [226, { name: 'solarHeatPump', desc: 'Get Solar Heat Pump' }],
            [227, { name: 'delays', desc: 'Get Delays' }],
            [229, { name: 'unknown229', desc: 'unknown 229' }],
            [230, { name: 'unknown230', desc: 'unknown 230' }],
            [231, { name: 'lightGroupPositions', desc: 'Get Light Group Positions' }],
            [232, { name: 'settings', desc: 'Get Settings' }],
            [233, { name: 'circuitGroups', desc: 'Get Circuit Groups' }],
            [234, { name: 'unknown234', desc: 'unknown 234' }],
            [252, { name: 'version', desc: 'Versions' }],
            [253, { name: 'version', desc: 'Get Versions' }]
        ]);
        this.valueMaps.scheduleTimeTypes.merge([
            [1, { name: 'sunrise', desc: 'Sunrise' }],
            [2, { name: 'sunset', desc: 'Sunset' }]
        ]);
        this.valueMaps.scheduleDays.toArray = function () {
            let arrKeys = Array.from(this.keys());
            let arr = [];
            for (let i = 0; i < arrKeys.length; i++) arr.push(extend(true, { val: arrKeys[i], bitval: arrKeys[i] }, this.get(arrKeys[i])));
            return arr;
        }
        this.valueMaps.scheduleDays.transform = function (byte) {
            let days = [];
            let b = byte & 0x007F;
            for (let bit = 7; bit >= 0; bit--) {
                if ((byte & 1 << (bit - 1)) > 0) days.push(extend(true, { val: 1 << (bit - 1) }, this.get((byte & 1 << (bit - 1)))));
            }
            return { val: b, days: days };
        };
        this.valueMaps.lightCommands = new byteValueMap([
            [128, { name: 'colorsync', desc: 'Sync', types: ['intellibrite'] }],
            [144, { name: 'colorset', desc: 'Set', types: ['intellibrite'] }],
            [160, { name: 'colorswim', desc: 'Swim', types: ['intellibrite'] }],
            [190, { name: 'colorhold', desc: 'Hold', types: ['intellibrite'], sequence: 13 }],
            [191, { name: 'colorrecall', desc: 'Recall', types: ['intellibrite'], sequence: 14 }],
            [208, { name: 'thumper', desc: 'Thumper', types: ['magicstream'] }]
        ]);
        this.valueMaps.lightThemes.transform = function (byte) { return extend(true, { val: byte }, this.get(byte) || this.get(255)); };
        this.valueMaps.circuitNames.transform = function (byte) {
            if (byte < 200) {
                return extend(true, {}, { val: byte }, this.get(byte));
            }
            else {
                const customName = sys.customNames.getItemById(byte - 200);
                return extend(true, {}, { val: byte, desc: customName.name, name: customName.name });
            }
        };
        this.valueMaps.panelModes = new byteValueMap([
            [0, { val: 0, name: 'auto', desc: 'Auto' }],
            [1, { val: 1, name: 'service', desc: 'Service' }],
            [8, { val: 8, name: 'freeze', desc: 'Freeze' }],
            [128, { val: 128, name: 'timeout', desc: 'Timeout' }],
            [129, { val: 129, name: 'service-timeout', desc: 'Service/Timeout' }],
            [255, { name: 'error', desc: 'System Error' }]
        ]);
        this.valueMaps.expansionBoards = new byteValueMap([
            [0, { name: 'ET28', part: 'ET2-8', desc: 'EasyTouch2 8', circuits: 8, shared: true }],
            [1, { name: 'ET28P', part: 'ET2-8P', desc: 'EasyTouch2 8P', circuits: 8, single: true, shared: false }],
            [2, { name: 'ET24', part: 'ET2-4', desc: 'EasyTouch2 4', circuits: 4, shared: true }],
            [3, { name: 'ET24P', part: 'ET2-4P', desc: 'EasyTouch2 4P', circuits: 4, single: true, shared: false }],
            [6, { name: 'ETPSL4', part: 'ET-PSL4', desc: 'EasyTouch PSL4', circuits: 4, features: 2, schedules: 4, pumps: 1, shared: true }],
            [7, { name: 'ETPL4', part: 'ET-PL4', desc: 'EasyTouch PL4', circuits: 4, features: 2, schedules: 4, pumps: 1, single: true, shared: false }],
            // EasyTouch 1 models all start at 128.
            [128, { name: 'ET8', part: 'ET-8', desc: 'EasyTouch 8', circuits: 8, shared: true }],
            [129, { name: 'ET8P', part: 'ET-8P', desc: 'EasyTouch 8P', circuits: 8, single: true, shared: false }],
            [130, { name: 'ET4', part: 'ET-4', desc: 'EasyTouch 4', circuits: 4, shared: true }],
            [131, { name: 'ET4P', part: 'ET-4P', desc: 'EasyTouch 4P', circuits: 4, single: true, shared: false }]
        ]);
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
            logger.info(`Initializing EasyTouch Valve A`);

        }
        if (typeof sys.valves.find((v) => v.id === 2) === 'undefined') {
            let valve = sys.valves.getItemById(2, true);
            valve.isIntake = false;
            valve.isReturn = false;
            valve.type = 0;
            valve.master = 0;
            valve.isActive = true;
            valve.name = 'Valve B';
            logger.info(`Initializing EasyTouch Valve B`);
        }
        if (eq.intakeReturnValves) {
            logger.info(`Initializing EasyTouch Intake/Return Valves`);
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
    public initHeaterDefaults() {
        sys.board.heaters.updateHeaterServices();
        // RKS: 03-03-22 This is not correct.  As it turns out there is a case where the only heater installed is not
        // a gas heater.  This also does not work for dual body systems.
        //let heater = sys.heaters.getItemById(1, true);
        //heater.isActive = true;
        //heater.type = 1;
        //heater.name = "Gas Heater";
        //let sheater = state.heaters.getItemById(1, true);
        //sheater.type = heater.type;
        //sheater.name = heater.name;
        ////sheater.isVirtual = heater.isVirtual = false;
        //sys.equipment.shared ? heater.body = 32 : heater.body = 0;
    }
    public initBodyDefaults() {
        // Initialize the bodies.  We will need these very soon.
        for (let i = 1; i <= sys.equipment.maxBodies; i++) {
            // Add in the bodies for the configuration.  These need to be set.
            let cbody = sys.bodies.getItemById(i, true);
            let tbody = state.temps.bodies.getItemById(i, true);
            cbody.isActive = true;
            // If the body doesn't represent a spa then we set the type.
            // RSG - 10-5-21: If a single body IT (i5+3s/i9+3s) the bodies are the same; set to pool
            // RKS: 04-13-22 - This is not really correct.  IntelliTouch (S) models are actually shared body systems that do
            // not have intake/return valves but there are two bodies that are named Hi-Temp (spa) and Lo-Temp (pool).  This
            // is very confusing in the control panels but I see why it is done this way.  If they didn't they would need
            // different controllers for the Indoor and Wireless controllers since the top 2 horizontal buttons are body controls.
            //tbody.type = cbody.type = i > 1 && !sys.equipment.shared && sys.equipment.intakeReturnValves ? 1 : 0;
            tbody.type = cbody.type = i - 1;  // This will set the first body to pool/Lo-Temp and the second body to spa/Hi-Temp.
            if (typeof cbody.name === 'undefined') {
                let bt = sys.board.valueMaps.bodyTypes.transform(cbody.type);
                tbody.name = cbody.name = bt.desc;
            }
            if (tbody.id === 1) {
                tbody.circuit = cbody.circuit = 6;
            }
            else if (tbody.id === 2) {
                tbody.circuit = cbody.circuit = 1;
            }

        }
        if (!sys.equipment.shared && !sys.equipment.dual && state.equipment.controllerType !== 'intellitouch') {
            sys.bodies.removeItemById(2);
            state.temps.bodies.removeItemById(2);
        }
        // RKS: 04-14-21 - Remove the spa circuit from the equation if this is a single body panel.
        if (sys.equipment.maxBodies === 1) sys.board.equipmentIds.invalidIds.merge([1])
        sys.bodies.removeItemById(3);
        sys.bodies.removeItemById(4);
        state.temps.bodies.removeItemById(3);
        state.temps.bodies.removeItemById(4);
        sys.board.heaters.initTempSensors();
        sys.general.options.clockMode = sys.general.options.clockMode || 12;
        sys.general.options.clockSource = sys.general.options.clockSource || 'manual';
    }
    public initExpansionModules(byte1: number, byte2: number) {
        // Initialize the installed personality board.
        console.log(`Pentair EasyTouch System Detected!`);

        let offset = byte2 === 14 ? 128 : 0;
        let mt = this.valueMaps.expansionBoards.transform(offset + byte1);
        let mod = sys.equipment.modules.getItemById(0, true);
        mod.name = mt.name;
        mod.desc = mt.desc;
        mod.type = offset + byte1;
        mod.part = mt.part;
        let eq = sys.equipment;
        let md = mod.get();
        eq.maxBodies = md.bodies = typeof mt.bodies !== 'undefined' ? mt.bodies : mt.shared ? 2 : 1;
        eq.maxCircuits = md.circuits = typeof mt.circuits !== 'undefined' ? mt.circuits : 8;
        eq.maxFeatures = md.features = typeof mt.features !== 'undefined' ? mt.features : 8;
        eq.maxValves = md.valves = typeof mt.valves !== 'undefined' ? mt.valves : mt.shared ? 4 : 2;
        eq.maxPumps = md.maxPumps = typeof mt.pumps !== 'undefined' ? mt.pumps : 2;
        eq.maxHeaters = md.maxHeaters = typeof mt.heaters !== 'undefined' ? mt.heaters : 2;
        eq.shared = mt.shared;
        eq.single = typeof mt.single !== 'undefined' ? mt.single : false;
        eq.dual = false;
        eq.maxChlorinators = md.chlorinators = 1;
        eq.maxChemControllers = md.chemControllers = 1;
        eq.maxCustomNames = 10;
        eq.intakeReturnValves = md.intakeReturnValves = typeof mt.intakeReturnValves !== 'undefined' ? mt.intakeReturnValves : mt.shared;
        // Calculate out the invalid ids.
        sys.board.equipmentIds.invalidIds.set([]);
        if (!eq.shared) sys.board.equipmentIds.invalidIds.merge([1]);
        if (eq.maxCircuits === 4) sys.board.equipmentIds.invalidIds.merge([7, 8, 9]);
        if (byte1 !== 14) sys.board.equipmentIds.invalidIds.merge([10, 19]);
        state.equipment.model = sys.equipment.model = mt.desc;
        state.equipment.controllerType = 'easytouch';
        this.initBodyDefaults();
        this.initHeaterDefaults();
        this.initValves(eq);
        sys.board.bodies.initFilters();
        sys.equipment.shared ? sys.board.equipmentIds.circuits.start = 1 : sys.board.equipmentIds.circuits.start = 2;
        (async () => {
            try { sys.board.bodies.initFilters(); } catch (err) {
                logger.error(`Error initializing EasyTouch Filters`);
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
        for (let i = 0; i < sys.bodies.length; i++) {
            let b = sys.bodies.getItemByIndex(i);
            b.master = 0;
        }
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
        eq.setEquipmentIds();
        state.emitControllerChange();
    }
    public bodies: TouchBodyCommands = new TouchBodyCommands(this);
    public system: TouchSystemCommands = new TouchSystemCommands(this);
    public circuits: TouchCircuitCommands = new TouchCircuitCommands(this);
    public features: TouchFeatureCommands = new TouchFeatureCommands(this);
    public chlorinator: TouchChlorinatorCommands = new TouchChlorinatorCommands(this);
    public pumps: TouchPumpCommands = new TouchPumpCommands(this);
    public schedules: TouchScheduleCommands = new TouchScheduleCommands(this);
    public heaters: TouchHeaterCommands = new TouchHeaterCommands(this);
    public chemControllers: TouchChemControllerCommands = new TouchChemControllerCommands(this);
    public valves: TouchValveCommands = new TouchValveCommands(this);
    protected _configQueue: TouchConfigQueue = new TouchConfigQueue();
    public reloadConfig() {
        //sys.resetSystem();
        sys.configVersion.clear();
        state.status = 0;
        this.needsConfigChanges = true;
        console.log('RESETTING THE CONFIGURATION');
        this.modulesAcquired = false;
    }
    public checkConfiguration() {
        if ((this.needsConfigChanges || (Date.now().valueOf() - new Date(sys.configVersion.lastUpdated).valueOf()) / 1000 / 60 > 20)) {
            //this._configQueue.clearTimer();
            sys.configVersion.lastUpdated = new Date();
            this.needsConfigChanges = false;
            this._configQueue.queueChanges();
        }
    }

    public requestConfiguration(ver?: ConfigVersion) {
        // if (ver && ver.lastUpdated && sys.configVersion.lastUpdated !== ver.lastUpdated) {
        //     sys.configVersion.lastUpdated = new Date(ver.lastUpdated);
        // }
        // if (ver && ver.equipment && sys.configVersion.equipment !== ver.equipment) sys.configVersion.equipment = ver.equipment;

        //this.needsConfigChanges = true;
        this.checkConfiguration();
    }

    public async stopAsync() { this._configQueue.close(); return super.stopAsync(); }
}
export class TouchConfigRequest extends ConfigRequest {
    constructor(setcat: number, items?: number[], oncomplete?: Function) {
        super();
        this.setcategory = setcat;
        setcat === GetTouchConfigCategories.version ?
            this.category = TouchConfigCategories.version :
            this.category = setcat & 63;
        if (typeof items !== 'undefined') this.items.push(...items);
        this.oncomplete = oncomplete;
    }
    declare category: TouchConfigCategories;
    declare setcategory: GetTouchConfigCategories;
}
export class TouchConfigQueue extends ConfigQueue {
    //protected _configQueueTimer: NodeJS.Timeout;
    //public clearTimer(): void { clearTimeout(this._configQueueTimer); }
    protected queueRange(cat: number, start: number, end: number) {
        let req = new TouchConfigRequest(cat, []);
        req.fillRange(start, end);
        this.push(req);
    }
    protected queueItems(cat: number, items: number[] = [0]) { this.push(new TouchConfigRequest(cat, items)); }
    public queueChanges() {
        this.reset();
        logger.info(`Requesting ${sys.controllerType} configuration`);
        this.queueItems(GetTouchConfigCategories.dateTime);
        this.queueItems(GetTouchConfigCategories.version);
        this.queueRange(GetTouchConfigCategories.customNames, 0, sys.equipment.maxCustomNames - 1);
        this.queueRange(GetTouchConfigCategories.circuits, 1, sys.board.equipmentIds.features.end);
        this.queueRange(GetTouchConfigCategories.schedules, 1, sys.equipment.maxSchedules);
        // moved heat/solar request items after circuits to allow bodies to be discovered
        this.queueItems(GetTouchConfigCategories.heatTemperature);
        this.queueItems(GetTouchConfigCategories.solarHeatPump);
        this.queueItems(GetTouchConfigCategories.delays);
        this.queueItems(GetTouchConfigCategories.settings);
        this.queueItems(GetTouchConfigCategories.intellifloSpaSideRemotes);
        this.queueItems(GetTouchConfigCategories.is4is10);
        this.queueItems(GetTouchConfigCategories.quickTouchRemote);
        this.queueItems(GetTouchConfigCategories.valves);
        this.queueItems(GetTouchConfigCategories.lightGroupPositions);
        this.queueItems(GetTouchConfigCategories.highSpeedCircuits);
        this.queueRange(GetTouchConfigCategories.pumpConfig, 1, sys.equipment.maxPumps);
        this.queueItems(GetTouchConfigCategories.intellichlor);
        // todo: add chlor or other commands not asked for by screenlogic if there is no remote/indoor panel present
        if (this.remainingItems > 0) {
            var self = this;
            setTimeout(() => { self.processNext(); }, 50);
        } else {
            state.status = 1;
        }
        state.emitControllerChange();
    }
    // TODO: RKS -- Investigate why this is needed.  Me thinks that there really is no difference once the whole thing is optimized.  With a little
    // bit of work I'll bet we can eliminate these extension objects altogether.
    public processNext(msg?: Outbound) {
        if (this.closed) return;
        if (typeof msg !== "undefined" && msg !== null)
            if (!msg.failed) {
                // Remove all references to future items. We got it so we don't need it again.
                this.removeItem(msg.action, msg.payload[0]);
                if (this.curr && this.curr.isComplete) {
                    if (!this.curr.failed) {
                        // Call the identified callback.  This may add additional items.
                        if (typeof this.curr.oncomplete === 'function') {
                            this.curr.oncomplete(this.curr);
                            this.curr.oncomplete = undefined;
                        }
                    }
                }

            } else this.curr.failed = true;
        if (!this.curr && this.queue.length > 0) this.curr = this.queue.shift();
        if (!this.curr) {
            // There never was anything for us to do. We will likely never get here.
            state.status = 1;
            state.emitControllerChange();
            return;
        } else {
            state.status = sys.board.valueMaps.controllerStatus.transform(2, this.percent);
        }
        // Shift to the next config queue item.
        logger.verbose(`Config Queue Completed... ${this.percent}% (${this.remainingItems} remaining)`);
        while (
            this.queue.length > 0 && this.curr.isComplete
        ) {
            this.curr = this.queue.shift() || null;
        }
        let itm = 0;
        const self = this;
        if (this.curr && !this.curr.isComplete) {

            itm = this.curr.items.shift();
            const out: Outbound = Outbound.create({
                source: Message.pluginAddress,
                dest: 16,
                action: this.curr.setcategory,
                payload: [itm],
                retries: 3,
                response: Response.create({
                    response: true
                    , callback: () => {
                    //    console.log(`CALLBACKED`);
                    }
                    // , callback: () => {
                    //     self.processNext(out);
                    // }
                })
                // response: true,
                // onResponseProcessed: function () { self.processNext(out); }
            });
            // RKS: 12-1-22 the unfortunate part of the response: true setting is that there is mapping in the isResponse that should translate the exceptions
            // Unfortunately somewhere along the line we quit asking for the firmware version.  RG 12-4-22 Not sure where this is lost, but it is added back.
            //out.timeout = 5000;
            // setTimeout(() => conn.queueSendMessage(out), 50);
            out.sendAsync()
                .then(() => {
                    logger.debug(`msg ${out.toShortPacket()} sent successfully`);
                })
                .catch((err) => {
                    logger.error(`Error sending configuration request message on port ${out.portId}: ${err.message};`);
                })
                .finally(() => {
                    setTimeout(() => { self.processNext(out); }, 50);
                })

        } else {
            // Now that we are done check the configuration a final time.  If we have anything outstanding
            // it will get picked up.
            state.status = 1;
            this.curr = null;
            sys.configVersion.lastUpdated = new Date();
            // set a timer for 20 mins; if we don't get the config request it again.  This most likely happens if there is no other indoor/outdoor remotes or ScreenLogic.
            // this._configQueueTimer = setTimeout(()=>{sys.board.checkConfiguration();}, 20 * 60 * 1000);
            logger.info(`EasyTouch system config complete.`);
            state.cleanupState();
            ncp.initAsync(sys);
        }
        // Notify all the clients of our processing status.
        state.emitControllerChange();
    }
}
export class TouchScheduleCommands extends ScheduleCommands {
    public async setScheduleAsync(data: any, send: boolean = true): Promise<Schedule> {
        try {
            let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
            let slSchedId = id;
            if (id <= 0) id = sys.schedules.getNextEquipmentId(new EquipmentIdRange(1, sys.equipment.maxSchedules));
            if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid schedule id: ${data.id}`, data.id, 'Schedule'));
            let sched = sys.schedules.getItemById(id, id > 0);
            let ssched = state.schedules.getItemById(id, id > 0);
            let schedType = typeof data.scheduleType !== 'undefined' ? data.scheduleType : sched.scheduleType;
            if (typeof schedType === 'undefined') schedType = sys.board.valueMaps.scheduleTypes.getValue('repeat'); // Repeats

            let startTimeType = typeof data.startTimeType !== 'undefined' ? data.startTimeType : sched.startTimeType;
            let endTimeType = typeof data.endTimeType !== 'undefined' ? data.endTimeType : sched.endTimeType;
            // let startDate = typeof data.startDate !== 'undefined' ? data.startDate : sched.startDate;
            // if (typeof startDate.getMonth !== 'function') startDate = new Date(startDate);
            let heatSource = typeof data.heatSource !== 'undefined' && data.heatSource !== null ? data.heatSource : sched.heatSource || 32;
            let heatSetpoint = typeof data.heatSetpoint !== 'undefined' ? data.heatSetpoint : sched.heatSetpoint;
            let circuit = typeof data.circuit !== 'undefined' ? data.circuit : sched.circuit;
            let startTime = typeof data.startTime !== 'undefined' ? data.startTime : sched.startTime;
            let endTime = typeof data.endTime !== 'undefined' ? data.endTime : sched.endTime;
            let schedDays = sys.board.schedules.transformDays(typeof data.scheduleDays !== 'undefined' ? data.scheduleDays : sched.scheduleDays || 255); // default to all days
            let changeHeatSetpoint = typeof (data.changeHeatSetpoint !== 'undefined') ? utils.makeBool(data.changeHeatSetpoint) : sched.changeHeatSetpoint;
            let display = typeof data.display !== 'undefined' ? data.display : sched.display || 0;
            let endTimeOffset = typeof data.endTimeOffset !== 'undefined' ? data.endTimeOffset : sched.endTimeOffset;
            let startTimeOffset = typeof data.startTimeOffset !== 'undefined' ? data.startTimeOffset : sched.startTimeOffset;
            // Ensure all the defaults.
            // if (isNaN(startDate.getTime())) startDate = new Date();
            if (typeof startTime === 'undefined') startTime = 480; // 8am
            if (typeof endTime === 'undefined') endTime = 1020; // 5pm
            if (typeof startTimeType === 'undefined') startTimeType = 0; // Manual
            if (typeof endTimeType === 'undefined') endTimeType = 0; // Manual
            if (typeof circuit === 'undefined') circuit = 6; // pool
            if (typeof heatSource !== 'undefined' && typeof heatSetpoint === 'undefined') heatSetpoint = state.temps.units === sys.board.valueMaps.tempUnits.getValue('C') ? 26 : 80;
            if (typeof changeHeatSetpoint === 'undefined') changeHeatSetpoint = false;

            // At this point we should have all the data.  Validate it.
            if (!sys.board.valueMaps.scheduleTypes.valExists(schedType)) { sys.schedules.removeItemById(id); state.schedules.removeItemById(id); return Promise.reject(new InvalidEquipmentDataError(`Invalid schedule type; ${schedType}`, 'Schedule', schedType)); }
            if (!sys.board.valueMaps.scheduleTimeTypes.valExists(startTimeType)) { sys.schedules.removeItemById(id); state.schedules.removeItemById(id); return Promise.reject(new InvalidEquipmentDataError(`Invalid start time type; ${startTimeType}`, 'Schedule', startTimeType)); }
            if (!sys.board.valueMaps.scheduleTimeTypes.valExists(endTimeType)) { sys.schedules.removeItemById(id); state.schedules.removeItemById(id); return Promise.reject(new InvalidEquipmentDataError(`Invalid end time type; ${endTimeType}`, 'Schedule', endTimeType)); }
            if (!sys.board.valueMaps.heatSources.valExists(heatSource)) { sys.schedules.removeItemById(id); state.schedules.removeItemById(id); return Promise.reject(new InvalidEquipmentDataError(`Invalid heat source: ${heatSource}`, 'Schedule', heatSource)); }
            if (heatSetpoint < 0 || heatSetpoint > 104) { sys.schedules.removeItemById(id); state.schedules.removeItemById(id); return Promise.reject(new InvalidEquipmentDataError(`Invalid heat setpoint: ${heatSetpoint}`, 'Schedule', heatSetpoint)); }
            if (sys.board.circuits.getCircuitReferences(true, true, false, true).find(elem => elem.id === circuit) === undefined) { sys.schedules.removeItemById(id); state.schedules.removeItemById(id); return Promise.reject(new InvalidEquipmentDataError(`Invalid circuit reference: ${circuit}`, 'Schedule', circuit)); }
            // if (schedDays === 0) return Promise.reject(new InvalidEquipmentDataError(`Invalid schedule days: ${schedDays}. You must supply days that the schedule is to run.`, 'Schedule', schedDays));
            if (typeof heatSource !== 'undefined' && !sys.circuits.getItemById(circuit).hasHeatSource) heatSource = undefined;

            // If we make it here we can make it anywhere.
            // let runOnce = (schedDays || (schedType !== 0 ? 0 : 0x80));
            if (schedType === sys.board.valueMaps.scheduleTypes.getValue('runonce')) {
                // make sure only 1 day is selected
                let scheduleDays = sys.board.valueMaps.scheduleDays.transform(schedDays);
                let s2 = sys.board.valueMaps.scheduleDays.toArray();
                if (scheduleDays.days.length > 1) {
                    schedDays = scheduleDays.days[scheduleDays.days.length - 1].val;  // get the earliest day in the week
                }
                else if (scheduleDays.days.length === 0) {
                    for (let i = 0; i < s2.length; i++) {
                        if (s2[i].days[0].name === 'sun') schedDays = s2[i].val;
                    }
                }
                // update end time incase egg timer changed
                const eggTimer = sys.circuits.getInterfaceById(circuit).eggTimer || 720;
                endTime = (startTime + eggTimer) % 1440; // remove days if we go past midnight
            }


            // If we have sunrise/sunset then adjust for the values; if heliotrope isn't set just ignore
            if (state.heliotrope.isCalculated) {
                const sunrise = state.heliotrope.sunrise.getHours() * 60 + state.heliotrope.sunrise.getMinutes();
                const sunset = state.heliotrope.sunset.getHours() * 60 + state.heliotrope.sunset.getMinutes();
                if (startTimeType === sys.board.valueMaps.scheduleTimeTypes.getValue('sunrise')) startTime = (sunrise + startTimeOffset);
                else if (startTimeType === sys.board.valueMaps.scheduleTimeTypes.getValue('sunset')) startTime = (sunset + startTimeOffset);
                if (endTimeType === sys.board.valueMaps.scheduleTimeTypes.getValue('sunrise')) endTime = (sunrise + endTimeOffset);
                else if (endTimeType === sys.board.valueMaps.scheduleTimeTypes.getValue('sunset')) endTime = (sunset + endTimeOffset);
            }



            if (sl.enabled && send) {
                let slId = await sl.schedules.setScheduleAsync(slSchedId, circuit, startTime, endTime, schedDays, schedType, changeHeatSetpoint, heatSource, heatSetpoint);
                // if SL adds this as a new schedule id different from what we expect.
                if (slId !== id) {
                    sys.schedules.removeItemById(id);
                    state.schedules.removeItemById(id);
                    id = slId;
                    sched = sys.schedules.getItemById(id, id > 0);
                    ssched = state.schedules.getItemById(id, id > 0);
                }
            }
            else if (send) {
                let out = Outbound.create({
                    action: 145,
                    payload: [
                        id,
                        circuit,
                        Math.floor(startTime / 60),
                        startTime - (Math.floor(startTime / 60) * 60),
                        schedType === sys.board.valueMaps.scheduleTypes.getValue('runonce') ? sys.board.valueMaps.scheduleTypes.getValue('runonce') : Math.floor(endTime / 60),
                        endTime - (Math.floor(endTime / 60) * 60),
                        schedDays],
                    retries: 2
                    // ,response: Response.create({ action: 1, payload: [145] })
                });
                await out.sendAsync();
            }
            sched.circuit = ssched.circuit = circuit;
            sched.scheduleDays = ssched.scheduleDays = schedDays;
            sched.scheduleType = ssched.scheduleType = schedType;
            sched.changeHeatSetpoint = ssched.changeHeatSetpoint = changeHeatSetpoint;
            sched.heatSetpoint = ssched.heatSetpoint = heatSetpoint;
            sched.heatSource = ssched.heatSource = heatSource;
            sched.startTime = ssched.startTime = startTime;
            sched.endTime = ssched.endTime = endTime;
            sched.startTimeType = ssched.startTimeType = startTimeType;
            sched.endTimeType = ssched.endTimeType = endTimeType;
            sched.isActive = ssched.isActive = true;
            ssched.display = sched.display = display;
            sched.startTimeOffset = ssched.startTimeOffset = startTimeOffset;
            sched.endTimeOffset = ssched.endTimeOffset = endTimeOffset;
            ssched.emitEquipmentChange();
            // For good measure russ is sending out a config request for
            // the schedule in question.  If there was a failure on the
            // OCP side this will resolve it.
            if (send && !sl.enabled) {
                let req = Outbound.create({ action: 209, payload: [sched.id], retries: 2 });
                await req.sendAsync();
            }
            state.schedules.sortById();
            return sched;
        }
        catch (err) {
            return Promise.reject(err);
        }
    }
    public async deleteScheduleAsync(data: any): Promise<Schedule> {
        let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
        if (isNaN(id) || id < 0) return Promise.reject(new InvalidEquipmentIdError(`Invalid schedule id: ${data.id}`, data.id, 'Schedule'));
        let sched = sys.schedules.getItemById(id);
        let ssched = state.schedules.getItemById(id);
        // RKS: Assuming you just send 0s for the schedule and it will delete it.
        try {
            if (sl.enabled) {
                await sl.schedules.deleteScheduleAsync(id);
            }
            else {

                let out = Outbound.create({
                    action: 145,
                    payload: [
                        id,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0],
                    retries: 3
                });
                await out.sendAsync();
            }
            sys.schedules.removeItemById(id);
            state.schedules.removeItemById(id);
            ssched.emitEquipmentChange();
            sched.isActive = false;
            if (!sl.enabled) {
                let req = Outbound.create({ action: 209, payload: [sched.id], retries: 2 });
                await req.sendAsync();
            }
            return sched;
        }
        catch (err) {
            return Promise.reject(err);
        }
    }
    public async setEggTimerAsync(data?: any, send: boolean = true): Promise<EggTimer> {
        let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
        if (id <= 0) id = sys.schedules.getNextEquipmentId(new EquipmentIdRange(1, sys.equipment.maxSchedules));
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid schedule/eggTimer id: ${data.id} or all schedule/eggTimer ids filled (${sys.eggTimers.length + sys.schedules.length} used out of ${sys.equipment.maxSchedules})`, data.id, 'Schedule'));
        let circuit = sys.circuits.getInterfaceById(data.circuit);
        if (typeof circuit === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Invalid circuit id: ${data.circuit} for schedule id ${data.id}`, data.id, 'Schedule'));

        try {
            if (send) {
                if (sl.enabled) {
                    await sl.schedules.setEggTimerAsync(circuit.id, parseInt(data.runTime, 10));
                }
                else {

                    let out = Outbound.create({
                        action: 145,
                        payload: [
                            id,
                            circuit.id,
                            25,
                            0,
                            utils.makeBool(data.dontStop) ? 27 : Math.floor(parseInt(data.runTime, 10) / 60),
                            utils.makeBool(data.dontStop) ? 0 : data.runTime - (Math.floor(parseInt(data.runTime, 10) / 60) * 60),
                            0],
                        retries: 2
                    });
                    await out.sendAsync();
                }
            }
            let eggTimer = sys.eggTimers.getItemById(id, true);
            eggTimer.circuit = circuit.id;
            eggTimer.runTime = circuit.eggTimer = typeof data.runTime !== 'undefined' ? data.runTime : circuit.eggTimer || 720;
            circuit.dontStop = typeof data.dontStop !== 'undefined' ? utils.makeBool(data.dontStop) : eggTimer.runTime === 1620;
            eggTimer.isActive = true;
            // For good measure russ is sending out a config request for
            // the schedule in question.  If there was a failure on the
            // OCP side this will resolve it.
            if (send) {
                let req = Outbound.create({ action: 209, payload: [eggTimer.id], retries: 2 });
                await req.sendAsync();
            }
            return eggTimer;
        }
        catch (err) {
            return Promise.reject(err);
        }

    }
    public async deleteEggTimerAsync(data: any): Promise<EggTimer> {
        let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
        if (isNaN(id) || id < 0) throw new InvalidEquipmentIdError(`Invalid eggTimer id: ${data.id}`, data.id, 'Schedule');
        let eggTimer = sys.eggTimers.getItemById(id);
        // RKS: Assuming you just send 0s for the schedule and it will delete it.
        try {
            if (sl.enabled) {
                await sl.schedules.setEggTimerAsync(data.circuit, 720);
            }
            else {
                let out = Outbound.create({
                    action: 145,
                    payload: [
                        id,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0],
                    retries: 3
                });
                await out.sendAsync();
            }
            const circuit = sys.circuits.getInterfaceById(data.circuit);
            circuit.eggTimer = 720;
            circuit.dontStop = circuit.eggTimer === 1620;
            sys.eggTimers.removeItemById(id);
            eggTimer.isActive = false;
            if (!sl.enabled) {
                let req = Outbound.create({ action: 209, payload: [eggTimer.id], retries: 2 });
                await req.sendAsync();
            }
            return eggTimer;
        }
        catch (err) {
            return Promise.reject(err);
        }
    }
    public async updateSunriseSunsetAsync(): Promise<boolean> {
        // *Touch doesn't have a notion of sunrise/sunset on the schedules;
        // This will check the schedule and if the existing sunrise/sunset times 
        // are not matching the desired time it will update the time on the OCP.
        // https://github.com/tagyoureit/nodejs-poolController/discussions/560#discussioncomment-3362149
        if (!state.heliotrope.isCalculated) { return false; }
        const sunrise = state.heliotrope.sunrise.getHours() * 60 + state.heliotrope.sunrise.getMinutes();
        const sunset = state.heliotrope.sunset.getHours() * 60 + state.heliotrope.sunset.getMinutes();

        let anyUpdated = false;
        for (let i = 0; i <= sys.schedules.length; i++) {
            let sUpdated = false;
            let sched = sys.schedules.getItemByIndex(i);
            if (sched.startTimeType === sys.board.valueMaps.scheduleTimeTypes.getValue('sunrise') && sched.startTime !== sunrise) {
                sched.startTime = sunrise + (sched.startTimeOffset || 0);
                anyUpdated = sUpdated = true;
            }
            else if (sched.startTimeType === sys.board.valueMaps.scheduleTimeTypes.getValue('sunset') && sched.startTime !== sunset) {
                sched.startTime = sunset + (sched.startTimeOffset || 0);
                anyUpdated = sUpdated = true;
            }
            if (sched.endTimeType === sys.board.valueMaps.scheduleTimeTypes.getValue('sunrise') && sched.endTime !== sunrise) {
                sched.endTime = sunrise + (sched.endTimeOffset || 0);
                anyUpdated = sUpdated = true;
            }
            else if (sched.endTimeType === sys.board.valueMaps.scheduleTimeTypes.getValue('sunset') && sched.endTime !== sunset) {
                sched.endTime = sunset + (sched.endTimeOffset || 0);
                anyUpdated = sUpdated = true;
            }
            if (sUpdated) {
                await sys.board.schedules.setScheduleAsync({ id: sched.id });
            }
        }
        return Promise.resolve(anyUpdated);
    };
}

// todo: this can be implemented as a bytevaluemap
export enum TouchConfigCategories {
    dateTime = 5,
    heatTemperature = 8,
    customNames = 10,
    circuits = 11,
    schedules = 17,
    quickTouchRemote = 22,
    pumpStatus = 23,
    pumpConfig = 24,
    intellichlor = 25,
    valves = 29,
    highSpeedCircuits = 30,
    is4is10 = 32,
    solarHeatPump = 34,
    delays = 35,
    lightGroupPositions = 39,
    circuitGroups = 41,
    settings = 40,
    version = 252
}
export enum GetTouchConfigCategories {
    dateTime = 197,
    heatTemperature = 200,
    customNames = 202,
    circuits = 203,
    schedules = 209,
    quickTouchRemote = 214,
    pumpStatus = 215,
    pumpConfig = 216,
    intellichlor = 217,
    valves = 221,
    highSpeedCircuits = 222,
    is4is10 = 224,
    intellifloSpaSideRemotes = 225,
    solarHeatPump = 226,
    delays = 227,
    lightGroupPositions = 231,
    settings = 232,
    circuitGroups = 233,
    version = 253
}
class TouchSystemCommands extends SystemCommands {
    public async cancelDelay() {
        try {
            if (sl.enabled) {
                await sl.bodies.cancelDalayAsync();
            }
            else {
                let out = Outbound.create({
                    action: 131,
                    payload: [0],
                    retries: 0,
                    response: true
                });
                await out.sendAsync();
            }
            state.delay = sys.board.valueMaps.delay.getValue('nodelay');
            return state.data.delay;
        }
        catch (err) {
            return Promise.reject(err);
        }
    }
    public async setDateTimeAsync(obj: any, send: boolean = true): Promise<any> {

        let dst = sys.general.options.adjustDST ? 1 : 0;
        if (typeof obj.dst !== 'undefined') utils.makeBool(obj.dst) ? dst = 1 : dst = 0;
        let { hour = state.time.hours,
            min = state.time.minutes,
            date = state.time.date,
            month = state.time.month,
            year = state.time.year >= 100 ? state.time.year - 2000 : state.time.year,
            dow = Timestamp.dayOfWeek(state.time) } = obj;
        if (obj.dt instanceof Date) {
            let _dt: Date = obj.dt;
            hour = _dt.getHours();
            min = _dt.getMinutes();
            date = _dt.getDate();
            month = _dt.getMonth() + 1;
            year = _dt.getFullYear() - 2000;
            let dates = sys.board.valueMaps.scheduleDays.toArray();
            dates.forEach(d => {
                if (d.dow === _dt.getDay()) dow = d.val;
            })
        }
        if (obj.clockSource === 'manual' || obj.clockSource === 'server') sys.general.options.clockSource = obj.clockSource;
        // dow= day of week as expressed as [0=Sunday, 1=Monday, 2=Tuesday, 4=Wednesday, 8=Thursday, 16=Friday, 32=Saturday] 
        // and DST = 0(manually adjst for DST) or 1(automatically adjust DST)
        // [165,33,16,34,133,8],[13,10,16,29,8,19,0,0],[1,228]
        // [165,33,34,16,1,1],[133],[1,127]
        const out = Outbound.create({
            source: Message.pluginAddress,
            dest: 16,
            action: 133,
            payload: [hour, min, dow, date, month, year, 0, dst],
            retries: 3,
            response: true
        });
        try {
            if (sl.enabled && send) {
                await sl.controller.setSystemTime();
            }
            else if (send) await out.sendAsync();
            state.time.hours = hour;
            state.time.minutes = min;
            state.time.date = date;
            state.time.month = month;
            state.time.year = year;
            if (sys.general.options.clockSource !== 'server' || typeof sys.general.options.adjustDST === 'undefined') sys.general.options.adjustDST = dst === 1 ? true : false;
            sys.board.system.setTZ();
            return {
                time: state.time.format(),
                adjustDST: sys.general.options.adjustDST,
                clockSource: sys.general.options.clockSource
            };
        }
        catch (err) {
            return Promise.reject(err);
        }
    }
    public async setCustomNameAsync(data: any, send: boolean = true): Promise<CustomName> {
        let id = parseInt(data.id, 10);
        if (isNaN(id)) throw new InvalidEquipmentIdError('Invalid Custom Name Id', data.id, 'customName');
        if (id > sys.equipment.maxCustomNames) throw new InvalidEquipmentIdError('Custom Name Id out of range', data.id, 'customName');
        let cname = sys.customNames.getItemById(id);
        // No need to make any changes. Just return.
        if (cname.name === data.name) return cname;
        try {
            if (sl.enabled && send) {
                await sl.controller.setCustomName(id, data.name);
            }
            else if (send) {
                let out = Outbound.create({
                    action: 138,
                    payload: [data.id],
                    response: true,
                    retries: 3
                });
                out.appendPayloadString(data.name, 11);
                await out.sendAsync();
            }

            let c = sys.customNames.getItemById(id, true);
            c.name = data.name;

            sys.board.system.syncCustomNamesValueMap();
            sys.emitEquipmentChange();
            for (let i = 0; i < sys.circuits.length; i++) {
                let circ = sys.circuits.getItemByIndex(i);
                if (circ.nameId === data.id + 200) {
                    let cstate = state.circuits.getItemById(circ.id);
                    cstate.name = circ.name = data.name;
                    for (let j = 0; j < state.schedules.length; j++) {
                        let ssched = state.schedules.getItemByIndex(j);
                        if (ssched.circuit === cstate.id) {
                            ssched.hasChanged = true;
                            ssched.emitEquipmentChange();
                        }
                    }
                }
            }
            for (let i = 0; i < sys.circuitGroups.length; i++) {
                let cg = sys.circuitGroups.getItemByIndex(i);
                if (cg.nameId === data.id + 200) {
                    let cgstate = state.circuitGroups.getItemById(cg.id);
                    cgstate.name = cg.name = data.name;
                    for (let j = 0; j < state.schedules.length; j++) {
                        let ssched = state.schedules.getItemByIndex(j);
                        if (ssched.circuit === cgstate.id) {
                            ssched.hasChanged = true;
                            ssched.emitEquipmentChange();
                        }
                    }
                }
            }
            for (let i = 0; i < sys.lightGroups.length; i++) {
                let lg = sys.lightGroups.getItemByIndex(i);
                if (lg.nameId === data.id + 200) {
                    let lgstate = state.lightGroups.getItemById(lg.id);
                    lgstate.name = lg.name = data.name;
                    for (let j = 0; j < state.schedules.length; j++) {
                        let ssched = state.schedules.getItemByIndex(j);
                        if (ssched.circuit === lgstate.id) {
                            ssched.hasChanged = true;
                            ssched.emitEquipmentChange();
                        }
                    }
                }
            }
            for (let i = 0; i < sys.features.length; i++) {
                let f = sys.features.getItemByIndex(i);
                if (f.nameId === data.id + 200) {
                    let fstate = state.features.getItemById(f.id);
                    fstate.name = f.name = data.name;
                    for (let j = 0; j < state.schedules.length; j++) {
                        let ssched = state.schedules.getItemByIndex(j);
                        if (ssched.circuit === fstate.id) {
                            ssched.hasChanged = true;
                            ssched.emitEquipmentChange();
                        }
                    }
                }
            }
            state.emitEquipmentChanges();
            return c;
        } catch (err) {
            return Promise.reject(err);
        }

    }
    public async setOptionsAsync(obj: any): Promise<Options> {
        // Proxy for setBodyAsync.  See below for explanation.
        await sys.board.bodies.setBodyAsync(obj);
        if (typeof obj.clockSource !== 'undefined') {
            sys.general.options.clockSource = obj.clockSource;
            if (sys.general.options.clockSource === 'server') sys.board.system.setTZ();
        }

        return sys.general.options;
    }
}
class TouchBodyCommands extends BodyCommands {
    public async setBodyAsync(obj: any): Promise<Body> {
        // The 168 is a funky packet in *Touch because it can set:
        // * Intellichem Installed (byte 3, bit 1)
        // * Manual spa heat (byte 4, bit 1) which only applies to the spa but is a 
        //    general option
        // * Manual Priority (byte 5, bit 1 - Intellitouch only)
        // and this function can be called by either setIntelliChem (protected)
        // or directly from setBodyAsync (/config/body endpoint) or from setGeneralAsync (/config/options)
        // for Manual Priority.
        // We also need to return the proper body setting manual heat, but it is irrelevant
        // for when we are returning to chemController
        try {
            let manualHeat = sys.general.options.manualHeat;
            let manualPriority = sys.general.options.manualPriority;
            if (typeof obj.manualHeat !== 'undefined') manualHeat = utils.makeBool(obj.manualHeat);
            if (typeof obj.manualPriority !== 'undefined') manualPriority = utils.makeBool(obj.manualPriority);
            let body = sys.bodies.getItemById(obj.id, false);
            let intellichemInstalled = sys.chemControllers.getItemByAddress(144, false).isActive;
            if (sl.enabled) {              
                await sl.controller.setEquipmentAsync({manualHeat, intellichem: intellichemInstalled}, 'misc');
            }
            else {
                let out = Outbound.create({
                    dest: 16,
                    action: 168,
                    retries: 3,
                    response: true,
                });
                out.insertPayloadBytes(0, 0, 9);
                out.setPayloadByte(3, intellichemInstalled ? 255 : 254);
                out.setPayloadByte(4, manualHeat ? 1 : 0);
                out.setPayloadByte(5, manualPriority ? 1 : 0);
                await out.sendAsync();
            }
            sys.general.options.manualHeat = manualHeat;
            sys.general.options.manualPriority = manualPriority;
            let sbody = state.temps.bodies.getItemById(body.id, true);
            if (body.type === 1) { // spa
                body.manualHeat = manualHeat;
            };
            if (typeof obj.name !== 'undefined') body.name = sbody.name = obj.name;
            if (typeof obj.capacity !== 'undefined') body.capacity = parseInt(obj.capacity, 10);
            if (typeof obj.showInDashboard !== 'undefined') body.showInDashboard = sbody.showInDashboard = utils.makeBool(obj.showInDashboard);
            state.emitEquipmentChanges();
            return body;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setHeatModeAsync(body: Body, mode: number): Promise<BodyTempState> {
        //  [16,34,136,4],[POOL HEAT Temp,SPA HEAT Temp,Heat Mode,0,2,56]
        //  [85, 97, 7, 0]
        // byte | val | 
        // 0    | 85  | Pool Setpoint
        // 1    | 97  | Spa setpoint
        // 2    | 7   | Pool/spa heat modes (01 = Heater spa 11 = Solar Only pool)
        // 3    | 0   | Cool set point for ultratemp


        // Heat modes
        // 0 = Off
        // 1 = Heater
        // 2 = Solar/Heatpump Pref
        // 3 = Solar
        // 

        const body1 = sys.bodies.getItemById(1);
        const body2 = sys.bodies.getItemById(2);
        const temp1 = body1.setPoint || 100;
        const temp2 = body2.setPoint || 100;
        let cool = body1.coolSetpoint || 0;
        let mode1 = body1.heatMode;
        let mode2 = body2.heatMode;
        body.id === 1 ? mode1 = mode : mode2 = mode;
        let out = Outbound.create({
            dest: 16,
            action: 136,
            payload: [temp1, temp2, mode2 << 2 | mode1, cool],
            retries: 3,
            response: true
        });
        try {
            if (sl.enabled) {
                await sl.bodies.setHeatModeAsync(body, mode);
            }
            else {
                await out.sendAsync();
            }
            body.heatMode = mode;
            let bstate = state.temps.bodies.getItemById(body.id);
            bstate.heatMode = mode;
            state.emitEquipmentChanges();
            return bstate;
        } catch (err) {
            return Promise.reject(err);
        }

    }
    public async setSetpoints(body: Body, obj: any, send: boolean = true): Promise<BodyTempState> {
        let setPoint = typeof obj.setPoint !== 'undefined' ? parseInt(obj.setPoint, 10) : parseInt(obj.heatSetpoint, 10);
        let coolSetPoint = typeof obj.coolSetPoint !== 'undefined' ? parseInt(obj.coolSetPoint, 10) : 0;
        if (isNaN(setPoint)) return Promise.reject(new InvalidEquipmentDataError(`Invalid ${body.name} setpoint ${obj.setPoint || obj.heatSetpoint}`, 'body', obj));
        // [16,34,136,4],[POOL HEAT Temp,SPA HEAT Temp,Heat Mode,0,2,56]
        // 165,33,16,34,136,4,89,99,7,0,2,71  Request
        // 165,33,34,16,1,1,136,1,130  Controller Response
        const tempUnits = state.temps.units;
        switch (tempUnits) {
            case 0: // fahrenheit
                {
                    if (setPoint < 40 || setPoint > 104) {
                        logger.warn(`Setpoint of ${setPoint} is outside acceptable range.`);
                    }
                    if (coolSetPoint < 40 || coolSetPoint > 104) {
                        logger.warn(`Cool Setpoint of ${setPoint} is outside acceptable range.`);
                        return;
                    }
                    break;
                }
            case 1: // celsius
                {
                    if (setPoint < 4 || setPoint > 40) {
                        logger.warn(
                            `Setpoint of ${setPoint} is outside of acceptable range.`
                        );
                        return;
                    }
                    if (coolSetPoint < 4 || coolSetPoint > 40) {
                        logger.warn(`Cool SetPoint of ${coolSetPoint} is outside of acceptable range.`
                        );
                        return;
                    }
                    break;
                }
        }
        const body1 = sys.bodies.getItemById(1);
        const body2 = sys.bodies.getItemById(2);
        let temp1 = body1.setPoint || tempUnits === 0 ? 40 : 4;
        let temp2 = body2.setPoint || tempUnits === 0 ? 40 : 4;
        let cool = coolSetPoint || body1.setPoint + 1;
        body.id === 1 ? temp1 = setPoint : temp2 = setPoint;
        const mode1 = body1.heatMode;
        const mode2 = body2.heatMode;
        const out = Outbound.create({
            dest: 16,
            action: 136,
            payload: [temp1, temp2, mode2 << 2 | mode1, cool],
            retries: 3,
            response: true
        });
        try {
            if (sl.enabled && send) {
                await sl.bodies.setHeatSetpointAsync(body, setPoint);
            }
            else if (send) {
                await out.sendAsync();
            }
            body.setPoint = setPoint;
            let bstate = state.temps.bodies.getItemById(body.id);
            bstate.setPoint = setPoint;
            if (body.id === 1) body.coolSetpoint = bstate.coolSetpoint = cool;
            state.temps.emitEquipmentChange();
            return bstate;
        } catch (err) {
            return Promise.reject(err);
        }
    }
    public async setHeatSetpointAsync(body: Body, setPoint: number): Promise<BodyTempState> {
        // [16,34,136,4],[POOL HEAT Temp,SPA HEAT Temp,Heat Mode,0,2,56]
        // 165,33,16,34,136,4,89,99,7,0,2,71  Request
        // 165,33,34,16,1,1,136,1,130  Controller Response
        const tempUnits = state.temps.units;
        switch (tempUnits) {
            case 0: // fahrenheit
                if (setPoint < 40 || setPoint > 104) {
                    logger.warn(`Setpoint of ${setPoint} is outside acceptable range.`);
                    return;
                }
                break;
            case 1: // celsius
                if (setPoint < 4 || setPoint > 40) {
                    logger.warn(
                        `Setpoint of ${setPoint} is outside of acceptable range.`
                    );
                    return;
                }
                break;
        }
        const body1 = sys.bodies.getItemById(1);
        const body2 = sys.bodies.getItemById(2);
        let temp1 = body1.setPoint || 100;
        let temp2 = body2.setPoint || 100;
        body.id === 1 ? temp1 = setPoint : temp2 = setPoint;
        const mode1 = body1.heatMode || 0;
        const mode2 = body2.heatMode || 0;
        let cool = body1.coolSetpoint || (body1.setPoint + 1);
        const out = Outbound.create({
            dest: 16,
            action: 136,
            payload: [temp1, temp2, mode2 << 2 | mode1, cool],
            retries: 3,
            response: true
        });
        try {
            if (sl.enabled) {
                await sl.bodies.setHeatSetpointAsync(body, setPoint);
            }
            else {
                await out.sendAsync();
            }
            body.setPoint = setPoint;
            let bstate = state.temps.bodies.getItemById(body.id);
            bstate.setPoint = setPoint;
            state.temps.emitEquipmentChange();
            return bstate;
        } catch (err) {
            return Promise.reject(err);
        }
    }
    public async setCoolSetpointAsync(body: Body, setPoint: number): Promise<BodyTempState> {
        // [16,34,136,4],[POOL HEAT Temp,SPA HEAT Temp,Heat Mode,Cool,2,56]
        // 165,33,16,34,136,4,89,99,7,0,2,71  Request
        // 165,33,34,16,1,1,136,1,130  Controller Response
        const tempUnits = state.temps.units;
        switch (tempUnits) {
            case 0: // fahrenheit
                if (setPoint < 40 || setPoint > 104) {
                    logger.warn(`Setpoint of ${setPoint} is outside acceptable range.`);
                    return;
                }
                break;
            case 1: // celsius
                if (setPoint < 4 || setPoint > 40) {
                    logger.warn(
                        `Setpoint of ${setPoint} is outside of acceptable range.`
                    );
                    return;
                }
                break;
        }
        const body1 = sys.bodies.getItemById(1);
        const body2 = sys.bodies.getItemById(2);
        let temp1 = body1.setPoint || 100;
        let temp2 = body2.setPoint || 100;
        const mode1 = body1.heatMode || 0;
        const mode2 = body2.heatMode || 0;
        const out = Outbound.create({
            dest: 16,
            action: 136,
            payload: [temp1, temp2, mode2 << 2 | mode1, setPoint],
            retries: 3,
            response: true
        });
        if (sl.enabled) {
            await sl.bodies.setCoolSetpointAsync(body, setPoint);
        }
        else {
            await out.sendAsync();
        }
        let bstate = state.temps.bodies.getItemById(body.id);
        body.coolSetpoint = bstate.coolSetpoint = setPoint;
        state.temps.emitEquipmentChange();
        return bstate;
    }
}
export class TouchCircuitCommands extends CircuitCommands {
    public async setCircuitAsync(data: any, send: boolean = true): Promise<ICircuit> {
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
            let cstate = state.circuits.getInterfaceById(data.id, true);
            let showInFeatures = cstate.showInFeatures = typeof data.showInFeatures !== 'undefined' ? utils.makeBool(data.showInFeatures) : circuit.showInFeatures;
            let typeByte = parseInt(data.type, 10) === 0 ? 0 : parseInt(data.type, 10) || circuit.type || sys.board.valueMaps.circuitFunctions.getValue('generic');
            let freeze = typeof data.freeze !== 'undefined' ? utils.makeBool(data.freeze) : circuit.freeze;
            let nameByte = 3; // set default `Aux 1`
            if (typeof data.nameId !== 'undefined') nameByte = data.nameId;
            else if (typeof circuit.name !== 'undefined') nameByte = circuit.nameId;
            if (send) {
                if (sl.enabled) {
                    // SL show in features = 0 = pool; 1 = spa; 2 = features; 4 = lights; 5 = hide
                    await sl.circuits.setCircuitAsync(parseInt(data.id, 10), nameByte, typeByte, showInFeatures ? 2 : 0, freeze)
                }
                else {
                    let out = Outbound.create({
                        action: 139,
                        payload: [parseInt(data.id, 10), typeByte | (utils.makeBool(data.freeze) ? 64 : 0), nameByte, 0, 0],
                        retries: 3,
                        response: true
                    });
                    await out.sendAsync();
                }
            }
            circuit = sys.circuits.getInterfaceById(data.id, true);
            circuit.nameId = cstate.nameId = nameByte;
            circuit.name = cstate.name = sys.board.valueMaps.circuitNames.transform(nameByte).desc;
            circuit.showInFeatures = showInFeatures;
            circuit.freeze = freeze;
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
    public async deleteCircuitAsync(data: any): Promise<ICircuit> {
        let circuit = sys.circuits.getItemById(data.id);
        if (circuit.master === 1) return await super.deleteCircuitAsync(data);
        data.nameId = 0;
        data.functionId = sys.board.valueMaps.circuitFunctions.getValue('notused');
        return this.setCircuitAsync(data);
    }
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
        let cstate = state.circuits.getInterfaceById(id);
        let out = Outbound.create({
            action: 134,
            payload: [id, val ? 1 : 0],
            retries: 3,
            response: true,
            scope: `circuitState${id}`
        });
        if (sl.enabled) {
            await sl.circuits.setCircuitStateAsync(id, val);
        }
        else {
            await out.sendAsync();
        }
        sys.board.circuits.setEndTime(c, cstate, val);
        cstate.isOn = val;
        state.emitEquipmentChanges();
        return cstate;
    }
    public async setLightGroupStateAsync(id: number, val: boolean): Promise<ICircuitGroupState> { return this.setCircuitGroupStateAsync(id, val); }
    public async toggleCircuitStateAsync(id: number) {
        let cstate = state.circuits.getInterfaceById(id);
        if (cstate instanceof LightGroupState) {
            return await this.setLightGroupThemeAsync(id, sys.board.valueMaps.lightThemes.getValue(cstate.isOn ? 'off' : 'on'));
        }
        return await this.setCircuitStateAsync(id, !cstate.isOn);
    }

    public async setLightGroupAsync(obj: any, send: boolean = true): Promise<LightGroup> {
        try {
            let group: LightGroup = null;
            let id = typeof obj.id !== 'undefined' ? parseInt(obj.id, 10) : -1;
            if (id <= 0) {
                // We are adding a circuit group.
                id = sys.circuitGroups.getNextEquipmentId(sys.board.equipmentIds.circuitGroups);
            }
            if (typeof id === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Max circuit light group id exceeded`, id, 'LightGroup'));
            if (isNaN(id) || !sys.board.equipmentIds.circuitGroups.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid circuit group id: ${obj.id}`, obj.id, 'LightGroup'));
            group = sys.lightGroups.getItemById(id, true);

            if (typeof obj.name !== 'undefined') group.name = obj.name;
            if (typeof obj.eggTimer !== 'undefined') group.eggTimer = Math.min(Math.max(parseInt(obj.eggTimer, 10), 0), 1440); // this isn't an *Touch thing, so need to figure out if we can handle it some other way
            group.dontStop = (group.eggTimer === 1440);
            group.isActive = true;
            group.type = 3; // intellibrite
            if (typeof obj.circuits !== 'undefined') {
                for (let i = 0; i < obj.circuits.length; i++) {
                    let cobj = obj.circuits[i];
                    let c: LightGroupCircuit;
                    if (typeof cobj.id !== 'undefined') c = group.circuits.getItemById(parseInt(cobj.id, 10), true);
                    else if (typeof cobj.circuit !== 'undefined') c = group.circuits.getItemByCircuitId(parseInt(cobj.circuit, 10), true);
                    else c = group.circuits.getItemByIndex(i, true, { id: i + 1 });
                    if (typeof cobj.circuit !== 'undefined') c.circuit = cobj.circuit;
                    //if (typeof cobj.lightingTheme !== 'undefined') c.lightingTheme = parseInt(cobj.lightingTheme, 10); // does this belong here?
                    if (typeof cobj.color !== 'undefined') c.color = parseInt(cobj.color, 10);
                    if (typeof cobj.swimDelay !== 'undefined') c.swimDelay = parseInt(cobj.swimDelay, 10);
                    if (typeof cobj.position !== 'undefined') c.position = parseInt(cobj.position, 10);
                }
                // group.circuits.length = obj.circuits.length;
            }
            if (sl.enabled && send) {
                await sl.controller.setEquipmentAsync(obj,'lightGroup');
            }
            else if (send) {
                if (sys.equipment.maxIntelliBrites === 8) {
                    // Easytouch

                    let out = Outbound.create({
                        action: 167,
                        retries: 3,
                        response: true
                    });
                    const lgcircuits = group.circuits.get();
                    for (let circ = 0; circ < 8; circ++) {
                        const lgcirc = lgcircuits[circ];
                        if (typeof lgcirc === 'undefined') out.payload.push(0, 0, 0, 0);
                        else {
                            out.payload.push(lgcirc.circuit);
                            out.payload.push(((lgcirc.position - 1) << 4) + lgcirc.color);
                            out.payload.push(lgcirc.swimDelay << 1);
                            out.payload.push(0);
                        }
                    }
                    await out.sendAsync();
                }
                else {
                    // Intellitouch
                    const lgcircuits = group.circuits.get();
                    if (send) {

                        let out = Outbound.create({
                            action: 167,
                            retries: 3,
                            payload: [1],
                            response: true
                        });
                        for (let circ = 0; circ < 5; circ++) {
                            const lgcirc = lgcircuits[circ];
                            if (typeof lgcirc === 'undefined') out.payload.push.apply([0, 0, 0, 0]);
                            else {
                                out.payload.push(lgcirc.id);
                                out.payload.push(((lgcirc.position - 1) << 4) + lgcirc.color);
                                out.payload.push(lgcirc.swimDelay << 1);
                                out.payload.push(0);
                            }
                        }
                        await out.sendAsync();

                        out = Outbound.create({
                            action: 167,
                            retries: 3,
                            payload: [2],
                            response: true
                        });
                        for (let circ = 5; circ < 10; circ++) {
                            const lgcirc = lgcircuits[circ];
                            if (typeof lgcirc === 'undefined') out.payload.push.apply([0, 0, 0, 0]);
                            else {
                                out.payload.push(lgcirc.id);
                                out.payload.push(((lgcirc.position - 1) << 4) + lgcirc.color);
                                out.payload.push(lgcirc.swimDelay << 1);
                                out.payload.push(0);
                            }
                        }
                        out.sendAsync();

                    }
                }
                let out = Outbound.create({
                    action: 231,
                    payload: [0]
                });
                await out.sendAsync();
            }
            sys.emitData('lightGroupConfig', group.get(true));
            return group;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setLightThemeAsync(id: number, theme: number): Promise<ICircuitState> {
        // Re-route this as we cannot set individual circuit themes in *Touch.
        return this.setLightGroupThemeAsync(id, theme);
    }
    public async runLightGroupCommandAsync(obj: any): Promise<ICircuitState> {
        // Do all our validation.
        try {
            let id = parseInt(obj.id, 10);
            let cmd = typeof obj.command !== 'undefined' ? sys.board.valueMaps.lightGroupCommands.findItem(obj.command) : { val: 0, name: 'undefined' };
            if (cmd.val === 0) return Promise.reject(new InvalidOperationError(`Light group command ${cmd.name} does not exist`, 'runLightGroupCommandAsync'));
            if (isNaN(id)) return Promise.reject(new InvalidOperationError(`Light group ${id} does not exist`, 'runLightGroupCommandAsync'));
            let grp = sys.lightGroups.getItemById(id);
            let nop = sys.board.valueMaps.circuitActions.getValue(cmd.name);
            let sgrp = state.lightGroups.getItemById(grp.id);
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
                    await this.setLightGroupThemeAsync(id, 190);
                    break;
                case 'colorrecall':
                    await this.setLightGroupThemeAsync(id, 191);
                    break;
                case 'lightthumper':
                    await this.setLightGroupThemeAsync(id, 208);
                    break;
            }
            sgrp.action = 0;
            sgrp.emitEquipmentChange();
            return sgrp;
        }
        catch (err) { return Promise.reject(`Error runLightGroupCommandAsync ${err.message}`); }
    }
    public async runLightCommandAsync(obj: any): Promise<ICircuitState> {
        // Do all our validation.
        try {
            let id = parseInt(obj.id, 10);
            let cmd = typeof obj.command !== 'undefined' ? sys.board.valueMaps.lightCommands.findItem(obj.command) : { val: 0, name: 'undefined' };
            if (cmd.val === 0) return Promise.reject(new InvalidOperationError(`Light command ${cmd.name} does not exist`, 'runLightCommandAsync'));
            if (isNaN(id)) return Promise.reject(new InvalidOperationError(`Light ${id} does not exist`, 'runLightCommandAsync'));
            let circ = sys.circuits.getItemById(id);
            if (!circ.isActive) return Promise.reject(new InvalidOperationError(`Light circuit #${id} is not active`, 'runLightCommandAsync'));
            let type = sys.board.valueMaps.circuitFunctions.transform(circ.type);
            if (!type.isLight) return Promise.reject(new InvalidOperationError(`Circuit #${id} is not a light`, 'runLightCommandAsync'));
            let nop = sys.board.valueMaps.circuitActions.getValue(cmd.name);
            let slight = state.circuits.getItemById(circ.id);
            slight.action = nop;
            slight.emitEquipmentChange();
            // Touch boards cannot change the theme or color of a single light.
            slight.action = 0;
            slight.emitEquipmentChange();
            return slight;
        }
        catch (err) { return Promise.reject(`Error runLightCommandAsync ${err.message}`); }
    }
    public async setLightGroupThemeAsync(id = sys.board.equipmentIds.circuitGroups.start, theme: number): Promise<ICircuitState> {
        try {
            const grp = sys.lightGroups.getItemById(id);
            const sgrp = state.lightGroups.getItemById(id);
            grp.lightingTheme = sgrp.lightingTheme = theme;
            sgrp.action = sys.board.valueMaps.circuitActions.getValue('lighttheme');
            sgrp.emitEquipmentChange();
            if (sl.enabled) {
                await sl.circuits.setLightGroupThemeAsync(theme);
            }
            else {
                let out = Outbound.create({
                    action: 96,
                    payload: [theme, 0],
                    retries: 3,
                    response: true,
                    scope: `lightGroupTheme${id}`
                });
                await out.sendAsync();
            }
            // Let everyone know we turned these on.  The theme messages will come later.
            for (let i = 0; i < grp.circuits.length; i++) {
                let c = grp.circuits.getItemByIndex(i);
                let cstate = state.circuits.getItemById(c.circuit);
                // if theme is 'off' light groups should not turn on
                if (cstate.isOn && sys.board.valueMaps.lightThemes.getName(theme) === 'off')
                    await sys.board.circuits.setCircuitStateAsync(c.circuit, false);
                else if (!cstate.isOn && sys.board.valueMaps.lightThemes.getName(theme) !== 'off') await sys.board.circuits.setCircuitStateAsync(c.circuit, true);
            }
            let isOn = sys.board.valueMaps.lightThemes.getName(theme) === 'off' ? false : true;
            sys.board.circuits.setEndTime(grp, sgrp, isOn);
            sgrp.isOn = isOn;
            switch (theme) {
                case 0: // off
                case 1: // on
                    break;
                case 128: // sync
                    setImmediate(function () { sys.board.circuits.sequenceLightGroupAsync(grp.id, 'sync'); });
                    break;
                case 144: // swim
                    setImmediate(function () { sys.board.circuits.sequenceLightGroupAsync(grp.id, 'swim'); });
                    break;
                case 160: // swim
                    setImmediate(function () { sys.board.circuits.sequenceLightGroupAsync(grp.id, 'set'); });
                    break;
                case 190: // save
                case 191: // recall
                    setImmediate(function () { sys.board.circuits.sequenceLightGroupAsync(grp.id, 'other'); });
                    break;
                default:
                    setImmediate(function () { sys.board.circuits.sequenceLightGroupAsync(grp.id, 'lighttheme'); });
                // other themes for magicstream?
            }
            sgrp.action = 0;
            sgrp.hasChanged = true; // Say we are dirty but we really are pure as the driven snow.
            state.emitEquipmentChanges();
            return sgrp;
        }
        catch (err) {
            logger.error(`error setting intellibrite theme: ${err.message}`);
            return Promise.reject(err);
        }

    }
}

class TouchFeatureCommands extends FeatureCommands {
    // todo: remove this in favor of setCircuitState only?
    public async setFeatureStateAsync(id: number, val: boolean): Promise<ICircuitState> {
        // Route this to the circuit state since this is the same call
        // and the interface takes care of it all.
        return this.board.circuits.setCircuitStateAsync(id, val);
    }
    public async toggleFeatureStateAsync(id: number) {
        // Route this to the circuit state since this is the same call
        // and the interface takes care of it all.
        return this.board.circuits.toggleCircuitStateAsync(id);
    }
    public async setFeatureAsync(data: any): Promise<Feature> {
        let id = parseInt(data.id, 10);
        let feature: Feature;
        if (id <= 0) {
            id = sys.features.getNextEquipmentId(sys.board.equipmentIds.features);
            feature = sys.features.getItemById(id, false, { isActive: true, freeze: false });
        }
        else
            feature = sys.features.getItemById(id, false);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('feature Id has not been defined', data.id, 'Feature'));
        if (!sys.board.equipmentIds.features.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`feature Id ${id}: is out of range.`, id, 'Feature'));
        let typeByte = data.type === 0 ? data.type : data.type || feature.type || sys.board.valueMaps.circuitFunctions.getValue('generic');
        let nameByte = 3; // set default `Aux 1`
        if (typeof data.nameId !== 'undefined') nameByte = data.nameId;
        else if (typeof feature.name !== 'undefined') nameByte = feature.nameId;
        let freeze = (typeof data.freeze !== 'undefined' ? utils.makeBool(data.freeze) : feature.freeze);
        let showInFeatures = feature.showInFeatures = (typeof data.showInFeatures !== 'undefined' ? utils.makeBool(data.showInFeatures) : feature.showInFeatures);
        // [165,23,16,34,139,5],[17,0,1,0,0],[1,144]
        if (sl.enabled) {
            // SL show in features = 0 = pool; 1 = spa; 2 = features; 4 = lights; 5 = hide
            await sl.circuits.setCircuitAsync(id, nameByte, typeByte, showInFeatures ? 2 : 0, freeze);
        }
        else {
            let out = Outbound.create({
                action: 139,
                payload: [id, typeByte | (utils.makeBool(data.freeze) ? 64 : 0), nameByte, 0, 0],
                retries: 3,
                response: true
            });
            await out.sendAsync();
        }
        feature = sys.features.getItemById(id);
        let fstate = state.features.getItemById(data.id);
        feature.nameId = fstate.nameId = nameByte;
        // circuit.name = cstate.name = sys.board.valueMaps.circuitNames.get(nameByte).desc;
        feature.name = fstate.name = sys.board.valueMaps.circuitNames.transform(nameByte).desc;
        feature.type = fstate.type = typeByte;

        feature.freeze = freeze;
        fstate.showInFeatures = showInFeatures;
        feature.eggTimer = typeof data.eggTimer !== 'undefined' ? parseInt(data.eggTimer, 10) : feature.eggTimer || 720;
        feature.dontStop = (typeof data.dontStop !== 'undefined') ? utils.makeBool(data.dontStop) : feature.eggTimer === 1620;
        let eggTimer = sys.eggTimers.find(elem => elem.circuit === id);
        try {
            if (feature.eggTimer === 720) {
                if (typeof eggTimer !== 'undefined') await sys.board.schedules.deleteEggTimerAsync({ id: eggTimer.id });
            }
            else {
                if (sl.enabled) {
                    await sl.schedules.setEggTimerAsync(feature.id, feature.eggTimer);
                }
                else {
                    await sys.board.schedules.setEggTimerAsync({ id: typeof eggTimer !== 'undefined' ? eggTimer.id : -1, runTime: feature.eggTimer, dontStop: feature.dontStop, circuit: feature.id });
                }
            }
        }
        catch (err) {
            // fail silently if there are no slots to fill in the schedules
            logger.info(`Cannot set/delete eggtimer on feature ${feature.id}.  Error: ${err.message}`);
            feature.eggTimer = 720;
            feature.dontStop = false;
        }
        state.emitEquipmentChanges();
        return feature;
    }
    public async deleteFeatureAsync(data: any): Promise<Feature> {
        let circuit = sys.circuits.getItemById(data.id);
        if (circuit.master === 1) return await super.deleteFeatureAsync(data);
        data.nameId = 0;
        data.functionId = sys.board.valueMaps.circuitFunctions.getValue('notused');
        return this.setFeatureAsync(data);
    }

}
class TouchChlorinatorCommands extends ChlorinatorCommands {
    public async setChlorAsync(obj: any, send: boolean = true): Promise<ChlorinatorState> {
        try {
            let id = parseInt(obj.id, 10);
            // Bail out right away if this is not controlled by the OCP.
            if (typeof obj.master !== 'undefined' && parseInt(obj.master, 10) !== 0) return super.setChlorAsync(obj);
            let isAdd = false;
            if (isNaN(id) || id <= 0) {
                // We are adding so we need to see if there is another chlorinator that is not external.
                if (sys.chlorinators.count(elem => elem.master !== 2) > sys.equipment.maxChlorinators) return Promise.reject(new InvalidEquipmentDataError(`The max number of chlorinators has been exceeded you may only add ${sys.equipment.maxChlorinators}`, 'chlorinator', sys.equipment.maxChlorinators));
                id = 1;
                isAdd = true;
            }
            let chlor = sys.chlorinators.getItemById(id, isAdd);
            if (chlor.master !== 0 && !isAdd) return super.setChlorAsync(obj);
            // RKS: I am not even sure this can be done with Touch as the master on the RS485 bus.
            if (typeof chlor.master === 'undefined') chlor.master = 0;
            let name = obj.name || chlor.name || 'IntelliChlor' + id;
            let superChlorHours = parseInt(obj.superChlorHours, 10);
            if (typeof obj.superChlorinate !== 'undefined') obj.superChlor = utils.makeBool(obj.superChlorinate);
            let superChlorinate = typeof obj.superChlor === 'undefined' ? undefined : utils.makeBool(obj.superChlor);
            let isDosing = typeof obj.isDosing !== 'undefined' ? utils.makeBool(obj.isDosing) : chlor.isDosing;
            let disabled = typeof obj.disabled !== 'undefined' ? utils.makeBool(obj.disabled) : chlor.disabled;
            let poolSetpoint = typeof obj.poolSetpoint !== 'undefined' ? parseInt(obj.poolSetpoint, 10) : chlor.poolSetpoint;
            let spaSetpoint = typeof obj.spaSetpoint !== 'undefined' ? parseInt(obj.spaSetpoint, 10) : chlor.spaSetpoint;
            let saltTarget = typeof obj.saltTarget === 'number' ? parseInt(obj.saltTarget, 10) : chlor.saltTarget;

            let model = typeof obj.model !== 'undefined' ? sys.board.valueMaps.chlorinatorModel.encode(obj.model) : chlor.model || 0;
            let chlorType = typeof obj.type !== 'undefined' ? sys.board.valueMaps.chlorinatorType.encode(obj.type) : chlor.type || 0;
            let portId = typeof obj.portId !== 'undefined' ? parseInt(obj.portId, 10) : chlor.portId;
            if (portId !== chlor.portId && sys.chlorinators.count(elem => elem.id !== chlor.id && elem.portId === portId && elem.master !== 2) > 0) return Promise.reject(new InvalidEquipmentDataError(`Another chlorinator is installed on port #${portId}.  Only one chlorinator can be installed per port.`, 'Chlorinator', portId));
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
            if (typeof obj.body !== 'undefined') chlor.body = parseInt(obj.body, 10);
            if (typeof chlor.body === 'undefined') chlor.body = parseInt(obj.body, 10) || 32;
            // Verify the data.
            let bdy = sys.board.bodies.mapBodyAssociation(chlor.body || 0);
            let body;
            if (typeof bdy === 'undefined') {
                if (sys.equipment.shared) body = 32;
                else if (!sys.equipment.dual) body = 0;
                else return Promise.reject(new InvalidEquipmentDataError(`Chlorinator body association is not valid: ${body}`, 'chlorinator', body));
            }
            else
                body = bdy.val;
            if (poolSetpoint > 100 || poolSetpoint < 0) return Promise.reject(new InvalidEquipmentDataError(`Chlorinator poolSetpoint is out of range: ${chlor.poolSetpoint}`, 'chlorinator', chlor.poolSetpoint));
            if (spaSetpoint > 100 || spaSetpoint < 0) return Promise.reject(new InvalidEquipmentDataError(`Chlorinator spaSetpoint is out of range: ${chlor.poolSetpoint}`, 'chlorinator', chlor.spaSetpoint));
            if (typeof obj.ignoreSaltReading !== 'undefined') chlor.ignoreSaltReading = utils.makeBool(obj.ignoreSaltReading);


            if (send) {
                if (sl.enabled) {
                    if (!chlor.isActive) {await sl.chlor.setChlorEnabledAsync(true);}
                    await sl.chlor.setChlorOutputAsync(poolSetpoint, spaSetpoint);
                }
                else {
                    let out = Outbound.create({
                        dest: 16,
                        action: 153,
                        // removed disable ? 0 : (spaSetpoint << 1) + 1 because only deleteChlorAsync should remove it from the OCP
                        payload: [(disabled ? 0 : isDosing ? 100 << 1 : spaSetpoint << 1) + 1, disabled ? 0 : isDosing ? 100 : poolSetpoint,
                        utils.makeBool(superChlorinate) && superChlorHours > 0 ? superChlorHours + 128 : 0,  // We only want to set the superChlor when the user sends superChlor = true
                            0, 0, 0, 0, 0, 0, 0],
                        retries: 3,
                        response: true,
                    });
                    await out.sendAsync();
                }
            };
            let schlor = state.chlorinators.getItemById(id, true);
            chlor.disabled = disabled;
            schlor.isActive = chlor.isActive = true;
            schlor.superChlor = chlor.superChlor = superChlorinate;
            schlor.poolSetpoint = chlor.poolSetpoint = poolSetpoint;
            schlor.spaSetpoint = chlor.spaSetpoint = spaSetpoint;
            schlor.superChlorHours = chlor.superChlorHours = superChlorHours;
            schlor.body = chlor.body = body;
            if (typeof chlor.address === 'undefined') chlor.address = 80; // 79 + id;
            chlor.name = schlor.name = name;
            schlor.model = chlor.model = model;
            schlor.type = chlor.type = chlorType;
            chlor.isDosing = isDosing;
            chlor.portId = portId;
            chlor.saltTarget = saltTarget;
            if (send && !sl.enabled) {
                let out = Outbound.create({
                    dest: 16,
                    action: 217,
                    payload: [0],
                    retries: 3,
                    response: true,
                })
                await out.sendAsync();
            }
            state.emitEquipmentChanges();
            return state.chlorinators.getItemById(id);
        } catch (err) {
            logger.error(`*Touch setChlorAsync Error: ${err.message}`);
            return Promise.reject(err);
        }
    }
    public async deleteChlorAsync(obj: any): Promise<ChlorinatorState> {
        try {
            let id = parseInt(obj.id, 10);
            if (isNaN(id)) return Promise.reject(new InvalidEquipmentDataError(`Chlorinator id is not valid: ${obj.id}`, 'chlorinator', obj.id));
            let chlor = sys.chlorinators.getItemById(id);
            if (chlor.master >= 1) return await super.deleteChlorAsync(obj);
            if (sl.enabled) {
                await sl.chlor.setChlorEnabledAsync(false);
            }
            else {
                let out = Outbound.create({
                    dest: 16,
                    action: 153,
                    payload: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    retries: 3,
                    response: true
                });
                await out.sendAsync();
            }
            ncp.chlorinators.deleteChlorinatorAsync(id).then(() => { });
            let cstate = state.chlorinators.getItemById(id, true);
            chlor = sys.chlorinators.getItemById(id, true);
            chlor.isActive = cstate.isActive = false;
            sys.chlorinators.removeItemById(id);
            state.chlorinators.removeItemById(id);
            return cstate;
        }
        catch (err) {
            logger.error(`Error deleting chlorinator: ${err.message}`);
            return Promise.reject(err);
        }
    }
}
class TouchPumpCommands extends PumpCommands {
    //public setPump(pump: Pump, obj?: any) {
    //    pump.set(obj);
    //    let msgs: Outbound[] = this.createPumpConfigMessages(pump);
    //    for (let i = 0; i <= msgs.length; i++) {
    //        conn.queueSendMessage(msgs[i]);
    //    }
    //}
    // RKS: 05-20-22 This was moved out of systemBoard it does not belong there and probably should not 
    // be called in any current form since it was not being called as part of a message result.
    private async setType(pump: Pump, pumpType: number) {
        // if we are changing pump types, need to clear out circuits
        // and props that aren't for this pump type
        let _id = pump.id;
        if (pump.type !== pumpType || pumpType === 0) {
            if (pump.type === 65) { // This used to be a two-speed pump.  We need to remove the high speed circuits.
                let outc = Outbound.create({
                    action: 158,
                    retries: 2,
                    response: Response.create({ action: 1, payload: [158] })
                });
                outc.appendPayloadBytes(0, 16);
                if (sys.controllerType !== ControllerType.IntelliTouch) {
                    outc.setPayloadByte(4, 1);
                    outc.setPayloadByte(5, 72);
                    outc.setPayloadByte(13, 2);
                }
                await outc.sendAsync();
            }
            let _p = pump.get(true);
            sys.pumps.removeItemById(_id);
            pump = sys.pumps.getItemById(_id, true);
            state.pumps.removeItemById(pump.id);
            pump.type = pumpType;
            let type = sys.board.valueMaps.pumpTypes.transform(pumpType);
            if (type.name === 'vs' || type.name === 'vsf') {
                pump.speedStepSize = 10;
                pump.minSpeed = type.minSpeed;
                pump.maxSpeed = type.maxSpeed;
            }
            if (type.name === 'vf' || type.name === 'vsf') {
                pump.flowStepSize = 1;
                pump.minFlow = type.minFlow;
                pump.maxFlow = type.maxFlow;
            }
            let spump = state.pumps.getItemById(pump.id, true);
            spump.type = pump.type;
            spump.isActive = pump.isActive;
            spump.status = 0;
            spump.emitData('pumpExt', spump.getExtended());
        }
    }
    public async setPumpAsync(data: any, send: boolean = true): Promise<Pump> {
        // Rules regarding Pumps in *Touch
        // In *Touch there are basically three classifications of pumps. These include those under control of RS485, Dual Speed, and Single Speed.
        // 485 Controlled pumps - Any of the IntelliFlo pumps.  These are managed by the control panel.
        // Dual Speed - There is only one allowed by the panel this will always be at id 9.  Only the high speed circuits are managed by the panel.
        // Single Speed - There is only one allowed by the panel this will always be at id 10.
        // 1. Addressable pumps (vs, vf, vsf, vsf+svrs) will consume ids 1-8. 
        //    a. vf pumps allow configuration of filter, backwash, and vacuum options. Which is tied to the background circuit.
        //    b. vsf+svrs pumps allow the configuration of max pressure for each circuit but only when GPM is selected.
        // 2. There can only be 1 Dual Speed pump it will be id 9
        //    a. dual speed pumps allow the identification of a ds pump model.  This determines the high/low speed wattage.
        // 3. There can only be 1 single speed pump it will be id 10
        //    a. single speed pumps allow the identification of an ss pump model.  This determines the continuous wattage for when it is on.
        // 4. Background Circuits can be assigned for (vf, vsf, vs, ss, and ds pumps).
        try {
            let pump: Pump;
            let ntype;
            let type;
            let isAdd = false;
            let id = (typeof data.id === 'undefined') ? -1 : parseInt(data.id, 10);
            if (typeof data.id === 'undefined' || isNaN(id) || id <= 0) {
                // We are adding a new pump
                ntype = sys.board.valueMaps.pumpTypes.encode(data.type);
                type = sys.board.valueMaps.pumpTypes.transform(ntype);
                // If this is one of the pumps that are not supported by touch send it to system board.
                if (type.equipmentMaster > 0 || data.master > 0) return await super.setPumpAsync(data);
                data.master = 0;
                if (typeof data.type === 'undefined' || isNaN(ntype) || typeof type.name === 'undefined') return Promise.reject(new InvalidEquipmentDataError('You must supply a pump type when creating a new pump', 'Pump', data));
                // Do not rely on the address for the id.  This will not work overall since more than
                // one pump type that exists in the ET and IT realm.
                id = sys.pumps.getNextEquipmentId(new EquipmentIdRange(1, 255));
                if (type.name === 'ds') {
                    if (sys.pumps.find(elem => elem.type === ntype)) return Promise.reject(new InvalidEquipmentDataError(`You may add only one ${type.desc} pump`, 'Pump', data));
                }
                else if (type.name === 'ss') {
                    if (sys.pumps.find(elem => elem.type === ntype)) return Promise.reject(new InvalidEquipmentDataError(`You may add only one ${type.desc} pump`, 'Pump', data));
                }
                else if (type.name === 'none') // This is a mis-guided relic.  None should simply not exist.
                    return Promise.reject(new InvalidEquipmentDataError('You must supply a valid type when adding a pump.', 'Pump', data));
                else {
                    if (typeof data.address !== 'undefined') {
                        data.address = parseInt(data.address, 10);
                        if (isNaN(data.address)) return Promise.reject(new InvalidEquipmentDataError(`You must supply a valid pump address to add a ${type.desc} pump.`, 'Pump', data));
                        // Make sure it doesn't already exist.
                        if (sys.pumps.find(elem => elem.address === data.address)) return Promise.reject(new InvalidEquipmentDataError(`A pump already exists at address ${data.address - 95}`, 'Pump', data));
                    }
                    else {
                        if (typeof id === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`You may not add another ${type.desc} pump.  Max number of pumps exceeded.`, 'Pump', data));
                    }
                }
                isAdd = true;
                pump = sys.pumps.getItemById(id, true);
            }
            else {
                pump = sys.pumps.getItemById(id, false);
                data.master = 0;
                ntype = typeof data.type === 'undefined' ? pump.type : parseInt(data.type, 10);
                if (isNaN(ntype)) return Promise.reject(new InvalidEquipmentDataError(`Pump type ${data.type} is not valid`, 'Pump', data));
                type = sys.board.valueMaps.pumpTypes.transform(ntype);
                data.master = type.name in ['ss', 'hwvs', 'hwrly', 'sf'] ? 1 : 0;
                if (data.master > 0 || pump.master > 0) return await super.setPumpAsync(data);

                // changing type?  clear out all props and add as new
                if (ntype !== pump.type) {
                    isAdd = true;
                    await this.setType(pump, ntype);
                    pump = sys.pumps.getItemById(id, false); // refetch pump with new value
                }
            }
            // Validate all the ids since in *Touch the address is determined from the id.
            // RKS: 05-07-23 - The pump address is no longer determined by the id.  This was such a twisted effort to try to match these to the id.
            // while the order of the pump coming out of the config messages determine the address the id is not relevant since *Touch panels should simply
            // search for the address using byte index + 96.  All of this was becoming too much.
            if (!isAdd) isAdd = sys.pumps.find(elem => elem.id === id) === undefined;
            if (type.name === 'ss') {
                data.master = 1; // All single speed pumps are Nixie controlled.
                return await super.setPumpAsync(data);
            }

            if (isAdd) {
                // The ids for dual speed and single speed pumps have been mixed up in the past.  Originally, the code relied on ss id === 10 and ds === 9.  However, when the screenLogic
                // code was added these got switched and essentially invalidated all ds and ss pumps.  The way this works now is that the single ds pump for ET and IT will be determined by
                // type and the id will not matter.
                data.master = 0;
                if (type.name === 'ds' && typeof sys.pumps.find(x => x.type === 65) !== 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Only one Two-speed pump may be added`, 'Pump', data));
                else if (sys.pumps.count(x => x.type in [1, 64, 128, 169]) >= sys.equipment.maxPumps) return Promise.reject(new InvalidEquipmentDataError(`The maximum number of variable pumps have been exceeded for this panel. ${type.desc}`, 'Pump', data));
            }
            // Now lets validate the ids related to the type.
            //if (id === 10 && type.name !== 'ds') return Promise.reject(new InvalidEquipmentDataError(`The id for a Two-speed pump must be 9`, 'Pump', data));
            //else if (id === 9 && type.name !== 'ss') return Promise.reject(new InvalidEquipmentDataError(`The id for a Single-Speed pump must be 10`, 'Pump', data));
            //else if (id > sys.equipment.maxPumps) return Promise.reject(new InvalidEquipmentDataError(`The id for a ${type.desc} must be less than ${sys.equipment.maxPumps}`, 'Pump', data));

            // Need to do a check here if we are clearing out the circuits; id data.circuits === []
            // extend will keep the original array
            let bClearPumpCircuits = typeof data.circuits !== 'undefined' && data.circuits.length === 0;
            // RKS: 09-14-22 - This is fundamentally wrong.  This ensures that no circuit can be deleted
            // from the pump.
            if (!isAdd) {
                data.address = typeof data.address !== 'undefined' ? data.address : pump.address;
                data.backgroundCircuit = typeof data.backgroundCircuit !== 'undefined' ? data.backgroundCircuit : pump.backgroundCircuit;
                data.backwashFlow = typeof data.backwashFlow !== 'undefined' ? data.backwashFlow : pump.backwashFlow;
                data.backwashTime = typeof data.backwashTime !== 'undefined' ? data.backwashTime : pump.backwashTime;
                data.body = typeof data.body !== 'undefined' ? data.body : pump.body;
                data.filterSize = typeof data.filterSize !== 'undefined' ? data.filterSize : pump.filterSize;
                data.flowStepSize = typeof data.flowStepSize !== 'undefined' ? data.flowStepSize : pump.flowStepSize
                data.manualFilterGPM = typeof data.manualFilterGPM !== 'undefined' ? data.manualFilterGPM : pump.manualFilterGPM;
                data.master = 0;
                data.maxFlow = typeof data.maxFlow !== 'undefined' ? data.maxFlow : pump.maxFlow;
                data.maxPressureIncrease = typeof data.maxPressureIncrease ? data.maxPressureIncrease : pump.maxPressureIncrease;
                data.maxSpeed = typeof data.maxSpeed !== 'undefined' ? data.maxSpeed : pump.maxSpeed;
                data.maxSystemTime = typeof data.maxSystemTime !== 'undefined' ? data.maxSystemTime : pump.maxSystemTime;
                data.minFlow = typeof data.minFlow !== 'undefined' ? data.minFlow : pump.minFlow;
                data.minSpeed = typeof data.minSpeed !== 'undefined' ? data.minSpeed : pump.minSpeed;
                data.model = typeof data.model !== 'undefined' ? data.model : pump.model;
                data.name = typeof data.name !== 'undefined' ? data.name : pump.name;
                data.portId = typeof data.portId !== 'undefined' ? data.portId : pump.portId || 0;
                data.primingSpeed = typeof data.primingSpeed !== 'undefined' ? data.primingSpeed : pump.primingSpeed;
                data.primingTime = typeof data.primingTime !== 'undefined' ? data.primingTime : pump.primingTime;
                data.rinseTime = typeof data.rinseTime !== 'undefined' ? data.rinseTime : pump.rinseTime;
                data.speedStepSize = typeof data.speedStepSize !== 'undefined' ? data.speedStepSize : pump.speedStepSize;
                data.turnovers = typeof data.turnovers !== 'undefined' ? data.turnovers : pump.turnovers;
                data.vacuumFlow = typeof data.vacuumFlow !== 'undefined' ? data.vacuumFlow : pump.vacuumFlow;
                data.vacuumTime = typeof data.vacuumTime !== 'undefined' ? data.vacuumTime : pump.vacuumTime;
                if (typeof data.circuits !== 'undefined') {
                    let circs = extend(true, [], data.circuits);
                    data = extend(true, {}, pump.get(true), data, { id: id, type: ntype });
                    data.circuits = circs;
                }
                else
                    data = extend(true, {}, pump.get(true), data, { id: id, type: ntype });
            }
            else data = extend(false, {}, data, { id: id, type: ntype });
            if (!isAdd && bClearPumpCircuits) data.circuits = [];
            data.name = data.name || pump.name || type.desc;
            data.portId = 0;
            // RKS: 12-02-22 -- The EasyTouch 1 OCPs only support 1 pump and this pump must be an IntelliFlo VS.  Do some checks here to make sure we are
            // sending the right messages to the right controller.  At this point I only know of 1 EasyTouch v1 panel and it is a 4.
            let isVersion1 = sys.equipment.modules.getItemByIndex(0, false).type >= 128;
            // We will not be sending message for ss type pumps.
            if (type.name === 'ss') {
                // The OCP doesn't deal with single speed pumps.  Simply add it to the config.
                pump.circuits.clear();
                let spump = state.pumps.getItemById(id, true);
                for (let prop in spump) {
                    if (typeof data[prop] !== 'undefined') spump[prop] = data[prop];
                }
                spump.type = pump.type = type.val;
                pump.model = typeof data.model === 'undefined' ? sys.board.valueMaps.pumpSSModels.encode(data.model) : pump.model || 0;
                spump.emitEquipmentChange();

                return pump;
            }
            else if (type.name === 'ds') {
                // We are going to set all the high speed circuits.
                // RSG: TODO I don't know what the message is to set the high speed circuits.  The following should
                // be moved into the onComplete for the outbound message to set high speed circuits.
                // RKS: 05-06-23 - Send the message for high speed circuits.
                let outc = Outbound.create({
                    action: 158,
                    retries: 2,
                    response: Response.create({ action: 1, payload: [158] })
                });
                outc.appendPayloadBytes(0, 16);
                if (sys.controllerType !== ControllerType.IntelliTouch) {
                    outc.setPayloadByte(4, 1);
                    outc.setPayloadByte(5, 72);
                    outc.setPayloadByte(13, 2);
                }
                let maxCircuits = typeof data.circuits !== 'undefined' ? Math.min(data.circuits.length, sys.controllerType === ControllerType.IntelliTouch ? 8 : 4) : 0;
                for (let i = 0; i < maxCircuits; i++) {
                    outc.setPayloadByte(i, data.circuits[i].circuit, 0);
                }
                // So lets send the message for setting the high speed circuits.
                if (await outc.sendAsync()) {
                    let spump = state.pumps.getItemById(id, true);
                    pump.model = typeof data.model === 'undefined' ? sys.board.valueMaps.pumpDSModels.encode(data.model) : pump.model || 0;
                    let circs = [];
                    // Lets do this to rearrange cases where 0s are sent.
                    for (let i = 0; i < maxCircuits; i++) {
                        if (data.circuits[i].circuit > 0) {
                            circs.push(data.circuits[i].circuit);
                        }
                    }
                    pump.circuits.clear();
                    for (let i = 0; i < circs.length; i++) {
                        pump.circuits.getItemById(i + 1, true, { id: i + 1, circuit: circs[i] });
                    }
                    spump.emitEquipmentChange();
                }
                return pump;
            }
            else {
                let arrCircuits = [];
                // Look to see if there is another pump at the same address.
                if (typeof sys.pumps.find(x => x.id !== id && x.address === data.address) !== 'undefined') return Promise.reject(new InvalidEquipmentDataError(`A pump already exists at address ${data.address - 95}`, 'Pump', data));
                if (isVersion1) {
                    if (data.address !== 96) return Promise.reject(new InvalidEquipmentDataError(`EasyTouch Version 1 controllers only support VS pumps at the first address`, 'Pump', data));
                    if (type.name !== 'vs') return Promise.reject(new InvalidEquipmentDataError(`EasyTouch Version 1 controllers only support VS pump types. ${type.desc} pumps are not supported`, 'Pump', data));
                    let outc = Outbound.create({
                        action: 150,
                        retries: 2,
                        response: Response.create({ action: 1, payload: [150] })
                    });
                    outc.appendPayloadBytes(0, 13);
                    data.primingTime = typeof data.primingTime !== 'undefined' ? isNaN(parseInt(data.primingTime, 10)) ? pump.primingTime || 0 : 0 : pump.primingTime;
                    data.primingSpeed = typeof data.primingSpeed !== 'undefined' ? parseInt(data.primingSpeed, 10) : pump.primingSpeed || type.minSpeed;
                    // If we do not have any circuits to define we should use the circuits from the existing pump.
                    if (typeof data.circuits === 'undefined') data.circuits = pump.circuits.toArray();
                    for (let i = 0; i < 4; i++) {
                        let c = i < data.circuits.length ? data.circuits[i] : { id: i + 1, master: 0, speed: 0, circuit: 0, units: 0 };
                        let byte = (i * 3) + 1;
                        c.units = 0;
                        c.master = 0;
                        c.id = arrCircuits.length + 1;
                        outc.setPayloadByte(byte, c.circuit);
                        outc.setPayloadByte(byte + 1, Math.floor(c.speed / 256));
                        outc.setPayloadByte(byte + 2, c.speed % 256);
                        if (c.circuit > 0) {
                            // Check to see if the circuit was already included.
                            if (typeof arrCircuits.find(x => x.circuit === c.cuircuit) !== 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Configuration for pump ${pump.name} is not correct circuit #${c.circuit} as included more than once. ${JSON.stringify(c)}`, 'Pump', data));
                            arrCircuits.push(c);
                        }
                        if (sl.enabled && send) {
                            // this is a shortcut for only updating a single pump
                            // speed at a time; for full config we need a different API
                            for (let i = 0; i < pump.circuits.length; i++) {
                                let pc = pump.circuits.getItemByIndex(i);
                                if (pc.circuit === c.id && (pc.speed !== c.speed || pc.flow !== c.flow)) {

                                    await sl.pumps.setPumpSpeedAsync(pump, c);
                                }
                            }
                        }
                    }
                    data.circuits = arrCircuits;

                    if (send) {
                        return await new Promise<Pump>(async (resolve, reject) => {
                            outc.onComplete = (err, msg) => {
                                if (err) reject(err);
                                else {
                                    pump = sys.pumps.getItemById(id, true);
                                    pump.set(data);
                                    let spump = state.pumps.getItemById(id, true);
                                    spump.isActive = pump.isActive = true;
                                    spump.name = pump.name;
                                    spump.type = pump.type;
                                    spump.emitEquipmentChange();
                                    resolve(pump);
                                    const pumpConfigRequest = Outbound.create({
                                        action: 214,
                                        payload: [0],
                                        retries: 2,
                                        response: true
                                    });
                                    (async () => { pumpConfigRequest.sendAsync(); })();
                                    //conn.queueSendMessage(pumpConfigRequest);
                                }
                            };
                            await outc.sendAsync();
                            return pump;
                        });
                    }
                }
                else {
                    let outc = Outbound.create({
                        action: 155,
                        payload: [id, ntype],
                        retries: 2,
                        response: Response.create({ action: 1, payload: [155] })
                    });
                    outc.appendPayloadBytes(0, 44);
                    if (type.val === 128) {
                        outc.setPayloadByte(3, 2);
                        data.model = 0;
                    }
                    if (typeof type.maxPrimingTime !== 'undefined' && type.maxPrimingTime > 0 && type.val >= 64) {
                        // We need to set all of this back to data since later pump.set is called to set the data after success.
                        data.primingTime = typeof data.primingTime !== 'undefined' ? isNaN(parseInt(data.primingTime, 10)) ? pump.primingTime || 0 : 0 : pump.primingTime;
                        data.primingSpeed = typeof data.primingSpeed !== 'undefined' ? parseInt(data.primingSpeed, 10) : pump.primingSpeed || type.minSpeed;
                        outc.setPayloadByte(2, data.primingTime);
                        outc.setPayloadByte(21, Math.floor(data.primingSpeed / 256));
                        outc.setPayloadByte(30, data.primingSpeed % 256);
                    }
                    if (type.val === 1) { // Any VF pump.
                        // We need to set all of this back to data since later pump.set is called to set the data after success.
                        data.backgroundCircuit = typeof data.backgroundCircuit !== 'undefined' ? parseInt(data.backgroundCircuit, 10) : pump.backgroundCircuit || 6;
                        data.filterSize = typeof data.filterSize !== 'undefined' ? parseInt(data.filterSize, 10) : pump.filterSize || 15000;
                        data.turnovers = typeof data.turnovers !== 'undefined' ? parseInt(data.turnovers, 10) : pump.turnovers || 2;
                        data.manualFilterGPM = typeof data.manualFilterGPM !== 'undefined' ? parseInt(data.manualFilterGPM, 10) : pump.manualFilterGPM || 30;
                        data.primingSpeed = typeof data.primingSpeed !== 'undefined' ? parseInt(data.primingSpeed, 10) : pump.primingSpeed || 55;
                        data.primingTime = typeof data.primingTime !== 'undefined' ? parseInt(data.primingTime, 10) : pump.primingTime || 0;
                        data.maxSystemTime = typeof data.maxSystemTime !== 'undefined' ? parseInt(data.maxSystemTime, 10) : pump.maxSystemTime || 0;
                        data.maxPressureIncrease = typeof data.maxPressureIncrease != 'undefined' ? parseInt(data.maxPressureIncrease, 10) : pump.maxPressureIncrease || 0;
                        data.backwashFlow = typeof data.backwashFlow !== 'undefined' ? parseInt(data.backwashFlow, 10) : pump.backwashFlow || 60;
                        data.backwashTime = typeof data.backwashTime !== 'undefined' ? parseInt(data.bacwashTime, 10) : pump.backwashTime || 5;
                        data.rinseTime = typeof data.rinseTime !== 'undefined' ? parseInt(data.rinseTime, 10) : pump.rinseTime || 1;
                        data.vacuumFlow = typeof data.vacuumFlow !== 'undefined' ? parseInt(data.vacuumFlow, 10) : pump.vacuumFlow || 50;
                        data.vacuumTime = typeof data.vacuumTime !== 'undefined' ? parseInt(data.vacuumTime, 10) : pump.vacuumTime || 10;
                        data.model = 0;
                        outc.setPayloadByte(1, data.backgroundCircuit);
                        outc.setPayloadByte(2, data.filterSize);
                        outc.setPayloadByte(3, data.turnovers);
                        outc.setPayloadByte(21, data.manualFilterGPM);
                        outc.setPayloadByte(22, data.primingSpeed);
                        outc.setPayloadByte(23, data.primingTime | data.maxSystemTime << 4, 5);
                        outc.setPayloadByte(24, data.maxPressureIncrease);
                        outc.setPayloadByte(25, data.backwashFlow);
                        outc.setPayloadByte(26, data.backwashTime);
                        outc.setPayloadByte(27, data.rinseTime);
                        outc.setPayloadByte(28, data.vacuumFlow);
                        outc.setPayloadByte(30, data.vacuumTime);
                    }
                    if (typeof type.maxCircuits !== 'undefined' && type.maxCircuits > 0 && typeof data.circuits !== 'undefined') { // This pump type supports circuits
                        // Do some validation to make sure we don't have a condition where a circuit is declared twice.
                        let arrCircuits = [];
                        // Below is a very strange mess that goofs up the circuit settings.
                        //{id:1, circuits:[{speed:1750, units:{val:0}, id:1, circuit:6}, {speed:2100, units:{val:0}, id:2, circuit:6}]}
                        let ubyte = 0;
                        for (let i = 1; i <= data.circuits.length && i <= type.maxCircuits; i++) {
                            // RKS: This notion of always returning the max number of circuits was misguided.  It leaves gaps in the circuit definitions and makes the pump
                            // layouts difficult when there are a variety of supported circuits.  For instance with SF pumps you only get 4.
                            let c = i > data.circuits.length ? { speed: type.minSpeed || 0, flow: type.minFlow || 0, circuit: 0 } : data.circuits[i - 1];
                            //{speed:1750, units:{val:0}, id:1, circuit:6}
                            let speed = parseInt(c.speed, 10);
                            let flow = parseInt(c.flow, 10);
                            let circuit = parseInt(c.circuit, 10);
                            if (isNaN(circuit)) return Promise.reject(new InvalidEquipmentDataError(`An invalid pump circuit was supplied for pump ${pump.name}. ${JSON.stringify(c)}`, 'Pump', data))
                            if (isNaN(speed)) speed = type.minSpeed;
                            if (isNaN(flow)) flow = type.minFlow;
                            outc.setPayloadByte((i * 2) + 3, circuit, 0);
                            let units;
                            if (type.name === 'vf') units = sys.board.valueMaps.pumpUnits.getValue('gpm');
                            else if (type.name === 'vs') units = sys.board.valueMaps.pumpUnits.getValue('rpm');
                            else units = sys.board.valueMaps.pumpUnits.encode(c.units);
                            c.units = units;
                            if (isNaN(units)) units = sys.board.valueMaps.pumpUnits.getValue('rpm');
                            if (typeof type.minSpeed !== 'undefined' && c.units === sys.board.valueMaps.pumpUnits.getValue('rpm')) {
                                outc.setPayloadByte((i * 2) + 4, Math.floor(speed / 256)); // Set to rpm
                                outc.setPayloadByte(i + 21, speed % 256);
                                c.speed = speed;
                                ubyte |= (1 << (i - 1));
                            }
                            else if (typeof type.minFlow !== 'undefined' && c.units === sys.board.valueMaps.pumpUnits.getValue('gpm')) {
                                outc.setPayloadByte(i * 2 + 4, flow); // Set to gpm
                                c.flow = flow;
                            }
                            c.id = i;
                            c.circuit = circuit;
                            if (arrCircuits.includes(c.circuit)) return Promise.reject(new InvalidEquipmentDataError(`Configuration for pump ${pump.name} is not correct circuit #${c.circuit} as included more than once. ${JSON.stringify(c)}`, 'Pump', data))
                            arrCircuits.push(c.circuit);
                            if (sl.enabled && send) {
                                // this is a shortcut for only updating a single pump
                                // speed at a time; for full config we need a different API
                                for (let i = 0; i < pump.circuits.length; i++) {
                                    let pc = pump.circuits.getItemByIndex(i);
                                    if (pc.circuit === c.circuit && (pc.speed !== c.speed || pc.flow !== c.flow)) {
                                        // todo: now that equipconfig is functional for pumps, this is really
                                        // only needed when changing speeds on the home page
                                        // (not config).  
                                        await sl.pumps.setPumpSpeedAsync(pump, c);
                                    }
                                }
                            }
                        }
                        // data.circuits = arrCircuits;
                        if (type.name === 'vsf') outc.setPayloadByte(4, ubyte);
                    }
                    else if (typeof type.maxCircuits !== 'undefined' && type.maxCircuits > 0 && typeof data.circuits === 'undefined') { // This pump type supports circuits and the payload did not contain them.
                        // Copy the data from the circuits array.  That way when we call pump.set to set the data back it will be persisted correctly.
                        data.circuits = extend(true, {}, pump.circuits.get());
                        let ubyte = 0;
                        for (let i = 1; i <= data.circuits.length; i++) data.circuits[i].id = i;
                        for (let i = 1; i <= pump.circuits.length && i <= type.maxCircuits; i++) {
                            let c = pump.circuits.getItemByIndex(i - 1);
                            let speed = c.speed;
                            let flow = c.flow;
                            let circuit = c.circuit;
                            if (isNaN(speed)) speed = type.minSpeed;
                            if (isNaN(flow)) flow = type.minFlow;
                            outc.setPayloadByte((i * 2) + 3, circuit, 0);
                            let units;
                            if (type.name === 'vf') units = sys.board.valueMaps.pumpUnits.getValue('gpm');
                            else if (type.name === 'vs') units = sys.board.valueMaps.pumpUnits.getValue('rpm');
                            else units = c.units;
                            if (isNaN(units)) units = sys.board.valueMaps.pumpUnits.getValue('rpm');
                            c.units = units;
                            if (typeof type.minSpeed !== 'undefined' && c.units === sys.board.valueMaps.pumpUnits.getValue('rpm')) {
                                outc.setPayloadByte((i * 2) + 4, Math.floor(speed / 256)); // Set to rpm
                                outc.setPayloadByte(i + 21, speed % 256);
                                ubyte |= (1 << (i - 1));
                            }
                            else if (typeof type.minFlow !== 'undefined' && c.units === sys.board.valueMaps.pumpUnits.getValue('gpm')) {
                                outc.setPayloadByte((i * 2) + 4, flow); // Set to gpm
                            }
                            if (sl.enabled && send) {
                                await sl.pumps.setPumpSpeedAsync(pump, c);
                            }
                        }
                        if (type.name === 'vsf') outc.setPayloadByte(4, ubyte);

                    }
                    if (sl.enabled) {
                        if (send) {
                            // set Equip Config with pumps
                            await sl.controller.setEquipmentAsync(data, 'pump');
                        }
                        pump = sys.pumps.getItemById(id, true);
                        pump.set(data); // Sets all the data back to the pump.
                        let spump = state.pumps.getItemById(id, true);
                        spump.isActive = pump.isActive = true;
                        spump.name = pump.name;
                        spump.type = pump.type;
                        spump.emitEquipmentChange();
                        return Promise.resolve(pump);
                    }
                    else if (send) {
                        if (await outc.sendAsync()) {
                            pump = sys.pumps.getItemById(id, true);
                            // RKS: 05-20-22 Boooh to this if the payload does not include its
                            // circuits we have just destroyed the pump definition.  So I added code to
                            // make sure that the data is complete.
                            pump.set(data); // Sets all the data back to the pump.
                            let spump = state.pumps.getItemById(id, true);
                            spump.isActive = pump.isActive = true;
                            spump.name = pump.name;
                            spump.type = pump.type;
                            spump.emitEquipmentChange();
                            const pumpConfigRequest = Outbound.create({
                                action: 216,
                                payload: [pump.id],
                                retries: 2,
                                response: true
                            });
                            await pumpConfigRequest.sendAsync();
                            return pump;
                        }
                    }
                }
            }
        }
        catch (err) {
            logger.error(`Error setting pump: ${err.message}`);
            return Promise.reject(err);
        }
    }
    //private createPumpConfigMessages(pump: Pump): Outbound[] {
    //    // [165,33,16,34,155,46],[1,128,0,2,0,16,12,6,7,1,9,4,11,11,3,128,8,0,2,18,2,3,128,8,196,184,232,152,188,238,232,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[9,75]
    //    const setPumpConfig = Outbound.create({
    //        action: 155,
    //        payload: [pump.id, pump.type, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    //        retries: 2,
    //        response: true
    //    });
    //    if (pump.type === 128) {
    //        // vs
    //        //[165, 1, 16, 33, 155, 47]
    //        //[1, 128, 0, 0, 0, 6, 10, 1, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 190, 134, 0, 0, 0, 0, 0, 0, 232, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    //        //[4, 109]
    //        setPumpConfig.payload[2] = pump.primingTime || 0;
    //        setPumpConfig.payload[21] = Math.floor(pump.primingSpeed / 256) || 3;
    //        setPumpConfig.payload[30] =
    //            pump.primingSpeed - Math.floor(pump.primingSpeed / 256) * 256 || 232;
    //        for (let i = 1; i <= 8; i++) {
    //            let circ = pump.circuits.getItemById(i);
    //            setPumpConfig.payload[i * 2 + 3] = circ.circuit || 0;
    //            setPumpConfig.payload[i * 2 + 4] = Math.floor(circ.speed / 256) || 3;
    //            setPumpConfig.payload[i + 21] =
    //                (circ.speed - (setPumpConfig.payload[i * 2 + 4] * 256)) || 232;
    //        }
    //    }
    //    else if (pump.type === 64)
    //        // vsf
    //        for (let i = 1; i <= 8; i++) {
    //            let circ = pump.circuits.getItemById(i);
    //            setPumpConfig.payload[i * 2 + 3] = circ.circuit || 0;
    //            if (circ.units === 0)
    //                // gpm
    //                setPumpConfig.payload[i * 2 + 4] = circ.flow || 30;
    //            else {
    //                // rpm
    //                setPumpConfig.payload[4] =
    //                    setPumpConfig.payload[4] << i - 1; // set rpm/gpm flag
    //                setPumpConfig.payload[i * 2 + 4] = Math.floor(circ.speed / 256) || 3;
    //                setPumpConfig.payload[i + 21] =
    //                    circ.speed - ((setPumpConfig.payload[i * 2 + 4] * 256)) || 232;
    //            }
    //        }
    //    else if (pump.type >= 1 && pump.type < 64) {
    //        // vf
    //        setPumpConfig.payload[1] = pump.backgroundCircuit || 6;
    //        setPumpConfig.payload[3] = pump.turnovers || 2;
    //        const body = sys.bodies.getItemById(1, sys.equipment.maxBodies >= 1);
    //        setPumpConfig.payload[2] = body.capacity / 1000 || 15;
    //        setPumpConfig.payload[21] = pump.manualFilterGPM || 30;
    //        setPumpConfig.payload[22] = pump.primingSpeed || 55;
    //        setPumpConfig.payload[23] =
    //            pump.primingTime | pump.maxSystemTime << 4 || 5;
    //        setPumpConfig.payload[24] = pump.maxPressureIncrease || 10;
    //        setPumpConfig.payload[25] = pump.backwashFlow || 60;
    //        setPumpConfig.payload[26] = pump.backwashTime || 5;
    //        setPumpConfig.payload[27] = pump.rinseTime || 1;
    //        setPumpConfig.payload[28] = pump.vacuumFlow || 50;
    //        setPumpConfig.payload[30] = pump.vacuumTime || 10;
    //        for (let i = 1; i <= 8; i++) {
    //            let circ = pump.circuits.getItemById(i);
    //            setPumpConfig.payload[i * 2 + 3] = circ.circuit || 0;
    //            setPumpConfig.payload[i * 2 + 4] = circ.flow || 15;
    //        }
    //    }
    //    const pumpConfigRequest = Outbound.create({
    //        action: 216,
    //        payload: [pump.id],
    //        retries: 2,
    //        response: true
    //    });
    //    return [setPumpConfig, pumpConfigRequest];
    //}
    //public setType(pump: Pump, pumpType: number) {
    //    pump.type = pumpType;
    //    // pump.circuits.clear(); // reset circuits
    //    this.setPump(pump);
    //    let spump = state.pumps.getItemById(pump.id, true);
    //    spump.type = pump.type;
    //    spump.status = 0;
    //}
    public async deletePumpAsync(data: any): Promise<Pump> {
        let id = parseInt(data.id, 10);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`deletePumpAsync: Pump ${id} is not valid.`, 0, `pump`));
        let pump = sys.pumps.getItemById(id, false);
        if (pump.master === 1) return super.deletePumpAsync(data);
        else if (pump.type === 65) { // Dual speed pump.
            let outc = Outbound.create({
                action: 158,
                retries: 2,
                response: Response.create({ action: 1, payload: [158] })
            });
            outc.appendPayloadBytes(0, 16);
            if (sys.controllerType !== ControllerType.IntelliTouch) {
                outc.setPayloadByte(4, 1);
                outc.setPayloadByte(5, 72);
                outc.setPayloadByte(13, 2);
            }
            await outc.sendAsync();
            pump.isActive = false;
            sys.pumps.removeItemById(id);
            state.pumps.removeItemById(id);
            return pump;
        }
        else {
            const outc = Outbound.create({
                action: 155,
                payload: [id, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                retries: 2,
                response: true
            });
            return new Promise<Pump>(async (resolve, reject) => {
                outc.onComplete = (err, msg) => {
                    if (err) reject(err);
                    else {
                        sys.pumps.removeItemById(id);
                        state.pumps.removeItemById(id);
                        resolve(sys.pumps.getItemById(id, false));
                        const pumpConfigRequest = Outbound.create({
                            action: 216,
                            payload: [id],
                            retries: 2,
                            response: true
                        });
                        (async () => { await pumpConfigRequest.sendAsync(); });
                    }
                };
                await outc.sendAsync();
            });
        }
    }
}
class TouchHeaterCommands extends HeaterCommands {
    public getInstalledHeaterTypes(body?: number): any {
        let heaters = sys.heaters.get();
        let types = sys.board.valueMaps.heaterTypes.toArray();
        let inst = { total: 0 };
        for (let i = 0; i < types.length; i++) if (types[i].name !== 'none') inst[types[i].name] = 0;
        for (let i = 0; i < heaters.length; i++) {
            let heater = heaters[i];
            if (typeof body !== 'undefined' && heater.body !== 'undefined') {
                if ((heater.body !== 32 && body !== heater.body + 1) || (heater.body === 32 && body > 2)) continue;
            }
            let type = types.find(elem => elem.val === heater.type);
            if (typeof type !== 'undefined') {
                if (inst[type.name] === 'undefined') inst[type.name] = 0;
                inst[type.name] = inst[type.name] + 1;
                if (heater.coolingEnabled === true && type.hasCoolSetpoint === true) inst['hasCoolSetpoint'] = true;
                inst.total++;
            }
        }
        return inst;
    }
    public isSolarInstalled(body?: number): boolean {
        let heaters = sys.heaters.get();
        let types = sys.board.valueMaps.heaterTypes.toArray();
        for (let i = 0; i < heaters.length; i++) {
            let heater = heaters[i];
            if (typeof body !== 'undefined' && body !== heater.body) continue;
            let type = types.find(elem => elem.val === heater.type);
            if (typeof type !== 'undefined') {
                switch (type.name) {
                    case 'solar':
                        return true;
                }
            }
        }
    }
    public isHeatPumpInstalled(body?: number): boolean {
        let heaters = sys.heaters.get();
        let types = sys.board.valueMaps.heaterTypes.toArray();
        for (let i = 0; i < heaters.length; i++) {
            let heater = heaters[i];
            if (typeof body !== 'undefined' && body !== heater.body) continue;
            let type = types.find(elem => elem.val === heater.type);
            if (typeof type !== 'undefined') {
                switch (type.name) {
                    case 'heatpump':
                        return true;
                }
            }
        }
    }
    public setHeater(heater: Heater, obj?: any) {
        if (typeof obj !== undefined) {
            for (var s in obj)
                heater[s] = obj[s];
        }
    }
    // RKS: Not sure what to do with this as the heater data for Touch isn't actually processed anywhere.
    public async setHeaterAsync(obj: any, send: boolean = true): Promise<Heater> {
        if (obj.master === 1 || parseInt(obj.id, 10) > 255) return super.setHeaterAsync(obj);
        let id = typeof obj.id === 'undefined' ? -1 : parseInt(obj.id, 10);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Heater Id is not valid.', obj.id, 'Heater'));
        let heater: Heater;
        let address: number;
        let htype;
        let out = Outbound.create({
            action: 162,
            payload: [5, 0, 0],
            retries: 2,
            // I am assuming that there should be an action 34 when the 162 is sent but I do not have this
            // data.
            response: Response.create({ dest: -1, action: 34 })
        });
        if (id <= 0) {
            // Touch only supports two installed heaters.  So the type determines the id.
            if (sys.heaters.length > sys.equipment.maxHeaters) return Promise.reject(new InvalidEquipmentDataError('The maximum number of heaters are already installed.', 'Heater', sys.heaters.length));
            htype = sys.board.valueMaps.heaterTypes.findItem(obj.type);
            if (typeof htype === 'undefined') return Promise.reject(new InvalidEquipmentDataError('Heater type is not valid.', 'Heater', obj.heaterType));
            // Check to see if we can find any heaters of this type already installed.
            if (sys.heaters.count(h => h.type === htype.val) > 0) return Promise.reject(new InvalidEquipmentDataError(`Only one ${htype.desc} heater can be installed`, 'Heater', htype));
            // Next we need to see if this heater is compatible with all the other heaters.  For Touch you may only have the following combos.
            // 1 Gas + 1 Solar
            // 1 Gas + 1 Heatpump
            // 1 Hybrid

            // Heater ids are as follows.
            // 1 = Gas Heater
            // 2 = Solar
            // 3 = UltraTemp (HEATPUMPCOM)
            // 4 = UltraTemp ETi (Hybrid)
            switch (htype.name) {
                case 'gas':
                    id = 1;
                    break;
                case 'solar':
                    out.setPayloadByte(0, out.payload[0] | 0x02);
                    // Set the start and stop temp delta.
                    out.setPayloadByte(1, (obj.freeze ? 0x80 : 0x00) | (obj.coolingEnabled ? 0x20 : 0x00));
                    out.setPayloadByte(2, ((obj.startTempDelta || 6) - 3 << 6) | ((obj.stopTempDelta || 3) - 2 << 1));
                    id = 2;
                    break;
                case 'ultratemp':
                case 'heatpump':
                    address = 112;
                    out.setPayloadByte(0, out.payload[0] | 0x02);
                    out.setPayloadByte(1, out.payload[1] | 0x10 | (obj.coolingEnabled ? 0x20 : 0x00));
                    id = 3;
                    break;
                case 'hybrid':
                    // If we are adding a hybrid heater this means that the gas heater is to be replaced.  This means that only
                    // a gas heater can be installed.
                    if (sys.heaters.length > 1) return Promise.reject(new InvalidEquipmentDataError(`Hybrid heaters can only be installed by themselves`, 'Heater', htype));
                    if (sys.heaters.getItemByIndex(0).type > 1) return Promise.reject(new InvalidEquipmentDataError(`Hybrid heaters can only replace the gas heater`, 'Heater', htype));
                    out.setPayloadByte(0, 5);
                    out.setPayloadByte(1, 16);
                    // NOTE: byte 2 makes absolutely no sense. Perhaps this is because we have no idea what message action 16 is.  This probably contains the rest of the info
                    // for heaters on Touch panels.
                    out.setPayloadByte(2, 118);
                    id = 4;
                    break;
            }
        }
        else {
            // This all works because there are 0 items that can be set on a Touch heater with the exception of a few items on solar.  This means that the
            // first two bytes are calculated based upon the existing heaters.
            heater = sys.heaters.find(x => id === x.id);
            if (typeof heater === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Heater #${id} is not installed and cannot be updated.`, id, 'Heater'));
            // So here we go with the settings.
            htype = sys.board.valueMaps.heaterTypes.findItem(heater.type);
            switch (htype.name) {
                case 'gas':
                    break;
                case 'solar':
                    out.setPayloadByte(0, out.payload[0] | 0x02);
                    // Set the start and stop temp delta.
                    out.setPayloadByte(1, (obj.freeze ? 0x80 : 0x00) | (obj.coolingEnabled ? 0x20 : 0x00));
                    out.setPayloadByte(2, ((obj.startTempDelta || 6) - 3 << 6) | ((obj.stopTempDelta || 3) - 2 << 1));
                    break;
                case 'ultratemp':
                case 'heatpump':
                    address = 112;
                    out.setPayloadByte(0, out.payload[0] | 0x02);
                    out.setPayloadByte(1, out.payload[1] | 0x10 | (obj.coolingEnabled ? 0x20 : 0x00));
                    break;
                case 'hybrid':
                    address = 112;
                    out.setPayloadByte(0, 5);
                    out.setPayloadByte(1, 16);
                    // NOTE: byte 2 makes absolutely no sense. Perhaps this is because we have no idea what message action 144/16 is.  This probably contains the rest of the info
                    // for heaters on Touch panels.
                    out.setPayloadByte(2, 118);
                    break;
            }
        }
        // Set the bytes from the existing installed heaters.
        for (let i = 0; i < sys.heaters.length; i++) {
            let h = sys.heaters.getItemByIndex(i);
            if (h.id === id) continue;
            let ht = sys.board.valueMaps.heaterTypes.transform(h.type);
            switch (ht.name) {
                case 'gas':
                    break;
                case 'solar':
                    out.setPayloadByte(0, out.payload[0] | 0x02);
                    out.setPayloadByte(1, (h.freeze ? 0x80 : 0x00) | (h.coolingEnabled ? 0x20 : 0x00));
                    out.setPayloadByte(2, ((h.startTempDelta || 6) - 3 << 6) | ((h.stopTempDelta || 3) - 2 << 1));
                    break;
                case 'ultratemp':
                case 'heatpump':
                    out.setPayloadByte(0, out.payload[0] | 0x02);
                    out.setPayloadByte(1, out.payload[1] | 0x10 | (h.coolingEnabled ? 0x20 : 0x00));
                    break;
                case 'hybrid':
                    break;
            }
        }
        if (sl.enabled && send) {
            await sl.controller.setEquipmentAsync(obj, 'heater');
        }
        else if (send) {
            await out.sendAsync();
        }
        heater = sys.heaters.getItemById(id, true);
        let sheater = state.heaters.getItemById(id, true);
        for (var s in obj) {
            switch (s) {
                case 'id':
                case 'name':
                case 'type':
                case 'address':
                    break;
                default:
                    heater[s] = obj[s];
                    break;
            }
        }
        sheater.name = heater.name = typeof obj.name !== 'undefined' ? obj.name : heater.name;
        sheater.type = heater.type = htype.val;
        heater.address = address;
        heater.master = 0;
        heater.body = sys.equipment.shared ? 32 : 0;
        sys.board.heaters.updateHeaterServices();
        sys.board.heaters.syncHeaterStates();
        return heater;
    }
    public async deleteHeaterAsync(obj: any): Promise<Heater> {
        if (utils.makeBool(obj.master === 1 || parseInt(obj.id, 10) > 255)) return super.deleteHeaterAsync(obj);
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Cannot delete.  Heater Id is not valid.', obj.id, 'Heater'));
        let heater = sys.heaters.getItemById(id);
        heater.isActive = false;
        sys.heaters.removeItemById(id);
        state.heaters.removeItemById(id);
        sys.board.heaters.updateHeaterServices();
        sys.board.heaters.syncHeaterStates();
        return heater;

    }
    public updateHeaterServices() {
        let htypes = sys.board.heaters.getInstalledHeaterTypes();
        let solarInstalled = htypes.solar > 0;
        let heatPumpInstalled = htypes.heatpump > 0;
        let ultratempInstalled = htypes.ultratemp > 0;
        let gasHeaterInstalled = htypes.gas > 0;
        let hybridInstalled = htypes.hybrid > 0;
        sys.board.valueMaps.heatModes.set(0, { name: 'off', desc: 'Off' });
        sys.board.valueMaps.heatSources.set(0, { name: 'off', desc: 'Off' });
        if (hybridInstalled) {
            // Source Issue #390
            // 1 = Heat Pump
            // 2 = Gas Heater
            // 3 = Hybrid
            // 16 = Dual 
            sys.board.valueMaps.heatModes.set(1, { name: 'hybheatpump', desc: 'Heat Pump' });
            sys.board.valueMaps.heatModes.set(2, { name: 'hybheat', desc: 'Gas Heat' });
            sys.board.valueMaps.heatModes.set(3, { name: 'hybhybrid', desc: 'Hybrid' });
            sys.board.valueMaps.heatModes.set(16, { name: 'hybdual', desc: 'Dual Heat' });

            sys.board.valueMaps.heatSources.set(2, { name: 'hybheat', desc: 'Gas Heat' });
            sys.board.valueMaps.heatSources.set(5, { name: 'hybhybrid', desc: 'Hybrid' });
            sys.board.valueMaps.heatSources.set(20, { name: 'hybdual', desc: 'Dual Heat' });
            sys.board.valueMaps.heatSources.set(21, { name: 'hybheatpump', desc: 'Heat Pump' });
        }
        else {
            if (gasHeaterInstalled) {
                sys.board.valueMaps.heatModes.set(1, { name: 'heater', desc: 'Heater' });
                sys.board.valueMaps.heatSources.set(2, { name: 'heater', desc: 'Heater' });
            }
            else {
                // no heaters (virtual controller)
                sys.board.valueMaps.heatModes.delete(1);
                sys.board.valueMaps.heatSources.delete(2);
            }
            if (solarInstalled && gasHeaterInstalled) {
                sys.board.valueMaps.heatModes.set(2, { name: 'solarpref', desc: 'Solar Preferred' });
                sys.board.valueMaps.heatModes.set(3, { name: 'solar', desc: 'Solar Only' });
                sys.board.valueMaps.heatSources.set(5, { name: 'solarpref', desc: 'Solar Preferred' });
                sys.board.valueMaps.heatSources.set(21, { name: 'solar', desc: 'Solar Only' });
            }
            else if (heatPumpInstalled && gasHeaterInstalled) {
                sys.board.valueMaps.heatModes.set(2, { name: 'heatpumppref', desc: 'Heat Pump Preferred' });
                sys.board.valueMaps.heatModes.set(3, { name: 'heatpump', desc: 'Heat Pump Only' });
                sys.board.valueMaps.heatSources.set(5, { name: 'heatpumppref', desc: 'Heat Pump Preferred' });
                sys.board.valueMaps.heatSources.set(21, { name: 'heatpump', desc: 'Heat Pump Only' });
            }
            else if (ultratempInstalled && gasHeaterInstalled) {
                sys.board.valueMaps.heatModes.merge([
                    [2, { name: 'ultratemppref', desc: 'UltraTemp Pref' }],
                    [3, { name: 'ultratemp', desc: 'UltraTemp Only' }]
                ]);
                sys.board.valueMaps.heatSources.merge([
                    [5, { name: 'ultratemppref', desc: 'Ultratemp Pref', hasCoolSetpoint: htypes.hasCoolSetpoint }],
                    [21, { name: 'ultratemp', desc: 'Ultratemp Only', hasCoolSetpoint: htypes.hasCoolSetpoint }]
                ])
            }
            else {
                // only gas
                sys.board.valueMaps.heatModes.delete(2);
                sys.board.valueMaps.heatModes.delete(3);
                sys.board.valueMaps.heatSources.delete(5);
                sys.board.valueMaps.heatSources.delete(21);
            }
        }
        sys.board.valueMaps.heatSources.set(32, { name: 'nochange', desc: 'No Change' });
        // Now set the body data.
        for (let i = 0; i < sys.bodies.length; i++) {
            let body = sys.bodies.getItemByIndex(i);
            let btemp = state.temps.bodies.getItemById(body.id, body.isActive !== false);
            let opts = sys.board.heaters.getInstalledHeaterTypes(body.id);
            btemp.data.heatMode = sys.board.valueMaps.heatModes.transform(btemp.heatMode);
            btemp.data.heatStatus = sys.board.valueMaps.heatStatus.transform(btemp.heatStatus);
            btemp.heaterOptions = opts;
        }
        this.setActiveTempSensors();
    }
}
class TouchChemControllerCommands extends ChemControllerCommands {
    // This method is not meant to be called directly.  The setChemControllerAsync method does some routing to set IntelliChem correctly
    // if an OCP is involved.  This is the reason that the method is protected.
    protected async setIntelliChemAsync(data: any, send: boolean = true): Promise<ChemController> {
        try {

            let chem = sys.board.chemControllers.findChemController(data);
            let ichemType = sys.board.valueMaps.chemControllerTypes.encode('intellichem');
            if (typeof chem === 'undefined') {
                // We are adding an IntelliChem.  Check to see how many intellichems we have.
                let arr = sys.chemControllers.toArray();
                let count = 0;
                for (let i = 0; i < arr.length; i++) {
                    let cc: ChemController = arr[i];
                    if (cc.type === ichemType) count++;
                }
                if (count >= sys.equipment.maxChemControllers) return Promise.reject(new InvalidEquipmentDataError(`The max number of IntelliChem controllers has been reached: ${sys.equipment.maxChemControllers}`, 'chemController', sys.equipment.maxChemControllers));
                chem = sys.chemControllers.getItemById(data.id);
            }
            let address = typeof data.address !== 'undefined' ? parseInt(data.address, 10) : chem.address;
            if (typeof address === 'undefined' || isNaN(address) || (address < 144 || address > 158)) return Promise.reject(new InvalidEquipmentDataError(`Invalid IntelliChem address`, 'chemController', address));
            if (typeof sys.chemControllers.find(elem => elem.id !== data.id && elem.type === ichemType && elem.address === address) !== 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Invalid IntelliChem address: Address is used on another IntelliChem`, 'chemController', address));
            // Now lets do all our validation to the incoming chem controller data.
            let name = typeof data.name !== 'undefined' ? data.name : chem.name || `IntelliChem - ${address - 143}`;
            let type = sys.board.valueMaps.chemControllerTypes.transformByName('intellichem');
            // So now we are down to the nitty gritty setting the data for the REM Chem controller.
            let calciumHardness = typeof data.calciumHardness !== 'undefined' ? parseInt(data.calciumHardness, 10) : chem.calciumHardness;
            let cyanuricAcid = typeof data.cyanuricAcid !== 'undefined' ? parseInt(data.cyanuricAcid, 10) : chem.cyanuricAcid;
            let alkalinity = typeof data.alkalinity !== 'undefined' ? parseInt(data.alkalinity, 10) : chem.alkalinity;
            let borates = typeof data.borates !== 'undefined' ? parseInt(data.borates, 10) : chem.borates || 0;
            let body = sys.board.bodies.mapBodyAssociation(typeof data.body === 'undefined' ? chem.body : data.body);
            if (typeof body === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Invalid body assignment`, 'chemController', data.body || chem.body));
            // Do a final validation pass so we dont send this off in a mess.
            if (isNaN(calciumHardness)) return Promise.reject(new InvalidEquipmentDataError(`Invalid calcium hardness`, 'chemController', calciumHardness));
            if (isNaN(cyanuricAcid)) return Promise.reject(new InvalidEquipmentDataError(`Invalid cyanuric acid`, 'chemController', cyanuricAcid));
            if (isNaN(alkalinity)) return Promise.reject(new InvalidEquipmentDataError(`Invalid alkalinity`, 'chemController', alkalinity));
            if (isNaN(borates)) return Promise.reject(new InvalidEquipmentDataError(`Invalid borates`, 'chemController', borates));
            let schem = state.chemControllers.getItemById(chem.id, true);
            let pHSetpoint = typeof data.ph !== 'undefined' && typeof data.ph.setpoint !== 'undefined' ? parseFloat(data.ph.setpoint) : chem.ph.setpoint;
            let orpSetpoint = typeof data.orp !== 'undefined' && typeof data.orp.setpoint !== 'undefined' ? parseInt(data.orp.setpoint, 10) : chem.orp.setpoint;
            let lsiRange = typeof data.lsiRange !== 'undefined' ? data.lsiRange : chem.lsiRange || {};
            if (typeof data.lsiRange !== 'undefined') {
                if (typeof data.lsiRange.enabled !== 'undefined') lsiRange.enabled = utils.makeBool(data.lsiRange.enabled);
                if (typeof data.lsiRange.low === 'number') lsiRange.low = parseFloat(data.lsiRange.low);
                if (typeof data.lsiRange.high === 'number') lsiRange.high = parseFloat(data.lsiRange.high);
            }
            if (isNaN(pHSetpoint) || pHSetpoint > type.ph.max || pHSetpoint < type.ph.min) return Promise.reject(new InvalidEquipmentDataError(`Invalid pH setpoint`, 'ph.setpoint', pHSetpoint));
            if (isNaN(orpSetpoint) || orpSetpoint > type.orp.max || orpSetpoint < type.orp.min) return Promise.reject(new InvalidEquipmentDataError(`Invalid orp setpoint`, 'orp.setpoint', orpSetpoint));
            let phTolerance = typeof data.ph.tolerance !== 'undefined' ? data.ph.tolerance : chem.ph.tolerance;
            let orpTolerance = typeof data.orp.tolerance !== 'undefined' ? data.orp.tolerance : chem.orp.tolerance;
            if (typeof data.ph.tolerance !== 'undefined') {
                if (typeof data.ph.tolerance.enabled !== 'undefined') phTolerance.enabled = utils.makeBool(data.ph.tolerance.enabled);
                if (typeof data.ph.tolerance.low !== 'undefined') phTolerance.low = parseFloat(data.ph.tolerance.low);
                if (typeof data.ph.tolerance.high !== 'undefined') phTolerance.high = parseFloat(data.ph.tolerance.high);
                if (isNaN(phTolerance.low)) phTolerance.low = type.ph.min;
                if (isNaN(phTolerance.high)) phTolerance.high = type.ph.max;
            }
            if (typeof data.orp.tolerance !== 'undefined') {
                if (typeof data.orp.tolerance.enabled !== 'undefined') orpTolerance.enabled = utils.makeBool(data.orp.tolerance.enabled);
                if (typeof data.orp.tolerance.low !== 'undefined') orpTolerance.low = parseFloat(data.orp.tolerance.low);
                if (typeof data.orp.tolerance.high !== 'undefined') orpTolerance.high = parseFloat(data.orp.tolerance.high);
                if (isNaN(orpTolerance.low)) orpTolerance.low = type.orp.min;
                if (isNaN(orpTolerance.high)) orpTolerance.high = type.orp.max;
            }
            let phEnabled = typeof data.ph.enabled !== 'undefined' ? utils.makeBool(data.ph.enabled) : chem.ph.enabled;
            let orpEnabled = typeof data.orp.enabled !== 'undefined' ? utils.makeBool(data.orp.enabled) : chem.orp.enabled;
            let siCalcType = typeof data.siCalcType !== 'undefined' ? sys.board.valueMaps.siCalcTypes.encode(data.siCalcType, 0) : chem.siCalcType;

            let saltLevel = (state.chlorinators.length > 0) ? state.chlorinators.getItemById(1).saltLevel || 1000 : 1000
            chem.ph.tank.capacity = 6;
            chem.orp.tank.capacity = 6;
            let acidTankLevel = typeof data.ph !== 'undefined' && typeof data.ph.tank !== 'undefined' && typeof data.ph.tank.level !== 'undefined' ? parseInt(data.ph.tank.level, 10) : schem.ph.tank.level;
            let orpTankLevel = typeof data.orp !== 'undefined' && typeof data.orp.tank !== 'undefined' && typeof data.orp.tank.level !== 'undefined' ? parseInt(data.orp.tank.level, 10) : schem.orp.tank.level;
            // OCP needs to set the IntelliChem as active so it knows that it exists
            if (sl.enabled && send) {
                if (!schem.isActive) {
                    await sl.controller.setEquipmentAsync({intellichem: true}, 'misc');
                }
                // todo: need to add chem controller logic for setting ph/orp/etc
            }
            else if (send) {
                let out = Outbound.create({
                    action: 211,
                    payload: [],
                    retries: 3, // We are going to try 4 times.
                    response: Response.create({ protocol: Protocol.IntelliChem, action: 1, payload: [211] }),
                    onAbort: () => { }
                });
                out.insertPayloadBytes(0, 0, 22);
                out.setPayloadByte(0, address - 144);
                out.setPayloadByte(1, Math.floor((pHSetpoint * 100) / 256) || 0);
                out.setPayloadByte(2, Math.round((pHSetpoint * 100) % 256) || 0);
                out.setPayloadByte(3, Math.floor(orpSetpoint / 256) || 0);
                out.setPayloadByte(4, Math.round(orpSetpoint % 256) || 0);
                out.setPayloadByte(5, phEnabled ? acidTankLevel + 1 : 0);
                out.setPayloadByte(6, orpEnabled ? orpTankLevel + 1 : 0);
                out.setPayloadByte(7, Math.floor(calciumHardness / 256) || 0);
                out.setPayloadByte(8, Math.round(calciumHardness % 256) || 0);
                out.setPayloadByte(9, parseInt(data.cyanuricAcid, 10), chem.cyanuricAcid || 0);
                out.setPayloadByte(11, Math.floor(alkalinity / 256) || 0);
                out.setPayloadByte(12, Math.round(alkalinity % 256) || 0);
                out.setPayloadByte(13, Math.round(saltLevel / 50) || 20);
                await out.sendAsync();
            }
            chem = sys.chemControllers.getItemById(data.id, true);
            schem = state.chemControllers.getItemById(data.id, true);
            chem.master = 0;
            // Copy the data back to the chem object.
            schem.name = chem.name = name;
            schem.type = chem.type = sys.board.valueMaps.chemControllerTypes.encode('intellichem');
            chem.calciumHardness = calciumHardness;
            chem.cyanuricAcid = cyanuricAcid;
            chem.alkalinity = alkalinity;
            chem.borates = borates;
            chem.body = schem.body = body.val;
            schem.isActive = chem.isActive = true;
            chem.lsiRange.enabled = lsiRange.enabled;
            chem.lsiRange.low = lsiRange.low;
            chem.lsiRange.high = lsiRange.high;
            chem.ph.tolerance.enabled = phTolerance.enabled;
            chem.ph.tolerance.low = phTolerance.low;
            chem.ph.tolerance.high = phTolerance.high;
            chem.orp.tolerance.enabled = orpTolerance.enabled;
            chem.orp.tolerance.low = orpTolerance.low;
            chem.orp.tolerance.high = orpTolerance.high;
            chem.ph.setpoint = pHSetpoint;
            chem.orp.setpoint = orpSetpoint;
            schem.siCalcType = chem.siCalcType = siCalcType;
            chem.address = schem.address = address;
            chem.name = schem.name = name;
            chem.flowSensor.enabled = false;
            await sys.board.bodies.setBodyAsync(sys.bodies.getItemById(1, false));
            return chem;

        } catch (err) {
            logger.error(`Error setting chem: ${err.message}`);
            return Promise.reject(err);
        }
    }
    public async deleteChemControllerAsync(data: any): Promise<ChemController> {
        try {

            let id = typeof data.id !== 'undefined' ? parseInt(data.id, 10) : -1;
            if (typeof id === 'undefined' || isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid Chem Controller Id`, id, 'chemController'));
            let chem = sys.board.chemControllers.findChemController(data);
            if (chem.master === 1) return super.deleteChemControllerAsync(data);
            let out = Outbound.create({
                action: 211,
                response: Response.create({ protocol: Protocol.IntelliChem, action: 1, payload: [211] }),
                retries: 3,
                payload: [],
            });
            // I think this payload should delete the controller on Touch.
            out.insertPayloadBytes(0, 0, 22);
            out.setPayloadByte(0, chem.address - 144 || 0);
            out.setPayloadByte(1, Math.floor((chem.ph.setpoint * 100) / 256) || 0);
            out.setPayloadByte(2, Math.round((chem.ph.setpoint * 100) % 256) || 0);
            out.setPayloadByte(3, Math.floor(chem.orp.setpoint / 256) || 0);
            out.setPayloadByte(4, Math.round(chem.orp.setpoint % 256) || 0);
            out.setPayloadByte(5, 0);
            out.setPayloadByte(6, 0);
            out.setPayloadByte(7, Math.floor(chem.calciumHardness / 256) || 0);
            out.setPayloadByte(8, Math.round(chem.calciumHardness % 256) || 0);
            out.setPayloadByte(9, chem.cyanuricAcid || 0);
            out.setPayloadByte(11, Math.floor(chem.alkalinity / 256) || 0);
            out.setPayloadByte(12, Math.round(chem.alkalinity % 256) || 0);
            out.setPayloadByte(13, 20);
            if (sl.enabled) {
                await sl.controller.setEquipmentAsync({intellichem: false}, 'misc');
            }
            else {
                await out.sendAsync();
            }
            let schem = state.chemControllers.getItemById(id);
            chem.isActive = false;
            chem.ph.tank.capacity = chem.orp.tank.capacity = 6;
            chem.ph.tank.units = chem.orp.tank.units = '';
            schem.isActive = false;
            await sys.board.bodies.setBodyAsync(sys.bodies.getItemById(1, false));
            sys.chemControllers.removeItemById(id);
            state.chemControllers.removeItemById(id);
            return chem;

        } catch (err) {
            logger.error(`Error deleting chem controller: ${err.message}`);
            return Promise.reject(err);
        }
    }
}
class TouchValveCommands extends ValveCommands {
    public async setValveAsync(obj: any, send: boolean = true): Promise<Valve> {
        try {
            let id = typeof obj.id !== 'undefined' ? parseInt(obj.id, 10) : -1;
            obj.master = 0;
            if (isNaN(id) || id <= 0) id = Math.max(sys.valves.getMaxId(false, 49) + 1, 50);

            if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`EasyTouch: Valve Id has not been defined ${id}`, obj.id, 'Valve'));
            let valve = sys.valves.getItemById(id, true);
            // Set all the valve properies.
            let vstate = state.valves.getItemById(valve.id, true);
            valve.isActive = true;
            valve.circuit = typeof obj.circuit !== 'undefined' ? obj.circuit : valve.circuit;
            valve.name = typeof obj.name !== 'undefined' ? obj.name : valve.name;
            valve.connectionId = typeof obj.connectionId ? obj.connectionId : valve.connectionId;

            return valve;
        } catch (err) { logger.error(`Nixie: Error setting valve definition. ${err.message}`); return Promise.reject(err); }
    }
}