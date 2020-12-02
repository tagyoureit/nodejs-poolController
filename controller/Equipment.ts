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
import * as path from "path";
import * as fs from "fs";
import * as extend from "extend";
import * as util from "util";
import { setTimeout } from "timers";
import { logger } from "../logger/Logger";
import { state, CommsState } from "./State";
import { Timestamp, ControllerType, utils } from "./Constants";
export { ControllerType };
import { webApp } from "../web/Server";
import { SystemBoard, EquipmentIdRange } from "./boards/SystemBoard";
import { BoardFactory } from "./boards/BoardFactory";
import { EquipmentStateMessage } from "./comms/messages/status/EquipmentStateMessage";
import { conn } from './comms/Comms';
import { versionCheck } from "../config/VersionCheck";
import { NixieControlPanel } from "./nixie/Nixie";
interface IPoolSystem {
    cfgPath: string;
    data: any;
    stopAsync(): void;
    persist(): void;
    general: General;
    equipment: Equipment;
    configVersion: ConfigVersion;
    bodies: BodyCollection;
    schedules: ScheduleCollection;
    circuits: CircuitCollection;
    features: FeatureCollection;
    pumps: PumpCollection;
    chlorinators: ChlorinatorCollection;
    filters: FilterCollection;
    valves: ValveCollection;
    heaters: HeaterCollection;
    covers: CoverCollection;
    circuitGroups: CircuitGroupCollection;
    remotes: RemoteCollection;
    eggTimers: EggTimerCollection;
    security: Security;
    chemControllers: ChemControllerCollection;
    board: SystemBoard;
    updateControllerDateTimeAsync(
        hour: number,
        min: number,
        date: number,
        month: number,
        year: number,
        dst: number,
        dow?: number
    ): void;
}

