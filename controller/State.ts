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
import * as fs from 'fs';
import * as path from 'path';
import { setTimeout } from 'timers';
import * as util from 'util';
import { logger } from '../logger/Logger';
import { webApp } from '../web/Server';
import { ControllerType, Timestamp, utils, Heliotrope } from './Constants';
import { sys, Chemical } from './Equipment';
import { versionCheck } from '../config/VersionCheck';

export class State implements IState {
    statePath: string;
    data: any;
    _dirtyList: DirtyStateCollection = new DirtyStateCollection();
    protected _lastUpdated: Date;
    private _isDirty: boolean;
    private _timerDirty: NodeJS.Timeout;
    protected _dt: Timestamp;
    protected _controllerType: ControllerType;
    protected onchange = (obj, fn) => {
        const handler = {
            get(target, property, receiver) {
                const val = Reflect.get(target, property, receiver);
                if (typeof val === 'function') return val.bind(receiver);
                if (typeof (val) === 'object' && val !== null) {
                    if (util.types.isProxy(val))
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
        return Promise.resolve();
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
            time: self.data.time || '',
            // body: self.data.body || {},
            valve: self.data.valve || 0,
            //delay: typeof self.data.delay === 'undefined' ? sys.board.valueMaps.delay.transformByName('nodelay') : self.data.delay,
            delay: self.data.delay || {},
            // adjustDST: self.data.adjustDST || false,
            batteryVoltage: self.data.batteryVoltage || 0,
            status: self.data.status || {},
            mode: self.data.mode || {},
            // freeze: self.data.freeze || false,
            appVersion: sys.appVersion || '',
            appVersionState: self.appVersion.get(true) || {},
            clockMode: sys.board.valueMaps.clockModes.transform(sys.general.options.clockMode) || {},
            clockSource: sys.board.valueMaps.clockSources.transformByName(sys.general.options.clockSource) || {},
            sunrise: self.data.sunrise || '',
            sunset: self.data.sunset || '',
            alias: sys.general.alias
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
    /*     public get body(): number { return this.data.body; }
        public set body(val: number) {
            if (this.body !== val) {
                this.data.body = val;
                this.hasChanged = true;
            }
        } */
    public get delay(): number { return typeof this.data.delay !== 'undefined' ? this.data.delay.val : -1; }
    public set delay(val: number) {
        if (this.delay !== val) {
            this.data.delay = sys.board.valueMaps.delay.transform(val);
            this.hasChanged = true;
        }
    }
    // public get adjustDST(): boolean { return this.data.adjustDST; }
    // public set adjustDST(val: boolean) {
    //     if (this.data.adjustDST !== val) {
    //         this.data.adjustDST = val;
    //     }
    // }
    public get batteryVoltage(): number { return this.data.batteryVoltage; }
    public set batteryVoltage(val: number) {
        if (this.data.batteryVoltage !== val) {
            this.data.batteryVoltage = val;
        }
    }
    public get isInitialized(): boolean { return typeof (this.data.status) !== 'undefined' && this.data.status.val !== 0; }
    public init() {
        console.log(`Init state for Pool Controller`);
        var state = this.loadFile(this.statePath, {});
        state = extend(true, { mode: { val: -1 }, temps: { units: { val: 0, name: 'F', desc: 'Fahrenheit' } } }, state);
        var self = this;
        let pnlTime = typeof state.time !== 'undefined' ? new Date(state.time) : new Date();
        if (isNaN(pnlTime.getTime())) pnlTime = new Date();
        this._dt = new Timestamp(pnlTime);
        this._dt.milliseconds = 0;
        this.data = this.onchange(state, function () { self.dirty = true; });
        this._dt.emitter.on('change', function () {
            self.data.time = self._dt.format();
            self.hasChanged = true;
            self.heliotrope.date = self._dt.toDate();
            self.heliotrope.longitude = sys.general.location.longitude;
            self.heliotrope.latitude = sys.general.location.latitude;
            let times = self.heliotrope.calculatedTimes;
            self.data.sunrise = times.isValid ? Timestamp.toISOLocal(times.sunrise) : '';
            self.data.sunset = times.isValid ? Timestamp.toISOLocal(times.sunset) : '';
            versionCheck.check()
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
    lightingTheme?: number;
    emitEquipmentChange();
    get(bCopy?: boolean);
    showInFeatures?: boolean;
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
            if (this.hasChanged) this.emitData(this.dataName, this.data);
            this.hasChanged = false;
            state._dirtyList.removeEqState(this);
        }
    }
    public emitData(name: string, data: any) { webApp.emitToClients(name, data); }
    protected setDataVal(name, val, persist?: boolean): any {
        if (this.data[name] !== val) {
            // console.log(`Changing state: ${ this.dataName } ${ this.data.id } ${ name }:${ this.data[name] } --> ${ val }`);
            this.data[name] = val;
            if (typeof persist === 'undefined' || persist) this.hasChanged = true;
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
        // If we are not already on the dirty list add us.        
        if (!this._hasChanged && val) {
            let parent = this._pmap['parent'];
            if (typeof parent !== 'undefined' && typeof parent['hasChanged'] !== 'undefined') parent.hasChanged = true;
        }
        this._hasChanged = val;
    }
    public getParent() {
        return this._pmap['parent'];
    }
}
class EqStateCollection<T> {
    protected data: any;
    constructor(data: [], name: string) {
        if (typeof (data[name]) === 'undefined') data[name] = [];
        this.data = data[name];
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
        for (let i = 0; i < this.data.length; i++) {
            if (typeof (this.data[i].id) !== 'undefined' && this.data[i].id === id) {
                rem = this.data.splice(i, 1);
            }
        }
        return rem;
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
    public maybeAddEqState(eqItem: EqState) { if (!this.eqStateExists(eqItem)) this.push(eqItem); }
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
    public get controllerType(): string { return this.data.controllerType; }
    public set controllerType(val: string) { this.setDataVal('controllerType', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get model(): string { return this.data.model; }
    public set model(val: string) { this.setDataVal('model', val); }
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
    // This could be extended to include all the expansion panels but not sure why.
    public getExtended() {
        let obj = this.get(true);
        obj.softwareVersion = sys.equipment.controllerFirmware || "";
        obj.bootLoaderVersion = sys.equipment.bootloaderVersion || "";
        return obj;
    }

}
export class PumpStateCollection extends EqStateCollection<PumpState> {
    public createItem(data: any): PumpState { return new PumpState(data); }
    public getPumpByAddress(address: number, add?: boolean, data?: any) {
        let pmp = this.find(elem => elem.address === address);
        if (typeof pmp !== 'undefined') return this.createItem(pmp);
        if (typeof add !== 'undefined' && add) return this.add(data || { id: this.data.length + 1, address: address });
        return this.createItem(data || { id: this.data.length + 1, address: address });
    }
}
export class PumpState extends EqState {
    public dataName: string = 'pump';
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
    public set rpm(val: number) { this.setDataVal('rpm', val, this.exceedsThreshold(this.data.rpm, val)); }
    public get watts(): number { return this.data.watts; }
    public set watts(val: number) { this.setDataVal('watts', val, this.exceedsThreshold(this.data.watts, val)); }
    public get flow(): number { return this.data.flow; }
    public set flow(val: number) { this.setDataVal('flow', val, this.exceedsThreshold(this.data.flow, val)); }
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
                this.data.status = { name: 'ok', desc: 'Ok', val };
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
        for (let i = 0; i < 8; i++) {
            let c = cpump.circuits.getItemById(i + 1).get(true);
            c.circuit = state.circuits.getInterfaceById(c.circuit).get(true);
            if (typeof c.circuit.id === 'undefined' || typeof c.circuit.name === 'undefined') {
                // return "blank" circuit if none defined
                c.circuit.id = 0;
                c.circuit.name = 'Not Used';
                if (sys.board.valueMaps.pumpTypes.getName(cpump.type) === 'vf') {
                    c.units = sys.board.valueMaps.pumpUnits.getValue('gpm');
                    c.circuit.flow = 0;
                }
                else {
                    c.units = sys.board.valueMaps.pumpUnits.getValue('rpm');
                    c.circuit.speed = 0;
                }
            }
            c.units = sys.board.valueMaps.pumpUnits.transform(c.units);
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
    constructor(data: any, dataName?: string) {
        super(data, dataName);
        if (typeof (data.startDate) === 'undefined') this._startDate = new Date();
        else this._startDate = new Date(data.startDate);
        if (isNaN(this._startDate.getTime())) this._startDate = new Date();
    }
    private _startDate: Date = new Date();
    public get startDate(): Date { return this._startDate; }
    public set startDate(val: Date) { this._startDate = val; this._saveStartDate(); }
    private _saveStartDate() {
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
    public get changeHeatSetpoint(): boolean { return this.data.changeHeatSetpoint; }
    public set changeHeatSetpoint(val: boolean) { this.setDataVal('changeHeatSetpoint', val); }
    public get heatSetpoint(): number { return this.data.heatSetpoint; }
    public set heatSetpoint(val: number) { this.setDataVal('heatSetpoint', val); }
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) { this.setDataVal('isOn', val); }
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
    // eggTimer: number;
    isOn: boolean;
    isActive: boolean;
    dataName: string;
    lightingTheme?: number;
    showInFeatures?: boolean;
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
    // public get eggTimer(): number { return this.data.eggTimer; }
    // public set eggTimer(val: number) { this.setDataVal('eggTimer', val); }
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) { this.setDataVal('isOn', val); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get showInFeatures(): boolean { return typeof this.data.showInFeatures === 'undefined' ? true : this.data.showInFeatures; }
    public set showInFeatures(val: boolean) { this.setDataVal('showInFeatures', val); }
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
}
export class LightGroupStateCollection extends EqStateCollection<LightGroupState> {
    public createItem(data: any): LightGroupState { return new LightGroupState(data); }
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
            this.data.action = sys.board.valueMaps.intellibriteActions.transform(val);
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
    // public get eggTimer(): number { return this.data.eggTimer; }
    // public set eggTimer(val: number) { this.setDataVal('eggTimer', val); }
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) { this.setDataVal('isOn', val); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public async setThemeAsync(val: number) { return sys.board.circuits.setLightThemeAsync; }
    public getExtended() {
        let sgrp = this.get(true); // Always operate on a copy.
        sgrp.circuits = [];
        if (typeof sgrp.lightingTheme === 'undefined') sgrp.lightingTheme = sys.board.valueMaps.lightThemes.transformByName('white');
        if (typeof sgrp.action === 'undefined') sgrp.action = sys.board.valueMaps.intellibriteActions.transform(0);
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
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get circuit(): number { return this.data.circuit; }
    public set circuit(val: number) { this.setDataVal('circuit', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get temp(): number { return this.data.temp; }
    public set temp(val: number) { this.setDataVal('temp', val); }
    public get type():number { return typeof (this.data.type) !== 'undefined' ? this.data.type.val : -1; }
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
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) { this.setDataVal('isOn', val); }
    public emitData(name: string, data: any) { webApp.emitToClients('body', this.data); }
    // RKS: This is a very interesting object because we have a varied object.  Type safety rules should not apply
    // here as the heater types are specific to the installed equipment.  The reason is because it has no meaning without the body and the calculation of it should
    // be performed when the body or heater options change.  However, it shouldn't emit unless
    // there truly is a change but the emit needs to occur at the body temp state level.
    public get heaterOptions(): any { return typeof this.data.heaterOptions === 'undefined' ? this.setDataVal('heaterOptions', {}) : this.data.heaterOptions; }
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
}
export class HeaterStateCollection extends EqStateCollection<HeaterState> {
    public createItem(data: any): HeaterState { return new HeaterState(data); }
}
export class HeaterState extends EqState {
    public dataName: string = 'heater';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) { this.setDataVal('isOn', val); }
    public get isVirtual(): boolean { return this.data.isVirtual; }
    public set isVirtual(val: boolean) { this.setDataVal('isVirtual', val); }
    public get type(): number | any { return typeof this.data.type !== 'undefined' ? this.data.type.val : 0; }
    public set type(val: number | any) {
        if (this.type !== val) {
            this.data.type = sys.board.valueMaps.heaterTypes.transform(val);
            this.hasChanged = true;
        }
    }
}
export class FeatureStateCollection extends EqStateCollection<FeatureState> {
    public createItem(data: any): FeatureState { return new FeatureState(data); }
    public async setFeatureStateAsync(id: number, val: boolean) { return sys.board.features.setFeatureStateAsync(id, val); }
    public async toggleFeatureStateAsync(id: number) { return sys.board.features.toggleFeatureStateAsync(id); }
}
export class FeatureState extends EqState implements ICircuitState {
    public dataName: string = 'feature';
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
}
export class CircuitState extends EqState implements ICircuitState {
    public dataName = 'circuit';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get nameId(): number { return this.data.nameId; }
    public set nameId(val: number) { this.setDataVal('nameId', val); }
    public get showInFeatures(): boolean { return this.data.showInFeatures; }
    public set showInFeatures(val: boolean) { this.setDataVal('showInFeatures', val); }
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) { this.setDataVal('isOn', val); }
    public get type() { return typeof (this.data.type) !== 'undefined' ? this.data.type.val : -1; }
    public set type(val: number) {
        if (this.type !== val) {
            this.data.type = sys.board.valueMaps.circuitFunctions.transform(val);
            this.hasChanged = true;
        }
    }
    public get lightingTheme(): number { return typeof (this.data.lightingTheme) !== 'undefined' ? this.data.lightingTheme.val : 255; }
    public set lightingTheme(val: number) {
        if (this.lightingTheme !== val) {
            this.data.lightingTheme = sys.board.valueMaps.lightThemes.transform(val);
            this.hasChanged = true;
        }
    }
    public get level(): number { return this.data.level; }
    public set level(val: number) { this.setDataVal('level', val); }
}
export class ValveStateCollection extends EqStateCollection<ValveState> {
    public createItem(data: any): ValveState { return new ValveState(data); }
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
    public getExtended(): any {
        let valve = sys.valves.getItemById(this.id);
        let vstate = this.get(true);
        if (valve.circuit !== 256) vstate.circuit = state.circuits.getInterfaceById(valve.circuit).get(true);
        vstate.isIntake = utils.makeBool(valve.isIntake);
        vstate.isReturn = utils.makeBool(valve.isReturn);
        vstate.isVirtual = utils.makeBool(valve.isVirtual);
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
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get isOpen(): boolean { return this.data.isOpen; }
    public set isOpen(val: boolean) { this.setDataVal('isOpen', val); }
}
export class ChlorinatorStateCollection extends EqStateCollection<ChlorinatorState> {
    public createItem(data: any): ChlorinatorState { return new ChlorinatorState(data); }
    public superChlorReference: number = 0;
    public lastDispatchSuperChlor: number = 0;
}
export class ChlorinatorState extends EqState {
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
    public get virtualControllerStatus(): number {
        return typeof (this.data.virtualControllerStatus) !== 'undefined' ? this.data.virtualControllerStatus.val : -1;
    }
    public set virtualControllerStatus(val: number) {
        if (this.virtualControllerStatus !== val) {
            this.data.virtualControllerStatus = sys.board.valueMaps.virtualControllerStatus.transform(val);
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
    public get saltRequired(): number { return this.data.saltRequired; }
    public get saltLevel(): number { return this.data.saltLevel; }
    public set saltLevel(val: number) {
        this.data.saltLevel = val;
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
        if (capacity > 0 && this.saltLevel < 3100) {
            // Salt requirements calculation.
            // Target - SaltLevel = NeededSalt = 3400 - 2900 = 500ppm
            // So to raise 120ppm you need to add 1lb per 1000 gal.
            // (NeededSalt/120ppm) * (MaxBody/1000) = (500/120) * (33000/1000) = 137.5lbs of salt required to hit target.
            let dec = Math.pow(10, 2);
            this.data.saltRequired = Math.round((((3400 - this.saltLevel) / 120) * (capacity / 1000)) * dec) / dec;
        }
        else
            this.data.saltRequired = 0;
    }
    public get superChlor(): boolean { return this.data.superChlor; }
    public set superChlor(val: boolean) {
        this.setDataVal('superChlor', val);
        if (!val && this.superChlorRemaining > 0) this.superChlorRemaining = 0;
    }
    public get superChlorRemaining(): number { return this.data.superChlorRemaining || 0; }
    public set superChlorRemaining(val: number) {
        // Trim the seconds off both of these as we will be keeping the seconds separately since this
        // only reports in minutes.  That way our seconds become self healing.
        if (Math.ceil(this.superChlorRemaining / 60) * 60 !== val) {
            state.chlorinators.superChlorReference = Math.floor(new Date().getTime() / 1000); // Get the epoc and strip the milliseconds.
            this.hasChanged = true;
        }
        let secs = Math.floor(new Date().getTime() / 1000) - state.chlorinators.superChlorReference;
        let remaining = Math.max(0, val - Math.min(secs, 60));
        if (state.chlorinators.lastDispatchSuperChlor - 5 > remaining) this.hasChanged = true;
        if (this.hasChanged) state.chlorinators.lastDispatchSuperChlor = remaining;
        this.data.superChlorRemaining = remaining;
        if (remaining > 0)
            this.setDataVal('superChlor', true);
        else
            this.setDataVal('superChlor', false);
    }
}
export class ChemControllerStateCollection extends EqStateCollection<ChemControllerState> {
    public createItem(data: any): ChemControllerState { return new ChemControllerState(data); }
}

export class ChemControllerState extends EqState {
    public initData() {
        if (typeof this.data.flowDetected === 'undefined') this.data.flowDetected = false;
        if (typeof this.data.orp === 'undefined') this.data.orp = {};
        if (typeof this.data.ph === 'undefined') this.data.ph = {};
        //var chemControllerState = {
        //    lastComm: 'number',             // The unix time the chem controller sent its status.
        //    id: 'number',                   // Id of the chemController.
        //    type: 'valueMap',               // intellichem, homegrown, rem.
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
    public set saturationIndex(val: number) { this.setDataVal('saturationIndex', val || 0); }
    public get firmware(): string { return this.data.firmware; }
    public set firmware(val: string) { this.setDataVal('firmware', val); }
    public get ph(): ChemicalPhState { return new ChemicalPhState(this.data, 'ph', this); }
    public get orp(): ChemicalORPState { return new ChemicalORPState(this.data, 'orp', this); }
    public get warnings(): ChemControllerStateWarnings { return new ChemControllerStateWarnings(this.data, 'warnings'); }
    public get alarms(): ChemControllerStateAlarms { return new ChemControllerStateAlarms(this.data, 'alarms'); }
    public get virtualControllerStatus(): number {
        return typeof (this.data.virtualControllerStatus) !== 'undefined' ? this.data.virtualControllerStatus.val : -1;
    }
    public set virtualControllerStatus(val: number) {
        if (this.virtualControllerStatus !== val) {
            this.data.virtualControllerStatus = sys.board.valueMaps.virtualControllerStatus.transform(val);
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
        if (typeof this.data.tank == 'undefined') this.data.tank = { capacity: 0, level: 0, units: 0 };
        if (typeof this.data.dosingTimeRemaining === 'undefined') this.data.dosingTimeRemaining = 0;
        if (typeof this.data.delayTimeRemaining === 'undefined') this.data.delayTimeRemaining = 0;
        if (typeof this.data.dosingVolumeRemaining === 'undefined') this.data.dosingVolumeRemaining = 0;
        if (typeof this.data.doseVolume === 'undefined') this.data.doseVolume = 0;
        if (typeof this.data.doseTime === 'undefined') this.data.doseTime = 0;
        if (typeof this.data.lockout === 'undefined') this.data.lockout = false;
        if (typeof this.data.level == 'undefined') this.data.level = 0;
        if (typeof this.data.mixTimeRemaining === 'undefined') this.data.mixTimeRemaining = 0;
        if (typeof this.data.dailyLimitReached === 'undefined') this.data.dailyLimitReached = false;
        if (typeof this.data.manualDosing === 'undefined') this.data.manualDosing = false;
        if (typeof this.data.flowDelay === 'undefined') this.data.flowDelay = false;
        if (typeof this.data.dosingStatus === 'undefined') this.dosingStatus = 1;
        if (typeof this.data.enabled === 'undefined') this.data.enabeled = true;
    }
    public get enabled(): boolean { return this.data.enabled; }
    public set enabled(val: boolean) { this.data.enabled = val; }
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
    public get mixTimeRemaining(): number { return this.data.mixTimeRemaining; }
    public set mixTimeRemaining(val: number) { this.setDataVal('mixTimeRemaining', val); }
    public get dosingStatus(): number { return typeof (this.data.dosingStatus) !== 'undefined' ? this.data.dosingStatus.val : undefined; }
    public set dosingStatus(val: number) {
        if (this.dosingStatus !== val) {
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
    public get dailyLimitReached(): boolean { return utils.makeBool(this.data.dailyLimitReached); }
    public set dailyLimitReached(val: boolean) { this.data.dailyLimitReached = val; }
    public get tank(): ChemicalTankState { return new ChemicalTankState(this.data, 'tank', this); }
    public get pump(): ChemicalPumpState { return new ChemicalPumpState(this.data, 'pump', this); }
    public getExtended() {
        let chem = this.get(true);
        chem.tank = this.tank.getExtended();
        chem.pump = this.pump.getExtended();
        return chem;
    }

}
export class ChemicalPhState extends ChemicalState {
    public initData() {
        if (typeof this.data.chemType === 'undefined') this.data.chemType === 'acid';
        super.initData();
    }
    public get chemType() { return 'acid'; }
    public get probe(): ChemicalProbePHState { return new ChemicalProbePHState(this.data, 'probe', this); }
    public getExtended() {
        let chem = super.getExtended();
        chem.probe = this.probe.getExtended();
        return chem;
    }
}
export class ChemicalORPState extends ChemicalState {
    public initData() {
        if (typeof this.data.probe === 'undefined') this.data.probe = {};
        if (typeof this.data.chemType === 'undefined') this.data.chemType === 'orp';
        super.initData();
    }
    public get chemType() { return 'orp'; }
    public get probe() { return new ChemicalProbeORPState(this.data, 'probe', this); }
    public getExtended() {
        let chem = super.getExtended();
        chem.probe = this.probe.getExtended();
        return chem;
    }
}
export class ChemicalPumpState extends ChildEqState {
    public initData() {
        if (typeof this.data.isDosing === 'undefined') this.data.isDosing = false;
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
export class ChemicalProbeState extends ChildEqState {
    public initData() {
        if (typeof this.data.level === 'undefined') this.data.level = null;
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
    }
    public get level(): number { return this.data.level; }
    public set level(val: number) { this.setDataVal('level', val); }
    public get capacity(): number { return this.data.capacity; }
    public set capacity(val: number) { this.setDataVal('capacity', val); }
    public get units(): number | any { return typeof this.data.units !== 'undefined' ? this.data.units.val : undefined; }
    public set units(val: number | any) {
        let v = sys.board.valueMaps.volumeUnits.encode(val);
        if (this.units !== v) {
            this.data.units = sys.board.valueMaps.volumeUnits.transform(val);
            this.hasChanged = true;
        }
    }
}


export class ChemControllerStateWarnings extends EqState {
    ctor(data): ChemControllerStateWarnings { return new ChemControllerStateWarnings(data, name || 'warnings'); }
    public dataName = 'chemControllerWarnings';
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
export class ChemControllerStateAlarms extends EqState {
    ctor(data): ChemControllerStateWarnings { return new ChemControllerStateWarnings(data, name || 'alarms'); }
    public dataName = 'chemControllerAlarms';
    public get flow(): number { return typeof this.data.flow === 'undefined' ? undefined : this.data.flow.val; }
    public set flow(val: number) {
        if (this.flow !== val) {
            this.data.flow = sys.board.valueMaps.chemControllerAlarms.transform(val);
            this.hasChanged = true;
        }
    }
    public get pH(): number { return typeof this.data.pH === 'undefined' ? undefined : this.data.pH.val.pH; }
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
    public get comms(): number { return typeof this.data.comms === 'undefined' ? undefined : this.data.comms.val; }
    public set comms(val: number) {
        if (this.comms !== val) {
            this.data.comms = sys.board.valueMaps.chemControllerStatus.transform(val);
            this.hasChanged = true;
        }
    }
}
export class AppVersionState extends EqState{
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
    public get psi(): number { return this.data.psi; }
    public set psi(val: number) { this.setDataVal('psi', val); }
    public get filterPsi(): number { return this.data.filterPsi; } // do not exceed value.  
    public set filterPsi(val: number) { this.setDataVal('filterPsi', val); }
    public get lastCleanDate(): Timestamp { return this.data.lastCleanDate; }
    public set lastCleanDate(val: Timestamp) { this.setDataVal('lastCleanDate', val); }
    public get needsCleaning(): number { return this.data.needsCleaning; }
    public set needsCleaning(val: number) { this.setDataVal('needsCleaning', val); }

}
export var state = new State();