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
import { SystemBoard, byteValueMap, ConfigQueue, ConfigRequest, BodyCommands, PumpCommands, SystemCommands, CircuitCommands, FeatureCommands, ChlorinatorCommands, EquipmentIdRange, ScheduleCommands, ChemControllerCommands } from './SystemBoard';
import { PoolSystem, Body, Pump, sys, ConfigVersion, Heater, Schedule, EggTimer, ICircuit, CustomNameCollection, CustomName, LightGroup, LightGroupCircuit, Feature, ChemController } from '../Equipment';
import { Protocol, Outbound, Message, Response } from '../comms/messages/Messages';
import { state, ChlorinatorState, CommsState, State, ICircuitState, ICircuitGroupState, LightGroupState, BodyTempState } from '../State';
import { logger } from '../../logger/Logger';
import { conn } from '../comms/Comms';
import { MessageError, InvalidEquipmentIdError, InvalidEquipmentDataError, InvalidOperationError } from '../Errors';
import { utils } from '../Constants';

export class EasyTouchBoard extends SystemBoard {
    public needsConfigChanges: boolean = false;
    constructor(system: PoolSystem) {
        super(system);
        this.equipmentIds.circuits = new EquipmentIdRange(function () { return this.start; }, function () { return this.start + sys.equipment.maxCircuits - 1; });
        this.equipmentIds.features = new EquipmentIdRange(() => { return 11; }, () => { return this.equipmentIds.features.start + sys.equipment.maxFeatures + 1; });
        this.equipmentIds.virtualCircuits = new EquipmentIdRange(128, 136);
        this.equipmentIds.circuitGroups = new EquipmentIdRange(192, function () { return this.start + sys.equipment.maxCircuitGroups - 1; });
        this.equipmentIds.circuits.start = sys.equipment.shared || sys.equipment.dual ? 1 : 2;
        if (typeof sys.configVersion.equipment === 'undefined') { sys.configVersion.equipment = 0; }
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
            [0, { name: 'repeat', desc: 'Repeats', startDate: false, startTime: true, entTime: true, days: 'multi', heatSource: true, heatSetpoint: false }],
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
            for (let i = 0; i < arrKeys.length; i++) arr.push(extend(true, { val: arrKeys[i] }, this.get(arrKeys[i])));
            return arr;
        }
        this.valueMaps.scheduleDays.transform = function (byte) {
            let days = [];
            let b = byte & 0x007F;
            for (let bit = 7; bit >= 0; bit--) {
                if ((byte & 1 << (bit - 1)) > 0) days.push(extend(true, { val: 1 << (bit - 1)  }, this.get((byte & 1 << (bit - 1)))));
            }
            return { val: b, days: days };
        };
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
    }
    public bodies: TouchBodyCommands = new TouchBodyCommands(this);
    public system: TouchSystemCommands = new TouchSystemCommands(this);
    public circuits: TouchCircuitCommands = new TouchCircuitCommands(this);
    public features: TouchFeatureCommands = new TouchFeatureCommands(this);
    public chlorinator: TouchChlorinatorCommands = new TouchChlorinatorCommands(this);
    public pumps: TouchPumpCommands = new TouchPumpCommands(this);
    public schedules: TouchScheduleCommands = new TouchScheduleCommands(this);
    //public chemControllers: TouchChemControllerCommands = new TouchChemControllerCommands(this);
    protected _configQueue: TouchConfigQueue = new TouchConfigQueue();

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
    public category: TouchConfigCategories;
    public setcategory: GetTouchConfigCategories;
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
        if (conn.mockPort) {
            logger.info(`Skipping configuration request from OCP because MockPort enabled.`);
        } else {
            logger.info(`Requesting ${sys.controllerType} configuration`);
            this.queueItems(GetTouchConfigCategories.dateTime);
            this.queueItems(GetTouchConfigCategories.heatTemperature);
            this.queueItems(GetTouchConfigCategories.solarHeatPump);
            this.queueRange(GetTouchConfigCategories.customNames, 0, sys.equipment.maxCustomNames - 1);
            this.queueRange(GetTouchConfigCategories.circuits, 1, sys.board.equipmentIds.features.end);
            this.queueRange(GetTouchConfigCategories.schedules, 1, sys.equipment.maxSchedules);
            this.queueItems(GetTouchConfigCategories.delays);
            this.queueItems(GetTouchConfigCategories.settings);
            this.queueItems(GetTouchConfigCategories.intellifloSpaSideRemotes);
            this.queueItems(GetTouchConfigCategories.is4is10);
            this.queueItems(GetTouchConfigCategories.spaSideRemote);
            this.queueItems(GetTouchConfigCategories.valves);
            this.queueItems(GetTouchConfigCategories.lightGroupPositions);
            this.queueItems(GetTouchConfigCategories.highSpeedCircuits);
            this.queueRange(GetTouchConfigCategories.pumpConfig, 1, sys.equipment.maxPumps);
            // todo: add chlor or other commands not asked for by screenlogic if there is no remote/indoor panel present
        }
        if (this.remainingItems > 0) {
            var self = this;
            setTimeout(() => { self.processNext(); }, 50);
        } else state.status = 1;
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
        logger.verbose(
            `Config Queue Completed... ${this.percent}% (${this.remainingItems} remaining)`
        );
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
                response: true,
                onResponseProcessed: function () { self.processNext(out); }
            });
            setTimeout(() => conn.queueSendMessage(out), 50);
        } else {
            // Now that we are done check the configuration a final time.  If we have anything outstanding
            // it will get picked up.
            state.status = 1;
            this.curr = null;
            sys.configVersion.lastUpdated = new Date();
            // set a timer for 20 mins; if we don't get the config request it again.  This most likely happens if there is no other indoor/outdoor remotes or ScreenLogic.
            // this._configQueueTimer = setTimeout(()=>{sys.board.checkConfiguration();}, 20 * 60 * 1000);
            logger.info(`EasyTouch system config complete.`);
        }
        // Notify all the clients of our processing status.
        state.emitControllerChange();
    }
}
export class TouchScheduleCommands extends ScheduleCommands {
    public setSchedule(sched: Schedule | EggTimer, obj?: any) {
        super.setSchedule(sched, obj);
        let msgs: Outbound[] = this.createSchedConfigMessages(sched);
        for (let i = 0; i <= msgs.length; i++) {
            conn.queueSendMessage(msgs[i]);
        }
    }