export class PoolSystem implements IPoolSystem {
    public _hasChanged: boolean=false;
    constructor() {
        this.cfgPath = path.posix.join(process.cwd(), '/data/poolConfig.json');
        setTimeout(()=>{this.searchForAdditionalDevices();}, 7500);
    }
    public init() {
        let cfg = this.loadConfigFile(this.cfgPath, {});
        let cfgDefault = this.loadConfigFile(path.posix.join(process.cwd(), '/defaultPool.json'), {});
        cfg = extend(true, {}, cfgDefault, cfg);
        this.data = this.onchange(cfg, function() { sys.dirty = true; });
        this.general = new General(this.data, 'pool');
        this.equipment = new Equipment(this.data, 'equipment');
        this.configVersion = new ConfigVersion(this.data, 'configVersion');
        this.bodies = new BodyCollection(this.data, 'bodies');
        this.schedules = new ScheduleCollection(this.data, 'schedules');
        this.circuits = new CircuitCollection(this.data, 'circuits');
        this.features = new FeatureCollection(this.data, 'features');
        this.pumps = new PumpCollection(this.data, 'pumps');
        this.chlorinators = new ChlorinatorCollection(this.data, 'chlorinators');
        this.valves = new ValveCollection(this.data, 'valves');
        this.heaters = new HeaterCollection(this.data, 'heaters');
        this.covers = new CoverCollection(this.data, 'covers');
        this.circuitGroups = new CircuitGroupCollection(this.data, 'circuitGroups');
        this.lightGroups = new LightGroupCollection(this.data, 'lightGroups');
        this.remotes = new RemoteCollection(this.data, 'remotes');
        this.security = new Security(this.data, 'security');
        this.customNames = new CustomNameCollection(this.data, 'customNames');
        this.eggTimers = new EggTimerCollection(this.data, 'eggTimers');
        this.chemControllers = new ChemControllerCollection(this.data, 'chemControllers');
        this.filters = new FilterCollection(this.data, 'filters');
        this.data.appVersion = state.appVersion.installed = this.appVersion =  JSON.parse(fs.readFileSync(path.posix.join(process.cwd(), '/package.json'), 'utf8')).version;
        versionCheck.compare(); // if we installed a new version, reset the flag so we don't show an outdated message for up to 2 days 
        this.board = BoardFactory.fromControllerType(this.controllerType, this);
    }
    // This performs a safe load of the config file.  If the file gets corrupt or actually does not exist
    // it will not break the overall system and allow hardened recovery.
    public async updateControllerDateTimeAsync(obj: any) { return sys.board.system.setDateTimeAsync(obj); }
    private loadConfigFile(path: string, def: any) {
        let cfg = def;
        if (fs.existsSync(path)) {
            try {
                cfg = JSON.parse(fs.readFileSync(path, 'utf8') || '{}');
            }
            catch (ex) {
                cfg = def;
            }
        }
        return cfg;
    }
    public resetSystem() {
        conn.pause();
        this.resetData();
        state.resetData();
        this.data.controllerType === 'unknown';
        state.equipment.controllerType = ControllerType.Unknown;
        this.controllerType = ControllerType.Unknown;
        state.status = 0;
        this.board = BoardFactory.fromControllerType(ControllerType.Unknown, this);
        setTimeout(function () { state.status = 0; conn.resume(); }, 0);
    }
    public get controllerType(): ControllerType { return this.data.controllerType as ControllerType; }
    public set controllerType(val: ControllerType) {
        if (this.controllerType !== val) {
            console.log('RESETTING DATA');
            // Only go in here if there is a change to the controller type.
            this.resetData(); // Clear the configuration data.
            state.resetData(); // Clear the state data.
            this.data.controllerType = val;
            EquipmentStateMessage.initDefaults();
            // We are actually changing the config so lets clear out all the data.
            this.board = BoardFactory.fromControllerType(val, this);
            if (this.data.controllerType === ControllerType.Unknown) setTimeout(()=>{this.searchForAdditionalDevices();}, 7500);
        }
    }
    public resetData() {
        this.circuitGroups.clear();
        this.lightGroups.clear();
        this.circuits.clear();
        this.bodies.clear();
        this.chlorinators.clear();
        this.configVersion.clear();
        this.covers.clear();
        this.customNames.clear();
        this.equipment.clear();
        this.features.clear();
        this.data.general = {};
        this.heaters.clear();
        this.pumps.clear();
        this.remotes.clear();
        this.schedules.clear();
        this.security.clear();
        this.valves.clear();
        this.chemControllers.clear();
        this.filters.clear();
        if (typeof this.data.eggTimers !== 'undefined') this.eggTimers.clear();
    }
    public async stopAsync() {
        if (this._timerChanges) clearTimeout(this._timerChanges);
        if (this._timerDirty) clearTimeout(this._timerDirty);
        return this.board.stopAsync();
    }
    public searchForAdditionalDevices() {
        if (this.controllerType === ControllerType.Unknown || typeof this.controllerType === 'undefined' && !conn.mockPort){    
            logger.info("Searching chlorinators, pumps and chem controllers");
            EquipmentStateMessage.initVirtual();
            sys.board.virtualChlorinatorController.search();
            sys.board.virtualPumpControllers.search();
            sys.board.virtualChemControllers.search();
        }  
        else {
            if (this.controllerType === ControllerType.Virtual){
                state.mode = 0;
                state.status = 1;
                sys.equipment.setEquipmentIds();
                state.emitControllerChange();
            }
            // if the app crashes while the pumps are running we need to reset the 'virtualControllerStatus' to stopped so it can start again
            sys.board.virtualPumpControllers.softStop();
            sys.board.virtualChlorinatorController.stop();
            sys.board.virtualChemControllers.stop();
            // try to start any virtual controllers that are present irregardless of overall controller virtual status
            sys.board.virtualPumpControllers.start();
            sys.board.virtualChlorinatorController.start();
            sys.board.virtualChemControllers.start();
        }  

     }
    public board: SystemBoard = new SystemBoard(this);
    public ncp: NixieControlPanel = new NixieControlPanel();
    public processVersionChanges(ver: ConfigVersion) { this.board.requestConfiguration(ver); }
    public checkConfiguration() { this.board.checkConfiguration(); }
    public cfgPath: string;
    public data: any;
    protected _lastUpdated: Date;
    protected _isDirty: boolean;
    protected _timerDirty: NodeJS.Timeout=null;
    protected _timerChanges: NodeJS.Timeout;
    protected _needsChanges: boolean;
    // All the equipment items below.
    public general: General;
    public equipment: Equipment;
    public configVersion: ConfigVersion;
    public bodies: BodyCollection;
    public schedules: ScheduleCollection;
    public eggTimers: EggTimerCollection;
    public circuits: CircuitCollection;
    public features: FeatureCollection;
    public pumps: PumpCollection;
    public chlorinators: ChlorinatorCollection;
    public valves: ValveCollection;
    public heaters: HeaterCollection;
    public covers: CoverCollection;
    public circuitGroups: CircuitGroupCollection;
    public lightGroups: LightGroupCollection;
    public remotes: RemoteCollection;
    public security: Security;
    public customNames: CustomNameCollection;
    public chemControllers: ChemControllerCollection;
    public filters: FilterCollection;
    public appVersion: string;
    public get dirty(): boolean { return this._isDirty; }
    public set dirty(val) {
        this._isDirty = val;
        this._lastUpdated = new Date();
        this.data.lastUpdated = this._lastUpdated.toLocaleString();
        if (this._timerDirty !== null) {
            clearTimeout(this._timerDirty);
            this._timerDirty = null;
        }
        if (this._isDirty) {
            this._timerDirty = setTimeout(() => this.persist(), 3000);
        }
    }
    public persist() {
        this._isDirty = false;
        // Don't overwrite the configuration if we failed during the initialization.
        if (typeof sys.circuits === 'undefined' || !this.circuits === null) {
            logger.info(`SKIPPING persist equipment because it is empty!`);
            return;
        }
        sys.emitEquipmentChange();
        Promise.resolve()
            .then(() => { fs.writeFileSync(sys.cfgPath, JSON.stringify(sys.data, undefined, 2)); })
            .catch(function(err) { if (err) logger.error('Error writing pool config %s %s', err, sys.cfgPath); });
    }
    // We are doing this because TS is lame. Accessing the app servers from the routes causes a cyclic include.
    public findServersByType(type: string) {
        let srv = [];
        let servers = webApp.findServersByType(type);
        for (let i = 0; i < servers.length; i++) {
            srv.push({
                uuid: servers[i].uuid,
                name: servers[i].name,
                type: servers[i].type,
                isRunning: servers[i].isRunning,
                isConnected: servers[i].isConnected
            });
        }
        return srv;
    }
    protected onchange=(obj, fn) => {
        const handler = {
            get(target, property, receiver) {
                // console.log(`getting prop: ${property} -- dataName? ${target.length}`)
                const val = Reflect.get(target, property, receiver);
                if (typeof val === 'function') return val.bind(receiver);
                if (typeof val === 'object' && val !== null) {
                    if (util.types.isProxy(val)) return val;
                    return new Proxy(val, handler);
                }
                return val;
            },
            set(target, property, value, receiver) {
                if (property !== 'lastUpdated' && Reflect.get(target, property, receiver) !== value) {
                    fn();
                }
                return Reflect.set(target, property, value, receiver);
            },
            deleteProperty(target, property) {
                if (property in target) Reflect.deleteProperty(target, property);
                return true;
            }
        };
        return new Proxy(obj, handler);
    };
    public getSection(section?: string, opts?: any): any {
        if (typeof section === 'undefined' || section === 'all') return this.data;
        let c: any = this.data;
        c = c[section];
        if (typeof c !== 'object')
            // return single values as objects so browsers don't complain
            return { [section]: c };
        else if (Array.isArray(c))
            return extend(true, [], opts || [], c || []);
        else
            return extend(true, {}, opts || {}, c || {});
    }
    public get equipmentState() {
        const self = this;
        return {
            lastUpdated: self._lastUpdated || 0,
            controllerType: self.data.controllerType || ControllerType.Unknown,
            pool: self.data.pool || {},
            bodies: self.data.bodies || [],
            schedules: self.data.schedules || [],
            eggTimers: self.data.eggTimers || [],
            customNames: self.data.customNames || [],
            equipment: self.data.equipment || {},
            valves: self.data.valves || [],
            circuits: self.data.circuits || [],
            features: self.data.features || [],
            pumps: self.data.pumps || [],
            chlorinators: self.data.chlorinators || [],
            remotes: self.data.remotes || [],
            heaters: self.data.heaters || [],
            covers: self.data.covers || [],
            appVersion: self.data.appVersion || '0.0.0'
        };
    }
    public emitEquipmentChange() {
        if (sys._hasChanged) {
            this.emitData('config', this.equipmentState);
            sys._hasChanged = false;
        }
    }
    public emitData(name: string, data: any) {
        webApp.emitToClients(name, data);
    }
}
interface IEqItemCreator<T> { ctor(data: any, name: string): T; }
interface IEqItem {
    set(data);
    clear();
    hasChanged: boolean;
    get(bCopy: boolean);
}
class EqItem implements IEqItemCreator<EqItem>, IEqItem {
    public dataName: string;
    protected data: any;
    public get hasChanged(): boolean { return sys._hasChanged; }
    public set hasChanged(val: boolean) {
        if (!sys._hasChanged && val) {
            sys._hasChanged = true;
        }
    }
    public get master(): number | any { return this.data.master || 0; }
    public set master(val: number | any) { this.setDataVal('master', sys.board.valueMaps.equipmentMaster.encode(val)); }
    ctor(data, name?: string): EqItem { return new EqItem(data, name); }
    constructor(data, name?: string) {
        if (typeof name !== 'undefined') {
            if (typeof data[name] === 'undefined') data[name] = {};
            this.data = data[name];
            this.dataName = name;
            this.initData();
        } else {
            this.data = data;
            this.initData();
        }
    }
    public initData() { if (typeof this.data.master === 'undefined') this.data.master = sys.board.equipmentMaster; }
    public get(bCopy?: boolean): any {
        // RSG: 7/2/20 - extend was deep copying arrays (eg pump circuits) by reference
        // return bCopy ? extend(true, {}, this.data) : this.data;
        return bCopy ? JSON.parse(JSON.stringify(this.data)) : this.data;
    }
    public clear() {
        for (let prop in this.data) {
            if (Array.isArray(this.data[prop])) this.data[prop].length = 0;
            else this.data[prop] = undefined;
        }
    }
    // This is a tricky endeavor.  If we run into a collection then we need to obliterate the existing data and add in our data.
    public set(data: any) {
        let op = Object.getOwnPropertyNames(Object.getPrototypeOf(this))
        for (let i in op) {
            let prop = op[i];
            if (typeof this[prop] === 'function') continue;
            if (typeof data[prop] !== 'undefined') {
                if (this[prop] instanceof EqItemCollection) {
                    ((this[prop] as unknown) as IEqItemCollection).set(data[prop]);
                }
                else if (this[prop] instanceof EqItem)
                    ((this[prop] as unknown) as IEqItem).set(data[prop]);
                else{
                    if (typeof this[prop] === null || typeof data[prop] === null) continue;
                    this[prop] = data[prop];
                    // RSG 7/13/2020 - type safety against a user sending the wrong type
                    // (eg clockSource=3 or clockSource=manual)
                    // Would be nice to convert types here, but we would need a mapping 
                    // of objects to valueMaps and it isn't worth it (we would still be guessing)
                    // for something like "type" anyway 
                    // RSG 7/16/2020 Rstrouse pointed out to me this would exclude us setting
                    // that was already undefined so relaxed the restriction a bit
                } 
             }
        }
    } 
    protected setDataVal(name, val, persist?: boolean) {
        if (this.data[name] !== val) {
            // console.log(`Changing equipment: ${this.dataName} ${this.data.id} ${name}:${this.data[name]} --> ${val}`);
            this.data[name] = val;
            if (typeof persist === 'undefined' || persist) this.hasChanged = true;
        }
        else if (typeof persist !== 'undefined' && persist) this.hasChanged = true;
    }
   
}
class ChildEqItem extends EqItem {
    private _pmap = new WeakSet();
    //private _dataKey = { id: 'parent' };
    constructor(data: any, name: string, parent) {
        super(data, name);
        this._pmap['parent'] = parent;
    }
    public getParent() {
        return this._pmap['parent'];
    }
}
interface IEqItemCollection {
    set(data);
    clear();
}
class EqItemCollection<T> implements IEqItemCollection {
    protected data: any;
    protected name: string;
    constructor(data: any, name?: string) {
        if (typeof name === 'undefined') {
            this.data = data;
        }
        else {
            if (typeof data[name] === "undefined") data[name] = [];
            this.data = data[name];
            this.name = name;
        }
    }
    public getItemByIndex(ndx: number, add?: boolean, data?: any): T {
        if (this.data.length > ndx) return this.createItem(this.data[ndx]);
        if (typeof add !== 'undefined' && add)
            return this.add(extend({}, { id: ndx + 1 }, data));
        return this.createItem(extend({}, { id: ndx + 1 }, data));
    }
    public getItemById(id: number | string, add?: boolean, data?: any): T {
        let itm = this.find(elem => elem.id === id && typeof elem.id !== 'undefined');
        if (typeof itm !== 'undefined') return itm;
        if (typeof add !== 'undefined' && add) return this.add(data || { id: id });
        return this.createItem(data || { id: id });
    }
    public removeItemById(id: number | string): T {
        let rem: T = null;
        for (let i = this.data.length - 1; i >= 0; i--)
            if (typeof this.data[i].id !== 'undefined' && this.data[i].id === id) {
                rem = this.data.splice(i, 1);
                return rem;
            }
        return rem;
    }
    public set(data) {
        if (typeof data !== 'undefined') {
            if (Array.isArray(data)) {
                this.clear();
                for (let i = 0; i < data.length; i++) {
                    // We are getting clever here in that we are simply adding the object and the add method
                    // should take care of hooking it all up.
                    this.add(data[i]);
                }
            }
        }
    }
    public removeItemByIndex(ndx: number) {
        this.data.splice(ndx, 1);
    }
    // Finds an item and returns undefined if it doesn't exist.
    public find(f: (value:any, index?:number, obj?:any) => boolean): T {
        let itm = this.data.find(f);
        if (typeof itm !== 'undefined') return this.createItem(itm);
    }
    // This will return a new collection of this type. NOTE: This is a separate object but the data is still attached to the
    // overall configuration.  This meanse that changes made to the objects in the collection will reflect in the configuration.
    // HOWEVER, any of the array manipulation methods like removeItemBy..., add..., or creation methods will not modify the configuration.
    public filter(f: (value: T, index?: any, array?: any[]) => boolean): EqItemCollection<T> {
        return new EqItemCollection<T>(this.data.filter(f));
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
    public createItem(data: any): T { return (new EqItem(data) as unknown) as T; }
    public clear() { this.data.length = 0; }
    public get length(): number { return typeof this.data !== 'undefined' ? this.data.length : 0; }
    public set length(val: number) { if (typeof val !== 'undefined' && typeof this.data !== 'undefined') this.data.length = val; }
    public add(obj: any): T { this.data.push(obj); return this.createItem(obj); }
    public get(): any { return this.data; }
    public emitEquipmentChange() { webApp.emitToClients(this.name, this.data); }
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
    public getNextEquipmentId(range: EquipmentIdRange): number {
        for (let i = range.start; i <= range.end; i++) {
            let eq = this.data.find(elem => elem.id === i);
            if (typeof eq === 'undefined') return i;
        }
    }
    public getMaxId(activeOnly?: boolean, defId?:number) {
        let maxId;
        for (let i = 0; i < this.data.length; i++) {
            if (typeof this.data[i].id !== 'undefined') {
                if (typeof activeOnly !== 'undefined' && this.data[i].isActive === false) continue;
                maxId = Math.max(maxId || 0, this.data[i].id);
            }
        }
        return typeof maxId !== 'undefined' ? maxId : defId;
    }
    public getMinId(activeOnly?: boolean, defId?:number) {
        let minId;
        for (let i = 0; i < this.data.length; i++) {
            if (typeof this.data[i].id !== 'undefined') {
                if (typeof activeOnly !== 'undefined' && this.data[i].isActive === false) continue;
                minId = Math.min(minId || this.data[i].id, this.data[i].id);
            }
        }
        return typeof minId !== 'undefined' ? minId : defId;
    }
}
export class General extends EqItem {
    ctor(data): General { return new General(data, name || 'pool'); }
    public get alias(): string { return this.data.alias; }
    public set alias(val: string) { this.setDataVal('alias', val); }
    public get owner(): Owner { return new Owner(this.data, 'owner'); }
    public get options(): Options { return new Options(this.data, 'options'); }
    public get location(): Location { return new Location(this.data, 'location'); }
}
// Custom Names are IntelliTouch Only
export class CustomNameCollection extends EqItemCollection<CustomName> {
    constructor(data: any, name?: string) { super(data, name || "customNames"); }
    public createItem(data: any): CustomName { return new CustomName(data); }
}
export class CustomName extends EqItem {
    public dataName = 'customNameConfig';
    public set id(val: number) { this.setDataVal('id', val); }
    public get id(): number { return this.data.id; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
}
export class Owner extends EqItem {
    public dataName='ownerConfig';
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get phone(): string { return this.data.phone; }
    public set phone(val: string) { this.setDataVal('phone', val); }
    public get email(): string { return this.data.email; }
    public set email(val: string) { this.setDataVal('email', val); }
    public get email2(): string { return this.data.email2; }
    public set email2(val: string) { this.setDataVal('email2', val); }
    public get phone2(): string { return this.data.phone2; }
    public set phone2(val: string) { this.setDataVal('phone2', val); }
}
// Temp sensors are a bit different than other equipment items in that the collection does
// not use numeric ids.  This could have been implemented where each potential sensor is identified
// on a tempSensors object and would have been more straight forward but would have limited the potential sensors
// to known items.  This approach will allow the ability to include temperature sensors outside that list without
// having to modify external temperature feeds.  Think of binding as the id of the sensor which must be unique for
// all defined sensors.  The get/set calibration methods resolve the sensors and maintain the data from a single point.
export class TempSensorCollection extends EqItemCollection<TempSensor> {
    constructor(data: any, name?: string) { super(data, name || "tempSensors"); }
    public createItem(data: any): TempSensor { return new TempSensor(data); }
    public setCalibration(id: string, cal: number): TempSensor {
        let sensor = this.getItemById(id);
        sensor.calibration = cal;
        return sensor;
    }
    public getCalibration(id: string): number {
        let sensor = this.getItemById(id);
        return sensor.calibration || 0;
    }
}
export class TempSensor extends EqItem {
    public dataName='sensorConfig';
    public set id(val: string) { this.setDataVal('id', val); }
    public get id(): string { return this.data.id; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get calibration(): number { return this.data.calibration; }
    public set calibration(val: number) { this.setDataVal('calibration', val); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
}
export class Options extends EqItem {
    public dataName='optionsConfig';
    public get clockMode(): number | any { return this.data.clockMode; }
    public set clockMode(val: number | any) { this.setDataVal('clockMode', sys.board.valueMaps.clockModes.encode(val)); }
    public get units(): number | any { return this.data.units; }
    public set units(val: number | any) { this.setDataVal('units', sys.board.valueMaps.tempUnits.encode(val)); }
    public get clockSource(): string { return this.data.clockSource; }
    public set clockSource(val: string) { this.setDataVal('clockSource', val); }
    public get adjustDST(): boolean { return this.data.adjustDST; }
    public set adjustDST(val: boolean) { this.setDataVal('adjustDST', val); }
    public get manualPriority(): boolean { return this.data.manualPriority; }
    public set manualPriority(val: boolean) { this.setDataVal('manualPriority', val); }
    public get vacationMode(): boolean { return this.data.vacationMode; }
    public set vacationMode(val: boolean) { this.setDataVal('vacationMode', val); }
    public get manualHeat(): boolean { return this.data.manualHeat; }
    public set manualHeat(val: boolean) { this.setDataVal('manualHeat', val); }
    public get pumpDelay(): boolean { return this.data.pumpDelay; }
    public set pumpDelay(val: boolean) { this.setDataVal('pumpDelay', val); }
    public get cooldownDelay(): boolean { return this.data.cooldownDelay; }
    public set cooldownDelay(val: boolean) { this.setDataVal('cooldownDelay', val); }
    //public get airTempAdj(): number { return typeof this.data.airTempAdj === 'undefined' ? 0 : this.data.airTempAdj; }
    //public set airTempAdj(val: number) { this.setDataVal('airTempAdj', val); }
    //public get waterTempAdj1(): number { return typeof this.data.waterTempAdj1 === 'undefined' ? 0 : this.data.waterTempAdj1; }
    //public set waterTempAdj1(val: number) { this.setDataVal('waterTempAdj1', val); }
    //public get solarTempAdj1(): number { return typeof this.data.solarTempAdj1 === 'undefined' ? 0 : this.data.solarTempAdj1; }
    //public set solarTempAdj1(val: number) { this.setDataVal('solarTempAdj1', val); }
    //public get waterTempAdj2(): number { return typeof this.data.waterTempAdj2 === 'undefined' ? 0 : this.data.waterTempAdj2; }
    //public set waterTempAdj2(val: number) { this.setDataVal('waterTempAdj2', val); }
    //public get solarTempAdj2(): number { return typeof this.data.solarTempAdj2 === 'undefined' ? 0 : this.data.solarTempAdj2; }
    //public set solarTempAdj2(val: number) { this.setDataVal('solarTempAd2', val); }
}
export class Location extends EqItem {
    public dataName='locationConfig';
    public get address(): string { return this.data.address; }
    public set address(val: string) { this.setDataVal('address', val); }
    public get city(): string { return this.data.city; }
    public set city(val: string) { this.setDataVal('city', val); }
    public get state(): string { return this.data.state; }
    public set state(val: string) { this.setDataVal('state', val); }
    public get zip(): string { return this.data.zip; }
    public set zip(val: string) { this.setDataVal('zip', val); }
    public get country(): string { return this.data.country; }
    public set country(val: string) { this.setDataVal('country', val); }
    public get latitude(): number { return this.data.latitude; }
    public set latitude(val: number) { this.setDataVal('latitude', val); }
    public get longitude(): number { return this.data.longitude; }
    public set longitude(val: number) { this.setDataVal('longitude', val); }
    public get timeZone(): number | any { return this.data.timeZone; }
    public set timeZone(val: number | any) { this.setDataVal('timeZone', sys.board.valueMaps.timeZones.encode(val)); }
}
export class ExpansionModuleCollection extends EqItemCollection<ExpansionModule> {
    constructor(data: any, name?: string) { super(data, name || "modules"); }
    public createItem(data: any): ExpansionModule { return new ExpansionModule(data); }
}
export class ExpansionModule extends EqItem {
    public dataName = 'expansionModuleConfig';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get desc(): string { return this.data.desc; }
    public set desc(val: string) { this.setDataVal('desc', val); }
    public get type(): number { return this.data.type; }
    public set type(val: number) { this.setDataVal('type', sys.board.valueMaps.expansionBoards.encode(val)); }
    public get part(): string { return this.data.part; }
    public set part(val: string) { this.setDataVal('part', val); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
}
export class ExpansionPanelCollection extends EqItemCollection<ExpansionPanel> {
    constructor(data: any, name?: string) { super(data, name || "expansions"); }
    public createItem(data: any): ExpansionPanel { return new ExpansionPanel(data); }
}
export class ExpansionPanel extends EqItem {
    public dataName='expansionPanelConfig';
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get type(): number { return this.data.type; }
    public set type(val: number) { this.setDataVal('type', val); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get modules(): ExpansionModuleCollection { return new ExpansionModuleCollection(this.data, "modules"); }
}
export class Equipment extends EqItem {
    public dataName='equipmentConfig';
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get type(): number { return this.data.type; }
    public set type(val: number) { this.setDataVal('type', val); }
    public get shared(): boolean { return this.data.shared; }
    public set shared(val: boolean) { this.setDataVal('shared', val); }
    public get dual(): boolean { return this.data.dual; }
    public set dual(val: boolean) { this.setDataVal('dual', val); }
    public get maxBodies(): number { return this.data.maxBodies || 4; }
    public set maxBodies(val: number) { this.setDataVal('maxBodies', val); }
    public get maxValves(): number { return this.data.maxValves || 26; }
    public set maxValves(val: number) { this.setDataVal('maxValves', val); }
    public get maxPumps(): number { return this.data.maxPumps || 16; }
    public set maxPumps(val: number) { this.setDataVal('maxPumps', val); }
    public set maxSchedules(val: number) { this.setDataVal('maxSchedules', val); }
    public get maxSchedules(): number { return this.data.maxSchedules || 12; }
    public get maxCircuits(): number { return this.data.maxCircuits || 3; }
    public set maxCircuits(val: number) { this.setDataVal('maxCircuits', val); }
    public get maxFeatures(): number { return this.data.maxFeatures || 10; }
    public set maxFeatures(val: number) { this.setDataVal('maxFeatures', val); }
    public get maxRemotes(): number { return this.data.maxRemotes || 9; }
    public set maxRemotes(val: number) { this.setDataVal('maxRemotes', val); }
    public get maxCircuitGroups(): number { return this.data.maxCircuitGroups || 32; }
    public set maxCircuitGroups(val: number) { this.setDataVal('maxCircuitGroups', val); }
    public get maxLightGroups(): number { return this.data.maxLightGroups || 40; }
    public set maxLightGroups(val: number) { this.setDataVal('maxLightGroups', val); }
    public get maxChlorinators(): number { return this.data.maxChlorinators || 1; }
    public set maxChlorinators(val: number) { this.setDataVal('maxChlorinators', val); }
    public get maxHeaters(): number { return this.data.maxHeaters || 16; }
    public set maxHeaters(val: number) { this.setDataVal('maxHeaters', val); }
    public get model(): string { return this.data.model; }
    public set model(val: string) { this.setDataVal('model', val); }
    public get maxIntelliBrites(): number { return this.data.maxIntelliBrites; }
    public set maxIntelliBrites(val: number) { this.setDataVal('maxIntelliBrites', val); }
    public get maxChemControllers(): number { return this.data.maxChemControllers; }
    public set maxChemControllers(val: number) { this.setDataVal('maxChemControllers', val); }
    public get expansions(): ExpansionPanelCollection { return new ExpansionPanelCollection(this.data, "expansions"); }
    public get modules(): ExpansionModuleCollection { return new ExpansionModuleCollection(this.data, "modules"); }
    public get maxCustomNames(): number { return this.data.maxCustomNames || 10; }
    public set maxCustomNames(val: number) { this.setDataVal('maxCustomNames', val); }
    public get tempSensors(): TempSensorCollection { return new TempSensorCollection(this.data); }

    // Looking for IntelliCenter 1.029
    public set controllerFirmware(val: string) { this.setDataVal('softwareVersion', val); }
    public get controllerFirmware(): string { return this.data.softwareVersion; }
    public set bootloaderVersion(val: string) { this.setDataVal('bootloaderVersion', val); }
    public get bootloaderVersion(): string { return this.data.bootloaderVersion; }
    setEquipmentIds() {
        this.data.equipmentIds = {
            circuits: { start: sys.board.equipmentIds.circuits.start, end: sys.board.equipmentIds.circuits.end },
            features: { start: sys.board.equipmentIds.features.start, end: sys.board.equipmentIds.features.end },
            circuitGroups: { start: sys.board.equipmentIds.circuitGroups.start, end: sys.board.equipmentIds.circuitGroups.end },
            virtualCircuits: { start: sys.board.equipmentIds.virtualCircuits.start, end: sys.board.equipmentIds.virtualCircuits.end },
            invalidIds: sys.board.equipmentIds.invalidIds.get()
        };
        this.hasChanged = true;
    }
    public get equipmentIds(): any {
        return this.data.equipmentIds;
    }
}
export class IntelliTouchEquipment extends Equipment { }

export class ConfigVersion extends EqItem {
    constructor(data: any, name?: string) {
        super(data, name);
        /*
        RG - Changed lastUpdated to be a permanent attribute to the data.
        *Touch doesn't keep versions of individual types so date is needed to periodically check the config.
        if (typeof data.lastUpdated === 'undefined') this._lastUpdated = new Date();
        else this._lastUpdated = new Date(data.lastUpdated);
        if (isNaN(this._lastUpdated.getTime())) this._lastUpdated = new Date(); */
    }
    //protected _lastUpdated: Date;
    public get lastUpdated(): Date {
        if (typeof this.data.lastUpdated === 'undefined') { this.data.lastUpdated = new Date().setHours(new Date().getHours() - 1); }
        return new Date(this.data.lastUpdated);
    }
    public set lastUpdated(val: Date) { this.setDataVal('lastUpdated', Timestamp.toISOLocal(val), false); }
    public get options(): number { return this.data.options; }
    public set options(val: number) { this.setDataVal('options', val); }
    public get circuits(): number { return this.data.circuits; }
    public set circuits(val: number) { this.setDataVal('circuits', val); }
    public get features(): number { return this.data.features; }
    public set features(val: number) { this.setDataVal('features', val); }
    public get pumps(): number { return this.data.pumps; }
    public set pumps(val: number) { this.setDataVal('pumps', val); }
    public get remotes(): number { return this.data.remotes; }
    public set remotes(val: number) { this.setDataVal('remotes', val); }
    public get circuitGroups(): number { return this.data.circuitGroups; }
    public set circuitGroups(val: number) { this.setDataVal('circuitGroups', val); }
    public get chlorinators(): number { return this.data.chlorinators; }
    public set chlorinators(val: number) { this.setDataVal('chlorinators', val); }
    public get intellichem(): number { return this.data.intellichem; }
    public set intellichem(val: number) { this.setDataVal('intellichem', val); }
    public get systemState(): number { return this.data.systemState; }
    public set systemState(val: number) { this.setDataVal('systemState', val); }
    public get valves(): number { return this.data.valves; }
    public set valves(val: number) { this.setDataVal('valves', val); }
    public get heaters(): number { return this.data.heaters; }
    public set heaters(val: number) { this.setDataVal('heaters', val); }
    public get security(): number { return this.data.security; }
    public set security(val: number) { this.setDataVal('security', val); }
    public get general(): number { return this.data.general; }
    public set general(val: number) { this.setDataVal('general', val); }
    public get equipment(): number { return this.data.equipment; }
    public set equipment(val: number) { this.setDataVal('equipment', val, false); }
    public get covers(): number { return this.data.covers; }
    public set covers(val: number) { this.setDataVal('covers', val); }
    public get schedules(): number { return this.data.schedules; }
    public set schedules(val: number) { this.setDataVal('schedules', val); }
    public hasChanges(ver: ConfigVersion) {
        // This will only check for items that are in the incoming ver data. This
        // is intentional so that only new versioned items will be detected.
        for (let prop in ver.data) {
            if (prop === 'lastUpdated') continue;
            if (ver.data[prop] !== this.data[prop]) {
                return true;
            }
        }
        return false;
    }
    public clear() {
        for (let prop in this.data) {
            if (prop === 'lastUpdated') continue;
            this.data[prop] = 0;
        }

    }
}

export class BodyCollection extends EqItemCollection<Body> {
    constructor(data: any, name?: string) { super(data, name || "bodies"); }
    public createItem(data: any): Body { return new Body(data); }
    // RKS: This finds a body by any of it's identifying factors.
    public findByObject(obj: any): Body {
        // This has a priority weight to the supplied object values.
        // 1. If the id is provided it will search by id.
        // 2. If the id is not provided and the circuit id is provided it will search by the circuit id.
        // 3. Finally if nothing else is provided it will search by name.
        let body = this.find(elem => {
            if (typeof obj.id !== 'undefined') return obj.id === elem.id;
            else if(typeof obj.circuit !== 'undefined') return obj.circuit === elem.circuit;
            else if (typeof obj.name !== 'undefined') return obj.name === body.name;
            else return false;
        });
        return body;
    }
}
export class Body extends EqItem {
    public dataName='bodyConfig';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get alias(): string { return this.data.alias; }
    public set alias(val: string) { this.setDataVal('alias', val); }
    public get type(): number | any { return this.data.type; }
    public set type(val: number | any) { this.setDataVal('type', sys.board.valueMaps.bodies.encode(val)); }
    public get circuit(): number { return this.data.circuit; }
    public set circuit(val: number) { this.setDataVal('circuit', val); }
    public get capacity(): number { return this.data.capacity; }
    public set capacity(val: number) { this.setDataVal('capacity', val); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get manualHeat(): boolean { return this.data.manualHeat; }
    public set manualHeat(val: boolean) { this.setDataVal('manualHeat', val); }
    public get setPoint(): number { return this.data.setPoint; }
    public set setPoint(val: number) { this.setDataVal('setPoint', val); }
    public get heatMode(): number { return this.data.heatMode; }
    public set heatMode(val: number) { this.setDataVal('heatMode', val); }
    public getHeatModes() { return sys.board.bodies.getHeatModes(this.id); }
    //public async setHeatModeAsync(mode: number) { return sys.board.bodies.setHeatModeAsync(this, mode); }
    //public setHeatSetpoint(setPoint: number) { sys.board.bodies.setHeatSetpointAsync(this, setPoint); }
}
export class ScheduleCollection extends EqItemCollection<Schedule> {
    constructor(data: any, name?: string) { super(data, name || "schedules"); }
    public createItem(data: any): Schedule { return new Schedule(data); }
}
export class Schedule extends EqItem {
    constructor(data: any) {
        super(data);
        if (typeof data.startDate === 'undefined') this._startDate = new Date();
        else this._startDate = new Date(data.startDate);
        if (isNaN(this._startDate.getTime())) this._startDate = new Date();
    }
    // todo: investigate schedules having startDate and _startDate
    private _startDate: Date=new Date();
    public dataName='scheduleConfig';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get startTime(): number { return this.data.startTime; }
    public set startTime(val: number) { this.setDataVal('startTime', val); }
    public get endTime(): number { return this.data.endTime; }
    public set endTime(val: number) { this.setDataVal('endTime', val); }
    public get scheduleDays(): number { return this.data.scheduleDays; }
    public set scheduleDays(val: number) { this.setDataVal('scheduleDays', val); }
    public get circuit(): number { return this.data.circuit; }
    public set circuit(val: number) { this.setDataVal('circuit', val); }
    public get heatSource(): number | any { return this.data.heatSource; }
    public set heatSource(val: number | any) { this.setDataVal('heatSource', sys.board.valueMaps.heatSources.encode(val)); }
    public get changeHeatSetpoint(): boolean { return this.data.changeHeatSetpoint; }
    public set changeHeatSetpoint(val: boolean) { this.setDataVal('changeHeatSetpoint', val); }
    public get heatSetpoint(): number { return this.data.heatSetpoint; }
    public set heatSetpoint(val: number) { this.setDataVal('heatSetpoint', val); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get startMonth(): number { return this._startDate.getMonth() + 1; }
    public set startMonth(val: number) { this._startDate.setMonth(val - 1); this._saveStartDate(); }
    public get startDay(): number { return this._startDate.getDate(); }
    public set startDay(val: number) { this._startDate.setDate(val); this._saveStartDate(); }
    public get startYear(): number { return this._startDate.getFullYear(); }
    public set startYear(val: number) { this._startDate.setFullYear(val < 100 ? val + 2000 : val); this._saveStartDate(); }
    public get startDate(): Date { return this._startDate; }
    public set startDate(val: Date) { this._startDate = val; }
    public get scheduleType(): number | any { return this.data.scheduleType; }
    public set scheduleType(val: number | any) { this.setDataVal('scheduleType', sys.board.valueMaps.scheduleTypes.encode(val)); }
    public get startTimeType(): number | any { return this.data.startTimeType; }
    public set startTimeType(val: number | any) { this.setDataVal('startTimeType', sys.board.valueMaps.scheduleTimeTypes.encode(val)); }
    public get endTimeType(): number | any { return this.data.endTimeType; }
    public set endTimeType(val: number | any) { this.setDataVal('endTimeType', sys.board.valueMaps.scheduleTimeTypes.encode(val)); }

    private _saveStartDate() { this.startDate.setHours(0, 0, 0, 0); this.setDataVal('startDate', Timestamp.toISOLocal(this.startDate)); }
    public get flags(): number { return this.data.flags; }
    public set flags(val: number) { this.setDataVal('flags', val); }
}
// TODO: Get rid of this
export class EggTimerCollection extends EqItemCollection<EggTimer> {
    constructor(data: any, name?: string) { super(data, name || "eggTimers"); }
    public createItem(data: any): EggTimer { return new EggTimer(data); }
}
// TODO: Get rid of this
export class EggTimer extends EqItem {
    constructor(data: any) {
        super(data);
        if (typeof data.startDate === "undefined") this._startDate = new Date();
        else this._startDate = new Date(data.startDate);
        if (isNaN(this._startDate.getTime())) this._startDate = new Date();
    }
    public dataName='eggTimerConfig';
    private _startDate: Date=new Date();
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get runTime(): number { return this.data.runTime; }
    public set runTime(val: number) { this.setDataVal('runTime', val); }
    public get circuit(): number { return this.data.circuit; }
    public set circuit(val: number) { this.setDataVal('circuit', val); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public setEggTimer(obj?: any) { sys.board.schedules.setSchedule(this, obj); }
    public deleteEggTimer() {
        const circuit = sys.circuits.getInterfaceById(this.circuit);
        circuit.eggTimer = 720;
        this.circuit = 0;
        sys.board.schedules.setSchedule(this);
    }

}
export class CircuitCollection extends EqItemCollection<Circuit> {
    constructor(data: any, name?: string) { super(data, name || "circuits"); }
    public createItem(data: any): Circuit { return new Circuit(data); }
    public add(obj: any): Circuit {
        this.data.push(obj);
        let circuit = this.createItem(obj);
        if (typeof circuit.name === "undefined")
            circuit.name = Circuit.getIdName(circuit.id);
        return circuit;
    }
    public getInterfaceById(id: number, add?: boolean, data?: any): ICircuit {
        if (sys.board.equipmentIds.circuitGroups.isInRange(id))
            return sys.circuitGroups.getInterfaceById(id);
        else if (sys.board.equipmentIds.features.isInRange(id))
            return sys.features.getItemById(id, add, data);
        return sys.circuits.getItemById(id, add, data);
    }
}
export class Circuit extends EqItem implements ICircuit {
    public dataName='circuitConfig';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get nameId(): number { return this.data.nameId; }
    public set nameId(val: number) { this.setDataVal('nameId', val); }
    public get type(): number | any { return this.data.type; }
    public set type(val: number | any) { this.setDataVal('type', sys.board.valueMaps.circuitFunctions.encode(val)); }
    // RG - remove this after I figure out what a macro means
    public get macro(): boolean { return this.data.macro; }
    public set macro(val: boolean) { this.setDataVal('macro', val); }
    // end remove
    public get freeze(): boolean { return this.data.freeze; }
    public set freeze(val: boolean) { this.setDataVal('freeze', val); }
    public get showInFeatures(): boolean { return this.data.showInFeatures; }
    public set showInFeatures(val: boolean) { this.setDataVal('showInFeatures', val); }
    // RKS: This turned out to be the Don't Stop flag.
    //public get showInCircuits(): boolean { return this.data.showInCircuits; }
    //public set showInCircuits(val: boolean) { this.setDataVal('showInCircuits', val); }
    public get eggTimer(): number { return this.data.eggTimer; }
    public set eggTimer(val: number) { this.setDataVal('eggTimer', val); }
    public get lightingTheme(): number | any { return this.data.lightingTheme; }
    public set lightingTheme(val: number | any) { this.setDataVal('lightingTheme', sys.board.valueMaps.lightThemes.encode(val)); }
    public get level(): number { return this.data.level; }
    public set level(val: number) { this.setDataVal('level', val); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get dontStop(): boolean { return utils.makeBool(this.data.dontStop); }
    public set dontStop(val: boolean) { this.setDataVal('dontStop', val); }
    public get hasHeatSource() { return typeof sys.board.valueMaps.circuitFunctions.get(this.type || 0).hasHeatSource !== 'undefined' ? sys.board.valueMaps.circuitFunctions.get(this.type || 0).hasHeatSource : false};
    public getLightThemes() { return sys.board.circuits.getLightThemes(this.type); }
    public static getIdName(id: number) {
        // todo: adjust for intellitouch
        let defName = "Aux" + (id + 1).toString();
        if (id === 0) defName = "Spa";
        else if (id === 5) defName = "Pool";
        else if (id < 5) defName = "Aux" + id.toString();
        return defName;
    }
}
export class FeatureCollection extends EqItemCollection<Feature> {
    constructor(data: any, name?: string) { super(data, name || "features"); }
    public createItem(data: any): Feature { return new Feature(data); }
}
export class Feature extends EqItem implements ICircuit {
    public dataName='featureConfig';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get nameId(): number { return this.data.nameId; }
    public set nameId(val: number) { this.setDataVal('nameId', val); }
    public get type(): number | any { return this.data.type; }
    public set type(val: number | any) { this.setDataVal('type', sys.board.valueMaps.featureFunctions.encode(val)); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get freeze(): boolean { return this.data.freeze; }
    public set freeze(val: boolean) { this.setDataVal('freeze', val); }
    public get showInFeatures(): boolean { return this.data.showInFeatures; }
    public set showInFeatures(val: boolean) { this.setDataVal('showInFeatures', val); }
    public get eggTimer(): number { return this.data.eggTimer; }
    public set eggTimer(val: number) { this.setDataVal('eggTimer', val); }
    public get dontStop(): boolean { return utils.makeBool(this.data.dontStop); }
    public set dontStop(val: boolean) { this.setDataVal('dontStop', val); }
    public get macro(): boolean { return this.data.macro; }
    public set macro(val: boolean) { this.setDataVal('macro', val); }
}
export interface ICircuitCollection {
    getItemById(id: number, add?: boolean, data?: any);
}
export interface ICircuit {
    id: number;
    name: string;
    nameId?: number;
    type: number;
    eggTimer: number;
    dontStop: boolean;
    freeze?: boolean;
    isActive: boolean;
    lightingTheme?: number;
    //showInCircuits?: boolean;
    showInFeatures?: boolean;
    macro?: boolean;
    getLightThemes?: () => {};
    get(copy?: boolean);
}
export class PumpCollection extends EqItemCollection<Pump> {
    constructor(data: any, name?: string) { super(data, name || "pumps"); }
    public createItem(data: any): Pump { return new Pump(data); }
    public getDualSpeed(add?: boolean): Pump {
        return this.getItemById(10, add, { id: 10, type: 65, name: 'Two Speed' });
    }
    public getPumpByAddress(address: number, add?: boolean, data?: any) {
        let pmp = this.find(elem => elem.address === address);
        if (typeof pmp !== 'undefined') return this.createItem(pmp);
        if (typeof add !== 'undefined' && add) return this.add(data || { id: this.data.length + 1, address: address });
        return this.createItem(data || { id: this.data.length + 1, address: address });
    }
}
export class Pump extends EqItem {
    public dataName='pumpConfig';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get address(): number { return this.data.address || this.data.id + 95; }
    public set address(val: number) { this.setDataVal('address', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get type(): number | any { return this.data.type; }
    public set type(val: number | any) { this.setDataVal('type', sys.board.valueMaps.pumpTypes.encode(val)); }
    public get minSpeed(): number { return this.data.minSpeed; }
    public set minSpeed(val: number) { this.setDataVal('minSpeed', val); }
    public get maxSpeed(): number { return this.data.maxSpeed; }
    public set maxSpeed(val: number) { this.setDataVal('maxSpeed', val); }
    public get primingSpeed(): number { return this.data.primingSpeed; }
    public set primingSpeed(val: number) { this.setDataVal('primingSpeed', val); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get flowStepSize(): number { return this.data.flowStepSize; }
    public set flowStepSize(val: number) { this.setDataVal('flowStepSize', val); }
    public get minFlow(): number { return this.data.minFlow; }
    public set minFlow(val: number) { this.setDataVal('minFlow', val); }
    public get maxFlow(): number { return this.data.maxFlow; }
    public set maxFlow(val: number) { this.setDataVal('maxFlow', val); }
    public get primingTime(): number { return this.data.primingTime; }
    public set primingTime(val: number) { this.setDataVal('primingTime', val); }
    public get speedStepSize(): number { return this.data.speedStepSize; }
    public set speedStepSize(val: number) { this.setDataVal('speedStepSize', val); }
    public get turnovers() { return this.data.turnovers; }
    public set turnovers(val: number) { this.setDataVal('turnovers', val); }
    public get manualFilterGPM() { return this.data.manualFilterGPM; }
    public set manualFilterGPM(val: number) { this.setDataVal('manualFilterGPM', val); }
    public get maxSystemTime() { return this.data.maxSystemTime; }
    public set maxSystemTime(val: number) { this.setDataVal('maxSystemTime', val); }
    public get maxPressureIncrease() { return this.data.maxPressureIncrease; }
    public set maxPressureIncrease(val: number) { this.setDataVal('maxPressureIncrease', val); }
    public get backwashFlow() { return this.data.backwashFlow; }
    public set backwashFlow(val: number) { this.setDataVal('backwashFlow', val); }
    public get backwashTime() { return this.data.backwashTime; }
    public set backwashTime(val: number) { this.setDataVal('backwashTime', val); }
    public get rinseTime() { return this.data.rinseTime; }
    public set rinseTime(val: number) { this.setDataVal('rinseTime', val); }
    public get vacuumFlow() { return this.data.vacuumFlow; }
    public set vacuumFlow(val: number) { this.setDataVal('vacuumFlow', val); }
    public get vacuumTime() { return this.data.vacuumTime; }
    public set vacuumTime(val: number) { this.setDataVal('vacuumTime', val); }
    public get backgroundCircuit() { return this.data.backgroundCircuit; }
    public set backgroundCircuit(val: number) { this.setDataVal('backgroundCircuit', val); }
    public get isVirtual() { return this.data.isVirtual; }
    public set isVirtual(val: boolean){ this.setDataVal('isVirtual', val); }
    public get defaultUnits() { 
        if (sys.board.valueMaps.pumpTypes.getName(this.type) === 'vf')
            return sys.board.valueMaps.pumpUnits.getValue('gpm');
        else
            return sys.board.valueMaps.pumpUnits.getValue('rpm');
        }
    // This is relevant only for single speed pumps.  All other pumps are driven from the circuits.  You cannot
    // identify a single speed pump in *Touch but the definition can be stored and the wattage is acquired by the model.
    public get body(): number | any { return this.data.body; }
    public set body(val: number | any) { this.setDataVal('body', sys.board.valueMaps.pumpBodies.encode(val)); }
    public get model(): number { return this.data.model; }
    public set model(val: number) { this.setDataVal('model', val); }
    public get circuits(): PumpCircuitCollection { return new PumpCircuitCollection(this.data, "circuits"); }
/*     public setPump(obj?: any) { sys.board.pumps.setPump(this, obj); }
    public setPumpCircuit(pumpCircuit: any) {
        return sys.board.pumps.setPumpCircuit(this, pumpCircuit);
    } */
    public deletePumpCircuit(pumpCircuitId: number) {
        return sys.board.pumps.deletePumpCircuit(this, pumpCircuitId);
    }
    public setType(pumpType: number) {
        sys.board.pumps.setType(this, pumpType);
    }
    public nextAvailablePumpCircuit(): number {
        let pumpCircuits = this.circuits;
        for (let i = 1; i <= 8; i++) {
            let _circ = pumpCircuits.getItemById(i);
            if (typeof _circ.circuit === 'undefined')
                return i;
        }
        return 0;
    }
    public checkOrMakeValidRPM(rpm?: number) {
        if (!rpm || rpm <= this.minSpeed || rpm >= this.maxSpeed)
            return 1000;
        else return rpm;
    }
    public checkOrMakeValidGPM(gpm?: number) {
        if (!gpm || gpm <= this.minFlow || gpm >= this.maxFlow)
            return 15;
        else return gpm;
    }
    public isRPMorGPM(rate: number): 'rpm'|'gpm'|'none' {
        if (rate >= this.minFlow || rate <= this.maxFlow) return 'gpm';
        if (rate >= this.minSpeed || rate <= this.maxSpeed) return 'rpm';
        return 'none';
    }
}
export class PumpCircuitCollection extends EqItemCollection<PumpCircuit> {
    constructor(data: any, name?: string) { super(data, name || "circuits"); }
    public createItem(data: any): PumpCircuit { return new PumpCircuit(data); }
}
export class PumpCircuit extends EqItem {
    public dataName='pumpCircuitConfig';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get circuit(): number { return this.data.circuit; }
    public set circuit(val: number) { this.setDataVal('circuit', val); }
    public get flow(): number { return this.data.flow; }
    public set flow(val: number) { this.setDataVal('flow', val); }
    public get speed(): number { return this.data.speed; }
    public set speed(val: number) { this.setDataVal('speed', val); }
    public get units(): number | any { return this.data.units; }
    public set units(val: number | any) { this.setDataVal('units', sys.board.valueMaps.pumpUnits.encode(val)); }
    public get maxPressure(): number { return this.data.maxPressure; }
    public set maxPressure(val: number) { this.setDataVal('maxPressure', val); }
}
export class ChlorinatorCollection extends EqItemCollection<Chlorinator> {
    constructor(data: any, name?: string) { super(data, name || "chlorinators"); }
    public createItem(data: any): Chlorinator { return new Chlorinator(data); }
}
export class Chlorinator extends EqItem {
    public dataName='chlorinatorConfig';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get type(): number | any { return this.data.type; }
    public set type(val: number | any) { this.setDataVal('type', sys.board.valueMaps.chlorinatorType.encode(val)); }
    public get body(): number | any { return this.data.body; }
    public set body(val: number | any) { this.setDataVal('body', sys.board.valueMaps.bodies.encode(val)); }
    public get poolSetpoint(): number { return this.data.poolSetpoint; }
    public set poolSetpoint(val: number) { this.setDataVal('poolSetpoint', val); }
    public get spaSetpoint(): number { return this.data.spaSetpoint; }
    public set spaSetpoint(val: number) { this.setDataVal('spaSetpoint', val); }
    public get superChlorHours(): number { return this.data.superChlorHours; }
    public set superChlorHours(val: number) { this.setDataVal('superChlorHours', val); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get address(): number { return this.data.address; }
    public set address(val: number) { this.setDataVal('address', val); }
    public get superChlor(): boolean { return this.data.superChlor; }
    public set superChlor(val: boolean) { this.setDataVal('superChlor', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get isVirtual() { return this.data.isVirtual; }
    public set isVirtual(val: boolean){ this.setDataVal('isVirtual', val); }
}
export class ValveCollection extends EqItemCollection<Valve> {
    constructor(data: any, name?: string) { super(data, name || "valves"); }
    public createItem(data: any): Valve { return new Valve(data); }
}
export class Valve extends EqItem {
    public dataName='valveConfig';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get type(): number | any { return this.data.type; }
    public set type(val: number | any) { this.setDataVal('type', sys.board.valueMaps.valveTypes.encode(val)); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get circuit(): number { return this.data.circuit; }
    public set circuit(val: number) { this.setDataVal('circuit', val); }
    public get isIntake(): boolean { return utils.makeBool(this.data.isIntake); }
    public set isIntake(val: boolean) { this.setDataVal('isIntake', val); }
    public get isReturn(): boolean { return utils.makeBool(this.data.isReturn); }
    public set isReturn(val: boolean) { this.setDataVal('isReturn', val); }
    public get isVirtual(): boolean { return utils.makeBool(this.data.isReturn); }
    public set isVirtual(val: boolean) { this.setDataVal('isVirtual', val); }
    public get pinId(): number { return this.data.pinId || 0; }
    public set pinId(val: number) { this.setDataVal('pinId', val); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
}
export class HeaterCollection extends EqItemCollection<Heater> {
    constructor(data: any, name?: string) { super(data, name || "heaters"); }
    public createItem(data: any): Heater { return new Heater(data); }
}
export class Heater extends EqItem {
    public dataName='heaterConfig';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get type(): number | any { return this.data.type; }
    public set type(val: number | any) { this.setDataVal('type', sys.board.valueMaps.heaterTypes.encode(val)); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get body(): number | any { return this.data.body; }
    public set body(val: number | any) { this.setDataVal('body', sys.board.valueMaps.bodies.encode(val)); }
    public get maxBoostTemp(): number { return this.data.maxBoostTemp; }
    public set maxBoostTemp(val: number) { this.setDataVal('maxBoostTemp', val); }
    public get startTempDelta(): number { return this.data.startTempDelta; }
    public set startTempDelta(val: number) { this.setDataVal('startTempDelta', val); }
    public get stopTempDelta(): number { return this.data.stopTempDelta; }
    public set stopTempDelta(val: number) { this.setDataVal('stopTempDelta', val); }
    public get cooldownDelay(): number { return this.data.cooldownDelay; }
    public set cooldownDelay(val: number) { this.setDataVal('cooldownDelay', val); }
    public get address(): number { return this.data.address; }
    public set address(val: number) { this.setDataVal('address', val); }
    public get efficiencyMode(): number { return this.data.efficiencyMode; }
    public set efficiencyMode(val: number) { this.setDataVal('efficiencyMode', val); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get isVirtual(): boolean { return this.data.isVirtual; }
    public set isVirtual(val: boolean) { this.setDataVal('isVirtual', val); }
    public get coolingEnabled(): boolean { return this.data.coolingEnabled; }
    public set coolingEnabled(val: boolean) { this.setDataVal('coolingEnabled', val); }
    public get heatingEnabled(): boolean { return this.data.heatingEnabled; }
    public set heatingEnabled(val: boolean) { this.setDataVal('heatingEnabled', val); }
    public get differentialTemp(): number { return this.data.differentialTemp; }
    public set differentialTemp(val: number) { this.setDataVal('differentialTemp', val); }
    public get freeze(): boolean { return this.data.freeze; }
    public set freeze(val: boolean) { this.setDataVal('freeze', val); }
    public get economyTime(): number { return this.data.economyTime; }
    public set economyTime(val: number) { this.setDataVal('economyTime', val); }

}
export class CoverCollection extends EqItemCollection<Cover> {
    constructor(data: any, name?: string) { super(data, name || "covers"); }
    public createItem(data: any): Cover {
        if (typeof data.circuits === 'undefined') data.circuits = [];
        return new Cover(data);
    }
}
export class Cover extends EqItem {
    public dataName='coverConfig';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get body(): number | any { return this.data.body; }
    public set body(val: number | any) { this.setDataVal('body', sys.board.valueMaps.bodies.encode(val)); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get normallyOn(): boolean { return this.data.normallyOn; }
    public set normallyOn(val: boolean) { this.setDataVal('normallyOn', val); }
    public get circuits(): number[] { return this.data.circuits; }
    public set circuits(val: number[]) { this.setDataVal('circuits', val); }
}
export interface ICircuitGroup {
    id: number;
    type: number;
    name: string;
    nameId?: number;
    eggTimer: number;
    dontStop: boolean;
    isActive: boolean;
    lightingTheme?: number;
    showInFeatures?: boolean;
    circuits: EqItemCollection<ICircuitGroupCircuit>;
    get(copy?: boolean);
}
export interface ICircuitGroupCircuit {
    id: number,
    circuit:number
}
export class LightGroupCollection extends EqItemCollection<LightGroup> {
    constructor(data: any, name?: string) { super(data, name || "lightGroups"); }
    public createItem(data: any): LightGroup { return new LightGroup(data); }
}
export class LightGroupCircuitCollection extends EqItemCollection<LightGroupCircuit> {
    constructor(data: any, name?: string) { super(data, name || 'circuits'); }
    public createItem(data: any): LightGroupCircuit { return new LightGroupCircuit(data); }
    public getItemByCircuitId(circuitId: number, add?: boolean, data?: any) {
        for (let i = 0; i < this.data.length; i++)
            if (typeof this.data[i].circuit !== 'undefined' && this.data[i].circuit === circuitId) {
                return this.createItem(this.data[i]);
            }
        if (typeof add !== 'undefined' && add)
            return this.add(data || { id: this.data.length + 1, circuit: circuitId, position: this.data.length, color: 0, swimDelay: 1 });
        return this.createItem(data || { id: this.data.length + 1, circuit: circuitId, position: this.data.length, color: 0, swimDelay: 1 });
    }
    public removeItemByCircuitId(id: number): LightGroupCircuit {
        let rem: LightGroupCircuit = null;
        for (let i = 0; i < this.data.length; i++)
            if (typeof this.data[i].circuit !== 'undefined' && this.data[i].circuit === id) {
                rem = this.data.splice(i, 1);
            }
        sys._hasChanged = true;
        return rem;
    }
    // public sortByPosition() { sys.intellibrite.circuits.sort((a, b) => { return a.position > b.position ? 1 : -1; }); }
}
export class LightGroupCircuit extends EqItem implements ICircuitGroupCircuit {
    public dataName = 'lightGroupCircuitConfig';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get circuit(): number { return this.data.circuit; }
    public set circuit(val: number) { this.setDataVal('circuit', val); }
    // RG - these shouldn't be here; only need them for CircuitGroupCircuit but if I remove it getItemById returns an error... to be fixed.
    // RKS: 09-26-20 Deprecated the desiredStateOn property.  There are 3 values for this and they include on-off-ignore.  For non-IC boards these resolve to 0 or 1 for on/off.
    //public get desiredStateOn(): boolean { return this.data.desiredStateOn; }
    //public set desiredStateOn(val: boolean) { this.setDataVal('desiredStateOn', val); }
    public get desiredState(): number { return this.data.desiredState; }
    public set desiredState(val: number) { this.setDataVal('desiredState', val); }

    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val, false); }
    public get lightingTheme(): number | any { return this.data.lightingTheme; }
    public set lightingTheme(val: number | any) { this.setDataVal('lightingTheme', sys.board.valueMaps.lightThemes.encode(val)); }
    public get position(): number { return this.data.position; }
    public set position(val: number) { this.setDataVal('position', val); }
    public get color(): number | any { return this.data.color; }
    public set color(val: number | any) { this.setDataVal('color', sys.board.valueMaps.lightColors.encode(val)); }
    public get swimDelay(): number { return this.data.swimDelay; }
    public set swimDelay(val: number) { this.setDataVal('swimDelay', val); }
    public getExtended() {
        let circ = this.get(true);
        circ.circuit = state.circuits.getInterfaceById(this.circuit).get(true);
        circ.lightingTheme = undefined;
        circ.swimDelay = this.swimDelay;
        circ.position = this.position;
        circ.color = sys.board.valueMaps.lightColors.transform(this.color);
        return circ;
    }
}
export class LightGroup extends EqItem implements ICircuitGroup, ICircuit {
    constructor(data, name?: string, obj?: any) {
        super(data, name);
        if (typeof obj !== 'undefined') extend(true, this.data, obj);
    }
    public dataName='lightGroupConfig';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get nameId(): number { return this.data.nameId; }
    public set nameId(val: number) { this.setDataVal('nameId', val); }
    public get type(): number | any { return this.data.type; }
    public set type(val: number | any) { this.setDataVal('type', sys.board.valueMaps.circuitGroupTypes.encode(val)); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get eggTimer(): number { return this.data.eggTimer; }
    public set eggTimer(val: number) { this.setDataVal('eggTimer', val); }
    public get dontStop(): boolean { return utils.makeBool(this.data.dontStop); }
    public set dontStop(val: boolean) { this.setDataVal('dontStop', val); }
    public get showInFeatures(): boolean { return utils.makeBool(this.data.showInFeatures); }
    public set showInFeatures(val: boolean) { this.setDataVal('showInFeatures', val); }
    public get lightingTheme(): number | any { return this.data.lightingTheme; }
    public set lightingTheme(val: number | any) { this.setDataVal('lightingTheme', sys.board.valueMaps.lightThemes.encode(val)); }
    public get circuits(): LightGroupCircuitCollection { return new LightGroupCircuitCollection(this.data, "circuits"); }
    public getLightThemes() { return sys.board.valueMaps.lightThemes.toArray(); }
    public getExtended() {
        let group = this.get(true);
        group.type = sys.board.valueMaps.circuitGroupTypes.transform(group.type);
        group.lightingTheme = sys.board.valueMaps.lightThemes.transform(group.lightingTheme || 0);
        let gstate = state.lightGroups.getItemById(this.id).getExtended();
        group.action = gstate.action;
        group.isOn = gstate.isOn;
        group.circuits = [];
        for (let i = 0; i < this.circuits.length; i++) {
            group.circuits.push(this.circuits.getItemByIndex(i).getExtended());
        }
        return group;
    }
}

export class CircuitGroupCircuitCollection extends EqItemCollection<CircuitGroupCircuit> {
    constructor(data: any, name?: string) { super(data, name || 'circuits'); }
    public createItem(data: any): CircuitGroupCircuit { return new CircuitGroupCircuit(data); }
}
export class CircuitGroupCircuit extends EqItem implements ICircuitGroupCircuit {
    public dataName='circuitGroupCircuitConfig';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get circuit(): number { return this.data.circuit; }
    public set circuit(val: number) { this.setDataVal('circuit', val); }
    // RKS: 09-26-20 Deprecated the desiredStateOn property.  The values are mapped to on-off-ignore in IC and on-off in all other boards.
    //public get desiredStateOn(): boolean { return this.data.desiredStateOn; }
    //public set desiredStateOn(val: boolean) { this.setDataVal('desiredStateOn', val); }
    public get desiredState(): number { return this.data.desiredState; }
    public set desiredState(val: number) { this.setDataVal('desiredState', val); }
    //public get lightingTheme(): number { return this.data.lightingTheme; }
    //public set lightingTheme(val: number) { this.setDataVal('lightingTheme', val); }
    public getExtended() {
        let circ = this.get(true);
        circ.circuit = state.circuits.getInterfaceById(circ.circuit);
        return circ;
    }
}
export class CircuitGroupCollection extends EqItemCollection<CircuitGroup> {
    constructor(data: any, name?: string) { super(data, name || "circuitGroups"); }
    public createItem(data: any): CircuitGroup { return new CircuitGroup(data); }
    public getInterfaceById(id: number): ICircuitGroup {
        let iGroup: ICircuitGroup = this.getItemById(id, false, { id: id, isActive: false });
        if (!iGroup.isActive) iGroup = sys.lightGroups.getItemById(id, false, { id: id, isActive: false });
        return iGroup;
    }
    public getItemById(id: number, add?: boolean, data?: any): LightGroup | CircuitGroup {
        for (let i = 0; i < this.data.length; i++) {
            if (typeof this.data[i].id !== 'undefined' && this.data[i].id === id) {
                return this.createItem(this.data[i]);
            }
        }
        if (typeof add !== 'undefined' && add)
            return this.add(data || { id: id });
        // RKS: This finds its way to the light groups if we aren't adding a circuit group so calling getItemById will first
        // look for the group in circuit groups then look for it in the light groups.
        return sys.lightGroups.getItemById(id, add, data);
    }

}
export class CircuitGroup extends EqItem implements ICircuitGroup, ICircuit {
    public dataName='circuitGroupConfig';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get nameId(): number { return this.data.nameId; }
    public set nameId(val: number) { this.setDataVal('nameId', val); }
    public get type(): number | any { return this.data.type; }
    public set type(val: number | any) { this.setDataVal('type', sys.board.valueMaps.circuitGroupTypes.encode(val)); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get eggTimer(): number { return this.data.eggTimer; }
    public set eggTimer(val: number) { this.setDataVal('eggTimer', val); }
    public get dontStop(): boolean { return utils.makeBool(this.data.dontStop); }
    public set dontStop(val: boolean) { this.setDataVal('dontStop', val); }
    public get showInFeatures(): boolean { return utils.makeBool(this.data.showInFeatures); }
    public set showInFeatures(val: boolean) { this.setDataVal('showInFeatures', val); }

    public get circuits(): CircuitGroupCircuitCollection { return new CircuitGroupCircuitCollection(this.data, "circuits"); }
    public getExtended() {
        let group = this.get(true);
        group.type = sys.board.valueMaps.circuitGroupTypes.transform(group.type);
        // group.lightingTheme = sys.board.valueMaps.lightThemes.transform(group.lightingTheme || 0);
        let gstate = state.lightGroups.getItemById(this.id).getExtended();
        group.action = gstate.action;
        group.isOn = gstate.isOn;
        group.showInFeatures = this.showInFeatures;
        group.circuits = [];
        for (let i = 0; i < this.circuits.length; i++) {
            group.circuits.push(this.circuits.getItemByIndex(i).getExtended());
        }
        return group;
    }
}
export class RemoteCollection extends EqItemCollection<Remote> {
    constructor(data: any, name?: string) { super(data, name || "remotes"); }
    public createItem(data: any): Remote { return new Remote(data); }
}
export class Remote extends EqItem {
    public dataName = 'remoteConfig';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get type(): number | any { return this.data.type; }
    public set type(val: number | any) { this.setDataVal('type', sys.board.valueMaps.remoteTypes.encode(val)); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get hardwired(): boolean { return this.data.hardwired; }
    public set hardwired(val: boolean) { this.setDataVal('hardwired', val); }
    public get body(): number { return this.data.body; }
    public set body(val: number) { this.setDataVal('body', val); }
    public get pumpId(): number { return this.data.pumpId; }
    public set pumpId(val: number) { this.setDataVal('pumpId', val); }
    public get address(): number { return this.data.address; }
    public set address(val: number) { this.setDataVal('address', val); }
    public get button1(): number { return this.data.button1; }
    public set button1(val: number) { this.setDataVal('button1', val); }
    public get button2(): number { return this.data.button2; }
    public set button2(val: number) { this.setDataVal('button2', val); }
    public get button3(): number { return this.data.button3; }
    public set button3(val: number) { this.setDataVal('button3', val); }
    public get button4(): number { return this.data.button4; }
    public set button4(val: number) { this.setDataVal('button4', val); }
    public get button5(): number { return this.data.button5; }
    public set button5(val: number) { this.setDataVal('button5', val); }
    public get button6(): number { return this.data.button6; }
    public set button6(val: number) { this.setDataVal('button6', val); }
    public get button7(): number { return this.data.button7; }
    public set button7(val: number) { this.setDataVal('button7', val); }
    public get button8(): number { return this.data.button8; }
    public set button8(val: number) { this.setDataVal('button8', val); }
    public get button9(): number { return this.data.button9; }
    public set button9(val: number) { this.setDataVal('button9', val); }
    public get button10(): number { return this.data.button10; }
    public set button10(val: number) { this.setDataVal('button10', val); }
    public set stepSize(val: number) { this.setDataVal('stepSize', val); }
    public get stepSize(): number { return this.data.stepSize; }
}
export class SecurityRoleCollection extends EqItemCollection<SecurityRole> {
    constructor(data: any, name?: string) { super(data, name || "roles"); }
    public createItem(data: any): SecurityRole { return new SecurityRole(data); }
}
export class SecurityRole extends EqItem {
    public dataName='roleConfig';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get timeout(): number { return this.data.timeout; }
    public set timeout(val: number) { this.setDataVal('timeout', val); }
    public get flag1(): number { return this.data.flag1; }
    public set flag1(val: number) { this.setDataVal('flag1', val); }
    public get flag2(): number { return this.data.flag2; }
    public set flag2(val: number) { this.setDataVal('flag2', val); }
    public get pin(): string { return this.data.pin; }
    public set pin(val: string) { this.setDataVal('pin', val); }
}
export class Security extends EqItem {
    public dataName='securityConfig';
    public get enabled(): boolean { return this.data.enabled; }
    public set enabled(val: boolean) { this.setDataVal('enabled', val); }
    public get roles(): SecurityRoleCollection { return new SecurityRoleCollection(this.data, "roles"); }
}
export class ChemControllerCollection extends EqItemCollection<ChemController> {
    constructor(data: any, name?: string) { super(data, name || "chemcontrollers"); }
    public createItem(data: any): ChemController { return new ChemController(data); }
    public getItemByAddress(address: number, add?: boolean, data?: any): ChemController {
        let itm = this.find(elem => elem.address === address && typeof elem.address !== 'undefined');
        if (typeof itm !== 'undefined') return itm;
        if (typeof add !== 'undefined' && add) return this.add(data || { id: this.data.length + 1, address: address });
        return this.createItem(data || { id:this.data.length + 1, address: address });
    }
    public nextAvailableChemController(): number {
        for (let i = 1; i <= sys.equipment.maxChemControllers; i++) {
            let chem = sys.chemControllers.getItemById(i);
                if (!chem.isActive) return i;
        }
        return undefined;
    }
}
export class ChemController extends EqItem {
    public initData() {
        //var chemController = {
        //    id: 'number',               // Id of the controller
        //    name: 'string',             // Name assigned to the controller
        //    type: 'valueMap',           // intellichem, homegrown, rem -- There is an unknown but that should probably go away.
        //    body: 'valueMap',           // Body assigned to the chem controller.
        //    address: 'number',          // Address for IntelliChem controller only.
        //    isActive: 'booean',
        //    isVirtual: 'boolean',       // False if controlled by OCP.
        //    calciumHardness: 'number',
        //    cyanuricAcid: 'number',
        //    alkalinity: 'number',
        //    HMIAdvancedDisplay: 'boolean', // This is related to IntelliChem and determines what is displayed on the controller.
        //    ph: {                           // pH chemical structure
        //        chemType: 'string',         // Constant ph
        //        enabled: 'boolean',         // Allows disabling the functions without deleting the settings.
        //        dosingMethod: 'valueMap',   // manual, volume, volumeTime.
        //        //  manual = The dosing pump is not triggered.
        //        //  volume = Time is not considered as a limit to the dosing.
        //        //  time = The only limit to the dose is the amount of time.
        //        //  volumeTime = Limit the dose by volume or time whichever is sooner.
        //        maxDosingTime: 'number',    // The maximum amount of time a dose can occur before mixing.
        //        maxDosingVolume: 'number',  // The maximum volume for a dose in mL.
        //        mixingTime: 'number',       // Amount of time between in seconds doses that the pump must run before adding another dose.
        //        startDelay: 'number',       // The number of seconds that the pump must be running prior to considering a dose.
        //        setpoint: 'number',         // Target setpoint for pH
        //        phSupply: 'valueMap',       // base or acid.
        //        pump: {
        //            type: 'valueMap',           // none, relay, ezo-pmp
        //            connectionId: 'uuid',       // Unique identifier for njspc external connections.
        //            deviceBinding: 'string',    // Binding value for REM to tell it what device is involved.
        //            ratedFlow: 'number',        // The standard flow rate for the pump in mL/min.
        //        },
        //        tank: {
        //            capacity: 'number',         // Capacity of the tank in the units provided.
        //            units: 'valueMap'           // gal, mL, cL, L, oz, pt, qt.
        //        },
        //        probe: {
        //            connectionId: 'uuid',       // A unique identifier that has been generated for connections in njspc.
        //            deviceBinding: 'string',    // A mapping value that is used by REM to determine which device is used.
        //            type: 'valueMap'            // none, ezo-ph, other.
        //        }

        //    },
        //    orp: {                          // ORP chemical structure
        //        chemType: 'string',         // Constant orp
        //        enabled: 'boolean',         // Allows disabling the functions without deleting the settings.
        //        dosingMethod: 'valueMap',   // manual, volume, volumeTime.
        //        //  manual = The dosing pump is not triggered.
        //        //  volume = Time is not considered as a limit to the dosing.
        //        //  time = The only limit to the dose is the amount of time.
        //        //  volumeTime = Limit the dose by volume or time whichever is sooner.
        //        maxDosingTime: 'number',    // The maximum amount of time a dose can occur before mixing.
        //        maxDosingVolume: 'number',  // The maximum volume for a dose in mL.
        //        mixingTime: 'number',       // Amount of time between in seconds doses that the pump must run before adding another dose.
        //        startDelay: 'number',       // The number of seconds that the pump must be running prior to considering a dose.
        //        setpoint: 'number',         // Target setpoint for ORP
        //        useChlorinator: 'boolean',  // Indicates whether the chlorinator will be used for dosing.
        //        pump: {
        //            type: 'valueMap',           // none, relay, ezo-pmp
        //            connectionId: 'uuid',       // Unique identifier for njspc external connections.
        //            deviceBinding: 'string',    // Binding value for REM to tell it what device is involved.
        //            ratedFlow: 'number',        // The standard flow rate for the pump in mL/min.
        //        },
        //        tank: {
        //            capacity: 'number',         // Capacity of the tank in the units provided.
        //            units: 'valueMap'           // gal, mL, cL, L, oz, pt, qt.
        //        },
        //        probe: {
        //            connectionId: 'uuid',       // A unique identifier that has been generated for connections in njspc.
        //            deviceBinding: 'string',    // A mapping value that is used by REM to determine which device is used.
        //            type: 'valueMap'            // none, ezo-orp, other.
        //        }
        //    }
        //}
        super.initData();
    }
    public dataName = 'chemControllerConfig';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get type(): number | any { return this.data.type; }
    public set type(val: number | any) { this.setDataVal('type', sys.board.valueMaps.chemControllerTypes.encode(val)); }
    public get body(): number | any { return this.data.body; }
    public set body(val: number | any) { this.setDataVal('body', sys.board.valueMaps.bodies.encode(val)); }
    public get address(): number { return this.data.address; }
    public set address(val: number) { this.setDataVal('address', val); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get isVirtual(): boolean { return this.data.isVirtual; }
    public set isVirtual(val: boolean) { this.setDataVal('isVirtual', val); }
    public get calciumHardness(): number { return this.data.calciumHardness; }
    public set calciumHardness(val: number) { this.setDataVal('calciumHardness', val); }
    public get cyanuricAcid(): number { return this.data.cyanuricAcid; }
    public set cyanuricAcid(val: number) { this.setDataVal('cyanuricAcid', val); }
    public get alkalinity(): number { return this.data.alkalinity; }
    public set alkalinity(val: number) { this.setDataVal('alkalinity', val); }
    
    public get HMIAdvancedDisplay(): boolean { return this.data.HMIAdvancedDisplay; }
    public set HMIAdvancedDisplay(val: boolean) { this.setDataVal('HMIAdvancedDisplay', val); }
    //public get pHSetpoint(): number { return this.data.pHSetpoint; }
    //public set pHSetpoint(val: number) { this.setDataVal('pHSetpoint', val); }
    //public get orpSetpoint(): number { return this.data.orpSetpoint; }
    //public set orpSetpoint(val: number) { this.setDataVal('orpSetpoint', val); }
    //public get isFlowDelayMode(): boolean { return this.data.isFlowDelayMode; }
    //public set isFlowDelayMode(val: boolean) { this.setDataVal('isFlowDelayMode', val); }
    //public get isIntelliChlorUsed(): boolean { return this.data.isIntelliChlorUsed; }
    //public set isIntelliChlorUsed(val: boolean) { this.setDataVal('isIntelliChlorUsed', val); }
    //public get isAcidBaseDosing(): boolean { return this.data.isAcidBaseDosing; }
    //public set isAcidBaseDosing(val: boolean) { this.setDataVal('isAcidBaseDosing', val); }
    //public get ispHDoseByVolume(): boolean { return this.data.ispHDoseByVolume; }
    //public set ispHDoseByVolume(val: boolean) { this.setDataVal('ispHDoseByVolume', val); }
    //public get isorpDoseByVolume(): boolean { return this.data.isorpDoseByVolume; }
    //public set isorpDoseByVolume(val: boolean) { this.setDataVal('isorpDoseByVolume', val); }
    //public get pHManualDosing(): boolean { return this.data.pHManualDosing; }
    //public set pHManualDosing(val: boolean) { this.setDataVal('pHManualDosing', val); }
    public get ph(): ChemicalPh { return new ChemicalPh(this.data, 'ph', this); }
    public get orp(): ChemicalORP { return new ChemicalORP(this.data, 'orp', this); }
    public getExtended() {
        let chem = this.get(true);
        chem.type = sys.board.valueMaps.chemControllerTypes.transform(this.type);
        chem.body = sys.board.valueMaps.bodies.transform(this.body);
        chem.ph = this.ph.getExtended();
        chem.orp = this.orp.getExtended();
        return chem;
    }
}
export class Chemical extends ChildEqItem {
    public dataName = 'chemicalConfig';
    public initData() {
        if (typeof this.data.pump === 'undefined') this.data.pump = {};
        if (typeof this.data.tank === 'undefined') this.data.tank = {};
        if (typeof this.data.enabled === 'undefined') this.data.enabled = true;
        if (typeof this.data.dosingMethod === 'undefined') this.data.dosingMethod = 0;
        if (typeof this.data.startDelay === 'undefined') this.data.startDelay = 1.5;
        if (typeof this.data.flowReadingsOnly === 'undefined') this.data.flowReadingsOnly = true;
        super.initData();
    }
    public get chemType(): string { return this.data.chemType; }
    public get enabled(): boolean { return utils.makeBool(this.data.enabled); }
    public set enabled(val: boolean) { this.setDataVal('enabled', val); }
    public get maxDosingTime(): number { return this.data.maxDosingTime; }
    public set maxDosingTime(val: number) { this.setDataVal('maxDosingTime', val); }
    public get maxDosingVolume(): number { return this.data.maxDosingVolume; }
    public set maxDosingVolume(val: number) { this.setDataVal('maxDosingVolume', val); }
    public get mixingTime(): number { return this.data.mixingTime; }
    public set mixingTime(val: number) { this.setDataVal('mixingTime', val); }
    public get dosingMethod(): number | any { return this.data.dosingMethod; }
    public set dosingMethod(val: number | any) { this.setDataVal('dosingMethod', sys.board.valueMaps.chemDosingMethods.encode(val)); }
    public get startDelay(): number { return this.data.startDelay; }
    public set startDelay(val: number) { this.setDataVal('startDelay', val); }
    public get pump(): ChemicalPump { return new ChemicalPump(this.data, 'pump', this); }
    public get tank(): ChemicalTank { return new ChemicalTank(this.data, 'tank', this); }
    public get setpoint(): number { return this.data.setpoint; }
    public set setpoint(val: number) { this.setDataVal('setpoint', val); }
    public getExtended() {
        let chem = this.get(true);
        chem.tank = this.tank.getExtended();
        chem.pump = this.pump.getExtended();
        chem.dosingMethod = sys.board.valueMaps.chemDosingMethods.transform(this.dosingMethod);
        return chem;
    }
    public get flowReadingsOnly(): boolean { return utils.makeBool(this.data.flowReadingsOnly); }
    public set flowReadingsOnly(val: boolean) { this.setDataVal('flowReadingsOnly', val); }
}
export class ChemicalPh extends Chemical {
    public initData() {
        this.data.chemType = 'ph';
        if (typeof this.data.setpoint === 'undefined') this.data.setpoint = 7.2;
        if (typeof this.data.phSupply === 'undefined') this.data.phSupply = 1;
        if (typeof this.data.probe === 'undefined') this.data.probe = {};
        if (typeof this.data.acidType === 'undefined') this.data.acidType = 0;
        super.initData();
    }
    public get phSupply(): number | any { return this.data.phSupply; }
    public set phSupply(val: number | any) { this.setDataVal('phSupply', sys.board.valueMaps.phSupplyTypes.encode(val)); }
    public get acidType(): number | any { return this.data.acidType; }
    public set acidType(val: number | any) { this.setDataVal('acidType', sys.board.valueMaps.acidTypes.encode(val)); }
    public get probe(): ChemicalPhProbe { return new ChemicalPhProbe(this.data, 'probe', this); }
    public getExtended() {
        let chem = super.getExtended();
        chem.probe = this.probe.getExtended();
        chem.phSupply = sys.board.valueMaps.phSupplyTypes.transform(this.phSupply);
        return chem;
    }
}
export class ChemicalORP extends Chemical {
    public initData() {
        this.data.chemType = 'orp';
        if (typeof this.data.setpoint === 'undefined') this.data.setpoint = 600;
        if (typeof this.data.useChlorinator === 'undefined') this.data.useChlorinator = false;
        if (typeof this.data.probe === 'undefined') this.data.probe = {};
        super.initData();
    }
    public get useChlorinator(): boolean { return utils.makeBool(this.data.useChlorinator); }
    public set useChlorinator(val: boolean) { this.setDataVal('useChlorinator', val); }
    public get probe(): ChemicalORPProbe { return new ChemicalORPProbe(this.data, 'probe', this); }
    public getExtended() {
        let chem = super.getExtended();
        chem.probe = this.probe.getExtended();
        return chem;
    }
}
export class FilterCollection extends EqItemCollection<Filter> {
    constructor(data: any, name?: string) { super(data, name || "filters"); }
    public createItem(data: any): Filter { return new Filter(data); }
}
export class Filter extends EqItem {
    public dataName='filterConfig';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get filterType(): number | any { return this.data.filterType; }
    public set filterType(val: number | any) { this.setDataVal('filterType', sys.board.valueMaps.filterTypes.encode(val)); }
    public get body(): number | any { return this.data.body; }
    public set body(val: number | any) { this.setDataVal('body', sys.board.valueMaps.bodies.encode(val)); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get lastCleanDate(): Timestamp { return this.data.lastCleanDate; }
    public set lastCleanDate(val: Timestamp) { this.setDataVal('lastCleanDate', val); }
    public get needsCleaning(): number { return this.data.needsCleaning; }
    public set needsCleaning(val: number) { this.setDataVal('needsCleaning', val); }
}
export class ChemicalProbe extends ChildEqItem {
    public initData() {
        if (typeof this.data.enabled === 'undefined') this.data.enabled = true;
        super.initData();
    }
    public get enabled(): boolean { return utils.makeBool(this.data.enabled); }
    public set enabled(val: boolean) { this.setDataVal('enabled', val); }
    public get connectionId(): string { return this.data.connectionId; }
    public set connectionId(val: string) { this.setDataVal('connectionId', val); }
    public get deviceBinding(): string { return this.data.deviceBinding; }
    public set deviceBinding(val: string) { this.setDataVal('deviceBinding', val); }
    public getExtended() { return this.get(true); }
}
export class ChemicalPhProbe extends ChemicalProbe {
    public get type(): number | any { return this.data.type; }
    public set type(val: number | any) { this.setDataVal('type', sys.board.valueMaps.chemPhProbeTypes.encode(val)); }
}
export class ChemicalORPProbe extends ChemicalProbe {
    public get type(): number | any { return this.data.type; }
    public set type(val: number | any) { this.setDataVal('type', sys.board.valueMaps.chemORPProbeTypes.encode(val)); }
}

export class ChemicalPump extends ChildEqItem {
    public dataName = 'chemicalPumpConfig';
    public initData() {
        if (typeof this.data.type === 'undefined') this.data.type = 0;
        if (typeof this.data.ratedFlow === 'undefined') this.data.ratedFlow = 0;
        if (typeof this.data.enabled === 'undefined') this.data.enabled = true;
        super.initData();
    }
    public get enabled(): boolean { return utils.makeBool(this.data.enabled); }
    public set enabled(val: boolean) { this.setDataVal('enabled', val); }
    public get connectionId(): string { return this.data.connectionId; }
    public set connectionId(val: string) { this.setDataVal('connectionId', val); }
    public get deviceBinding(): string { return this.data.deviceBinding; }
    public set deviceBinding(val: string) { this.setDataVal('deviceBinding', val); }
    public get type(): number | any { return this.data.type; }
    public set type(val: number | any) { this.setDataVal('type', sys.board.valueMaps.chemPumpTypes.encode(val)); }
    public get ratedFlow(): number { return this.data.ratedFlow || 0; }
    public set ratedFlow(val: number) { this.setDataVal('ratedFlow', val); }
    public getExtended() {
        let pump = this.get(true);
        pump.type = sys.board.valueMaps.chemPumpTypes.transform(this.type);
        return pump;
    }
}
export class ChemicalTank extends ChildEqItem {
    public dataName = 'chemicalTankConfig';
    public initData() {
        if (typeof this.data.capacity === 'undefined') this.data.capacity = 0;
        if (typeof this.data.units === 'undefined') this.data.units = 0;
        super.initData();
    }
    public get capacity(): number { return this.data.capacity; }
    public set capacity(val: number) { this.setDataVal('capacity', val); }
    public get units(): number | any { return this.data.units; }
    public set units(val: number | any) { this.setDataVal('units', sys.board.valueMaps.volumeUnits.encode(val)); }
    public getExtended() {
        let tank = this.get(true);
        tank.units = sys.board.valueMaps.volumeUnits.transform(this.units);
        return tank;
    }
}
export let sys = new PoolSystem();