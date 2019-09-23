import * as extend from 'extend';
import { EventEmitter } from 'events';
import { SystemBoard, byteValueMap, byteValueMaps, ConfigQueue, ConfigRequest } from './SystemBoard';
import { PoolSystem, Body, Schedule, Pump, ConfigVersion, sys } from '../Equipment';
import { Protocol, Outbound, Message, Response } from '../comms/messages/Messages';
import { conn } from '../comms/Comms';
import { logger } from '../../logger/Logger';
import { state } from '../State';
import { Enums } from '../Constants';
export class IntelliCenterBoard extends SystemBoard {
    private _needsChanges: boolean = false;
    private _configQueue: IntelliCenterConfigQueue = new IntelliCenterConfigQueue();
    constructor(system: PoolSystem) {
        super(system);
        this.valueMaps.circuitFunctions = new byteValueMap([
            [0, { val: 0, name: 'generic', desc: 'Generic' }],
            [1, { val: 1, name: 'spillway', desc: 'Spillway' }],
            [2, { val: 2, name: 'mastercleaner', desc: 'Master Cleaner' }],
            [3, { val: 3, name: 'chemrelay', desc: 'Chem Relay' }],
            [4, { val: 4, name: 'light', desc: 'Light' }],
            [5, { val: 5, name: 'intellibrite', desc: 'Intellibrite' }],
            [6, { val: 6, name: 'globrite', desc: 'GloBrite' }],
            [7, { val: 7, name: 'globritewhite', desc: 'GloBrite White' }],
            [8, { val: 8, name: 'magicstream', desc: 'Magicstream' }],
            [9, { val: 9, name: 'dimmer', desc: 'Dimmer' }],
            [10, { val: 10, name: 'colorcascade', desc: 'ColorCascade' }],
            [11, { val: 11, name: 'mastercleaner2', desc: 'Master Cleaner 2' }],
            [12, { val: 12, name: 'pool', desc: 'Pool' }],
            [13, { val: 13, name: 'spa', desc: 'Spa' }]
        ]);
        this.valueMaps.heaterTypes = new byteValueMap([
            [0, { name: 'none', desc: 'No Heater' }],
            [1, { name: 'gas', desc: 'Gas Heater' }],
            [2, { name: 'solar', desc: 'Solar Heater' }],
            [3, { name: 'heatpump', desc: 'Heat Pump' }],
            [4, { name: 'ultratemp', desc: 'Ultratemp' }],
            [5, { name: 'hybrid', desc: 'hybrid' }]
        ]);
        this.valueMaps.pumpTypes = new byteValueMap([
            [0, { name: 'none', desc: 'No pump' }],
            [1, { name: 'ss', desc: 'Single Speed' }],
            [2, { name: 'ds', desc: 'Two Speed' }],
            [3, { name: 'vs', desc: 'Intelliflo VS' }],
            [4, { name: 'vsf', desc: 'Intelliflo VSF' }],
            [5, { name: 'vf', desc: 'Intelliflo VF' }]
        ]);
        this.valueMaps.heatModes = new byteValueMap([
            [0, { name: 'off', desc: 'Off' }],
            [3, { name: 'heater', desc: 'Heater' }],
            [5, { name: 'solar', desc: 'Solar Only' }],
            [12, { name: 'solarpref', desc: 'Solar Preferred' }],
        ]);

    }
    public checkConfiguration() {
        this._needsChanges = true;
        // Send out a message to the outdoor panel that we need info about
        // our current configuration.
        console.log('Checking IntelliCenter configuration...');
        const out: Outbound = Outbound.createMessage(228, [0], 5, new Response(15, 16, 164, [], 164));
        conn.queueSendMessage(out);
    }
    public requestConfiguration(ver: ConfigVersion) {
        logger.info(`Requesting IntelliCenter configuration`);
        this._configQueue.queueChanges(ver);
    }
    public stopAsync() { this._configQueue.close(); }
    public getLightThemes(type: number): any[] {
        switch (type) {
            case 5: // Intellibrite
            case 8: // Magicstream
                return this.valueMaps.lightThemes.toArray();
            default:
                return [];
        }
    }
    public setHeatMode(body: Body, mode: number) {
        const self = this;
        let byte2 = 18;
        let mode1 = sys.bodies.getItemById(1).setPoint || 100;
        let mode2 = sys.bodies.getItemById(2).setPoint || 100;
        let mode3 = sys.bodies.getItemById(3).setPoint || 100;
        let mode4 = sys.bodies.getItemById(4).setPoint || 100;
        switch (body.id) {
            case 1:
                byte2 = 22;
                mode1 = mode;
                break;
            case 2:
                byte2 = 23;
                mode2 = mode;
                break;
            case 3:
                byte2 = 24;
                mode3 = mode;
                break;
            case 4:
                byte2 = 25;
                mode4 = mode;
                break;
        }
        let out = Outbound.createMessage(168,
            [0, 0, byte2, 1, 0, 0, 129, 0, 0, 0, 0, 0, 0, 0, 176, 89, 27, 110, 3, 0, 0, 100, 100, 100, 100, mode1, mode2, mode3, mode4, 15, 0
                , 0, 0, 0, 100, 0, 0, 0, 0, 0, 0],
            0,
            new Response(16, Message.pluginAddress, 1, [168], null, function (msg) {
                if (!msg.failed) {
                    body.heatMode = mode;
                    state.temps.bodies.getItemById(body.id).heatMode = mode;
                }
            })
        );
        conn.queueSendMessage(out);

    }
    public setHeatSetpoint(body: Body, setPoint: number) {
        let byte2 = 18;
        let temp1 = sys.bodies.getItemById(1).setPoint || 100;
        let temp2 = sys.bodies.getItemById(2).setPoint || 100;
        let temp3 = sys.bodies.getItemById(3).setPoint || 100;
        let temp4 = sys.bodies.getItemById(4).setPoint || 100;
        switch (body.id) {
            case 1:
                byte2 = 18;
                temp1 = setPoint;
                break;
            case 2:
                byte2 = 20;
                temp2 = setPoint;
                break;
            case 3:
                byte2 = 19;
                temp3 = setPoint;
                break;
            case 4:
                byte2 = 21;
                temp4 = setPoint;
                break;
        }
        let out = Outbound.createMessage(
            168, [0, 0, byte2, 1, 0, 0, 129, 0, 0, 0, 0, 0, 0, 0, 176, 89, 27, 110, 3, 0, 0, temp1, temp3, temp2, temp4, 0, 0, 0, 0, 15, 0, 0, 0
                , 0, 100, 0, 0, 0, 0, 0, 0], 0,
            new Response(16, Message.pluginAddress, 1, [168], null, function (msg) {
                if (!msg.failed) {
                    body.setPoint = setPoint;
                    state.temps.bodies.getItemById(body.id).setPoint = setPoint;
                    state.temps.emitEquipmentChange();
                }
            })
        );
        conn.queueSendMessage(out);
    }
    public setSchedule(sched: Schedule, obj: any) {
        // We are going to extract the properties from
        // the object then send a related message to set it
        // on the controller.
        if (typeof obj.startTime === 'number') sched.startTime = obj.startTime;
        if (typeof obj.endTime === 'number') sched.endTime = obj.endTime;
        if (typeof obj.scheduleType === 'number') sched.runOnce = (sched.runOnce & 0x007f) + (obj.scheduleType > 0 ? 128 : 0);
        if (typeof obj.scheduleDays === 'number')
            if ((sched.runOnce & 128) > 0) {
                sched.runOnce = sched.runOnce & 0x00ff & obj.scheduleDays;
            } else sched.scheduleDays = obj.scheduleDays & 0x00ff;

        if (typeof obj.circuit === 'number') sched.circuit = obj.circiut;
        const csched = state.schedules.getItemById(sched.id, true);
        csched.startTime = sched.startTime;
        csched.endTime = sched.endTime;
        csched.circuit = sched.circuit;
        csched.heatSetpoint = sched.heatSetpoint;
        csched.heatSource = sched.heatSource;
        csched.scheduleDays =
            (sched.runOnce & 128) > 0 ? sched.runOnce : sched.scheduleDays;
        csched.scheduleType = sched.runOnce;
        csched.emitEquipmentChange();
        let out = Outbound.createMessage(168, [
            3
            , 0
            , sched.id - 1
            , sched.startTime - Math.floor(sched.startTime / 256) * 256
            , Math.floor(sched.startTime / 256)
            , sched.endTime - Math.floor(sched.endTime / 256) * 256
            , Math.floor(sched.endTime / 256)
            , sched.circuit - 1
            , sched.runOnce
            , sched.scheduleDays
            , sched.startMonth
            , sched.startDay
            , sched.startYear - 2000
            , sched.heatSource
            , sched.heatSetpoint
            , sched.flags
            ,],
            0
        );
        conn.queueSendMessage(out); // Send it off in a letter to yourself.
    }
    public setPump(pump: Pump, obj?: any) {
        super.setPump(pump, obj);
        let msgs: Outbound[] = this.createPumpConfigMessages(pump);
        sys.emitEquipmentChange();
        sys.pumps.emitEquipmentChange();
    }
    private createPumpConfigMessages(pump: Pump): Outbound[] {
        let arr: Outbound[] = [];
        let outSettings = Outbound.createMessage(
            168, [4, 0, pump.id - 1, pump.type, 0, pump.address, pump.minSpeed - Math.floor(pump.minSpeed / 256) * 256, Math.floor(pump.minSpeed / 256), pump.maxSpeed - Math.floor(pump.maxSpeed / 256) * 256
                , Math.floor(pump.maxSpeed / 256), pump.minFlow, pump.maxFlow, pump.flowStepSize, pump.primingSpeed - Math.floor(pump.primingSpeed / 256) * 256
                , Math.floor(pump.primingSpeed / 256), pump.speedStepSize / 10, pump.primingTime
                , 5, 255, 255, 255, 255, 255, 255, 255, 255
                , 0, 0, 0, 0, 0, 0, 0, 0], 0); // All the circuits and units.
        let outName = Outbound.createMessage(
            168, [4, 1, pump.id - 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0);
        for (let i = 0; i < 8; i++) {
            let circuit = pump.circuits.getItemById(i + 1);
            if (typeof circuit.circuit === 'undefined' || circuit.circuit === 255 || circuit.circuit === 0) {
                outSettings.payload[i + 18] = 255;
                // If this is a VF or VSF then we want to put these units in the minimum flow category.
                switch (pump.type) {
                    case 1: // SS
                    case 2: // DS
                        outName.payload[i * 2 + 3] = 0;
                        outName.payload[i * 2 + 4] = 0;
                        break;
                    case 4: // VSF
                    case 5: // VF
                        outName.payload[i * 2 + 3] =
                            pump.minSpeed - Math.floor(pump.minFlow / 256) * 256;
                        outName.payload[i * 2 + 4] = Math.floor(pump.minFlow / 256);
                        break;
                    default:
                        // VS
                        outName.payload[i * 2 + 3] = pump.minSpeed - Math.floor(pump.minSpeed / 256) * 256;
                        outName.payload[i * 2 + 4] = Math.floor(pump.minSpeed / 256);
                        break;
                }
            }
            else {
                outSettings.payload[i + 18] = circuit.circuit - 1; // Set this to the index not the id.
                outSettings.payload[i + 26] = circuit.units;
                switch (pump.type) {
                    case 1: // SS
                        outName.payload[i * 2 + 3] = 0;
                        outName.payload[i * 2 + 4] = 0;
                        break;
                    case 2: // DS
                        outName.payload[i * 2 + 3] = 1;
                        outName.payload[i * 2 + 4] = 0;
                        break;
                    case 4: // VSF
                    case 5: // VF
                        outName.payload[i * 2 + 3] = circuit.flow - Math.floor(circuit.flow / 256) * 256;
                        outName.payload[i * 2 + 4] = Math.floor(circuit.flow / 256);
                        break;
                    default:
                        // VS
                        outName.payload[i * 2 + 3] = circuit.speed - Math.floor(circuit.speed / 256) * 256;
                        outName.payload[i * 2 + 4] = Math.floor(circuit.speed / 256);
                        break;
                }
            }
        }
        outName.appendPayloadString(pump.name, 16);
        return [outSettings, outName];
    }
}
class IntelliCenterConfigRequest extends ConfigRequest {
    constructor(cat: number, ver: number, items?: number[], oncomplete?: Function) {
        super();
        this.category = cat;
        this.version = ver;
        if (typeof items !== 'undefined') this.items.push(...items);
        this.oncomplete = oncomplete;
    }
    public category: ConfigCategories;
}

class IntelliCenterConfigQueue extends ConfigQueue {
    public processNext(msg?: Outbound) {
        if (this.closed) return;
        let self = this;
        if (typeof msg !== 'undefined' && msg !== null) {
            if (!msg.failed) {
                // Remove all references to future items. We got it so we don't need it again.
                this.removeItem(msg.payload[0], msg.payload[1]);
                if (this.curr && this.curr.isComplete) {
                    if (!this.curr.failed) {
                        // Call the identified callback.  This may add additional items.
                        if (typeof this.curr.oncomplete === 'function') {
                            this.curr.oncomplete(this.curr);
                            this.curr.oncomplete = undefined;
                        }
                        // Let the process add in any additional information we might need.  When it does
                        // this it will set the isComplete flag to false.
                        if (this.curr.isComplete) {
                            sys.configVersion[ConfigCategories[this.curr.category]] = this.curr.version;
                        }
                    } else {
                        // We failed to get the data.  Let the system retry when
                        // we are done with the queue.
                        sys.configVersion[ConfigCategories[this.curr.category]] = 0;
                    }
                }
            }
        }
        if (!this.curr && this.queue.length > 0) this.curr = this.queue.shift();
        if (!this.curr) {
            // There never was anything for us to do. We will likely never get here.
            state.status = 1;
            state.emitControllerChange();
            return;
        } else
            state.status = Enums.ControllerStatus.transform(2, this.percent);
        // Shift to the next config queue item.
        while (
            this.queue.length > 0 &&
            this.curr.isComplete
        ) {
            this.curr = this.queue.shift() || null;
        }
        let itm = 0;
        if (this.curr && !this.curr.isComplete) {
            itm = this.curr.items.shift();
            const out: Outbound = new Outbound(
                Protocol.Broadcast,
                Message.pluginAddress,
                15,
                222,
                [this.curr.category, itm],
                5,
                new Response(16, 15, 30,
                    [this.curr.category, itm],
                    30,
                    function (msgOut) { self.processNext(msgOut) })
            );
            setTimeout(conn.queueSendMessage, 50, out);
        } else {
            // Now that we are done check the configuration a final time.  If we have anything outstanding
            // it will get picked up.
            state.status = 1;
            this.curr = null;
            setTimeout(function () { sys.checkConfiguration(); }, 100);
        }
        // Notify all the clients of our processing status.
        state.emitControllerChange();
    }
    public queueChanges(ver: ConfigVersion) {
        let curr: ConfigVersion = sys.configVersion;
        let self = this;
        //console.log(curr.hasChanges(ver));
        if (!curr.hasChanges(ver)) return;
        sys.configVersion.lastUpdated = new Date();
        // Tell the system we are loading.
        state.status = Enums.ControllerStatus.transform(2, 0);
        this.maybeQueueItems(curr.equipment, ver.equipment, ConfigCategories.equipment, [0, 1, 2, 3]);
        this.maybeQueueItems(curr.options, ver.options, ConfigCategories.options, [0, 1]);
        if (this.compareVersions(curr.circuits, ver.circuits)) {
            let req = new IntelliCenterConfigRequest(ConfigCategories.circuits, ver.circuits, [0, 1, 2]);
            // Only add in the items that we need.
            req.fillRange(3, Math.min(Math.ceil(sys.equipment.maxCircuits / 2) + 3, 24));
            req.fillRange(26, 29);
            this.push(req);
        }
        if (this.compareVersions(curr.features, ver.features)) {
            let req = new IntelliCenterConfigRequest(ConfigCategories.features, ver.features, [0, 1, 2, 3, 4, 5]);
            // Only add in the items that we need for now.  We will queue the optional packets later.  The first 6 packets
            // are required but we can reduce the number of names returned by only requesting the data after the names have been processed.
            req.oncomplete = function (req: IntelliCenterConfigRequest) {
                // We only need to get the feature names required.  This will fill these after we know we have them.
                req.fillRange(6, Math.min(Math.ceil(sys.features.length / 2) + 5, 21));
            };
            this.push(req);
        }
        if (this.compareVersions(curr.pumps, ver.pumps)) {
            let req = new IntelliCenterConfigRequest(ConfigCategories.pumps, ver.pumps, [4],
                function (req: IntelliCenterConfigRequest) {
                    // Get the pump names after we have acquire the active pumps.  We only need
                    // the names of the active pumps.
                    let pumpCount = 0;
                    let arr = sys.pumps.toArray();
                    for (let i = 0; i < arr.length; i++)
                        if (arr[i].isActive) pumpCount++;
                    if (pumpCount > 0) req.fillRange(19, Math.min(Math.ceil(pumpCount / 2) + 18, 26));
                });
            req.fillRange(0, 3);
            req.fillRange(5, 18);
            this.push(req);
        }
        this.maybeQueueItems(curr.security, ver.security, ConfigCategories.security, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
        if (this.compareVersions(curr.remotes, ver.remotes)) {
            let req = new IntelliCenterConfigRequest(ConfigCategories.remotes, ver.remotes, [0, 1], function (req: IntelliCenterConfigRequest) {
                // Only get remote attributes if we actually have something other than the 2 is4s.
                if (sys.remotes.length > 2) req.fillRange(3, sys.remotes.length - 2 + 3);
            });
            this.push(req);
        }
        if (this.compareVersions(curr.circuitGroups, ver.circuitGroups)) {
            let req = new IntelliCenterConfigRequest(ConfigCategories.circuitGroups, ver.circuitGroups, [32,33], function (req: IntelliCenterConfigRequest) {
                // Only get group attributes for the ones we have defined.  The total number of message for all potential groups exceeds 50.
                if (sys.circuitGroups.length > 0) {
                    req.fillRange(0, sys.circuitGroups.length - 1); // Circuits
                    req.fillRange(16, sys.circuitGroups.length + 15); // Group names
                    if (sys.circuitGroups.length > 0) req.fillRange(34, 34);  // Egg timer
                    if (sys.circuitGroups.length > 16) req.fillRange(35, 35); // Egg timer

                    // TODO: RKS -- There are many more available messages for this but I don't yet see thier use.  My suspicion is that they are
                    // related to the color swim, sync and lighting themes.

                }

            });
            this.push(req);
        }
        this.maybeQueueItems(curr.chlorinators, ver.chlorinators, ConfigCategories.chlorinators, [0]);
        if (this.compareVersions(curr.valves, ver.valves)) {
            let req = new IntelliCenterConfigRequest(ConfigCategories.valves, ver.valves, [0]);
            req.fillRange(1, Math.min(Math.ceil(sys.equipment.maxValves / 2) + 1, 14));
            this.push(req);
        }
        if (this.compareVersions(curr.intellichem, ver.intellichem)) {
            // TODO: RKS -- Dunno what the intellichem data looks like.
            curr.intellichem = ver.intellichem;
        }
        if (this.compareVersions(curr.heaters, ver.heaters)) {
            let req = new IntelliCenterConfigRequest(ConfigCategories.heaters, ver.heaters, [0, 1, 2, 3, 4],
                function (req: IntelliCenterConfigRequest) {
                    if (sys.heaters.length > 0) req.fillRange(5, Math.min(Math.ceil(sys.heaters.length / 2) + 4, 12)); // Heater names
                });
            this.push(req);
        }
        this.maybeQueueItems(curr.general, ver.general, ConfigCategories.general, [0, 1, 2, 3, 4, 5, 6, 7]);
        this.maybeQueueItems(curr.covers, ver.covers, ConfigCategories.covers, [0, 1]);
        if (this.compareVersions(curr.schedules, ver.schedules)) {
            let req = new IntelliCenterConfigRequest(ConfigCategories.schedules, ver.schedules, [0, 1, 2, 3, 4], function (req: IntelliCenterConfigRequest) {
                req.fillRange(5, 4 + Math.min(Math.ceil(sys.schedules.length / 40), 7)); // Circuits
                req.fillRange(8, 7 + Math.min(Math.ceil(sys.schedules.length / 40), 10)); // Flags
                req.fillRange(11, 10 + Math.min(Math.ceil(sys.schedules.length / 40), 13)); // Schedule days bitmask
                req.fillRange(14, 13 + Math.min(Math.ceil(sys.schedules.length / 40), 16)); // Unknown (one byte per schedule)
                req.fillRange(17, 16 + Math.min(Math.ceil(sys.schedules.length / 40), 19)); // Unknown (one byte per schedule)
                req.fillRange(20, 19 + Math.min(Math.ceil(sys.schedules.length / 40), 22)); // Unknown (one byte per schedule)
                req.fillRange(23, 22 + Math.min(Math.ceil(sys.schedules.length / 20), 26)); // End Time
                req.fillRange(28, 27 + Math.min(Math.ceil(sys.schedules.length / 40), 30)); // Heat Mode
                req.fillRange(31, 30 + Math.min(Math.ceil(sys.schedules.length / 40), 33)); // Heat Mode
                req.fillRange(34, 33 + Math.min(Math.ceil(sys.schedules.length / 40), 36)); // Heat Mode
            });
            this.push(req);
        }
        logger.info(`Queued ${this.remainingItems} configuration items`);
        if (this.remainingItems > 0) setTimeout(function () { self.processNext() }, 50);
        else state.status = 1;
        state.emitControllerChange();
        //this._needsChanges = false;
        //this.data.controllerType = this.controllerType;
    }
    private compareVersions(curr: number, ver: number): boolean { return !curr || !ver || curr !== ver; }
    private maybeQueueItems(curr: number, ver: number, cat: number, opts: number[]) {
        if (this.compareVersions(curr, ver)) this.push(new IntelliCenterConfigRequest(cat, ver, opts));
    }

}
enum ConfigCategories {
    options = 0,
    circuits = 1,
    features = 2,
    schedules = 3,
    pumps = 4,
    remotes = 5,
    circuitGroups = 6,
    chlorinators = 7,
    intellichem = 8,
    valves = 9,
    heaters = 10,
    security = 11,
    general = 12,
    equipment = 13,
    covers = 14
}

