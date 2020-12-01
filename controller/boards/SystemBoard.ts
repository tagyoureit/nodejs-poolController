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
import { logger } from '../../logger/Logger';
import { webApp } from '../../web/Server';
import { conn } from '../comms/Comms';
import { ncp } from "../nixie/Nixie"
import { Message, Outbound, Protocol, Response } from '../comms/messages/Messages';
import { utils, Heliotrope } from '../Constants';
import { Body, ChemController, Chlorinator, Circuit, CircuitGroup, CircuitGroupCircuit, ConfigVersion, CustomName, CustomNameCollection, EggTimer, Feature, General, Heater, ICircuit, LightGroup, LightGroupCircuit, Location, Options, Owner, PoolSystem, Pump, Schedule, sys, Valve, ControllerType, TempSensorCollection, Filter } from '../Equipment';
import { EquipmentNotFoundError, InvalidEquipmentDataError, InvalidEquipmentIdError, ParameterOutOfRangeError } from '../Errors';
import { BodyTempState, ChemControllerState, ChlorinatorState, ICircuitGroupState, ICircuitState, LightGroupState, PumpState, state, TemperatureState, VirtualCircuitState, HeaterState, ScheduleState, FilterState } from '../State';

export class byteValueMap extends Map<number, any> {
    public transform(byte: number, ext?: number) { return extend(true, { val: byte || 0 }, this.get(byte) || this.get(0)); }
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
    public encode(val: string | number | { val: any, name: string }, def?: number) {
        let v = this.findItem(val);
        if (typeof v === 'undefined') logger.debug(`Invalid enumeration: val = ${val} map = ${JSON.stringify(this)}`);
        return typeof v === 'undefined' ? def : v.val;
    }
    public findItem(val: string | number | { val: any, name: string }) {
        if (typeof val === null || typeof val === 'undefined') return;
        else if (typeof val === 'number') return this.transform(val);
        else if (typeof val === 'string') {
            let v = parseInt(val, 10);
            if (!isNaN(v)) return this.transform(v);
            else return this.transformByName(val);
        }
        else if (typeof val === 'object') {
            if (typeof val.val !== 'undefined') return this.transform(parseInt(val.val, 10));
            else if (typeof val.name !== 'undefined') return this.transformByName(val.name);
        }
    }
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
export class InvalidEquipmentIdArray {
    constructor(data: number[]) { this._data = data; }
    private _data: number[];

