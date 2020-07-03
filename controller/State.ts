import * as path from 'path';
import * as fs from 'fs';
import * as extend from 'extend';
import * as util from 'util';
import { setTimeout } from 'timers';
import { logger } from '../logger/Logger';
import { Timestamp, ControllerType } from './Constants';
import { webApp } from '../web/Server';
import { sys, ChemController } from './Equipment';
import { isArray } from 'util';
import { InvalidEquipmentIdError } from './Errors';
export class State implements IState {
    statePath: string;
    data: any;
    _dirtyList: DirtyStateCollection = new DirtyStateCollection();
    protected _lastUpdated: Date;
    private _isDirty: boolean;
    private _timerDirty: NodeJS.Timeout;
    protected _dt: Timestamp;
    protected _controllerType: ControllerType;
    protected onchange=(obj, fn) => {
        const handler = {
            get(target, property, receiver) {
                const val = Reflect.get(target, property, receiver);
                if (typeof val === 'function') return val.bind(receiver);
                if (typeof (val) === 'object' && val !== null) {
                    if (util.types.isProxy(val)) return val;
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
    public get dirty(): boolean { return this._isDirty; }
    public set dirty(val) {
        var self = this;
        if (val !== this._isDirty) {
            this._isDirty = val;
            if (this._timerDirty) {
                clearTimeout(this._timerDirty);
                this._timerDirty = null;
            }
            if (this._isDirty) this._timerDirty = setTimeout(function() { self.persist(); }, 3000);
        }
    }
    public persist() {
        this._isDirty = false;
        var self = this;
        Promise.resolve()
            .then(() => {
                fs.writeFileSync(self.statePath, JSON.stringify(self.data, undefined, 2));
            })
            .catch(function(err) { if (err) logger.error('Error writing pool state %s %s', err, self.statePath); });
    }
    public getState(section?: string): any {
        // todo: getState('time') returns an array of chars.  Needs no be fixed.
        //let state:any = {};
        let obj: any = this;
        
        if (typeof section === 'undefined' || section === 'all') {
            var _state: any = this.controllerState;
            _state.circuits = this.circuits.getExtended();
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
            // _state.intellibrite = this.intellibrite.getExtended();
            _state.covers = this.covers.getExtended();
            _state.schedules = this.schedules.getExtended();
            //_state.intellichem = this.intellichem.getExtended();
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
                else if (isArray(this.data[section]))
                    return extend(true, [], this.data[section] || []);
                else
                    return extend(true, {}, this.data[section] || {});

        }
    }
    public async stopAsync() {
        if (this._timerDirty) clearTimeout(this._timerDirty);
        this.persist();
        if (sys.controllerType === ControllerType.Virtual){
            for (let i = 0; i < state.temps.bodies.length; i++) {
                state.temps.bodies.getItemByIndex(i).isOn = false;
            }
            for (let i = 0; i < state.circuits.length; i++){
                state.circuits.getItemByIndex(i).isOn = false;
            }
            for (let i = 0; i < state.features.length; i++){
                state.features.getItemByIndex(i).isOn = false;
            }
        }
        return Promise.resolve();
    }
    protected hasChanged=false;
    public get controllerState() {
        var self = this;
        return {
            time: self.data.time || '',
            // body: self.data.body || {},
            valve: self.data.valve || 0,
            delay: self.data.delay,
            adjustDST: self.data.adjustDST || false,
            batteryVoltage: self.data.batteryVoltage || 0,
            status: self.data.status || {},
            mode: self.data.mode || {},
            // freeze: self.data.freeze || false,
            appVersion: sys.appVersion || ''
        };
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
    public get adjustDST(): boolean { return this.data.adjustDST; }
    public set adjustDST(val: boolean) {
        if (this.data.adjustDST !== val) {
            this.data.adjustDST = val;
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
        var state = this.loadFile(this.statePath, {});
        state = extend(true, { mode: { val: -1 }, temps: { units: { val: 0, name: 'F', desc: 'Fahrenheit' } } }, state);
        var self = this;
        this._dt = new Timestamp(new Date());
        this._dt.milliseconds = 0;
        this.data = this.onchange(state, function() { self.dirty = true; });
        this._dt.emitter.on('change', function() {
            self.data.time = self._dt.format();
            self.hasChanged = true;
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
        this.comms = new CommsState();
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
        this.covers.clear();
        this.chemControllers.clear();
        //this.intellichem.clear();
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
    // public intellibrite: LightGroupState;
    public covers: CoverStateCollection;
    public chemControllers: ChemControllerStateCollection;
    //public intellichem: IntelliChemState;
    public comms: CommsState;

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
    //intellichem: IntelliChemState;
    comms: CommsState;
    //createCircuitStateMessage(): Outbound;
    //cancelDelay(): void;
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

interface IEqStateCreator<T> { ctor(data: any, name: string): T; }
class EqState implements IEqStateCreator<EqState> {
    public dataName: string;
    public data: any;
    private _hasChanged: boolean=false;
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
        }
        else
            this.data = data;
    }
    public emitEquipmentChange() {
        if (typeof (webApp) !== 'undefined' && webApp) {
            if (this.hasChanged) this.emitData(this.dataName, this.data);
            this.hasChanged = false;
            state._dirtyList.removeEqState(this);
        }
    }
    public emitData(name: string, data: any) { webApp.emitToClients(name, data); }
    protected setDataVal(name, val, persist?: boolean) {
        if (this.data[name] !== val) {
            // console.log(`Changing state: ${ this.dataName } ${ this.data.id } ${ name }:${ this.data[name] } --> ${ val }`);
            this.data[name] = val;
            if (typeof persist === 'undefined' || persist) this.hasChanged = true;
        }
        else if (typeof persist !== 'undefined' && persist) this.hasChanged = true;
    }
    public get(bCopy?: boolean): any {
        if (typeof bCopy === 'undefined' || !bCopy) return this.data;
        let copy = extend(true, {}, this.data);
        if (typeof this.dataName !== 'undefined') copy.equipmentType = this.dataName;
        return copy;
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
        this.sort((a, b) => { return a.data.name > b.data.name ? 1 : -1; });
    }
    public sortById() {
        this.sort((a, b) => { return a.data.id > b.data.id ? 1 : -1; });
    }
    public sort(fn: (a, b) => number) { this.data.sort(fn); }
    public get(bCopy?: boolean) { return typeof bCopy === 'undefined' || !bCopy ? this.data : extend(true, {}, this.data); }
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
    public cancelDelay() { sys.board.system.cancelDelay(); }
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
    public dataName: string='pump';
    private _threshold=0.05;
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
    private _startDate: Date=new Date();
    public get startDate(): Date { return this._startDate; }
    public set startDate(val: Date) { this._startDate = val; this._saveStartDate(); }
    private _saveStartDate() {
        this.startDate.setHours(0, 0, 0, 0);
        this.setDataVal('startDate', Timestamp.toISOLocal(this.startDate));
    }
    public dataName: string='schedule';
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
    eggTimer: number;
    isOn: boolean;
    isActive: boolean;
    dataName: string;
    lightingTheme?: number;
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
    public dataName: string='circuitGroup';
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
    public get eggTimer(): number { return this.data.eggTimer; }
    public set eggTimer(val: number) { this.setDataVal('eggTimer', val); }
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) { this.setDataVal('isOn', val); }
    public get isActive(): boolean { return this.data.isActive; }
    public set isActive(val: boolean) { this.setDataVal('isActive', val); }
    public getExtended() {
        let sgrp = this.get(true); // Always operate on a copy.
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
    public dataName='lightGroup';
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
    public get eggTimer(): number { return this.data.eggTimer; }
    public set eggTimer(val: number) { this.setDataVal('eggTimer', val); }
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
    public getBodyIsOn(){
        for (let i = 0; i < this.data.length; i++){
            if (this.data[i].isOn) return this.createItem(this.data[i]);
        }
        return undefined;
    }
}
export class BodyTempState extends EqState {
    public dataName='bodyTempState';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get circuit(): number { return this.data.circuit; }
    public set circuit(val: number) { this.setDataVal('circuit', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get temp(): number { return this.data.temp; }
    public set temp(val: number) { this.setDataVal('temp', val); }
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
    public get setPoint(): number { return this.data.poolSetpoint; }
    public set setPoint(val: number) { this.setDataVal('setPoint', val); }
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) { this.setDataVal('isOn', val); }
    public emitData(name: string, data: any) { webApp.emitToClients('body', this.data); }
}
export class TemperatureState extends EqState {
    public get waterSensor1(): number { return this.data.waterSensor1; }
    public set waterSensor1(val: number) { this.setDataVal('waterSensor1', val); }
    public get waterSensor2(): number { return this.data.waterSensor2; }
    public set waterSensor2(val: number) { this.setDataVal('waterSensor2', val); }
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
    public dataName: string='heater';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) { this.setDataVal('isOn', val); }
}
export class FeatureStateCollection extends EqStateCollection<FeatureState> {
    public createItem(data: any): FeatureState { return new FeatureState(data); }
    public setFeatureStateAsync(id: number, val: boolean) { return sys.board.features.setFeatureStateAsync(id, val); }
    public async toggleFeatureStateAsync(id: number) { return sys.board.features.toggleFeatureStateAsync(id); }
}
export class FeatureState extends EqState implements ICircuitState {
    public dataName: string='feature';
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
    public dataName: string='virtualCircuit';
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
    public setCircuitState(id: number, val: boolean) { return sys.board.circuits.setCircuitStateAsync(id, val); }
    public async toggleCircuitStateAsync(id: number) { return sys.board.circuits.toggleCircuitStateAsync(id); }
    public async setLightThemeAsync(id: number, theme: number) { return sys.board.circuits.setLightThemeAsync(id, theme); }
    public getInterfaceById(id: number, add?: true): ICircuitState {
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
    public dataName='circuit';
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
    public dataName: string='valve';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get type(): number { return typeof this.data.type !== 'undefined' ? this.data.type : -1; }
    public set type(val: number) {
        if (this.type !== val) {
            this.data.type = sys.board.valueMaps.valveTypes.transform(val);
            this.hasChanged = true;
        }
    }
}
export class CoverStateCollection extends EqStateCollection<CoverState> {
    public createItem(data: any): CoverState { return new CoverState(data); }
}
export class CoverState extends EqState {
    public dataName: string='cover';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get isOpen(): boolean { return this.data.isOpen; }
    public set isOpen(val: boolean) { this.setDataVal('isOpen', val); }
}
export class ChlorinatorStateCollection extends EqStateCollection<ChlorinatorState> {
    public createItem(data: any): ChlorinatorState { return new ChlorinatorState(data); }
    public superChlorReference: number=0;
    public lastDispatchSuperChlor: number=0;
}
export class ChlorinatorState extends EqState {
    public dataName: string='chlorinator';
    // The lastComm property has a fundamental flaw.  Although, the structure is
    // not dirtied where the emitter sends out a message on each lastComm, the persistence proxy is
    // triggered by this. We need to find a way that the property change does not trigger persistence.
    // RG - Fixed with "false" persistence flag. 2/10/2020
    public get lastComm(): number { return this.data.lastComm; }
    public set lastComm(val: number) { this.setDataVal('lastComm', val, false); }
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get currentOutput(): number { return this.data.currentOutput || 0; }
    public set currentOutput(val: number) { this.setDataVal('currentOutput', val); }
    public get setPointForCurrentBody() {
        let body = state.temps.bodies.getBodyIsOn();
        if (typeof body !== 'undefined') {
            if (body.circuit === 0) return this.spaSetpoint;
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
    public setChemControllerAsync(data: any){ 
        if (typeof data.id === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Invalid equipment id provided.`, data.id, 'chemController'));
        return this.getItemById(parseInt(data.id,10),true).setChemControllerAsync(data);}
}

export class ChemControllerState extends EqState {
    public dataName: string='chemController';
    public get lastComm(): number { return this.data.lastComm || 0; }
    public set lastComm(val: number) { this.setDataVal('lastComm', val, false); }
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.setDataVal('id', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get address(): number { return this.data.address; }
    public set address(val: number) { this.setDataVal('address', val); }
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

    public get pHLevel(): number { return this.data.pHLevel; }
    public set pHLevel(val: number) { this.setDataVal('pHLevel', val); }
    public get orpLevel(): number { return this.data.orpLevel; }
    public set orpLevel(val: number) { this.setDataVal('orpLevel', val); }
    public get saltLevel(): number { return this.data.saltLevel; }
    public set saltLevel(val: number) { this.setDataVal('saltLevel', val); }
    public get waterFlow(): number { return this.data.waterFlow; }
    public set waterFlow(val: number) {
        if (this.waterFlow !== val) {
            this.data.waterFlow = sys.board.valueMaps.intelliChemWaterFlow.transform(val);
            this.hasChanged = true;
        }
    }
    public get acidTankLevel(): number { return this.data.acidTankLevel; }
    public set acidTankLevel(val: number) { this.setDataVal('acidTankLevel', val); }
    public get orpTankLevel(): number { return this.data.orpTankLevel; }
    public set orpTankLevel(val: number) { this.setDataVal('orpTankLevel', val); }
    public get status1(): number { return this.data.status1; }
    public set status1(val: number) {
        if (this.status1 !== val) {
            this.data.status1 = sys.board.valueMaps.intelliChemStatus1.transform(val);
            this.hasChanged = true;
        }
    }
    public get status2(): number { return this.data.status2; }
    public set status2(val: number) {
        if (this.status2 !== val) {
            this.data.status2 = sys.board.valueMaps.intelliChemStatus2.transform(val);
            this.hasChanged = true;
        }
    }
    public get pHDosingTime(): number { return this.data.pHDosingTime; }
    public set pHDosingTime(val: number) { this.setDataVal('pHDosingTime', val); }
    public get orpDosingTime(): number { return this.data.orpDosingTime; }
    public set orpDosingTime(val: number) { this.setDataVal('orpDosingTime', val); }
    public get saturationIndex() : number { return this.data.saturationIndex; }
    public set saturationIndex(val: number) { this.setDataVal('saturationIndex', val); }
    public get temp(): number { return this.data.temp; }
    public set temp(val: number) { this.setDataVal('temp', val); }
    public get tempUnits(): number { 
        if (typeof this.data.tempUnits !== 'undefined') return this.data.tempUnits.val;
        else return state.temps.units; 
    }
    public set tempUnits(val: number) {
        // specific check for the data val here because we can return the body temp units if undefined
        if (this.data.tempUnits !== val) {
            this.data.tempUnits = sys.board.valueMaps.tempUnits.transform(val);
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
    // this wouldn't be used if there is a physical chem controller;
    // but can be used by home grown systems to populate current state
    public async setChemControllerAsync(data: any) {
        if (typeof data.pHLevel !== 'undefined') this.pHLevel = parseFloat(data.pHLevel);
        if (typeof data.orpLevel !== 'undefined') this.orpLevel = parseFloat(data.orpLevel);
        if (typeof data.saltLevel !== 'undefined') this.saltLevel = parseInt(data.saltLevel,10);
        // need to adjust for different bodies when we learn how
        else if (sys.chlorinators.getItemById(1).isActive) this.saltLevel = state.chlorinators.getItemById(1).saltLevel;
        if (typeof data.waterFlow !== 'undefined') this.waterFlow = parseInt(data.waterFlow);
        if (typeof data.acidTankLevel !== 'undefined') this.acidTankLevel = parseInt(data.acidTankLevel,10);
        if (typeof data.orpTankLevel !== 'undefined') this.orpTankLevel = parseInt(data.orpTankLevel,10);
        if (typeof data.status1 !== 'undefined') this.status1 = parseInt(data.status1,10);
        if (typeof data.status2 !== 'undefined') this.status2 = parseInt(data.status2,10);
        if (typeof data.pHDosingTime !== 'undefined') this.pHDosingTime = parseInt(data.pHDosingTime,10);
        if (typeof data.orpDosingTime !== 'undefined') this.orpDosingTime = parseInt(data.orpDosingTime,10);
        if (typeof data.temp !== 'undefined') this.temp = parseInt(data.temp,10);
        else {
                let tbody = state.temps.bodies.getBodyIsOn();
                if (typeof tbody !== 'undefined' && typeof tbody.temp !== 'undefined') this.temp = tbody.temp;
        }
        if (typeof data.tempUnits !== 'undefined') {
            if (typeof data.tempUnits === 'string') this.tempUnits = sys.board.valueMaps.tempUnits.getValue(data.tempUnits.toUpperCase());
            else this.tempUnits = data.tempUnits;
        }
        else this.tempUnits = state.temps.units;
        if (typeof data.saturationIndex !== 'undefined') this.saturationIndex = data.saturationIndex;
        else this.calculateSaturationIndex();
        this.emitEquipmentChange();
        return Promise.resolve(this);
    }
    public calculateSaturationIndex(): void {
       // Saturation Index = SI = pH + CHF + AF + TF - TDSF   
       let SI = Math.round(
           (this.pHLevel +
            this.calculateCalciumHardnessFactor() +
            this.calculateTotalCarbonateAlkalinity() +
            this.calculateTemperatureFactor() -
            this.calculateTotalDisolvedSolidsFactor()) * 1000) / 1000;
       if (isNaN(SI)) {this.saturationIndex = undefined} else {this.saturationIndex = SI;}
       this.emitEquipmentChange();
    }
    private calculateCalciumHardnessFactor() {
        const CH = sys.chemControllers.getItemById(this.id).calciumHardness;
        if (CH <= 25) return 1.0;
        else if (CH <= 50) return 1.3;
        else if (CH <= 75) return 1.5;
        else if (CH <= 100) return 1.6;
        else if (CH <= 125) return 1.7;
        else if (CH <= 150) return 1.8;
        else if (CH <= 200) return 1.9;
        else if (CH <= 250) return 2.0;
        else if (CH <= 300) return 2.1;
        else if (CH <= 400) return 2.2;
        else if (CH <= 800) return 2.5;
    }
    private calculateTotalCarbonateAlkalinity(): number {
        const ppm = this.correctedAlkalinity();
        if (ppm <= 25) return 1.4;
        else if (ppm <= 50) return 1.7;
        else if (ppm <= 75) return 1.9;
        else if (ppm <= 100) return 2.0;
        else if (ppm <= 125) return 2.1;
        else if (ppm <= 150) return 2.2;
        else if (ppm <= 200) return 2.3;
        else if (ppm <= 250) return 2.4;
        else if (ppm <= 300) return 2.5;
        else if (ppm <= 400) return 2.6;
        else if (ppm <= 800) return 2.9;
    }
    private correctedAlkalinity(): number {
        return sys.chemControllers.getItemById(this.id).alkalinity - (sys.chemControllers.getItemById(this.id).cyanuricAcid / 3);
    }
    private calculateTemperatureFactor(): number {
        const temp = this.temp;
        const UOM = typeof this.tempUnits !== 'undefined' ? sys.board.valueMaps.tempUnits.getName(this.tempUnits) : sys.board.valueMaps.tempUnits.getName(state.temps.units);
        if (UOM === 'F') {
            if (temp <= 32) return 0.0;
            else if (temp <= 37) return 0.1;
            else if (temp <= 46) return 0.2;
            else if (temp <= 53) return 0.3;
            else if (temp <= 60) return 0.4;
            else if (temp <= 66) return 0.5;
            else if (temp <= 76) return 0.6;
            else if (temp <= 84) return 0.7;
            else if (temp <= 94) return 0.8;
            else if (temp <= 105) return 0.9;
        } else {
            if (temp <= 0) return 0.0;
            else if (temp <= 2.8) return 0.1;
            else if (temp <= 7.8) return 0.2;
            else if (temp <= 11.7) return 0.3;
            else if (temp <= 15.6) return 0.4;
            else if (temp <= 18.9) return 0.5;
            else if (temp <= 24.4) return 0.6;
            else if (temp <= 28.9) return 0.7;
            else if (temp <= 34.4) return 0.8;
            else if (temp <= 40.6) return 0.9;
        }
    }
    private calculateTotalDisolvedSolidsFactor(): number {
        // RKS: This needs to match with the target body of the chlorinator if it exists.
        // 12.1 for non-salt pools; 12.2 for salt pools
        let chlorInstalled = false;
        if (sys.chlorinators.length && sys.chlorinators.getItemById(1).isActive) chlorInstalled = true;
        return chlorInstalled ? 12.2 : 12.1;
    }
    public getExtended(): any {
        let obj = this.get(true);
        obj.saturationIndex = this.saturationIndex;
        return obj;
    }
}
export class CommsState {
    public keepAlives: number;
}

export var state = new State();