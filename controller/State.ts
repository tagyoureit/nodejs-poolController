/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of1
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
import * as extend from 'extend';
import * as fs from 'fs';
import * as path from 'path';
import { setTimeout } from 'timers';
import * as util from 'util';
import { logger } from '../logger/Logger';
import { webApp } from '../web/Server';
import { ControllerType, Timestamp, utils, Heliotrope } from './Constants';
import { sys, Chemical, ChemController } from './Equipment';
import { versionCheck } from '../config/VersionCheck';
import { EquipmentStateMessage } from './comms/messages/status/EquipmentStateMessage';
import { DataLogger, DataLoggerEntry, IDataLoggerEntry } from '../logger/DataLogger';
import { delayMgr } from './Lockouts';

export class State implements IState {
    statePath: string;
    data: any;
    _dirtyList: DirtyStateCollection = new DirtyStateCollection();
    protected _lastUpdated: Date;
    private _isDirty: boolean;
    private _timerDirty: NodeJS.Timeout;
    protected _dt: Timestamp;
    protected _startTime: Timestamp;
    protected _controllerType: ControllerType;
    protected onchange = (obj, fn) => {
        const handler = {
            get(target, property, receiver) {
                const val = Reflect.get(target, property, receiver);
                if (typeof val === 'function') return val.bind(receiver);
                if (typeof (val) === 'object' && val !== null) {
                    if (util.types.isProxy(val) || util.types.isDate(val) || util.types.isBoxedPrimitive(val))
                        return val;
                    return new Proxy(val, handler);
                }
                return val;
            },
            set(target, property, value, receiver) {
                if (property !== 'lastComm' && Reflect.get(target, property, receiver) !== value) {
                    fn();
                }
                return Reflect.set(target, property, value, receiver);
            },
            deleteProperty(target, property) {
                if (property in target) {
                    delete target[property];
                }
                return true;
            }
        };
        return new Proxy(obj, handler);
    };
    constructor() { this.statePath = path.posix.join(process.cwd(), '/data/poolState.json'); }
    public heliotrope: Heliotrope;
    public get dirty(): boolean { return this._isDirty; }
    public set dirty(val) {
        var self = this;
        if (val !== this._isDirty) {
            this._isDirty = val;
            if (this._timerDirty) {
                clearTimeout(this._timerDirty);
                this._timerDirty = null;
            }
            if (this._isDirty) this._timerDirty = setTimeout(function () { self.persist(); }, 3000);
        }
    }
    public persist() {
        this._isDirty = false;
        var self = this;
        Promise.resolve()
            .then(() => {
                fs.writeFileSync(self.statePath, JSON.stringify(self.data, undefined, 2));
            })
            .catch(function (err) { if (err) logger.error('Error writing pool state %s %s', err, self.statePath); });
    }
    public async readLogFile(logFile: string): Promise<string[]> {
        try {
            let logPath = path.join(process.cwd(), '/logs');
            if (!fs.existsSync(logPath)) fs.mkdirSync(logPath);
            logPath += (`/${logFile}`);
            let lines = [];
            if (fs.existsSync(logPath)) {
                let buff = fs.readFileSync(logPath);
                lines = buff.toString().split('\n');
            }
            return lines;
        } catch (err) { logger.error(err); }
    }
    public async logData(logFile: string, data: any) {
        try {
            let logPath = path.join(process.cwd(), '/logs');
            if (!fs.existsSync(logPath)) fs.mkdirSync(logPath);
            logPath += (`/${logFile}`);
            let lines = [];
            if (fs.existsSync(logPath)) {
                let buff = fs.readFileSync(logPath);
                lines = buff.toString().split('\n');
            }
            if (typeof data === 'object')
                lines.unshift(JSON.stringify(data));
            else
                lines.unshift(data.toString());
            fs.writeFileSync(logPath, lines.join('\n'));
        } catch (err) { logger.error(err); }
    }
    public getState(section?: string): any {
        // todo: getState('time') returns an array of chars.  Needs no be fixed.
        //let state:any = {};
        let obj: any = this;

        if (typeof section === 'undefined' || section === 'all') {
            var _state: any = this.controllerState;
            _state.temps = this.temps.getExtended();
            _state.equipment = this.equipment.getExtended();
            _state.pumps = this.pumps.getExtended();
            _state.valves = this.valves.getExtended();
            _state.heaters = this.heaters.getExtended();
            _state.chlorinators = this.chlorinators.getExtended();
            _state.circuits = this.circuits.getExtended();
            _state.features = this.features.getExtended();
            _state.circuitGroups = this.circuitGroups.getExtended();
            _state.lightGroups = this.lightGroups.getExtended();
            _state.virtualCircuits = this.virtualCircuits.getExtended();
            _state.covers = this.covers.getExtended();
            _state.filters = this.filters.getExtended();
            _state.schedules = this.schedules.getExtended();
            _state.chemControllers = this.chemControllers.getExtended();
            _state.delays = delayMgr.serialize();
            return _state;
        }
        else {
            if (typeof this[section] !== 'undefined' && typeof this[section].getExtended === 'function')
                return this[section].getExtended();
            else
                if (typeof this.data[section] !== 'object')
                    // return object so browsers don't complain
                    return { [section]: this.data[section] };
                else if (Array.isArray(this.data[section]))
                    return extend(true, [], this.data[section] || []);
                else
                    return extend(true, {}, this.data[section] || {});
        }
    }
    public async stopAsync() {
        try {
            if (this._timerDirty) clearTimeout(this._timerDirty);
            this.persist();
            if (sys.controllerType === ControllerType.Virtual) {
                for (let i = 0; i < state.temps.bodies.length; i++) {
                    state.temps.bodies.getItemByIndex(i).isOn = false;
                }
                for (let i = 0; i < state.circuits.length; i++) {
                    state.circuits.getItemByIndex(i).isOn = false;
                }
                for (let i = 0; i < state.features.length; i++) {
                    state.features.getItemByIndex(i).isOn = false;
                }
            }
            logger.info('State process shut down');
        } catch (err) { logger.error(`Error shutting down state process: ${err.message}`); }
    }
    private _emitTimerDirty: NodeJS.Timeout;
    private _hasChanged = false;
    private get hasChanged() { return this._hasChanged; }
    private set hasChanged(val: boolean) {
        // RSG: 7/4/2020 - added this because it is now a "lazy" emit.  
        // If emitControllerChange isn't called right away this will call the emit fn after 3s.
        // Previously, this would not happen every minute when the time changed.
        this._hasChanged = val;
        var self = this;
        if (val !== this._hasChanged) {
            clearTimeout(this._emitTimerDirty);
            this._emitTimerDirty = null;
        }
        if (this._hasChanged) { this._emitTimerDirty = setTimeout(function () { self.emitControllerChange(); }, 3000) }
    }
    public get controllerState() {
        var self = this;
        return {
            systemUnits: sys.board.valueMaps.systemUnits.transform(sys.general.options.units),
            startTime: self.data.startTime || '',
            time: self.data.time || '',
            // body: self.data.body || {},
            valve: self.data.valve || 0,
            //delay: typeof self.data.delay === 'undefined' ? sys.board.valueMaps.delay.transformByName('nodelay') : self.data.delay,
            delay: self.data.delay || {},
            // adjustDST: self.data.adjustDST || false,
            batteryVoltage: self.data.batteryVoltage || 0,
            status: self.data.status || {},
            mode: self.data.mode || {},
            appVersion: sys.appVersion || '',
            appVersionState: self.appVersion.get(true) || {},
            clockMode: sys.board.valueMaps.clockModes.transform(sys.general.options.clockMode) || {},
            clockSource: sys.board.valueMaps.clockSources.transformByName(sys.general.options.clockSource) || {},
            controllerType: sys.controllerType,
            model: sys.equipment.model,
            sunrise: self.data.sunrise || '',
            sunset: self.data.sunset || '',
            alias: sys.general.alias,
            freeze: utils.makeBool(self.data.freeze),
            valveMode: self.data.valveMode || {},
        };
    }
    public emitAllEquipmentChanges() {
        // useful for setting initial states of external clients like MQTT, SmartThings, Hubitat, etc
        state.temps.hasChanged = true;
        state.equipment.hasChanged = true;
        for (let i = 0; i < state.circuits.length; i++) {
            state.circuits.getItemByIndex(i).hasChanged = true;
        }
        for (let i = 0; i < state.features.length; i++) {
            state.features.getItemByIndex(i).hasChanged = true;
        }
        for (let i = 0; i < state.temps.bodies.length; i++) {
            state.temps.bodies.getItemByIndex(i).hasChanged = true;
        }
        for (let i = 0; i < state.circuits.length; i++) {
            state.circuits.getItemByIndex(i).hasChanged = true;
        }
        for (let i = 0; i < state.pumps.length; i++) {
            state.pumps.getItemByIndex(i).hasChanged = true;
        }
        for (let i = 0; i < state.valves.length; i++) {
            state.valves.getItemByIndex(i).hasChanged = true;
        }
        for (let i = 0; i < state.heaters.length; i++) {
            state.heaters.getItemByIndex(i).hasChanged = true;
        }
        for (let i = 0; i < state.chlorinators.length; i++) {
            state.chlorinators.getItemByIndex(i).hasChanged = true;
        }
        for (let i = 0; i < state.circuitGroups.length; i++) {
            state.circuitGroups.getItemByIndex(i).hasChanged = true;
        }
        for (let i = 0; i < state.lightGroups.length; i++) {
            state.lightGroups.getItemByIndex(i).hasChanged = true;
        }
        for (let i = 0; i < state.virtualCircuits.length; i++) {
            state.virtualCircuits.getItemByIndex(i).hasChanged = true;
        }
        for (let i = 0; i < state.covers.length; i++) {
            state.covers.getItemByIndex(i).hasChanged = true;
        }
        for (let i = 0; i < state.filters.length; i++) {
            state.filters.getItemByIndex(i).hasChanged = true;
        }
        for (let i = 0; i < state.schedules.length; i++) {
            state.schedules.getItemByIndex(i).hasChanged = true;
        }
        for (let i = 0; i < state.chemControllers.length; i++) {
            state.chemControllers.getItemByIndex(i).hasChanged = true;
        }
        state.emitEquipmentChanges();
    }
    public emitEquipmentChanges() {
        if (typeof (webApp) !== 'undefined' && webApp) { this._dirtyList.emitChanges(); }
    }
    public emitControllerChange() {
        var self = this;
        if (typeof (webApp) !== 'undefined' && webApp) {
            if (self.hasChanged) {
                self.hasChanged = false;
                webApp.emitToClients('controller', self.controllerState);
            }
        }
    }
    public get time(): Timestamp { return this._dt; }
    public get mode(): number { return typeof (this.data.mode) !== 'undefined' ? this.data.mode.val : -1; }
    public set mode(val: number) {
        let m = sys.board.valueMaps.panelModes.transform(val);
        if (m.val !== this.mode) {
            this.data.mode = m;
            this.hasChanged = true;
        }
    }
    public get valveMode(): number { return typeof this.data.valveMode !== 'undefined' ? this.data.valveMode.val : 0; }
    public set valveMode(val: number) {
        let m = sys.board.valueMaps.valveModes.transform(val);
        if (m.val !== this.valveMode) {
            this.data.valveMode = m;
            this.hasChanged = true;
        }
    }
    public get freeze(): boolean { return this.data.freeze === true; }
    public set freeze(val: boolean) {
        if (this.data.freeze !== val) {
            this.data.freeze = val;
            this.hasChanged = true;
        }
    }
    public get status() { return typeof (this.data.status) !== 'undefined' ? this.data.status.val : -1; }
    public set status(val) {
        if (typeof (val) === 'number') {
            if (this.status !== val) {
                this.data.status = sys.board.valueMaps.controllerStatus.transform(val);
                this.hasChanged = true;
            }
        }
        else if (typeof val !== 'undefined' && typeof val.val !== 'undefined') {
            if (this.status !== val.val || this.status.percent !== val.percent) {
                this.data.status = val;
                this.hasChanged = true;
            }
        }
    }
    public get valve(): number { return this.data.valve; }
    public set valve(val: number) {
        if (this.data.valve !== val) {
            this.data.valve = val;
            this.hasChanged = true;
        }
    }
    public get delay(): number { return typeof this.data.delay !== 'undefined' ? this.data.delay.val : -1; }
    public set delay(val: number) {
        if (this.delay !== val) {
            this.data.delay = sys.board.valueMaps.delay.transform(val);
            this.hasChanged = true;
        }
    }
    public get batteryVoltage(): number { return this.data.batteryVoltage; }
    public set batteryVoltage(val: number) {
        if (this.data.batteryVoltage !== val) {
            this.data.batteryVoltage = val;
        }
    }
    public get isInitialized(): boolean { return typeof (this.data.status) !== 'undefined' && this.data.status.val !== 0; }
    public init() {
        console.log(`Init state for Pool Controller`);
        var sdata = this.loadFile(this.statePath, {});
        sdata = extend(true, { mode: { val: -1 }, temps: { units: { val: 0, name: 'F', desc: 'Fahrenheit' } } }, sdata);
        if (typeof sdata.temps !== 'undefined' && typeof sdata.temps.bodies !== 'undefined') {
            EqStateCollection.removeNullIds(sdata.temps.bodies);
        }
        EqStateCollection.removeNullIds(sdata.schedules);
        EqStateCollection.removeNullIds(sdata.features);
        EqStateCollection.removeNullIds(sdata.circuits);
        EqStateCollection.removeNullIds(sdata.pumps);
        EqStateCollection.removeNullIds(sdata.chlorinators);
        EqStateCollection.removeNullIds(sdata.valves);
        EqStateCollection.removeNullIds(sdata.heaters);
        EqStateCollection.removeNullIds(sdata.covers);
        EqStateCollection.removeNullIds(sdata.circuitGroups);
        EqStateCollection.removeNullIds(sdata.lightGroups);
        EqStateCollection.removeNullIds(sdata.remotes);
        EqStateCollection.removeNullIds(sdata.chemControllers);
        EqStateCollection.removeNullIds(sdata.filters);
        var self = this;
        let pnlTime = typeof sdata.time !== 'undefined' ? new Date(sdata.time) : new Date();
        if (isNaN(pnlTime.getTime())) pnlTime = new Date();
        this._dt = new Timestamp(pnlTime);
        this._dt.milliseconds = 0;
        this.data = sdata;
        //this.onchange(state, function () { self.dirty = true; });
        this._dt.emitter.on('change', function () {
            self.data.time = self._dt.format();
            self.hasChanged = true;
            self.heliotrope.date = self._dt.toDate();
            self.heliotrope.longitude = sys.general.location.longitude;
            self.heliotrope.latitude = sys.general.location.latitude;
            let times = self.heliotrope.calculatedTimes;
            self.data.sunrise = times.isValid ? Timestamp.toISOLocal(times.sunrise) : '';
            self.data.sunset = times.isValid ? Timestamp.toISOLocal(times.sunset) : '';
            versionCheck.checkGitRemote();
        });
        this.status = 0; // Initializing
        this.equipment = new EquipmentState(this.data, 'equipment');
        this.equipment.controllerType = this._controllerType;
        this.temps = new TemperatureState(this.data, 'temps');
        this.pumps = new PumpStateCollection(this.data, 'pumps');
        this.valves = new ValveStateCollection(this.data, 'valves');
        this.heaters = new HeaterStateCollection(this.data, 'heaters');
        this.circuits = new CircuitStateCollection(this.data, 'circuits');
        this.features = new FeatureStateCollection(this.data, 'features');
        this.chlorinators = new ChlorinatorStateCollection(this.data, 'chlorinators');
        this.schedules = new ScheduleStateCollection(this.data, 'schedules');
        this.circuitGroups = new CircuitGroupStateCollection(this.data, 'circuitGroups');
        this.lightGroups = new LightGroupStateCollection(this.data, 'lightGroups');
        this.virtualCircuits = new VirtualCircuitStateCollection(this.data, 'virtualCircuits');
        this.chemControllers = new ChemControllerStateCollection(this.data, 'chemControllers');
        this.covers = new CoverStateCollection(this.data, 'covers');
        this.filters = new FilterStateCollection(this.data, 'filters');
        this.comms = new CommsState();
        this.heliotrope = new Heliotrope();
        this.appVersion = new AppVersionState(this.data, 'appVersion');
        this.data.startTime = Timestamp.toISOLocal(new Date());
        versionCheck.checkGitLocal();
    }
    public resetData() {
        this.circuitGroups.clear();
        this.lightGroups.clear();
        this.circuits.clear();
        this.temps.clear();
        this.chlorinators.clear();
        this.covers.clear();
        this.equipment.clear();
        this.features.clear();
        this.data.general = {};
        this.heaters.clear();
        this.pumps.clear();
        this.schedules.clear();
        this.valves.clear();
        this.virtualCircuits.clear();
        this.filters.clear();
        this.chemControllers.clear();
    }
    public equipment: EquipmentState;
    public temps: TemperatureState;
    public pumps: PumpStateCollection;
    public valves: ValveStateCollection;
    public heaters: HeaterStateCollection;
    public circuits: CircuitStateCollection;
    public features: FeatureStateCollection;
    public chlorinators: ChlorinatorStateCollection;
    public schedules: ScheduleStateCollection;
    public circuitGroups: CircuitGroupStateCollection;
    public lightGroups: LightGroupStateCollection;
    public virtualCircuits: VirtualCircuitStateCollection;
    public covers: CoverStateCollection;
    public filters: FilterStateCollection;
    public chemControllers: ChemControllerStateCollection;
    public comms: CommsState;
    public appVersion: AppVersionState;

