import * as extend from 'extend';
import { SystemBoard, byteValueMap, ConfigQueue, ConfigRequest, BodyCommands, PumpCommands, SystemCommands, CircuitCommands, FeatureCommands, ChlorinatorCommands, EquipmentIdRange, HeaterCommands, ScheduleCommands } from './SystemBoard';
import { PoolSystem, Body, Pump, sys, ConfigVersion, Heater, Schedule, EggTimer, ICircuit } from '../Equipment';
import { Protocol, Outbound, Message, Response } from '../comms/messages/Messages';
import { state, ChlorinatorState, CommsState, State, ICircuitState } from '../State';
import { logger } from '../../logger/Logger';
import { conn } from '../comms/Comms';
import { MessageError, InvalidEquipmentIdError, InvalidEquipmentDataError, InvalidOperationError } from '../Errors';
import { rejects } from 'assert';
import { resolve } from 'dns';

export class EasyTouchBoard extends SystemBoard {
    public needsConfigChanges: boolean=false;
    constructor(system: PoolSystem) {
        super(system);
        this.equipmentIds.circuits = new EquipmentIdRange(1, function() { return this.start + sys.equipment.maxCircuits - 1; });
        this.equipmentIds.features = new EquipmentIdRange(() => { return 11; }, () => { return this.equipmentIds.features.start + sys.equipment.maxFeatures + 1; });
        this.equipmentIds.virtualCircuits = new EquipmentIdRange(128, 136);
        this.equipmentIds.circuitGroups = new EquipmentIdRange(192, function() { return this.start + sys.equipment.maxCircuitGroups - 1; });
        if (typeof sys.configVersion.equipment === 'undefined') { sys.configVersion.equipment = 0; }
        this.valueMaps.customNames = new byteValueMap(
            sys.customNames.get().map((el, idx) => {
                return [idx + 200, { name: el.name, desc: el.name }];
            })
        );
        this.valueMaps.circuitNames = new byteValueMap([
            [0, { name: 'notused', desc: 'Not Used' }],
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
            [12, { name: 'auk10', desc: 'AUX 10' }],
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
            [40, { name: 'frontlight', desc: 'DFront Light' }],
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
            [1, { name: 'heater', desc: 'Heater' }],
            [2, { name: 'solarpref', desc: 'Solar Preferred' }],
            [3, { name: 'solar', desc: 'Solar Only' }]
        ]);
        this.valueMaps.heatStatus = new byteValueMap([
            [0, { name: 'off', desc: 'Off' }],
            [1, { name: 'heater', desc: 'Heater' }],
            [2, { name: 'cooling', desc: 'Cooling' }],
            [3, { name: 'solar', desc: 'Solar' }]
        ]);
        this.valueMaps.heaterTypes = new byteValueMap([
            [0, { name: 'none', desc: 'No Heater' }],
            [1, { name: 'gas', desc: 'Gas Heater' }],
            [2, { name: 'solar', desc: 'Solar Heater' }],
            [3, { name: 'heatpump', desc: 'Heat Pump' }],
            [4, { name: 'ultratemp', desc: 'Ultratemp' }],
            [5, { name: 'hybrid', desc: 'hybrid' }]
        ]);
        this.valueMaps.scheduleDays = new byteValueMap([
            [1, { name: 'sun', desc: 'Sunday', dow: 1 }],
            [2, { name: 'mon', desc: 'Monday', dow: 2 }],
            [4, { name: 'tue', desc: 'Tuesday', dow: 4 }],
            [8, { name: 'wed', desc: 'Wednesday', dow: 8 }],
            [16, { name: 'thu', desc: 'Thursday', dow: 16 }],
            [32, { name: 'fri', desc: 'Friday', dow: 32 }],
            [64, { name: 'sat', desc: 'Saturday', dow: 64 }]
        ]);
        this.valueMaps.scheduleTypes = new byteValueMap([
            [0, { name: 'repeat', desc: 'Repeats' }],
            [128, { name: 'runonce', desc: 'Run Once' }]
        ]);
        this.valueMaps.msgBroadcastActions.merge([
            [5, { name: 'dateTime', desc: 'Date/Time' }],
            [8, { name: 'heatTemp', desc: 'Heat/Temperature' }],
            [10, { name: 'customNames', desc: 'Custom Names' }],
            [11, { name: 'circuits', desc: 'Circuits' }],
            [17, { name: 'schedules', desc: 'Schedules' }],
            [22, { name: 'spaSideRemote', desc: 'Spa Side Remotes' }],
            [23, { name: 'pumpStatus', desc: 'Pump Status' }],
            [24, { name: 'pumpConfig', desc: 'Pump Config' }],
            [25, { name: 'intellichlor', desc: 'IntelliChlor' }],
            [29, { name: 'valves', desc: 'Valves' }],
            [30, { name: 'highSpeedCircuits', desc: 'High Speed Circuits' }],
            [32, { name: 'is4is10', desc: 'IS4/IS10' }],
            [34, { name: 'solarHeatPump', desc: 'Solar Heat Pump' }],
            [35, { name: 'delays', desc: 'Delays' }],
            [39, { name: 'lightGroupPositions', desc: 'Light Group Positions' }],
            [40, { name: 'settings', desc: 'Settings' }],
            [41, { name: 'circuitGroups', desc: 'Circuit Groups' }],
            [96, { name: 'setColor', desc: 'Set Color' }],
            [114, { name: 'setHeatPump', desc: 'Heat Pump Status?' }],
            [131, { name: 'setDelayCancel', desc: 'Set Delay Cancel' }],
            [133, { name: 'setDateTime', desc: 'Set Date/Time' }],
            [134, { name: 'setCircuit', desc: 'Set Circuit' }],
            [136, { name: 'setHeatTemp', desc: 'Set Heat/Temperature' }],
            [137, { name: 'setHeatPump', desc: 'Set heat pump?' }],
            [138, { name: 'setCustomName', desc: 'Set Custom Name' }],
            [139, { name: 'setCircuitNameFunc', desc: 'Set Circuit Name/Function' }],
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
            [167, { name: 'set', desc: 'Set Light Groups/Positions' }],
            [168, { name: 'set', desc: 'Set Heat Mode' }],
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
            [231, { name: 'lightGroupPositions', desc: 'Get Light Group Positions' }],
            [232, { name: 'settings', desc: 'Get Settings' }],
            [233, { name: 'circuitGroups', desc: 'Get Circuit Groups' }],
            [252, { name: 'version', desc: 'Versions' }],
            [253, { name: 'version', desc: 'Get Versions' }]
        ]);
        // TODO: RG - is this used in schedules?  It doesn't return correct results with scheduleDays.toArray()
        this.valueMaps.scheduleDays.transform = function(byte) {
            let days = [];
            let b = byte & 0x007F;
            for (let bit = 7; bit >= 0; bit--) {
                if ((byte & 1 << (bit - 1)) > 0) days.push(extend(true, {}, this.get((byte & 1 << (bit - 1)))));
            }
            return { val: b, days: days };
        };
        this.valueMaps.lightThemes.transform = function(byte) { return extend(true, { val: byte }, this.get(byte) || this.get(255)); };
        this.valueMaps.circuitNames.transform = function(byte) {
            if (byte < 200) {
                return extend(true, {}, { val: byte }, this.get(byte));
            }
            else {
                const customName = sys.customNames.getItemById(byte - 200);
                return extend(true, {}, { val: byte, desc: customName.name, name: customName.name });
            }
        };
    }
    public bodies: TouchBodyCommands=new TouchBodyCommands(this);
    public system: TouchSystemCommands=new TouchSystemCommands(this);
    public circuits: TouchCircuitCommands=new TouchCircuitCommands(this);
    public features: TouchFeatureCommands=new TouchFeatureCommands(this);
    public chlorinator: TouchChlorinatorCommands=new TouchChlorinatorCommands(this);
    public pumps: TouchPumpCommands=new TouchPumpCommands(this);
    public heaters: TouchHeaterCommands=new TouchHeaterCommands(this);
    public schedules: TouchScheduleCommands=new TouchScheduleCommands(this);
    protected _configQueue: TouchConfigQueue=new TouchConfigQueue();

