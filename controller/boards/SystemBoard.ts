import * as extend from 'extend';
import { EventEmitter } from 'events';
import { PoolSystem, ConfigVersion, Body, Schedule, Pump, sys } from '../Equipment';
import { ControllerType, Enums } from '../Constants';
//import { IntelliCenterBoard } from './IntelliCenterBoard';
//import { IntelliTouchBoard } from './IntelliTouchBoard';
//import { IntelliComBoard } from './IntelliComBoard';
//import { EasyTouchBoard } from './EasyTouchBoard';
import { Outbound } from '../comms/messages/Messages';
export class byteValueMap extends Map<number, any> {
    public transform(byte) { return extend(true, { val: byte }, this[byte] || this[0]); };
    public toArray() : any[] {
        let arrKeys = Array.from(this.keys());
        let arr = [];
        for (let i = 0; i < arrKeys.length; i++) arr.push(this.transform(arrKeys[i]));
        return arr;
    }
    public transformByName(name: string) {
        let arr = this.toArray();
        for (let i = 0; i < arr.length; i++) {
            if (typeof (arr[i].name && arr[i].name === name)) return arr[i];
        }
        return { name: name };
    }
}
export class byteValueMaps {
    constructor() {
        this.pumpStatus.transform = function (byte) {
            for (let b = 16; b >= 0; b--) {
                let bit = (1 << (b - 1));
                let ndx = (byte & bit);
                if ((byte & bit) >= 0) {
                    if (typeof (this[ndx]) !== 'undefined') {
                        return extend(true, {}, this[ndx], { val: byte });
                    }
                }
            }
            return { val: byte, name: 'error' + byte, desc: 'Unspecified Error ' + byte };
        };
        this.chlorinatorStatus.transform = function (byte) {
            if (byte === 128) return { val: 128, name: 'commlost', desc: 'Communication Lost' };
            else if (byte === 0) return { val: 0, name: 'ok', desc: 'Ok' };
            for (let b = 8; b >= 0; b--) {
                let bit = (1 << (b));
                let ndx = (byte & bit);
                if ((byte & bit) > 0) {
                    if (typeof (this[ndx]) !== "undefined") {
                        return extend(true, {}, this[ndx], { val: byte & 0x00FF });
                    }
                }
            }
            return { val: byte, name: 'unknown' + byte, desc: 'Unknown status ' + byte };
        };
    }
    public circuitFunctions: byteValueMap = new byteValueMap();
    // Feature functions are used as the available options to define a circuit.
    public featureFunctions: byteValueMap = new byteValueMap([[0, { name: 'generic', desc: 'Generic' }], [1, { name: 'spillway', desc: 'Spillway' }]]);
    public heaterTypes: byteValueMap = new byteValueMap();
    public virtualCircuits: byteValueMap = new byteValueMap();
    public lightThemes: byteValueMap = new byteValueMap();
    public scheduleDays: byteValueMap = new byteValueMap();
    public pumpTypes: byteValueMap = new byteValueMap();
    public heatModes: byteValueMap = new byteValueMap();
    public pumpStatus: byteValueMap = new byteValueMap([
        [0, { name: 'stoppedok', desc: 'Ok - Stopped' }],
        [1, { name: 'runningok', desc: 'Ok - Running' }],
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
    public chlorinatorStatus: byteValueMap = new byteValueMap([
        [0, { name: 'ok', desc: 'Ok' }],
        [1, { name: 'lowflow', desc: 'Low Flow' }],
        [2, { name: 'lowsalt', desc: 'Low Salt' }],
        [3, { name: 'verylowsalt', desc: 'Very Low Salt' }],
        [4, { name: 'highcurrent', desc: 'High Current' }],
        [5, { name: 'clean', desc: 'Clean Cell' }],
        [6, { name: 'lowvoltage', desc: 'Low Voltage' }],
        [7, { name: 'lowtemp', dest: 'Water Temp Low' }],
        [8, { name: 'commlost', desc: 'Communication Lost' }]
    ]);
    public circuitNames: byteValueMap = new byteValueMap();
    public controllerStatus: byteValueMap = new byteValueMap();
}
// SystemBoard is a mechanism to abstract the underlying pool system from specific functionality
// managed by the personality board.  This also provides a way to override specific functions for
// acquiring state and configuration data.
export class SystemBoard {
    constructor(system: PoolSystem) {}
    // Factory create the system board from the controller type.  Resist storing
    // the pool system as this can cause a leak.  The PoolSystem object already has a reference to this.
    static fromControllerType(ct: ControllerType, system: PoolSystem) {
        console.log(ct);
        switch (ct) {
            case ControllerType.IntelliCenter:
                return eval('new IntelliCenterBoard(system)');
                //return new IntelliCenterBoard(system);
            case ControllerType.IntelliTouch:
                return eval('new IntelliTouchBoard(system)');
                //return new IntelliTouchBoard(system);
            case ControllerType.IntelliCom:
                return eval('new IntelliComBoard(system)');
                //return new IntelliComBoard(system);
            case ControllerType.EasyTouch:
                return eval('new EasyTouchBoard(system)');
                //return new EasyTouchBoard(system);
        }
        return new SystemBoard(system);
    }
    // These are all the value mappings that are default to the board.  Override these in the specific
    // board definition.
    public valueMaps: byteValueMaps = new byteValueMaps();
    public checkConfiguration() { };
    public requestConfiguration(ver?: ConfigVersion) { };
    public stopAsync() { };
    public getLightThemes(type?: number) { return this.valueMaps.lightThemes.toArray(); };
    public setDateTime(hour: number, min: number, date: number, month: number, year: number, dst: number, dow: number) { }
    public getHeatModes(bodyId:number) {
        let heatModes = [];
        heatModes.push(this.valueMaps.heatModes.transform(0));
        for (let i = 1; i <= sys.heaters.length; i++) {
            let heater = sys.heaters.getItemById(i);
            if (heater.body === 32 || // Any
                heater.body === 1 && bodyId === 2 || // Spa
                heater.body === 0 && bodyId === 1) {
                // Pool
                // Pool and spa.
                if (heater.type === 1) heatModes.push(this.valueMaps.heatModes.transformByName('heater'));
                if (heater.type === 2) {
                    heatModes.push(this.valueMaps.heatModes.transformByName('solar'));
                    if (heatModes.length > 2)
                        heatModes.push(this.valueMaps.heatModes.transformByName('solarpref'));
                }
            }
        }
        return heatModes;

    }
    public setHeatMode(body: Body, mode: number) { }
    public setHeatSetpoint(body: Body, setPoint: number) { }
    public setSchedule(sched: Schedule, obj?: any) { }
    public setPump(pump: Pump, obj?: any) {
        if (typeof obj !== 'undefined') {
            for (var prop in obj) {
                if (this.hasOwnProperty(prop)) pump[prop] = obj[prop];
            }
        }
    }
}
export class ConfigRequest {
    public failed: boolean = false;
    public version: number = 0; // maybe not used for intellitouch
    public items: number[] = [];
    public acquired: number[] = []; // used?
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
    public queue: ConfigRequest[] = [];
    public curr: ConfigRequest = null;
    public closed: boolean = false;
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
    public totalItems: number = 0;
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
    processNext(msg?: Outbound) { } // overridden in extended class
}

