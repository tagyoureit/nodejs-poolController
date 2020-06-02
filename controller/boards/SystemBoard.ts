import * as extend from 'extend';
import { PoolSystem, ConfigVersion, Body, Chlorinator, Schedule, Pump, CircuitGroup, CircuitGroupCircuit, Heater, sys, LightGroup, PumpCircuit, EggTimer, Circuit, Feature, Valve, Options, Location, Owner, General, ICircuit, CustomNameCollection, CustomName, LightGroupCircuit } from '../Equipment';
import { state, ChlorinatorState, BodyTempState, VirtualCircuitState, EquipmentState, ICircuitState, LightGroupState } from '../State';
import { Outbound, Response, Message, Protocol } from '../comms/messages/Messages';
import { conn } from '../comms/Comms';
import { utils } from '../Constants';
import { InvalidEquipmentIdError, ParameterOutOfRangeError, EquipmentNotFoundError, InvalidEquipmentDataError } from '../Errors';
import { logger } from '../../logger/Logger';
import { config } from '../../config/Config'; // TODO: RG - we shouldn't import this in here but I want to set the inactivityRetry from here.  What's the best way?

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
        return { name: name };
    }
    public getValue(name: string): number { return this.transformByName(name).val; }
    public getName(val: number): string { return val >= 0 && typeof this.get(val) !== 'undefined' ? this.get(val).name : ''; } // added default return as this was erroring out by not finding a name
    public merge(vals) {
        for (let val of vals) {
            this.set(val[0], val[1]);
        }
    }
    public valExists(val: number) {
        let arrKeys = Array.from(this.keys());
        return typeof arrKeys.find(elem => elem === val) !== 'undefined';
    }
}
export class EquipmentIdRange {
    constructor(start: number|Function, end: number|Function) {
        this._start = start;
        this._end = end;
    }
    private _start: any=0;
    private _end: any=0;
    public get start(): number { return typeof this._start === 'function' ? this._start() : this._start; }
    public set start(val: number) { this._start = val; }
    public get end(): number { return typeof this._end === 'function' ? this._end() : this._end; }
    public set end(val: number) { this._end = val; }
    public isInRange(id: number) { return id >= this.start && id <= this.end; }
}
export class InvalidEquipmentIdArray {
    constructor(data: number[]) { this._data = data; }
    private _data: number[];

    public get() { return this._data; }
    public set(val: number[]) { this._data = val; }
    public add(val: number) {
        if (!this._data.includes(val)) {
            this._data.push(val);
            this._data.sort();
        }
    }
    public remove(val: number) {
        this._data = this._data.filter(el => el !== val);
    }
    public isValidId(val: number) {
        return !this._data.includes(val);
    }
}
export class EquipmentIds {
    public circuits: EquipmentIdRange=new EquipmentIdRange(6, 6);
    public features: EquipmentIdRange=new EquipmentIdRange(7, function() { return this.start + sys.equipment.maxFeatures; });
    public pumps: EquipmentIdRange=new EquipmentIdRange(1, function() { return this.start + sys.equipment.maxPumps; });
    public circuitGroups: EquipmentIdRange=new EquipmentIdRange(0, 0);
    public virtualCircuits: EquipmentIdRange=new EquipmentIdRange(128, 136);
    public invalidIds: InvalidEquipmentIdArray=new InvalidEquipmentIdArray([]);
}
export class byteValueMaps {
    constructor() {
        this.pumpStatus.transform = function(byte) {
            // if (byte === 0) return this.get(0);
            if (byte === 0) return extend(true, {}, this.get(0), { val: byte });
            for (let b = 16; b > 0; b--) {
                let bit = (1 << (b - 1));
                if ((byte & bit) > 0) {
                    let v = this.get(b);
                    if (typeof v !== 'undefined') {
                        return extend(true, {}, v, { val: byte });
                    }
                }
            }
            return { val: byte, name: 'error' + byte, desc: 'Unspecified Error ' + byte };
        };
        this.chlorinatorStatus.transform = function(byte) {
            if (byte === 128) return { val: 128, name: 'commlost', desc: 'Communication Lost' };
            else if (byte === 0) return { val: 0, name: 'ok', desc: 'Ok' };
            for (let b = 8; b > 0; b--) {
                let bit = (1 << (b - 1));
                if ((byte & bit) > 0) {
                    let v = this.get(b);
                    if (typeof v !== "undefined") {
                        return extend(true, {}, v, { val: byte & 0x00FF });
                    }
                }
            }
            return { val: byte, name: 'unknown' + byte, desc: 'Unknown status ' + byte };
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
            return { val: b, days: days };
        };
        this.scheduleDays.toArray = function() {
            let arrKeys = Array.from(this.keys());
            let arr = [];
            for (let i = 0; i < arrKeys.length; i++) arr.push(extend(true, { val: arrKeys[i] }, this.get(arrKeys[i])));
            return arr;
        };
        this.virtualCircuits.transform = function(byte) {
            return extend(true, {}, { val: byte, name: 'Unknown ' + byte }, this.get(byte), { val: byte });
        };
        this.tempUnits.transform = function(byte) { return extend(true, {}, { val: byte & 0x04 }, this.get(byte & 0x04)); };
        this.panelModes.transform = function(byte) { return extend(true, { val: byte & 0x83 }, this.get(byte & 0x83)); };
        this.controllerStatus.transform = function(byte: number, percent?: number) {
            let v = extend(true, {}, this.get(byte) || this.get(0));
            if (typeof percent !== 'undefined') v.percent = percent;
            return v;
        };
        this.lightThemes.transform = function(byte) { return typeof byte === 'undefined' ? this.get(255) : extend(true, { val: byte }, this.get(byte) || this.get(255)); };
    }
    public expansionBoards: byteValueMap=new byteValueMap();
    public panelModes: byteValueMap=new byteValueMap([
        [0, { val: 0, name: 'auto', desc: 'Auto' }],
        [1, { val: 1, name: 'service', desc: 'Service' }],
        [8, { val: 8, name: 'freeze', desc: 'Freeze' }],
        [128, { val: 128, name: 'timeout', desc: 'Timeout' }],
        [129, { val: 129, name: 'service-timeout', desc: 'Service/Timeout' }]
    ]);
    public controllerStatus: byteValueMap=new byteValueMap([
        [0, { val: 0, name: 'initializing', percent: 0 }],
        [1, { val: 1, name: 'ready', desc: 'Ready', percent: 100 }],
        [2, { val: 2, name: 'loading', desc: 'Loading', percent: 0 }]
    ]);

    public circuitFunctions: byteValueMap=new byteValueMap([
        [0, { name: 'generic', desc: 'Generic' }],
        [1, { name: 'spa', desc: 'Spa' }],
        [2, { name: 'pool', desc: 'Pool' }],
        [5, { name: 'mastercleaner', desc: 'Master Cleaner' }],
        [7, { name: 'light', desc: 'Light', isLight: true }],
        [9, { name: 'samlight', desc: 'SAM Light', isLight: true }],
        [10, { name: 'sallight', desc: 'SAL Light', isLight: true }],
        [11, { name: 'photongen', desc: 'Photon Gen', isLight: true }],
        [12, { name: 'colorwheel', desc: 'Color Wheel', isLight: true }],
        [13, { name: 'valve', desc: 'Valve' }],
        [14, { name: 'spillway', desc: 'Spillway' }],
        [15, { name: 'floorcleaner', desc: 'Floor Cleaner' }],
        [16, { name: 'intellibrite', desc: 'Intellibrite', isLight: true }],
        [17, { name: 'magicstream', desc: 'Magicstream', isLight: true }],
        [19, { name: 'notused', desc: 'Not Used' }]
    ]);

    // Feature functions are used as the available options to define a circuit.
    public featureFunctions: byteValueMap=new byteValueMap([[0, { name: 'generic', desc: 'Generic' }], [1, { name: 'spillway', desc: 'Spillway' }]]);
    public heaterTypes: byteValueMap=new byteValueMap();
    public virtualCircuits: byteValueMap=new byteValueMap([
        [128, { name: 'solar', desc: 'Solar' }],
        [129, { name: 'heater', desc: 'Either Heater' }],
        [130, { name: 'poolHeater', desc: 'Pool Heater' }],
        [131, { name: 'spaHeater', desc: 'Spa Heater' }],
        [132, { name: 'freeze', desc: 'Freeze' }],
        [133, { name: 'heatBoost', desc: 'Heat Boost' }],
        [134, { name: 'heatEnable', desc: 'Heat Enable' }],
        [135, { name: 'pumpSpeedUp', desc: 'Pump Speed +' }],
        [136, { name: 'pumpSpeedDown', desc: 'Pump Speed -' }],
        [255, { name: 'notused', desc: 'NOT USED' }]
    ]);
    public lightThemes: byteValueMap=new byteValueMap([
        [0, { name: 'off', desc: 'Off', type: 'intellibrite' }],
        [1, { name: 'on', desc: 'On', type: 'intellibrite' }],
        [128, { name: 'colorsync', desc: 'Color Sync', type: 'intellibrite' }],
        [144, { name: 'colorswim', desc: 'Color Swim', type: 'intellibrite' }],
        [160, { name: 'colorset', desc: 'Color Set', type: 'intellibrite' }],
        [177, { name: 'party', desc: 'Party', type: 'intellibrite' }],
        [178, { name: 'romance', desc: 'Romance', type: 'intellibrite' }],
        [179, { name: 'caribbean', desc: 'Caribbean', type: 'intellibrite' }],
        [180, { name: 'american', desc: 'American', type: 'intellibrite' }],
        [181, { name: 'sunset', desc: 'Sunset', type: 'intellibrite' }],
        [182, { name: 'royal', desc: 'Royal', type: 'intellibrite' }],
        [190, { name: 'save', desc: 'Save', type: 'intellibrite' }],
        [191, { name: 'recall', desc: 'Recall', type: 'intellibrite' }],
        [193, { name: 'blue', desc: 'Blue', type: 'intellibrite' }],
        [194, { name: 'green', desc: 'Green', type: 'intellibrite' }],
        [195, { name: 'red', desc: 'Red', type: 'intellibrite' }],
        [196, { name: 'white', desc: 'White', type: 'intellibrite' }],
        [197, { name: 'magenta', desc: 'Magenta', type: 'intellibrite' }],
        [208, { name: 'thumper', desc: 'Thumper', type: 'magicstream' }],
        [209, { name: 'hold', desc: 'Hold', type: 'magicstream' }],
        [210, { name: 'reset', desc: 'Reset', type: 'magicstream' }],
        [211, { name: 'mode', desc: 'Mode', type: 'magicstream' }],
        [254, { name: 'unknown', desc: 'unknown' }],
        [255, { name: 'none', desc: 'None' }]
    ]);
    public lightColors: byteValueMap=new byteValueMap([
        [0, { name: 'white', desc: 'White' }],
        [2, { name: 'lightgreen', desc: 'Light Green' }],
        [4, { name: 'green', desc: 'Green' }],
        [6, { name: 'cyan', desc: 'Cyan' }],
        [8, { name: 'blue', desc: 'Blue' }],
        [10, { name: 'lavender', desc: 'Lavender' }],
        [12, { name: 'magenta', desc: 'Magenta' }],
        [14, { name: 'lightmagenta', desc: 'Light Magenta' }]
    ]);
    public scheduleDays: byteValueMap=new byteValueMap([
        [1, { name: 'sat', desc: 'Saturday', dow: 6 }],
        [2, { name: 'fri', desc: 'Friday', dow: 5 }],
        [3, { name: 'thu', desc: 'Thursday', dow: 4 }],
        [4, { name: 'wed', desc: 'Wednesday', dow: 3 }],
        [5, { name: 'tue', desc: 'Tuesday', dow: 2 }],
        [6, { name: 'mon', desc: 'Monday', dow: 1 }],
        [7, { name: 'sun', desc: 'Sunday', dow: 0 }]
    ]);
    public scheduleTimeTypes: byteValueMap=new byteValueMap([
        [0, { name: 'manual', desc: 'Manual' }]
    ]);