    /* AKA processVersionChanges */
    public requestConfiguration(ver?: ConfigVersion) {
        if (ver && ver.lastUpdated && sys.configVersion.lastUpdated !== ver.lastUpdated) {
            sys.configVersion.lastUpdated = new Date(ver.lastUpdated);
        }
        if (ver && ver.equipment && sys.configVersion.equipment !== ver.equipment) sys.configVersion.equipment = ver.equipment;

        //this.needsConfigChanges = true;
        this.checkConfiguration();
    }
    public checkConfiguration() {
        if ((this.needsConfigChanges || (Date.now().valueOf() - new Date(sys.configVersion.lastUpdated).valueOf()) / 1000 / 60 > 15)) {
            this._configQueue.clearTimer();
            sys.configVersion.lastUpdated = new Date();
            this.needsConfigChanges = false;
            this._configQueue.queueChanges();
        }
    }
    public async stopAsync() { this._configQueue.close(); return Promise.resolve([]);}
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
    protected _configQueueTimer: NodeJS.Timeout;
    public clearTimer(): void { clearTimeout(this._configQueueTimer); }
    protected queueRange(cat: number, start: number, end: number) {
        let req = new TouchConfigRequest(cat, []);
        req.fillRange(start, end);
        this.push(req);
    }
    protected queueItems(cat: number, items: number[] = [0]) { this.push(new TouchConfigRequest(cat, items)); }
    public queueChanges() {
        this.reset();
        if (conn.mockPort) {
            logger.info(`Skipping Controller Init because MockPort enabled.`);
        } else {
            logger.info(`Requesting ${ sys.controllerType } configuration`);
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
        logger.silly(
            `Config Queue Completed... ${ this.percent }% (${ this.remainingItems } remaining)`
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
                onFinished: function() { self.processNext(out); }
/*                 response: Response.create({
                    action: this.curr.category,
                    payload: [itm],
                    callback: function() { self.processNext(out); }
                }) */
            });
            setTimeout(() => conn.queueSendMessage(out), 50);
        } else {
            // Now that we are done check the configuration a final time.  If we have anything outstanding
            // it will get picked up.
            state.status = 1;
            this.curr = null;
            sys.configVersion.lastUpdated = new Date();
            // set a timer for 20 mins; if we don't get the config request it again.  This most likely happens if there is no other indoor/outdoor remotes or ScreenLogic.
            this._configQueueTimer = setTimeout(() => sys.board.checkConfiguration(), 20 * 60 * 1000);
            logger.info(`EasyTouch system config complete.`);
            sys.board.virtualChlorinatorController.search();
        }
        // Notify all the clients of our processing status.
        state.emitControllerChange();
    }
}
export class TouchScheduleCommands extends ScheduleCommands {
    public setSchedule(sched: Schedule|EggTimer, obj?: any) {
        super.setSchedule(sched, obj);
        let msgs: Outbound[] = this.createSchedConfigMessages(sched);
        for (let i = 0; i <= msgs.length; i++) {
            conn.queueSendMessage(msgs[i]);
        }
    }