    public get() { return this._data; }
    public set(val: number[]) { this._data = val; }
    public add(val: number) {
        if (!this._data.includes(val)) {
            this._data.push(val);
            this._data.sort(((a, b) => a - b));
        }
    }
    public merge(arr: number[]) {
        for (let i = 0; i < arr.length; i++) {
            if (!this._data.includes(arr[i])) this._data.push(arr[i]);
        }
        this._data.sort((a, b) => a - b);
    }
    public remove(val: number) {
        this._data = this._data.filter(el => el !== val);
    }
    public isValidId(val: number) {
        return !this._data.includes(val);
    }
}
export class EquipmentIds {
    public circuits: EquipmentIdRange = new EquipmentIdRange(6, 6);
    public features: EquipmentIdRange = new EquipmentIdRange(7, function () { return this.start + sys.equipment.maxFeatures; });
    public pumps: EquipmentIdRange = new EquipmentIdRange(1, function () { return this.start + sys.equipment.maxPumps; });
    public circuitGroups: EquipmentIdRange = new EquipmentIdRange(0, 0);
    public virtualCircuits: EquipmentIdRange = new EquipmentIdRange(128, 136);
    public invalidIds: InvalidEquipmentIdArray = new InvalidEquipmentIdArray([]);
}
export class byteValueMaps {
    constructor() {
        this.pumpStatus.transform = function (byte) {
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
        this.chlorinatorStatus.transform = function (byte) {
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
        this.scheduleTypes.transform = function (byte) {
            return (byte & 128) > 0 ? extend(true, { val: 128 }, this.get(128)) : extend(true, { val: 0 }, this.get(0));
        };
        this.scheduleDays.transform = function (byte) {
            let days = [];
            let b = byte & 0x007F;
            for (let bit = 7; bit >= 0; bit--) {
                if ((byte & (1 << (bit - 1))) > 0) days.push(extend(true, {}, this.get(bit)));
            }
            return { val: b, days: days };
        };
        this.scheduleDays.toArray = function () {
            let arrKeys = Array.from(this.keys());
            let arr = [];
            for (let i = 0; i < arrKeys.length; i++) arr.push(extend(true, { val: arrKeys[i] }, this.get(arrKeys[i])));
            return arr;
        };
        this.virtualCircuits.transform = function (byte) {
            return extend(true, {}, { val: byte, name: 'Unknown ' + byte }, this.get(byte), { val: byte });
        };
        this.tempUnits.transform = function (byte) { return extend(true, {}, { val: byte & 0x04 }, this.get(byte & 0x04)); };
        this.panelModes.transform = function (byte) { return extend(true, { val: byte & 0x83 }, this.get(byte & 0x83)); };
        this.controllerStatus.transform = function (byte: number, percent?: number) {
            let v = extend(true, {}, this.get(byte) || this.get(0));
            if (typeof percent !== 'undefined') v.percent = percent;
            return v;
        };
        this.lightThemes.transform = function (byte) { return typeof byte === 'undefined' ? this.get(255) : extend(true, { val: byte }, this.get(byte) || this.get(255)); };
        this.timeZones.findItem = function (val: string | number | { val: any, name: string }) {
            if (typeof val === null || typeof val === 'undefined') return;
            else if (typeof val === 'number') {
                if (val <= 12) {  // We are looking for timezones based upon the utcOffset.
                    let arr = this.toArray();
                    let tz = arr.find(elem => elem.utcOffset === val);
                    return typeof tz !== 'undefined' ? this.transform(tz.val) : undefined;
                }
                return this.transform(val);
            }
            else if (typeof val === 'string') {
                let v = parseInt(val, 10);
                if (!isNaN(v)) {
                    if (v <= 12) {
                        let arr = this.toArray();
                        let tz = arr.find(elem => elem.utcOffset === val);
                        return typeof tz !== 'undefined' ? this.transform(tz.val) : undefined;
                    }
                    return this.transform(v);
                }
                else {
                    let arr = this.toArray();
                    let tz = arr.find(elem => elem.abbrev === val || elem.name === val);
                    return typeof tz !== 'undefined' ? this.transform(tz.val) : undefined;
                }
            }
            else if (typeof val === 'object') {
                if (typeof val.val !== 'undefined') return this.transform(parseInt(val.val, 10));
                else if (typeof val.name !== 'undefined') return this.transformByName(val.name);
            }
        }
    }
    public expansionBoards: byteValueMap = new byteValueMap();
    // Identifies which controller manages the underlying equipment.
    public equipmentMaster: byteValueMap = new byteValueMap([
        [0, { val: 0, name: 'ocp', desc: 'Outdoor Control Panel' }],
        [1, { val: 1, name: 'ncp', desc: 'Nixie Control Panel' }]
    ]);
    public panelModes: byteValueMap = new byteValueMap([
        [0, { val: 0, name: 'auto', desc: 'Auto' }],
        [1, { val: 1, name: 'service', desc: 'Service' }],
        [8, { val: 8, name: 'freeze', desc: 'Freeze' }],
        [128, { val: 128, name: 'timeout', desc: 'Timeout' }],
        [129, { val: 129, name: 'service-timeout', desc: 'Service/Timeout' }]
    ]);
    public controllerStatus: byteValueMap = new byteValueMap([
        [0, { val: 0, name: 'initializing', desc: 'Initializing', percent: 0 }],
        [1, { val: 1, name: 'ready', desc: 'Ready', percent: 100 }],
        [2, { val: 2, name: 'loading', desc: 'Loading', percent: 0 }]
    ]);

    public circuitFunctions: byteValueMap = new byteValueMap([
        [0, { name: 'generic', desc: 'Generic' }],
        [1, { name: 'spa', desc: 'Spa', hasHeatSource: true }],
        [2, { name: 'pool', desc: 'Pool', hasHeatSource: true }],
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
    public featureFunctions: byteValueMap = new byteValueMap([[0, { name: 'generic', desc: 'Generic' }], [1, { name: 'spillway', desc: 'Spillway' }]]);
    public virtualCircuits: byteValueMap = new byteValueMap([
        [128, { name: 'solar', desc: 'Solar', assignableToPumpCircuit: true }],
        [129, { name: 'heater', desc: 'Either Heater', assignableToPumpCircuit: true }],
        [130, { name: 'poolHeater', desc: 'Pool Heater', assignableToPumpCircuit: true }],
        [131, { name: 'spaHeater', desc: 'Spa Heater', assignableToPumpCircuit: true }],
        [132, { name: 'freeze', desc: 'Freeze', assignableToPumpCircuit: true }],
        [133, { name: 'heatBoost', desc: 'Heat Boost', assignableToPumpCircuit: false }],
        [134, { name: 'heatEnable', desc: 'Heat Enable', assignableToPumpCircuit: false }],
        [135, { name: 'pumpSpeedUp', desc: 'Pump Speed +', assignableToPumpCircuit: false }],
        [136, { name: 'pumpSpeedDown', desc: 'Pump Speed -', assignableToPumpCircuit: false }],
        [255, { name: 'notused', desc: 'NOT USED', assignableToPumpCircuit: true }]
    ]);
    public lightThemes: byteValueMap = new byteValueMap([
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
    public lightColors: byteValueMap = new byteValueMap([
        [0, { name: 'white', desc: 'White' }],
        [2, { name: 'lightgreen', desc: 'Light Green' }],
        [4, { name: 'green', desc: 'Green' }],
        [6, { name: 'cyan', desc: 'Cyan' }],
        [8, { name: 'blue', desc: 'Blue' }],
        [10, { name: 'lavender', desc: 'Lavender' }],
        [12, { name: 'magenta', desc: 'Magenta' }],
        [14, { name: 'lightmagenta', desc: 'Light Magenta' }]
    ]);
    public scheduleDays: byteValueMap = new byteValueMap([
        [1, { name: 'sat', desc: 'Saturday', dow: 6 }],
        [2, { name: 'fri', desc: 'Friday', dow: 5 }],
        [3, { name: 'thu', desc: 'Thursday', dow: 4 }],
        [4, { name: 'wed', desc: 'Wednesday', dow: 3 }],
        [5, { name: 'tue', desc: 'Tuesday', dow: 2 }],
        [6, { name: 'mon', desc: 'Monday', dow: 1 }],
        [7, { name: 'sun', desc: 'Sunday', dow: 0 }]
    ]);
    public scheduleTimeTypes: byteValueMap = new byteValueMap([
        [0, { name: 'manual', desc: 'Manual' }]
    ]);

    public pumpTypes: byteValueMap = new byteValueMap([
        [0, { name: 'none', desc: 'No pump', maxCircuits: 0, hasAddress: false, hasBody: false }],
        [1, { name: 'vf', desc: 'Intelliflo VF', minFlow: 15, maxFlow: 130, flowStepSize: 1, maxCircuits: 8, hasAddress: true }],
        [64, { name: 'vsf', desc: 'Intelliflo VSF', minSpeed: 450, maxSpeed: 3450, speedStepSize: 10, minFlow: 15, maxFlow: 130, flowStepSize: 1, maxCircuits: 8, hasAddress: true }],
        [65, { name: 'ds', desc: 'Two-Speed', maxCircuits: 40, hasAddress: false, hasBody: true }],
        [128, { name: 'vs', desc: 'Intelliflo VS', maxPrimingTime: 6, minSpeed: 450, maxSpeed: 3450, speedStepSize: 10, maxCircuits: 8, hasAddress: true }],
        [169, { name: 'vssvrs', desc: 'IntelliFlo VS+SVRS', maxPrimingTime: 6, minSpeed: 450, maxSpeed: 3450, speedStepSize: 10, maxCircuits: 8, hasAddress: true }]
    ]);
    public pumpSSModels: byteValueMap = new byteValueMap([
        [0, { name: 'unspecified', desc: 'Unspecified', amps: 0, pf: 0, volts: 0, watts: 0 }],
        [1, { name: 'wf1hpE', desc: '1hp WhisperFlo E+', amps: 7.4, pf: .9, volts: 230, watts: 1532 }],
        [2, { name: 'wf1hpMax', desc: '1hp WhisperFlo Max', amps: 9, pf: .87, volts: 230, watts: 1600 }],
        [3, { name: 'generic15hp', desc: '1.5hp Pump', amps: 9.3, pf: .9, volts: 230, watts: 1925 }],
        [4, { name: 'generic2hp', desc: '2hp Pump', amps: 12, pf: .9, volts: 230, watts: 2484 }],
        [5, { name: 'generic25hp', desc: '2.5hp Pump', amps: 12.5, pf: .9, volts: 230, watts: 2587 }],
        [6, { name: 'generic3hp', desc: '3hp Pump', amps: 13.5, pf: .9, volts: 230, watts: 2794 }]
    ]);
    public pumpDSModels: byteValueMap = new byteValueMap([
        [0, { name: 'unspecified', desc: 'Unspecified', loAmps: 0, hiAmps: 0, pf: 0, volts: 0, loWatts: 0, hiWatts: 0 }],
        [1, { name: 'generic1hp', desc: '1hp Pump', loAmps: 2.4, hiAmps: 6.5, pf: .9, volts: 230, loWatts: 497, hiWatts: 1345 }],
        [2, { name: 'generic15hp', desc: '1.5hp Pump', loAmps: 2.7, hiAmps: 9.3, pf: .9, volts: 230, loWatts: 558, hiWatts: 1925 }],
        [3, { name: 'generic2hp', desc: '2hp Pump', loAmps: 2.9, hiAmps: 12, pf: .9, volts: 230, loWatts: 600, hiWatts: 2484 }],
        [4, { name: 'generic25hp', desc: '2.5hp Pump', loAmps: 3.1, hiAmps: 12.5, pf: .9, volts: 230, loWatts: 642, hiWatts: 2587 }],
        [5, { name: 'generic3hp', desc: '3hp Pump', loAmps: 3.3, hiAmps: 13.5, pf: .9, volts: 230, loWatts: 683, hiWatts: 2794 }]
    ]);
    public pumpVSModels: byteValueMap = new byteValueMap([
        [0, { name: 'intelliflovs', desc: 'IntelliFlo VS' }]
    ]);
    public pumpVFModels: byteValueMap = new byteValueMap([
        [0, { name: 'intelliflovf', desc: 'IntelliFlo VF' }]
    ]);
    public pumpVSFModels: byteValueMap = new byteValueMap([
        [0, { name: 'intelliflovsf', desc: 'IntelliFlo VSF' }]
    ]);
    public pumpVSSVRSModels: byteValueMap = new byteValueMap([
        [0, { name: 'intelliflovssvrs', desc: 'IntelliFlo VS+SVRS' }]
    ]);
    // These are used for single-speed pump definitions.  Essentially the way this works is that when
    // the body circuit is running the single speed pump is on.
    public pumpBodies: byteValueMap = new byteValueMap([
        [0, { name: 'pool', desc: 'Pool' }],
        [101, { name: 'spa', desc: 'Spa' }],
        [255, { name: 'poolspa', desc: 'Pool/Spa' }]
    ]);
    public heaterTypes: byteValueMap = new byteValueMap([
        [0, { name: 'none', desc: 'No Heater', hasAddress: false }],
        [1, { name: 'gas', desc: 'Gas Heater', hasAddress: false }],
        [2, { name: 'solar', desc: 'Solar Heater', hasAddress: false }],
        [3, { name: 'heatpump', desc: 'Heat Pump', hasAddress: true }],
        [4, { name: 'ultratemp', desc: 'UltraTemp', hasAddress: true }],
        [5, { name: 'hybrid', desc: 'Hybrid', hasAddress: true }],
        [6, { name: 'maxetherm', desc: 'Max-E-Therm', hasAddress: true }],
        [7, { name: 'mastertemp', desc: 'MasterTemp', hasAddress: true }]
    ]);
    public heatModes: byteValueMap = new byteValueMap([]);
    public heatSources: byteValueMap = new byteValueMap([]);
    public heatStatus: byteValueMap = new byteValueMap([
        [0, { name: 'off', desc: 'Off' }],
        [1, { name: 'heater', desc: 'Heater' }],
        [2, { name: 'cooling', desc: 'Cooling' }],
        [3, { name: 'solar', desc: 'Solar' }]
    ]);
    public pumpStatus: byteValueMap = new byteValueMap([
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
    public pumpUnits: byteValueMap = new byteValueMap([
        [0, { name: 'rpm', desc: 'RPM' }],
        [1, { name: 'gpm', desc: 'GPM' }]
    ]);
    public bodyTypes: byteValueMap = new byteValueMap([
        [0, { name: 'pool', desc: 'Pool' }],
        [1, { name: 'spa', desc: 'Spa' }]
    ]);
    public bodies: byteValueMap = new byteValueMap([
        [0, { name: 'pool', desc: 'Pool' }],
        [1, { name: 'spa', desc: 'Spa' }],
        [2, { name: 'body3', desc: 'Body 3' }],
        [3, { name: 'body4', desc: 'Body 4' }],
        [32, { name: 'poolspa', desc: 'Pool/Spa' }]
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
    public chlorinatorType: byteValueMap = new byteValueMap([
        [0, { name: 'pentair', desc: 'Pentair' }],
        [1, { name: 'unknown', desc: 'unknown' }],
        [2, { name: 'aquarite', desc: 'Aquarite' }],
        [3, { name: 'unknown', desc: 'unknown' }]
    ]);
    public customNames: byteValueMap = new byteValueMap();
    public circuitNames: byteValueMap = new byteValueMap();
    public scheduleTypes: byteValueMap = new byteValueMap([
        [0, { name: 'runonce', desc: 'Run Once', startDate: true, startTime: true, endTime: true, days: false, heatSource: true, heatSetpoint: true }],
        [128, { name: 'repeat', desc: 'Repeats', startDate: false, startTime: true, endTime: true, days: 'multi', heatSource: true, heatSetpoint: true }]
    ]);
    public circuitGroupTypes: byteValueMap = new byteValueMap([
        [0, { name: 'none', desc: 'Unspecified' }],
        [1, { name: 'light', desc: 'Light' }],
        [2, { name: 'circuit', desc: 'Circuit' }],
        [3, { name: 'intellibrite', desc: 'IntelliBrite' }]
    ]);
    public groupCircuitStates: byteValueMap = new byteValueMap([
        [0, { name: 'off', desc: 'Off' }],
        [1, { name: 'on', desc: 'On' }]
    ]);
    public tempUnits: byteValueMap = new byteValueMap([
        [0, { name: 'F', desc: 'Fahrenheit' }],
        [4, { name: 'C', desc: 'Celsius' }]
    ]);
    public valveTypes: byteValueMap = new byteValueMap([
        [0, { name: 'standard', desc: 'Standard' }],
        [1, { name: 'intellivalve', desc: 'IntelliValve' }]
    ]);
    public intellibriteActions: byteValueMap = new byteValueMap([
        [0, { name: 'ready', desc: 'Ready' }],
        [1, { name: 'sync', desc: 'Synchronizing' }],
        [2, { name: 'set', desc: 'Sequencing Set Operation' }],
        [3, { name: 'swim', desc: 'Sequencing Swim Operation' }],
        [4, { name: 'color', desc: 'Sequencing Theme/Color Operation' }],
        [5, { name: 'other', desc: 'Sequencing Save/Recall Operation' }]
    ]);
    public msgBroadcastActions: byteValueMap = new byteValueMap([
        [2, { name: 'status', desc: 'Equipment Status' }],
        [82, { name: 'ivstatus', desc: 'IntelliValve Status' }]
    ]);
    public chemControllerTypes: byteValueMap = new byteValueMap([
        [0, { name: 'none', desc: 'None', hasAddress: false }],
        [1, { name: 'unknown', desc: 'Unknown', hasAddress: false }],
        [2, { name: 'intellichem', desc: 'IntelliChem', hasAddress: true }],
        [3, { name: 'homegrown', desc: 'Homegrown', hasAddress: false }],
        [4, { name: 'rem', desc: 'REM Chem', hasAddress: false}]
    ]);
    public chemPumpTypes: byteValueMap = new byteValueMap([
        [0, { name: 'none', desc: 'No Pump', ratedFlow: false, tank: false, remAddress: false }],
        [1, { name: 'relay', desc: 'Relay Pump', ratedFlow: true, tank: true, remAddress: true }],
        [2, { name: 'ezo-pmp', desc: 'Altas EZO-PMP', ratedFlow: false, tank: false, remAddress: true }]
    ]);
    public chemPhProbeTypes: byteValueMap = new byteValueMap([
        [0, { name: 'none', desc: 'No Probe' }],
        [1, { name: 'ezo-ph', desc: 'Atlas EZO-PH', remAddress: true }],
        [2, { name: 'other', desc: 'Other' }]
    ]);
    public chemORPProbeTypes: byteValueMap = new byteValueMap([
        [0, { name: 'none', desc: 'No Probe' }],
        [1, { name: 'ezo-orp', desc: 'Atlas EZO-ORP', remAddress: true }],
        [2, { name: 'other', desc: 'Other' }]
    ]);

    public chemDosingMethods: byteValueMap = new byteValueMap([
        [0, { name: 'manual', desc: 'Manual' }],
        [1, { name: 'time', desc: 'Time' }],
        [2, { name: 'volume', desc: 'Volume' }],
        [3, { name: 'volumeTime', desc: 'Volume/Time' }]
    ]);
    public phSupplyTypes: byteValueMap = new byteValueMap([
        [0, { name: 'base', desc: 'Base pH+' }],
        [1, { name: 'acid', desc: 'Acid pH-' }]
    ]);
    public volumeUnits: byteValueMap = new byteValueMap([
        [0, { name: '', desc: 'No Units' }],
        [1, { name: 'gal', desc: 'Gallons' }],
        [2, { name: 'L', desc: 'Liters' }],
        [3, { name: 'mL', desc: 'Milliliters' }],
        [4, { name: 'cL', desc: 'Centiliters' }],
        [5, { name: 'oz', desc: 'Ounces' }],
        [6, { name: 'qt', desc: 'Quarts' }],
        [7, { name: 'pt', desc: 'Pints' }]
    ]);
    public chemControllerStatus: byteValueMap = new byteValueMap([
        [0, { name: 'ok', desc: 'Ok' }],
        [1, { name: 'nocomms', desc: 'No Communication' }],
        [2, { name: 'config', desc: 'Invalid Configuration'}]
    ]);
    public chemControllerAlarms: byteValueMap = new byteValueMap([
        [0, { name: 'ok', desc: 'Ok - No alarm' }],
        [1, { name: 'noflow', desc: 'No Flow' }],
        [2, { name: 'phhigh', desc: 'pH High' }],
        [4, { name: 'phlow', desc: 'pH Low' }],
        [8, { name: 'orphigh', desc: 'orp High' }],
        [16, { name: 'orplow', desc: 'orp Low' }],
        [32, { name: 'phtankempty', desc: 'pH Tank Empty' }],
        [64, { name: 'orptankempty', desc: 'orp Tank Empty' }],
        [128, { name: 'probefault', desc: 'Probe Fault' }]
    ]);
    public chemControllerWarnings: byteValueMap = new byteValueMap([
        [0, { name: 'ok', desc: 'Ok - No Warning' }],
        [1, { name: 'corrosive', desc: 'Corrosion May Occur' }],
        [2, { name: 'scaling', desc: 'Scaling May Occur' }],
        [8, { name: 'invalidsetup', desc: 'Invalid Setup' }],
        [16, { name: 'chlorinatorComms', desc: 'Chlorinator Comms Error' }]
    ]);
    public chemControllerLimits: byteValueMap = new byteValueMap([
        [0, { name: 'ok', desc: 'Ok - No limits reached' }],
        [1, { name: 'phlockout', desc: 'pH Lockout' }],
        [2, { name: 'phdailylimit', desc: 'pH Daily Limit Reached' }],
        [4, { name: 'orpdailylimit', desc: 'orp Daily Limit Reached' }],
        [128, { name: 'commslost', desc: 'Communications with Chem Controller Lost' }] // to be verified
    ]);
    public chemControllerDosingStatus: byteValueMap = new byteValueMap([
        [0, { name: 'dosing', desc: 'Dosing' }],
        [1, { name: 'monitoring', desc: 'Monitoring' }],
        [2, { name: 'mixing', desc: 'Mixing' }]
    ]);
    public acidTypes: byteValueMap = new byteValueMap([
        [0, { name: 'a34.6', desc: '34.6% - 22 Baume', dosingFactor: 0.909091 }],
        [1, { name: 'a31.45', desc: '31.45% - 20 Baume', dosingFactor: 1 }],
        [2, { name: 'a29', desc: '29% - 19 Baume', dosingFactor:1.08448 }],
        [3, { name: 'a28', desc: '28.3% - 18 Baume', dosingFactor: 1.111111 }],
        [4, { name: 'a15.7', desc: '15.7% - 10 Baume', dosingFactor: 2.0 }],
        [5, { name: 'a14.5', desc: '14.5% - 9.8 Baume', dosingFactor: 2.16897 }],
    ]);

    public filterTypes: byteValueMap = new byteValueMap([
        [0, { name: 'sand', desc: 'Sand Filter', hasBackwash: true }],
        [1, { name: 'cartridge', desc: 'Cartridge Filter', hasBackwash: false }],
        [2, { name: 'de', desc: 'DE Filter', hasBackwash: true }],
        [3, { name: 'unknown', desc: 'unknown' }]
    ]);
   
    // public filterPSITargetTypes: byteValueMap = new byteValueMap([
    //     [0, { name: 'none', desc: 'Do not use filter PSI' }],
    //     [1, { name: 'value', desc: 'Change filter at value' }],
    //     [2, { name: 'percent', desc: 'Change filter with % increase' }],
    //     [3, { name: 'increase', desc: 'Change filter with psi increase' }]
    // ]);
    public countries: byteValueMap = new byteValueMap([
        [1, { name: 'US', desc: 'United States' }],
        [2, { name: 'CA', desc: 'Canada' }],
        [3, { name: 'MX', desc: 'Mexico' }]
    ]);
    public timeZones: byteValueMap = new byteValueMap([
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
    public clockSources: byteValueMap = new byteValueMap([
        [3, { name: 'server', desc: 'Server' }]
    ]);
    public clockModes: byteValueMap = new byteValueMap([
        [12, { name: '12 Hour' }],
        [24, { name: '24 Hour' }]
    ]);
    public virtualControllerStatus: byteValueMap = new byteValueMap([
        [-1, { name: 'notapplicable', desc: 'Not Applicable' }],
        [0, { name: 'stopped', desc: 'Stopped' }],
        [1, { name: 'running', desc: 'Running' }]
    ]);
    // need to validate these...
    public delay: byteValueMap = new byteValueMap([
        [0, { name: 'nodelay', desc: 'No Delay' }],
        [32, { name: 'nodelay', desc: 'No Delay' }],
        [34, { name: 'heaterdelay', desc: 'Heater Delay' }],
        [36, { name: 'cleanerdelay', desc: 'Cleaner Delay' }]
    ]);
    public remoteTypes: byteValueMap = new byteValueMap([
        [0, { name: 'none', desc: 'Not Installed', maxButtons: 0 }],
        [1, { name: 'is4', desc: 'iS4 Spa-Side Remote', maxButtons: 4 }],
        [2, { name: 'is10', desc: 'iS10 Spa-Side Remote', maxButtons: 10 }],
        [6, { name: 'quickTouch', desc: 'Quick Touch Remote', maxButtons: 4 }],
        [7, { name: 'spaCommand', desc: 'Spa Command', maxButtons: 10 }]
    ]);
    public appVersionStatus: byteValueMap = new byteValueMap([
        [-1, { name: 'unknown', desc: 'Unable to compare versions' }],
        [0, { name: 'current', desc: 'On current version' }],
        [1, { name: 'behind', desc: 'New version available' }],
        [2, { name: 'ahead', desc: 'Ahead of published version' }]
    ]);
}
// SystemBoard is a mechanism to abstract the underlying pool system from specific functionality
// managed by the personality board.  This also provides a way to override specific functions for
// acquiring state and configuration data.
export class SystemBoard {
    // TODO: (RSG) Do we even need to pass in system?  We don't seem to be using it and we're overwriting the var with the SystemCommands anyway.
    constructor(system: PoolSystem) { }
    protected _modulesAcquired: boolean = true;
    public needsConfigChanges: boolean = false;
    public valueMaps: byteValueMaps = new byteValueMaps();
    public checkConfiguration() { }
    public requestConfiguration(ver?: ConfigVersion) { }
    public equipmentMaster = 0;
    public async stopAsync() {
        // turn off chlor
        sys.board.virtualChlorinatorController.stop();
        if (sys.controllerType === ControllerType.Virtual) this.turnOffAllCircuits();
        sys.board.virtualChemControllers.stop();
        return sys.board.virtualPumpControllers.stopAsync()
    }
    public async turnOffAllCircuits() {
        // turn off all circuits/features
        for (let i = 0; i < state.circuits.length; i++) {
            state.circuits.getItemByIndex(i).isOn = false;
        }
        for (let i = 0; i < state.features.length; i++) {
            state.features.getItemByIndex(i).isOn = false;
        }
        for (let i = 0; i < state.lightGroups.length; i++) {
            state.lightGroups.getItemByIndex(i).isOn = false;
        }
        for (let i = 0; i < state.temps.bodies.length; i++) {
            state.temps.bodies.getItemByIndex(i).isOn = false;
        }
        sys.board.virtualPumpControllers.setTargetSpeed();
        state.emitEquipmentChanges();
    }
    public system: SystemCommands = new SystemCommands(this);
    public bodies: BodyCommands = new BodyCommands(this);
    public pumps: PumpCommands = new PumpCommands(this);
    public circuits: CircuitCommands = new CircuitCommands(this);
    public valves: ValveCommands = new ValveCommands(this);
    public features: FeatureCommands = new FeatureCommands(this);
    public chlorinator: ChlorinatorCommands = new ChlorinatorCommands(this);
    public heaters: HeaterCommands = new HeaterCommands(this);
    public filters: FilterCommands = new FilterCommands(this);
    public chemControllers: ChemControllerCommands = new ChemControllerCommands(this);

    public schedules: ScheduleCommands = new ScheduleCommands(this);
    public equipmentIds: EquipmentIds = new EquipmentIds();
    public virtualChlorinatorController = new VirtualChlorinatorController(this);
    public virtualPumpControllers = new VirtualPumpController(this);
    public virtualChemControllers = new VirtualChemController(this);

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
    // following overridden in extended class
    processNext(msg?: Outbound) { }
    protected queueItems(cat: number, items?: number[]) { }
    protected queueRange(cat: number, start: number, end: number) { }
}
export class BoardCommands {
    protected board: SystemBoard = null;
    constructor(parent: SystemBoard) { this.board = parent; }
}
export class SystemCommands extends BoardCommands {
    public cancelDelay(): Promise<any> { state.delay = sys.board.valueMaps.delay.getValue('nodelay'); return Promise.resolve(state.data.delay); }
    public setDateTimeAsync(obj: any): Promise<any> { return Promise.resolve(); }
    public keepManualTime() {
        // every minute, updated the time from the system clock in server mode
        // but only for Virtual.  Likely 'manual' on *Center means OCP time
        if (sys.general.options.clockSource !== 'server') return;
        state.time.setTimeFromSystemClock();
        sys.board.system.setTZ();
        setTimeout(function () {
            sys.board.system.keepManualTime();
        }, (60 - new Date().getSeconds()) * 1000);
    }
    public setTZ() {
        let tzOffsetObj = state.time.calcTZOffset();
        if (sys.general.options.clockSource === 'server' || typeof sys.general.location.timeZone === 'undefined') {
            let tzs = sys.board.valueMaps.timeZones.toArray();
            sys.general.location.timeZone = tzs.find(tz => tz.utcOffset === tzOffsetObj.tzOffset).val;
        }
        if (sys.general.options.clockSource === 'server' || typeof sys.general.options.adjustDST === 'undefined') {
            sys.general.options.adjustDST = tzOffsetObj.adjustDST;
        }
    }
    public getDOW() { return this.board.valueMaps.scheduleDays.toArray(); }
    public async setGeneralAsync(obj: any): Promise<General> {
        let general = sys.general.get();
        if (typeof obj.alias === 'string') sys.general.alias = obj.alias;
        if (typeof obj.options !== 'undefined') await sys.board.system.setOptionsAsync(obj.options);
        if (typeof obj.location !== 'undefined') await sys.board.system.setLocationAsync(obj.location);
        if (typeof obj.owner !== 'undefined') await sys.board.system.setOwnerAsync(obj.owner);
        return new Promise<General>(function (resolve, reject) { resolve(sys.general); });
    }
    public async setTempSensorsAsync(obj: any): Promise<TempSensorCollection> {
        if (typeof obj.waterTempAdj1 != 'undefined' && obj.waterTempAdj1 !== sys.equipment.tempSensors.getCalibration('water1')) {
            sys.equipment.tempSensors.setCalibration('water1', parseFloat(obj.waterTempAdj1));
        }
        if (typeof obj.waterTempAdj2 != 'undefined' && obj.waterTempAdj2 !== sys.equipment.tempSensors.getCalibration('water2')) {
            sys.equipment.tempSensors.setCalibration('water2', parseFloat(obj.waterTempAdj2));
        }
        if (typeof obj.waterTempAdj3 != 'undefined' && obj.waterTempAdj3 !== sys.equipment.tempSensors.getCalibration('water3')) {
            sys.equipment.tempSensors.setCalibration('water3', parseFloat(obj.waterTempAdj3));
        }
        if (typeof obj.waterTempAdj4 != 'undefined' && obj.waterTempAdj4 !== sys.equipment.tempSensors.getCalibration('water4')) {
            sys.equipment.tempSensors.setCalibration('water4', parseFloat(obj.waterTempAdj3));
        }
        if (typeof obj.solarTempAdj1 != 'undefined' && obj.solarTempAdj1 !== sys.equipment.tempSensors.getCalibration('solar1')) {
            sys.equipment.tempSensors.setCalibration('solar1', parseFloat(obj.solarTempAdj1));
        }
        if (typeof obj.solarTempAdj2 != 'undefined' && obj.solarTempAdj2 !== sys.equipment.tempSensors.getCalibration('solar2')) {
            sys.equipment.tempSensors.setCalibration('solar2', parseFloat(obj.solarTempAdj2));
        }
        if (typeof obj.solarTempAdj3 != 'undefined' && obj.solarTempAdj3 !== sys.equipment.tempSensors.getCalibration('solar3')) {
            sys.equipment.tempSensors.setCalibration('solar3', parseFloat(obj.solarTempAdj3));
        }
        if (typeof obj.solarTempAdj4 != 'undefined' && obj.solarTempAdj4 !== sys.equipment.tempSensors.getCalibration('solar4')) {
            sys.equipment.tempSensors.setCalibration('solar3', parseFloat(obj.solarTempAdj3));
        }
        if (typeof obj.airTempAdj != 'undefined' && obj.airTempAdj !== sys.equipment.tempSensors.getCalibration('air')) {
            sys.equipment.tempSensors.setCalibration('air', parseFloat(obj.airTempAdj));
        }
        return new Promise<TempSensorCollection>((resolve, reject) => { resolve(sys.equipment.tempSensors); });
    }
    public async setOptionsAsync(obj: any): Promise<Options> {
        if (obj.clockSource === 'server') sys.board.system.setTZ();
        sys.board.system.setTempSensorsAsync(obj);
        sys.general.options.set(obj);
        return new Promise<Options>(function (resolve, reject) { resolve(sys.general.options); });
    }
    public async setLocationAsync(obj: any): Promise<Location> {
        sys.general.location.set(obj);
        return new Promise<Location>(function (resolve, reject) { resolve(sys.general.location); });
    }
    public async setOwnerAsync(obj: any): Promise<Owner> {
        sys.general.owner.set(obj);
        return new Promise<Owner>(function (resolve, reject) { resolve(sys.general.owner); });
    }
    public async setTempsAsync(obj: any): Promise<TemperatureState> {
        return new Promise<TemperatureState>((resolve, reject) => {
            for (let prop in obj) {
                switch (prop) {
                    case 'air':
                    case 'airSensor1':
                        {
                            let temp = obj[prop] !== null ? parseFloat(obj[prop]) : 0;
                            if (isNaN(temp)) return reject(new InvalidEquipmentDataError(`Invalid value for ${prop} ${obj[prop]}`, `Temps:${prop}`, obj[prop]));
                            state.temps.air = sys.equipment.tempSensors.getCalibration('air') + temp;
                        }
                        break;
                    case 'waterSensor1':
                        {
                            let temp = obj[prop] !== null ? parseFloat(obj[prop]) : 0;
                            if (isNaN(temp)) return reject(new InvalidEquipmentDataError(`Invalid value for ${prop} ${obj[prop]}`, `Temps:${prop}`, obj[prop]));
                            state.temps.waterSensor1 = sys.equipment.tempSensors.getCalibration('water1') + temp;
                            let body = state.temps.bodies.getItemById(1);
                            if (body.isOn) body.temp = state.temps.waterSensor1;

                        }
                        break;
                    case 'waterSensor2':
                        {
                            let temp = obj[prop] !== null ? parseFloat(obj[prop]) : 0;
                            if (isNaN(temp)) return reject(new InvalidEquipmentDataError(`Invalid value for ${prop} ${obj[prop]}`, `Temps:${prop}`, obj[prop]));
                            state.temps.waterSensor2 = sys.equipment.tempSensors.getCalibration('water2') + temp;
                            if (!state.equipment.shared) {
                                let body = state.temps.bodies.getItemById(2);
                                if (body.isOn) body.temp = state.temps.waterSensor2;
                            }
                        }
                        break;
                    case 'waterSensor3':
                        {
                            let temp = obj[prop] !== null ? parseFloat(obj[prop]) : 0;
                            if (isNaN(temp)) return reject(new InvalidEquipmentDataError(`Invalid value for ${prop} ${obj[prop]}`, `Temps:${prop}`, obj[prop]));
                            state.temps.waterSensor3 = sys.equipment.tempSensors.getCalibration('water3') + temp;
                            let body = state.temps.bodies.getItemById(3);
                            if (body.isOn) body.temp = state.temps.waterSensor3;
                        }
                        break;
                    case 'waterSensor4':
                        {

                            let temp = obj[prop] !== null ? parseFloat(obj[prop]) : 0;
                            if (isNaN(temp)) return reject(new InvalidEquipmentDataError(`Invalid value for ${prop} ${obj[prop]}`, `Temps:${prop}`, obj[prop]));
                            state.temps.waterSensor4 = sys.equipment.tempSensors.getCalibration('water4') + temp;
                            let body = state.temps.bodies.getItemById(4);
                            if (body.isOn) body.temp = state.temps.waterSensor4;
                        }
                        break;

                    case 'solarSensor1':
                    case 'solar1':
                    case 'solar':
                        {
                            let temp = obj[prop] !== null ? parseFloat(obj[prop]) : 0;
                            if (isNaN(temp)) return reject(new InvalidEquipmentDataError(`Invalid value for ${prop} ${obj[prop]}`, `Temps:${prop}`, obj[prop]));
                            state.temps.solar = sys.equipment.tempSensors.getCalibration('solar1') + temp;
                        }
                        break;
                    case 'solar2':
                    case 'solarSensor2':
                        {
                            let temp = obj[prop] !== null ? parseFloat(obj[prop]) : 0;
                            if (isNaN(temp)) return reject(new InvalidEquipmentDataError(`Invalid value for ${prop} ${obj[prop]}`, `Temps:${prop}`, obj[prop]));
                            state.temps.solarSensor2 = sys.equipment.tempSensors.getCalibration('solar2') + temp;
                        }
                        break;
                    case 'solar3':
                    case 'solarSensor3':
                        {
                            let temp = obj[prop] !== null ? parseFloat(obj[prop]) : 0;
                            if (isNaN(temp)) return reject(new InvalidEquipmentDataError(`Invalid value for ${prop} ${obj[prop]}`, `Temps:${prop}`, obj[prop]));
                            state.temps.solarSensor3 = sys.equipment.tempSensors.getCalibration('solar3') + temp;
                        }
                        break;
                    case 'solar4':
                    case 'solarSensor4':
                        {
                            let temp = obj[prop] !== null ? parseFloat(obj[prop]) : 0;
                            if (isNaN(temp)) return reject(new InvalidEquipmentDataError(`Invalid value for ${prop} ${obj[prop]}`, `Temps:${prop}`, obj[prop]));
                            state.temps.solarSensor4 = sys.equipment.tempSensors.getCalibration('solar4') + temp;
                        }
                        break;
                }
            }
            resolve(state.temps);
        });
    }
    public getSensors() {
        let sensors = [{ name: 'Air Sensor', temp: state.temps.air, tempAdj: sys.equipment.tempSensors.getCalibration('air'), binding: 'airTempAdj' }];
        if (sys.equipment.shared) {
            if (sys.equipment.maxBodies > 2)
                sensors.push({ name: 'Water Sensor 1', temp: state.temps.waterSensor1, tempAdj: sys.equipment.tempSensors.getCalibration('water1'), binding: 'waterTempAdj1' },
                    { name: 'Water Sensor 2', temp: state.temps.waterSensor2, tempAdj: sys.equipment.tempSensors.getCalibration('water2'), binding: 'waterTempAdj2' },
                    { name: 'Water Sensor 3', temp: state.temps.waterSensor4, tempAdj: sys.equipment.tempSensors.getCalibration('water3'), binding: 'waterTempAdj3' });
            else
                sensors.push({ name: 'Water Sensor', temp: state.temps.waterSensor1, tempAdj: sys.equipment.tempSensors.getCalibration('water1'), binding: 'waterTempAdj1' });
            if (sys.equipment.maxBodies > 3)
                sensors.push({ name: 'Water Sensor 4', temp: state.temps.waterSensor4, tempAdj: sys.equipment.tempSensors.getCalibration('water4'), binding: 'waterTempAdj4' });

            if (sys.board.heaters.isSolarInstalled()) {
                if (sys.equipment.maxBodies > 2) {
                    sensors.push({ name: 'Solar Sensor 1', temp: state.temps.solar, tempAdj: sys.equipment.tempSensors.getCalibration('solar1'), binding: 'solarTempAdj1' },
                        { name: 'Solar Sensor 2', temp: state.temps.solarSensor2, tempAdj: sys.equipment.tempSensors.getCalibration('solar2'), binding: 'solarTempAdj2' });
                }
                else
                    sensors.push({ name: 'Solar Sensor', temp: state.temps.solar, tempAdj: sys.equipment.tempSensors.getCalibration('solar1'), binding: 'solarTempAdj1' });
                if (sys.equipment.maxBodies > 3)
                    sensors.push({ name: 'Solar Sensor 4', temp: state.temps.solarSensor4, tempAdj: sys.equipment.tempSensors.getCalibration('solar4'), binding: 'solarTempAdj4' });
            }
        }
        else if (sys.equipment.dual) {
            sensors.push({ name: 'Water Sensor 1', temp: state.temps.waterSensor1, tempAdj: sys.equipment.tempSensors.getCalibration('water1'), binding: 'waterTempAdj1' },
                { name: 'Water Sensor 2', temp: state.temps.waterSensor2, tempAdj: sys.equipment.tempSensors.getCalibration('water2'), binding: 'waterTempAdj2' });
            if (sys.equipment.maxBodies > 2)
                sensors.push({ name: 'Water Sensor 3', temp: state.temps.waterSensor3, tempAdj: sys.equipment.tempSensors.getCalibration('water3'), binding: 'waterTempAdj3' });
            if (sys.equipment.maxBodies > 3)
                sensors.push({ name: 'Water Sensor 4', temp: state.temps.waterSensor4, tempAdj: sys.equipment.tempSensors.getCalibration('water4'), binding: 'waterTempAdj4' });
            if (sys.board.heaters.isSolarInstalled()) {
                sensors.push({ name: 'Solar Sensor 1', temp: state.temps.solar, tempAdj: sys.equipment.tempSensors.getCalibration('solar1'), binding: 'solarTempAdj1' },
                    { name: 'Solar Sensor 2', temp: state.temps.solarSensor2, tempAdj: sys.equipment.tempSensors.getCalibration('solar2'), binding: 'solarTempAdj2' });
                if (sys.equipment.maxBodies > 2)
                    sensors.push({ name: 'Solar Sensor 3', temp: state.temps.solarSensor3, tempAdj: sys.equipment.tempSensors.getCalibration('solar3'), binding: 'solarTempAdj3' });
                if (sys.equipment.maxBodies > 3)
                    sensors.push({ name: 'Solar Sensor 4', temp: state.temps.solarSensor4, tempAdj: sys.equipment.tempSensors.getCalibration('solar4'), binding: 'solarTempAdj4' });
            }
        }
        else {
            if (sys.equipment.maxBodies > 1) {
                sensors.push({ name: 'Water Sensor 1', temp: state.temps.waterSensor1, tempAdj: sys.equipment.tempSensors.getCalibration('water1'), binding: 'waterTempAdj1' },
                    { name: 'Water Sensor 2', temp: state.temps.waterSensor2, tempAdj: sys.equipment.tempSensors.getCalibration('water2'), binding: 'waterTempAdj2' });
                if (sys.equipment.maxBodies > 2)
                    sensors.push({ name: 'Water Sensor 3', temp: state.temps.waterSensor3, tempAdj: sys.equipment.tempSensors.getCalibration('water3'), binding: 'waterTempAdj3' });
                if (sys.equipment.maxBodies > 3)
                    sensors.push({ name: 'Water Sensor 4', temp: state.temps.waterSensor4, tempAdj: sys.equipment.tempSensors.getCalibration('water4'), binding: 'waterTempAdj4' });

                if (sys.board.heaters.isSolarInstalled()) {
                    sensors.push({ name: 'Solar Sensor 1', temp: state.temps.solarSensor1, tempAdj: sys.equipment.tempSensors.getCalibration('solar1'), binding: 'solarTempAdj1' },
                        { name: 'Solar Sensor 2', temp: state.temps.solarSensor2, tempAdj: sys.equipment.tempSensors.getCalibration('solar2'), binding: 'solarTempAdj2' });
                    if (sys.equipment.maxBodies > 2)
                        sensors.push({ name: 'Solar Sensor 3', temp: state.temps.solarSensor3, tempAdj: sys.equipment.tempSensors.getCalibration('solar3'), binding: 'solarTempAdj3' });
                    if (sys.equipment.maxBodies > 3)
                        sensors.push({ name: 'Water Sensor 4', temp: state.temps.solarSensor4, tempAdj: sys.equipment.tempSensors.getCalibration('solar4'), binding: 'solarTempAdj4' });
                }
            }
            else {
                sensors.push({ name: 'Water Sensor', temp: state.temps.waterSensor1, tempAdj: sys.equipment.tempSensors.getCalibration('water1'), binding: 'waterTempAdj1' });
                if (sys.board.heaters.isSolarInstalled())
                    sensors.push({ name: 'Solar Sensor', temp: state.temps.solar, tempAdj: sys.equipment.tempSensors.getCalibration('solar1'), binding: 'solarTempAdj1' });
            }
        }
        return sensors;
    }
    public async setCustomNamesAsync(names: any[]): Promise<CustomNameCollection> {
        if (!Array.isArray(names)) return Promise.reject(new InvalidEquipmentDataError(`Data is not an array`, 'customNames', names))
        let arr = [];
        for (let i = 0; i < names.length; i++) { arr.push(sys.board.system.setCustomNameAsync(names[i])); }
        return new Promise<CustomNameCollection>(async (resolve, reject) => {
            try {
                await Promise.all(arr).catch(err => reject(err));
                sys.board.system.syncCustomNamesValueMap();
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
            sys.board.system.syncCustomNamesValueMap();
            return resolve(cname);
        });
    }
    public syncCustomNamesValueMap() {
        sys.customNames.sortById();
        sys.board.valueMaps.customNames = new byteValueMap(
            sys.customNames.get().map((el, idx) => {
                return [idx + 200, { name: el.name, desc: el.name }];
            })
        );
    }
}
export class BodyCommands extends BoardCommands {
    public async setBodyAsync(obj: any): Promise<Body> {
        return new Promise<Body>(function (resolve, reject) {
            let id = parseInt(obj.id, 10);
            if (isNaN(id)) reject(new InvalidEquipmentIdError('Body Id has not been defined', obj.id, 'Body'));
            let body = sys.bodies.getItemById(id, false);
            body.set(obj);
            resolve(body);
        });
    }
    public mapBodyAssociation(val: any): any {
        if (typeof val === 'undefined') return;
        let ass = sys.board.bodies.getBodyAssociations();
        let nval = parseInt(val, 10);
        if (!isNaN(nval)) {
            return ass.find(elem => elem.val === nval);
        }
        else if (typeof val === 'string') return ass.find(elem => elem.name === val);
        else if (typeof val.val !== 'undefined') {
            nval = parseInt(val.val);
            return ass.find(elem => elem.val === val) !== undefined;
        }
        else if (typeof val.name !== 'undefined') return ass.find(elem => elem.name === val.name);
    }
    // This method provides a list of enumerated values for configuring associations
    // tied to the current configuration.  It is used to supply only the valid values
    // for tying things like heaters, chem controllers, ss & ds pumps to a particular body within
    // the plumbing.
    public getBodyAssociations() {
        let ass = [];
        let assoc = sys.board.valueMaps.bodies.toArray();
        for (let i = 0; i < assoc.length; i++) {
            let body;
            let code = assoc[i];
            switch (code.name) {
                case 'body1':
                case 'pool':
                    body = sys.bodies.getItemById(1);
                    code.desc = body.name;
                    ass.push(code);
                    break;
                case 'body2':
                case 'spa':
                    if (sys.equipment.maxBodies >= 2) {
                        body = sys.bodies.getItemById(2);
                        code.desc = body.name;
                        ass.push(code);
                    }
                    break;
                case 'body3':
                    if (sys.equipment.maxBodies >= 3) {
                        body = sys.bodies.getItemById(3);
                        code.desc = body.name;
                        ass.push(code);
                    }
                    break;
                case 'body4':
                    if (sys.equipment.maxBodies >= 4) {
                        body = sys.bodies.getItemById(3);
                        code.desc = body.name;
                        ass.push(code);
                    }
                    break;
                case 'poolspa':
                    if (sys.equipment.shared && sys.equipment.maxBodies >= 2) {
                        body = sys.bodies.getItemById(1);
                        let body2 = sys.bodies.getItemById(2);
                        code.desc = `${body.name}/${body2.name}`;
                        ass.push(code);
                    }
                    break;
            }
        }
        return ass;
    }
    public setHeatModeAsync(body: Body, mode: number): Promise<BodyTempState> {
        let bdy = sys.bodies.getItemById(body.id);
        let bstate = state.temps.bodies.getItemById(body.id);
        bdy.heatMode = bstate.heatMode = mode;
        state.emitEquipmentChanges();
        return Promise.resolve(bstate);
    }
    public async setHeatSetpointAsync(body: Body, setPoint: number): Promise<BodyTempState> {
        let bdy = sys.bodies.getItemById(body.id);
        let bstate = state.temps.bodies.getItemById(body.id);
        bdy.setPoint = bstate.setPoint = setPoint;
        state.emitEquipmentChanges();
        return Promise.resolve(bstate);
    }
    public getHeatModes(bodyId: number) {
        let heatModes = [];
        // RKS: 09-26-20 This will need to be overloaded in IntelliCenterBoard when the other heater types are identified. (e.g. ultratemp, hybrid, maxetherm, and mastertemp)
        heatModes.push(this.board.valueMaps.heatModes.transformByName('off')); // In IC fw 1.047 off is no longer 0.
        let heatTypes = this.board.heaters.getInstalledHeaterTypes(bodyId);
        if (heatTypes.gas > 0)
            heatModes.push(this.board.valueMaps.heatModes.transformByName('heater'));
        if (heatTypes.solar > 0) {
            let hm = this.board.valueMaps.heatModes.transformByName('solar');
            heatModes.push(hm);
            if (heatTypes.total > 1) heatModes.push(this.board.valueMaps.heatModes.transformByName('solarpref'));
        }
        if (heatTypes.heatpump > 0) {
            let hm = this.board.valueMaps.heatModes.transformByName('heatpump');
            if (heatTypes.total > 1) heatModes.push(this.board.valueMaps.heatModes.transformByName('heatpumppref'));
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
    public isBodyOn(bodyCode: number): boolean {
        let assoc = sys.board.valueMaps.bodies.transform(bodyCode);
        switch (assoc.name) {
            case 'body1':
            case 'pool':
                return state.temps.bodies.getItemById(1).isOn;
            case 'body2':
            case 'spa':
                return state.temps.bodies.getItemById(2).isOn;
            case 'body3':
                return state.temps.bodies.getItemById(3).isOn;
            case 'body4':
                return state.temps.bodies.getItemById(4).isOn;
            case 'poolspa':
                if (sys.equipment.shared && sys.equipment.maxBodies >= 2)
                    return state.temps.bodies.getItemById(1).isOn || state.temps.bodies.getItemById(2).isOn;
                else
                    return state.temps.bodies.getItemById(1).isOn;
        }
        return false;
    }
}
export interface CallbackStack {
    fn: () => void,
    timeout: number;
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
    public async setPumpAsync(data: any): Promise<Pump> {
        if (typeof data.id !== 'undefined') {
            let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
            if (id <= 0) id = sys.pumps.length + 1;
            if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid pump id: ${data.id}`, data.id, 'Pump'));
            let pump = sys.pumps.getItemById(id, data.id <= 0);
            let spump = state.pumps.getItemById(id, data.id <= 0);
            if (typeof data.type !== 'undefined' && data.type !== pump.type) {
                sys.board.pumps.setType(pump, data.type);
                pump = sys.pumps.getItemById(id, true);
                spump = state.pumps.getItemById(id, true);
            }
            let type = sys.board.valueMaps.pumpTypes.transform(pump.type);
            data.name = data.name || pump.name || type.desc;
            if (typeof type.maxCircuits !== 'undefined' && type.maxCircuits > 0 && typeof data.circuits !== 'undefined') { // This pump type supports circuits
                for (let i = 1; i <= data.circuits.length && i <= type.maxCircuits; i++) {
                    let c = data.circuits[i - 1];
                    let speed = parseInt(c.speed, 10);
                    let flow = parseInt(c.flow, 10);
                    if (isNaN(speed)) speed = type.minSpeed;
                    if (isNaN(flow)) flow = type.minFlow;
                    // outc.setPayloadByte(i * 2 + 3, parseInt(c.circuit, 10), 0);
                    c.units = parseInt(c.units, 10) || type.name === 'vf' ? sys.board.valueMaps.pumpUnits.getValue('gpm') : sys.board.valueMaps.pumpUnits.getValue('rpm');
                    if (typeof type.minSpeed !== 'undefined' && c.units === sys.board.valueMaps.pumpUnits.getValue('rpm')) {
                        // outc.setPayloadByte(i * 2 + 4, Math.floor(speed / 256)); // Set to rpm
                        // outc.setPayloadByte(i + 21, speed - (Math.floor(speed / 256) * 256));
                        c.speed = speed;
                    }
                    else if (typeof type.minFlow !== 'undefined' && c.units === sys.board.valueMaps.pumpUnits.getValue('gpm')) {
                        // outc.setPayloadByte(i * 2 + 4, flow); // Set to gpm
                        c.flow = flow;
                    }
                }
            }
            pump.set(data); // Sets all the data back to the pump.
            sys.pumps.sortById();
            state.pumps.sortById();
            spump.emitEquipmentChange();
            sys.board.virtualPumpControllers.start();
            return new Promise<Pump>((resolve, reject) => { resolve(pump); });
        }
        else
            return Promise.reject(new InvalidEquipmentIdError('No pump information provided', undefined, 'Pump'));
    }
    public deletePumpAsync(data: any): Promise<Pump> {
        if (typeof data.id !== 'undefined') {
            let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
            if (id <= 0) id = sys.pumps.length + 1;
            if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid pump id: ${data.id}`, data.id, 'Pump'));
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
        let spump = state.pumps.getItemById(pump.id);
        spump.emitData('pumpExt', spump.getExtended());
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
            let type = sys.board.valueMaps.pumpTypes.transform(pumpType);

            if (type.name === 'vs' || type.name === 'vsf') {
                pump.speedStepSize = 10;
                pump.minSpeed = type.minSpeed;
                pump.maxSpeed = type.maxSpeed;
            }
            if (type.name === 'vf' || type.name === 'vsf') {
                pump.flowStepSize = 1;
                pump.minFlow = type.minFlow;
                pump.maxFlow = type.maxFlow;
            }
            let spump = state.pumps.getItemById(pump.id, true);
            spump.type = pump.type;
            spump.isActive = pump.isActive;
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

    public run(pump: Pump) {
        let spump = state.pumps.getItemById(pump.id);
        if (typeof spump.targetSpeed === 'undefined') sys.board.virtualPumpControllers.setTargetSpeed();
        if (spump.virtualControllerStatus === sys.board.valueMaps.virtualControllerStatus.getValue('stopped')) {
            sys.board.pumps.stopPumpRemoteContol(pump);
        }
        else {
            let callbackStack: CallbackStack[] = [
                { fn: () => { sys.board.pumps.setDriveStatePacket(pump, spump, callbackStack); }, timeout: 500 },
                undefined,
                { fn: () => { sys.board.pumps.requestPumpStatus(pump, spump, callbackStack); }, timeout: 2000 },
                { fn: () => { sys.board.pumps.run(pump); }, timeout: 500 }
            ];
            if (spump.targetSpeed === 0) callbackStack.splice(1, 1);
            else if (spump.targetSpeed > 0 && spump.targetSpeed <= 130) callbackStack[1] = { fn: () => { sys.board.pumps.runGPM(pump, spump, callbackStack); }, timeout: 2000 }
            else if (spump.targetSpeed > 130) callbackStack[1] = { fn: () => { sys.board.pumps.runRPM(pump, spump, callbackStack); }, timeout: 2000 }
            sys.board.pumps.setPumpToRemoteControl(pump, spump, callbackStack);
        }
    }
    public stopPumpRemoteContol(pump: Pump) {
        let callbackStack: CallbackStack[] = [
            { fn: () => { sys.board.pumps.setPumpManual(pump, spump, callbackStack); }, timeout: 500 },
            { fn: () => { sys.board.pumps.setDriveStatePacket(pump, spump, callbackStack); }, timeout: 500 },
            { fn: () => { sys.board.pumps.setPumpToRemoteControl(pump, spump, callbackStack); }, timeout: 500 }
        ];
        let spump = state.pumps.getItemById(pump.id);
        sys.board.pumps.setDriveStatePacket(pump, spump, callbackStack);
    }
    public setPumpToRemoteControl(pump: Pump, spump: PumpState, callbackStack?: CallbackStack[]) {
        let out = Outbound.create({
            protocol: Protocol.Pump,
            dest: pump.address,
            action: 4,
            payload: spump.virtualControllerStatus === sys.board.valueMaps.virtualControllerStatus.getValue('running') ? [255] : [0],
            retries: 1,
            response: true,
            onComplete: (err) => {
                if (err) {
                    logger.error(err);
                    setTimeout(sys.board.pumps.run, 500, pump);
                }
                else if (callbackStack.length > 0) {
                    let cb = callbackStack.shift();
                    if (typeof cb.fn === 'function') {
                        setTimeout(cb.fn, cb.timeout);
                    }
                }
            }
        });
        conn.queueSendMessage(out);
    }
    public setPumpManual(pump: Pump, spump: PumpState, callbackStack: any[]) {
        let out = Outbound.create({
            protocol: Protocol.Pump,
            dest: pump.address,
            action: 5,
            payload: [],
            retries: 1,
            onComplete: (err, msg: Outbound) => {
                if (err) {
                    logger.error(err);
                    setTimeout(sys.board.pumps.run, 500, pump);
                }
                else if (callbackStack.length > 0) {
                    let cb = callbackStack.shift();
                    if (typeof cb.fn === 'function') {
                        setTimeout(cb.fn, cb.timeout);
                    }
                }
            }
        });
        conn.queueSendMessage(out);
    }
    public setDriveStatePacket(pump: Pump, spump: PumpState, callbackStack?: CallbackStack[]) {
        let out = Outbound.create({
            protocol: Protocol.Pump,
            dest: pump.address,
            action: 6,
            payload: sys.board.valueMaps.virtualControllerStatus.getValue('running') && spump.targetSpeed > 0 ? [10] : [4],
            retries: 1,
            onComplete: (err, msg: Outbound) => {
                if (err) {
                    logger.error(err);
                    setTimeout(sys.board.pumps.run, 500, pump);
                }
                else if (callbackStack.length > 0) {
                    let cb = callbackStack.shift();
                    if (typeof cb.fn === 'function') {
                        setTimeout(cb.fn, cb.timeout);
                    }
                }
            }
        });
        conn.queueSendMessage(out);
    }
    private runRPM(pump: Pump, spump: PumpState, callbackStack?: CallbackStack[]) {
        // payload[0] === 1 is for VS (type 128); 10 for VSF (type 64)
        sys.board.virtualPumpControllers.setTargetSpeed();
        let speed = spump.targetSpeed;
        if (speed === 0 && callbackStack.length > 0) {
            let cb = callbackStack.shift();
            if (typeof cb.fn === 'function') {
                setTimeout(cb.fn, cb.timeout);
            }
        }
        let out = Outbound.create({
            protocol: Protocol.Pump,
            dest: pump.address,
            action: pump.type === 128 ? 1 : 10,
            payload: [2, 196, Math.floor(speed / 256), speed % 256],
            retries: 1,
            // timeout: 250,
            response: true,
            onComplete: (err, msg) => {
                if (err) {
                    logger.error(err);
                    setTimeout(sys.board.pumps.run, 500, pump);
                }
                else if (callbackStack.length > 0) {
                    let cb = callbackStack.shift();
                    if (typeof cb.fn === 'function') {
                        setTimeout(cb.fn, cb.timeout);
                    }
                }
            }
        });
        conn.queueSendMessage(out);
    }
    private runGPM(pump: Pump, spump: PumpState, callbackStack?: any[]) {
        // return new Promise((resolve, reject) => {
        sys.board.virtualPumpControllers.setTargetSpeed();
        let speed = spump.targetSpeed;
        if (speed === 0 && callbackStack.length > 0) {
            let cb = callbackStack.shift();
            if (typeof cb.fn === 'function') {
                setTimeout(cb.fn, cb.timeout);
            }
        }
        let out = Outbound.create({
            protocol: Protocol.Pump,
            dest: pump.address,
            action: pump.type === 128 ? 1 : 10,
            payload: [],
            retries: 1,
            onComplete: (err, msg) => {
                if (err) {
                    logger.error(err);
                    setTimeout(sys.board.pumps.run, 500, pump);
                }
                else if (callbackStack.length > 0) {
                    let cb = callbackStack.shift();
                    if (typeof cb.fn === 'function') {
                        setTimeout(cb.fn, cb.timeout);
                    }
                }
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
        // });
    }
    public requestPumpStatus(pump: Pump, spump: PumpState, callbackStack: any[]) {
        let out = Outbound.create({
            protocol: Protocol.Pump,
            dest: pump.address,
            action: 7,
            payload: [],
            retries: 1,
            response: true,
            onComplete: (err, msg) => {
                if (err) {
                    logger.error(err);
                    setTimeout(sys.board.pumps.run, 500, pump);
                }
                else if (callbackStack.length > 0) {
                    let cb = callbackStack.shift();
                    if (typeof cb.fn === 'function') {
                        setTimeout(cb.fn, cb.timeout);
                    }
                }
            }
        });
        conn.queueSendMessage(out);
    }
}
export class CircuitCommands extends BoardCommands {
    public syncVirtualCircuitStates() {
        let arrCircuits = sys.board.valueMaps.virtualCircuits.toArray();
        let poolStates = sys.board.bodies.getPoolStates();
        let spaStates = sys.board.bodies.getSpaStates();
        // The following should work for all board types if the virtualCiruit valuemaps use common names.  The circuit ids can be
        // different as well as the descriptions but these should have common names since they are all derived from existing states.

        // This also removes virtual circuits depending on whether heaters exsits on the bodies.  Not sure why we are doing this
        // as the body data contains whether a body is heated or not.  Perhapse some attached interface is using
        // the virtual circuit list as a means to determine whether solar is available.  That is totally flawed if that is the case.
        for (let i = 0; i < arrCircuits.length; i++) {
            let vc = arrCircuits[i];
            let remove = false;
            let bState = false;
            let cstate: VirtualCircuitState = null;
            switch (vc.name) {
                case 'poolHeater':
                    // If any pool is heating up.
                    remove = true;
                    for (let j = 0; j < poolStates.length; j++) {
                        if (poolStates[j].heaterOptions.total > 0) remove = false;
                    }
                    if (!remove) {
                        // Determine whether the pool heater is on.
                        for (let j = 0; j < poolStates.length; j++)
                            if (sys.board.valueMaps.heatStatus.getName(poolStates[j].heatStatus) === 'heater') bState = true;
                    }
                    break;
                case 'spaHeater':
                    remove = true;
                    for (let j = 0; j < spaStates.length; j++) {
                        if (spaStates[j].heaterOptions.total > 0) remove = false;
                    }
                    if (!remove) {
                        // Determine whether the spa heater is on.
                        for (let j = 0; j < spaStates.length; j++) {
                            if (sys.board.valueMaps.heatStatus.getName(spaStates[j].heatStatus) === 'heater') bState = true;
                        }
                    }
                    break;
                case 'freeze':
                    // If freeze protection has been turned on.
                    bState = state.freeze;
                    break;
                case 'poolSpa':
                    // If any pool or spa is on
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
                    remove = true;
                    for (let j = 0; j < poolStates.length; j++) {
                        if (poolStates[j].heaterOptions.solar + poolStates[j].heaterOptions.heatpump > 0) remove = false;
                    }
                    if (remove) {
                        for (let j = 0; j < spaStates.length; j++) {
                            if (spaStates[j].heaterOptions.solar + spaStates[j].heaterOptions.heatpump > 0) remove = false;
                        }
                    }
                    if (!remove) {
                        for (let j = 0; j < poolStates.length && !bState; j++) {
                            if (sys.board.valueMaps.heatStatus.getName(poolStates[j].heatStatus) === 'solar') bState = true;
                        }
                        for (let j = 0; j < spaStates.length && !bState; j++) {
                            if (sys.board.valueMaps.heatStatus.getName(spaStates[j].heatStatus) === 'solar') bState = true;
                        }
                    }
                    break;
                case 'heater':
                    remove = true;
                    for (let j = 0; j < poolStates.length; j++) {
                        if (poolStates[j].heaterOptions.total > 0) remove = false;
                    }
                    if (remove) {
                        for (let j = 0; j < spaStates.length; j++) {
                            if (spaStates[j].heaterOptions.total > 0) remove = false;
                        }
                    }
                    if (!remove) {
                        for (let j = 0; j < poolStates.length && !bState; j++) {
                            let heat = sys.board.valueMaps.heatStatus.getName(poolStates[j].heatStatus);
                            if (heat !== 'off') bState = true;
                        }
                        for (let j = 0; j < spaStates.length && !bState; j++) {
                            let heat = sys.board.valueMaps.heatStatus.getName(spaStates[j].heatStatus);
                            if (heat !== 'off') bState = true;
                        }
                    }
                    break;
                default:
                    remove = true;
                    break;
            }
            if (remove)
                state.virtualCircuits.removeItemById(vc.val);
            else {
                cstate = state.virtualCircuits.getItemById(vc.val, true);
                if (cstate !== null) {
                    cstate.isOn = bState;
                    cstate.type = vc.val;
                    cstate.name = vc.desc;
                }
            }
        }
    }
    public setCircuitStateAsync(id: number, val: boolean): Promise<ICircuitState> {
        let circuit: ICircuit = sys.circuits.getInterfaceById(id);
        let circ = state.circuits.getInterfaceById(id, circuit.isActive !== false);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Circuit or Feature id not valid', id, 'Circuit'));
        circ.isOn = utils.makeBool(val);
        if (circ.id === 6 || circ.id === 1) {
            for (let i = 0; i < state.temps.bodies.length; i++) {
                if (state.temps.bodies.getItemByIndex(i).circuit === circ.id) {
                    state.temps.bodies.getItemByIndex(i).isOn = utils.makeBool(circ.isOn);
                    break;
                }
            }
        }
        sys.board.valves.syncValveStates();
        state.emitEquipmentChanges();
        sys.board.virtualPumpControllers.start();
        return Promise.resolve(state.circuits.getInterfaceById(circ.id));
    }
    public toggleCircuitStateAsync(id: number): Promise<ICircuitState> {
        let circ = state.circuits.getInterfaceById(id);
        return this.setCircuitStateAsync(id, !(circ.isOn || false));
    }
    public async setLightThemeAsync(id: number, theme: number) {
        let cstate = state.circuits.getItemById(id);
        cstate.lightingTheme = theme;
        return Promise.resolve(cstate as ICircuitState);
    }
    public setDimmerLevelAsync(id: number, level: number): Promise<ICircuitState> {
        let circ = state.circuits.getItemById(id);
        circ.level = level;
        return Promise.resolve(circ as ICircuitState);
    }
    public getCircuitReferences(includeCircuits?: boolean, includeFeatures?: boolean, includeVirtual?: boolean, includeGroups?: boolean) {
        let arrRefs = [];
        if (includeCircuits) {
            // RSG: converted this to getItemByIndex because hasHeatSource isn't actually stored as part of the data
            for (let i = 0; i < sys.circuits.length; i++) {
                let c = sys.circuits.getItemByIndex(i);
                arrRefs.push({ id: c.id, name: c.name, type: c.type, equipmentType: 'circuit', nameId: c.nameId, hasHeatSource: c.hasHeatSource });
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
                arrRefs.push({ id: c.val, name: c.desc, equipmentType: 'virtual', assignableToPumpCircuit: c.assignableToPumpCircuit });
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
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid circuit id: ${data.id}`, data.id, 'Circuit'));
        if (id === 6) return Promise.reject(new ParameterOutOfRangeError('You may not set the pool circuit', 'Setting Circuit Config', 'id', id));

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
            else if (!circuit.name && !data.name) circuit.name = scircuit.name = `circuit${data.id}`;
            if (typeof data.type !== 'undefined' || typeof circuit.type === 'undefined') circuit.type = scircuit.type = parseInt(data.type, 10) || 0;
            if (typeof data.freeze !== 'undefined' || typeof circuit.freeze === 'undefined') circuit.freeze = utils.makeBool(data.freeze) || false;
            if (typeof data.showInFeatures !== 'undefined' || typeof data.showInFeatures === 'undefined') circuit.showInFeatures = scircuit.showInFeatures = utils.makeBool(data.showInFeatures) || true;
            if (typeof data.dontStop !== 'undefined' && utils.makeBool(data.dontStop) === true) data.eggTimer = 1440;
            if (typeof data.eggTimer !== 'undefined' || typeof circuit.eggTimer === 'undefined') circuit.eggTimer = parseInt(data.eggTimer, 10) || 0;
            circuit.dontStop = circuit.eggTimer === 1440;
            sys.emitEquipmentChange();
            state.emitEquipmentChanges();
            return new Promise<ICircuit>((resolve, reject) => { resolve(circuit); });
        }
        else
            return Promise.reject(new Error('Circuit id has not been defined'));
    }
    public async setCircuitGroupAsync(obj: any): Promise<CircuitGroup> {
        let group: CircuitGroup = null;
        let id = typeof obj.id !== 'undefined' ? parseInt(obj.id, 10) : -1;
        if (id <= 0) {
            // We are adding a circuit group.
            id = sys.circuitGroups.getNextEquipmentId(sys.board.equipmentIds.circuitGroups);
        }
        if (typeof id === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Max circuit group id exceeded`, id, 'CircuitGroup'));
        if (isNaN(id) || !sys.board.equipmentIds.circuitGroups.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid circuit group id: ${obj.id}`, obj.id, 'CircuitGroup'));
        group = sys.circuitGroups.getItemById(id, true);
        return new Promise<CircuitGroup>((resolve, reject) => {
            if (typeof obj.name !== 'undefined') group.name = obj.name;
            if (typeof obj.dontStop !== 'undefined' && utils.makeBool(obj.dontStop) === true) obj.eggTimer = 1440;
            if (typeof obj.eggTimer !== 'undefined') group.eggTimer = Math.min(Math.max(parseInt(obj.eggTimer, 10), 0), 1440);
            group.dontStop = group.eggTimer === 1440;
            group.isActive = true;

            if (typeof obj.circuits !== 'undefined') {
                for (let i = 0; i < obj.circuits.length; i++) {
                    let c = group.circuits.getItemByIndex(i, true, { id: i + 1 });
                    let cobj = obj.circuits[i];
                    if (typeof cobj.circuit !== 'undefined') c.circuit = cobj.circuit;
                    if (typeof cobj.desiredState !== 'undefined')
                        c.desiredState = parseInt(cobj.desiredState, 10);
                    else if (typeof cobj.desiredStateOn !== 'undefined') {
                        // Shim for prior interfaces that send desiredStateOn.
                        c.desiredState = utils.makeBool(cobj.desiredStateOn) ? 0 : 1;
                        //c.desiredStateOn = utils.makeBool(cobj.desiredStateOn);
                    }
                    //RKS: 09-26-20 There is no such thing as a lighting theme on a circuit group circuit.  That is what lighGroups are for.
                    //if (typeof cobj.lightingTheme !== 'undefined') c.lightingTheme = parseInt(cobj.lightingTheme, 10);
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
        if (typeof id === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Max circuit light group id exceeded`, id, 'LightGroup'));
        if (isNaN(id) || !sys.board.equipmentIds.circuitGroups.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid circuit group id: ${obj.id}`, obj.id, 'LightGroup'));
        group = sys.lightGroups.getItemById(id, true);
        return new Promise<LightGroup>((resolve, reject) => {
            if (typeof obj.name !== 'undefined') group.name = obj.name;
            if (typeof obj.dontStop !== 'undefined' && utils.makeBool(obj.dontStop) === true) obj.eggTimer = 1440;
            if (typeof obj.eggTimer !== 'undefined') group.eggTimer = Math.min(Math.max(parseInt(obj.eggTimer, 10), 0), 1440);
            group.dontStop = group.eggTimer === 1440;
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
        if (isNaN(id)) return Promise.reject(new EquipmentNotFoundError(`Invalid group id: ${obj.id}`, 'CircuitGroup'));
        if (!sys.board.equipmentIds.circuitGroups.isInRange(id)) return;
        if (typeof obj.id !== 'undefined') {
            let group = sys.circuitGroups.getItemById(id, false);
            let sgroup = state.circuitGroups.getItemById(id, false);
            sys.circuitGroups.removeItemById(id);
            state.circuitGroups.removeItemById(id);
            group.isActive = false;
            sgroup.isOn = false;
            sgroup.isActive = false;
            sgroup.emitEquipmentChange();
            return new Promise<CircuitGroup>((resolve, reject) => { resolve(group); });
        }
        else
            return Promise.reject(new InvalidEquipmentIdError('Group id has not been defined', id, 'CircuitGroup'));
    }
    public async deleteLightGroupAsync(obj: any): Promise<LightGroup> {
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) return Promise.reject(new EquipmentNotFoundError(`Invalid group id: ${obj.id}`, 'LightGroup'));
        if (!sys.board.equipmentIds.circuitGroups.isInRange(id)) return;
        if (typeof obj.id !== 'undefined') {
            let group = sys.lightGroups.getItemById(id, false);
            let sgroup = state.lightGroups.getItemById(id, false);
            sys.lightGroups.removeItemById(id);
            state.lightGroups.removeItemById(id);
            group.isActive = false;
            sgroup.isOn = false;
            sgroup.isActive = false;
            sgroup.emitEquipmentChange();
            return new Promise<LightGroup>((resolve, reject) => { resolve(group); });
        }
        else
            return Promise.reject(new InvalidEquipmentIdError('Group id has not been defined', id, 'LightGroup'));
    }
    public async deleteCircuitAsync(data: any): Promise<ICircuit> {
        if (typeof data.id === 'undefined') return Promise.reject(new InvalidEquipmentIdError('You must provide an id to delete a circuit', data.id, 'Circuit'));
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
    public async setLightGroupThemeAsync(id: number, theme: number): Promise<ICircuitState> {
        const grp = sys.lightGroups.getItemById(id);
        const sgrp = state.lightGroups.getItemById(id);
        grp.lightingTheme = sgrp.lightingTheme = theme;
        for (let i = 0; i < grp.circuits.length; i++) {
            let c = grp.circuits.getItemByIndex(i);
            let cstate = state.circuits.getItemById(c.circuit);
            // if theme is 'off' light groups should not turn on
            if (cstate.isOn && sys.board.valueMaps.lightThemes.getName(theme) === 'off')
                await sys.board.circuits.setCircuitStateAsync(c.circuit, false);
            else if (!cstate.isOn && sys.board.valueMaps.lightThemes.getName(theme) !== 'off') await sys.board.circuits.setCircuitStateAsync(c.circuit, true);
        }
        sgrp.isOn = sys.board.valueMaps.lightThemes.getName(theme) === 'off' ? false : true;
        // If we truly want to support themes in lightGroups we probably need to program
        // the specific on/off toggles to enable that.  For now this will go through the motions but it's just a pretender.
        switch (theme) {
            case 0: // off
            case 1: // on
                break;
            case 128: // sync
                setImmediate(function () { sys.board.circuits.sequenceLightGroupAsync(grp.id, 'sync'); });
                break;
            case 144: // swim
                setImmediate(function () { sys.board.circuits.sequenceLightGroupAsync(grp.id, 'swim'); });
                break;
            case 160: // swim
                setImmediate(function () { sys.board.circuits.sequenceLightGroupAsync(grp.id, 'set'); });
                break;
            case 190: // save
            case 191: // recall
                setImmediate(function () { sys.board.circuits.sequenceLightGroupAsync(grp.id, 'other'); });
                break;
            default:
                setImmediate(function () { sys.board.circuits.sequenceLightGroupAsync(grp.id, 'color'); });
            // other themes for magicstream?
        }
        sgrp.hasChanged = true; // Say we are dirty but we really are pure as the driven snow.
        state.emitEquipmentChanges();
        return Promise.resolve(sgrp);
    }
    public async setLightGroupAttribsAsync(group: LightGroup): Promise<LightGroup> {
        let grp = sys.lightGroups.getItemById(group.id);
        try {
            grp.circuits.clear();
            for (let i = 0; i < group.circuits.length; i++) {
                let circuit = group.circuits.getItemByIndex(i);
                grp.circuits.add({ id: i, circuit: circuit.circuit, color: circuit.color, position: i, swimDelay: circuit.swimDelay });
            }
            let sgrp = state.lightGroups.getItemById(group.id);
            sgrp.hasChanged = true; // Say we are dirty but we really are pure as the driven snow.
            return Promise.resolve(grp);
        }
        catch (err) { return Promise.reject(err); }
    }
    public sequenceLightGroupAsync(id: number, operation: string): Promise<LightGroupState> {
        let sgroup = state.lightGroups.getItemById(id);
        let nop = sys.board.valueMaps.intellibriteActions.getValue(operation);
        if (nop > 0) {
            sgroup.action = nop;
            sgroup.hasChanged = true; // Say we are dirty but we really are pure as the driven snow.
            state.emitEquipmentChanges();
            setTimeout(function () {
                sgroup.action = 0;
                sgroup.hasChanged = true; // Say we are dirty but we really are pure as the driven snow.
                state.emitEquipmentChanges();
            }, 20000); // It takes 20 seconds to sequence.
        }
        return Promise.resolve(sgroup);
    }
    public async setCircuitGroupStateAsync(id: number, val: boolean): Promise<ICircuitGroupState> {
        let grp = sys.circuitGroups.getItemById(id, false, { isActive: false });
        let gstate = (grp.dataName === 'circuitGroupConfig') ? state.circuitGroups.getItemById(grp.id, grp.isActive !== false) : state.lightGroups.getItemById(grp.id, grp.isActive !== false);
        let circuits = grp.circuits.toArray();
        gstate.isOn = val;
        let arr = [];
        for (let i = 0; i < circuits.length; i++) {
            let circuit = circuits[i];
            arr.push(sys.board.circuits.setCircuitStateAsync(circuit.circuit, val));
        }
        return new Promise<ICircuitGroupState>(async (resolve, reject) => {
            await Promise.all(arr).catch((err) => { reject(err) });
            resolve(gstate);
        });
    }
    public async setLightGroupStateAsync(id: number, val: boolean): Promise<ICircuitGroupState> {
        return sys.board.circuits.setCircuitGroupStateAsync(id, val);
    }
    /*     public sequenceIntelliBrite(operation: string) {
            state.intellibrite.hasChanged = true;
            let nop = sys.board.valueMaps.intellibriteActions.getValue(operation);
            if (nop > 0) {
                state.intellibrite.action = nop;
                setTimeout(function() { state.intellibrite.action = 0; state.emitEquipmentChanges(); }, 20000); // It takes 20 seconds to sequence.
            }
        } */
}
export class FeatureCommands extends BoardCommands {
    public async setFeatureAsync(obj: any): Promise<Feature> {
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid feature id: ${obj.id}`, obj.id, 'Feature'));
        if (!sys.board.equipmentIds.features.isInRange(obj.id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid feature id: ${obj.id}`, obj.id, 'Feature'));
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
            else if (!feature.name && !obj.name) feature.name = sfeature.name = `feature${obj.id}`;
            if (typeof obj.type !== 'undefined') feature.type = sfeature.type = parseInt(obj.type, 10);
            else if (!feature.type && typeof obj.type !== 'undefined') feature.type = sfeature.type = 0;
            if (typeof obj.freeze !== 'undefined') feature.freeze = utils.makeBool(obj.freeze);
            if (typeof obj.showInFeatures !== 'undefined') feature.showInFeatures = sfeature.showInFeatures = utils.makeBool(obj.showInFeatures);
            if (typeof obj.dontStop !== 'undefined' && utils.makeBool(obj.dontStop) === true) obj.eggTimer = 1440;
            if (typeof obj.eggTimer !== 'undefined') feature.eggTimer = parseInt(obj.eggTimer, 10);
            feature.dontStop = feature.eggTimer === 1440;
            return new Promise<Feature>((resolve, reject) => { resolve(feature); });
        }
        else
            Promise.reject(new InvalidEquipmentIdError('Feature id has not been defined', undefined, 'Feature'));
    }
    public async deleteFeatureAsync(obj: any): Promise<Feature> {
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid feature id: ${obj.id}`, obj.id, 'Feature'));
        if (!sys.board.equipmentIds.features.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid feature id: ${obj.id}`, obj.id, 'Feature'));
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
            Promise.reject(new InvalidEquipmentIdError('Feature id has not been defined', undefined, 'Feature'));
    }
    public async setFeatureStateAsync(id: number, val: boolean): Promise<ICircuitState> {
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid feature id: ${id}`, id, 'Feature'));
        if (!sys.board.equipmentIds.features.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid feature id: ${id}`, id, 'Feature'));
        let feature = sys.features.getItemById(id);
        let fstate = state.features.getItemById(feature.id, feature.isActive !== false);
        fstate.isOn = val;
        sys.board.valves.syncValveStates();
        sys.board.virtualPumpControllers.start();
        state.emitEquipmentChanges();
        return Promise.resolve(fstate.get(true));
    }
    public async toggleFeatureStateAsync(id: number): Promise<ICircuitState> {
        let feat = state.features.getItemById(id);
        return this.setFeatureStateAsync(id, !(feat.isOn || false));
    }
    public syncGroupStates() {
        for (let i = 0; i < sys.circuitGroups.length; i++) {
            let grp: CircuitGroup = sys.circuitGroups.getItemByIndex(i);
            let circuits = grp.circuits.toArray();
            let bIsOn = false;
            if (grp.isActive) {
                for (let j = 0; j < circuits.length; j++) {
                    let circuit: CircuitGroupCircuit = grp.circuits.getItemById(j);
                    let cstate = state.circuits.getInterfaceById(circuit.circuit);
                    if (circuit.desiredState === 1 || circuit.desiredState === 0) {
                        if (cstate.isOn === utils.makeBool(circuit.desiredState)) bIsOn = true;
                    }
                }
            }
            let sgrp = state.circuitGroups.getItemById(grp.id);
            sgrp.isOn = bIsOn && grp.isActive;
            sys.board.valves.syncValveStates();
            state.emitEquipmentChanges();
        }
    }

}  // tacowaco93915212
export class ChlorinatorCommands extends BoardCommands {
    public setChlorAsync(obj: any): Promise<ChlorinatorState> {
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) obj.id = 1;
        // Merge all the information.
        let chlor = extend(true, {}, sys.chlorinators.getItemById(id).get(), obj);
        // Verify the data.
        if (typeof chlor.body === 'undefined') chlor.body = obj.body || 32;
        let body = sys.board.bodies.mapBodyAssociation(chlor.body);
        if (typeof body === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Chlorinator body association is not valid: ${chlor.body}`, 'chlorinator', chlor.body));
        if (chlor.poolSetpoint > 100 || chlor.poolSetpoint < 0) return Promise.reject(new InvalidEquipmentDataError(`Chlorinator poolSetpoint is out of range: ${chlor.poolSetpoint}`, 'chlorinator', chlor.poolSetpoint));
        if (chlor.spaSetpoint > 100 || chlor.spaSetpoint < 0) return Promise.reject(new InvalidEquipmentDataError(`Chlorinator spaSetpoint is out of range: ${chlor.poolSetpoint}`, 'chlorinator', chlor.spaSetpoint));
        // if (typeof body === 'undefined') throw new InvalidEquipmentDataError(`Chlorinator body association is not valid: ${chlor.body}`, 'chlorinator', chlor.body);
        // if (chlor.poolSetpoint > 100 || chlor.poolSetpoint < 0) throw new InvalidEquipmentDataError(`Chlorinator poolSetpoint is out of range: ${chlor.poolSetpoint}`, 'chlorinator', chlor.poolSetpoint);
        // if (chlor.spaSetpoint > 100 || chlor.spaSetpoint < 0) throw new InvalidEquipmentDataError(`Chlorinator spaSetpoint is out of range: ${chlor.poolSetpoint}`, 'chlorinator', chlor.spaSetpoint);
        let schlor = state.chlorinators.getItemById(id, true);
        let cchlor = sys.chlorinators.getItemById(id, true);
        for (let prop in chlor) {
            if (prop in schlor) schlor[prop] = chlor[prop];
            if (prop in cchlor) cchlor[prop] = chlor[prop];
        }
        state.emitEquipmentChanges();
        return Promise.resolve(chlor);
    }
    public deleteChlorAsync(obj: any): Promise<ChlorinatorState> {
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) obj.id = 1;
        // Merge all the information.
        let chlor = state.chlorinators.getItemById(id);

        state.chlorinators.removeItemById(id);
        sys.chlorinators.removeItemById(id);
        state.emitEquipmentChanges();
        return Promise.resolve(chlor);
    }

    public setChlorProps(chlor: Chlorinator, obj?: any) {
        if (typeof obj !== 'undefined') {
            for (var prop in obj) {
                if (prop in chlor) chlor[prop] = obj[prop];
            }
        }
    }
    // Chlorinator direct control methods
    public requestName(cstate: ChlorinatorState) {
        let out = Outbound.create({
            protocol: Protocol.Chlorinator,
            dest: cstate.id,
            action: 20,
            payload: [2],
            retries: 1
        });
        conn.queueSendMessage(out);
    }

    public run(chlor: Chlorinator, cstate: ChlorinatorState) {
        if (cstate.virtualControllerStatus !== sys.board.valueMaps.virtualControllerStatus.getValue('running')) return;
        if (cstate.lastComm + (30 * 1000) < new Date().getTime()) {
            // We have not talked to the chlorinator in 30 seconds so we have lost communication.
            cstate.status = 128;
            cstate.currentOutput = 0;
            state.emitEquipmentChanges();
        }
        setTimeout(sys.board.chlorinator.setDesiredOutput, 100, cstate);
        if (typeof (chlor.name) === 'undefined') setTimeout(sys.board.chlorinator.requestName, 1000, cstate);
        setTimeout(sys.board.chlorinator.run, 4000, chlor, cstate);
    }

    public setDesiredOutput(cstate: ChlorinatorState) {
        let out = Outbound.create({
            protocol: Protocol.Chlorinator,
            dest: cstate.id,
            action: 17,
            payload: [cstate.setPointForCurrentBody],
            retries: 2,
            response: true,
            onComplete: (err) => {
                if (err) {
                    logger.warn(`error with chlorinator: ${err.message}`);
                }
                else {
                    cstate.currentOutput = cstate.setPointForCurrentBody;
                }
            }
        });
        conn.queueSendMessage(out);
    }

    public ping(cstate: ChlorinatorState) {
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
        };
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
        };
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

    public setSchedule(sched: Schedule | EggTimer, obj?: any) {
        if (typeof obj !== undefined) {
            for (var s in obj)
                sched[s] = obj[s];
        }
    }
    public syncScheduleHeatSourceAndSetpoint(cbody: Body, tbody: BodyTempState) {
        // check schedules to see if we need to adjust heat mode and setpoint.  This will be in effect for the first minute of the schedule
        let schedules: ScheduleState[] = state.schedules.get(true);
        for (let i = 0; i < schedules.length; i++) {
            let sched = schedules[i];
            // check if the id's, min, hour match
            if (sched.circuit === cbody.circuit && sched.isActive && Math.floor(sched.startTime / 60) === state.time.hours && sched.startTime % 60 === state.time.minutes) {
                // check day match next as we need to iterate another array
                // let days = sys.board.valueMaps.scheduleDays.transform(sched.scheduleDays);
                // const days = sys.board.valueMaps.scheduleDays.transform(sched.scheduleDays);
                const days = (sched.scheduleDays as any).days.map(d => d.dow)
                // if scheduleDays includes today
                if (days.includes(state.time.toDate().getDay())) {
                    if (sched.changeHeatSetpoint && (sched.heatSource as any).val !== sys.board.valueMaps.heatSources.getValue('off') && sched.heatSetpoint > 0 && sched.heatSetpoint !== tbody.setPoint) {
                        setTimeout(() => sys.board.bodies.setHeatSetpointAsync(cbody, sched.heatSetpoint), 100);
                    }
                    if ((sched.heatSource as any).val !== sys.board.valueMaps.heatSources.getValue('nochange') && sched.heatSource !== tbody.heatMode) {
                        setTimeout(() => sys.board.bodies.setHeatModeAsync(cbody, sys.board.valueMaps.heatModes.getValue((sched.heatSource as any).name)), 100);
                    }
                }
            }
        };
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
            let changeHeatSetpoint = typeof (data.changeHeatSetpoint !== 'undefined') ? data.changeHeatSetpoint : false;

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
            sched.changeHeatSetpoint = ssched.changeHeatSetpoint = changeHeatSetpoint;
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
    public getInstalledHeaterTypes(body?: number): any {
        let heaters = sys.heaters.get();
        let types = sys.board.valueMaps.heaterTypes.toArray();
        let inst = { total: 0 };
        for (let i = 0; i < types.length; i++) if (types[i].name !== 'none') inst[types[i].name] = 0;
        for (let i = 0; i < heaters.length; i++) {
            let heater = heaters[i];
            if (typeof body !== 'undefined' && heater.body !== 'undefined') {
                if ((heater.body !== 32 && body !== heater.body + 1) || (heater.body === 32 && body > 2)) continue;
            }
            let type = types.find(elem => elem.val === heater.type);
            if (typeof type !== 'undefined') {
                if (inst[type.name] === 'undefined') inst[type.name] = 0;
                inst[type.name] = inst[type.name] + 1;
                inst.total++;
            }
        }
        return inst;
    }
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
    public isHeatPumpInstalled(body?: number): boolean {
        let heaters = sys.heaters.get();
        let types = sys.board.valueMaps.heaterTypes.toArray();
        for (let i = 0; i < heaters.length; i++) {
            let heater = heaters[i];
            if (typeof body !== 'undefined' && body !== heater.body) continue;
            let type = types.find(elem => elem.val === heater.type);
            if (typeof type !== 'undefined') {
                switch (type.name) {
                    case 'heatpump':
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
    public async setHeaterAsync(obj: any): Promise<Heater> {
        return new Promise<Heater>((resolve, reject) => {
            let id = typeof obj.id === 'undefined' ? -1 : parseInt(obj.id, 10);
            if (isNaN(id)) return reject(new InvalidEquipmentIdError('Heater Id is not valid.', obj.id, 'Heater'));
            else if (id < 256 && id > 0) return reject(new InvalidEquipmentIdError('Virtual Heaters controlled by njspc must have an Id > 256.', obj.id, 'Heater'));
            let heater: Heater;
            if (id <= 0) {
                // We are adding a heater.  In this case all heaters are virtual.
                let vheaters = sys.heaters.filter(h => h.isVirtual === true);
                id = vheaters.length + 256;
            }
            heater = sys.heaters.getItemById(id, true);
            if (typeof obj !== undefined) {
                for (var s in obj) {
                    if (s === 'id') continue;
                    heater[s] = obj[s];
                }
            }
            let hstate = state.heaters.getItemById(id, true);
            hstate.isVirtual = heater.isVirtual = true;
            hstate.name = heater.name;
            hstate.type = heater.type;
            resolve(heater);
        });
    }
    public async deleteHeaterAsync(obj: any): Promise<Heater> {
        return new Promise<Heater>((resolve, reject) => {
            let id = parseInt(obj.id, 10);
            if (isNaN(id)) return reject(new InvalidEquipmentIdError('Cannot delete.  Heater Id is not valid.', obj.id, 'Heater'));
            let heater = sys.heaters.getItemById(id);
            heater.isActive = false;
            sys.heaters.removeItemById(id);
            state.heaters.removeItemById(id);
            resolve(heater);
        });
    }
    public updateHeaterServices() {
        let htypes = sys.board.heaters.getInstalledHeaterTypes();
        let solarInstalled = htypes.solar > 0;
        let heatPumpInstalled = htypes.heatpump > 0;
        let gasHeaterInstalled = htypes.gas > 0;
        sys.board.valueMaps.heatModes.set(0, { name: 'off', desc: 'Off' });
        sys.board.valueMaps.heatSources.set(0, { name: 'off', desc: 'Off' });
        if (gasHeaterInstalled) {
            sys.board.valueMaps.heatModes.set(1, { name: 'heater', desc: 'Heater' });
            sys.board.valueMaps.heatSources.set(2, { name: 'heater', desc: 'Heater' });
        }
        else {
            // no heaters (virtual controller)
            sys.board.valueMaps.heatModes.delete(1);
            sys.board.valueMaps.heatSources.delete(2);
        }
        if (solarInstalled && gasHeaterInstalled) {
            sys.board.valueMaps.heatModes.set(2, { name: 'solarpref', desc: 'Solar Preferred' });
            sys.board.valueMaps.heatModes.set(3, { name: 'solar', desc: 'Solar Only' });
            sys.board.valueMaps.heatSources.set(5, { name: 'solarpref', desc: 'Solar Preferred' });
            sys.board.valueMaps.heatSources.set(21, { name: 'solar', desc: 'Solar Only' });
        }
        else if (heatPumpInstalled && gasHeaterInstalled) {
            sys.board.valueMaps.heatModes.set(2, { name: 'heatpumppref', desc: 'Heat Pump Preferred' });
            sys.board.valueMaps.heatModes.set(3, { name: 'heatpump', desc: 'Heat Pump Only' });
            sys.board.valueMaps.heatSources.set(5, { name: 'heatpumppref', desc: 'Heat Pump Preferred' });
            sys.board.valueMaps.heatSources.set(21, { name: 'heatpump', desc: 'Heat Pump Only' });
        }
        else {
            // only gas
            sys.board.valueMaps.heatModes.delete(2);
            sys.board.valueMaps.heatModes.delete(3);
            sys.board.valueMaps.heatSources.delete(5);
            sys.board.valueMaps.heatSources.delete(21);
        }
        sys.board.valueMaps.heatSources.set(32, { name: 'nochange', desc: 'No Change' });
        this.setActiveTempSensors();
    }
    public initTempSensors() {
        // Add in the potential sensors and delete the ones that shouldn't exist.
        let maxPairs = sys.equipment.maxBodies + (sys.equipment.shared ? -1 : 0);
        sys.equipment.tempSensors.getItemById('air', true, { id: 'air', isActive: true, calibration: 0 }).name = 'Air';
        sys.equipment.tempSensors.getItemById('water1', true, { id: 'water1', isActive: true, calibration: 0 }).name = maxPairs == 1 ? 'Water' : 'Body 1';
        sys.equipment.tempSensors.getItemById('solar1', true, { id: 'solar1', isActive: false, calibration: 0 }).name = maxPairs == 1 ? 'Solar' : 'Solar 1';
        if (maxPairs > 1) {
            sys.equipment.tempSensors.getItemById('water2', true, { id: 'water2', isActive: false, calibration: 0 }).name = 'Body 2';
            sys.equipment.tempSensors.getItemById('solar2', true, { id: 'solar2', isActive: false, calibration: 0 }).name = 'Solar 2';
        }
        else {
            sys.equipment.tempSensors.removeItemById('water2');
            sys.equipment.tempSensors.removeItemById('solar2');
        }
        if (maxPairs > 2) {
            sys.equipment.tempSensors.getItemById('water3', true, { id: 'water3', isActive: false, calibration: 0 }).name = 'Body 3';
            sys.equipment.tempSensors.getItemById('solar3', true, { id: 'solar3', isActive: false, calibration: 0 }).name = 'Solar 3';
        }
        else {
            sys.equipment.tempSensors.removeItemById('water3');
            sys.equipment.tempSensors.removeItemById('solar3');
        }
        if (maxPairs > 3) {
            sys.equipment.tempSensors.getItemById('water4', true, { id: 'water4', isActive: false, calibration: 0 }).name = 'Body 4';
            sys.equipment.tempSensors.getItemById('solar4', true, { id: 'solar4', isActive: false, calibration: 0 }).name = 'Solar 4';
        }
        else {
            sys.equipment.tempSensors.removeItemById('water4');
            sys.equipment.tempSensors.removeItemById('solar4');
        }

    }
    // Sets the active temp sensors based upon the installed equipment.  At this point all
    // detectable temp sensors should exist.
    public setActiveTempSensors() {
        let htypes;
        // We are iterating backwards through the sensors array on purpose.  We do this just in case we need
        // to remove a sensor during the iteration.  This way the index values will not be impacted and we can
        // safely remove from the array we are iterating.
        for (let i = sys.equipment.tempSensors.length - 1; i >= 0; i--) {
            let sensor = sys.equipment.tempSensors.getItemByIndex(i);
            // The names are normalized in this array.
            switch (sensor.id) {
                case 'air':
                    sensor.isActive = true;
                    break;
                case 'water1':
                    sensor.isActive = sys.equipment.maxBodies > 0;
                    break;
                case 'water2':
                    sensor.isActive = sys.equipment.shared ? sys.equipment.maxBodies > 2 : sys.equipment.maxBodies > 1;
                    break;
                case 'water3':
                    sensor.isActive = sys.equipment.shared ? sys.equipment.maxBodies > 3 : sys.equipment.maxBodies > 2;
                    break;
                case 'water4':
                    // It's a little weird but technically you should be able to install 3 expansions and a i10D personality
                    // board.  If this situation ever comes up we will see if it works. Whether it reports is another story
                    // since the 2 message is short a byte for this.
                    sensor.isActive = sys.equipment.shared ? sys.equipment.maxBodies > 4 : sys.equipment.maxBodies > 3;
                    break;
                // Solar sensors are funny ducks. This is because they are for both heatpumps and solar and the equipment
                // can be installed on specific bodies.  This will be true for heaters installed in expansion panels for *Touch, dual body systems,
                // and any IntelliCenter with more than one body.  At some point simply implementing the multi-body functions for touch will make
                // this all work. This will only be with i10D or expansion panels.
                case 'solar1':
                    // The first solar sensor is a funny duck in that it should be active for shared systems
                    // if either body has an active solar heater or heatpump.
                    htypes = sys.board.heaters.getInstalledHeaterTypes(1);
                    if ('solar' in htypes || 'heatpump' in htypes) sensor.isActive = true;
                    else if (sys.equipment.shared) {
                        htypes = sys.board.heaters.getInstalledHeaterTypes(2);
                        sensor.isActive = ('solar' in htypes || 'heatpump' in htypes);
                    }
                    else sensor.isActive = false;
                    break;
                case 'solar2':
                    if (sys.equipment.maxBodies > 1 + (sys.equipment.shared ? 1 : 0)) {
                        htypes = sys.board.heaters.getInstalledHeaterTypes(2 + (sys.equipment.shared ? 1 : 0));
                        sensor.isActive = ('solar' in htypes || 'heatpump' in htypes);
                    }
                    else sensor.isActive = false;
                    break;
                case 'solar3':
                    if (sys.equipment.maxBodies > 2 + (sys.equipment.shared ? 1 : 0)) {
                        htypes = sys.board.heaters.getInstalledHeaterTypes(3 + (sys.equipment.shared ? 1 : 0));
                        sensor.isActive = ('solar' in htypes || 'heatpump' in htypes);
                    }
                    else sensor.isActive = false;
                    break;
                case 'solar4':
                    if (sys.equipment.maxBodies > 3 + (sys.equipment.shared ? 1 : 0)) {
                        htypes = sys.board.heaters.getInstalledHeaterTypes(4 + (sys.equipment.shared ? 1 : 0));
                        sensor.isActive = ('solar' in htypes || 'heatpump' in htypes);
                    }
                    else sensor.isActive = false;
                    break;
                default:
                    if (typeof sensor.id === 'undefined') sys.equipment.tempSensors.removeItemByIndex(i);
                    break;
            }
        }
    }
    // This updates the heater states based upon the installed heaters.  This is true for heaters that are tied to the OCP
    // and those that are not.
    public syncHeaterStates() {
        // Go through the installed heaters and bodies to determine whether they should be on.  If there is a
        // heater that is not controlled by the OCP then we need to determine whether it should be on.
        let heaters = sys.heaters.toArray();
        let bodies = state.temps.bodies.toArray();
        let hon = [];
        for (let i = 0; i < bodies.length; i++) {
            let body: BodyTempState = bodies[i];
            let isHeating = false;
            if (body.isOn) {
                for (let j = 0; j < heaters.length; j++) {
                    let heater: Heater = heaters[j];
                    if (heater.isActive === false) continue;
                    let isOn = false;
                    // Determine whether the heater can be used on this body.
                    let isAssociated = false;
                    let b = sys.board.valueMaps.bodies.transform(heater.body);
                    switch (b.name) {
                        case 'body1':
                        case 'pool':
                            if (body.id === 1) isAssociated = true;
                            break;
                        case 'body2':
                        case 'spa':
                            if (body.id === 2) isAssociated = true;
                            break;
                        case 'poolspa':
                            if (body.id === 1 || body.id === 2) isAssociated = true;
                            break;
                        case 'body3':
                            if (body.id === 3) isAssociated = true;
                            break;
                        case 'body4':
                            if (body.id === 4) isAssociated = true;
                            break;
                    }
                    if (isAssociated) {
                        let hstate = state.heaters.getItemById(heater.id, true);
                        let htype = sys.board.valueMaps.heaterTypes.transform(heater.type);
                        let status = sys.board.valueMaps.heatStatus.transform(body.heatStatus);
                        if (heater.isVirtual === true) {
                            // We need to do our own calculation as to whether it is on.
                            let mode = sys.board.valueMaps.heatModes.transform(body.heatMode);
                            switch (htype.name) {
                                case 'solar':
                                    if (mode === 'solar' || mode === 'solarpref') {
                                        // Measure up against start and stop temp deltas for effective solar heating.
                                        if (body.temp < body.setPoint &&
                                            state.temps.solar > body.temp + (hstate.isOn ? heater.stopTempDelta : heater.startTempDelta)) {
                                            isOn = true;
                                            body.heatStatus = sys.board.valueMaps.heatStatus.getValue('solar');
                                        }
                                        else if (heater.coolingEnabled && body.temp > body.setPoint && state.heliotrope.isNight &&
                                            state.temps.solar > body.temp + (hstate.isOn ? heater.stopTempDelta : heater.startTempDelta)) {
                                            isOn = true;
                                            body.heatStatus = sys.board.valueMaps.heatStatus.getValue('cooling');
                                        }

                                        //else if (heater.coolingEnabled && state.time.isNight)
                                    }
                                    break;
                                case 'gas':
                                    if (mode === 'heater') {
                                        if (body.temp < body.setPoint) isOn = true;
                                        body.heatStatus = sys.board.valueMaps.heatStatus.getValue('heater');
                                    }
                                    else if (mode === 'solarpref' || mode === 'heatpumppref') {
                                        // If solar should be running gas heater should be off.
                                        if (body.temp < body.setPoint &&
                                            state.temps.solar > body.temp + (hstate.isOn ? heater.stopTempDelta : heater.startTempDelta)) isOn = false;
                                        else if (body.temp < body.setPoint) {
                                            isOn = true;
                                            body.heatStatus = sys.board.valueMaps.heatStatus.getValue('heater');
                                        }
                                    }
                                    break;
                                case 'heatpump':
                                    if (mode === 'heatpump' || mode === 'heatpumppref') {
                                        if (body.temp < body.setPoint &&
                                            state.temps.solar > body.temp + (hstate.isOn ? heater.stopTempDelta : heater.startTempDelta)) {
                                            isOn = true;
                                            body.heatStatus = sys.board.valueMaps.heatStatus.getValue('heater');
                                        }
                                    }
                                    break;
                                default:
                                    isOn = utils.makeBool(hstate.isOn);
                                    break;
                            }
                        }
                        else if (status.val > 0) {
                            switch (htype.name) {
                                case 'solar':
                                    if (status.name === 'solar') isOn = true;
                                    break;
                                case 'gas':
                                    if (status.name === 'heater') isOn = true;
                                    break;
                                case 'heatpump':
                                    if (status.name === 'heatpump') isOn = true;
                                    break;
                                // TODO: Figure out what needs to be done with ultratemp and hybrid heaters.
                                default:
                                    isOn = utils.makeBool(hstate.isOn);
                                    break;
                            }
                        }
                        hstate.isOn = isOn;
                    }
                    if (isOn === true && typeof hon.find(elem => elem === heater.id) === 'undefined') hon.push(heater.id);
                }
            }
            // When the controller is a virtual one we need to control the heat status ourselves.
            if (!isHeating && sys.controllerType === ControllerType.Virtual) body.heatStatus = 0;
        }
        // Turn off any heaters that should be off.  The code above only turns heaters on.
        for (let i = 0; i < heaters.length; i++) {
            let heater: Heater = heaters[i];
            if (typeof hon.find(elem => elem === heater.id) === 'undefined') {
                let hstate = state.heaters.getItemById(heater.id, true);
                hstate.isOn = false;
            }
        }
    }
}
export class ValveCommands extends BoardCommands {
    public async setValveAsync(obj: any): Promise<Valve> {
        let id = typeof obj.id !== 'undefined' ? parseInt(obj.id, 10) : -1;
        // The following code will make sure we do not encroach on any valves defined by the OCP.
        obj.isVirtual = true;
        if (isNaN(id) || id <= 0) id = Math.max(sys.valves.getMaxId(false), 49) + 1;
        return new Promise<Valve>(function (resolve, reject) {
            if (isNaN(id)) reject(new InvalidEquipmentIdError('Valve Id has not been defined', obj.id, 'Valve'));
            if (id < 50) reject(new InvalidEquipmentDataError('Virtual valves must be defined with an id >= 50.', obj.id, 'Valve'));
            let valve = sys.valves.getItemById(id, true);
            obj.id = id;
            for (var s in obj) valve[s] = obj[s];
            sys.board.valves.syncValveStates();
            resolve(valve);
        });
    }
    public async deleteValveAsync(obj: any): Promise<Valve> {
        let id = parseInt(obj.id, 10);
        // The following code will make sure we do not encroach on any valves defined by the OCP.
        return new Promise<Valve>(function (resolve, reject) {
            if (isNaN(id)) reject(new InvalidEquipmentIdError('Valve Id has not been defined', obj.id, 'Valve'));
            let valve = sys.valves.getItemById(id, false);
            let vstate = state.valves.getItemById(id);
            valve.isActive = false;
            vstate.hasChanged = true;
            vstate.emitEquipmentChange();
            sys.valves.removeItemById(id);
            state.valves.removeItemById(id);

            resolve(valve);
        });
    }

    public syncValveStates() {
        for (let i = 0; i < sys.valves.length; i++) {
            // Run through all the valves to see whether they should be triggered or not.
            let valve = sys.valves.getItemByIndex(i);
            if (valve.circuit > 0) {
                let circ = state.circuits.getInterfaceById(valve.circuit);
                let vstate = state.valves.getItemById(valve.id, true);
                vstate.type = valve.type;
                vstate.name = valve.name;
                vstate.isDiverted = utils.makeBool(circ.isOn);
            }
        }
    }
}
export class ChemControllerCommands extends BoardCommands {
    public async deleteChemControllerAsync(data: any): Promise<ChemController> {
        let id = typeof data.id !== 'undefined' ? parseInt(data.id, 10) : -1;
        if (typeof id === 'undefined' || isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid Chem Controller Id`, id, 'chemController'));
        let chem = sys.chemControllers.getItemById(id);
        if (chem.type === sys.board.valueMaps.chemControllerTypes.getValue('intellichem') && !chem.isVirtual)
            sys.board.virtualChemControllers.stop();
        chem.isActive = false;
        await ncp.chemControllers.removeById(chem.id);
        sys.chemControllers.removeItemById(chem.id);
        state.chemControllers.removeItemById(chem.id);
        
        sys.emitEquipmentChange();
        return Promise.resolve(chem);
    }
    protected async setIntelliChemAsync(data: any): Promise<ChemController> {
        // We will land here whenever the IntelliChem controller is not attached to an IntelliCenter.  Apparently
        // *Touch controllers communicate directly with the IntelliChem controller and the OCP has no play in it.
        try {
            let chem = sys.chemControllers.find(elem => elem.id === data.id);
            let ichemType = sys.board.valueMaps.chemControllerTypes.encode('intellichem');
            if (typeof chem === 'undefined') {
                // We are adding an IntelliChem.  Check to see how many intellichems we have.
                let arr = sys.chemControllers.toArray();
                let count = 0;
                for (let i = 0; i < arr.length; i++) {
                    let cc: ChemController = arr[i];
                    if (cc.type === ichemType) count++;
                }
                if (count >= sys.equipment.maxChemControllers) return Promise.reject(new InvalidEquipmentDataError(`The max number of IntelliChem controllers has been reached: ${sys.equipment.maxChemControllers}`, 'chemController', sys.equipment.maxChemControllers));
                chem = sys.chemControllers.getItemById(data.id);
            }
            let address = typeof data.address !== 'undefined' ? parseInt(data.address, 10) : chem.address;
            if (typeof address === 'undefined' || isNaN(address) || (address < 144 || address > 158)) return Promise.reject(new InvalidEquipmentDataError(`Invalid IntelliChem address`, 'chemController', address));
            if (typeof sys.chemControllers.find(elem => elem.id !== data.id && elem.type === ichemType && elem.address === address) !== 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Invalid IntelliChem address: Address is used on another IntelliChem`, 'chemController', address));

            let pHSetpoint = typeof data.ph.setpoint !== 'undefined' ? parseFloat(data.ph.setpoint) : chem.ph.setpoint;
            let orpSetpoint = typeof data.orp.setpoint !== 'undefined' ? parseInt(data.orp.setpoint, 10) : chem.orp.setpoint;
            let calciumHardness = typeof data.calciumHardness !== 'undefined' ? parseInt(data.calciumHardness, 10) : chem.calciumHardness;
            let cyanuricAcid = typeof data.cyanuricAcid !== 'undefined' ? parseInt(data.cyanuricAcid, 10) : chem.cyanuricAcid;
            let alkalinity = typeof data.alkalinity !== 'undefined' ? parseInt(data.alkalinity, 10) : chem.alkalinity;
            let body = sys.board.bodies.mapBodyAssociation(typeof data.body === 'undefined' ? chem.body : data.body);
            if (typeof body === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Invalid body assignment`, 'chemController', data.body || chem.body));
            // Do a final validation pass so we dont send this off in a mess.
            if (isNaN(pHSetpoint)) return Promise.reject(new InvalidEquipmentDataError(`Invalid pH Setpoint`, 'chemController', pHSetpoint));
            if (isNaN(orpSetpoint)) return Promise.reject(new InvalidEquipmentDataError(`Invalid orp Setpoint`, 'chemController', orpSetpoint));
            if (isNaN(calciumHardness)) return Promise.reject(new InvalidEquipmentDataError(`Invalid calcium hardness`, 'chemController', calciumHardness));
            if (isNaN(cyanuricAcid)) return Promise.reject(new InvalidEquipmentDataError(`Invalid cyanuric acid`, 'chemController', cyanuricAcid));
            if (isNaN(alkalinity)) return Promise.reject(new InvalidEquipmentDataError(`Invalid alkalinity`, 'chemController', alkalinity));
            let schem = state.chemControllers.getItemById(chem.id);
            schem.ph.tank.capacity = schem.orp.tank.capacity = chem.ph.tank.capacity = chem.orp.tank.capacity = 6;
            schem.ph.tank.units = schem.orp.tank.units = chem.ph.tank.units = chem.orp.tank.units = '';
            let orpTankLevel = typeof data.orp !== 'undefined' && typeof data.orp.tank !== 'undefined' ? parseInt(data.orp.tank.level, 10) : schem.orp.tank.level;
            let acidTankLevel = typeof data.ph !== 'undefined' && typeof data.ph.tank !== 'undefined' ? parseInt(data.ph.tank.level, 10) : schem.ph.tank.level;
            if (isNaN(orpTankLevel)) return Promise.reject(new InvalidEquipmentDataError(`Invalid orp tank level`, 'chemController', orpTankLevel));
            if (isNaN(acidTankLevel)) return Promise.reject(new InvalidEquipmentDataError(`Invalid orp tank level`, 'chemController', acidTankLevel));

            await new Promise((resolve, reject) => {
                let out = Outbound.create({
                    dest: chem.address,
                    source: 16, // ic doesn't seem to like msgs coming from 33
                    action: 146,
                    payload: [],
                    retries: 1,
                    response: true,
                    protocol: Protocol.IntelliChem,
                    onComplete: (err, msg) => {
                        if (err) {
                            if (typeof data.isVirtual !== 'undefined' && !data.isVirtual) chem.isVirtual = true;  // if we set virtual, but it failed, set it back
                            reject(err);
                        }
                        else {
                            chem = sys.chemControllers.getItemById(data.id, true);
                            // Setting the master makes sure the proper xCP is in control.
                            chem.master = sys.board.equipmentMaster;
                            schem = state.chemControllers.getItemById(data.id, true);
                            chem.type = sys.board.valueMaps.chemControllerTypes.encode('intellichem');
                            chem.ph.setpoint = pHSetpoint;
                            chem.orp.setpoint = orpSetpoint;
                            chem.calciumHardness = calciumHardness;
                            chem.alkalinity = alkalinity;
                            schem.ph.tank.level = acidTankLevel;
                            schem.orp.tank.level = orpTankLevel;
                            chem.cyanuricAcid = typeof data.cyanuricAcid !== 'undefined' ? parseInt(data.cyanuricAcid, 10) : chem.cyanuricAcid;
                            chem.isActive = schem.isActive = true;
                            resolve(); // let IntelliChem status packet set values
                        }
                    }
                });
                out.insertPayloadBytes(0, 0, 21);
                out.setPayloadByte(0, Math.floor((pHSetpoint * 100) / 256) || 0);
                out.setPayloadByte(1, Math.round((pHSetpoint * 100) % 256) || 0);
                out.setPayloadByte(2, Math.floor(orpSetpoint / 256) || 0);
                out.setPayloadByte(3, Math.round(orpSetpoint % 256) || 0);
                out.setPayloadByte(4, acidTankLevel);
                out.setPayloadByte(5, orpTankLevel);
                out.setPayloadByte(6, Math.floor(calciumHardness / 256) || 0);
                out.setPayloadByte(7, Math.round(calciumHardness % 256) || 0);
                out.setPayloadByte(9, parseInt(data.cyanuricAcid, 10), chem.cyanuricAcid || 0);
                out.setPayloadByte(10, Math.floor(alkalinity / 256) || 0);
                out.setPayloadByte(12, Math.round(alkalinity % 256) || 0);
                // out.setPayloadByte(12, 20);  // fixed value?
                conn.queueSendMessage(out);
            });
            chem = sys.chemControllers.getItemById(data.id);
            return Promise.resolve(chem);
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setChemControllerAsync(data: any): Promise<ChemController> {
        // IntelliChem controllers on *Touch do not have a special message structure like you would find for IntelliChlor or any other piece of
        // equipment.  Apparently, this is controlled by communicating with IntelliChem directly.  It does this regardless of whether IntelliChem is
        // enabled in the equipment.  NOTE: This may not be true with IntelliTouch as it does have a menu to enable/disable IntelliChem, I could not
        // find a reference to such a setting in EasyTouch.

        // The following are the rules related to when an OCP is present.
        // ==============================================================
        // 1. IntelliChem cannot be controlled/polled via Nixie, since there is no enable/disable from the OCP at this point we don't know who is in control of polling.
        // 2. With *Touch Commands will be sent directly to the IntelliChem controller in the hopes that the OCP will pick it up. (This may not be right).
        // 3. njspc will communicate to the OCP for IntelliChem control via the configuration interface.

        // The following are the rules related to when no OCP is present.
        // =============================================================
        // 1. All chemControllers will be controlled via Nixie (IntelliChem, REM Chem).
        try {
            // We could be adding here so create athe appropriate logic to add a chem controller if we need to.  THIS DOES NOT DELETE!
            // The other thing this does not do is change an existing type to another type.
            let address = typeof data.address !== 'undefined' ? parseInt(data.address, 10) : undefined;
            let id = typeof data.id !== 'undefined' ? parseInt(data.id, 10) : -1;
            let chem: ChemController;
            let type;
            let isAdd = false;
            if (id > 0) {
                chem = sys.chemControllers.find(elem => elem.id === id);
                address = typeof data.address !== 'undefined' ? parseInt(data.address, 10) : chem.address;
                if (typeof chem !== 'undefined') {
                    type = chem.type;
                }
                else {
                    data.id = id; // We are adding a chem controller at the specified id.
                    isAdd = true;
                }
            }
            else if (address > 0) {
                chem = sys.chemControllers.find(elem => elem.address === address);
                if (typeof chem !== 'undefined') {
                    data.id = chem.id;
                    type = chem.type;
                }
                else {
                    data.address = address;
                    isAdd = true;
                }
            }
            else {
                isAdd = true;
            }
            if (isAdd) {
                // Alright we are adding here.  So the type must be defined.  From here on out the determination as to whether
                // this is an add will be based upon finding the id in the chemControllers array.
                type = sys.board.valueMaps.chemControllerTypes.encode(parseInt(data.type, 10), undefined);
                isAdd = true;
                data.id = (sys.chemControllers.getMaxId() || 0) + 1;
                chem = sys.chemControllers.getItemById(data.id);
            }
            if (typeof type === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`The chem controller type could not be determined ${data.type || type}`, 'chemController', type));
            else if (sys.board.valueMaps.chemControllerTypes.getName(type) === 'intellichem') return await this.setIntelliChemAsync(data);
            chem = sys.chemControllers.getItemById(data.id, true);
            await ncp.chemControllers.setControllerAsync(chem, data);


            /*
            // So now we are down to the nitty gritty setting the data for the REM or Homegrown Chem controller.
            let calciumHardness = typeof data.calciumHardness !== 'undefined' ? parseInt(data.calciumHardness, 10) : chem.calciumHardness;
            let cyanuricAcid = typeof data.cyanuricAcid !== 'undefined' ? parseInt(data.cyanuricAcid, 10) : chem.cyanuricAcid;
            let alkalinity = typeof data.alkalinity !== 'undefined' ? parseInt(data.alkalinity, 10) : chem.alkalinity;
            let body = sys.board.bodies.mapBodyAssociation(typeof data.body === 'undefined' ? chem.body : data.body);
            if (typeof body === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Invalid body assignment`, 'chemController', data.body || chem.body));
            // Do a final validation pass so we dont send this off in a mess.
            if (isNaN(calciumHardness)) return Promise.reject(new InvalidEquipmentDataError(`Invalid calcium hardness`, 'chemController', calciumHardness));
            if (isNaN(cyanuricAcid)) return Promise.reject(new InvalidEquipmentDataError(`Invalid cyanuric acid`, 'chemController', cyanuricAcid));
            if (isNaN(alkalinity)) return Promise.reject(new InvalidEquipmentDataError(`Invalid alkalinity`, 'chemController', alkalinity));
            let schem = state.chemControllers.getItemById(chem.id, true);
            chem.address = address;
            chem.calciumHardness = calciumHardness;
            chem.cyanuricAcid = cyanuricAcid;
            chem.alkalinity = alkalinity;
            chem.body = body;
            schem.name = chem.name = data.name || chem.name || `Chem Controller ${chem.id}`;
            schem.type = chem.type = type;
            schem.isActive = chem.isActive = true;
            // Alright we are down to the equipment items all validation should have been completed by now.
           

            // ORP Settings
            if (typeof data.orp !== 'undefined') {
                // ORP Probe: The data here is read only so we are not calling out to equipment.
                chem.orp.useChlorinator = typeof data.orp.useChlorinator !== 'undefined' ? utils.makeBool(data.orp.useChlorinator) : chem.orp.useChlorinator;
                chem.orp.dosingMethod = typeof data.orp.dosingMethod !== 'undefined' ? data.orp.dosingMethod : chem.orp.dosingMethod;
                chem.orp.enabled = typeof data.orp.enabled !== 'undefined' ? utils.makeBool(data.orp.enabled) : chem.orp.enabled;
                if (typeof data.orp.mixingTimeHours !== 'undefined' || typeof data.orp.mixingTimeMinutes !== 'undefined') {
                    data.orp.mixingTime = (typeof data.orp.mixingTimeHours !== 'undefined' ? parseInt(data.orp.mixingTimeHours, 10) * 3600 : 0) +
                        (typeof data.orp.mixingTimeMinutes !== 'undefined' ? parseInt(data.orp.mixingTimeMinutes, 10) * 60 : 0) +
                            (typeof data.orp.mixingTimeSeconds !== 'undefined' ? parseInt(data.orp.mixingTimeSeconds, 10) : 0);
                }
                if (typeof data.orp.maxDosingTimeHours !== 'undefined' || typeof data.orp.maxDosingTimeMinutes !== 'undefined') {
                    data.orp.maxDosingTime = (typeof data.orp.maxDosingTimeHours !== 'undefined' ? parseInt(data.orp.maxDosingTimeHours, 10) * 3600 : 0) +
                        (typeof data.orp.maxDosingTimeMinutes !== 'undefined' ? parseInt(data.orp.maxDosingTimeMinutes, 10) * 60 : 0) +
                            (typeof data.orp.maxDosingTimeSeconds !== 'undefined' ? parseInt(data.orp.maxDosingTimeSeconds, 10) : 0);
                }

                chem.orp.maxDosingTime = typeof data.orp.maxDosingTime !== 'undefined' ? parseInt(data.orp.maxDosingTime, 10) : chem.orp.maxDosingTime;
                chem.orp.maxDosingVolume = typeof data.orp.maxDosingVolume !== 'undefined' ? parseInt(data.orp.maxDosingVolume, 10) : chem.orp.maxDosingVolume;
                chem.orp.mixingTime = typeof data.orp.mixingTime !== 'undefined' ? parseInt(data.orp.mixingTime, 10) : chem.orp.mixingTime;
                chem.orp.setpoint = typeof data.orp.setpoint !== 'undefined' ? parseInt(data.orp.setpoint, 10) : chem.orp.setpoint;
                chem.orp.startDelay = typeof data.orp.startDelay !== 'undefined' ? parseFloat(data.orp.startDelay) : chem.orp.startDelay;
                if (typeof data.orp.probe !== 'undefined') {
                    schem.orp.probe.level = typeof data.orp.probe.level !== 'undefined' ? parseFloat(data.orp.probe.level) : schem.orp.probe.level;
                    schem.orp.probe.saltLevel = typeof data.orp.probe.saltLevel !== 'undefined' ? parseFloat(data.orp.probe.saltLevel) : schem.orp.probe.saltLevel;
                    chem.orp.probe.connectionId = typeof data.orp.probe.connectionId !== 'undefined' ? data.orp.probe.connectionId : chem.orp.probe.connectionId;
                    chem.orp.probe.deviceBinding = typeof data.orp.probe.deviceBinding !== 'undefined' ? data.orp.probe.deviceBinding : chem.orp.probe.deviceBinding;
                }
                // ORP Tank: The data here is potentially not read only.  We may be telling REM to set the pump tank data.
                if (typeof data.orp.tank !== 'undefined') {
                    schem.orp.tank.level = typeof data.orp.tank.level !== 'undefined' ? parseFloat(data.orp.tank.level) : schem.orp.tank.level;
                    chem.orp.tank.capacity = schem.orp.tank.capacity = typeof data.orp.tank.capacity !== 'undefined' ? parseFloat(data.orp.tank.capacity) : schem.orp.tank.capacity;
                    chem.orp.tank.units = schem.orp.tank.units = typeof data.orp.tank.units !== 'undefined' ? sys.board.valueMaps.volumeUnits.encode(data.orp.tank.units) : chem.orp.tank.units;
                }
                if (typeof data.orp.pump !== 'undefined') {
                    chem.orp.pump.enabled = typeof data.orp.pump.enabled !== 'undefined' ? data.orp.pump.enabled : chem.orp.pump.enabled;
                    chem.orp.pump.type = typeof data.orp.pump.type !== 'undefined' ? data.orp.pump.type : chem.orp.pump.type;
                    chem.orp.pump.ratedFlow = typeof data.orp.pump.ratedFlow !== 'undefined' ? data.orp.pump.ratedFlow : chem.orp.pump.ratedFlow;
                    chem.orp.pump.connectionId = typeof data.orp.pump.connectionId !== 'undefined' ? data.orp.pump.connectionId : chem.orp.pump.connectionId;
                    chem.orp.pump.deviceBinding = typeof data.orp.pump.deviceBinding !== 'undefined' ? data.orp.pump.deviceBinding : chem.orp.pump.deviceBinding;
                }
                if (typeof data.orp.probe !== 'undefined') {
                    chem.orp.probe.type = typeof data.orp.probe.type !== 'undefined' ? data.orp.probe.type : chem.orp.probe.type;
                    chem.orp.probe.connectionId = typeof data.orp.probe.connectionId !== 'undefined' ? data.orp.probe.connectionId : chem.orp.probe.connectionId;
                    chem.orp.probe.deviceBinding = typeof data.orp.probe.deviceBinding !== 'undefined' ? data.orp.probe.deviceBinding : chem.orp.probe.deviceBinding;
                }
            }
            if (typeof data.ph !== 'undefined') {
                chem.ph.dosingMethod = typeof data.ph.dosingMethod !== 'undefined' ? data.ph.dosingMethod : chem.ph.dosingMethod;
                chem.ph.enabled = typeof data.ph.enabled !== 'undefined' ? utils.makeBool(data.ph.enabled) : chem.ph.enabled;
                if (typeof data.ph.mixingTimeHours !== 'undefined' || typeof data.ph.mixingTimeMinutes !== 'undefined') {
                    data.ph.mixingTime = (typeof data.ph.mixingTimeHours !== 'undefined' ? parseInt(data.ph.mixingTimeHours, 10) * 3600 : 0) +
                        (typeof data.ph.mixingTimeMinutes !== 'undefined' ? parseInt(data.ph.mixingTimeMinutes, 10) * 60 : 0) +
                            (typeof data.ph.mixingTimeSeconds !== 'undefined' ? parseInt(data.ph.mixingTimeSeconds, 10) : 0);
                }
                if (typeof data.ph.maxDosingTimeHours !== 'undefined' || typeof data.ph.maxDosingTimeMinutes !== 'undefined') {
                    data.ph.maxDosingTime = (typeof data.ph.maxDosingTimeHours !== 'undefined' ? parseInt(data.ph.maxDosingTimeHours, 10) * 3600 : 0)
                        + (typeof data.ph.maxDosingTimeMinutes !== 'undefined' ? parseInt(data.ph.maxDosingTimeMinutes, 10) * 60 : 0)
                            + (typeof data.ph.maxDosingTimeSeconds !== 'undefined' ? parseInt(data.ph.maxDosingTimeSeconds, 10) : 0);
                }

                chem.ph.maxDosingTime = typeof data.ph.maxDosingTime !== 'undefined' ? parseInt(data.ph.maxDosingTime, 10) : chem.ph.maxDosingTime;
                chem.ph.maxDosingVolume = typeof data.ph.maxDosingVolume !== 'undefined' ? parseInt(data.ph.maxDosingVolume, 10) : chem.ph.maxDosingVolume;
                chem.ph.mixingTime = typeof data.ph.mixingTime !== 'undefined' ? parseInt(data.ph.mixingTime, 10) : chem.ph.mixingTime;
                chem.ph.setpoint = typeof data.ph.setpoint !== 'undefined' ? parseFloat(data.ph.setpoint) : chem.ph.setpoint;
                chem.ph.phSupply = typeof data.ph.phSupply !== 'undefined' ? data.ph.phSupply : chem.ph.phSupply;
                chem.ph.startDelay = typeof data.ph.startDelay !== 'undefined' ? parseFloat(data.ph.startDelay) : chem.ph.startDelay;
                // pH Probe: the data here is read only so we are not calling out to equipment.
                if (typeof data.ph.probe !== 'undefined') {
                    schem.ph.probe.level = typeof data.ph.probe.level !== 'undefined' ? parseFloat(data.ph.probe.level) : schem.ph.probe.level;
                    schem.ph.probe.temperature = typeof data.ph.probe.temperature !== 'undefined' ? parseFloat(data.ph.probe.temperature) : schem.ph.probe.temperature;
                    schem.ph.probe.tempUnits = typeof data.ph.probe.tempUnits !== 'undefined' ? data.ph.probe.tempUnits : schem.ph.probe.tempUnits;
                    chem.ph.probe.connectionId = typeof data.ph.probe.connectionId !== 'undefined' ? data.ph.probe.connectionId : chem.ph.probe.connectionId;
                    chem.ph.probe.deviceBinding = typeof data.ph.probe.deviceBinding !== 'undefined' ? data.ph.probe.deviceBinding : chem.ph.probe.deviceBinding;
                }
                // Acid Tank: The data here is potentially not read only.  We may be telling REM to set the pump tank data.
                if (typeof data.ph.tank !== 'undefined') {
                    schem.ph.tank.level = typeof data.ph.tank.level !== 'undefined' ? parseFloat(data.ph.tank.level) : schem.ph.tank.level;
                    chem.ph.tank.capacity = schem.ph.tank.capacity = typeof data.ph.tank.capacity !== 'undefined' ? parseFloat(data.ph.tank.capacity) : schem.ph.tank.capacity;
                    chem.ph.tank.units = schem.ph.tank.units = typeof data.ph.tank.units !== 'undefined' ? sys.board.valueMaps.volumeUnits.encode(data.ph.tank.units) : chem.ph.tank.units;
                }
                if (typeof data.ph.pump !== 'undefined') {
                    chem.ph.pump.enabled = typeof data.ph.pump.enabled !== 'undefined' ? data.ph.pump.enabled : chem.ph.pump.enabled;
                    chem.ph.pump.type = typeof data.ph.pump.type !== 'undefined' ? data.ph.pump.type : chem.ph.pump.type;
                    chem.ph.pump.ratedFlow = typeof data.ph.pump.ratedFlow !== 'undefined' ? data.ph.pump.ratedFlow : chem.ph.pump.ratedFlow;
                    chem.ph.pump.connectionId = typeof data.ph.pump.connectionId !== 'undefined' ? data.ph.pump.connectionId : chem.ph.pump.connectionId;
                    chem.ph.pump.deviceBinding = typeof data.ph.pump.deviceBinding !== 'undefined' ? data.ph.pump.deviceBinding : chem.ph.pump.deviceBinding;
                }
                if (typeof data.ph.probe !== 'undefined') {
                    chem.ph.probe.type = typeof data.ph.probe.type !== 'undefined' ? data.ph.probe.type : chem.ph.probe.type;
                    chem.ph.probe.connectionId = typeof data.ph.probe.connectionId !== 'undefined' ? data.ph.probe.connectionId : chem.ph.probe.connectionId;
                    chem.ph.probe.deviceBinding = typeof data.ph.probe.deviceBinding !== 'undefined' ? data.ph.probe.deviceBinding : chem.ph.probe.deviceBinding;
                }
                
            }
            */
            return Promise.resolve(chem);
        }
        catch (err) { return Promise.reject(err); }

        //return new Promise<ChemController>(async (resolve, reject) => {
        //    // this is a combined chem config/state setter.  
        //    let address = typeof data.address !== 'undefined' ? parseInt(data.address, 10) : -1;
        //    let id = typeof data.id !== 'undefined' ? parseInt(data.id, 10) : -1;
        //    let chem: ChemController;
        //    if (id > 0) {
        //        chem = sys.chemControllers.getItemById(id);
        //    }
        //    let isAdd = false;
        //    if (id <= 0) {
        //        // adding a chem controller
        //        id = sys.chemControllers.nextAvailableChemController();
        //        isAdd = true;               
        //    }
        //    if (isAdd && sys.chemControllers.length >= sys.equipment.maxChemControllers) return Promise.reject(new InvalidEquipmentIdError(`Max chem controller id exceeded`, id, 'chemController'));
        //    if (typeof address !== 'undefined' && address < 144 || address > 158) return Promise.reject(new InvalidEquipmentIdError(`Max chem controller id exceeded`, id, 'chemController'));
        //    if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid chemController id: ${data.id}`, data.id, 'ChemController'));

        //    if (typeof address !== 'undefined') chem = sys.chemControllers.getItemByAddress(address, true);
        //    else chem = sys.chemControllers.getItemById(id, true);
        //    let schem = state.chemControllers.getItemById(chem.id, true);

        //    // Before we send an outbound ic packet, check if we are deleting this controller
        //    if (typeof data.type !== 'undefined' && data.type === 0) {
        //        // remove
        //        schem.isActive = chem.isActive = false;
        //        sys.chemControllers.removeItemById(chem.id);
        //        state.chemControllers.removeItemById(chem.id);
        //        sys.emitEquipmentChange();
        //        return Promise.resolve(chem);
        //    }
        //    // and check to see if we are changing TO an intellichem or AWAY from an intellichem
        //    schem.type = chem.type = parseInt(data.type, 10) || chem.type || 1;
        //    if (typeof data.isActive !== 'undefined') chem.isActive = data.isActive;
        //    else if (typeof chem.isActive === 'undefined') chem.isActive = true;
        //    if (typeof data.isVirtual !== 'undefined') chem.isVirtual = data.isVirtual;
        //    else if (typeof chem.isVirtual === 'undefined') chem.isVirtual = true;
        //    schem.name = chem.name = data.name || chem.name || `Chem Controller ${chem.id}`;
        //    if (chem.type === sys.board.valueMaps.chemControllerTypes.getValue('intellichem') && !chem.isVirtual ||
        //        chem.type !== sys.board.valueMaps.chemControllerTypes.getValue('intellichem')) schem.virtualControllerStatus = -1;
        //    // if we have an IntelliChem, set the values here and let the status 
        //    let phSetpoint = typeof data.ph !== 'undefined' ? parseFloat(data.ph.setpoint) : parseFloat(data.pHSetpoint);
        //    if (isNaN(phSetpoint)) phSetpoint = chem.ph.setpoint || 400;
        //    let orpSetpoint = typeof data.orp !== 'undefined' ? parseFloat(data.orp.setpoint) : parseFloat(data.orpSetpoint);
        //    if (isNaN(orpSetpoint)) orpSetpoint = chem.orp.setpoint || 7.2;
        //    let acidTankLevel = typeof data.ph !== 'undefined' && typeof data.ph.tank !== 'undefined' ? parseInt(data.ph.tank.level, 10) : parseInt(data.acidTankLevel, 10);
        //    let orpTankLevel = typeof data.orp !== 'undefined' && typeof data.orp.tank !== 'undefined' ? parseInt(data.orp.tank.level, 10) : parseInt(data.orpTankLevel, 10);
        //    if (isNaN(acidTankLevel)) acidTankLevel = schem.ph.tank.level || 0;
        //    if (isNaN(orpTankLevel)) orpTankLevel = schem.orp.tank.level || 0;

        //    if (chem.type === sys.board.valueMaps.chemControllerTypes.getValue('intellichem') && !chem.isVirtual) {
        //        sys.board.virtualChemControllers.start();
        //        phSetpoint = Math.floor(phSetpoint * 100);

        //        //const _ph = (typeof data.pHSetpoint !== 'undefined' ? parseFloat(data.pHSetpoint) : chem.ph.setpoint) * 100;
        //        //const _orp = (typeof data.orpSetpoint !== 'undefined' ? parseInt(data.orpSetpoint, 10) : chem.ph.setpoint);
        //        const _ch = (typeof data.calciumHardness !== 'undefined' ? parseInt(data.calciumHardness, 10) : chem.calciumHardness);
        //        const _alk = (typeof data.alkalinity !== 'undefined' ? parseInt(data.alkalinity, 10) : chem.alkalinity);

        //        // RKS TODO CHEM: Have to go through this to continue to support the old format for now.
        //        chem.ph.tank.capacity = 6;
        //        chem.ph.tank.units = '';
        //        acidTankLevel = Math.min(Math.max(acidTankLevel, 0), chem.ph.tank.capacity);
        //        try {
        //            await new Promise((_resolve, _reject) => {
        //                let out = Outbound.create({
        //                    dest: chem.address,
        //                    source: 16, // ic doesn't seem to like msgs coming from 33
        //                    action: 146,
        //                    payload: [],
        //                    retries: 1,
        //                    response: true,
        //                    protocol: Protocol.IntelliChem,
        //                    onComplete: (err, msg) => {
        //                        if (err) {
        //                            if (typeof data.isVirtual !== 'undefined' && !data.isVirtual) chem.isVirtual = true;  // if we set virtual, but it failed, set it back
        //                            _reject(err);
        //                        }
        //                        else {
        //                            chem.ph.setpoint = phSetpoint / 100;
        //                            chem.orp.setpoint = orpSetpoint;
        //                            chem.calciumHardness = _ch;
        //                            chem.alkalinity = _alk;
        //                            schem.ph.tank.level = acidTankLevel;
        //                            schem.orp.tank.level = orpTankLevel;
        //                            //schem.acidTankLevel = Math.max(typeof data.acidTankLevel !== 'undefined' ? parseInt(data.acidTankLevel, 10) : schem.acidTankLevel, 0);
        //                            //schem.orpTankLevel = Math.max(typeof data.orpTankLevel !== 'undefined' ? parseInt(data.orpTankLevel, 10) : schem.orpTankLevel, 0);
        //                            chem.cyanuricAcid = typeof data.cyanuricAcid !== 'undefined' ? parseInt(data.cyanuricAcid, 10) : chem.cyanuricAcid;
        //                            chem.isActive = schem.isActive = true;
        //                            _resolve(); // let IntelliChem status packet set values
        //                        }
        //                    }
        //                });
        //                out.insertPayloadBytes(0, 0, 21);
        //                out.setPayloadByte(0, Math.floor(phSetpoint / 256) || 0);
        //                out.setPayloadByte(1, Math.round(phSetpoint % 256) || 0);
        //                out.setPayloadByte(2, Math.floor(orpSetpoint / 256) || 0);
        //                out.setPayloadByte(3, Math.round(orpSetpoint % 256) || 0);
        //                out.setPayloadByte(4, acidTankLevel);
        //                out.setPayloadByte(5, orpTankLevel);
        //                out.setPayloadByte(6, Math.floor(_ch / 256) || 0);
        //                out.setPayloadByte(7, Math.round(_ch % 256) || 0);
        //                out.setPayloadByte(9, parseInt(data.cyanuricAcid, 10), chem.cyanuricAcid || 0);
        //                out.setPayloadByte(10, Math.floor(_alk / 256) || 0);
        //                out.setPayloadByte(12, Math.round(_alk % 256) || 0);
        //                // out.setPayloadByte(12, 20);  // fixed value?
        //                conn.queueSendMessage(out);
        //            })
        //            resolve(chem); // return Promise to API
        //        }
        //        catch (err) { reject(err); }
        //    }
        //    else {
        //        let useChlorinator = chem.orp.useChlorinator;
        //        if (typeof data.orp !== 'undefined' && typeof data.orp.useChlorinator !== 'undefined') useChlorinator = utils.makeBool(data.orp.useChlorinator);
        //        else if (typeof data.isIntelliChlorUsed !== 'undefined') useChlorinator = utils.makeBool(data.isIntelliChlorUsed);
        //        chem.orp.useChlorinator = useChlorinator;
        //        // config data
        //        if (typeof data.calciumHardness !== 'undefined') chem.calciumHardness = parseInt(data.calciumHardness, 10);
        //        if (typeof data.cyanuricAcid !== 'undefined') chem.cyanuricAcid = parseInt(data.cyanuricAcid, 10);
        //        if (typeof data.alkalinity !== 'undefined') chem.alkalinity = parseInt(data.alkalinity, 10);
        //        chem.body = data.body || chem.body || 32;
        //        chem.address = parseInt(data.address, 10) || chem.address || (chem.id + 143);
        //        chem.ph.setpoint = phSetpoint;
        //        chem.orp.setpoint = orpSetpoint;
        //        let phSupply = typeof data.ph !== 'undefined' ?
        //            sys.board.valueMaps.phSupplyTypes.encode(data.ph.phSupply, -1) :
        //            typeof data.isAcidBaseDosing !== 'undefined' ? sys.board.valueMaps.phSupplyTypes.encode(utils.makeBool(data.isAcidBaseDosing) ? 1 : 0, -1) : chem.ph.phSupply;
        //        chem.ph.phSupply = phSupply;


        //        //if (typeof data.pHSetpoint !== 'undefined') chem.ph.setpoint = parseFloat(data.pHSetpoint);
        //        //if (typeof data.orpSetpoint !== 'undefined') chem.orp.setpoint = parseInt(data.orpSetpoint, 10);
        //        if (typeof data.pHManualDosing !== 'undefined') schem.ph.manualDosing = utils.makeBool(data.pHManualDosing);
        //        //if (typeof data.isIntelliChlorUsed !== 'undefined') chem.isIntelliChlorUsed = utils.makeBool(data.isIntelliChlorUsed);
        //        if (typeof data.HMIAdvancedDisplay !== 'undefined') chem.HMIAdvancedDisplay = utils.makeBool(data.HMIAdvancedDisplay);
        //        //if (typeof data.isAcidBaseDosing !== 'undefined') chem.isAcidBaseDosing = utils.makeBool(data.isAcidBaseDosing);
        //        // state data
        //        const alarms = data.alarms
        //        if (typeof alarms !== 'undefined') {
        //            if (typeof alarms.flow !== 'undefined') schem.alarms.flow = parseInt(alarms.flow, 10);
        //            if (typeof alarms.pH !== 'undefined') schem.alarms.pH = parseInt(alarms.pH, 10);
        //            if (typeof alarms.orp !== 'undefined') schem.alarms.orp = parseInt(alarms.orp, 10);
        //            if (typeof alarms.pHTank !== 'undefined') schem.alarms.pHTank = parseInt(alarms.pHTank, 10);
        //            if (typeof alarms.orpTank !== 'undefined') schem.alarms.orpTank = parseInt(alarms.orpTank, 10);
        //            if (typeof alarms.probeFault !== 'undefined') schem.alarms.probeFault = parseInt(alarms.probeFault, 10);
        //        }
        //        const warnings = data.warnings
        //        if (typeof warnings !== 'undefined') {
        //            if (typeof warnings.waterChemistry !== 'undefined') schem.warnings.waterChemistry = parseInt(warnings.waterChemistry, 10);
        //            if (typeof warnings.pHLockout !== 'undefined') schem.warnings.pHLockout = parseInt(warnings.pHLockout, 10);
        //            if (typeof warnings.pHDailyLimitReached !== 'undefined') schem.warnings.pHDailyLimitReached = parseInt(warnings.pHDailyLimitReached, 10);
        //            if (typeof warnings.orpDailyLimitReached !== 'undefined') schem.warnings.orpDailyLimitReached = parseInt(warnings.orpDailyLimitReached, 10);
        //            if (typeof warnings.invalidSetup !== 'undefined') schem.warnings.invalidSetup = parseInt(warnings.invalidSetup, 10);
        //            if (typeof warnings.chlorinatorCommError !== 'undefined') schem.warnings.chlorinatorCommError = parseInt(warnings.chlorinatorCommError, 10);

        //        }
        //        //if (typeof data.pHLevel !== 'undefined') schem.pHLevel = parseFloat(data.pHLevel);
        //        //if (typeof data.orpLevel !== 'undefined') schem.orpLevel = parseFloat(data.orpLevel);
        //        //if (typeof data.saltLevel !== 'undefined') schem.saltLevel = parseInt(data.saltLevel, 10);
        //        //else if (sys.chlorinators.getItemById(1).isActive) schem.saltLevel = state.chlorinators.getItemById(1).saltLevel;
        //        // if (typeof data.waterFlow !== 'undefined') schem.waterFlow = parseInt(data.waterFlow);
        //        // RKS CHEM: Only doing this to support old clients.  This should change.
        //        let phLevel = typeof data.ph !== 'undefined' && typeof data.ph.probe !== 'undefined' ? parseFloat(data.ph.probe.level) : parseFloat(data.pHLevel);
        //        if (isNaN(phLevel)) schem.ph.probe.level = phLevel;
        //        let orpLevel = typeof data.orp !== 'undefined' && typeof data.orp.probe.level !== 'undefined' ? parseFloat(data.orp.probe.level) : parseFloat(data.orpLevel);
        //        if (isNaN(orpLevel)) schem.orp.probe.level = orpLevel;

        //        let acidTankLevel = typeof data.ph !== 'undefined' && typeof data.ph.tank !== 'undefined' ? parseInt(data.ph.tank.level, 10) : parseInt(data.acidTankLevel, 10);
        //        let orpTankLevel = typeof data.orp !== 'undefined' && typeof data.orp.tank !== 'undefined' ? parseInt(data.orp.tank.level, 10) : parseInt(data.orpTankLevel, 10);
        //        if (!isNaN(acidTankLevel)) schem.ph.tank.level = Math.max(0, Math.min(chem.ph.tank.capacity, acidTankLevel));
        //        if (!isNaN(orpTankLevel)) schem.orp.tank.level = Math.max(0, Math.min(chem.orp.tank.capacity, orpTankLevel));

        //        let saltLevel = typeof data.orp !== 'undefined' && typeof data.orp.probe !== 'undefined' ? parseFloat(data.orp.probe.saltLevel) : parseFloat(data.saltLevel);
        //        if (isNaN(saltLevel)) saltLevel = sys.chlorinators.getItemById(1).isActive ? saltLevel = state.chlorinators.getItemById(1).saltLevel : schem.orp.probe.saltLevel;
        //        schem.orp.probe.saltLevel = saltLevel;


        //        //if (typeof data.acidTankLevel !== 'undefined') schem.acidTankLevel = Math.max(parseInt(data.acidTankLevel, 10), 0);
        //        //if (typeof data.orpTankLevel !== 'undefined') schem.orpTankLevel = Math.max(parseInt(data.orpTankLevel, 10), 0);
        //        // if (typeof data.status1 !== 'undefined') schem.status1 = parseInt(data.status1, 10); // remove/unsure?
        //        // if (typeof data.status2 !== 'undefined') schem.status2 = parseInt(data.status2, 10); // remove/unsure?
        //        //if (typeof data.pHDosingStatus !== 'undefined') schem.pHDosingStatus = parseInt(data.pHDosingStatus, 10);
        //        //if (typeof data.orpDosingStatus !== 'undefined') schem.orpDosingStatus = parseInt(data.orpDosingStatus, 10);
        //        let dosingStatus = typeof data.ph !== 'undefined' ? parseInt(data.ph.dosingStatus, 10) : parseInt(data.pHDosingStatus, 10);
        //        schem.ph.dosingStatus = isNaN(dosingStatus) ? schem.ph.dosingStatus : dosingStatus;
        //        dosingStatus = typeof data.orp !== 'undefined' ? parseInt(data.orp.dosingStatus, 10) : parseInt(data.orpDosingStatus, 10);
        //        schem.orp.dosingStatus = isNaN(dosingStatus) ? schem.orp.dosingStatus : dosingStatus;

        //        let dosingTime = typeof data.ph !== 'undefined' ? parseInt(data.ph.dosingTimeRemaining, 10) : parseInt(data.pHDosingTime, 10);
        //        schem.ph.dosingTimeRemaining = isNaN(dosingTime) ? schem.ph.dosingTimeRemaining : dosingTime;
        //        dosingTime = typeof data.orp !== 'undefined' ? parseInt(data.orp.dosingTimeRemaining, 10) : parseInt(data.orpDosingTime, 10);
        //        schem.orp.dosingTimeRemaining = isNaN(dosingTime) ? schem.orp.dosingTimeRemaining : dosingTime;
                
        //        //if (typeof data.pHDosingTime !== 'undefined') schem.pHDosingTime = parseInt(data.pHDosingTime, 10);
        //        //if (typeof data.orpDosingTime !== 'undefined') schem.orpDosingTime = parseInt(data.orpDosingTime, 10);
        //        let dosingVolume = typeof data.ph !== 'undefined' ? parseInt(data.ph.dosingVolumeRemaing, 10) : parseInt(data.pHDosingVolume, 10);
        //        schem.ph.dosingVolumeRemaining = isNaN(dosingVolume) ? schem.ph.dosingVolumeRemaining : dosingVolume;
        //        dosingVolume = typeof data.orp !== 'undefined' ? parseInt(data.orp.dosingVolumeRemaing, 10) : parseInt(data.orpDosingVolume, 10);
        //        schem.orp.dosingVolumeRemaining = isNaN(dosingVolume) ? schem.orp.dosingVolumeRemaining : dosingVolume;

        //        //if (typeof data.pHDosingVolume !== 'undefined') schem.pHDosingVolume = parseInt(data.pHDosingVolume, 10);
        //        //if (typeof data.orpDosingVolume !== 'undefined') schem.orpDosingVolume = parseInt(data.orpDosingVolume, 10);
        //        let temp = typeof data.orp !== 'undefined' && typeof data.orp.probe !== 'undefined' ? parseFloat(data.orp.probe.temperature) : parseFloat(data.temp);
        //        if (isNaN(temp)) {
        //            let tbody = state.temps.bodies.getBodyIsOn();
        //            if (typeof tbody !== 'undefined' && typeof tbody.temp !== 'undefined') temp = tbody.temp;
        //        }
        //        schem.ph.probe.temperature = isNaN(temp) ? schem.ph.probe.temperature : temp;
        //        let tempUnits = typeof data.orp !== 'undefined' && typeof data.orp.probe !== 'undefined' ?
        //            sys.board.valueMaps.tempUnits.encode(data.orp.probe.tempUnits, -1) : sys.board.valueMaps.tempUnits.encode(data.tempUnits, -1);
        //        schem.ph.probe.tempUnits = tempUnits >= 0 ? tempUnits : schem.ph.probe.tempUnits;


        //        //if (typeof data.temp !== 'undefined') schem.temp = parseInt(data.temp, 10);
        //        //else {
        //        //    let tbody = state.temps.bodies.getBodyIsOn();
        //        //    if (typeof tbody !== 'undefined' && typeof tbody.temp !== 'undefined') schem.temp = tbody.temp;
        //        //}
        //        //if (typeof data.tempUnits !== 'undefined') {
        //        //    if (typeof data.tempUnits === 'string') schem.tempUnits = sys.board.valueMaps.tempUnits.getValue(data.tempUnits.toUpperCase());
        //        //    else schem.tempUnits = data.tempUnits;
        //        //}
        //        //else schem.tempUnits = state.temps.units;
        //        if (typeof data.saturationIndex !== 'undefined') schem.saturationIndex = data.saturationIndex;
        //        else sys.board.chemControllers.calculateSaturationIndex(chem, schem)
        //        // sys.emitEquipmentChange();  // RSG - eliminating this emit in favor of the more complete extended emit below
        //        webApp.emitToClients('chemController', schem.getExtended()); // emit extended data
        //        schem.hasChanged = false; // try to avoid duplicate emits
        //        resolve(chem);
        //    }
        //})
    }
    protected async setIntelliChemStateAsync(data: any): Promise<ChemControllerState> {
        // We will land here whenever the chem controller is not attached to an IntelliCenter.  Apparently
        // *Touch controllers communicate directly with the IntelliChem controller and the OCP has no play in it.
        try {
            let chem = sys.chemControllers.find(elem => elem.id === data.id);
            if (typeof chem === 'undefined') return Promise.reject(`A valid IntelliChem controller could not be found at id ${data.id}`);
            let address = typeof data.address !== 'undefined' ? parseInt(data.address, 10) : chem.address;
            if (typeof address === 'undefined' || isNaN(address) || (address < 144 || address > 158)) return Promise.reject(new InvalidEquipmentDataError(`Invalid IntelliChem address`, 'chemController', address));
            let pHSetpoint = typeof data.ph.setpoint !== 'undefined' ? parseFloat(data.ph.setpoint) : chem.ph.setpoint;
            let orpSetpoint = typeof data.orp.setpoint !== 'undefined' ? parseInt(data.orp.setpoint, 10) : chem.orp.setpoint;
            let calciumHardness = typeof data.calciumHardness !== 'undefined' ? parseInt(data.calciumHardness, 10) : chem.calciumHardness;
            let cyanuricAcid = typeof data.cyanuricAcid !== 'undefined' ? parseInt(data.cyanuricAcid, 10) : chem.cyanuricAcid;
            let alkalinity = typeof data.alkalinity !== 'undefined' ? parseInt(data.alkalinity, 10) : chem.alkalinity;
            let body = sys.board.bodies.mapBodyAssociation(typeof data.body === 'undefined' ? chem.body : data.body);
            if (typeof body === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Invalid body assignment`, 'chemController', data.body || chem.body));
            // Do a final validation pass so we dont send this off in a mess.
            if (isNaN(pHSetpoint)) return Promise.reject(new InvalidEquipmentDataError(`Invalid pH Setpoint`, 'chemController', pHSetpoint));
            if (isNaN(orpSetpoint)) return Promise.reject(new InvalidEquipmentDataError(`Invalid orp Setpoint`, 'chemController', orpSetpoint));
            if (isNaN(calciumHardness)) return Promise.reject(new InvalidEquipmentDataError(`Invalid calcium hardness`, 'chemController', calciumHardness));
            if (isNaN(cyanuricAcid)) return Promise.reject(new InvalidEquipmentDataError(`Invalid cyanuric acid`, 'chemController', cyanuricAcid));
            if (isNaN(alkalinity)) return Promise.reject(new InvalidEquipmentDataError(`Invalid alkalinity`, 'chemController', alkalinity));
            let schem = state.chemControllers.getItemById(chem.id, true);
            schem.ph.tank.capacity = schem.orp.tank.capacity = chem.ph.tank.capacity = chem.orp.tank.capacity = 6;
            schem.ph.tank.units = schem.orp.tank.units = chem.ph.tank.units = chem.orp.tank.units = '';
            let orpTankLevel = typeof data.orp !== 'undefined' && typeof data.orp.tank !== 'undefined' ? parseInt(data.orp.tank.level, 10) : schem.orp.tank.level;
            let acidTankLevel = typeof data.ph !== 'undefined' && typeof data.ph.tank !== 'undefined' ? parseInt(data.ph.tank.level, 10) : schem.ph.tank.level;
            if (isNaN(orpTankLevel)) return Promise.reject(new InvalidEquipmentDataError(`Invalid orp tank level`, 'chemController', orpTankLevel));
            if (isNaN(acidTankLevel)) return Promise.reject(new InvalidEquipmentDataError(`Invalid orp tank level`, 'chemController', acidTankLevel));

            await new Promise((_resolve, _reject) => {
                let out = Outbound.create({
                    dest: chem.address,
                    source: 16, // ic doesn't seem to like msgs coming from 33
                    action: 146,
                    payload: [],
                    retries: 1,
                    response: true,
                    protocol: Protocol.IntelliChem,
                    onComplete: (err, msg) => {
                        if (err) {
                            if (typeof data.isVirtual !== 'undefined' && !data.isVirtual) chem.isVirtual = true;  // if we set virtual, but it failed, set it back
                            _reject(err);
                        }
                        else {
                            chem.ph.setpoint = pHSetpoint;
                            chem.orp.setpoint = orpSetpoint;
                            chem.calciumHardness = calciumHardness;
                            chem.alkalinity = alkalinity;
                            schem.ph.tank.level = acidTankLevel;
                            schem.orp.tank.level = orpTankLevel;
                            chem.cyanuricAcid = typeof data.cyanuricAcid !== 'undefined' ? parseInt(data.cyanuricAcid, 10) : chem.cyanuricAcid;
                            chem.isActive = schem.isActive = true;
                            _resolve(); // let IntelliChem status packet set values
                        }
                    }
                });
                out.insertPayloadBytes(0, 0, 21);
                out.setPayloadByte(0, Math.floor((pHSetpoint * 100) / 256) || 0);
                out.setPayloadByte(1, Math.round((pHSetpoint * 100) % 256) || 0);
                out.setPayloadByte(2, Math.floor(orpSetpoint / 256) || 0);
                out.setPayloadByte(3, Math.round(orpSetpoint % 256) || 0);
                out.setPayloadByte(4, acidTankLevel);
                out.setPayloadByte(5, orpTankLevel);
                out.setPayloadByte(6, Math.floor(calciumHardness / 256) || 0);
                out.setPayloadByte(7, Math.round(calciumHardness % 256) || 0);
                out.setPayloadByte(9, parseInt(data.cyanuricAcid, 10), chem.cyanuricAcid || 0);
                out.setPayloadByte(10, Math.floor(alkalinity / 256) || 0);
                out.setPayloadByte(12, Math.round(alkalinity % 256) || 0);
                // out.setPayloadByte(12, 20);  // fixed value?
                conn.queueSendMessage(out);
            })
            return Promise.resolve(schem);
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setChemControllerStateAsync(data: any): Promise<ChemControllerState> {
        // NOTE: This will not add, delete, or change the type of a chemController.  
        // You cannot change the basis of operation for the controller with this method. This method will
        // however update state values for each of the types we are using in njspc.  
        // These include:
        // 1. Straight IntelliChem -- attached to OCP.
        // 2. IntelliChem -- standalone.
        // 3. Homegrown -- Russ to decide what to do with this.
        // 4. REM Chem -- Chem controller with equipment on REM.
        let address = typeof data.address !== 'undefined' ? parseInt(data.address, 10) : NaN;
        let id = typeof data.id !== 'undefined' ? parseInt(data.id, 10) : NaN;
        let chem: ChemController;
        if (isNaN(id) && isNaN(address)) return Promise.reject(new InvalidEquipmentIdError(`No valid id or address not provided for chem controller id:${data.id} address:${data.address}`, id, 'chemController'));
        else if (!isNaN(id)) {
            chem = sys.chemControllers.find(elem => elem.id === id);
            if (typeof chem === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`A valid chem controller could not be found for id:${data.id}`, id, 'chemController'));
        }
        else if (!isNaN(address)) {
            chem = sys.chemControllers.find(elem => elem.address === address);
            if (typeof chem === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`A valid chem controller could not be found for address:${data.address}`, id, 'chemController'));
        }
        // Set the id back so we are always dealing with the id from here on out.
        data.id = id;
        // At this point we know if our chemController exists, how it is controlled and what its identifiers are. Marshall it off
        // to the appropriate party.  The board will get a crack at it first then send it back here when it is IntelliChem virtual.
        if (sys.board.valueMaps.chemControllerTypes.getValue('intellichem') === chem.type) return await this.setIntelliChemStateAsync(data);

        // Send this off to Nixie to process.  She has the last crack at it because she is the master of it.
        await ncp.chemControllers.setControllerAsync(chem, data);
        let schem = state.chemControllers.getItemById(data.id, true);


        //// So here we are.  We fell into the world of homegrown and REM Chem.  At this point we know all the information we need
        //// to validate the data and set the options.  Some of it will require talking to REM to activate the equipment up and others
        //// will simply require setting attributes.  For the most part though we are not controlling equipment from this method.
        //let pHSetpoint = typeof data.ph !== 'undefined' && typeof data.ph.setpoint !== 'undefined' ? parseFloat(data.ph.setpoint) : chem.ph.setpoint;
        //let orpSetpoint = typeof data.orp !== 'undefined' && typeof data.orp.setpoint !== 'undefined' ? parseInt(data.orp.setpoint, 10) : chem.orp.setpoint;
        //let calciumHardness = typeof data.calciumHardness !== 'undefined' ? parseInt(data.calciumHardness, 10) : chem.calciumHardness;
        //let cyanuricAcid = typeof data.cyanuricAcid !== 'undefined' ? parseInt(data.cyanuricAcid, 10) : chem.cyanuricAcid;
        //let alkalinity = typeof data.alkalinity !== 'undefined' ? parseInt(data.alkalinity, 10) : chem.alkalinity;
        //let body = sys.board.bodies.mapBodyAssociation(typeof data.body === 'undefined' ? chem.body : data.body);
        //if (typeof body === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Invalid body assignment`, 'chemController', data.body || chem.body));
        //// Do a final validation pass so we dont send this off in a mess.
        //if (isNaN(pHSetpoint)) return Promise.reject(new InvalidEquipmentDataError(`Invalid pH Setpoint`, 'chemController', pHSetpoint));
        //if (isNaN(orpSetpoint)) return Promise.reject(new InvalidEquipmentDataError(`Invalid orp Setpoint`, 'chemController', orpSetpoint));
        //if (isNaN(calciumHardness)) return Promise.reject(new InvalidEquipmentDataError(`Invalid calcium hardness`, 'chemController', calciumHardness));
        //if (isNaN(cyanuricAcid)) return Promise.reject(new InvalidEquipmentDataError(`Invalid cyanuric acid`, 'chemController', cyanuricAcid));
        //if (isNaN(alkalinity)) return Promise.reject(new InvalidEquipmentDataError(`Invalid alkalinity`, 'chemController', alkalinity));
        //let schem = state.chemControllers.getItemById(chem.id, true);
        //chem.address = address;
        //chem.ph.setpoint = pHSetpoint;
        //chem.orp.setpoint = orpSetpoint;
        //chem.calciumHardness = calciumHardness;
        //chem.cyanuricAcid = cyanuricAcid;
        //chem.alkalinity = alkalinity;
        //chem.body = body;

        //// Alright we are down to the equipment items.

        //// ORP Settings
        //if (typeof data.orp !== 'undefined') {
        //    // ORP Probe: The data here is read only so we are not calling out to equipment.
        //    if (typeof data.orp.probe !== 'undefined') {
        //        schem.orp.probe.level = typeof data.orp.probe.level !== 'undefined' ? parseFloat(data.orp.probe.level) : schem.orp.probe.level;
        //        schem.orp.probe.saltLevel = typeof data.orp.probe.saltLevel !== 'undefined' ? parseFloat(data.orp.probe.saltLevel) : schem.orp.probe.saltLevel;
        //    }
        //    // ORP Tank: The data here is potentially not read only.  We may be telling REM to set the pump tank data.
        //    if (typeof data.orp.tank !== 'undefined') {
        //        schem.orp.tank.level = typeof data.orp.tank.level !== 'undefined' ? parseFloat(data.orp.tank.level) : schem.orp.tank.level;
        //        chem.orp.tank.capacity = schem.orp.tank.capacity = typeof data.orp.tank.capacity !== 'undefined' ? parseFloat(data.orp.tank.capacity) : schem.orp.tank.capacity;
        //        chem.orp.tank.units = schem.orp.tank.units = typeof data.orp.tank.units !== 'undefined' ? sys.board.valueMaps.volumeUnits.encode(data.orp.tank.units) : chem.orp.tank.units;
        //    }
        //    // For now let's not dose with this method so we are not going to change anything with the pump.
        //}
        //if (typeof data.ph !== 'undefined') {
        //    // pH Probe: the data here is read only so we are not calling out to equipment.
        //    if (typeof data.ph.probe !== 'undefined') {
        //        schem.ph.probe.level = typeof data.ph.probe.level !== 'undefined' ? parseFloat(data.ph.probe.level) : schem.ph.probe.level;
        //        schem.ph.probe.temperature = typeof data.ph.probe.temperature !== 'undefined' ? parseFloat(data.ph.probe.temperature) : schem.ph.probe.temperature;
        //        schem.ph.probe.tempUnits = typeof data.ph.probe.tempUnits !== 'undefined' ? data.ph.probe.tempUnits : schem.ph.probe.tempUnits;
        //    }
        //    // Acid Tank: The data here is potentially not read only.  We may be telling REM to set the pump tank data.
        //    if (typeof data.ph.tank !== 'undefined') {
        //        schem.ph.tank.level = typeof data.ph.tank.level !== 'undefined' ? parseFloat(data.ph.tank.level) : schem.ph.tank.level;
        //        chem.ph.tank.capacity = schem.ph.tank.capacity = typeof data.ph.tank.capacity !== 'undefined' ? parseFloat(data.ph.tank.capacity) : schem.ph.tank.capacity;
        //        chem.ph.tank.units = schem.ph.tank.units = typeof data.ph.tank.units !== 'undefined' ? data.ph.tank.units : chem.ph.tank.units;
        //    }
        //    // For now let's not dose with this method so we are not going to change anything with the pump.
        //}
        return Promise.resolve(schem);
    }
    public calculateSaturationIndex(chem: ChemController, schem: ChemControllerState): void {
        // Saturation Index = SI = pH + CHF + AF + TF - TDSF   
        let SI = Math.round(
            (schem.ph.probe.level +
                this.calculateCalciumHardnessFactor(chem) +
                this.calculateTotalCarbonateAlkalinity(chem) +
                this.calculateTemperatureFactor(schem) -
                this.calculateTotalDisolvedSolidsFactor()) * 1000) / 1000;
        if (isNaN(SI)) { schem.saturationIndex = undefined } else { schem.saturationIndex = SI; }
    }
    private calculateCalciumHardnessFactor(chem: ChemController) {
        const CH = chem.calciumHardness;
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
        return 2.5;
    }
    private calculateTotalCarbonateAlkalinity(chem: ChemController): number {
        const ppm = this.correctedAlkalinity(chem);
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
        return 2.9;
    }
    private correctedAlkalinity(chem: ChemController): number {
        return chem.alkalinity - (chem.cyanuricAcid / 3);
    }
    private calculateTemperatureFactor(schem: ChemControllerState): number {
        const temp = schem.ph.probe.temperature;
        const UOM = typeof schem.ph.probe.tempUnits !== 'undefined' ? sys.board.valueMaps.tempUnits.getName(schem.ph.probe.tempUnits) : sys.board.valueMaps.tempUnits.getName(state.temps.units);
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
            return 0.9;
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
            return 0.9;
        }
    }
    private calculateTotalDisolvedSolidsFactor(): number {
        // RKS: This needs to match with the target body of the chlorinator if it exists.
        // 12.1 for non-salt pools; 12.2 for salt pools
        let chlorInstalled = false;
        if (sys.chlorinators.length && sys.chlorinators.getItemById(1).isActive) chlorInstalled = true;
        return chlorInstalled ? 12.2 : 12.1;
    }
    public async pollIntelliChem(address: number): Promise<boolean> {
        try {
            // Send a 210 message out and see if we get an ACK or an action 18 from the controller address. Either will suffice
            // to indicate that the controller exists.
            let found = await new Promise<boolean>((resolve, reject) => {
                let out = Outbound.create({
                    source: 16, dest: address, action: 210, payload: [210], retries: 1, protocol: Protocol.IntelliChem,
                    response: true,
                    onComplete: (err) => {
                        if (err) resolve(false);
                        else { resolve(true); }
                    }
                });
                conn.queueSendMessage(out);
            });
            return Promise.resolve(found);
        }
        catch (err) { return Promise.reject(err); }
    }
    public async initChem(chem: ChemController) {
        // init chem controller here
        /* on EasyTouch2 8p
        See these two packets first:
        debug: Packet not processed: 255,0,255,165,23,16,34,19,1,0,1,2
        debug: Packet not processed: 255,0,255,165,23,15,16,147,42,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,152


        Followed shortly by the same two packets but 128 is towards the end of the payload on the 147 packet;
        Guessing 128 is status=Not Found or Lost Comms
        debug: Packet not processed: 255,0,255,165,23,16,34,19,1,0,1,2
        debug: Packet not processed: 255,0,255,165,23,15,16,147,42,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,0,0,0,0,0,0,0,2,24


        And then the 217/19 pair (both a get and a set packet)
        debug: Packet not processed: 255,0,255,165,23,16,34,19,1,0,1,2
        debug: Packet not processed: 255,0,255,165,23,15,16,147,42,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,0,0,0,0,0,0,0,2,24
        */

        /*
        And per https://gitter.im/nodejs-poolController/Lobby?at=5ec819fb9da05a060a250ef8
        255,0,255,165,16,144,16,210,1,210,2,250

        */

        // this mimics another control panel asking OCP for chem controller status
        // return new Promise((resolve, reject)=> {
        let out = Outbound.create({
            source: 16,
            dest: chem.address,
            action: 210,
            payload: [210],
            retries: 1,
            protocol: Protocol.IntelliChem,
            response: true,
            onComplete: (err) => {
                if (err) {
                    // logger.warn(`No response from chem controller: src: 16, dest: 144, action: 210, payload: [210] `);
                    logger.info(`No chemController found at address ${chem.address}: ${err.message}`);
                    sys.chemControllers.getItemById(chem.id).isActive = false;
                    sys.chemControllers.removeItemById(chem.id);
                    state.chemControllers.removeItemById(chem.id);
                    setTimeout(sys.board.virtualChemControllers.start, 5000);
                    state.emitEquipmentChanges(); // emit destroyed chlor if we fail
                    // reject(`No chemController found at address ${chem.address}: ${err.message}`);
                }
                else {
                    logger.info(`Found chem controller id:${chem.id}/address:${chem.address} `);
                    // logger.info(`Response from chem controller: src: 16, dest: 144, action: 210, payload: [210] `);
                    // resolve(state.chemControllers.getItemById(chem.id, true));
                    state.chemControllers.getItemById(chem.id, true);
                }
            }
        });
        conn.queueSendMessage(out);
        //};
    }

    /*     public stop(chem: ChemController) {
            // stop commands
            state.chemControllers.getItemById(chem.id).virtualControllerStatus = sys.board.valueMaps.virtualControllerStatus.getValue('stopped')
            return Promise.resolve(chem);
        } */
    public run(chem: ChemController) {
        // run commands
        chem = sys.chemControllers.getItemByAddress(chem.address); // refresh to get any updated data
        let schem = state.chemControllers.getItemById(chem.id);
        if (chem.isActive && chem.isVirtual && chem.type === sys.board.valueMaps.chemControllerTypes.getValue('intellichem')) {
            if (schem.virtualControllerStatus === sys.board.valueMaps.virtualControllerStatus.getValue('stopped')) {
                return;
            }
            else {
                let out = Outbound.create({
                    source: 16,
                    dest: chem.address,
                    action: 210,
                    payload: [210],
                    retries: 1,
                    protocol: Protocol.IntelliChem,
                    response: true,
                    onComplete: (err) => {
                        if (err) {
                            logger.warn(`No response from IntelliChem id:${chem.id}/address:${chem.address}`);
                            if (schem.lastComm + (30 * 1000) < new Date().getTime()) {
                                // We have not talked to the chem controller in 30 seconds so we have lost communication.
                                schem.status = schem.alarms.comms = 1;
                            }
                        }
                        setTimeout(sys.board.chemControllers.run, 5000, chem);
                    }
                });
                conn.queueSendMessage(out);

            }
        }

    }

}
export class VirtualChlorinatorController extends BoardCommands {
    // this method will check to see if we have any virtual chlors we are responsible for
    // if we have any, we will see if the timer is already running or if it needs to be started
    public start() {
        let chlor = sys.chlorinators.getItemById(1);
        let schlor = state.chlorinators.getItemById(1);
        if (chlor.isActive && chlor.isVirtual) {
            if (schlor.virtualControllerStatus !== sys.board.valueMaps.virtualControllerStatus.getValue('running')) {
                schlor.virtualControllerStatus = sys.board.valueMaps.virtualControllerStatus.getValue('running');
                if (typeof (chlor.name) === 'undefined') sys.board.chlorinator.requestName(schlor);
                sys.board.chlorinator.run(chlor, schlor);
            }
        }
    }

    public stop() {
        let schlor = state.chlorinators.getItemById(1);
        schlor.currentOutput = 0; // alias for off
        schlor.virtualControllerStatus = sys.board.valueMaps.virtualControllerStatus.getValue('stopped');
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
            sys.board.virtualChlorinatorController.start();
        }
        catch (err) {
            logger.warn(`No Chlorinator Found`);
            sys.chlorinators.removeItemById(1);
            state.chlorinators.removeItemById(1);
        }
    }
}
export class VirtualPumpController extends BoardCommands {
    public search() {
        for (let i = 1; i <= sys.equipment.maxPumps; i++) {
            let pump = sys.pumps.getItemById(i);
            if (pump.isActive) continue;
            let spump = state.pumps.getItemById(i, true);
            pump = sys.pumps.getItemById(i, true);
            spump.isActive = pump.isActive = pump.isVirtual = true;
            pump.type = spump.type = 0;
            logger.info(`Searching for a pump at address... ${pump.address}`);
            spump.virtualControllerStatus = sys.board.valueMaps.virtualControllerStatus.getValue('running');
            // nested calls here; could do away with this but would have to otherwise send in an onComplete function
            // and that's a bunch of additional logic
            let setPumpToRemoteControlPacket = Outbound.create({
                protocol: Protocol.Pump,
                dest: pump.address,
                action: 4,
                payload: [255],
                retries: 1,
                response: true,
                onComplete: (err) => {
                    if (err) {
                        logger.info(`No pump found at address ${pump.address}: ${err.message}`);
                        sys.pumps.removeItemById(pump.id);
                        state.pumps.removeItemById(pump.id);
                    }
                    else {
                        let requestPumpStatusPacket = Outbound.create({
                            protocol: Protocol.Pump,
                            dest: pump.address,
                            action: 7,
                            payload: [],
                            retries: 1,
                            response: true,
                            onComplete: (err, msg) => {
                                if (err) {
                                    logger.info(`No pump found at address ${pump.address}: ${err.message}`);
                                    sys.pumps.removeItemById(pump.id);
                                    state.pumps.removeItemById(pump.id);
                                }
                                else {
                                    logger.info(`Found pump at ${pump.id} address ${pump.address}`);
                                    sys.board.virtualPumpControllers.start();
                                }
                            }
                        });
                        conn.queueSendMessage(requestPumpStatusPacket);
                    }
                }
            });
            conn.queueSendMessage(setPumpToRemoteControlPacket);
        }
    }
    public setTargetSpeed() {
        for (let i = 1; i <= sys.pumps.length; i++) {
            let pump = sys.pumps.getItemById(i);
            let spump = state.pumps.getItemById(i);
            let _newSpeed = 0;
            if (pump.isVirtual) {
                let pumpCircuits = pump.circuits.get();
                let _units;
                for (let i = 0; i < pumpCircuits.length; i++) {
                    let circ = state.circuits.getInterfaceById(pumpCircuits[i].circuit);
                    if (circ.isOn) {
                        if (typeof _units === 'undefined') _units = pumpCircuits[i].units;
                        if (_units === pumpCircuits[i].units && pumpCircuits[i].speed > _newSpeed) { _newSpeed = pumpCircuits[i].speed; }
                    }
                }
                spump.targetSpeed = _newSpeed;
            }
        }
    }
    public async softStop() {
        // reset the values when the app starts; this is in case there is a system failure while the pumps are running
        // turn off all pumps
        for (let i = 1; i <= sys.pumps.length; i++) {
            let pump = sys.pumps.getItemById(i);
            let spump = state.pumps.getItemById(i);
            if (pump.isVirtual && pump.type !== 0) {
                spump.targetSpeed = 0;
                spump.virtualControllerStatus = sys.board.valueMaps.virtualControllerStatus.getValue('stopped');
            }
        }
    }
    public async stopAsync() {
        // this is faux async just so we give pumps time to stop.
        // maybe a better way to do this without having individual
        // pump async calls
        return new Promise((resolve, reject) => {
            // turn off all pumps
            let bAnyVirtual = false;
            for (let i = 1; i <= sys.pumps.length; i++) {
                let pump = sys.pumps.getItemById(i);
                let spump = state.pumps.getItemById(i);
                if (pump.isVirtual && pump.type !== 0) {
                    bAnyVirtual = true;
                    logger.info(`Queueing pump ${i} to return to manual control.`);
                    spump.targetSpeed = 0;
                    spump.virtualControllerStatus = sys.board.valueMaps.virtualControllerStatus.getValue('stopped');
                    sys.board.pumps.stopPumpRemoteContol(pump);
                }
            }
            if (!bAnyVirtual) resolve();
            else setTimeout(resolve, 2500);
        });
    }

    public start() {
        for (let i = 1; i <= sys.pumps.length; i++) {
            let pump = sys.pumps.getItemById(i);
            let spump = state.pumps.getItemById(i);
            sys.board.virtualPumpControllers.setTargetSpeed();
            if (pump.isVirtual && pump.isActive && ['vs', 'vf'].includes(sys.board.valueMaps.pumpTypes.getName(pump.type).substring(0, 2))) {
                if (state.pumps.getItemById(i).virtualControllerStatus === sys.board.valueMaps.virtualControllerStatus.getValue('running')) continue;
                logger.info(`Starting Virtual Pump Controller: Pump ${pump.id}`);
                state.pumps.getItemById(i).virtualControllerStatus = sys.board.valueMaps.virtualControllerStatus.getValue('running');
                setTimeout(sys.board.pumps.run, 100, pump);
            }
            // else {
            //     if (spump.virtualControllerStatus === sys.board.valueMaps.virtualControllerStatus.getValue('running')) {
            //         spump.virtualControllerStatus = sys.board.valueMaps.virtualControllerStatus.getValue('stopped');
            //         sys.board.pumps.stopPumpRemoteContol(pump);
            //     }
            // }
        }
    }
}
export class VirtualChemController extends BoardCommands {
    public async search() {
        // TODO: If we are searching for multiple chem controllers this should be a promise.all array
        // except even one resolve() could be a success for all.  Or we could just return a generic "searching"
        let promises = [];
        for (let i = 1; i <= sys.equipment.maxChemControllers; i++) {
            let address = 144 + i - 1; // first address;
            let chem = sys.chemControllers.getItemByAddress(address, true);
            if (chem.isActive) continue;
            chem.isActive = true;
            chem.isVirtual = true;
            chem.type = 1;
            sys.board.chemControllers.initChem(chem);
        }
        return Promise.resolve('Searching for chem controllers...')
    }
    // is stopping virtual chem controllers necessary?
    public stop() {
        // turn off all chem controllers
        let bAnyVirtual = false;
        for (let i = 0; i < sys.chemControllers.length; i++) {
            let chem = sys.chemControllers.getItemByIndex(i);
            let schem = state.chemControllers.getItemById(chem.id);
            if (chem.isVirtual && chem.isActive && schem.virtualControllerStatus === sys.board.valueMaps.virtualControllerStatus.getValue('running')) {
                logger.info(`Stopping chemController ${i}.`);
                // sys.board.chemControllers.stop(chem);
                schem.virtualControllerStatus = sys.board.valueMaps.virtualControllerStatus.getValue('stopped');
                bAnyVirtual = true;
            }
        }
    }

    public start() {
        for (let i = 0; i < sys.chemControllers.length; i++) {
            let chem = sys.chemControllers.getItemByIndex(i);
            let schem = state.chemControllers.getItemById(chem.id);
            if (chem.isVirtual && chem.isActive && chem.type === sys.board.valueMaps.chemControllerTypes.getValue('intellichem')) {
                if (state.chemControllers.getItemById(chem.id).virtualControllerStatus !== sys.board.valueMaps.virtualControllerStatus.getValue('running')) {
                    logger.info(`Starting Virtual Chem Controller: Chem id:${chem.id}/address:${chem.address}`);
                    schem.virtualControllerStatus = sys.board.valueMaps.virtualControllerStatus.getValue('running');
                    setTimeout(sys.board.chemControllers.run, 100, chem);
                }
                // else {
                // if (schem.virtualControllerStatus === sys.board.valueMaps.virtualControllerStatus.getValue('running')) {
                // schem.virtualControllerStatus = sys.board.valueMaps.virtualControllerStatus.getValue('stopped');
                // sys.board.chemControllers.stop(chem);
                // }
                // }
            }
            else schem.virtualControllerStatus = -1;
        }
    }
}

export class FilterCommands extends BoardCommands {
    public setFilter(data: any): any {
        let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
        if (id <= 0) id = sys.filters.length + 1; // set max filters?
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid filter id: ${data.id}`, data.id, 'Filter'));
        let filter = sys.filters.getItemById(id, id > 0);
        let sfilter = state.filters.getItemById(id, id > 0);
        let filterType = typeof data.filterType !== 'undefined' ? parseInt(data.filterType,10) : filter.filterType;
        if (typeof filterType === 'undefined') filterType = sys.board.valueMaps.filterTypes.getValue('unknown');

        if (typeof data.isActive !== 'undefined') {
            if (utils.makeBool(data.isActive) === false) {
                sys.filters.removeItemById(id);
                state.filters.removeItemById(id);
                return;
            }
        }

        let body = typeof data.body !== 'undefined' ? data.body : filter.body;
        let name = typeof data.name !== 'undefined' ? data.name : filter.name;
        let psi = typeof data.psi !== 'undefined' ? parseFloat(data.psi) : sfilter.psi;
        let lastCleanDate = typeof data.lastCleanDate !== 'undefined' ? data.lastCleanDate : sfilter.lastCleanDate;
        let filterPsi = typeof data.filterPsi !== 'undefined' ? parseInt(data.filterPsi, 10) : sfilter.filterPsi;
        let needsCleaning = typeof data.needsCleaning !== 'undefined' ? data.needsCleaning : sfilter.needsCleaning;

        // Ensure all the defaults.
        if (isNaN(psi)) psi = 0;
        if (typeof body === 'undefined') body = 32;

        // At this point we should have all the data.  Validate it.
        if (!sys.board.valueMaps.filterTypes.valExists(filterType)) return Promise.reject(new InvalidEquipmentDataError(`Invalid filter type; ${filterType}`, 'Filter', filterType));

        filter.filterType = sfilter.filterType = filterType;
        filter.body = sfilter.body = body;
        filter.filterType = sfilter.filterType = filterType;
        filter.name = sfilter.name = name;
        sfilter.psi = psi;
        sfilter.filterPsi = filterPsi;
        filter.needsCleaning = sfilter.needsCleaning = needsCleaning;
        filter.lastCleanDate = sfilter.lastCleanDate = lastCleanDate;
        sfilter.emitEquipmentChange();
        return sfilter;
    }

    public deleteFilter(data: any): any {
        let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
        if (isNaN(id)) return;
        sys.filters.removeItemById(id);
        state.filters.removeItemById(id);
        return state.filters.getItemById(id);
    }
}