    public pumpTypes: byteValueMap=new byteValueMap([
        [0, { name: 'none', desc: 'No pump', maxCircuits: 0, hasAddress: false, hasBody: false }],
        [1, { name: 'vf', desc: 'Intelliflo VF', minFlow: 15, maxFlow: 130, maxCircuits: 8, hasAddress: true }],
        [64, { name: 'vsf', desc: 'Intelliflo VSF', minSpeed: 450, maxSpeed: 3450, minFlow: 15, maxFlow: 130, maxCircuits: 8, hasAddress: true }],
        [65, { name: 'ds', desc: 'Two-Speed', maxCircuits: 40, hasAddress: false, hasBody: true }],
        [128, { name: 'vs', desc: 'Intelliflo VS', maxPrimingTime: 6, minSpeed: 450, maxSpeed: 3450, maxCircuits: 8, hasAddress: true }],
        [169, { name: 'vssvrs', desc: 'IntelliFlo VS+SVRS', maxPrimingTime: 6, minSpeed: 450, maxSpeed: 3450, maxCircuits: 8, hasAddress: true }]
    ]);
    public pumpSSModels: byteValueMap=new byteValueMap([
        [0, { name: 'unspecified', desc: 'Unspecified', amps: 0, pf: 0, volts: 0, watts: 0 }],
        [1, { name: 'wf1hpE', desc: '1hp WhisperFlo E+', amps: 7.4, pf: .9, volts: 230, watts: 1532 }],
        [2, { name: 'wf1hpMax', desc: '1hp WhisperFlo Max', amps: 9, pf: .87, volts: 230, watts: 1600 }],
        [3, { name: 'generic15hp', desc: '1.5hp Pump', amps: 9.3, pf: .9, volts: 230, watts: 1925 }],
        [4, { name: 'generic2hp', desc: '2hp Pump', amps: 12, pf: .9, volts: 230, watts: 2484 }],
        [5, { name: 'generic25hp', desc: '2.5hp Pump', amps: 12.5, pf: .9, volts: 230, watts: 2587 }],
        [6, { name: 'generic3hp', desc: '3hp Pump', amps: 13.5, pf: .9, volts: 230, watts: 2794 }]
    ]);
    public pumpDSModels: byteValueMap=new byteValueMap([
        [0, { name: 'unspecified', desc: 'Unspecified', loAmps: 0, hiAmps: 0, pf: 0, volts: 0, loWatts: 0, hiWatts: 0 }],
        [1, { name: 'generic1hp', desc: '1hp Pump', loAmps: 2.4, hiAmps: 6.5, pf: .9, volts: 230, loWatts: 497, hiWatts: 1345 }],
        [2, { name: 'generic15hp', desc: '1.5hp Pump', loAmps: 2.7, hiAmps: 9.3, pf: .9, volts: 230, loWatts: 558, hiWatts: 1925 }],
        [3, { name: 'generic2hp', desc: '2hp Pump', loAmps: 2.9, hiAmps: 12, pf: .9, volts: 230, loWatts: 600, hiWatts: 2484 }],
        [4, { name: 'generic25hp', desc: '2.5hp Pump', loAmps: 3.1, hiAmps: 12.5, pf: .9, volts: 230, loWatts: 642, hiWatts: 2587 }],
        [5, { name: 'generic3hp', desc: '3hp Pump', loAmps: 3.3, hiAmps: 13.5, pf: .9, volts: 230, loWatts: 683, hiWatts: 2794 }]
    ]);
    public pumpVSModels: byteValueMap=new byteValueMap([
        [0, { name: 'intelliflovs', desc: 'IntelliFlo VS' }]
    ]);
    public pumpVSFModels: byteValueMap=new byteValueMap([
        [0, { name: 'intelliflovsf', desc: 'IntelliFlo VSF' }]
    ]);
    public pumpVSSVRSModels: byteValueMap=new byteValueMap([
        [0, { name: 'intelliflovssvrs', desc: 'IntelliFlo VS+SVRS' }]
    ]);
    // These are used for single-speed pump definitions.  Essentially the way this works is that when
    // the body circuit is running the single speed pump is on.
    public pumpBodies: byteValueMap=new byteValueMap([
        [0, { name: 'pool', desc: 'Pool' }],
        [101, { name: 'spa', desc: 'Spa' }],
        [255, { name: 'poolspa', desc: 'Pool/Spa' }]
    ]);