    public createSchedConfigMessages(sched: Schedule|EggTimer): Outbound[] {
        // delete sched 1
        // [ 255, 0, 255], [165, 33, 16, 33, 145, 7], [1, 0, 0, 0, 0, 0, 0], [1, 144]

        const setSchedConfig = Outbound.create({
            action: 145,
            payload: [sched.id, 0, 0, 0, 0, 0, 0],
            retries: 2
            // ,response: Response.create({ action: 1, payload: [145] })
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
                if (sched.runOnce) setSchedConfig.payload[6] = setSchedConfig.payload[6] | 0x80;
            }
        }
        const schedConfigRequest = Outbound.create({
            action: 209,
            payload: [sched.id],
            retries: 2
            // ,response: Response.create({ action: 17, payload: [sched.id] })
        });

        return [setSchedConfig, schedConfigRequest];
    }
}
// todo: this can be implemented as a bytevaluemap
export enum TouchConfigCategories {
    dateTime=5,
    heatTemperature=8,
    customNames=10,
    circuits=11,
    schedules=17,
    spaSideRemote=22,
    pumpStatus=23,
    pumpConfig=24,
    intellichlor=25,
    valves=29,
    highSpeedCircuits=30,
    is4is10=32,
    solarHeatPump=34,
    delays=35,
    lightGroupPositions=39,
    circuitGroups=41,
    settings=40,
    version=252
}
export enum GetTouchConfigCategories {
    dateTime=197,
    heatTemperature=200,
    customNames=202,
    circuits=203,
    schedules=209,
    spaSideRemote=214,
    pumpStatus=215,
    pumpConfig=216,
    intellichlor=217,
    valves=221,
    highSpeedCircuits=222,
    is4is10=224,
    intellifloSpaSideRemotes=225,
    solarHeatPump=226,
    delays=227,
    lightGroupPositions=231,
    settings=232,
    circuitGroups=233,
    version=253
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
                    if (err) reject(err);
                    // todo: track delay status?
                    state.delay = 0;
                    resolve();
                }
            });
            conn.queueSendMessage(out);
        });
    }
    public async setDateTime(obj: any) {
        return new Promise((resolve, reject) => {
            let id = 1;
            let { hour = state.time.hours,
                min = state.time.minutes,
                date = state.time.date,
                month = state.time.month,
                year = state.time.year,
                dst = sys.general.options.adjustDST ? 1 : 0,
                dow = state.time.dayOfWeek } = obj;
            // dow= day of week as expressed as [0=Sunday, 1=Monday, 2=Tuesday, 4=Wednesday, 8=Thursday, 16=Friday, 32=Saturday] and DST = 0(manually adjst for DST) or 1(automatically adjust DST)
            // [165,33,16,34,133,8],[13,10,16,29,8,19,0,0],[1,228]
            // [165,33,16,33,133,6],[1,30,16,1,2,2019,9,151
            // [165,33,34,16,1,1],[133],[1,127]
            const out = Outbound.create({
                source: Message.pluginAddress,
                dest: 16,
                action: 133,
                payload: [hour, min, dow, date, month, year, 0, dst],
                retries: 3,
                response: true,
                onComplete: (err, msg) => {
                    if (err) reject(err);
                    resolve();
                }
            });
            conn.queueSendMessage(out);
        });
    }
}
class TouchBodyCommands extends BodyCommands {
    public async setHeatModeAsync(body: Body, mode: number) {
        return new Promise((resolve, reject)=>{
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
                onComplete: (err, msg)=> {
                    if (err) reject(err);
                    body.heatMode = mode;
                    state.temps.bodies.getItemById(body.id).heatMode = mode;
                    state.temps.emitEquipmentChange();
                    resolve();
                }
            });
            conn.queueSendMessage(out);
        });
    }
    public setHeatSetpointAsync(body: Body, setPoint: number) {
        return new Promise((resolve, reject)=>{
        // [16,34,136,4],[POOL HEAT Temp,SPA HEAT Temp,Heat Mode,0,2,56]
        // 165,33,16,34,136,4,89,99,7,0,2,71  Request
        // 165,33,34,16,1,1,136,1,130  Controller Response
        const tempUnits = state.temps.units;
        switch (tempUnits) {
            case 0: // fahrenheit
                if (setPoint < 40 || setPoint > 104) {
                    logger.warn(`Setpoint of ${ setPoint } is outside acceptable range.`);
                    return;
                }
                break;
            case 1: // celcius
                if (setPoint < 4 || setPoint > 40) {
                    logger.warn(
                        `Setpoint of ${ setPoint } is outside of acceptable range.`
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
                    state.temps.bodies.getItemById(body.id).setPoint = setPoint;
                    state.temps.emitEquipmentChange();
                    resolve();
            }
                
            });
            conn.queueSendMessage(out);
        });
    }
}
class TouchCircuitCommands extends CircuitCommands {
    public getLightThemes(type: number): any[] {
        let themes = sys.board.valueMaps.lightThemes.toArray();
        switch (type) {
            case 8: // Magicstream
                return themes.filter(theme => theme.type === 'magicstream'); 
            case 16: // Intellibrite
                return themes.filter(theme => theme.type === 'intellibrite'); 
            default:
                return [];
        }
    }
    public async setCircuitAsync(data: any): Promise<ICircuit|string> {
        // example [255,0,255][165,33,16,34,139,5][17,14,209,0,0][2,120]
        // set circuit 17 to function 14 and name 209
        // response: [255,0,255][165,33,34,16,1,1][139][1,133]
        let circuit = sys.circuits.getInterfaceById(data.id);
        let typeByte = data.type || circuit.type || sys.board.valueMaps.circuitFunctions.getValue('generic');
        let nameByte = 3; // set default `Aux 1`
        if (typeof data.nameId !== 'undefined') nameByte = data.nameId;
        else if (typeof circuit.name !== 'undefined') nameByte = circuit.nameId;
        return new Promise<ICircuit|string>((resolve, reject) => {
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
    public async deleteCircuitAsync(data: any): Promise<ICircuit|string> {
        data.nameId = 0;
        data.functionId = sys.board.valueMaps.circuitFunctions.getValue('notused');
        return this.setCircuitAsync(data);
    }
    public async setCircuitStateAsync(id: number, val: boolean): Promise<ICircuitState|string> {
        return new Promise<ICircuitState|string>((resolve, reject) => {
            let cstate = state.circuits.getInterfaceById(id);
            let out = Outbound.create({
                action: 134,
                payload: [id, val ? 1 : 0],
                retries: 3,
                response: true,
                onComplete: (err, msg) => {
                    if (err) reject(err);
                    cstate.isOn = val ? true : false;
                    if (id === 6) { sys.board.virtualChlorinatorController.start(); }
                    sys.board.virtualPumpControllers.start();
                    state.emitEquipmentChanges();
                    resolve(cstate.get(true));
                }
            });
            conn.queueSendMessage(out);
        });
    }
    public async toggleCircuitStateAsync(id: number) {
        let cstate = state.circuits.getInterfaceById(id);
        return this.setCircuitStateAsync(id, !cstate.isOn);
    }
    public async setLightThemeAsync(id: number, theme: number) {
        // Re-route this as we cannot set individual circuit themes in *Touch.
        this.setIntelliBriteThemeAsync(theme);
    }
    public async setIntelliBriteThemeAsync(theme: number) {
        return new Promise((resolve, reject) => {
            let out = Outbound.create({
                action: 96,
                payload: [theme, 0],
                retries: 3,
                response: true,
                onComplete: (err, msg) => {
                    if (err) reject(err);
                    state.intellibrite.lightingTheme = sys.intellibrite.lightingTheme = theme;
                    for (let i = 0; i < sys.intellibrite.circuits.length; i++) {
                        let c = sys.intellibrite.circuits.getItemByIndex(i);
                        let cstate = state.circuits.getItemById(c.circuit);
                        let circuit = sys.circuits.getInterfaceById(c.circuit);
                        cstate.lightingTheme = circuit.lightingTheme = theme;
                        if (!cstate.isOn) sys.board.circuits.setCircuitStateAsync(c.circuit, true);
                    }// Let everyone know we turned these on.  The theme messages will come later.
                    state.emitEquipmentChanges();
                    resolve(theme);
                }
            });
            conn.queueSendMessage(out);
        });
    }
}

class TouchFeatureCommands extends FeatureCommands {
    // todo: remove this in favor of setCircuitState only?
    public setFeatureState(id: number, val: boolean) {
        // Route this to the circuit state since this is the same call
        // and the interface takes care of it all.
        this.board.circuits.setCircuitStateAsync(id, val);
    }
    public toggleFeatureState(id: number) {
        // Route this to the circuit state since this is the same call
        // and the interface takes care of it all.
        this.board.circuits.toggleCircuitStateAsync(id);
    }
}
class TouchChlorinatorCommands extends ChlorinatorCommands {
    public async setChlor(cstate: ChlorinatorState, poolSetpoint: number = cstate.poolSetpoint, spaSetpoint: number = cstate.spaSetpoint, superChlorHours: number = cstate.superChlorHours, superChlor: boolean = cstate.superChlor) {
        return new Promise((resolve, reject)=>{

    
        // if chlorinator is controlled by thas app; call super();
        let vc = sys.chlorinators.getItemById(1);
        if (vc.isActive && vc.isVirtual) return super.setChlor(cstate, poolSetpoint, spaSetpoint, superChlorHours, superChlor);
        // There is only one message here so setChlor can handle every chlorinator function.  The other methods in the base object are just for ease of use.  They
        // all map here unless overridden.
        let out = Outbound.create({
            dest: 16,
            action: 153,
            payload: [(spaSetpoint << 1) + 1, poolSetpoint, superChlorHours > 0 ? superChlorHours + 128 : 0, 0, 0, 0, 0, 0, 0, 0],
            retries: 3,
            response: true,
            onComplete: (err) => {
                if (err) { logger.error(`Error with setChlor: ${ err.message }`
                ); 
            reject(err);
        }
                sys.board.chlorinator.setChlor(cstate, poolSetpoint, spaSetpoint, superChlorHours, superChlor);
                resolve();
            }
        });
        conn.queueSendMessage(out);
    });
    }
}
class TouchPumpCommands extends PumpCommands {
    public setPump(pump: Pump, obj?: any) {
        super.setPump(pump, obj);
        let msgs: Outbound[] = this.createPumpConfigMessages(pump);
        for (let i = 0; i <= msgs.length; i++) {
            conn.queueSendMessage(msgs[i]);
        }
    }
    public async setPumpAsync(data: any): Promise<Pump|string> {
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
            if (typeof data.type === 'undefined' || isNaN(ntype) || typeof type.name === 'undefined') throw new InvalidEquipmentDataError('You must supply a pump type when creating a new pump', 'Pump', data);
            if (type.name === 'ds') {
                id = 9;
                if (sys.pumps.find(elem => elem.type === ntype)) throw new InvalidEquipmentDataError(`You may add only one ${ type.desc } pump`, 'Pump', data);
            }
            else if (type.name === 'ss') {
                id = 10;
                if (sys.pumps.find(elem => elem.type === ntype)) throw new InvalidEquipmentDataError(`You may add only one ${ type.desc } pump`, 'Pump', data);
            }
            else if (type.name === 'none') throw new InvalidEquipmentDataError('You must supply a valid id when removing a pump.', 'Pump', data);
            else {
                // Under most circumstances the id will = the address minus 95.
                if (typeof data.address !== 'undefined') {
                    data.address = parseInt(data.address, 10);
                    if (isNaN(data.address)) throw new InvalidEquipmentDataError(`You must supply a valid pump address to add a ${ type.desc } pump.`, 'Pump', data);
                    id = data.address - 95;
                    // Make sure it doesn't already exist.
                    if (sys.pumps.find(elem => elem.address === data.address)) throw new InvalidEquipmentDataError(`A pump already exists at address ${ data.address - 95 }`, 'Pump', data);
                }
                else {
                    if (typeof id === 'undefined') throw new InvalidEquipmentDataError(`You may not add another ${ type.desc } pump.  Max number of pumps exceeded.`, 'Pump', data);
                    id = sys.pumps.getNextEquipmentId(sys.board.equipmentIds.pumps);
                    data.address = id + 95;
                }
            }
            isAdd = true;
        }
        else {
            pump = sys.pumps.getItemById(id, false);
            ntype = typeof data.type === 'undefined' ? pump.type : parseInt(data.type, 10);
            if (isNaN(ntype)) throw new InvalidEquipmentDataError(`Pump type ${ data.type } is not valid`, 'Pump', data);
            type = sys.board.valueMaps.pumpTypes.transform(ntype);
        }
        // Validate all the ids since in *Touch the address is determined from the id.
        if (!isAdd) isAdd = sys.pumps.find(elem => elem.id === id) !== undefined;
        // Now lets validate the ids related to the type.
        if (id === 9 && type.name !== 'ds') throw new InvalidEquipmentDataError(`The id for a ${ type.desc } pump must be 9`, 'Pump', data);
        else if (id === 10 && type.name !== 'ss') throw new InvalidEquipmentDataError(`The id for a ${ type.desc } pump must be 10`, 'Pump', data);
        else if (id > sys.equipment.maxPumps) throw new InvalidEquipmentDataError(`The id for a ${ type.desc } must be less than ${ sys.equipment.maxPumps }`, 'Pump', data);


        if (!isAdd) data = extend(true, {}, pump.get(true), data, { id: id, type: ntype });
        else data = extend(false, {}, data, { id: id, type: ntype });
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
            data.name = data.name || type.desc;
            let outc = Outbound.create({ 
                action: 155, 
                payload: [id, ntype], 
                retries: 2, 
                response: Response.create({ action: 1, payload: [155] })
             });
            outc.appendPayloadByte(typeof type.maxPrimingTime !== 'undefined' ? data.primingTime : 0, pump.primingTime);
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
            else if (typeof type.maxCircuits !== 'undefined') { // This pump type supports circuits
                for (let i = 1; i <= 8; i++) {
                    if (i < data.circuits.length && i < type.maxCircuits) {
                        let circ = pump.circuits.getItemByIndex(i, false);
                        let c = data.circuits[i];
                        let speed = parseInt(c.speed, 10) || circ.speed || type.minSpeed;
                        let flow = parseInt(c.flow, 10) || circ.speed || type.minFlow;
                        outc.setPayloadByte(i * 2 + 3, parseInt(data.circuit, 10), 0);
                        if (typeof type.minSpeed !== 'undefined' && (parseInt(c.units, 10) === 0 || isNaN(parseInt(c.units, 10)))) {
                            outc.setPayloadByte(i * 2 + 4, Math.floor(speed / 256)); // Set to rpm
                            outc.setPayloadByte(i + 21, speed - (Math.floor(speed / 256) * 256));
                        }
                        else if (typeof type.minFlow !== 'undefined' && (parseInt(c.units, 10) === 1 || isNaN(parseInt(c.units, 10)))) {
                            outc.setPayloadByte(i * 2 + 4, flow); // Set to gpm
                        }
                    }
                }
            }
            return new Promise<Pump|string>((resolve, reject) => {
                outc.onComplete = (err, msg) => {
                    if (err) reject(err);
                    else {
                        pump = sys.pumps.getItemById(id, true);
                        pump.set(data); // Sets all the data back to the pump.
                        let spump = state.pumps.getItemById(id, true);
                        spump.name = pump.name;
                        spump.type = pump.type;
                        spump.emitEquipmentChange();
                        resolve();
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
class TouchHeaterCommands extends HeaterCommands {
    public updateHeaterServices(heater: Heater) {
        if (heater.isActive || heater.type !== 1) {
            if (heater.type === 3) {
                this.board.valueMaps.heatModes = new byteValueMap([
                    [0, { name: 'off', desc: 'Off' }],
                    [1, { name: 'heater', desc: 'Heater' }],
                    [2, { name: 'heatpump', desc: 'Heat Pump Only' }],
                    [3, { name: 'heatpumppref', desc: 'Heat Pump Preferred' }]
                ]);
                this.board.valueMaps.heatSources = new byteValueMap([
                    [0, { name: 'off', desc: 'No Heater' }],
                    [3, { name: 'heater', desc: 'Heater' }],
                    [5, { name: 'heatpump', desc: 'Heat Pump Only' }],
                    [21, { name: 'heatpumppref', desc: 'Heat Pump Preferred' }],
                    [32, { name: 'nochange', desc: 'No Change' }]
                ]);
            }
            else if (heater.type === 2) {
                this.board.valueMaps.heatModes = new byteValueMap([
                    [0, { name: 'off', desc: 'Off' }],
                    [1, { name: 'heater', desc: 'Heater' }],
                    [2, { name: 'solar', desc: 'Solar Only' }],
                    [3, { name: 'solarpref', desc: 'Solar Preferred' }]
                ]);
                // todo = verify these; don't think they are correct.
                this.board.valueMaps.heatSources = new byteValueMap([
                    [0, { name: 'off', desc: 'No Heater' }],
                    [3, { name: 'heater', desc: 'Heater' }],
                    [5, { name: 'solar', desc: 'Solar Only' }],
                    [21, { name: 'solarpref', desc: 'Solar Preferred' }],
                    [32, { name: 'nochange', desc: 'No Change' }]
                ]);
            }
        }
        else {
            this.board.valueMaps.heatModes = new byteValueMap([
                [0, { name: 'off', desc: 'Off' }],
                [1, { name: 'heater', desc: 'Heater' }]
            ]);
            // todo = verify these; don't think they are correct.
            this.board.valueMaps.heatSources = new byteValueMap([
                [0, { name: 'off', desc: 'No Heater' }],
                [3, { name: 'heater', desc: 'Heater' }],
                [32, { name: 'nochange', desc: 'No Change' }]
            ]);
        }
    }
}