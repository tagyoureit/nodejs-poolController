import * as extend from 'extend';
import { EventEmitter } from 'events';
import { PoolSystem, ConfigVersion, Body, Schedule, Pump, CircuitGroup, CircuitGroupCircuit, Heater, sys, LightGroup, LightGroupCircuitCollection } from '../Equipment';
import {state, ChlorinatorState, PumpState, BodyTempState, VirtualCircuitState} from '../State';
//import { ControllerType } from '../Constants';
import {Outbound} from '../comms/messages/Messages';
import { ControllerType } from 'controller/Constants';
export class byteValueMap extends Map<number, any> {
    public transform(byte: number, ext?: number) { return extend(true, { val: byte }, this.get(byte) || this.get(0)); }
    public toArray(): any[] {
        let arrKeys = Array.from(this.keys());
        let arr = [];
        for (let i = 0; i < arrKeys.length; i++) arr.push(this.transform(arrKeys[i]));
        return arr;
    }
    public transformByName(name: string) {
        let arr = this.toArray();
        for (let i = 0; i < arr.length; i++) {
            if (typeof (arr[i].name) !== 'undefined' && arr[i].name === name) return arr[i];
        }
        return {name: name};
    }
    public getValue(name: string): number { return this.transformByName(name).val; }
    public getName(val: number): string { return val >= 0 && typeof this.get(val) !== 'undefined' ? this.get(val).name : ''; } // added default return as this was erroring out by not finding a name
}
export class EquipmentIdRange {
    constructor(start: number | Function, end: number | Function) {
        this._start = start;
        this._end = end;
    }
    private _start: any = 0;
    private _end: any = 0;
    public get start(): number { return typeof this._start === 'function' ? this._start() : this._start; }
    public set start(val: number) { this._start = val; }
    public get end(): number { return typeof this._end === 'function' ? this._end() : this._end; }
    public set end(val: number) { this._end = val; }
    public isInRange(id: number) { return id >= this.start && id <= this.end; }
}
export class EquipmentIds {
    public circuits: EquipmentIdRange = new EquipmentIdRange(1, function () { return this.start + sys.equipment.maxCircuits - 1; });
    public features: EquipmentIdRange = new EquipmentIdRange(function () { return sys.equipment.maxCircuits + 1; }, function () { return this.start + sys.equipment.maxFeatures + 3; });
    public circuitGroups: EquipmentIdRange = new EquipmentIdRange(192, function () { return this.start + sys.equipment.maxCircuitGroups - 1; });
    public virtualCircuits: EquipmentIdRange = new EquipmentIdRange(237, function () { return this.start + sys.equipment.maxCircuitGroups + sys.equipment.maxLightGroups - 1; }); 
}
export class byteValueMaps {
    constructor() {
        this.pumpStatus.transform = function(byte) {
            if (byte === 0) return this.get(0);
            for (let b = 16; b > 0; b--) {
                let bit = (1 << (b - 1));
                if ((byte & bit) > 0) {
                    let v = this.get(b);
                    if (typeof v !== 'undefined') {
                        return extend(true, {}, v, {val: byte});
                    }
                }
            }
            return {val: byte, name: 'error' + byte, desc: 'Unspecified Error ' + byte};
        };
        this.chlorinatorStatus.transform = function (byte) {
            if (byte === 128) return { val: 128, name: 'commlost', desc: 'Communication Lost' };
            else if (byte === 0) return { val: 0, name: 'ok', desc: 'Ok' };
            for (let b = 8; b > 0; b--) {
                let bit = (1 << (b - 1));
                if ((byte & bit) > 0) {
                    let v = this.get(b);
                    if (typeof v !== "undefined") {
                        return extend(true, {}, v, {val: byte & 0x00FF});
                    }
                }
            }
            return {val: byte, name: 'unknown' + byte, desc: 'Unknown status ' + byte};
        };
        this.scheduleTypes.transform = function(byte) {
            return (byte & 128) > 0 ? extend(true, { val: 128 }, this.get(128)) : extend(true, { val: 0 }, this.get(0));
        };
        this.scheduleDays.transform = function(byte) {
            let days = [];
            let b = byte & 0x007F;
            for (let bit = 7; bit >= 0; bit--) {
                if ((byte & (1 << (bit - 1))) > 0) days.push(extend(true, {}, this.get(bit)));
            }
            return {val: b, days: days};
        };
        this.virtualCircuits.transform = function(byte) {return extend(true, {}, {id: byte, name: 'Unknown ' + byte}, this.get(byte), {showInFeatures: false, showInCircuits: false});};
        this.tempUnits.transform = function(byte) {return extend(true, {}, this.get(byte & 0x04));};
        this.panelModes.transform = function(byte) {return extend(true, {val: byte & 0x83}, this.get(byte & 0x83));};
        this.controllerStatus.transform = function(byte: number, percent?: number) {
            let v = extend(true, {}, this.get(byte) || this.get(0));
            if (typeof percent !== 'undefined') v.percent = percent;
            return v;
        };
        this.lightThemes.transform = function (byte) { return typeof byte === 'undefined' ? this.get(255) : extend(true, { val: byte }, this.get(byte) || this.get(255)); };
    }
    public panelModes: byteValueMap=new byteValueMap([
        [0, {val: 0, name: 'auto', desc: 'Auto'}],
        [1, {val: 1, name: 'service', desc: 'Service'}],
        [8, {val: 8, name: 'freeze', desc: 'Freeze'}],
        [128, {val: 128, name: 'timeout', desc: 'Timeout'}],
        [129, {val: 129, name: 'service-timeout', desc: 'Service/Timeout'}]
    ]);
    public controllerStatus: byteValueMap=new byteValueMap([
        [0, {val: 0, name: 'initializing', percent: 0}],
        [1, {val: 1, name: 'ready', desc: 'Ready', percent: 100}],
        [2, {val: 2, name: 'loading', desc: 'Loading', percent: 0}]
    ]);
    