    public heatModes: byteValueMap=new byteValueMap([
        [0, { name: 'off', desc: 'Off' }],
        [3, { name: 'heater', desc: 'Heater' }],
        [5, { name: 'solar', desc: 'Solar Only' }],
        [12, { name: 'solarpref', desc: 'Solar Preferred' }]
    ]);
    public heatSources: byteValueMap=new byteValueMap([
        [0, { name: 'off', desc: 'No Heater' }],
        [3, { name: 'heater', desc: 'Heater' }],
        [5, { name: 'solar', desc: 'Solar Only' }],
        [21, { name: 'solarpref', desc: 'Solar Preferred' }],
        [32, { name: 'nochange', desc: 'No Change' }]
    ]);
    public heatStatus: byteValueMap=new byteValueMap([
        [0, { name: 'off', desc: 'Off' }],
        [1, { name: 'heater', desc: 'Heater' }],
        [2, { name: 'solar', desc: 'Solar' }],
        [3, { name: 'cooling', desc: 'Cooling' }]
    ]);
    public pumpStatus: byteValueMap=new byteValueMap([
        [0, { name: 'off', desc: 'Off' }], // When the pump is disconnected or has no power then we simply report off as the status.  This is not the recommended wiring
        // for a VS/VF pump as is should be powered at all times.  When it is, the status will always report a value > 0.
        [1, { name: 'ok', desc: 'Ok' }], // Status is always reported when the pump is not wired to a relay regardless of whether it is on or not
        // as is should be if this is a VS / VF pump.  However if it is wired to a relay most often filter, the pump will report status
        // 0 if it is not running.  Essentially this is no error but it is not a status either.
        [2, { name: 'filter', desc: 'Filter warning' }],
        [3, { name: 'overcurrent', desc: 'Overcurrent condition' }],
        [4, { name: 'priming', desc: 'Priming' }],
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
        [0, { name: 'rpm', desc: 'RPM' }],
        [1, { name: 'gpm', desc: 'GPM' }]
    ]);
    public bodies: byteValueMap=new byteValueMap([
        [0, { name: 'pool', desc: 'Pool' }],
        [1, { name: 'spa', desc: 'Spa' }],
        [2, { name: 'body3', desc: 'Body 3' }],
        [3, { name: 'body4', desc: 'Body 4' }],
        [32, { name: 'poolspa', desc: 'Pool/Spa' }]
    ]);
    public chlorinatorStatus: byteValueMap=new byteValueMap([
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
    public chlorinatorType: byteValueMap=new byteValueMap([
        [0, { name: 'pentair', desc: 'Pentair' }],
        [1, { name: 'unknown', desc: 'unknown' }],
        [2, { name: 'aquarite', desc: 'Aquarite' }],
        [3, { name: 'unknown', desc: 'unknown' }]
    ]);
    public customNames: byteValueMap=new byteValueMap();
    public circuitNames: byteValueMap=new byteValueMap();
    public scheduleTypes: byteValueMap=new byteValueMap([
        [0, { name: 'runonce', desc: 'Run Once' }],
        [128, { name: 'repeat', desc: 'Repeats' }]
    ]);
    public circuitGroupTypes: byteValueMap=new byteValueMap([
        [0, { name: 'none', desc: 'Unspecified' }],
        [1, { name: 'light', desc: 'Light' }],
        [2, { name: 'circuit', desc: 'Circuit' }],
        [3, { name: 'intellibrite', desc: 'IntelliBrite' }]
    ]);
    public tempUnits: byteValueMap=new byteValueMap([
        [0, { name: 'F', desc: 'Fahrenheit' }],
        [4, { name: 'C', desc: 'Celcius' }]
    ]);
    public valveTypes: byteValueMap=new byteValueMap([
        [0, { name: 'standard', desc: 'Standard' }],
        [1, { name: 'intellivalve', desc: 'IntelliValve' }]
    ]);
    public intellibriteActions: byteValueMap=new byteValueMap([
        [0, { name: 'ready', desc: 'Ready' }],
        [1, { name: 'sync', desc: 'Synchronizing' }],
        [2, { name: 'set', desc: 'Sequencing Set Operation' }],
        [3, { name: 'swim', desc: 'Sequencing Swim Operation' }],
        [4, { name: 'color', desc: 'Sequencing Theme/Color Operation' }],
        [5, { name: 'other', desc: 'Sequencing Save/Recall Operation' }]
    ]);
    public msgBroadcastActions: byteValueMap=new byteValueMap([
        [2, { name: 'status', desc: 'Equipment Status' }],
        [82, { name: 'ivstatus', desc: 'IntelliValve Status' }]
    ]);
    public chemControllerTypes: byteValueMap=new byteValueMap([
        [0, { name: 'unknown', desc: 'Unknown' }],
        [1, { name: 'intellichem', desc: 'IntelliChem' }]
    ]);
    public intelliChemWaterFlow: byteValueMap=new byteValueMap([
        [0, { name: 'ok', desc: 'Ok' }],
        [1, { name: 'alarm', desc: 'Alarm - No Water Flow' }]
    ]);
    public intelliChemStatus1: byteValueMap=new byteValueMap([
        // need to be verified - and combined with below?
        [37, { name: 'dosingAuto', desc: 'Dosing - Auto' }],
        [69, { name: 'dosingManual', desc: 'Dosing Acid - Manual' }],
        [85, { name: 'mixing', desc: 'Mixing' }],
        [101, { name: 'monitoring', desc: 'Monitoring' }]
    ]);
    public intelliChemStatus2: byteValueMap=new byteValueMap([
        // need to be verified
        [20, { name: 'ok', desc: 'Ok' }],
        [22, { name: 'dosingManual', desc: 'Dosing Chlorine - Manual' }]
    ]);
    public timeZones: byteValueMap=new byteValueMap([
        [128, { name: 'Samoa Standard Time', loc: 'Pacific', abbrev: 'SST', utcOffset: -11 }],
        [129, { name: 'Tahiti Time', loc: 'Pacific', abbrev: 'TAHT', utcOffset: -10 }],
        [130, { name: 'Alaska Standard Time', loc: 'North America', abbrev: 'AKST', utcOffset: -9 }],
        [131, { name: 'Pacific Standard Time', loc: 'North America', abbrev: 'PST', utcOffset: -8 }],
        [132, { name: 'Mountain Standard Time', loc: 'North America', abbrev: 'MST', utcOffset: -7 }],
        [133, { name: 'Central Standard Time', loc: 'North America', abbrev: 'CST', utcOffset: -6 }],
        [134, { name: 'Eastern Standard Time', loc: 'North America', abbrev: 'EST', utcOffset: -5 }],
        [135, { name: 'Chile Standard Time', loc: 'South America', abbrev: 'CLT', utcOffset: -4 }],
        [136, { name: 'French Guiana Time', loc: 'South America', abbrev: 'GFT', utcOffset: -3 }],
        [137, { name: 'Fernando de Noronha Time', loc: 'South America', abbrev: 'FNT', utcOffset: -2 }],
        [138, { name: 'Azores Time', loc: 'Atlantic', abbrev: 'AZOST', utcOffset: -1 }],
        [139, { name: 'Greenwich Mean Time', loc: 'Europe', abbrev: 'GMT', utcOffset: 0 }],
        [140, { name: 'Central European Time', loc: 'Europe', abbrev: 'CET', utcOffset: 1 }],
        [141, { name: 'Eastern European Time', loc: 'Europe', abbrev: 'EET', utcOffset: 2 }],
        [142, { name: 'Eastern Africa Time', loc: 'Africa', abbrev: 'EAT', utcOffset: 3 }],
        [143, { name: 'Georgia Standard Time', loc: 'Europe/Asia', abbrev: 'GET', utcOffset: 4 }],
        [144, { name: 'Pakistan Standard Time', loc: 'Asia', abbrev: 'PKT', utcOffset: 5 }],
        [145, { name: 'Bangladesh Standard Time', loc: 'Asia', abbrev: 'BST', utcOffset: 6 }],
        [146, { name: 'Western Indonesian Time', loc: 'Asia', abbrev: 'WIB', utcOffset: 7 }],
        [147, { name: 'Australian Western Standard Time', loc: 'Australia', abbrev: 'AWST', utcOffset: 8 }],
        [148, { name: 'Japan Standard Time', loc: 'Asia', abbrev: 'JST', utcOffset: 9 }],
        [149, { name: 'Australian Eastern Standard Time', loc: 'Australia', abbrev: 'AEST', utcOffset: 10 }],
        [150, { name: 'Solomon Islands Time', loc: 'Pacific', abbrev: 'SBT', utcOffset: 11 }],
        [151, { name: 'Marshall Islands Time', loc: 'Pacific', abbrev: 'MHT', utcOffset: 12 }],
        [191, { name: 'Fiji Time', loc: 'Pacific', abbrev: 'FJT', utcOffset: 12 }]
    ]);
    public clockSources: byteValueMap=new byteValueMap([
        [1, { name: 'manual', desc: 'Manual' }],
        [2, { name: 'server', desc: 'Server' }]
    ]);
    public clockModes: byteValueMap=new byteValueMap([
        [12, { name: '12 Hour' }],
        [24, { name: '24 Hour' }]
    ]);
    public virtualControllerStatus: byteValueMap=new byteValueMap([
        [-1, { name: 'notapplicable', desc: 'Not Applicable' }],
        [0, { name: 'stopped', desc: 'Stopped' }],
        [1, { name: 'running', desc: 'Running' }]
    ]);
}
// SystemBoard is a mechanism to abstract the underlying pool system from specific functionality
// managed by the personality board.  This also provides a way to override specific functions for
// acquiring state and configuration data.
export class SystemBoard {
    // TODO: (RSG) Do we even need to pass in system?  We don't seem to be using it and we're overwriting the var with the SystemCommands anyway.
    constructor(system: PoolSystem) { }
    protected _modulesAcquired: boolean=true;
    public needsConfigChanges: boolean = false;
    public valueMaps: byteValueMaps=new byteValueMaps();
    public checkConfiguration() { }
    public requestConfiguration(ver?: ConfigVersion) { }
    public async stopAsync() { 
        
        // turn off all circuits/features
        for (let i = 0; i <= state.circuits.length; i++){
            state.circuits.getItemByIndex(i).isOn = false;
        }
        for (let i = 0; i <= state.features.length; i++){
            state.features.getItemByIndex(i).isOn = false;
        }
        for (let i = 0; i <= state.lightGroups.length; i++){
            state.lightGroups.getItemByIndex(i).isOn = false;
        }
        // turn off chlor
        sys.board.virtualChlorinatorController.stop();

        return sys.board.virtualPumpControllers.stopAsync(); 
    }
    public system: SystemCommands=new SystemCommands(this);
    public bodies: BodyCommands=new BodyCommands(this);
    public pumps: PumpCommands=new PumpCommands(this);
    public circuits: CircuitCommands=new CircuitCommands(this);
    public valves: ValveCommands=new ValveCommands(this);
    public features: FeatureCommands=new FeatureCommands(this);
    public chlorinator: ChlorinatorCommands=new ChlorinatorCommands(this);
    public heaters: HeaterCommands=new HeaterCommands(this);

    public schedules: ScheduleCommands=new ScheduleCommands(this);
    public equipmentIds: EquipmentIds=new EquipmentIds();
    public virtualChlorinatorController=new ChlorinatorController(this);
    public virtualPumpControllers=new VirtualPumpControllerCollection(this);
    // We need this here so that we don't inadvertently start processing 2 messages before we get to a 204 in IntelliCenter.  This message tells
    // us all of the installed modules on the panel and the status is worthless until we know the equipment on the board.  For *Touch this is always true but the
    // virtual controller may need to make use of it after it looks for pumps and chlorinators.
    public get modulesAcquired(): boolean { return this._modulesAcquired; }
    public set modulesAcquired(value: boolean) { this._modulesAcquired = value; }
    public reloadConfig() {
        state.status = 0;
        sys.resetData();
        this.checkConfiguration();
    }
    public get commandSourceAddress(): number { return Message.pluginAddress; }
    public get commandDestAddress(): number { return 16; }
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
    processNext(msg?: Outbound) { }
    protected queueItems(cat: number, items?: number[]) { }
    protected queueRange(cat: number, start: number, end: number) { }
}
export class BoardCommands {
    protected board: SystemBoard=null;
    constructor(parent: SystemBoard) { this.board = parent; }
}
export class SystemCommands extends BoardCommands {
    public cancelDelay() { state.delay = 0; }
    public setDateTime(obj: any) { }
    public getDOW() { return this.board.valueMaps.scheduleDays.toArray(); }
    public async setGeneralAsync(obj: any): Promise<General> {
        let general = sys.general.get();
        if (typeof obj.alias === 'string') sys.general.alias = obj.alias;
        if (typeof obj.options !== 'undefined') await sys.board.system.setOptionsAsync(obj.options);
        if (typeof obj.location !== 'undefined') await sys.board.system.setLocationAsync(obj.location);
        if (typeof obj.owner !== 'undefined') await sys.board.system.setOwnerAsync(obj.owner);
        return new Promise<General>(function(resolve, reject) { resolve(sys.general); });
    }
    public async setOptionsAsync(obj: any): Promise<Options> {
        let opts = sys.general.options;
        if (typeof obj !== 'undefined') {
            for (var s in opts)
                if (typeof obj[s] !== 'undefined')
                    opts[s] = obj[s];
        }
        return new Promise<Options>(function(resolve, reject) { resolve(sys.general.options); });
    }
    public async setLocationAsync(obj: any): Promise<Location> {
        let loc = sys.general.location;
        if (typeof obj !== 'undefined') {
            for (var s in loc)
                if (typeof obj[s] !== 'undefined')
                    loc[s] = obj[s];
        }
        return new Promise<Location>(function(resolve, reject) { resolve(sys.general.location); });
    }
    public async setOwnerAsync(obj: any): Promise<Owner> {
        let owner = sys.general.owner;
        if (typeof obj !== 'undefined') {
            for (var s in owner)
                if (typeof obj[s] !== 'undefined')
                    owner[s] = obj[s];
        }
        return new Promise<Owner>(function(resolve, reject) { resolve(sys.general.owner); });
    }
    public getSensors() {
        let sensors = [{ name: 'Air Sensor', temp: state.temps.air - sys.general.options.airTempAdj, tempAdj: sys.general.options.airTempAdj, binding: 'airTempAdj' }];
        if (sys.equipment.shared) {
            if (sys.equipment.maxBodies > 2)
                sensors.push({ name: 'Water Sensor 1', temp: state.temps.waterSensor1 - sys.general.options.waterTempAdj1, tempAdj: sys.general.options.waterTempAdj1, binding: 'waterTempAdj1' },
                    { name: 'Water Sensor 2', temp: state.temps.waterSensor2 - sys.general.options.waterTempAdj2, tempAdj: sys.general.options.waterTempAdj2, binding: 'waterTempAdj2' });
            else
                sensors.push({ name: 'Water Sensor', temp: state.temps.waterSensor1 - sys.general.options.waterTempAdj1, tempAdj: sys.general.options.waterTempAdj1, binding: 'waterTempAdj1' });

            if (sys.board.heaters.isSolarInstalled()) {
                if (sys.equipment.maxBodies > 2) {
                    sensors.push({ name: 'Solar Sensor 1', temp: state.temps.solar - sys.general.options.solarTempAdj1, tempAdj: sys.general.options.solarTempAdj1, binding: 'solarTempAdj1' },
                        { name: 'Solar Sensor 2', temp: state.temps.solar - sys.general.options.solarTempAdj2, tempAdj: sys.general.options.solarTempAdj2, binding: 'solarTempAdj2' });
                }
                else
                    sensors.push({ name: 'Solar Sensor', temp: state.temps.solar - sys.general.options.solarTempAdj1, tempAdj: sys.general.options.solarTempAdj1, binding: 'solarTempAdj1' });
            }
        }
        else if (sys.equipment.dual) {
            sensors.push({ name: 'Water Sensor 1', temp: state.temps.waterSensor1 - sys.general.options.waterTempAdj1, tempAdj: sys.general.options.waterTempAdj1, binding: 'waterTempAdj1' },
                { name: 'Water Sensor 2', temp: state.temps.waterSensor2, tempAdj: sys.general.options.waterTempAdj2, binding: 'waterTempAdj2' });
            if (sys.board.heaters.isSolarInstalled()) {
                sensors.push({ name: 'Solar Sensor 1', temp: state.temps.solar - sys.general.options.solarTempAdj1, tempAdj: sys.general.options.solarTempAdj1, binding: 'solarTempAdj1' },
                    { name: 'Solar Sensor 2', temp: state.temps.solar - sys.general.options.solarTempAdj2, tempAdj: sys.general.options.solarTempAdj2, binding: 'solarTempAdj2' });
            }
        }
        return sensors;
    }
    public async setCustomNamesAsync(names: any[]): Promise<CustomNameCollection> {
        let arr = [];
        for (let i = 0; i < names.length; i++) { arr.push(sys.board.system.setCustomNameAsync(names[i])); }
        return new Promise<CustomNameCollection>(async (resolve, reject) => {
            try {
                await Promise.all(arr).catch(err => reject(err));
                resolve(sys.customNames);
            }
            catch (err) { reject(err); }
        });
    }
    public async setCustomNameAsync(data: any): Promise<CustomName> {
        return new Promise<CustomName>((resolve, reject) => {
            let id = parseInt(data.id, 10);
            if (isNaN(id)) return reject(new InvalidEquipmentIdError('Invalid Custom Name Id', data.id, 'customName'));
            if (id > sys.equipment.maxCustomNames) return reject(new InvalidEquipmentIdError('Custom Name Id out of range', data.id, 'customName'));
            let cname = sys.customNames.getItemById(id, true);
            cname.name = data.name;
            return resolve(cname);
        });
    }
}
export class BodyCommands extends BoardCommands {
    public async setBodyAsync(obj: any): Promise<Body> {
        return new Promise<Body>(function(resolve, reject) {
            let id = parseInt(obj.id, 10);
            if (isNaN(id)) reject(new InvalidEquipmentIdError('Body Id has not been defined', obj.id, 'Body'));
            let body = sys.bodies.getItemById(id, false);
            for (let s in body) body[s] = obj[s];
            resolve(body);
        });


    }
    public setHeatModeAsync(body: Body, mode: number) { }
    public setHeatSetpointAsync(body: Body, setPoint: number) { }
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
    public getPumpTypes() { return this.board.valueMaps.pumpTypes.toArray(); }
    public getCircuitUnits(pump?: Pump) {
        if (typeof pump === 'undefined')
            return this.board.valueMaps.pumpUnits.toArray();
        else {
            let pumpType = sys.board.valueMaps.pumpTypes.getName(pump.type);
            let val;
            if (pumpType.includes('vsf')) val = this.board.valueMaps.pumpUnits.toArray();
            else if (pumpType.includes('vs')) val = this.board.valueMaps.pumpUnits.getValue('rpm');
            else if (pumpType.includes('vf')) val = this.board.valueMaps.pumpUnits.getValue('gpm');
            else return {};
            return this.board.valueMaps.pumpUnits.transform(val);
        }
    }

    public setPump(pump: Pump, obj?: any) {
        if (typeof obj !== 'undefined') {
            for (var prop in obj) {
                if (prop in pump) pump[prop] = obj[prop];
            }
        }
    }
    public async setPumpAsync(data: any): Promise<Pump> {
        if (typeof data.id !== 'undefined') {
            let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
            if (id <= 0) id = sys.pumps.length + 1;
            if (isNaN(id)) throw new InvalidEquipmentIdError(`Invalid pump id: ${ data.id }`, data.id, 'Pump');
            let pump = sys.pumps.getItemById(id, data.id <= 0);
            let spump = state.pumps.getItemById(id, data.id <= 0);
            for (let prop in data) {
                if (prop in pump) pump[prop] = data[prop];
                if (prop in spump) spump[prop] = data[prop];
            }
            if (typeof data.circuits !== 'undefined') {
                // We are setting the circuits as well.
                let c = Math.max(pump.circuits.length, data.circuits.length);
                for (let i = 0; i < c; i++) {
                    if (i > data.circuits.length) pump.circuits.removeItemByIndex(i);
                    else {
                        let circ = pump.circuits.getItemByIndex(i, true, { id: i + 1 });
                        for (let prop in data) {
                            if (prop in circ) circ[prop] = data[prop];
                        }
                    }
                }
            }
            spump.emitEquipmentChange();
            return new Promise<Pump>((resolve, reject) => { resolve(pump); });
        }
        else
            throw new InvalidEquipmentIdError('No pump information provided', undefined, 'Pump');
    }
    public deletePumpAsync(data: any): Promise<Pump> {
        if (typeof data.id !== 'undefined') {
            let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
            if (id <= 0) id = sys.pumps.length + 1;
            if (isNaN(id)) throw new InvalidEquipmentIdError(`Invalid pump id: ${ data.id }`, data.id, 'Pump');
            let pump = sys.pumps.getItemById(id, false);
            let spump = state.pumps.getItemById(id, false);
            sys.pumps.removeItemById(id);
            state.pumps.removeItemById(id);
            if (typeof data.circuits !== 'undefined') {
                // We are setting the circuits as well.
                let c = Math.max(pump.circuits.length, data.circuits.length);
                for (let i = 0; i < c; i++) {
                    if (i > data.circuits.length) pump.circuits.removeItemByIndex(i);
                    else {
                        let circ = pump.circuits.getItemByIndex(i, true, { id: i + 1 });
                        for (let prop in data) {
                            if (prop in circ) circ[prop] = data[prop];
                        }
                    }
                }
            }
            spump.emitEquipmentChange();
            return new Promise<Pump>((resolve, reject) => { resolve(pump); });
        }
        else
            return Promise.reject(new InvalidEquipmentIdError('No pump information provided', undefined, 'Pump'));
    }
    public deletePumpCircuit(pump: Pump, pumpCircuitId: number) {
        pump.circuits.removeItemById(pumpCircuitId);
        this.setPump(pump);
        let spump = state.pumps.getItemById(pump.id);
        spump.emitData('pumpExt', spump.getExtended());
    }
    public setPumpCircuit(pump: Pump, pumpCircuitDeltas: any) {
        const origValues = extend(true, {}, pumpCircuitDeltas);
        let { pumpCircuitId, circuit, rate, units } = pumpCircuitDeltas;

        let failed = false;
        let succeeded = false;
        // STEP 1 - Make a copy of the existing circuit
        let shadowPumpCircuit: PumpCircuit = pump.circuits.getItemById(pumpCircuitId);

        // if pumpCircuitId === 0, do we have an available circuit
        if (pumpCircuitId === 0 || typeof pumpCircuitId === 'undefined') {
            pumpCircuitId = pump.nextAvailablePumpCircuit();
            // no circuits available
            if (pumpCircuitId === 0) failed = true;
            succeeded = true;
        }
        // if we get a bad pumpCircuitId then fail.  Only idiots will get here.
        else if (pumpCircuitId < 1 || pumpCircuitId > 8) failed = true;
        if (failed) return { result: 'FAILED', reason: { pumpCircuitId: pumpCircuitId } };

        // STEP 1A: Validate Circuit
        // first check if we are missing both a new circuitId or existing circuitId
        if (typeof circuit !== 'undefined') {
            let _circuit = sys.circuits.getInterfaceById(circuit);
            if (_circuit.isActive === false || typeof _circuit.type === 'undefined') {
                // not a good circuit, fail
                return { result: 'FAILED', reason: { circuit: circuit } };
            }
            shadowPumpCircuit.circuit = circuit;
            succeeded = true;
        }
        // if we don't have a circuit, fail
        if (typeof shadowPumpCircuit.circuit === 'undefined') return { result: 'FAILED', reason: { circuit: 0 } };

        // STEP 1B: Validate Rate/Units
        let type = sys.board.valueMaps.pumpTypes.transform(pump.type).name;
        switch (type) {
            case 'vs':
                // if VS, need rate only
                // in fact, ignoring units
                if (typeof rate === 'undefined') rate = shadowPumpCircuit.speed;
                shadowPumpCircuit.units = sys.board.valueMaps.pumpUnits.getValue('rpm');
                shadowPumpCircuit.speed = pump.checkOrMakeValidRPM(rate);
                shadowPumpCircuit.flow = undefined;
                succeeded = true;
                break;
            case 'vf':
                // if VF, need rate only
                // in fact, ignoring units
                if (typeof rate === 'undefined') rate = shadowPumpCircuit.flow;
                shadowPumpCircuit.units = sys.board.valueMaps.pumpUnits.getValue('gpm');
                shadowPumpCircuit.flow = pump.checkOrMakeValidGPM(rate);
                shadowPumpCircuit.speed = undefined;
                succeeded = true;
                break;
            case 'vsf':
                // if VSF, we can take either rate or units or both and make a valid pumpCircuit
                if ((typeof rate !== 'undefined') && (typeof units !== 'undefined')) {
                    // do we have a valid combo of units and rate? -- do we need to check that or assume it will be passed in correctly?
                    if (sys.board.valueMaps.pumpUnits.getName(units) === 'rpm') {
                        shadowPumpCircuit.speed = pump.checkOrMakeValidRPM(rate);
                        shadowPumpCircuit.units = sys.board.valueMaps.pumpUnits.getValue('rpm');
                        shadowPumpCircuit.flow = undefined;
                        succeeded = true;
                    }
                    else {
                        shadowPumpCircuit.flow = pump.checkOrMakeValidGPM(rate);
                        shadowPumpCircuit.units = sys.board.valueMaps.pumpUnits.getValue('gpm');
                        shadowPumpCircuit.speed = undefined;
                        succeeded = true;
                    }
                }
                else if (typeof rate === 'undefined') {
                    // only have units; set default rate or use existing rate
                    if (sys.board.valueMaps.pumpUnits.getName(units) === 'rpm') {
                        shadowPumpCircuit.speed = pump.checkOrMakeValidRPM(shadowPumpCircuit.speed);
                        shadowPumpCircuit.flow = undefined;
                        succeeded = true;
                    }
                    else {
                        shadowPumpCircuit.flow = pump.checkOrMakeValidGPM(shadowPumpCircuit.flow);
                        shadowPumpCircuit.speed = undefined;
                        succeeded = true;
                    }
                }
                else if (typeof units === 'undefined') {
                    let rateType = pump.isRPMorGPM(rate);
                    if (rateType !== 'gpm') {
                        // default to speed if None
                        shadowPumpCircuit.flow = rate;
                        shadowPumpCircuit.speed = undefined;
                    }
                    else {
                        shadowPumpCircuit.speed = rate || 1000;
                        shadowPumpCircuit.flow = undefined;
                    }
                    shadowPumpCircuit.units = sys.board.valueMaps.pumpUnits.getValue(rateType);
                    succeeded = true;
                }
                break;
        }

        if (!succeeded) return { result: 'FAILED', reason: origValues };
        // STEP 2: Copy values to real circuit -- if we get this far, we have a real circuit
        let pumpCircuit: PumpCircuit = pump.circuits.getItemById(pumpCircuitId, true);
        pumpCircuit.circuit = shadowPumpCircuit.circuit;
        pumpCircuit.units = shadowPumpCircuit.units;
        pumpCircuit.speed = shadowPumpCircuit.speed;
        pumpCircuit.flow = shadowPumpCircuit.flow;

        // todo: emit pumpCircuit changes here somehow
        // can't use this becasue it doesn't emit "extended" info
        // sys.pumps.emitEquipmentChange();

        this.setPump(pump);
        let spump = state.pumps.getItemById(pump.id);
        spump.emitData('pumpExt', spump.getExtended());
        sys.emitEquipmentChange();
        return { result: 'OK' };

    }

    public setType(pump: Pump, pumpType: number) {
        // if we are changing pump types, need to clear out circuits
        // and props that aren't for this pump type
        let _id = pump.id;
        if (pump.type !== pumpType || pumpType === 0) {
            const _isVirtual = sys.pumps.getItemById(_id).isVirtual;
            sys.pumps.removeItemById(_id);
            let pump = sys.pumps.getItemById(_id, true);
            if (_isVirtual) {
                pump.isActive = true;
                pump.isVirtual = true;
            }
            state.pumps.removeItemById(pump.id);
            pump.type = pumpType;
            this.setPump(pump, sys.board.valueMaps.pumpTypes.get(pumpType));
            let spump = state.pumps.getItemById(pump.id, true);
            spump.type = pump.type;
            spump.status = 0;
            spump.emitData('pumpExt', spump.getExtended());
        }
    }
    public availableCircuits() {
        let _availCircuits = [];
        for (let i = 0; i < sys.circuits.length; i++) {
            let circ = sys.circuits.getItemByIndex(i);
            if (circ.isActive) _availCircuits.push({ type: 'circuit', id: circ.id, name: circ.name });
        }
        for (let i = 0; i < sys.features.length; i++) {
            let circ = sys.features.getItemByIndex(i);
            if (circ.isActive) _availCircuits.push({ type: 'feature', id: circ.id, name: circ.name });
        }
        let arrCircuits = sys.board.valueMaps.virtualCircuits.toArray();
        for (let i = 0; i < arrCircuits.length; i++) {
            let vc = arrCircuits[i];
            switch (vc.name) {
                case 'poolHeater':
                case 'spaHeater':
                case 'freeze':
                case 'poolSpa':
                case 'solarHeat':
                case 'solar':
                case 'heater':
                    _availCircuits.push({ type: 'virtual', id: vc.val, name: vc.desc });
            }
        }
        // what is "not used" on Intellicenter?  Hardcoded for *Touch for now.
        _availCircuits.push({ type: 'none', id: 255, name: 'Remove' });
        return _availCircuits;
    }
    // ping the pump and see if we get a response
    public async initPump(pump: Pump) {
        try {
            await this.setPumpToRemoteControlAsync(pump, true);
            await this.requestPumpStatusAsync(pump);
            logger.info(`found pump ${ pump.id }`);
            let spump = sys.pumps.getItemById(pump.id, true);
            spump.type = pump.type;
            pump.circuits.clear();
            await this.setPumpToRemoteControlAsync(pump, false);
        }
        catch (err) {
            logger.info(`Init pump cannot find pump: ${ err.message }.  Removing.`);
            if (pump.id > 1) { sys.pumps.removeItemById(pump.id); }
        }
    }
    public async run(pump: Pump) {
        let pumpCircuits = pump.circuits.get();
        let _maxSpeed = 0;
        let _units;
        for (let i = 0; i < pumpCircuits.length; i++) {
            let circ = state.circuits.getInterfaceById(pumpCircuits[i].circuit);
            if (circ.isOn) {
                if (typeof _units === 'undefined') _units = pumpCircuits[i].units;
                if (_units === pumpCircuits[i].units && pumpCircuits[i].speed > _maxSpeed) { _maxSpeed = pumpCircuits[i].speed; }
            }
        }
        try {
            await this.setPumpToRemoteControlAsync(pump, true);
            await this.setDriveStatePacketAsync(pump, _maxSpeed > 0);
            if (_maxSpeed > 130) { this.runRPMAsync(pump, _maxSpeed); }
            if (_maxSpeed > 0 && _maxSpeed <= 130) { this.runGPMAsync(pump, _maxSpeed); }
        }
        catch (err) {
            // log something
            logger.error(`Caught an error running virtual pumps. ${ err.message }`);
        }
        finally {
            // timeout here
            setTimeout(() => { this.requestPumpStatusAsync(pump); }, 7 * 1000);
        }
    }

    public async stopAsync(pump: Pump) {
        let p = [];
        p.push(this.setDriveStatePacketAsync(pump, false));
        p.push(this.setPumpManualAsync(pump));
        p.push(this.setDriveStatePacketAsync(pump, true));
        p.push(this.setPumpToRemoteControlAsync(pump, false));
        return Promise.all(p);
    }
    private async setPumpToRemoteControlAsync(pump: Pump, isRemotControl: boolean) {
        return new Promise((resolve, reject) => {
            let out = Outbound.create({
                protocol: Protocol.Pump,
                dest: pump.address,
                action: 4,
                payload: isRemotControl ? [255] : [0],
                retries: 1,
                response: true,
                onComplete: (err) => {
                    if (err)  reject(err); 
                    else resolve();
                }
            });
            conn.queueSendMessage(out);
        });
    }

    private setPumpManualAsync(pump: Pump) {
        return new Promise((resolve, reject) => {
            let out = Outbound.create({
                protocol: Protocol.Pump,
                dest: pump.address,
                action: 5,
                payload: [],
                retries: 1,
                onComplete: (err, msg: Outbound) => {
                    if (err) reject(err);
                    else {
                        logger.info(`received back pump power packet.`);
                        resolve();
                    }
                    // logger.info(msg);
                }
            });
            conn.queueSendMessage(out);
        });
    }
    private setDriveStatePacketAsync(pump: Pump, driveState: boolean) {
        return new Promise((resolve, reject) => {
            let out = Outbound.create({
                protocol: Protocol.Pump,
                dest: pump.address,
                action: 6,
                payload: driveState ? [10] : [4],
                retries: 1,
                onComplete: (err, msg: Outbound) => {
                    if (err) reject(err);
                    else {
                        logger.info(`received back pump drivestate packet.`);
                        resolve();
                    }
                }
            });
            conn.queueSendMessage(out);
        });
    }

    private async runRPMAsync(pump: Pump, speed: number) {
        // payload[0] === 1 is for VS (type 128); 10 for VSF (type 64)
        /*
                const msg = Outbound.createPumpMessage(pump.address, pump.type === 128 ? 1 : 10, [2, 196, Math.floor(speed / 256), speed % 256], 1);
                conn.queueSendMessage(msg); */
        return new Promise((resolve, reject) => {
            let out = Outbound.create({
                protocol: Protocol.Pump,
                dest: pump.address,
                action: pump.type === 128 ? 1 : 10,
                payload: [2, 196, Math.floor(speed / 256), speed % 256],
                retries: 1,
                response: true,
                onComplete: (err, msg) => {
                    if (err) reject(err);
                    else {
                        logger.info(`received back run rpm.`);
                        resolve();
                    }
                }
            });
            conn.queueSendMessage(out);
        });
        /*
            var type = container.pump.getCurrentPumpStatus().pump[address-95].type
        if (type==='VS'){
            runPrg[0] = 1
            runPrg[3] = 196
        }
        else if (type==='VSF') // VSF
        {
            runPrg[0] = 10
            runPrg[3] = 196
        }
        else if (type==='VF'){
            container.logger.error('Cannot set RPM on VF Pump')
        }
        runPrg[1]=4
        runPrg[2]=2
        //run program
        //var runPrg = [1, 4, 2, 196]
        runPrg.push(Math.floor(rpm/256))
        runPrg.push(rpm%256)

        var runProgramPacket = [165, 0, address, container.settings.get('appAddress')];
        Array.prototype.push.apply(runProgramPacket, runPrg);
        */
    }

    private runGPMAsync(pump: Pump, speed: number) {
        // payload[0] === 1 is for VS (type 128); 10 for VSF (type 64)

        /*         const msg = Outbound.createPumpMessage(pump.address, 4, [pump.type === 128 ? 1 : 10, 4, 2, 196, Math.floor(speed / 256), speed % 256], 1);
                if (pump.type === 1) {
                    // vf
                    msg.payload[0] = 1;
                    msg.payload[3] = 228;
                }
                else {
                    // vsf
                    msg.payload[0] = 9;
                    msg.payload[3] = 196;
                }
                conn.queueSendMessage(msg); */
        return new Promise((resolve, reject) => {
            let out = Outbound.create({
                protocol: Protocol.Pump,
                dest: pump.address,
                action: pump.type === 128 ? 1 : 10,
                payload: [],
                retries: 1,
                onComplete: (err, msg) => {
                    if (err) reject(err); 
                    else logger.info(`received back run gpm.`);
                    resolve();
                }
            });

            if (pump.type === 1) {
                // vf
                out.payload = [1, 4, 2, 228, speed, 0];
            }
            else {
                out.payload = [1, 4, 2, 196, speed, 0];
            }
            conn.queueSendMessage(out);
        });
    }

    private async requestPumpStatusAsync(pump: Pump) {
        return new Promise((resolve, reject) => {
            let out = Outbound.create({
                protocol: Protocol.Pump,
                dest: pump.address,
                action: 7,
                payload: [],
                retries: 1,
                response: true,
                onComplete: (err, msg) => {
                    if (err) reject(err); 
                    else {
                        logger.info(`received back pump status.`);
                        resolve();
                    }
                }
            });
            conn.queueSendMessage(out);
        });
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
            }
        }
    }

