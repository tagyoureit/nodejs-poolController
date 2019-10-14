import * as extend from 'extend';
import { EventEmitter } from 'events';
import { SystemBoard, byteValueMap, byteValueMaps, ConfigQueue, ConfigRequest, CircuitCommands, FeatureCommands, ChemistryCommands, PumpCommands, BodyCommands, ScheduleCommands, HeaterCommands } from './SystemBoard';
import { PoolSystem, Body, Schedule, Pump, ConfigVersion, sys, Heater, ICircuitGroup, LightGroupCircuit, CircuitGroupCircuit, LightGroup } from '../Equipment';
import { Protocol, Outbound, Message, Response } from '../comms/messages/Messages';
import { conn } from '../comms/Comms';
import { logger } from '../../logger/Logger';
import { state, ChlorinatorState, LightGroupState } from '../State';
export class IntelliCenterBoard extends SystemBoard {
    public needsConfigChanges: boolean = false;
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
            [12, { name: 'solarpref', desc: 'Solar Preferred' }]
        ]);
        this.valueMaps.scheduleDays = new byteValueMap([
            [1, { name: 'mon', desc: 'Monday', dow: 1 }],
            [2, { name: 'tue', desc: 'Tuesday', dow: 2 }],
            [3, { name: 'wed', desc: 'Wednesday', dow: 3 }],
            [4, { name: 'thu', desc: 'Thursday', dow: 4 }],
            [5, { name: 'fri', desc: 'Friday', dow: 5 }],
            [6, { name: 'sat', desc: 'Saturday', dow: 6 }],
            [7, { val: 7, name: 'sun', desc: 'Sunday', dow: 0 }]
        ]);
        this.valueMaps.scheduleDays.transform = function (byte) {
            let days = [];
            let b = byte & 0x007F;
            for (let bit = 6; bit >= 0; bit--) {
                if ((byte & (1 << bit)) > 0) days.push(extend(true, {}, this.get(bit + 1)));
            }
            return { val: b, days: days };
        };
        this.valueMaps.virtualCircuits = new byteValueMap([
            [237, { name: 'heatBoost', desc: 'Heat Boost' }],
            [238, { name: 'heatEnable', desc: 'Heat Enable' }],
            [239, { name: 'pumpSpeedUp', desc: 'Pump Speed +' }],
            [240, { name: 'pumpSpeedDown', desc: 'Pump Speed -' }],
            [244, { name: 'poolHeater', desc: 'Pool Heater' }],
            [245, { name: 'spaHeater', desc: 'Spa Heater' }],
            [246, { name: 'freeze', desc: 'Freeze' }],
            [247, { name: 'poolSpa', desc: 'Pool/Spa' }],
            [248, { name: 'solarHeat', desc: 'Solar Heat' }],
            [251, { name: 'heater', desc: 'Heater' }],
            [252, { name: 'solar', desc: 'Solar' }],
            [255, { name: 'poolHeatEnable', desc: 'Pool Heat Enable' }]
        ]);
        this.equipmentIds.features.start = 129;
        this.equipmentIds.circuitGroups.start = 193;
        this.equipmentIds.virtualCircuits.start = 237;
    }
    private _configQueue: IntelliCenterConfigQueue = new IntelliCenterConfigQueue();
    public circuits: IntelliCenterCircuitCommands = new IntelliCenterCircuitCommands(this);
    public features: IntelliCenterFeatureCommands = new IntelliCenterFeatureCommands(this);
    public chemistry: IntelliCenterChemistryCommands = new IntelliCenterChemistryCommands(this);
    public bodies: IntelliCenterBodyCommands = new IntelliCenterBodyCommands(this);
    public pumps: IntelliCenterPumpCommands = new IntelliCenterPumpCommands(this);
    public schedules: IntelliCenterScheduleCommands = new IntelliCenterScheduleCommands(this);
    public heaters: IntelliCenterHeaterCommands = new IntelliCenterHeaterCommands(this);
    public checkConfiguration() {
        this.needsConfigChanges = true;
        // Send out a message to the outdoor panel that we need info about
        // our current configuration.
        console.log('Checking IntelliCenter configuration...');
        const out: Outbound = Outbound.createMessage(228, [0], 5, new Response(15, 16, 164, [], 164));
        conn.queueSendMessage(out);
    }
    public requestConfiguration(ver: ConfigVersion) {
        if (this.needsConfigChanges) {
            logger.info(`Requesting IntelliCenter configuration`);
            this._configQueue.queueChanges(ver);
            this.needsConfigChanges = false;
        }
        else {
            sys.configVersion.chlorinators = ver.chlorinators;
            sys.configVersion.circuitGroups = ver.circuitGroups;
            sys.configVersion.circuits = ver.circuits;
            sys.configVersion.covers = ver.covers;
            sys.configVersion.equipment = ver.equipment;
            sys.configVersion.systemState = ver.systemState;
            sys.configVersion.features = ver.features;
            sys.configVersion.general = ver.general;
            sys.configVersion.heaters = ver.heaters;
            sys.configVersion.intellichem = ver.intellichem;
            sys.configVersion.options = ver.options;
            sys.configVersion.pumps = ver.pumps;
            sys.configVersion.remotes = ver.remotes;
            sys.configVersion.schedules = ver.schedules;
            sys.configVersion.security = ver.security;
            sys.configVersion.valves = ver.valves;
        }
    }
    public stopAsync() { this._configQueue.close(); }
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
    public _processing: boolean = false;
    public _newRequest: boolean = false;
    public _failed: boolean = false;
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
            else this._failed = true;
        }
        if (!this.curr && this.queue.length > 0) this.curr = this.queue.shift();
        if (!this.curr) {
            // There never was anything for us to do. We will likely never get here.
            state.status = 1;
            state.emitControllerChange();
            return;
        } else
            state.status = sys.board.valueMaps.controllerStatus.transform(2, this.percent);
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
            // RKS: Acks can sometimes conflict if there is another panel at the plugin address
            // this used to send a 30 Ack when it received its response but it appears that is
            // any other panel is awake at the same address it may actually collide with it
            // as both boards are processing at the same time and sending an outbound ack.
            const out: Outbound = new Outbound(
                Protocol.Broadcast,
                Message.pluginAddress,
                15, 222,
                [this.curr.category, itm], 5,
                new Response(16, 15, 30,
                    [this.curr.category, itm],
                    undefined,
                    function (msgOut) { self.processNext(msgOut); })
            );
            setTimeout(conn.queueSendMessage, 50, out);
        } else {
            // Now that we are done check the configuration a final time.  If we have anything outstanding
            // it will get picked up.
            state.status = 1;
            this.curr = null;
            this._processing = false;
            if (this._failed) setTimeout(function () { sys.checkConfiguration(); }, 100);
        }
        // Notify all the clients of our processing status.
        state.emitControllerChange();
    }
    public queueChanges(ver: ConfigVersion) {
        let curr: ConfigVersion = sys.configVersion;
        
        if (this._processing) {
            if (curr.hasChanges(ver)) this._newRequest = true;
            return;
        }
        this._processing = true;
        this._failed = false;
        let self = this;
        if (!curr.hasChanges(ver)) return;
        sys.configVersion.lastUpdated = new Date();
        // Tell the system we are loading.
        state.status = sys.board.valueMaps.controllerStatus.transform(2, 0);
        this.maybeQueueItems(curr.equipment, ver.equipment, ConfigCategories.equipment, [0, 1, 2, 3]);
        this.maybeQueueItems(curr.options, ver.options, ConfigCategories.options, [0, 1]);
        if (this.compareVersions(curr.circuits, ver.circuits)) {
            let req = new IntelliCenterConfigRequest(ConfigCategories.circuits, ver.circuits, [0, 1, 2],
                function (req: IntelliCenterConfigRequest) {
                    // Only add in the items that we need.
                    req.fillRange(3, Math.min(Math.ceil(sys.equipment.maxCircuits / 2) + 3, 24));
                    req.fillRange(26, 29);
                });
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
                if (sys.circuitGroups.length + sys.lightGroups.length > 0) {
                    let len = sys.circuitGroups.length + sys.lightGroups.length;
                    req.fillRange(0, len); // Circuits
                    req.fillRange(16, len + 16); // Group names and delay
                    if (len > 0) req.fillRange(34, 35);  // Egg timer and colors
                    if (len > 1) req.fillRange(36, Math.min(36 + len, 50)); // Colors
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
                    if (sys.heaters.length > 0) req.fillRange(5, Math.min(Math.ceil(sys.heaters.length / 2) + 5, 12)); // Heater names
                    req.fillRange(13, 14);
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
        this.maybeQueueItems(curr.systemState, ver.systemState, ConfigCategories.systemState, [0]);
        logger.info(`Queued ${this.remainingItems} configuration items`);
        if (this.remainingItems > 0) setTimeout(function () { self.processNext(); }, 50);
        else {
            this._processing = false;
            if (this._newRequest) {
                this._newRequest = false;
                setTimeout(() => { sys.board.checkConfiguration(); }, 250);
            }
            state.status = 1;
            state.equipment.shared = sys.equipment.shared;
            state.equipment.model = sys.equipment.model;
            state.equipment.controllerType = sys.controllerType;
            state.equipment.maxBodies = sys.equipment.maxBodies;
            state.equipment.maxCircuits = sys.equipment.maxCircuits;
            state.equipment.maxValves = sys.equipment.maxValves;
            state.equipment.maxSchedules = sys.equipment.maxSchedules;
        }
        state.emitControllerChange();
        //this._needsChanges = false;
        //this.data.controllerType = this.controllerType;
    }
    private compareVersions(curr: number, ver: number): boolean { return !curr || !ver || curr !== ver; }
    private maybeQueueItems(curr: number, ver: number, cat: number, opts: number[]) {
        if (this.compareVersions(curr, ver)) this.push(new IntelliCenterConfigRequest(cat, ver, opts));
    }

}
class IntelliCenterCircuitCommands extends CircuitCommands {
    public board: IntelliCenterBoard;
    public setLightGroupColors(group: LightGroup) {
        let grp = sys.lightGroups.getItemById(group.id);
        let arrOut = this.createLightGroupMessages(grp);
        // Set all the info in the messages.
        for (let i = 0; i < 16; i++) {
            let circuit = i < group.circuits.length ? group.circuits.getItemByIndex(i) : null;
            arrOut[0].payload[i + 6] = circuit ? circuit.circuit - 1 : 255;
            arrOut[0].payload[i + 22] = circuit ? circuit.swimDelay || 0 : 0;
            arrOut[1].payload[i + 3] = circuit ? circuit.color || 0 : 255;
            arrOut[2].payload[i + 3] = circuit ? circuit.color || 0 : 0;
        }
        arrOut[arrOut.length - 1].onSuccess = (msg) => {
            if (!msg.failed) {
                grp.circuits.clear();
                for (let i = 0; i < group.circuits.length; i++) {
                    let circuit = group.circuits.getItemByIndex(i);
                    grp.circuits.add({ id: i, circuit: circuit.circuit, color: circuit.color, position: i, swimDelay: circuit.swimDelay });
                }
                let sgrp = state.lightGroups.getItemById(group.id);
                sgrp.hasChanged = true; // Say we are dirty but we really are pure as the driven snow.
                state.emitEquipmentChanges();
            }
        };
        for (let i = 0; i < arrOut.length; i++)
            conn.queueSendMessage(arrOut[i]);
    }
    public sequenceLightGroup(id: number, operation: string) {
        let sgroup = state.lightGroups.getItemById(id);
        let nop = sys.board.valueMaps.intellibriteActions.getValue(operation);
        if (nop > 0) {
            let out = this.createCircuitStateMessage(id, true);
            // There are two bits on each byte that deterime the operation.  These start on byte 28
            let ndx = id - sys.board.equipmentIds.circuitGroups.start;
            let byteNdx = Math.ceil(ndx / 4);
            let bitNdx = ((ndx - (byteNdx * 4)) * 2);
            let byte = out.payload[28 + byteNdx];
            switch (nop) {
                case 1: // Sync
                    byte &= ~(3 << bitNdx);
                    break;
                case 2: // Color Set
                    byte &= ~(1 << bitNdx);
                    break;
                case 3: // Color Swim
                    byte &= ~(1 << bitNdx);
                    break;
            }
            out.payload[28 + byteNdx] = byte;
            out.onSuccess = (msg) => {
                if (!msg.failed) {
                    sgroup.action = nop;
                    state.emitEquipmentChanges();
                }
            };
            conn.queueSendMessage(out);
        }
        state.emitEquipmentChanges();
    }
    public getLightThemes(type: number): any[] {
        switch (type) {
            case 5: // Intellibrite
            case 6: // Globrite
            case 8: // Magicstream
            case 10: // ColorCascade
                return sys.board.valueMaps.lightThemes.toArray();
            default:
                return [];
        }
    }
    public setCircuitState(id: number, val: boolean) {
        let circ = state.circuits.getInterfaceById(id);
        let out = this.createCircuitStateMessage(id, val);
        out.onSuccess = (msg: Outbound) => {
            if (!msg.failed) {
                circ.isOn = val;
                state.emitEquipmentChanges();
            }
        };
        conn.queueSendMessage(out);
    }
    private setLightGroupTheme(id: number, theme: number) {
        let group = sys.lightGroups.getItemById(id);
        let sgroup = state.lightGroups.getItemById(id);
        let arrOut = this.createLightGroupMessages(group);
        arrOut[0].payload[4] = (theme << 2) + 1;
        arrOut[arrOut.length - 1].onSuccess = (msg) => {
            if (!msg.failed) {
                group.lightingTheme = theme;
                sgroup.lightingTheme = theme;
                state.emitEquipmentChanges();
            }
        };
        for (let i = 0; i < arrOut.length; i++)
            conn.queueSendMessage(arrOut[i]);
    }
    public setLightTheme(id: number, theme: number) {
        if (sys.board.equipmentIds.circuitGroups.isInRange(id))
            // Redirect here for now as we will need to do some work
            // on the default.
            this.setLightGroupTheme(id, theme);
        else {
            let circuit = sys.circuits.getInterfaceById(id);
            let cstate = state.circuits.getInterfaceById(id);
            let out = Outbound.createMessage(168, [1, 0, id - 1, circuit.type, circuit.freeze ? 1 : 0, circuit.showInFeatures ? 1 : 0,
                theme, Math.floor(circuit.eggTimer / 60), circuit.eggTimer - ((Math.floor(circuit.eggTimer) / 60) * 60), 0],
                0, undefined,
                (msg) => {
                    if (!msg.failed) {
                        circuit.lightingTheme = theme;
                        cstate.lightingTheme = theme;
                        if (!cstate.isOn) this.setCircuitState(id, true);
                        state.emitEquipmentChanges();
                    }
                }
            );
            out.appendPayloadString(circuit.name, 16);
            conn.queueSendMessage(out);
        }
    }
    public createLightGroupMessages(group: ICircuitGroup): Outbound[] {
        let arr: Outbound[] = [];
        // Create the first message.
        //[255, 0, 255][165, 63, 15, 16, 168, 40][6, 0, 0, 1, 41, 0, 4, 6, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12, 0][16, 20]
        let out = Outbound.createMessage(168, [6, 0, group.id - sys.board.equipmentIds.circuitGroups.start, group.type,
            typeof group.lightingTheme !== 'undefined' && group.lightingTheme ? (group.lightingTheme << 2) + 1 : 0, 0,
            255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,  // Circuits
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,  // Swim Delay
            Math.floor(group.eggTimer / 60), group.eggTimer - ((Math.floor(group.eggTimer) / 60) * 60)]);
        arr.push(out);
        for (let i = 0; i < group.circuits.length; i++) {
            // Set all the circuit info.
            let circuit = group.circuits.getItemByIndex(i);
            out.payload[i + 6] = circuit.circuit - 1;
            if(group.type === 1) out.payload[i + 22] = (circuit as LightGroupCircuit).swimDelay ;
        }
        // Create the second message
        //[255, 0, 255][165, 63, 15, 16, 168, 35][6, 1, 0, 10, 10, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 80, 111, 111, 108, 32, 76, 105, 103, 104, 116, 115, 0, 0, 0, 0, 0][20, 0]
        out = Outbound.createMessage(168, [6, 1, group.id - sys.board.equipmentIds.circuitGroups.start,
            255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255 // Colors
        ]);
        out.appendPayloadString(group.name, 16);
        arr.push(out);
        if (group.type === 1) {
            let lg = group as LightGroup;
            for (let i = 0; i < group.circuits.length; i++)
                out.payload[i + 3] = 10; // Really don't know what this is.  Perhaps it is some indicator for color/swim/sync.
        }
        // Create the third message
        //[255, 0, 255][165, 63, 15, 16, 168, 19][6, 2, 0, 16, 48, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][2, 6]
        out = Outbound.createMessage(168, [6, 2, group.id - sys.board.equipmentIds.circuitGroups.start,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0  // Colors
        ]);
        if (group.type === 1) {
            let lg = group as LightGroup;
            for (let i = 0; i < group.circuits.length; i++)
                out.payload[i + 3] = lg.circuits.getItemByIndex(i).color;
        }
        arr.push(out);
        return arr;
    }
    public createCircuitStateMessage(id?: number, isOn?: boolean): Outbound {
        let out = Outbound.createMessage(168, [15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 1], 3);
        let circuitId = sys.board.equipmentIds.circuits.start;
        for (let i = 1; i <= state.data.circuits.length; i++) {
            let circuit = state.circuits.getItemById(circuitId++);
            let ndx = Math.floor((i - 1) / 8);
            let byte = out.payload[ndx + 3];
            let bit = (i - 1) - (ndx * 8);
            if (circuit.id === id) byte = isOn ? byte = byte | (1 << bit) : byte;
            else if (circuit.isOn) byte = byte | (1 << bit);
            out.payload[ndx + 3] = byte;
        }
        let featureId = sys.board.equipmentIds.features.start;
        for (let i = 1; i <= state.data.features.length; i++) {
            let feature = state.features.getItemById(featureId++);
            let ndx = Math.floor((i - 1) / 8);
            let byte = out.payload[ndx + 9];
            let bit = (i - 1) - (ndx * 8);
            if (feature.id === id) byte = isOn ? byte = byte | (1 << bit) : byte;
            else if (feature.isOn) byte = byte | (1 << bit);
            out.payload[ndx + 9] = byte;
        }
        let groupId = sys.board.equipmentIds.circuitGroups.start;
        for (let i = 1; i <= state.circuitGroups.length + state.lightGroups.length; i++) {
            let grp = state.circuitGroups.getInterfaceById(groupId++);
            let ndx = Math.floor((i - 1) / 8);
            let byte = out.payload[ndx + 13];
            let bit = (i - 1) - (ndx * 8);
            if (grp.id === id) byte = isOn ? byte = byte | (1 << bit) : byte;
            else if (grp.isOn) byte = byte | (1 << bit);
            out.payload[ndx + 13] = byte;

            // Now calculate out the sync/set/swim operations.
            if (grp.dataName === 'lightGroup') {
                let lg = grp as LightGroupState;
                if (lg.action !== 0) {
                    let ndx = lg.id - sys.board.equipmentIds.circuitGroups.start;
                    let byteNdx = Math.ceil(ndx / 4);
                    let bitNdx = ((ndx - (byteNdx * 4)) * 2);
                    let byte = out.payload[28 + byteNdx];
                    switch (lg.action) {
                        case 1: // Sync
                            byte &= ~(3 << bitNdx);
                            break;
                        case 2: // Color Set
                            byte &= ~(2 << bitNdx);
                            break;
                        case 3: // Color Swim
                            byte &= ~(1 << bitNdx);
                            break;
                    }
                    out.payload[28 + byteNdx] = byte;
                }
            }
        }
        return out;
    }
    public setDimmerLevel(id: number, level: number) {
        let circuit = sys.circuits.getItemById(id);
        let cstate = state.circuits.getItemById(id);
        let out = Outbound.createMessage(168, [1, 0, id - 1, circuit.type, circuit.freeze ? 1 : 0, circuit.showInFeatures ? 1 : 0,
            level, Math.floor(circuit.eggTimer / 60), circuit.eggTimer - ((Math.floor(circuit.eggTimer) / 60) * 60), 0],
            3, new Response(16, Message.pluginAddress, 1, [168], null, function (msg) {
                if (!msg.failed) {
                    circuit.level = level;
                    cstate.level = level;
                    cstate.isOn = true;
                    state.emitEquipmentChanges();
                }
            }));
        out.appendPayloadString(circuit.name, 16);
        conn.queueSendMessage(out);
        if (!cstate.isOn) {
            // If the circuit is off we need to turn it on.
            this.setCircuitState(id, true);
        }
    }

}
class IntelliCenterFeatureCommands extends FeatureCommands {
    public board: IntelliCenterBoard;
    public setFeatureState(id, val) { this.board.circuits.setCircuitState(id, val); }
    public setGroupStates() { } // Do nothing and let IntelliCenter do it.
}
class IntelliCenterChemistryCommands extends ChemistryCommands {
    public setChlor(cstate: ChlorinatorState, poolSetpoint: number = cstate.poolSetpoint, spaSetpoint: number = cstate.spaSetpoint, superChlorHours: number = cstate.superChlorHours, superChlor: boolean = cstate.superChlor) {
        let out = Outbound.createMessage(168, [7, 0, cstate.id - 1, cstate.body, 1, poolSetpoint, spaSetpoint, superChlor ? 1 : 0, superChlorHours, 0, 1], 3,
            new Response(16, Message.pluginAddress, 1, [168]));
        conn.queueSendMessage(out);
        super.setChlor(cstate, poolSetpoint, spaSetpoint, superChlorHours);
    }
}
class IntelliCenterPumpCommands extends PumpCommands {
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
                        outName.payload[i * 2 + 3] = pump.minSpeed - Math.floor(pump.minFlow / 256) * 256;
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
    public setPump(pump: Pump, obj?: any) {
        super.setPump(pump, obj);
        let msgs: Outbound[] = this.createPumpConfigMessages(pump);
        for (let i = 0; i < msgs.length; i++){
            conn.queueSendMessage(msgs[i]);
        }
        // RG: do we want to emit these here or wait for them to be set by the controller
        //sys.emitEquipmentChange();
        //sys.pumps.emitEquipmentChange();
    }
}
class IntelliCenterBodyCommands extends BodyCommands {
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
                , 0, 0, 0, 100, 0, 0, 0, 0, 0, 0], 0, undefined,
            (msg) => {
                if (!msg.failed) {
                    body.heatMode = mode;
                    state.temps.bodies.getItemById(body.id).heatMode = mode;
                    state.emitEquipmentChanges();
                }
            });
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
                , 0, 100, 0, 0, 0, 0, 0, 0], 0, undefined,
            (msg) => {
                if (!msg.failed) {
                    body.setPoint = setPoint;
                    state.temps.bodies.getItemById(body.id).setPoint = setPoint;
                    state.emitEquipmentChanges();
                }
            });
        conn.queueSendMessage(out);
    }
}
class IntelliCenterScheduleCommands extends ScheduleCommands {
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
        let csched = state.schedules.getItemById(sched.id, true);
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
            ],
            0
        );
        out.onSuccess = (msg) => {
            csched.startTime = sched.startTime;
            csched.endTime = sched.endTime;
            csched.circuit = sched.circuit;
            csched.heatSetpoint = sched.heatSetpoint;
            csched.heatSource = sched.heatSource;
            csched.scheduleDays = (sched.runOnce & 128) > 0 ? sched.runOnce : sched.scheduleDays;
            csched.scheduleType = sched.runOnce;
            state.emitEquipmentChanges();
        };
        conn.queueSendMessage(out); // Send it off in a letter to yourself.
    }
}
class IntelliCenterHeaterCommands extends HeaterCommands {
    private createHeaterConfigMessage(heater: Heater): Outbound {
        let out = Outbound.createMessage(
            168, [10, 0, heater.id, heater.type, heater.body, heater.differentialTemp, heater.startTempDelta, heater.stopTempDelta, heater.coolingEnabled ? 1 : 0
                , heater.address,
                //, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 // Name
                heater.efficiencyMode, heater.maxBoostTemp, heater.economyTime], 0);
        out.insertPayloadString(11, heater.name, 16);
        return out;
    }
    public setHeater(heater: Heater, obj?: any) {
        super.setHeater(heater, obj);
        let out = this.createHeaterConfigMessage(heater);
        conn.queueSendMessage(out);
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
    covers = 14,
    systemState = 15
}

