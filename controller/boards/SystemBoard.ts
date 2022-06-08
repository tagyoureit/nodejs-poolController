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
import { Body, ChemController, Chlorinator, Circuit, CircuitGroup, CircuitGroupCircuit, ConfigVersion, ControllerType, CustomName, CustomNameCollection, EggTimer, Equipment, Feature, Filter, General, Heater, ICircuit, ICircuitGroup, ICircuitGroupCircuit, LightGroup, LightGroupCircuit, Location, Options, Owner, PoolSystem, Pump, Schedule, sys, TempSensorCollection, Valve } from '../Equipment';
import { EquipmentNotFoundError, InvalidEquipmentDataError, InvalidEquipmentIdError, BoardProcessError, InvalidOperationError } from '../Errors';
import { ncp } from "../nixie/Nixie";
import { BodyTempState, ChemControllerState, ChlorinatorState, CircuitGroupState, FilterState, ICircuitGroupState, ICircuitState, LightGroupState, ScheduleState, state, TemperatureState, ValveState, VirtualCircuitState } from '../State';
import { RestoreResults } from '../../web/Server';
import { group } from 'console';


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
    [1, { val: 1, name: 'ncp', desc: 'Nixie Control Panel' }],
    [2, { val: 2, name: 'ext', desc: 'External Control Panel' }]
  ]);
  public equipmentCommStatus: byteValueMap = new byteValueMap([
    [0, { val: 0, name: 'ready', desc: 'Ready' }],
    [1, { val: 1, name: 'commerr', desc: 'Communication Error' }]
  ]);
  public panelModes: byteValueMap = new byteValueMap([
    [0, { val: 0, name: 'auto', desc: 'Auto' }],
    // [1, { val: 1, name: 'service', desc: 'Service' }],
    // [8, { val: 8, name: 'freeze', desc: 'Freeze' }],
    // [128, { val: 128, name: 'timeout', desc: 'Timeout' }],
    // [129, { val: 129, name: 'service-timeout', desc: 'Service/Timeout' }],
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
    [1, { name: 'spa', desc: 'Spa', hasHeatSource: true, body: 2 }],
    [2, { name: 'pool', desc: 'Pool', hasHeatSource: true, body: 1 }],
    [5, { name: 'mastercleaner', desc: 'Master Cleaner', body: 1 }],
    [7, { name: 'light', desc: 'Light', isLight: true }],
    [9, { name: 'samlight', desc: 'SAM Light', isLight: true }],
    [10, { name: 'sallight', desc: 'SAL Light', isLight: true }],
    [11, { name: 'photongen', desc: 'Photon Gen', isLight: true }],
    [12, { name: 'colorwheel', desc: 'Color Wheel', isLight: true }],
    [13, { name: 'valve', desc: 'Valve' }],
    [14, { name: 'spillway', desc: 'Spillway' }],
    [15, { name: 'floorcleaner', desc: 'Floor Cleaner', body: 1 }],  // This circuit function does not seem to exist in IntelliTouch.
    [16, { name: 'intellibrite', desc: 'Intellibrite', isLight: true, theme: 'intellibrite' }],
    [17, { name: 'magicstream', desc: 'Magicstream', isLight: true, theme: 'magicstream' }],
    [19, { name: 'notused', desc: 'Not Used' }],
    [65, { name: 'lotemp', desc: 'Lo-Temp' }],
    [66, { name: 'hightemp', desc: 'Hi-Temp' }]
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
    [0, { name: 'off', desc: 'Off' }],
    [1, { name: 'on', desc: 'On' }],
    [128, { name: 'colorsync', desc: 'Color Sync' }],
    [144, { name: 'colorswim', desc: 'Color Swim' }],
    [160, { name: 'colorset', desc: 'Color Set' }],
    [177, { name: 'party', desc: 'Party', types: ['intellibrite'], sequence: 2 }],
    [178, { name: 'romance', desc: 'Romance', types: ['intellibrite'], sequence: 3 }],
    [179, { name: 'caribbean', desc: 'Caribbean', types: ['intellibrite'], sequence: 4 }],
    [180, { name: 'american', desc: 'American', types: ['intellibrite'], sequence: 5 }],
    [181, { name: 'sunset', desc: 'Sunset', types: ['intellibrite'], sequence: 6 }],
    [182, { name: 'royal', desc: 'Royal', types: ['intellibrite'], sequence: 7 }],
    [190, { name: 'save', desc: 'Save', types: ['intellibrite'], sequence: 13 }],
    [191, { name: 'recall', desc: 'Recall', types: ['intellibrite'], sequence: 14 }],
    [193, { name: 'blue', desc: 'Blue', types: ['intellibrite'], sequence: 8 }],
    [194, { name: 'green', desc: 'Green', types: ['intellibrite'], sequence: 9 }],
    [195, { name: 'red', desc: 'Red', types: ['intellibrite'], sequence: 10 }],
    [196, { name: 'white', desc: 'White', types: ['intellibrite'], sequence: 11 }],
    [197, { name: 'magenta', desc: 'Magenta', types: ['intellibrite'], sequence: 12 }],
    [208, { name: 'thumper', desc: 'Thumper', types: ['magicstream'] }],
    [209, { name: 'hold', desc: 'Hold', types: ['magicstream'] }],
    [210, { name: 'reset', desc: 'Reset', types: ['magicstream'] }],
    [211, { name: 'mode', desc: 'Mode', types: ['magicstream'] }],
    [254, { name: 'unknown', desc: 'unknown' }],
    [255, { name: 'none', desc: 'None' }]
  ]);
  public colorLogicThemes = new byteValueMap([
    [0, { name: 'cloudwhite', desc: 'Cloud White', types: ['colorlogic'], sequence: 7 }],
    [1, { name: 'deepsea', desc: 'Deep Sea', types: ['colorlogic'], sequence: 2 }],
    [2, { name: 'royalblue', desc: 'Royal Blue', types: ['colorlogic'], sequence: 3 }],
    [3, { name: 'afernoonskies', desc: 'Afternoon Skies', types: ['colorlogic'], sequence: 4 }],
    [4, { name: 'aquagreen', desc: 'Aqua Green', types: ['colorlogic'], sequence: 5 }],
    [5, { name: 'emerald', desc: 'Emerald', types: ['colorlogic'], sequence: 6 }],
    [6, { name: 'warmred', desc: 'Warm Red', types: ['colorlogic'], sequence: 8 }],
    [7, { name: 'flamingo', desc: 'Flamingo', types: ['colorlogic'], sequence: 9 }],
    [8, { name: 'vividviolet', desc: 'Vivid Violet', types: ['colorlogic'], sequence: 10 }],
    [9, { name: 'sangria', desc: 'Sangria', types: ['colorlogic'], sequence: 11 }],
    [10, { name: 'twilight', desc: 'Twilight', types: ['colorlogic'], sequence: 12 }],
    [11, { name: 'tranquility', desc: 'Tranquility', types: ['colorlogic'], sequence: 13 }],
    [12, { name: 'gemstone', desc: 'Gemstone', types: ['colorlogic'], sequence: 14 }],
    [13, { name: 'usa', desc: 'USA', types: ['colorlogic'], sequence: 15 }],
    [14, { name: 'mardigras', desc: 'Mardi Gras', types: ['colorlogic'], sequence: 16 }],
    [15, { name: 'cabaret', desc: 'Cabaret', types: ['colorlogic'], sequence: 17 }],
    [255, { name: 'none', desc: 'None' }]
  ]);
  public lightCommands = new byteValueMap([
    [4, { name: 'colorhold', desc: 'Hold', types: ['intellibrite', 'magicstream'], command: 'colorHold', sequence: 13 }],
    [5, { name: 'colorrecall', desc: 'Recall', types: ['intellibrite', 'magicstream'], command: 'colorRecall', sequence: 14 }],
    [6, {
      name: 'lightthumper', desc: 'Thumper', types: ['magicstream'], command: 'lightThumper', message: 'Toggling Thumper',
      sequence: [ // Cycle party mode 3 times.
        { isOn: false, timeout: 100 },
        { isOn: true, timeout: 100 },
        { isOn: false, timeout: 100 },
        { isOn: true, timeout: 5000 },
        { isOn: false, timeout: 100 },
        { isOn: true, timeout: 100 },
        { isOn: false, timeout: 100 },
        { isOn: true, timeout: 5000 },
        { isOn: false, timeout: 100 },
        { isOn: true, timeout: 100 },
        { isOn: false, timeout: 100 }
      ]
      }],
      [7, {
          name: 'colorsync', desc: 'Sync', types: ['colorlogic'], command: 'colorSync', message: 'Synchronizing Lights', endingTheme: 'voodoolounge',
          sequence: [
              { isOn: true, timeout: 1000 },
              { isOn: false, timeout: 12000 },
              { isOn: true }
          ]
      }]
  ]);
  public lightGroupCommands = new byteValueMap([
    [1, { name: 'colorsync', desc: 'Sync', types: ['intellibrite'], command: 'colorSync', message:'Synchronizing' }],
    [2, { name: 'colorset', desc: 'Set', types: ['intellibrite'], command: 'colorSet', message: 'Sequencing Set Operation' }],
    [3, { name: 'colorswim', desc: 'Swim', types: ['intellibrite'], command: 'colorSwim', message:'Sequencing Swim Operation' }],
    [4, { name: 'colorhold', desc: 'Hold', types: ['intellibrite', 'magicstream'], command: 'colorHold', message: 'Saving Current Colors', sequence: 13 }],
    [5, { name: 'colorrecall', desc: 'Recall', types: ['intellibrite', 'magicstream'], command: 'colorRecall', message: 'Recalling Saved Colors', sequence: 14 }],
    [6, {
      name: 'lightthumper', desc: 'Thumper', types: ['magicstream'], command: 'lightThumper', message: 'Toggling Thumper',
      sequence: [ // Cycle party mode 3 times.
        { isOn: false, timeout: 100 },
        { isOn: true, timeout: 100 },
        { isOn: false, timeout: 100 },
        { isOn: true, timeout: 5000 },
        { isOn: false, timeout: 100 },
        { isOn: true, timeout: 100 },
        { isOn: false, timeout: 100 },
        { isOn: true, timeout: 5000 },
        { isOn: false, timeout: 100 },
        { isOn: true, timeout: 100 },
        { isOn: false, timeout: 100 },
        { isOn: true, timeout: 1000 },
      ]
    }]
  ]);
  public circuitActions: byteValueMap = new byteValueMap([
    [0, { name: 'ready', desc: 'Ready' }],
    [1, { name: 'colorsync', desc: 'Synchronizing' }],
    [2, { name: 'colorset', desc: 'Sequencing Set Operation' }],
    [3, { name: 'colorswim', desc: 'Sequencing Swim Operation' }],
    [4, { name: 'lighttheme', desc: 'Sequencing Theme/Color Operation' }],
    [5, { name: 'colorhold', desc: 'Saving Current Color' }],
    [6, { name: 'colorrecall', desc: 'Recalling Saved Color' }],
    [7, { name: 'lightthumper', desc: 'Setting Light Thumper' }]
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
    [2, { name: 'solar', desc: 'Solar Heater', hasAddress: false, hasCoolSetpoint: true, hasPreference: true }],
    [3, { name: 'heatpump', desc: 'Heat Pump', hasAddress: true, hasPreference: true }],
    [4, { name: 'ultratemp', desc: 'UltraTemp', hasAddress: true, hasCoolSetpoint: true, hasPreference: true }],
    [5, { name: 'hybrid', desc: 'Hybrid', hasAddress: true }],
    [6, { name: 'mastertemp', desc: 'MasterTemp', hasAddress: true }],
    [7, { name: 'maxetherm', desc: 'Max-E-Therm', hasAddress: true }],
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
        [3, { name: 'cooling', desc: 'Cooling' }],
        [4, { name: 'hpheat', desc: 'Heatpump' }],
        [5, { name: 'dual', desc: 'Dual' }],
        [128, { name: 'cooldown', desc: 'Cooldown' }]
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
    [1, { name: 'spa', desc: 'Spa' }],
    [2, { name: 'spa', desc: 'Spa' }],
    [3, { name: 'spa', desc: 'Spa' }]
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
    [1, { name: 'intellichlor--15', desc: 'IntelliChlor IC15', capacity: 15000, chlorinePerDay: 0.60, chlorinePerSec: 0.60 / 86400 }],
    [2, { name: 'intellichlor--20', desc: 'IntelliChlor IC20', capacity: 20000, chlorinePerDay: 0.70, chlorinePerSec: 0.70 / 86400 }],
    [3, { name: 'intellichlor--40', desc: 'IntelliChlor IC40', capacity: 40000, chlorinePerDay: 1.40, chlorinePerSec: 1.4 / 86400 }],
    [4, { name: 'intellichlor--60', desc: 'IntelliChlor IC60', capacity: 60000, chlorinePerDay: 2, chlorinePerSec: 2 / 86400 }],
    [5, { name: 'aquarite-t15', desc: 'AquaRite T15', capacity: 40000, chlorinePerDay: 1.47, chlorinePerSec: 1.47 / 86400 }],
    [6, { name: 'aquarite-t9', desc: 'AquaRite T9', capacity: 30000, chlorinePerDay: 0.98, chlorinePerSec: 0.98 / 86400 }],
    [7, { name: 'aquarite-t5', desc: 'AquaRite T5', capacity: 20000, chlorinePerDay: 0.735, chlorinePerSec: 0.735 / 86400 }],
    [8, { name: 'aquarite-t3', desc: 'AquaRite T3', capacity: 15000, chlorinePerDay: 0.53, chlorinePerSec: 0.53 / 86400 }],
    [9, { name: 'aquarite-925', desc: 'AquaRite 925', capacity: 25000, chlorinePerDay: 0.98, chlorinePerSec: 0.98 / 86400 }],
    [10, { name: 'aquarite-940', desc: 'AquaRite 940', capacity: 40000, chlorinePerDay: 1.47, chlorinePerSec: 1.47 / 86400 }]
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
  public systemUnits: byteValueMap = new byteValueMap([
    [0, { name: 'english', desc: 'English' }],
    [4, { name: 'metric', desc: 'Metric' }]
  ]);
  public tempUnits: byteValueMap = new byteValueMap([
    [0, { name: 'F', desc: 'Fahrenheit' }],
    [4, { name: 'C', desc: 'Celsius' }]
  ]);
  public valveTypes: byteValueMap = new byteValueMap([
    [0, { name: 'standard', desc: 'Standard' }],
    [1, { name: 'intellivalve', desc: 'IntelliValve' }]
  ]);
  public valveModes: byteValueMap = new byteValueMap([
    [0, { name: 'off', desc: 'Off' }],
    [1, { name: 'pool', desc: 'Pool' }],
    [2, { name: 'spa', dest: 'Spa' }],
    [3, { name: 'spillway', desc: 'Spillway' }],
    [4, { name: 'spadrain', desc: 'Spa Drain' }]
  ]);
  public msgBroadcastActions: byteValueMap = new byteValueMap([
    [2, { name: 'status', desc: 'Equipment Status' }],
    [82, { name: 'ivstatus', desc: 'IntelliValve Status' }]
  ]);
  public chemControllerTypes: byteValueMap = new byteValueMap([
    [0, { name: 'none', desc: 'None', ph: { min: 6.8, max: 7.6 }, orp: { min: 400, max: 800 }, hasAddress: false }],
    [1, { name: 'unknown', desc: 'Unknown', ph: { min: 6.8, max: 7.6 }, hasAddress: false }],
    [2, { name: 'intellichem', desc: 'IntelliChem', ph: { min: 7.2, max: 7.6 }, orp: { min: 400, max: 800 }, hasAddress: true }],
    // [3, { name: 'homegrown', desc: 'Homegrown', ph: { min: 6.8, max: 7.6 }, hasAddress: false }],
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
  public phDoserTypes: byteValueMap = new byteValueMap([
    [0, { name: 'none', desc: 'No Doser Attached' }],
    [1, { name: 'extrelay', desc: 'External Relay' }],
    [2, { name: 'co2', desc: 'CO2 Tank' }],
    [3, { name: 'intrelay', desc: 'Internal Relay'}]
  ]);
  public orpDoserTypes: byteValueMap = new byteValueMap([
    [0, { name: 'none', desc: 'No Doser Attached' }],
    [1, { name: 'extrelay', desc: 'External Relay' }],
    [2, { name: 'chlorinator', desc: 'Chlorinator'}],
    [3, { name: 'intrelay', desc: 'Internal Relay'}]
  ])
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
  public pressureUnits: byteValueMap = new byteValueMap([
    [0, { name: 'psi', desc: 'Pounds per Sqare Inch' }],
    [1, { name: 'Pa', desc: 'Pascal' }],
    [2, { name: 'kPa', desc: 'Kilo-pascals' }],
    [3, { name: 'atm', desc: 'Atmospheres' }],
    [4, { name: 'bar', desc: 'Barometric' }]
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
    [130, { name: 'orptanklow', desc: 'orp Tank Low' }],
    [131, { name: 'freezeprotect', desc: 'Freeze Protection Lockout'}]
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
    if (sys.controllerType === ControllerType.Nixie) this.turnOffAllCircuits();
    // sys.board.virtualChemControllers.stop();
    this.killStatusCheck();
    await ncp.closeAsync();
    // return sys.board.virtualPumpControllers.stopAsync()
  }
  public async turnOffAllCircuits() {
    // turn off all circuits/features
    for (let i = 0; i < state.circuits.length; i++) {
      let s = state.circuits.getItemByIndex(i)
      s.isOn = s.manualPriorityActive = false;
    }
    for (let i = 0; i < state.features.length; i++) {
      let s = state.features.getItemByIndex(i)
      s.isOn = s.manualPriorityActive = false;
    }
    for (let i = 0; i < state.lightGroups.length; i++) {
      let s = state.lightGroups.getItemByIndex(i)
      s.isOn = s.manualPriorityActive = false;
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
      await sys.board.bodies.syncFreezeProtection();
      await sys.board.syncEquipmentItems();
      await sys.board.schedules.syncScheduleStates();
      await sys.board.circuits.checkEggTimerExpirationAsync();
      state.emitControllerChange();
      state.emitEquipmentChanges();
    } catch (err) { state.status = 255; logger.error(`Error performing processStatusAsync ${err.message}`); }
    finally {
      this.suspendStatus(false);
      if (this.statusInterval > 0) this._statusTimer = setTimeout(async () => await self.processStatusAsync(), this.statusInterval);
    }
  }
  public async syncEquipmentItems() {
    try {
      await sys.board.circuits.syncCircuitRelayStates();
      await sys.board.features.syncGroupStates();
      await sys.board.circuits.syncVirtualCircuitStates();
      await sys.board.valves.syncValveStates();
      await sys.board.filters.syncFilterStates();
      await sys.board.heaters.syncHeaterStates();
    }
    catch (err) { logger.error(`Error synchronizing equipment items: ${err.message}`); }
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
  public async restore(rest: { poolConfig: any, poolState: any }): Promise<RestoreResults> {
    let res = new RestoreResults();
    try {
      let ctx = await sys.board.system.validateRestore(rest);
      // Restore the general stuff.
      if (ctx.general.update.length > 0) await sys.board.system.setGeneralAsync(ctx.general.update[0]);
      for (let i = 0; i < ctx.customNames.update.length; i++) {
        let cn = ctx.customNames.update[i];
        try {
          await sys.board.system.setCustomNameAsync(cn);
          res.addModuleSuccess('customName', `Update: ${cn.id}-${cn.name}`);
        } catch (err) { res.addModuleError('customName', `Update: ${cn.id}-${cn.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.customNames.add.length; i++) {
        let cn = ctx.customNames.add[i];
        try {
          await sys.board.system.setCustomNameAsync(cn);
          res.addModuleSuccess('customName', `Add: ${cn.id}-${cn.name}`);
        } catch (err) { res.addModuleError('customName', `Add: ${cn.id}-${cn.name}: ${err.message}`); }
      }
      await sys.board.bodies.restore(rest, ctx, res);
      await sys.board.filters.restore(rest, ctx, res);
      await sys.board.circuits.restore(rest, ctx, res);
      await sys.board.heaters.restore(rest, ctx, res);
      await sys.board.features.restore(rest, ctx, res);
      await sys.board.pumps.restore(rest, ctx, res);
      await sys.board.valves.restore(rest, ctx, res);
      await sys.board.chlorinator.restore(rest, ctx, res);
      await sys.board.chemControllers.restore(rest, ctx, res);
      await sys.board.schedules.restore(rest, ctx, res);
      return res;
      //await sys.board.covers.restore(rest, ctx);
    } catch (err) { logger.error(`Error restoring njsPC server: ${err.message}`); res.addModuleError('system', err.message); return Promise.reject(err);}
  }
  public async validateRestore(rest: { poolConfig: any, poolState: any }): Promise<any> {
    try {
      let ctx: any = { board: { errors: [], warnings: [] } };

      // Step 1 - Verify that the boards are the same.  For instance you do not want to restore an IntelliTouch to an IntelliCenter.
      let cfg = rest.poolConfig;
      if (sys.controllerType === cfg.controllerType) {
        ctx.customNames = { errors: [], warnings: [], add: [], update: [], remove: [] };
        let customNames = sys.customNames.get();
        for (let i = 0; i < rest.poolConfig.customNames.length; i++) {
          let cn = customNames.find(elem => elem.id === rest.poolConfig.customNames[i].id);
          if (typeof cn === 'undefined') ctx.customNames.add.push(rest.poolConfig.customNames[i]);
          else if (JSON.stringify(rest.poolConfig.customNames[i]) !== JSON.stringify(cn)) ctx.customNames.update.push(cn);
        }
        ctx.general = { errors: [], warnings: [], add: [], update: [], remove: [] };
        if (JSON.stringify(sys.general.get()) !== JSON.stringify(cfg.pool)) ctx.general.update.push(cfg.pool);
        ctx.bodies = await sys.board.bodies.validateRestore(rest);
        ctx.pumps = await sys.board.pumps.validateRestore(rest);
        await sys.board.circuits.validateRestore(rest, ctx);
        ctx.features = await sys.board.features.validateRestore(rest);
        ctx.chlorinators = await sys.board.chlorinator.validateRestore(rest);
        ctx.heaters = await sys.board.heaters.validateRestore(rest);
        ctx.valves = await sys.board.valves.validateRestore(rest);

        //ctx.covers = await sys.board.covers.validateRestore(rest);
        ctx.chemControllers = await sys.board.chemControllers.validateRestore(rest);
        ctx.filters = await sys.board.filters.validateRestore(rest);
        ctx.schedules = await sys.board.schedules.validateRestore(rest);
      }
      else ctx.board.errors.push(`Panel Types do not match cannot restore backup from ${sys.controllerType} to ${rest.poolConfig.controllerType}`);

      return ctx;

    } catch (err) { logger.error(`Error validating restore file: ${err.message}`); return Promise.reject(err); }

  }
  public cancelDelay(): Promise<any> { state.delay = sys.board.valueMaps.delay.getValue('nodelay'); return Promise.resolve(state.data.delay); }
  public setManualOperationPriority(id: number): Promise<any> { return Promise.resolve(); }
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
    if (typeof obj.alias === 'string') sys.general.alias = obj.alias;
    if (typeof obj.options !== 'undefined') await sys.board.system.setOptionsAsync(obj.options);
    if (typeof obj.location !== 'undefined') await sys.board.system.setLocationAsync(obj.location);
    if (typeof obj.owner !== 'undefined') await sys.board.system.setOwnerAsync(obj.owner);
    return sys.general;
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
    return sys.equipment.tempSensors;
  }
  public async setOptionsAsync(obj: any): Promise<Options> {
    if (obj.clockSource === 'server') sys.board.system.setTZ();
    sys.board.system.setTempSensorsAsync(obj);
    sys.general.options.set(obj);
    let bodyUnits = sys.general.options.units === 0 ? 1 : 2;
    for (let i = 0; i < sys.bodies.length; i++) sys.bodies.getItemByIndex(i).capacityUnits = bodyUnits;
    state.temps.units = sys.general.options.units === 0 ? 1 : 4;
    return sys.general.options;
  }
    public async setLocationAsync(obj: any): Promise<Location> {
        sys.general.location.set(obj);
        return sys.general.location;
    }
  public async setOwnerAsync(obj: any): Promise<Owner> {
    sys.general.owner.set(obj);
    return sys.general.owner;
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
                            else if (!sys.equipment.dual) {
                                body = state.temps.bodies.find(elem => elem.id === 2);
                                if (typeof body !== 'undefined') {
                                    body = state.temps.bodies.getItemById(2);
                                    if (body.isOn) body.temp = state.temps.waterSensor1;
                                }
                            }
                        }
                        break;
                    case 'waterSensor2':
                        {
                            let temp = obj[prop] !== null ? parseFloat(obj[prop]) : 0;
                            if (isNaN(temp)) return reject(new InvalidEquipmentDataError(`Invalid value for ${prop} ${obj[prop]}`, `Temps:${prop}`, obj[prop]));
                            state.temps.waterSensor2 = sys.equipment.tempSensors.getCalibration('water2') + temp;
                            if (state.equipment.dual) {
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
  public async restore(rest: { poolConfig: any, poolState: any }, ctx: any, res: RestoreResults): Promise<boolean> {
    try {
      // First delete the bodies that should be removed.
      for (let i = 0; i < ctx.bodies.remove.length; i++) {
        let body = ctx.bodies.remove[i];
        try {
          sys.bodies.removeItemById(body.id);
          state.temps.bodies.removeItemById(body.id);
          res.addModuleSuccess('body', `Remove: ${body.id}-${body.name}`);
        } catch (err) { res.addModuleError('body', `Remove: ${body.id}-${body.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.bodies.update.length; i++) {
        let body = ctx.bodies.update[i];
        try {
          await sys.board.bodies.setBodyAsync(body);
          res.addModuleSuccess('body', `Update: ${body.id}-${body.name}`);
        } catch (err) { res.addModuleError('body', `Update: ${body.id}-${body.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.bodies.add.length; i++) {
        let body = ctx.bodies.add[i];
        try {
          // pull a little trick to first add the data then perform the update.
          sys.bodies.getItemById(body.id, true);
          await sys.board.bodies.setBodyAsync(body);
        } catch (err) { res.addModuleError('body', `Add: ${body.id}-${body.name}: ${err.message}`); }
      }
      return true;
    } catch (err) { logger.error(`Error restoring bodies: ${err.message}`); res.addModuleError('system', `Error restoring bodies: ${err.message}`); return false; }
  }
  public async validateRestore(rest: { poolConfig: any, poolState: any }): Promise<{ errors: any, warnings: any, add: any, update: any, remove: any}> {
    try {
      let ctx = { errors: [], warnings: [], add: [], update: [], remove: [] };
      // Look at bodies.
      let cfg = rest.poolConfig;
      for (let i = 0; i < cfg.bodies.length; i++) {
        let r = cfg.bodies[i];
        let c = sys.bodies.find(elem => r.id === elem.id);
        if (typeof c === 'undefined') ctx.add.push(r);
        else if (JSON.stringify(c.get()) !== JSON.stringify(r)) ctx.update.push(r);
      }
      for (let i = 0; i < sys.bodies.length; i++) {
        let c = sys.bodies.getItemByIndex(i);
        let r = cfg.bodies.find(elem => elem.id == c.id);
        if (typeof r === 'undefined') ctx.remove.push(c.get(true));
      }
      return ctx;
    } catch (err) { logger.error(`Error validating bodies for restore: ${err.message}`); }
  }
  public freezeProtectBodyOn: Date;
  public freezeProtectStart: Date;
    public async syncFreezeProtection() {
        try {
            // Go through all the features and circuits to make sure we have the freeze protect set appropriately.  The freeze
            // flag will have already been set whether this is a Nixie setup or there is an OCP involved.

            // First turn on/off any features that are in our control that should be under our control.  If this is an OCP we
            // do not create features beyond those controlled by the OCP so we don't need to check these in that condition.  That is
            // why it first checks the controller type.
            let freeze = utils.makeBool(state.freeze);
            if (sys.controllerType === ControllerType.Nixie) {
                // If we are a Nixie controller we need to evaluate the current freeze settings against the air temperature.
                if (typeof state.temps.air !== 'undefined') {
                    // Start freeze protection when the temperature is <= the threshold but don't stop it until we are 2 degrees above the threshold.  This
                    // makes for a 3 degree offset.
                    if (state.temps.air <= sys.general.options.freezeThreshold) freeze = true;
                    else if (state.freeze && state.temps.air - 2 > sys.general.options.freezeThreshold) freeze = false;
                }
                else freeze = false;

                // We need to know when we first turned the freeze protection on. This is because we will be rotating between pool and spa
                // on shared body systems when both pool and spa have freeze protection checked.
                if (state.freeze !== freeze) {
                    this.freezeProtectStart = freeze ? new Date() : undefined;
                    state.freeze = freeze;
                }
                for (let i = 0; i < sys.features.length; i++) {
                    let feature = sys.features.getItemByIndex(i);
                    let fstate = state.features.getItemById(feature.id, true);
                    if (!feature.freeze || !feature.isActive === true || feature.master !== 1) {
                        fstate.freezeProtect = false;
                        continue; // This is not affected by freeze conditions.
                    }
                    if (freeze && !fstate.isOn) {
                        // This feature should be on because we are freezing.
                        fstate.freezeProtect = true;
                        await sys.board.features.setFeatureStateAsync(feature.id, true);
                    }
                    else if (!freeze && fstate.freezeProtect) {
                        // This feature was turned on by freeze protection.  We need to turn it off because it has warmed up.
                        fstate.freezeProtect = false;
                        await sys.board.features.setFeatureStateAsync(feature.id, false);
                    }
                }
            }
            let bodyRotationChecked = false;
            for (let i = 0; i < sys.circuits.length; i++) {
                let circ = sys.circuits.getItemByIndex(i);
                let cstate = state.circuits.getItemById(circ.id);
                if (!circ.freeze || !circ.isActive === true || circ.master !== 1) {
                    cstate.freezeProtect = false;
                    continue; // This is not affected by freeze conditions.
                }
                if (sys.equipment.shared && freeze && (circ.id === 1 || circ.id === 6)) {
                    // Exit out of here because we already checked the body rotation.  We only want to do this once since it can be expensive turning
                    // on a particular body.
                    if (bodyRotationChecked) continue;
                    // These are our body circuits so we need to check to see if they need to be rotated between pool and spa.
                    let pool = circ.id === 6 ? circ : sys.circuits.getItemById(6);
                    let spa = circ.id === 1 ? circ : sys.circuits.getItemById(1);
                    if (pool.freeze && spa.freeze) {
                        // We only need to rotate between pool and spa when they are both checked.
                        let pstate = circ.id === 6 ? cstate : state.circuits.getItemById(6);
                        let sstate = circ.id === 1 ? cstate : state.circuits.getItemById(1);
                        if (!pstate.isOn && !sstate.isOn) {
                            // Neither the pool or spa are on so we will turn on the pool first.
                            pstate.freezeProtect = true;
                            this.freezeProtectBodyOn = new Date();
                            await sys.board.circuits.setCircuitStateAsync(6, true);
                        }
                        else {
                            // If neither of the bodies were turned on for freeze protection then we need to ignore this. 
                            if (!pstate.freezeProtect && !sstate.freezeProtect) {
                                this.freezeProtectBodyOn = undefined;
                                continue;
                            }

                            // One of the two bodies is on so we need to check for the rotation.  If it is time to rotate do the rotation.
                            if (typeof this.freezeProtectBodyOn === 'undefined') this.freezeProtectBodyOn = new Date();
                            let dt = new Date().getTime();
                            if (dt - 1000 * 60 * 15 > this.freezeProtectBodyOn.getTime()) {
                                logger.info(`Swapping bodies for freeze protection pool:${pstate.isOn} spa:${sstate.isOn} interval: ${utils.formatDuration(dt - this.freezeProtectBodyOn.getTime() / 1000)}`);
                                // 10 minutes has elapsed so we will be rotating to the other body.
                                if (pstate.isOn) {
                                    // The setCircuitState method will handle turning off the pool body.
                                    sstate.freezeProtect = true;
                                    pstate.freezeProtect = false;
                                    await sys.board.circuits.setCircuitStateAsync(1, true);
                                }
                                else {
                                    sstate.freezeProtect = false;
                                    pstate.freezeProtect = true;
                                    await sys.board.circuits.setCircuitStateAsync(6, true);
                                }
                                // Set a new date as this will be our rotation check now.
                                this.freezeProtectBodyOn = new Date();
                            }
                        }
                    }
                    else {
                        // Only this circuit is selected for freeze protection so we don't need any special treatment.
                        cstate.freezeProtect = true;
                        if (!cstate.isOn) await sys.board.circuits.setCircuitStateAsync(circ.id, true);
                    }
                    bodyRotationChecked = true;
                }
                else if (freeze && !cstate.isOn) {
                    // This circuit should be on because we are freezing.
                    cstate.freezeProtect = true;
                    await sys.board.circuits.setCircuitStateAsync(circ.id, true);
                }
                else if (!freeze && cstate.freezeProtect) {
                    // This feature was turned on by freeze protection.  We need to turn it off because it has warmed up.
                    await sys.board.circuits.setCircuitStateAsync(circ.id, false);
                    cstate.freezeProtect = false;
                }
            }
        }
        catch (err) { logger.error(`syncFreezeProtection: Error synchronizing freeze protection states: ${err.message}`); }
    }

  public async initFilters() {
    try {
      let filter: Filter;
      let sFilter: FilterState;
      if (sys.equipment.maxBodies > 0) {
        filter = sys.filters.getItemById(1, true, { filterType: 3, name: sys.equipment.shared ? 'Filter' : 'Filter 1' });
        sFilter = state.filters.getItemById(1, true, { id: 1, name: filter.name });
        filter.isActive = true;
        filter.master = sys.board.equipmentMaster;
        filter.body = sys.equipment.shared ? sys.board.valueMaps.bodies.transformByName('poolspa') : 0;
        //sFilter = state.filters.getItemById(1, true);
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
      let sbody = state.temps.bodies.getItemById(id, false);
      body.set(obj);
      sbody.name = body.name;
      sbody.showInDashboard = body.showInDashboard;
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
    if (heatTypes.mastertemp > 0) heatSources.push(this.board.valueMaps.heatSources.transformByName('mastertemp'));
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
        sys.board.heaters.updateHeaterServices();

        // RKS: 09-26-20 This will need to be overloaded in IntelliCenterBoard when the other heater types are identified. (e.g. ultratemp, hybrid, maxetherm, and mastertemp)
        heatModes.push(this.board.valueMaps.heatModes.transformByName('off')); // In IC fw 1.047 off is no longer 0.
        let heatTypes = this.board.heaters.getInstalledHeaterTypes(bodyId);
        if (heatTypes.hybrid > 0) {
            heatModes.push(sys.board.valueMaps.heatModes.transformByName('heatpump'));
            heatModes.push(sys.board.valueMaps.heatModes.transformByName('heater'));
            heatModes.push(sys.board.valueMaps.heatModes.transformByName('heatpumppref'));
            heatModes.push(sys.board.valueMaps.heatModes.transformByName('dual'));
            //heatModes = this.board.valueMaps.heatModes.toArray();
        }
        if (heatTypes.gas > 0) {
            heatModes.push(this.board.valueMaps.heatModes.transformByName('heater'));
        }
        if (heatTypes.mastertemp > 0) heatModes.push(this.board.valueMaps.heatModes.transformByName('mtheater'));
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
        if (sys.equipment.shared && sys.equipment.maxBodies >= 2) {
          return state.temps.bodies.getItemById(1).isOn === true || state.temps.bodies.getItemById(2).isOn === true;
        }
        else
          return state.temps.bodies.getItemById(1).isOn;
    }
    return false;
  }
}
export class PumpCommands extends BoardCommands {
  public async restore(rest: { poolConfig: any, poolState: any }, ctx: any, res: RestoreResults): Promise<boolean> {
    try {
      // First delete the pumps that should be removed.
      for (let i = 0; i < ctx.pumps.remove.length; i++) {
        let p = ctx.pumps.remove[i];
        try {
          await sys.board.pumps.deletePumpAsync(p);
          res.addModuleSuccess('pump', `Remove: ${p.id}-${p.name}`);
        } catch (err) { res.addModuleError('pump', `Remove: ${p.id}-${p.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.pumps.update.length; i++) {
        let p = ctx.pumps.update[i];
        try {
          await sys.board.pumps.setPumpAsync(p);
          res.addModuleSuccess('pump', `Update: ${p.id}-${p.name}`);
        } catch (err) { res.addModuleError('pump', `Update: ${p.id}-${p.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.pumps.add.length; i++) {
        let p = ctx.pumps.add[i];
        try {
          // pull a little trick to first add the data then perform the update.  This way we won't get a new id or
          // it won't error out.
          sys.pumps.getItemById(p, true);
          await sys.board.pumps.setPumpAsync(p);
          res.addModuleSuccess('pump', `Add: ${p.id}-${p.name}`);
        } catch (err) { res.addModuleError('pump', `Add: ${p.id}-${p.name}: ${err.message}`); }
      }
      return true;
    } catch (err) { logger.error(`Error restoring pumps: ${err.message}`); res.addModuleError('system', `Error restoring pumps: ${err.message}`); return false; }
  }
  public async validateRestore(rest: { poolConfig: any, poolState: any }): Promise<{ errors: any, warnings: any, add: any, update: any, remove: any }> {
    try {
      let ctx = { errors: [], warnings: [], add: [], update: [], remove: [] };
      // Look at pumps.
      let cfg = rest.poolConfig;
      for (let i = 0; i < cfg.pumps.length; i++) {
        let r = cfg.pumps[i];
        let c = sys.pumps.find(elem => r.id === elem.id);
        if (typeof c === 'undefined') ctx.add.push(r);
        else if (JSON.stringify(c.get()) !== JSON.stringify(r)) ctx.update.push(r);
      }
      for (let i = 0; i < sys.pumps.length; i++) {
        let c = sys.pumps.getItemByIndex(i);
        let r = cfg.pumps.find(elem => elem.id == c.id);
        if (typeof r === 'undefined') ctx.remove.push(c.get(true));
      }
      return ctx;
    } catch (err) { logger.error(`Error validating pumps for restore: ${err.message}`); }
  }

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
  public setPumpValveDelays(circuitIds: number[], delay?: number) {}
}
export class CircuitCommands extends BoardCommands {
  public async restore(rest: { poolConfig: any, poolState: any }, ctx: any, res: RestoreResults): Promise<boolean> {
    try {
      // First delete the circuit/lightGroups that should be removed.
      for (let i = 0; i < ctx.circuitGroups.remove.length; i++) {
        let c = ctx.circuitGroups.remove[i];
        try {
          await sys.board.circuits.deleteCircuitGroupAsync(c);
          res.addModuleSuccess('circuitGroup', `Remove: ${c.id}-${c.name}`);
        } catch (err) { res.addModuleError('circuitGroup', `Remove: ${c.id}-${c.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.lightGroups.remove.length; i++) {
        let c = ctx.lightGroups.remove[i];
        try {
          await sys.board.circuits.deleteLightGroupAsync(c);
          res.addModuleSuccess('lightGroup', `Remove: ${c.id}-${c.name}`);
        } catch (err) { res.addModuleError('lightGroup', `Remove: ${c.id}-${c.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.circuits.remove.length; i++) {
        let c = ctx.circuits.remove[i];
        try {
          await sys.board.circuits.deleteCircuitAsync(c);
          res.addModuleSuccess('circuit', `Remove: ${c.id}-${c.name}`);
        } catch (err) { res.addModuleError('circuit', `Remove: ${c.id}-${c.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.circuits.add.length; i++) {
        let c = ctx.circuits.add[i];
        try {
          await sys.board.circuits.setCircuitAsync(c);
          res.addModuleSuccess('circuit', `Add: ${c.id}-${c.name}`);
        } catch (err) { res.addModuleError('circuit', `Add: ${c.id}-${c.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.circuitGroups.add.length; i++) {
        let c = ctx.circuitGroups.add[i];
        try {
          await sys.board.circuits.setCircuitGroupAsync(c);
          res.addModuleSuccess('circuitGroup', `Add: ${c.id}-${c.name}`);
        } catch (err) { res.addModuleError('circuitGroup', `Add: ${c.id}-${c.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.lightGroups.add.length; i++) {
        let c = ctx.lightGroups.add[i];
        try {
          await sys.board.circuits.setLightGroupAsync(c);
          res.addModuleSuccess('lightGroup', `Add: ${c.id}-${c.name}`);
        } catch (err) { res.addModuleError('lightGroup', `Add: ${c.id}-${c.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.circuits.update.length; i++) {
        let c = ctx.circuits.update[i];
        try {
          await sys.board.circuits.setCircuitAsync(c);
          res.addModuleSuccess('circuit', `Update: ${c.id}-${c.name}`);
        } catch (err) { res.addModuleError('circuit', `Update: ${c.id}-${c.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.circuitGroups.update.length; i++) {
        let c = ctx.circuitGroups.update[i];
        try {
          await sys.board.circuits.setCircuitGroupAsync(c);
          res.addModuleSuccess('circuitGroup', `Update: ${c.id}-${c.name}`);
        } catch (err) { res.addModuleError('circuitGroup', `Update: ${c.id}-${c.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.lightGroups.update.length; i++) {
        let c = ctx.lightGroups.update[i];
        try {
          await sys.board.circuits.setLightGroupAsync(c);
          res.addModuleSuccess('lightGroup', `Update: ${c.id}-${c.name}`);
        } catch (err) { res.addModuleError('lightGroup', `Update: ${c.id}-${c.name}: ${err.message}`); }
      }
      return true;
    } catch (err) { logger.error(`Error restoring circuits: ${err.message}`); res.addModuleError('system', `Error restoring circuits/features: ${err.message}`); return false; }
  }
  public async validateRestore(rest: { poolConfig: any, poolState: any }, ctxRoot): Promise<boolean> {
    try {
      let ctx = { errors: [], warnings: [], add: [], update: [], remove: [] };
      // Look at circuits.
      let cfg = rest.poolConfig;
      for (let i = 0; i < cfg.circuits.length; i++) {
        let r = cfg.circuits[i];
        let c = sys.circuits.find(elem => r.id === elem.id);
        if (typeof c === 'undefined') ctx.add.push(r);
        else if (JSON.stringify(c.get()) !== JSON.stringify(r)) ctx.update.push(r);
      }
      for (let i = 0; i < sys.circuits.length; i++) {
        let c = sys.circuits.getItemByIndex(i);
        let r = cfg.circuits.find(elem => elem.id == c.id);
        if (typeof r === 'undefined') ctx.remove.push(c.get(true));
      }
      ctxRoot.circuits = ctx;
      ctx = { errors: [], warnings: [], add: [], update: [], remove: [] };
      for (let i = 0; i < cfg.circuitGroups.length; i++) {
        let r = cfg.circuitGroups[i];
        let c = sys.circuitGroups.find(elem => r.id === elem.id);
        if (typeof c === 'undefined') ctx.add.push(r);
        else if (JSON.stringify(c.get()) !== JSON.stringify(r)) ctx.update.push(r);
      }
      for (let i = 0; i < sys.circuitGroups.length; i++) {
        let c = sys.circuitGroups.getItemByIndex(i);
        let r = cfg.circuitGroups.find(elem => elem.id == c.id);
        if (typeof r === 'undefined') ctx.remove.push(c.get(true));
      }
      ctxRoot.circuitGroups = ctx;
      ctx = { errors: [], warnings: [], add: [], update: [], remove: [] };
      for (let i = 0; i < cfg.lightGroups.length; i++) {
        let r = cfg.lightGroups[i];
        let c = sys.lightGroups.find(elem => r.id === elem.id);
        if (typeof c === 'undefined') ctx.add.push(r);
        else if (JSON.stringify(c.get()) !== JSON.stringify(r)) ctx.update.push(r);
      }
      for (let i = 0; i < sys.lightGroups.length; i++) {
        let c = sys.lightGroups.getItemByIndex(i);
        let r = cfg.lightGroups.find(elem => elem.id == c.id);
        if (typeof r === 'undefined') ctx.remove.push(c.get(true));
      }
      ctxRoot.lightGroups = ctx;
      return true;
    } catch (err) { logger.error(`Error validating circuits for restore: ${err.message}`); }
  }
  public async checkEggTimerExpirationAsync() {
    // turn off any circuits that have reached their egg timer;
    // Nixie circuits we have 100% control over; 
    // but features/cg/lg may override OCP control
    try {
      for (let i = 0; i < sys.circuits.length; i++) {
        let c = sys.circuits.getItemByIndex(i);
        let cstate = state.circuits.getItemByIndex(i);
        if (!cstate.isActive || !cstate.isOn || typeof cstate.endTime === 'undefined') continue;
        if (c.master === 1) {
          await ncp.circuits.checkCircuitEggTimerExpirationAsync(cstate);
        }
      }
      for (let i = 0; i < sys.features.length; i++) {
        let fstate = state.features.getItemByIndex(i);
        if (!fstate.isActive || !fstate.isOn || typeof fstate.endTime === 'undefined') continue;
        if (fstate.endTime.toDate() < new Timestamp().toDate()) {
          await sys.board.circuits.setCircuitStateAsync(fstate.id, false);
          fstate.emitEquipmentChange();
        }
      }
      for (let i = 0; i < sys.circuitGroups.length; i++) {
        let cgstate = state.circuitGroups.getItemByIndex(i);
        if (!cgstate.isActive || !cgstate.isOn || typeof cgstate.endTime === 'undefined') continue;
        if (cgstate.endTime.toDate() < new Timestamp().toDate()) {
          await sys.board.circuits.setCircuitGroupStateAsync(cgstate.id, false);
          cgstate.emitEquipmentChange();
        }
      }
      for (let i = 0; i < sys.lightGroups.length; i++) {
        let lgstate = state.lightGroups.getItemByIndex(i);
        if (!lgstate.isActive || !lgstate.isOn || typeof lgstate.endTime === 'undefined') continue;
        if (lgstate.endTime.toDate() < new Timestamp().toDate()) {
          await sys.board.circuits.setLightGroupStateAsync(lgstate.id, false);
          lgstate.emitEquipmentChange();
        }
      }
    } catch (err) { logger.error(`checkEggTimerExpiration: Error synchronizing circuit relays ${err.message}`); }
  }
  public async syncCircuitRelayStates() {
    try {
      for (let i = 0; i < sys.circuits.length; i++) {
        // Run through all the controlled circuits to see whether they should be triggered or not.
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
                            for (let j = 0; j < poolStates.length; j++) {
                                let hstatus = sys.board.valueMaps.heatStatus.getName(poolStates[j].heatStatus);
                                if (hstatus !== 'off' && hstatus !== 'solar') {
                                    // In this instance we may have a delay underway.
                                    let hstate = state.heaters.find(x => x.bodyId === 1 && x.startupDelay === true && x.type.name !== 'solar');
                                    bState = typeof hstate === 'undefined';
                                }
                            }
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
                                let hstatus = sys.board.valueMaps.heatStatus.getName(poolStates[j].heatStatus);
                                if (hstatus !== 'off' && hstatus !== 'solar') {
                                    // In this instance we may have a delay underway.
                                    let hstate = state.heaters.find(x => x.bodyId === 1 && x.startupDelay === true && x.type.name !== 'solar');
                                    bState = typeof hstate === 'undefined';
                                }
                            }
                            //for (let j = 0; j < spaStates.length; j++) {
                            //    if (sys.board.valueMaps.heatStatus.getName(spaStates[j].heatStatus) === 'heater') bState = true;
                            //}
                        }
                        break;
                    case 'heater':
                        // If heater is on for any body
                        // RSG 5-3-22: Heater will now refer to any poolHeat6er or spaHeater but not solar or other types.  anyHeater now takes that role.
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
                                let hstatus = sys.board.valueMaps.heatStatus.getName(poolStates[j].heatStatus);
                                if (hstatus === 'heater' || hstatus === 'hpheat' || hstatus === 'mtheat') bState = true;
                            }
                            for (let j = 0; j < spaStates.length && !bState; j++) {
                                let hstatus = sys.board.valueMaps.heatStatus.getName(poolStates[j].heatStatus);
                                if (hstatus === 'heater' || hstatus === 'hpheat' || hstatus === 'mtheat') bState = true;
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
                            // RKS: 05-30-22 - I have no idea why this would include the heatpump options
                            //if (poolStates[j].heaterOptions.solar + poolStates[j].heaterOptions.heatpump > 0) remove = false;
                            if (poolStates[j].heaterOptions.solar) remove = false;
                        }
                        if (remove) {
                            for (let j = 0; j < spaStates.length; j++) {
                                // RKS: 05-30-22 - I have no idea why this would include the heatpump options
                                //if (spaStates[j].heaterOptions.solar + spaStates[j].heaterOptions.heatpump > 0) remove = false;
                                if (spaStates[j].heaterOptions.solar) remove = false;
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
                    case 'solar1':
                        remove = true;
                        for (let j = 0; j < poolStates.length; j++) {
                            if (poolStates[j].id === 1 && poolStates[j].heaterOptions.solar) {
                                remove = false;
                                vc.desc = `${poolStates[j].name} Solar`;
                                if (sys.board.valueMaps.heatStatus.getName(poolStates[j].heatStatus) === 'solar') {
                                    // In this instance we may have a delay underway.
                                    let hstate = state.heaters.find(x => x.bodyId === 1 && x.startupDelay === true && x.type.name === 'solar');
                                    bState = typeof hstate === 'undefined';
                                }
                            }
                        }
                        for (let j = 0; j < spaStates.length; j++) {
                            if (spaStates[j].id === 1 && spaStates[j].heaterOptions.solar) {
                                remove = false;
                                vc.desc = `${spaStates[j].name} Solar`;
                                if (sys.board.valueMaps.heatStatus.getName(spaStates[j].heatStatus) === 'solar') {
                                    // In this instance we may have a delay underway.
                                    let hstate = state.heaters.find(x => x.bodyId === 1 && x.startupDelay === true && x.type.name === 'solar');
                                    bState = typeof hstate === 'undefined';
                                }
                            }
                        }

                        break;
                    case 'solar2':
                        remove = true;
                        for (let j = 0; j < poolStates.length; j++) {
                            if (poolStates[j].id === 2 && poolStates[j].heaterOptions.solar) {
                                remove = false;
                                vc.desc = `${poolStates[j].name} Solar`;
                                if (sys.board.valueMaps.heatStatus.getName(spaStates[j].heatStatus) === 'solar') {
                                    // In this instance we may have a delay underway.
                                    let hstate = state.heaters.find(x => x.bodyId === 2 && x.startupDelay === true && x.type.name === 'solar');
                                    bState = typeof hstate === 'undefined';
                                }
                            }
                        }
                        for (let j = 0; j < spaStates.length; j++) {
                            if (spaStates[j].id === 2 && spaStates[j].heaterOptions.solar) {
                                remove = false;
                                vc.desc = `${spaStates[j].name} Solar`;
                                if (sys.board.valueMaps.heatStatus.getName(spaStates[j].heatStatus) === 'solar') {
                                    // In this instance we may have a delay underway.
                                    let hstate = state.heaters.find(x => x.bodyId === 2 && x.startupDelay === true && x.type.name === 'solar');
                                    bState = typeof hstate === 'undefined';
                                }
                            }
                        }
                        break;
                    case 'solar3':
                        remove = true;
                        for (let j = 0; j < poolStates.length; j++) {
                            if (poolStates[j].id === 3 && poolStates[j].heaterOptions.solar) {
                                remove = false;
                                vc.desc = `${poolStates[j].name} Solar`;
                                if (sys.board.valueMaps.heatStatus.getName(spaStates[j].heatStatus) === 'solar') {
                                    // In this instance we may have a delay underway.
                                    let hstate = state.heaters.find(x => x.bodyId === 3 && x.startupDelay === true && x.type.name === 'solar');
                                    bState = typeof hstate === 'undefined';
                                }
                            }
                        }
                        for (let j = 0; j < spaStates.length; j++) {
                            if (spaStates[j].id === 3 && spaStates[j].heaterOptions.solar) {
                                remove = false;
                                vc.desc = `${spaStates[j].name} Solar`;
                                if (sys.board.valueMaps.heatStatus.getName(spaStates[j].heatStatus) === 'solar') {
                                    // In this instance we may have a delay underway.
                                    let hstate = state.heaters.find(x => x.bodyId === 3 && x.startupDelay === true && x.type.name === 'solar');
                                    bState = typeof hstate === 'undefined';
                                }
                            }
                        }

                        break;
                    case 'solar4':
                        remove = true;
                        for (let j = 0; j < poolStates.length; j++) {
                            if (poolStates[j].id === 4 && poolStates[j].heaterOptions.solar) {
                                remove = false;
                                vc.desc = `${poolStates[j].name} Solar`;
                                if (sys.board.valueMaps.heatStatus.getName(spaStates[j].heatStatus) === 'solar') {
                                    // In this instance we may have a delay underway.
                                    let hstate = state.heaters.find(x => x.bodyId === 4 && x.startupDelay === true && x.type.name === 'solar');
                                    bState = typeof hstate === 'undefined';
                                }
                            }
                        }
                        for (let j = 0; j < spaStates.length; j++) {
                            if (spaStates[j].id === 4 && spaStates[j].heaterOptions.solar) {
                                remove = false;
                                vc.desc = `${spaStates[j].name} Solar`;
                                if (sys.board.valueMaps.heatStatus.getName(spaStates[j].heatStatus) === 'solar') {
                                    // In this instance we may have a delay underway.
                                    let hstate = state.heaters.find(x => x.bodyId === 4 && x.startupDelay === true && x.type.name === 'solar');
                                    bState = typeof hstate === 'undefined';
                                }
                            }
                        }
                        break;
                    case 'anyHeater':
                        // RSG 5-3-22 anyHeater now represents any solar, gas, etc heater.  This replaces 'heater' which now refers to only gas heaters.
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
                if (remove) {
                    if (state.virtualCircuits.exists(x => vc.val === x.id)) {
                        cstate = state.virtualCircuits.getItemById(vc.val, true);
                        cstate.isActive = false;
                        cstate.emitEquipmentChange();
                    }
                    state.virtualCircuits.removeItemById(vc.val);
                }
                else {
                    cstate = state.virtualCircuits.getItemById(vc.val, true);
                    cstate.isActive = true;
                    if (cstate !== null) {
                        cstate.isOn = bState;
                        cstate.type = vc.val;
                        cstate.name = vc.desc;
                    }
                }
            }
        } catch (err) { logger.error(`Error synchronizing virtual circuits`); }
    }
  public async setCircuitStateAsync(id: number, val: boolean, ignoreDelays?: boolean): Promise<ICircuitState> {
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
      await sys.board.syncEquipmentItems();
      return state.circuits.getInterfaceById(circ.id);
    }
    catch (err) { return Promise.reject(`Nixie: Error setCircuitStateAsync ${err.message}`); }
    finally {
      ncp.pumps.syncPumpStates();
      sys.board.suspendStatus(false);
      state.emitEquipmentChanges();
    }
  }
  public async toggleCircuitStateAsync(id: number): Promise<ICircuitState> {
    let circ = state.circuits.getInterfaceById(id);
    return await this.setCircuitStateAsync(id, !(circ.isOn || false));
  }
  public async runLightGroupCommandAsync(obj: any): Promise<ICircuitState> {
    // Do all our validation.
    try {
      let id = parseInt(obj.id, 10);
      let cmd = typeof obj.command !== 'undefined' ? sys.board.valueMaps.lightGroupCommands.findItem(obj.command) : { val: 0, name: 'undefined' };
      if (cmd.val === 0) return Promise.reject(new InvalidOperationError(`Light group command ${cmd.name} does not exist`, 'runLightGroupCommandAsync'));
      if (isNaN(id)) return Promise.reject(new InvalidOperationError(`Light group ${id} does not exist`, 'runLightGroupCommandAsync'));
      let grp = sys.lightGroups.getItemById(id);
      let nop = sys.board.valueMaps.circuitActions.getValue(cmd.name);
      let sgrp = state.lightGroups.getItemById(grp.id);
      sgrp.action = nop;
      sgrp.emitEquipmentChange();
      // So here we are now we can run the command against all lights in the group that match the command so get a list of the lights.
      let arrCircs = [];
      for (let i = 0; i < grp.circuits.length; i++) {
        let circ = sys.circuits.getItemById(grp.circuits.getItemByIndex(i).circuit);
        let type = sys.board.valueMaps.circuitFunctions.transform(circ.type);
        if (type.isLight && cmd.types.includes(type.theme)) arrCircs.push(circ);
      }
      // So now we should hav a complete list of the lights that are part of the command list so start them off on their sequence.  We want all the lights
      // to be doing their thing at the same time so in the lieu of threads we will ceate a promise all.
      let proms = [];
      for (let i = 0; i < arrCircs.length; i++) {
        await ncp.circuits.sendOnOffSequenceAsync(arrCircs[i].id, cmd.sequence);
        //proms.push(ncp.circuits.sendOnOffSequenceAsync(arrCircs[i].id, cmd.sequence));
      }
      for (let i = 0; i < arrCircs.length; i++) {
        await sys.board.circuits.setCircuitStateAsync(arrCircs[i].id, false);
        //proms.push(ncp.circuits.sendOnOffSequenceAsync(arrCircs[i].id, cmd.sequence));
      }
      await utils.sleep(10000);
      for (let i = 0; i < arrCircs.length; i++) {
        await sys.board.circuits.setCircuitStateAsync(arrCircs[i].id, true);
        //proms.push(ncp.circuits.sendOnOffSequenceAsync(arrCircs[i].id, cmd.sequence));
      }

      //if (proms.length > 0) {
      //    //await Promise.all(proms);
      //    // Let it simmer for 6 seconds then turn it off and back on.
      //    proms.length = 0;
      //    for (let i = 0; i < arrCircs.length; i++) {
      //        proms.push(sys.board.circuits.setCircuitStateAsync(arrCircs[i].id, false));
      //    }
      //    await Promise.all(proms);
      //    // Let it be off for 3 seconds then turn it back on.
      //    await utils.sleep(10000);
      //    proms.length = 0;
      //    for (let i = 0; i < arrCircs.length; i++) {
      //        proms.push(sys.board.circuits.setCircuitStateAsync(arrCircs[i].id, true));
      //    }
      //    await Promise.all(proms);
      //}
      sgrp.action = 0;
      sgrp.emitEquipmentChange();
      return state.lightGroups.getItemById(id);
    }
    catch (err) { return Promise.reject(`Error runLightGroupCommandAsync ${err.message}`); }
  }
    public async runLightCommandAsync(obj: any): Promise<ICircuitState> {
        // Do all our validation.
        try {
            let id = parseInt(obj.id, 10);
            let cmd = typeof obj.command !== 'undefined' ? sys.board.valueMaps.lightCommands.findItem(obj.command) : { val: 0, name: 'undefined' };
            if (cmd.val === 0) return Promise.reject(new InvalidOperationError(`Light command ${cmd.name} does not exist`, 'runLightCommandAsync'));
            if (isNaN(id)) return Promise.reject(new InvalidOperationError(`Light ${id} does not exist`, 'runLightCommandAsync'));
            let circ = sys.circuits.getItemById(id);
            if (!circ.isActive) return Promise.reject(new InvalidOperationError(`Light circuit #${id} is not active`, 'runLightCommandAsync'));
            let type = sys.board.valueMaps.circuitFunctions.transform(circ.type);
            if (!type.isLight) return Promise.reject(new InvalidOperationError(`Circuit #${id} is not a light`, 'runLightCommandAsync'));
            let nop = sys.board.valueMaps.circuitActions.getValue(cmd.name);
            let slight = state.circuits.getItemById(circ.id);
            slight.action = nop;
            console.log(nop);
            slight.emitEquipmentChange();
            await ncp.circuits.sendOnOffSequenceAsync(circ.id, cmd.sequence);
            if (cmd.sequence.length > 0) {
                await sys.board.circuits.setCircuitStateAsync(circ.id, cmd.sequence[cmd.sequence.length - 1].isOn);
            }
            if (typeof cmd.endingTheme !== 'undefined') {
                let thm = sys.board.valueMaps.lightThemes.findItem(cmd.endingTheme);
                if (typeof thm !== 'undefined') slight.lightingTheme = circ.lightingTheme = thm.val;
            }
            //await utils.sleep(7000);
            //await sys.board.circuits.setCircuitStateAsync(circ.id, false);
            //await sys.board.circuits.setCircuitStateAsync(circ.id, true);
            slight.action = 0;
            slight.emitEquipmentChange();
            return slight;
        }
        catch (err) { return Promise.reject(`Error runLightCommandAsync ${err.message}`); }
    }
  public async setLightThemeAsync(id: number, theme: number): Promise<ICircuitState> {
    let cstate = state.circuits.getItemById(id);
    let circ = sys.circuits.getItemById(id);
    let thm = sys.board.valueMaps.lightThemes.findItem(theme);
    let nop = sys.board.valueMaps.circuitActions.getValue('lighttheme');
    cstate.action = nop;
    cstate.emitEquipmentChange();
    try {
      if (typeof thm !== 'undefined' && typeof thm.sequence !== 'undefined' && circ.master === 1) {
        await sys.board.circuits.setCircuitStateAsync(id, true);
        await ncp.circuits.sendOnOffSequenceAsync(id, thm.sequence);
      }
      cstate.lightingTheme = theme;
      return cstate;
    } catch (err) { return Promise.reject(new InvalidOperationError(err.message, 'setLightThemeAsync')); }
    finally { cstate.action = 0; cstate.emitEquipmentChange(); }
  }
  public async setColorHoldAsync(id: number): Promise<ICircuitState> {
    try {
      let circ = sys.circuits.getItemById(id);
      if (!circ.isActive) return Promise.reject(new InvalidEquipmentIdError(`Invalid circuit id ${id}`, id, 'circuit'));
      let cstate = state.circuits.getItemById(circ.id);
      let cmd = sys.board.valueMaps.lightCommands.findItem('colorhold');
      await sys.board.circuits.setCircuitStateAsync(id, true);
      if (circ.master === 1) await ncp.circuits.sendOnOffSequenceAsync(id, cmd.sequence);
      return cstate;
    }
    catch (err) { return Promise.reject(`Nixie: Error setColorHoldAsync ${err.message}`); }
  }
  public async setColorRecallAsync(id: number): Promise<ICircuitState> {
    try {
      let circ = sys.circuits.getItemById(id);
      if (!circ.isActive) return Promise.reject(new InvalidEquipmentIdError(`Invalid circuit id ${id}`, id, 'circuit'));
      let cstate = state.circuits.getItemById(circ.id);
      let cmd = sys.board.valueMaps.lightCommands.findItem('colorrecall');
      await sys.board.circuits.setCircuitStateAsync(id, true);
      if (circ.master === 1) await ncp.circuits.sendOnOffSequenceAsync(id, cmd.sequence);
      return cstate;
    }
    catch (err) { return Promise.reject(`Nixie: Error setColorHoldAsync ${err.message}`); }
  }
  public async setLightThumperAsync(id: number): Promise<ICircuitState> { return state.circuits.getItemById(id); }

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
  public getCircuitFunctions() {
    let cf = sys.board.valueMaps.circuitFunctions.toArray();
    if (!sys.equipment.shared) cf = cf.filter(x => { return x.name !== 'spillway' && x.name !== 'spadrain' });
    return cf;
  }
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
        scircuit.isActive = circuit.isActive = true;
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
    let sgroup = state.lightGroups.getItemById(id, true);
    return new Promise<LightGroup>((resolve, reject) => {
      if (typeof obj.name !== 'undefined') sgroup.name = group.name = obj.name;
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
    let isOn = sys.board.valueMaps.lightThemes.getName(theme) === 'off' ? false : true;
    sys.board.circuits.setEndTime(grp, sgrp, isOn);
    sgrp.isOn = isOn;
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
  public async sequenceLightGroupAsync(id: number, operation: string): Promise<LightGroupState> {
    let sgroup = state.lightGroups.getItemById(id);
    // This is the default action which really does nothing.
    try {
      let nop = sys.board.valueMaps.circuitActions.getValue(operation);
      if (nop > 0) {
        sgroup.action = nop;
        sgroup.emitEquipmentChange();
        await utils.sleep(10000);
        sgroup.action = 0;
        state.emitAllEquipmentChanges();
      }
      return sgroup;
    } catch (err) { return Promise.reject(new InvalidOperationError(`Error sequencing light group ${err.message}`, 'sequenceLightGroupAsync')); }
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
  public setEndTime(thing: ICircuit, thingState: ICircuitState, isOn: boolean, bForce: boolean = false) {
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
        // schedules don't come into play if the circuit is in manualPriority
        if (!thingState.manualPriorityActive) {

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
        }
        if (typeof endTime !== 'undefined') thingState.endTime = endTime;
        else if (typeof eggTimerEndTime !== 'undefined') thingState.endTime = eggTimerEndTime;
      }
    }
    catch (err) {
      logger.error(`Error setting end time for ${thing.id}: ${err}`)
    }
  }
  public async turnOffDrainCircuits(ignoreDelays: boolean) {
    try {
      {
        let drt = sys.board.valueMaps.circuitFunctions.getValue('spadrain');
        let drains = sys.circuits.filter(x => { return x.type === drt });
        for (let i = 0; i < drains.length; i++) {
          let drain = drains.getItemByIndex(i);
          let sdrain = state.circuits.getItemById(drain.id);
          if (sdrain.isOn) await sys.board.circuits.setCircuitStateAsync(drain.id, false, ignoreDelays);
          sdrain.startDelay = false;
          sdrain.stopDelay = false;
        }
      }
      {
        let drt = sys.board.valueMaps.featureFunctions.getValue('spadrain');
        let drains = sys.features.filter(x => { return x.type === drt });
        for (let i = 0; i < drains.length; i++) {
          let drain = drains.getItemByIndex(i);
          let sdrain = state.features.getItemById(drain.id);
          if (sdrain.isOn) await sys.board.features.setFeatureStateAsync(drain.id, false, ignoreDelays);
        }
      }

    } catch (err) { return Promise.reject(new BoardProcessError(`turnOffDrainCircuits: ${err.message}`)); }
  }
  public async turnOffCleanerCircuits(bstate: BodyTempState, ignoreDelays?: boolean) {
    try {
      // First we have to get all the cleaner circuits that are associated with the
      // body.  To do this we get the circuit functions for all cleaner types associated with the body.
      //
      // Cleaner ciruits can always be turned off.  However, they cannot always be turned on.
      let arrTypes = sys.board.valueMaps.circuitFunctions.toArray().filter(x => { return x.name.indexOf('cleaner') !== -1 && x.body === bstate.id; });
      let cleaners = sys.circuits.filter(x => { return arrTypes.findIndex(t => { return t.val === x.type }) !== -1 });
      // So now we should have all the cleaner circuits so lets make sure they are off.
      for (let i = 0; i < cleaners.length; i++) {
        let cleaner = cleaners.getItemByIndex(i);
        if (cleaner.isActive) {
          let cstate = state.circuits.getItemById(cleaner.id, true);
          if (cstate.isOn || cstate.startDelay) await sys.board.circuits.setCircuitStateAsync(cleaner.id, false, ignoreDelays);
        }
      }
    } catch (err) { return Promise.reject(new BoardProcessError(`turnOffCleanerCircuits: ${err.message}`)); }
  }
  public async turnOffSpillwayCircuits(ignoreDelays?: boolean) {
    try {
      {
        let arrTypes = sys.board.valueMaps.circuitFunctions.toArray().filter(x => { return x.name.indexOf('spillway') !== -1 });
        let spillways = sys.circuits.filter(x => { return arrTypes.findIndex(t => { return t.val === x.type }) !== -1 });
        // So now we should have all the cleaner circuits so lets make sure they are off.
        for (let i = 0; i < spillways.length; i++) {
          let spillway = spillways.getItemByIndex(i);
          if (spillway.isActive) {
            let cstate = state.circuits.getItemById(spillway.id, true);
            if (cstate.isOn || cstate.startDelay) await sys.board.circuits.setCircuitStateAsync(spillway.id, false, ignoreDelays);
          }
        }
      }
      {
        let arrTypes = sys.board.valueMaps.featureFunctions.toArray().filter(x => { return x.name.indexOf('spillway') !== -1 });
        let spillways = sys.features.filter(x => { return arrTypes.findIndex(t => { return t.val === x.type }) !== -1 });
        // So now we should have all the cleaner features so lets make sure they are off.
        for (let i = 0; i < spillways.length; i++) {
          let spillway = spillways.getItemByIndex(i);
          if (spillway.isActive) {
            let cstate = state.features.getItemById(spillway.id, true);
            if (cstate.isOn) await sys.board.features.setFeatureStateAsync(spillway.id, false, ignoreDelays);
          }
        }
      }
    } catch (err) { return Promise.reject(new BoardProcessError(`turnOffSpillwayCircuits: ${err.message}`)); }
  }
}
export class FeatureCommands extends BoardCommands {
  public getFeatureFunctions() {
    let cf = sys.board.valueMaps.featureFunctions.toArray();
    if (!sys.equipment.shared) cf = cf.filter(x => { return x.name !== 'spillway' && x.name !== 'spadrain' });
    return cf;
  }

  public async restore(rest: { poolConfig: any, poolState: any }, ctx: any, res: RestoreResults): Promise<boolean> {
    try {
      // First delete the features that should be removed.
      for (let i = 0; i < ctx.features.remove.length; i++) {
        let f = ctx.features.remove[i];
        try {
          await sys.board.features.deleteFeatureAsync(f);
          res.addModuleSuccess('feature', `Remove: ${f.id}-${f.name}`);
        } catch (err) { res.addModuleError('feature', `Remove: ${f.id}-${f.name}: ${err.message}`) }
      }
      for (let i = 0; i < ctx.features.update.length; i++) {
        let f = ctx.features.update[i];
        try {
          await sys.board.features.setFeatureAsync(f);
          res.addModuleSuccess('feature', `Update: ${f.id}-${f.name}`);
        } catch (err) { res.addModuleError('feature', `Update: ${f.id}-${f.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.features.add.length; i++) {
        // pull a little trick to first add the data then perform the update.  This way we won't get a new id or
        // it won't error out.
        let f = ctx.features.add[i];
        try {
          sys.features.getItemById(f, true);
          await sys.board.features.setFeatureAsync(f);
          res.addModuleSuccess('feature', `Add: ${f.id}-${f.name}`);
        } catch (err) { res.addModuleError('feature', `Add: ${f.id}-${f.name}: ${err.message}`) }
      }
      return true;
    } catch (err) { logger.error(`Error restoring features: ${err.message}`); res.addModuleError('system', `Error restoring features: ${err.message}`); return false; }
  }
  public async validateRestore(rest: { poolConfig: any, poolState: any }): Promise<{ errors: any, warnings: any, add: any, update: any, remove: any }> {
    try {
      let ctx = { errors: [], warnings: [], add: [], update: [], remove: [] };
      // Look at features.
      let cfg = rest.poolConfig;
      for (let i = 0; i < cfg.features.length; i++) {
        let r = cfg.features[i];
        let c = sys.features.find(elem => r.id === elem.id);
        if (typeof c === 'undefined') ctx.add.push(r);
        else if (JSON.stringify(c.get()) !== JSON.stringify(r)) ctx.update.push(r);
      }
      for (let i = 0; i < sys.features.length; i++) {
        let c = sys.features.getItemByIndex(i);
        let r = cfg.features.find(elem => elem.id == c.id);
        if (typeof r === 'undefined') ctx.remove.push(c.get(true));
      }
      return ctx;
    } catch (err) { logger.error(`Error validating features for restore: ${err.message}`); }
  }

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
  public async setFeatureStateAsync(id: number, val: boolean, ignoreDelays?: boolean): Promise<ICircuitState> {
    try {
      if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid feature id: ${id}`, id, 'Feature'));
      if (!sys.board.equipmentIds.features.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid feature id: ${id}`, id, 'Feature'));
      let feature = sys.features.getItemById(id);
      let fstate = state.features.getItemById(feature.id, feature.isActive !== false);
      sys.board.circuits.setEndTime(feature, fstate, val);
      fstate.isOn = val;
      sys.board.valves.syncValveStates();
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
  public async restore(rest: { poolConfig: any, poolState: any }, ctx: any, res: RestoreResults): Promise<boolean> {
    try {
      // First delete the chlorinators that should be removed.
      for (let i = 0; i < ctx.chlorinators.remove.length; i++) {
        let c = ctx.chlorinators.remove[i];
        try {
          await sys.board.chlorinator.deleteChlorAsync(c);
          res.addModuleSuccess('chlorinator', `Remove: ${c.id}-${c.name}`);
        } catch (err) { res.addModuleError('chlorinator', `Remove: ${c.id}-${c.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.chlorinators.update.length; i++) {
        let c = ctx.chlorinators.update[i];
        try {
          await sys.board.chlorinator.setChlorAsync(c);
          res.addModuleSuccess('chlorinator', `Update: ${c.id}-${c.name}`);
        } catch (err) { res.addModuleError('chlorinator', `Update: ${c.id}-${c.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.chlorinators.add.length; i++) {
        let c = ctx.chlorinators.add[i];
        try {
          // pull a little trick to first add the data then perform the update.  This way we won't get a new id or
          // it won't error out.
          sys.chlorinators.getItemById(c.id, true);
          await sys.board.chlorinator.setChlorAsync(c);
          res.addModuleSuccess('chlorinator', `Add: ${c.id}-${c.name}`);
        } catch (err) { res.addModuleError('chlorinator', `Add: ${c.id}-${c.name}: ${err.message}`); }
      }
      return true;
    } catch (err) { logger.error(`Error restoring chlorinators: ${err.message}`); res.addModuleError('system', `Error restoring chlorinators: ${err.message}`); return false; }
  }

  public async validateRestore(rest: { poolConfig: any, poolState: any }): Promise<{ errors: any, warnings: any, add: any, update: any, remove: any }> {
    try {
      let ctx = { errors: [], warnings: [], add: [], update: [], remove: [] };
      // Look at chlorinators.
      let cfg = rest.poolConfig;
      for (let i = 0; i < cfg.chlorinators.length; i++) {
        let r = cfg.chlorinators[i];
        let c = sys.chlorinators.find(elem => r.id === elem.id);
        if (typeof c === 'undefined') ctx.add.push(r);
        else if (JSON.stringify(c.get()) !== JSON.stringify(r)) ctx.update.push(r);
      }
      for (let i = 0; i < sys.chlorinators.length; i++) {
        let c = sys.chlorinators.getItemByIndex(i);
        let r = cfg.chlorinators.find(elem => elem.id == c.id);
        if (typeof r === 'undefined') ctx.remove.push(c.get(true));
      }
      return ctx;
    } catch (err) { logger.error(`Error validating chlorinators for restore: ${err.message}`); }
  }

  public async setChlorAsync(obj: any): Promise<ChlorinatorState> {
    try {
      let id = parseInt(obj.id, 10);
      let chlor: Chlorinator;
      let master = parseInt(obj.master, 10);
      let portId = typeof obj.portId !== 'undefined' ? parseInt(obj.portId, 10) : 0;
      if (isNaN(master)) master = 1; // NCP to control.
      if (isNaN(id) || id <= 0) {
        let body = sys.board.bodies.mapBodyAssociation(typeof obj.body !== 'undefined' ? parseInt(obj.body, 10) : 0);
        if (typeof body === 'undefined') {
          if (sys.equipment.shared) body = 32;
          else if (!sys.equipment.dual) body = 1;
          else return Promise.reject(new InvalidEquipmentDataError(`Chlorinator body association is not valid: ${body}`, 'chlorinator', body));
        }
        let poolSetpoint = typeof obj.poolSetpoint !== 'undefined' ? parseInt(obj.poolSetpoint, 10) : 50;
        let spaSetpoint = typeof obj.spaSetpoint !== 'undefined' ? parseInt(obj.spaSetpoint, 10) : 10;
        if (isNaN(poolSetpoint) || poolSetpoint > 100 || poolSetpoint < 0) return Promise.reject(new InvalidEquipmentDataError(`Chlorinator poolSetpoint is out of range: ${chlor.poolSetpoint}`, 'chlorinator', poolSetpoint));
        if (isNaN(spaSetpoint) || spaSetpoint > 100 || spaSetpoint < 0) return Promise.reject(new InvalidEquipmentDataError(`Chlorinator spaSetpoint is out of range: ${chlor.poolSetpoint}`, 'chlorinator', spaSetpoint));
        if (master === 2) {
          // We can add as many external chlorinators as we want.
          id = sys.chlorinators.count(elem => elem.master === 2) + 50;
          chlor = sys.chlorinators.getItemById(id, true, { id: id, master: parseInt(obj.master, 10) });
        }
        else {
          if (portId === 0 && sys.controllerType !== ControllerType.Nixie) return Promise.reject(new InvalidEquipmentDataError(`You may not install a chlorinator on an ${sys.controllerType} system that is assigned to the Primary Port`, 'Chlorinator', portId));
          if (sys.chlorinators.count(elem => elem.portId === portId && elem.master !== 2) > 0) return Promise.reject(new InvalidEquipmentDataError(`There is already a chlorinator using port #${portId}.  Only one chlorinator may be installed per port.`, 'Chlorinator', portId));
          // We are adding so we need to see if there is another chlorinator that is not external.
          if (sys.chlorinators.count(elem => elem.master !== 2) > sys.equipment.maxChlorinators) return Promise.reject(new InvalidEquipmentDataError(`The max number of chlorinators has been exceeded you may only add ${sys.equipment.maxChlorinators}`, 'Chlorinator', sys.equipment.maxChlorinators));
          id = sys.chlorinators.getMaxId(false, 0) + 1;
          chlor = sys.chlorinators.getItemById(id, true, { id: id, master: 1 });
        }
      }
      else chlor = sys.chlorinators.getItemById(id, false);

      if (chlor.master === 1)
        await ncp.chlorinators.setChlorinatorAsync(chlor, obj);
      else {
        let body = sys.board.bodies.mapBodyAssociation(typeof obj.body !== 'undefined' ? parseInt(obj.body, 10) : chlor.body);
        if (typeof body === 'undefined') {
          if (sys.equipment.shared) body = 32;
          else if (!sys.equipment.dual) body = 1;
          else return Promise.reject(new InvalidEquipmentDataError(`Chlorinator body association is not valid: ${body}`, 'chlorinator', body));
        }
        let poolSetpoint = typeof obj.poolSetpoint !== 'undefined' ? parseInt(obj.poolSetpoint, 10) : isNaN(chlor.poolSetpoint) ? 50 : chlor.poolSetpoint;
        let spaSetpoint = typeof obj.spaSetpoint !== 'undefined' ? parseInt(obj.spaSetpoint, 10) : isNaN(chlor.spaSetpoint) ? 10 : chlor.spaSetpoint;
        if (poolSetpoint > 100 || poolSetpoint < 0) return Promise.reject(new InvalidEquipmentDataError(`Chlorinator poolSetpoint is out of range: ${chlor.poolSetpoint}`, 'chlorinator', chlor.poolSetpoint));
        if (spaSetpoint > 100 || spaSetpoint < 0) return Promise.reject(new InvalidEquipmentDataError(`Chlorinator spaSetpoint is out of range: ${chlor.poolSetpoint}`, 'chlorinator', chlor.spaSetpoint));

        chlor = sys.chlorinators.getItemById(id, true);
        let schlor = state.chlorinators.getItemById(chlor.id, true);
        chlor.name = schlor.name = obj.name || chlor.name || 'Chlorinator --' + id;
        chlor.superChlorHours = schlor.superChlorHours = typeof obj.superChlorHours !== 'undefined' ? parseInt(obj.superChlorHours, 10) : isNaN(chlor.superChlorHours) ? 8 : chlor.superChlorHours;
        chlor.superChlor = schlor.superChlor = typeof obj.superChlorinate !== 'undefined' ? utils.makeBool(obj.superChlorinate) : chlor.superChlor;
        chlor.superChlor = schlor.superChlor = typeof obj.superChlor !== 'undefined' ? utils.makeBool(obj.superChlor) : chlor.superChlor;

        chlor.isDosing = typeof obj.isDosing !== 'undefined' ? utils.makeBool(obj.isDosing) : chlor.isDosing || false;
        chlor.disabled = typeof obj.disabled !== 'undefined' ? utils.makeBool(obj.disabled) : chlor.disabled || false;
        schlor.model = chlor.model = typeof obj.model !== 'undefined' ? sys.board.valueMaps.chlorinatorModel.encode(obj.model) : chlor.model;
        chlor.type = schlor.type = typeof obj.type !== 'undefined' ? sys.board.valueMaps.chlorinatorType.encode(obj.type) : chlor.type || 0;
        chlor.body = schlor.body = body.val;
        schlor.poolSetpoint = chlor.poolSetpoint = poolSetpoint;
        schlor.spaSetpoint = chlor.spaSetpoint = spaSetpoint;
        chlor.ignoreSaltReading = typeof obj.ignoreSaltReading !== 'undefined' ? utils.makeBool(obj.ignoreSaltReading) : utils.makeBool(chlor.ignoreSaltReading);
        schlor.isActive = chlor.isActive = typeof obj.isActive !== 'undefined' ? utils.makeBool(obj.isActive) : typeof chlor.isActive !== 'undefined' ? utils.makeBool(chlor.isActive) : true;
        chlor.master = 2;
        schlor.currentOutput = typeof obj.currentOutput !== 'undefined' ? parseInt(obj.currentOutput, 10) : schlor.currentOutput;
        schlor.lastComm = typeof obj.lastComm !== 'undefined' ? obj.lastComm : schlor.lastComm || Date.now();
        schlor.status = typeof obj.status !== 'undefined' ? sys.board.valueMaps.chlorinatorStatus.encode(obj.status) : sys.board.valueMaps.chlorinatorStatus.encode(schlor.status || 0);
        if (typeof obj.superChlorRemaining !== 'undefined') schlor.superChlorRemaining = parseInt(obj.superChlorRemaining, 10);
        schlor.targetOutput = typeof obj.targetOutput !== 'undefined' ? parseInt(obj.targetOutput, 10) : schlor.targetOutput;
        schlor.saltLevel = typeof obj.saltLevel !== 'undefined' ? parseInt(obj.saltLevel, 10) : schlor.saltLevel;
      }
      state.emitEquipmentChanges();
      return Promise.resolve(state.chlorinators.getItemById(id));
    }
    catch (err) {
      logger.error(`Error setting chlorinator: ${err}`)
      return Promise.reject(err);
    }
  }
  public async deleteChlorAsync(obj: any): Promise<ChlorinatorState> {
    try {
      let id = parseInt(obj.id, 10);
      if (isNaN(id)) return Promise.reject(new InvalidEquipmentDataError(`Chlorinator id is not valid: ${obj.id}`, 'chlorinator', obj.id));
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
  public async restore(rest: { poolConfig: any, poolState: any }, ctx: any, res: RestoreResults): Promise<boolean> {
    try {
      // First delete the schedules that should be removed.
      for (let i = 0; i < ctx.schedules.remove.length; i++) {
        let s = ctx.schedules.remove[i];
        try {
          await sys.board.schedules.deleteScheduleAsync(ctx.schedules.remove[i]);
          res.addModuleSuccess('schedule', `Remove: ${s.id}-${s.circuitId}`);
        } catch (err) { res.addModuleError('schedule', `Remove: ${s.id}-${s.circuitId} ${err.message}`); }
      }
      for (let i = 0; i < ctx.schedules.update.length; i++) {
        let s = ctx.schedules.update[i];
        try {
          await sys.board.schedules.setScheduleAsync(s);
          res.addModuleSuccess('schedule', `Update: ${s.id}-${s.circuitId}`);
        } catch (err) { res.addModuleError('schedule', `Update: ${s.id}-${s.circuitId} ${err.message}`); }
      }
      for (let i = 0; i < ctx.schedules.add.length; i++) {
        let s = ctx.schedules.add[i];
        try {
          // pull a little trick to first add the data then perform the update.  This way we won't get a new id or
          // it won't error out.
          sys.schedules.getItemById(s.id, true);
          await sys.board.schedules.setScheduleAsync(s);
          res.addModuleSuccess('schedule', `Add: ${s.id}-${s.circuitId}`);
        } catch (err) { res.addModuleError('schedule', `Add: ${s.id}-${s.circuitId} ${err.message}`); }
      }
      return true;
    } catch (err) { logger.error(`Error restoring schedules: ${err.message}`); res.addModuleError('system', `Error restoring schedules: ${err.message}`); return false; }
  }
  public async validateRestore(rest: { poolConfig: any, poolState: any }): Promise<{ errors: any, warnings: any, add: any, update: any, remove: any }> {
    try {
      let ctx = { errors: [], warnings: [], add: [], update: [], remove: [] };
      // Look at schedules.
      let cfg = rest.poolConfig;
      for (let i = 0; i < cfg.schedules.length; i++) {
        let r = cfg.schedules[i];
        let c = sys.schedules.find(elem => r.id === elem.id);
        if (typeof c === 'undefined') ctx.add.push(r);
        else if (JSON.stringify(c.get()) !== JSON.stringify(r)) ctx.update.push(r);
      }
      for (let i = 0; i < sys.schedules.length; i++) {
        let c = sys.schedules.getItemByIndex(i);
        let r = cfg.schedules.find(elem => elem.id == c.id);
        if (typeof r === 'undefined') ctx.remove.push(c.get(true));
      }
      return ctx;
    } catch (err) { logger.error(`Error validating schedules for restore: ${err.message}`); }
  }

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
    let disabled = typeof data.disabled !== 'undefined' ? utils.makeBool(data.disabled) : sched.disabled;

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

    // If we made it to here we are valid and the schedula and it state should exist.
    sched = sys.schedules.getItemById(id, true);
    ssched = state.schedules.getItemById(id, true);
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
    ssched.isActive = sched.isActive = true;
    ssched.disabled = sched.disabled = disabled;
    ssched.display = sched.display = display;
    if (typeof sched.startDate === 'undefined')
      sched.master = 1;
    await ncp.schedules.setScheduleAsync(sched, data);
    // update end time in case sched is changed while circuit is on
    let cstate = state.circuits.getInterfaceById(sched.circuit);
    sys.board.circuits.setEndTime(sys.circuits.getInterfaceById(sched.circuit), cstate, cstate.isOn, true);
    cstate.emitEquipmentChange();
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
        let mOP = sys.board.schedules.manualPriorityActive(ssched);  //sys.board.schedules.manualPriorityActiveByProxy(scirc.id);
        if (scirc.isOn && !mOP &&
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
  public manualPriorityForThisCircuit(circuit: number): boolean {
    // This fn will test if this circuit/light group has any circuit group circuits that have manual priority active
    let grp: ICircuitGroup;
    let cgc: ICircuitGroupCircuit[] = [];
    if (sys.board.equipmentIds.circuitGroups.isInRange(circuit) || sys.board.equipmentIds.features.isInRange(circuit))
      grp = sys.circuitGroups.getInterfaceById(circuit);
    if (state.circuitGroups.getInterfaceById(circuit).manualPriorityActive) return true;
    if (grp && grp.isActive) cgc = grp.circuits.toArray();
    for (let i = 0; i < cgc.length; i++) {
      let c = state.circuits.getInterfaceById(cgc[i].circuit);
      if (c.manualPriorityActive) return true;
    }
    return false;
  }
  public manualPriorityActive(schedule: ScheduleState): boolean {
    // This method will look at all other schedules.  If any of them have been resumed, 
    // and manualPriority (global setting) is on, and this schedule would otherwise impact
    // that circuit, then we declared this schedule as being delayed due to manual override
    // priority (mOP).
    // We only need to check this if shouldBeOn = true; if that's false, exit.
    // Rules:
    // 1. If the circuit id for this schedule is in manual priority, then true
    // 2. If the other schedule will turn on a body in a shared body, and it will affect
    //    this circuit id, return true
    // 3. If this is a circuit/light group schedule, check to see if any member circuit/lights have mOP active
    // 4. If this is a circuit/light/feature, is there another group that has this same id with mOP active

    if (schedule.isActive === false) return false;
    if (schedule.disabled) return false;
    //if (!sys.general.options.manualPriority) return false; //if we override a circuit to be mOP, this will not be true

    let currGrp: ICircuitGroup;
    let currSchedGrpCircs = [];
    if (sys.board.equipmentIds.circuitGroups.isInRange(schedule.circuit) || sys.board.equipmentIds.features.isInRange(schedule.circuit))
    currGrp = sys.circuitGroups.getInterfaceById(schedule.circuit);
    if (currGrp && currGrp.isActive) currSchedGrpCircs = currGrp.circuits.toArray();
    let circuitGrps: ICircuitGroup[] = sys.circuitGroups.toArray();
    let lightGrps: ICircuitGroup[] = sys.lightGroups.toArray();
    let currManualPriorityByProxy = sys.board.schedules.manualPriorityForThisCircuit(schedule.circuit);
    // check this circuit
    if (state.circuits.getInterfaceById(schedule.circuit).manualPriorityActive) return true;
    // check this group, if present
    if (currManualPriorityByProxy) return true;

    let schedules: ScheduleState[] = state.schedules.get(true);
    for (let i = 0; i < schedules.length; i++) {
      let sched = schedules[i];
      // if the id of another circuit is the same as this, we should delay
      let schedCState = state.circuits.getInterfaceById(sched.circuit);
      if (schedule.circuit === schedCState.id && schedCState.manualPriorityActive) return true;
      // if OCP includes a shared body, and this schedule affects the shared body, 
      // and this body is still on, we should delay
      if (sys.equipment.shared && schedCState.dataName === 'circuit') {
        let otherBody = sys.bodies.find(elem => elem.circuit === sched.circuit);
        // let otherBodyIsOn = state.circuits.getInterfaceById(sched.circuit).isOn;
        let thisBody = sys.bodies.find(elem => elem.circuit === schedule.circuit);
        if (typeof otherBody !== 'undefined' && typeof thisBody !== 'undefined' && schedCState.manualPriorityActive) return true;
      }
      // if other circuit/schedule groups have this circ id, and it's mOP, return true
      if (schedCState.dataName === 'circuitGroup') {
        for (let i = 0; i < circuitGrps.length; i++) {
          let grp: ICircuitGroup = circuitGrps[i];
          let sgrp: ICircuitGroupState = state.circuitGroups.getInterfaceById(grp.id);
          let circuits = grp.circuits.toArray();
          if (grp.isActive) {
            let manualPriorityByProxy = sys.board.schedules.manualPriorityForThisCircuit(grp.id);
            for (let j = 0; j < circuits.length; j++) {
              let cgc = grp.circuits.getItemByIndex(j);
              let scgc = state.circuits.getInterfaceById(cgc.circuit);
              // if the circuit id's match and mOP is active, we delay
              if (scgc.id === schedule.circuit && manualPriorityByProxy) return true;
              // check all the other cgc against this cgc
              // note: circuit/light groups cannot be part of a group themselves
              for (let k = 0; k < currSchedGrpCircs.length; k++) {
                let currCircGrpCirc = state.circuits.getInterfaceById(currSchedGrpCircs[k].circuit);
                // if either circuit in either group has mOP then delay
                if (currManualPriorityByProxy || manualPriorityByProxy) {
                  if (currCircGrpCirc.id === schedCState.id) return true;
                  if (currCircGrpCirc.id === scgc.id) return true;
                }
              }
            }
          }
        }
      }
      if (schedCState.dataName === 'lightGroup') {
        for (let i = 0; i < lightGrps.length; i++) {
          let grp: ICircuitGroup = lightGrps[i];
          let sgrp: ICircuitGroupState = state.circuitGroups.getInterfaceById(grp.id);
          let circuits = grp.circuits.toArray();
          if (grp.isActive) {
            let manualPriorityByProxy = sys.board.schedules.manualPriorityForThisCircuit(grp.id);
            for (let j = 0; j < circuits.length; j++) {
              let cgc = grp.circuits.getItemByIndex(j);
              let scgc = state.circuits.getInterfaceById(cgc.circuit);
              // if the circuit id's match and mOP is active, we delay
              if (scgc.id === schedule.circuit && scgc.manualPriorityActive) return true;
              // check all the other cgc against this cgc
              // note: circuit/light groups cannot be part of a group themselves
              for (let k = 0; k < currSchedGrpCircs.length; k++) {
                let currCircGrpCirc = state.circuits.getInterfaceById(currSchedGrpCircs[k].circuit);
                // if either circuit in either group has mOP then delay
                if (currManualPriorityByProxy || manualPriorityByProxy) {
                  if (currCircGrpCirc.id === schedCState.id) return true;
                  if (currCircGrpCirc.id === scgc.id) return true;
                }
              }
            }
          }
        }
      }
    }
    // if we make it this far, nothing is impacting us
    return false;
  }
}
export class HeaterCommands extends BoardCommands {
    public async restore(rest: { poolConfig: any, poolState: any }, ctx: any, res: RestoreResults): Promise<boolean> {
        try {
            // First delete the heaters that should be removed.
            for (let i = 0; i < ctx.heaters.remove.length; i++) {
                let h = ctx.heaters.remove[i];
                try {
                    await sys.board.heaters.deleteHeaterAsync(h);
                    res.addModuleSuccess('heater', `Remove: ${h.id}-${h.name}`);
                } catch (err) { res.addModuleError('heater', `Remove: ${h.id}-${h.name}: ${err.message}`); }
            }
            for (let i = 0; i < ctx.heaters.update.length; i++) {
                let h = ctx.heaters.update[i];
                try {
                    await sys.board.heaters.setHeaterAsync(h);
                    res.addModuleSuccess('heater', `Update: ${h.id}-${h.name}`);
                } catch (err) { res.addModuleError('heater', `Update: ${h.id}-${h.name}: ${err.message}`); }
            }
            for (let i = 0; i < ctx.heaters.add.length; i++) {
                let h = ctx.heaters.add[i];
                try {
                    // pull a little trick to first add the data then perform the update.  This way we won't get a new id or
                    // it won't error out.
                    sys.heaters.getItemById(h.id, true);
                    await sys.board.heaters.setHeaterAsync(h);
                    res.addModuleSuccess('heater', `Add: ${h.id}-${h.name}`);
                } catch (err) { res.addModuleError('heater', `Add: ${h.id}-${h.name}: ${err.message}`); }
            }
            return true;
        } catch (err) { logger.error(`Error restoring heaters: ${err.message}`); res.addModuleError('system', `Error restoring heaters: ${err.message}`); return false; }
    }
    public async validateRestore(rest: { poolConfig: any, poolState: any }): Promise<{ errors: any, warnings: any, add: any, update: any, remove: any }> {
        try {
            let ctx = { errors: [], warnings: [], add: [], update: [], remove: [] };
            // Look at heaters.
            let cfg = rest.poolConfig;
            for (let i = 0; i < cfg.heaters.length; i++) {
                let r = cfg.heaters[i];
                let c = sys.heaters.find(elem => r.id === elem.id);
                if (typeof c === 'undefined') ctx.add.push(r);
                else if (JSON.stringify(c.get()) !== JSON.stringify(r)) ctx.update.push(r);
            }
            for (let i = 0; i < sys.heaters.length; i++) {
                let c = sys.heaters.getItemByIndex(i);
                let r = cfg.heaters.find(elem => elem.id == c.id);
                if (typeof r === 'undefined') ctx.remove.push(c.get(true));
            }
            return ctx;
        } catch (err) { logger.error(`Error validating heaters for restore: ${err.message}`); }
    }
    public getHeatersByCircuitId(circuitId: number): Heater[] {
        let heaters: Heater[] = [];
        let bodyId = circuitId === 6 ? 1 : circuitId === 1 ? 2 : 0;
        if (bodyId > 0) {
            for (let i = 0; i < sys.heaters.length; i++) {
                let heater = sys.heaters.getItemByIndex(i);
                if (!heater.isActive) continue;
                if (bodyId === heater.body || sys.equipment.shared && heater.body === 32) heaters.push(heater);
            }
        }
        return heaters;
    }
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
                let vheaters = sys.heaters.filter(h => h.master === 1);
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
                let isCooling = false;
                let hstatus = sys.board.valueMaps.heatStatus.getName(body.heatStatus);
                let mode = sys.board.valueMaps.heatModes.getName(body.heatMode);
                if (body.isOn) {
                    if (typeof body.temp === 'undefined' && heaters.length > 0) logger.warn(`The body temperature for ${body.name} cannot be determined. Heater status for this body cannot be calculated.`);
                    // Now get all the heaters associated with the body in an array.
                    let bodyHeaters: Heater[] = [];
                    for (let j = 0; j < heaters.length; j++) {
                        let heater: Heater = heaters[j];
                        if (heater.isActive === false) continue;
                        if (heater.body === body.id) bodyHeaters.push(heater);
                        else {
                            let b = sys.board.valueMaps.bodies.transform(heater.body);
                            switch (b.name) {
                                case 'body1':
                                case 'pool':
                                    if (body.id === 1) bodyHeaters.push(heater);
                                    break;
                                case 'body2':
                                case 'spa':
                                    if (body.id === 2) bodyHeaters.push(heater);
                                    break;
                                case 'poolspa':
                                    if (body.id === 1 || body.id === 2) bodyHeaters.push(heater);
                                    break;
                                case 'body3':
                                    if (body.id === 3) bodyHeaters.push(heater);
                                    break;
                                case 'body4':
                                    if (body.id === 4) bodyHeaters.push(heater);
                                    break;
                            }
                        }
                    }
                    // Alright we have all the body heaters so sort them in a way that will make our heater preferences work.  Solar, heatpumps, and ultratemp should be in the list first
                    // so that if we have a heater preference set up then we do not have to evaluate the other heater.
                    let heaterTypes = sys.board.valueMaps.heaterTypes;
                    bodyHeaters.sort((a, b) => {
                        if (heaterTypes.transform(a.type).hasPreference) return -1;
                        else if (heaterTypes.transform(b.type).hasPreference) return 1;
                        return 0;
                    });

                    // Alright so now we should have a sorted array that has preference type heaters first.
                    for (let j = 0; j < bodyHeaters.length; j++) {
                        let heater: Heater = bodyHeaters[j];
                        let isOn = false;
                        let htype = sys.board.valueMaps.heaterTypes.transform(heater.type);
                        let hstate = state.heaters.getItemById(heater.id, true);
                        if (heater.master === 1) {
                            if (hstatus !== 'cooldown') {
                                // We need to do our own calculation as to whether it is on.  This is for Nixie heaters.
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
                                        }
                                        break;
                                    case 'ultratemp':
                                        // There is a temperature differential setting on UltraTemp.  This is how
                                        // much the water temperature needs to drop below the set temperature, for the heater
                                        // to start up again.  For instance, if the set temperature and the water temperature is 82 and then the
                                        // heater will shut off and not turn on again until the water temperature = setpoint - differentialTemperature.
                                        // This is the default operation on IntelliCenter and it appears to simply not start on the setpoint.  We can do better
                                        // than this by heating 1 degree past the setpoint then applying this rule for 30 minutes.  This allows for a more
                                        // responsive heater.
                                        // 
                                        // For Ultratemp we need to determine whether the differential temp
                                        // is within range.  The other thing that needs to be calculated here is
                                        // whether Ultratemp can effeciently heat the pool.
                                        if (mode === 'ultratemp' || mode === 'ultratemppref') {
                                            if (hstate.isOn) {
                                                // For the preference mode we will try to reach the setpoint for a period of time then
                                                // switch over to the gas heater.  Our algorithm for this is to check the rate of
                                                // change when the heater first kicks on.  If we go for longer than an hour and still
                                                // haven't reached the setpoint then we will switch to gas.
                                                if (mode === 'ultratemppref' &&
                                                    typeof hstate.startTime !== 'undefined' &&
                                                    hstate.startTime.getTime() < new Date().getTime() - (60 * 60 * 1000))
                                                    break;
                                                // If the heater is already on we will heat to 1 degree past the setpoint.
                                                if (body.temp - 1 < cfgBody.heatSetpoint) {
                                                    isOn = true;
                                                    body.heatStatus = sys.board.valueMaps.heatStatus.getValue('hpheat');
                                                    isHeating = true;
                                                    isCooling = false;
                                                }
                                                else if (body.temp + 1 > cfgBody.coolSetpoint && heater.coolingEnabled) {
                                                    isOn = true;
                                                    body.heatStatus = sys.board.valueMaps.heatStatus.getValue('hpcool');
                                                    isHeating = false;
                                                    isCooling = true;
                                                }
                                            }
                                            else {
                                                let delayStart = typeof hstate.endTime !== 'undefined' ? (hstate.endTime.getTime() + (30 * 60 * 1000)) > new Date().getTime() : false;
                                                // The heater is not currently on lets turn it on if we pass all the criteria.
                                                if ((body.temp < cfgBody.heatSetpoint && !delayStart)
                                                    || body.temp + heater.differentialTemp < cfgBody.heatSetpoint) {
                                                    isOn = true;
                                                    body.heatStatus = sys.board.valueMaps.heatStatus.getValue('hpheat');
                                                    isHeating = true;
                                                    isCooling = false;
                                                }
                                                else if (body.temp > cfgBody.coolSetpoint && heater.coolingEnabled) {
                                                    if (!delayStart || body.temp - heater.differentialTemp > cfgBody.coolSetpoint) {
                                                        isOn = true;
                                                        body.heatStatus = sys.board.valueMaps.heatStatus.getValue('hpcool');
                                                        isHeating = false;
                                                        isCooling = true;
                                                    }
                                                }
                                            }
                                        }
                                        break;
                                    case 'hybrid':
                                        if (mode !== 'off') {
                                            //console.log(`Mode: ${mode} Setpoint: ${cfgBody.setPoint}`);
                                            isHeating = isOn = true;
                                            isCooling = false;
                                            if (hstate.isOn) {
                                                // If the heater is already on we will heat to 1 degree past the setpoint.
                                                if (body.temp - 1 < cfgBody.heatSetpoint) {
                                                    isOn = true;
                                                    // Heat Status will be set by the returns from the heater.
                                                    //body.heatStatus = sys.board.valueMaps.heatStatus.getValue('heater');
                                                    isHeating = true;
                                                    isCooling = false;
                                                }
                                            }
                                            else {
                                                let delayStart = typeof hstate.endTime !== 'undefined' ? (hstate.endTime.getTime() + (30 * 60 * 1000)) > new Date().getTime() : false;
                                                // The heater is not currently on lets turn it on if we pass all the criteria.
                                                if ((body.temp < cfgBody.heatSetpoint && !delayStart)
                                                    || body.temp + heater.differentialTemp < cfgBody.heatSetpoint) {
                                                    isOn = true;
                                                    // Heat Status will be set by the returns from the heater.
                                                    //body.heatStatus = sys.board.valueMaps.heatStatus.getValue('heater');
                                                    isHeating = true;
                                                    isCooling = false;
                                                }
                                            }
                                        }
                                        break;

                                    case 'mastertemp':
                                        // If we make it here, the other heater is not heating the body.
                                        if (mode === 'mtheater' || mode === 'heatpumppref' || mode === 'ultratemppref' || mode === 'solarpref') {
                                            if (body.temp < cfgBody.setPoint) {
                                                isOn = true;
                                                body.heatStatus = sys.board.valueMaps.heatStatus.getValue('mtheat');
                                                isHeating = true;
                                            }
                                        }
                                        break;
                                    case 'maxetherm':
                                    case 'gas':
                                        // If we make it here, the other heater is not heating the body.
                                        if (mode === 'heater' || mode === 'solarpref' || mode === 'heatpumppref' || mode === 'ultratemppref') {
                                            // Heat past the setpoint for the heater but only if the heater is currently on.
                                            if ((body.temp - (hstate.isOn ? heater.stopTempDelta : 0)) < cfgBody.setPoint) {
                                                isOn = true;
                                                body.heatStatus = sys.board.valueMaps.heatStatus.getValue('heater');
                                                isHeating = true;
                                            }
                                        }
                                        break;
                                    case 'heatpump':
                                        if (mode === 'heatpump' || mode === 'heatpumppref') {
                                            // Heat past the setpoint for the heater but only if the heater is currently on.
                                            if ((body.temp - (hstate.isOn ? heater.stopTempDelta : 0)) < cfgBody.setPoint) {
                                                isOn = true;
                                                body.heatStatus = sys.board.valueMaps.heatStatus.getValue('hpheat');
                                                isHeating = true;
                                            }
                                            //if (hstate.isOn) {
                                            //    // If the heater is already on we will heat to 1 degree past the setpoint.
                                            //    if (body.temp - 1 < cfgBody.heatSetpoint) {
                                            //        isOn = true;
                                            //        body.heatStatus = sys.board.valueMaps.heatStatus.getValue('hpheat');
                                            //        isHeating = true;
                                            //        isCooling = false;
                                            //    }
                                            //}
                                            //else {
                                            //    // The heater is not currently on lets turn it on if we pass all the criteria.
                                            //    if ((body.temp < cfgBody.heatSetpoint && hstate.endTime.getTime() < new Date().getTime() + (30 * 60 * 1000))
                                            //        || body.temp + heater.differentialTemp < cfgBody.heatSetpoint) {
                                            //        isOn = true;
                                            //        body.heatStatus = sys.board.valueMaps.heatStatus.getValue('hpcool');
                                            //        isHeating = true;
                                            //        isCooling = false;
                                            //    }
                                            //}
                                        }
                                        break;
                                    default:
                                        isOn = utils.makeBool(hstate.isOn);
                                        break;
                                }
                                logger.debug(`Heater Type: ${htype.name} Mode:${mode} Temp: ${body.temp} Setpoint: ${cfgBody.setPoint} Status: ${body.heatStatus}`);
                            }
                        }
                        else {
                            let mode = sys.board.valueMaps.heatModes.getName(body.heatMode);
                            switch (htype.name) {
                                case 'mastertemp':
                                    if (hstatus === 'mtheat') isHeating = isOn = true;
                                    break;
                                case 'maxetherm':
                                case 'gas':
                                    if (hstatus === 'heater') isHeating = isOn = true;
                                    break;
                                case 'hybrid':
                                    if (hstatus === 'mtheat' || hstatus === 'heater' || hstatus === 'dual') isHeating = isOn = true;
                                    break;
                                case 'ultratemp':
                                case 'heatpump':
                                    if (mode === 'ultratemp' || mode === 'ultratemppref' || mode === 'heatpump' || mode === 'heatpumppref') {
                                        if (hstatus === 'heater') isHeating = isOn = true;
                                        else if (hstatus === 'cooling') isCooling = isOn = true;
                                    }
                                    break;
                                case 'solar':
                                    if (mode === 'solar' || mode === 'solarpref') {
                                        if (hstatus === 'solar') isHeating = isOn = true;
                                        else if (hstatus === 'cooling') isCooling = isOn = true;
                                    }
                                    break;
                            }
                        }
                        if (isOn === true && typeof hon.find(elem => elem === heater.id) === 'undefined') {
                            hon.push(heater.id);
                            if (heater.master === 1 && isOn) (async () => {
                                try {
                                    hstate.bodyId = body.id;
                                    if (sys.board.valueMaps.heatStatus.getName(body.heatStatus) === 'cooldown')
                                        await ncp.heaters.setHeaterStateAsync(hstate, false, false);
                                    else if (isOn) {
                                        hstate.bodyId = body.id;
                                        await ncp.heaters.setHeaterStateAsync(hstate, isOn, isCooling);
                                    }
                                    else if (hstate.isOn !== isOn || hstate.isCooling !== isCooling) {
                                        await ncp.heaters.setHeaterStateAsync(hstate, isOn, isCooling);
                                    }
                                } catch (err) { logger.error(err.message); }
                            })();
                            else {
                                hstate.isOn = isOn;
                                hstate.bodyId = body.id;
                            }
                        }
                        // If there is a heater on for the body we need break out of the loop.  This will make sure for instance a gas heater
                        // isn't started when one of the more economical methods are.
                        if (isOn === true) break;
                    }
                }
                if (sys.controllerType === ControllerType.Nixie && !isHeating && !isCooling && hstatus !== 'cooldown') body.heatStatus = sys.board.valueMaps.heatStatus.getValue('off');
                //else if (sys.controllerType === ControllerType.Nixie) body.heatStatus = 0;
            }
            // Turn off any heaters that should be off.  The code above only turns heaters on.
            for (let i = 0; i < heaters.length; i++) {
                let heater: Heater = heaters[i];
                if (typeof hon.find(elem => elem === heater.id) === 'undefined') {
                    let hstate = state.heaters.getItemById(heater.id, true);
                    if (heater.master === 1) (async () => {
                        try {
                            await ncp.heaters.setHeaterStateAsync(hstate, false, false);
                            hstate.bodyId = 0;
                        } catch (err) { logger.error(err.message); }
                    })();
                    else {
                        hstate.isOn = false;
                        hstate.bodyId = 0;
                    }
                }
            }
        } catch (err) { logger.error(`Error synchronizing heater states: ${err.message}`); }
    }
}
export class ValveCommands extends BoardCommands {
  public async restore(rest: { poolConfig: any, poolState: any }, ctx: any, res: RestoreResults): Promise<boolean> {
    try {
      // First delete the valves that should be removed.
      for (let i = 0; i < ctx.valves.remove.length; i++) {
        let v = ctx.valves.remove[i];
        try {
          await sys.board.valves.deleteValveAsync(v);
          res.addModuleSuccess('valve', `Remove: ${v.id}-${v.name}`);
        } catch (err) { res.addModuleError('valve', `Remove: ${v.id}-${v.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.valves.update.length; i++) {
        let v = ctx.valves.update[i];
        try {
          await sys.board.valves.setValveAsync(v);
          res.addModuleSuccess('valve', `Update: ${v.id}-${v.name}`);
        } catch (err) { res.addModuleError('valve', `Update: ${v.id}-${v.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.valves.add.length; i++) {
        let v = ctx.valves.add[i];
        try {
          // pull a little trick to first add the data then perform the update.  This way we won't get a new id or
          // it won't error out.
          sys.valves.getItemById(ctx.valves.add[i].id, true);
          await sys.board.valves.setValveAsync(v);
          res.addModuleSuccess('valve', `Add: ${v.id}-${v.name}`);
        } catch (err) { res.addModuleError('valve', `Add: ${v.id}-${v.name}: ${err.message}`); }
      }
      return true;
    } catch (err) { logger.error(`Error restoring valves: ${err.message}`); res.addModuleError('system', `Error restoring valves: ${err.message}`); return false; }
  }

  public async validateRestore(rest: { poolConfig: any, poolState: any }): Promise<{ errors: any, warnings: any, add: any, update: any, remove: any }> {
    try {
      let ctx = { errors: [], warnings: [], add: [], update: [], remove: [] };
      // Look at valves.
      let cfg = rest.poolConfig;
      for (let i = 0; i < cfg.valves.length; i++) {
        let r = cfg.valves[i];
        let c = sys.valves.find(elem => r.id === elem.id);
        if (typeof c === 'undefined') ctx.add.push(r);
        else if (JSON.stringify(c.get()) !== JSON.stringify(r)) ctx.update.push(r);
      }
      for (let i = 0; i < sys.valves.length; i++) {
        let c = sys.valves.getItemByIndex(i);
        let r = cfg.valves.find(elem => elem.id == c.id);
        if (typeof r === 'undefined') ctx.remove.push(c.get(true));
      }
      return ctx;
    } catch (err) { logger.error(`Error validating valves for restore: ${err.message}`); }
  }

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
      // Check to see if there is a drain circuit or feature on.  If it is on then the intake will be diverted no mater what.
      let drain = sys.equipment.shared ? typeof state.circuits.get().find(elem => typeof elem.type !== 'undefined' && elem.type.name === 'spadrain' && elem.isOn === true) !== 'undefined' ||
        typeof state.features.get().find(elem => typeof elem.type !== 'undefined' && elem.type.name === 'spadrain' && elem.isOn === true) !== 'undefined' : false;
      // Check to see if there is a spillway circuit or feature on.  If it is on then the return will be diverted no mater what.
      let spillway = sys.equipment.shared ? typeof state.circuits.get().find(elem => typeof elem.type !== 'undefined' && elem.type.name === 'spillway' && elem.isOn === true) !== 'undefined' ||
        typeof state.features.get().find(elem => typeof elem.type !== 'undefined' && elem.type.name === 'spillway' && elem.isOn === true) !== 'undefined' : false;
      let spa = sys.equipment.shared ? state.circuits.getItemById(1).isOn : false;
      let pool = sys.equipment.shared ? state.circuits.getItemById(6).isOn : false;
      // Set the valve mode.
      if (!sys.equipment.shared) state.valveMode = sys.board.valueMaps.valveModes.getValue('off');
      else if (drain) state.valveMode = sys.board.valueMaps.valveModes.getValue('spadrain');
      else if (spillway) state.valveMode = sys.board.valueMaps.valveModes.getValue('spillway');
      else if (spa) state.valveMode = sys.board.valueMaps.valveModes.getValue('spa');
      else if (pool) state.valveMode = sys.board.valueMaps.valveModes.getValue('pool');
      else state.valveMode = sys.board.valueMaps.valveModes.getValue('off');

      for (let i = 0; i < sys.valves.length; i++) {
        // Run through all the valves to see whether they should be triggered or not.
        let valve = sys.valves.getItemByIndex(i);
        if (valve.isActive) {
          let vstate = state.valves.getItemById(valve.id, true);
          let isDiverted = vstate.isDiverted;
          if (typeof valve.circuit !== 'undefined' && valve.circuit > 0) {
            if (sys.equipment.shared && valve.isIntake === true) {
              // Valve Diverted Positions
              // Spa: Y
              // Drain: Y
              // Spillway: N
              // Pool: N
              isDiverted = utils.makeBool(spa || drain); // If the spa is on then the intake is diverted.
            }
            else if (sys.equipment.shared && valve.isReturn === true) {
              // Valve Diverted Positions
              // Spa: Y
              // Drain: N
              // Spillway: Y
              // Pool: N
              isDiverted = utils.makeBool((spa || spillway) && !drain);
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
  public getBodyValveCircuitIds(isOn?: boolean): number[] {
    let arrIds: number[] = [];
    if (sys.equipment.shared !== true) return arrIds;

    {
      let dtype = sys.board.valueMaps.circuitFunctions.getValue('spadrain');
      let stype = sys.board.valueMaps.circuitFunctions.getValue('spillway');
      let ptype = sys.board.valueMaps.circuitFunctions.getValue('pool');
      let sptype = sys.board.valueMaps.circuitFunctions.getValue('spa');
      for (let i = 0; i < state.circuits.length; i++) {
        let cstate = state.circuits.getItemByIndex(i);
        if (typeof isOn === 'undefined' || cstate.isOn === isOn) {
          if (cstate.id === 1 || cstate.id === 6) arrIds.push(cstate.id);
          if (cstate.type === dtype || cstate.type === stype || cstate.type === ptype || cstate.type === sptype) arrIds.push(cstate.id);
        }
      }
    }
    {
      let dtype = sys.board.valueMaps.featureFunctions.getValue('spadrain');
      let stype = sys.board.valueMaps.featureFunctions.getValue('spillway');
      for (let i = 0; i < state.features.length; i++) {
        let fstate = state.features.getItemByIndex(i);
        if (typeof isOn === 'undefined' || fstate.isOn === isOn) {
          if (fstate.type === dtype || fstate.type === stype) arrIds.push(fstate.id);
        }
      }
    }
    return arrIds;
  }
}
export class ChemControllerCommands extends BoardCommands {
  public async restore(rest: { poolConfig: any, poolState: any }, ctx: any, res: RestoreResults): Promise<boolean> {
    try {
      // First delete the chemControllers that should be removed.
      for (let i = 0; i < ctx.chemControllers.remove.length; i++) {
        let c = ctx.chemControllers.remove[i];
        try {
          await sys.board.chemControllers.deleteChemControllerAsync(c);
          res.addModuleSuccess('chemController', `Remove: ${c.id}-${c.name}`);
        } catch (err) { res.addModuleError('chemController', `Remove: ${c.id}-${c.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.chemControllers.update.length; i++) {
        let c = ctx.chemControllers.update[i];
        try {
          await sys.board.chemControllers.setChemControllerAsync(c);
          res.addModuleSuccess('chemController', `Update: ${c.id}-${c.name}`);
        } catch (err) { res.addModuleError('chemController', `Update: ${c.id}-${c.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.chemControllers.add.length; i++) {
        let c = ctx.chemControllers.add[i];
        try {
          // pull a little trick to first add the data then perform the update.  This way we won't get a new id or
          // it won't error out.
          let chem = sys.chemControllers.getItemById(c.id, true);
          // RSG 11.24.21.  setChemControllerAsync will only set the type/address if it thinks it's new.   
          // For a restore, if we set the type/address here it will pass the validation steps.
          chem.type = c.type;
          // chem.address = c.address;
          await sys.board.chemControllers.setChemControllerAsync(c);
          res.addModuleSuccess('chemController', `Add: ${c.id}-${c.name}`);
        } catch (err) { res.addModuleError('chemController', `Add: ${c.id}-${c.name}: ${err.message}`); }
      }
      return true;
    } catch (err) { logger.error(`Error restoring chemControllers: ${err.message}`); res.addModuleError('system', `Error restoring chemControllers: ${err.message}`); return false; }
  }
  public async validateRestore(rest: { poolConfig: any, poolState: any }): Promise<{ errors: any, warnings: any, add: any, update: any, remove: any }> {
    try {
      let ctx = { errors: [], warnings: [], add: [], update: [], remove: [] };
      // Look at chemControllers.
      let cfg = rest.poolConfig;
      for (let i = 0; i < cfg.chemControllers.length; i++) {
        let r = cfg.chemControllers[i];
        let c = sys.chemControllers.find(elem => r.id === elem.id);
        if (typeof c === 'undefined') ctx.add.push(r);
        else if (JSON.stringify(c.get()) !== JSON.stringify(r)) ctx.update.push(r);
      }
      for (let i = 0; i < sys.chemControllers.length; i++) {
        let c = sys.chemControllers.getItemByIndex(i);
        let r = cfg.chemControllers.find(elem => elem.id == c.id);
        if (typeof r === 'undefined') ctx.remove.push(c.get(true));
      }
      return ctx;
    } catch (err) { logger.error(`Error validating chemControllers for restore: ${err.message}`); }
  }

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
      return chem.master === 1 ? await ncp.chemControllers.setControllerAsync(chem, data) : chem;
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
      let address = typeof data.address !== 'undefined' ? parseInt(data.address, 10) : isAdd ? undefined : chem.address;
      let t = sys.board.valueMaps.chemControllerTypes.transform(type);
      if (t.hasAddress) {
        // First lets make sure the user supplied an address.
        if (isNaN(address)) return Promise.reject(new InvalidEquipmentDataError(`${t.desc} chem controllers require a valid address`, 'chemController', data.address));
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
      if (t.name === 'intellichem') {
        logger.info(`${chem.name} - ${chem.id} routing IntelliChem to OCP`);
        await sys.board.chemControllers.setIntelliChemAsync(data);
      }
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
    logger.info(`Setting ${chem.name} data ${chem.master}`);
    if (chem.master === 1) await ncp.chemControllers.setControllerAsync(chem, data);
    else await sys.board.chemControllers.setChemControllerAsync(data);
    let schem = state.chemControllers.getItemById(chem.id, true);
    return Promise.resolve(schem);
  }
}
export class FilterCommands extends BoardCommands {
  public async restore(rest: { poolConfig: any, poolState: any }, ctx: any, res: RestoreResults): Promise<boolean> {
    try {
      // First delete the filters that should be removed.
      for (let i = 0; i < ctx.filters.remove.length; i++) {
        let filter = ctx.filters.remove[i];
        try {
          sys.filters.removeItemById(filter.id);
          state.filters.removeItemById(filter.id);
          res.addModuleSuccess('filter', `Remove: ${filter.id}-${filter.name}`);
        } catch (err) { res.addModuleError('filter', `Remove: ${filter.id}-${filter.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.filters.update.length; i++) {
        let filter = ctx.filters.update[i];
        try {
          await sys.board.filters.setFilterAsync(filter);
          res.addModuleSuccess('filter', `Update: ${filter.id}-${filter.name}`);
        } catch (err) { res.addModuleError('filter', `Update: ${filter.id}-${filter.name}: ${err.message}`); }
      }
      for (let i = 0; i < ctx.filters.add.length; i++) {
        let filter = ctx.filters.add[i];
        try {
          // pull a little trick to first add the data then perform the update.
          sys.filters.getItemById(filter.id, true);
          await sys.board.filters.setFilterAsync(filter);
          res.addModuleSuccess('filter', `Add: ${filter.id}-${filter.name}`);
        } catch (err) { res.addModuleError('filter', `Add: ${filter.id}-${filter.name}: ${err.message}`); }
      }
      return true;
    } catch (err) { logger.error(`Error restoring filters: ${err.message}`); res.addModuleError('system', `Error restoring filters: ${err.message}`); return false; }
  }
  public async validateRestore(rest: { poolConfig: any, poolState: any }): Promise<{ errors: any, warnings: any, add: any, update: any, remove: any }> {
    try {
      let ctx = { errors: [], warnings: [], add: [], update: [], remove: [] };
      // Look at filters.
      let cfg = rest.poolConfig;
      for (let i = 0; i < cfg.filters.length; i++) {
        let r = cfg.filters[i];
        let c = sys.filters.find(elem => r.id === elem.id);
        if (typeof c === 'undefined') ctx.add.push(r);
        else if (JSON.stringify(c.get()) !== JSON.stringify(r)) ctx.update.push(r);
      }
      for (let i = 0; i < sys.filters.length; i++) {
        let c = sys.filters.getItemByIndex(i);
        let r = cfg.filters.find(elem => elem.id == c.id);
        if (typeof r === 'undefined') ctx.remove.push(c.get(true));
      }
      return ctx;
    } catch (err) { logger.error(`Error validating filters for restore: ${err.message}`); }
  }

  public async syncFilterStates() {
    try {
      for (let i = 0; i < sys.filters.length; i++) {
        // Run through all the valves to see whether they should be triggered or not.
        let filter = sys.filters.getItemByIndex(i);
        if (filter.isActive && !isNaN(filter.id)) {
          let fstate = state.filters.getItemById(filter.id, true);
          // Check to see if the associated body is on.
          await sys.board.filters.setFilterStateAsync(filter, fstate, sys.board.bodies.isBodyOn(filter.body));
        }
      }
    } catch (err) { logger.error(`syncFilterStates: Error synchronizing filters ${err.message}`); }
  }
  public async setFilterPressure(id: number, pressure: number, units?: string) {
    try {
      let filter = sys.filters.find(elem => elem.id === id);
      if (typeof filter === 'undefined' || isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`setFilterPressure: Invalid equipmentId ${id}`, id, 'Filter'));
      if (isNaN(pressure)) return Promise.reject(new InvalidEquipmentDataError(`setFilterPressure: Invalid filter pressure ${pressure} for ${filter.name}`, 'Filter', pressure));
      let sfilter = state.filters.getItemById(filter.id, true);
      // Convert the pressure to the units that we have set on the filter for the pressure units.
      let pu = sys.board.valueMaps.pressureUnits.transform(filter.pressureUnits || 0);
      if (typeof units === 'undefined' || units === '') units = pu.name;
      sfilter.pressureUnits = filter.pressureUnits;
      sfilter.pressure = Math.round(pressure * 1000) / 1000; // Round this to 3 decimal places just in case we are getting stupid scales.
      // Check to see if our circuit is the only thing on.  If it is then we will be setting our current clean pressure to the incoming pressure and calculating a percentage.
      // Rules for the circuit.
      // 1. The assigned circuit must be on.
      // 2. There must not be a current freeze condition
      // 3. No heaters can be on.
      // 4. The assigned circuit must be on exclusively but we will be ignoring any of the light circuit types for the exclusivity.
      let cstate = state.circuits.getInterfaceById(filter.pressureCircuitId);
      if (cstate.isOn && state.freeze !== true) {
        // Ok so our circuit is on.  We need to check to see if any other circuits are on.  This includes heaters.  The reason for this is that even with
        // a gas heater there may be a heater bypass that will screw up our numbers.  Certainly reflow on a solar heater will skew the numbers.
        let hon = state.temps.bodies.toArray().find(elem => elem.isOn && (elem.heatStatus || 0) !== 0);
        if (typeof hon === 'undefined') {
          // Put together the circuit types that could be lights.  We don't want these.
          let ctypes = [];
          let funcs = sys.board.valueMaps.circuitFunctions.toArray();
          for (let i = 0; i < funcs.length; i++) {
            let f = funcs[i];
            if (f.isLight) ctypes.push(f.val);
          }
          let con = state.circuits.find(elem => elem.isOn === true && elem.id !== filter.pressureCircuitId && elem.id !== 1 && elem.id !== 6 && !ctypes.includes(elem.type));
          if (typeof con === 'undefined') {
            // This check is the one that will be the most problematic.  For this reason we are only going to check features that are not generic.  If they are spillway
            // it definitely has to be off.
            let feats = state.features.toArray();
            let fon = false;
            for (let i = 0; i < feats.length && fon === false; i++) {
              let f = feats[i];
              if (!f.isOn) continue;
              if (f.id === filter.pressureCircuitId) continue;
              if (f.type !== 0) fon = true;
              // Check to see if this feature is used on a valve.  This will make it
              // not include this pressure either.  We do not care whether the valve is diverted or not.
              if (typeof sys.valves.find(elem => elem.circuit === f.id) !== 'undefined')
                fon = true;
              else {
                // Finally if the feature happens to be used on a pump then we don't want it either.
                let pumps = sys.pumps.get();
                for (let j = 0; j < pumps.length; j++) {
                  let pmp = pumps[j];
                  if (typeof pmp.circuits !== 'undefined') {
                    if (typeof pmp.circuits.find(elem => elem.circuit === f.id) !== 'undefined') {
                      fon = true;
                      break;
                    }
                  }
                }
              }
            }
            if (!fon) {
              // Finally we have a value we can believe in.
              sfilter.refPressure = pressure;
            }
          }
          else {
            logger.verbose(`Circuit ${con.id}-${con.name} is currently on filter pressure for cleaning ignored.`);
          }
        }
        else {
          logger.verbose(`Heater for body ${hon.name} is currently on ${hon.heatStatus} filter pressure for cleaning skipped.`);
        }
      }
      sfilter.emitEquipmentChange();
    }
    catch (err) { logger.error(`setFilterPressure: Error setting filter #${id} pressure to ${pressure}${units || ''}`); }
  }
  public async setFilterStateAsync(filter: Filter, fstate: FilterState, isOn: boolean) { fstate.isOn = isOn; }
  public async setFilterAsync(data: any): Promise<Filter> {
    let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
    if (id <= 0) id = sys.filters.length + 1; // set max filters?
    if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid filter id: ${data.id}`, data.id, 'Filter'));
    let filter = sys.filters.getItemById(id, id > 0);
    let sfilter = state.filters.getItemById(id, id > 0);
    let filterType = typeof data.filterType !== 'undefined' ? parseInt(data.filterType, 10) : filter.filterType;
    if (typeof filterType === 'undefined') filterType = sys.board.valueMaps.filterTypes.getValue('unknown');

    // The only way to delete a filter is to call deleteFilterAsync.
    //if (typeof data.isActive !== 'undefined') {
    //    if (utils.makeBool(data.isActive) === false) {
    //        sys.filters.removeItemById(id);
    //        state.filters.removeItemById(id);
    //        return;
    //    }
    //}

    let body = typeof data.body !== 'undefined' ? data.body : filter.body;
    let name = typeof data.name !== 'undefined' ? data.name : filter.name;
    if (typeof body === 'undefined') body = 32;
    // At this point we should have all the data.  Validate it.
    if (!sys.board.valueMaps.filterTypes.valExists(filterType)) return Promise.reject(new InvalidEquipmentDataError(`Invalid filter type; ${filterType}`, 'Filter', filterType));

    filter.pressureUnits = typeof data.pressureUnits !== 'undefined' ? data.pressureUnits || 0 : filter.pressureUnits || 0;
    filter.pressureCircuitId = parseInt(data.pressureCircuitId || filter.pressureCircuitId || 6, 10);
    filter.cleanPressure = parseFloat(data.cleanPressure || filter.cleanPressure || 0);
    filter.dirtyPressure = parseFloat(data.dirtyPressure || filter.dirtyPressure || 0);

    filter.filterType = sfilter.filterType = filterType;
    filter.body = sfilter.body = body;
    filter.name = sfilter.name = name;
    filter.capacity = typeof data.capacity === 'number' ? data.capacity : filter.capacity;
    filter.capacityUnits = typeof data.capacityUnits !== 'undefined' ? data.capacityUnits : filter.capacity;
    filter.connectionId = typeof data.connectionId !== 'undefined' ? data.connectionId : filter.connectionId;
    filter.deviceBinding = typeof data.deviceBinding !== 'undefined' ? data.deviceBinding : filter.deviceBinding;
    sfilter.pressureUnits = filter.pressureUnits;
    sfilter.calcCleanPercentage();
    sfilter.emitEquipmentChange();
    return filter; // Always return the config when we are dealing with the config not state.
  }
  public async deleteFilterAsync(data: any): Promise<Filter> {
    try {
      let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
      let filter = sys.filters.getItemById(id);
      let sfilter = state.filters.getItemById(filter.id);
      filter.isActive = false;
      sys.filters.removeItemById(id);
      state.filters.removeItemById(id);
      sfilter.emitEquipmentChange();
      return filter;
    } catch (err) { logger.error(`deleteFilterAsync: Error deleting filter ${err.message}`); }
  }
}