    public setCircuitStateAsync(id: number, val: boolean): Promise<ICircuitState> {
        let circ = state.circuits.getInterfaceById(id);
        circ.isOn = utils.makeBool(val);
        if (circ.id === 6) { 
            state.temps.bodies.getItemById(1).isOn = circ.isOn;
            circ.isOn ?  sys.board.virtualChlorinatorController.start() : sys.board.virtualChlorinatorController.stop();
        }
        sys.board.virtualPumpControllers.start()
        return Promise.resolve(circ);
    }

    public toggleCircuitStateAsync(id: number) {
        let circ = state.circuits.getInterfaceById(id);
        return this.setCircuitStateAsync(id, !circ.isOn);
    }
    public setLightThemeAsync(id: number, theme: number) {
        let circ = state.circuits.getItemById(id);
        circ.lightingTheme = theme;
    }
    public setDimmerLevel(id: number, level: number) {
        let circ = state.circuits.getItemById(id);
        circ.level = level;
    }
    public getCircuitReferences(includeCircuits?: boolean, includeFeatures?: boolean, includeVirtual?: boolean, includeGroups?: boolean) {
        let arrRefs = [];
        if (includeCircuits) {
            let circuits = sys.circuits.get();
            for (let i = 0; i < circuits.length; i++) {
                let c = circuits[i];
                arrRefs.push({ id: c.id, name: c.name, type: c.type, equipmentType: 'circuit', nameId: c.nameId });
            }
        }
        if (includeFeatures) {
            let features = sys.features.get();
            for (let i = 0; i < sys.features.length; i++) {
                let c = features[i];
                arrRefs.push({ id: c.id, name: c.name, type: c.type, equipmentType: 'feature', nameId: c.nameId });
            }
        }
        if (includeVirtual) {
            let vcs = sys.board.valueMaps.virtualCircuits.toArray();
            for (let i = 0; i < vcs.length; i++) {
                let c = vcs[i];
                arrRefs.push({ id: c.val, name: c.desc, equipmentType: 'virtual' });
            }
        }
        if (includeGroups) {
            let groups = sys.circuitGroups.get();
            for (let i = 0; i < groups.length; i++) {
                let c = groups[i];
                arrRefs.push({ id: c.id, name: c.name, equipmentType: 'circuitGroup', nameId: c.nameId });
            }
            groups = sys.lightGroups.get();
            for (let i = 0; i < groups.length; i++) {
                let c = groups[i];
                arrRefs.push({ id: c.id, name: c.name, equipmentType: 'lightGroup', nameId: c.nameId });
            }
        }
        arrRefs.sort((a, b) => { return a.id > b.id ? 1 : a.id === b.id ? 0 : -1; });
        return arrRefs;
    }
    public getLightReferences() {
        let circuits = sys.circuits.get();
        let arrRefs = [];
        for (let i = 0; i < circuits.length; i++) {
            let c = circuits[i];
            let type = sys.board.valueMaps.circuitFunctions.transform(c.type);
            if (type.isLight) arrRefs.push({ id: c.id, name: c.name, type: c.type, equipmentType: 'circuit', nameId: c.nameId });
        }
        return arrRefs;
    }
    public getLightThemes(type?: number) { return sys.board.valueMaps.lightThemes.toArray(); }
    public getCircuitFunctions() { return sys.board.valueMaps.circuitFunctions.toArray(); }
    public getCircuitNames() {
        return [...sys.board.valueMaps.circuitNames.toArray(), ...sys.board.valueMaps.customNames.toArray()];
    }
    public async setCircuitAsync(data: any): Promise<ICircuit> {
        let id = parseInt(data.id, 10);
        if (isNaN(id)) throw new InvalidEquipmentIdError(`Invalid circuit id: ${ data.id }`, data.id, 'Circuit');
        if (id === 6) throw new ParameterOutOfRangeError('You may not set the pool circuit', 'Setting Circuit Config', 'id', id);

        if (!sys.board.equipmentIds.features.isInRange(id) || id === 6) return;
        if (typeof data.id !== 'undefined') {
            let circuit = sys.circuits.getInterfaceById(id, true);
            let scircuit = state.circuits.getInterfaceById(id, true);
            circuit.isActive = true;
            scircuit.isOn = false;
            if (data.nameId) {
                circuit.nameId = scircuit.nameId = data.nameId;
                circuit.name = scircuit.name = sys.board.valueMaps.circuitNames.get(data.nameId);
            }
            else if (data.name) circuit.name = scircuit.name = data.name;
            else if (!circuit.name && !data.name) circuit.name = scircuit.name = `circuit${ data.id }`;
            if (typeof data.type !== 'undefined') circuit.type = scircuit.type = parseInt(data.type, 10);
            else circuit.type = scircuit.type = 0;
            if (typeof data.freeze !== 'undefined') circuit.freeze = utils.makeBool(data.freeze);
            if (typeof data.showInFeatures !== 'undefined') circuit.showInFeatures = scircuit.showInFeatures = utils.makeBool(data.showInFeatures);
            if (typeof data.eggTimer !== 'undefined') circuit.eggTimer = parseInt(data.eggTimer, 10);
            sys.emitEquipmentChange();
            state.emitEquipmentChanges();
            return new Promise<ICircuit>((resolve, reject) => { resolve(circuit); });
        }
        else
            throw new Error('Circuit id has not been defined');
    }
    public async setCircuitGroupAsync(obj: any): Promise<CircuitGroup> {
        let group: CircuitGroup = null;
        let id = typeof obj.id !== 'undefined' ? parseInt(obj.id, 10) : -1;
        if (id <= 0) {
            // We are adding a circuit group.
            id = sys.circuitGroups.getNextEquipmentId(sys.board.equipmentIds.circuitGroups);
        }
        if (typeof id === 'undefined') throw new InvalidEquipmentIdError(`Max circuit group id exceeded`, id, 'CircuitGroup');
        if (isNaN(id) || !sys.board.equipmentIds.circuitGroups.isInRange(id)) throw new InvalidEquipmentIdError(`Invalid circuit group id: ${ obj.id }`, obj.id, 'CircuitGroup');
        group = sys.circuitGroups.getItemById(id, true);
        return new Promise<CircuitGroup>((resolve, reject) => {
            if (typeof obj.name !== 'undefined') group.name = obj.name;
            if (typeof obj.eggTimer !== 'undefined') group.eggTimer = Math.min(Math.max(parseInt(obj.eggTimer, 10), 0), 1440);
            group.isActive = true;
            if (typeof obj.circuits !== 'undefined') {
                for (let i = 0; i < obj.circuits.length; i++) {
                    let c = group.circuits.getItemByIndex(i, true, { id: i + 1 });
                    let cobj = obj.circuits[i];
                    if (typeof cobj.circuit !== 'undefined') c.circuit = cobj.circuit;
                    if (typeof cobj.desiredStateOn !== 'undefined') c.desiredStateOn = utils.makeBool(cobj.desiredStateOn);
                    if (typeof cobj.lightingTheme !== 'undefined') c.lightingTheme = parseInt(cobj.lightingTheme, 10);
                }
                // group.circuits.length = obj.circuits.length;  // RSG - removed as this will delete circuits that were not changed
            }
            resolve(group);
        });

    }
    public async setLightGroupAsync(obj: any): Promise<LightGroup> {
        let group: LightGroup = null;
        let id = typeof obj.id !== 'undefined' ? parseInt(obj.id, 10) : -1;
        if (id <= 0) {
            // We are adding a circuit group.
            id = sys.circuitGroups.getNextEquipmentId(sys.board.equipmentIds.circuitGroups);
        }
        if (typeof id === 'undefined') throw new InvalidEquipmentIdError(`Max circuit light group id exceeded`, id, 'LightGroup');
        if (isNaN(id) || !sys.board.equipmentIds.circuitGroups.isInRange(id)) throw new InvalidEquipmentIdError(`Invalid circuit group id: ${ obj.id }`, obj.id, 'LightGroup');
        group = sys.lightGroups.getItemById(id, true);
        return new Promise<LightGroup>((resolve, reject) => {
            if (typeof obj.name !== 'undefined') group.name = obj.name;
            if (typeof obj.eggTimer !== 'undefined') group.eggTimer = Math.min(Math.max(parseInt(obj.eggTimer, 10), 0), 1440);
            group.isActive = true;
            if (typeof obj.circuits !== 'undefined') {
                for (let i = 0; i < obj.circuits.length; i++) {
                    let cobj = obj.circuits[i];
                    let c: LightGroupCircuit;
                    if (typeof cobj.id !== 'undefined') c = group.circuits.getItemById(parseInt(cobj.id, 10), true);
                    else if (typeof cobj.circuit !== 'undefined') c = group.circuits.getItemByCircuitId(parseInt(cobj.circuit, 10), true);
                    else c = group.circuits.getItemByIndex(i, true, { id: i + 1 });
                    if (typeof cobj.circuit !== 'undefined') c.circuit = cobj.circuit;
                    if (typeof cobj.lightingTheme !== 'undefined') c.lightingTheme = parseInt(cobj.lightingTheme, 10);
                    if (typeof cobj.color !== 'undefined') c.color = parseInt(cobj.color, 10);
                    if (typeof cobj.swimDelay !== 'undefined') c.swimDelay = parseInt(cobj.swimDelay, 10);
                    if (typeof cobj.position !== 'undefined') c.position = parseInt(cobj.position, 10);
                }
                // group.circuits.length = obj.circuits.length; // RSG - removed as this will delete circuits that were not changed
            }
            resolve(group);
        });
    }
    public async deleteCircuitGroupAsync(obj: any): Promise<CircuitGroup> {
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) throw new EquipmentNotFoundError(`Invalid group id: ${ obj.id }`, 'CircuitGroup');
        if (!sys.board.equipmentIds.circuitGroups.isInRange(id)) return;
        if (typeof obj.id !== 'undefined') {
            let group = sys.circuitGroups.getItemById(id, false);
            let sgroup = state.circuitGroups.getItemById(id, false);
            sys.features.removeItemById(id);
            state.features.removeItemById(id);
            group.isActive = false;
            sgroup.isOn = false;
            sgroup.isActive = false;
            sgroup.emitEquipmentChange();
            return new Promise<CircuitGroup>((resolve, reject) => { resolve(group); });
        }
        else
            throw new InvalidEquipmentIdError('Group id has not been defined', id, 'CircuitGroup');

    }
    public async deleteCircuitAsync(data: any): Promise<ICircuit> {
        if (typeof data.id === 'undefined') throw new InvalidEquipmentIdError('You must provide an id to delete a circuit', data.id, 'Circuit');
        let circuit = sys.circuits.getInterfaceById(data.id);
        if (circuit instanceof Circuit) {
            sys.circuits.removeItemById(data.id);
            state.circuits.removeItemById(data.id);
        }
        if (circuit instanceof Feature) {
            sys.features.removeItemById(data.id);
            state.features.removeItemById(data.id);
        }
        return new Promise<ICircuit>((resolve, reject) => { resolve(circuit); });
    }
    public deleteCircuit(data: any) {
        if (typeof data.id !== 'undefined') {
            let circuit = sys.circuits.getInterfaceById(data.id);
            if (circuit instanceof Circuit) {
                sys.circuits.removeItemById(data.id);
                state.circuits.removeItemById(data.id);
                return;
            }
            if (circuit instanceof Feature) {
                sys.features.removeItemById(data.id);
                state.features.removeItemById(data.id);
                return;
            }
        }
    }
    public getNameById(id: number) {
        if (id < 200)
            return sys.board.valueMaps.circuitNames.transform(id).desc;
        else
            return sys.customNames.getItemById(id - 200).name;
    }
    public async setIntelliBriteThemeAsync(id: number, theme: number) {
        return sys.board.circuits.setIntelliBriteThemeAsync(id, theme);
        /* state.intellibrite.lightingTheme = sys.intellibrite.lightingTheme = theme;
        for (let i = 0; i <= sys.intellibrite.circuits.length; i++) {
            let ib = sys.intellibrite.circuits.getItemByIndex(i);
            let circuit = sys.circuits.getItemById(ib.circuit);
            let cstate = state.circuits.getItemById(ib.circuit, true);
            if (cstate.isOn) cstate.lightingTheme = circuit.lightingTheme = theme;
        } */
    }
    public setIntelliBriteColors(group: LightGroup) {
        sys.intellibrite.circuits.clear();
        for (let i = 0; i < group.circuits.length; i++) {
            let circuit = group.circuits.getItemByIndex(i);
            sys.intellibrite.circuits.add({ id: i, circuit: circuit.circuit, color: circuit.color, position: i, swimDelay: circuit.swimDelay });
        }
        state.intellibrite.hasChanged = true; // Say we are dirty but we really are pure as the driven snow.
    }
    public setLightGroupAttribs(group: LightGroup) {
        let grp = sys.lightGroups.getItemById(group.id);
        grp.circuits.clear();
        for (let i = 0; i < group.circuits.length; i++) {
            let circuit = group.circuits.getItemByIndex(i);
            grp.circuits.add({ id: i, circuit: circuit.circuit, color: circuit.color, position: i, swimDelay: circuit.swimDelay });
        }
        let sgrp = state.lightGroups.getItemById(group.id);
        sgrp.hasChanged = true; // Say we are dirty but we really are pure as the driven snow.
    }
    public sequenceLightGroupAsync(id: number, operation: string): Promise<LightGroupState> {
        let sgroup = state.lightGroups.getItemById(id);
        let nop = sys.board.valueMaps.intellibriteActions.getValue(operation);
        if (nop > 0) {
            sgroup.action = nop;
            sgroup.hasChanged = true; // Say we are dirty but we really are pure as the driven snow.
            state.emitEquipmentChanges();
            setTimeout(function() { 
                sgroup.action = 0; 
                sgroup.hasChanged = true; // Say we are dirty but we really are pure as the driven snow.
                state.emitEquipmentChanges(); }, 20000); // It takes 20 seconds to sequence.
        }
        return Promise.resolve(sgroup);
    }
    public sequenceIntelliBrite(operation: string) {
        state.intellibrite.hasChanged = true;
        let nop = sys.board.valueMaps.intellibriteActions.getValue(operation);
        if (nop > 0) {
            state.intellibrite.action = nop;
            setTimeout(function() { state.intellibrite.action = 0; state.emitEquipmentChanges(); }, 20000); // It takes 20 seconds to sequence.
        }
    }
}
export class FeatureCommands extends BoardCommands {
    public async setFeatureAsync(obj: any): Promise<Feature> {
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) throw new InvalidEquipmentIdError(`Invalid feature id: ${ obj.id }`, obj.id, 'Feature');
        if (!sys.board.equipmentIds.features.isInRange(obj.id)) return;
        if (typeof obj.id !== 'undefined') {
            let feature = sys.features.getItemById(obj.id, true);
            let sfeature = state.features.getItemById(obj.id, true);
            feature.isActive = true;
            sfeature.isOn = false;
            if (obj.nameId) {
                feature.nameId = sfeature.nameId = obj.nameId;
                feature.name = sfeature.name = sys.board.valueMaps.circuitNames.get(obj.nameId);
            }
            else if (obj.name) feature.name = sfeature.name = obj.name;
            else if (!feature.name && !obj.name) feature.name = sfeature.name = `feature${ obj.id }`;
            if (typeof obj.type !== 'undefined') feature.type = sfeature.type = parseInt(obj.type, 10);
            else if (!feature.type && typeof obj.type !== 'undefined') feature.type = sfeature.type = 0;
            if (typeof obj.freeze !== 'undefined') feature.freeze = utils.makeBool(obj.freeze);
            if (typeof obj.showInFeatures !== 'undefined') feature.showInFeatures = sfeature.showInFeatures = utils.makeBool(obj.showInFeatures);
            if (typeof obj.eggTimer !== 'undefined') feature.eggTimer = parseInt(obj.eggTimer, 10);
            return new Promise<Feature>((resolve, reject) => { resolve(feature); });
        }
        else
            throw new InvalidEquipmentIdError('Feature id has not been defined', undefined, 'Feature');

    }
    public async deleteFeatureAsync(obj: any): Promise<Feature> {
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) throw new InvalidEquipmentIdError(`Invalid feature id: ${ obj.id }`, obj.id, 'Feature');
        if (!sys.board.equipmentIds.features.isInRange(id)) return;
        if (typeof obj.id !== 'undefined') {
            let feature = sys.features.getItemById(id, false);
            let sfeature = state.features.getItemById(id, false);
            sys.features.removeItemById(id);
            state.features.removeItemById(id);
            feature.isActive = false;
            sfeature.isOn = false;
            sfeature.showInFeatures = false;
            sfeature.emitEquipmentChange();
            return new Promise<Feature>((resolve, reject) => { resolve(feature); });
        }
        else
            throw new InvalidEquipmentIdError('Feature id has not been defined', obj.id, 'Feature');
    }

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
            sys.board.circuits.setCircuitStateAsync(circuit.circuit, val);
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

        }
    }

}
export class ChlorinatorCommands extends BoardCommands {
    public setChlorProps(chlor: Chlorinator, obj?: any) {
        if (typeof obj !== 'undefined') {
            for (var prop in obj) {
                if (prop in chlor) chlor[prop] = obj[prop];
            }
        }
    }

