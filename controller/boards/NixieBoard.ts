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
import { EventEmitter } from 'events';
import { ncp } from "../nixie/Nixie";
import {SystemBoard, byteValueMap, ConfigQueue, ConfigRequest, BodyCommands, PumpCommands, SystemCommands, CircuitCommands, FeatureCommands, ChlorinatorCommands, ChemControllerCommands, EquipmentIdRange} from './SystemBoard';
import { logger } from '../../logger/Logger';
import { state, ChlorinatorState, ChemControllerState, TemperatureState } from '../State';
import { sys, Options, Owner, Location, TempSensorCollection, General, PoolSystem, Body, Pump, CircuitGroupCircuit, CircuitGroup, ChemController } from '../Equipment';
import { Protocol, Outbound, Message, Response } from '../comms/messages/Messages';
import { InvalidEquipmentIdError, InvalidEquipmentDataError, EquipmentNotFoundError, MessageError } from '../Errors';
import {conn} from '../comms/Comms';
export class NixieBoard extends SystemBoard {
    constructor (system: PoolSystem){
        super(system);
        this.equipmentIds.circuits = new EquipmentIdRange(1, function () { return this.start + sys.equipment.maxCircuits - 1; });
        this.equipmentIds.features = new EquipmentIdRange(function () { return 129; }, function () { return this.start + sys.equipment.maxFeatures - 1; });
        this.equipmentIds.circuitGroups = new EquipmentIdRange(function () { return this.start; }, function () { return this.start + sys.equipment.maxCircuitGroups - 1; });
        this.equipmentIds.virtualCircuits = new EquipmentIdRange(function () { return this.start; }, function () { return this.start + sys.equipment.maxCircuitGroups + sys.equipment.maxLightGroups - 1; });
        this.equipmentIds.features.start = 129;
        this.equipmentIds.circuitGroups.start = 193;
        this.equipmentIds.virtualCircuits.start = 237;
        this.valueMaps.circuitFunctions = new byteValueMap([
            [0, { name: 'generic', desc: 'Generic' }],
            [1, { name: 'spillway', desc: 'Spillway' }],
            [2, { name: 'mastercleaner', desc: 'Master Cleaner' }],
            [3, { name: 'chemrelay', desc: 'Chem Relay' }],
            [4, { name: 'light', desc: 'Light', isLight: true }],
            [5, { name: 'intellibrite', desc: 'Intellibrite', isLight: true }],
            [6, { name: 'globrite', desc: 'GloBrite', isLight: true }],
            [7, { name: 'globritewhite', desc: 'GloBrite White', isLight: true }],
            [8, { name: 'magicstream', desc: 'Magicstream', isLight: true }],
            [9, { name: 'dimmer', desc: 'Dimmer', isLight: true }],
            [10, { name: 'colorcascade', desc: 'ColorCascade', isLight: true }],
            [11, { name: 'mastercleaner2', desc: 'Master Cleaner 2' }],
            [12, { name: 'pool', desc: 'Pool', hasHeatSource: true }],
            [13, { name: 'spa', desc: 'Spa', hasHeatSource: true }]
        ]);
        this.valueMaps.pumpTypes = new byteValueMap([
            [0, { name: 'none', desc: 'No pump', maxCircuits: 0, hasAddress: false, hasBody: false }],
            [1, { name: 'ss', desc: 'Single Speed', maxCircuits: 0, hasAddress: false, hasBody: true }],
            [2, { name: 'ds', desc: 'Two Speed', maxCircuits: 8, hasAddress: false, hasBody: true }],
            [3, { name: 'vs', desc: 'Intelliflo VS', maxPrimingTime: 6, minSpeed: 450, maxSpeed: 3450, maxCircuits: 8, hasAddress: true }],
            [4, { name: 'vsf', desc: 'Intelliflo VSF', minSpeed: 450, maxSpeed: 3450, minFlow: 15, maxFlow: 130, maxCircuits: 8, hasAddress: true }],
            [5, { name: 'vf', desc: 'Intelliflo VF', minFlow: 15, maxFlow: 130, maxCircuits: 8, hasAddress: true }]
        ]);
        // RSG - same as systemBoard definition; can delete.
        this.valueMaps.heatModes = new byteValueMap([
            [0, { name: 'off', desc: 'Off' }],
            [3, { name: 'heater', desc: 'Heater' }],
            [5, { name: 'solar', desc: 'Solar Only' }],
            [12, { name: 'solarpref', desc: 'Solar Preferred' }]
        ]);
        this.valueMaps.scheduleDays = new byteValueMap([
            [1, { name: 'mon', desc: 'Monday', dow: 1, bitval: 1 }],
            [2, { name: 'tue', desc: 'Tuesday', dow: 2, bitval: 2 }],
            [3, { name: 'wed', desc: 'Wednesday', dow: 3, bitval: 4 }],
            [4, { name: 'thu', desc: 'Thursday', dow: 4, bitval: 8 }],
            [5, { name: 'fri', desc: 'Friday', dow: 5, bitval: 16 }],
            [6, { name: 'sat', desc: 'Saturday', dow: 6, bitval: 32 }],
            [7, { name: 'sun', desc: 'Sunday', dow: 0, bitval: 64 }]
        ]);
        this.valueMaps.groupCircuitStates = new byteValueMap([
            [1, { name: 'on', desc: 'On' }],
            [2, { name: 'off', desc: 'Off' }],
            [3, { name: 'ignore', desc: 'Ignore' }]
        ]);

        // Keep this around for now so I can fart with the custom names array.
        //this.valueMaps.customNames = new byteValueMap(
        //    sys.customNames.get().map((el, idx) => {
        //        return [idx + 200, { name: el.name, desc: el.name }];
        //    })
        //);
        this.valueMaps.scheduleDays.toArray = function () {
            let arrKeys = Array.from(this.keys());
            let arr = [];
            for (let i = 0; i < arrKeys.length; i++) arr.push(extend(true, { val: arrKeys[i] }, this.get(arrKeys[i])));
            return arr;
        }
        this.valueMaps.scheduleDays.transform = function (byte) {
            let days = [];
            let b = byte & 0x007F;
            for (let bit = 6; bit >= 0; bit--) {
                if ((byte & (1 << bit)) > 0) days.push(extend(true, {}, this.get(bit + 1)));
            }
            return { val: b, days: days };
        };
        this.valueMaps.expansionBoards = new byteValueMap([
            [0, { name: 'nxp', part: 'NXP', desc: 'Nixie Single Body', bodies: 1, valves: 2, shared: false, dual: false }],
            [1, { name: 'nxps', part: 'NXPS', desc: 'Nixie Shared Body', bodies: 2, valves: 4, shared: true, dual: false, chlorinators: 1, chemControllers: 1 }],
            [2, { name: 'nxpd', part: 'NXPD', desc: 'Nixe Dual Body', bodies: 2, valves: 2, shared: false, dual: true, chlorinators: 2, chemControllers: 2 }],
            [255, { name: 'nxu', part: 'Unspecified', desc: 'Unspecified Nixie Controller', bodies: 0, valves: 0, shared: false, dual: false, chlorinators: 0, chemControllers: 0 }]
        ]);
        this.valueMaps.virtualCircuits = new byteValueMap([
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
        this.valueMaps.scheduleTimeTypes.merge([
            [1, { name: 'sunrise', desc: 'Sunrise' }],
            [2, { name: 'sunset', desc: 'Sunset' }]
        ]);
        this.valueMaps.lightThemes = new byteValueMap([
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
        this.valueMaps.lightColors = new byteValueMap([
            [0, { name: 'white', desc: 'White' }],
            [16, { name: 'lightgreen', desc: 'Light Green' }],
            [32, { name: 'green', desc: 'Green' }],
            [48, { name: 'cyan', desc: 'Cyan' }],
            [64, { name: 'blue', desc: 'Blue' }],
            [80, { name: 'lavender', desc: 'Lavender' }],
            [96, { name: 'magenta', desc: 'Magenta' }],
            [112, { name: 'lightmagenta', desc: 'Light Magenta' }]
        ]);
        this.valueMaps.heatSources = new byteValueMap([
            [0, { name: 'off', desc: 'No Heater' }],
            [3, { name: 'heater', desc: 'Heater' }],
            [5, { name: 'solar', desc: 'Solar Only' }],
            [21, { name: 'solarpref', desc: 'Solar Preferred' }],
            [32, { name: 'nochange', desc: 'No Change' }]
        ]);
        this.valueMaps.heatStatus = new byteValueMap([
            [0, { name: 'off', desc: 'Off' }],
            [1, { name: 'heater', desc: 'Heater' }],
            [2, { name: 'solar', desc: 'Solar' }],
            [3, { name: 'cooling', desc: 'Cooling' }]
        ]);
        this.valueMaps.scheduleTypes = new byteValueMap([
            [0, { name: 'runonce', desc: 'Run Once', startDate: true, startTime: true, endTime: true, days: false, heatSource: true, heatSetpoint: true }],
            [128, { name: 'repeat', desc: 'Repeats', startDate: false, startTime: true, endTime: true, days: 'multi', heatSource: true, heatSetpoint: true }]
        ]);
        this.valueMaps.remoteTypes = new byteValueMap([
            [0, { name: 'none', desc: 'Not Installed', maxButtons: 0 }],
            [1, { name: 'is4', desc: 'iS4 Spa-Side Remote', maxButtons: 4 }],
            [2, { name: 'is10', desc: 'iS10 Spa-Side Remote', maxButtons: 10 }],
            [3, { name: 'quickTouch', desc: 'Quick Touch Remote', maxButtons: 4 }],
            [4, { name: 'spaCommand', desc: 'Spa Command', maxButtons: 10 }]
        ]);
    }
    public async initNixieBoard() {
        try {
            state.status = 0;
            state.status.percent = 0;
            // Set up all the default information for the controller.  This should be done
            // for the startup of the system.  The equipment installed at module 0 is the main
            // system descriptor.
            let mod = sys.equipment.modules.getItemById(0, true);
            //[0, { name: 'nxp', part: 'NXP', desc: 'Nixie Single Body', bodies: 1, valves: 2, shared: false, dual: false }],
            //[1, { name: 'nxps', part: 'NXPS', desc: 'Nixie Shared Body', bodies: 2, valves: 4, shared: true, dual: false, chlorinators: 1, chemControllers: 1 }],
            //[2, { name: 'nxpd', part: 'NXPD', desc: 'Nixe Dual Body', bodies: 2, valves: 2, shared: false, dual: true, chlorinators: 2, chemControllers: 2 }],
            //[255, { name: 'nxu', part: 'Unspecified', desc: 'Unspecified Nixie Controller', bodies: 0, valves: 0, shared: false, dual: false, chlorinators: 0, chemControllers: 0 }]
            let type = typeof mod.type !== 'undefined' ? this.valueMaps.expansionBoards.get(mod.type) : this.valueMaps.expansionBoards.get(255);
            sys.equipment.shared = type.shared;
            sys.equipment.dual = type.dual;
            mod.type = type.val;
            mod.part = type.part;
            mod['bodies'] = type.bodies;
            mod['part'] = type.part;
            mod['valves'] = type.valves;
            if (mod.type !== 255) {
                sys.equipment.maxValves = 32;
                sys.equipment.maxCircuits = 40;
                sys.equipment.maxFeatures = 32;
                sys.equipment.maxHeaters = 16;
                sys.equipment.maxLightGroups = 16;
                sys.equipment.maxCircuitGroups = 16;
                sys.equipment.maxSchedules = 100;
                sys.equipment.maxPumps = 16;
                sys.equipment.maxRemotes = 16;
                sys.equipment.maxBodies = type.bodies;
                if (type.shared || type.dual) {
                    // We are going to add two bodies and prune off the others.
                    let pool = sys.bodies.getItemById(1, true);
                    if (typeof pool.type === 'undefined') pool.type = 0;
                    if (typeof pool.name === 'undefined') pool.name = type.dual ? 'Pool1' : 'Pool';
                    if (typeof pool.capacity === 'undefined') pool.capacity = 0;
                    if (typeof pool.setPoint === 'undefined') pool.setPoint = 0;
                    // We need to add in a circuit for 6.
                    let circ = sys.circuits.getItemById(6, true);
                    //[12, { name: 'pool', desc: 'Pool', hasHeatSource: true }],
                    //[13, { name: 'spa', desc: 'Spa', hasHeatSource: true }]
                    circ.type = 12;
                    if (typeof circ.name === 'undefined') circ.name = pool.name;
                    if (typeof circ.showInFeatures === 'undefined') circ.showInFeatures = false;
                    circ.isActive = true;
                    circ.master = 1;
                    circ.eggTimer = 720;
                    pool.circuit = 6;
                    pool.isActive = true;
                    pool.master = 1;
                    if (type.shared || type.dual) {
                        let spa = sys.bodies.getItemById(2, true);
                        if (typeof spa.type === 'undefined') spa.type = type.dual ? 0 : 1;
                        if (typeof spa.name === 'undefined') spa.name = type.dual ? 'Pool2' : 'Spa';
                        if (typeof spa.capacity === 'undefined') pool.capacity = 0;
                        if (typeof spa.setPoint === 'undefined') pool.setPoint = 0;
                        circ = sys.circuits.getItemById(1, true);
                        circ.type = type.dual ? 12 : 13;
                        if (typeof circ.name === 'undefined') circ.name = spa.name;
                        if (typeof circ.showInFeatures === 'undefined') circ.showInFeatures = false;
                        circ.isActive = true;
                        circ.master = 1;
                        circ.eggTimer = 720;
                        spa.circuit = 1;
                        spa.isActive = true;
                        spa.master = 1;
                    }
                    else {
                        // Remove the items that are not part of our board.
                        sys.bodies.removeItemById(2);
                        sys.circuits.removeItemById(1);
                        state.temps.bodies.removeItemById(1);
                        state.circuits.removeItemById(1);
                    }
                }
                await this.verifySetup();
            }
            else {
                sys.equipment.maxValves = 0;
                sys.equipment.maxCircuits = 0;
                sys.equipment.maxFeatures = 0;
                sys.equipment.maxHeaters = 0;
                sys.equipment.maxLightGroups = 0;
                sys.equipment.maxCircuitGroups = 0;
                sys.equipment.maxSchedules = 0;
                sys.equipment.maxPumps = 0;
                sys.equipment.maxRemotes = 0;
                sys.equipment.maxBodies = 0;
            }
            
            // At this point we should have the start of a board so lets check to see if we are ready or if we are stuck initializing.
        } catch (err) { logger.error(`Error Initializing Nixie Control Panel ${err.message}`); }
    }
    public async verifySetup() {
        try {
            // In here we are going to attempt to check all the nixie relays.  We will not check the other equipment just the items
            // that make up a raw pool like the circuits.  The other stuff is the stuff of the equipment control.
            let circs = sys.circuits.toArray().filter((val) => { return val.controller === 1; });
            for (let i = 0; i < circs.length; i++) {
                let circ = circs[i];
                // Make sure we have a circuit identified in the ncp if it is controlled by Nixie.
                let c = await ncp.circuits.initCircuitAsync(circ);
                // Now we should have the circuit from nixie so check the status to see if it can be
                // controlled. i.e. The comms are up.
                await c.validateSetupAsync(circ, state.circuits.getItemById(circ.id))
            }
            // Now we need to validate the heaters.  Some heaters will be connected via a relay.  If they have comms we will check it.
            let heaters = sys.heaters.toArray().filter((val) => { return val.controller === 1 });
            for (let i = 0; i < heaters.length; i++) {
                let heater = heaters[i];
                let h = await ncp.heaters.initHeaterAsync(heater);
            }

        } catch (err) { logger.error(`Error verifying setup`); }
    }
    /// This method processes the status message periodically.  The role of this method is to verify the circuit, valve, and heater
    /// relays.  This method does not control RS485 operations such as pumps and chlorinators.  These are done through the respective
    /// equipment polling functions.
    public async processStatusAsync() {
        try {


        } catch (err) {}
    }
}
export class NixieSystemCommands extends SystemCommands {
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
        try {
            sys.general.location.set(obj);
            return sys.general.location;
        }
        catch (err) { return err; }
    }
    public async setOwnerAsync(obj: any): Promise<Owner> {
        sys.general.owner.set(obj);
        return new Promise<Owner>(function (resolve, reject) { resolve(sys.general.owner); });
    }
}

export class NixieChemControllerCommands extends ChemControllerCommands {
    protected async setIntelliChemAsync(data: any): Promise<ChemController> {
        try {
            let chem = await super.setIntelliChemAsync(data);
            // Now Nixie needs to make sure we are polling IntelliChem
            return Promise.resolve(chem);
        }
        catch (err) { return Promise.reject(err); }
    }
    protected async setIntelliChemStateAsync(data: any): Promise<ChemControllerState> {
        try {
            let schem = await super.setIntelliChemStateAsync(data);
            return Promise.resolve(schem);
        }
        catch (err) { return Promise.reject(err); }
    }
}
