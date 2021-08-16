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
import { Message, Outbound } from '../comms/messages/Messages';
import { Timestamp, utils } from '../Constants';
import { Body, ChemController, Chlorinator, Circuit, CircuitGroup, CircuitGroupCircuit, ConfigVersion, ControllerType, CustomName, CustomNameCollection, EggTimer, Equipment, Feature, Filter, General, Heater, ICircuit, LightGroup, LightGroupCircuit, Location, Options, Owner, PoolSystem, Pump, Schedule, sys, TempSensorCollection, Valve } from '../Equipment';
import { EquipmentNotFoundError, InvalidEquipmentDataError, InvalidEquipmentIdError } from '../Errors';
import { ncp } from "../nixie/Nixie";
import { BodyTempState, ChemControllerState, ChlorinatorState, CircuitGroupState, FilterState, ICircuitGroupState, ICircuitState, LightGroupState, ScheduleState, state, TemperatureState, ValveState, VirtualCircuitState } from '../State';

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
    if (val === null || typeof val === 'undefined') return;
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
  public circuits: EquipmentIdRange = new EquipmentIdRange(1, 6);
  public features: EquipmentIdRange = new EquipmentIdRange(7, function () { return this.start + sys.equipment.maxFeatures; });
  public pumps: EquipmentIdRange = new EquipmentIdRange(1, function () { return this.start + sys.equipment.maxPumps; });
  public circuitGroups: EquipmentIdRange = new EquipmentIdRange(50, function () { return this.start + sys.equipment.maxCircuitGroups; });
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
  public equipmentCommStatus: byteValueMap = new byteValueMap([
    [0, { val: 0, name: 'ready', desc: 'Ready' }],
    [1, { val: 1, name: 'commerr', desc: 'Communication Error' }]
  ]);
  public panelModes: byteValueMap = new byteValueMap([
    [0, { val: 0, name: 'auto', desc: 'Auto' }],
    [1, { val: 1, name: 'service', desc: 'Service' }],
    [8, { val: 8, name: 'freeze', desc: 'Freeze' }],
    [128, { val: 128, name: 'timeout', desc: 'Timeout' }],
    [129, { val: 129, name: 'service-timeout', desc: 'Service/Timeout' }],
    [255, { name: 'error', desc: 'System Error' }]
  ]);
  public controllerStatus: byteValueMap = new byteValueMap([
    [0, { val: 0, name: 'initializing', desc: 'Initializing', percent: 0 }],
    [1, { val: 1, name: 'ready', desc: 'Ready', percent: 100 }],
    [2, { val: 2, name: 'loading', desc: 'Loading', percent: 0 }],
    [3, { val: 255, name: 'Error', desc: 'Error', percent: 0 }]
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
    [177, { name: 'party', desc: 'Party', type: 'intellibrite', sequence: 2 }],
    [178, { name: 'romance', desc: 'Romance', type: 'intellibrite', sequence: 3 }],
    [179, { name: 'caribbean', desc: 'Caribbean', type: 'intellibrite', sequence: 4 }],
    [180, { name: 'american', desc: 'American', type: 'intellibrite', sequence: 5 }],
    [181, { name: 'sunset', desc: 'Sunset', type: 'intellibrite', sequence: 6 }],
    [182, { name: 'royal', desc: 'Royal', type: 'intellibrite', sequence: 7 }],
    [190, { name: 'save', desc: 'Save', type: 'intellibrite', sequence: 13 }],
    [191, { name: 'recall', desc: 'Recall', type: 'intellibrite', sequence: 14 }],
    [193, { name: 'blue', desc: 'Blue', type: 'intellibrite', sequence: 8 }],
    [194, { name: 'green', desc: 'Green', type: 'intellibrite', sequence: 9 }],
    [195, { name: 'red', desc: 'Red', type: 'intellibrite', sequence: 10 }],
    [196, { name: 'white', desc: 'White', type: 'intellibrite', sequence: 11 }],
    [197, { name: 'magenta', desc: 'Magenta', type: 'intellibrite', sequence: 12 }],
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
  public scheduleDisplayTypes: byteValueMap = new byteValueMap([
    [0, { name: 'always', desc: 'Always' }],
    [1, { name: 'active', desc: 'When Active' }],
    [2, { name: 'never', desc: 'Never' }]
  ]);

  public pumpTypes: byteValueMap = new byteValueMap([
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
    [1, { name: 'gas', desc: 'Gas Heater', hasAddress: false }],
    [2, { name: 'solar', desc: 'Solar Heater', hasAddress: false, hasCoolSetpoint: true }],
    [3, { name: 'heatpump', desc: 'Heat Pump', hasAddress: true }],
    [4, { name: 'ultratemp', desc: 'UltraTemp', hasAddress: true, hasCoolSetpoint: true }],
    [5, { name: 'hybrid', desc: 'Hybrid', hasAddress: true }],
    [6, { name: 'maxetherm', desc: 'Max-E-Therm', hasAddress: true }],
    [7, { name: 'mastertemp', desc: 'MasterTemp', hasAddress: true }]
  ]);
  public heatModes: byteValueMap = new byteValueMap([
    [0, { name: 'off', desc: 'Off' }],
    [3, { name: 'heater', desc: 'Heater' }],
    [5, { name: 'solar', desc: 'Solar Only' }],
    [12, { name: 'solarpref', desc: 'Solar Preferred' }]
  ]);
  public heatSources: byteValueMap = new byteValueMap([
    [0, { name: 'off', desc: 'No Heater' }],
    [3, { name: 'heater', desc: 'Heater' }],
    [5, { name: 'solar', desc: 'Solar Only' }],
    [21, { name: 'solarpref', desc: 'Solar Preferred' }],
    [32, { name: 'nochange', desc: 'No Change' }]
  ]);
  public heatStatus: byteValueMap = new byteValueMap([
    [0, { name: 'off', desc: 'Off' }],
    [1, { name: 'heater', desc: 'Heater' }],
    [2, { name: 'solar', desc: 'Solar' }],
    [3, { name: 'cooling', desc: 'Cooling' }]
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
    [7, { name: 'lowtemp', desc: 'Water Temp Low' }],
    [8, { name: 'commlost', desc: 'Communication Lost' }]
  ]);
  public chlorinatorType: byteValueMap = new byteValueMap([
    [0, { name: 'pentair', desc: 'Pentair' }],
    [1, { name: 'unknown', desc: 'unknown' }],
    [2, { name: 'aquarite', desc: 'Aquarite' }],
    [3, { name: 'unknown', desc: 'unknown' }]
  ]);
  public chlorinatorModel: byteValueMap = new byteValueMap([
    [0, { name: 'unknown', desc: 'unknown', capacity: 0, chlorinePerDay: 0, chlorinePerSec: 0 }],
    [1, { name: 'intellichlor-15', desc: 'IC15', capacity: 15000, chlorinePerDay: 0.60, chlorinePerSec: 0.60/86400 }],
    [2, { name: 'intellichlor--20', desc: 'IC20', capacity: 20000, chlorinePerDay: 0.70, chlorinePerSec: 0.70/86400 }],
    [3, { name: 'intellichlor--40', desc: 'IC40', capacity: 40000, chlorinePerDay: 1.40, chlorinePerSec: 1.4/86400 }],
    [4, { name: 'intellichlor--60', desc: 'IC60', capacity: 60000, chlorinePerDay: 2, chlorinePerSec: 2/86400 }], 
  ])
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
    [0, { name: 'none', desc: 'None', ph: { min: 6.8, max: 7.6 }, orp: { min: 400, max: 800 }, hasAddress: false }],
    [1, { name: 'unknown', desc: 'Unknown', ph: { min: 6.8, max: 7.6 }, hasAddress: false }],
    [2, { name: 'intellichem', desc: 'IntelliChem', ph: { min: 7.2, max: 7.6 }, orp: { min: 400, max: 800 }, hasAddress: true }],
    [3, { name: 'homegrown', desc: 'Homegrown', ph: { min: 6.8, max: 7.6 }, hasAddress: false }],
    [4, { name: 'rem', desc: 'REM Chem', ph: { min: 6.8, max: 8.0 }, hasAddress: false }]
  ]);
  public siCalcTypes: byteValueMap = new byteValueMap([
    [0, { name: 'lsi', desc: 'Langelier Saturation Index' }],
    [1, { name: 'csi', desc: 'Calcite Saturation Index' }]
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
  public flowSensorTypes: byteValueMap = new byteValueMap([
    [0, { name: 'none', desc: 'No Sensor' }],
    [1, { name: 'switch', desc: 'Flow Switch', remAddress: true }],
    [2, { name: 'rate', desc: 'Rate Sensor', remAddress: true }],
    [4, { name: 'pressure', desc: 'Pressure Sensor', remAddress: true }],
  ]);
  public chemDosingMethods: byteValueMap = new byteValueMap([
    [0, { name: 'manual', desc: 'Manual' }],
    [1, { name: 'time', desc: 'Time' }],
    [2, { name: 'volume', desc: 'Volume' }]
  ]);
  public chemChlorDosingMethods: byteValueMap = new byteValueMap([
    [0, { name: 'chlor', desc: 'Use Chlorinator Settings' }],
    [1, { name: 'target', desc: 'Dynamic based on ORP Setpoint' }]
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
  public areaUnits: byteValueMap = new byteValueMap([
    [0, { name: '', desc: 'No Units' }],
    [1, { name: 'sqft', desc: 'Square Feet' }],
    [2, { name: 'sqM', desc: 'Square Meters' }]
  ]);
  public chemControllerStatus: byteValueMap = new byteValueMap([
    [0, { name: 'ok', desc: 'Ok' }],
    [1, { name: 'nocomms', desc: 'No Communication' }],
    [2, { name: 'config', desc: 'Invalid Configuration' }]
  ]);
  public chemControllerAlarms: byteValueMap = new byteValueMap([
    [0, { name: 'ok', desc: 'Ok - No alarm' }],
    [1, { name: 'noflow', desc: 'No Flow Detected' }],
    [2, { name: 'phhigh', desc: 'pH Level High' }],
    [4, { name: 'phlow', desc: 'pH Level Low' }],
    [8, { name: 'orphigh', desc: 'orp Level High' }],
    [16, { name: 'orplow', desc: 'orp Level Low' }],
    [32, { name: 'phtankempty', desc: 'pH Tank Empty' }],
    [64, { name: 'orptankempty', desc: 'orp Tank Empty' }],
    [128, { name: 'probefault', desc: 'Probe Fault' }],
    [129, { name: 'phtanklow', desc: 'pH Tank Low' }],
    [130, { name: 'orptanklow', desc: 'orp Tank Low' }]
  ]);
  public chemControllerHardwareFaults: byteValueMap = new byteValueMap([
    [0, { name: 'ok', desc: 'Ok - No Faults' }],
    [1, { name: 'phprobe', desc: 'pH Probe Fault' }],
    [2, { name: 'phpump', desc: 'pH Pump Fault' }],
    [3, { name: 'orpprobe', desc: 'ORP Probe Fault' }],
    [4, { name: 'orppump', desc: 'ORP Pump Fault' }],
    [5, { name: 'chlormismatch', desc: 'Chlorinator body mismatch' }],
    [6, { name: 'invalidbody', desc: 'Body capacity not valid' }],
    [7, { name: 'flowsensor', desc: 'Flow Sensor Fault' }]
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
    [1, { name: 'phlockout', desc: 'pH Lockout - ORP will not dose' }],
    [2, { name: 'phdailylimit', desc: 'pH Daily Limit Reached' }],
    [4, { name: 'orpdailylimit', desc: 'orp Daily Limit Reached' }],
    [128, { name: 'commslost', desc: 'Communications with Chem Controller Lost' }] // to be verified
  ]);
  public chemControllerDosingStatus: byteValueMap = new byteValueMap([
    [0, { name: 'dosing', desc: 'Dosing' }],
    [1, { name: 'mixing', desc: 'Mixing' }],
    [2, { name: 'monitoring', desc: 'Monitoring' }]
  ]);
  public acidTypes: byteValueMap = new byteValueMap([
    [0, { name: 'a34.6', desc: '34.6% - 22 Baume', dosingFactor: 0.909091 }],
    [1, { name: 'a31.45', desc: '31.45% - 20 Baume', dosingFactor: 1 }],
    [2, { name: 'a29', desc: '29% - 19 Baume', dosingFactor: 1.08448 }],
    [3, { name: 'a28', desc: '28.3% - 18 Baume', dosingFactor: 1.111111 }],
    [4, { name: 'a15.7', desc: '15.7% - 10 Baume', dosingFactor: 2.0 }],
    [5, { name: 'a14.5', desc: '14.5% - 9.8 Baume', dosingFactor: 2.16897 }],
  ]);
  public filterTypes: byteValueMap = new byteValueMap([
    [0, { name: 'sand', desc: 'Sand', hasBackwash: true }],
    [1, { name: 'cartridge', desc: 'Cartridge', hasBackwash: false }],
    [2, { name: 'de', desc: 'Diatom Earth', hasBackwash: true }],
    [3, { name: 'unknown', desc: 'Unknown' }]
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
  public eqMessageSeverities: byteValueMap = new byteValueMap([
    [-1, { name: 'unspecified', desc: 'Unspecified' }],
    [0, { name: 'info', desc: 'Information' }],
    [1, { name: 'reminder', desc: 'Reminder' }],
    [2, { name: 'alert', desc: 'Alert' }],
    [3, { name: 'warning', desc: 'Warning' }],
    [4, { name: 'error', desc: 'Error' }],
    [5, { name: 'fatal', desc: 'Fatal' }]
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
  protected _statusTimer: NodeJS.Timeout;
  protected _statusCheckRef: number = 0;
  protected _statusInterval: number = 3000;

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
    console.log(`Stopping sys`);
    //sys.board.virtualChlorinatorController.stop();
    if (sys.controllerType === ControllerType.Virtual) this.turnOffAllCircuits();
    // sys.board.virtualChemControllers.stop();
    this.killStatusCheck();
    await ncp.closeAsync();
    // return sys.board.virtualPumpControllers.stopAsync()
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
    // sys.board.virtualPumpControllers.setTargetSpeed();
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
  //public virtualChlorinatorController = new VirtualChlorinatorController(this);
  // public virtualPumpControllers = new VirtualPumpController(this);
  // public virtualChemControllers = new VirtualChemController(this);

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
  public get statusInterval(): number { return this._statusInterval }
  protected killStatusCheck() {
    if (typeof this._statusTimer !== 'undefined' && this._statusTimer) clearTimeout(this._statusTimer);
    this._statusTimer = undefined;
    this._statusCheckRef = 0;
  }
  public suspendStatus(bSuspend: boolean) {
    // The way status suspension works is by using a reference value that is incremented and decremented
    // the status check is only performed when the reference value is 0.  So suspending the status check 3 times and un-suspending
    // it 2 times will still result in the status check being suspended.  This method also ensures the reference never falls below 0.
    if (bSuspend) this._statusCheckRef++;
    else this._statusCheckRef = Math.max(0, this._statusCheckRef - 1);
    logger.verbose(`Suspending status check: ${bSuspend} -- ${this._statusCheckRef}`);
  }
  /// This method processes the status message periodically.  The role of this method is to verify the circuit, valve, and heater
  /// relays.  This method does not control RS485 operations such as pumps and chlorinators.  These are done through the respective
  /// equipment polling functions.
    public async processStatusAsync() {
        let self = this;
        try {
            if (this._statusCheckRef > 0) return;
            this.suspendStatus(true);
            if (typeof this._statusTimer !== 'undefined' && this._statusTimer) clearTimeout(this._statusTimer);
            // Go through all the assigned equipment and verify the current state.
            sys.board.system.keepManualTime();
            await sys.board.circuits.syncCircuitRelayStates();
            await sys.board.features.syncGroupStates();
            await sys.board.circuits.syncVirtualCircuitStates();
            await sys.board.valves.syncValveStates();
            await sys.board.filters.syncFilterStates();
            await sys.board.heaters.syncHeaterStates();
            await sys.board.schedules.syncScheduleStates();
            state.emitControllerChange();
            state.emitEquipmentChanges();
        } catch (err) { state.status = 255; logger.error(`Error performing processStatusAsync ${err.message}`); }
        finally {
            this.suspendStatus(false);
            if (this.statusInterval > 0) this._statusTimer = setTimeout(() => self.processStatusAsync(), this.statusInterval);
        }
    }
  public async setControllerType(obj): Promise<Equipment> {
    try {
      if (obj.controllerType !== sys.controllerType)
        return Promise.reject(new InvalidEquipmentDataError(`You may not change the controller type data for ${sys.controllerType} controllers`, 'controllerType', obj.controllerType));
      return sys.equipment;
    } catch (err) { }
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
    try {
      // every minute, updated the time from the system clock in server mode
      // but only for Virtual.  Likely 'manual' on *Center means OCP time
      if (sys.general.options.clockSource !== 'server') return;
      state.time.setTimeFromSystemClock();
      sys.board.system.setTZ();
    } catch (err) { logger.error(`Error setting manual time: ${err.message}`); }
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
      sys.equipment.tempSensors.setCalibration('water4', parseFloat(obj.waterTempAdj4));
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
      sys.equipment.tempSensors.setCalibration('solar4', parseFloat(obj.solarTempAdj4));
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
          case 'airSensor':
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
      sys.board.heaters.syncHeaterStates();
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
        // sys.board.system.syncCustomNamesValueMap(); Each custom name promise is already syncing the bytevalue array

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
  public async initFilters() {
    try {
      let filter: Filter;
      let sFilter: FilterState;
      if (sys.equipment.maxBodies > 0) {
        filter = sys.filters.getItemById(1, true, { filterType: 3, name: sys.equipment.shared ? 'Filter' : 'Filter 1' });
        sFilter = state.filters.getItemById(1, true, { name: filter.name });
        filter.isActive = true;
        filter.master = sys.board.equipmentMaster;
        filter.body = sys.equipment.shared ? sys.board.valueMaps.bodies.transformByName('poolspa') : 0;
        sFilter = state.filters.getItemById(1, true);
        sFilter.body = filter.body;
        sFilter.filterType = filter.filterType;
        sFilter.name = filter.name;
        if (sys.equipment.dual) {
          filter = sys.filters.getItemById(2, true, { filterType: 3, name: 'Filter 2' });
          filter.isActive = true;
          filter.master = sys.board.equipmentMaster;
          filter.body = 1;
          sFilter = state.filters.getItemById(2, true);
          sFilter.body = filter.body;
          sFilter.filterType = filter.filterType;
          sFilter.name = filter.name;

        }
        else {
          sys.filters.removeItemById(2);
          state.filters.removeItemById(2);
        }
      }
      else {
        sys.filters.removeItemById(1);
        state.filters.removeItemById(1);
        sys.filters.removeItemById(2);
        state.filters.removeItemById(2);
      }
    } catch (err) { logger.error(`Error initializing filters`); }
  }
  public async setBodyAsync(obj: any): Promise<Body> {
    return new Promise<Body>(function (resolve, reject) {
      let id = parseInt(obj.id, 10); 1
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
  public async setHeatModeAsync(body: Body, mode: number): Promise<BodyTempState> {
    let bdy = sys.bodies.getItemById(body.id);
    let bstate = state.temps.bodies.getItemById(body.id);
    bdy.heatMode = bstate.heatMode = mode;
    sys.board.heaters.syncHeaterStates();
    state.emitEquipmentChanges();
    return Promise.resolve(bstate);
  }
  public async setHeatSetpointAsync(body: Body, setPoint: number): Promise<BodyTempState> {
    let bdy = sys.bodies.getItemById(body.id);
    let bstate = state.temps.bodies.getItemById(body.id);
    bdy.setPoint = bstate.setPoint = setPoint;
    state.emitEquipmentChanges();
    sys.board.heaters.syncHeaterStates();
    return Promise.resolve(bstate);
  }
  public async setCoolSetpointAsync(body: Body, setPoint: number): Promise<BodyTempState> {
    let bdy = sys.bodies.getItemById(body.id);
    let bstate = state.temps.bodies.getItemById(body.id);
    bdy.coolSetpoint = bstate.coolSetpoint = setPoint;
    state.emitEquipmentChanges();
    sys.board.heaters.syncHeaterStates();
    return Promise.resolve(bstate);
  }
  public getHeatSources(bodyId: number) {
    let heatSources = [];
    let heatTypes = this.board.heaters.getInstalledHeaterTypes(bodyId);
    heatSources.push(this.board.valueMaps.heatSources.transformByName('nochange'));
    if (heatTypes.total > 0) heatSources.push(this.board.valueMaps.heatSources.transformByName('off'));
    if (heatTypes.gas > 0) heatSources.push(this.board.valueMaps.heatSources.transformByName('heater'));
    if (heatTypes.solar > 0) {
      let hm = this.board.valueMaps.heatSources.transformByName('solar');
      heatSources.push(hm);
      if (heatTypes.total > 1) heatSources.push(this.board.valueMaps.heatSources.transformByName('solarpref'));
    }
    if (heatTypes.heatpump > 0) {
      let hm = this.board.valueMaps.heatSources.transformByName('heatpump');
      heatSources.push(hm);
      if (heatTypes.total > 1) heatSources.push(this.board.valueMaps.heatSources.transformByName('heatpumppref'));
    }
    if (heatTypes.ultratemp > 0) {
      let hm = this.board.valueMaps.heatSources.transformByName('ultratemp');
      heatSources.push(hm);
      if (heatTypes.total > 1) heatSources.push(this.board.valueMaps.heatSources.transformByName('ultratemppref'));
    }
    return heatSources;
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
      heatModes.push(hm);
      if (heatTypes.total > 1) heatModes.push(this.board.valueMaps.heatModes.transformByName('heatpumppref'));
    }
    if (heatTypes.ultratemp > 0) {
      let hm = this.board.valueMaps.heatModes.transformByName('ultratemp');
      heatModes.push(hm);
      if (heatTypes.total > 1) heatModes.push(this.board.valueMaps.heatModes.transformByName('ultratemppref'));
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
  public getBodyState(bodyCode: number): BodyTempState {
    let assoc = sys.board.valueMaps.bodies.transform(bodyCode);
    switch (assoc.name) {
      case 'body1':
      case 'pool':
        return state.temps.bodies.getItemById(1);
      case 'body2':
      case 'spa':
        return state.temps.bodies.getItemById(2);
      case 'body3':
        return state.temps.bodies.getItemById(3);
      case 'body4':
        return state.temps.bodies.getItemById(4);
      case 'poolspa':
        if (sys.equipment.shared && sys.equipment.maxBodies >= 2) {
          let body = state.temps.bodies.getItemById(1);
          if (body.isOn) return body;
          body = state.temps.bodies.getItemById(2);
          if (body.isOn) return body;
          return state.temps.bodies.getItemById(1);
        }
        else
          return state.temps.bodies.getItemById(1);
    }
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
    try {
      let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
      if (id <= 0) id = sys.pumps.filter(elem => elem.master === 1).getMaxId(false, 49) + 1;
      data.id = id;
      if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid pump id: ${data.id}`, data.id, 'Pump'));
      let pump = sys.pumps.getItemById(id, true);
      await ncp.pumps.setPumpAsync(pump, data);
      let spump = state.pumps.getItemById(id, true);
      spump.emitData('pumpExt', spump.getExtended());
      spump.emitEquipmentChange();
      return Promise.resolve(pump);
    }
    catch (err) {
      logger.error(`Error setting pump: ${err}`);
      return Promise.reject(err);
    }
  }
  public async deletePumpAsync(data: any): Promise<Pump> {
    if (typeof data.id !== 'undefined') {
      try {
        let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
        if (isNaN(id) || id <= 0) return Promise.reject(new InvalidEquipmentIdError(`Invalid pump id: ${data.id}`, data.id, 'Pump'));
        let pump = sys.pumps.getItemById(id, false);
        let spump = state.pumps.getItemById(id, false);
        await ncp.pumps.deletePumpAsync(pump.id);
        spump.isActive = pump.isActive = false;
        sys.pumps.removeItemById(id);
        state.pumps.removeItemById(id);
        spump.emitEquipmentChange();
        return Promise.resolve(pump);
      }
      catch (err) {
        return Promise.reject(err);
      }
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
        // pump.isActive = true;
        // pump.isVirtual = true;
        pump.master = 1;
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
}
export class CircuitCommands extends BoardCommands {
  public async syncCircuitRelayStates() {
    try {
      for (let i = 0; i < sys.circuits.length; i++) {
        // Run through all the valves to see whether they should be triggered or not.
        let circ = sys.circuits.getItemByIndex(i);
        if (circ.master === 1 && circ.isActive) {
          let cstate = state.circuits.getItemById(circ.id);
          if (cstate.isOn) await ncp.circuits.setCircuitStateAsync(cstate, cstate.isOn);
        }
      }
    } catch (err) { logger.error(`syncCircuitRelayStates: Error synchronizing circuit relays ${err.message}`); }
  }

  public syncVirtualCircuitStates() {
    try {
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
    } catch (err) { logger.error(`Error syncronizing virtual circuits`); }
  }
  public async setCircuitStateAsync(id: number, val: boolean): Promise<ICircuitState> {
    sys.board.suspendStatus(true);
    try {
      // We need to do some routing here as it is now critical that circuits, groups, and features
      // have their own processing.  The virtual controller used to only deal with one circuit.
      if (sys.board.equipmentIds.circuitGroups.isInRange(id))
        return await sys.board.circuits.setCircuitGroupStateAsync(id, val);
      else if (sys.board.equipmentIds.features.isInRange(id))
        return await sys.board.features.setFeatureStateAsync(id, val);
      let circuit: ICircuit = sys.circuits.getInterfaceById(id, false, { isActive: false });
      if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Circuit or Feature id ${id} not valid`, id, 'Circuit'));
      let circ = state.circuits.getInterfaceById(id, circuit.isActive !== false);
      let newState = utils.makeBool(val);
      // First, if we are turning the circuit on, lets determine whether the circuit is a pool or spa circuit and if this is a shared system then we need
      // to turn off the other body first.
      //[12, { name: 'pool', desc: 'Pool', hasHeatSource: true }],
      //[13, { name: 'spa', desc: 'Spa', hasHeatSource: true }]
      let func = sys.board.valueMaps.circuitFunctions.get(circuit.type);
      if (newState && (func.name === 'pool' || func.name === 'spa') && sys.equipment.shared === true) {
        console.log(`Turning off shared body circuit`);
        // If we are shared we need to turn off the other circuit.
        let offType = func.name === 'pool' ? sys.board.valueMaps.circuitFunctions.getValue('spa') : sys.board.valueMaps.circuitFunctions.getValue('pool');
        let off = sys.circuits.get().filter(elem => elem.type === offType);
        // Turn the circuits off that are part of the shared system.  We are going back to the board
        // just in case we got here for a circuit that isn't on the current defined panel.
        for (let i = 0; i < off.length; i++) {
          let coff = off[i];
          await sys.board.circuits.setCircuitStateAsync(coff.id, false);
        }
      }
      if (id === 6) state.temps.bodies.getItemById(1, true).isOn = val;
      else if (id === 1) state.temps.bodies.getItemById(2, true).isOn = val;
      // Let the main nixie controller set the circuit state and affect the relays if it needs to.
      await ncp.circuits.setCircuitStateAsync(circ, newState);
      return state.circuits.getInterfaceById(circ.id);
    }
    catch (err) { return Promise.reject(`Nixie: Error setCircuitStateAsync ${err.message}`); }
    finally {
      // sys.board.virtualPumpControllers.start();
      ncp.pumps.syncPumpStates();
      sys.board.suspendStatus(false);
      this.board.processStatusAsync();
      state.emitEquipmentChanges();
    }
  }
  public async toggleCircuitStateAsync(id: number): Promise<ICircuitState> {
    let circ = state.circuits.getInterfaceById(id);
    return await this.setCircuitStateAsync(id, !(circ.isOn || false));
  }
  public async setLightThemeAsync(id: number, theme: number) {
    let cstate = state.circuits.getItemById(id);
    let circ = sys.circuits.getItemById(id);
    let thm = sys.board.valueMaps.lightThemes.findItem(theme);
    if (typeof thm !== 'undefined' && typeof thm.sequence !== 'undefined' && circ.master === 1) {
      await sys.board.circuits.setCircuitStateAsync(id, true);
      await ncp.circuits.sendOnOffSequenceAsync(id, thm.sequence);
    }
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
  public getCircuitNames() { return [...sys.board.valueMaps.circuitNames.toArray(), ...sys.board.valueMaps.customNames.toArray()]; }
  public async setCircuitAsync(data: any): Promise<ICircuit> {
    try {
      let id = parseInt(data.id, 10);
      if (id <= 0 || typeof data.id === 'undefined') {
        // We are adding a new circuit.  If we are operating as a nixie controller then we need to start this
        // circuit outside the range of circuits that can be defined on the panel.  For any of the non-OCP controllers
        // these are added within the range of the circuits starting with 1.  For all others these are added with an id > 255.
        switch (state.equipment.controllerType) {
          case 'intellicenter':
          case 'intellitouch':
          case 'easytouch':
            id = sys.circuits.getNextEquipmentId(new EquipmentIdRange(255, 300));
            break;
          default:
            id = sys.circuits.getNextEquipmentId(sys.board.equipmentIds.circuits, [1, 6]);
            break;
        }
      }
      if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid circuit id: ${data.id}`, data.id, 'Circuit'));
      //if (!sys.board.equipmentIds.circuits.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Circuit id is out of range: ${id}`, data.id, 'Circuit'));;
      if (typeof data.id !== 'undefined') {
        let circuit = sys.circuits.getItemById(id, true);
        let scircuit = state.circuits.getItemById(id, true);
        circuit.isActive = true;
        circuit.master = 1;
        scircuit.isOn = false;
        if (data.name) circuit.name = scircuit.name = data.name;
        else if (!circuit.name && !data.name) circuit.name = scircuit.name = `circuit${data.id}`;
        if (typeof data.type !== 'undefined' || typeof circuit.type === 'undefined') {
          circuit.type = scircuit.type = parseInt(data.type, 10) || 0;
        }
        if (id === 6) circuit.type = sys.board.valueMaps.circuitFunctions.getValue('pool');
        if (id === 1 && sys.equipment.shared) circuit.type = sys.board.valueMaps.circuitFunctions.getValue('spa');
        if (typeof data.freeze !== 'undefined' || typeof circuit.freeze === 'undefined') circuit.freeze = utils.makeBool(data.freeze) || false;
        if (typeof data.showInFeatures !== 'undefined' || typeof data.showInFeatures === 'undefined') circuit.showInFeatures = scircuit.showInFeatures = utils.makeBool(data.showInFeatures) || true;
        if (typeof data.dontStop !== 'undefined' && utils.makeBool(data.dontStop) === true) data.eggTimer = 1440;
        if (typeof data.eggTimer !== 'undefined' || typeof circuit.eggTimer === 'undefined') circuit.eggTimer = parseInt(data.eggTimer, 10) || 0;
        if (typeof data.connectionId !== 'undefined') circuit.connectionId = data.connectionId;
        if (typeof data.deviceBinding !== 'undefined') circuit.deviceBinding = data.deviceBinding;
        if (typeof data.showInFeatures !== 'undefined') scircuit.showInFeatures = circuit.showInFeatures = utils.makeBool(data.showInFeatures);
        circuit.dontStop = circuit.eggTimer === 1440;
        sys.emitEquipmentChange();
        state.emitEquipmentChanges();
        if (circuit.master === 1) await ncp.circuits.setCircuitAsync(circuit, data);
        return Promise.resolve(circuit);
      }
      else
        return Promise.reject(new Error('Circuit id has not been defined'));
    }
    catch (err) { logger.error(`setCircuitAsync error with ${data}. ${err}`); return Promise.reject(err); }
  }
  public async setCircuitGroupAsync(obj: any): Promise<CircuitGroup> {
    let group: CircuitGroup = null;
    let sgroup: CircuitGroupState = null;
    let type = 0;
    let id = typeof obj.id !== 'undefined' ? parseInt(obj.id, 10) : -1;
    let isAdd = false;
    if (id <= 0) {
      // We are adding a circuit group so we need to get the next equipment id.  For circuit groups and light groups, they share ids.
      let range = sys.board.equipmentIds.circuitGroups;
      for (let i = range.start; i <= range.end; i++) {
        if (!sys.lightGroups.find(elem => elem.id === i) && !sys.circuitGroups.find(elem => elem.id === i)) {
          id = i;
          break;
        }
      }
      type = parseInt(obj.type, 10) || 2;
      group = sys.circuitGroups.getItemById(id, true);
      sgroup = state.circuitGroups.getItemById(id, true);
      isAdd = true;
    }
    else {
      group = sys.circuitGroups.getItemById(id, false);
      sgroup = state.circuitGroups.getItemById(id, false);
      type = group.type;
    }
    if (typeof id === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Max circuit group ids exceeded: ${id}`, id, 'circuitGroup'));
    if (isNaN(id) || !sys.board.equipmentIds.circuitGroups.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid circuit group id: ${obj.id}`, obj.id, 'circuitGroup'));
    return new Promise<CircuitGroup>((resolve, reject) => {
      if (typeof obj.nameId !== 'undefined') {
        group.nameId = obj.nameId;
        group.name = sys.board.valueMaps.circuitNames.transform(obj.nameId).desc;
      }
      else if (typeof obj.name !== 'undefined') group.name = obj.name;
      if (typeof obj.dontStop !== 'undefined' && utils.makeBool(obj.dontStop) === true) obj.eggTimer = 1440;
      if (typeof obj.eggTimer !== 'undefined') group.eggTimer = Math.min(Math.max(parseInt(obj.eggTimer, 10), 0), 1440);
      if (typeof obj.showInFeatures !== 'undefined') group.showInFeatures = utils.makeBool(obj.showInFeatures);
      group.dontStop = group.eggTimer === 1440;
      group.isActive = true;
      // group.type = 2;
      if (typeof obj.circuits !== 'undefined') {
        for (let i = 0; i < obj.circuits.length; i++) {
          let c = group.circuits.getItemByIndex(i, true, { id: i + 1 });
          let cobj = obj.circuits[i];
          if (typeof cobj.circuit !== 'undefined') c.circuit = cobj.circuit;
          if (typeof cobj.desiredState !== 'undefined')
            c.desiredState = parseInt(cobj.desiredState, 10);
          else if (typeof cobj.desiredStateOn !== 'undefined') {
            c.desiredState = utils.makeBool(cobj.desiredStateOn) ? 0 : 1;
          }
        }
      }
      let sgroup = state.circuitGroups.getItemById(id, true);
      sgroup.name = group.name;
      sgroup.type = group.type;
      sgroup.showInFeatures = group.showInFeatures;
      sgroup.isActive = group.isActive;
      sgroup.type = group.type;
      sys.board.features.syncGroupStates();
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
    //if (!sys.board.equipmentIds.circuitGroups.isInRange(id)) return;
    if (typeof id !== 'undefined') {
      let group = sys.circuitGroups.getItemById(id, false);
      let sgroup = state.circuitGroups.getItemById(id, false);
      sys.circuitGroups.removeItemById(id);
      state.circuitGroups.removeItemById(id);
      group.isActive = false;
      sgroup.isOn = false;
      sgroup.isActive = false;
      sgroup.showInFeatures = false;
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
    if (circuit.master === 1) await ncp.circuits.deleteCircuitAsync(circuit.id);
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
        let circuit = grp.circuits.getItemByIndex(i);
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
    logger.info(`Setting Circuit Group State`);
    let gstate = (grp.dataName === 'circuitGroupConfig') ? state.circuitGroups.getItemById(grp.id, grp.isActive !== false) : state.lightGroups.getItemById(grp.id, grp.isActive !== false);
    let circuits = grp.circuits.toArray();
    let arr = [];
    for (let i = 0; i < circuits.length; i++) {
      let circuit = circuits[i];
      // if the circuit group is turned on, we want the desired state of the individual circuits;
      // if the circuit group is turned off, we want the opposite of the desired state
      arr.push(sys.board.circuits.setCircuitStateAsync(circuit.circuit, val ? circuit.desiredState : !circuit.desiredState));
    }
    return new Promise<ICircuitGroupState>(async (resolve, reject) => {
      await Promise.all(arr).catch((err) => { reject(err) });
      gstate.emitEquipmentChange();
      sys.board.circuits.setEndTime(grp, gstate, val);
      gstate.isOn = val;
      resolve(gstate);
    });
  }
  public async setLightGroupStateAsync(id: number, val: boolean): Promise<ICircuitGroupState> {
    return sys.board.circuits.setCircuitGroupStateAsync(id, val);
  }
  public setEndTime(thing: ICircuit, thingState: ICircuitState, isOn: boolean, bForce: boolean= false) {
    /*
    this is a generic fn for circuits, features, circuitGroups, lightGroups
    to set the end time based on the egg timer.
    it will be called from set[]StateAsync calls as well as when then state is 
    eval'ed from status packets/external messages and schedule changes.
    instead of maintaining timers here which would increase the amount of 
    emits substantially, let the clients keep their own local timers
    or just display the end time.

    bForce is an override sent by the syncScheduleStates.  It gets set after the circuit gets set but we need to know if the sched is on.  This allows the circuit end time to be 
    re-evaluated even though it already has an end time.

    Logic gets fun here... 
    0. If the circuit is off, or has don't stop enabled, don't set an end time 
    0.1. If the circuit state hasn't changed, abort (unless bForce is true).
    1. If the schedule is on, the egg timer does not come into play
    2. If the schedule is off...
    2.1.  and the egg timer will turn off the circuit off before the schedule starts, use egg timer time
    2.2.  else if the schedule will start before the egg timer turns it off, use the schedule end time
    3. Iterate over each schedule for 1-2 above; nearest end time wins
    */
    try {
      if (thing.dontStop || !isOn) {
        thingState.endTime = undefined;
      }
      else if (!thingState.isOn && isOn || bForce) {
        let endTime: Timestamp;
        let eggTimerEndTime: Timestamp;
        // let remainingDuration: number;
        if (typeof thing.eggTimer !== 'undefined') {
          eggTimerEndTime = state.time.clone().addHours(0, thing.eggTimer);
        }
        // egg timers don't come into play if a schedule will control the circuit
        for (let i = 0; i < sys.schedules.length; i++) {
          let sched = sys.schedules.getItemByIndex(i);
          let ssched = state.schedules.getItemById(sched.id);
          if (sched.isActive && sys.board.schedules.includesCircuit(sched, thing.id)) {
            let nearestStartTime = sys.board.schedules.getNearestStartTime(sched);
            let nearestEndTime = sys.board.schedules.getNearestEndTime(sched);
            // if the schedule doesn't have an end date (eg no days)...
            if (nearestEndTime.getTime() === 0) continue;
            if (ssched.isOn) {
              if (typeof endTime === 'undefined' || nearestEndTime.getTime() < endTime.getTime()) {
                endTime = nearestEndTime.clone();
                eggTimerEndTime = undefined;
              }
            }
            else {
              if (typeof eggTimerEndTime !== 'undefined' && eggTimerEndTime.getTime() < nearestStartTime.getTime()) {
                if (typeof endTime === 'undefined' || eggTimerEndTime.getTime() < endTime.getTime()) endTime = eggTimerEndTime.clone();
              }
              else if (typeof endTime === 'undefined' || nearestEndTime.getTime() < endTime.getTime()) endTime = nearestEndTime.clone();
            }
          }
        }
        if (typeof endTime !== 'undefined') thingState.endTime = endTime;
        else if (typeof eggTimerEndTime !== 'undefined') thingState.endTime = eggTimerEndTime;
      }
    }
    catch (err) {
      logger.error(`Error setting end time for ${thing.id}: ${err}`)
    }
  }
}
export class FeatureCommands extends BoardCommands {
  public async setFeatureAsync(obj: any): Promise<Feature> {
    let id = parseInt(obj.id, 10);
    if (id <= 0 || isNaN(id)) {
      id = sys.features.getNextEquipmentId(sys.board.equipmentIds.features);
    }
    if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid feature id: ${obj.id}`, obj.id, 'Feature'));
    if (!sys.board.equipmentIds.features.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Feature id out of range: ${id}: ${sys.board.equipmentIds.features.start} to ${sys.board.equipmentIds.features.end}`, obj.id, 'Feature'));
    let feature = sys.features.getItemById(id, true);
    let sfeature = state.features.getItemById(id, true);
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
    try {
      if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid feature id: ${id}`, id, 'Feature'));
      if (!sys.board.equipmentIds.features.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid feature id: ${id}`, id, 'Feature'));
      let feature = sys.features.getItemById(id);
      let fstate = state.features.getItemById(feature.id, feature.isActive !== false);
      sys.board.circuits.setEndTime(feature, fstate, val);
      fstate.isOn = val;
      sys.board.valves.syncValveStates();
      // sys.board.virtualPumpControllers.start();
      ncp.pumps.syncPumpStates();
      state.emitEquipmentChanges();
      return fstate;
    } catch (err) { return Promise.reject(new Error(`Error setting feature state ${err.message}`)); }
  }
  public async toggleFeatureStateAsync(id: number): Promise<ICircuitState> {
    let feat = state.features.getItemById(id);
    return this.setFeatureStateAsync(id, !(feat.isOn || false));
  }
  public syncGroupStates() {
    try {
      for (let i = 0; i < sys.circuitGroups.length; i++) {
        let grp: CircuitGroup = sys.circuitGroups.getItemByIndex(i);
        let circuits = grp.circuits.toArray();
        let bIsOn = false;
        let bSyncOn = true;
        // This should only show the group as on if all the states are correct.
        if (grp.isActive) {
          for (let j = 0; j < circuits.length; j++) {
            let circuit: CircuitGroupCircuit = grp.circuits.getItemByIndex(j);
            let cstate = state.circuits.getInterfaceById(circuit.circuit);
            //logger.info(`Synchronizing circuit group ${cstate.name}: ${cstate.isOn} = ${circuit.desiredState}`);
            if (circuit.desiredState === 1 || circuit.desiredState === 0) {
              if (cstate.isOn === utils.makeBool(circuit.desiredState)) {
                bIsOn = true;
              }
              else bSyncOn = false;
            }
          }
        }
        let sgrp = state.circuitGroups.getItemById(grp.id);
        let isOn = bIsOn && bSyncOn && grp.isActive;
        if (isOn !== sgrp.isOn) {
          sys.board.circuits.setEndTime(grp, sgrp, isOn);
          sgrp.isOn = isOn;
        }
        sys.board.valves.syncValveStates();
      }
      // I am guessing that there will only be one here but iterate
      // just in case we expand.
      for (let i = 0; i < sys.lightGroups.length; i++) {
        let grp: LightGroup = sys.lightGroups.getItemByIndex(i);
        let bIsOn = false;
        if (grp.isActive) {
          let circuits = grp.circuits.toArray();
          for (let j = 0; j < circuits.length; j++) {
            let circuit = grp.circuits.getItemByIndex(j).circuit;
            let cstate = state.circuits.getInterfaceById(circuit);
            if (cstate.isOn) bIsOn = true;
          }
        }
        let sgrp = state.lightGroups.getItemById(grp.id);
        if (bIsOn !== sgrp.isOn) {
          sys.board.circuits.setEndTime(grp, sgrp, bIsOn);
          sgrp.isOn = bIsOn;
        }
      }
      state.emitEquipmentChanges();
    } catch (err) { logger.error(`Error synchronizing group circuits. ${err}`); }
  }
}
export class ChlorinatorCommands extends BoardCommands {
  public async setChlorAsync(obj: any): Promise<ChlorinatorState> {
    try {
      let id = parseInt(obj.id, 10);
      if (isNaN(id) || id <= 0) id = 1;
      let cchlor = sys.chlorinators.getItemById(id, true);
      await ncp.chlorinators.setChlorinatorAsync(cchlor, obj);
      let schlor = state.chlorinators.getItemById(cchlor.id, true);
      state.emitEquipmentChanges();
      return Promise.resolve(schlor);
    }
    catch (err) {
      logger.error(`Error setting chlorinator: ${err}`)
      return Promise.reject(err);
    }
  }
  public async deleteChlorAsync(obj: any): Promise<ChlorinatorState> {
    try {
      let id = parseInt(obj.id, 10);
      if (isNaN(id)) obj.id = 1;
      let chlor = state.chlorinators.getItemById(id);
      chlor.isActive = false;
      await ncp.chlorinators.deleteChlorinatorAsync(id);
      state.chlorinators.removeItemById(id);
      sys.chlorinators.removeItemById(id);
      chlor.emitEquipmentChange();
      state.emitEquipmentChanges();
      return Promise.resolve(chlor);
    }
    catch (err) {
      logger.error(`Error deleting chlorinator: ${err}`)
      return Promise.reject(err);
    }
  }
  public setChlorProps(chlor: Chlorinator, obj?: any) {
    if (typeof obj !== 'undefined') {
      for (var prop in obj) {
        if (prop in chlor) chlor[prop] = obj[prop];
      }
    }
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
    let coolSetpoint = typeof data.coolSetpoint !== 'undefined' ? data.coolSetpoint : sched.coolSetpoint || 100;
    let circuit = typeof data.circuit !== 'undefined' ? data.circuit : sched.circuit;
    let startTime = typeof data.startTime !== 'undefined' ? data.startTime : sched.startTime;
    let endTime = typeof data.endTime !== 'undefined' ? data.endTime : sched.endTime;
    let schedDays = sys.board.schedules.transformDays(typeof data.scheduleDays !== 'undefined' ? data.scheduleDays : sched.scheduleDays);
    let changeHeatSetpoint = typeof (data.changeHeatSetpoint !== 'undefined') ? data.changeHeatSetpoint : false;
    let display = typeof data.display !== 'undefined' ? data.display : sched.display || 0;

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
    sched.coolSetpoint = ssched.coolSetpoint = coolSetpoint;
    sched.heatSource = ssched.heatSource = heatSource;
    sched.startTime = ssched.startTime = startTime;
    sched.endTime = ssched.endTime = endTime;
    sched.startTimeType = ssched.startTimeType = startTimeType;
    sched.endTimeType = ssched.endTimeType = endTimeType;
    sched.startDate = ssched.startDate = startDate;
    sched.startYear = startDate.getFullYear();
    sched.startMonth = startDate.getMonth() + 1;
    sched.startDay = startDate.getDate();

    ssched.display = sched.display = display;
    if (typeof sched.startDate === 'undefined')
      sched.master = 1;
    await ncp.schedules.setScheduleAsync(sched, data);
    ssched.emitEquipmentChange();
    return sched;
  }
  public deleteScheduleAsync(data: any): Promise<Schedule> {
    let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
    if (isNaN(id) || id < 0) return Promise.reject(new InvalidEquipmentIdError(`Invalid schedule id: ${data.id}`, data.id, 'Schedule'));
    let sched = sys.schedules.getItemById(id, false);
    let ssched = state.schedules.getItemById(id, false);
    ssched.isActive = false;
    if (sched.master === 1) ncp.schedules.removeById(id);
    sys.schedules.removeItemById(id);
    state.schedules.removeItemById(id);
    ssched.emitEquipmentChange();
    return new Promise<Schedule>((resolve, reject) => { resolve(sched); });
  }
  public syncScheduleStates() {
    try {
      ncp.schedules.triggerSchedules();
      let dt = state.time.toDate();
      let dow = dt.getDay();
      // Convert the dow to the bit value.
      let sd = sys.board.valueMaps.scheduleDays.toArray().find(elem => elem.dow === dow);
      let dayVal = sd.bitVal || sd.val;  // The bitval allows mask overrides.
      let ts = dt.getHours() * 60 + dt.getMinutes();
      for (let i = 0; i < state.schedules.length; i++) {
        let schedIsOn: boolean;
        let ssched = state.schedules.getItemByIndex(i);
        let scirc = state.circuits.getInterfaceById(ssched.circuit);
        if (scirc.isOn &&
          (ssched.scheduleDays & dayVal) > 0 &&
          ts >= ssched.startTime && ts <= ssched.endTime) schedIsOn = true
        else schedIsOn = false;
        if (schedIsOn !== ssched.isOn) {
          // if the schedule state changes, it may affect the end time
          ssched.isOn = schedIsOn;
          sys.board.circuits.setEndTime(sys.circuits.getInterfaceById(ssched.circuit), scirc, scirc.isOn, true);
        }
        ssched.emitEquipmentChange();
      }
    } catch (err) { logger.error(`Error synchronizing schedule states`); }
  }
  public async setEggTimerAsync(data?: any): Promise<EggTimer> { return Promise.resolve(sys.eggTimers.getItemByIndex(1)); }
  public async deleteEggTimerAsync(data?: any): Promise<EggTimer> { return Promise.resolve(sys.eggTimers.getItemByIndex(1)); }
  public includesCircuit(sched: Schedule, circuit: number) {
    let bIncludes = false;
    if (circuit === sched.circuit) bIncludes = true;
    else if (sys.board.equipmentIds.circuitGroups.isInRange(sched.circuit)) {
      let circs = sys.circuitGroups.getItemById(sched.circuit).getExtended().circuits;
      for (let i = 0; i < circs.length; i++) {
        if (circs[i].circuit.id === circuit) bIncludes = true;
      }
    }
    return bIncludes;
  }
  public getNearestEndTime(sched: Schedule): Timestamp {
    let nearestEndTime = new Timestamp(new Date(0))
    let today = new Timestamp().startOfDay();
    let todayTime = state.time.hours * 60 + state.time.minutes;
    if (!sched.isActive) return nearestEndTime;
    let startDate = typeof sched.startDate !== 'undefined' ? new Timestamp(new Date(Math.max(new Timestamp(sched.startDate).getTime(), today.getTime()))).startOfDay() : today.startOfDay();
    let startDateDay = startDate.getDay();
    let days = sys.board.valueMaps.scheduleDays.transform(sched.scheduleDays).days;
    for (let i = 0; i < days.length; i++) {
      let schedDay = days[i].dow;
      let dateDiff = (schedDay + 7 - startDateDay) % 7;
      if (schedDay === startDateDay && sched.endTime < todayTime) dateDiff = 7;
      let endDateTime = startDate.clone().addHours(dateDiff * 24, sched.endTime);
      if (nearestEndTime.getTime() === 0 || endDateTime.getTime() < nearestEndTime.getTime()) nearestEndTime = endDateTime;
    }
    return nearestEndTime;
  }
  public getNearestStartTime(sched: Schedule): Timestamp {
    let nearestStartTime = new Timestamp(new Date(0))
    let today = new Timestamp().startOfDay();
    let todayTime = state.time.hours * 60 + state.time.minutes;
    if (!sched.isActive) return nearestStartTime;
    let startDate = typeof sched.startDate !== 'undefined' ? new Timestamp(new Date(Math.max(new Timestamp(sched.startDate).getTime(), today.getTime()))).startOfDay() : today.startOfDay();
    let startDateDay = startDate.getDay();
    let days = sys.board.valueMaps.scheduleDays.transform(sched.scheduleDays).days;
    for (let i = 0; i < days.length; i++) {
      let schedDay = days[i].dow;
      let dateDiff = (schedDay + 7 - startDateDay) % 7;
      if (schedDay === startDateDay && sched.startTime < todayTime) dateDiff = 7;
      let startDateTime = startDate.clone().addHours(dateDiff * 24, sched.startTime);
      if (nearestStartTime.getTime() === 0 || startDateTime.getTime() < nearestStartTime.getTime()) nearestStartTime = startDateTime;
    }
    return nearestStartTime;
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
        if (heater.coolingEnabled === true && type.hasCoolSetpoint === true) inst['hasCoolSetpoint'] = true;
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
    try {
      let id = typeof obj.id === 'undefined' ? -1 : parseInt(obj.id, 10);
      if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Heater Id is not valid.', obj.id, 'Heater'));
      else if (id < 256 && id > 0) return Promise.reject(new InvalidEquipmentIdError('Virtual Heaters controlled by njspc must have an Id > 256.', obj.id, 'Heater'));
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
      //hstate.isVirtual = heater.isVirtual = true;
      hstate.name = heater.name;
      hstate.type = heater.type;
      heater.master = 1;
      if (heater.master === 1) await ncp.heaters.setHeaterAsync(heater, obj);
      await sys.board.heaters.updateHeaterServices();
      await sys.board.heaters.syncHeaterStates();
      return heater;
    } catch (err) { return Promise.reject(new Error(`Error setting heater configuration: ${err}`)); }
  }
  public async deleteHeaterAsync(obj: any): Promise<Heater> {
    try {
      let id = parseInt(obj.id, 10);
      if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Cannot delete.  Heater Id is not valid.', obj.id, 'Heater'));
      let heater = sys.heaters.getItemById(id);
      heater.isActive = false;
      if (heater.master === 1) await ncp.heaters.deleteHeaterAsync(heater.id);
      sys.heaters.removeItemById(id);
      state.heaters.removeItemById(id);
      sys.board.heaters.updateHeaterServices();
      sys.board.heaters.syncHeaterStates();
      return heater;
    } catch (err) { return Promise.reject(`Error deleting heater: ${err.message}`) }
  }
  public updateHeaterServices() {
    let htypes = sys.board.heaters.getInstalledHeaterTypes();
    let solarInstalled = htypes.solar > 0;
    let heatPumpInstalled = htypes.heatpump > 0;
    let gasHeaterInstalled = htypes.gas > 0;

    if (sys.heaters.length > 0) sys.board.valueMaps.heatSources = new byteValueMap([[0, { name: 'off', desc: 'Off' }]]);
    if (gasHeaterInstalled) sys.board.valueMaps.heatSources.set(3, { name: 'heater', desc: 'Heater' });
    if (solarInstalled && (gasHeaterInstalled || heatPumpInstalled)) sys.board.valueMaps.heatSources.merge([[5, { name: 'solar', desc: 'Solar Only' }], [21, { name: 'solarpref', desc: 'Solar Preferred' }]]);
    else if (solarInstalled) sys.board.valueMaps.heatSources.set(5, { name: 'solar', desc: 'Solar' });
    if (heatPumpInstalled && (gasHeaterInstalled || solarInstalled)) sys.board.valueMaps.heatSources.merge([[9, { name: 'heatpump', desc: 'Heatpump Only' }], [25, { name: 'heatpumppref', desc: 'Heat Pump Preferred' }]]);
    else if (heatPumpInstalled) sys.board.valueMaps.heatSources.set(9, { name: 'heatpump', desc: 'Heat Pump' });
    sys.board.valueMaps.heatSources.set(32, { name: 'nochange', desc: 'No Change' });

    sys.board.valueMaps.heatModes = new byteValueMap([[0, { name: 'off', desc: 'Off' }]]);
    if (gasHeaterInstalled) sys.board.valueMaps.heatModes.set(3, { name: 'heater', desc: 'Heater' });
    if (solarInstalled && (gasHeaterInstalled || heatPumpInstalled)) sys.board.valueMaps.heatModes.merge([[5, { name: 'solar', desc: 'Solar Only' }], [21, { name: 'solarpref', desc: 'Solar Preferred' }]]);
    else if (solarInstalled) sys.board.valueMaps.heatModes.set(5, { name: 'solar', desc: 'Solar' });
    if (heatPumpInstalled && (gasHeaterInstalled || solarInstalled)) sys.board.valueMaps.heatModes.merge([[9, { name: 'heatpump', desc: 'Heatpump Only' }], [25, { name: 'heatpumppref', desc: 'Heat Pump Preferred' }]]);
    else if (heatPumpInstalled) sys.board.valueMaps.heatModes.set(9, { name: 'heatpump', desc: 'Heat Pump' });
    // Now set the body data.
    for (let i = 0; i < sys.bodies.length; i++) {
      let body = sys.bodies.getItemByIndex(i);
      let btemp = state.temps.bodies.getItemById(body.id, body.isActive !== false);
      let opts = sys.board.heaters.getInstalledHeaterTypes(body.id);
      btemp.heaterOptions = opts;
    }
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
    try {
      // Go through the installed heaters and bodies to determine whether they should be on.  If there is a
      // heater that is not controlled by the OCP then we need to determine whether it should be on.
      let heaters = sys.heaters.toArray();
      let bodies = state.temps.bodies.toArray();
      let hon = [];
      for (let i = 0; i < bodies.length; i++) {
        let body: BodyTempState = bodies[i];
        let cfgBody: Body = sys.bodies.getItemById(body.id);
        let isHeating = false;
        if (body.isOn) {
          if (typeof body.temp === 'undefined' && heaters.length > 0) logger.warn(`The body temperature for ${body.name} cannot be determined. Heater status for this body cannot be calculated.`);
          for (let j = 0; j < heaters.length; j++) {
            let heater: Heater = heaters[j];
            if (heater.isActive === false) continue;
            let isOn = false;
            let isCooling = false;
            let sensorTemp = state.temps.waterSensor1;
            if (body.id === 4) sensorTemp = state.temps.waterSensor4;
            if (body.id === 3) sensorTemp = state.temps.waterSensor3;
            if (body.id === 2 && !sys.equipment.shared) sensorTemp = state.temps.waterSensor2;

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
            // logger.silly(`Heater ${heater.name} is ${isAssociated === true ? '' : 'not '}associated with ${body.name}`);
            if (isAssociated) {
              let htype = sys.board.valueMaps.heaterTypes.transform(heater.type);
              let status = sys.board.valueMaps.heatStatus.transform(body.heatStatus);
              let hstate = state.heaters.getItemById(heater.id, true);
              if (heater.isVirtual === true || heater.master === 1) {
                // We need to do our own calculation as to whether it is on.  This is for Nixie heaters.
                let mode = sys.board.valueMaps.heatModes.getName(body.heatMode);
                switch (htype.name) {
                  case 'solar':
                    if (mode === 'solar' || mode === 'solarpref') {
                      // Measure up against start and stop temp deltas for effective solar heating.
                      if (body.temp < cfgBody.heatSetpoint &&
                        state.temps.solar > body.temp + (hstate.isOn ? heater.stopTempDelta : heater.startTempDelta)) {
                        isOn = true;
                        body.heatStatus = sys.board.valueMaps.heatStatus.getValue('solar');
                        isHeating = true;
                      }
                      else if (heater.coolingEnabled && body.temp > cfgBody.coolSetpoint && state.heliotrope.isNight &&
                        state.temps.solar > body.temp + (hstate.isOn ? heater.stopTempDelta : heater.startTempDelta)) {
                        isOn = true;
                        body.heatStatus = sys.board.valueMaps.heatStatus.getValue('cooling');
                        isHeating = true;
                        isCooling = true;
                      }
                      //else if (heater.coolingEnabled && state.time.isNight)
                    }
                    break;
                  case 'ultratemp':
                    // We need to determine whether we are going to use the air temp or the solar temp
                    // for the sensor.
                    let deltaTemp = Math.max(state.temps.air, state.temps.solar || 0);
                    if (mode === 'ultratemp' || mode === 'ultratemppref') {
                      if (body.temp < cfgBody.heatSetpoint &&
                        deltaTemp > body.temp + heater.differentialTemp || 0) {
                        isOn = true;
                        body.heatStatus = sys.board.valueMaps.heatStatus.getValue('hpheat');
                        isHeating = true;
                        isCooling = false;
                      }
                      else if (body.temp > cfgBody.coolSetpoint && heater.coolingEnabled) {
                        isOn = true;
                        body.heatStatus = sys.board.valueMaps.heatStatus.getValue('hpcool');
                        isHeating = true;
                        isCooling = true;
                      }
                    }
                    break;
                  case 'gas':
                    if (mode === 'heater') {
                      if (body.temp < cfgBody.setPoint) {
                        isOn = true;
                        body.heatStatus = sys.board.valueMaps.heatStatus.getValue('heater');
                        isHeating = true;
                      }
                    }
                    else if (mode === 'solarpref' || mode === 'heatpumppref') {
                      // If solar should be running gas heater should be off.
                      if (body.temp < cfgBody.setPoint &&
                        state.temps.solar > body.temp + (hstate.isOn ? heater.stopTempDelta : heater.startTempDelta)) isOn = false;
                      else if (body.temp < cfgBody.setPoint) {
                        isOn = true;
                        body.heatStatus = sys.board.valueMaps.heatStatus.getValue('heater');
                        isHeating = true;
                      }
                    }
                    break;
                  case 'heatpump':
                    if (mode === 'heatpump' || mode === 'heatpumppref') {
                      if (body.temp < cfgBody.setPoint &&
                        state.temps.solar > body.temp + (hstate.isOn ? heater.stopTempDelta : heater.startTempDelta)) {
                        isOn = true;
                        body.heatStatus = sys.board.valueMaps.heatStatus.getValue('heater');
                        isHeating = true;
                      }
                    }
                    break;
                  default:
                    isOn = utils.makeBool(hstate.isOn);
                    break;
                }
                logger.debug(`Heater Type: ${htype.name} Mode:${mode} Temp: ${body.temp} Setpoint: ${cfgBody.setPoint} Status: ${body.heatStatus}`);
              }
              if (isOn === true && typeof hon.find(elem => elem === heater.id) === 'undefined') {
                hon.push(heater.id);
                if (heater.master === 1 && isOn) (async () => {
                  try {
                    await ncp.heaters.setHeaterStateAsync(hstate, isOn, isCooling);
                  } catch (err) { logger.error(err.message); }
                })();
                else hstate.isOn = isOn;
              }
            }
          }
        }
        // When the controller is a virtual one we need to control the heat status ourselves.
        if (!isHeating && (sys.controllerType === ControllerType.Virtual || sys.controllerType === ControllerType.Nixie)) body.heatStatus = 0;
      }
      // Turn off any heaters that should be off.  The code above only turns heaters on.
      for (let i = 0; i < heaters.length; i++) {
        let heater: Heater = heaters[i];
        if (typeof hon.find(elem => elem === heater.id) === 'undefined') {
          let hstate = state.heaters.getItemById(heater.id, true);
          if (heater.master === 1) (async () => {
            try {
              await ncp.heaters.setHeaterStateAsync(hstate, false, false);
            } catch (err) { logger.error(err.message); }
          })();
          else hstate.isOn = false;
        }
      }
    } catch (err) { logger.error(`Error synchronizing heater states`); }
  }
}
export class ValveCommands extends BoardCommands {
  public async setValveStateAsync(valve: Valve, vstate: ValveState, isDiverted: boolean) {
    if (valve.master === 1) await ncp.valves.setValveStateAsync(vstate, isDiverted);
    else
      vstate.isDiverted = isDiverted;
  }
  public async setValveAsync(obj: any): Promise<Valve> {
    try {
      let id = typeof obj.id !== 'undefined' ? parseInt(obj.id, 10) : -1;
      obj.master = 1;
      if (isNaN(id) || id <= 0) id = Math.max(sys.valves.getMaxId(false, 49) + 1, 50);

      if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Nixie: Valve Id has not been defined ${id}`, obj.id, 'Valve'));
      // Check the Nixie Control Panel to make sure the valve exist there.  If it needs to be added then we should add it.
      let valve = sys.valves.getItemById(id, true);
      // Set all the valve properies.
      let vstate = state.valves.getItemById(valve.id, true);
      valve.isActive = true;
      valve.circuit = typeof obj.circuit !== 'undefined' ? obj.circuit : valve.circuit;
      valve.name = typeof obj.name !== 'undefined' ? obj.name : valve.name;
      valve.connectionId = typeof obj.connectionId ? obj.connectionId : valve.connectionId;
      valve.deviceBinding = typeof obj.deviceBinding !== 'undefined' ? obj.deviceBinding : valve.deviceBinding;
      valve.pinId = typeof obj.pinId !== 'undefined' ? obj.pinId : valve.pinId;
      await ncp.valves.setValveAsync(valve, obj);
      sys.board.valves.syncValveStates();
      return valve;
    } catch (err) { logger.error(`Nixie: Error setting valve definition. ${err.message}`); return Promise.reject(err); }
  }

  public async deleteValveAsync(obj: any): Promise<Valve> {
    let id = parseInt(obj.id, 10);
    try {
      if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Valve Id has not been defined', obj.id, 'Valve'));
      let valve = sys.valves.getItemById(id, false);
      let vstate = state.valves.getItemById(id);
      if (valve.master === 1) await ncp.valves.deleteValveAsync(id);
      valve.isActive = false;
      vstate.hasChanged = true;
      vstate.emitEquipmentChange();
      sys.valves.removeItemById(id);
      state.valves.removeItemById(id);
      return valve;
    } catch (err) { return Promise.reject(new Error(`Error deleting valve: ${err.message}`)); }
    // The following code will make sure we do not encroach on any valves defined by the OCP.
  }
  public async syncValveStates() {
    try {
      for (let i = 0; i < sys.valves.length; i++) {
        // Run through all the valves to see whether they should be triggered or not.
        let valve = sys.valves.getItemByIndex(i);
        if (valve.isActive) {
          let vstate = state.valves.getItemById(valve.id, true);
          let isDiverted = vstate.isDiverted;
          if (typeof valve.circuit !== 'undefined' && valve.circuit > 0) {
            if (sys.equipment.shared && valve.isIntake === true)
              isDiverted = utils.makeBool(state.circuits.getItemById(1).isOn); // If the spa is on then the intake is diverted.
            else if (sys.equipment.shared && valve.isReturn === true) {
              // Check to see if there is a spillway circuit or feature on.  If it is on then the return will be diverted no mater what.
              let spillway = typeof state.circuits.get().find(elem => typeof elem.type !== 'undefined' && elem.type.name === 'spillway' && elem.isOn === true) !== 'undefined' ||
                typeof state.features.get().find(elem => typeof elem.type !== 'undefined' && elem.type.name === 'spillway' && elem.isOn === true) !== 'undefined';
              isDiverted = utils.makeBool(spillway || state.circuits.getItemById(1).isOn);
            }
            else {
              let circ = state.circuits.getInterfaceById(valve.circuit);
              isDiverted = utils.makeBool(circ.isOn);
            }
          }
          else
            isDiverted = false;
          vstate.type = valve.type;
          vstate.name = valve.name;
          await sys.board.valves.setValveStateAsync(valve, vstate, isDiverted);
        }
      }
    } catch (err) { logger.error(`syncValveStates: Error synchronizing valves ${err.message}`); }
  }
}
export class ChemControllerCommands extends BoardCommands {
  public async deleteChemControllerAsync(data: any): Promise<ChemController> {
    try {
      let id = typeof data.id !== 'undefined' ? parseInt(data.id, 10) : -1;
      if (typeof id === 'undefined' || isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid Chem Controller Id`, id, 'chemController'));
      let chem = sys.chemControllers.getItemById(id);
      let schem = state.chemControllers.getItemById(id);
      schem.isActive = chem.isActive = false;
      await ncp.chemControllers.removeById(id);
      sys.chemControllers.removeItemById(id);
      state.chemControllers.removeItemById(id);
      sys.emitEquipmentChange();
      return Promise.resolve(chem);
    } catch (err) { logger.error(`Error deleting chem controller ${err.message}`); }
  }
  public async manualDoseAsync(data: any): Promise<ChemControllerState> {
    try {
      let id = typeof data.id !== 'undefined' ? parseInt(data.id) : undefined;
      if (isNaN(id)) return Promise.reject(new InvalidEquipmentDataError(`Cannot begin dosing: Invalid chem controller id was provided ${data.id}`, 'chemController', data.id));
      let chem = sys.chemControllers.find(elem => elem.id === id);
      if (typeof chem === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Cannot begin dosing: Chem controller was not found ${data.id}`, 'chemController', data.id));
      // Let's check the type.  AFAIK you cannot manual dose an IntelliChem.
      let type = sys.board.valueMaps.chemControllerTypes.transform(chem.type);
      if (type.name !== 'rem') return Promise.reject(new InvalidEquipmentDataError(`You can only perform manual dosing on REM Chem controllers. Cannot manually dose ${type.desc}`, 'chemController', data.id));
      // We are down to the nitty gritty.  Let REM Chem do its thing.
      await ncp.chemControllers.manualDoseAsync(chem.id, data);
      return Promise.resolve(state.chemControllers.getItemById(id));
    } catch (err) { return Promise.reject(err); }
  }
  public async cancelDosingAsync(data: any): Promise<ChemControllerState> {
    try {
      let id = typeof data.id !== 'undefined' ? parseInt(data.id) : undefined;
      if (isNaN(id)) return Promise.reject(new InvalidEquipmentDataError(`Cannot cancel dosing: Invalid chem controller id was provided ${data.id}`, 'chemController', data.id));
      let chem = sys.chemControllers.find(elem => elem.id === id);
      if (typeof chem === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Cannot cancel dosing: Chem controller was not found ${data.id}`, 'chemController', data.id));
      // Let's check the type.  AFAIK you cannot manual dose an IntelliChem.
      let type = sys.board.valueMaps.chemControllerTypes.transform(chem.type);
      if (type.name !== 'rem') return Promise.reject(new InvalidEquipmentDataError(`You can only cancel dosing on REM Chem controllers. Cannot cancel ${type.desc}`, 'chemController', data.id));
      // We are down to the nitty gritty.  Let REM Chem do its thing.
      await ncp.chemControllers.cancelDoseAsync(chem.id, data);
      return Promise.resolve(state.chemControllers.getItemById(id));
    } catch (err) { return Promise.reject(err); }
  }
  public async manualMixAsync(data: any): Promise<ChemControllerState> {
    try {
      let id = typeof data.id !== 'undefined' ? parseInt(data.id) : undefined;
      if (isNaN(id)) return Promise.reject(new InvalidEquipmentDataError(`Cannot begin mixing: Invalid chem controller id was provided ${data.id}`, 'chemController', data.id));
      let chem = sys.chemControllers.find(elem => elem.id === id);
      if (typeof chem === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Cannot begin mixing: Chem controller was not found ${data.id}`, 'chemController', data.id));
      // Let's check the type.  AFAIK you cannot manual dose an IntelliChem.
      let type = sys.board.valueMaps.chemControllerTypes.transform(chem.type);
      if (type.name !== 'rem') return Promise.reject(new InvalidEquipmentDataError(`You can only perform manual mixing REM Chem controllers. Cannot manually dose ${type.desc}`, 'chemController', data.id));
      // We are down to the nitty gritty.  Let REM Chem do its thing.
      await ncp.chemControllers.manualMixAsync(chem.id, data);
      return Promise.resolve(state.chemControllers.getItemById(id));
    } catch (err) { return Promise.reject(err); }
  }
  public async cancelMixingAsync(data: any): Promise<ChemControllerState> {
    try {
      let id = typeof data.id !== 'undefined' ? parseInt(data.id) : undefined;
      if (isNaN(id)) return Promise.reject(new InvalidEquipmentDataError(`Cannot cancel mixing: Invalid chem controller id was provided ${data.id}`, 'chemController', data.id));
      let chem = sys.chemControllers.find(elem => elem.id === id);
      if (typeof chem === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Cannot cancel mixing: Chem controller was not found ${data.id}`, 'chemController', data.id));
      // Let's check the type.  AFAIK you cannot manual dose an IntelliChem.
      let type = sys.board.valueMaps.chemControllerTypes.transform(chem.type);
      if (type.name !== 'rem') return Promise.reject(new InvalidEquipmentDataError(`You can only cancel mixing on REM Chem controllers. Cannot cancel ${type.desc}`, 'chemController', data.id));
      // We are down to the nitty gritty.  Let REM Chem do its thing.
      await ncp.chemControllers.cancelMixingAsync(chem.id, data);
      return Promise.resolve(state.chemControllers.getItemById(id));
    } catch (err) { return Promise.reject(err); }
  }

  // If we land here then this is definitely a non-OCP implementation.  Pass this off to nixie to do her thing.
  protected async setIntelliChemAsync(data: any): Promise<ChemController> {
    try {
      let chem = sys.chemControllers.getItemById(data.id);
      return await ncp.chemControllers.setControllerAsync(chem, data);
    } catch (err) { return Promise.reject(err); }
  }
  public findChemController(data: any) {
    let address = parseInt(data.address, 10);
    let id = parseInt(data.id, 10);
    if (!isNaN(id)) return sys.chemControllers.find(x => x.id === id);
    else if (!isNaN(address)) return sys.chemControllers.find(x => x.address === address);
  }
  public async setChemControllerAsync(data: any): Promise<ChemController> {
    // The following are the rules related to when an OCP is present.
    // ==============================================================
    // 1. IntelliChem cannot be controlled/polled via Nixie, since there is no enable/disable from the OCP at this point we don't know who is in control of polling.
    // 2. With *Touch Commands will be sent directly to the IntelliChem controller in the hopes that the OCP will pick it up. Turns out this is not correct.  The TouchBoard now has the proper interface.
    // 3. njspc will communicate to the OCP for IntelliChem control via the configuration interface.

    // The following are the rules related to when no OCP is present.
    // =============================================================
    // 1. All chemControllers will be controlled via Nixie (IntelliChem, REM Chem).
    try {
      let chem = sys.board.chemControllers.findChemController(data);
      let isAdd = typeof chem === 'undefined';
      let type = sys.board.valueMaps.chemControllerTypes.encode(isAdd ? data.type : chem.type);
      if (typeof type === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`The chem controller type could not be determined ${data.type || type}`, 'chemController', type));
      if (isAdd && sys.equipment.maxChemControllers <= sys.chemControllers.length) return Promise.reject(new InvalidEquipmentDataError(`The maximum number of chem controllers have been added to your controller`, 'chemController', sys.equipment.maxChemControllers));
      let address = parseInt(data.address, 10);
      let t = sys.board.valueMaps.chemControllerTypes.transform(type);
      if (t.hasAddress) {
        // First lets make sure the user supplied an address.
        if (isNaN(address)) return Promise.reject(new InvalidEquipmentDataError(`${type.desc} chem controllers require a valid address`, 'chemController', data.address));
        if (typeof sys.chemControllers.find(x => x.address === address && x.id !== (isAdd ? -1 : chem.id)) !== 'undefined') return Promise.reject(new InvalidEquipmentDataError(`${type.desc} chem controller addresses must be unique`, 'chemController', data.address));
      }
      if (isAdd) {
        // At this point we are going to add the chem controller no matter what.
        data.id = sys.chemControllers.getNextControllerId(type);
        chem = sys.chemControllers.getItemById(data.id, true);
        chem.type = type;
        if (t.hasAddress) chem.address = address;
      }
      chem.isActive = true;
      // So here is the thing.  If you have an OCP then the IntelliChem must be controlled by that.
      // the messages on the bus will talk back to the OCP so if you do not do this mayhem will ensue.
      if (type.name === 'intellichem')
        await this.setIntelliChemAsync(data);
      else
        await ncp.chemControllers.setControllerAsync(chem, data);
      return Promise.resolve(chem);
    }
    catch (err) { return Promise.reject(err); }
  }
  public async setChemControllerStateAsync(data: any): Promise<ChemControllerState> {
    // For the most part all of the settable settings for IntelliChem are config settings.  REM is a bit of a different story so that
    // should map to the ncp
    let chem = sys.board.chemControllers.findChemController(data);
    if (typeof chem === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`A valid chem controller could not be found for id:${data.id} or address ${data.address}`, data.id || data.address, 'chemController'));
    data.id = chem.id;
    if (chem.master !== 0) await ncp.chemControllers.setControllerAsync(chem, data);
    else await sys.board.chemControllers.setChemControllerAsync(data);
    let schem = state.chemControllers.getItemById(chem.id, true);
    return Promise.resolve(schem);
  }
}
export class FilterCommands extends BoardCommands {
  public async syncFilterStates() {
    try {
      for (let i = 0; i < sys.filters.length; i++) {
        // Run through all the valves to see whether they should be triggered or not.
        let filter = sys.filters.getItemByIndex(i);
        if (filter.isActive) {
          let fstate = state.filters.getItemById(filter.id, true);
          // Check to see if the associated body is on.
          await sys.board.filters.setFilterStateAsync(filter, fstate, sys.board.bodies.isBodyOn(filter.body));
        }
      }
    } catch (err) { logger.error(`syncFilterStates: Error synchronizing filters ${err.message}`); }
  }
  public async setFilterStateAsync(filter: Filter, fstate: FilterState, isOn: boolean) { fstate.isOn = isOn; }
  public setFilter(data: any): any {
    let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
    if (id <= 0) id = sys.filters.length + 1; // set max filters?
    if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid filter id: ${data.id}`, data.id, 'Filter'));
    let filter = sys.filters.getItemById(id, id > 0);
    let sfilter = state.filters.getItemById(id, id > 0);
    let filterType = typeof data.filterType !== 'undefined' ? parseInt(data.filterType, 10) : filter.filterType;
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
    filter.capacity = typeof data.capacity === 'number' ? data.capacity : filter.capacity;
    filter.capacityUnits = typeof data.capacityUnits !== 'undefined' ? data.capacityUnits : filter.capacity;
    sfilter.psi = psi;
    sfilter.filterPsi = filterPsi;
    filter.needsCleaning = sfilter.needsCleaning = needsCleaning;
    filter.lastCleanDate = sfilter.lastCleanDate = lastCleanDate;
    filter.connectionId = typeof data.connectionId !== 'undefined' ? data.connectionId : filter.connectionId;
    filter.deviceBinding = typeof data.deviceBinding !== 'undefined' ? data.deviceBinding : filter.deviceBinding;
    sfilter.emitEquipmentChange();
    return filter; // Always return the config when we are dealing with the config not state.
  }

  public deleteFilter(data: any): any {
    let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
    if (isNaN(id)) return;
    sys.filters.removeItemById(id);
    state.filters.removeItemById(id);
    return state.filters.getItemById(id);
  }
}