    public createSchedConfigMessages(sched: Schedule | EggTimer): Outbound[] {
        // delete sched 1
        // [ 255, 0, 255], [165, 33, 16, 33, 145, 7], [1, 0, 0, 0, 0, 0, 0], [1, 144]

        const setSchedConfig = Outbound.create({
            action: 145,
            payload: [sched.id, 0, 0, 0, 0, 0, 0],
            retries: 2
        });
        if (sched.circuit === 0) {
            // delete - take defaults
        }
        else {
            if (sched instanceof EggTimer) {
                setSchedConfig.payload[1] = sched.circuit;
                setSchedConfig.payload[2] = 25;
                setSchedConfig.payload[4] = Math.floor(sched.runTime);
                setSchedConfig.payload[5] = sched.runTime - (setSchedConfig.payload[4] * 60);
            }
            else if (sched instanceof Schedule) {
                setSchedConfig.payload[1] = sched.circuit;
                setSchedConfig.payload[2] = Math.floor(sched.startTime / 60);
                setSchedConfig.payload[3] = sched.startTime - (setSchedConfig.payload[2] * 60);
                setSchedConfig.payload[4] = Math.floor(sched.endTime / 60);
                setSchedConfig.payload[5] = sched.endTime - (setSchedConfig.payload[4] * 60);
                setSchedConfig.payload[6] = sched.scheduleDays;
                if (sched.scheduleType === sys.board.valueMaps.scheduleTypes.getValue('runonce')) setSchedConfig.payload[6] = setSchedConfig.payload[6] | 0x80;
            }
        }
        const schedConfigRequest = Outbound.create({
            action: 209,
            payload: [sched.id],
            retries: 2
        });

        return [setSchedConfig, schedConfigRequest];
    }
    public async setScheduleAsync(data: any): Promise<Schedule> {
        if (typeof data.id !== 'undefined') {
            let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
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
            if (!sys.board.valueMaps.scheduleTypes.valExists(schedType)) { sys.schedules.removeItemById(id); state.schedules.removeItemById(id);  return Promise.reject(new InvalidEquipmentDataError(`Invalid schedule type; ${schedType}`, 'Schedule', schedType));}
            if (!sys.board.valueMaps.scheduleTimeTypes.valExists(startTimeType)) { sys.schedules.removeItemById(id); state.schedules.removeItemById(id);  return Promise.reject(new InvalidEquipmentDataError(`Invalid start time type; ${startTimeType}`, 'Schedule', startTimeType));}
            if (!sys.board.valueMaps.scheduleTimeTypes.valExists(endTimeType)) { sys.schedules.removeItemById(id); state.schedules.removeItemById(id);  return Promise.reject(new InvalidEquipmentDataError(`Invalid end time type; ${endTimeType}`, 'Schedule', endTimeType));}
            if (!sys.board.valueMaps.heatSources.valExists(heatSource)) { sys.schedules.removeItemById(id); state.schedules.removeItemById(id);  return Promise.reject(new InvalidEquipmentDataError(`Invalid heat source: ${heatSource}`, 'Schedule', heatSource));}
            if (heatSetpoint < 0 || heatSetpoint > 104) { sys.schedules.removeItemById(id); state.schedules.removeItemById(id);  return Promise.reject(new InvalidEquipmentDataError(`Invalid heat setpoint: ${heatSetpoint}`, 'Schedule', heatSetpoint));}
            if (sys.board.circuits.getCircuitReferences(true, true, false, true).find(elem => elem.id === circuit) === undefined)
                { sys.schedules.removeItemById(id); state.schedules.removeItemById(id);  return Promise.reject(new InvalidEquipmentDataError(`Invalid circuit reference: ${circuit}`, 'Schedule', circuit));}
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
                else if (scheduleDays.days.length === 0){
                    for (let i = 0; i < s2.length; i++){
                        if (s2[i].days[0].name==='sun') schedDays = s2[i].val;
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
                if (startTimeType === sys.board.valueMaps.scheduleTimeTypes.getValue('sunrise')) startTime = sunrise;
                else if (startTimeType === sys.board.valueMaps.scheduleTimeTypes.getValue('sunset')) startTime = sunset;
                if (endTimeType === sys.board.valueMaps.scheduleTimeTypes.getValue('sunrise')) endTime = sunrise;
                else if (endTimeType === sys.board.valueMaps.scheduleTimeTypes.getValue('sunset')) endTime = sunset;            }

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
            return new Promise<Schedule>((resolve, reject) => {
                out.onComplete = (err, msg) => {
                    if (!err) {
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
                        ssched.emitEquipmentChange();
                        // For good measure russ is sending out a config request for
                        // the schedule in question.  If there was a failure on the
                        // OCP side this will resolve it.
                        let req = Outbound.create({ action: 209, payload: [sched.id], retries: 2 });
                        conn.queueSendMessage(req);
                        state.schedules.sortById();
                        resolve(sched);
                    }
                    else reject(err);
                };
                conn.queueSendMessage(out); // Send it off in a letter to yourself.
            });
        }
        else
            return Promise.reject(new InvalidEquipmentIdError('No schedule information provided', undefined, 'Schedule'));
    }
    public async deleteScheduleAsync(data: any): Promise<Schedule> {
        if (typeof data.id !== 'undefined') {
            let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
            if (isNaN(id) || id < 0) return Promise.reject(new InvalidEquipmentIdError(`Invalid schedule id: ${data.id}`, data.id, 'Schedule'));
            let sched = sys.schedules.getItemById(id);
            let ssched = state.schedules.getItemById(id);
            // RKS: Assuming you just send 0s for the schedule and it will delete it.
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
            return new Promise<Schedule>((resolve, reject) => {
                out.onComplete = (err, msg) => {
                    if (!err) {
                        sys.schedules.removeItemById(id);
                        state.schedules.removeItemById(id);
                        ssched.emitEquipmentChange();
                        sched.isActive = false;
                        let req = Outbound.create({ action: 209, payload: [sched.id], retries: 2 });
                        conn.queueSendMessage(req);
                        resolve(sched);
                    }
                    else reject(err);
                };
                conn.queueSendMessage(out);
            });
        }
        else
            return Promise.reject(new InvalidEquipmentIdError('No schedule information provided', undefined, 'Schedule'));
    }
}

// todo: this can be implemented as a bytevaluemap
export enum TouchConfigCategories {
    dateTime = 5,
    heatTemperature = 8,
    customNames = 10,
    circuits = 11,
    schedules = 17,
    spaSideRemote = 22,
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
    spaSideRemote = 214,
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
        return new Promise((resolve, reject) => {
            let out = Outbound.create({
                action: 131,
                payload: [0],
                retries: 0,
                response: true,
                onComplete: (err, msg) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        // todo: track delay status?
                        state.delay = sys.board.valueMaps.delay.getValue('nodelay');
                        resolve(state.data.delay);
                    }
                }
            });
            conn.queueSendMessage(out);
        });
    }
    public async setDateTimeAsync(obj: any): Promise<any> {
        return new Promise((resolve, reject) => {
            let dst = sys.general.options.adjustDST ? 1 : 0;
            if (typeof obj.dst !== 'undefined') utils.makeBool(obj.dst) ? dst = 1 : dst = 0;
            let { hour = state.time.hours,
                min = state.time.minutes,
                date = state.time.date,
                month = state.time.month,
                year = state.time.year >= 100 ? state.time.year - 2000 : state.time.year,
                dow = state.time.dayOfWeek } = obj;
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
                response: true,
                onComplete: (err, msg) => {
                    if (err) reject(err)
                    else {
                        state.time.hours = hour;
                        state.time.minutes = min;
                        state.time.date = date;
                        state.time.month = month;
                        state.time.year = year;
                        if (sys.general.options.clockSource !== 'server' || typeof sys.general.options.adjustDST === 'undefined') sys.general.options.adjustDST = dst === 1 ? true : false;
                        sys.board.system.setTZ();
                        resolve({
                            time: state.time.format(),
                            adjustDST: sys.general.options.adjustDST,
                            clockSource: sys.general.options.clockSource
                        });
                    }
                }
            });
            conn.queueSendMessage(out);
        });
    }
    public async setCustomNameAsync(data: any): Promise<CustomName> {
        return new Promise<CustomName>((resolve, reject) => {
            let id = parseInt(data.id, 10);
            if (isNaN(id)) return reject(new InvalidEquipmentIdError('Invalid Custom Name Id', data.id, 'customName'));
            if (id > sys.equipment.maxCustomNames) return reject(new InvalidEquipmentIdError('Custom Name Id out of range', data.id, 'customName'));
            let cname = sys.customNames.getItemById(id);
            // No need to make any changes. Just return.
            if (cname.name === data.name) return resolve(cname);
            let out = Outbound.create({
                action: 202,
                payload: [data.id - 1],
                onComplete: (err) => {
                    if (err) throw reject(err);
                    else {
                        let c = sys.customNames.getItemById(id, true);
                        c.name = data.name;
                        resolve(c);
                        sys.board.system.syncCustomNamesValueMap();
                    }
                }
            });
            out.appendPayloadString(data.name, 10);
            conn.queueSendMessage(out);
        });
    }
}
class TouchBodyCommands extends BodyCommands {
    public async setHeatModeAsync(body: Body, mode: number): Promise<BodyTempState> {
        return new Promise<BodyTempState>((resolve, reject) => {
            //  [16,34,136,4],[POOL HEAT Temp,SPA HEAT Temp,Heat Mode,0,2,56]
            const body1 = sys.bodies.getItemById(1);
            const body2 = sys.bodies.getItemById(2);
            const temp1 = body1.setPoint || 100;
            const temp2 = body2.setPoint || 100;
            let mode1 = body1.heatMode;
            let mode2 = body2.heatMode;
            body.id === 1 ? mode1 = mode : mode2 = mode;
            let out = Outbound.create({
                dest: 16,
                action: 136,
                payload: [temp1, temp2, mode2 << 2 | mode1, 0],
                retries: 3,
                response: true,
                onComplete: (err, msg) => {
                    if (err) reject(err);
                    body.heatMode = mode;
                    let bstate = state.temps.bodies.getItemById(body.id);
                    bstate.heatMode = mode;
                    state.emitEquipmentChanges();
                    resolve(bstate);
                }
            });
            conn.queueSendMessage(out);
        });
    }
    public async setHeatSetpointAsync(body: Body, setPoint: number): Promise<BodyTempState> {
        return new Promise<BodyTempState>((resolve, reject) => {
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
            const mode1 = body1.heatMode;
            const mode2 = body2.heatMode;
            const out = Outbound.create({
                dest: 16,
                action: 136,
                payload: [temp1, temp2, mode2 << 2 | mode1, 0],
                retries: 3,
                response: true,
                onComplete: (err, msg) => {
                    if (err) reject(err);
                    body.setPoint = setPoint;
                    let bstate = state.temps.bodies.getItemById(body.id);
                    bstate.setPoint = setPoint;
                    state.temps.emitEquipmentChange();
                    resolve(bstate);
                }

            });
            conn.queueSendMessage(out);
        });
    }
}
class TouchCircuitCommands extends CircuitCommands {
    public getLightThemes(type?: number): any[] {
        let themes = sys.board.valueMaps.lightThemes.toArray();
        if (typeof type === 'undefined') return themes;
        switch (type) {
            case 8: // Magicstream
                return themes.filter(theme => theme.type === 'magicstream');
            case 16: // Intellibrite
                return themes.filter(theme => theme.type === 'intellibrite');
            default:
                return [];
        }
    }
    public async setCircuitAsync(data: any): Promise<ICircuit> {
        // example [255,0,255][165,33,16,34,139,5][17,14,209,0,0][2,120]
        // set circuit 17 to function 14 and name 209
        // response: [255,0,255][165,33,34,16,1,1][139][1,133]
        let circuit = sys.circuits.getInterfaceById(data.id);
        let typeByte = data.type || circuit.type || sys.board.valueMaps.circuitFunctions.getValue('generic');
        let nameByte = 3; // set default `Aux 1`
        if (typeof data.nameId !== 'undefined') nameByte = data.nameId;
        else if (typeof circuit.name !== 'undefined') nameByte = circuit.nameId;
        return new Promise<ICircuit>((resolve, reject) => {
            let out = Outbound.create({
                action: 139,
                payload: [data.id, typeByte, nameByte],
                retries: 3,
                response: true,
                onComplete: (err, msg) => {
                    if (err) reject(err);
                    else {
                        let circuit = sys.circuits.getInterfaceById(data.id);
                        let cstate = state.circuits.getInterfaceById(data.id);
                        circuit.nameId = cstate.nameId = nameByte;
                        circuit.name = cstate.name = sys.board.valueMaps.circuitNames.transform(nameByte).desc;
                        circuit.showInFeatures = cstate.showInFeatures = typeof data.showInFeatures !== 'undefined' ? data.showInFeatures : circuit.showInFeatures;
                        //circuit.showInCircuits = typeof data.showInCircuits !== 'undefined' ? data.showInCircuits : circuit.showInCircuits; // cstate.showInCircuits?
                        circuit.freeze = typeof data.freeze !== 'undefined' ? data.freeze : circuit.freeze;
                        circuit.type = cstate.type = typeByte;
                        state.emitEquipmentChanges();
                        resolve(circuit);
                    }
                }
            });
            conn.queueSendMessage(out);
        });
    }
    public async deleteCircuitAsync(data: any): Promise<ICircuit> {
        data.nameId = 0;
        data.functionId = sys.board.valueMaps.circuitFunctions.getValue('notused');
        return this.setCircuitAsync(data);
    }
    public async setCircuitStateAsync(id: number, val: boolean): Promise<ICircuitState> {
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Circuit or Feature id not valid', id, 'Circuit'));
        return new Promise<ICircuitState>((resolve, reject) => {
            let cstate = state.circuits.getInterfaceById(id);
            let out = Outbound.create({
                action: 134,
                payload: [id, val ? 1 : 0],
                retries: 3,
                response: true,
                onComplete: (err, msg) => {
                    if (err) reject(err);
                    else {
                        cstate.isOn = val ? true : false;
                        if (id === 6) { sys.board.virtualChlorinatorController.start(); }
                        sys.board.virtualPumpControllers.start();
                        // sys.board.virtualPumpControllers.setTargetSpeed();
                        state.emitEquipmentChanges();
                        resolve(cstate);
                    }
                }
            });
            conn.queueSendMessage(out);
        });
    }
    public async setCircuitGroupStateAsync(id: number, val: boolean): Promise<ICircuitGroupState> {
        let grp = sys.circuitGroups.getItemById(id, false, { isActive: false });
        let gstate = (grp.dataName === 'circuitGroupConfig') ? state.circuitGroups.getItemById(grp.id, grp.isActive !== false) : state.lightGroups.getItemById(grp.id, grp.isActive !== false);
        return new Promise<ICircuitGroupState>(async (resolve, reject) => {
            try {
                await sys.board.circuits.setCircuitStateAsync(id, val);
                resolve(state.circuitGroups.getInterfaceById(id));
            }
            catch (err) { reject(err); }
        });
    }
    public async setLightGroupStateAsync(id: number, val: boolean): Promise<ICircuitGroupState> { return this.setCircuitGroupStateAsync(id, val); }
    public async toggleCircuitStateAsync(id: number) {
        let cstate = state.circuits.getInterfaceById(id);
        if (cstate instanceof LightGroupState) {
            return this.setLightGroupThemeAsync(id, sys.board.valueMaps.lightThemes.getValue(cstate.isOn ? 'off' : 'on'));
        }
        return this.setCircuitStateAsync(id, !cstate.isOn);
    }
    private createLightGroupMessages(group: LightGroup) {
        let packets: Promise<any>[] = [];
        // intellibrites can come with 8 settings (1 packet) or 10 settings (2 packets)
        if (sys.equipment.maxIntelliBrites === 8) {
            // Easytouch
            packets.push(new Promise(function (resolve, reject) {
                let out = Outbound.create({
                    action: 167,
                    retries: 3,
                    response: true,
                    onComplete: (err, msg) => {
                        if (err) return reject(err);
                        else {
                            return resolve();
                        }
                    }
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
                conn.queueSendMessage(out);
            }));

        }
        else {
            // Intellitouch
            const lgcircuits = group.circuits.get();
            packets.push(new Promise(function (resolve, reject) {
                let out = Outbound.create({
                    action: 167,
                    retries: 3,
                    payload: [1],
                    response: true,
                    onComplete: (err, msg) => {
                        if (err) return reject(err);
                        else {
                            return resolve();
                        }
                    }
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
                conn.queueSendMessage(out);
            }));
            packets.push(new Promise(function (resolve, reject) {
                let out = Outbound.create({
                    action: 167,
                    retries: 3,
                    payload: [2],
                    response: true,
                    onComplete: (err, msg) => {
                        if (err) return Promise.reject(err);
                        else {
                            return Promise.resolve();
                        }
                    }
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
                conn.queueSendMessage(out);
            }));
        }
        return packets;
    }
    public async setLightGroupAsync(obj: any): Promise<LightGroup> {
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
        let messages = this.createLightGroupMessages(group);
        messages.push(new Promise(function (resolve, reject) {
            let out = Outbound.create({
                action: 231,
                payload: [0],
                onComplete: (err, msg) => {
                    if (err) reject(err);
                    else resolve();
                }

            });
            conn.queueSendMessage(out);
        }));

        return new Promise<LightGroup>(async (resolve, reject) => {
            try {
                await Promise.all(messages).catch(err => reject(err));
                sys.emitData('lightGroupConfig', group.get(true));
                resolve(group);
            }
            catch (err) { reject(err); }
        });

    }
    public async setLightThemeAsync(id: number, theme: number) {
        // Re-route this as we cannot set individual circuit themes in *Touch.
        return this.setLightGroupThemeAsync(id, theme);
    }
    public async setLightGroupThemeAsync(id = sys.board.equipmentIds.circuitGroups.start, theme: number): Promise<ICircuitState> {
        return new Promise<ICircuitState>((resolve, reject) => {
            const grp = sys.lightGroups.getItemById(id);
            const sgrp = state.lightGroups.getItemById(id);
            grp.lightingTheme = sgrp.lightingTheme = theme;
            let out = Outbound.create({
                action: 96,
                payload: [theme, 0],
                retries: 3,
                response: true,
                onComplete: async (err, msg) => {
                    if (err) reject(err);
                    else {
                        try {
                            // Let everyone know we turned these on.  The theme messages will come later.
                            for (let i = 0; i < grp.circuits.length; i++) {
                                let c = grp.circuits.getItemByIndex(i);
                                let cstate = state.circuits.getItemById(c.circuit);
                                // if theme is 'off' light groups should not turn on
                                if (cstate.isOn && sys.board.valueMaps.lightThemes.getName(theme) === 'off')
                                    await sys.board.circuits.setCircuitStateAsync(c.circuit, false);
                                else if (!cstate.isOn && sys.board.valueMaps.lightThemes.getName(theme) !== 'off') await sys.board.circuits.setCircuitStateAsync(c.circuit, true);
                            }
                            sgrp.isOn = sys.board.valueMaps.lightThemes.getName(theme) === 'off' ? false : true;
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
                                    setImmediate(function () { sys.board.circuits.sequenceLightGroupAsync(grp.id, 'color'); });
                                // other themes for magicstream?
                            }
                            sgrp.hasChanged = true; // Say we are dirty but we really are pure as the driven snow.
                            state.emitEquipmentChanges();
                            resolve(sgrp);
                        }
                        catch (err) {
                            logger.error(`error setting intellibrite theme: ${err.message}`);
                            reject(err);
                        }
                    }
                }
            });
            conn.queueSendMessage(out);
        });
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
        let feature = sys.features.getItemById(data.id);
        let typeByte = data.type || feature.type || sys.board.valueMaps.circuitFunctions.getValue('generic');
        let nameByte = 3; // set default `Aux 1`
        if (typeof data.nameId !== 'undefined') nameByte = data.nameId;
        else if (typeof feature.name !== 'undefined') nameByte = feature.nameId;
        return new Promise<Feature>((resolve, reject) => {
            let out = Outbound.create({
                action: 139,
                payload: [data.id, typeByte, nameByte],
                retries: 3,
                response: true,
                onComplete: (err, msg) => {
                    if (err) reject(err);
                    else {
                        let circuit = sys.features.getItemById(data.id);
                        let cstate = state.features.getItemById(data.id);
                        circuit.nameId = cstate.nameId = nameByte;
                        // circuit.name = cstate.name = sys.board.valueMaps.circuitNames.get(nameByte).desc;
                        circuit.name = cstate.name = sys.board.valueMaps.circuitNames.transform(nameByte).desc;
                        circuit.type = cstate.type = typeByte;
                        state.emitEquipmentChanges();
                        resolve(circuit);
                    }
                }
            });
            conn.queueSendMessage(out);
        });
    }
}
class TouchChlorinatorCommands extends ChlorinatorCommands {
    public setChlorAsync(obj: any): Promise<ChlorinatorState> {
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) obj.id = 1;
        // Merge all the information.
        let chlor = extend(true, {}, sys.chlorinators.getItemById(id).get(), obj);
        if (typeof obj.superChlorinate !== 'undefined') {
            chlor.superChlor = obj.superChlorinate;         
        }
        if (typeof obj.superChlorHours !== 'undefined') chlor.superChlorHours = obj.superChlorHours;
        
        if (chlor.isActive && chlor.isVirtual) return super.setChlorAsync(obj);
        if (typeof chlor.body === 'undefined') chlor.body = obj.body || 32;
        // Verify the data.
        let body = sys.board.bodies.mapBodyAssociation(chlor.body);
        if (typeof body === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Chlorinator body association is not valid: ${chlor.body}`, 'chlorinator', chlor.body));
        else chlor.body = body.val;
        if (chlor.poolSetpoint > 100 || chlor.poolSetpoint < 0) return Promise.reject(new InvalidEquipmentDataError(`Chlorinator poolSetpoint is out of range: ${chlor.poolSetpoint}`, 'chlorinator', chlor.poolSetpoint));
        if (chlor.spaSetpoint > 100 || chlor.spaSetpoint < 0) return Promise.reject(new InvalidEquipmentDataError(`Chlorinator spaSetpoint is out of range: ${chlor.poolSetpoint}`, 'chlorinator', chlor.spaSetpoint));
        
        let disabled = utils.makeBool(chlor.disabled);
        return new Promise<ChlorinatorState>((resolve, reject) => {
            let out = Outbound.create({
                dest: 16,
                action: 153,
                payload: [disabled ? 0 : (chlor.spaSetpoint << 1) + 1, disabled ? 0 : chlor.poolSetpoint,
                    utils.makeBool(chlor.superChlor) && chlor.superChlorHours > 0 ? chlor.superChlorHours + 128 : 0,  // We only want to set the superChlor when the user sends superChlor = true
                    0, 0, 0, 0, 0, 0, 0],
                retries: 3,
                response: true,
                onComplete: (err) => {
                    if (err) {
                        logger.error(`Error setting Chlorinator values: ${err.message}`);
                        reject(err);
                    }
                    let schlor = state.chlorinators.getItemById(id, true);
                    let cchlor = sys.chlorinators.getItemById(id, true);
                    schlor.isActive = cchlor.isActive = true;
                    for (let prop in chlor) {
                        if (prop in schlor) schlor[prop] = chlor[prop];
                        if (prop in cchlor) cchlor[prop] = chlor[prop];
                    }
                    let request25Packet = Outbound.create({
                        dest: 16,
                        action: 217,
                        payload: [0],
                        retries: 3,
                        response: true,
                        onComplete: (err) => {
                            if (err) {
                                logger.error(`Error requesting chlor status: ${err.message}`);
                                reject(err);
                            }
                        }
                    });
                    conn.queueSendMessage(request25Packet);
                    state.emitEquipmentChanges();
                    resolve(schlor);
                }
            });
            conn.queueSendMessage(out);
        });
    }


    //public async setChlor(cstate: ChlorinatorState, poolSetpoint: number = cstate.poolSetpoint, spaSetpoint: number = cstate.spaSetpoint, superChlorHours: number = cstate.superChlorHours, superChlor: boolean = cstate.superChlor) {
    //    return new Promise((resolve, reject) => {
    //        // if chlorinator is controlled by thas app; call super();
    //        let vc = sys.chlorinators.getItemById(1);
    //        if (vc.isActive && vc.isVirtual) return super.setChlor(cstate, poolSetpoint, spaSetpoint, superChlorHours, superChlor);
    //        // There is only one message here so setChlor can handle every chlorinator function.  The other methods in the base object are just for ease of use.  They
    //        // all map here unless overridden.
    //        let out = Outbound.create({
    //            dest: 16,
    //            action: 153,
    //            payload: [(spaSetpoint << 1) + 1, poolSetpoint, superChlorHours > 0 ? superChlorHours + 128 : 0, 0, 0, 0, 0, 0, 0, 0],
    //            retries: 3,
    //            response: true,
    //            onComplete: (err) => {
    //                if (err) {
    //                    logger.error(`Error with setChlor: ${ err.message }`
    //                    );
    //                    reject(err);
    //                }
    //                sys.board.chlorinator.setChlor(cstate, poolSetpoint, spaSetpoint, superChlorHours, superChlor);
    //                resolve();
    //            }
    //        });
    //        conn.queueSendMessage(out);
    //    });
    //}
}
class TouchPumpCommands extends PumpCommands {
    public setPump(pump: Pump, obj?: any) {
        pump.set(obj);
        let msgs: Outbound[] = this.createPumpConfigMessages(pump);
        for (let i = 0; i <= msgs.length; i++) {
            conn.queueSendMessage(msgs[i]);
        }
    }
    public async setPumpAsync(data: any): Promise<Pump> {
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
        let pump: Pump;
        let ntype;
        let type;
        let isAdd = false;
        let id = (typeof data.id === 'undefined') ? -1 : parseInt(data.id, 10);
        if (typeof data.id === 'undefined' || isNaN(id) || id <= 0) {
            // We are adding a new pump
            ntype = parseInt(data.type, 10);
            type = sys.board.valueMaps.pumpTypes.transform(ntype);
            if (typeof data.type === 'undefined' || isNaN(ntype) || typeof type.name === 'undefined') return Promise.reject(new InvalidEquipmentDataError('You must supply a pump type when creating a new pump', 'Pump', data));
            if (type.name === 'ds') {
                id = 9;
                if (sys.pumps.find(elem => elem.type === ntype)) return Promise.reject(new InvalidEquipmentDataError(`You may add only one ${type.desc} pump`, 'Pump', data));
            }
            else if (type.name === 'ss') {
                id = 10;
                if (sys.pumps.find(elem => elem.type === ntype)) return Promise.reject(new InvalidEquipmentDataError(`You may add only one ${type.desc} pump`, 'Pump', data));
            }
            else if (type.name === 'none') return Promise.reject(new InvalidEquipmentDataError('You must supply a valid id when removing a pump.', 'Pump', data));
            else {
                // Under most circumstances the id will = the address minus 95.
                if (typeof data.address !== 'undefined') {
                    data.address = parseInt(data.address, 10);
                    if (isNaN(data.address)) return Promise.reject(new InvalidEquipmentDataError(`You must supply a valid pump address to add a ${type.desc} pump.`, 'Pump', data));
                    id = data.address - 95;
                    // Make sure it doesn't already exist.
                    if (sys.pumps.find(elem => elem.address === data.address)) return Promise.reject(new InvalidEquipmentDataError(`A pump already exists at address ${data.address - 95}`, 'Pump', data));
                }
                else {
                    if (typeof id === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`You may not add another ${type.desc} pump.  Max number of pumps exceeded.`, 'Pump', data));
                    id = sys.pumps.getNextEquipmentId(sys.board.equipmentIds.pumps);
                    data.address = id + 95;
                }
            }
            isAdd = true;
        }
        else {
            pump = sys.pumps.getItemById(id, false);
            ntype = typeof data.type === 'undefined' ? pump.type : parseInt(data.type, 10);
            if (isNaN(ntype)) return Promise.reject(new InvalidEquipmentDataError(`Pump type ${data.type} is not valid`, 'Pump', data));
            type = sys.board.valueMaps.pumpTypes.transform(ntype);
            // changing type?  clear out all props and add as new
            if (ntype !== pump.type) {
                isAdd = true;
                super.setType(pump, ntype);
                pump = sys.pumps.getItemById(id, false); // refetch pump with new value
            }
        }
        // Validate all the ids since in *Touch the address is determined from the id.
        if (!isAdd) isAdd = sys.pumps.find(elem => elem.id === id) === undefined;
        // Now lets validate the ids related to the type.
        if (id === 9 && type.name !== 'ds') return Promise.reject(new InvalidEquipmentDataError(`The id for a ${type.desc} pump must be 9`, 'Pump', data));
        else if (id === 10 && type.name !== 'ss') return Promise.reject(new InvalidEquipmentDataError(`The id for a ${type.desc} pump must be 10`, 'Pump', data));
        else if (id > sys.equipment.maxPumps) return Promise.reject(new InvalidEquipmentDataError(`The id for a ${type.desc} must be less than ${sys.equipment.maxPumps}`, 'Pump', data));


        // Need to do a check here if we are clearing out the circuits; id data.circuits === []
        // extend will keep the original array
        let bClearPumpCircuits = typeof data.circuits !== 'undefined' && data.circuits.length === 0;

        if (!isAdd) data = extend(true, {}, pump.get(true), data, { id: id, type: ntype });
        else data = extend(false, {}, data, { id: id, type: ntype });
        if (!isAdd && bClearPumpCircuits) data.circuits = [];
        data.name = data.name || pump.name || type.desc;
        // We will not be sending message for ss type pumps.
        if (type.name === 'ss') {
            // The OCP doesn't deal with single speed pumps.  Simply add it to the config.
            data.circuits = [];
            pump = sys.pumps.getItemById(id, true);
            pump.set(pump);
            let spump = state.pumps.getItemById(id, true);
            for (let prop in spump) {
                if (typeof data[prop] !== 'undefined') spump[prop] = data[prop];
            }
            spump.emitEquipmentChange();
            return Promise.resolve(pump);
        }
        else if (type.name === 'ds') {
            // We are going to set all the high speed circuits.
            // RSG: TODO I don't know what the message is to set the high speed circuits.  The following should
            // be moved into the onComplete for the outbound message to set high speed circuits.
            for (let prop in pump) {
                if (typeof data[prop] !== 'undefined') pump[prop] = data[prop];
            }
            let spump = state.pumps.getItemById(id, true);
            for (let prop in spump) {
                if (typeof data[prop] !== 'undefined') spump[prop] = data[prop];
            }
            spump.emitEquipmentChange();
            return Promise.resolve(pump);
        }
        else {
            let arr = [];

            let outc = Outbound.create({
                action: 155,
                payload: [id, ntype],
                retries: 2,
                response: Response.create({ action: 1, payload: [155] })
            });
            outc.appendPayloadByte(typeof type.maxPrimingTime !== 'undefined' ? data.primingTime : 0, pump.primingTime | 0);
            outc.appendPayloadBytes(0, 44);
            if (typeof type.maxPrimingTime !== 'undefined' && type.maxPrimingTime > 0) {
                let primingSpeed = typeof data.primingSpeed !== 'undefined' ? parseInt(data.primingSpeed, 10) : pump.primingSpeed || type.minSpeed;
                outc.setPayloadByte(21, Math.floor(primingSpeed / 256));
                outc.setPayloadByte(30, primingSpeed - (Math.floor(primingSpeed / 256) * 256));
            }
            if (type.val > 1 && type.val < 64) { // Any VF pump.  It probably only goes up to Circuit 40 because that's how many circuits *Touch can support.
                outc.setPayloadByte(1, parseInt(data.backgroundCircuit, 10), pump.backgroundCircuit || 6);
                outc.setPayloadByte(3, parseInt(data.turnovers, 10), pump.turnovers || 2);
                let body = sys.bodies.getItemById(1, sys.equipment.maxBodies >= 1);
                outc.setPayloadByte(2, body.capacity / 1000, 15);
                outc.setPayloadByte(21, parseInt(data.manualFilterGPM, 10), pump.manualFilterGPM || 30);
                outc.setPayloadByte(22, parseInt(data.primingSpeed, 10), pump.primingSpeed || 55);
                let primingTime = typeof data.primingTime !== 'undefined' ? parseInt(data.primingTime, 10) : pump.primingTime;
                let maxSystemTime = typeof data.maxSystemTime !== 'undefined' ? parseInt(data.maxSystemTime, 10) : pump.maxSystemTime;
                outc.setPayloadByte(23, primingTime | maxSystemTime << 4, 5);
                outc.setPayloadByte(24, parseInt(data.maxPressureIncrease, 10), pump.maxPressureIncrease || 10);
                outc.setPayloadByte(25, parseInt(data.backwashFlow, 10), pump.backwashFlow || 60);
                outc.setPayloadByte(26, parseInt(data.backwashTime, 10), pump.backwashTime || 5);
                outc.setPayloadByte(27, parseInt(data.rinseTime, 10), pump.rinseTime || 1);
                outc.setPayloadByte(28, parseInt(data.vacuumFlow, 10), pump.vacuumFlow || 50);
                outc.setPayloadByte(28, parseInt(data.vacuumTime, 10), pump.vacuumTime || 10);
            }
            if (typeof type.maxCircuits !== 'undefined' && type.maxCircuits > 0 && typeof data.circuits !== 'undefined') { // This pump type supports circuits
                for (let i = 1; i <= data.circuits.length && i <= type.maxCircuits; i++) {
                    let c = data.circuits[i - 1];
                    let speed = parseInt(c.speed, 10);
                    let flow = parseInt(c.flow, 10);
                    if (isNaN(speed)) speed = type.minSpeed;
                    if (isNaN(flow)) flow = type.minFlow;
                    outc.setPayloadByte(i * 2 + 3, parseInt(c.circuit, 10), 0);
                    c.units = parseInt(c.units, 10) || type.name === 'vf' ? sys.board.valueMaps.pumpUnits.getValue('gpm') : sys.board.valueMaps.pumpUnits.getValue('rpm');
                    if (typeof type.minSpeed !== 'undefined' && c.units === sys.board.valueMaps.pumpUnits.getValue('rpm')) {
                        outc.setPayloadByte(i * 2 + 4, Math.floor(speed / 256)); // Set to rpm
                        outc.setPayloadByte(i + 21, speed - (Math.floor(speed / 256) * 256));
                        c.speed = speed;
                    }
                    else if (typeof type.minFlow !== 'undefined' && c.units === sys.board.valueMaps.pumpUnits.getValue('gpm')) {
                        outc.setPayloadByte(i * 2 + 4, flow); // Set to gpm
                        c.flow = flow;
                    }
                }
            }
            return new Promise<Pump>((resolve, reject) => {
                outc.onComplete = (err, msg) => {
                    if (err) reject(err);
                    else {
                        pump = sys.pumps.getItemById(id, true);
                        pump.set(data); // Sets all the data back to the pump.
                        let spump = state.pumps.getItemById(id, true);
                        spump.name = pump.name;
                        spump.type = pump.type;
                        spump.emitEquipmentChange();
                        resolve(pump);
                        const pumpConfigRequest = Outbound.create({
                            action: 216,
                            payload: [pump.id],
                            retries: 2,
                            response: true
                        });
                        conn.queueSendMessage(pumpConfigRequest);
                    }
                };
                conn.queueSendMessage(outc);
            });
        }
    }
    private createPumpConfigMessages(pump: Pump): Outbound[] {
        // [165,33,16,34,155,46],[1,128,0,2,0,16,12,6,7,1,9,4,11,11,3,128,8,0,2,18,2,3,128,8,196,184,232,152,188,238,232,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[9,75]
        const setPumpConfig = Outbound.create({
            action: 155,
            payload: [pump.id, pump.type, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            retries: 2,
            response: true
        });
        if (pump.type === 128) {
            // vs
            setPumpConfig.payload[2] = pump.primingTime || 0;
            setPumpConfig.payload[21] = Math.floor(pump.primingSpeed / 256) || 3;
            setPumpConfig.payload[30] =
                pump.primingSpeed - Math.floor(pump.primingSpeed / 256) * 256 || 232;
            for (let i = 1; i <= 8; i++) {
                let circ = pump.circuits.getItemById(i);
                setPumpConfig.payload[i * 2 + 3] = circ.circuit || 0;
                setPumpConfig.payload[i * 2 + 4] = Math.floor(circ.speed / 256) || 3;
                setPumpConfig.payload[i + 21] =
                    (circ.speed - (setPumpConfig.payload[i * 2 + 4] * 256)) || 232;
            }
        }
        else if (pump.type === 64)
            // vsf
            for (let i = 1; i <= 8; i++) {
                let circ = pump.circuits.getItemById(i);
                setPumpConfig.payload[i * 2 + 3] = circ.circuit || 0;
                if (circ.units === 0)
                    // gpm
                    setPumpConfig.payload[i * 2 + 4] = circ.flow || 30;
                else {
                    // rpm
                    setPumpConfig.payload[4] =
                        setPumpConfig.payload[4] << i - 1; // set rpm/gpm flag
                    setPumpConfig.payload[i * 2 + 4] = Math.floor(circ.speed / 256) || 3;
                    setPumpConfig.payload[i + 21] =
                        circ.speed - ((setPumpConfig.payload[i * 2 + 4] * 256)) || 232;
                }
            }
        else if (pump.type >= 1 && pump.type < 64) {
            // vf
            setPumpConfig.payload[1] = pump.backgroundCircuit || 6;
            setPumpConfig.payload[3] = pump.turnovers || 2;
            const body = sys.bodies.getItemById(1, sys.equipment.maxBodies >= 1);
            setPumpConfig.payload[2] = body.capacity / 1000 || 15;
            setPumpConfig.payload[21] = pump.manualFilterGPM || 30;
            setPumpConfig.payload[22] = pump.primingSpeed || 55;
            setPumpConfig.payload[23] =
                pump.primingTime | pump.maxSystemTime << 4 || 5;
            setPumpConfig.payload[24] = pump.maxPressureIncrease || 10;
            setPumpConfig.payload[25] = pump.backwashFlow || 60;
            setPumpConfig.payload[26] = pump.backwashTime || 5;
            setPumpConfig.payload[27] = pump.rinseTime || 1;
            setPumpConfig.payload[28] = pump.vacuumFlow || 50;
            setPumpConfig.payload[30] = pump.vacuumTime || 10;
            for (let i = 1; i <= 8; i++) {
                let circ = pump.circuits.getItemById(i);
                setPumpConfig.payload[i * 2 + 3] = circ.circuit || 0;
                setPumpConfig.payload[i * 2 + 4] = circ.flow || 15;
            }
        }
        const pumpConfigRequest = Outbound.create({
            action: 216,
            payload: [pump.id],
            retries: 2,
            response: true
        });
        return [setPumpConfig, pumpConfigRequest];
    }
    /*     public setType(pump: Pump, pumpType: number) {
            pump.type = pumpType;
            // pump.circuits.clear(); // reset circuits
            this.setPump(pump);
            let spump = state.pumps.getItemById(pump.id, true);
            spump.type = pump.type;
            spump.status = 0;
        } */
}

// class TouchChemControllerCommands extends ChemControllerCommands {
//     public async setChemControllerAsync(data: any):Promise<ChemController> {
//         let chem = sys.chemControllers.getItemById(data.id);

//         // we aren't setting an IntelliChem or changing TO an IntelliChem
//         if (typeof data.type !== 'undefined' && data.type !== sys.board.valueMaps.chemControllerTypes.getValue('IntelliChem') || 
//             typeof data.type === 'undefined' && typeof data.type === 'undefined')
//             return super.setChemControllerAsync(data);  

//         else if (chem.type !== sys.board.valueMaps.chemControllerTypes.getValue('IntelliChem'))
//             return super.setChemControllerAsync(data);  


//         // do stuff here to set IntelliChem on *Touch
//         chem.set(data);
//         //Lead In Bytes					Destination	Source	Action	No. of Bytes	pH Setpoint Hi	pH Setpoint Lo	ORP Setpoint Hi	ORP Setpoint Lo	Acid Tank Level	ORP Tank Level	Hardness  Hi	Hardness Lo		Cyanuric Acid Level	TA Hi Byte	TA Lo Byte	????										
//         //[255, 0, 255],[165,0,144,16,146,2][2,218,2,188,4,3,1,144,0,0,0,150,20,0,0,0,0,0,0,0,0,4,200
//         return Promise.resolve(chem);
//     }
// }