    // This performs a safe load of the state file.  If the file gets corrupt or actually does not exist
    // it will not break the overall system and allow hardened recovery.
    private loadFile(path: string, def: any) {
        let state = def;
        if (fs.existsSync(path)) {
            try {
                state = JSON.parse(fs.readFileSync(path, 'utf8') || '{}');
            }
            catch (ex) {
                state = def;
            }
        }
        return state;
    }
    public cleanupState() {
        // Chem Controllers
        this.chemControllers.cleanupState();
        // Valves
        this.valves.cleanupState();
        // Heaters
        this.heaters.cleanupState();
        // Features
        this.features.cleanupState();
        // Circuits
        this.circuits.cleanupState();
        // CircuitGroups
        this.circuitGroups.cleanupState();
        // Light Groups
        this.lightGroups.cleanupState();
        // Chlorinators
        this.chlorinators.cleanupState();
        // Pumps
        this.pumps.cleanupState();
        // Bodies
        this.temps.cleanupState();
    }
}
interface IState {
    equipment: EquipmentState;
    temps: TemperatureState;
    pumps: PumpStateCollection;
    valves: ValveStateCollection;
    heaters: HeaterStateCollection;
    circuits: CircuitStateCollection;
    features: FeatureStateCollection;
    chlorinators: ChlorinatorStateCollection;
    schedules: ScheduleStateCollection;
    circuitGroups: CircuitGroupStateCollection;
    virtualCircuits: VirtualCircuitStateCollection;
    chemControllers: ChemControllerStateCollection;
    filters: FilterStateCollection;
    comms: CommsState;
}
export interface ICircuitState {
    id: number;
    type: number;
    name: string;
    nameId?: number;
    isOn: boolean;
    startTime?: Timestamp;
    endTime: Timestamp;
    lightingTheme?: number;
    action?: number;
    emitEquipmentChange();
    get(bCopy?: boolean);
    showInFeatures?: boolean;
    isActive?: boolean;
    startDelay?: boolean;
    stopDelay?: boolean;
    manualPriorityActive?: boolean;
    dataName?: string;
}

interface IEqStateCreator<T> { ctor(data: any, name: string, parent?): T; }
class EqState implements IEqStateCreator<EqState> {
    public dataName: string;
    public data: any;
    protected _hasChanged: boolean = false;
    public get hasChanged(): boolean { return this._hasChanged; }
    public set hasChanged(val: boolean) {
        // If we are not already on the dirty list add us.        
        if (!this._hasChanged && val) {
            state._dirtyList.maybeAddEqState(this);
        }
        this._hasChanged = val;
    }
    ctor(data, name?: string): EqState { return new EqState(data, name); }
    constructor(data, name?: string) {
        if (typeof (name) !== 'undefined') {
            if (typeof (data[name]) === 'undefined') data[name] = {};
            this.data = data[name];
            this.dataName = name;
            this.initData();
        }
        else {
            this.data = data;
            this.initData();
        }
    }
    public initData() { }
    public emitEquipmentChange() {
        if (typeof (webApp) !== 'undefined' && webApp) {
            if (this.hasChanged) this.emitData(this.dataName, this.getEmitData());
            this.hasChanged = false;
            state._dirtyList.removeEqState(this);
        }
    }
    public getEmitData() { return this.data; }
    public emitData(name: string, data: any) { webApp.emitToClients(name, data); }
    protected setDataVal(name, val, persist?: boolean): any {
        if (this.data[name] !== val) {
            this.data[name] = val;
            if (typeof persist === 'undefined' || persist) {
                this.hasChanged = true;
                state.dirty = true;
            }
        }
        else if (typeof persist !== 'undefined' && persist) this.hasChanged = true;
        // Added for chaining.
        return this.data[name];
    }
    public get(bCopy?: boolean): any {
        if (typeof bCopy === 'undefined' || !bCopy) return this.data;
        let copy = extend(true, {}, this.data);
        if (typeof this.dataName !== 'undefined') copy.equipmentType = this.dataName;
        // RSG 7/10/2020 - nested object were still being returned as proxy; changed to parse/stringify
        return JSON.parse(JSON.stringify(copy));
    }
    public clear() {
        for (let prop in this.data) {
            if (Array.isArray(this.data[prop])) this.data[prop].length = 0;
            else this.data[prop] = undefined;
        }
    }
    public isEqual(eq: EqState) {
        if (eq.dataName === this.dataName) {
            if ('id' in eq === true)
                return this.data.id === eq.data.id;
            else
                return true;
        }
        return false;
    }
    public getExtended(): any { return this.get(true); }
}
class ChildEqState extends EqState implements IEqStateCreator<EqState> {
    private _pmap = new WeakSet();
    //private _dataKey = { id: 'parent' };
    constructor(data: any, name: string, parent) {
        super(data, name);
        this._pmap['parent'] = parent;
    }
    public get hasChanged(): boolean { return this._hasChanged; }
    public set hasChanged(val: boolean) {
        // Bubble up to the parent state.
        if (val) {
            let parent = this.getParent();
            if (typeof parent !== 'undefined' && typeof parent['hasChanged'] !== 'undefined') {
                parent.hasChanged = true;
            }
        }
    }
    public getParent() { return typeof this._pmap !== 'undefined' ? this._pmap['parent'] : undefined; }
}
class EqStateCollection<T> {
    protected data: any;
    constructor(data: [], name: string) {
        if (typeof (data[name]) === 'undefined') data[name] = [];
        this.data = data[name];
    }
    public static removeNullIds(data: any) {
        if (typeof data !== 'undefined' && Array.isArray(data) && typeof data.length === 'number') {
            for (let i = data.length - 1; i >= 0; i--) {
                if (typeof data[i].id !== 'number') {
                    console.log(`Removing ${data[i].id}-${data[i].name}`);
                    data.splice(i, 1);
                }
                else if (typeof data[i].id === 'undefined' || isNaN(data[i].id)) {
                    console.log(`Removing isNaN ${data[i].id}-${data[i].name}`);
                    data.splice(i, 1);
                }
            }
        }
    }
    public getItemById(id: number, add?: boolean, data?: any): T {
        for (let i = 0; i < this.data.length; i++)
            if (typeof this.data[i].id !== 'undefined' && this.data[i].id === id) {
                return this.createItem(this.data[i]);
            }
        if (typeof add !== 'undefined' && add)
            return this.add(data || { id: id });
        return this.createItem(data || { id: id });
    }
    public getItemByIndex(ndx: number, add?: boolean): T {
        return (this.data.length > ndx) ? this.createItem(this.data[ndx]) : (typeof (add) !== 'undefined' && add) ? this.add(this.createItem({ id: ndx + 1 })) : this.createItem({ id: ndx + 1 });
    }
    public removeItemById(id: number): T {
        let rem: T = null;
        for (let i = this.data.length - 1; i >= 0; i--) {
            if (typeof (this.data[i].id) !== 'undefined' && this.data[i].id === id) {
                rem = this.data.splice(i, 1);
            }
        }
        return rem;
    }
    public removeItemByIndex(ndx: number) {
        return this.data.splice(ndx, 1);
    }

    public createItem(data: any): T { return new EqState(data) as unknown as T; }
    public clear() { this.data.length = 0; }
    public get length(): number { return typeof (this.data) !== 'undefined' ? this.data.length : 0; }
    public add(obj: any): T { this.data.push(obj); return this.createItem(obj); }
    public sortByName() {
        this.sort((a, b) => {
            return a.name > b.name ? 1 : a.name !== b.name ? -1 : 0;
        });
    }
    public sortById() {
        this.sort((a, b) => {
            return a.id > b.id ? 1 : a.id !== b.id ? -1 : 0;
        });
    }
    public sort(fn: (a, b) => number) { this.data.sort(fn); }
    public get(bCopy?: boolean) { return typeof bCopy === 'undefined' || !bCopy ? this.data : JSON.parse(JSON.stringify(this.data)) };// extend(true, {}, this.data); }
    public getExtended(): any {
        let arr = [];
        for (let i = 0; i < this.length; i++) {
            let itm = (this.createItem(this.data[i]) as unknown) as EqState;
            if (typeof itm.getExtended === 'function') arr.push(itm.getExtended());
            else arr.push(this.data[i]);
        }
        return arr;
    }
    // Finds an item and returns undefined if it doesn't exist.
    public find(f: (value: any, index?: number, obj?: any) => boolean): T {
        let itm = this.data.find(f);
        if (typeof itm !== 'undefined') return this.createItem(itm);
    }
    public exists(f: (value: any, index?: number, obj?: any) => boolean): boolean {
        let itm = this.find(f);
        return typeof itm === 'object';
    }
    public toArray() {
        let arr = [];
        if (typeof this.data !== 'undefined') {
            for (let i = 0; i < this.data.length; i++) {
                arr.push(this.createItem(this.data[i]));
            }
        }
        return arr;
    }
}
class DirtyStateCollection extends Array<EqState> {
    public maybeAddEqState(eqItem: EqState): boolean {
        if (!this.eqStateExists(eqItem)) {
            this.push(eqItem);
            return true;
        }
        return false;
    }
    public eqStateExists(eqItem: EqState): boolean {
        for (let i = this.length - 1; i >= 0; i--) {
            if (eqItem.isEqual(this[i])) return true;
        }
        return false;
    }
    public findEqState(eqItem: EqState): EqState {
        let itm = this.find((eq, ndx, eqList): boolean => {
            return eq.isEqual(eqItem);
        });
        return itm;
    }
    public emitChanges() {
        while (this.length > 0) {
            let eqItem = this.shift();
            eqItem.emitEquipmentChange();
            eqItem.hasChanged = false;
        }
    }
    public removeEqState(eqItem: EqState) {
        // We need to go through all the items on the dirty list for now.  In the future we
        // may not need to look at them all since the global emitter will clear the list for us.
        for (let i = this.length - 1; i >= 0; i--) {
            let itm = this[i];
            if (itm.isEqual(eqItem)) this.splice(i, 1);
        }
    }
}