    public setChlor(cstate: ChlorinatorState, poolSetpoint: number = cstate.poolSetpoint, spaSetpoint: number = cstate.spaSetpoint, superChlorHours: number = cstate.superChlorHours, superChlor: boolean = cstate.superChlor) {
        try {
            let chlor = sys.chlorinators.getItemById(cstate.id);
            chlor.poolSetpoint = cstate.poolSetpoint = poolSetpoint;
            chlor.spaSetpoint = cstate.spaSetpoint = spaSetpoint;
            chlor.superChlorHours = cstate.superChlorHours = superChlorHours;
            chlor.superChlor = cstate.superChlor = superChlor;
            state.emitEquipmentChanges();
        }
        catch (err) {
            logger.error(`Error setting chlorinator desired output: ${ err.message }`);
        }
    }
    public setPoolSetpoint(cstate: ChlorinatorState, poolSetpoint: number) { this.setChlor(cstate, poolSetpoint); }
    public setSpaSetpoint(cstate: ChlorinatorState, spaSetpoint: number) { this.setChlor(cstate, cstate.poolSetpoint, spaSetpoint); }
    public setSuperChlorHours(cstate: ChlorinatorState, hours: number) { this.setChlor(cstate, cstate.poolSetpoint, cstate.spaSetpoint, hours); }
    public superChlorinate(cstate: ChlorinatorState, bSet: boolean, hours: number) { this.setChlor(cstate, cstate.poolSetpoint, cstate.spaSetpoint, typeof hours !== 'undefined' ? hours : cstate.superChlorHours, bSet); }