    public circuitFunctions: byteValueMap=new byteValueMap();
    // Feature functions are used as the available options to define a circuit.
    public featureFunctions: byteValueMap = new byteValueMap([[0, { name: 'generic', desc: 'Generic' }], [1, { name: 'spillway', desc: 'Spillway' }]]);
    public heaterTypes: byteValueMap = new byteValueMap();
    public virtualCircuits: byteValueMap = new byteValueMap([
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
    public lightThemes: byteValueMap = new byteValueMap([
        [0, { name: 'white', desc: 'White' }],
        [1, { name: 'green', desc: 'Green' }],
        [2, { name: 'blue', desc: 'Blue' }],
        [3, { name: 'magenta', desc: 'Magenta' }],
        [4, { name: 'red', desc: 'Red' }],
        [5, { name: 'sam', desc: 'SAm Mode' }],
        [6, { name: 'party', desc: 'Party' }],
        [7, { name: 'romance', desc: 'Romance' }],
        [8, { name: 'caribbean', desc: 'Caribbean' }],
        [9, { name: 'american', desc: 'American' }],
        [10, { name: 'sunset', desc: 'Sunset' }],
        [11, { name: 'royal', desc: 'Royal' }],
        [255, { name: 'none', desc: 'None' }]
    ]);
    public lightColors: byteValueMap = new byteValueMap([
        [0, { name: 'white', desc: 'White' }],
        [16, { name: 'lightgreen', desc: 'Light Green' }],
        [32, { name: 'green', desc: 'Green' }],
        [48, { name: 'cyan', desc: 'Cyan' }],
        [64, { name: 'blue', desc: 'Blue' }],
        [80, { name: 'lavender', desc: 'Lavender' }],
        [96, { name: 'magenta', desc: 'Magenta' }],
        [112, { name: 'lightmagenta', desc: 'Light Magenta' }]
    ]);
    public scheduleDays: byteValueMap=new byteValueMap([
        [1, {name: 'sat', desc: 'Saturday', dow: 6}],
        [2, {name: 'fri', desc: 'Friday', dow: 5}],
        [3, {name: 'thu', desc: 'Thursday', dow: 4}],
        [4, {name: 'wed', desc: 'Wednesday', dow: 3}],
        [5, {name: 'tue', desc: 'Tuesday', dow: 2}],
        [6, {name: 'mon', desc: 'Monday', dow: 1}],
        [7, {val: 7, name: 'sun', desc: 'Sunday', dow: 0}]
    ]);
    public pumpTypes: byteValueMap=new byteValueMap();
    public heatModes: byteValueMap=new byteValueMap([
        [0, {name: 'off', desc: 'Off'}],
        [3, {name: 'heater', desc: 'Heater'}],
        [5, {name: 'solar', desc: 'Solar Only'}],
        [12, {name: 'solarpref', desc: 'Solar Preferred'}]
    ]);
    public heatSources: byteValueMap=new byteValueMap([
        [0, {name: 'off', desc: 'No Heater'}],
        [3, {name: 'heater', desc: 'Heater'}],
        [5, {name: 'solar', desc: 'Solar Only'}],
        [21, {name: 'solarpref', desc: 'Solar Preferred'}],
        [32, {name: 'nochange', desc: 'No Change'}]
    ]);
    public heatStatus: byteValueMap = new byteValueMap([
        [0, { name: 'off', desc: 'Off' }],
        [1, { name: 'heater', desc: 'Heater' }],
        [2, { name: 'solar', desc: 'Solar' }],
        [3, { nane: 'cooling', desc: 'Cooling' }]

    ]);
    public pumpStatus: byteValueMap = new byteValueMap([
        [0, { name: 'off', desc: 'Off' }], // When the pump is disconnected or has no power then we simply report off as the status.  This is not the recommended wiring
        // for a VS/VF pump as is should be powered at all times.  When it is, the status will always report a value > 0.
        [1, { name: 'ok', desc: 'Ok' }], // Status is always reported when the pump is not wired to a relay regardless of whether it is on or not
        // as is should be if this is a VS / VF pump.  However if it is wired to a relay most often filter, the pump will report status
        // 0 if it is not running.  Essentially this is no error but it is not a status either.
        [2, { name: 'filter', desc: 'Filter warning' }],
        [3, { name: 'overcurrent', desc: 'Overcurrent condition' }],
        [4, { name: 'priming', desc: 'Priming alarm' }],
        [5, { name: 'blocked', desc: 'System blocked' }],
        [6, { name: 'general', desc: 'General alarm' }],
        [7, { name: 'overtemp', desc: 'Overtemp condition' }],
        [8, { name: 'power', dec: 'Power outage' }],
        [9, { name: 'overcurrent2', desc: 'Overcurrent condition 2' }],
        [10, { name: 'overvoltage', desc: 'Overvoltage condition' }],
        [11, { name: 'error11', desc: 'Unspecified Error 11' }],
        [12, { name: 'error12', desc: 'Unspecified Error 12' }],
        [13, { name: 'error13', desc: 'Unspecified Error 13' }],
        [14, { name: 'error14', desc: 'Unspecified Error 14' }],
        [15, { name: 'error15', desc: 'Unspecified Error 15' }],
        [16, { name: 'commfailure', desc: 'Communication failure' }]
    ]);
    public pumpUnits: byteValueMap=new byteValueMap([
        [0, {name: 'rpm', desc: 'RPM'}],
        [1, {name: 'gpm', desc: 'GPM'}]
    ]);
    public bodies: byteValueMap=new byteValueMap([
        [0, {name: 'pool', desc: 'Pool'}],
        [1, {name: 'spa', desc: 'Spa'}],
        [2, {name: 'body3', desc: 'Body 3'}],
        [3, {name: 'body4', desc: 'Body 4'}],
        [32, {name: 'poolspa', desc: 'Pool/Spa'}]
    ]);
    public chlorinatorStatus: byteValueMap=new byteValueMap([
        [0, {name: 'ok', desc: 'Ok'}],
        [1, {name: 'lowflow', desc: 'Low Flow'}],
        [2, {name: 'lowsalt', desc: 'Low Salt'}],
        [3, {name: 'verylowsalt', desc: 'Very Low Salt'}],
        [4, {name: 'highcurrent', desc: 'High Current'}],
        [5, {name: 'clean', desc: 'Clean Cell'}],
        [6, {name: 'lowvoltage', desc: 'Low Voltage'}],
        [7, {name: 'lowtemp', dest: 'Water Temp Low'}],
        [8, {name: 'commlost', desc: 'Communication Lost'}]
    ]);
    public chlorinatorType: byteValueMap=new byteValueMap([
        [0, {name: 'pentair', desc: 'Pentair'}],
        [1, {name: 'unknown', desc: 'unknown'}],
        [2, {name: 'aquarite', desc: 'Aquarite'}],
        [3, {name: 'unknown', desc: 'unknown'}]
    ]);
    public circuitNames: byteValueMap = new byteValueMap();
    public scheduleTypes: byteValueMap = new byteValueMap([
        [0, { name: 'runonce', desc: 'Run Once' }],
        [128, { name: 'repeat', desc: 'Repeats' }]
    ]);
    public circuitGroupTypes: byteValueMap=new byteValueMap([
        [0, {name: 'none', desc: 'Unspecified'}],
        [1, {name: 'light', desc: 'Light'}],
        [2, {name: 'circuit', desc: 'Circuit'}],
        [3, {name: 'intellibrite', desc: 'IntelliBrite'}]
    ]);
    public tempUnits: byteValueMap = new byteValueMap([
        [0, { name: 'F', desc: 'Fahrenheit' }],
        [4, { name: 'C', desc: 'Celcius' }]
    ]);
    public valveTypes: byteValueMap = new byteValueMap([
        [0, { name: 'standard', desc: 'Standard' }],
        [1, { name: 'intellivalve', desc: 'IntelliValve' }]
    ]);
    public intellibriteActions: byteValueMap = new byteValueMap([
        [0, { name: 'ready', desc: 'Ready' }],
        [1, { name: 'sync', desc: 'Synchronizing' }],
        [2, { name: 'set', desc: 'Sequencing Set Operation' }],
        [3, { name: 'swim', desc: 'Sequencing Swim Operation' }]
    ]);
}
// SystemBoard is a mechanism to abstract the underlying pool system from specific functionality
// managed by the personality board.  This also provides a way to override specific functions for
// acquiring state and configuration data.
export class SystemBoard {
    constructor(system: PoolSystem) { }
    public valueMaps: byteValueMaps = new byteValueMaps();
    public checkConfiguration() { }
    public requestConfiguration(ver?: ConfigVersion) { }
    public stopAsync() { }
    public system: SystemCommands = new SystemCommands(this);
    public bodies: BodyCommands = new BodyCommands(this);
    public pumps: PumpCommands = new PumpCommands(this);
    public circuits: CircuitCommands = new CircuitCommands(this);
    public features: FeatureCommands = new FeatureCommands(this);
    public chemistry: ChemistryCommands = new ChemistryCommands(this);
    public schedules: ScheduleCommands = new ScheduleCommands(this);
    public equipmentIds: EquipmentIds = new EquipmentIds();
}
export class ConfigRequest {
    public failed: boolean=false;
    public version: number=0; // maybe not used for intellitouch
    public items: number[]=[];
    public acquired: number[]=[]; // used?
    public oncomplete: Function;
    public name: string;
    public category: number;
    public setcategory: number;
    public fillRange(start: number, end: number) {
        for (let i = start; i <= end; i++) this.items.push(i);
    }
    public get isComplete(): boolean {
        return this.items.length === 0;
    }
    public removeItem(byte: number) {
        for (let i = this.items.length - 1; i >= 0; i--)
            if (this.items[i] === byte) this.items.splice(i, 1);

    }
}
export class ConfigQueue {
    public queue: ConfigRequest[]=[];
    public curr: ConfigRequest=null;
    public closed: boolean=false;
    public close() {
        this.closed = true;
        this.queue.length = 0;
    }
    public reset() {
        this.closed = false;
        this.queue.length = 0;
        this.totalItems = 0;
    }
    public removeItem(cat: number, itm: number) {
        for (let i = this.queue.length - 1; i >= 0; i--) {
            if (this.queue[i].category === cat) this.queue[i].removeItem(itm);
            if (this.queue[i].isComplete) this.queue.splice(i, 1);
        }
    }
    public totalItems: number=0;
    public get remainingItems(): number {
        let c = this.queue.reduce((prev: number, curr: ConfigRequest): number => {
            return prev += curr.items.length;
        }, 0);
        c = c + (this.curr ? this.curr.items.length : 0);
        return c;
    }
    public get percent(): number {
        return this.totalItems !== 0 ?
            100 - Math.round(this.remainingItems / this.totalItems * 100) :
            100;
    }
    public push(req: ConfigRequest) {
        this.queue.push(req);
        this.totalItems += req.items.length;
    }
    // following overridden in extended class
    processNext(msg?: Outbound) {} 
    protected queueItems(cat: number, items?: number[]) {} 
    protected queueRange(cat: number, start: number, end: number) {} 
}
export class BoardCommands {
    protected board: SystemBoard=null;
    constructor(parent: SystemBoard) {this.board = parent;}
}
export class SystemCommands extends BoardCommands {
    public cancelDelay() {state.delay = 0;}
    public setDateTime(hour: number, min: number, date: number, month: number, year: number, dst: number, dow: number) {}
}
export class BodyCommands extends BoardCommands {
    public setHeatMode(body: Body, mode: number) {}
    public setHeatSetpoint(body: Body, setPoint: number) {}
    public getHeatModes(bodyId: number) {
        let heatModes = [];
        heatModes.push(this.board.valueMaps.heatModes.transform(0));
        for (let i = 1; i <= sys.heaters.length; i++) {
            let heater = sys.heaters.getItemById(i);
            if (heater.body === 32 || // Any
                heater.body === 1 && bodyId === 2 || // Spa
                heater.body === 0 && bodyId === 1) {
                // Pool
                // Pool and spa.
                if (heater.type === 1) heatModes.push(this.board.valueMaps.heatModes.transformByName('heater'));
                if (heater.type === 2) {
                    heatModes.push(this.board.valueMaps.heatModes.transformByName('solar'));
                    if (heatModes.length > 2)
                        heatModes.push(this.board.valueMaps.heatModes.transformByName('solarpref'));
                }
            }
        }
        return heatModes;
    }
    public getPoolStates(): BodyTempState[] {
        let arrPools = [];
        for (let i = 0; i < state.temps.bodies.length; i++) {
            let bstate = state.temps.bodies.getItemByIndex(i);
            if (bstate.circuit === 6)
                arrPools.push(bstate);
        }
        return arrPools;
    }
    public getSpaStates(): BodyTempState[] {
        let arrSpas = [];
        for (let i = 0; i < state.temps.bodies.length; i++) {
            let bstate = state.temps.bodies.getItemByIndex(i);
            if (bstate.circuit === 1) {
                arrSpas.push(bstate);
            }
        }
        return arrSpas;
    }
}
export class PumpCommands extends BoardCommands {
    public setPump(pump: Pump, obj?: any) {
        if (typeof obj !== 'undefined') {
            for (var prop in obj) {
                // RG: should this be 'pump.hasOwnProperty'?  TS is not happy here.
                if (this.hasOwnProperty(prop)) pump[prop] = obj[prop];
            }
        }
    }
    public setCircuitRate(pump: Pump, circuitId: number, rate: number) {
        let c = pump.circuits.getItemById(circuitId);
        let val = sys.board.valueMaps.pumpUnits.transform(c.units);
        if (val.name === 'rpm') c.speed = rate;
        else c.flow = rate;
        this.setPump(pump);
    }
    public setCircuitRateUnits(pump: Pump, circuitId: number, units: number) {
        let c = pump.circuits.getItemById(circuitId);
        let val = sys.board.valueMaps.pumpUnits.transform(units);
        c.units = units;
        if (val.name === 'rpm') c.speed = 1000;
        else c.flow = 30;
        this.setPump(pump);
    }
    public setCircuitId(pump: Pump, pumpCircuitId: number, circuitId: number) {
        let c = pump.circuits.getItemById(pumpCircuitId, true);
        c.circuit = circuitId;
        if (typeof c.units === 'undefined') {
            c.units = 0;
            c.speed = 1000;
        }
        pump.setPump();
    }
    public setType(pump: Pump, pumpType: number) {
        pump.type = pumpType;
        this.setPump(pump);
    }

}
export class CircuitCommands extends BoardCommands {
    public syncVirtualCircuitStates() {
        let arrCircuits = sys.board.valueMaps.virtualCircuits.toArray();
        let poolStates = sys.board.bodies.getPoolStates();
        let spaStates = sys.board.bodies.getSpaStates();
        // The following should work for all board types if the virtualCiruit valuemaps use common names.  The circuit ids can be
        // different as well as the descriptions but these should have common names since they are all derived from existing states.
        for (let i = 0; i < arrCircuits.length; i++) {
            let vc = arrCircuits[i];
            let bState = false;
            let cstate: VirtualCircuitState = null;
            switch (vc.name) {
                case 'poolHeater':
                    // If any pool is heating up.
                    cstate = state.virtualCircuits.getItemById(vc.val, true);
                    // Determine whether the pool heater is on.
                    for (let j = 0; j < poolStates.length; j++) {
                        if (sys.board.valueMaps.heatStatus.getName(poolStates[j].heatStatus) === 'heater') bState = true;
                    }
                    break;
                case 'spaHeater':
                    // If any spa is heating up.
                    cstate = state.virtualCircuits.getItemById(vc.val, true);
                    // Determine whether the spa heater is on.
                    for (let j = 0; j < spaStates.length; j++) {
                        if (sys.board.valueMaps.heatStatus.getName(spaStates[j].heatStatus) === 'heater') bState = true;
                    }
                    break;
                case 'freeze':
                    // If freeze protection has been turned on.
                    cstate = state.virtualCircuits.getItemById(vc.val, true);
                    bState = state.freeze;
                    break;
                case 'poolSpa':
                    // If any pool or spa is on
                    cstate = state.virtualCircuits.getItemById(vc.val, true);
                    for (let j = 0; j < poolStates.length && !bState; j++) {
                        if (poolStates[j].isOn) bState = true;
                    }
                    for (let j = 0; j < spaStates.length && !bState; j++) {
                        if (spaStates[j].isOn) bState = true;
                    }
                    break;
                case 'solarHeat':
                case 'solar':
                    // If solar is on for any body
                    cstate = state.virtualCircuits.getItemById(vc.val, true);
                    for (let j = 0; j < poolStates.length && !bState; j++) {
                        if (sys.board.valueMaps.heatStatus.getName(poolStates[j].heatStatus) === 'solar') bState = true;
                    }
                    for (let j = 0; j < spaStates.length && !bState; j++) {
                        if (sys.board.valueMaps.heatStatus.getName(spaStates[j].heatStatus) === 'solar') bState = true;
                    }
                    break;
                case 'heater':
                    cstate = state.virtualCircuits.getItemById(vc.val, true);
                    for (let j = 0; j < poolStates.length && !bState; j++) {
                        let heat = sys.board.valueMaps.heatStatus.getName(poolStates[j].heatStatus);
                        if (heat === 'solar' || heat === 'heater') bState = true;
                    }
                    for (let j = 0; j < spaStates.length && !bState; j++) {
                        let heat = sys.board.valueMaps.heatStatus.getName(spaStates[j].heatStatus);
                        if (heat === 'solar' || heat === 'heater') bState = true;
                    }
                    break;
                default:
                    state.virtualCircuits.removeItemById(vc.val);
                    break;
            }
            if (cstate !== null) {
                cstate.isOn = bState;
                cstate.type = vc.val;
                cstate.name = vc.desc;
                state.emitEquipmentChanges();
            }
        }
    }
    public setCircuitState(id: number, val: boolean) {
        let circ = state.circuits.getInterfaceById(id);
        circ.isOn = val;
        state.emitEquipmentChanges();
    }
    public toggleCircuitState(id: number) {
        let circ = state.circuits.getInterfaceById(id);
        this.setCircuitState(id, !circ.isOn);
    }
    public setLightTheme(id: number, theme: number) {
        let circ = state.circuits.getItemById(id);
        circ.lightingTheme = theme;
        state.emitEquipmentChanges();
    }
    public setDimmerLevel(id: number, level: number) {
        let circ = state.circuits.getItemById(id);
        circ.level = level;
        state.emitEquipmentChanges();
    }
    public getLightThemes(type?: number) {return sys.board.valueMaps.lightThemes.toArray();}
    public getNameById(id: number) {
        if (id < 200)
            return sys.board.valueMaps.circuitNames.transform(id).desc;
        else
            return sys.customNames.getItemById(id - 200).name;
    }
    public setIntelliBriteTheme(theme: number) {
        state.intellibrite.lightingTheme = sys.intellibrite.lightingTheme = theme;
        for (let i = 0; i <= sys.intellibrite.circuits.length; i++) {
            let ib = sys.intellibrite.circuits.getItemByIndex(i);
            let circuit = sys.circuits.getItemById(ib.circuit);
            let cstate = state.circuits.getItemById(ib.circuit, true);
            if (cstate.isOn) cstate.lightingTheme = circuit.lightingTheme = theme;
        }
        state.emitEquipmentChanges();
    }
    public setIntelliBriteColors(group: LightGroup) {
        sys.intellibrite.circuits.clear();
        for (let i = 0; i < group.circuits.length; i++) {
            let circuit = group.circuits.getItemByIndex(i);
            sys.intellibrite.circuits.add({ id: i, circuit: circuit.circuit, color: circuit.color, position: i, swimDelay: circuit.swimDelay });
        }
        state.intellibrite.hasChanged = true; // Say we are dirty but we really are pure as the driven snow.
        state.emitEquipmentChanges();
    }
    public setLightGroupColors(group: LightGroup) {
        let grp = sys.lightGroups.getItemById(group.id);
        grp.circuits.clear();
        for (let i = 0; i < group.circuits.length; i++) {
            let circuit = group.circuits.getItemByIndex(i);
            grp.circuits.add({ id: i, circuit:circuit.circuit, color: circuit.color, position: i, swimDelay: circuit.swimDelay });
        }
        let sgrp = state.lightGroups.getItemById(group.id);
        sgrp.hasChanged = true; // Say we are dirty but we really are pure as the driven snow.
        state.emitEquipmentChanges();
    }
    public sequenceLightGroup(id: number, operation:string) {
        let sgroup = state.lightGroups.getItemById(id);
        sgroup.hasChanged = true;
        let nop = sys.board.valueMaps.intellibriteActions.getValue(operation);
        if (nop > 0) {
            sgroup.action = nop;
            setTimeout(function () { sgroup.action = 0; state.emitEquipmentChanges; }, 20000); // It takes 20 seconds to sequence.
        }
        state.emitEquipmentChanges();
    }
    public sequenceIntelliBrite(operation: string) {
        state.intellibrite.hasChanged = true;
        let nop = sys.board.valueMaps.intellibriteActions.getValue(operation);
        if (nop > 0) {
            state.intellibrite.action = nop;
            setTimeout(function () { state.intellibrite.action = 0; state.emitEquipmentChanges; }, 20000); // It takes 20 seconds to sequence.
        }
        state.emitEquipmentChanges();
    }

    //public setLightGroupState(grp: number = 1, color: number) {
    //    // todo: RKS - I think you need to pass in a circuit group id here and make the logic work for multiple lightGroups; *Touch will default to 1.
    //    for (let i = 0; i <= sys.intellibrite.circuits.length; i++) {
    //        const ib = sys.intellibrite.circuits.getItemByIndex(i);
    //        const cstate = state.circuits.getItemById(ib.circuit, true);
    //        if (cstate.isOn) {
    //            const circuit = sys.circuits.getItemById(ib.circuit);
    //            cstate.lightingTheme = circuit.lightingTheme = color;
    //        }
    //    }
    //    state.intellibrite.lightingTheme = color;
    //    state.emitEquipmentChanges();
    //}
}
export class FeatureCommands extends BoardCommands {
    public setFeatureState(id: number, val: boolean) {
        let feat = state.features.getItemById(id);
        feat.isOn = val;
    }
    public toggleFeatureState(id: number) {
        let feat = state.features.getItemById(id);
        feat.isOn = !feat.isOn;
    }
    public setGroupState(grp: CircuitGroup, val: boolean) {
        let circuits = grp.circuits.toArray();
        for (let i = 0; i < circuits.length; i++) {
            let circuit: CircuitGroupCircuit = circuits[i];
            sys.board.circuits.setCircuitState(circuit.circuit, val);
        }
    }
    public syncGroupStates() {
        let arr = sys.circuitGroups.toArray();
        for (let i = 0; i < arr.length; i++) {
            let grp: CircuitGroup = arr[i];
            let circuits = grp.circuits.toArray();
            let bIsOn = true;
            if (grp.isActive) {
                for (let j = 0; j < circuits.length; j++) {
                    let circuit: CircuitGroupCircuit = circuits[j];
                    let cstate = state.circuits.getInterfaceById(circuit.circuit);
                    if (!cstate.isOn) bIsOn = false;
                }
            }
            let sgrp = state.circuitGroups.getItemById(grp.id);
            sgrp.isOn = bIsOn && grp.isActive;
            state.emitEquipmentChanges();
        }
    }

}
export class ChemistryCommands extends BoardCommands {
    public setChlor(cstate: ChlorinatorState, poolSetpoint: number = cstate.poolSetpoint, spaSetpoint: number = cstate.spaSetpoint, superChlorHours: number = cstate.superChlorHours, superChlor: boolean = cstate.superChlor) {
        cstate.poolSetpoint = poolSetpoint;
        cstate.spaSetpoint = spaSetpoint;
        cstate.superChlor = superChlor;
        cstate.superChlorHours = superChlorHours;
        state.emitEquipmentChanges();
    }
    public setPoolSetpoint(cstate: ChlorinatorState, poolSetpoint: number) {this.setChlor(cstate, poolSetpoint);}
    public setSpaSetpoint(cstate: ChlorinatorState, spaSetpoint: number) {this.setChlor(cstate, cstate.poolSetpoint, spaSetpoint);}
    public setSuperChlorHours(cstate: ChlorinatorState, hours: number) {this.setChlor(cstate, cstate.poolSetpoint, cstate.spaSetpoint, hours);}
    public superChlorinate(cstate: ChlorinatorState, bSet: boolean, hours: number) {this.setChlor(cstate, cstate.poolSetpoint, cstate.spaSetpoint, typeof hours !== 'undefined' ? hours : cstate.superChlorHours, bSet);}
}
export class ScheduleCommands extends BoardCommands {
    public setSchedule(sched: Schedule, obj?: any) {}
}
export class HeaterCommands extends BoardCommands {
    public setHeater(heater: Heater, obj?: any) {
        if (typeof obj !== undefined) {
            for (var s in obj)
                heater[s] = obj[s];
        }
    }
}
