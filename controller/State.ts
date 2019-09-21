import * as path from 'path';
import * as fs from 'fs';
// import * as extend from 'extend';
import * as extend from 'extend';
import { setTimeout } from 'timers';
import { logger } from '../logger/Logger';
import { Enums, Timestamp, ControllerType } from './Constants';
import { EventEmitter } from 'events';
import { webApp } from '../web/Server';
import { sys } from './Equipment';
import { Outbound, Protocol, Response, Message } from './comms/messages/Messages';
import { conn } from './comms/Comms';

class PoolStateFactory {
    private _controllerType: string;
    private _state: State;
    public set controllerType(ct: string) {
        console.log(`Getting Pool State`)
        this._controllerType = ct;
        if (typeof (this._state) === 'undefined' || this._state instanceof UnknownControllerState) {

            switch (this._controllerType) {
                case ControllerType.IntelliCenter:
                    this._state = new IntelliCenterState();
                    break;
                case ControllerType.IntelliTouch:
                    this._state = new IntelliTouchState();
                    break;
                default:
                    this._state = new UnknownControllerState();
            }
            state = this._state;
            state.init();
        }
        state = this._state;
    }
    // get method for Intellitouch
    public getCircuitOrFeatureStateById(circuitId: number, add?: boolean) {
        if (circuitId <= 9) {
            return state.circuits.getItemById(circuitId, add);
        }
        else return state.features.getItemById(circuitId, add);
    }
}
abstract class State {
    statePath: string;
    data: any;
    protected _lastUpdated: Date;
    private _isDirty: boolean;
    private _timerDirty: NodeJS.Timeout;
    protected _dt: Timestamp;
    protected _controllerType: ControllerType;
    protected onchange = (obj, fn) => {
        const handler = {
            get(target, property, receiver) {
                const val = Reflect.get(target, property, receiver);
                if (typeof (val) === 'object' && val !== null) return new Proxy(val, handler);
                return val;
            },
            set(target, property, value, receiver) {
                if (property !== 'time1' && Reflect.get(target, property, receiver) !== value) fn();
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
            if (this._isDirty) this._timerDirty = setTimeout(function () { self.persist() }, 3000);
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
    public getSection(section?: string, opts?: any): any {
        if (typeof (section) === 'undefined' || section === 'all') return this.data;
        var c: any = this.data;
        if (section.indexOf('.') !== -1) {
            var arr = section.split('.');
            for (let i = 0; i < arr.length; i++) {
                if (typeof (c[arr[i]]) === 'undefined') {
                    c = null;
                    break;
                }
                else
                    c = c[arr[i]];
            }
        }
        else
            c = c[section];
        return extend(true, {}, opts || {}, c || {});
    }
    public stopAsync() {
        if (this._timerDirty) clearTimeout(this._timerDirty);
        this.persist();
    }

    protected hasChanged = false;
    public get controllerState() {
        var self = this;
        return {
            time: self.data.time || '',
            body: self.data.body || {},
            valve: self.data.valve || 0,
            delay: self.data.delay || 0,
            adjustDST: self.data.adjustDST || false,
            batteryVoltage: self.data.batteryVoltage || 0,
            status: self.data.status || {},
            // heatMode: self.data.heatMode || 0,
            mode: self.data.mode || {},
            freeze: self.data.freeze || false,
        };
    }
    public emitControllerChange() {
        var self = this;
        if (typeof (webApp) !== 'undefined' && webApp && self.hasChanged) {
            self.hasChanged = false;
            webApp.emitToClients('controller', self.controllerState);
        }
    }
    public get time(): Timestamp { return this._dt; }
    public get mode(): number { return typeof (this.data.mode) !== 'undefined' ? this.data.mode.val : -1; }
    public set mode(val: number) {
        let m = Enums.PanelModes.transform(val);
        if (m.val !== this.mode) {
            this.data.mode = Enums.PanelModes.transform(val);
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
    /*     public get heatMode (): number { return typeof ( this.data.heatMode ) !== this.data.heatMode ? this.data.heatMode : -1; }
        public set heatMode ( val: number )
        {
            if ( this.data.heatMode !== val )
            {
                this.data.heatMode = val;
                this.hasChanged = true;
            }
        } */

    public get status() { return typeof (this.data.status) !== 'undefined' ? this.data.status.val : -1; }
    public set status(val) {
        if (typeof (val) === 'number') {
            if (this.status !== val) {
                this.data.status = Enums.ControllerStatus.transform(val);
                this.hasChanged = true;
            }
        }
        else if (typeof (val) !== 'undefined' && typeof (val.val) !== 'undefined') {
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
    public get body(): number { return this.data.body; }
    public set body(val: number) {
        if (this.body !== val) {
            this.data.body = val;
            this.hasChanged = true;
        }
    }

    public get delay(): number { return this.data.delay; }
    public set delay(val: number) {
        if (this.data.delay !== val) {
            this.data.delay = val;
            this.hasChanged = true;
        }
    }
    public get adjustDST(): boolean { return this.data.adjustDST === true; }
    public set adjustDST(val: boolean) {
        if (this.data.adjustDST) {
            this.data.adjustDST = val;
            this.hasChanged = true;
        }
    }
    public get batteryVoltage(): number { return this.data.batteryVoltage; }
    public set batteryVoltage(val: number) {
        if (this.data.batteryVoltage !== val) {
            this.data.batteryVoltage = val;
            this.hasChanged = true;
        }
    }
    public get isInitialized(): boolean { return typeof (this.data.status) !== 'undefined' && this.data.status.val !== 0; }
    public comms: CommsState = new CommsState();
    public init() {
        console.log(`Init state for Pool Controller`);
        var state = this.loadFile(this.statePath, {});
        state = extend(true, { mode: { val: -1 }, temps: { units: { val: 0, name: 'F', desc: 'Fahrenheit' } } }, state);
        var self = this;
        this._dt = new Timestamp(new Date());
        this._dt.milliseconds = 0;
        this.data = this.onchange(state, function () { self.dirty = true; });
        this._dt.emitter.on('change', function () {
            self.data.time = self._dt.format();
            self.hasChanged = true;
        });
        this.status = 0; // Initializing
    };

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
interface State {
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
    comms: CommsState;
    createCircuitStateMessage(): Outbound;
    cancelDelay(): void;
}
class UnknownControllerState extends State implements State {
    public init() {
        super.init()
    }
}
class IntelliTouchState extends State implements State {
    public init() {
        super.init()
        this.equipment = new EquipmentState(this.data, 'equipment');
        this.equipment.controllerType = this._controllerType;
        this.temps = new TemperatureState(this.data, 'temps');
        this.pumps = new PumpStateCollection(this.data, 'pumps');
        this.valves = new ValveStateCollection(this.data, 'valves');
        this.heaters = new HeaterStateCollection(this.data, 'heaters');
        this.circuits = new IntelliTouchCircuitStateCollection(this.data, 'circuits');
        this.features = new FeatureStateCollection(this.data, 'features');
        this.chlorinators = new IntelliTouchChlorinatorStateCollection(this.data, 'chlorinators');
        this.schedules = new ScheduleStateCollection(this.data, 'schedules');
        this.circuitGroups = new CircuitGroupStateCollection(this.data, 'circuitGroups');
        this._controllerType = ControllerType.IntelliTouch;
    }
    public cancelDelay() {
        let out = Outbound.createMessage(131, [0], 3, new Response(Message.pluginAddress, 16, 1, [131], null, function (msg) {
            if (!msg.failed) {
                // todo: track delay status?
            }
        }));
        conn.queueSendMessage(out);
    }
}
class IntelliCenterState extends State implements State {
    public init() {
        super.init();
        this.equipment = new EquipmentState(this.data, 'equipment');
        this.equipment.controllerType = this._controllerType;
        this.temps = new TemperatureState(this.data, 'temps');
        this.pumps = new PumpStateCollection(this.data, 'pumps');
        this.valves = new ValveStateCollection(this.data, 'valves');
        this.heaters = new HeaterStateCollection(this.data, 'heaters');
        this.circuits = new IntelliCenterCircuitStateCollection(this.data, 'circuits');
        this.features = new FeatureStateCollection(this.data, 'features');
        this.chlorinators = new IntelliCenterChlorinatorStateCollection(this.data, 'chlorinators');
        this.schedules = new ScheduleStateCollection(this.data, 'schedules');
        this._controllerType = ControllerType.IntelliCenter;
        this.circuitGroups = new CircuitGroupStateCollection(this.data, 'circuitGroups');
    }

    public createCircuitStateMessage(): Outbound {
        //Command to turn on the pool light
        //[165, 63, 15, 16, 168, 35][15, 0, 0, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 1][5, 234]
        // Command to turn off the pool light
        //[165, 63, 15, 16, 168, 35][15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 1][5, 218]
        //Command to turn on sheer descent
        //
        //Command to turn off sheer descent
        //[165, 63, 15, 16, 168, 35][15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 1][5, 218]
        //Command to turn on spa light
        //[165, 63, 15, 16, 168, 35][15, 0, 0, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 1][6, 26]
        //Commant to turn off just the pool light
        //[165, 63, 15, 16, 168, 35][15, 0, 0, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 1][6, 26]
        //Command to turn on pool and spa light
        //[165, 63, 15, 16, 168, 35][15, 0, 0, 80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 1][6, 42]
        //Me turning on spa jets
        //[165, 63, 16, 36, 168, 35][15, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 1][5, 241]
        let out = Outbound.createMessage(168, [15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 1], 3,
            new Response(16, Message.pluginAddress, 1, [168]));
        for (let i = 1; i <= this.data.circuits.length; i++) {
            let circuit = this.circuits.getItemById(i);
            let ndx = Math.floor((i - 1) / 8);
            let byte = out.payload[ndx + 3];
            let bit = (i - 1) - (ndx * 8);
            if (circuit.isOn) byte = byte | (1 << bit);
            out.payload[ndx + 3] = byte;
        }
        for (let i = 1; i <= this.data.features.length; i++) {
            let feature = this.features.getItemById(i);
            let ndx = Math.floor((i - 1) / 8);
            let byte = out.payload[ndx + 9];
            let bit = (i - 1) - (ndx * 8);
            if (feature.isOn) byte = byte | (1 << bit);
            out.payload[ndx + 9] = byte;
        }
        return out;

    }
}
interface IEqStateCreator<T> { ctor(data: any, name: string): T; }
class EqState implements IEqStateCreator<EqState> {
    public dataName: string;
    protected data: any;
    private _hasChanged: boolean = false;
    public get hasChanged(): boolean { return this._hasChanged; };
    public set hasChanged(val: boolean) { this._hasChanged = val; }
    ctor(data, name?: string): EqState {
        return new EqState(data, name);
    };
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
        }
    }
    public emitData(name: string, data: any) { webApp.emitToClients(name, data); }
    protected setDataVal(name, val) {
        if (this.data[name] !== val) {
            this.data[name] = val;
            this.hasChanged = true;
        }
    }
    public get(bCopy?: boolean): any {
        return (typeof (bCopy) === 'undefined' || !bCopy) ? this.data : extend(true, {}, this.data);
    }
}
class EqStateCollection<T> {
    protected data: any;
    constructor(data: [], name: string) {
        if (typeof (data[name]) === 'undefined') data[name] = [];
        this.data = data[name];
    }
    public getItemById(id: number, add?: boolean): T {
        for (var i = 0; i < this.data.length; i++) {
            if (typeof (this.data[i].id) !== 'undefined' && this.data[i].id === id) {
                return this.createItem(this.data[i]);
            }
        }
        if (typeof (add) !== 'undefined' && add) {
            return this.add({ id: id });
        }
        return this.createItem({ id: id });
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
    public createItem(data: any): T { return new EqState(data) as unknown as T; };
    public clear() { this.data.length = 0; }
    public get length(): number { return typeof (this.data) !== 'undefined' ? this.data.length : 0; }
    public add(obj: any): T { this.data.push(obj); return this.createItem(obj); }
}
export class EquipmentState extends EqState {
    public dataName: string = 'equipment';
    public get controllerType(): string { return this.data.controllerType; }
    public set controllerType(val: string) { this.setDataVal('controllerType', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get model(): string { return this.data.model; }
    public set model(val: string) { this.setDataVal('model', val); }
    public get shared(): boolean { return this.data.shared; }
    public set shared(val: boolean) { this.setDataVal('shared', val); }
    public get maxValves(): number { return this.data.maxValves; }
    public set maxValves(val: number) { this.setDataVal('maxValves', val); }
    public get maxCircuits(): number { return this.data.maxCircuits; }
    public set maxCircuits(val: number) { this.setDataVal('maxCircuits', val); }
    public get maxBodies(): number { return this.data.maxBodies; }
    public set maxBodies(val: number) { this.setDataVal('maxBodies', val); }
    public get maxSchedules(): number { return this.data.maxSchedules; }
    public set maxSchedules(val: number) { this.setDataVal('maxSchedules', val); }
    // This could be extended to include all the expansion panels but not sure why.
}
export class PumpStateCollection extends EqStateCollection<PumpState> {
    public createItem(data: any): PumpState { return new PumpState(data); }
}
export class PumpState extends EqState {
    public dataName: string = 'pump';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get rpm(): number { return this.data.rpm; }
    public set rpm(val: number) { this.setDataVal('rpm', val); }
    public get watts(): number { return this.data.watts; }
    public set watts(val: number) { this.setDataVal('watts', val); }
    public get flow(): number { return this.data.flow; }
    public set flow(val: number) { this.setDataVal('flow', val); }
    public get mode(): number { return this.data.mode; }
    public set mode(val: number) { this.setDataVal('mode', val); }
    public get driveState(): number { return this.data.driveState; }
    public set driveState(val: number) { this.setDataVal('driveState', val); }
    public get command(): number { return this.data.command; }
    public set command(val: number) { this.setDataVal('command', val); }
    public get address(): number { return this.data.address; }
    public set address(val: number) { this.setDataVal('address', val); }
    public get ppc(): number { return this.data.ppc; } // I think this is actually the filter % for vf and vsf.  Pump Pressure determines how much backpressure.
    public set ppc(val: number) { this.setDataVal('ppc', val); }
    public get status(): number { return typeof (this.data.status) !== 'undefined' ? this.data.status.val : -1; }
    public set status(val: number) {
        if (this.status !== val) {
            this.data.status = Enums.PumpErrors.transform(val);
            this.hasChanged = true;
        }
    }
    public get type() { return typeof (this.data.type) !== 'undefined' ? this.data.type.val : -1; }
    public set type(val: number) {
        if (this.type !== val) {
            this.data.type = Enums.PumpTypes.transform(val);
            this.hasChanged = true;
        }
    }
    public get runTime(): number { return this.data.runTime; }
    public set runTime(val: number) { this.data.runTime = val; }
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
            let c = cpump.circuits.getItemByIndex(i);
            if (c.circuit > 237) {
                // These are virtual circuits.
                let circuit = Enums.VirtualCircuits.get(c.circuit);
                if (typeof (c.flow) !== 'undefined') circuit.flow = c.flow;
                if (typeof (c.speed) !== 'undefined') circuit.speed = c.speed;
                circuit.units = Enums.pumpUnits.transform(c.units);
                circuit.equipmentType = 'virtual';
                pump.circuits.push(circuit);
            }
            else if (c.circuit > 128) {
                let feature = state.features.getItemById(c.circuit - 128).get(true);
                if (typeof (c.flow) !== 'undefined') feature.flow = c.flow;
                if (typeof (c.speed) !== 'undefined') feature.speed = c.speed;
                feature.units = Enums.pumpUnits.transform(c.units);
                feature.equipmentType = 'feature';
                pump.circuits.push(feature);
            }
            else {
                let circuit = state.circuits.getItemById(c.circuit).get(true);
                if (typeof (c.flow) !== 'undefined') circuit.flow = c.flow;
                if (typeof (c.speed) !== 'undefined') circuit.speed = c.speed;
                circuit.units = Enums.pumpUnits.transform(c.units);
                circuit.equipmentType = 'circuit';
                pump.circuits.push(circuit);
            }
        }
        return pump;
    }
}
export class ScheduleStateCollection extends EqStateCollection<ScheduleState> {
    public createItem(data: any): ScheduleState { return new ScheduleState(data); }
}
export class ScheduleState extends EqState {
    constructor(data: any) {
        super(data);
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
    public get startTime(): number { return this.data.startTime; }
    public set startTime(val: number) { this.setDataVal('startTime', val); }
    public get endTime(): number { return this.data.endTime; }
    public set endTime(val: number) { this.setDataVal('endTime', val); }
    public get circuit(): number { return this.data.circuit; }
    public set circuit(val: number) { this.setDataVal('circuit', val); }

    public get scheduleType(): number { return typeof (this.data.scheduleType) !== 'undefined' ? this.data.scheduleType.val : 0; }
    public set scheduleType(val: number) {
        if (this.scheduleType !== val) {
            this.data.scheduleType = Enums.ScheduleType.transform(val);
            this.hasChanged = true;
        }
    }
    public get scheduleDays(): number { return typeof (this.data.scheduleDays) !== 'undefined' ? this.data.scheduleDays.val : -1; }
    public set scheduleDays(val: number) {
        if (this.scheduleDays !== val) {
            this.data.scheduleDays = { val: (val & 0x007F), days: Enums.ScheduleDays.transform(val) };
            this.hasChanged = true;
        }
    }
    public get heatSource(): number { return typeof (this.data.heatSource) !== 'undefined' ? this.data.heatSource.val : 0; }
    public set heatSource(val: number) {
        if (this.heatSource !== val) {
            this.data.heatSource = Enums.HeatSource.transform(val);
            this.hasChanged = true;
        }
    }
    public get heatSetpoint(): number { return this.data.heatSetpoint; }
    public set heatSetpoint(val: number) { this.setDataVal('heatSetpoint', val); }
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) { this.data.isOn = val; }
    public getExtended() {
        let sched = this.get(true); // Always operate on a copy.
        if (this.circuit > 237) {
            let circuit = Enums.VirtualCircuits.get(this.circuit);
            circuit.equipmentType = 'virtual';
            sched.circuit = circuit;
        }
        else if (this.circuit > 128) {
            // This is a feature
            let feature = state.features.getItemById(this.circuit - 128).get(true);
            feature.equipmentType = 'feature';
            sched.circuit = feature;
        }
        else {
            let circuit = state.circuits.getItemById(this.circuit).get(true);
            circuit.equipmentType = 'circuit';
            sched.circuit = circuit;
        }
        return sched;
    }
    public emitEquipmentChange() {
        // For schedules always emit the complete information
        if (typeof (webApp) !== 'undefined' && webApp) {
            if (this.hasChanged) this.emitData(this.dataName, this.getExtended());
            this.hasChanged = false;
        }
    }
}
export class GroupCircuitStateCollection extends EqStateCollection<GroupCircuitState> {
    public createItem(data: any): GroupCircuitState { return new GroupCircuitState(data); }
}
export class GroupCircuitState extends EqState {
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get circuit(): number { return this.data.circuit; }
    public set circuit(val: number) { this.data.circuit = val; }
}
export class CircuitGroupStateCollection extends EqStateCollection<CircuitGroupState> {
    public createItem(data: any): CircuitGroupState { return new CircuitGroupState(data); }
}
export class CircuitGroupState extends EqState {
    public dataName: string = 'circuitGroup';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get type(): number { return typeof (this.data.type) !== 'undefined' ? this.data.type.val : 0; }
    public set type(val: number) {
        if (this.type !== val) {
            this.data.type = Enums.CircuitGroupTypes.transform(val);
            this.hasChanged = true;
        }
    }
    public get eggTimer(): number { return this.data.eggTimer; }
    public set eggTimer(val: number) { this.data.eggTimer = val; }
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) { this.data.isOn = val; }
    public getExtended() {
        let sgrp = this.get(true); // Always operate on a copy.
        let cgrp = sys.circuitGroups.getItemById(this.id);
        for (let i = 0; i < cgrp.circuits.length; i++) {
            let cgc = cgrp.circuits.getItemById(i + 1);
            if (cgc.circuit > 237) {
                let circuit = Enums.VirtualCircuits.get(cgc.circuit);
                circuit.equipmentType = 'virtual';
                sgrp.circuits.push(circuit);
            }
            else if (cgc.circuit > 128) {
                // This is a feature
                let feature = state.features.getItemById(cgc.circuit - 128).get(true);
                feature.equipmentType = 'feature';
                sgrp.circuits.push(feature);
            }
            else {
                let circuit = state.circuits.getItemById(cgc.circuit).get(true);
                circuit.equipmentType = 'circuit';
                sgrp.circuits.push(circuit);
            }
        }
        return sgrp;
    }
    public emitEquipmentChange() {
        // For schedules always emit the complete information
        if (typeof (webApp) !== 'undefined' && webApp) {
            if (this.hasChanged) this.emitData(this.dataName, this.getExtended());
            this.hasChanged = false;
        }
    }
}

export class BodyTempState extends EqState {
    public get id(): number { return this.data.id; };
    public set id(val: number) { this.setDataVal('circuit', val); }
    public get circuit(): number { return this.data.id; };
    public set circuit(val: number) { this.setDataVal('circuit', val); }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get temp(): number { return this.data.id; };
    public set temp(val: number) { this.setDataVal('temp', val); }
    public get heatMode(): number {
        // return typeof ( this.data.heatMode ) !== 'undefined' ? this.data.heatMode.val : -1;
        if (typeof (this.data.heatMode) !== 'undefined') {
            switch (sys.controllerType) {
                case ControllerType.IntelliCenter:
                    return this.data.heatMode.val;
                case ControllerType.IntelliTouch:
                    switch (this.data.heatMode.val) {
                        case 0: // off
                            return 0;
                        case 3: // heater
                            return 1;
                        case 21: // solar pref
                            return 2;
                        case 5: // solar only
                            return 53;
                    }
                    break;
            }
        }
        else return -1;
    }
    public set heatMode(val: number) {
        if (sys.controllerType === ControllerType.IntelliTouch) {
            switch (val) {
                case 0: // off
                    val = 0;
                    break;
                case 1: // heater
                    val = 3;
                    break;
                case 2: // solar pref
                    val = 21;
                    break;
                case 3: // solar only
                    val = 5;
                    break;
            }
        }
        if (this.heatMode !== val) {
            this.data.heatMode = Enums.HeatMode.transform(val)
            this.hasChanged = true;
        }
    }
    public get heatStatus(): number { return typeof (this.data.heatStatus) !== 'undefined' ? this.data.heatStatus.val : -1; }
    public set heatStatus(val: number) {
        if (this.heatStatus !== val) {
            this.data.heatStatus = Enums.HeatStatus.transform(val);
            this.hasChanged = true;
        }
    }
    public get setPoint(): number { return this.data.poolSetpoint; }
    public set setPoint(val: number) { this.setDataVal('setPoint', val); }
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) { this.setDataVal('isOn', val); }
    public get hasChanged(): boolean { return this.hasChanged; }
    public set hasChanged(val: boolean) {
        if (val)
            state.temps.hasChanged = true;
    }
}
export class BodyTempStateCollection extends EqStateCollection<BodyTempState> {
    public createItem(data: any): BodyTempState { return new BodyTempState(data); }
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
    public get units(): number { return typeof (this.data.units) !== 'undefined' ? this.data.units.val : -1; }
    public set units(val: number) {
        if (this.units !== val) {
            this.data.units = Enums.TempUnits.transform(val);
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
}
export interface FeatureStateCollection {
    createItem(data: any): FeatureState;
    setFeatureState(id: number, val: boolean): void;
}
export class FeatureStateCollection extends EqStateCollection<FeatureState> {
    public createItem(data: any): FeatureState { return new FeatureState(data); }
}
export class IntelliCenterFeatureStateCollection extends FeatureStateCollection {
    public setFeatureState(id: number, val: boolean) {
        let out = state.createCircuitStateMessage();
        let ndx = Math.floor((id - 1) / 8);
        let byte = out.payload[ndx + 9];
        let bit = (id - 1) - (ndx * 8);
        if (val) byte |= (1 << bit);
        else byte &= ~(1 << bit);
        out.payload[ndx + 9] = byte;
        conn.queueSendMessage(out);
    }
}
export class FeatureState extends EqState {
    public dataName: string = 'feature';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) { this.setDataVal('isOn', val); }
}
export interface CircuitStateCollection {
    createItem(data: any): CircuitState;
    setCircuitState(id: number, val: boolean): void;
    toggleCircuitState(id: number): void;
    setCircuitTheme(id: number, theme: number): void;
    setDimmerLevel(id: number, level: number): void;
    setLightColor(id: number, color: number): void;
    setLightSwimDelay(id: number, delay: number): void;
    setLightPosition(id: number, position: number): void;
}
export class CircuitStateCollection extends EqStateCollection<CircuitState> {
    public createItem(data: any): CircuitState { return new CircuitState(data); }
}
export class IntelliTouchCircuitStateCollection extends CircuitStateCollection {
    public setCircuitState(id: number, val: boolean) {
        let cstate = SF.getCircuitOrFeatureStateById(id);
        let out = Outbound.createMessage(134, [id, val ? 1 : 0], 3, new Response(Message.pluginAddress, 16, 1, [134], null, function (msg) {
            if (!msg.failed) {
                cstate.isOn = true;
                cstate.emitEquipmentChange();
            }
        }));
        conn.queueSendMessage(out);
    }
    public toggleCircuitState(id: number) {
        let cstate = SF.getCircuitOrFeatureStateById(id);
        let out = Outbound.createMessage(134, [id, cstate.isOn === true ? 0 : 1], 3, new Response(Message.pluginAddress, 16, 1, [134], null, function (msg) {
            if (!msg.failed) {
                cstate.isOn = !cstate.isOn;
                cstate.emitEquipmentChange();
            }
        }));
        conn.queueSendMessage(out);
    }
    public setCircuitTheme(id: number, theme: number) {
        let cstate = state.circuits.getItemById(id);
        let circuit = sys.circuits.getItemById(id);
        let out = Outbound.createMessage(96, [theme, 0], 3, new Response(Message.pluginAddress, 16, 1, [96], null, function (msg) {
            if (!msg.failed) {
                circuit.lightingTheme = theme;
                cstate.lightingTheme = theme;
                cstate.isOn = true;
                cstate.emitEquipmentChange();
            }
        }));
        conn.queueSendMessage(out);
        if (!cstate.isOn) {
            // If the circuit is off we need to turn it on.
            this.setCircuitState(id, true);
        }
    }
    public setDimmerLevel(id: number, level: number) {
        // todo: implement
    }
    public setLightColor(id: number, color: number) {
        // todo: implement
        // this sets the light color for the "color set" mode
    }
    public setLightSwimDelay(id: number, delay: number) {
        // todo: implement
        // this sets the delay for the "color swim" mode
    }
    public setLightPosition(id: number, position: number) {
        // todo: implement
        // this sets the position for the "color swim" mode
    }
}
export class IntelliCenterCircuitStateCollection extends CircuitStateCollection {
    public setCircuitTheme(id: number, theme: number) {
        let circuit = sys.circuits.getItemById(id);
        let cstate = this.getItemById(id);
        let out = Outbound.createMessage(168, [1, 0, id - 1, circuit.type, circuit.freeze ? 1 : 0, circuit.showInFeatures ? 1 : 0,
            theme, Math.floor(circuit.eggTimer / 60), circuit.eggTimer - ((Math.floor(circuit.eggTimer) / 60) * 60), 0],
            3, new Response(16, Message.pluginAddress, 1, [168], null, function (msg) {
                if (!msg.failed) {
                    circuit.lightingTheme = theme;
                    cstate.lightingTheme = theme;
                    cstate.isOn = true;
                    cstate.emitEquipmentChange();
                }
            }));
        out.appendPayloadString(circuit.name, 16);
        conn.queueSendMessage(out);
        if (!cstate.isOn) {
            // If the circuit is off we need to turn it on.
            this.setCircuitState(id, true);
        }
    }
    public setDimmerLevel(id: number, level: number) {
        let circuit = sys.circuits.getItemById(id);
        let cstate = this.getItemById(id);
        let out = Outbound.createMessage(168, [1, 0, id - 1, circuit.type, circuit.freeze ? 1 : 0, circuit.showInFeatures ? 1 : 0,
            level, Math.floor(circuit.eggTimer / 60), circuit.eggTimer - ((Math.floor(circuit.eggTimer) / 60) * 60), 0],
            3, new Response(16, Message.pluginAddress, 1, [168], null, function (msg) {
                if (!msg.failed) {
                    circuit.level = level;
                    cstate.level = level;
                    cstate.isOn = true;
                    cstate.emitEquipmentChange();
                }
            }));
        out.appendPayloadString(circuit.name, 16);
        conn.queueSendMessage(out);
        if (!cstate.isOn) {
            // If the circuit is off we need to turn it on.
            this.setCircuitState(id, true);
        }
    }

    public setCircuitState(id: number, val: boolean) {
        let out = state.createCircuitStateMessage();
        let ndx = Math.floor((id - 1) / 8);
        let byte = out.payload[ndx + 3];
        let bit = (id - 1) - (ndx * 8);
        if (val) byte |= (1 << bit);
        else byte &= ~(1 << bit);
        // Toggle pool/spa.
        if (id === 6 && val) {
            byte = byte & 254; // Turn off spa
        }
        else if (id === 1 && val) {
            byte = byte & 223; // Turn off pool
        }
        out.payload[ndx + 3] = byte;
        conn.queueSendMessage(out);
    }
}
export class CircuitState extends EqState {
    public dataName: string = 'circuit';
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get showInFeatures(): boolean { return this.data.showInFeatures; }
    public set showInFeatures(val: boolean) { this.setDataVal('showInFeatures', val); }
    public get isOn(): boolean { return this.data.isOn; }
    public set isOn(val: boolean) { this.setDataVal('isOn', val); }
    public get type() { return typeof (this.data.type) !== 'undefined' ? this.data.type.val : -1; }
    public set type(val: number) {
        if (this.type !== val) {
            sys.controllerType === ControllerType.IntelliCenter ?
                this.data.type = Enums.CircuitTypes.transform(val) : this.data.type = Enums.CircuitTypes_IT.transform(val);
            this.hasChanged = true;
        }
    }
    public get lightingTheme(): number { return typeof (this.data.lightingTheme) !== 'undefined' ? this.data.lightingTheme.val : 255; }
    public set lightingTheme(val: number) {
        if (this.lightingTheme !== val) {
            switch (sys.controllerType) {
                case ControllerType.IntelliCenter:
                    this.data.lightingTheme = Enums.LightThemes.transform(val);
                    break;
                case ControllerType.IntelliTouch:
                    this.data.lightingTheme = Enums.LightThemes_IT.transform(val);
                    break;
            }
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
}
export interface ChlorinatorStateCollection {
    createItem(data: any): ChlorinatorState;
}
export class ChlorinatorStateCollection extends EqStateCollection<ChlorinatorState> {
    public superChlorReference: number = 0;
    public lastDispatchSuperChlor: number = 0;

    public setChlor(id: number, poolSetpoint: number, spaSetpoint?: number, superChlorHours?: number) { this.getItemById(id).setChlor(poolSetpoint, spaSetpoint, superChlorHours); };
    public setPoolSetpoint(id: number, setpoint: number) { this.getItemById(id).setPoolSetpoint(setpoint); }
    public setSpaSetpoint(id: number, setpoint: number) { this.getItemById(id).setSpaSetpoint(setpoint); }
    public setSuperChlorHours(id: number, hours: number) { this.getItemById(id).setSuperChlorHours(hours); }
    public superChlorinate(id: number, bSet: boolean) { this.getItemById(id).superChlorinate(bSet); }
}
export class IntelliCenterChlorinatorStateCollection extends ChlorinatorStateCollection {
    public createItem(data: any): ChlorinatorState {
        return new IntelliCenterChlorinatorState(data);
    }
}
export class IntelliTouchChlorinatorStateCollection extends ChlorinatorStateCollection {
    public createItem(data: any): ChlorinatorState {
        return new IntelliTouchChlorinatorState(data);
    }
}
export interface ChlorinatorState {
    setChlor(poolSetpoint: number, spaSetpoint?: number, superChlorHours?: number): void;
    setPoolSetpoint(setpoint: number): void;
    setSpaSetpoint(setpoint: number): void;
    setSuperChlorHours(hours: number): void;
    superChlorinate(bSet: boolean): void;
}
export class ChlorinatorState extends EqState {
    public dataName: string = 'chlorinator';
    public get lastComm(): number {
        return this.data.lastComm;
    }
    public set lastComm(val: number) { this.data.lastComm = val; }
    public get id(): number { return this.data.id; }
    public set id(val: number) { this.data.id = val; }
    public get name(): string { return this.data.name; }
    public set name(val: string) { this.setDataVal('name', val); }
    public get currentOutput(): number { return this.data.currentOutput; }
    public set currentOutput(val: number) { this.setDataVal('currentOutput', val); }
    public get targetOutput(): number { return this.data.targetOutput; }
    public set targetOutput(val: number) { this.setDataVal('targetOutput', val); }
    public get status(): number { return typeof (this.data.status) !== 'undefined' ? this.data.status.val : -1; }
    public set status(val: number) {
        if (this.status !== val) {
            this.data.status = Enums.ChlorinatorStatus.transform(val);
            this.hasChanged = true;
        }
    }
    public get body(): number { return typeof (this.data.body) !== 'undefined' ? this.data.body.val : -1; }
    public set body(val: number) {
        if (this.body !== val) {
            this.data.body = Enums.Bodies.transform(val);
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
        //else this.data.superChlor = false;
    }


}
export class IntelliCenterChlorinatorState extends ChlorinatorState {
    public setChlor(poolSetpoint: number, spaSetpoint = this.spaSetpoint, superChlorHours = this.superChlorHours) {
        var self = this;
        //[255, 0, 255][165, 63, 15, 16, 168, 11][7, 0, 0, 32, 1, 51, 12, 0, 15, 0, 1][2, 45]
        this.poolSetpoint = poolSetpoint;
        this.spaSetpoint = spaSetpoint;
        this.superChlor = superChlorHours > 0;
        this.superChlorHours = superChlorHours;
        this.emitEquipmentChange();
        let out = Outbound.createMessage(168, [7, 0, this.id - 1, this.body, 1, poolSetpoint, spaSetpoint, superChlorHours > 0 ? 1 : 0, superChlorHours, 0, 1], 3,
            new Response(16, Message.pluginAddress, 1, [168]));
        conn.queueSendMessage(out);
    }
    public setPoolSetpoint(setpoint: number) {
        //[255, 0, 255][165, 63, 15, 16, 168, 11][7, 0, 0, 32, 1, 51, 12, 0, 15, 0, 1][2, 45]
        this.poolSetpoint = setpoint;
        let out = Outbound.createMessage(168, [7, 0, this.id - 1, this.body, 1, this.poolSetpoint, this.spaSetpoint, this.superChlor ? 1 : 0, this.superChlorHours, 0, 1], 3,
            new Response(16, Message.pluginAddress, 1, [168]));
        conn.queueSendMessage(out);
        this.emitEquipmentChange();
    }
    public setSpaSetpoint(setpoint: number) {
        //[255, 0, 255][165, 63, 15, 16, 168, 11][7, 0, 0, 32, 1, 51, 12, 0, 15, 0, 1][2, 45]
        this.spaSetpoint = setpoint;
        let out = Outbound.createMessage(168, [7, 0, this.id - 1, this.body, 1, this.poolSetpoint, this.spaSetpoint, this.superChlor ? 1 : 0, this.superChlorHours, 0, 1], 3,
            new Response(16, Message.pluginAddress, 1, [168]));
        conn.queueSendMessage(out);
        this.emitEquipmentChange();
    }
    public setSuperChlorHours(hours: number) {
        //[255, 0, 255][165, 63, 15, 16, 168, 11][7, 0, 0, 32, 1, 51, 12, 0, 15, 0, 1][2, 45]
        this.superChlorHours = hours;
        let out = Outbound.createMessage(168, [7, 0, this.id - 1, this.body, 1, this.poolSetpoint, this.spaSetpoint, this.superChlor ? 1 : 0, this.superChlorHours, 0, 1], 3,
            new Response(16, Message.pluginAddress, 1, [168]));
        conn.queueSendMessage(out);
        this.emitEquipmentChange();
    }
    public superChlorinate(bSet: boolean) {
        this.superChlor = bSet;
        let out = Outbound.createMessage(168, [7, 0, this.id - 1, this.body, 1, this.poolSetpoint, this.spaSetpoint, this.superChlor ? 1 : 0, this.superChlorHours, 0, 1], 3,
            new Response(16, Message.pluginAddress, 1, [168]));
        conn.queueSendMessage(out);
        this.emitEquipmentChange();
    }
}
export class IntelliTouchChlorinatorState extends ChlorinatorState {
    public setChlor(poolSetpoint: number, spaSetpoint = this.spaSetpoint, superChlorHours = this.superChlorHours) {
        var self = this;
        let out = new Outbound(Protocol.Broadcast, Message.pluginAddress, 16, 153, [(this.spaSetpoint << 1) + 1, poolSetpoint, superChlorHours > 0 ? superChlorHours + 128 : 0, 0, 0, 0, 0, 0, 0, 0], 3, new Response(16, Message.pluginAddress, 1, [153], null, function (msg) {
            if (!msg.failed) {
                let chlor = sys.chlorinators.getItemById(self.id);
                self.poolSetpoint = chlor.poolSetpoint = poolSetpoint;
                self.spaSetpoint = chlor.spaSetpoint = spaSetpoint;
                self.superChlorHours = chlor.superChlorHours = superChlorHours;
                self.superChlor = chlor.superChlor = self.superChlorHours > 0;
                self.emitEquipmentChange();
            }
        }));
        conn.queueSendMessage(out);
    }

    public setPoolSetpoint(setpoint: number) {
        var self = this;
        let out = new Outbound(Protocol.Broadcast, Message.pluginAddress, 16, 153, [(this.spaSetpoint << 1) + 1, setpoint, this.superChlorHours > 0 ? this.superChlorHours + 128 : 0, 0, 0, 0, 0, 0, 0, 0], 3, new Response(16, Message.pluginAddress, 1, [153], null, function (msg) {
            if (!msg.failed) {
                let chlor = sys.chlorinators.getItemById(self.id);
                self.poolSetpoint = chlor.poolSetpoint = setpoint;
                self.emitEquipmentChange();
            }
        }));
        conn.queueSendMessage(out);
    }
    public setSpaSetpoint(setpoint: number) {
        var self = this;
        let out = new Outbound(Protocol.Broadcast, Message.pluginAddress, 16, 153, [(setpoint << 1) + 1, this.poolSetpoint, this.superChlorHours > 0 ? this.superChlorHours + 128 : 0, 0, 0, 0, 0, 0, 0, 0], 3, new Response(16, Message.pluginAddress, 1, [153], null, function (msg) {
            if (!msg.failed) {
                let chlor = sys.chlorinators.getItemById(self.id);
                self.spaSetpoint = chlor.spaSetpoint = setpoint;
                self.emitEquipmentChange();
            }
        }));
        conn.queueSendMessage(out);
    }
    public setSuperChlorHours(hours: number) {
        var self = this;
        let out = new Outbound(Protocol.Broadcast, Message.pluginAddress, 16, 153, [(this.spaSetpoint << 1) + 1, this.poolSetpoint, hours > 0 ? hours + 128 : 0, 0, 0, 0, 0, 0, 0, 0], 3, new Response(16, Message.pluginAddress, 1, [153], null, function (msg) {
            if (!msg.failed) {
                let chlor = sys.chlorinators.getItemById(self.id);
                self.superChlorHours = chlor.superChlorHours = hours;
                self.superChlor = chlor.superChlor = self.superChlorHours > 0;
                self.emitEquipmentChange();
            }
        }));
        conn.queueSendMessage(out);
    }
    public superChlorinate(bSet: boolean) {
        /*         this.superChlor = bSet;
                let out = Outbound.createMessage( 168, [ 7, 0, this.id - 1, this.body, 1, this.poolSetpoint, this.spaSetpoint, this.superChlor ? 1 : 0, this.superChlorHours, 0, 1 ], 3,
                    new Response( 16, Message.pluginAddress, 1, [ 168 ] ) );
                conn.queueSendMessage( out ); */
    }
}
export class CommsState {
    public keepAlives: number;
}

export var SF = new PoolStateFactory();
// export var state = {} as State;
export var state = new UnknownControllerState();
// export var state: State = new State();