    // Chlorinator direct control methods
    public requestName(cstate: ChlorinatorState) {
        let out = Outbound.create({
            protocol: Protocol.Chlorinator,
            dest: cstate.id,
            action: 20,
            payload: [2],
            retries: 6
            /*                 ,response: true,
                            onComplete: (err) => {
                                if (err) { logger.error(`Chlorinator name not found.`); }
                             } */
        });
        conn.queueSendMessage(out);
    }

    public setDesiredOutput(cstate: ChlorinatorState) {

        let schlor = state.chlorinators.getItemById(cstate.id, true);

        // [16,2,80,17][23][138,16,3]
        // let out = Outbound.createChlorinatorMessage(cstate.id, 17, [chlor.setPointForCurrentBody], 3, response);
        let out = Outbound.create({
            protocol: Protocol.Chlorinator,
            dest: cstate.id,
            action: 17,
            payload: [schlor.setPointForCurrentBody],
            retries: 3,
            response: true,
            onComplete: (err) => {
                if (err) {
                    logger.warn(`error with chlorinator: ${ err.message }`);
                }
                else {
                    cstate.currentOutput = cstate.setPointForCurrentBody;
                }
            }
        });
        conn.queueSendMessage(out);

    }

    public ping(cstate: ChlorinatorState) {
        // Resp: [16,2,0,1][0,0][19,16,3]
        /*         let response = Response.create({
                    protocol: Protocol.Chlorinator,
                    action: 1,
                    payload: [0, 0]
                }); */
        // Ping: [16,2,80,0][0][98,16,3]
        return new Promise((resolve, reject) => {
            let out = Outbound.create({
                protocol: Protocol.Chlorinator,
                dest: cstate.id,
                action: 0,
                payload: [0],
                retries: 3,
                response: true,
                onComplete: (err) => {
                    if (err) reject(err); 
                    else resolve(); 
                }
            });

            conn.queueSendMessage(out);
        });
    }
}
export class ScheduleCommands extends BoardCommands {
    public transformDays(val: any): number {
        if (typeof val === 'number') return val;
        let edays = sys.board.valueMaps.scheduleDays.toArray();
        let dayFromString = function (str) {
            let lstr = str.toLowerCase();
            let byte = 0;
            for (let i = 0; i < edays.length; i++) {
                let eday = edays[i];
                switch (lstr) {
                    case 'weekdays':
                        if (eday.name === 'mon' || eday.name === 'tue' || eday.name === 'wed' || eday.name === 'thu' || eday.name === 'fri')
                            byte |= (1 << (eday.val - 1));
                        break;
                    case 'weekends':
                        if (eday.name === 'sat' || eday.name === 'sun')
                            byte |= (1 << (eday.val - 1));
                        break;
                    default:
                        if (lstr.startsWith(eday.name)) byte |= (1 << (eday.val - 1));
                        break;
                }
            }
            return byte;
        }
        let dayFromDow = function (dow) {
            let byte = 0;
            for (let i = 0; i < edays.length; i++) {
                let eday = edays[i];
                if (eday.dow === dow) {
                    byte |= (1 << (eday.val - 1));
                    break;
                }
            }
            return byte;
        }
        let bdays = 0;
        if (val.isArray) {
            for (let i in val) {
                let v = val[i];
                if (typeof v === 'string') bdays |= dayFromString(v);
                else if (typeof v === 'number') bdays |= dayFromDow(v);
                else if (typeof v === 'object') {
                    if (typeof v.name !== 'undefined') bdays |= dayFromString(v);
                    else if (typeof v.dow !== 'undefined') bdays |= dayFromDow(v);
                    else if (typeof v.desc !== 'undefined') bdays |= dayFromString(v);
                }
            }
        }
        return bdays;
    }

