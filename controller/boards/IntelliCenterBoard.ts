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
import { SystemBoard, byteValueMap, byteValueMaps, ConfigQueue, ConfigRequest, CircuitCommands, FeatureCommands, ChlorinatorCommands, PumpCommands, BodyCommands, ScheduleCommands, HeaterCommands, EquipmentIdRange, ValveCommands, SystemCommands, ChemControllerCommands } from './SystemBoard';
import { PoolSystem, Body, Schedule, Pump, ConfigVersion, sys, Heater, ICircuitGroup, LightGroupCircuit, LightGroup, ExpansionPanel, ExpansionModule, ExpansionModuleCollection, Valve, General, Options, Location, Owner, ICircuit, Feature, CircuitGroup, ChemController, TempSensorCollection, Chlorinator } from '../Equipment';
import { Protocol, Outbound, Inbound, Message, Response } from '../comms/messages/Messages';
import { conn } from '../comms/Comms';
import { logger } from '../../logger/Logger';
import { state, ChlorinatorState, LightGroupState, VirtualCircuitState, ICircuitState, BodyTempState, CircuitGroupState, ICircuitGroupState, ChemControllerState } from '../State';
import { utils } from '../../controller/Constants';
import { InvalidEquipmentIdError, InvalidEquipmentDataError, EquipmentNotFoundError, MessageError, InvalidOperationError } from '../Errors';
import { ncp } from '../nixie/Nixie';
export class IntelliCenterBoard extends SystemBoard {
    public needsConfigChanges: boolean = false;
    constructor(system: PoolSystem) {
        super(system);
        this._statusInterval = -1;
        this._modulesAcquired = false; // Set us up so that we can wait for a 2 and a 204.
        this.equipmentIds.circuits = new EquipmentIdRange(1, function () { return this.start + sys.equipment.maxCircuits - 1; });
        this.equipmentIds.features = new EquipmentIdRange(function () { return 129; }, function () { return this.start + sys.equipment.maxFeatures - 1; });
        this.equipmentIds.circuitGroups = new EquipmentIdRange(function () { return this.start; }, function () { return this.start + sys.equipment.maxCircuitGroups - 1; });
        this.equipmentIds.virtualCircuits = new EquipmentIdRange(function () { return this.start; }, function () { return 254; });
        this.equipmentIds.features.start = 129;
        this.equipmentIds.circuitGroups.start = 193;
        this.equipmentIds.virtualCircuits.start = 237;
        this.valueMaps.panelModes = new byteValueMap([
            [0, { val: 0, name: 'auto', desc: 'Auto' }],
            [1, { val: 1, name: 'service', desc: 'Service' }],
            [8, { val: 8, name: 'freeze', desc: 'Freeze' }],
            [255, { name: 'error', desc: 'System Error' }]
        ]);
        this.valueMaps.circuitFunctions = new byteValueMap([
            [0, { name: 'generic', desc: 'Generic' }],
            [1, { name: 'spillway', desc: 'Spillway' }],
            [2, { name: 'mastercleaner', desc: 'Master Cleaner', body: 1 }],
            [3, { name: 'chemrelay', desc: 'Chem Relay' }],
            [4, { name: 'light', desc: 'Light', isLight: true }],
            [5, { name: 'intellibrite', desc: 'Intellibrite', isLight: true, theme: 'intellibrite' }],
            [6, { name: 'globrite', desc: 'GloBrite', isLight: true, theme: 'intellibrite' }],
            [7, { name: 'globritewhite', desc: 'GloBrite White', isLight: true }],
            [8, { name: 'magicstream', desc: 'Magicstream', isLight: true, theme: 'intellibrite' }],
            [9, { name: 'dimmer', desc: 'Dimmer', isLight: true }],
            [10, { name: 'colorcascade', desc: 'ColorCascade', isLight: true, theme: 'intellibrite' }],
            [11, { name: 'mastercleaner2', desc: 'Master Cleaner 2', body: 2 }],
            [12, { name: 'pool', desc: 'Pool', hasHeatSource: true, body: 1 }],
            [13, { name: 'spa', desc: 'Spa', hasHeatSource: true, body: 2 }]
        ]);
        this.valueMaps.pumpTypes = new byteValueMap([
            [1, { name: 'ss', desc: 'Single Speed', maxCircuits: 0, hasAddress: false, hasBody: true }],
            [2, { name: 'ds', desc: 'Two Speed', maxCircuits: 8, hasAddress: false, hasBody: true }],
            [3, { name: 'vs', desc: 'Intelliflo VS', maxPrimingTime: 6, minSpeed: 450, maxSpeed: 3450, maxCircuits: 8, hasAddress: true }],
            [4, { name: 'vsf', desc: 'Intelliflo VSF', minSpeed: 450, maxSpeed: 3450, minFlow: 15, maxFlow: 130, maxCircuits: 8, hasAddress: true }],
            [5, { name: 'vf', desc: 'Intelliflo VF', maxPrimingTime: 6, minFlow: 15, maxFlow: 130, maxCircuits: 8, hasAddress: true }],
            [100, { name: 'sf', desc: 'SuperFlo VS', hasAddress: false, maxCircuits: 8, maxRelays: 4, equipmentMaster: 1, maxSpeeds: 4, relays: [{ id: 1, name: 'Program #1' }, { id: 2, name: 'Program #2' }, { id: 3, name: 'Program #3' }, { id: 4, name: 'Program #4' }] }],
            [101, { name: 'hwrly', desc: 'Hayward Relay VS', hasAddress: false, maxCircuits: 8, maxRelays: 4, equipmentMaster: 1, maxSpeeds: 8, relays: [{ id: 1, name: 'Step #1' }, { id: 2, name: 'Step #2' }, { id: 3, name: 'Step #3' }, { id: 4, name: 'Pump On' }] }],
            [102, { name: 'hwvs', desc: 'Hayward Eco/TriStar VS', minSpeed: 450, maxSpeed: 3450, maxCircuits: 8, hasAddress: true, equipmentMaster: 1 }]
        ]);
        // RSG - same as systemBoard definition; can delete.
        this.valueMaps.heatModes = new byteValueMap([
            [1, { name: 'off', desc: 'Off' }],
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
        this.valueMaps.heaterTypes = new byteValueMap([
            [1, { name: 'gas', desc: 'Gas Heater', hasAddress: false }],
            [2, { name: 'solar', desc: 'Solar Heater', hasAddress: false, hasCoolSetpoint: true, hasPreference: true }],
            [3, { name: 'heatpump', desc: 'Heat Pump', hasAddress: true, hasPreference: true }],
            [4, { name: 'ultratemp', desc: 'UltraTemp', hasAddress: true, hasCoolSetpoint: true, hasPreference: true }],
            [5, { name: 'hybrid', desc: 'Hybrid', hasAddress: true }],
            [6, { name: 'mastertemp', desc: 'MasterTemp', hasAddress: true }],
            [7, { name: 'maxetherm', desc: 'Max-E-Therm', hasAddress: true }],
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
            // There are just enough slots for accommodate all the supported hardware for the expansion modules.  However, there are several that
            // we do not have in the wild and cannot verify as of (03-25-2020) as to whether their id values are correct.  I feel more confident
            // with the i8P and i10P than I do with the others as this follows the pattern for the known personality cards.  i10D and the order of the
            // MUX and A/D modules don't seem to fit the pattern.  If we ever see an i10D then this may be bit 3&4 set to 1.  The theory here is that
            // the first 5 bits indicate up to 16 potential personality cards with 0 being i5P.
            [0, { name: 'i5P', part: '523125Z', desc: 'i5P Personality Card', bodies: 1, valves: 2, circuits: 5, single: true, shared: false, dual: false, chlorinators: 1, chemControllers: 1 }],
            [1, { name: 'i5PS', part: '521936Z', desc: 'i5PS Personality Card', bodies: 2, valves: 4, circuits: 6, shared: true, dual: false, chlorinators: 1, chemControllers: 1 }],
            [2, { name: 'i8P', part: '521977Z', desc: 'i8P Personality Card', bodies: 1, valves: 2, circuits: 8, single: true, shared: false, dual: false, chlorinators: 1, chemControllers: 1 }], // This is a guess
            [3, { name: 'i8PS', part: '521968Z', desc: 'i8PS Personality Card', bodies: 2, valves: 4, circuits: 9, shared: true, dual: false, chlorinators: 1, chemControllers: 1 }],
            [4, { name: 'i10P', part: '521993Z', desc: 'i10P Personality Card', bodies: 1, valves: 2, circuits: 10, single: true, shared: false, dual: false, chlorinators: 1, chemControllers: 1 }], // This is a guess
            [5, { name: 'i10PS', part: '521873Z', desc: 'i10PS Personality Card', bodies: 2, valves: 4, circuits: 11, shared: true, dual: false, chlorinators: 1, chemControllers: 1 }],
            [6, { name: 'i10x', part: '522997Z', desc: 'i10x Expansion Module', circuits: 10 }],
            [7, { name: 'i10D', part: '523029Z', desc: 'i10D Personality Card', bodies: 2, valves: 2, circuits: 11, shared: false, dual: true, chlorinators: 1, chemControllers: 2 }], // We have witnessed this in the wild
            [8, { name: 'Valve Exp', part: '522440', desc: 'Valve Expansion Module', valves: 6 }],
            [9, { name: 'A/D Module', part: '522039', desc: 'A/D Cover Module', covers: 2 }], // Finally have a user with one of these
            [10, { name: 'iChlor Mux', part: '522719', desc: 'iChlor MUX Card', chlorinators: 3 }], // This is a guess
            [255, {name: 'i5x', part: '522033', desc: 'i5x Expansion Module', circuits: 5}] // This does not actually map to a known value at this point but we do know it will be > 6.
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
        this.valueMaps.msgBroadcastActions.merge([
            [1, { name: 'ack', desc: 'Command Ack' }],
            [30, { name: 'config', desc: 'Configuration' }],
            [164, {name: 'getconfig', desc: 'Get Configuration'}],
            [168, { name: 'setdata', desc: 'Set Data' }],
            [204, { name: 'stateext', desc: 'State Extension' }],
            [222, { name: 'getdata', desc: 'Get Data' }],
            [228, {name: 'getversions', desc: 'Get Versions'}]
        ]);
        this.valueMaps.clockSources.merge([
            [1, { name: 'manual', desc: 'Manual' }],
            [2, { name: 'server', desc: 'Server' }],
            [3, { name: 'internet', desc: 'Internet' }]
        ]);
        this.valueMaps.scheduleTimeTypes.merge([
            [1, { name: 'sunrise', desc: 'Sunrise' }],
            [2, { name: 'sunset', desc: 'Sunset' }]
        ]);
        this.valueMaps.lightThemes = new byteValueMap([
            [0, { name: 'white', desc: 'White', sequence: 11, types:['intellibrite', 'magicstream'] }],
            [1, { name: 'green', desc: 'Green', sequence: 9, types: ['intellibrite', 'magicstream'] }],
            [2, { name: 'blue', desc: 'Blue', sequence: 8, types: ['intellibrite', 'magicstream'] }],
            [3, { name: 'magenta', desc: 'Magenta', sequence: 12, types: ['intellibrite', 'magicstream'] }],
            [4, { name: 'red', desc: 'Red', sequence: 10, types: ['intellibrite', 'magicstream'] }],
            [5, { name: 'sam', desc: 'SAm Mode', sequence: 1, types: ['intellibrite', 'magicstream'] }],
            [6, { name: 'party', desc: 'Party', sequence: 2, types: ['intellibrite', 'magicstream'] }],
            [7, { name: 'romance', desc: 'Romance', sequence: 3, types: ['intellibrite', 'magicstream'] }],
            [8, { name: 'caribbean', desc: 'Caribbean', sequence: 4, types: ['intellibrite', 'magicstream'] }],
            [9, { name: 'american', desc: 'American', sequence: 5, types: ['intellibrite', 'magicstream'] }],
            [10, { name: 'sunset', desc: 'Sunset', sequence: 6, types: ['intellibrite', 'magicstream'] }],
            [11, { name: 'royal', desc: 'Royal', sequence: 7, types: ['intellibrite', 'magicstream'] }],
            [255, { name: 'none', desc: 'None' }]
        ]);
        this.valueMaps.lightGroupCommands = new byteValueMap([
            [1, { name: 'colorsync', desc: 'Sync', types: ['intellibrite'], command: 'colorSync', message: 'Synchronizing' }],
            [2, { name: 'colorset', desc: 'Set', types: ['intellibrite'], command: 'colorSet', message: 'Sequencing Set Operation' }],
            [3, { name: 'colorswim', desc: 'Swim', types: ['intellibrite'], command: 'colorSwim', message: 'Sequencing Swim Operation' }],
            [12, { name: 'colorhold', desc: 'Hold', types: ['intellibrite', 'magicstream'], command: 'colorHold', message: 'Saving Current Colors', sequence: 13 }],
            [13, { name: 'colorrecall', desc: 'Recall', types: ['intellibrite', 'magicstream'], command: 'colorRecall', message: 'Recalling Saved Colors', sequence: 14 }]
        ]);

        this.valueMaps.lightCommands = new byteValueMap([
            [12, { name: 'colorhold', desc: 'Hold', types: ['intellibrite'], sequence: 13 }],
            [13, { name: 'colorrecall', desc: 'Recall', types: ['intellibrite'], sequence: 14 }],
            [15, {
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
            [1, { name: 'off', desc: 'Off' }],
            [2, { name: 'heater', desc: 'Heater' }],
            [3, { name: 'solar', desc: 'Solar Only' }],
            [4, { name: 'solarpref', desc: 'Solar Preferred' }],
            [5, { name: 'ultratemp', desc: 'Ultratemp Only' }],
            [6, { name: 'ultratemppref', desc: 'Ultratemp Pref' }],
            [9, { name: 'heatpump', desc: 'Heatpump Only' }],
            [25, { name: 'heatpumppref', desc: 'Heatpump Pref' }],
            [32, { name: 'nochange', desc: 'No Change' }]
        ]);
        this.valueMaps.heatStatus = new byteValueMap([
            [0, { name: 'off', desc: 'Off' }],
            [1, { name: 'heater', desc: 'Heater' }],
            [2, { name: 'solar', desc: 'Solar' }],
            [3, { name: 'cooling', desc: 'Cooling' }],
            [6, { name: 'mtheat', desc: 'Heater' }],
            [4, { name: 'hpheat', desc: 'Heating' }],
            [8, { name: 'hpcool', desc: 'Cooling' }]
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
    private _configQueue: IntelliCenterConfigQueue = new IntelliCenterConfigQueue();
    public system: IntelliCenterSystemCommands = new IntelliCenterSystemCommands(this);
    public circuits: IntelliCenterCircuitCommands = new IntelliCenterCircuitCommands(this);
    public features: IntelliCenterFeatureCommands = new IntelliCenterFeatureCommands(this);
    public chlorinator: IntelliCenterChlorinatorCommands = new IntelliCenterChlorinatorCommands(this);
    public bodies: IntelliCenterBodyCommands = new IntelliCenterBodyCommands(this);
    public pumps: IntelliCenterPumpCommands = new IntelliCenterPumpCommands(this);
    public schedules: IntelliCenterScheduleCommands = new IntelliCenterScheduleCommands(this);
    public heaters: IntelliCenterHeaterCommands = new IntelliCenterHeaterCommands(this);
    public valves: IntelliCenterValveCommands = new IntelliCenterValveCommands(this);
    public chemControllers: IntelliCenterChemControllerCommands = new IntelliCenterChemControllerCommands(this);
    public reloadConfig() {
        //sys.resetSystem();
        sys.configVersion.clear();
        state.status = 0;
        this.needsConfigChanges = true;
        console.log('RESETTING THE CONFIGURATION');
        this.modulesAcquired = false;
    }
    public checkConfiguration() {
        if (!conn.mockPort) {
            (sys.board as IntelliCenterBoard).needsConfigChanges = true;
            // Send out a message to the outdoor panel that we need info about
            // our current configuration.
            console.log('Checking IntelliCenter configuration...');
            const out: Outbound = Outbound.createMessage(228, [0], 5, Response.create({ dest: -1, action: 164 }));
            conn.queueSendMessage(out);
        }
    }
    public requestConfiguration(ver: ConfigVersion) {
        if (this.needsConfigChanges) {
            logger.info(`Requesting IntelliCenter configuration`);
            this._configQueue.queueChanges(ver);
            this.needsConfigChanges = false;
        }
        else {
            logger.info(`Skipping configuration -- Just setting the versions`);
            sys.configVersion.chlorinators = ver.chlorinators;
            sys.configVersion.circuitGroups = ver.circuitGroups;
            sys.configVersion.circuits = ver.circuits;
            sys.configVersion.covers = ver.covers;
            sys.configVersion.equipment = ver.equipment;
            sys.configVersion.systemState = ver.systemState;
            sys.configVersion.features = ver.features;
            sys.configVersion.general = ver.general;
            sys.configVersion.heaters = ver.heaters;
            sys.configVersion.intellichem = ver.intellichem;
            sys.configVersion.options = ver.options;
            sys.configVersion.pumps = ver.pumps;
            sys.configVersion.remotes = ver.remotes;
            sys.configVersion.schedules = ver.schedules;
            sys.configVersion.security = ver.security;
            sys.configVersion.valves = ver.valves;
        }
    }
    public async stopAsync() { this._configQueue.close(); return super.stopAsync();}
    public initExpansionModules(ocp0A: number, ocp0B: number, xcp1A: number, xcp1B: number, xcp2A: number, xcp2B: number, xcp3A: number, xcp3B: number) {
        state.equipment.controllerType = 'intellicenter';
        let inv = { bodies: 0, circuits: 0, valves: 0, shared: false, dual: false, covers: 0, chlorinators: 0, chemControllers: 0 };
        this.processMasterModules(sys.equipment.modules, ocp0A, ocp0B, inv);
        // Here we need to set the start id should we have a single body system.
        if (!inv.shared && !inv.dual) { sys.board.equipmentIds.circuits.start = 2; } // We are a single body system.
        this.processExpansionModules(sys.equipment.expansions.getItemById(1, true), xcp1A, xcp1B, inv);
        this.processExpansionModules(sys.equipment.expansions.getItemById(2, true), xcp2A, xcp2B, inv);
        // We are still unsure how the 3rd power center is encoded.  For now we are simply un-installing it.
        this.processExpansionModules(sys.equipment.expansions.getItemById(3, true), 0, 0, inv);
        if (inv.bodies !== sys.equipment.maxBodies ||
            inv.circuits !== sys.equipment.maxCircuits ||
            inv.chlorinators !== sys.equipment.maxChlorinators ||
            inv.chemControllers !== sys.equipment.maxChemControllers ||
            inv.valves !== sys.equipment.maxValves) {
            sys.resetData();
            this.processMasterModules(sys.equipment.modules, ocp0A, ocp0B);
            this.processExpansionModules(sys.equipment.expansions.getItemById(1, true), xcp1A, xcp1B);
            this.processExpansionModules(sys.equipment.expansions.getItemById(2, true), xcp2A, xcp2B);
            this.processExpansionModules(sys.equipment.expansions.getItemById(3, true), 0, 0);
        }
        sys.equipment.maxBodies = inv.bodies;
        sys.equipment.maxValves = inv.valves;
        sys.equipment.maxCircuits = inv.circuits;
        sys.equipment.maxChlorinators = inv.chlorinators;
        sys.equipment.maxChemControllers = inv.chemControllers;
        sys.equipment.shared = inv.shared;
        sys.equipment.dual = inv.dual;
        sys.equipment.single = (inv.shared === false && inv.dual === false);
        sys.equipment.maxPumps = 16;
        sys.equipment.maxLightGroups = 40;
        sys.equipment.maxCircuitGroups = 16;
        sys.equipment.maxSchedules = 100;
        sys.equipment.maxFeatures = 32;
        state.equipment.maxBodies = sys.equipment.maxBodies;
        state.equipment.maxCircuitGroups = sys.equipment.maxCircuitGroups;
        state.equipment.maxCircuits = sys.equipment.maxCircuits;
        state.equipment.maxFeatures = sys.equipment.maxFeatures;
        state.equipment.maxHeaters = sys.equipment.maxHeaters;
        state.equipment.maxLightGroups = sys.equipment.maxLightGroups;
        state.equipment.maxPumps = sys.equipment.maxPumps;
        state.equipment.maxSchedules = sys.equipment.maxSchedules;
        state.equipment.maxValves = sys.equipment.maxValves;
        state.equipment.single = sys.equipment.single;
        state.equipment.shared = sys.equipment.shared;
        state.equipment.dual = sys.equipment.dual;
        //let pb = sys.equipment.modules.getItemById(0);
        //if (pb.type === 0 || pb.type > 7)
        //    sys.equipment.model = 'IntelliCenter i5P';
        //else
        //    sys.equipment.model = 'IntelliCenter ' + pb.name;
        state.equipment.model = sys.equipment.model;
        sys.equipment.shared || sys.equipment.dual ? sys.board.equipmentIds.circuits.start = 1 : sys.board.equipmentIds.circuits.start = 2;

        sys.board.heaters.initTempSensors();
        (async () => {
            try { sys.board.bodies.initFilters(); } catch (err) {
                logger.error(`Error initializing IntelliCenter Filters`);
            }
        })();
        this.modulesAcquired = true;
        sys.equipment.master = 0;
        sys.general.master = 0;
        sys.general.location.master = 0;
        sys.general.owner.master = 0;
        sys.general.options.master = 0;
        for (let i = 0; i < sys.circuits.length; i++) {
            let c = sys.circuits.getItemByIndex(i);
            if(c.id <= 40) c.master = 0;
        }
        for (let i = 0; i < sys.valves.length; i++) {
            let v = sys.valves.getItemByIndex(i);
            if (v.id < 50) v.master = 0;
        }
        for (let i = 0; i < sys.bodies.length; i++) {
            let b = sys.bodies.getItemByIndex(i);
            b.master = 0;
        }
        ncp.initAsync(sys);
        this.checkConfiguration();
    }
    public processMasterModules(modules: ExpansionModuleCollection, ocpA: number, ocpB: number, inv?) {
        // Map the expansion panels to their specific types through the valuemaps.  Sadly this means that
        // we need to determine if anything needs to be removed or added before actually doing it.
        if (typeof inv === 'undefined') inv = { bodies: 0, circuits: 0, valves: 0, shared: false, covers: 0, chlorinators: 0, chemControllers: 0};
        let slot0 = ocpA & 0x0F;
        let slot1 = (ocpA & 0xF0) >> 4;
        let slot2 = (ocpB & 0xF0) >> 4;
        let slot3 = ocpB & 0xF;
        // Slot 0 always has to have a personality card.
        // This is an i5P.  There is nothing here so the MB is the personality board.
        let mod = modules.getItemById(0, true);
        let mt = this.valueMaps.expansionBoards.transform(slot0);
        mod.name = mt.name;
        mod.desc = mt.desc;
        mod.type = slot0;
        mod.part = mt.part;
        mod.get().bodies = mt.bodies;
        mod.get().circuits = mt.circuits;
        mod.get().valves = mt.valves;
        mod.get().covers = mt.covers;
        mod.get().chlorinators = mt.chlorinators;
        mod.get().chemControllers = mt.chemControllers;
        if (mod.type === 0 || mod.type > 7)
            sys.equipment.model = 'IntelliCenter i5P';
        else
            sys.equipment.model = 'IntelliCenter ' + mod.name;
        state.equipment.model = sys.equipment.model;
        if (typeof mt.bodies !== 'undefined') inv.bodies += mt.bodies;
        if (typeof mt.circuits !== 'undefined') inv.circuits += mt.circuits;
        if (typeof mt.valves !== 'undefined') inv.valves += mt.valves;
        if (typeof mt.covers !== 'undefined') inv.covers += mt.covers;
        if (typeof mt.chlorinators !== 'undefined') inv.chlorinators += mt.chlorinators;
        if (typeof mt.chemControllers !== 'undefined') inv.chemControllers += mt.chemControllers;
        if (typeof mt.single !== 'undefined') inv.single = mt.single;
        if (typeof mt.shared !== 'undefined') inv.shared = mt.shared;
        if (typeof mt.dual !== 'undefined') inv.dual = mt.dual;
        if (slot1 === 0) modules.removeItemById(1);
        else {
            let mod = modules.getItemById(1, true);
            let mt = this.valueMaps.expansionBoards.transform(slot1);
            mod.name = mt.name;
            mod.desc = mt.desc;
            mod.type = slot1;
            mod.part = mt.part;
            mod.get().bodies = mt.bodies;
            mod.get().circuits = mt.circuits;
            mod.get().valves = mt.valves;
            mod.get().covers = mt.covers;
            mod.get().chlorinators = mt.chlorinators;
            mod.get().chemControllers = mt.chemControllers;
            if (typeof mt.bodies !== 'undefined') inv.bodies += mt.bodies;
            if (typeof mt.circuits !== 'undefined') inv.circuits += mt.circuits;
            if (typeof mt.valves !== 'undefined') inv.valves += mt.valves;
            if (typeof mt.covers !== 'undefined') inv.covers += mt.covers;
            if (typeof mt.chlorinators !== 'undefined') inv.chlorinators += mt.chlorinators;
            if (typeof mt.chemControllers !== 'undefined') inv.chemControllers += mt.chemControllers;
        }
        if (slot2 === 0) modules.removeItemById(2);
        else {
            let mod = modules.getItemById(2, true);
            let mt = this.valueMaps.expansionBoards.transform(slot2);
            mod.name = mt.name;
            mod.desc = mt.desc;
            mod.type = slot2;
            mod.part = mt.part;
            mod.get().bodies = mt.bodies;
            mod.get().circuits = mt.circuits;
            mod.get().valves = mt.valves;
            mod.get().covers = mt.covers;
            mod.get().chlorinators = mt.chlorinators;
            mod.get().chemControllers = mt.chemControllers;
            if (typeof mt.bodies !== 'undefined') inv.bodies += mt.bodies;
            if (typeof mt.circuits !== 'undefined') inv.circuits += mt.circuits;
            if (typeof mt.valves !== 'undefined') inv.valves += mt.valves;
            if (typeof mt.covers !== 'undefined') inv.covers += mt.covers;
            if (typeof mt.chlorinators !== 'undefined') inv.chlorinators += mt.chlorinators;
            if (typeof mt.chemControllers !== 'undefined') inv.chemControllers += mt.chemControllers;
        }
        if (slot3 === 0) modules.removeItemById(3);
        else {
            let mod = modules.getItemById(3, true);
            let mt = this.valueMaps.expansionBoards.transform(slot3);
            mod.name = mt.name;
            mod.desc = mt.desc;
            mod.type = slot3;
            mod.part = mt.part;
            mod.get().bodies = mt.bodies;
            mod.get().circuits = mt.circuits;
            mod.get().valves = mt.valves;
            mod.get().covers = mt.covers;
            mod.get().chlorinators = mt.chlorinators;
            mod.get().chemControllers = mt.chemControllers;
            if (typeof mt.bodies !== 'undefined') inv.bodies += mt.bodies;
            if (typeof mt.circuits !== 'undefined') inv.circuits += mt.circuits;
            if (typeof mt.valves !== 'undefined') inv.valves += mt.valves;
            if (typeof mt.covers !== 'undefined') inv.covers += mt.covers;
            if (typeof mt.chlorinators !== 'undefined') inv.chlorinators += mt.chlorinators;
            if (typeof mt.chemControllers !== 'undefined') inv.chemControllers += mt.chemControllers;
        }
    }
    public processExpansionModules(panel: ExpansionPanel, ocpA: number, ocpB: number, inv?) {
        // Map the expansion panels to their specific types through the valuemaps.  Sadly this means that
        // we need to determine if anything needs to be removed or added before actually doing it.
        let modules: ExpansionModuleCollection = panel.modules;
        if (typeof inv === 'undefined') inv = { bodies: 0, circuits: 0, valves: 0, shared: false, covers: 0, chlorinators: 0, chemControllers: 0 };
        // 
        let slot0 = ocpA & 0x0F;
        let slot1 = (ocpA & 0xF0) >> 4;
        let slot2 = (ocpB & 0xF0) >> 4;
        let slot3 = ocpB & 0xF;
        // Slot 0 always has to have a personality card but on an expansion module it cannot be 0.  At this point we only know that an i10x = 6 for slot 0.
        if (slot0 <= 2) {  
            modules.removeItemById(0);
            panel.isActive = false;
        }
        else {
            let mod = modules.getItemById(0, true);
            let mt = slot0 === 6 ? this.valueMaps.expansionBoards.transform(slot0) : this.valueMaps.expansionBoards.transform(255);
            panel.isActive = true;
            mod.name = mt.name;
            mod.desc = mt.desc;
            mod.type = slot0;
            mod.part = mt.part;
            mod.get().bodies = mt.bodies;
            mod.get().circuits = mt.circuits;
            mod.get().valves = mt.valves;
            mod.get().covers = mt.covers;
            mod.get().chlorinators = mt.chlorinators;
            mod.get().chemControllers = mt.chemControllers;
            if (typeof mt.bodies !== 'undefined') inv.bodies += mt.bodies;
            if (typeof mt.circuits !== 'undefined') inv.circuits += mt.circuits;
            if (typeof mt.valves !== 'undefined') inv.valves += mt.valves;
            if (typeof mt.covers !== 'undefined') inv.covers += mt.covers;
            if (typeof mt.chlorinators !== 'undefined') inv.chlorinators += mt.chlorinators;
            if (typeof mt.single !== 'undefined') inv.single = mt.single;
            if (typeof mt.shared !== 'undefined') inv.shared = mt.shared;
            if (typeof mt.dual !== 'undefined') inv.dual = mt.dual;
            if (typeof mt.chemControllers !== 'undefined') inv.chemControllers += mt.chemControllers;
        }
        if (slot1 === 0 || slot0 <= 2) modules.removeItemById(1);
        else {
            let mod = modules.getItemById(1, true);
            let mt = this.valueMaps.expansionBoards.transform(slot1);
            mod.name = mt.name;
            mod.desc = mt.desc;
            mod.type = slot1;
            mod.part = mt.part;
            mod.get().bodies = mt.bodies;
            mod.get().circuits = mt.circuits;
            mod.get().valves = mt.valves;
            mod.get().covers = mt.covers;
            mod.get().chlorinators = mt.chlorinators;
            mod.get().chemControllers = mt.chemControllers;
            if (typeof mt.bodies !== 'undefined') inv.bodies += mt.bodies;
            if (typeof mt.circuits !== 'undefined') inv.circuits += mt.circuits;
            if (typeof mt.valves !== 'undefined') inv.valves += mt.valves;
            if (typeof mt.covers !== 'undefined') inv.covers += mt.covers;
            if (typeof mt.chlorinators !== 'undefined') inv.chlorinators += mt.chlorinators;
            if (typeof mt.chemControllers !== 'undefined') inv.chemControllers += mt.chemControllers;
        }
        if (slot2 === 0 || slot0 <= 2) modules.removeItemById(2);
        else {
            let mod = modules.getItemById(2, true);
            let mt = this.valueMaps.expansionBoards.transform(slot2);
            mod.name = mt.name;
            mod.desc = mt.desc;
            mod.type = slot2;
            mod.part = mt.part;
            mod.get().bodies = mt.bodies;
            mod.get().circuits = mt.circuits;
            mod.get().valves = mt.valves;
            mod.get().covers = mt.covers;
            mod.get().chlorinators = mt.chlorinators;
            mod.get().chemControllers = mt.chemControllers;
            if (typeof mt.bodies !== 'undefined') inv.bodies += mt.bodies;
            if (typeof mt.circuits !== 'undefined') inv.circuits += mt.circuits;
            if (typeof mt.valves !== 'undefined') inv.valves += mt.valves;
            if (typeof mt.covers !== 'undefined') inv.covers += mt.covers;
            if (typeof mt.chlorinators !== 'undefined') inv.chlorinators += mt.chlorinators;
            if (typeof mt.chemControllers !== 'undefined') inv.chemControllers += mt.chemControllers;
        }
        if (slot3 === 0 || slot0 <= 2) modules.removeItemById(3);
        else {
            let mod = modules.getItemById(3, true);
            let mt = this.valueMaps.expansionBoards.transform(slot3);
            mod.name = mt.name;
            mod.desc = mt.desc;
            mod.type = slot3;
            mod.part = mt.part;
            mod.get().bodies = mt.bodies;
            mod.get().circuits = mt.circuits;
            mod.get().valves = mt.valves;
            mod.get().covers = mt.covers;
            mod.get().chlorinators = mt.chlorinators;
            mod.get().chemControllers = mt.chemControllers;
            if (typeof mt.bodies !== 'undefined') inv.bodies += mt.bodies;
            if (typeof mt.circuits !== 'undefined') inv.circuits += mt.circuits;
            if (typeof mt.valves !== 'undefined') inv.valves += mt.valves;
            if (typeof mt.covers !== 'undefined') inv.covers += mt.covers;
            if (typeof mt.chlorinators !== 'undefined') inv.chlorinators += mt.chlorinators;
            if (typeof mt.chemControllers !== 'undefined') inv.chemControllers += mt.chemControllers;
        }
    }
    public get commandSourceAddress(): number { return Message.pluginAddress; }
    public get commandDestAddress(): number { return 15; }
    public static getAckResponse(action: number, source?: number, dest?: number): Response { return Response.create({ source: source, dest: dest || sys.board.commandSourceAddress, action: 1, payload: [action] }); }
}
class IntelliCenterConfigRequest extends ConfigRequest {
    constructor(cat: number, ver: number, items?: number[], oncomplete?: Function) {
        super();
        this.category = cat;
        this.version = ver;
        if (typeof items !== 'undefined') this.items.push(...items);
        this.oncomplete = oncomplete;
    }
    declare category: ConfigCategories;
}
class IntelliCenterConfigQueue extends ConfigQueue {
    public _processing: boolean = false;
    public _newRequest: boolean = false;
    public _failed: boolean = false;
    public processNext(msg?: Outbound) {
        if (this.closed) return;
        let self = this;
        if (typeof msg !== 'undefined' && msg !== null) {
            if (!msg.failed) {
                // Remove all references to future items. We got it so we don't need it again.
                this.removeItem(msg.payload[0], msg.payload[1]);
                if (this.curr && this.curr.isComplete) {
                    if (!this.curr.failed) {
                        // Call the identified callback.  This may add additional items.
                        if (typeof this.curr.oncomplete === 'function') {
                            this.curr.oncomplete(this.curr);
                            this.curr.oncomplete = undefined;
                        }
                        // Let the process add in any additional information we might need.  When it does
                        // this it will set the isComplete flag to false.
                        if (this.curr.isComplete) {
                            sys.configVersion[ConfigCategories[this.curr.category]] = this.curr.version;
                        }
                    } else {
                        // We failed to get the data.  Let the system retry when
                        // we are done with the queue.
                        sys.configVersion[ConfigCategories[this.curr.category]] = 0;
                    }
                }
            }
            else this._failed = true;
        }
        if (!this.curr && this.queue.length > 0) this.curr = this.queue.shift();
        if (!this.curr) {
            // There never was anything for us to do. We will likely never get here.
            state.status = 1;
            state.emitControllerChange();
            return;
        } else
            state.status = sys.board.valueMaps.controllerStatus.transform(2, this.percent);
        // Shift to the next config queue item.
        while (
            this.queue.length > 0 &&
            this.curr.isComplete
        ) {
            this.curr = this.queue.shift() || null;
        }
        let itm = 0;
        if (this.curr && !this.curr.isComplete) {
            itm = this.curr.items.shift();
            // RKS: Acks can sometimes conflict if there is another panel at the plugin address
            // this used to send a 30 Ack when it received its response but it appears that is
            // any other panel is awake at the same address it may actually collide with it
            // as both boards are processing at the same time and sending an outbound ack.
            let out = Outbound.create({
                action: 222, payload: [this.curr.category, itm], retries: 5,
                response: Response.create({ dest:-1, action: 30, payload: [this.curr.category, itm], callback: () => { self.processNext(out); } })
            });
            logger.verbose(`Requesting config for: ${ConfigCategories[this.curr.category]} - Item: ${itm}`);
            setTimeout(() => { conn.queueSendMessage(out) }, 50);
        } else {
            // Now that we are done check the configuration a final time.  If we have anything outstanding
            // it will get picked up.
            state.status = 1;
            this.curr = null;
            this._processing = false;
            if (this._failed) setTimeout(() => { sys.checkConfiguration(); }, 100);
            logger.info(`Configuration Complete`);
            sys.board.heaters.updateHeaterServices();
            state.cleanupState();
        }
        // Notify all the clients of our processing status.
        state.emitControllerChange();
    }
    public queueChanges(ver: ConfigVersion) {
        let curr: ConfigVersion = sys.configVersion;
        
        if (this._processing) {
            if (curr.hasChanges(ver)) this._newRequest = true;
            if (sys.configVersion.lastUpdated.getTime() > new Date().getTime() - 90000)
                console.log('WE ARE ALREADY PROCESSING CHANGES...')
            return;
        }
        this._processing = true;
        this._failed = false;
        let self = this;
        if (!curr.hasChanges(ver)) return;
        sys.configVersion.lastUpdated = new Date();
        // Tell the system we are loading.
        state.status = sys.board.valueMaps.controllerStatus.transform(2, 0);
        this.maybeQueueItems(curr.equipment, ver.equipment, ConfigCategories.equipment, [0, 1, 2, 3]);
        this.maybeQueueItems(curr.options, ver.options, ConfigCategories.options, [0, 1]);
        if (this.compareVersions(curr.circuits, ver.circuits)) {
            let req = new IntelliCenterConfigRequest(ConfigCategories.circuits, ver.circuits, [0, 1, 2],
                function (req: IntelliCenterConfigRequest) {
                    // Only add in the items that we need.
                    req.fillRange(3, Math.min(Math.ceil(sys.equipment.maxCircuits / 2) + 3, 24));
                    req.fillRange(26, 29);
                });
            this.push(req);
        }
        if (this.compareVersions(curr.features, ver.features)) {
            let req = new IntelliCenterConfigRequest(ConfigCategories.features, ver.features, [0, 1, 2, 3, 4, 5, 22]);
            // Only add in the items that we need for now.  We will queue the optional packets later.  The first 6 packets and 22
            // are required but we can reduce the number of names returned by only requesting the data after the names have been processed.
            req.oncomplete = function (req: IntelliCenterConfigRequest) {
                let maxId = sys.features.getMaxId(true, 0) - sys.board.equipmentIds.features.start + 1;
                // We only need to get the feature names required.  This will fill these after we know we have them.
                if(maxId > 0) req.fillRange(6, Math.min(Math.ceil(maxId / 2) + 6, 21));
            };
            this.push(req);
        }
        if (this.compareVersions(curr.pumps, ver.pumps)) {
            let req = new IntelliCenterConfigRequest(ConfigCategories.pumps, ver.pumps, [4],
                function (req: IntelliCenterConfigRequest) {
                    // Get the pump names after we have acquire the active pumps.  We only need
                    // the names of the active pumps.
                    let maxPumpId = sys.pumps.getMaxId(true, 0) - sys.board.equipmentIds.pumps.start + 1;
                    if (maxPumpId > 0) req.fillRange(19, Math.min(Math.ceil(maxPumpId / 2) + 19, 26));
                });
            req.fillRange(0, 3);
            req.fillRange(5, 18);
            this.push(req);
        }
        this.maybeQueueItems(curr.security, ver.security, ConfigCategories.security, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
        if (this.compareVersions(curr.remotes, ver.remotes)) {
            let req = new IntelliCenterConfigRequest(ConfigCategories.remotes, ver.remotes, [0, 1], function (req: IntelliCenterConfigRequest) {
                // Only get remote attributes if we actually have something other than the 2 is4s.
                if (sys.remotes.length > 2) req.fillRange(3, sys.remotes.length - 2 + 3);
            });
            this.push(req);
        }
        if (this.compareVersions(curr.circuitGroups, ver.circuitGroups)) {
            let req = new IntelliCenterConfigRequest(ConfigCategories.circuitGroups, ver.circuitGroups, [32,33], function (req: IntelliCenterConfigRequest) {
                // Only get group attributes for the ones we have defined.  The total number of message for all potential groups exceeds 50.
                if (sys.circuitGroups.length + sys.lightGroups.length > 0) {
                    let maxId = (Math.max(sys.circuitGroups.getMaxId(true, 0), sys.lightGroups.getMaxId(true, 0)) - sys.board.equipmentIds.circuitGroups.start) + 1;
                    req.fillRange(0, maxId); // Associated Circuits
                    req.fillRange(16, maxId + 16); // Group names and delay
                    req.fillRange(34, 35);  // Egg timer and colors
                    req.fillRange(36, Math.min(36 + maxId, 50)); // Colors
                }

            });
            this.push(req);
        }
        this.maybeQueueItems(curr.chlorinators, ver.chlorinators, ConfigCategories.chlorinators, [0]);
        if (this.compareVersions(curr.valves, ver.valves)) {
            let req = new IntelliCenterConfigRequest(ConfigCategories.valves, ver.valves, [0]);
            let totalValves = sys.equipment.maxValves + (sys.equipment.shared ? 2 : 4);
            req.fillRange(1, Math.min(Math.ceil(totalValves / 2) + 1, 14));
            this.push(req);
        }
        if (this.compareVersions(curr.intellichem, ver.intellichem)) {
            let req = new IntelliCenterConfigRequest(ConfigCategories.intellichem, ver.intellichem, [0, 1]);
            this.push(req);
        }
        if (this.compareVersions(curr.heaters, ver.heaters)) {
            let req = new IntelliCenterConfigRequest(ConfigCategories.heaters, ver.heaters, [0, 1, 2, 3, 4],
                function (req: IntelliCenterConfigRequest) {
                    if (sys.heaters.length > 0) {
                        let maxId = sys.heaters.getMaxId(true, 0);
                        req.fillRange(5, Math.min(Math.ceil(sys.heaters.getMaxId(true, 0) / 2) + 5, 12)); // Heater names
                    }
                    req.fillRange(13, 14);
                });
            this.push(req);
        }
        this.maybeQueueItems(curr.general, ver.general, ConfigCategories.general, [0, 1, 2, 3, 4, 5, 6, 7]);
        this.maybeQueueItems(curr.covers, ver.covers, ConfigCategories.covers, [0, 1]);
        if (this.compareVersions(curr.schedules, ver.schedules)) {
            // Alright we used to think we could rely on the schedule start time as the trigger that identifies an active schedule.  However, active
            // schedules are actually determined by looking at the schedule type messages[8-10].
            let req = new IntelliCenterConfigRequest(ConfigCategories.schedules, ver.schedules, [8, 9, 10], function (req: IntelliCenterConfigRequest) {
                let maxSchedId = sys.schedules.getMaxId();
                req.fillRange(5, 5 + Math.min(Math.ceil(maxSchedId / 40), 7)); // Circuits
                req.fillRange(11, 11 + Math.min(Math.ceil(maxSchedId / 40), 13)); // Schedule days bitmask
                req.fillRange(0, Math.min(Math.ceil(maxSchedId / 40), 4)); // Start Time
                req.fillRange(23, 23 + Math.min(Math.ceil(maxSchedId / 20), 26)); // End Time
                req.fillRange(14, 14 + Math.min(Math.ceil(maxSchedId / 40), 16)); // Start Month
                req.fillRange(17, 17 + Math.min(Math.ceil(maxSchedId / 40), 19)); // Start Day
                req.fillRange(20, 20 + Math.min(Math.ceil(maxSchedId / 40), 22)); // Start Year
                req.fillRange(28, 28 + Math.min(Math.ceil(maxSchedId / 40), 30)); // Heat Mode
                req.fillRange(31, 31 + Math.min(Math.ceil(maxSchedId / 40), 33)); // Heat Mode
                req.fillRange(34, 34 + Math.min(Math.ceil(maxSchedId / 40), 36)); // Heat Mode
            });
            // DEPRECATED: 12-26-21 This was the old order of fetching the schedule.  This did not work properly with start times of midnight since the start time of 0
            // was previously being used to determine whether the schedule was active.  The schedule/time type messages are now being used.
            //let req = new IntelliCenterConfigRequest(ConfigCategories.schedules, ver.schedules, [0, 1, 2, 3, 4], function (req: IntelliCenterConfigRequest) {
            //    let maxSchedId = sys.schedules.getMaxId();
            //    req.fillRange(5, 5 + Math.min(Math.ceil(maxSchedId / 40), 7)); // Circuits
            //    req.fillRange(8, 8 + Math.min(Math.ceil(maxSchedId / 40), 10)); // Flags
            //    req.fillRange(11, 11 + Math.min(Math.ceil(maxSchedId / 40), 13)); // Schedule days bitmask
            //    req.fillRange(14, 14 + Math.min(Math.ceil(maxSchedId / 40), 16)); // Unknown (one byte per schedule)
            //    req.fillRange(17, 17 + Math.min(Math.ceil(maxSchedId / 40), 19)); // Unknown (one byte per schedule)
            //    req.fillRange(20, 20 + Math.min(Math.ceil(maxSchedId / 40), 22)); // Unknown (one byte per schedule)
            //    req.fillRange(23, 23 + Math.min(Math.ceil(maxSchedId / 20), 26)); // End Time
            //    req.fillRange(28, 28 + Math.min(Math.ceil(maxSchedId / 40), 30)); // Heat Mode
            //    req.fillRange(31, 31 + Math.min(Math.ceil(maxSchedId / 40), 33)); // Heat Mode
            //    req.fillRange(34, 34 + Math.min(Math.ceil(maxSchedId / 40), 36)); // Heat Mode
            //});
            this.push(req);
        }
        this.maybeQueueItems(curr.systemState, ver.systemState, ConfigCategories.systemState, [0]);
        logger.info(`Queued ${this.remainingItems} configuration items`);
        if (this.remainingItems > 0) setTimeout(() => { self.processNext(); }, 50);
        else {
            this._processing = false;
            if (this._newRequest) {
                this._newRequest = false;
                setTimeout(() => { sys.board.checkConfiguration(); }, 250);
            }
            state.status = 1;
            state.equipment.single = sys.equipment.single;
            state.equipment.shared = sys.equipment.shared;
            state.equipment.dual = sys.equipment.dual;
            state.equipment.model = sys.equipment.model;
            state.equipment.controllerType = sys.controllerType;
            state.equipment.maxBodies = sys.equipment.maxBodies;
            state.equipment.maxCircuits = sys.equipment.maxCircuits;
            state.equipment.maxValves = sys.equipment.maxValves;
            state.equipment.maxSchedules = sys.equipment.maxSchedules;
            ncp.initAsync(sys);
        }
        state.emitControllerChange();
        //this._needsChanges = false;
        //this.data.controllerType = this.controllerType;
    }
    private compareVersions(curr: number, ver: number): boolean { return !curr || !ver || curr !== ver; }
    private maybeQueueItems(curr: number, ver: number, cat: number, opts: number[]) {
        if (this.compareVersions(curr, ver)) this.push(new IntelliCenterConfigRequest(cat, ver, opts));
    }
}
class IntelliCenterSystemCommands extends SystemCommands {
    public async setDateTimeAsync(obj: any): Promise<any> {
        if (obj.clockSource === 'internet' || obj.clockSource === 'server' || obj.clockSource === 'manual') sys.general.options.clockSource = obj.clockSource;
        Promise.resolve({
            time: state.time.format(),
            adjustDST: sys.general.options.adjustDST,
            clockSource: sys.general.options.clockSource
        });
    }
    public async setGeneralAsync(obj?: any): Promise<General> {
        return new Promise<General>(async (resolve, reject) => {
            try {
                await new Promise<void>((resolve, reject) => {
                    if (typeof obj.alias === 'string' && obj.alias !== sys.general.alias) {
                        let out = Outbound.create({
                            action: 168,
                            payload: [12, 0, 0],
                            retries: 3,
                            onComplete: (err, msg) => {
                                if (err) return Promise.reject(err);
                                else { sys.general.alias = obj.alias; resolve(); }
                            }
                        }).appendPayloadString(obj.alias, 16);
                        conn.queueSendMessage(out);
                    }
                    resolve();
                });
                if (typeof obj.options !== 'undefined') await sys.board.system.setOptionsAsync(obj.options).catch((err) => {
                    console.log(`Caught reject from setOptionsAsync`);
                    throw err;
                });
                if (typeof obj.location !== 'undefined') await sys.board.system.setLocationAsync(obj.location);
                if (typeof obj.owner !== 'undefined') await sys.board.system.setOwnerAsync(obj.owner);
                resolve(sys.general);
            }
            catch (err) {
                console.log(`Rejected setGeneralAsync`);
                reject(err);
            }
        });
    }
    public async setTempSensorsAsync(obj?: any): Promise<TempSensorCollection> {
        return new Promise<TempSensorCollection>(async (resolve, reject) => {
            try {
                let sensors = {
                    waterTempAdj1: obj.waterTempAdj1,
                    waterTempAdj2: obj.waterTempAdj2,
                    waterTempAdj3: obj.waterTempAdj3,
                    waterTempAdj4: obj.waterTempAdj4,
                    airTempAdj: obj.airTempAdj, 
                    solarTempAdj1: obj.solarTempAdj1,
                    solarTempAdj2: obj.solarTempAdj2,
                    solarTempAdj3: obj.solarTempAdj3,
                    solarTempAdj4: obj.solarTempAdj4,
                }
                await this.setOptionsAsync(sensors); // Map this to the options message as these are one in the same.
                resolve(sys.equipment.tempSensors);
            }
            catch (err) { reject(err); }
        });
    }
    public async setOptionsAsync(obj?: any) : Promise<Options> {
        let fnToByte = function (num) { return num < 0 ? Math.abs(num) | 0x80 : Math.abs(num) || 0; }
        
        let payload = [0, 0, 0,
            fnToByte(sys.equipment.tempSensors.getCalibration('water2')),
            fnToByte(sys.equipment.tempSensors.getCalibration('water1')),
            fnToByte(sys.equipment.tempSensors.getCalibration('solar1')),
            fnToByte(sys.equipment.tempSensors.getCalibration('air')),
            fnToByte(0), // This might actually be a secondary air sensor but it is not ever set on a shared body.
            fnToByte(sys.equipment.tempSensors.getCalibration('solar2')), // 8
            // The following contains the bytes for water3&4 and solar3&4.  The reason for 5 bytes may be that
            // the software jumps over a fake airTemp byte in the sensor arrays.
            fnToByte(sys.equipment.tempSensors.getCalibration('solar3')),
            fnToByte(sys.equipment.tempSensors.getCalibration('solar4')),
            fnToByte(sys.equipment.tempSensors.getCalibration('water3')),
            fnToByte(sys.equipment.tempSensors.getCalibration('water4')), 0,
            0x10 | (sys.general.options.clockMode === 24 ? 0x40 : 0x00) | (sys.general.options.adjustDST ? 0x80 : 0x00) | (sys.general.options.clockSource === 'internet' ? 0x20 : 0x00), // 14
            0, 0,
            sys.general.options.clockSource === 'internet' ? 1 : 0, // 17
            3, 0, 0,
            sys.bodies.getItemById(1, false).setPoint || 100, // 21
            sys.bodies.getItemById(3, false).setPoint || 100,
            sys.bodies.getItemById(2, false).setPoint || 100,
            sys.bodies.getItemById(4, false).setPoint || 100,
            sys.bodies.getItemById(1, false).heatMode || 0,
            sys.bodies.getItemById(2, false).heatMode || 0,
            sys.bodies.getItemById(3, false).heatMode || 0,
            sys.bodies.getItemById(4, false).heatMode || 0,
            15,
            sys.general.options.pumpDelay ? 1 : 0,  // 30
            sys.general.options.cooldownDelay ? 1 : 0,
            0, 0, 100, 0, 0, 0, 0, 
            sys.general.options.manualPriority ? 1 : 0, // 39
            sys.general.options.manualHeat ? 1 : 0];
        let arr = [];
        try {
            if (typeof obj.waterTempAdj1 != 'undefined' && obj.waterTempAdj1 !== sys.equipment.tempSensors.getCalibration('water1')) {
                payload[2] = 1;
                payload[4] = fnToByte(parseInt(obj.waterTempAdj1, 10)) || 0;
                await new Promise<void>((resolve, reject) => {
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: payload,
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.equipment.tempSensors.setCalibration('water1', parseInt(obj.waterTempAdj1, 10)); resolve(); }
                        }
                    });
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.waterTempAdj2 != 'undefined' && obj.waterTempAdj2 !== sys.equipment.tempSensors.getCalibration('water2')) {
                await new Promise<void>((resolve, reject) => {
                    payload[2] = 4;
                    payload[7] = fnToByte(parseInt(obj.waterTempAdj2, 10)) || 0;
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: payload,
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.equipment.tempSensors.setCalibration('water2', parseInt(obj.waterTempAdj2, 10)); resolve(); }
                        }
                    });
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.waterTempAdj3 != 'undefined' && obj.waterTempAdj3 !== sys.equipment.tempSensors.getCalibration('water3')) {
                await new Promise<void>((resolve, reject) => {
                    payload[2] = 6;
                    payload[9] = fnToByte(parseInt(obj.waterTempAdj3, 10)) || 0;
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: payload,
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.equipment.tempSensors.setCalibration('water3', parseInt(obj.waterTempAdj3, 10)); resolve(); }
                        }
                    });
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.waterTempAdj4 != 'undefined' && obj.waterTempAdj4 !== sys.equipment.tempSensors.getCalibration('water4')) {
                await new Promise<void>((resolve, reject) => {
                    payload[2] = 8;
                    payload[11] = fnToByte(parseInt(obj.waterTempAdj4, 10)) || 0;
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        response: IntelliCenterBoard.getAckResponse(168),
                        payload: payload,
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.equipment.tempSensors.setCalibration('water4', parseInt(obj.waterTempAdj3, 10)); resolve(); }
                        }
                    });
                    conn.queueSendMessage(out);
                });
            }

            if (typeof obj.solarTempAdj1 != 'undefined' && obj.solarTempAdj1 !== sys.equipment.tempSensors.getCalibration('solar1')) {
                await new Promise<void>((resolve, reject) => {
                    payload[2] = 2;
                    payload[5] = fnToByte(parseInt(obj.solarTempAdj1, 10)) || 0;
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: payload,
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.equipment.tempSensors.setCalibration('solar1', parseInt(obj.solarTempAdj1, 10)); resolve(); }
                        }
                    });
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.solarTempAdj2 != 'undefined' && obj.solarTempAdj2 !== sys.equipment.tempSensors.getCalibration('solar2')) {
                await new Promise<void>((resolve, reject) => {
                    payload[2] = 5;
                    payload[8] = fnToByte(parseInt(obj.solarTempAdj2, 10)) || 0;
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: payload,
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.equipment.tempSensors.setCalibration('solar2', parseInt(obj.solarTempAdj2, 10)); resolve(); }
                        }
                    });
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.solarTempAdj3 != 'undefined' && obj.solarTempAdj3 !== sys.equipment.tempSensors.getCalibration('solar3')) {
                await new Promise<void>((resolve, reject) => {
                    payload[2] = 7;
                    payload[10] = fnToByte(parseInt(obj.solarTempAdj3, 10)) || 0;
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: payload,
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.equipment.tempSensors.setCalibration('solar3', parseInt(obj.solarTempAdj3, 10)); resolve(); }
                        }
                    });
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.solarTempAdj4 != 'undefined' && obj.solarTempAdj4 !== sys.equipment.tempSensors.getCalibration('solar4')) {
                await new Promise<void>((resolve, reject) => {
                    payload[2] = 8;
                    payload[12] = fnToByte(parseInt(obj.solarTempAdj4, 10)) || 0;
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: payload,
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.equipment.tempSensors.setCalibration('solar3', parseInt(obj.solarTempAdj3, 10)); resolve(); }
                        }
                    });
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.airTempAdj != 'undefined' && obj.airTempAdj !== sys.equipment.tempSensors.getCalibration('air')) {
                await new Promise<void>((resolve, reject) => {
                    payload[2] = 3;
                    payload[6] = fnToByte(parseInt(obj.airTempAdj, 10)) || 0;
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        response: IntelliCenterBoard.getAckResponse(168),
                        payload: payload,
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.equipment.tempSensors.setCalibration('air', parseInt(obj.airTempAdj, 10)); resolve(); }
                        }
                    });
                    conn.queueSendMessage(out);
                });
            }
            if ((typeof obj.clockMode !== 'undefined' && obj.clockMode !== sys.general.options.clockMode) ||
                (typeof obj.adjustDST !== 'undefined' && obj.adjustDST !== sys.general.options.adjustDST)) {
                await new Promise<void>(function (resolve, reject) {
                    let byte = 0x30; // These bits are always set.
                    if (typeof obj.clockMode === 'undefined') byte |= sys.general.options.clockMode === 24 ? 0x40 : 0x00;
                    else byte |= obj.clockMode === 24 ? 0x40 : 0x00;
                    if (typeof obj.adjustDST === 'undefined') byte |= sys.general.options.adjustDST ? 0x80 : 0x00;
                    else byte |= obj.adjustDST ? 0x80 : 0x00;
                    payload[2] = 11;
                    payload[14] = byte;
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        response: IntelliCenterBoard.getAckResponse(168),
                        payload: payload,
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else {
                                if (typeof obj.clockMode !== 'undefined') sys.general.options.clockMode = obj.clockMode === 24 ? 24 : 12;
                                if (typeof obj.adjustDST !== 'undefined' || sys.general.options.clockSource !== 'server') sys.general.options.adjustDST = obj.adjustDST ? true : false;
                                resolve();
                            }
                        }
                    });
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.clockSource != 'undefined' && obj.clockSource !== sys.general.options.clockSource) {
                await new Promise<void>((resolve, reject) => {
                    payload[2] = 11;
                    payload[17] = obj.clockSource === 'internet' ? 0x01 : 0x00;
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: payload,
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else {
                                if (obj.clockSource === 'internet' || obj.clockSource === 'server' || obj.clockSource === 'manual')
                                    sys.general.options.clockSource = obj.clockSource;
                                sys.board.system.setTZ();
                                resolve();
                            }
                        }
                    });
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.pumpDelay !== 'undefined' && obj.pumpDelay !== sys.general.options.pumpDelay) {
                await new Promise<void>((resolve, reject) => {
                    payload[2] = 27;
                    payload[30] = obj.pumpDelay ? 0x01 : 0x00;
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        response: IntelliCenterBoard.getAckResponse(168),
                        payload: payload,
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.general.options.pumpDelay = obj.pumpDelay ? true : false; resolve(); }
                        }
                    });
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.cooldownDelay !== 'undefined' && obj.cooldownDelay !== sys.general.options.cooldownDelay) {
                await new Promise<void>((resolve, reject) => {
                    payload[2] = 28;
                    payload[31] = obj.cooldownDelay ? 0x01 : 0x00;
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: payload,
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.general.options.cooldownDelay = obj.cooldownDelay ? true : false; resolve(); }
                        }
                    });
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.manualPriority !== 'undefined' && obj.manualPriority !== sys.general.options.manualPriority) {
                await new Promise<void>((resolve, reject) => {
                    payload[2] = 36;
                    payload[39] = obj.manualPriority ? 0x01 : 0x00;
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: payload,
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.general.options.manualPriority = obj.manualPriority ? true : false; resolve(); }
                        }
                    });
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.manualHeat !== 'undefined' && obj.manualHeat !== sys.general.options.manualHeat) {
                await new Promise<void>((resolve, reject) => {
                    payload[2] = 37;
                    payload[40] = obj.manualHeat ? 0x01 : 0x00;
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: payload,
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.general.options.manualHeat = obj.manualHeat ? true : false; resolve(); }
                        }
                    });
                    conn.queueSendMessage(out);
                });
            }
            return Promise.resolve(sys.general.options);
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setLocationAsync(obj?: any): Promise<Location> {
        try {
            let arr = [];
            if (typeof obj.address === 'string' && obj.address !== sys.general.location.address) {
                await new Promise<void>((resolve, reject) => {
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: [12, 0, 1],
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.general.location.address = obj.address; resolve(); }
                        }
                    });
                    out.appendPayloadString(obj.address, 32);
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.country === 'string' && obj.country !== sys.general.location.country) {
                await new Promise<void>((resolve, reject) => {
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: [12, 0, 8],
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.general.location.country = obj.country; resolve(); }
                        }
                    });
                    out.appendPayloadString(obj.country, 32);
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.city === 'string' && obj.city !== sys.general.location.city) {
                await new Promise<void>((resolve, reject) => {
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: [12, 0, 9],
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.general.location.city = obj.city; resolve(); }
                        }
                    });
                    out.appendPayloadString(obj.city, 32);
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.state === 'string' && obj.state !== sys.general.location.state) {
                await new Promise<void>((resolve, reject) => {
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: [12, 0, 10],
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.general.location.state = obj.state; resolve(); }
                        }
                    });
                    out.appendPayloadString(obj.state, 32);
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.zip === 'string' && obj.zip !== sys.general.location.zip) {
                await new Promise<void>((resolve, reject) => {
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: [12, 0, 7],
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.general.location.zip = obj.zip; resolve(); }
                        }
                    });
                    out.appendPayloadString(obj.zip, 6);
                    conn.queueSendMessage(out);
                });
            }

            if (typeof obj.latitude === 'number' && obj.latitude !== sys.general.location.latitude) {
                await new Promise<void>((resolve, reject) => {
                    let lat = Math.round(Math.abs(obj.latitude) * 100);
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: [12, 0, 11,
                            Math.floor(lat / 256),
                            lat - Math.floor(lat / 256)],
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.general.location.longitude = lat / 100; resolve(); }
                        }
                    });
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.longitude === 'number' && obj.longitude !== sys.general.location.longitude) {
                await new Promise<void>((resolve, reject) => {
                    let lon = Math.round(Math.abs(obj.longitude) * 100);
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: [12, 0, 12,
                            Math.floor(lon / 256),
                            lon - Math.floor(lon / 256)],
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.general.location.longitude = -(lon / 100); resolve(); }
                        }
                    });
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.timeZone === 'number' && obj.timeZone !== sys.general.location.timeZone) {
                await new Promise<void>((resolve, reject) => {
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: [12, 0, 13, parseInt(obj.timeZone, 10)],
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.general.location.timeZone = parseInt(obj.timeZone, 10); resolve(); }
                        }
                    });
                    conn.queueSendMessage(out);
                });
            }
            return Promise.resolve(sys.general.location);
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setOwnerAsync(obj?: any): Promise<Owner> {
        let arr = [];
        try {
            if (typeof obj.name === 'string' && obj.name !== sys.general.owner.name) {
                await new Promise<void>((resolve, reject) => {
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: [12, 0, 2],
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.general.owner.name = obj.name; resolve(); }
                        }
                    });
                    out.appendPayloadString(obj.name, 16);
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.email === 'string' && obj.email !== sys.general.owner.email) {
                await new Promise<void>((resolve, reject) => {
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: [12, 0, 3],
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.general.owner.email = obj.email; resolve(); }
                        }
                    });
                    out.appendPayloadString(obj.email, 32);
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.email2 === 'string' && obj.email2 !== sys.general.owner.email2) {
                await new Promise<void>((resolve, reject) => {
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        response: IntelliCenterBoard.getAckResponse(168),
                        payload: [12, 0, 4],
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.general.owner.email2 = obj.email2; resolve(); }
                        }
                    });
                    out.appendPayloadString(obj.email2, 32);
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.phone2 === 'string' && obj.phone2 !== sys.general.owner.phone2) {
                await new Promise<void>((resolve, reject) => {
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: [12, 0, 6],
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.general.owner.phone2 = obj.phone2; resolve(); }
                        }
                    });
                    out.appendPayloadString(obj.phone2, 16);
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.phone === 'string' && obj.phone !== sys.general.owner.phone) {
                await new Promise<void>((resolve, reject) => {
                    let out = Outbound.create({
                        action: 168,
                        retries: 5,
                        payload: [12, 0, 5],
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { sys.general.owner.phone = obj.phone; resolve(); }
                        }
                    });
                    out.appendPayloadString(obj.phone, 16);
                    conn.queueSendMessage(out);
                });
            }
            return Promise.resolve(sys.general.owner);
        }
        catch (err) { return Promise.reject(err); }
    }
}
class IntelliCenterCircuitCommands extends CircuitCommands {
    declare board: IntelliCenterBoard;
    // Need to override this as IntelliCenter manages all the egg timers for all circuit types.
    public async checkEggTimerExpirationAsync() {
        try {
            for (let i = 0; i < sys.circuits.length; i++) {
                let c = sys.circuits.getItemByIndex(i);
                let cstate = state.circuits.getItemByIndex(i);
                if (!cstate.isActive || !cstate.isOn) continue;
                if (c.master === 1) {
                    await ncp.circuits.checkCircuitEggTimerExpirationAsync(cstate);
                }
            }
        } catch (err) { logger.error(`checkEggTimerExpiration: Error synchronizing circuit relays ${err.message}`); }
    }
    public async setCircuitAsync(data: any): Promise<ICircuit> {
        let id = parseInt(data.id, 10);
        let circuit = sys.circuits.getItemById(id, false);
        // Alright check to see if we are adding a nixie circuit.
        if (id === -1 || circuit.master !== 0) 
            return await super.setCircuitAsync(data);
        return new Promise<ICircuit>((resolve, reject) => {
            if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Circuit Id has not been defined', data.id, 'Circuit'));
            if (!sys.board.equipmentIds.circuits.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Circuit Id ${id}: is out of range.`, id, 'Circuit'));
            let eggTimer = Math.min(typeof data.eggTimer !== 'undefined' ? parseInt(data.eggTimer, 10) : circuit.eggTimer, 1440);
            if (isNaN(eggTimer)) eggTimer = circuit.eggTimer;
            if (data.dontStop === true) eggTimer = 1440;
            data.dontStop = (eggTimer === 1440);
            let eggHrs = Math.floor(eggTimer / 60);
            let eggMins = eggTimer - (eggHrs * 60);
            let type = typeof data.type !== 'undefined' ? parseInt(data.type, 10) : circuit.type;
            let theme = typeof data.lightingTheme !== 'undefined' ? data.lightingTheme : circuit.lightingTheme;
            if (circuit.type === 9) theme = typeof data.level !== 'undefined' ? data.level : circuit.level;
            if (typeof theme === 'undefined') theme = 0;
            let out = Outbound.create({
                action: 168,
                payload: [1, 0, id - 1,
                    type,
                    (typeof data.freeze !== 'undefined' ? utils.makeBool(data.freeze) : circuit.freeze) ? 1 : 0,
                    (typeof data.showInFeatures !== 'undefined' ? utils.makeBool(data.showInFeatures) : circuit.showInFeatures) ? 1 : 0,
                    theme,
                    eggHrs, eggMins, data.dontStop ? 1 : 0],
                onComplete: (err, msg) => {
                    if (err) reject(err);
                    else {
                        let scircuit = state.circuits.getItemById(circuit.id, true);
                        circuit.eggTimer = eggTimer;
                        circuit.dontStop = data.dontStop;
                        circuit.freeze = (typeof data.freeze !== 'undefined' ? utils.makeBool(data.freeze) : circuit.freeze);
                        circuit.showInFeatures = (typeof data.showInFeatures !== 'undefined' ? utils.makeBool(data.showInFeatures) : circuit.showInFeatures);
                        if (type === 9) scircuit.level = circuit.level = theme;
                        else {
                            let t = sys.board.valueMaps.circuitFunctions.transform(type);
                            if (t.isLight == true) scircuit.lightingTheme = circuit.lightingTheme = theme;
                            else {
                                scircuit.lightingTheme = undefined;
                                circuit.lightingTheme = 0;
                            }
                        }
                        scircuit.name = circuit.name = typeof data.name !== 'undefined' ? data.name.toString().substring(0, 16) : circuit.name;
                        scircuit.type = circuit.type = type;
                        scircuit.isActive = circuit.isActive = true;
                        circuit.master = 0;
                        resolve(circuit);
                    }
                }
            });
            out.appendPayloadString(typeof data.name !== 'undefined' ? data.name.toString() : circuit.name, 16);
            out.retries = 5;
            out.response = IntelliCenterBoard.getAckResponse(168);
            conn.queueSendMessage(out);
        });
    }
    public async setCircuitGroupAsync(obj: any): Promise<CircuitGroup> {
        // When we save circuit groups we are going to reorder the whole mess.  IntelliCenter does some goofy
        // gap filling strategy where the circuits are added into the first empty slot.  This makes for a
        // strange configuration with empty slots.  It even causes the mobile app to crash.

        let group: CircuitGroup = null;
        let sgroup: CircuitGroupState = null;
        let id = typeof obj.id !== 'undefined' ? parseInt(obj.id, 10) : -1;
        let type = 0;
        let isAdd = false;
        if (id <= 0) {
            // We are adding a circuit group so we need to get the next equipment id.  For circuit groups and light groups, they share ids in IntelliCenter.
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
        try {
            await new Promise<void>((resolve, reject) => {
                let eggTimer = (typeof obj.eggTimer !== 'undefined') ? parseInt(obj.eggTimer, 10) : group.eggTimer;
                if (isNaN(eggTimer)) eggTimer = 720;
                eggTimer = Math.max(Math.min(1440, eggTimer), 1);
                if (obj.dontStop === true) eggTimer = 1440;
                let eggHours = Math.floor(eggTimer / 60);
                let eggMins = eggTimer - (eggHours * 60);
                obj.dontStop = (eggTimer === 1440);

                let out = Outbound.create({
                    action: 168,
                    payload: [6, 0, id - sys.board.equipmentIds.circuitGroups.start, 2, 0, 0],  // The last byte here should be don't stop but I believe this to be a current bug.
                    response: IntelliCenterBoard.getAckResponse(168),
                    retries: 5,
                    onComplete: (err, msg) => {
                        if (err) reject(err);
                        else {
                            // sgroup.eggTimer = group.eggTimer = eggTimer;
                            group.eggTimer = eggTimer;
                            group.dontStop = obj.dontStop;
                            sgroup.type = group.type = 2;
                            sgroup.isActive = group.isActive = true;
                            if (typeof obj.showInFeatures !== 'undefined') sgroup.showInFeatures = group.showInFeatures = utils.makeBool(obj.showInFeatures);
                            if (typeof obj.circuits !== 'undefined') {
                                for (let i = 0; i < obj.circuits.length; i++) {
                                    let c = group.circuits.getItemByIndex(i, true);
                                    c.id = i + 1;
                                    c.circuit = obj.circuits[i].circuit;
                                }
                                for (let i = obj.circuits.length; i < group.circuits.length; i++)
                                    group.circuits.removeItemByIndex(i);
                            }
                            resolve();
                        }
                    }
                });
                // Add in all the info for the circuits.
                if (typeof obj.circuits === 'undefined')
                    for (let i = 0; i < 16; i++) {
                        let c = group.circuits.getItemByIndex(i, false);
                        out.payload.push(c.circuit ? c.circuit - 1 : 255);
                    }
                else {
                    for (let i = 0; i < 16; i++)
                        (i < obj.circuits.length) ? out.payload.push(obj.circuits[i].circuit - 1) : out.payload.push(255);
                }
                for (let i = 0; i < 16; i++) out.payload.push(0);
                out.payload.push(eggHours);
                out.payload.push(eggMins);
                conn.queueSendMessage(out);
            });
            await new Promise<void>((resolve, reject) => {
                let out = Outbound.create({
                    action: 168,
                    payload: [6, 1, id - sys.board.equipmentIds.circuitGroups.start],
                    response: IntelliCenterBoard.getAckResponse(168),
                    retries: 3,
                    onComplete: (err, msg) => {
                        if (err) reject(err);
                        else {
                            if (typeof obj.name !== 'undefined') sgroup.name = group.name = obj.name.toString().substring(0, 16);
                            resolve();
                        }
                    }
                });
                for (let i = 0; i < 16; i++) out.payload.push(255);
                out.appendPayloadString(typeof obj.name !== 'undefined' ? obj.name : group.name, 16);
                conn.queueSendMessage(out);
            });
            await new Promise<void>((resolve, reject) => {
                let out = Outbound.create({
                    action: 168,
                    payload: [6, 2, id - sys.board.equipmentIds.circuitGroups.start],
                    response: IntelliCenterBoard.getAckResponse(168),
                    retries: 3,
                    onComplete: (err, msg) => {
                        if (err) reject(err);
                        else {
                            if (typeof obj.circuits !== 'undefined') {
                                for (let i = 0; i < obj.circuits.length; i++) {
                                    let c = group.circuits.getItemByIndex(i);
                                    c.desiredState = obj.circuits[i].desiredState || 1;
                                }
                            }
                            resolve();
                        }
                    }
                });
                for (let i = 0; i < 16; i++) out.payload.push(0); // Push the 0s for the color
                // Add in the desired State.
                if (typeof obj.circuits === 'undefined')
                    for (let i = 0; i < 16; i++) {
                        let c = group.circuits.getItemByIndex(i, false);
                        typeof c.desiredState !== 'undefined' ? out.payload.push(c.desiredState) : out.payload.push(255);
                    }
                else {
                    for (let i = 0; i < 16; i++)
                        (i < obj.circuits.length) ? out.payload.push(obj.circuits[i].desiredState || 1) : out.payload.push(255);
                }
                conn.queueSendMessage(out);
            });
            return Promise.resolve(group);
        }
        catch (err) { return Promise.reject(err); }
    }
    public async deleteCircuitGroupAsync(obj: any): Promise<CircuitGroup> {
        let group: CircuitGroup = null;
        let id = parseInt(obj.id, 10);
        if (isNaN(id) || !sys.board.equipmentIds.circuitGroups.isInRange(id)) return Promise.reject(new EquipmentNotFoundError(`Invalid group id: ${obj.id}`, 'CircuitGroup'));
        group = sys.circuitGroups.getItemById(id);
        try {
            await new Promise<void>((resolve, reject) => {
                let out = Outbound.create({
                    action: 168,
                    payload: [6, 0, id - sys.board.equipmentIds.circuitGroups.start, 0, 0, 0],
                    response: IntelliCenterBoard.getAckResponse(168),
                    retries: 5,
                    onComplete: (err, msg) => {
                        if (err) reject(err);
                        else {
                            let gstate = state.circuitGroups.getItemById(id);
                            gstate.isActive = false;
                            gstate.emitEquipmentChange();
                            sys.circuitGroups.removeItemById(id);
                            state.circuitGroups.removeItemById(id);
                            resolve();
                        }
                    }
                });
                for (let i = 0; i < 16; i++) i < group.circuits.length ? out.payload.push(group.circuits.getItemByIndex(i).circuit - 1) : out.payload.push(255);
                for (let i = 0; i < 16; i++) out.payload.push(0);
                out.payload.push(12);
                out.payload.push(0);
                conn.queueSendMessage(out);
            });
            await new Promise<void>((resolve, reject) => {
                let out = Outbound.create({
                    action: 168,
                    payload: [6, 1, id - sys.board.equipmentIds.circuitGroups.start],
                    response: IntelliCenterBoard.getAckResponse(168),
                    retries: 3,
                    onComplete: (err, msg) => {
                        if (err) reject(err);
                        else {
                            resolve();
                        }
                    }
                });
                for (let i = 0; i < 16; i++) out.payload.push(255);
                out.appendPayloadString(group.name || '', 16);
                conn.queueSendMessage(out);
            });
            await new Promise<void>((resolve, reject) => {
                let out = Outbound.create({
                    action: 168,
                    payload: [6, 2, id - sys.board.equipmentIds.circuitGroups.start],
                    response: IntelliCenterBoard.getAckResponse(168),
                    retries: 3,
                    onComplete: (err, msg) => {
                        if (err) reject(err);
                        else { resolve(); }
                    }
                });
                for (let i = 0; i < 16; i++) out.payload.push(0);
                conn.queueSendMessage(out);
            });
            return new Promise<CircuitGroup>((resolve, reject) => { resolve(group) });
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setLightGroupAsync(obj: any): Promise<LightGroup> {
        let group: LightGroup = null;
        let sgroup: LightGroupState = null;
        let id = typeof obj.id !== 'undefined' ? parseInt(obj.id, 10) : -1;
        if (id <= 0) {
            // We are adding a light group.
            let range = sys.board.equipmentIds.circuitGroups;
            for (let i = range.start; i <= range.end; i++) {
                if (!sys.lightGroups.find(elem => elem.id === i) && !sys.circuitGroups.find(elem => elem.id === i)) {
                    id = i;
                    break;
                }
            }
            group = sys.lightGroups.getItemById(id, true);
        }
        else {
            group = sys.lightGroups.getItemById(id, false);
        }
        if (typeof id === 'undefined') return Promise.reject(new Error(`Max light group ids exceeded`));
        if (isNaN(id) || !sys.board.equipmentIds.circuitGroups.isInRange(id)) return Promise.reject(new Error(`Invalid light group id: ${obj.id}`));
        try {
            await new Promise<void>((resolve, reject) => {
                let eggTimer = (typeof obj.eggTimer !== 'undefined') ? parseInt(obj.eggTimer, 10) : group.eggTimer;
                if (isNaN(eggTimer)) eggTimer = 720;
                eggTimer = Math.max(Math.min(1440, eggTimer), 1);
                if (obj.dontStop === true) eggTimer = 1440;
                let eggHours = Math.floor(eggTimer / 60);
                let eggMins = eggTimer - (eggHours * 60);
                obj.dontStop = (eggTimer === 1440);
                sgroup = state.lightGroups.getItemById(id, true);
                let theme = typeof obj.lightingTheme === 'undefined' ? group.lightingTheme || 0 : obj.lightingTheme;
                let out = Outbound.create({
                    action: 168,
                    payload: [6, 0, id - sys.board.equipmentIds.circuitGroups.start, 1, (theme << 2) + 1, 0], // The last byte here should be don't stop but I believe this to be a current bug.
                    response: IntelliCenterBoard.getAckResponse(168),
                    retries: 5,
                    onComplete: (err, msg) => {
                        if (err) reject(err);
                        else {
                            sgroup.type = group.type = 1;
                            sgroup.lightingTheme = group.lightingTheme = theme;
                            group.eggTimer = eggTimer;
                            group.dontStop = obj.dontStop;
                            if (typeof obj.circuits !== 'undefined') {
                                for (let i = 0; i < obj.circuits.length; i++) {
                                    let c = group.circuits.getItemByIndex(i, true, { id: i + 1 });
                                    c.circuit = obj.circuits[i].circuit;
                                    c.swimDelay = obj.circuits[i].swimDelay;
                                    if(typeof obj.circuits[i].color !== 'undefined') c.color = obj.circuits[i].color;
                                }
                                group.circuits.length = obj.circuits.length;
                            }
                            resolve();
                        }
                    }
                });
                // Add in all the info for the circuits.
                if (typeof obj.circuits === 'undefined') {
                    // Circuits
                    for (let i = 0; i < 16; i++) {
                        let c = group.circuits.getItemByIndex(i, false);
                        out.payload.push(c.circuit ? c.circuit - 1 : 255);
                    }
                    // Swim Delay
                    for (let i = 0; i < 16; i++) {
                        let c = group.circuits.getItemByIndex(i, false);
                        out.payload.push(c.circuit ? c.swimDelay : 255);
                    }
                }
                else {
                    // Circuits
                    for (let i = 0; i < 16; i++) {
                        if (i < obj.circuits.length) {
                            let c = parseInt(obj.circuits[i].circuit, 10);
                            out.payload.push(!isNaN(c) ? c - 1 : 255);
                        }
                        else out.payload.push(255);
                    }
                    // Swim Delay
                    for (let i = 0; i < 16; i++) {
                        if (i < obj.circuits.length) {
                            let delay = parseInt(obj.circuits[i].swimDelay, 10);
                            out.payload.push(!isNaN(delay) ? delay : 10);
                        }
                        else out.payload.push(0);
                    }
                }
                out.payload.push(eggHours);
                out.payload.push(eggMins);
                conn.queueSendMessage(out);
            });
            await new Promise<void>((resolve, reject) => {
                let out = Outbound.create({
                    action: 168,
                    payload: [6, 1, id - sys.board.equipmentIds.circuitGroups.start],
                    response: IntelliCenterBoard.getAckResponse(168),
                    retries: 3,
                    onComplete: (err, msg) => {
                        if (err) reject(err);
                        else {
                            if (typeof obj.name !== 'undefined') sgroup.name = group.name = obj.name.toString().substring(0, 16);
                            resolve();
                        }
                    }
                });
                for (let i = 0; i < 16; i++) out.payload.push(255);
                out.payload[3] = 10;
                out.appendPayloadString(typeof obj.name !== 'undefined' ? obj.name : group.name, 16);
                conn.queueSendMessage(out);
            });
            await new Promise<void>((resolve, reject) => {
                let out = Outbound.create({
                    action: 168,
                    payload: [6, 2, id - sys.board.equipmentIds.circuitGroups.start],
                    response: IntelliCenterBoard.getAckResponse(168),
                    retries: 3,
                    onComplete: (err, msg) => {
                        if (err) reject(err);
                        else {
                            if (typeof obj.circuits !== 'undefined') {
                                for (let i = 0; i < obj.circuits.length; i++) {
                                    let circ = group.circuits.getItemByIndex(i, true);
                                    let color = 0;
                                    if (i < obj.circuits.length) {
                                        color = parseInt(obj.circuits[i].color, 10);
                                        if (isNaN(color)) { color = circ.color || 0; }
                                        //console.log(`Setting Color: {0}`, color);
                                    }
                                    circ.color = color;
                                }
                            }
                            resolve();
                        }
                    }
                });
                if (typeof obj.circuits !== 'undefined') {
                    for (let i = 0; i < 16; i++) {
                        let color = 0;
                        if (i < obj.circuits.length) {
                            color = parseInt(obj.circuits[i].color, 10);
                            if (isNaN(color)) {
                                color = group.circuits.getItemByIndex(i, false).color;
                            }
                        }
                        out.payload.push(color);
                    }
                }
                else {
                    for (let i = 0; i < 16; i++) {
                        out.payload.push(group.circuits.getItemByIndex(i, false).color);
                    }
                }
                out.appendPayloadString(obj.name || group.name, 16);
                conn.queueSendMessage(out);
            });
            return Promise.resolve(group);
        }
        catch (err) { return Promise.reject(err); }
    }
    public async deleteLightGroupAsync(obj: any): Promise<LightGroup> {
        let group: LightGroup = null;
        let id = parseInt(obj.id, 10);
        if (isNaN(id) || !sys.board.equipmentIds.circuitGroups.isInRange(id)) return Promise.reject(new Error(`Invalid light group id: ${obj.id}`));
        group = sys.lightGroups.getItemById(id);
        try {
            await new Promise<void>((resolve, reject) => {
                let out = Outbound.create({
                    action: 168,
                    payload: [6, 0, id - sys.board.equipmentIds.circuitGroups.start, 0, 0, 0],
                    response: IntelliCenterBoard.getAckResponse(168),
                    retries: 5,
                    onComplete: (err, msg) => {
                        if (err) reject(err);
                        else {
                            let gstate = state.lightGroups.getItemById(id);
                            gstate.isActive = false;
                            gstate.emitEquipmentChange();
                            sys.lightGroups.removeItemById(id);
                            state.lightGroups.removeItemById(id);
                            resolve();
                        }
                    }
                });
                for (let i = 0; i < 16; i++) i < group.circuits.length ? out.payload.push(group.circuits.getItemByIndex(i).circuit - 1) : out.payload.push(255);
                for (let i = 0; i < 16; i++) out.payload.push(0);
                out.payload.push(12);
                out.payload.push(0);
                conn.queueSendMessage(out);
            });
            await new Promise<void>((resolve, reject) => {
                let out = Outbound.create({
                    action: 168,
                    retries: 5,
                    response: IntelliCenterBoard.getAckResponse(168),
                    payload: [6, 1, id - sys.board.equipmentIds.circuitGroups.start],
                    onComplete: (err, msg) => {
                        if (err) reject(err);
                        else {
                            resolve();
                        }
                    }
                });
                for (let i = 0; i < 16; i++) out.payload.push(255);
                out.appendPayloadString(group.name);
                conn.queueSendMessage(out);
            });
            await new Promise<void>((resolve, reject) => {
                let out = Outbound.create({
                    action: 168,
                    retries: 5,
                    response: IntelliCenterBoard.getAckResponse(168),
                    payload: [6, 2, id - sys.board.equipmentIds.circuitGroups.start],
                    onComplete: (err, msg) => {
                        if (err) reject(err);
                        else { resolve(); }
                    }
                });
                for (let i = 0; i < 16; i++) out.payload.push(0);
                conn.queueSendMessage(out);
            });
            return Promise.resolve(group);
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setLightGroupAttribsAsync(group: LightGroup): Promise<LightGroup> {
        let grp = sys.lightGroups.getItemById(group.id);
        try {
            let msgs = this.createLightGroupMessages(grp);
            // Set all the info in the messages.
            for (let i = 0; i < 16; i++) {
                let circuit = i < group.circuits.length ? group.circuits[i] : null;
                if (circuit) {
                    circuit.circuit = parseInt(circuit.circuit, 10);
                    circuit.swimDelay = parseInt(circuit.swimDelay, 10) || 0;
                    circuit.color = parseInt(circuit.color, 10) || 0;
                    if (isNaN(circuit.circuit)) return Promise.reject(new InvalidEquipmentDataError(`Circuit id is not valid ${circuit.circuit}`, 'lightGroup', circuit));
                }
                msgs.msg0.payload[i + 6] = circuit ? circuit.circuit - 1 : 255;
                msgs.msg0.payload[i + 22] = circuit ? circuit.swimDelay || 0 : 0;
                msgs.msg1.payload[i + 3] = circuit ? circuit.color || 0 : 255;
                msgs.msg2.payload[i + 3] = circuit ? circuit.color || 0 : 0;
            }
            await new Promise<void>((resolve, reject) => {
                msgs.msg0.response = IntelliCenterBoard.getAckResponse(168);
                msgs.msg0.retries = 5;
                msgs.msg0.onComplete = (err) => {
                    if (!err) {
                        for (let i = 0; i < group.circuits.length; i++) {
                            let c = group.circuits[i];
                            let circuit = grp.circuits.getItemByIndex(i, true);
                            circuit.circuit = parseInt(c.circuit, 10);
                            circuit.swimDelay = parseInt(c.swimDelay, 10);
                            circuit.color = parseInt(c.color, 10);
                            circuit.position = i + 1;
                            //grp.circuits.add({ id: i, circuit: circuit.circuit, color: circuit.color, position: i, swimDelay: circuit.swimDelay });
                        }
                        // Trim anything that was removed.
                        grp.circuits.length = group.circuits.length;
                        resolve();
                    }
                    else reject(err);
                }
                conn.queueSendMessage(msgs.msg0);
            });
            await new Promise<void>((resolve, reject) => {
                msgs.msg1.response = IntelliCenterBoard.getAckResponse(168);
                msgs.msg1.retries = 5;
                msgs.msg1.onComplete = (err) => {
                    if (!err) { resolve(); }
                    else reject(err);
                }
                conn.queueSendMessage(msgs.msg1);
            });
            await new Promise<void>((resolve, reject) => {
                msgs.msg2.response = IntelliCenterBoard.getAckResponse(168);
                msgs.msg2.retries = 5;
                msgs.msg2.onComplete = (err) => {
                    if (!err) { resolve(); }
                    else reject(err);
                }
                conn.queueSendMessage(msgs.msg2);
            });
            return Promise.resolve(grp);
        }
        catch (err) { return Promise.reject(err); }
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
            switch (cmd.name) {
                case 'colorset':
                    await this.sequenceLightGroupAsync(id, 'colorset');
                    break;
                case 'colorswim':
                    await this.sequenceLightGroupAsync(id, 'colorswim');
                    break;
                case 'colorhold':
                    await this.setLightGroupThemeAsync(id, 12);
                    break;
                case 'colorrecall':
                    await this.setLightGroupThemeAsync(id, 13);
                    break;
                case 'lightthumper':
                    break;
            }
            sgrp.action = 0;
            sgrp.emitEquipmentChange();
            return sgrp;
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
            slight.emitEquipmentChange();
            switch (cmd.name) {
                case 'colorhold':
                    await this.setLightThemeAsync(id, 12);
                    break;
                case 'colorrecall':
                    await this.setLightThemeAsync(id, 13);
                    break;
                case 'lightthumper':
                    // I do not know how to trigger the thumper.
                    break;
            }
            slight.action = 0;
            slight.emitEquipmentChange();
            return slight;
        }
        catch (err) { return Promise.reject(`Error runLightCommandAsync ${err.message}`); }
    }
    public async sequenceLightGroupAsync(id: number, operation: string): Promise<LightGroupState> {
        let sgroup = state.lightGroups.getItemById(id);
        try {
            if (!sgroup.isActive) return Promise.reject(new InvalidEquipmentIdError(`An active light group could not be found with id ${id}`, id, 'lightGroup'));
            let cmd = sys.board.valueMaps.lightGroupCommands.findItem(operation.toLowerCase());
            let ndx = id - sys.board.equipmentIds.circuitGroups.start;
            let byteNdx = Math.floor(ndx / 4);
            let bitNdx = (ndx * 2) - (byteNdx * 8);
            let out = this.createCircuitStateMessage(id, true);
            let byte = out.payload[28 + byteNdx];

            // Each light group is represented by two bits on the status byte.  There are 3 status bytes that give us only 12 of the 16 on the config stream but the 168 message
            // does acutally send 4 so all are represented there.
            // [10] = Set
            // [01] = Swim
            // [00] = Sync
            // [11] = No sequencing underway.
            // In the end we are only trying to impact the specific bits in the middle of the byte that represent
            // the light group we are dealing with.            
            switch (cmd.name) {
                case 'colorsync':
                    byte &= ((0xFC << bitNdx) | (0xFF >> (8 - bitNdx)));
                    break;
                case 'colorset':
                    byte &= ((0xFE << bitNdx) | (0xFF >> (8 - bitNdx)));
                    break;
                case 'colorswim':
                    byte &= ((0xFD << bitNdx) | (0xFF >> (8 - bitNdx)));
                    break;
                default:
                    return Promise.reject(new InvalidOperationError(`Invalid Light Group Sequence ${operation}`, 'sequenceLightGroupAsync'));
            }
            sgroup.emitEquipmentChange();
            out.payload[28 + byteNdx] = byte;
            // So now we have all the info we need to sequence the group.
            await new Promise((resolve, reject) => {
                out.retries = 5;
                out.response = IntelliCenterBoard.getAckResponse(168);
                out.onComplete = (err, msg) => {
                    if (!err) {
                        sgroup.action = sys.board.valueMaps.circuitActions.getValue(cmd.name);
                        state.emitEquipmentChanges();
                        resolve(sgroup);
                    }
                    else {
                        sgroup.action = 0;
                        reject(err);
                    }
                };
                conn.queueSendMessage(out);
            });
            return sgroup;
        } catch (err) { return Promise.reject(new InvalidOperationError(`Error Sequencing Light Group: ${err.message}`, 'sequenceLightGroupAsync')); }
        //let nop = sys.board.valueMaps.circuitActions.getValue(operation);
        //if (nop > 0) {
        //    let out = this.createCircuitStateMessage(id, true);
        //    let ndx = id - sys.board.equipmentIds.circuitGroups.start;
        //    let byteNdx = Math.floor(ndx / 4);
        //    let bitNdx = (ndx * 2) - (byteNdx * 8);
        //    let byte = out.payload[28 + byteNdx];
        //    // Each light group is represented by two bits on the status byte.  There are 3 status bytes that give us only 12 of the 16 on the config stream but the 168 message
        //    // does acutally send 4 so all are represented there.
        //    // [10] = Set
        //    // [01] = Swim
        //    // [00] = Sync
        //    // [11] = No sequencing underway.
        //    // In the end we are only trying to impact the specific bits in the middle of the byte that represent
        //    // the light group we are dealing with.            
        //    switch (nop) {
        //        case 1: // Sync
        //            byte &= ((0xFC << bitNdx) | (0xFF >> (8 - bitNdx)));
        //            break;
        //        case 2: // Color Set
        //            byte &= ((0xFE << bitNdx) | (0xFF >> (8 - bitNdx)));
        //            break;
        //        case 3: // Color Swim
        //            byte &= ((0xFD << bitNdx) | (0xFF >> (8 - bitNdx)));
        //            break;
        //    }
        //    console.log({ groupNdx: ndx, action: nop, byteNdx: byteNdx, bitNdx: bitNdx, byte: byte })
        //    out.payload[28 + byteNdx] = byte;
        //    return new Promise<LightGroupState>((resolve, reject) => {
        //        out.retries = 5;
        //        out.response = IntelliCenterBoard.getAckResponse(168);
        //        out.onComplete = (err, msg) => {
        //            if (!err) {
        //                sgroup.action = nop;
        //                state.emitEquipmentChanges();
        //                resolve(sgroup);
        //            }
        //            else reject(err);
        //        };
        //        conn.queueSendMessage(out);
        //    });
        //}
        //return Promise.resolve(sgroup);
    }
    // 12-01-21 RKS: This has been deprecated.  This allows for multiple vendor light themes driven by the metadata on the valuemaps.
    //public getLightThemes(type: number): any[] {
    //    switch (type) {
    //        case 5: // Intellibrite
    //        case 6: // Globrite
    //        case 8: // Magicstream
    //        case 10: // ColorCascade
    //            return sys.board.valueMaps.lightThemes.toArray();
    //        default:
    //            return [];
    //    }
    //}
    private async verifyVersionAsync(): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            let out = Outbound.create({
                action: 228,
                retries: 3,
                response: Response.create({ dest: -1, action: 164 }),
                payload: [0],
                onComplete: (err) => {
                    if (err) reject(err);
                    else {
                        // Send an ACK to the OCP.
                        let ack = Outbound.create({ action: 1, destination: 16, payload: [164] });
                        conn.queueSendMessage(ack);
                        resolve(true);
                    }
                }
            });
            conn.queueSendMessage(out);
        });
    }
    private async getConfigAsync(payload: number[]): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            let out = Outbound.create({
                action: 222,
                retries: 3,
                payload: payload,
                response: Response.create({ dest: -1, action: 30, payload: payload }),
                onComplete: (err) => {
                    if (err) reject(err);
                    else {
                        let ack = Outbound.create({ action: 1, destination: 16, payload: [30] });
                        conn.queueSendMessage(ack);
                        resolve(true);
                    }
                }
            });
            conn.queueSendMessage(out);
        });

    }
    private async verifyStateAsync(): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            let out = Outbound.create({
                action: 222,
                retries: 3,
                payload: [15, 0],
                response: Response.create({ dest: -1, action: 30, payload: [15, 0] }),
                onComplete: (err) => {
                    if (err) reject(err);
                    else {
                        let ack = Outbound.create({ action: 1, destination: 16, payload: [30] });
                        conn.queueSendMessage(ack);
                        resolve(true);
                    }
                }
            });
            conn.queueSendMessage(out);
        });
    }
    public async setCircuitStateAsync(id: number, val: boolean, ignoreDelays?: boolean): Promise<ICircuitState> {
        let c = sys.circuits.getInterfaceById(id);
        if (c.master !== 0) return await super.setCircuitStateAsync(id, val);
        // As of 1.047 there is a sequence to this.
        // 1. ICP Sends action 228 (Get versions)
        // 2. OCP responds 164
        // 3. ICP responds ACK(164)
        // 4. ICP Sends action 222[15,0] (Get circuit config)
        // 5. OCP responds 30[15,0] (Respond circuit config)
        // 6. ICP responds ACK(30)
        // NOT SURE IF COINCIDENTAL: The ICP seems to respond immediately after action 2.
        // 7. ICP Sends 168[15,0,... new options, 0,0,0,0]
        // 8. OCP responds ACK(168)
        // i10D turn on pool
        // OCP
        // Schedule on
        // [255, 0, 255][165, 1, 15, 16, 168, 36][15, 0, 0, 33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 36, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 1][5, 226]
        // No schedules
        // [255, 0, 255][165, 1, 15, 16, 168, 36][15, 0, 0, 38, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 1, 0][5, 195]
        // njsPC
        // [255, 0, 255][165, 1, 15, 33, 168, 36][15, 0, 0, 33, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0,  8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0][5, 216]

        // The previous sequence is just additional noise on the bus. There is no need for it.  We just
        // need to send the set circuit message.  It will reliably work 100% of the time but the ICP
        // may set it back again.  THIS HAS TO BE A 1.047 BUG!
        try {
            //let b = await this.verifyVersionAsync();
            //if (b) b = await this.getConfigAsync([15, 0]);
            return new Promise<ICircuitState>((resolve, reject) => {
                let out = this.createCircuitStateMessage(id, val);
                //if (sys.equipment.dual && id === 6) out.setPayloadByte(35, 1);
                out.setPayloadByte(34, 1);
                out.source = 16;
                out.onComplete = async (err, msg: Inbound) => {
                    if (err) reject(err);
                    else {
                        // There is a current bug in 1.047 where one controller will reset the settings
                        // of another when they are not the controller that set it.  Either this is a BS bug
                        // or there is some piece of information we do not have.
                        let b = await this.getConfigAsync([15, 0]);
                        let circ = state.circuits.getInterfaceById(id);
                        // This doesn't work to set it back because the ICP will set it back but often this
                        // can take several seconds to do so.
                        //if (circ.isOn !== utils.makeBool(val)) await this.setCircuitStateAsync(id, val);
                        state.emitEquipmentChanges();
                        resolve(circ);
                    }
                };
                out.scope = `circuitState${id}`;
                out.retries = 5;
                out.response = IntelliCenterBoard.getAckResponse(168);
                conn.queueSendMessage(out);
            });
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setCircuitGroupStateAsync(id: number, val: boolean): Promise<ICircuitGroupState> {
        let grp = sys.circuitGroups.getItemById(id, false, { isActive: false });
        let gstate = (grp.dataName === 'circuitGroupConfig') ? state.circuitGroups.getItemById(grp.id, grp.isActive !== false) : state.lightGroups.getItemById(grp.id, grp.isActive !== false);
        return new Promise<ICircuitGroupState>(async (resolve, reject) => {
            try {
                await sys.board.circuits.setCircuitStateAsync(id, val);
                resolve(state.circuitGroups.getInterfaceById(id));
            }
            catch (err) { reject(err); }
        });
    }
    public async setLightGroupStateAsync(id: number, val: boolean): Promise<ICircuitGroupState> { return this.setCircuitGroupStateAsync(id, val); }
    public async setLightGroupThemeAsync(id: number, theme: number): Promise<ICircuitState> {
        try {
            let group = sys.lightGroups.getItemById(id);
            let sgroup = state.lightGroups.getItemById(id);
            let msgs = this.createLightGroupMessages(group);
            msgs.msg0.payload[4] = (theme << 2) + 1;
            await new Promise<void>((resolve, reject) => {
                msgs.msg0.response = IntelliCenterBoard.getAckResponse(168);
                msgs.msg0.retries = 5;
                msgs.msg0.onComplete = (err) => {
                    if (!err) {
                        group.lightingTheme = theme;
                        sgroup.lightingTheme = theme;
                        resolve();
                    }
                    else reject(err);
                };
                conn.queueSendMessage(msgs.msg0);
            });
            state.emitEquipmentChanges();
            return Promise.resolve(sgroup);
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setColorHoldAsync(id: number): Promise<ICircuitState> {
        let circuit = sys.circuits.getInterfaceById(id);
        if (circuit.master === 1) return await super.setColorHoldAsync(id);
        try {
            if (sys.board.equipmentIds.circuitGroups.isInRange(id)) {
                await this.setLightGroupThemeAsync(id, 12);
                return Promise.resolve(state.lightGroups.getItemById(id));
            }
            return await this.setLightThemeAsync(id, 12);
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setColorRecallAsync(id: number): Promise<ICircuitState> {
        let circuit = sys.circuits.getInterfaceById(id);
        if (circuit.master === 1) return await super.setColorHoldAsync(id);
        try {
            if (sys.board.equipmentIds.circuitGroups.isInRange(id)) {
                await this.setLightGroupThemeAsync(id, 13);
                return Promise.resolve(state.lightGroups.getItemById(id));
            }
            return await this.setLightThemeAsync(id, 13);
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setLightThemeAsync(id: number, theme: number): Promise<ICircuitState> {
        let circuit = sys.circuits.getInterfaceById(id);
        if (circuit.master === 1) return await super.setLightThemeAsync(id, theme);
        try {
            if (sys.board.equipmentIds.circuitGroups.isInRange(id)) {
                await this.setLightGroupThemeAsync(id, theme);
                return Promise.resolve(state.lightGroups.getItemById(id));
            }
            else {
                let circuit = sys.circuits.getInterfaceById(id);
                let cstate = state.circuits.getInterfaceById(id);
                let out = Outbound.create({
                    action: 168, payload: [1, 0, id - 1, circuit.type, circuit.freeze ? 1 : 0, circuit.showInFeatures ? 1 : 0,
                        theme, Math.floor(circuit.eggTimer / 60), circuit.eggTimer - ((Math.floor(circuit.eggTimer) / 60) * 60), circuit.dontStop ? 1 : 0]
                });
                cstate.action = sys.board.valueMaps.circuitActions.getValue('lighttheme');
                out.response = IntelliCenterBoard.getAckResponse(168);
                out.retries = 5;
                await new Promise<void>((resolve, reject) => {
                    out.onComplete = (err) => {
                        if (!err) {
                            circuit.lightingTheme = theme;
                            cstate.lightingTheme = theme;
                            resolve();
                        }
                        else {
                            reject(err);
                        }
                        cstate.action = 0;
                    };
                    out.appendPayloadString(circuit.name, 16);
                    conn.queueSendMessage(out);
                });
                if (!cstate.isOn) await this.setCircuitStateAsync(id, true);
                state.emitEquipmentChanges();
                return Promise.resolve(cstate);
            }
        }
        catch (err) { return Promise.reject(err); }
    }
    public createLightGroupMessages(group: ICircuitGroup): { msg0?: Outbound, msg1?: Outbound, msg2?: Outbound } {
        // Todo: add scope to outgoing messages
        let msgs: { msg0?: Outbound, msg1?: Outbound, msg2?: Outbound } = {};
        // Create the first message.
        //[255, 0, 255][165, 63, 15, 16, 168, 40][6, 0, 0, 1, 41, 0, 4, 6, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12, 0][16, 20]
        msgs.msg0 = Outbound.create({
            action: 168,
            payload: [6, 0, group.id - sys.board.equipmentIds.circuitGroups.start, group.type,
                typeof group.lightingTheme !== 'undefined' && group.lightingTheme ? (group.lightingTheme << 2) + 1 : 0, 0,
                255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,  // Circuits
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,  // Swim Delay
                Math.floor(group.eggTimer / 60), group.eggTimer - ((Math.floor(group.eggTimer) / 60) * 60)]
        });
        for (let i = 0; i < group.circuits.length; i++) {
            // Set all the circuit info.
            let circuit = group.circuits.getItemByIndex(i);
            msgs.msg0.payload[i + 6] = circuit.circuit - 1;
            if (group.type === 1) msgs.msg0.payload[i + 22] = (circuit as LightGroupCircuit).swimDelay;
        }
        // Create the second message
        //[255, 0, 255][165, 63, 15, 16, 168, 35][6, 1, 0, 10, 10, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 80, 111, 111, 108, 32, 76, 105, 103, 104, 116, 115, 0, 0, 0, 0, 0][20, 0]
        msgs.msg1 = Outbound.create({
            action: 168, payload: [6, 1, group.id - sys.board.equipmentIds.circuitGroups.start,
                255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255 // Colors 
            ]
        });
        msgs.msg1.appendPayloadString(group.name, 16);
        if (group.type === 1) {
            let lg = group as LightGroup;
            for (let i = 0; i < group.circuits.length; i++)
                msgs.msg1.payload[i + 3] = 10; // Really don't know what this is.  Perhaps it is some indicator for color/swim/sync.
        }
        // Create the third message
        //[255, 0, 255][165, 63, 15, 16, 168, 19][6, 2, 0, 16, 48, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][2, 6]
        msgs.msg2 = Outbound.create({
            action: 168, payload: [6, 2, group.id - sys.board.equipmentIds.circuitGroups.start,
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0  // Colors
            ]
        });
        if (group.type === 1) {
            let lg = group as LightGroup;
            for (let i = 0; i < group.circuits.length; i++)
                msgs.msg2.payload[i + 3] = lg.circuits.getItemByIndex(i).color;
        }
        return msgs;
    }
    public createCircuitStateMessage(id?: number, isOn?: boolean): Outbound {
        let out = Outbound.createMessage(168, [15, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0-9
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 10-19
            0, 0, 0, 0, 0, 0, 0, 0, 255, 255, // 20-29
            255, 255, 0, 0, 0, 0], // 30-35
            3);

        // Circuits are always contiguous so we don't have to worry about
        // them having a strange offset like features and groups. However, in
        // single body systems they start with 2.
        for (let i = 0; i < state.data.circuits.length; i++) {
            // We are using the index and setting the circuits based upon
            // the index.  This way it doesn't matter what the sort happens to
            // be and whether there are gaps in the ids or not.  The ordinal is the bit number.
            let circuit = state.circuits.getItemByIndex(i);
            let ordinal = circuit.id - 1;
            let ndx = Math.floor(ordinal / 8);
            let byte = out.payload[ndx + 3];
            let bit = ordinal - (ndx * 8);
            if (circuit.id === id) byte = isOn ? byte = byte | (1 << bit) : byte;
            else if (circuit.isOn) byte = byte | (1 << bit);
            out.payload[ndx + 3] = byte;
        }
        // Set the bits for the features.
        for (let i = 0; i < state.data.features.length; i++) {
            // We are using the index and setting the features based upon
            // the index.  This way it doesn't matter what the sort happens to
            // be and whether there are gaps in the ids or not.  The ordinal is the bit number.
            let feature = state.features.getItemByIndex(i);
            let ordinal = feature.id - sys.board.equipmentIds.features.start;
            let ndx = Math.floor(ordinal / 8);
            let byte = out.payload[ndx + 9];
            let bit = ordinal - (ndx * 8);
            if (feature.id === id) byte = isOn ? byte = byte | (1 << bit) : byte;
            else if (feature.isOn) byte = byte | (1 << bit);
            out.payload[ndx + 9] = byte;
        }
        // Set the bits for the circuit groups.
        for (let i = 0; i < state.data.circuitGroups.length; i++) {
            let group = state.circuitGroups.getItemByIndex(i);
            let ordinal = group.id - sys.board.equipmentIds.circuitGroups.start;
            let ndx = Math.floor(ordinal / 8);
            let byte = out.payload[ndx + 13];
            let bit = ordinal - (ndx * 8);
            if (group.id === id) byte = isOn ? byte = byte | (1 << bit) : byte;
            else if (group.isOn) byte = byte | (1 << bit);
            out.payload[ndx + 13] = byte;
        }
        // Set the bits for the light groups.
        for (let i = 0; i < state.data.lightGroups.length; i++) {
            let group = state.lightGroups.getItemByIndex(i);
            let ordinal = group.id - sys.board.equipmentIds.circuitGroups.start;
            let ndx = Math.floor(ordinal / 8);
            let byte = out.payload[ndx + 13];
            let bit = ordinal - (ndx * 8);
            if (group.id === id) byte = isOn ? byte = byte | (1 << bit) : byte;
            else if (group.isOn) byte = byte | (1 << bit);
            out.payload[ndx + 13] = byte;
            if (group.action !== 0) {
                let byteNdx = Math.floor(ordinal / 4);
                let bitNdx = (ndx * 2);
                let byte = out.payload[28 + byteNdx];
                // Each light group is represented by two bits on the status byte.  There are 3 status bytes that give us only 12 of the 16 on the config stream but the 168 message
                // does acutally send 4 so all are represented there.
                // [10] = Set
                // [01] = Swim
                // [00] = Sync
                // [11] = No sequencing underway.
                // Only affect the 2 bits related to the light group.
                switch (group.action) {
                    case 1: // Sync
                        byte &= ((0xFC << bitNdx) | (0xFF >> (8 - bitNdx)));
                        break;
                    case 2: // Color Set
                        byte &= ((0xFE << bitNdx) | (0xFF >> (8 - bitNdx)));
                        break;
                    case 3: // Color Swim
                        byte &= ((0xFD << bitNdx) | (0xFF >> (8 - bitNdx)));
                        break;
                }
                out.payload[28 + byteNdx] = byte;
            }
        }
        // Set the bits for the schedules.
        for (let i = 0; i < state.data.schedules.length; i++) {
            let sched = state.schedules.getItemByIndex(i);
            let ordinal = sched.id - 1;
            let ndx = Math.floor(ordinal / 8);
            let byte = out.payload[ndx + 15];
            let bit = ordinal - (ndx * 8);
            // Lets determine if this schedule should be on.
            if (sched.circuit === id) {
                if (isOn) {
                    let dt = state.time.toDate();
                    let dow = dt.getDay();
                    // Convert the dow to the bit value.
                    let sd = sys.board.valueMaps.scheduleDays.toArray().find(elem => elem.dow === dow);
                    let dayVal = sd.bitVal || sd.val;  // The bitval allows mask overrides.
                    let ts = dt.getHours() * 60 + dt.getMinutes();
                    if ((sched.scheduleDays & dayVal) > 0 && ts >= sched.startTime && ts <= sched.endTime) byte = byte | (1 << bit);
                }
            }
            else if (sched.isOn) byte = byte | (1 << bit);
            out.payload[ndx + 15] = byte;
        }
        return out;
    }
    public async setDimmerLevelAsync(id: number, level: number): Promise<ICircuitState> {
        let circuit = sys.circuits.getItemById(id);
        let cstate = state.circuits.getItemById(id);
        let arr = [];
        try {
            if (!cstate.isOn)
                await this.setCircuitStateAsync(id, true);
            await new Promise<void>((resolve, reject) => {
                let out = Outbound.create({
                    action: 168, payload: [1, 0, id - 1, circuit.type, circuit.freeze ? 1 : 0, circuit.showInFeatures ? 1 : 0,
                        level, Math.floor(circuit.eggTimer / 60), circuit.eggTimer - ((Math.floor(circuit.eggTimer) / 60) * 60), circuit.dontStop ? 1 : 0],
                    response: IntelliCenterBoard.getAckResponse(168),
                    retries: 5,
                    onComplete: (err, msg) => {
                        if (!err) {
                            circuit.level = level;
                            cstate.level = level;
                            sys.board.circuits.setEndTime(circuit, cstate, true);
                            cstate.isOn = true;
                            state.emitEquipmentChanges();
                            resolve();
                        }
                        else reject(err);
                    }
                });
                out.appendPayloadString(circuit.name, 16);
                conn.queueSendMessage(out);
            });
            return Promise.resolve(cstate);
        }
        catch (err) { return Promise.reject(err); }
    }
    public async toggleCircuitStateAsync(id: number): Promise<ICircuitState> {
        let circ = state.circuits.getInterfaceById(id);
        return sys.board.circuits.setCircuitStateAsync(id, !circ.isOn);
    }
}
class IntelliCenterFeatureCommands extends FeatureCommands {
    declare board: IntelliCenterBoard;
    public async setFeatureStateAsync(id, val): Promise<ICircuitState> { return sys.board.circuits.setCircuitStateAsync(id, val); }
    public async toggleFeatureStateAsync(id): Promise<ICircuitState> { return sys.board.circuits.toggleCircuitStateAsync(id); }
    public syncGroupStates() { } // Do nothing and let IntelliCenter do it.
    public async setFeatureAsync(data: any): Promise<Feature> {
        return new Promise<Feature>((resolve, reject) => {
            let id = parseInt(data.id, 10);
            let feature: Feature;
            if (id <= 0) {
                id = sys.features.getNextEquipmentId(sys.board.equipmentIds.features);
                feature = sys.features.getItemById(id, false, { isActive: true, freeze: false });
            }
            else
                feature = sys.features.getItemById(id, false);
            if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('feature Id has not been defined', data.id, 'Feature'));
            if (!sys.board.equipmentIds.features.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`feature Id ${id}: is out of range.`, id, 'Feature'));
            let eggTimer = Math.min(typeof data.eggTimer !== 'undefined' ? parseInt(data.eggTimer, 10) : feature.eggTimer, 1440);
            if (isNaN(eggTimer)) eggTimer = feature.eggTimer;
            if (data.dontStop === true) eggTimer = 1440;
            data.dontStop = (eggTimer === 1440);
            let eggHrs = Math.floor(eggTimer / 60);
            let eggMins = eggTimer - (eggHrs * 60);
            let out = Outbound.create({
                action: 168,
                response: IntelliCenterBoard.getAckResponse(168),
                retries: 5,
                payload: [2, 0, id - sys.board.equipmentIds.features.start,
                    typeof data.type !== 'undefined' ? parseInt(data.type, 10) : feature.type,
                    (typeof data.freeze !== 'undefined' ? utils.makeBool(data.freeze) : feature.freeze) ? 1 : 0,
                    (typeof data.showInFeatures !== 'undefined' ? utils.makeBool(data.showInFeatures) : feature.showInFeatures) ? 1 : 0,
                    eggHrs, eggMins, data.dontStop ? 1 : 0],
                onComplete: (err, msg) => {
                    if (err) reject(err);
                    else {
                        feature = sys.features.getItemById(id, true);
                        let fstate = state.features.getItemById(id, true);

                        feature.eggTimer = eggTimer;
                        feature.dontStop = data.dontStop;
                        feature.freeze = (typeof data.freeze !== 'undefined' ? utils.makeBool(data.freeze) : feature.freeze);
                        fstate.showInFeatures = feature.showInFeatures = (typeof data.showInFeatures !== 'undefined' ? utils.makeBool(data.showInFeatures) : feature.showInFeatures);
                        fstate.name = feature.name = typeof data.name !== 'undefined' ? data.name.toString().substring(0, 16) : feature.name;
                        fstate.type = feature.type = typeof data.type !== 'undefined' ? parseInt(data.type, 10) : feature.type;
                        fstate.emitEquipmentChange();
                        resolve(feature);
                    }
                }
            });
            out.appendPayloadString(typeof data.name !== 'undefined' ? data.name.toString() : feature.name, 16);
            conn.queueSendMessage(out);
        });
    }
    public async deleteFeatureAsync(data: any): Promise<Feature> {
        return new Promise<Feature>((resolve, reject) => {
            let id = parseInt(data.id, 10);
            if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('feature Id has not been defined', data.id, 'Feature'));
            let feature = sys.features.getItemById(id, false);
            let out = Outbound.create({
                action: 168,
                payload: [2, 0, id - sys.board.equipmentIds.features.start,
                    255, // Delete the feature
                    0, 0, 12, 0, 0],
                response: IntelliCenterBoard.getAckResponse(168),
                retries: 5,
                onComplete: (err, msg) => {
                    if (err) reject(err);
                    else {
                        sys.features.removeItemById(id);
                        feature.isActive = false;
                        let fstate = state.features.getItemById(id, false);
                        fstate.showInFeatures = false;
                        state.features.removeItemById(id);
                        resolve(feature);
                    }
                }
            });
            out.appendPayloadString(typeof data.name !== 'undefined' ? data.name.toString() : feature.name, 16);
            conn.queueSendMessage(out);
        });

    }

}
class IntelliCenterChlorinatorCommands extends ChlorinatorCommands {
    public async setChlorAsync(obj: any): Promise<ChlorinatorState> {
        let id = parseInt(obj.id, 10);
        // Bail out right away if this is not controlled by the OCP.
        if (typeof obj.master !== 'undefined' && parseInt(obj.master, 10) !== 0) return super.setChlorAsync(obj);
        let isAdd = false;
        if (isNaN(id) || id <= 0) {
            // We are adding so we need to see if there is another chlorinator that is not external.
            if (sys.chlorinators.count(elem => elem.master !== 2) > sys.equipment.maxChlorinators) return Promise.reject(new InvalidEquipmentDataError(`The max number of chlorinators has been exceeded you may only add ${sys.equipment.maxChlorinators}`, 'chlorinator', sys.equipment.maxChlorinators));
            id = 1;
            isAdd = true;
        }
        let chlor = sys.chlorinators.getItemById(id);
        if (chlor.master !== 0 && !isAdd) return super.setChlorAsync(obj);

        let name = obj.name || chlor.name || 'IntelliChlor' + id;
        let superChlorHours = parseInt(obj.superChlorHours, 10);
        if (typeof obj.superChlorinate !== 'undefined') obj.superChlor = utils.makeBool(obj.superChlorinate);
        let superChlorinate = typeof obj.superChlor === 'undefined' ? undefined : utils.makeBool(obj.superChlor);
        let isDosing = typeof obj.isDosing !== 'undefined' ? utils.makeBool(obj.isDosing) : chlor.isDosing;
        let disabled = typeof obj.disabled !== 'undefined' ? utils.makeBool(obj.disabled) : chlor.disabled;
        // This should never never never modify the setpoints based upon the disabled or isDosing flags.
        //let poolSetpoint = isDosing ? 100 : disabled ? 0 : parseInt(obj.poolSetpoint, 10);
        //let spaSetpoint = isDosing ? 100 : disabled ? 0 : parseInt(obj.spaSetpoint, 10);
        let poolSetpoint = typeof obj.poolSetpoint !== 'undefined' ? parseInt(obj.poolSetpoint, 10) : chlor.poolSetpoint;
        let spaSetpoint = typeof obj.spaSetpoint !== 'undefined' ? parseInt(obj.spaSetpoint, 10) : chlor.spaSetpoint;
        let saltTarget = typeof obj.saltTarget === 'number' ? parseInt(obj.saltTarget, 10) : chlor.saltTarget;

        if (poolSetpoint === 0) console.log(obj);
        let model = typeof obj.model !== 'undefined' ? sys.board.valueMaps.chlorinatorModel.encode(obj.model) : chlor.model || 0;
        let chlorType = typeof obj.type !== 'undefined' ? sys.board.valueMaps.chlorinatorType.encode(obj.type) : chlor.type || 0;
        if (isAdd) {
            if (isNaN(poolSetpoint)) poolSetpoint = 50;
            if (isNaN(spaSetpoint)) spaSetpoint = 10;
            if (isNaN(superChlorHours)) superChlorHours = 8;
            if (typeof superChlorinate === 'undefined') superChlorinate = false;
        }
        else {
            if (isNaN(poolSetpoint)) poolSetpoint = chlor.poolSetpoint || 0;
            if (isNaN(spaSetpoint)) spaSetpoint = chlor.spaSetpoint || 0;
            if (isNaN(superChlorHours)) superChlorHours = chlor.superChlorHours;
            if (typeof superChlorinate === 'undefined') superChlorinate = utils.makeBool(chlor.superChlor);
        }
        if (typeof obj.disabled !== 'undefined') chlor.disabled = utils.makeBool(obj.disabled);
        if (typeof chlor.body === 'undefined') chlor.body = obj.body || 32;
        // Verify the data.
        let body = sys.board.bodies.mapBodyAssociation(typeof obj.body === 'undefined' ? chlor.body || 0 : obj.body);
        if (typeof body === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Chlorinator body association is not valid: ${chlor.body}`, 'chlorinator', chlor.body));
        if (poolSetpoint > 100 || poolSetpoint < 0) return Promise.reject(new InvalidEquipmentDataError(`Chlorinator poolSetpoint is out of range: ${chlor.poolSetpoint}`, 'chlorinator', chlor.poolSetpoint));
        if (spaSetpoint > 100 || spaSetpoint < 0) return Promise.reject(new InvalidEquipmentDataError(`Chlorinator spaSetpoint is out of range: ${chlor.poolSetpoint}`, 'chlorinator', chlor.spaSetpoint));
        let portId = typeof obj.portId !== 'undefined' ? parseInt(obj.portId, 10) : chlor.portId;
        if (portId !== chlor.portId && sys.chlorinators.count(elem => elem.id !== chlor.id && elem.portId === portId && elem.master !== 2) > 0) return Promise.reject(new InvalidEquipmentDataError(`Another chlorinator is installed on port #${portId}.  Only one chlorinator can be installed per port.`, 'Chlorinator', portId));
        if (typeof obj.ignoreSaltReading !== 'undefined') chlor.ignoreSaltReading = utils.makeBool(obj.ignoreSaltReading);
        return new Promise<ChlorinatorState>((resolve, reject) => {
            let out = Outbound.create({
                action: 168,
                payload: [7, 0, id - 1, body.val, 1,
                    disabled ? 0 : isDosing ? 100 : poolSetpoint,
                    disabled ? 0 : isDosing ? 100 : spaSetpoint,
                    superChlorinate ? 1 : 0, superChlorHours, 0, 1],
                response: IntelliCenterBoard.getAckResponse(168),
                retries: 5,
                onComplete: (err, msg) => {
                    if (err) reject(err);
                    else {
                        let schlor = state.chlorinators.getItemById(id, true);
                        let cchlor = sys.chlorinators.getItemById(id, true);
                        chlor.master = 0;
                        schlor.body = chlor.body = body.val;
                        chlor.disabled = disabled;
                        schlor.model = chlor.model = model;
                        schlor.type = chlor.type = chlorType;
                        chlor.name = schlor.name = name;
                        chlor.isDosing = isDosing;
                        chlor.saltTarget = saltTarget;
                        schlor.isActive = cchlor.isActive = true;
                        schlor.poolSetpoint = cchlor.poolSetpoint = poolSetpoint;
                        schlor.spaSetpoint = cchlor.spaSetpoint = spaSetpoint;
                        schlor.superChlorHours = cchlor.superChlorHours = superChlorHours;
                        schlor.superChlor = cchlor.superChlor = superChlorinate;
                        state.emitEquipmentChanges();
                        resolve(schlor);
                    }
                }
            });
            conn.queueSendMessage(out);
        });
    }
    public async deleteChlorAsync(obj: any): Promise<ChlorinatorState> {
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentDataError(`Chlorinator id is not valid: ${obj.id}`, 'chlorinator', obj.id));
        let chlor = sys.chlorinators.getItemById(id);
        if (chlor.master === 1) return await super.deleteChlorAsync(obj);
        let schlor = state.chlorinators.getItemById(id);
        // Verify the data.
        return new Promise<ChlorinatorState>((resolve, reject) => {
            let out = Outbound.create({
                action: 168,
                payload: [7, 0, id - 1, schlor.body || 0, 0, schlor.poolSetpoint || 0, schlor.spaSetpoint || 0, 0, schlor.superChlorHours || 0, 0, 0],
                response: IntelliCenterBoard.getAckResponse(168),
                retries: 5,
                onComplete: (err, msg) => {
                    if (err) reject(err);
                    else {
                        ncp.chlorinators.deleteChlorinatorAsync(id).then(()=>{});
                        schlor = state.chlorinators.getItemById(id, true);
                        state.chlorinators.removeItemById(id);
                        sys.chlorinators.removeItemById(id);
                        resolve(schlor);
                    }
                }
            });
            conn.queueSendMessage(out);
        });
    }
}
class IntelliCenterPumpCommands extends PumpCommands {
    private createPumpConfigMessages(pump: Pump): Outbound[] {
        let arr: Outbound[] = [];
        let outSettings = Outbound.createMessage(
            168, [4, 0, pump.id - 1, pump.type, 0, pump.address, pump.minSpeed - Math.floor(pump.minSpeed / 256) * 256, Math.floor(pump.minSpeed / 256), pump.maxSpeed - Math.floor(pump.maxSpeed / 256) * 256
                , Math.floor(pump.maxSpeed / 256), pump.minFlow, pump.maxFlow, pump.flowStepSize, pump.primingSpeed - Math.floor(pump.primingSpeed / 256) * 256
                , Math.floor(pump.primingSpeed / 256), pump.speedStepSize / 10, pump.primingTime
                , 5, 255, 255, 255, 255, 255, 255, 255, 255
                , 0, 0, 0, 0, 0, 0, 0, 0], 0); // All the circuits and units.
        let outName = Outbound.createMessage(
            168, [4, 1, pump.id - 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0);
        for (let i = 0; i < 8; i++) {
            let circuit = pump.circuits.getItemById(i + 1);
            if (typeof circuit.circuit === 'undefined' || circuit.circuit === 255 || circuit.circuit === 0) {
                outSettings.payload[i + 18] = 255;
                // If this is a VF or VSF then we want to put these units in the minimum flow category.
                switch (pump.type) {
                    case 1: // SS
                    case 2: // DS
                        outName.payload[i * 2 + 3] = 0;
                        outName.payload[i * 2 + 4] = 0;
                        break;
                    case 4: // VSF
                    case 5: // VF
                        outName.payload[i * 2 + 3] = pump.minSpeed - Math.floor(pump.minFlow / 256) * 256;
                        outName.payload[i * 2 + 4] = Math.floor(pump.minFlow / 256);
                        break;
                    default:
                        // VS
                        outName.payload[i * 2 + 3] = pump.minSpeed - Math.floor(pump.minSpeed / 256) * 256;
                        outName.payload[i * 2 + 4] = Math.floor(pump.minSpeed / 256);
                        break;
                }
            }
            else {
                outSettings.payload[i + 18] = circuit.circuit - 1; // Set this to the index not the id.
                outSettings.payload[i + 26] = circuit.units;
                switch (pump.type) {
                    case 1: // SS
                        outName.payload[i * 2 + 3] = 0;
                        outName.payload[i * 2 + 4] = 0;
                        break;
                    case 2: // DS
                        outName.payload[i * 2 + 3] = 1;
                        outName.payload[i * 2 + 4] = 0;
                        break;
                    case 4: // VSF
                    case 5: // VF
                        outName.payload[i * 2 + 3] = circuit.flow - Math.floor(circuit.flow / 256) * 256;
                        outName.payload[i * 2 + 4] = Math.floor(circuit.flow / 256);
                        break;
                    default:
                        // VS
                        outName.payload[i * 2 + 3] = circuit.speed - Math.floor(circuit.speed / 256) * 256;
                        outName.payload[i * 2 + 4] = Math.floor(circuit.speed / 256);
                        break;
                }
            }
        }
        outName.appendPayloadString(pump.name, 16);
        return [outSettings, outName];
    }
/*     public setPumpCircuit(pump: Pump, pumpCircuitDeltas: any) {
        let { result, reason } = super.setPumpCircuit(pump, pumpCircuitDeltas);
        if (result === 'OK') this.setPump(pump);
        return { result: result, reason: reason };
    }
    public setPump(pump: Pump, obj?: any) {
        super.setPump(pump, obj);
        let msgs: Outbound[] = this.createPumpConfigMessages(pump);
        for (let i = 0; i < msgs.length; i++){
            conn.queueSendMessage(msgs[i]);
        }
    } */
    public async setPumpAsync(data: any): Promise<Pump> {
        let id = (typeof data.id === 'undefined' || data.id <= 0) ? sys.pumps.getNextEquipmentId(sys.board.equipmentIds.pumps) : parseInt(data.id, 10);
        if (isNaN(id)) return Promise.reject(new Error(`Invalid pump id: ${data.id}`));
        let pump = sys.pumps.getItemById(id, false);
        if (data.master > 0 || pump.master > 0) return await super.setPumpAsync(data);

        //                                        0                    6              10   11  12           15
        //[255, 0, 255][165, 63, 15, 16, 168, 34][4, 0, 0, 3, 0, 96, 194, 1, 122, 13, 15, 130,  1, 196, 9, 128,   2, 255, 5, 0, 251, 128, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0][11, 218]
        //[255, 0, 255][165, 63, 15, 16, 168, 34][4, 0, 0, 3, 0, 96, 194, 1, 122, 13, 15, 130,  1, 196, 9,   1,   2, 255, 5, 0, 251, 128, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0][11, 91]
        //[255, 0, 255][165, 63, 15, 16, 168, 34][4, 0, 0, 3, 0, 96, 194, 1, 122, 13, 15, 130,  1, 196, 9, 128,   2, 255, 5, 0, 251, 128, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0][11, 218]

        //[255, 0, 255][165, 63, 15, 33, 168, 33][4, 0, 0, 3, 0, 96, 194, 1, 122, 13, 15, 130,  1, 196, 9, 640, 255, 255, 5, 0, 251, 128, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0][14, 231]
        //[255, 0, 255][165, 63, 15, 33, 168, 34][4, 0, 0, 3, 0, 96, 194, 1, 122, 13, 15, 130,  1, 196, 9, 300, 255,   3, 5, 0, 251, 128, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0][12, 152]
        if (isNaN(id)) return Promise.reject(new Error(`Invalid pump id: ${data.id}`));
        else if (id >= sys.equipment.maxPumps) return Promise.reject(new Error(`Pump id out of range: ${data.id}`));
        // We now need to get the type for the pump.  If the incoming data doesn't include it then we need to
        // get it from the current pump configuration.
        let ntype = (typeof data.type === 'undefined' || isNaN(parseInt(data.type, 10))) ? pump.type : parseInt(data.type, 10);
        // While we are dealing with adds in the setPumpConfig we are not dealing with deletes so this needs to be a value greater than nopump.  If someone sends
        // us a type that is <= 0 we need to throw an error.  If they dont define it or give us an invalid number we can move on.
        if (isNaN(ntype) || ntype <= 0) return Promise.reject(new Error(`Invalid pump type: ${data.id} - ${data.type}`));
        let type = sys.board.valueMaps.pumpTypes.transform(ntype);
        if (typeof type.name === 'undefined') return Promise.reject(new Error(`Invalid pump type: ${data.id} - ${ntype}`));
        // Build out our messsages. We are merging data together so that the data items from the current config can be overridden.  If they are not
        // supplied then we will use what we already have.  This will make sure the information is valid and any change can be applied without the complete
        // definition of the pump.  This is important since additional attributes may be added in the future and this keeps us current no matter what
        // the endpoint capability is.
        try {
            let outc = Outbound.create({ action: 168, payload: [4, 0, id - 1, ntype, 0] });
            outc.appendPayloadByte(parseInt(data.address, 10), id + 95);        // 5
            outc.appendPayloadInt(parseInt(data.minSpeed, 10), pump.minSpeed);  // 6
            outc.appendPayloadInt(parseInt(data.maxSpeed, 10), pump.maxSpeed);  // 8
            outc.appendPayloadByte(parseInt(data.minFlow, 10), pump.minFlow);   // 10
            outc.appendPayloadByte(parseInt(data.maxFlow, 10), pump.maxFlow);   // 11
            outc.appendPayloadByte(parseInt(data.flowStepSize, 10), pump.flowStepSize || 1); // 12
            outc.appendPayloadInt(parseInt(data.primingSpeed, 10), pump.primingSpeed || 2500); // 13
            outc.appendPayloadByte(typeof data.speedStepSize !== 'undefined' ? parseInt(data.speedStepSize, 10) / 10 : pump.speedStepSize / 10, 1); // 15
            outc.appendPayloadByte(parseInt(data.primingTime, 10), pump.primingTime || 0); // 17
            outc.appendPayloadByte(255); //
            outc.appendPayloadBytes(255, 8);    // 18
            outc.appendPayloadBytes(0, 8);      // 26
            let outn = Outbound.create({ action: 168, payload: [4, 1, id - 1] });
            outn.appendPayloadBytes(0, 16);
            outn.appendPayloadString(data.name, 16, pump.name || type.name);
            if (type.name === 'ss') {
                outc.setPayloadByte(5, 0); // Clear the pump address

                // At some point we may add these to the pump model.
                outc.setPayloadInt(6, type.minSpeed, 450);
                outc.setPayloadInt(8, type.maxSpeed, 3450);
                outc.setPayloadByte(10, type.minFlow, 0);
                outc.setPayloadByte(11, type.maxFlow, 130);
                outc.setPayloadByte(12, 1);
                outc.setPayloadInt(13, type.primingSpeed, 2500);
                outc.setPayloadByte(15, 10);
                outc.setPayloadByte(16, 1);
                outc.setPayloadByte(17, 5);
                outc.setPayloadByte(18, data.body, pump.body);
                outc.setPayloadByte(26, 0);
                outn.setPayloadInt(3, 0);
                for (let i = 1; i < 8; i++) {
                    outc.setPayloadByte(i + 18, 255);
                    outc.setPayloadByte(i + 26, 0);
                    outn.setPayloadInt((i * 2) + 3, 1000);
                }
            }
            else {
                // All of these pumps potentially have circuits.
                // Add in all the circuits
                if (data.circuits === 'undefined') {
                    // The endpoint isn't changing the circuits and is just setting the attributes.
                    for (let i = 0; i < 8; i++) {
                        let circ = pump.circuits.getItemByIndex(i, false, { circuit: 255 });
                        circ.id = i + 1;
                        outc.setPayloadByte(i + 18, circ.circuit);
                    }
                }
                else {
                    if (typeof type.maxCircuits !== 'undefined' && type.maxCircuits > 0) {
                        for (let i = 0; i < 8; i++) {
                            let circ = pump.circuits.getItemByIndex(i, false, { circuit: 255 });
                            if (i >= data.circuits.length) {
                                // The incoming data does not include this circuit so we will set it to 255.
                                outc.setPayloadByte(i + 18, 255);
                                if (typeof type.minSpeed !== 'undefined')
                                    outn.setPayloadInt((i * 2) + 3, type.minSpeed);
                                else if (typeof type.minFlow !== 'undefined') {
                                    outn.setPayloadInt((i * 2) + 3, type.minFlow);
                                    outc.setPayloadByte(i + 26, 1);
                                }
                                else
                                    outn.setPayloadInt((i * 2) + 3, 0);
                            }
                            else {
                                let c = data.circuits[i];
                                let speed = parseInt(c.speed, 10);
                                let flow = parseInt(c.flow, 10);
                                let circuit = i < type.maxCircuits ? parseInt(c.circuit, 10) : 256;
                                let units;
                                if (type.name === 'vf') units = sys.board.valueMaps.pumpUnits.getValue('gpm');
                                else if (type.name === 'vs') units = sys.board.valueMaps.pumpUnits.getValue('rpm');
                                else units = sys.board.valueMaps.pumpUnits.encode(c.units);
                                if (isNaN(units)) units = sys.board.valueMaps.pumpUnits.getValue('rpm');
                                outc.setPayloadByte(i + 18, circuit - 1, circ.circuit - 1);
                                if (typeof type.minSpeed !== 'undefined' && (parseInt(c.units, 10) === 0 || isNaN(parseInt(c.units, 10)))) {
                                    outc.setPayloadByte(i + 26, 0); // Set to rpm
                                    outn.setPayloadInt((i * 2) + 3, Math.max(speed, type.minSpeed), circ.speed);
                                }
                                else if (typeof type.minFlow !== 'undefined' && (parseInt(c.units, 10) === 1 || isNaN(parseInt(c.units, 10)))) {
                                    outc.setPayloadByte(i + 26, 1); // Set to gpm
                                    outn.setPayloadInt((i * 2) + 3, Math.max(flow, type.minFlow), circ.flow);
                                }
                            }
                        }
                    }
                }
            }
            // We now have our messages.  Let's send them off and update our values.
            await new Promise<void>((resolve, reject) => {
                outc.response = IntelliCenterBoard.getAckResponse(168);
                outc.retries = 5;
                outc.onComplete = (err) => {
                    if (err) reject(err);
                    else {
                        // We have been successful so lets set our pump with the new data.
                        let pump = sys.pumps.getItemById(id, true);
                        let spump = state.pumps.getItemById(id, true);
                        spump.type = pump.type = ntype;
                        if (typeof data.model !== 'undefined') pump.model = data.model;
                        if (type.name === 'ss') {
                            pump.address = undefined;
                            pump.primingTime = 0;
                            pump.primingSpeed = type.primingSpeed || 2500;
                            pump.minSpeed = type.minSpeed || 450;
                            pump.maxSpeed = type.maxSpeed || 3450;
                            pump.minFlow = type.minFlow, 0;
                            pump.maxFlow = type.maxFlow, 130;
                            pump.circuits.clear();
                            if (typeof data.body !== 'undefined') pump.body = parseInt(data.body, 10);
                        }
                        else if (type.name === 'ds') {
                            pump.address = undefined;
                            pump.primingTime = 0;
                            pump.primingSpeed = type.primingSpeed || 2500;
                            pump.minSpeed = type.minSpeed || 450;
                            pump.maxSpeed = type.maxSpeed || 3450;
                            pump.minFlow = type.minFlow, 0;
                            pump.maxFlow = type.maxFlow, 130;
                            if (typeof data.body !== 'undefined') pump.body = parseInt(data.body, 10);
                        }
                        else {
                            if (typeof data.address !== 'undefined') pump.address = data.address;
                            if (typeof data.primingTime !== 'undefined') pump.primingTime = parseInt(data.primingTime, 10);
                            if (typeof data.primingSpeed !== 'undefined') pump.primingSpeed = parseInt(data.primingSpeed, 10);
                            if (typeof data.minSpeed !== 'undefined') pump.minSpeed = parseInt(data.minSpeed, 10);
                            if (typeof data.maxSpeed !== 'undefined') pump.maxSpeed = parseInt(data.maxSpeed, 10);
                            if (typeof data.minFlow !== 'undefined') pump.minFlow = parseInt(data.minFlow, 10);
                            if (typeof data.maxFlow !== 'undefined') pump.maxFlow = parseInt(data.maxFlow, 10);
                            if (typeof data.flowStepSize !== 'undefined') pump.flowStepSize = parseInt(data.flowStepSize, 10);
                            if (typeof data.speedStepSize !== 'undefined') pump.speedStepSize = parseInt(data.speedStepSize, 10);
                        }
                        if (typeof data.circuits !== 'undefined' && type.name !== 'undefined') {
                            // Set all the circuits
                            let id = 1;
                            for (let i = 0; i < 8; i++) {
                                if (i >= data.circuits.length) pump.circuits.removeItemByIndex(i);
                                else {
                                    let c = data.circuits[i];
                                    let circuitId = parseInt(c.circuit, 10);
                                    if (isNaN(circuitId)) pump.circuits.removeItemByIndex(i);
                                    else {
                                        let circ = pump.circuits.getItemByIndex(i, true);
                                        circ.circuit = circuitId;
                                        circ.id = id++;
                                        if (type.name === 'ds') circ.units = undefined;
                                        else {
                                            // Need to validate this earlier.
                                            let units = c.units !== 'undefined' ? parseInt(c.units, 10) : 0
                                            circ.units = units;
                                        }
                                    }
                                }
                            }
                        }
                        resolve();
                    }
                };
                conn.queueSendMessage(outc);
            });
            await new Promise<void>((resolve, reject) => {
                outn.response = IntelliCenterBoard.getAckResponse(168);
                outn.retries = 5;
                outn.onComplete = (err, msg) => {
                    if (err) reject(err);
                    else {
                        // We have been successful so lets set our pump with the new data.
                        let pump = sys.pumps.getItemById(id, true);
                        let spump = state.pumps.getItemById(id, true);
                        if (typeof data.name !== 'undefined') spump.name = pump.name = data.name;
                        spump.type = pump.type = ntype;
                        if (type.name !== 'ss') {
                            if (typeof data.circuits !== 'undefined') {
                                // Set all the circuits
                                for (let i = 0; i < 8; i++) {
                                    if (i >= data.circuits.length) pump.circuits.removeItemByIndex(i);
                                    else {
                                        let c = data.circuits[i];
                                        let circuitId = typeof c.circuit !== 'undefined' ? parseInt(c.circuit, 10) : pump.circuits.getItemById(i, false).circuit;
                                        let circ = pump.circuits.getItemByIndex(i, true);
                                        circ.circuit = circuitId;
                                        circ.units = parseInt(c.units || circ.units, 10);
                                        let speed = parseInt(c.speed, 10);
                                        let flow = parseInt(c.flow, 10);
                                        if (isNaN(speed)) speed = type.minSpeed || 0;
                                        if (isNaN(flow)) flow = type.minFlow || 0;
                                        //console.log({ flow: flow, speed: speed, type: JSON.stringify(type) });
                                        if (circ.units === 1 && typeof type.minFlow !== 'undefined')
                                            circ.flow = Math.max(flow, type.minFlow);
                                        else if (circ.units === 0 && typeof type.minSpeed !== 'undefined')
                                            circ.speed = Math.max(speed, type.minSpeed);
                                    }
                                }
                            }
                        }
                        state.emitEquipmentChanges();
                        resolve();
                    }
                };
                conn.queueSendMessage(outn);
            });
            return Promise.resolve(sys.pumps.getItemById(id));
        }
        catch (err) { return Promise.reject(err); }
    }
    public async deletePumpAsync(data: any): Promise<Pump> {
        let id = parseInt(data.id);
        if (isNaN(id)) return Promise.reject(new Error(`Cannot Delete Pump, Invalid pump id: ${data.id}`));
        // We now need to get the type for the pump.  If the incoming data doesn't include it then we need to
        // get it from the current pump configuration.
        let pump = sys.pumps.getItemById(id, false);
        // Check to see if this happens to be a Nixie Pump.
        if (pump.master === 1) return super.deletePumpAsync(data);

        if (typeof pump.type === 'undefined') return Promise.reject(new InvalidEquipmentIdError(`Pump #${data.id} does not exist in configuration`, data.id, 'Schedule'));
        let outc = Outbound.create({ action: 168, payload: [4, 0, id - 1, 0, 0, id + 95] });
        outc.appendPayloadInt(450);  // 6
        outc.appendPayloadInt(3450);  // 8
        outc.appendPayloadByte(15);   // 10
        outc.appendPayloadByte(130);   // 11
        outc.appendPayloadByte(1); // 12
        outc.appendPayloadInt(1000);  // 13
        outc.appendPayloadInt(10);   // 15
        outc.appendPayloadByte(5);   // 17
        outc.appendPayloadBytes(255, 8);    // 18
        outc.appendPayloadBytes(0, 8);      // 26
        let outn = Outbound.create({ action: 168, payload: [4, 1, id - 1] });
        outn.appendPayloadBytes(0, 16);
        outn.appendPayloadString('Pump -' + (id + 1), 16);
        // We now have our messages.  Let's send them off and update our values.
        try {
            await new Promise<void>((resolve, reject) => {
                outc.retries = 5;
                outc.response = IntelliCenterBoard.getAckResponse(168);
                outc.onComplete = (err) => {
                    let spump = state.pumps.getItemById(id);
                    sys.pumps.removeItemById(id);
                    state.pumps.removeItemById(id);
                    spump.isActive = false;
                    spump.emitEquipmentChange();

                    resolve();
                };
                conn.queueSendMessage(outc);
            });
            await new Promise<void>((resolve, reject) => {
                outn.response = IntelliCenterBoard.getAckResponse(168);
                outn.retries = 2;
                outn.onComplete = (err) => {
                    state.emitEquipmentChanges();
                    resolve();
                };
                conn.queueSendMessage(outn);
            });
            return Promise.resolve(pump);
        } catch (err) { return Promise.reject(err); }
    }
}
class IntelliCenterBodyCommands extends BodyCommands {
    private bodyHeatSettings: {
        processing: boolean,
        bytes: number[],
        body1: { heatMode: number, heatSetpoint: number, coolSetpoint: number },
        body2: { heatMode: number, heatSetpoint: number, coolSetpoint: number }
    };
    private async queueBodyHeatSettings(bodyId?: number, byte?: number, data?: any): Promise<Boolean> {
        if (typeof this.bodyHeatSettings === 'undefined') {
            let body1 = sys.bodies.getItemById(1);
            let body2 = sys.bodies.getItemById(2);
            this.bodyHeatSettings = {
                processing: false,
                bytes: [],
                body1: { heatMode: body1.heatMode || 1, heatSetpoint: body1.heatSetpoint || 78, coolSetpoint: body1.coolSetpoint || 100 },
                body2: { heatMode: body2.heatMode || 1, heatSetpoint: body2.heatSetpoint || 78, coolSetpoint: body2.coolSetpoint || 100 }
            }
        }
        let bhs = this.bodyHeatSettings;
        if (typeof data !== 'undefined' && typeof bodyId !== 'undefined' && bodyId > 0) {
            let body = bodyId === 2 ? bhs.body2 : bhs.body1;
            if (!bhs.bytes.includes(byte) && byte) bhs.bytes.push(byte);
            if (typeof data.heatSetpoint !== 'undefined') body.heatSetpoint = data.heatSetpoint;
            if (typeof data.coolSetpoint !== 'undefined') body.coolSetpoint = data.coolSetpoint;
            if (typeof data.heatMode !== 'undefined') body.heatMode = data.heatMode;
        }
        if (!bhs.processing && bhs.bytes.length > 0) {
            bhs.processing = true;
            let byte2 = bhs.bytes.shift();
            let fnToByte = function (num) { return num < 0 ? Math.abs(num) | 0x80 : Math.abs(num) || 0; };
            let payload = [0, 0, byte2, 1,
                fnToByte(sys.equipment.tempSensors.getCalibration('water1')),
                fnToByte(sys.equipment.tempSensors.getCalibration('solar1')),
                fnToByte(sys.equipment.tempSensors.getCalibration('air')),
                fnToByte(sys.equipment.tempSensors.getCalibration('water2')),
                fnToByte(sys.equipment.tempSensors.getCalibration('solar2')),
                fnToByte(sys.equipment.tempSensors.getCalibration('water3')),
                fnToByte(sys.equipment.tempSensors.getCalibration('solar3')),
                fnToByte(sys.equipment.tempSensors.getCalibration('water4')),
                fnToByte(sys.equipment.tempSensors.getCalibration('solar4')),
                0,
                0x10 | (sys.general.options.clockMode === 24 ? 0x40 : 0x00) | (sys.general.options.adjustDST ? 0x80 : 0x00) | (sys.general.options.clockSource === 'internet' ? 0x20 : 0x00),
                89, 27, 110, 3, 0, 0,
                bhs.body1.heatSetpoint, bhs.body1.coolSetpoint, bhs.body2.heatSetpoint, bhs.body2.coolSetpoint, bhs.body1.heatMode, bhs.body2.heatMode, 0, 0, 15,
                sys.general.options.pumpDelay ? 1 : 0, sys.general.options.cooldownDelay ? 1 : 0, 0, 100, 0, 0, 0, 0, sys.general.options.manualPriority ? 1 : 0, sys.general.options.manualHeat ? 1 : 0, 0
            ];
            return new Promise<boolean>((resolve, reject) => {
                let out = Outbound.create({
                    action: 168,
                    payload: payload,
                    retries: 2,
                    response: IntelliCenterBoard.getAckResponse(168),
                    onComplete: (err, msg) => {
                        bhs.processing = false;
                        if (err) reject(err);
                        else {
                            let body1 = sys.bodies.getItemById(1);
                            let sbody1 = state.temps.bodies.getItemById(1);
                            body1.heatMode = sbody1.heatMode = bhs.body1.heatMode;
                            body1.heatSetpoint = sbody1.heatSetpoint = bhs.body1.heatSetpoint;
                            body1.coolSetpoint = sbody1.coolSetpoint = bhs.body1.coolSetpoint;
                            if (sys.equipment.dual || sys.equipment.shared) {
                                let body2 = sys.bodies.getItemById(2);
                                let sbody2 = state.temps.bodies.getItemById(2);
                                body2.heatMode = sbody2.heatMode = bhs.body2.heatMode;
                                body2.heatSetpoint = sbody2.heatSetpoint = bhs.body2.heatSetpoint;
                                body2.coolSetpoint = sbody2.coolSetpoint = bhs.body2.coolSetpoint;
                            }
                            state.emitEquipmentChanges();
                            resolve(true);
                        }
                    }
                });
                conn.queueSendMessage(out);
            });
        }
        else {
            // Try every second to re-try if we have a bunch at once.
            if (bhs.bytes.length > 0) {
                setTimeout(async () => {
                    try {
                        await this.queueBodyHeatSettings();
                    } catch (err) { logger.error(`Error sending queued body setpoint message: ${err.message}`); }
                }, 3000);
            }
            else bhs.processing = false;
            return true;
        }
    }
    public async setBodyAsync(obj: any): Promise<Body> {
        let byte = 0;
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Body Id is not defined', obj.id, 'Body'));
        let body = sys.bodies.getItemById(id, false);
        switch (body.id) {
            case 1:
                byte = 0;
                break;
            case 2:
                byte = 2;
                break;
            case 3:
                byte = 1;
                break;
            case 4:
                byte = 3;
                break;
        }
        try {
            if (typeof obj.name === 'string' && obj.name !== body.name) {
                await new Promise(function (resolve, reject) {
                    let out = Outbound.create({
                        action: 168,
                        payload: [13, 0, byte],
                        retries: 5,
                        response: IntelliCenterBoard.getAckResponse(168),
                        onComplete: (err, msg) => {
                            if (err) reject(err);
                            else { body.name = obj.name; resolve(body); }
                        }
                    });
                    out.appendPayloadString(obj.name, 16);
                    conn.queueSendMessage(out);
                });
            }
            if (typeof obj.capacity !== 'undefined') {
                let cap = parseInt(obj.capacity, 10);
                if (cap !== body.capacity) {
                    await new Promise<void>((resolve, reject) => {
                        let out = Outbound.create({
                            action: 168,
                            retries: 2,
                            response: IntelliCenterBoard.getAckResponse(168),
                            payload: [13, 0, byte + 4, Math.floor(cap / 1000)],
                            onComplete: (err, msg) => {
                                if (err) reject(err);
                                else { body.capacity = cap; resolve(); }
                            }
                        });
                        conn.queueSendMessage(out);
                    });
                }
            }
            if (typeof obj.manualHeat !== 'undefined') {
                let manHeat = utils.makeBool(obj.manualHeat);
                if (manHeat !== body.manualHeat) {
                    await new Promise<void>((resolve, reject) => {
                        let out = Outbound.create({
                            action: 168,
                            payload: [13, 0, byte + 8, manHeat ? 1 : 0],
                            onComplete: (err, msg) => {
                                if (err) reject(err);
                                else { body.manualHeat = manHeat; resolve(); }
                            }
                        });
                        conn.queueSendMessage(out);
                    });
                }
            }
            if (typeof obj.showInDashBoard !== 'undefined') {
                let sbody = state.temps.bodies.getItemById(id, false);
                body.showInDashboard = sbody.showInDashboard = utils.makeBool(obj.showInDashboard);
            }
            return Promise.resolve(body);
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setHeatModeAsync(body: Body, mode: number): Promise<BodyTempState> {
        let modes = sys.board.bodies.getHeatModes(body.id);
        if (typeof modes.find(elem => elem.val === mode) === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Cannot set heat mode to ${mode} since this is not a valid mode for the ${body.name}`, 'Body', mode));
        await this.queueBodyHeatSettings(body.id, body.id === 2 ? 23 : 22, { heatMode: mode });
        return state.temps.bodies.getItemById(body.id);
        /*

        let byte2 = 22;
        let body1 = sys.bodies.getItemById(1);
        let body2 = sys.bodies.getItemById(2);

        let heat1 = body1.heatSetpoint || 78;
        let cool1 = body1.coolSetpoint || 100;
        let heat2 = body2.heatSetpoint || 78;
        let cool2 = body2.coolSetpoint || 103;

        let mode1 = body1.heatMode || 1;
        let mode2 = body2.heatMode || 1;
        let bitopts = 0;
        if (sys.general.options.clockSource) bitopts += 32;
        if (sys.general.options.clockMode === 24) bitopts += 64;
        if (sys.general.options.adjustDST) bitopts += 128;

        switch (body.id) {
            case 1:
                byte2 = 22;
                mode1 = mode;
                break;
            case 2:
                byte2 = 23;
                mode2 = mode;
                break;
        }
        return new Promise<BodyTempState>((resolve, reject) => {
            let out = Outbound.create({
                action: 168,
                payload: [0, 0, byte2, 1, 0, 0, 129, 0, 0, 0, 0, 0, 0, 0, bitopts, 89, 27, 110, 3, 0, 0,
                    heat1, cool1, heat2, cool2, mode1, mode2, 0, 0, 15,
                    sys.general.options.pumpDelay ? 1 : 0, sys.general.options.cooldownDelay ? 1 : 0, 0, 100, 0, 0, 0, 0, sys.general.options.manualPriority ? 1 : 0, sys.general.options.manualHeat ? 1 : 0, 0],
                retries: 5,
                response: IntelliCenterBoard.getAckResponse(168),
                onComplete: (err, msg) => {
                    if (err) reject(err);
                    else {
                        body.heatMode = mode;
                        let bstate = state.temps.bodies.getItemById(body.id);
                        bstate.heatMode = mode;
                        state.emitEquipmentChanges();
                        resolve(bstate);
                    }
                }
            })
            conn.queueSendMessage(out);
        });
        */
    }
    public async setHeatSetpointAsync(body: Body, setPoint: number): Promise<BodyTempState> {
        if (typeof setPoint === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Cannot set heat setpoint to undefined for the ${body.name}`, 'Body', setPoint));
        else if (setPoint < 0 || setPoint > 110) return Promise.reject(new InvalidEquipmentDataError(`Cannot set heat setpoint to ${setPoint} for the ${body.name}`, 'Body', setPoint));
        await this.queueBodyHeatSettings(body.id, body.id === 2 ? 20 : 18, { heatSetpoint: setPoint });
        return state.temps.bodies.getItemById(body.id);
        /*
        let byte2 = 18;
        let body1 = sys.bodies.getItemById(1);
        let body2 = sys.bodies.getItemById(2);

        let heat1 = body1.heatSetpoint || 78;
        let cool1 = body1.coolSetpoint || 100;
        let heat2 = body2.heatSetpoint || 78;
        let cool2 = body2.coolSetpoint || 103;
        switch (body.id) {
            case 1:
                byte2 = 18;
                heat1 = setPoint;
                break;
            case 2:
                byte2 = 20;
                heat2 = setPoint;
                break;
        }
        let bitopts = 0;
        if (sys.general.options.clockSource) bitopts += 32;
        if (sys.general.options.clockMode === 24) bitopts += 64;
        if (sys.general.options.adjustDST) bitopts += 128;
        //                                                             6                             15       17 18        21   22       24 25 
        //[255, 0, 255][165, 63, 15, 16, 168, 41][0, 0, 18, 1, 0, 0, 129, 0, 0, 0, 0, 0, 0, 0, 176,  89, 27, 110, 3, 0, 0, 89, 100, 98, 100, 0, 0, 0, 0, 15, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0][5, 243]
        //[255, 0, 255][165, 63, 15, 16, 168, 41][0, 0, 18, 1, 0, 0,   0, 0, 0, 0, 0, 0, 0, 0, 176, 235, 27, 167, 1, 0, 0, 89,  81, 98, 103, 5, 0, 0, 0, 15, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0][6, 48]
        let out = Outbound.create({
            action: 168,
            response: IntelliCenterBoard.getAckResponse(168),
            retries: 5,
            payload: [0, 0, byte2, 1, 0, 0, 129, 0, 0, 0, 0, 0, 0, 0, bitopts, 89, 27, 110, 3, 0, 0,
                heat1, cool1, heat2, cool2, body1.heatMode || 1, body2.heatMode || 1, 0, 0, 15,
                sys.general.options.pumpDelay ? 1 : 0, sys.general.options.cooldownDelay ? 1 : 0, 0, 100, 0, 0, 0, 0, sys.general.options.manualPriority ? 1 : 0, sys.general.options.manualHeat ? 1 : 0, 0]
        });
        return new Promise<BodyTempState>((resolve, reject) => {
            out.onComplete = (err, msg) => {
                if (err) reject(err);
                else {
                    let bstate = state.temps.bodies.getItemById(body.id);
                    body.heatSetpoint = bstate.heatSetpoint = setPoint;
                    resolve(bstate);
                }
            };
            conn.queueSendMessage(out);
        });
        */
    }
    public async setCoolSetpointAsync(body: Body, setPoint: number): Promise<BodyTempState> {
        if (typeof setPoint === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Cannot set cooling setpoint to undefined for the ${body.name}`, 'Body', setPoint));
        else if (setPoint < 0 || setPoint > 110) return Promise.reject(new InvalidEquipmentDataError(`Cannot set cooling setpoint to ${setPoint} for the ${body.name}`, 'Body', setPoint));
        await this.queueBodyHeatSettings(body.id, body.id === 2 ? 21 : 19, { coolSetpoint: setPoint });
        return state.temps.bodies.getItemById(body.id);
        /*
        let byte2 = 19;
        let body1 = sys.bodies.getItemById(1);
        let body2 = sys.bodies.getItemById(2);

        let heat1 = body1.heatSetpoint || 78;
        let cool1 = body1.coolSetpoint || 100;
        let heat2 = body2.heatSetpoint || 78;
        let cool2 = body2.coolSetpoint || 103;
        switch (body.id) {
            case 1:
                byte2 = 19;
                cool1 = setPoint;
                break;
            case 2:
                byte2 = 21;
                cool2 = setPoint;
                break;
        }
        let bitopts = 0;
        if (sys.general.options.clockSource) bitopts += 32;
        if (sys.general.options.clockMode === 24) bitopts += 64;
        if (sys.general.options.adjustDST) bitopts += 128;
        //                                                             6                             15       17 18        21   22       24 25 
        //[255, 0, 255][165, 63, 15, 16, 168, 41][0, 0, 18, 1, 0, 0, 129, 0, 0, 0, 0, 0, 0, 0, 176,  89, 27, 110, 3, 0, 0, 89, 100, 98, 100, 0, 0, 0, 0, 15, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0][5, 243]
        //[255, 0, 255][165, 63, 15, 16, 168, 41][0, 0, 18, 1, 0, 0,   0, 0, 0, 0, 0, 0, 0, 0, 176, 235, 27, 167, 1, 0, 0, 89,  81, 98, 103, 5, 0, 0, 0, 15, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0][6, 48]
        let out = Outbound.create({
            action: 168,
            response: IntelliCenterBoard.getAckResponse(168),
            retries: 5,
            payload: [0, 0, byte2, 1, 0, 0, 129, 0, 0, 0, 0, 0, 0, 0, bitopts, 89, 27, 110, 3, 0, 0,
                heat1, cool1, heat2, cool2, body1.heatMode || 1, body2.heatMode || 1, 0, 0, 15,
                sys.general.options.pumpDelay ? 1 : 0, sys.general.options.cooldownDelay ? 1 : 0, 0, 100, 0, 0, 0, 0, sys.general.options.manualPriority ? 1 : 0, sys.general.options.manualHeat ? 1 : 0, 0]
        });
        return new Promise<BodyTempState>((resolve, reject) => {
            out.onComplete = (err, msg) => {
                if (err) reject(err);
                else {
                    let bstate = state.temps.bodies.getItemById(body.id);
                    body.coolSetpoint = bstate.coolSetpoint = setPoint;
                    resolve(bstate);
                }
            };
            conn.queueSendMessage(out);
        });
        */
    }
}
class IntelliCenterScheduleCommands extends ScheduleCommands {
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
            let heatSource = typeof data.heatSource !== 'undefined' && data.heatSource !== null ? data.heatSource : sched.heatSource || 0;
            let heatSetpoint = typeof data.heatSetpoint !== 'undefined' ? data.heatSetpoint : sched.heatSetpoint;
            let coolSetpoint = typeof data.coolSetpoint !== 'undefined' ? data.coolSetpoint : sched.coolSetpoint || 100;
            let circuit = typeof data.circuit !== 'undefined' ? data.circuit : sched.circuit;
            let startTime = typeof data.startTime !== 'undefined' ? data.startTime : sched.startTime;
            let endTime = typeof data.endTime !== 'undefined' ? data.endTime : sched.endTime;
            let schedDays = sys.board.schedules.transformDays(typeof data.scheduleDays !== 'undefined' ? data.scheduleDays : sched.scheduleDays);
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
            // RKS: During the transition to 1.047 they invalidated the 32 heat source and 0 was turned into no change.  This is no longer needed
            // as we now have the correct mapping.
            //if (sys.equipment.controllerFirmware === '1.047') {
            //    if (heatSource === 32 || heatSource === 0) heatSource = 1;
            //}
            if (heatSetpoint < 0 || heatSetpoint > 104) return Promise.reject(new InvalidEquipmentDataError(`Invalid heat setpoint: ${heatSetpoint}`, 'Schedule', heatSetpoint));
            if (sys.board.circuits.getCircuitReferences(true, true, false, true).find(elem => elem.id === circuit) === undefined)
                return Promise.reject(new InvalidEquipmentDataError(`Invalid circuit reference: ${circuit}`, 'Schedule', circuit));
            // RKS: 06-28-20 -- Turns out a schedule without any days that it is to run is perfectly valid.  The expectation is that it will never run.
            //if (schedType === 128 && schedDays === 0) return Promise.reject(new InvalidEquipmentDataError(`Invalid schedule days: ${schedDays}. You must supply days that the schedule is to run.`, 'Schedule', schedDays));

            // If we make it here we can make it anywhere.
            let runOnce = schedType !== 128 ? 129 : 128;
            if (startTimeType !== 0) runOnce |= (1 << (startTimeType + 1));
            if (endTimeType !== 0) runOnce |= (1 << (endTimeType + 3));
            // This was always the cooling setpoint for ultratemp.
            //let flags = (circuit === 1 || circuit === 6) ? 81 : 100;
            let out = Outbound.createMessage(168, [
                3
                , 0
                , id - 1 // IntelliCenter schedules start at 0.
                , startTime - Math.floor(startTime / 256) * 256
                , Math.floor(startTime / 256)
                , endTime - Math.floor(endTime / 256) * 256
                , Math.floor(endTime / 256)
                , circuit - 1
                , runOnce
                , schedDays
                , startDate.getMonth() + 1
                , startDate.getDate()
                , startDate.getFullYear() - 2000
                , heatSource
                , heatSetpoint
                , coolSetpoint
            ],
                0
            );
            return new Promise<Schedule>((resolve, reject) => {
                out.response = IntelliCenterBoard.getAckResponse(168);
                out.retries = 5;
                out.onComplete = (err, msg) => {
                    if (!err) {
                        sched = sys.schedules.getItemById(id, true);
                        ssched = state.schedules.getItemById(id, true);
                        sched.circuit = ssched.circuit = circuit;
                        sched.scheduleDays = ssched.scheduleDays = schedDays;
                        sched.scheduleType = ssched.scheduleType = schedType;
                        sched.heatSetpoint = ssched.heatSetpoint = heatSetpoint;
                        sched.coolSetpoint = ssched.coolSetpoint = coolSetpoint;
                        sched.heatSource = ssched.heatSource = heatSource;
                        sched.startTime = ssched.startTime = startTime;
                        sched.endTime = ssched.endTime = endTime;
                        sched.startTimeType = ssched.startTimeType = startTimeType;
                        sched.endTimeType = ssched.endTimeType = endTimeType;
                        sched.startDate = ssched.startDate = startDate;
                        sched.startMonth = startDate.getMonth() + 1;
                        sched.startYear = startDate.getFullYear();
                        sched.startDay = startDate.getDate();
                        ssched.startDate = startDate;
                        ssched.isActive = sched.isActive = true;
                        ssched.display = sched.display = display;
                        ssched.emitEquipmentChange();
                        resolve(sched);
                    }
                    else reject(err);
                };
                conn.queueSendMessage(out); // Send it off in a letter to yourself.
            });
        }
        else
            return Promise.reject(new InvalidEquipmentIdError('No schedule information provided', undefined, 'Schedule'));
    }
    public async deleteScheduleAsync(data: any): Promise<Schedule> {
        if (typeof data.id !== 'undefined') {
            let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
            if (isNaN(id) || id < 0) return Promise.reject(new InvalidEquipmentIdError(`Invalid schedule id: ${data.id}`, data.id, 'Schedule'));
            let sched = sys.schedules.getItemById(id);
            let ssched = state.schedules.getItemById(id);
            let startDate = sched.startDate;
            if (typeof startDate === 'undefined' || isNaN(startDate.getTime())) startDate = new Date();
            let out = Outbound.create({
                action: 168,
                payload: [
                    3
                    , 0
                    , id - 1 // IntelliCenter schedules start at 0.
                    , 0
                    , 0
                    , 0
                    , 0
                    , 255
                    , 0
                    , 0
                    , startDate.getMonth() + 1
                    , startDate.getDay() || 0
                    , startDate.getFullYear() - 2000
                    , 0 // This changed to 0 to mean no change in 1.047
                    , 78
                    , 100
                ],
                retries: 5,
                response: IntelliCenterBoard.getAckResponse(168)
            });
            return new Promise<Schedule>((resolve, reject) => {
                out.onComplete = (err, msg) => {
                    if (!err) {
                        sys.schedules.removeItemById(id);
                        state.schedules.removeItemById(id);
                        ssched.emitEquipmentChange();
                        ssched.isActive = sched.isActive = false;
                        resolve(sched);
                    }
                    else reject(err);
                };
                conn.queueSendMessage(out);
            });

        }
        else
            return Promise.reject(new InvalidEquipmentIdError('No schedule information provided', undefined, 'Schedule'));
    }
    // RKS: 06-24-20 - Need to talk to Russ.  This needs to go away and reconstituted in the async.
    public setSchedule(sched: Schedule, obj: any) { }
}
class IntelliCenterHeaterCommands extends HeaterCommands {
    private createHeaterConfigMessage(heater: Heater): Outbound {
        let out = Outbound.createMessage(
            168, [10, 0, heater.id, heater.type, heater.body, heater.differentialTemp, heater.startTempDelta, heater.stopTempDelta, heater.coolingEnabled ? 1 : 0,
                heater.cooldownDelay || 6, heater.address,
                //, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 // Name
                heater.efficiencyMode, heater.maxBoostTemp, heater.economyTime], 0);
        out.insertPayloadString(11, heater.name, 16);
        return out;
    }
    public setHeater(heater: Heater, obj?: any) {
        super.setHeater(heater, obj);
        let out = this.createHeaterConfigMessage(heater);
        conn.queueSendMessage(out);
    }
    public async setHeaterAsync(obj: any): Promise<Heater> {
        if (obj.master === 1 || parseInt(obj.id, 10) > 255) return super.setHeaterAsync(obj);
        return new Promise<Heater>((resolve, reject) => {
            let id = typeof obj.id === 'undefined' ? -1 : parseInt(obj.id, 10);
            if (isNaN(id)) return reject(new InvalidEquipmentIdError('Heater Id is not valid.', obj.id, 'Heater'));
            let heater: Heater;
            if (id <= 0) {
                // We are adding a heater.  In this case we need to find the first id slot that is empty.
                id = sys.heaters.getNextEquipmentId(new EquipmentIdRange(1, 16));
            }
            heater = sys.heaters.getItemById(id, false);
            let type = 0;
            if (typeof obj.type === 'undefined' && (heater.type === 0 || typeof heater.type === 'undefined')) return reject(new InvalidEquipmentDataError(`Heater type was not specified for new heater`, 'Heater', obj.type));
            else {
                // We only get here if the type was not previously defined.
                if (typeof obj.type === 'string' && isNaN(parseInt(obj.type, 10)))
                    type = sys.board.valueMaps.heaterTypes.getValue(obj.type);
                else
                    type = parseInt(obj.type, 10);
                if (!sys.board.valueMaps.heaterTypes.valExists(type)) return reject(new InvalidEquipmentDataError(`Heater type was not specified for new heater`, 'Heater', obj.type));
                heater.type = type;
            }
            let htype = sys.board.valueMaps.heaterTypes.transform(type);
            let address = heater.address || 112;
            if (htype.hasAddress) {
                if (typeof obj.address !== 'undefined') {
                    address = parseInt(obj.address, 10);
                    if (isNaN(address) || address < 112 || address > 128) return reject(new InvalidEquipmentDataError(`Invalid Heater address was specified`, 'Heater', obj.address));
                }
            }
            let differentialTemp = heater.differentialTemp || 6;
            if (typeof obj.differentialTemp !== 'undefined') {
                differentialTemp = parseInt(obj.differentialTemp, 10);
                if (isNaN(differentialTemp) || differentialTemp < 0) return reject(new InvalidEquipmentDataError(`Invalid Differential Temp was specified`, 'Heater', obj.differentialTemp));
            }
            let efficiencyMode = heater.efficiencyMode || 0;
            if (typeof obj.efficiencyMode !== 'undefined') {
                efficiencyMode = parseInt(obj.efficiencyMode, 10);
                if (isNaN(efficiencyMode) || efficiencyMode < 0) return reject(new InvalidEquipmentDataError(`Invalid Efficiency Mode was specified`, 'Heater', obj.efficiencyMode));
            }
            let maxBoostTemp = heater.maxBoostTemp || 0;
            if (typeof obj.maxBoostTemp !== 'undefined') {
                maxBoostTemp = parseInt(obj.maxBoostTemp, 10);
                if (isNaN(maxBoostTemp) || maxBoostTemp < 0) return reject(new InvalidEquipmentDataError(`Invalid Max Boost Temp was specified`, 'Heater', obj.maxBoostTemp));
            }
            let startTempDelta = heater.startTempDelta || 5;
            if (typeof obj.startTempDelta !== 'undefined') {
                startTempDelta = parseInt(obj.startTempDelta, 10);
                if (isNaN(startTempDelta) || startTempDelta < 0) return reject(new InvalidEquipmentDataError(`Invalid Start Temp Delta was specified`, 'Heater', obj.startTempDelta));
            }
            let stopTempDelta = heater.stopTempDelta || 3;
            if (typeof obj.stopTempDelta !== 'undefined') {
                stopTempDelta = parseInt(obj.stopTempDelta, 10);
                if (isNaN(stopTempDelta) || stopTempDelta < 0) return reject(new InvalidEquipmentDataError(`Invalid Stop Temp Delta was specified`, 'Heater', obj.stopTempDelta));
            }
            let economyTime = heater.economyTime || 1;
            if (typeof obj.economyTime !== 'undefined') {
                economyTime = parseInt(obj.economyTime, 10);
                if (isNaN(economyTime) || economyTime < 0) return reject(new InvalidEquipmentDataError(`Invalid Economy Time was specified`, 'Heater', obj.economyTime));
            }
            let body = heater.body || 0;
            if (typeof obj.body !== 'undefined') {
                body = parseInt(obj.body, 10);
                if (isNaN(obj.body) && typeof obj.body === 'string') body = sys.board.valueMaps.bodies.getValue(obj.body);
                if (typeof body === 'undefined' || isNaN(body)) return reject(new InvalidEquipmentDataError(`Invalid Body was specified`, 'Heater', obj.body));
            }
            if (htype.hasAddress) {
                if (isNaN(address) || address < 112 || address > 128) return reject(new InvalidEquipmentDataError(`Invalid Heater address was specified`, 'Heater', obj.address));
                for (let i = 0; i < sys.heaters.length; i++) {
                    let h = sys.heaters.getItemByIndex(i);
                    if (h.id === id) continue;
                    let t = sys.board.valueMaps.heaterTypes.transform(h.type);
                    if (!t.hasAddress) continue;
                    if (h.address === address) return reject(new InvalidEquipmentDataError(`Heater id# ${h.id} ${t.desc} is already communicating on this address.`, 'Heater', obj.address));
                }
            }
            let cooldownDelay = heater.cooldownDelay || 5;
            if (typeof obj.cooldownDelay !== 'undefined') {
                cooldownDelay = parseInt(obj.cooldownDelay, 10);
                if (isNaN(cooldownDelay) || cooldownDelay < 0 || cooldownDelay > 20) return reject(new InvalidEquipmentDataError(`Invalid cooldown delay was specified`, 'Heater', obj.cooldownDelay));
            }

            let out = Outbound.create({
                action: 168,
                payload: [10, 0, heater.id - 1,
                    type,
                    body,
                    cooldownDelay,
                    startTempDelta,
                    stopTempDelta,
                    (typeof obj.coolingEnabled !== 'undefined' ? utils.makeBool(obj.coolingEnabled) : utils.makeBool(heater.coolingEnabled)) ? 1 : 0,
                    differentialTemp,
                    address
                ],
                retries: 5,
                response: IntelliCenterBoard.getAckResponse(168)
            });
            out.appendPayloadString(obj.name || heater.name, 16);
            out.appendPayloadByte(efficiencyMode);
            out.appendPayloadByte(maxBoostTemp);
            out.appendPayloadByte(economyTime);
            out.onComplete = (err, msg) => {
                if (err) reject(err);
                else {
                    heater = sys.heaters.getItemById(heater.id, true);
                    let hstate = state.heaters.getItemById(heater.id, true);
                    hstate.type = heater.type = type;
                    heater.body = body;
                    heater.address = address;
                    hstate.name = heater.name = obj.name || heater.name;
                    heater.coolingEnabled = typeof obj.coolingEnabled !== 'undefined' ? utils.makeBool(obj.coolingEnabled) : utils.makeBool(heater.coolingEnabled);
                    heater.differentialTemp = differentialTemp;
                    heater.economyTime = economyTime;
                    heater.startTempDelta = startTempDelta;
                    heater.stopTempDelta = stopTempDelta;
                    heater.cooldownDelay = cooldownDelay;
                    sys.board.heaters.updateHeaterServices();
                    sys.board.heaters.syncHeaterStates();
                    resolve(heater);
                }

            };
            conn.queueSendMessage(out);

        });
    }
    public async deleteHeaterAsync(obj): Promise<Heater> {
        if (obj.master === 1 || parseInt(obj.id, 10) > 255) return await super.deleteHeaterAsync(obj);
        return new Promise<Heater>((resolve, reject) => {
            let id = parseInt(obj.id, 10);
            if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Cannot delete.  Heater Id is not valid.', obj.id, 'Heater'));
            let heater = sys.heaters.getItemById(id);
            let out = Outbound.create({
                action: 168,
                payload: [10, 0, heater.id - 1,
                    0,
                    1,
                    5,
                    5,
                    3,
                    0,
                    6,
                    112
                ],
                retries: 5,
                response: IntelliCenterBoard.getAckResponse(168)
            });
            out.appendPayloadString('', 16);
            out.appendPayloadByte(3);
            out.appendPayloadByte(5);
            out.appendPayloadByte(1);
            out.onComplete = (err, msg) => {
                if (err) reject(err);
                else {
                    heater.isActive = false;
                    sys.heaters.removeItemById(id);
                    state.heaters.removeItemById(id);
                    resolve(heater);
                }
            };
            conn.queueSendMessage(out);
        });
    }
    public updateHeaterServices() {
        let htypes = sys.board.heaters.getInstalledHeaterTypes();
        let solarInstalled = htypes.solar > 0;
        let heatPumpInstalled = htypes.heatpump > 0;
        let gasHeaterInstalled = htypes.gas > 0;
        let ultratempInstalled = htypes.ultratemp > 0;
        let mastertempInstalled = htypes.mastertemp > 0;


        // RKS: 09-26-20 This is a hack to maintain backward compatability with fw versions 1.04 and below.  Ultratemp is not
        // supported on 1.04 and below.
        if (parseFloat(sys.equipment.controllerFirmware) > 1.04) {
            // The heat mode options are
            // 1 = Off
            // 2 = Gas Heater
            // 3 = Solar Heater
            // 4 = Solar Preferred
            // 5 = UltraTemp Only
            // 6 = UltraTemp Preferred????  This might be 22
            // 9 = Heat Pump
            // 25 = Heat Pump Preferred
            // ?? = Hybrid


            // The heat source options are
            // 0 = No Change
            // 1 = Off
            // 2 = Gas Heater
            // 3 = Solar Heater
            // 4 = Solar Preferred
            // 5 = Heat Pump

            if (sys.heaters.length > 0) sys.board.valueMaps.heatSources = new byteValueMap([[1, { name: 'off', desc: 'Off' }]]);
            if (gasHeaterInstalled) sys.board.valueMaps.heatSources.merge([[2, { name: 'heater', desc: 'Heater' }]]);
            if (mastertempInstalled) sys.board.valueMaps.heatSources.merge([[11, { name: 'mtheater', desc: 'MasterTemp' }]]);
            if (solarInstalled && (gasHeaterInstalled || heatPumpInstalled)) sys.board.valueMaps.heatSources.merge([[3, { name: 'solar', desc: 'Solar Only', hasCoolSetpoint: htypes.hasCoolSetpoint }], [4, { name: 'solarpref', desc: 'Solar Preferred', hasCoolSetpoint: htypes.hasCoolSetpoint }]]);
            else if (solarInstalled) sys.board.valueMaps.heatSources.merge([[3, { name: 'solar', desc: 'Solar', hasCoolsetpoint: htypes.hasCoolSetpoint }]]);
            if (heatPumpInstalled && (gasHeaterInstalled || solarInstalled)) sys.board.valueMaps.heatSources.merge([[9, { name: 'heatpump', desc: 'Heatpump Only' }], [25, { name: 'heatpumppref', desc: 'Heat Pump Pref' }]]);
            else if (heatPumpInstalled) sys.board.valueMaps.heatSources.merge([[9, { name: 'heatpump', desc: 'Heat Pump' }]]);
            if (ultratempInstalled && (gasHeaterInstalled || heatPumpInstalled)) sys.board.valueMaps.heatSources.merge([[5, { name: 'ultratemp', desc: 'UltraTemp Only', hasCoolSetpoint: htypes.hasCoolSetpoint }], [6, { name: 'ultratemppref', desc: 'UltraTemp Pref', hasCoolSetpoint: htypes.hasCoolSetpoint }]]);
            else if (ultratempInstalled) sys.board.valueMaps.heatSources.merge([[5, { name: 'ultratemp', desc: 'UltraTemp', hasCoolSetpoint: htypes.hasCoolSetpoint }]]);
            sys.board.valueMaps.heatSources.merge([[0, { name: 'nochange', desc: 'No Change' }]]);

            sys.board.valueMaps.heatModes = new byteValueMap([[1, { name: 'off', desc: 'Off' }]]);
            if (gasHeaterInstalled) sys.board.valueMaps.heatModes.merge([[2, { name: 'heater', desc: 'Heater' }]]);
            if (mastertempInstalled) sys.board.valueMaps.heatModes.merge([[11, { name: 'mtheater', desc: 'MasterTemp' }]]);
            if (solarInstalled && (gasHeaterInstalled || heatPumpInstalled || mastertempInstalled)) sys.board.valueMaps.heatModes.merge([[3, { name: 'solar', desc: 'Solar Only' }], [4, { name: 'solarpref', desc: 'Solar Preferred' }]]);
            else if (solarInstalled) sys.board.valueMaps.heatModes.merge([[3, { name: 'solar', desc: 'Solar' }]]);
            if (ultratempInstalled && (gasHeaterInstalled || heatPumpInstalled || mastertempInstalled)) sys.board.valueMaps.heatModes.merge([[5, { name: 'ultratemp', desc: 'UltraTemp Only' }], [6, { name: 'ultratemppref', desc: 'UltraTemp Pref' }]]);
            else if (ultratempInstalled) sys.board.valueMaps.heatModes.merge([[5, { name: 'ultratemp', desc: 'UltraTemp' }]]);
            if (heatPumpInstalled && (gasHeaterInstalled || solarInstalled || mastertempInstalled)) sys.board.valueMaps.heatModes.merge([[9, { name: 'heatpump', desc: 'Heatpump Only' }], [25, { name: 'heatpumppref', desc: 'Heat Pump Preferred' }]]);
            else if (heatPumpInstalled) sys.board.valueMaps.heatModes.merge([[9, { name: 'heatpump', desc: 'Heat Pump' }]]);
        }
        else {
            sys.board.valueMaps.heatSources = new byteValueMap([[0, { name: 'off', desc: 'Off' }]]);
            if (gasHeaterInstalled) sys.board.valueMaps.heatSources.set(3, { name: 'heater', desc: 'Heater' });
            if (solarInstalled && (gasHeaterInstalled || heatPumpInstalled)) sys.board.valueMaps.heatSources.merge([[5, { name: 'solar', desc: 'Solar Only' }], [21, { name: 'solarpref', desc: 'Solar Preferred' }]]);
            else if(solarInstalled) sys.board.valueMaps.heatSources.set(5, { name: 'solar', desc: 'Solar' });
            if (heatPumpInstalled && (gasHeaterInstalled || solarInstalled)) sys.board.valueMaps.heatSources.merge([[9, { name: 'heatpump', desc: 'Heatpump Only' }], [25, { name: 'heatpumppref', desc: 'Heat Pump Pref' }]]);
            else if (heatPumpInstalled) sys.board.valueMaps.heatSources.set(9, { name: 'heatpump', desc: 'Heat Pump' });
            if (sys.heaters.length > 0) sys.board.valueMaps.heatSources.set(32, { name: 'nochange', desc: 'No Change' });

            sys.board.valueMaps.heatModes = new byteValueMap([[0, { name: 'off', desc: 'Off' }]]);
            if (gasHeaterInstalled) sys.board.valueMaps.heatModes.set(3, { name: 'heater', desc: 'Heater' });
            if (solarInstalled && (gasHeaterInstalled || heatPumpInstalled)) sys.board.valueMaps.heatModes.merge([[5, { name: 'solar', desc: 'Solar Only' }], [21, { name: 'solarpref', desc: 'Solar Preferred' }]]);
            else if (solarInstalled) sys.board.valueMaps.heatModes.set(5, { name: 'solar', desc: 'Solar' });
            if (heatPumpInstalled && (gasHeaterInstalled || solarInstalled)) sys.board.valueMaps.heatModes.merge([[9, { name: 'heatpump', desc: 'Heatpump Only' }], [25, { name: 'heatpumppref', desc: 'Heat Pump Preferred' }]]);
            else if (heatPumpInstalled) sys.board.valueMaps.heatModes.set(9, { name: 'heatpump', desc: 'Heat Pump' });
        }
        // Now set the body data.
        for (let i = 0; i < sys.bodies.length; i++) {
            let body = sys.bodies.getItemByIndex(i);
            let btemp = state.temps.bodies.getItemById(body.id, body.isActive !== false);
            let opts = sys.board.heaters.getInstalledHeaterTypes(body.id);
            btemp.heaterOptions = opts;
        }
        this.setActiveTempSensors();
    }

}
class IntelliCenterValveCommands extends ValveCommands {
    public async setValveAsync(obj?: any): Promise<Valve> {
        if (obj.master === 1) return super.setValveAsync(obj);
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Valve Id has not been defined', obj.id, 'Valve'));
        let valve = sys.valves.getItemById(id);
        // [255, 0, 255][165, 63, 15, 16, 168, 20][9, 0, 9, 2, 86, 97, 108, 118, 101, 32, 70, 0, 0, 0, 0, 0, 0, 0, 0, 0][4, 55]
        // RKS: The valve messages are a bit unique since they are 0 based instead of 1s based.  Our configuration includes
        // the ability to set these valves appropriately via the interface by subtracting 1 from the circuit and the valve id.  In
        // shared body systems there is a gap for the additional intake/return valves that exist in i10d.
        return new Promise<Valve>(function (resolve, reject) {
            let v = extend(true, valve.get(true), obj);
            let out = Outbound.create({
                action: 168,
                payload: [9, 0, v.id - 1, v.circuit - 1],
                response: IntelliCenterBoard.getAckResponse(168),
                retries: 5,
                onComplete: (err, msg) => {
                    if (err) reject(err);
                    else {
                        valve.name = v.name;
                        valve.circuit = v.circuit;
                        valve.type = v.type;
                        resolve(valve);
                    }
                }
            }).appendPayloadString(v.name, 16);
            conn.queueSendMessage(out);
        });
    }
}
export class IntelliCenterChemControllerCommands extends ChemControllerCommands {
    protected async setIntelliChemAsync(data: any): Promise<ChemController> {
        let chem = sys.board.chemControllers.findChemController(data);
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
        // Now lets do all our validation to the incoming chem controller data.
        let name = typeof data.name !== 'undefined' ? data.name : chem.name || `IntelliChem - ${address - 143}`;
        let type = sys.board.valueMaps.chemControllerTypes.transformByName('intellichem');
        // So now we are down to the nitty gritty setting the data for the REM Chem controller.
        let calciumHardness = typeof data.calciumHardness !== 'undefined' ? parseInt(data.calciumHardness, 10) : chem.calciumHardness;
        let cyanuricAcid = typeof data.cyanuricAcid !== 'undefined' ? parseInt(data.cyanuricAcid, 10) : chem.cyanuricAcid;
        let alkalinity = typeof data.alkalinity !== 'undefined' ? parseInt(data.alkalinity, 10) : chem.alkalinity;
        let borates = typeof data.borates !== 'undefined' ? parseInt(data.borates, 10) : chem.borates || 0;
        let body = sys.board.bodies.mapBodyAssociation(typeof data.body === 'undefined' ? chem.body : data.body);
        if (typeof body === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Invalid body assignment`, 'chemController', data.body || chem.body));
        // Do a final validation pass so we dont send this off in a mess.
        if (isNaN(calciumHardness)) return Promise.reject(new InvalidEquipmentDataError(`Invalid calcium hardness`, 'chemController', calciumHardness));
        if (isNaN(cyanuricAcid)) return Promise.reject(new InvalidEquipmentDataError(`Invalid cyanuric acid`, 'chemController', cyanuricAcid));
        if (isNaN(alkalinity)) return Promise.reject(new InvalidEquipmentDataError(`Invalid alkalinity`, 'chemController', alkalinity));
        if (isNaN(borates)) return Promise.reject(new InvalidEquipmentDataError(`Invalid borates`, 'chemController', borates));
        let schem = state.chemControllers.getItemById(chem.id, true);
        let pHSetpoint = typeof data.ph !== 'undefined' && typeof data.ph.setpoint !== 'undefined' ? parseFloat(data.ph.setpoint) : chem.ph.setpoint;
        let orpSetpoint = typeof data.orp !== 'undefined' && typeof data.orp.setpoint !== 'undefined' ? parseInt(data.orp.setpoint, 10) : chem.orp.setpoint;
        let lsiRange = typeof data.lsiRange !== 'undefined' ? data.lsiRange : chem.lsiRange || {};
        if (typeof data.lsiRange !== 'undefined') {
            if (typeof data.lsiRange.enabled !== 'undefined') lsiRange.enabled = utils.makeBool(data.lsiRange.enabled);
            if (typeof data.lsiRange.low === 'number') lsiRange.low = parseFloat(data.lsiRange.low);
            if (typeof data.lsiRange.high === 'number') lsiRange.high = parseFloat(data.lsiRange.high);
        }
        if (isNaN(pHSetpoint) || pHSetpoint > type.ph.max || pHSetpoint < type.ph.min) Promise.reject(new InvalidEquipmentDataError(`Invalid pH setpoint`, 'ph.setpoint', pHSetpoint));
        if (isNaN(orpSetpoint) || orpSetpoint > type.orp.max || orpSetpoint < type.orp.min) Promise.reject(new InvalidEquipmentDataError(`Invalid orp setpoint`, 'orp.setpoint', orpSetpoint));
        let phTolerance = typeof data.ph !== 'undefined' && typeof data.ph.tolerance !== 'undefined' ? data.ph.tolerance : chem.ph.tolerance;
        let orpTolerance = typeof data.orp !== 'undefined' && typeof data.orp.tolerance !== 'undefined' ? data.orp.tolerance : chem.orp.tolerance;
        if (typeof data.ph !== 'undefined' && typeof data.ph.tolerance !== 'undefined') {
            if (typeof data.ph.tolerance.enabled !== 'undefined') phTolerance.enabled = utils.makeBool(data.ph.tolerance.enabled);
            if (typeof data.ph.tolerance.low !== 'undefined') phTolerance.low = parseFloat(data.ph.tolerance.low);
            if (typeof data.ph.tolerance.high !== 'undefined') phTolerance.high = parseFloat(data.ph.tolerance.high);
            if (isNaN(phTolerance.low)) phTolerance.low = type.ph.min;
            if (isNaN(phTolerance.high)) phTolerance.high = type.ph.max;
        }
        if (typeof data.orp !== 'undefined' && typeof data.orp.tolerance !== 'undefined') {
            if (typeof data.orp.tolerance.enabled !== 'undefined') orpTolerance.enabled = utils.makeBool(data.orp.tolerance.enabled);
            if (typeof data.orp.tolerance.low !== 'undefined') orpTolerance.low = parseFloat(data.orp.tolerance.low);
            if (typeof data.orp.tolerance.high !== 'undefined') orpTolerance.high = parseFloat(data.orp.tolerance.high);
            if (isNaN(orpTolerance.low)) orpTolerance.low = type.orp.min;
            if (isNaN(orpTolerance.high)) orpTolerance.high = type.orp.max;
        }
        let phEnabled = typeof data.ph !== 'undefined' && typeof data.ph.enabled !== 'undefined' ? utils.makeBool(data.ph.enabled) : chem.ph.enabled;
        let orpEnabled = typeof data.orp !== 'undefined' && typeof data.orp.enabled !== 'undefined' ? utils.makeBool(data.orp.enabled) : chem.orp.enabled;
        let siCalcType = typeof data.siCalcType !== 'undefined' ? sys.board.valueMaps.siCalcTypes.encode(data.siCalcType, 0) : chem.siCalcType;

        let saltLevel = (state.chlorinators.length > 0) ? state.chlorinators.getItemById(1).saltLevel || 1000 : 1000
        chem.ph.tank.capacity = 6;
        chem.orp.tank.capacity = 6;
        let acidTankLevel = typeof data.ph !== 'undefined' && typeof data.ph.tank !== 'undefined' && typeof data.ph.tank.level !== 'undefined' ? parseInt(data.ph.tank.level, 10) : schem.ph.tank.level;
        let orpTankLevel = typeof data.orp !== 'undefined' && typeof data.orp.tank !== 'undefined' && typeof data.orp.tank.level !== 'undefined' ? parseInt(data.orp.tank.level, 10) : schem.orp.tank.level;
        //Them
        //[255, 0, 255][165, 63, 15, 16, 168, 20][8, 0, 0, 32, 1, 144, 1, 248, 2, 144, 1, 1, 1, 29, 0, 0, 0, 100, 0, 0][4, 135]
        //Us
        //[255, 0, 255][165,  0, 15, 33, 168, 20][8, 0, 0, 32, 1, 144, 1, 248, 2, 144, 1, 1, 1, 33, 0, 0, 0, 100, 0, 0][4, 93]
        return new Promise<ChemController>((resolve, reject) => {
            let out = Outbound.create({
                protocol: Protocol.Broadcast,
                action: 168,
                payload: [],
                retries: 3, // We are going to try 4 times.
                response: IntelliCenterBoard.getAckResponse(168),
                //onAbort: () => { },
                onComplete: (err) => {
                    if (err) reject(err);
                    else {
                        chem = sys.chemControllers.getItemById(data.id, true);
                        schem = state.chemControllers.getItemById(data.id, true);
                        chem.master = 0;
                        // Copy the data back to the chem object.
                        schem.name = chem.name = name;
                        schem.type = chem.type = sys.board.valueMaps.chemControllerTypes.encode('intellichem');
                        chem.calciumHardness = calciumHardness;
                        chem.cyanuricAcid = cyanuricAcid;
                        chem.alkalinity = alkalinity;
                        chem.borates = borates;
                        chem.body = schem.body = body;
                        schem.isActive = chem.isActive = true;
                        chem.lsiRange.enabled = lsiRange.enabled;
                        chem.lsiRange.low = lsiRange.low;
                        chem.lsiRange.high = lsiRange.high;
                        chem.ph.tolerance.enabled = phTolerance.enabled;
                        chem.ph.tolerance.low = phTolerance.low;
                        chem.ph.tolerance.high = phTolerance.high;
                        chem.orp.tolerance.enabled = orpTolerance.enabled;
                        chem.orp.tolerance.low = orpTolerance.low;
                        chem.orp.tolerance.high = orpTolerance.high;
                        chem.ph.setpoint = pHSetpoint;
                        chem.orp.setpoint = orpSetpoint;
                        schem.siCalcType = chem.siCalcType = siCalcType;
                        chem.address = schem.address = address;
                        chem.name = schem.name = name;
                        chem.flowSensor.enabled = false;
                        resolve(chem);
                    }
                }
            });
            
            //[8, 0, chem.id - 1, body.val, 1, chem.address, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0]
            out.insertPayloadBytes(0, 0, 20);
            out.setPayloadByte(0, 8);
            out.setPayloadByte(1, 0);
            out.setPayloadByte(2, chem.id - 1);
            out.setPayloadByte(3, body.val);
            out.setPayloadByte(4, acidTankLevel + 1);
            out.setPayloadByte(5, address);
            out.setPayloadByte(6, 1);
            out.setPayloadInt(7, Math.round(pHSetpoint * 100), 700);
            out.setPayloadInt(9, orpSetpoint, 400);
            out.setPayloadByte(11, 1);
            out.setPayloadByte(12, 1);
            //out.setPayloadByte(11, acidTankLevel + 1, 1);
            //out.setPayloadByte(12, orpTankLevel + 1, 1);

            out.setPayloadInt(13, calciumHardness, 25);
            out.setPayloadInt(15, cyanuricAcid, 0);
            out.setPayloadInt(17, alkalinity, 25);
            conn.queueSendMessage(out);
        });
    }
    public async deleteChemControllerAsync(data: any): Promise<ChemController> {
        let id = typeof data.id !== 'undefined' ? parseInt(data.id, 10) : -1;
        if (typeof id === 'undefined' || isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid Chem Controller Id`, id, 'chemController'));
        let chem = sys.chemControllers.getItemById(id);
        if (chem.master === 1) return super.deleteChemControllerAsync(data);
        return new Promise<ChemController>((resolve, reject) => {
            let out = Outbound.create({
                action: 168,
                response: IntelliCenterBoard.getAckResponse(168),
                retries: 3,
                payload: [8, 0, id - 1, 0, 1, chem.address || 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0],
                onComplete: (err) => {
                    if (err) { reject(err); }
                    else {
                        let schem = state.chemControllers.getItemById(id);
                        chem.isActive = false;
                        chem.ph.tank.capacity = chem.orp.tank.capacity = 6;
                        chem.ph.tank.units = chem.orp.tank.units = '';
                        schem.isActive = false;
                        sys.chemControllers.removeItemById(id);
                        state.chemControllers.removeItemById(id);
                        resolve(chem);
                    }
                }
            });
            out.setPayloadInt(7, Math.round(chem.ph.setpoint * 100), 700);
            out.setPayloadInt(9, chem.orp.setpoint, 400);
            out.setPayloadInt(13, chem.calciumHardness, 25);
            out.setPayloadInt(15, chem.cyanuricAcid, 0);
            conn.queueSendMessage(out);
        });
    }
    //public async setChemControllerAsync(data: any): Promise<ChemController> {
    //    // This is a combined chem config/state setter.
    //    let isVirtual = utils.makeBool(data.isVirtual);
    //    let type = parseInt(data.type, 10);
    //    if (isNaN(type) && typeof data.type === 'string')
    //        type = sys.board.valueMaps.chemControllerTypes.getValue(data.type);
    //    let isAdd = false;
    //    let chem: ChemController;
    //    let id = typeof data.id !== 'undefined' ? parseInt(data.id, 10) : -1;
    //    let address = typeof data.address !== 'undefined' ? parseInt(data.address, 10) : undefined;
    //    if (typeof id === 'undefined' || isNaN(id) || id <= 0) {
    //        id = sys.chemControllers.nextAvailableChemController();
    //        isAdd = true;
    //    }
    //    if (isAdd && sys.chemControllers.length >= sys.equipment.maxChemControllers) return Promise.reject(new InvalidEquipmentIdError(`Max chem controller id exceeded`, id, 'chemController'));
    //    chem = sys.chemControllers.getItemById(id, false); // Don't add it yet if it doesn't exist we will commit later after the OCP responds.
    //    if (isVirtual || chem.isVirtual || type !== 2) return super.setChemControllerAsync(data); // Fall back to the world of the virtual chem controller.
    //    if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid chemController id: ${data.id}`, data.id, 'ChemController'));
    //    let pHSetpoint = typeof data.pHSetpoint !== 'undefined' ? parseFloat(data.pHSetpoint) : chem.ph.setpoint;
    //    let orpSetpoint = typeof data.orpSetpoint !== 'undefined' ? parseInt(data.orpSetpoint, 10) : chem.orp.setpoint;
    //    let calciumHardness = typeof data.calciumHardness !== 'undefined' ? parseInt(data.calciumHardness, 10) : chem.calciumHardness;
    //    let cyanuricAcid = typeof data.cyanuricAcid !== 'undefined' ? parseInt(data.cyanuricAcid, 10) : chem.cyanuricAcid;
    //    let alkalinity = typeof data.alkalinity !== 'undefined' ? parseInt(data.alkalinity, 10) : chem.alkalinity;
    //    if (isAdd) { // Required fields and defaults.
    //        if (typeof type === 'undefined' || isNaN(type)) return Promise.reject(new InvalidEquipmentDataError(`A valid controller controller type was not supplied`, 'chemController', data.type));
    //        if (typeof address === 'undefined' || isNaN(address)) return Promise.reject(new InvalidEquipmentDataError(`A valid controller address was not supplied`, 'chemController', data.address));
    //        if (typeof pHSetpoint === 'undefined') pHSetpoint = 7;
    //        if (typeof orpSetpoint === 'undefined') orpSetpoint = 400;
    //        if (typeof calciumHardness === 'undefined') calciumHardness = 25;
    //        if (typeof cyanuricAcid === 'undefined') cyanuricAcid = 0;
    //        if (typeof data.body === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`The assigned body was not supplied`, 'chemController', data.body));
    //    }
    //    else {
    //        if (typeof address === 'undefined' || isNaN(address)) address = chem.address;
    //        if (typeof pHSetpoint === 'undefined') pHSetpoint = chem.ph.setpoint;
    //        if (typeof orpSetpoint === 'undefined') orpSetpoint = chem.orp.setpoint;
    //        if (typeof calciumHardness === 'undefined') calciumHardness = chem.calciumHardness;
    //        if (typeof cyanuricAcid === 'undefined') cyanuricAcid = chem.cyanuricAcid;
    //    }
    //    if (typeof address === 'undefined' || (address < 144 || address > 158)) return Promise.reject(new InvalidEquipmentDataError(`Invalid chem controller address`, 'chemController', address));
    //    if (typeof pHSetpoint === 'undefined' || (pHSetpoint > 7.6 || pHSetpoint < 7)) return Promise.reject(new InvalidEquipmentDataError(`Invalid pH setpoint (7 - 7.6)`, 'chemController', pHSetpoint));
    //    if (typeof orpSetpoint === 'undefined' || (orpSetpoint > 800 || orpSetpoint < 400)) return Promise.reject(new InvalidEquipmentDataError(`Invalid ORP setpoint (400 - 800)`, 'chemController', orpSetpoint));
    //    if (typeof calciumHardness === 'undefined' || (calciumHardness > 800 || calciumHardness < 25)) return Promise.reject(new InvalidEquipmentDataError(`Invalid Calcium Hardness (25 - 800)`, 'chemController', calciumHardness));
    //    if (typeof cyanuricAcid === 'undefined' || (cyanuricAcid > 201 || cyanuricAcid < 0)) return Promise.reject(new InvalidEquipmentDataError(`Invalid Cyanuric Acid (0 - 201)`, 'chemController', cyanuricAcid));
    //    let body = sys.board.bodies.mapBodyAssociation(typeof data.body === 'undefined' ? chem.body : data.body);
    //    if (typeof body === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Invalid body assignment`, 'chemController', data.body || chem.body));
    //    let name = (typeof data.name !== 'string') ? chem.name || 'IntelliChem' + id : data.name;
        
    //    return new Promise<ChemController>(async (resolve, reject) => {
    //        let out = Outbound.create({
    //            action: 168,
    //            response: IntelliCenterBoard.getAckResponse(168),
    //            retries: 3,
    //            payload: [8, 0, id - 1, body.val, 1, address, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0],
    //            onComplete: (err) => {
    //                if (err) { reject(err); }
    //                else {
    //                    chem = sys.chemControllers.getItemById(id, true);
    //                    let cstate = state.chemControllers.getItemById(id, true);
    //                    chem.isActive = true;
    //                    chem.isVirtual = false;
    //                    chem.address = address;
    //                    chem.body = body;
    //                    chem.calciumHardness = calciumHardness;
    //                    chem.orp.setpoint = orpSetpoint;
    //                    chem.ph.setpoint = pHSetpoint;
    //                    chem.cyanuricAcid = cyanuricAcid;
    //                    chem.alkalinity = alkalinity;
    //                    chem.type = 2;
    //                    chem.name = name;
    //                    chem.ph.tank.capacity = chem.orp.tank.capacity = 6;
    //                    chem.ph.tank.units = chem.orp.tank.units = '';
    //                    cstate.body = chem.body;
    //                    cstate.address = chem.address;
    //                    cstate.name = chem.name;
    //                    cstate.type = chem.type;
    //                    cstate.isActive = chem.isActive;
    //                    resolve(chem);
    //                }
    //            }
    //        });
    //        out.setPayloadInt(7, Math.round(pHSetpoint * 100), 700);
    //        out.setPayloadInt(9, orpSetpoint, 400);
    //        out.setPayloadInt(13, calciumHardness, 25);
    //        out.setPayloadInt(15, cyanuricAcid, 0);
    //        out.setPayloadInt(17, alkalinity, 25);
    //        conn.queueSendMessage(out);

    //    });
    //}
}

enum ConfigCategories {
    options = 0,
    circuits = 1,
    features = 2,
    schedules = 3,
    pumps = 4,
    remotes = 5,
    circuitGroups = 6,
    chlorinators = 7,
    intellichem = 8,
    valves = 9,
    heaters = 10,
    security = 11,
    general = 12,
    equipment = 13,
    covers = 14,
    systemState = 15
}