export class EquipmentState extends EqState {
    public initData() {
        if (typeof this.data.messages === 'undefined') this.data.messages = [];
    }
    public get controllerType(): string { return this.data.controllerType; }
    public set controllerType(val: string) { this.setDataVal('controllerType', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get model(): string { return this.data.model; }
    public set model(val: string) { this.setDataVal('model', val); }
    public get single(): boolean { return this.data.single; }
    public set single(val: boolean) { this.setDataVal('single', val); }
    public get shared(): boolean { return this.data.shared; }
    public set shared(val: boolean) { this.setDataVal('shared', val); }
    public get dual(): boolean { return this.data.dual; }
    public set dual(val: boolean) { this.setDataVal('dual', val); }

    public get maxValves(): number { return this.data.maxValves; }
    public set maxValves(val: number) { this.setDataVal('maxValves', val); }
    public get maxCircuits(): number { return this.data.maxCircuits; }
    public set maxCircuits(val: number) { this.setDataVal('maxCircuits', val); }
    public get maxFeatures(): number { return this.data.maxFeatures; }
    public set maxFeatures(val: number) { this.setDataVal('maxFeatures', val); }
    public get maxBodies(): number { return this.data.maxBodies; }
    public set maxBodies(val: number) { this.setDataVal('maxBodies', val); }
    public get maxSchedules(): number { return this.data.maxSchedules; }
    public set maxSchedules(val: number) { this.setDataVal('maxSchedules', val); }
    public get maxPumps(): number { return this.data.maxPumps; }
    public set maxPumps(val: number) { this.setDataVal('maxPumps', val); }
    public get maxHeaters(): number { return this.data.maxHeaters; }
    public set maxHeaters(val: number) { this.setDataVal('maxHeaters', val); }
    public get maxCircuitGroups(): number { return this.data.maxCircuitGroups; }
    public set maxCircuitGroups(val: number) { this.setDataVal('maxCircuitGroups', val); }
    public get maxLightGroups(): number { return this.data.maxLightGroups; }
    public set maxLightGroups(val: number) { this.setDataVal('maxLightGroups', val); }
    public get messages(): EquipmentMessages { return new EquipmentMessages(this.data, 'messages'); }
    // This could be extended to include all the expansion panels but not sure why.
    public getExtended() {
        let obj = this.get(true);
        obj.softwareVersion = sys.equipment.controllerFirmware || "";
        obj.bootLoaderVersion = sys.equipment.bootloaderVersion || "";
        return obj;
    }

}
// Equipment messages work like this.  While other equipment items are unique by id, these are unique by code.  This
// means that at any given point there should only be one message per code.  Messages should always be referenced by
// code.  As a result the codes have meaning and should be encoded as such.  That way messages related to a specific topic can be
// removed while preserving any messages previously set.  Adding new messages or removing messages always results in
// resorting of the message array so care should be taken when referings the collection by index.

// Message Encoding Structure:
// In the message encoding structure the severity is omitted.  This is on purpose so messages can be promoted and demoted
// in severity while still ensuring proper encoding.  Do not encode severity into the message code.
// Example: HT:1:1
// EQ = Category - Each code should reference the specific category for the error.
//      EQ = Equipment General
//      VL = Valves
//      HT = Heater
//      PMP = Pump
//      MISC = Miscellaneous
//      SYS = System
//      ...etc.  Standardizing on the equipment category will allow searching and filtering messages within the array
// 1 = Id of the equipment.  If this is not applicable then the id should be 0.
// 1 = The message identifier.  This allows uniqueness within the message categories.  Care should be taken to ensure this is unique
//     within the category and equipment id.
export class EquipmentMessages extends EqStateCollection<EquipmentMessage> {
    public createItem(data: any): EquipmentMessage { return new EquipmentMessage(data, undefined, this); }
    public getItemByCode(code: string, add?: boolean, data?: any): EquipmentMessage {
        for (let i = 0; i < this.data.length; i++)
            if (typeof this.data[i].code !== 'undefined' && this.data[i].code === code) {
                return this.createItem(this.data[i]);
            }
        if (typeof add !== 'undefined' && add)
            return this.add(data || { code: code });
        return this.createItem(data || { code: code });
    }
    public getItemByIndex(ndx: number, add?: boolean): EquipmentMessage {
        return (this.data.length > ndx) ? this.createItem(this.data[ndx]) : (typeof (add) !== 'undefined' && add) ? this.add(this.createItem({ code: `UNK:0:${ndx + 1}` })) : this.createItem({ code: `UNK:0:${ndx + 1}` });
    }
    public removeItemByCode(code: string): EquipmentMessage {
        let rem: EquipmentMessage;
        for (let i = this.data.length - 1; i >= 0; i--) {
            if (typeof (this.data[i].code) !== 'undefined' && this.data[i].code === code) {
                rem = this.data.splice(i, 1);
            }
        }
        return typeof rem !== 'undefined' ? new EquipmentMessage(rem, undefined, undefined) : undefined;
    }
    // For lack of a better term category includes the equipment identifier if supplied.
    public removeItemByCategory(category: string) {
        let rem: EquipmentMessage[] = [];
        let cmr = EquipmentMessage.parseMessageCode(category);
        for (let i = this.data.length - 1; i >= 0; i--) {
            if (typeof (this.data[i].code) !== 'undefined') {
                let cm = EquipmentMessage.parseMessageCode(this.data.code);
                if (cm.category === cmr.category) {
                    if (typeof cmr.equipmentId === 'undefined' || cm.equipmentId === cmr.equipmentId) {
                        if (typeof cmr.messageId === 'undefined' || cm.messageId === cmr.messageId) {
                            let data = this.data.splice(i, 1);
                            rem.push(new EquipmentMessage(data, undefined, undefined));
                        }
                    }
                }
            }
        }
        return rem;
    }
    public setMessageByCode(code: string, severity: string | number, message: string): EquipmentMessage {
        let msg = this.getItemByCode(code, true);
        msg.severity = sys.board.valueMaps.eqMessageSeverities.encode(severity, 0);
        msg.message = message;
        return msg;
    }
}
export class EquipmentMessage extends ChildEqState {
    public initData() {
        if (typeof this.data.createDate === 'undefined') this.createDate = new Date();
        else this._createDate = new Date(this.data.createDate);
        if (isNaN(this._createDate.getTime())) this._createDate = new Date();
    }
    private _createDate: Date = new Date();
    public static parseMessageCode(code: string): { category?: string, equipmentId?: number, messageId?: number } {
        let c: { category?: string, equipmentId?: number, messageId?: number } = {};
        let arr = code.split(':');
        c.category = arr.length > 0 ? arr[0] : 'UNK';
        c.equipmentId = arr.length > 1 ? parseInt(arr[1], 10) : undefined;
        c.messageId = arr.length > 2 ? parseInt(arr[2], 10) : undefined;
        return c;
    }
    public get createDate(): Date { return this._createDate; }
    public set createDate(val: Date) { this._createDate = val; this._saveCreateDate(); }
    private _saveCreateDate() { this.setDataVal('createDate', Timestamp.toISOLocal(this.createDate)); }
    public get severity(): number { return typeof (this.data.severity) !== 'undefined' ? this.data.severity.val : 0; }
    public set severity(val: number) {
        if (this.severity !== val) {
            this.data.type = sys.board.valueMaps.eqMessageSeverities.transform(val);
            this.hasChanged = true;
        }
        this.hasChanged = true;
    }
    public get code(): string { return this.data.code; }
    public set code(val: string) { this.data.code = val; }
    public get message(): string { return this.data.message; }
    public set message(val: string) { this.data.message = val; }
}
export class PumpStateCollection extends EqStateCollection<PumpState> {
    public createItem(data: any): PumpState { return new PumpState(data); }
    public getPumpByAddress(address: number, add?: boolean, data?: any) {
        let pmp = this.find(elem => elem.address === address);
        if (typeof pmp !== 'undefined') return this.createItem(pmp);
        if (typeof add !== 'undefined' && add) return this.add(data || { id: this.data.length + 1, address: address });
        return this.createItem(data || { id: this.data.length + 1, address: address });
    }
    public cleanupState() {
        for (let i = this.data.length - 1; i >= 0; i--) {
            if (isNaN(this.data[i].id)) this.data.splice(i, 1);
            else {
                if (typeof sys.pumps.find(elem => elem.id === this.data[i].id) === 'undefined') this.removeItemById(this.data[i].id);
            }
        }
        let cfg = sys.pumps.toArray();
        for (let i = 0; i < cfg.length; i++) {
            let c = cfg[i];
            let s = this.getItemById(cfg[i].id, true);
            s.type = c.type;
            s.name = c.name;
            if (typeof c.isActive === 'undefined') c.isActive = true;
            s.isActive = c.isActive;
        }
    }
}
export class PumpState extends EqState {
    public dataName: string = 'pump';
    public initData() {
        if (typeof this.data.status === 'undefined') {
            this.data.status = { name: 'ok', desc: 'Ok', val: 0 };
        }
        if (typeof this.data.pumpOnDelay === 'undefined') this.data.pumpOnDelay = false;
    }
    private _pumpOnDelayTimer: NodeJS.Timeout;
    private _threshold = 0.05;
    private exceedsThreshold(origVal: number, newVal: number) {
        return Math.abs((newVal - origVal) / origVal) > this._threshold;
    }
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get address(): number { return this.data.address || this.data.id + 95; }
    public set address(val: number) { this.setDataVal('address', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get rpm(): number { return this.data.rpm; }
    public set rpm(val: number) { this.setDataVal('rpm', val); }
    //public set rpm(val: number) { this.setDataVal('rpm', val, this.exceedsThreshold(this.data.rpm, val)); }
    public get relay(): number { return this.data.relay; }
    public set relay(val: number) { this.setDataVal('relay', val); }
    public get program(): number { return this.data.program; }
    public set program(val: number) { this.setDataVal('program', val); }
    public get watts(): number { return this.data.watts; }
    public set watts(val: number) { this.setDataVal('watts', val); }
    //public set watts(val: number) { this.setDataVal('watts', val, this.exceedsThreshold(this.data.watts, val)); }
    public get flow(): number { return this.data.flow; }
    public set flow(val: number) { this.setDataVal('flow', val); }
    //public set flow(val: number) { this.setDataVal('flow', val, this.exceedsThreshold(this.data.flow, val)); }
    public get mode(): number { return this.data.mode; }
    public set mode(val: number) { this.setDataVal('mode', val); }
    public get driveState(): number { return this.data.driveState; }
    public set driveState(val: number) { this.setDataVal('driveState', val); }
    public get command(): number { return this.data.command; }
    public set command(val: number) { this.setDataVal('command', val); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get ppc(): number { return this.data.ppc; } // I think this is actually the filter % for vf and vsf.  Pump Pressure determines how much backpressure.
    public set ppc(val: number) { this.setDataVal('ppc', val); }
    public get status(): number { return typeof (this.data.status) !== 'undefined' ? this.data.status.val : -1; }
    public set status(val: number) {
        // quick fix for #172
        if (this.status !== val) {
            if (sys.board.valueMaps.pumpTypes.getName(this.type) === 'vsf' && val === 0) {
                this.data.status = { name: 'ok', desc: 'Ok', val: 0 };
            }
            else this.data.status = sys.board.valueMaps.pumpStatus.transform(val);
            this.hasChanged = true;
        }
    }
    public get virtualControllerStatus(): number {
        return typeof (this.data.virtualControllerStatus) !== 'undefined' ? this.data.virtualControllerStatus.val : -1;
    }
    public set virtualControllerStatus(val: number) {
        if (this.virtualControllerStatus !== val) {
            this.data.virtualControllerStatus = sys.board.valueMaps.virtualControllerStatus.transform(val);
            this.hasChanged = true;
        }
    }
    public get targetSpeed(): number { return this.data.targetSpeed; } // used for virtual controller
    public set targetSpeed(val: number) { this.setDataVal('targetSpeed', val); }
    public get type() { return typeof (this.data.type) !== 'undefined' ? this.data.type.val : -1; }
    public set type(val: number) {
        if (this.type !== val) {
            this.data.type = sys.board.valueMaps.pumpTypes.transform(val);
            this.hasChanged = true;
        }
    }
    public get time(): number { return this.data.time; }
    public set time(val: number) { this.setDataVal('time', val, false); }
    public get pumpOnDelay() { return this.data.pumpOnDelay; }
    public set pumpOnDelay(val: boolean) {
        if (val === false) {
            if (typeof this._pumpOnDelayTimer !== 'undefined') clearTimeout(this._pumpOnDelayTimer);
            this._pumpOnDelayTimer = undefined;
        }
        this.setDataVal('pumpOnDelay', val);
    }
    public setPumpOnDelayTimeout(delay: number) {
        this.pumpOnDelay = true;
        logger.info(`Pump ON Delay ${this.name} for ${delay / 1000} seconds`);
        this._pumpOnDelayTimer = setTimeout(() => {
            logger.info(`Pump ON Delay ${this.name} expired`);
            this.pumpOnDelay = false;
        }, delay);
    }
   
    public getExtended() {
        let pump = this.get(true);
        let cpump = sys.pumps.getItemById(pump.id);
        if (typeof (cpump.minSpeed) !== 'undefined') pump.minSpeed = cpump.minSpeed;
        if (typeof (cpump.maxSpeed) !== 'undefined') pump.maxSpeed = cpump.maxSpeed;
        if (typeof (cpump.minFlow) !== 'undefined') pump.minFlow = cpump.minFlow;
        if (typeof (cpump.maxFlow) !== 'undefined') pump.maxFlow = cpump.maxFlow;
        pump.speedStepSize = cpump.speedStepSize;
        pump.flowStepSize = cpump.flowStepSize;
        pump.circuits = [];
        for (let i = 0; i < cpump.circuits.length; i++) {
            let c = cpump.circuits.getItemByIndex(i).get(true);
            c.circuit = state.circuits.getInterfaceById(c.circuit).get(true);
            switch (pump.type.name) {
                case 'vf':
                    c.units = sys.board.valueMaps.pumpUnits.transformByName('gpm');
                    break;
                case 'hwvs':
                case 'vssvrs':
                case 'vs':
                    c.units = sys.board.valueMaps.pumpUnits.transformByName('rpm');
                    break;
                case 'ss':
                case 'ds':
                case 'sf':
                case 'hwrly':
                    c.units = 'undefined';
                    break;
                default:
                    c.units = sys.board.valueMaps.pumpUnits.transform(c.units || 0);
                    break;
            }
            // RKS: 04-08-22 - This is just wrong.  If the user did not define circuits then they should not be sent down and it creates a whole host of issues.
            //if (typeof c.circuit.id === 'undefined' || typeof c.circuit.name === 'undefined') {
            //    // return "blank" circuit if none defined
            //    c.circuit.id = 0;
            //    c.circuit.name = 'Not Used';
            //    if (sys.board.valueMaps.pumpTypes.getName(cpump.type) === 'vf') {
            //        c.units = sys.board.valueMaps.pumpUnits.getValue('gpm');
            //        c.circuit.flow = 0;
            //    }
            //    else {
            //        c.units = sys.board.valueMaps.pumpUnits.getValue('rpm');
            //        c.circuit.speed = 0;
            //    }
            //}
            //c.units = sys.board.valueMaps.pumpUnits.transform(c.units);
            pump.circuits.push(c);
        }
        pump.circuits.sort((a, b) => { return a.id > b.id ? 1 : -1; });
        /*         for (let i = 0; i < cpump.circuits.length; i++) {
                    let c = cpump.circuits.getItemByIndex(i).get(true);
                    c.circuit = state.circuits.getInterfaceById(c.circuit).get(true);
                    c.units = sys.board.valueMaps.pumpUnits.transform(c.units);
                    pump.circuits.push(c);
                } */
        return pump;
    }
}
export class ScheduleStateCollection extends EqStateCollection<ScheduleState> {
    public createItem(data: any): ScheduleState { return new ScheduleState(data); }
}
export class ScheduleState extends EqState {
    constructor(data: any, dataName?: string) { super(data, dataName); }
    public initData() {
        if (typeof this.data.startDate === 'undefined') this._startDate = new Date();
        else this._startDate = new Date(this.data.startDate);
        if (isNaN(this._startDate.getTime())) this._startDate = new Date();
        if (typeof this.data.startTimeType === 'undefined') this.data.startTimeType = sys.board.valueMaps.scheduleTimeTypes.transform(0);
        if (typeof this.data.endTimeType === 'undefined') this.data.endTimeType = sys.board.valueMaps.scheduleTimeTypes.transform(0);
        if (typeof this.data.display === 'undefined') this.data.display = sys.board.valueMaps.scheduleDisplayTypes.transform(0);
    }
    private _startDate: Date = new Date();
    public get startDate(): Date { return this._startDate; }
    public set startDate(val: Date) { this._startDate = val; this._saveStartDate(); }
    private _saveStartDate() {
        if (typeof this._startDate === 'undefined') this._startDate = new Date();
        this.startDate.setHours(0, 0, 0, 0);
        this.setDataVal('startDate', Timestamp.toISOLocal(this.startDate));
    }
    public dataName: string = 'schedule';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get startTime(): number { return this.data.startTime; }
    public set startTime(val: number) { this.setDataVal('startTime', val); }
    public get endTime(): number { return this.data.endTime; }
    public set endTime(val: number) { this.setDataVal('endTime', val); }
    public get circuit(): number { return this.data.circuit; }
    public set circuit(val: number) { this.setDataVal('circuit', val); }
    public get disabled(): boolean { return this.data.disabled; }
    public set disabled(val: boolean) { this.setDataVal('disabled', val); }
    public get scheduleType(): number { return typeof (this.data.scheduleType) !== 'undefined' ? this.data.scheduleType.val : undefined; }
    public set scheduleType(val: number) {
        if (this.scheduleType !== val) {
            this.data.scheduleType = sys.board.valueMaps.scheduleTypes.transform(val);
            this.hasChanged = true;
        }
    }
    public get startTimeType(): number { return typeof (this.data.startTimeType) !== 'undefined' ? this.data.startTimeType.val : -1; }
    public set startTimeType(val: number) {
        if (this.startTimeType !== val) {
            this.data.startTimeType = sys.board.valueMaps.scheduleTimeTypes.transform(val);
            this.hasChanged = true;
        }
    }
    public get endTimeType(): number { return typeof (this.data.endTimeType) !== 'undefined' ? this.data.endTimeType.val : -1; }
    public set endTimeType(val: number) {
        if (this.endTimeType !== val) {
            this.data.endTimeType = sys.board.valueMaps.scheduleTimeTypes.transform(val);
            this.hasChanged = true;
        }
    }
    public get scheduleDays(): number { return typeof (this.data.scheduleDays) !== 'undefined' ? this.data.scheduleDays.val : undefined; }
    public set scheduleDays(val: number) {
        if (this.scheduleDays !== val) {
            this.data.scheduleDays = sys.board.valueMaps.scheduleDays.transform(val);
            this.hasChanged = true;
        }
    }
    public get heatSource(): number { return typeof (this.data.heatSource) !== 'undefined' ? this.data.heatSource.val : undefined; }
    public set heatSource(val: number) {
        if (this.heatSource !== val) {
            this.data.heatSource = sys.board.valueMaps.heatSources.transform(val);
            this.hasChanged = true;
        }
    }
    public get display(): number { return typeof (this.data.display) !== 'undefined' ? this.data.display.val : undefined; }
    public set display(val: number) {
        if (this.display !== val) {
            this.data.display = sys.board.valueMaps.scheduleDisplayTypes.transform(val);
            this.hasChanged = true;
        }
    }

    public get changeHeatSetpoint(): boolean { return this.data.changeHeatSetpoint; }
    public set changeHeatSetpoint(val: boolean) { this.setDataVal('changeHeatSetpoint', val); }
    public get heatSetpoint(): number { return this.data.heatSetpoint; }
    public set heatSetpoint(val: number) { this.setDataVal('heatSetpoint', val); }
    public get coolSetpoint(): number { return this.data.coolSetpoint; }
    public set coolSetpoint(val: number) { this.setDataVal('coolSetpoint', val); }
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) { this.setDataVal('isOn', val); }
    public get manualPriorityActive(): boolean { return this.data.manualPriorityActive; }
    public set manualPriorityActive(val: boolean) { this.setDataVal('manualPriorityActive', val); }
    public getExtended() {
        let sched = this.get(true); // Always operate on a copy.
        //if (typeof this.circuit !== 'undefined')
        sched.circuit = state.circuits.getInterfaceById(this.circuit).get(true);
        //else sched.circuit = {};
        return sched;
    }
    public emitEquipmentChange() {
        // For schedules always emit the complete information
        if (typeof (webApp) !== 'undefined' && webApp) {
            if (this.hasChanged) this.emitData(this.dataName, this.getExtended());
            this.hasChanged = false;
            state._dirtyList.removeEqState(this);
        }
    }
}
export interface ICircuitGroupState {
    id: number;
    type: number;
    name: string;
    nameId?: number;
    endTime: Timestamp;
    isOn: boolean;
    isActive: boolean;
    dataName: string;
    lightingTheme?: number;
    showInFeatures?: boolean;
    manualPriorityActive?: boolean;
    get(bCopy?: boolean);
    emitEquipmentChange();
}
export class CircuitGroupStateCollection extends EqStateCollection<CircuitGroupState> {
    public createItem(data: any): CircuitGroupState { return new CircuitGroupState(data); }
    public getInterfaceById(id: number) {
        let iGroup: ICircuitGroupState = this.getItemById(id, false, { id: id, isActive: false });
        if (iGroup.isActive === false) iGroup = state.lightGroups.getItemById(id, false, { id: id, isActive: false });
        return iGroup;
    }
    public cleanupState() {
        for (let i = this.data.length - 1; i >= 0; i--) {
            if (isNaN(this.data[i].id)) this.data.splice(i, 1);
            else {
                if (typeof sys.circuitGroups.find(elem => elem.id === this.data[i].id) === 'undefined') this.removeItemById(this.data[i].id);
            }
        }
        let cfg = sys.circuitGroups.toArray();
        for (let i = 0; i < cfg.length; i++) {
            let c = cfg[i];
            let s = this.getItemById(cfg[i].id, true);
            s.type = c.type;
            s.name = c.name;
            s.nameId = c.nameId;
            s.showInFeatures = c.showInFeatures;
            s.isActive = c.isActive;
        }

    }
}
export class CircuitGroupState extends EqState implements ICircuitGroupState, ICircuitState {
    public dataName: string = 'circuitGroup';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get nameId(): number { return this.data.nameId; }
    public set nameId(val: number) { this.setDataVal('nameId', val); }
    public get type(): number { return typeof this.data.type !== 'undefined' ? this.data.type.val : 0; }
    public set type(val: number) {
        if (this.type !== val) {
            this.data.type = sys.board.valueMaps.circuitGroupTypes.transform(val);
            this.hasChanged = true;
        }
    }
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) { this.setDataVal('isOn', val); }
    public get endTime(): Timestamp {
        if (typeof this.data.endTime === 'undefined') return undefined;
        return new Timestamp(this.data.endTime);
    }
    public set endTime(val: Timestamp) { typeof val !== 'undefined' ? this.setDataVal('endTime', Timestamp.toISOLocal(val.toDate())) : this.setDataVal('endTime', undefined); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get showInFeatures(): boolean { return typeof this.data.showInFeatures === 'undefined' ? true : this.data.showInFeatures; }
    public set showInFeatures(val: boolean) { this.setDataVal('showInFeatures', val); }
    public get manualPriorityActive(): boolean { return this.data.manualPriorityActive; }
    public set manualPriorityActive(val: boolean) { this.setDataVal('manualPriorityActive', val); }
    public getExtended() {
        let sgrp = this.get(true); // Always operate on a copy.
        if (typeof sgrp.showInFeatures === 'undefined') sgrp.showInFeatures = true;
        let cgrp = sys.circuitGroups.getItemById(this.id);
        sgrp.circuits = [];
        for (let i = 0; i < cgrp.circuits.length; i++) {
            let cgc = cgrp.circuits.getItemByIndex(i).get(true);
            cgc.circuit = state.circuits.getInterfaceById(cgc.circuit).get(true);
            sgrp.circuits.push(cgc);
        }
        return sgrp;
    }
    public emitEquipmentChange() {
        if (typeof (webApp) !== 'undefined' && webApp) {
            if (this.hasChanged) this.emitData(this.dataName, this.getExtended());
            this.hasChanged = false;
            state._dirtyList.removeEqState(this);
        }
    }
    public get(bcopy?: boolean): any {
        let d = super.get(bcopy);
        let cg = sys.circuitGroups.getItemById(this.id);
        if (!cg.isActive) d.isActive = false;
        else d.isActive = undefined;
        return d;
    }

}
export class LightGroupStateCollection extends EqStateCollection<LightGroupState> {
    public createItem(data: any): LightGroupState { return new LightGroupState(data); }
    public cleanupState() {
        for (let i = this.data.length - 1; i >= 0; i--) {
            if (isNaN(this.data[i].id)) this.data.splice(i, 1);
            else {
                if (typeof sys.lightGroups.find(elem => elem.id === this.data[i].id) === 'undefined') this.removeItemById(this.data[i].id);
            }
        }
        let cfg = sys.lightGroups.toArray();
        for (let i = 0; i < cfg.length; i++) {
            let c = cfg[i];
            let s = this.getItemById(cfg[i].id, true);
            s.type = c.type;
            s.name = c.name;
            s.isActive = c.isActive;
        }

    }
}
export class LightGroupState extends EqState implements ICircuitGroupState, ICircuitState {
    public dataName = 'lightGroup';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get action(): number { return typeof this.data.action !== 'undefined' ? this.data.action.val : 0; }
    public set action(val: number) {
        if (this.action !== val || typeof this.data.action === 'undefined') {
            this.data.action = sys.board.valueMaps.circuitActions.transform(val);
            this.hasChanged = true;
        }
    }
    public get type(): number { return typeof this.data.type !== 'undefined' ? this.data.type.val : 0; }
    public set type(val: number) {
        if (this.type !== val) {
            this.data.type = sys.board.valueMaps.circuitGroupTypes.transform(val);
            this.hasChanged = true;
        }
    }
    public get lightingTheme(): number { return typeof this.data.lightingTheme !== 'undefined' ? this.data.lightingTheme.val : 0; }
    public set lightingTheme(val: number) {
        if (this.lightingTheme !== val) {
            this.data.lightingTheme = sys.board.valueMaps.lightThemes.transform(val);
            this.hasChanged = true;
        }
    }
    public get endTime(): Timestamp {
        if (typeof this.data.endTime === 'undefined') return undefined;
        return new Timestamp(this.data.endTime);
    }
    public set endTime(val: Timestamp) { typeof val !== 'undefined' ? this.setDataVal('endTime', Timestamp.toISOLocal(val.toDate())) : this.setDataVal('endTime', undefined); }
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) { this.setDataVal('isOn', val); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get manualPriorityActive(): boolean { return this.data.manualPriorityActive; }
    public set manualPriorityActive(val: boolean) { this.setDataVal('manualPriorityActive', val); }
    public async setThemeAsync(val: number) { return sys.board.circuits.setLightThemeAsync; }
    public getExtended() {
        let sgrp = this.get(true); // Always operate on a copy.
        sgrp.circuits = [];
        if (typeof sgrp.lightingTheme === 'undefined') sgrp.lightingTheme = sys.board.valueMaps.lightThemes.transformByName('white');
        if (typeof sgrp.action === 'undefined') sgrp.action = sys.board.valueMaps.circuitActions.transform(0);
        let cgrp = sys.circuitGroups.getItemById(this.id);
        for (let i = 0; i < cgrp.circuits.length; i++) {
            let lgc = cgrp.circuits.getItemByIndex(i).get(true);
            lgc.circuit = state.circuits.getInterfaceById(lgc.circuit).get(true);
            sgrp.circuits.push(lgc);
        }
        return sgrp;
    }
    public emitEquipmentChange() {
        if (typeof (webApp) !== 'undefined' && webApp) {
            if (this.hasChanged) this.emitData(typeof this.dataName !== 'undefined' ? this.dataName : 'lightGroup', this.getExtended());
            this.hasChanged = false;
            state._dirtyList.removeEqState(this);
        }
    }
}
export class BodyTempStateCollection extends EqStateCollection<BodyTempState> {
    public createItem(data: any): BodyTempState { return new BodyTempState(data); }
    public getBodyIsOn() {
        for (let i = 0; i < this.data.length; i++) {
            if (this.data[i].isOn) return this.createItem(this.data[i]);
        }
        return undefined;
    }
    public getBodyByCircuitId(circuitId: number) {
        let b = this.data.find(x => x.circuit === circuitId);
        if (typeof b === 'undefined') {
            let circ = sys.circuits.getItemById(circuitId);
            // Find our body by circuit function.
            let cfn = sys.board.valueMaps.circuitFunctions.get(circ.type);
            if (typeof cfn.body !== 'undefined') b = this.data.find(x => x.id === cfn.body);
        }
        return typeof b !== 'undefined' ? this.createItem(b) : undefined;
    }
    public cleanupState() {
        for (let i = this.data.length - 1; i >= 0; i--) {
            if (isNaN(this.data[i].id)) this.data.splice(i, 1);
            else {
                if (typeof sys.bodies.find(elem => elem.id === this.data[i].id) === 'undefined') this.removeItemById(this.data[i].id);
            }
        }
        this.sortById();
    }

}
// RKS: This is an interesting object.  We are doing some gymnastics with it to comply
// with type safety.
export class BodyHeaterTypeStateCollection extends EqStateCollection<BodyHeaterTypeState> {
    public createItem(data: any): BodyHeaterTypeState { return new BodyHeaterTypeState(data); }
}
export class BodyHeaterTypeState extends EqState {
    public get typeId(): number { return this.data.typeId; }
    public set typeId(val: number) { this.setDataVal('typeId', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
}
export class BodyTempState extends EqState {
    public dataName = 'bodyTempState';
    public initData() {
        if (typeof this.data.heaterOptions === 'undefined') this.data.heaterOptions = { total: 0 };
        if (typeof this.data.isCovered === 'undefined') this.data.isCovered = false;
        if (typeof this.heaterCooldownDelay === 'undefined') this.data.heaterCooldownDelay = false;
        if (typeof this.data.startDelay === 'undefined') this.data.startDelay = false;
        if (typeof this.data.stopDelay === 'undefined') this.data.stopDelay = false;
        if (typeof this.data.showInDashboard === 'undefined') this.data.showInDashboard = true;
    }
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get circuit(): number { return this.data.circuit; }
    public set circuit(val: number) { this.setDataVal('circuit', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get temp(): number { return this.data.temp; }
    public set temp(val: number) { this.setDataVal('temp', val); }
    public get type(): number { return typeof (this.data.type) !== 'undefined' ? this.data.type.val : -1; }
    public set type(val: number) {
        if (this.type !== val) {
            this.data.type = sys.board.valueMaps.bodyTypes.transform(val);
            this.hasChanged = true;
        }
    }
    public get heatMode(): number { return typeof (this.data.heatMode) !== 'undefined' ? this.data.heatMode.val : -1; }
    public set heatMode(val: number) {
        if (this.heatMode !== val) {
            this.data.heatMode = sys.board.valueMaps.heatModes.transform(val);
            this.hasChanged = true;
        }
    }
    public get heatStatus(): number { return typeof (this.data.heatStatus) !== 'undefined' ? this.data.heatStatus.val : -1; }
    public set heatStatus(val: number) {
        if (this.heatStatus !== val) {
            this.data.heatStatus = sys.board.valueMaps.heatStatus.transform(val);
            this.hasChanged = true;
        }
    }
    public get setPoint(): number { return this.data.setPoint; }
    public set setPoint(val: number) { this.setDataVal('setPoint', val); }
    public get heatSetpoint(): number { return this.data.setPoint; }
    public set heatSetpoint(val: number) { this.setDataVal('setPoint', val); }
    public get coolSetpoint(): number { return this.data.coolSetpoint; }
    public set coolSetpoint(val: number) { this.setDataVal('coolSetpoint', val); }
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) { this.setDataVal('isOn', val); }
    public get startDelay(): boolean { return this.data.startDelay; }
    public set startDelay(val: boolean) { this.setDataVal('startDelay', val); }
    public get stopDelay(): boolean { return this.data.stopDelay; }
    public set stopDelay(val: boolean) { this.setDataVal('stopDelay', val); }
    public get showInDashboard(): boolean { return this.data.showInDashboard; }
    public set showInDashboard(val: boolean) { this.setDataVal('showInDashboard', val); }

    public get isCovered(): boolean { return this.data.isCovered; }
    public set isCovered(val: boolean) { this.setDataVal('isCovered', val); }
    // RKS: Heater cooldown delays force the current valve and body configuration until the
    // heater cooldown expires.  This occurs at the pool level but it is triggered by the heater attached
    // to the body.  Unfortunately, I think we can only detect this condition in Nixie as there really isn't an
    // indicator with Pentair OCPs.  This is triggered in NixieBoard and managed by the delayMgr.
    public get heaterCooldownDelay(): boolean { return this.data.heaterCooldownDelay; }
    public set heaterCooldownDelay(val: boolean) { this.setDataVal('heaterCooldownDelay', val); }
    public emitData(name: string, data: any) { webApp.emitToClients('body', this.data); }
    // RKS: This is a very interesting object because we have a varied object.  Type safety rules should not apply
    // here as the heater types are specific to the installed equipment.  The reason is because it has no meaning without the body and the calculation of it should
    // be performed when the body or heater options change.  However, it shouldn't emit unless
    // there truly is a change but the emit needs to occur at the body temp state level.
    public get heaterOptions(): any { return typeof this.data.heaterOptions === 'undefined' ? this.setDataVal('heaterOptions', { total: 0 }) : this.data.heaterOptions; }
    public set heaterOptions(val: any) {
        // We are doing this simply to maintain the proper automatic emits. We don't want the emit to happen unnecessarily so lets
        // get creative on the object and dirty up the body only when needed.
        let opts = this.heaterOptions;  // Calling this here will make sure we have a data object.  The getter adds it if it doesn't exist.
        for (let s in val) {
            if (opts[s] !== val[s]) {
                opts[s] = val[s];
                this.hasChanged = true;
            }
        }
        // Spin it around and run it the other way and remove properties that are not in the incoming. Theorhetically we could
        // simply set the attribute but we have more control this way.  This also expects that we are doing counts in the
        // output and the setting object must coordinate with this code.
        for (let s in opts) {
            if (typeof val[s] === 'undefined') delete opts[s];
        }
    }
}
export class TemperatureState extends EqState {
    public initData() {
        if (typeof this.data.units === 'undefined') this.data.units = sys.board.valueMaps.tempUnits.transform(0);
    }
    public get waterSensor1(): number { return this.data.waterSensor1; }
    public set waterSensor1(val: number) { this.setDataVal('waterSensor1', val); }
    public get waterSensor2(): number { return this.data.waterSensor2; }
    public set waterSensor2(val: number) { this.setDataVal('waterSensor2', val); }
    public get waterSensor3(): number { return this.data.waterSensor3; }
    public set waterSensor3(val: number) { this.setDataVal('waterSensor3', val); }
    public get waterSensor4(): number { return this.data.waterSensor4; }
    public set waterSensor4(val: number) { this.setDataVal('waterSensor4', val); }
    public get solarSensor1(): number { return this.data.solar; }
    public set solarSensor1(val: number) { this.setDataVal('solar', val); }
    public get solarSensor2(): number { return this.data.solarSensor2; }
    public set solarSensor2(val: number) { this.setDataVal('solarSensor2', val); }
    public get solarSensor3(): number { return this.data.solarSensor3; }
    public set solarSensor3(val: number) { this.setDataVal('solarSensor3', val); }
    public get solarSensor4(): number { return this.data.solarSensor4; }
    public set solarSensor4(val: number) { this.setDataVal('solarSensor4', val); }

    public get bodies(): BodyTempStateCollection { return new BodyTempStateCollection(this.data, 'bodies'); }
    public get air(): number { return this.data.air; }
    public set air(val: number) { this.setDataVal('air', val); }
    public get solar(): number { return this.data.solar; }
    public set solar(val: number) { this.setDataVal('solar', val); }
    public get units(): number { return typeof this.data.units !== 'undefined' ? this.data.units.val : -1; }
    public set units(val: number) {
        if (this.units !== val) {
            this.data.units = sys.board.valueMaps.tempUnits.transform(val);
            this.hasChanged = true;
        }
    }
    public cleanupState() {
        this.bodies.cleanupState();
    }

}
export class HeaterStateCollection extends EqStateCollection<HeaterState> {
    public createItem(data: any): HeaterState { return new HeaterState(data); }
    public cleanupState() {
        for (let i = this.data.length - 1; i >= 0; i--) {
            if (isNaN(this.data[i].id)) {
                logger.info(`Removed Invalid Heater ${this.data[i].id}-${this.data[i].name}`);
                this.data.splice(i, 1);
            }
            else {
                if (typeof sys.heaters.find(elem => elem.id === this.data[i].id) === 'undefined') this.removeItemById(this.data[i].id);
            }
        }
        let cfg = sys.heaters.toArray();
        for (let i = 0; i < cfg.length; i++) {
            let c = cfg[i];
            let s = this.getItemById(cfg[i].id, true);
            s.name = c.name;
            s.type = c.type;
        }
    }
}
export class HeaterState extends EqState {
    public dataName: string = 'heater';
    public initData() {
        if (typeof this.data.startupDelay === 'undefined') this.data.startupDelay = false;
        if (typeof this.data.shutdownDelay === 'undefined') this.data.shutdownDelay = false;
    }
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) {
        if (val !== this.data.isOn) {
            if (val) this.startTime = new Timestamp();
            else this.endTime = new Timestamp();
        }
        this.setDataVal('isOn', val);
    }
    public get startTime(): Timestamp {
        if (typeof this.data.startTime === 'undefined') return undefined;
        return new Timestamp(this.data.startTime);
    }
    public set startTime(val: Timestamp) { typeof val !== 'undefined' ? this.setDataVal('startTime', Timestamp.toISOLocal(val.toDate())) : this.setDataVal('startTime', undefined); }

    public get endTime(): Timestamp {
        if (typeof this.data.endTime === 'undefined') return undefined;
        return new Timestamp(this.data.endTime);
    }
    public set endTime(val: Timestamp) { typeof val !== 'undefined' ? this.setDataVal('endTime', Timestamp.toISOLocal(val.toDate())) : this.setDataVal('endTime', undefined); }

    public get isCooling(): boolean { return this.data.isCooling; }
    public set isCooling(val: boolean) { this.setDataVal('isCooling', val); }
    public get type(): number | any { return typeof this.data.type !== 'undefined' ? this.data.type.val : 0; }
    public set type(val: number | any) {
        if (this.type !== val) {
            this.data.type = sys.board.valueMaps.heaterTypes.transform(val);
            this.hasChanged = true;
        }
    }
    public get commStatus(): number { return this.data.commStatus; }
    public set commStatus(val: number) {
        if (this.commStatus !== val) {
            this.data.commStatus = sys.board.valueMaps.equipmentCommStatus.transform(val);
            this.hasChanged = true;
        }
    }
    public get startupDelay(): boolean { return this.data.startupDelay; }
    public set startupDelay(val: boolean) { this.setDataVal('startupDelay', val); }
    public get shutdownDelay(): boolean { return this.data.shutdownDelay; }
    public set shutdownDelay(val: boolean) { this.setDataVal('shutdownDelay', val); }
    public get bodyId(): number { return this.data.bodyId || 0 }
    public set bodyId(val: number) { this.setDataVal('bodyId', val); }

}
export class FeatureStateCollection extends EqStateCollection<FeatureState> {
    public createItem(data: any): FeatureState { return new FeatureState(data); }
    public async setFeatureStateAsync(id: number, val: boolean) { return sys.board.features.setFeatureStateAsync(id, val); }
    public async toggleFeatureStateAsync(id: number) { return sys.board.features.toggleFeatureStateAsync(id); }
    public cleanupState() {
        for (let i = this.data.length - 1; i >= 0; i--) {
            if (isNaN(this.data[i].id)) this.data.splice(i, 1);
            else {
                if (typeof sys.features.find(elem => elem.id === this.data[i].id) === 'undefined') this.removeItemById(this.data[i].id);
            }
        }
        let cfg = sys.features.toArray();
        for (let i = 0; i < cfg.length; i++) {
            let c = cfg[i];
            let s = this.getItemById(cfg[i].id, true);
            s.type = c.type;
            s.name = c.name;
            s.nameId = c.nameId;
            s.showInFeatures = c.showInFeatures;
        }
    }
}

export class FeatureState extends EqState implements ICircuitState {
    public dataName: string = 'feature';
    public initData() {
        if (typeof this.data.freezeProtect === 'undefined') this.data.freezeProtect = false;
    }
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get nameId(): number { return this.data.nameId; }
    public set nameId(val: number) { this.setDataVal('nameId', val); }
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) { this.setDataVal('isOn', val); }
    public get type() { return typeof this.data.type !== 'undefined' ? this.data.type.val : -1; }
    public set type(val: number) {
        if (this.type !== val) {
            this.data.type = sys.board.valueMaps.featureFunctions.transform(val);
            this.hasChanged = true;
        }
    }
    public get showInFeatures(): boolean { return this.data.showInFeatures; }
    public set showInFeatures(val: boolean) { this.setDataVal('showInFeatures', val); }
    public get endTime(): Timestamp {
        if (typeof this.data.endTime === 'undefined') return undefined;
        return new Timestamp(this.data.endTime);
    }
    public set endTime(val: Timestamp) { typeof val !== 'undefined' ? this.setDataVal('endTime', Timestamp.toISOLocal(val.toDate())) : this.setDataVal('endTime', undefined); }
    // This property will be set if the system has turn this feature on for freeze protection reasons.  We have no way of knowing when Pentair does this but
    // need to know (so we can shut it off) if we have done this.
    public get freezeProtect(): boolean { return this.data.freezeProtect; }
    public set freezeProtect(val: boolean) { this.setDataVal('freezeProtect', val); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get manualPriorityActive(): boolean { return this.data.manualPriorityActive; }
    public set manualPriorityActive(val: boolean) { this.setDataVal('manualPriorityActive', val); }
}
export class VirtualCircuitState extends EqState implements ICircuitState {
    public dataName: string = 'virtualCircuit';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get nameId(): number { return this.data.nameId; }
    public set nameId(val: number) { this.setDataVal('nameId', val); }
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) { this.setDataVal('isOn', val); }
    public get type() { return typeof this.data.type !== 'undefined' ? this.data.type.val : -1; }
    public set type(val: number) {
        if (this.type !== val) {
            this.data.type = sys.board.valueMaps.virtualCircuits.transform(val);
            this.hasChanged = true;
        }
    }
    public get endTime(): Timestamp {
        if (typeof this.data.endTime === 'undefined') return undefined;
        return new Timestamp(this.data.endTime);
    }
    public set endTime(val: Timestamp) { typeof val !== 'undefined' ? this.setDataVal('endTime', Timestamp.toISOLocal(val.toDate())) : this.setDataVal('endTime', undefined); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
}
export class VirtualCircuitStateCollection extends EqStateCollection<VirtualCircuitState> {
    public createItem(data: any): VirtualCircuitState { return new VirtualCircuitState(data); }
}
export class CircuitStateCollection extends EqStateCollection<CircuitState> {
    public createItem(data: any): CircuitState { return new CircuitState(data); }
    public setCircuitStateAsync(id: number, val: boolean): Promise<ICircuitState> { return sys.board.circuits.setCircuitStateAsync(id, val); }
    public async toggleCircuitStateAsync(id: number) { return sys.board.circuits.toggleCircuitStateAsync(id); }
    public async setLightThemeAsync(id: number, theme: number) { return sys.board.circuits.setLightThemeAsync(id, theme); }
    public getInterfaceById(id: number, add?: boolean): ICircuitState {
        let iCircuit: ICircuitState = null;
        if (sys.board.equipmentIds.virtualCircuits.isInRange(id))
            iCircuit = state.virtualCircuits.getItemById(id, add);
        else if (sys.board.equipmentIds.circuitGroups.isInRange(id)) {
            iCircuit = state.circuitGroups.getInterfaceById(id);
        }
        else if (sys.board.equipmentIds.features.isInRange(id))
            iCircuit = state.features.getItemById(id, add);
        else
            iCircuit = state.circuits.getItemById(id, add);
        return iCircuit;
    }
    public cleanupState() {
        for (let i = this.data.length - 1; i >= 0; i--) {
            if (isNaN(this.data[i].id)) this.data.splice(i, 1);
            else {
                if (typeof sys.circuits.find(elem => elem.id === this.data[i].id) === 'undefined') this.removeItemById(this.data[i].id);
            }
        }
        let cfg = sys.circuits.toArray();
        for (let i = 0; i < cfg.length; i++) {
            let c = cfg[i];
            let s = this.getItemById(cfg[i].id, true);
            s.type = c.type;
            s.name = c.name;
            s.nameId = c.nameId;
            s.showInFeatures = c.showInFeatures;
        }

    }
}
export class CircuitState extends EqState implements ICircuitState {
    public dataName = 'circuit';
    public initData() {
        if (typeof this.data.freezeProtect === 'undefined') this.data.freezeProtect = false;
        if (typeof this.data.action === 'undefined') this.data.action = sys.board.valueMaps.circuitActions.transform(0);
        if (typeof this.data.type === 'undefined') this.data.type = sys.board.valueMaps.circuitFunctions.transform(0);
    }
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get nameId(): number { return this.data.nameId; }
    public set nameId(val: number) { this.setDataVal('nameId', val); }
    public get action(): number { return typeof this.data.action !== 'undefined' ? this.data.action.val : 0; }
    public set action(val: number) {
        if (this.action !== val || typeof this.data.action === 'undefined') {
            this.data.action = sys.board.valueMaps.circuitActions.transform(val);
            this.hasChanged = true;
        }
    }
    public get showInFeatures(): boolean { return this.data.showInFeatures; }
    public set showInFeatures(val: boolean) { this.setDataVal('showInFeatures', val); }
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) {
        if (val && !this.data.isOn) this.startTime = new Timestamp();
        else if (!val) this.startTime = undefined;
        this.setDataVal('isOn', val);
    }
    public get type() { return typeof (this.data.type) !== 'undefined' ? this.data.type.val : -1; }
    public set type(val: number) {
        if (this.type !== val) {
            this.data.type = sys.board.valueMaps.circuitFunctions.transform(val);
            this.hasChanged = true;
        }
    }
    public get lightingTheme(): number { return typeof this.data.lightingTheme !== 'undefined' ? this.data.lightingTheme.val : 255; }
    public set lightingTheme(val: number) {
        if (this.lightingTheme !== val) {
            // Force this to undefined when we are a circuit without a theme.
            if (typeof val === 'undefined') this.data.lightingTheme = undefined;
            else this.data.lightingTheme = sys.board.valueMaps.lightThemes.transform(val);
            this.hasChanged = true;
        }
    }
    public get level(): number { return this.data.level; }
    public set level(val: number) { this.setDataVal('level', val); }
    public get commStatus(): number { return this.data.commStatus; }
    public set commStatus(val: number) {
        if (this.commStatus !== val) {
            this.data.commStatus = sys.board.valueMaps.equipmentCommStatus.transform(val);
            this.hasChanged = true;
        }
    }
    public get startTime(): Timestamp {
        if (typeof this.data.startTime === 'undefined') return undefined;
        return new Timestamp(this.data.startTime);
    }
    public set startTime(val: Timestamp) { typeof val !== 'undefined' ? this.setDataVal('startTime', Timestamp.toISOLocal(val.toDate())) : this.setDataVal('startTime', undefined); }

    public get endTime(): Timestamp {
        if (typeof this.data.endTime === 'undefined') return undefined;
        return new Timestamp(this.data.endTime);
    }
    public set endTime(val: Timestamp) { typeof val !== 'undefined' ? this.setDataVal('endTime', Timestamp.toISOLocal(val.toDate())) : this.setDataVal('endTime', undefined); }
    // This property will be set if the system has turn this circuit on for freeze protection reasons.  We have no way of knowing when Pentair does this but
    // need to know (so we can shut it off) if we have done this.
    public get freezeProtect(): boolean { return this.data.freezeProtect; }
    public set freezeProtect(val: boolean) { this.setDataVal('freezeProtect', val); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    // The properties below are for delays and lockouts.  Manual or scheduled
    // actions cannot be performed when the flags below are set.
    public get startDelay(): boolean { return this.data.startDelay; }
    public set startDelay(val: boolean) { this.setDataVal('startDelay', val); }
    public get stopDelay(): boolean { return this.data.stopDelay; }
    public set stopDelay(val: boolean) { this.setDataVal('stopDelay', val); }
    public get lockoutOn(): boolean { return this.data.lockoutOn; }
    public set lockoutOn(val: boolean) { this.setDataVal('lockoutOn', val); }
    public get lockoutOff(): boolean { return this.data.lockoutOff; }
    public set lockoutOff(val: boolean) { this.setDataVal('lockoutOff', val); }
    public get manualPriorityActive(): boolean { return this.data.manualPriorityActive; }
    public set manualPriorityActive(val: boolean) { this.setDataVal('manualPriorityActive', val); }
}
export class ValveStateCollection extends EqStateCollection<ValveState> {
    public createItem(data: any): ValveState { return new ValveState(data); }
    public cleanupState() {
        for (let i = this.data.length - 1; i >= 0; i--) {
            if (isNaN(this.data[i].id)) this.data.splice(i, 1);
            else {
                if (typeof sys.valves.find(elem => elem.id === this.data[i].id) === 'undefined') this.removeItemById(this.data[i].id);
            }
        }
        let cfg = sys.valves.toArray();
        for (let i = 0; i < cfg.length; i++) {
            let c = cfg[i];
            let s = this.getItemById(cfg[i].id, true);
            s.name = c.name;
            s.type = c.type;
        }
    }
}
export class ValveState extends EqState {
    public dataName: string = 'valve';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get type(): number { return typeof this.data.type !== 'undefined' ? this.data.type.val : -1; }
    public set type(val: number) {
        if (this.type !== val) {
            this.data.type = sys.board.valueMaps.valveTypes.transform(val);
            this.hasChanged = true;
        }
    }
    public get isDiverted(): boolean { return utils.makeBool(this.data.isDiverted); }
    public set isDiverted(val: boolean) { this.setDataVal('isDiverted', val); }
    public get commStatus(): number { return this.data.commStatus; }
    public set commStatus(val: number) {
        if (this.commStatus !== val) {
            this.data.commStatus = sys.board.valueMaps.equipmentCommStatus.transform(val);
            this.hasChanged = true;
        }
    }
    public getExtended(): any {
        let valve = sys.valves.getItemById(this.id);
        let vstate = this.get(true);
        if (valve.circuit !== 256) vstate.circuit = state.circuits.getInterfaceById(valve.circuit).get(true);
        vstate.isIntake = utils.makeBool(valve.isIntake);
        vstate.isReturn = utils.makeBool(valve.isReturn);
        // vstate.isVirtual = utils.makeBool(valve.isVirtual);
        vstate.isActive = utils.makeBool(valve.isActive);
        vstate.pinId = valve.pinId;
        return vstate;
    }
    public emitEquipmentChange() {
        if (typeof (webApp) !== 'undefined' && webApp) {
            if (this.hasChanged) this.emitData(this.dataName, this.getExtended());
            this.hasChanged = false;
            state._dirtyList.removeEqState(this);
        }
    }
}
export class CoverStateCollection extends EqStateCollection<CoverState> {
    public createItem(data: any): CoverState { return new CoverState(data); }
}
export class CoverState extends EqState {
    public dataName: string = 'cover';
    public initData() {
        if (typeof this.data.isClosed === 'undefined') this.data.isClosed = false;
    }
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get isClosed(): boolean { return this.data.isClosed; }
    public set isClosed(val: boolean) { this.setDataVal('isClosed', val); }
}
export class ChlorinatorStateCollection extends EqStateCollection<ChlorinatorState> {
    public superChlor: { id: number, lastDispatch: number, reference: number }[] = [];
    public getSuperChlor(id: number): { id: number, lastDispatch: number, reference: number } {
        let sc = this.superChlor.find(elem => id === elem.id);
        if (typeof sc === 'undefined') {
            sc = { id: id, lastDispatch: 0, reference: 0 };
            this.superChlor.push(sc);
        }
        return sc;
    }
    public createItem(data: any): ChlorinatorState { return new ChlorinatorState(data); }
    public cleanupState() {
        for (let i = this.data.length - 1; i >= 0; i--) {
            if (isNaN(this.data[i].id)) this.data.splice(i, 1);
            else {
                if (typeof sys.chlorinators.find(elem => elem.id === this.data[i].id) === 'undefined') this.removeItemById(this.data[i].id);
            }
        }
        let cfg = sys.chlorinators.toArray();
        for (let i = 0; i < cfg.length; i++) {
            let c = cfg[i];
            let s = this.getItemById(cfg[i].id, true);
            s.type = c.type;
            s.model = c.model;
            s.name = c.name;
            s.isActive = c.isActive;
        }
    }
}
export class ChlorinatorState extends EqState {
    public initData() {
        if (typeof this.data.disabled === 'undefined') this.data.disabled = false;
        // This has been deprecated because Nixie is now in control of all "virtual" chlorinators.
        if (typeof this.data.virtualControllerStatus !== 'undefined') delete this.data.virtualControllerStatus;
    }
    public dataName: string = 'chlorinator';
    // The lastComm property has a fundamental flaw.  Although, the structure is
    // not dirtied where the emitter sends out a message on each lastComm, the persistence proxy is
    // triggered by this. We need to find a way that the property change does not trigger persistence.
    // RG - Fixed with "false" persistence flag. 2/10/2020
    public get lastComm(): number { return this.data.lastComm; }
    public set lastComm(val: number) { this.setDataVal('lastComm', val, false); }
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get currentOutput(): number { return this.data.currentOutput || 0; }
    public set currentOutput(val: number) { this.setDataVal('currentOutput', val); }
    public get setPointForCurrentBody() {
        let body = state.temps.bodies.getBodyIsOn();
        if (typeof body !== 'undefined') {
            if (body.circuit === 1) return this.spaSetpoint;
            return this.poolSetpoint;
        }
        return 0;
    }
    public get targetOutput(): number { return this.data.targetOutput; }
    public set targetOutput(val: number) { this.setDataVal('targetOutput', val); }
    public get status(): number {
        return typeof (this.data.status) !== 'undefined' ? this.data.status.val : -1;
    }
    public set status(val: number) {
        if (this.status !== val) {
            this.data.status = sys.board.valueMaps.chlorinatorStatus.transform(val);
            this.hasChanged = true;
        }
    }
    public get type(): number { return typeof (this.data.type) !== 'undefined' ? this.data.type.val : -1; }
    public set type(val: number) {
        if (this.type !== val) {
            this.data.type = sys.board.valueMaps.chlorinatorType.transform(val);
            this.hasChanged = true;
        }
    }
    public get model(): number { return typeof (this.data.model) !== 'undefined' ? this.data.model.val : 0; }
    public set model(val: number) {
        if (this.model !== val) {
            this.data.model = sys.board.valueMaps.chlorinatorModel.transform(val);
            this.hasChanged = true;
        }
    }
    public get body(): number { return typeof (this.data.body) !== 'undefined' ? this.data.body.val : -1; }
    public set body(val: number) {
        if (this.body !== val) {
            this.data.body = sys.board.valueMaps.bodies.transform(val);
            this.hasChanged = true;
        }
    }
    public get poolSetpoint(): number { return this.data.poolSetpoint; }
    public set poolSetpoint(val: number) { this.setDataVal('poolSetpoint', val); }
    public get spaSetpoint(): number { return this.data.spaSetpoint; }
    public set spaSetpoint(val: number) { this.setDataVal('spaSetpoint', val); }
    public get superChlorHours(): number { return this.data.superChlorHours; }
    public set superChlorHours(val: number) { this.setDataVal('superChlorHours', val); }
    public get saltTarget(): number { return this.data.saltTarget; }
    public set saltTarget(val: number) { this.setDataVal('saltTarget', val); }
    public get saltRequired(): number { return this.data.saltRequired; }
    public get saltLevel(): number { return this.data.saltLevel; }
    public set saltLevel(val: number) {
        if (this.saltLevel !== val) {
            this.setDataVal('saltLevel', val);
            this.calcSaltRequired();
        }
    }
    public get superChlor(): boolean { return this.data.superChlor; }
    public set superChlor(val: boolean) {
        this.setDataVal('superChlor', val);
        if (!val && this.superChlorRemaining > 0) this.superChlorRemaining = 0;
    }
    public get superChlorRemaining(): number { return this.data.superChlorRemaining || 0; }
    public set superChlorRemaining(val: number) {
        if (val === this.data.superChlorRemaining) return;
        let remaining: number;
        let sc = state.chlorinators.getSuperChlor(this.id);
        let chlor = sys.chlorinators.getItemById(this.id);
        if (chlor.master === 1) {
            // If we are 10 seconds different then we need to send it off and save the data.
            if (Math.floor(val / 10) !== Math.floor(this.superChlorRemaining / 10)) {
                this.hasChanged = true;
                remaining = val;
                sc.reference = Math.floor(new Date().getTime() / 1000);
                this.setDataVal('superChlorRemaining', remaining);
            }
            else if (val <= 0)
                remaining = 0;
            else
                remaining = this.superChlorRemaining;
        }
        else if (chlor.master === 2) {
            // If we are 10 seconds different then we need to send it off and save the data.
            if (Math.floor(val / 10) !== Math.floor(this.superChlorRemaining / 10)) {
                this.hasChanged = true;
                remaining = val;
                sc.reference = Math.floor(new Date().getTime() / 1000);
                this.setDataVal('superChlorRemaining', remaining);
            }
        }
        else if (sys.controllerType === 'intellicenter') {
            // Trim the seconds off both of these as we will be keeping the seconds separately since this
            // only reports in minutes.  That way our seconds become self healing.
            if (Math.ceil(this.superChlorRemaining / 60) * 60 !== val) {
                sc.reference = Math.floor(new Date().getTime() / 1000); // Get the epoc and strip the milliseconds.
                this.hasChanged = true;
            }
            let secs = Math.floor(new Date().getTime() / 1000) - sc.reference;
            remaining = Math.max(0, val - Math.min(secs, 60));
            if (sc.lastDispatch - 5 > remaining) this.hasChanged = true;
            this.data.superChlorRemaining = remaining;
        }
        else {
            // *Touch only reports superchlor hours remaining. 
            // If we have the same hours as existing, retain the mins + secs
            if (Math.ceil(this.superChlorRemaining / 3600) * 60 !== val / 60) {
                sc.reference = Math.floor(new Date().getTime() / 1000); // Get the epoc and strip the milliseconds.
                this.hasChanged = true;
            }
            let secs = Math.floor(new Date().getTime() / 1000) - sc.reference;
            remaining = Math.max(0, val - Math.min(secs, 3600));
            if (sc.lastDispatch - 5 > remaining) this.hasChanged = true;
            this.data.superChlorRemaining = remaining;
        }
        if (this.hasChanged) sc.lastDispatch = remaining;
        this.setDataVal('superChlor', remaining > 0);
        chlor.superChlor = remaining > 0;
    }
    public calcSaltRequired(saltTarget?: number) : number {
        if (typeof saltTarget === 'undefined') saltTarget = sys.chlorinators.getItemById(this.id, false).saltTarget || 0;
        let saltRequired = 0;
        //this.data.saltLevel = val;
        // Calculate the salt required.
        let capacity = 0;
        for (let i = 0; i < sys.bodies.length; i++) {
            let body = sys.bodies.getItemById(i + 1);
            if (this.body === 32)
                capacity = Math.max(body.capacity, capacity);
            else if (this.body === 0 && body.id === 1)
                capacity = Math.max(body.capacity, capacity);
            else if (this.body === 1 && body.id === 2)
                capacity = Math.max(body.capacity, capacity);
        }
        if (capacity > 0 && this.saltLevel < saltTarget) {
            // Salt requirements calculation.
            // Target - SaltLevel = NeededSalt = 3400 - 2900 = 500ppm
            // So to raise 120ppm you need to add 1lb per 1000 gal.
            // (NeededSalt/120ppm) * (MaxBody/1000) = (500/120) * (33000/1000) = 137.5lbs of salt required to hit target.
            let dec = Math.pow(10, 2);
            saltRequired = Math.round((((saltTarget - this.saltLevel) / 120) * (capacity / 1000)) * dec) / dec;
            if (this.saltRequired < 0) saltRequired = 0;
        }
        this.setDataVal('saltRequired', saltRequired);
        return saltRequired;
    }
    public getEmitData() { return this.getExtended(); }
    public getExtended(): any {
        let schlor = this.get(true);
        let chlor = sys.chlorinators.getItemById(this.id, false);
        schlor.saltTarget = chlor.saltTarget;
        schlor.lockSetpoints = chlor.disabled || chlor.isDosing;
        return schlor;
    }
}
export class ChemControllerStateCollection extends EqStateCollection<ChemControllerState> {
    public createItem(data: any): ChemControllerState { return new ChemControllerState(data); }
    public cleanupState() {
        for (let i = this.data.length - 1; i >= 0; i--) {
            if (isNaN(this.data[i].id)) this.data.splice(i, 1);
            else {
                if (typeof sys.chemControllers.find(elem => elem.id === this.data[i].id) === 'undefined') this.removeItemById(this.data[i].id);
            }
        }
        // Make sure we have at least the items that exist in the config.
        let cfg = sys.chemControllers.toArray();
        for (let i = 0; i < cfg.length; i++) {
            let c = cfg[i];
            let s = this.getItemById(cfg[i].id, true);
            s.address = c.address;
            s.body = c.body;
            s.name = c.name;
            s.type = c.type;
            s.isActive = c.isActive;
        }
    }
}

export class ChemControllerState extends EqState {
    public initData() {
        if (typeof this.data.saturationIndex === 'undefined') this.data.saturationIndex = 0;
        if (typeof this.data.flowDetected === 'undefined') this.data.flowDetected = false;
        if (typeof this.data.orp === 'undefined') this.data.orp = {};
        if (typeof this.data.ph === 'undefined') this.data.ph = {};
        if (typeof this.data.flowSensor === 'undefined') this.data.flowSensor = {};
        if (typeof this.data.type === 'undefined') {
            this.data.type = sys.board.valueMaps.chemControllerTypes.transform(1);
        }
        else if (typeof this.data.type.ph === 'undefined') {
            this.data.type = sys.board.valueMaps.chemControllerTypes.transform(this.type);
        }
        if (typeof this.data.alarms === 'undefined') {
            // Just get the alarms object it should then initialize.
            let a = this.alarms;
        }
        if (typeof this.data.warnings === 'undefined') {
            let w = this.warnings;
        }
        if (typeof this.data.siCalcType === 'undefined') {
            this.data.siCalcType = sys.board.valueMaps.siCalcTypes.transform(0);
        }
        //var chemControllerState = {
        //    lastComm: 'number',             // The unix time the chem controller sent its status.
        //    id: 'number',                   // Id of the chemController.
        //    type: 'valueMap',               // intellichem, rem.
        //    address: 'number',              // Assigned address if IntelliChem.
        //    name: 'string',                 // Name assigned to the controller.
        //    status: 'valueMap',             // ok, nocomms, setupError
        //    body: 'valueMap',               // Body that the chemController is assigned to.
        //    flowDetected: 'boolean',        // True if there is currently sufficient flow to read and dose.
        //    flowDelay: 'boolean',           // True of the controller is currently under a flow delay.
        //    firmware: 'string',             // Firmware version from IntelliChem (this should be in config)
        //    saturationIndex: 'number',      // Calculated LSI for the body.
        //    isActive: 'boolean',    
        //    alarms: {},                     // This has not changed although additional alarms will be added.
        //    warnings: {},                   // This has not changed although additional warnings will be added.
        //    chemistryStatus: 'valueMap',    // Current water quality status.
        //    ph: {
        //        chemType: 'string',                 // Constant ph.
        //        dosingTimeRemaining: 'number',      // The number of seconds remaining for the current dose.
        //        dosingVolumeRemaining: 'number',    // Remaining volume for the current dose in mL.
        //        mixTimeRemaining: 'number',         // The number of seconds remaining in the current mix cycle.
        //        dosingStatus: 'valueMap',           // dosing, monitoring, mixing.
        //        level: 'number',                    // The current pH level.
        //        lockout: 'boolean',                 // True if an attempt to dose was thwarted by error.
        //        manualDosing: 'boolean',            // True if the pump is running outside of a dosing command.
        //        dailyLimitReached: 'boolean',       // True if the calculated daily limit has been reached based upon body volume.
        //        pump: {
        //            type: 'valueMap',               // The defined pump type.
        //            isDosing: 'boolean',            // True if the pump is running.
        //        },
        //        tank: {
        //            level: 'number',                // The current level for the tank.
        //            capacity: 'number',             // Total capacity for the tank.
        //            units: 'valueMap',              // nounits, gal, mL, cL, L, oz, pt, qt.
        //        },
        //        probe: {
        //            level: 'number',                // Current ph level as measured by the probe.
        //            temperature: 'number',          // The temperature used to calculate the adjusted probe level.
        //            tempUnits: 'valueMap'           // Units for the temperature C or F.
        //        }
        //    },
        //    orp: {
        //        chemType: 'string',                 // Constant orp.
        //        dosingTimeRemaining: 'number',      // The number of seconds remaining for the current dose.
        //        dosingVolumeRemaining: 'number',    // Remaining volume for the current dose in mL.
        //        mixTimeRemaining: 'number',         // The number of seconds remaining in the current mix cycle.
        //        dosingStatus: 'valueMap',           // dosing, monitoring, mixing.
        //        level: 'number',                    // The current ORP level.
        //        lockout: 'boolean',                 // True if an attempt to dose was thwarted by error.
        //        manualDosing: 'boolean',            // True if the pump is running outside of a dosing command.
        //        dailyLimitReached: 'boolean',       // True if the calculated daily limit has been reached based upon body volume.
        //        pump: {
        //            type: 'valueMap',               // The defined pump type.
        //            isDosing: 'boolean',            // True if the pump is running.
        //        },
        //        tank: {
        //            level: 'number',                // The current level for the tank.
        //            capacity: 'number',             // Total capacity for the tank.
        //            units: 'valueMap',              // nounits, gal, mL, cL, L, oz, pt, qt.
        //        },
        //        probe: {
        //            level: 'number',                // Current ORP level as measured by the probe.
        //            temperature: 'number',          // The temperature used to calculate the adjusted probe level.
        //            tempUnits: 'valueMap'           // Units for the temperature C or F.
        //        }
        //    }
        //}

    }
    public dataName: string = 'chemController';
    public get lastComm(): number { return this.data.lastComm || 0; }
    public set lastComm(val: number) { this.setDataVal('lastComm', val, false); }
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get address(): number { return this.data.address; }
    public set address(val: number) { this.setDataVal('address', val); }
    public get isBodyOn(): boolean { return this.data.isBodyOn; }
    public set isBodyOn(val: boolean) { this.data.isBodyOn = val; }
    public get flowDetected(): boolean { return this.data.flowDetected; }
    public set flowDetected(val: boolean) { this.data.flowDetected = val; }
    public get status(): number {
        return typeof (this.data.status) !== 'undefined' ? this.data.status.val : -1;
    }
    public set status(val: number) {
        if (this.status !== val) {
            this.data.status = sys.board.valueMaps.chemControllerStatus.transform(val);
            this.hasChanged = true;
        }
    }
    public get body(): number { return typeof (this.data.body) !== 'undefined' ? this.data.body.val : -1; }
    public set body(val: number) {
        if (this.body !== val) {
            this.data.body = sys.board.valueMaps.bodies.transform(val);
            this.hasChanged = true;
        }
    }
    public get type(): number { return typeof (this.data.type) !== 'undefined' ? this.data.type.val : 0; }
    public set type(val: number) {
        if (this.type !== val) {
            this.data.type = sys.board.valueMaps.chemControllerTypes.transform(val);
            this.hasChanged = true;
        }
    }
    public get saturationIndex(): number { return this.data.saturationIndex; }
    public set saturationIndex(val: number) { this.setDataVal('saturationIndex', val); }
    public get lsi(): number { return this.data.lsi; }
    public set lsi(val: number) {
        this.setDataVal('lsi', val || 0);
        if (this.siCalcType === 0) this.saturationIndex = val || 0;
    }
    public get csi(): number { return this.data.csi; }
    public set csi(val: number) {
        this.setDataVal('csi', val || 0);
        if (this.siCalcType === 1) this.saturationIndex = val || 0;
    }
    public calculateCSI(): number {
        let chem = sys.chemControllers.getItemById(this.id);
        let saltLevel = this.orp.probe.saltLevel || state.chlorinators.getItemById(1).saltLevel || 0;
        let extraSalt = Math.max(0, saltLevel - 1.168 * chem.calciumHardness);
        let ph = this.ph.level;
        let t = this.ph.probe.temperature || (this.body != 1 ? state.temps.waterSensor1 : state.temps.waterSensor2);
        let u = sys.board.valueMaps.tempUnits.getName(this.ph.probe.tempUnits || state.temps.units);
        let tempK = utils.convert.temperature.convertUnits(t, u, 'K');
        let I = ((1.5 * chem.calciumHardness + chem.alkalinity)) / 50045 + extraSalt / 58440;
        let carbAlk = chem.alkalinity - 0.38772 * chem.cyanuricAcid / (1 + Math.pow(10, 6.83 - this.ph.level)) - 4.63 * chem.borates / (1 + Math.pow(10, 9.11 - ph));
        let SI = Math.round((
            ph
            - 6.9395
            + Math.log10(chem.calciumHardness)
            + Math.log10(carbAlk)
            - 2.56 * Math.sqrt(I) / (1 + 1.65 * Math.sqrt(I))
            - 1412.5 / tempK
        ) * 1000) / 1000;
        return isNaN(SI) ? undefined : SI;
    }
    private chFactor(ch: number): number {
        if (ch <= 25) return 1.0;
        else if (ch <= 50) return 1.3;
        else if (ch <= 75) return 1.5;
        else if (ch <= 100) return 1.6;
        else if (ch <= 125) return 1.7;
        else if (ch <= 150) return 1.8;
        else if (ch <= 200) return 1.9;
        else if (ch <= 250) return 2.0;
        else if (ch <= 300) return 2.1;
        else if (ch <= 400) return 2.2;
        return 2.5;
    }
    private alkFactor(alk: number): number {
        if (alk <= 25) return 1.4;
        else if (alk <= 50) return 1.7;
        else if (alk <= 75) return 1.9;
        else if (alk <= 100) return 2.0;
        else if (alk <= 125) return 2.1;
        else if (alk <= 150) return 2.2;
        else if (alk <= 200) return 2.3;
        else if (alk <= 250) return 2.4;
        else if (alk <= 300) return 2.5;
        else if (alk <= 400) return 2.6;
        return 2.9;
    }
    private tempFactor(tempC): number {
        if (tempC <= 0) return 0.0;
        else if (tempC <= 2.8) return 0.1;
        else if (tempC <= 7.8) return 0.2;
        else if (tempC <= 11.7) return 0.3;
        else if (tempC <= 15.6) return 0.4;
        else if (tempC <= 18.9) return 0.5;
        else if (tempC <= 24.4) return 0.6;
        else if (tempC <= 28.9) return 0.7;
        else if (tempC <= 34.4) return 0.8;
        return 0.9;
    }
    public calculateLSI(): number {
        let t = this.ph.probe.temperature || (this.body != 1 ? state.temps.waterSensor1 : state.temps.waterSensor2);
        let u = sys.board.valueMaps.tempUnits.getName(this.ph.probe.tempUnits || state.temps.units);
        let tempC = utils.convert.temperature.convertUnits(t, u, 'C');
        let chem = sys.chemControllers.getItemById(this.id);
        let calciumHardnessFactor = this.chFactor(chem.calciumHardness);
        let alkalinityFactor = this.alkFactor(chem.alkalinity);
        let tempFactor = this.tempFactor(tempC);
        let dssFactor = chem.orp.useChlorinator ? 12.2 : 12.1;
        return Math.round((this.ph.level + calciumHardnessFactor + alkalinityFactor + tempFactor - dssFactor) * 1000) / 1000;
    }
    public calculateSaturationIndex(): number {
        // We always calculate the indexes for CSI but if this is IntelliChem we use the LSI value returned in
        // the 18 (status) message.  Therefore the check below for type === 2.
        this.csi = this.calculateCSI();
        if (this.type !== 2) this.lsi = this.calculateLSI();
        if (this.siCalcType === 0) this.saturationIndex = this.lsi;
        else this.saturationIndex = this.csi;
        return this.saturationIndex;
    }
    public get ph(): ChemicalPhState { return new ChemicalPhState(this.data, 'ph', this); }
    public get orp(): ChemicalORPState { return new ChemicalORPState(this.data, 'orp', this); }
    public get flowSensor(): ChemicalFlowSensorState { return new ChemicalFlowSensorState(this.data, 'flowSensor', this); }
    public get warnings(): ChemControllerStateWarnings { return new ChemControllerStateWarnings(this.data, 'warnings', this); }
    public get alarms(): ChemControllerStateAlarms { return new ChemControllerStateAlarms(this.data, 'alarms', this); }
    public get siCalcType(): number { return typeof this.data.siCalcType === 'undefined' ? 0 : this.data.siCalcType.val; }
    public set siCalcType(val: number) {
        if (this.siCalcType !== val) {
            this.data.siCalcType = sys.board.valueMaps.siCalcTypes.transform(val);
            this.hasChanged = true;
        }
    }
    public getExtended(): any {
        let chem = sys.chemControllers.getItemById(this.id);
        let obj = this.get(true);
        obj.address = chem.address;
        obj.saturationIndex = this.saturationIndex || 0;
        obj.alkalinity = chem.alkalinity;
        obj.calciumHardness = chem.calciumHardness;
        obj.cyanuricAcid = chem.cyanuricAcid;
        obj.ph = this.ph.getExtended();
        obj.orp = this.orp.getExtended();
        obj = extend(true, obj, chem.getExtended());
        return obj;
    }
}
export class ChemicalState extends ChildEqState {
    public initData() {
        if (typeof this.data.probe === 'undefined') this.data.probe = {};
        if (typeof this.data.tank === 'undefined') this.data.tank = { capacity: 0, level: 0, units: 0 };
        if (typeof this.data.pump === 'undefined') this.data.pump = { isDosing: false };
        if (typeof this.data.dosingTimeRemaining === 'undefined') this.data.dosingTimeRemaining = 0;
        if (typeof this.data.delayTimeRemaining === 'undefined') this.data.delayTimeRemaining = 0;
        if (typeof this.data.dosingVolumeRemaining === 'undefined') this.data.dosingVolumeRemaining = 0;
        if (typeof this.data.doseVolume === 'undefined') this.data.doseVolume = 0;
        if (typeof this.data.doseTime === 'undefined') this.data.doseTime = 0;
        if (typeof this.data.lockout === 'undefined') this.data.lockout = false;
        if (typeof this.data.level === 'undefined') this.data.level = 0;
        if (typeof this.data.mixTimeRemaining === 'undefined') this.data.mixTimeRemaining = 0;
        if (typeof this.data.dailyLimitReached === 'undefined') this.data.dailyLimitReached = false;
        if (typeof this.data.manualDosing === 'undefined') this.data.manualDosing = false;
        if (typeof this.data.manualMixing === 'undefined') this.data.manualMixing = false;
        if (typeof this.data.flowDelay === 'undefined') this.data.flowDelay = false;
        if (typeof this.data.dosingStatus === 'undefined') this.dosingStatus = 2;
        if (typeof this.data.enabled === 'undefined') this.data.enabled = true;
        if (typeof this.data.freezeProtect === 'undefined') this.data.freezeProtect = false;
    }
    public getConfig(): Chemical { return; }
    public calcDoseHistory(): number {
        // The dose history records will already exist when the state is loaded.  There are enough records to cover 24 hours in this
        // instance. We need to prune off any records that are > 24 hours when we calculate.
        let dailyVolumeDosed = 0;
        let dt = new Date();
        let dtMax = dt.setTime(dt.getTime() - (24 * 60 * 60 * 1000));
        for (let i = this.doseHistory.length - 1; i >= 0; i--) {
            let dh = this.doseHistory[i];
            if (typeof dh.end !== 'undefined'
                && typeof dh.end.getTime == 'function'
                && dh.end.getTime() > dtMax
                && dh.volumeDosed > 0) dailyVolumeDosed += dh.volumeDosed;
            else {
                logger.info(`Removing dose history ${dh.chem} ${dh.end}`);
                this.doseHistory.splice(i, 1);
            }
        }
        return dailyVolumeDosed + (typeof this.currentDose !== 'undefined' ? this.currentDose.volumeDosed : 0);
    }
    public startDose(dtStart: Date = new Date(), method: string = 'auto', volume: number = 0, volumeDosed: number = 0, time: number = 0, timeDosed: number = 0): ChemicalDoseState {
        this.currentDose = new ChemicalDoseState();
        this.currentDose.id = this.chemController.id;
        this.currentDose.start = dtStart;
        this.currentDose.method = method;
        this.currentDose.volumeDosed = volumeDosed;
        this.currentDose.level = this.level;
        this.currentDose.demand = this.demand;
        this.doseVolume = this.currentDose.volume = volume;
        this.currentDose.chem = this.chemType;
        this.currentDose.setpoint = this.setpoint;
        this.currentDose.time = time;
        this.currentDose._timeDosed = timeDosed;
        this.volumeDosed = this.currentDose.volumeDosed;
        this.timeDosed = Math.round(timeDosed / 1000);
        this.dosingTimeRemaining = this.currentDose.timeRemaining;
        this.dosingVolumeRemaining = this.currentDose.volumeRemaining;
        this.doseTime = Math.round(this.currentDose.time / 1000);
        this.currentDose._isManual = method === 'manual';
        this.currentDose.status = 'current';
        //webApp.emitToClients(`chemicalDose`, this.currentDose);
        return this.currentDose;
    }
    public endDose(dtEnd: Date = new Date(), status: string = 'completed', volumeDosed: number = 0, timeDosed: number = 0): ChemicalDoseState {
        let dose = this.currentDose;
        if (typeof dose !== 'undefined') {
            dose._timeDosed += timeDosed;
            dose.volumeDosed += volumeDosed;
            dose.end = dtEnd;
            dose.timeDosed = dose._timeDosed / 1000;
            dose.status = status;
            this.volumeDosed = dose.volumeDosed;
            this.timeDosed = Math.round(dose._timeDosed / 1000);
            this.dosingTimeRemaining = 0;
            this.dosingVolumeRemaining = 0;
            if (dose.volumeDosed > 0) {
                this.doseHistory.unshift(dose);
                this.dailyVolumeDosed = this.calcDoseHistory();
                DataLogger.writeEnd(`chemDosage_${this.chemType}.log`, dose);
                setImmediate(() => { webApp.emitToClients(`chemicalDose`, dose); });
            }
            this.currentDose = undefined;
        }
        return dose;
    }
    // Appends dose information to the current dose.  The time here is in ms and our target will be in sec.
    public appendDose(volumeDosed: number, timeDosed: number): ChemicalDoseState {
        let dose = typeof this.currentDose !== 'undefined' ? this.currentDose : this.currentDose = this.startDose();
        dose._timeDosed += timeDosed;
        dose.volumeDosed += volumeDosed;
        this.volumeDosed = dose.volumeDosed;
        this.timeDosed = Math.round(dose._timeDosed / 1000);
        this.dosingTimeRemaining = dose.timeRemaining;
        this.dosingVolumeRemaining = dose.volumeRemaining;
        if (dose.volumeDosed > 0) setImmediate(() => { webApp.emitToClients(`chemicalDose`, dose); });
        return dose;
    }
    public get currentDose(): ChemicalDoseState {
        if (typeof this.data.currentDose === 'undefined') return this.data.currentDose;
        if (typeof this.data.currentDose.save !== 'function') this.data.currentDose = new ChemicalDoseState(this.data.currentDose);
        return this.data.currentDose;
    }
    public set currentDose(val: ChemicalDoseState) {
        this.setDataVal('currentDose', val);
    }
    public get doseHistory(): ChemicalDoseState[] {
        if (typeof this.data.doseHistory === 'undefined') this.data.doseHistory = [];
        if (this.data.doseHistory.length === 0) return this.data.doseHistory;
        if (typeof this.data.doseHistory[0].save !== 'function') {
            let arr: ChemicalDoseState[] = [];
            for (let i = 0; i < this.data.doseHistory.length; i++) {
                arr.push(new ChemicalDoseState(this.data.doseHistory[i]));
            }
            this.data.doseHistory = arr;
        }
        return this.data.doseHistory;
    }
    public set doseHistory(val: ChemicalDoseState[]) { this.setDataVal('doseHistory', val); }
    public appendDemand(time: number, val: number) {
        let dH = this.demandHistory;
        dH.appendDemand(time, val);
    }
    public get demandHistory() { return new ChemicalDemandState(this.data, 'demandHistory', this) };
    public get enabled(): boolean { return this.data.enabled; }
    public set enabled(val: boolean) { this.data.enabled = val; }
    public get freezeProtect(): boolean { return this.data.freezeProtect; }
    public set freezeProtect(val: boolean) { this.data.freezeProtect = val; }
    public get level(): number { return this.data.level; }
    public set level(val: number) { this.setDataVal('level', val); }
    public get setpoint(): number { return this.data.setpoint; }
    public set setpoint(val: number) { this.setDataVal('setpoint', val); }
    public get demand(): number { return this.data.demand || 0; }
    public set demand(val: number) { this.setDataVal('demand', val); }
    public get chemController(): ChemControllerState { return this.getParent() as ChemControllerState; }
    public get chemType(): string { return this.data.chemType; }
    public get delayTimeRemaining(): number { return this.data.delayTimeRemaining; }
    public set delayTimeRemaining(val: number) { this.setDataVal('delayTimeRemaining', val); }
    public get doseTime(): number { return this.data.doseTime; }
    public set doseTime(val: number) { this.setDataVal('doseTime', val); }
    public get doseVolume(): number { return this.data.doseVolume; }
    public set doseVolume(val: number) { this.setDataVal('doseVolume', val); }
    public get dosingTimeRemaining(): number { return this.data.dosingTimeRemaining; }
    public set dosingTimeRemaining(val: number) { this.setDataVal('dosingTimeRemaining', val); }
    public get dosingVolumeRemaining(): number { return this.data.dosingVolumeRemaining; }
    public set dosingVolumeRemaining(val: number) { this.setDataVal('dosingVolumeRemaining', val); }
    public get volumeDosed(): number { return this.data.volumeDosed; }
    public set volumeDosed(val: number) { this.setDataVal('volumeDosed', val); }
    public get timeDosed(): number { return this.data.timeDosed; }
    public set timeDosed(val: number) { this.setDataVal('timeDosed', val); }
    public get dailyVolumeDosed(): number { return this.data.dailyVolumeDosed; }
    public set dailyVolumeDosed(val: number) { this.setDataVal('dailyVolumeDosed', val); }
    public get mixTimeRemaining(): number { return this.data.mixTimeRemaining; }
    public set mixTimeRemaining(val: number) { this.setDataVal('mixTimeRemaining', val); }
    public get dosingStatus(): number { return typeof (this.data.dosingStatus) !== 'undefined' ? this.data.dosingStatus.val : undefined; }
    public set dosingStatus(val: number) {
        if (this.dosingStatus !== val) {
            logger.debug(`${this.chemType} dosing status changed from ${sys.board.valueMaps.chemControllerDosingStatus.getName(this.dosingStatus)} (${this.dosingStatus}) to ${sys.board.valueMaps.chemControllerDosingStatus.getName(val)}(${val})`);
            this.data.dosingStatus = sys.board.valueMaps.chemControllerDosingStatus.transform(val);
            this.hasChanged = true;
        }
    }
    public get lockout(): boolean { return utils.makeBool(this.data.lockout); }
    public set lockout(val: boolean) { this.setDataVal('lockout', val); }
    public get flowDelay(): boolean { return utils.makeBool(this.data.flowDelay); }
    public set flowDelay(val: boolean) { this.data.flowDelay = val; }
    public get manualDosing(): boolean { return utils.makeBool(this.data.manualDosing); }
    public set manualDosing(val: boolean) { this.setDataVal('manualDosing', val); }
    public get manualMixing(): boolean { return utils.makeBool(this.data.manualMixing); }
    public set manualMixing(val: boolean) { this.setDataVal('manualMixing', val); }
    public get dailyLimitReached(): boolean { return utils.makeBool(this.data.dailyLimitReached); }
    public set dailyLimitReached(val: boolean) { this.data.dailyLimitReached = val; }
    public get tank(): ChemicalTankState { return new ChemicalTankState(this.data, 'tank', this); }
    public get pump(): ChemicalPumpState { return new ChemicalPumpState(this.data, 'pump', this); }
    public get chlor(): ChemicalChlorState { return new ChemicalChlorState(this.data, 'chlor', this); }
    public calcDemand(chem?: ChemController): number { return 0; }
    public getExtended() {
        let chem = this.get(true);
        chem.tank = this.tank.getExtended();
        chem.pump = this.pump.getExtended();
        return chem;
    }
}
export class ChemicalPhState extends ChemicalState {
    public initData() {
        super.initData();
        if (typeof this.data.chemType === 'undefined') this.data.chemType = 'none';
    }
    public getConfig() {
        let schem = this.chemController;
        if (typeof schem !== 'undefined') {
            let chem = sys.chemControllers.getItemById(schem.id);
            return typeof chem !== 'undefined' ? chem.ph : undefined;
        }
    }
    public get chemType() { return this.data.chemType; }
    public set chemType(val: string) { this.setDataVal('chemType', val); }
    public get probe(): ChemicalProbePHState { return new ChemicalProbePHState(this.data, 'probe', this); }
    public getExtended() {
        let chem = super.getExtended();
        chem.probe = this.probe.getExtended();
        return chem;
    }
    public get suspendDosing(): boolean {
        let cc = this.chemController;
        return cc.alarms.comms !== 0 || cc.alarms.pHProbeFault !== 0 || cc.alarms.pHPumpFault !== 0 || cc.alarms.bodyFault !== 0;
    }
    public calcDemand(chem?: ChemController): number {
        chem = typeof chem === 'undefined' ? sys.chemControllers.getItemById(this.chemController.id) : chem;

        // Calculate how many mL are required to raise to our pH level.
        // 1. Get the total gallons of water that the chem controller is in
        // control of.
        // 2. RSG 5-22-22 - If the spa is on, calc demand only based on the spa volume.  Otherwise, long periods of spa usage
        // will result in an overdose if pH is high.
        let totalGallons = 0;
        // The bodyIsOn code was throwing an exception whenver no bodies were on.
        if (chem.body === 32 && sys.equipment.shared) {
            // We are shared and when body 2 (spa) is on body 1 (pool) is off.
            if (state.temps.bodies.getItemById(2).isOn === true) totalGallons = sys.bodies.getItemById(2).capacity;
            else totalGallons = sys.bodies.getItemById(1).capacity + sys.bodies.getItemById(2).capacity;
        }
        else {
            // These are all single body implementations so we simply match to the body.
            totalGallons = sys.bodies.getItemById(chem.body + 1).capacity;
        }

        //if (chem.body === 0 || chem.body === 32 || sys.equipment.shared) totalGallons += sys.bodies.getItemById(1).capacity;
        //let bodyIsOn = state.temps.bodies.getBodyIsOn();
        //if (bodyIsOn.circuit === 1 && sys.circuits.getInterfaceById(bodyIsOn.circuit).type === sys.board.valueMaps.circuitFunctions.getValue('spa') && (chem.body === 1 || chem.body === 32 || sys.equipment.shared)) totalGallons = sys.bodies.getItemById(2).capacity;
        //else  if (chem.body === 1 || chem.body === 32 || sys.equipment.shared) totalGallons += sys.bodies.getItemById(2).capacity;
        //if (chem.body === 2) totalGallons += sys.bodies.getItemById(3).capacity;
        //if (chem.body === 3) totalGallons += sys.bodies.getItemById(4).capacity;
        logger.verbose(`Chem begin calculating ${this.chemType} demand: ${this.level} setpoint: ${this.setpoint} total gallons: ${totalGallons}`);
        let chg = this.setpoint - this.level;
        let delta = chg * totalGallons;
        let temp = (this.level + this.setpoint) / 2;
        let adj = (192.1626 + -60.1221 * temp + 6.0752 * temp * temp + -0.1943 * temp * temp * temp) * (chem.alkalinity + 13.91) / 114.6;
        let extra = (-5.476259 + 2.414292 * temp + -0.355882 * temp * temp + 0.01755 * temp * temp * temp) * (chem.borates || 0);
        extra *= delta;
        delta *= adj;
        let dose = 0;
        if (chem.ph.phSupply === 0) {  // We are dispensing base so we need to calculate the demand here.
            if (chg > 0) {

            }
        }
        else {
            if (chg < 0) {
                let at = sys.board.valueMaps.acidTypes.transform(chem.ph.acidType);
                dose = Math.round(utils.convert.volume.convertUnits((delta / -240.15 * at.dosingFactor) + (extra / -240.15 * at.dosingFactor), 'oz', 'mL'));
            }
        }
        return dose;
    }
}
export class ChemicalORPState extends ChemicalState {
    public initData() {
        if (typeof this.data.probe === 'undefined') this.data.probe = {};
        if (typeof this.data.chemType === 'undefined') this.data.chemType = 'none';
        if (typeof this.data.useChlorinator === 'undefined') this.data.useChlorinator = false;
        super.initData();
        // Load up the 24 hours doseHistory.
        //this.doseHistory = DataLogger.readFromEnd(`chemDosage_${this.chemType}.log`, ChemicalDoseState, (lineNumber: number, entry: ChemicalDoseState): boolean => {
        //    let dt = new Date();
        //    let dtMax = dt.setTime(dt.getTime() - (24 * 60 * 60 * 1000));
        //    // If we are reading back in time prior to 24 hours then we don't want the data.
        //    if (entry.end.getTime() < dtMax) return false;
        //    return true;
        //});
    }
    public get chemType() { return 'orp'; }
    public set chemType(val) { this.setDataVal('chemType', val); }
    public get probe() { return new ChemicalProbeORPState(this.data, 'probe', this); }
    public get useChlorinator(): boolean { return utils.makeBool(this.data.useChlorinator); }
    public set useChlorinator(val: boolean) { this.setDataVal('useChlorinator', val); }
    public get suspendDosing(): boolean {
        let cc = this.chemController;
        return cc.alarms.comms !== 0 || cc.alarms.orpProbeFault !== 0 || cc.alarms.orpPumpFault !== 0 || cc.alarms.bodyFault !== 0;
    }
    public getExtended() {
        let chem = super.getExtended();
        chem.probe = this.probe.getExtended();
        return chem;
    }
}
export class ChemicalFlowSensorState extends ChemicalState {
    public initData() {
        if (typeof this.data.state === 'undefined') this.data.state = 0;
    }
    public get state(): number { return this.data.state || 0; }
    public set state(val: number) { this.setDataVal('state', val); }
}
export class ChemicalPumpState extends ChildEqState {
    public initData() {
        if (typeof this.data.isDosing === 'undefined') this.data.isDosing = false;
    }
    public get chemical(): ChemicalState { return this.getParent() as ChemicalState; }
    public get chemController(): ChemControllerState {
        let p = this.chemical;
        return typeof p !== 'undefined' ? p.getParent() as ChemControllerState : undefined;
    }
    public get type(): number { return typeof (this.data.type) !== 'undefined' ? this.data.type.val : undefined; }
    public set type(val: number) {
        if (this.type !== val) {
            this.data.type = sys.board.valueMaps.chemPumpTypes.transform(val);
            this.hasChanged = true;
        }
    }
    public get isDosing(): boolean { return utils.makeBool(this.data.isDosing); }
    public set isDosing(val: boolean) { this.setDataVal('isDosing', val); }
    public getExtended() {
        let pump = this.get(true);
        pump.type = sys.board.valueMaps.chemPumpTypes.transform(this.type);
        return pump;
    }
}
export class ChemicalChlorState extends ChildEqState {
    public initData() {
        if (typeof this.data.isDosing === 'undefined') this.data.isDosing = false;
    }
    public get chemical(): ChemicalState { return this.getParent() as ChemicalState; }
    public get chemController(): ChemControllerState {
        let p = this.chemical;
        return typeof p !== 'undefined' ? p.getParent() as ChemControllerState : undefined;
    }
    public get isDosing(): boolean { return utils.makeBool(this.data.isDosing); }
    public set isDosing(val: boolean) { this.setDataVal('isDosing', val); }
    public getExtended() {
        let chlor = this.get(true);
        return chlor;
    }
}
export class ChemicalProbeState extends ChildEqState {
    public initData() {
        if (typeof this.data.level === 'undefined') this.data.level = null;
    }
    public get chemical(): ChemicalState { return this.getParent() as ChemicalState; }
    public get chemController(): ChemControllerState {
        let p = this.chemical;
        return typeof p !== 'undefined' ? p.getParent() as ChemControllerState : undefined;
    }
    public get level(): number { return this.data.level; }
    public set level(val: number) { this.setDataVal('level', val); }
}
export class ChemicalProbeORPState extends ChemicalProbeState {
    public initData() {
        if (typeof this.data.saltLevel === 'undefined') this.data.saltLevel = 0;
        super.initData();
    }
    public get saltLevel(): number { return this.data.saltLevel; }
    public set saltLevel(val: number) { this.setDataVal('saltLevel', val); }
}
export class ChemicalProbePHState extends ChemicalProbeState {
    public initData() {
        if (typeof this.data.temperature === 'undefined') this.data.temperature = 0;
        super.initData();
    }
    public get temperature(): number { return this.data.temperature; }
    public set temperature(val: number) { this.setDataVal('temperature', val); }
    public get tempUnits(): number {
        return typeof (this.data.tempUnits) !== 'undefined' ? this.data.tempUnits.val : undefined;
    }
    public set tempUnits(val: number) {
        if (this.tempUnits !== val) {
            this.data.tempUnits = sys.board.valueMaps.tempUnits.transform(val);
            this.hasChanged = true;
        }
    }
}
export class ChemicalTankState extends ChildEqState {
    public initData() {
        if (typeof this.data.level === 'undefined') this.data.level == 0;
        if (typeof this.data.capacity === 'undefined') this.data.capacity = 0;
        if (typeof this.data.units === 'undefined') this.data.units = 0;
        if (typeof this.data.alarmEmptyEnabled === 'undefined') this.data.alarmEmptyEnabled = true;
        if (typeof this.data.alarmEmptyLevel === 'undefined') this.data.alarmEmptyLevel = 20;
    }
    public get chemical(): ChemicalState { return this.getParent() as ChemicalState; }
    public get chemController(): ChemControllerState {
        let p = this.chemical;
        return typeof p !== 'undefined' ? p.getParent() as ChemControllerState : undefined;
    }
    public get level(): number { return this.data.level; }
    public set level(val: number) { this.setDataVal('level', val); }
    public get capacity(): number { return this.data.capacity; }
    public set capacity(val: number) { this.setDataVal('capacity', val); }
    public get alarmEmptyEnabled(): boolean { return this.data.alarmEmptyEnabled; }
    public set alarmEmptyEnabled(val: boolean) { this.setDataVal('alarmEmptyEnabled', val); }
    public get alarmEmptyLevel(): number { return this.data.alarmEmptyLevel; }
    public set alarmEmptyLevel(val: number) { this.setDataVal('alarmEmptyLevel', val); }
    public get units(): number | any { return typeof this.data.units !== 'undefined' ? this.data.units.val : undefined; }
    public set units(val: number | any) {
        let v = sys.board.valueMaps.volumeUnits.encode(val);
        if (this.units !== v) {
            this.data.units = sys.board.valueMaps.volumeUnits.transform(val);
            this.hasChanged = true;
        }
    }
}
export class ChemicalDoseState extends DataLoggerEntry {
    public _timeDosed: number; // _timeDosed is in ms.
    public _lastLatch: number = 0;
    public _isManual: boolean;

    constructor(entry?: string | object) {
        super();
        if (typeof entry === 'object') entry = JSON.stringify(entry);
        if (typeof entry === 'string') this.parse(entry);
        // Javascript is idiotic in that the initialization of variables
        // do not happen before the assignment so some of the values can be undefined.
        if (typeof this.volumeDosed === 'undefined' || !this.volumeDosed) this.volumeDosed = 0;
        if (typeof this.volume === 'undefined' || !this.volume) this.volume = 0;
        if (typeof this._isManual === 'undefined') this._isManual = this.method === 'manual';
        if (typeof this.timeDosed === 'undefined' || !this.timeDosed) this.timeDosed = 0;
        if (typeof this._timeDosed === 'undefined') this._timeDosed = this.timeDosed * 1000;
        if (typeof this.time === 'undefined' || !this.time) this.time = 0;
    }
    public id: number;
    public method: string;
    public start: Date;
    public end: Date;
    public chem: string;
    public setpoint: number;
    public demand: number;
    public level: number;
    public volume: number;
    public status: string;
    public volumeDosed: number;
    public time: number;
    public timeDosed: number;

    public static createInstance(entry?: string): ChemicalDoseState { return new ChemicalDoseState(entry); }
    public save() { DataLogger.writeEnd(`chemDosage_${this.chem}.log`, this); }
    public get timeRemaining(): number { return Math.floor(Math.max(0, this.time - (this._timeDosed / 1000))); }
    public get volumeRemaining(): number { return Math.max(0, this.volume - this.volumeDosed); }
    public parse(entry: string) {
        // let obj = typeof entry !== 'undefined' ? JSON.parse(entry, this.dateParser) : {};
        let obj = typeof entry !== 'undefined' ? JSON.parse(entry) : {};
        for (const prop in obj) {obj[prop] = this.dateParser(prop, obj[prop])}
        if (typeof obj.setpoint !== 'undefined') this.setpoint = obj.setpoint;
        if (typeof obj.method !== 'undefined') this.method = obj.method;
        if (typeof obj.start !== 'undefined') this.start = obj.start;
        if (typeof obj.end !== 'undefined') this.end = obj.end;
        if (typeof obj.chem !== 'undefined') this.chem = obj.chem;
        if (typeof obj.demand !== 'undefined') this.demand = obj.demand;
        if (typeof obj.id !== 'undefined') this.id = obj.id;
        if (typeof obj.level !== 'undefined') this.level = obj.level;
        if (typeof obj.volume !== 'undefined') this.volume = obj.volume;
        if (typeof obj.status !== 'undefined') this.status = obj.status;
        if (typeof obj.volumeDosed !== 'undefined') this.volumeDosed = obj.volumeDosed;
        if (typeof obj.time !== 'undefined') this.time = obj.time;
        if (typeof obj.timeDosed !== 'undefined') this.timeDosed = obj.timeDosed;
        // this.setProperties(obj);
    }
    protected setProperties(data: any) {
        let op = Object.getOwnPropertyNames(Object.getPrototypeOf(this));
        for (let i in op) {
            let prop = op[i];
            if (typeof this[prop] === 'function') continue;
            if (typeof data[prop] !== 'undefined') {
                if (typeof this[prop] === null || typeof data[prop] === null) continue;
                this[prop] = data[prop];
            }
        }
    }
}

export class ChemicalDemandState extends ChildEqState {
    public initData() {
        if (typeof this.data.time === 'undefined') this.data.time = [];
        if (typeof this.data.value === 'undefined') this.data.value = [];
    }
    
    public appendDemand(time: number, val: number) {
        while (this.data.time.length > 99) {
            this.data.time.pop();
            this.data.value.pop();
        }
        this.data.time.unshift(Math.round(time / 1000));
        this.data.value.unshift(val);
        // calculate the slope with each save
        let slope = utils.slopeOfLeastSquares(this.data.time, this.data.value);
        this.setDataVal('slope', slope);  // will act as hasChanged=true;
    }
    public get demandHistory(): {} { return [this.data.time, this.data.value]; }
    public get times(): number[] { return this.data.time; }
    public get values(): number[] { return this.data.value; }
    public set slope(val: number) { this.setDataVal('slope', val); }
    public get slope():number { return this.data.slope; }
}

export class ChemControllerStateWarnings extends ChildEqState {
    ///ctor(data): ChemControllerStateWarnings { return new ChemControllerStateWarnings(data, name || 'warnings'); }
    public dataName = 'chemControllerWarnings';
    public initData() {
        if (typeof this.data.waterChemistry === 'undefined') this.waterChemistry = 0;
        if (typeof this.data.pHLockout === 'undefined') this.pHLockout = 0;
        if (typeof this.data.pHDailyLimitReached === 'undefined') this.pHDailyLimitReached = 0;
        if (typeof this.data.orpDailyLimitReached === 'undefined') this.orpDailyLimitReached = 0;
        if (typeof this.data.invalidSetup === 'undefined') this.invalidSetup = 0;
        if (typeof this.data.chlorinatorCommError === 'undefined') this.chlorinatorCommError = 0;
    }
    public get waterChemistry(): number { return typeof this.data.waterChemistry === 'undefined' ? undefined : this.data.waterChemistry.val; }
    public set waterChemistry(val: number) {
        if (this.waterChemistry !== val) {
            this.data.waterChemistry = sys.board.valueMaps.chemControllerWarnings.transform(val);
            this.hasChanged = true;
        }
    }
    public get pHLockout(): number { return this.data.pHLockout; }
    public set pHLockout(val: number) {
        if (this.pHLockout !== val) {
            this.data.pHLockout = sys.board.valueMaps.chemControllerLimits.transform(val);
            this.hasChanged = true;
        }
    }
    public get pHDailyLimitReached(): number { return this.data.pHDailyLimitReached; }
    public set pHDailyLimitReached(val: number) {
        if (this.pHDailyLimitReached !== val) {
            this.data.pHDailyLimitReached = sys.board.valueMaps.chemControllerLimits.transform(val);
            this.hasChanged = true;
        }
    }
    public get orpDailyLimitReached(): number { return this.data.orpDailyLimitReached; }
    public set orpDailyLimitReached(val: number) {
        if (this.orpDailyLimitReached !== val) {
            this.data.orpDailyLimitReached = sys.board.valueMaps.chemControllerLimits.transform(val);
            this.hasChanged = true;
        }
    }
    public get invalidSetup(): number { return this.data.invalidSetup; }
    public set invalidSetup(val: number) {
        if (this.invalidSetup !== val) {
            this.data.invalidSetup = sys.board.valueMaps.chemControllerLimits.transform(val);
            this.hasChanged = true;
        }
    }
    public get chlorinatorCommError(): number { return this.data.chlorinatorCommError; }
    public set chlorinatorCommError(val: number) {
        if (this.chlorinatorCommError !== val) {
            this.data.chlorinatorCommError = sys.board.valueMaps.chemControllerWarnings.transform(val);
            this.hasChanged = true;
        }
    }

}
export class ChemControllerStateAlarms extends ChildEqState {
    //ctor(data): ChemControllerStateWarnings { return new ChemControllerStateWarnings(data, name || 'alarms'); }
    public dataName = 'chemControllerAlarms';
    public initData() {
        if (typeof this.data.flow === 'undefined') this.data.flow = sys.board.valueMaps.chemControllerAlarms.transform(0);
        if (typeof this.data.pH === 'undefined') this.data.pH = sys.board.valueMaps.chemControllerAlarms.transform(0);
        if (typeof this.data.orp === 'undefined') this.data.orp = sys.board.valueMaps.chemControllerAlarms.transform(0);
        if (typeof this.data.pHTank === 'undefined') this.data.pHTank = sys.board.valueMaps.chemControllerAlarms.transform(0);
        if (typeof this.data.orpTank === 'undefined') this.data.orpTank = sys.board.valueMaps.chemControllerAlarms.transform(0);
        if (typeof this.data.probeFault === 'undefined') this.data.probeFault = sys.board.valueMaps.chemControllerAlarms.transform(0);
        if (typeof this.data.pHProbeFault === 'undefined') this.data.pHProbeFault = sys.board.valueMaps.chemControllerAlarms.transform(0);
        if (typeof this.data.orpProbeFault === 'undefined') this.data.orpProbeFault = sys.board.valueMaps.chemControllerAlarms.transform(0);
        if (typeof this.data.pHPumpFault === 'undefined') this.data.pHPumpFault = sys.board.valueMaps.chemControllerHardwareFaults.transform(0);
        if (typeof this.data.orpPumpFault === 'undefined') this.data.orpPumpFault = sys.board.valueMaps.chemControllerHardwareFaults.transform(0);
        if (typeof this.data.chlorFault === 'undefined') this.data.chlorFault = sys.board.valueMaps.chemControllerHardwareFaults.transform(0);
        if (typeof this.data.bodyFault === 'undefined') this.data.bodyFault = sys.board.valueMaps.chemControllerHardwareFaults.transform(0);
        if (typeof this.data.flowSensorFault === 'undefined') this.data.flowSensorFault = sys.board.valueMaps.chemControllerHardwareFaults.transform(0);
        if (typeof this.data.comms === 'undefined') this.data.comms = sys.board.valueMaps.chemControllerStatus.transform(0);
        if (typeof this.data.freezeProtect === 'undefined') this.data.freezeProtect = sys.board.valueMaps.chemControllerAlarms.transform(0);
    }
    public get flow(): number { return typeof this.data.flow === 'undefined' ? undefined : this.data.flow.val; }
    public set flow(val: number) {
        if (this.flow !== val) {
            this.data.flow = sys.board.valueMaps.chemControllerAlarms.transform(val);
            this.hasChanged = true;
        }
    }
    public get pH(): number { return typeof this.data.pH === 'undefined' ? undefined : this.data.pH.val; }
    public set pH(val: number) {
        if (this.pH !== val) {
            this.data.pH = sys.board.valueMaps.chemControllerAlarms.transform(val);
            this.hasChanged = true;
        }
    }
    public get orp(): number { return typeof this.data.orp === 'undefined' ? undefined : this.data.orp.val; }
    public set orp(val: number) {
        if (this.orp !== val) {
            this.data.orp = sys.board.valueMaps.chemControllerAlarms.transform(val);
            this.hasChanged = true;
        }
    }
    public get pHTank(): number { return typeof this.data.pHTank === 'undefined' ? undefined : this.data.pHTank.val; }
    public set pHTank(val: number) {
        if (this.pHTank !== val) {
            this.data.pHTank = sys.board.valueMaps.chemControllerAlarms.transform(val);
            this.hasChanged = true;
        }
    }
    public get orpTank(): number { return typeof this.data.orpTank === 'undefined' ? undefined : this.data.orpTank.val; }
    public set orpTank(val: number) {
        if (this.orpTank !== val) {
            this.data.orpTank = sys.board.valueMaps.chemControllerAlarms.transform(val);
            this.hasChanged = true;
        }
    }
    public get probeFault(): number { return typeof this.data.probeFault === 'undefined' ? undefined : this.data.probeFault.val; }
    public set probeFault(val: number) {
        if (this.probeFault !== val) {
            this.data.probeFault = sys.board.valueMaps.chemControllerAlarms.transform(val);
            this.hasChanged = true;
        }
    }
    public get pHPumpFault(): number { return typeof this.data.pHPumpFault === 'undefined' ? undefined : this.data.pHPumpFault.val; }
    public set pHPumpFault(val: number) {
        if (this.pHPumpFault !== val) {
            this.data.pHPumpFault = sys.board.valueMaps.chemControllerHardwareFaults.transform(val);
            this.hasChanged = true;
        }
    }
    public get orpPumpFault(): number { return typeof this.data.orpPumpFault === 'undefined' ? undefined : this.data.orpPumpFault.val; }
    public set orpPumpFault(val: number) {
        if (this.orpPumpFault !== val) {
            this.data.orpPumpFault = sys.board.valueMaps.chemControllerHardwareFaults.transform(val);
            this.hasChanged = true;
        }
    }
    public get pHProbeFault(): number { return typeof this.data.pHProbeFault === 'undefined' ? undefined : this.data.pHProbeFault.val; }
    public set pHProbeFault(val: number) {
        if (this.pHProbeFault !== val) {
            this.data.pHProbeFault = sys.board.valueMaps.chemControllerHardwareFaults.transform(val);
            this.hasChanged = true;
        }
    }
    public get orpProbeFault(): number { return typeof this.data.orpProbeFault === 'undefined' ? undefined : this.data.orpProbeFault.val; }
    public set orpProbeFault(val: number) {
        if (this.orpProbeFault !== val) {
            this.data.orpProbeFault = sys.board.valueMaps.chemControllerHardwareFaults.transform(val);
            this.hasChanged = true;
        }
    }
    public get chlorFault(): number { return typeof this.data.chlorFault === 'undefined' ? undefined : this.data.chlorFault.val; }
    public set chlorFault(val: number) {
        if (this.chlorFault !== val) {
            this.data.chlorFault = sys.board.valueMaps.chemControllerHardwareFaults.transform(val);
            this.hasChanged = true;
        }
    }
    public get bodyFault(): number { return typeof this.data.bodyFault === 'undefined' ? undefined : this.data.bodyFault.val; }
    public set bodyFault(val: number) {
        if (this.bodyFault !== val) {
            this.data.bodyFault = sys.board.valueMaps.chemControllerHardwareFaults.transform(val);
            this.hasChanged = true;
        }
    }
    public get flowSensorFault(): number { return typeof this.data.flowSensorFault === 'undefined' ? undefined : this.data.flowSensorFault.val; }
    public set flowSensorFault(val: number) {
        if (this.flowSensorFault !== val) {
            this.data.flowSensorFault = sys.board.valueMaps.chemControllerHardwareFaults.transform(val);
            this.hasChanged = true;
        }
    }
    public get comms(): number { return typeof this.data.comms === 'undefined' ? undefined : this.data.comms.val; }
    public set comms(val: number) {
        if (this.comms !== val) {
            this.data.comms = sys.board.valueMaps.chemControllerStatus.transform(val);
            this.hasChanged = true;
        }
    }
    public get freezeProtect(): number { return typeof this.data.freezeProtect === 'undefined' ? undefined : this.data.freezeProtect.val; }
    public set freezeProtect(val: number) {
        if (this.freezeProtect !== val) {
            this.data.freezeProtect = sys.board.valueMaps.chemControllerAlarms.transform(val);
            this.hasChanged = true;
        }
    }

}
export class AppVersionState extends EqState {
    public get nextCheckTime(): string { return this.data.nextCheckTime; }
    public set nextCheckTime(val: string) { this.setDataVal('nextCheckTime', val); }
    public get isDismissed(): boolean { return this.data.isDismissed; }
    public set isDismissed(val: boolean) { this.setDataVal('isDismissed', val); }
    public get installed(): string { return this.data.installed; }
    public set installed(val: string) { this.setDataVal('installed', val); }
    public get githubRelease(): string { return this.data.githubRelease; }
    public set githubRelease(val: string) { this.setDataVal('githubRelease', val); }
    public get status(): number { return typeof this.data.status === 'undefined' ? undefined : this.data.status.val; }
    public set status(val: number) {
        if (this.status !== val) {
            this.data.status = sys.board.valueMaps.appVersionStatus.transform(val);
            this.hasChanged = true;
        }
    }
    public get gitLocalBranch() { return this.data.gitLocalBranch; }
    public set gitLocalBranch(val: string) { this.data.gitLocalBranch = val; }
    public get gitLocalCommit() { return this.data.gitLocalCommit; }
    public set gitLocalCommit(val: string) { this.data.gitLocalCommit = val; }
}
export class CommsState {
    public keepAlives: number;
}
export class FilterStateCollection extends EqStateCollection<FilterState> {
    public createItem(data: any): FilterState { return new FilterState(data); }
}
export class FilterState extends EqState {
    public dataName: string = 'filter';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get body(): number { return typeof (this.data.body) !== 'undefined' ? this.data.body.val : -1; }
    public set body(val: number) {
        if (this.body !== val) {
            this.data.body = sys.board.valueMaps.bodies.transform(val);
            this.hasChanged = true;
        }
    }
    public get filterType(): number { return typeof this.data.filterType === 'undefined' ? undefined : this.data.filterType.val; }
    public set filterType(val: number) {
        if (this.filterType !== val) {
            this.data.filterType = sys.board.valueMaps.filterTypes.transform(val);
            this.hasChanged = true;
        }
    }
    public get pressureUnits(): number { return this.data.pressureUnits; }
    public set pressureUnits(val: number) {
        if (this.pressureUnits !== val) {
            this.setDataVal('pressureUnits', sys.board.valueMaps.pressureUnits.transform(val));
        }
    }
    public get pressure(): number { return this.data.pressure; }
    public set pressure(val: number) { this.setDataVal('pressure', val); }
    public get refPressure(): number { return this.data.refPressure; }
    public set refPressure(val: number) {
        if (val !== this.refPressure) {
            this.setDataVal('refPressure', val);
            this.calcCleanPercentage();
        }
        else { this.setDataVal('refPressure', val); }
    }
    public get cleanPercentage(): number { return this.data.cleanPercentage; }
    public set cleanPercentage(val: number) { this.setDataVal('cleanPercentage', val); }
    public get lastCleanDate(): Timestamp { return this.data.lastCleanDate; }
    public set lastCleanDate(val: Timestamp) { this.setDataVal('lastCleanDate', val); }
    public get isOn(): boolean { return utils.makeBool(this.data.isOn); }
    public set isOn(val: boolean) { this.setDataVal('isOn', val); }
    public calcCleanPercentage() {
        if (typeof this.refPressure === 'undefined') return;
        let filter = sys.filters.find(elem => elem.id == this.id);
        // 8 to 10
        let cp = filter.cleanPressure || 0;
        let dp = filter.dirtyPressure || 1;
        this.cleanPercentage = (cp - dp != 0) ? Math.round(Math.max(0, (1 - (this.refPressure - cp) / (dp - cp)) * 100) * 100)/100 : 0;
    }
}
export var state = new State();