    public setSchedule(sched: Schedule|EggTimer, obj?: any) {
        if (typeof obj !== undefined) {
            for (var s in obj)
                sched[s] = obj[s];
        }
    }
    public async setScheduleAsync(data: any): Promise<Schedule> {
        if (typeof data.id !== 'undefined') {
            let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
            if (id <= 0) id = sys.schedules.getNextEquipmentId(new EquipmentIdRange(1, sys.equipment.maxSchedules));
            if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid schedule id: ${data.id}`, data.id, 'Schedule'));
            let sched = sys.schedules.getItemById(id, data.id <= 0);
            let ssched = state.schedules.getItemById(id, data.id <= 0);
            let schedType = typeof data.scheduleType !== 'undefined' ? data.scheduleType : sched.scheduleType;
            if (typeof schedType === 'undefined') schedType = 0; // Repeats

            let startTimeType = typeof data.startTimeType !== 'undefined' ? data.startTimeType : sched.startTimeType;
            let endTimeType = typeof data.endTimeType !== 'undefined' ? data.endTimeType : sched.endTimeType;
            let startDate = typeof data.startDate !== 'undefined' ? data.startDate : sched.startDate;
            if (typeof startDate.getMonth !== 'function') startDate = new Date(startDate);
            let heatSource = typeof data.heatSource !== 'undefined' ? data.heatSource : sched.heatSource;
            let heatSetpoint = typeof data.heatSetpoint !== 'undefined' ? data.heatSetpoint : sched.heatSetpoint;
            let circuit = typeof data.circuit !== 'undefined' ? data.circuit : sched.circuit;
            let startTime = typeof data.startTime !== 'undefined' ? data.startTime : sched.startTime;
            let endTime = typeof data.endTime !== 'undefined' ? data.endTime : sched.endTime;
            let schedDays = sys.board.schedules.transformDays(typeof data.scheduleDays !== 'undefined' ? data.scheduleDays : sched.scheduleDays);

            // Ensure all the defaults.
            if (isNaN(startDate.getTime())) startDate = new Date();
            if (typeof startTime === 'undefined') startTime = 480; // 8am
            if (typeof endTime === 'undefined') endTime = 1020; // 5pm
            if (typeof startTimeType === 'undefined') startTimeType = 0; // Manual
            if (typeof endTimeType === 'undefined') endTimeType = 0; // Manual

            // At this point we should have all the data.  Validate it.
            if (!sys.board.valueMaps.scheduleTypes.valExists(schedType)) return Promise.reject(new InvalidEquipmentDataError(`Invalid schedule type; ${schedType}`, 'Schedule', schedType));
            if (!sys.board.valueMaps.scheduleTimeTypes.valExists(startTimeType)) return Promise.reject(new InvalidEquipmentDataError(`Invalid start time type; ${startTimeType}`, 'Schedule', startTimeType));
            if (!sys.board.valueMaps.scheduleTimeTypes.valExists(endTimeType)) return Promise.reject(new InvalidEquipmentDataError(`Invalid end time type; ${endTimeType}`, 'Schedule', endTimeType));
            if (!sys.board.valueMaps.heatSources.valExists(heatSource)) return Promise.reject(new InvalidEquipmentDataError(`Invalid heat source: ${heatSource}`, 'Schedule', heatSource));
            if (heatSetpoint < 0 || heatSetpoint > 104) return Promise.reject(new InvalidEquipmentDataError(`Invalid heat setpoint: ${heatSetpoint}`, 'Schedule', heatSetpoint));
            if (sys.board.circuits.getCircuitReferences(true, true, false, true).find(elem => elem.id === circuit) === undefined)
                return Promise.reject(new InvalidEquipmentDataError(`Invalid circuit reference: ${circuit}`, 'Schedule', circuit));
            if (schedType === 128 && schedDays === 0) return Promise.reject(new InvalidEquipmentDataError(`Invalid schedule days: ${schedDays}. You must supply days that the schedule is to run.`, 'Schedule', schedDays));


            sched.circuit = ssched.circuit = circuit;
            sched.scheduleDays = ssched.scheduleDays = schedDays;
            sched.scheduleType = ssched.scheduleType = schedType;
            sched.heatSetpoint = ssched.heatSetpoint = heatSetpoint;
            sched.heatSource = ssched.heatSource = heatSource;
            sched.startTime = ssched.startTime = startTime;
            sched.endTime = ssched.endTime = endTime;
            sched.startTimeType = ssched.startTimeType = startTimeType;
            sched.endTimeType = ssched.endTimeType = endTimeType;
            sched.startDate = ssched.startDate = startDate;
            ssched.emitEquipmentChange();
            return new Promise<Schedule>((resolve, reject) => { resolve(sched); });
        }
        else
            return Promise.reject(new InvalidEquipmentIdError('No pump information provided', undefined, 'Pump'));
    }
    public deleteScheduleAsync(data: any): Promise<Schedule> {
        if (typeof data.id !== 'undefined') {
            let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
            if (isNaN(id) || id < 0) return Promise.reject(new InvalidEquipmentIdError(`Invalid schedule id: ${data.id}`, data.id, 'Schedule'));
            let sched = sys.schedules.getItemById(id, false);
            let ssched = state.schedules.getItemById(id, false);
            sys.schedules.removeItemById(id);
            state.schedules.removeItemById(id);
            ssched.emitEquipmentChange();
            return new Promise<Schedule>((resolve, reject) => { resolve(sched); });
        }
        else
            return Promise.reject(new InvalidEquipmentIdError('No schedule information provided', undefined, 'Schedule'));
    }
}
export class HeaterCommands extends BoardCommands {
    public isSolarInstalled(body?: number): boolean {
        let heaters = sys.heaters.get();
        let types = sys.board.valueMaps.heaterTypes.toArray();
        for (let i = 0; i < heaters.length; i++) {
            let heater = heaters[i];
            if (typeof body !== 'undefined' && body !== heater.body) continue;
            let type = types.find(elem => elem.val === heater.type);
            if (typeof type !== 'undefined') {
                switch (type.name) {
                    case 'solar':
                        return true;
                }
            }
        }
    }
    public setHeater(heater: Heater, obj?: any) {
        if (typeof obj !== undefined) {
            for (var s in obj)
                heater[s] = obj[s];
        }
    }

    public updateHeaterServices(heater: Heater) { }
}
export class ValveCommands extends BoardCommands {
    public async setValveAsync(obj: any): Promise<Valve> {
        return new Promise<Valve>(function(resolve, reject) {
            let id = parseInt(obj.id, 10);
            if (isNaN(id)) reject(new InvalidEquipmentIdError('Valve Id has not been defined', obj.id, 'Valve'));
            let valve = sys.valves.getItemById(id, false);
            for (var s in obj) valve[s] = obj[s];
            resolve(valve);
        });
    }
}

export class ChlorinatorController extends BoardCommands {
    private _timer: NodeJS.Timeout;

    // this method will check to see if we have any virtual chlors we are responsible for
    // if we have any, we will see if the timer is already running or if it needs to be started
    public start() {
        clearTimeout(this._timer);
        let chlor = sys.chlorinators.getItemById(1);
        let schlor = state.chlorinators.getItemById(1);
        if (chlor.isActive && chlor.isVirtual) {
            if (schlor.lastComm + (30 * 1000) < new Date().getTime()) {
                // We have not talked to the chlorinator in 30 seconds so we have lost communication.
                schlor.status = 128;
                schlor.currentOutput = 0;
            }
            schlor.virtualControllerStatus = 1;
            if (chlor && chlor.isActive && chlor.isVirtual) {
                sys.board.chlorinator.setDesiredOutput(state.chlorinators.getItemById(1));
            }
                if (schlor.poolSetpoint > 0 || schlor.spaSetpoint > 0) {
                    this._timer = setTimeout(() =>{sys.board.virtualChlorinatorController.start();}, 4000);
                    return;
                }
                else {
                    this._timer = setTimeout(()=>{sys.board.virtualChlorinatorController.start();}, 30000);
                    return;
                }
        }
        // if we get this far, then no virtual chlorinators are active and clear the timer
       else {
           delete schlor.virtualControllerStatus;
           clearInterval(this._timer);
        } 
    }

    public stop() {
        if (typeof this._timer !== 'undefined') clearTimeout(this._timer);
    }

    public async search() {
        try {
            let chlor = sys.chlorinators.getItemById(1, true);
            if (chlor.isActive && (typeof chlor.isVirtual === 'undefined' || !chlor.isVirtual)) return; // don't run if we already see chlorinator comms
            if (chlor.isVirtual) return this.start(); // we already have an active virtual chlorinator controller
            let cstate = state.chlorinators.getItemById(1, true);
            await sys.board.chlorinator.ping(cstate);
            logger.info(`Found Chlorinator at address 80; id: 1.`);
            chlor.isActive = true;
            chlor.isVirtual = true;
            cstate.body = chlor.body = 0;
            chlor.poolSetpoint = 0;
            chlor.superChlor = false;
            chlor.superChlorHours = 0;
            chlor.address = 80;
            cstate.status = 0;
            cstate.poolSetpoint = chlor.poolSetpoint;
            // schlor.type = chlor.type;
            cstate.superChlor = chlor.superChlor;
            cstate.superChlorHours = chlor.superChlorHours;
            sys.board.chlorinator.requestName(cstate);
            // sys.board.virtualChlorinatorController.chlorinatorHeartbeat();
            sys.board.virtualChlorinatorController.start();
        }
        catch (err) {
            logger.warn(`No Chlorinator Found`);
            sys.chlorinators.removeItemById(1);
            state.chlorinators.removeItemById(1);
            logger.info('no chlor');
        }
    }
}
export class VirtualPumpControllerCollection extends BoardCommands {
    private _timers: NodeJS.Timeout[]=[];
    public search() {
        for (let i = 1; i <= sys.equipment.maxPumps; i++) {
            // let veqpump = sys.virtualPumpControllers.getItemById(i);
            let pump = sys.pumps.getItemById(i);
            if (pump.isActive) continue;
            pump = sys.pumps.getItemById(i, true);
            pump.isActive = true;
            pump.isVirtual = true;
            pump.type = 0;
            logger.info(`Searching for a pump at address... ${ pump.address }`);
            try {
                sys.board.pumps.initPump(pump);
                let c = config.getSection('controller');
                if (c.comms.inactivityRetry > 0) {
                    c.comms.inactivityRetry = -1;
                    config.setSection('controller', c);
                }
            }
            catch (err) {
                logger.info(`No pump found at address ${pump.address}: ${ err.message }`);
            }
        }
    }
    public async stopAsync() {
        let promises = [];
        // turn off all pumps
        for (let i = 1; i <= sys.pumps.length; i++) {
            let pump = sys.pumps.getItemById(i);
            let spump = state.pumps.getItemById(i);
            if (pump.isVirtual && pump.isActive && (spump.watts > 0 || spump.rpm > 0 || spump.flow > 0)) {
                logger.info(`Queueing pump ${ i } to stop.`);
                promises.push(sys.board.pumps.stopAsync(pump));
                typeof this._timers[i] !== 'undefined' && clearTimeout(this._timers[i]);
                state.pumps.getItemById(i, true).virtualControllerStatus = 0;
            }
        }
        return Promise.all(promises);
    }

    public start() {
        for (let i = 1; i <= sys.pumps.length; i++) {
            let pump = sys.pumps.getItemById(i);
            if (pump.isVirtual && pump.isActive) {
                typeof this._timers[i] !== 'undefined' && clearTimeout(this._timers[i]);
                sys.board.pumps.run(pump);
                this._timers[i] = setInterval(function() { sys.board.pumps.run(pump); }, 8000);
                if (!state.pumps.getItemById(i, true).virtualControllerStatus) {
                    logger.info(`Starting Virtual Pump Controller: Pump ${ pump.id }`);
                    state.pumps.getItemById(i, true).virtualControllerStatus = 1;
                }

            }
        }
    }
}