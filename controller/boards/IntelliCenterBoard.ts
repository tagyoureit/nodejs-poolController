/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020, 2021, 2022.  
Russell Goldin, tagyoureit.  russ.goldin@gmail.com

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
import { SystemBoard, byteValueMap, byteValueMaps, ConfigQueue, ConfigRequest, CircuitCommands, FeatureCommands, ChlorinatorCommands, PumpCommands, BodyCommands, ScheduleCommands, HeaterCommands, EquipmentIdRange, ValveCommands, SystemCommands, ChemControllerCommands, CoverCommands, RemoteCommands } from './SystemBoard';
import { PoolSystem, Body, Schedule, Pump, ConfigVersion, sys, Heater, ICircuitGroup, LightGroupCircuit, LightGroup, ExpansionPanel, ExpansionModule, ExpansionModuleCollection, Valve, General, Options, Location, Owner, ICircuit, Feature, CircuitGroup, ChemController, TempSensorCollection, Chlorinator, Cover, Remote } from '../Equipment';
import { Protocol, Outbound, Inbound, Message, Response } from '../comms/messages/Messages';
import { conn } from '../comms/Comms';
import { icws } from '../comms/IntelliCenterWS';
import { logger } from '../../logger/Logger';
import { state, ChlorinatorState, LightGroupState, VirtualCircuitState, ICircuitState, BodyTempState, CircuitGroupState, ICircuitGroupState, ChemControllerState } from '../State';
import { utils, ControllerType } from '../../controller/Constants';
import { InvalidEquipmentIdError, InvalidEquipmentDataError, EquipmentNotFoundError, MessageError, InvalidOperationError } from '../Errors';
import { ncp } from '../nixie/Nixie';
import { Timestamp } from "../Constants"
const INTELLICENTER_MAX_NAME_LENGTH = 15;
const normalizeIntelliCenterName = (name: any, fallback: string = ''): string => {
    const source = typeof name !== 'undefined' ? name : fallback || '';
    return source.toString().substring(0, INTELLICENTER_MAX_NAME_LENGTH);
};
export class IntelliCenterBoard extends SystemBoard {
    private static readonly DEFAULT_REGISTRATION_DEVICE_ID = [2, 110, 106, 115, 80, 67];
    private static readonly ICP_REGISTRATION_DEVICE_TYPE = 1;
    private static readonly ICP_REGISTRATION_TRAILER = [1, 0, 10];
    private static readonly UNREGISTERED_ANNOUNCE_INTERVAL_MS = 5000;
    private static readonly REGISTERED_ANNOUNCE_INTERVAL_MS = 300000;
    private static readonly REGISTRATION_STATUS_TIMEOUT_MS = 2500;
    private static readonly REGISTRATION_STATUS_POLL_MS = 100;
    private static readonly REGISTRATION_MAX_ATTEMPTS = 4;
    private static readonly STATE_POLL_INTERVAL_MS = 4000;
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
        this.equipmentIds.virtualCircuits.start = 234;
        this.valueMaps.panelModes = new byteValueMap([
            [0, { val: 0, name: 'auto', desc: 'Auto' }],
            [1, { val: 1, name: 'service', desc: 'Service' }],
            [2, { val: 2, name: 'timeout', desc: 'Timeout' }],
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
            [8, { name: 'eti250', desc: 'ETI250', hasAddress: true }],
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
            [255, { name: 'i5x', part: '522033', desc: 'i5x Expansion Module', circuits: 5 }] // This does not actually map to a known value at this point but we do know it will be > 6.
        ]);

        this.valueMaps.virtualCircuits = new byteValueMap([
            [234, { name: 'heatPump', desc: 'Heat Pump', assignableToPumpCircuit: true }],
            [235, { name: 'ultraTemp', desc: 'UltraTemp', assignableToPumpCircuit: true }],
            [236, { name: 'hybrid', desc: 'Hybrid', assignableToPumpCircuit: true }],
            [237, { name: 'heatBoost', desc: 'Heat Boost', assignableToPumpCircuit: false }],
            [238, { name: 'heatEnable', desc: 'Heat Enable', assignableToPumpCircuit: false }],
            [239, { name: 'pumpSpeedUp', desc: 'Pump Speed +', assignableToPumpCircuit: false }],
            [240, { name: 'pumpSpeedDown', desc: 'Pump Speed -', assignableToPumpCircuit: false }],
            [244, { name: 'poolHeater', desc: 'Pool Heater', assignableToPumpCircuit: true }],
            [245, { name: 'spaHeater', desc: 'Spa Heater', assignableToPumpCircuit: true }],
            [246, { name: 'freeze', desc: 'Freeze', assignableToPumpCircuit: true }],
            [247, { name: 'poolSpa', desc: 'Pool/Spa', assignableToPumpCircuit: true }],
            [248, { name: 'solarHeat', desc: 'Solar Heat', assignableToPumpCircuit: false }],
            [251, { name: 'heater', desc: 'Heater', assignableToPumpCircuit: true }],
            [252, { name: 'solar', desc: 'Solar', assignableToPumpCircuit: true }],
            [255, { name: 'poolHeatEnable', desc: 'Pool Heat Enable', assignableToPumpCircuit: false }],
            [258, { name: 'anyHeater', desc: 'Any Heater', assignableToPumpCircuit: false }]
        ]);
        this.valueMaps.msgBroadcastActions.merge([
            [1, { name: 'ack', desc: 'Command Ack' }],
            [30, { name: 'config', desc: 'Configuration' }],
            [164, { name: 'getconfig', desc: 'Get Configuration' }],
            [168, { name: 'setdata', desc: 'Set Data' }],
            [204, { name: 'stateext', desc: 'State Extension' }],
            [222, { name: 'getdata', desc: 'Get Data' }],
            [228, { name: 'getversions', desc: 'Get Versions' }]
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
            [0, { name: 'white', desc: 'White', sequence: 11, types: ['intellibrite', 'magicstream'] }],
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
            [3, { name: 'hpheat', desc: 'Heating' }],
            [4, { name: 'utheat', desc: 'Heating' }],
            [5, { name: 'hybheat', desc: 'Heating' }],
            [6, { name: 'mtheat', desc: 'Heater' }],
            [7, { name: 'meheat', desc: 'Heater' }],
            [8, { name: 'eti250heat', desc: 'Heating' }],
            [9, { name: 'utcool', desc: 'Cooling' }]
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
    private _announceDeviceInterval?: NodeJS.Timeout;
    private _announceDeviceTickInFlight: boolean = false;
    private _announceDeviceLastSentMs: number = 0;
    private _registrationBootstrapStarted: boolean = false;
    private _runtimeRegistrationAddress?: number;
    private _statePollTimer?: NodeJS.Timeout;
    private _statePollInFlight: boolean = false;
    public system: IntelliCenterSystemCommands = new IntelliCenterSystemCommands(this);
    public circuits: IntelliCenterCircuitCommands = new IntelliCenterCircuitCommands(this);
    public features: IntelliCenterFeatureCommands = new IntelliCenterFeatureCommands(this);
    public chlorinator: IntelliCenterChlorinatorCommands = new IntelliCenterChlorinatorCommands(this);
    public bodies: IntelliCenterBodyCommands = new IntelliCenterBodyCommands(this);
    public pumps: IntelliCenterPumpCommands = new IntelliCenterPumpCommands(this);
    public schedules: IntelliCenterScheduleCommands = new IntelliCenterScheduleCommands(this);
    public heaters: IntelliCenterHeaterCommands = new IntelliCenterHeaterCommands(this);
    public valves: IntelliCenterValveCommands = new IntelliCenterValveCommands(this);
    public covers: IntelliCenterCoverCommands = new IntelliCenterCoverCommands(this);
    public remotes: IntelliCenterRemoteCommands = new IntelliCenterRemoteCommands(this);
    public alerts: IntelliCenterAlertCommands = new IntelliCenterAlertCommands(this);
    public chemControllers: IntelliCenterChemControllerCommands = new IntelliCenterChemControllerCommands(this);
    public reloadConfig() {
        //sys.resetSystem();
        sys.configVersion.clear();
        state.status = 0;
        this.needsConfigChanges = true;
        console.log('RESETTING THE CONFIGURATION');
        this.modulesAcquired = false;
    }
    protected startAnnounceDeviceInterval(): void {
        if (this._announceDeviceInterval) return;

        this._announceDeviceInterval = setInterval(async () => {
            if (this._announceDeviceTickInFlight) return;
            if (icws && icws.enabled && icws.isOpen) return;
            const now = Date.now();
            const minInterval = state.equipment.registration === 1
                ? IntelliCenterBoard.REGISTERED_ANNOUNCE_INTERVAL_MS
                : IntelliCenterBoard.UNREGISTERED_ANNOUNCE_INTERVAL_MS;
            if (now - this._announceDeviceLastSentMs < minInterval) return;
            this._announceDeviceTickInFlight = true;
            try {
                await this.announceDevice();
            } catch (err) {
                logger.warn(`announceDevice interval tick failed: ${err?.message || err}`);
            } finally {
                this._announceDeviceTickInFlight = false;
            }
        }, IntelliCenterBoard.UNREGISTERED_ANNOUNCE_INTERVAL_MS);
    }
    private stopAnnounceDeviceInterval(): void {
        if (this._announceDeviceInterval) {
            clearInterval(this._announceDeviceInterval);
            this._announceDeviceInterval = undefined;
        }
        this._announceDeviceTickInFlight = false;
        this._announceDeviceLastSentMs = 0;
    }
    protected startStatePoll(): void {
        if (this._statePollTimer) return;
        this._statePollTimer = setInterval(async () => {
            if (this._statePollInFlight) return;
            if (this._configQueue._processing) return;
            if (icws && icws.enabled && icws.isOpen) return;
            this._statePollInFlight = true;
            try {
                const source = this.getRegistrationAddress();
                const out = Outbound.create({
                    source,
                    dest: 16,
                    action: 222,
                    payload: [15, 0],
                    retries: 0,
                    response: Response.create({ dest: source, action: 30, payload: [15] })
                });
                await out.sendAsync();
            } catch (err) {
                // Non-critical — next poll will retry
            } finally {
                this._statePollInFlight = false;
            }
        }, IntelliCenterBoard.STATE_POLL_INTERVAL_MS);
    }
    private stopStatePoll(): void {
        if (this._statePollTimer) {
            clearInterval(this._statePollTimer);
            this._statePollTimer = undefined;
        }
        this._statePollInFlight = false;
    }
    private async sleepAsync(ms: number): Promise<void> {
        return await new Promise(resolve => setTimeout(resolve, ms));
    }
    private async waitForRegistrationStatusAsync(timeoutMs = IntelliCenterBoard.REGISTRATION_STATUS_TIMEOUT_MS): Promise<boolean> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (state.equipment.registration === 1) return true;
            await this.sleepAsync(IntelliCenterBoard.REGISTRATION_STATUS_POLL_MS);
        }
        return state.equipment.registration === 1;
    }
    protected async ensureRegisteredAsync(): Promise<void> {

        state.equipment.registration = 0;

        for (let attempt = 1; attempt <= IntelliCenterBoard.REGISTRATION_MAX_ATTEMPTS; attempt++) {
            try {
                await this.announceDevice();
            } catch (err) {
                logger.warn(`Action 251 registration attempt ${attempt}/${IntelliCenterBoard.REGISTRATION_MAX_ATTEMPTS} failed: ${err?.message || err}`);
            }

            if (await this.waitForRegistrationStatusAsync()) return;

            const reg = state.equipment.registration;
            const regLabel = reg === 4 ? 'status=4 (stale/needs-reauth)' : `status=${reg}`;
            if (attempt < IntelliCenterBoard.REGISTRATION_MAX_ATTEMPTS) {
                logger.info(`IntelliCenter v3 registration attempt ${attempt}/${IntelliCenterBoard.REGISTRATION_MAX_ATTEMPTS} did not reach Action 217 status=1 (${regLabel}); retrying Action 251`);
                await this.sleepAsync(IntelliCenterBoard.UNREGISTERED_ANNOUNCE_INTERVAL_MS);
            }
        }

        throw new Error(`IntelliCenter v3 registration never reached Action 217 status=1 (last status=${state.equipment.registration})`);
    }
    protected startRegistrationBootstrapAsync(): void {
        if (this._registrationBootstrapStarted) return;
        this._registrationBootstrapStarted = true;
        this.ensureRegisteredAsync().catch((err) => {
            logger.warn(`IntelliCenter v3 registration bootstrap failed: ${err?.message || err}`);
        });
    }
    private shouldConvergeToFirstIcpAddress(profileAddress: number, profileDeviceType: number, deviceAddress: number, payloadDeviceType: number, status: number): boolean {
        return profileAddress === 33 &&
            deviceAddress === 32 &&
            profileDeviceType === IntelliCenterBoard.ICP_REGISTRATION_DEVICE_TYPE &&
            payloadDeviceType === IntelliCenterBoard.ICP_REGISTRATION_DEVICE_TYPE &&
            status === 1;
    }
    private setRuntimeRegistrationAddress(address: number, reason: string): void {
        const normalizedAddress = Math.max(0, Math.min(255, Math.trunc(address)));
        if (this._runtimeRegistrationAddress === normalizedAddress && Message.pluginAddress === normalizedAddress) return;
        this._runtimeRegistrationAddress = normalizedAddress;
        Message.setPluginAddress(normalizedAddress, reason);
    }
    private getRegistrationProfile(): { address: number; deviceType: number; registrationIdentity: number[]; reserved: number[]; trailer: number[]; } {
        return {
            address: this._runtimeRegistrationAddress ?? Message.pluginAddress,
            deviceType: IntelliCenterBoard.ICP_REGISTRATION_DEVICE_TYPE,
            registrationIdentity: [...IntelliCenterBoard.DEFAULT_REGISTRATION_DEVICE_ID],
            reserved: [0, 0, 0, 0],
            trailer: [...IntelliCenterBoard.ICP_REGISTRATION_TRAILER]
        };
    }
    public getRegistrationAddress(): number {
        return this.getRegistrationProfile().address;
    }
    public isOwnRegistrationPayload(payload: number[], payloadOffset = 7): boolean {
        const profile = this.getRegistrationProfile();
        if (!Array.isArray(payload) || payload.length < payloadOffset + profile.registrationIdentity.length) return false;
        for (let i = 0; i < profile.registrationIdentity.length; i++) {
            if (payload[payloadOffset + i] !== profile.registrationIdentity[i]) return false;
        }
        return true;
    }
    public isOwnHeartbeatPayload(payload: number[]): boolean {
        return this.isOwnRegistrationPayload(payload, 0);
    }
    public processRegistrationMessage(msg: Inbound): boolean {
        if (!this.isOwnRegistrationPayload(msg.payload)) return false;

        const profile = this.getRegistrationProfile();
        const deviceAddress = msg.extractPayloadByte(0);
        const payloadDeviceType = msg.extractPayloadByte(1, 0);
        const registrationStatus = msg.payload.length > 2 ? msg.extractPayloadByte(2) : -1;

        if (this.shouldConvergeToFirstIcpAddress(profile.address, profile.deviceType, deviceAddress, payloadDeviceType, registrationStatus)) {
            logger.warn(`IntelliCenter v3 first ICP registration converged from device ${profile.address} to device ${deviceAddress}. Queue processing: ${this._configQueue._processing}`);
            this.setRuntimeRegistrationAddress(deviceAddress, 'IntelliCenter first ICP registration');
            if (this._configQueue._processing) {
                logger.warn(`Address changed mid-config-load; resetting queue and restarting config with new address ${deviceAddress}`);
                this._configQueue.abort();
                state.status = 1;
                state.emitControllerChange();
                setTimeout(() => { this.checkConfiguration(); }, 500);
            }
        }

        const expectedAddress = this.getRegistrationAddress();
        if (deviceAddress !== expectedAddress) {
            logger.warn(`Ignoring IntelliCenter v3 Action ${msg.action} for matching MAC on device ${deviceAddress}; expected device ${expectedAddress}.`);
            return false;
        }
        if (msg.action === 217 && msg.payload.length > 2) {
            this.setRegistrationStatus(registrationStatus);
        }
        return true;
    }
    public async announceDevice(): Promise<void> {
        // v3.004 registration (251→253/217) is needed for heartbeat identity/session health,
        // but config bootstrap (228→164→222/30) can begin before registration fully settles.
        // In mock mode we still want to "send" the packet so it is logged/emitted like a real write.

        this._announceDeviceLastSentMs = Date.now();
        logger.info('Announcing device to IntelliCenter v3...');
        // Action 251 payload structure (22 bytes total) verified from wireless remote cradle reset:
        // [0]:      Device address (33 for njsPC)
        // [1]:      Device type (1=ICP/Wired panel profile, 0=wireless profile)
        // [2]:      Registration flag (njsPC still sends 0 as its registration request; live wireless
        //           boot also showed device-originated 251 packets with byte 2 = 1, so treat this field
        //           as device/session-specific rather than a universal "request vs response" switch)
        // [3-6]:    Reserved (zeros)
        // [7-12]:   Device identifier (6 bytes - must(?) be valid MAC address format!)
        //           Using locally-administered MAC: 02:6E:6A:73:50:43 = [2, 110, 106, 115, 80, 67]
        //           0x02 prefix = locally-administered, unicast (IEEE standard)
        //           Remaining bytes = "njsPC" in ASCII for identification
        // [13-16]:  Reserved (zeros)
        // [17-18]:  Firmware version (major, minor)
        // [19-21]:  Device trailer bytes (live 3.008 captures show 1,0,10 for ICP/WL 251)
        const profile = this.getRegistrationProfile();
        const fwMajor = parseInt(sys.equipment.controllerFirmware || "3") || 3;
        const fwMinor = Math.round((parseFloat(sys.equipment.controllerFirmware || "3.0") % 1) * 1000);
        const out: Outbound = Outbound.create({
            source: profile.address,
            dest: 16,  // MUST send to OCP (16), not broadcast (15)
            action: 251,
            scope: 'v3Registration',
            payload: [
                profile.address,        // [0] Device address
                profile.deviceType,     // [1] Device type
                0,                      // [2] Registration flag (0=requesting, 1=registered, 4=stale/needs-reauth)
                ...profile.reserved,    // [3-6] Reserved / panel-type flags
                ...profile.registrationIdentity,               // [7-12] Device identity bytes
                0, 0, 0, 0,            // [13-16] Reserved
                fwMajor, fwMinor,      // [17-18] Firmware version
                ...profile.trailer      // [19-21] Device trailer bytes
            ],
            retries: 0,
            response: false
        });
        await out.sendAsync();
        logger.silly('Device registration request sent, awaiting confirmation via Action 217');
    }
    public setRegistrationStatus(status: number) {
        // Called when we receive Action 217 showing our registration status
        // status: 0=unknown, 1=registered, 4=stale/needs-reauth
        // NOTE: status=4 is NOT a rejection. OCP continues heartbeat with status=4 devices.
        // Devices can transition from status=4 to status=1 on retry.
        // Observed: Wireless remote sometimes shows status=4 then status=1 on next registration.
        if (state.equipment.registration !== status) {
            state.equipment.registration = status;
            if (status === 1) {
                logger.silly('Registration confirmed by OCP via Action 217 (status=1)');
            } else if (status === 4) {
                logger.info('Registration status=4 from OCP via Action 217 - device may need re-registration');
            }
        }
    }
    public async checkConfiguration() {
        (sys.board as IntelliCenterBoard).needsConfigChanges = true;
        try {
            // v3.x: Wireless/ICP traffic is unicast to OCP (16) and includes 228→164 (version table) with ACK(164).
            if (parseFloat(sys.equipment.controllerFirmware || "0") >= 3.0) {
                // ISSUE-003: don't block startup config polling on registration completion.
                // Start registration attempts in the background and send Action 228 immediately.
                this.startRegistrationBootstrapAsync();
                await this.requestVersionsAsync(16);
            } else {
                // v1.x: keep existing behavior unchanged
                console.log('Checking IntelliCenter configuration...');
                await this.requestVersionsAsync(15);
            }
        }
        catch (err) {
            logger.warn(`checkConfiguration failed: ${err.message}`);
        }
    }
    public isConfigQueueProcessing(): boolean {
        return this._configQueue._processing;
    }
    public signalConfigRefreshNeeded(): void {
        this._configQueue._newRequest = true;
        this.needsConfigChanges = true;
    }
    public requestConfiguration(ver: ConfigVersion) {
        if (this.needsConfigChanges) {
            logger.info(`Requesting IntelliCenter configuration`);
            this._configQueue.queueChanges(ver);
            this.needsConfigChanges = false;
        } else {
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

    protected async requestVersionsAsync(dest: number): Promise<void> {
        const registrationAddress = this.getRegistrationAddress();
        const verReq = Outbound.create({
            source: registrationAddress,
            dest,
            action: 228,
            scope: 'v3VersionSync',
            payload: [0],
            retries: 3,
            // v3.004+: require the version response (164) to be addressed to us (not to Wireless).
            response: Response.create({ dest: registrationAddress, action: 164 })
        });
        await verReq.sendAsync();
        await Outbound.create({ source: registrationAddress, dest: 16, action: 1, payload: [164], retries: 0 }).sendAsync();
    }
    public async stopAsync() {
        this.stopAnnounceDeviceInterval();
        this.stopStatePoll();
        this._registrationBootstrapStarted = false;
        this._runtimeRegistrationAddress = undefined;
        this._configQueue.close();
        return super.stopAsync();
    }
    private _v3ValueMapsApplied = false;
    public applyV3ValueMapOverrides(): void {
        if (this._v3ValueMapsApplied) return;
        this._v3ValueMapsApplied = true;
        this.valueMaps.circuitFunctions.merge([
            [11, { name: 'floorcleaner', desc: 'Floor Cleaner 1', body: 2 }]
        ]);
    }
    public getAlertDefinitions(): { [key: string]: { bit: number; name: string; desc: string }[] } {
        return {
            circuits: [
                { bit: 0, name: 'valveRotationDelay', desc: 'Valve Rotation Delay' },
                { bit: 1, name: 'heaterCooldownDelay', desc: 'Heater Cooldown Delay' }
            ],
            pumps: [
                { bit: 0, name: 'driveTemperature', desc: 'Drive Temperature' },
                { bit: 1, name: 'primingAlarm', desc: 'Priming Alarm' },
                { bit: 2, name: 'driveOverTemperature', desc: 'Drive Over Temperature' },
                { bit: 3, name: 'powerOutage', desc: 'Power Outage' },
                { bit: 4, name: 'overCurrent', desc: 'Over Current' },
                { bit: 5, name: 'overVoltage', desc: 'Over Voltage' },
                { bit: 6, name: 'communicationLost', desc: 'Communication Lost' },
                { bit: 7, name: 'rateAndPower', desc: 'Pentair VS/VF/VSF Rate and Power' }
            ],
            ultratemp: [
                { bit: 0, name: 'brownout', desc: 'Brownout' },
                { bit: 1, name: 'highRefrigerantLevel', desc: 'High Refrigerant Level' },
                { bit: 2, name: 'lowRefrigerantLevel', desc: 'Low Refrigerant Level' },
                { bit: 3, name: 'fiveAlarmsInAnHour', desc: 'Five Alarms in an hour' },
                { bit: 4, name: 'lowAmbientTemperature', desc: 'Low Ambient Temperature' },
                { bit: 5, name: 'highWaterTemperature', desc: 'High Water Temperature' },
                { bit: 6, name: 'lowWaterTemperature', desc: 'Low Water Temperature' },
                { bit: 7, name: 'lowWaterFlow', desc: 'Low Water Flow' },
                { bit: 8, name: 'poolSpaRemoteInputsBothEnabled', desc: 'Pool and Spa remote inputs are both enabled' },
                { bit: 9, name: 'waterTempSensorOpen', desc: 'Water Temperature Sensor Open' },
                { bit: 10, name: 'waterTempSensorShorted', desc: 'Water Temperature Sensor shorted' },
                { bit: 11, name: 'defrostTempSensorOpen', desc: 'Defrost Temperature Sensor Open' },
                { bit: 12, name: 'defrostTempSensorShorted', desc: 'Defrost Temperature Sensor shorted' },
                { bit: 13, name: 'communicationLost', desc: 'Communication Lost' }
            ],
            chlorinator: [
                { bit: 0, name: 'lowSaltWarning', desc: 'Low Salt Warning' },
                { bit: 1, name: 'veryLowSaltWarning', desc: 'Very Low Salt Warning' },
                { bit: 2, name: 'cleanAndInspectAlarm', desc: 'Clean and Inspect Alarm' },
                { bit: 3, name: 'coldWaterCutoffAlarm', desc: 'Cold Water Cutoff Alarm' },
                { bit: 4, name: 'communicationLost', desc: 'Communication Lost' },
                { bit: 5, name: 'noFlow', desc: 'No Flow' }
            ],
            intellichem: [
                { bit: 0, name: 'noFlow', desc: 'No Flow' },
                { bit: 1, name: 'phHigh', desc: 'pH High' },
                { bit: 2, name: 'phLow', desc: 'pH Low' },
                { bit: 3, name: 'orpHigh', desc: 'ORP High' },
                { bit: 4, name: 'orpLow', desc: 'ORP Low' },
                { bit: 5, name: 'checkPhChemicalContainer', desc: 'Check pH Chemical Container' },
                { bit: 6, name: 'checkOrpChemicalContainer', desc: 'Check ORP Chemical Container' },
                { bit: 7, name: 'sanitizerLockedOut', desc: 'Sanitizer Locked Out' },
                { bit: 8, name: 'phAtFeedLimit', desc: 'pH at Feed Limit' },
                { bit: 9, name: 'orpAtFeedLimit', desc: 'ORP at Feed Limit' },
                { bit: 10, name: 'invalidSettings', desc: 'Invalid Settings' },
                { bit: 11, name: 'peripheralCommError', desc: 'Peripheral Comm Error' },
                { bit: 12, name: 'autoCalibrationFailed', desc: 'Auto Calibration Failed' },
                { bit: 13, name: 'communicationLost', desc: 'Communication Lost' },
                { bit: 14, name: 'flowDelayOn', desc: 'Flow Delay ON' },
                { bit: 15, name: 'phModeDoseMixMonitor', desc: 'pH Mode: Dose/Mix/Monitor' },
                { bit: 16, name: 'orpModeDoseMixMonitor', desc: 'ORP Mode: Dose/Mix/Monitor' }
            ],
            hybrid: [
                { bit: 0, name: 'airFlowSwitch', desc: 'Air Flow Switch' },
                { bit: 1, name: 'icmFault', desc: 'ICM Fault' },
                { bit: 2, name: 'automaticGasShutOff', desc: 'Automatic Gas Shut Off' },
                { bit: 3, name: 'stackFlueHighTemp', desc: 'Stack Flue High Temp' },
                { bit: 4, name: 'stackFlueOpenShort', desc: 'Stack Flue Open/Short' },
                { bit: 5, name: 'stackFlueRunaway', desc: 'Stack Flue Runaway' },
                { bit: 6, name: 'freezeWarning', desc: 'Freeze Warning' },
                { bit: 7, name: 'condensateFilter', desc: 'Condensate Filter' },
                { bit: 8, name: 'brownout', desc: 'Brownout' },
                { bit: 9, name: 'highRefrigerantLevel', desc: 'High Refrigerant Level' },
                { bit: 10, name: 'lowRefrigerantLevel', desc: 'Low Refrigerant Level' },
                { bit: 11, name: 'fiveAlarmsInAnHour', desc: 'Five Alarms in an hour' },
                { bit: 12, name: 'lowAmbientTemperature', desc: 'Low Ambient Temperature' },
                { bit: 13, name: 'condensateFloatSwitch', desc: 'Condensate Float Switch' },
                { bit: 14, name: 'thermalFuse', desc: 'Thermal Fuse' },
                { bit: 15, name: 'highLimitSwitch', desc: 'High Limit Switch' },
                { bit: 16, name: 'highWaterTemperature', desc: 'High Water Temperature' },
                { bit: 17, name: 'lowWaterTemperature', desc: 'Low Water Temperature' },
                { bit: 18, name: 'lowWaterFlow', desc: 'Low Water Flow' },
                { bit: 19, name: 'waterTempSensorOpenShort', desc: 'Water Temperature Sensor Open/Short' },
                { bit: 20, name: 'suctionTempSensorOpenShort', desc: 'Suction Temperature Sensor Open/Short' },
                { bit: 21, name: 'communicationLost', desc: 'Communication Lost' }
            ],
            connectedGas: [
                { bit: 0, name: 'waterPressureSwitch', desc: 'Water Pressure Switch' },
                { bit: 1, name: 'highLimitSwitch', desc: 'High Limit Switch' },
                { bit: 2, name: 'airFlowSwitch', desc: 'Air Flow Switch' },
                { bit: 3, name: 'autoGasShutoffSwitch', desc: 'Auto Gas Shutoff Switch' },
                { bit: 4, name: 'ignitionControlError', desc: 'Ignition Control Error' },
                { bit: 5, name: 'stackFlueSensorErrorAlarm', desc: 'Stack Flue Sensor Error Alarm' },
                { bit: 6, name: 'stackFlueSensorOpenAlarm', desc: 'Stack Flue Sensor Open Alarm' },
                { bit: 7, name: 'stackFlueSensorShortAlarm', desc: 'Stack Flue Sensor Short Alarm' },
                { bit: 8, name: 'waterSensorOpenAlarm', desc: 'Water Sensor Open Alarm' },
                { bit: 9, name: 'waterSensorShortAlarm', desc: 'Water Sensor Short Alarm' },
                { bit: 10, name: 'airFlowFaultAlarm', desc: 'Air Flow Fault Alarm' },
                { bit: 11, name: 'flameNoCallForHeatAlarm', desc: 'Flame No Call For Heat Alarm' },
                { bit: 12, name: 'ignitionLockoutAlarm', desc: 'Ignition Lockout Alarm' },
                { bit: 13, name: 'weakFlameAlarm', desc: 'Weak Flame Alarm' },
                { bit: 14, name: 'communicationLost', desc: 'Communication Lost' }
            ]
        };
    }
    public initExpansionModules(ocp0A: number, ocp0B: number, xcp1A: number, xcp1B: number, xcp2A: number, xcp2B: number, xcp3A: number, xcp3B: number) {
        state.equipment.controllerType = 'intellicenter';
        let inv = { bodies: 0, circuits: 0, valves: 0, shared: false, dual: false, covers: 0, chlorinators: 0, chemControllers: 0 };
        this.processMasterModules(sys.equipment.modules, ocp0A, ocp0B, inv);
        // Here we need to set the start id should we have a single body system.
        if (!inv.shared && !inv.dual) { sys.board.equipmentIds.circuits.start = 2; } // We are a single body system.
        this.processExpansionModules(sys.equipment.expansions.getItemById(1, true), xcp1A, xcp1B, inv);
        this.processExpansionModules(sys.equipment.expansions.getItemById(2, true), xcp2A, xcp2B, inv);
        this.processExpansionModules(sys.equipment.expansions.getItemById(3, true), xcp3A, xcp3B, inv);
        if (inv.bodies !== sys.equipment.maxBodies ||
            inv.circuits !== sys.equipment.maxCircuits ||
            inv.chlorinators !== sys.equipment.maxChlorinators ||
            inv.chemControllers !== sys.equipment.maxChemControllers ||
            inv.valves !== sys.equipment.maxValves) {
            sys.resetData();
            this.processMasterModules(sys.equipment.modules, ocp0A, ocp0B);
            this.processExpansionModules(sys.equipment.expansions.getItemById(1, true), xcp1A, xcp1B);
            this.processExpansionModules(sys.equipment.expansions.getItemById(2, true), xcp2A, xcp2B);
            this.processExpansionModules(sys.equipment.expansions.getItemById(3, true), xcp3A, xcp3B);
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

        // Ensure the body collections are materialized up to maxBodies so shared systems always have Body2 (Spa)
        // even before we receive name/config payloads.
        try {
            for (let id = 1; id <= sys.equipment.maxBodies; id++) {
                const body = sys.bodies.getItemById(id, true);
                body.isActive = true;
                state.temps.bodies.getItemById(id, true);
            }
            // For shared-body IntelliCenter, Spa is always circuit 1.
            if (sys.equipment.shared === true && sys.equipment.maxBodies >= 2) {
                const spa = sys.bodies.getItemById(2, true);
                if (typeof spa.circuit !== 'number' || spa.circuit <= 0) spa.circuit = 1;
            }
        } catch (e) { /* best-effort */ }

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
            if (c.id <= 40) c.master = 0;
            if (typeof sys.board.valueMaps.circuitFunctions.get(c.type).isLight) {
                let s = state.circuits.getItemById(c.id);
                if (s.action !== 0) s.action = 0;
            }
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
        // Update heater services BEFORE config loading so the heatModes valueMap has all heater types
        // (UltraTemp, etc.) from cached poolConfig.json. This ensures OptionsMessage can correctly
        // transform heat mode values when processing options config.
        sys.board.heaters.updateHeaterServices();
        // Clear options version so startup always requests fresh heat modes/setpoints.
        // OCP may not increment options version when Wireless makes changes while njsPC is offline,
        // so we force a refresh (same logic as triggerConfigRefresh in VersionMessage.ts).
        sys.configVersion.options = 0;
        if (sys.valves.length === 0 && sys.equipment.maxValves > 0) sys.configVersion.valves = 0;
        if (sys.schedules.length === 0) sys.configVersion.schedules = 0;
        // Defer to the next tick so that any state extracted from the same inbound packet
        // (e.g., firmware bytes from Action 204) is available before we decide v1 vs v3 behavior.
        setTimeout(() => this.checkConfiguration(), 0);
        // Start v3 announce loop once we're initialized/running.
        this.startAnnounceDeviceInterval();
        this.startStatePoll();
    }
    public processMasterModules(modules: ExpansionModuleCollection, ocpA: number, ocpB: number, inv?) {
        // Map the expansion panels to their specific types through the valuemaps.  Sadly this means that
        // we need to determine if anything needs to be removed or added before actually doing it.
        if (typeof inv === 'undefined') inv = { bodies: 0, circuits: 0, valves: 0, shared: false, covers: 0, chlorinators: 0, chemControllers: 0 };
        
        // v3.004+ moved slot encoding such that slot0 is the HIGH nibble and slot1 is the LOW nibble.
        // v1.064: ocpA = 0x05 (0000 0101) → slot0 = 5 (low),  slot1 = 0 (high)
        // v3.004: ocpA = 0x50 (0101 0000) → slot0 = 5 (high), slot1 = 0 (low)
        // v3.004: ocpA = 0x58 (0101 1000) → slot0 = 5 (high), slot1 = 8 (low)
        // Prefer firmware-gated v3 decoding, but also auto-detect v3 encoding using the protocol constraint
        // that master slot0 must be a personality card (1-7), while expansion boards like valve-exp (8) cannot be in slot0.
        const hi = (ocpA & 0xF0) >> 4;
        const lo = (ocpA & 0x0F);
        let useV3Order = true;
        if (!useV3Order) {
            // If HIGH nibble looks like a personality card and LOW nibble is either empty (0) or non-personality (>7),
            // treat this as v3 encoding even if the firmware gate isn't established yet.
            if (hi >= 1 && hi <= 7 && (lo === 0 || lo > 7)) useV3Order = true;
        }
        let slot0 = useV3Order ? hi : lo;
        let slot1 = useV3Order ? lo : hi;
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
        let modules = panel.modules;
        if (typeof inv === 'undefined') inv = { bodies: 0, circuits: 0, valves: 0, shared: false, covers: 0, chlorinators: 0, chemControllers: 0 };
        this.processExpansionModulesV3(panel, ocpA, ocpB, inv);
    }
    // v3.008+ expansion-panel decode.  The wire layout on v3 is not nibble-packed: each expansion byte
    // (bytes 15/17/19 of Action 204) carries a single expansion-panel id.  Observed values so far:
    //   0x00 = empty slot
    //   0x02 = i10X expansion panel (valueMap id 6)
    // Additional entries can be added as new hardware is observed in the wild.  Unknown non-zero values
    // are logged and the panel is deactivated so we never silently mis-identify an expansion.
    // Discussion #1171 / ISSUE-081.
    private static readonly V3_EXPANSION_WIRE_TO_MAP_ID: Record<number, number> = {
        0x02: 6   // i10X
    };
    private processExpansionModulesV3(panel: ExpansionPanel, ocpA: number, ocpB: number, inv: any) {
        let modules: ExpansionModuleCollection = panel.modules;
        if (typeof inv === 'undefined') inv = { bodies: 0, circuits: 0, valves: 0, shared: false, covers: 0, chlorinators: 0, chemControllers: 0 };
        if (ocpB !== 0) {
            logger.debug(`IntelliCenter v3 expansion panel reports ocpB=0x${ocpB.toString(16).padStart(2, '0')}; currently unmapped, ignoring.`);
        }
        if (ocpA === 0) {
            // Empty slot — clear any previously seen modules.
            modules.removeItemById(0);
            modules.removeItemById(1);
            modules.removeItemById(2);
            modules.removeItemById(3);
            panel.isActive = false;
            return;
        }
        const mapId = IntelliCenterBoard.V3_EXPANSION_WIRE_TO_MAP_ID[ocpA];
        if (typeof mapId === 'undefined') {
            logger.warn(`IntelliCenter v3 expansion panel reports unknown wire id 0x${ocpA.toString(16).padStart(2, '0')}; deactivating panel. Please report this value so it can be catalogued.`);
            modules.removeItemById(0);
            modules.removeItemById(1);
            modules.removeItemById(2);
            modules.removeItemById(3);
            panel.isActive = false;
            return;
        }
        panel.isActive = true;
        const mod = modules.getItemById(0, true);
        const mt = this.valueMaps.expansionBoards.transform(mapId);
        mod.name = mt.name;
        mod.desc = mt.desc;
        mod.type = mapId;
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
        // v3 layout does not currently populate slots 1-3 on expansion panels.
        modules.removeItemById(1);
        modules.removeItemById(2);
        modules.removeItemById(3);
    }
    public async setSecurityRoleAsync(obj: any): Promise<any> {
        let roleId = typeof obj.id !== 'undefined' ? parseInt(obj.id, 10) : -1;
        if (isNaN(roleId) || roleId < 1 || roleId > 9) return Promise.reject(new InvalidEquipmentIdError(`Invalid security role id: ${obj.id}`, obj.id, 'securityRole'));
        let role = sys.security.roles.getItemById(roleId, false);
        let item = roleId - 1;
        let name = typeof obj.name !== 'undefined' ? obj.name.toString().substring(0, 16) : (role ? role.name : '');
        let pin = typeof obj.pin !== 'undefined' ? obj.pin.toString().replace(/\D/g, '').padStart(4, '0').substring(0, 4) : (role ? role.pin : '0000');
        let pinNum = parseInt(pin, 10) || 0;
        let timeout = typeof obj.timeout !== 'undefined' ? Math.max(1, Math.min(10, parseInt(obj.timeout, 10) || 5)) : (role ? role.timeout : 5);
        let permBytes = Array.isArray(obj.permissionsBytes) ? obj.permissionsBytes.slice(0, 4) : (role ? role.permissionsBytes : [0, 0, 0, 0]);
        while (permBytes.length < 4) permBytes.push(0);
        if (roleId === 1) {
            if (typeof obj.enabled !== 'undefined') {
                if (obj.enabled) permBytes[3] = permBytes[3] | 0x80;
                else permBytes[3] = permBytes[3] & ~0x80;
            }
            if (typeof obj.guestEnabled !== 'undefined') {
                if (obj.guestEnabled) permBytes[3] = permBytes[3] | 0x40;
                else permBytes[3] = permBytes[3] & ~0x40;
            }
        }
        let payload: number[] = [11, item, item, (pinNum >> 8) & 0xFF, pinNum & 0xFF];
        let nameBytes: number[] = [];
        for (let i = 0; i < 16; i++) nameBytes.push(i < name.length ? name.charCodeAt(i) : 0);
        payload.push(...nameBytes);
        payload.push(permBytes[0] & 0xFF, permBytes[1] & 0xFF, permBytes[2] & 0xFF, permBytes[3] & 0xFF);
        payload.push(timeout & 0xFF);
        payload.push(0xFF, 0xFF, 0xFF);
        let out = Outbound.create({
            action: 168,
            payload: payload,
            response: IntelliCenterBoard.getAckResponse(168),
            retries: 5
        });
        await out.sendAsync();
        if (role) {
            role.name = name;
            role.pin = pin;
            role.timeout = timeout;
            role.permissionsBytes = permBytes;
            role.permissionsMask = ((permBytes[0] & 0xFF) * 16777216) + ((permBytes[1] & 0xFF) * 65536) + ((permBytes[2] & 0xFF) * 256) + (permBytes[3] & 0xFF);
            if (item === 0) {
                sys.security.enabledByte = permBytes[3];
                sys.security.enabled = (permBytes[3] & 0x80) === 0x80;
                sys.security.guestEnabled = (permBytes[3] & 0x40) === 0x40;
            }
        }
        try {
            let verifyReq = Outbound.create({
                action: 222,
                payload: [11, item],
                response: Response.create({ action: 168 }),
                retries: 3
            });
            await verifyReq.sendAsync();
        } catch (err) { logger.warn(`Security role verify read failed: ${err.message}`); }
        return sys.security.get(true);
    }
    public get commandSourceAddress(): number { return this.getRegistrationAddress(); }
    public get commandDestAddress(): number { return 16; }
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
    private _savedFirmwareVersion: string = sys.equipment.controllerFirmware || '';
    private static readonly WATCHDOG_TIMEOUT_MS = 120000;
    private static readonly WATCHDOG_POLL_MS = 5000;
    private _watchdogTimer?: NodeJS.Timeout;
    private _lastProgressMs: number = 0;
    private _maxPercentEmitted: number = 0;
    private _epoch: number = 0;
    public close() {
        this.stopWatchdog();
        this._processing = false;
        this._maxPercentEmitted = 0;
        super.close();
    }
    public abort(): void {
        this._epoch++;
        this.queue.length = 0;
        this.curr = null;
        this.totalItems = 0;
        this._processing = false;
        this._newRequest = false;
        this._failed = false;
        this._maxPercentEmitted = 0;
        this.stopWatchdog();
    }
    private getDisplayPercent(): number {
        this._maxPercentEmitted = Math.max(this._maxPercentEmitted, this.percent);
        return this._maxPercentEmitted;
    }
    private markProgress(): void {
        if (!this._processing) return;
        this._lastProgressMs = Date.now();
        if (!this._watchdogTimer) {
            this._watchdogTimer = setInterval(() => this.checkWatchdog(), IntelliCenterConfigQueue.WATCHDOG_POLL_MS);
        }
    }
    private stopWatchdog(): void {
        if (this._watchdogTimer) {
            clearInterval(this._watchdogTimer);
            this._watchdogTimer = undefined;
        }
        this._lastProgressMs = 0;
    }
    private checkWatchdog(): void {
        if (!this._processing || this.closed) {
            this.stopWatchdog();
            return;
        }
        const elapsed = Date.now() - this._lastProgressMs;
        if (elapsed < IntelliCenterConfigQueue.WATCHDOG_TIMEOUT_MS) return;
        logger.warn(`Config queue watchdog timed out after ${elapsed}ms; forcing recovery (${this.remainingItems} items remaining)`);
        this._epoch++;
        this.queue.length = 0;
        this.curr = null;
        this.totalItems = 0;
        this._processing = false;
        this._failed = false;
        this._newRequest = false;
        this._maxPercentEmitted = 0;
        this.stopWatchdog();
        state.status = 1;
        state.emitControllerChange();
        setTimeout(() => { sys.board.checkConfiguration(); }, 250);
    }
    public processNext(msg?: Outbound, epoch?: number) {
        if (this.closed) return;
        if (typeof epoch === 'number' && epoch !== this._epoch) return;
        let self = this;
        if (typeof msg !== 'undefined' && msg !== null) {
            this.markProgress();
            if (msg.failed) {
                logger.warn(`Config request FAILED: category=${msg.payload[0]} subpacket=${msg.payload[1]} retries=${msg.tries}/${msg.retries}`);
            }
            if (!msg.failed) {
                // Remove all references to future items. We got it so we don't need it again.
                this.removeItem(msg.payload[0], msg.payload[1]);
                if (this.curr && this.curr.isComplete) {
                    if (!this.curr.failed) {
                        // Call the identified callback.  This may add additional items.
                        if (typeof this.curr.oncomplete === 'function') {
                            const beforeCount = this.curr.items.length;
                            this.curr.oncomplete(this.curr);
                            const addedItems = this.curr.items.length - beforeCount;
                            if (addedItems > 0) {
                                this.totalItems += addedItems;
                            }
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
            this._maxPercentEmitted = 0;
            state.emitControllerChange();
            return;
        } else
            state.status = sys.board.valueMaps.controllerStatus.transform(2, this.getDisplayPercent());
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
            const dest = sys.equipment.isIntellicenterV3 ? 16 : 15;
            let out = Outbound.create({
                dest,
                action: 222, payload: [this.curr.category, itm], retries: 3,
                response: sys.equipment.isIntellicenterV3
                    ? Response.create({ dest: -1, action: 30, payload: [this.curr.category, itm] })
                    : Response.create({ dest: -1, action: 30, payload: [this.curr.category, itm] })
            });
            logger.verbose(`Requesting config for: ${ConfigCategories[this.curr.category]} - Item: ${itm}`);
            this.markProgress();
            const runEpoch = this._epoch;
            out.sendAsync()
                .then(() => {
                    //logger.debug(`msg ${out.toShortPacket()} sent successfully`);
                })
                .catch((err) => {
                    logger.error(`Error sending configuration request message on port ${out.portId}: ${err.message};`);
                })
                .finally(() => {
                    setTimeout(() => { self.processNext(out, runEpoch); }, 10);
                })
        } else {
            // Now that we are done check the configuration a final time.  If we have anything outstanding
            // it will get picked up.
            state.status = 1;
            this.curr = null;
            this._processing = false;
            this._maxPercentEmitted = 0;
            this.stopWatchdog();
            // ISSUE-121: Do NOT auto-retry on _failed for v3. Items that fail are typically
            // unsupported by the v3 firmware (not transient errors), so re-running creates an
            // endless re-queue cycle. The next legitimate version-change broadcast will pick
            // up real changes via normal compareVersions flow. Reset _failed without retrying.
            if (this._failed && !sys.equipment.isIntellicenterV3) {
                setTimeout(() => { sys.checkConfiguration(); }, 100);
            }
            this._failed = false;
            logger.info(`Configuration Complete`);
            sys.board.heaters.updateHeaterServices();
            // Re-apply current body heat modes through the normal setter so state re-transforms
            // against the (possibly rebuilt) heatModes valueMap.
            for (let i = 0; i < state.temps.bodies.length; i++) {
                const b = state.temps.bodies.getItemByIndex(i);
                const hm = b.heatMode;
                // Startup-only: the numeric mode can be correct while the persisted {name,desc} is stale.
                if (hm >= 0) {
                    // Don't touch internal state; force the setter to re-transform by toggling to a
                    // different value and then restoring.
                    const tmp = hm === 0 ? 1 : 0;
                    b.heatMode = tmp;
                    b.heatMode = hm;
                }
            }
            state.cleanupState();
        }
        // Notify all the clients of our processing status.
        state.emitControllerChange();
    }
    public queueChanges(ver: ConfigVersion) {
        let curr: ConfigVersion = sys.configVersion;

        // Detect firmware version change (e.g., v1→v3). The constructor captured
        // the persisted equipment.softwareVersion before Action 204 overwrites it.
        // If the live firmware differs, categories with version-specific parsing
        // must be re-fetched even when their OCP version numbers haven't changed.
        const currentFw = sys.equipment.controllerFirmware || '';
        const fwChanged = currentFw !== this._savedFirmwareVersion && currentFw.length > 0;
        if (fwChanged) {
            logger.info(`Firmware version changed (${this._savedFirmwareVersion || 'unknown'} → ${currentFw}), forcing config refresh for affected categories`);
            curr.circuits = 0;
            curr.options = 0;
            curr.general = 0;
            curr.schedules = 0;
            curr.pumps = 0;
            this._savedFirmwareVersion = currentFw;
        }

        if (this._processing) {
            if (curr.hasChanges(ver)) this._newRequest = true;
            if (sys.configVersion.lastUpdated.getTime() > new Date().getTime() - 90000)
                console.log('WE ARE ALREADY PROCESSING CHANGES...')
            return;
        }
        // IMPORTANT: Only enter "processing" mode if there are actual version changes.
        // If we set `_processing=true` and then return early, the UI can get stuck showing a partial
        // percent (e.g., 87%) because no further progress/completion events will be emitted.
        if (!curr.hasChanges(ver)) {
            // Ensure controller status returns to ready and queue state is not wedged.
            this._processing = false;
            this._failed = false;
            this._newRequest = false;
            this._maxPercentEmitted = 0;
            this.stopWatchdog();
            state.status = 1;
            state.emitControllerChange();
            return;
        }

        // New run: reset per-run accounting so percent reflects ONLY this run.
        // Do NOT call `ConfigQueue.reset()` here because it also mutates `closed`.
        // We only want to reset per-run counters/queues.
        this.queue.length = 0;
        this.curr = null;
        this.totalItems = 0;
        this._maxPercentEmitted = 0;
        this._processing = true;
        this._failed = false;
        this.markProgress();
        let self = this;
        sys.configVersion.lastUpdated = new Date();
        // Tell the system we are loading.
        state.status = sys.board.valueMaps.controllerStatus.transform(2, 0);
        // Alert notification pages 12-15 (circuit/pump/heater/chlorinator) were added to
        // OCP firmware in the v3.004+ line. IntelliCenter v1.x firmware (e.g. v1.064) does
        // not respond to Action 222 requests for these pages, so polling them causes a
        // retry/abort loop that resets `configVersion.equipment` to 0 and re-queues every
        // cycle. On v1.x rely on the Action 168 push path in ExternalMessage instead. #1172
        const equipmentItems = sys.equipment.isIntellicenterV3
            ? [0, 1, 2, 3]
            : [0, 1, 2, 3];
        this.maybeQueueItems(curr.equipment, ver.equipment, ConfigCategories.equipment, equipmentItems);
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
                if (maxId > 0) req.fillRange(6, Math.min(Math.ceil(maxId / 2) + 6, 21));
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
            req.fillRange(5, Math.min(Math.ceil(sys.equipment.maxPumps / 2) + 5, 18));
            this.push(req);
        }
        this.maybeQueueItems(curr.security, ver.security, ConfigCategories.security, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
        if (this.compareVersions(curr.remotes, ver.remotes)) {
            let req = new IntelliCenterConfigRequest(ConfigCategories.remotes, ver.remotes, [0, 1], function (req: IntelliCenterConfigRequest) {
                if (sys.remotes.length > 2) req.fillRange(2, sys.remotes.length - 1);
            });
            this.push(req);
        }
        if (this.compareVersions(curr.circuitGroups, ver.circuitGroups)) {
            let req = new IntelliCenterConfigRequest(ConfigCategories.circuitGroups, ver.circuitGroups, [32, 33], function (req: IntelliCenterConfigRequest) {
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
        // ISSUE-121: IntelliCenter v3 OCP firmware only responds to general items 0 and 1.
        // Requesting items 2-7 burns retries each (~30s total) and sets _failed=true,
        // which triggers sys.checkConfiguration() after "Configuration Complete" → endless
        // re-queue cycle. Same pattern as ISSUE-077 (equipment items 12-15). Gate to 0-1 on v3.
        // RE-CONFIRMED 2026-05-13: Even with internet enabled, Web & Mobile Interface on,
        // Pentair account created, and owner data populated on OCP, sub-items 2-7 still
        // get no response. Owner/personal info is no longer broadcast on RS-485 in v3.
        const generalItems = sys.equipment.isIntellicenterV3 ? [0, 1] : [0, 1, 2, 3, 4, 5, 6, 7];
        this.maybeQueueItems(curr.general, ver.general, ConfigCategories.general, generalItems);
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
            this.stopWatchdog();
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
export class IntelliCenterSystemCommands extends SystemCommands {
    public async setDateTimeAsync(obj: any): Promise<any> {
        if (obj.clockSource === 'internet' || obj.clockSource === 'server' || obj.clockSource === 'manual') sys.general.options.clockSource = obj.clockSource;
        Promise.resolve({
            time: state.time.format(),
            adjustDST: sys.general.options.adjustDST,
            clockSource: sys.general.options.clockSource
        });
    }
    public async setGeneralAsync(obj?: any): Promise<General> {
        try {
            if (typeof obj.alias === 'string' && obj.alias !== sys.general.alias) {
                const alias = normalizeIntelliCenterName(obj.alias, sys.general.alias);
                let out = Outbound.create({
                    action: 168,
                    payload: [12, 0, 0],
                    retries: 3
                }).appendPayloadString(alias, 16);
                await out.sendAsync();
                sys.general.alias = alias;
            }
            if (typeof obj.options !== 'undefined') {
                try {
                    if (typeof obj.options.vacation !== 'undefined') {
                        await (this as any).setVacationAsync(obj.options.vacation);
                        return sys.general;
                    }
                    await sys.board.system.setOptionsAsync(obj.options);
                }
                catch (err) {
                    logger.error(`Caught reject from setOptionsAsync`);
                    return Promise.reject(err);
                }
            }
            if (typeof obj.location !== 'undefined') await sys.board.system.setLocationAsync(obj.location);
            if (typeof obj.owner !== 'undefined') await sys.board.system.setOwnerAsync(obj.owner);
            return sys.general;
        }
        catch (err) {
            console.log(`Rejected setGeneralAsync: ${err.message}`);
            return Promise.reject(err);
        }
    }
    public async setTempSensorsAsync(obj?: any): Promise<TempSensorCollection> {
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
            return sys.equipment.tempSensors;
        }
        catch (err) { return Promise.reject(err); }

    }
    public async cancelDelay(): Promise<any> {
        let out = Outbound.create({
            action: 168,
            retries: 3,
            payload: [19, 0, 0],
            response: IntelliCenterBoard.getAckResponse(168)
        });
        await out.sendAsync();
        state.delay = sys.board.valueMaps.delay.getValue('nodelay');
        return state.data.delay;
    }
    public async setOptionsAsync(obj?: any): Promise<Options> {
        try {
            let payload = this.buildOptionsPayload(obj);
            await this.setTempSensorCalibrationAsync(obj, payload);
            await this.setClockOptionsAsync(obj, payload);
            await this.setUnitsOptionsAsync(obj, payload);
            await this.setDelayOptionsAsync(obj, payload);
            await this.setPumpDelayAsync(obj, payload);
            await this.setCooldownDelayAsync(obj, payload);
            await this.setManualPriorityAsync(obj, payload);
            await this.setManualHeatAsync(obj, payload);
            await this.setDisplayOptionsAsync(obj);
            return Promise.resolve(sys.general.options);
        }
        catch (err) { return Promise.reject(err); }
    }
    protected static fnToByte(num) { return num < 0 ? Math.abs(num) | 0x80 : Math.abs(num) || 0; }
    protected buildOptionsPayload(obj?: any): number[] {
        const fnToByte = IntelliCenterSystemCommands.fnToByte;
        const freezeCycleTime = parseInt((sys.general.options.freezeCycleTime || 15).toString(), 10) || 15;
        const pool = sys.bodies.getItemById(1, false);
        const spa = sys.bodies.getItemById(2, false);
        return [0, 0, 0,
            fnToByte(sys.equipment.tempSensors.getCalibration('water2')),
            fnToByte(sys.equipment.tempSensors.getCalibration('water1')),
            fnToByte(sys.equipment.tempSensors.getCalibration('solar1')),
            fnToByte(sys.equipment.tempSensors.getCalibration('air')),
            fnToByte(0),
            fnToByte(sys.equipment.tempSensors.getCalibration('solar2')),
            fnToByte(sys.equipment.tempSensors.getCalibration('solar3')),
            fnToByte(sys.equipment.tempSensors.getCalibration('solar4')),
            fnToByte(sys.equipment.tempSensors.getCalibration('water3')),
            fnToByte(sys.equipment.tempSensors.getCalibration('water4')), 0,
            0x10 | (sys.general.options.clockMode === 24 ? 0x40 : 0x00) | (sys.general.options.adjustDST ? 0x80 : 0x00) | (sys.general.options.clockSource === 'internet' ? 0x20 : 0x00),
            0, 0,
            sys.general.options.clockSource === 'internet' ? 1 : 0,
            3, 0, 0,
            pool.setPoint || 100, pool.coolSetpoint || (pool.setPoint || 100),
            spa.setPoint || 100, spa.coolSetpoint || (spa.setPoint || 100),
            pool.heatMode || 0, spa.heatMode || 0,
            freezeCycleTime,
            sys.general.options.valveDelay ? 1 : 0,
            sys.general.options.cooldownDelay ? 1 : 0,
            0, 0, 0, 0, 0, 0,
            sys.general.options.pumpDelay ? 1 : 0,
            sys.general.options.manualPriority ? 1 : 0,
            sys.general.options.manualHeat ? 1 : 0,
            0, 0, 0
        ];
    }
    protected async setTempSensorCalibrationAsync(obj: any, payload: number[]): Promise<void> {
        const fnToByte = IntelliCenterSystemCommands.fnToByte;
        if (typeof obj.waterTempAdj1 != 'undefined' && obj.waterTempAdj1 !== sys.equipment.tempSensors.getCalibration('water1')) {
            payload[2] = 1;
            payload[4] = fnToByte(parseInt(obj.waterTempAdj1, 10)) || 0;
            let out = Outbound.create({
                action: 168,
                retries: 5,
                payload: payload,
                response: IntelliCenterBoard.getAckResponse(168)
            });
            await out.sendAsync();
            sys.equipment.tempSensors.setCalibration('water1', parseInt(obj.waterTempAdj1, 10));
        }
        if (typeof obj.waterTempAdj2 != 'undefined' && obj.waterTempAdj2 !== sys.equipment.tempSensors.getCalibration('water2')) {
            payload[2] = 4;
            payload[7] = fnToByte(parseInt(obj.waterTempAdj2, 10)) || 0;
            let out = Outbound.create({
                action: 168,
                retries: 5,
                payload: payload,
                response: IntelliCenterBoard.getAckResponse(168)
            });
            await out.sendAsync();
            sys.equipment.tempSensors.setCalibration('water2', parseInt(obj.waterTempAdj2, 10));
        }
        if (typeof obj.waterTempAdj3 != 'undefined' && obj.waterTempAdj3 !== sys.equipment.tempSensors.getCalibration('water3')) {
            payload[2] = 6;
            payload[9] = fnToByte(parseInt(obj.waterTempAdj3, 10)) || 0;
            let out = Outbound.create({
                action: 168,
                retries: 5,
                payload: payload,
                response: IntelliCenterBoard.getAckResponse(168)
            });
            await out.sendAsync();
            sys.equipment.tempSensors.setCalibration('water3', parseInt(obj.waterTempAdj3, 10));
        }
        if (typeof obj.waterTempAdj4 != 'undefined' && obj.waterTempAdj4 !== sys.equipment.tempSensors.getCalibration('water4')) {
            payload[2] = 8;
            payload[11] = fnToByte(parseInt(obj.waterTempAdj4, 10)) || 0;
            let out = Outbound.create({
                action: 168,
                retries: 5,
                response: IntelliCenterBoard.getAckResponse(168),
                payload: payload
            });
            await out.sendAsync();
            sys.equipment.tempSensors.setCalibration('water4', parseInt(obj.waterTempAdj3, 10));
        }
        if (typeof obj.solarTempAdj1 != 'undefined' && obj.solarTempAdj1 !== sys.equipment.tempSensors.getCalibration('solar1')) {
            payload[2] = 2;
            payload[5] = fnToByte(parseInt(obj.solarTempAdj1, 10)) || 0;
            let out = Outbound.create({
                action: 168,
                retries: 5,
                payload: payload,
                response: IntelliCenterBoard.getAckResponse(168)
            });
            await out.sendAsync();
            sys.equipment.tempSensors.setCalibration('solar1', parseInt(obj.solarTempAdj1, 10));
        }
        if (typeof obj.solarTempAdj2 != 'undefined' && obj.solarTempAdj2 !== sys.equipment.tempSensors.getCalibration('solar2')) {
            payload[2] = 5;
            payload[8] = fnToByte(parseInt(obj.solarTempAdj2, 10)) || 0;
            let out = Outbound.create({
                action: 168,
                retries: 5,
                payload: payload,
                response: IntelliCenterBoard.getAckResponse(168)
            });
            await out.sendAsync();
            sys.equipment.tempSensors.setCalibration('solar2', parseInt(obj.solarTempAdj2, 10));
        }
        if (typeof obj.solarTempAdj3 != 'undefined' && obj.solarTempAdj3 !== sys.equipment.tempSensors.getCalibration('solar3')) {
            payload[2] = 7;
            payload[10] = fnToByte(parseInt(obj.solarTempAdj3, 10)) || 0;
            let out = Outbound.create({
                action: 168,
                retries: 5,
                payload: payload,
                response: IntelliCenterBoard.getAckResponse(168)
            });
            await out.sendAsync();
            sys.equipment.tempSensors.setCalibration('solar3', parseInt(obj.solarTempAdj3, 10));
        }
        if (typeof obj.solarTempAdj4 != 'undefined' && obj.solarTempAdj4 !== sys.equipment.tempSensors.getCalibration('solar4')) {
            payload[2] = 8;
            payload[12] = fnToByte(parseInt(obj.solarTempAdj4, 10)) || 0;
            let out = Outbound.create({
                action: 168,
                retries: 5,
                payload: payload,
                response: IntelliCenterBoard.getAckResponse(168)
            });
            await out.sendAsync();
            sys.equipment.tempSensors.setCalibration('solar3', parseInt(obj.solarTempAdj3, 10));
        }
        if (typeof obj.airTempAdj != 'undefined' && obj.airTempAdj !== sys.equipment.tempSensors.getCalibration('air')) {
            payload[2] = 3;
            payload[6] = fnToByte(parseInt(obj.airTempAdj, 10)) || 0;
            let out = Outbound.create({
                action: 168,
                retries: 5,
                response: IntelliCenterBoard.getAckResponse(168),
                payload: payload
            });
            await out.sendAsync();
            sys.equipment.tempSensors.setCalibration('air', parseInt(obj.airTempAdj, 10));
        }
    }
    protected async setClockOptionsAsync(obj: any, payload: number[]): Promise<void> {
        if ((typeof obj.clockMode !== 'undefined' && obj.clockMode !== sys.general.options.clockMode) ||
            (typeof obj.adjustDST !== 'undefined' && obj.adjustDST !== sys.general.options.adjustDST)) {
            const effectiveClockSource = (typeof obj.clockSource === 'string') ? obj.clockSource : sys.general.options.clockSource;
            let byte = 0x10 | (effectiveClockSource === 'internet' ? 0x20 : 0x00);
            if (typeof obj.clockMode === 'undefined') byte |= sys.general.options.clockMode === 24 ? 0x40 : 0x00;
            else byte |= obj.clockMode === 24 ? 0x40 : 0x00;
            if (typeof obj.adjustDST === 'undefined') byte |= sys.general.options.adjustDST ? 0x80 : 0x00;
            else byte |= obj.adjustDST ? 0x80 : 0x00;
            payload[2] = 0;
            payload[14] = byte;
            let out = Outbound.create({
                action: 168,
                retries: 5,
                response: IntelliCenterBoard.getAckResponse(168),
                payload: payload
            });
            await out.sendAsync();
            if (typeof obj.clockMode !== 'undefined') sys.general.options.clockMode = obj.clockMode === 24 ? 24 : 12;
            if (typeof obj.adjustDST !== 'undefined') sys.general.options.adjustDST = obj.adjustDST ? true : false;
        }
        if (typeof obj.clockSource != 'undefined' && obj.clockSource !== sys.general.options.clockSource) {
            payload[2] = 0;
            payload[17] = obj.clockSource === 'internet' ? 0x01 : 0x00;
            let out = Outbound.create({
                action: 168,
                retries: 5,
                payload: payload,
                response: IntelliCenterBoard.getAckResponse(168)
            });
            await out.sendAsync();
            if (obj.clockSource === 'internet' || obj.clockSource === 'server' || obj.clockSource === 'manual')
                sys.general.options.clockSource = obj.clockSource;
            sys.board.system.setTZ();
        }
    }
    protected async setUnitsOptionsAsync(obj: any, payload: number[]): Promise<void> {
        if (typeof obj.units === 'undefined') return;
        const requestedUnits = sys.board.valueMaps.tempUnits.encode(obj.units);
        if (isNaN(requestedUnits) || requestedUnits === sys.general.options.units) return;
        const unitsByte = requestedUnits === sys.board.valueMaps.tempUnits.getValue('C') ? 1 : 0;
        const pool = sys.bodies.getItemById(1, false);
        const spa = sys.bodies.getItemById(2, false);
        const fromUnitName = sys.board.valueMaps.tempUnits.getName(sys.general.options.units) || 'F';
        const toUnitName = unitsByte === 1 ? 'C' : 'F';
        const convertSetpoint = (val: number): number => {
            if (typeof val !== 'number' || isNaN(val)) return 0;
            if (fromUnitName === toUnitName) return val;
            return Math.round(utils.convert.temperature.convertUnits(val, fromUnitName, toUnitName));
        };
        const poolHeat = convertSetpoint(pool.setPoint || (unitsByte === 1 ? 26 : 78));
        const poolCool = convertSetpoint(pool.coolSetpoint || (pool.setPoint || (unitsByte === 1 ? 35 : 95)));
        const spaHeat = convertSetpoint(spa.setPoint || (unitsByte === 1 ? 35 : 95));
        const spaCool = convertSetpoint(spa.coolSetpoint || (spa.setPoint || (unitsByte === 1 ? 35 : 95)));
        const dt = new Date();
        const yy = dt.getFullYear() - 2000;
        const mm = dt.getMonth() + 1;
        const dd = dt.getDate();
        const hh = dt.getHours();
        const min = dt.getMinutes();
        const v3UnitsPayload = [
            0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0,
            160, yy, mm, dd, hh, min,
            poolHeat, poolCool, spaHeat, spaCool,
            pool.heatMode || 0, spa.heatMode || 0,
            15,
            0, 0, 0, 0, 0,
            unitsByte,
            0, 0, 0, 0, 0, 0, 0, 0
        ];
        let out = Outbound.create({
            dest: 16,
            action: 168,
            retries: 5,
            payload: v3UnitsPayload,
            response: IntelliCenterBoard.getAckResponse(168)
        });
        await out.sendAsync();
        const sbody1 = state.temps.bodies.getItemById(1);
        pool.setPoint = sbody1.setPoint = poolHeat;
        pool.coolSetpoint = sbody1.coolSetpoint = poolCool;
        if (sys.bodies.length > 1) {
            const sbody2 = state.temps.bodies.getItemById(2);
            spa.setPoint = sbody2.setPoint = spaHeat;
            spa.coolSetpoint = sbody2.coolSetpoint = spaCool;
        }
        sys.general.options.units = requestedUnits;
        state.temps.units = requestedUnits;
        const bodyUnits = requestedUnits === sys.board.valueMaps.tempUnits.getValue('C') ? 2 : 1;
        for (let i = 0; i < sys.bodies.length; i++) sys.bodies.getItemByIndex(i).capacityUnits = bodyUnits;
        state.emitEquipmentChanges();
    }
    protected async setDelayOptionsAsync(obj: any, payload: number[]): Promise<void> {
        let delayRequested = typeof obj.freezeCycleTime !== 'undefined' || typeof obj.valveDelay !== 'undefined' || typeof obj.cooldownDelay !== 'undefined';
        if (!delayRequested) return;
        const requestedFreezeCycleTime = typeof obj.freezeCycleTime !== 'undefined'
            ? parseInt(obj.freezeCycleTime, 10) : sys.general.options.freezeCycleTime;
        payload[26] = Math.max(1, Math.min(60, requestedFreezeCycleTime || 15));
        payload[27] = (typeof obj.valveDelay !== 'undefined' ? obj.valveDelay : sys.general.options.valveDelay) ? 0x01 : 0x00;
        payload[28] = (typeof obj.cooldownDelay !== 'undefined' ? obj.cooldownDelay : sys.general.options.cooldownDelay) ? 0x01 : 0x00;
        let out = Outbound.create({
            action: 168,
            retries: 5,
            payload: payload,
            response: IntelliCenterBoard.getAckResponse(168)
        });
        await out.sendAsync();
        sys.general.options.freezeCycleTime = payload[26];
        sys.general.options.valveDelay = payload[27] === 1;
        sys.general.options.cooldownDelay = payload[28] === 1;
    }
    protected async setPumpDelayAsync(obj: any, payload: number[]): Promise<void> {
        if (typeof obj.pumpDelay === 'undefined' || obj.pumpDelay === sys.general.options.pumpDelay) return;
        payload[2] = 0;
        const pumpDelayPayloadIndex = 30;
        payload[pumpDelayPayloadIndex] = obj.pumpDelay ? 0x01 : 0x00;
        let out = Outbound.create({
            action: 168,
            retries: 5,
            response: IntelliCenterBoard.getAckResponse(168),
            payload: payload
        });
        await out.sendAsync();
        sys.general.options.pumpDelay = obj.pumpDelay ? true : false;
    }
    protected async setCooldownDelayAsync(obj: any, payload: number[]): Promise<void> {
        if (typeof obj.cooldownDelay === 'undefined' || obj.cooldownDelay === sys.general.options.cooldownDelay) return;
        payload[2] = 0;
        const cooldownDelayPayloadIndex = 28;
        payload[cooldownDelayPayloadIndex] = obj.cooldownDelay ? 0x01 : 0x00;
        let out = Outbound.create({
            action: 168,
            retries: 5,
            payload: payload,
            response: IntelliCenterBoard.getAckResponse(168)
        });
        await out.sendAsync();
        sys.general.options.cooldownDelay = obj.cooldownDelay ? true : false;
    }
    protected async setManualPriorityAsync(obj: any, payload: number[]): Promise<void> {
        if (typeof obj.manualPriority === 'undefined' || obj.manualPriority === sys.general.options.manualPriority) return;
        payload[2] = 0;
        const manualPriorityPayloadIndex = 36;
        payload[manualPriorityPayloadIndex] = obj.manualPriority ? 0x01 : 0x00;
        let out = Outbound.create({
            action: 168,
            retries: 5,
            payload: payload,
            response: IntelliCenterBoard.getAckResponse(168)
        });
        await out.sendAsync();
        sys.general.options.manualPriority = obj.manualPriority ? true : false;
    }
    protected async setManualHeatAsync(obj: any, payload: number[]): Promise<void> {
        if (typeof obj.manualHeat === 'undefined' || obj.manualHeat === sys.general.options.manualHeat) return;
        payload[2] = 0;
        const manualHeatPayloadIndex = 37;
        payload[manualHeatPayloadIndex] = obj.manualHeat ? 0x01 : 0x00;
        let out = Outbound.create({
            action: 168,
            retries: 5,
            payload: payload,
            response: IntelliCenterBoard.getAckResponse(168)
        });
        await out.sendAsync();
        sys.general.options.manualHeat = obj.manualHeat ? true : false;
    }
    protected async setDisplayOptionsAsync(obj: any): Promise<void> {
        if (typeof obj.solarAsHeatPump === 'undefined' && typeof obj.showBadgeColors === 'undefined') return;
        let opts = sys.general.options;
        let solarHP = typeof obj.solarAsHeatPump !== 'undefined' ? (obj.solarAsHeatPump ? true : false) : opts.solarAsHeatPump;
        let badgeColors = typeof obj.showBadgeColors !== 'undefined' ? (obj.showBadgeColors ? true : false) : opts.showBadgeColors;
        let vac = opts.vacation;
        let startDate = vac.startDate ? new Date(vac.startDate) : new Date();
        let endDate = vac.endDate ? new Date(vac.endDate) : new Date();
        let vacPayload = [0, 0, 64,
            vac.enabled ? 1 : 0,
            vac.useTimeframe ? 1 : 0,
            startDate.getUTCFullYear() - 2000, startDate.getUTCMonth() + 1, startDate.getUTCDate(),
            endDate.getUTCFullYear() - 2000, endDate.getUTCMonth() + 1, endDate.getUTCDate(),
            0, 30,
            badgeColors ? 1 : 0,
            0,
            solarHP ? 1 : 0,
            5
        ];
        let out = Outbound.create({
            action: 168,
            retries: 5,
            payload: vacPayload,
            response: IntelliCenterBoard.getAckResponse(168)
        });
        await out.sendAsync();
        opts.solarAsHeatPump = solarHP;
        opts.showBadgeColors = badgeColors;
    }
    public async setVacationAsync(obj?: any): Promise<Options> {
        try {
            let opts = sys.general.options;
            let enabled = typeof obj.enabled !== 'undefined' ? (obj.enabled ? true : false) : opts.vacation.enabled;
            let useTimeframe = typeof obj.useTimeframe !== 'undefined' ? (obj.useTimeframe ? true : false) : opts.vacation.useTimeframe;
            let startDate = new Date(obj.startDate || opts.vacation.startDate);
            let endDate = new Date(obj.endDate || opts.vacation.endDate);
            let payload = [0, 0, 64,
                enabled ? 1 : 0,
                useTimeframe ? 1 : 0,
                startDate.getUTCFullYear() - 2000, startDate.getUTCMonth() + 1, startDate.getUTCDate(),
                endDate.getUTCFullYear() - 2000, endDate.getUTCMonth() + 1, endDate.getUTCDate(),
                0, 30,
                opts.showBadgeColors ? 1 : 0,
                0,
                opts.solarAsHeatPump ? 1 : 0,
                5
            ];
            let out = Outbound.create({
                action: 168,
                retries: 5,
                payload: payload,
                response: IntelliCenterBoard.getAckResponse(168)
            });
            await out.sendAsync();
            opts.vacation.enabled = enabled;
            opts.vacation.useTimeframe = useTimeframe;
            opts.vacation.startDate = startDate;
            opts.vacation.endDate = endDate;
            return Promise.resolve(opts);
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setLocationAsync(obj?: any): Promise<Location> {
        try {
            let arr = [];
            if (typeof obj.address === 'string' && obj.address !== sys.general.location.address) {
                let out = Outbound.create({
                    action: 168,
                    retries: 5,
                    payload: [12, 0, 1],
                    response: IntelliCenterBoard.getAckResponse(168)
                });
                out.appendPayloadString(obj.address, 32);
                await out.sendAsync();
                sys.general.location.address = obj.address;
            }
            if (typeof obj.country === 'string' && obj.country !== sys.general.location.country) {
                let out = Outbound.create({
                    action: 168,
                    retries: 5,
                    payload: [12, 0, 8],
                    response: IntelliCenterBoard.getAckResponse(168)
                });
                out.appendPayloadString(obj.country, 32);
                await out.sendAsync();
                sys.general.location.country = obj.country;
            }
            if (typeof obj.city === 'string' && obj.city !== sys.general.location.city) {
                let out = Outbound.create({
                    action: 168,
                    retries: 5,
                    payload: [12, 0, 9],
                    response: IntelliCenterBoard.getAckResponse(168)
                });
                out.appendPayloadString(obj.city, 32);
                await out.sendAsync();
                sys.general.location.city = obj.city;
            }
            if (typeof obj.state === 'string' && obj.state !== sys.general.location.state) {
                let out = Outbound.create({
                    action: 168,
                    retries: 5,
                    payload: [12, 0, 10],
                    response: IntelliCenterBoard.getAckResponse(168)
                });
                out.appendPayloadString(obj.state, 32);
                await out.sendAsync();
                sys.general.location.state = obj.state;
            }
            if (typeof obj.zip === 'string' && obj.zip !== sys.general.location.zip) {
                let out = Outbound.create({
                    action: 168,
                    retries: 5,
                    payload: [12, 0, 7],
                    response: IntelliCenterBoard.getAckResponse(168)
                });
                out.appendPayloadString(obj.zip, 6);
                await out.sendAsync();
                sys.general.location.zip = obj.zip;
            }

            if (typeof obj.latitude === 'number' && obj.latitude !== sys.general.location.latitude) {
                let lat = Math.round(Math.abs(obj.latitude) * 100);
                let out = Outbound.create({
                    action: 168,
                    retries: 5,
                    payload: [12, 0, 11,
                        lat % 256,
                        Math.floor(lat / 256)],
                    response: IntelliCenterBoard.getAckResponse(168)
                });
                await out.sendAsync();
                sys.general.location.latitude = Math.round(obj.latitude * 100) / 100;
            }
            if (typeof obj.longitude === 'number' && obj.longitude !== sys.general.location.longitude) {
                let lon = Math.round(Math.abs(obj.longitude) * 100);
                let out = Outbound.create({
                    action: 168,
                    retries: 5,
                    payload: [12, 0, 12,
                        lon % 256,
                        Math.floor(lon / 256)],
                    response: IntelliCenterBoard.getAckResponse(168)
                });
                await out.sendAsync();
                sys.general.location.longitude = Math.round(obj.longitude * 100) / 100;
            }
            if (typeof obj.timeZone === 'number' && obj.timeZone !== sys.general.location.timeZone) {
                let out = Outbound.create({
                    action: 168,
                    retries: 5,
                    payload: [12, 0, 13, parseInt(obj.timeZone, 10)],
                    response: IntelliCenterBoard.getAckResponse(168)
                });
                await out.sendAsync();
                sys.general.location.timeZone = parseInt(obj.timeZone, 10);
            }
            return Promise.resolve(sys.general.location);
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setOwnerAsync(obj?: any): Promise<Owner> {
        let arr = [];
        try {
            if (typeof obj.name === 'string' && obj.name !== sys.general.owner.name) {
                const ownerName = normalizeIntelliCenterName(obj.name, sys.general.owner.name);
                let out = Outbound.create({
                    action: 168,
                    retries: 5,
                    payload: [12, 0, 2],
                    response: IntelliCenterBoard.getAckResponse(168)
                });
                out.appendPayloadString(ownerName, 16);
                await out.sendAsync();
                sys.general.owner.name = ownerName;
            }
            if (typeof obj.email === 'string' && obj.email !== sys.general.owner.email) {
                let out = Outbound.create({
                    action: 168,
                    retries: 5,
                    payload: [12, 0, 3],
                    response: IntelliCenterBoard.getAckResponse(168)
                });
                out.appendPayloadString(obj.email, 32);
                await out.sendAsync();
                sys.general.owner.email = obj.email;
            }
            if (typeof obj.email2 === 'string' && obj.email2 !== sys.general.owner.email2) {
                let out = Outbound.create({
                    action: 168,
                    retries: 5,
                    response: IntelliCenterBoard.getAckResponse(168),
                    payload: [12, 0, 4]
                });
                out.appendPayloadString(obj.email2, 32);
                await out.sendAsync();
                sys.general.owner.email2 = obj.email2;
            }
            if (typeof obj.phone2 === 'string' && obj.phone2 !== sys.general.owner.phone2) {
                let out = Outbound.create({
                    action: 168,
                    retries: 5,
                    payload: [12, 0, 6],
                    response: IntelliCenterBoard.getAckResponse(168)
                });
                out.appendPayloadString(obj.phone2, 16);
                await out.sendAsync();
                sys.general.owner.phone2 = obj.phone2;
            }
            if (typeof obj.phone === 'string' && obj.phone !== sys.general.owner.phone) {
                let out = Outbound.create({
                    action: 168,
                    retries: 5,
                    payload: [12, 0, 5],
                    response: IntelliCenterBoard.getAckResponse(168)
                });
                out.appendPayloadString(obj.phone, 16);
                await out.sendAsync();
                sys.general.owner.phone = obj.phone;
            }
            return Promise.resolve(sys.general.owner);
        }
        catch (err) { return Promise.reject(err); }
    }
}
export class IntelliCenterCircuitCommands extends CircuitCommands {
    declare board: IntelliCenterBoard;
    // Track pending circuit/feature state changes that have been sent but not yet confirmed by OCP.
    // This prevents race conditions when multiple circuit toggles are sent in quick succession.
    // Key: circuit/feature ID, Value: intended state (true=on, false=off)
    private pendingStates: Map<number, boolean> = new Map();

    
    // Add a pending state change (called before sending command)
    public addPendingState(id: number, isOn: boolean): void {
        this.pendingStates.set(id, isOn);
    }
    
    // Clear a pending state (called after ACK received or timeout)
    public clearPendingState(id: number): void {
        this.pendingStates.delete(id);
    }
    
    // Get effective state: pending state takes precedence over confirmed state
    public getEffectiveState(id: number, confirmedState: boolean): boolean {
        if (this.pendingStates.has(id)) {
            return this.pendingStates.get(id);
        }
        return confirmedState;
    }
    
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
        try {

            let id = parseInt(data.id, 10);
            let circuit = sys.circuits.getItemById(id, false);
            // Alright check to see if we are adding a nixie circuit.
            if (id === -1 || circuit.master !== 0)
                return await super.setCircuitAsync(data);
            if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Circuit Id has not been defined', data.id, 'Circuit'));
            if (!sys.board.equipmentIds.circuits.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Circuit Id ${id}: is out of range.`, id, 'Circuit'));
            let eggTimer = Math.min(typeof data.eggTimer !== 'undefined' ? parseInt(data.eggTimer, 10) : circuit.eggTimer, 1440);
            if (isNaN(eggTimer)) eggTimer = circuit.eggTimer;
            if (data.dontStop === true) eggTimer = 1440;
            data.dontStop = (eggTimer === 1440);
            let eggHrs = Math.floor(eggTimer / 60);
            let eggMins = eggTimer - (eggHrs * 60);
            let type = typeof data.type !== 'undefined' ? parseInt(data.type, 10) : circuit.type;
            this.assertSinglePoolSpaType(id, type);
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
                    eggHrs, eggMins, data.dontStop ? 1 : 0]
            });
            let circuitNameStr = typeof data.name !== 'undefined' ? data.name.toString().substring(0, 15) : circuit.name;
            out.appendPayloadString(circuitNameStr, 16);
            out.retries = 5;
            out.response = IntelliCenterBoard.getAckResponse(168);
            await out.sendAsync();
            let scircuit = state.circuits.getItemById(circuit.id, true);
            circuit.eggTimer = eggTimer;
            circuit.dontStop = data.dontStop;
            circuit.freeze = (typeof data.freeze !== 'undefined' ? utils.makeBool(data.freeze) : circuit.freeze);
            scircuit.showInFeatures = circuit.showInFeatures = (typeof data.showInFeatures !== 'undefined' ? utils.makeBool(data.showInFeatures) : circuit.showInFeatures);
            if (type === 9) scircuit.level = circuit.level = theme;
            else {
                let t = sys.board.valueMaps.circuitFunctions.transform(type);
                if (t.isLight == true) scircuit.lightingTheme = circuit.lightingTheme = theme;
                else {
                    scircuit.lightingTheme = undefined;
                    circuit.lightingTheme = 0;
                }
            }
            scircuit.name = circuit.name = circuitNameStr;
            scircuit.type = circuit.type = type;
            scircuit.isActive = circuit.isActive = true;
            circuit.master = 0;
            return circuit;
        }
        catch (err) {
            return Promise.reject(err);
        }

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
                retries: 5
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
            out.payload.push(0, 0, eggHours, eggMins, 0, 0, 0);
            await out.sendAsync();
            group.eggTimer = eggTimer;
            group.dontStop = obj.dontStop;
            sgroup.type = group.type = 2;
            sgroup.isActive = group.isActive = true;
            if (typeof obj.showInFeatures !== 'undefined') group.showInFeatures = utils.makeBool(obj.showInFeatures);
            sgroup.showInFeatures = group.showInFeatures;
            if (typeof obj.circuits !== 'undefined') {
                for (let i = 0; i < obj.circuits.length; i++) {
                    let c = group.circuits.getItemByIndex(i, true);
                    c.id = i + 1;
                    c.circuit = obj.circuits[i].circuit;
                }
                for (let i = obj.circuits.length; i < group.circuits.length; i++)
                    group.circuits.removeItemByIndex(i);
            }

            out = Outbound.create({
                action: 168,
                payload: [6, 1, id - sys.board.equipmentIds.circuitGroups.start],
                response: IntelliCenterBoard.getAckResponse(168),
                retries: 3
            });
            for (let i = 0; i < 16; i++) out.payload.push(255);
            const groupName = normalizeIntelliCenterName(obj.name, group.name);
            out.appendPayloadString(groupName, 16);
            await out.sendAsync();
            if (typeof obj.name !== 'undefined') sgroup.name = group.name = groupName;
            out = Outbound.create({
                action: 168,
                payload: [6, 2, id - sys.board.equipmentIds.circuitGroups.start],
                response: IntelliCenterBoard.getAckResponse(168),
                retries: 3
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
            await out.sendAsync();
            if (typeof obj.circuits !== 'undefined') {
                for (let i = 0; i < obj.circuits.length; i++) {
                    let c = group.circuits.getItemByIndex(i);
                    c.desiredState = obj.circuits[i].desiredState || 1;
                }
            }
            return group;
        }
        catch (err) {
            return Promise.reject(err);
        }
    }
    public async deleteCircuitGroupAsync(obj: any): Promise<CircuitGroup> {
        let group: CircuitGroup = null;
        let id = parseInt(obj.id, 10);
        if (isNaN(id) || !sys.board.equipmentIds.circuitGroups.isInRange(id)) return Promise.reject(new EquipmentNotFoundError(`Invalid group id: ${obj.id}`, 'CircuitGroup'));
        group = sys.circuitGroups.getItemById(id);
        try {
            let out = Outbound.create({
                action: 168,
                payload: [6, 0, id - sys.board.equipmentIds.circuitGroups.start, 0, 0, 0],
                response: IntelliCenterBoard.getAckResponse(168),
                retries: 5
            });
            for (let i = 0; i < 16; i++) i < group.circuits.length ? out.payload.push(group.circuits.getItemByIndex(i).circuit - 1) : out.payload.push(255);
            for (let i = 0; i < 16; i++) out.payload.push(0);
            out.payload.push(12);
            out.payload.push(0);
            await out.sendAsync();
            let gstate = state.circuitGroups.getItemById(id);
            gstate.isActive = false;
            gstate.emitEquipmentChange();
            sys.circuitGroups.removeItemById(id);
            state.circuitGroups.removeItemById(id);

            out = Outbound.create({
                action: 168,
                payload: [6, 1, id - sys.board.equipmentIds.circuitGroups.start],
                response: IntelliCenterBoard.getAckResponse(168),
                retries: 3
            });
            for (let i = 0; i < 16; i++) out.payload.push(255);
            out.appendPayloadString(normalizeIntelliCenterName(group.name), 16);
            await out.sendAsync();
            out = Outbound.create({
                action: 168,
                payload: [6, 2, id - sys.board.equipmentIds.circuitGroups.start],
                response: IntelliCenterBoard.getAckResponse(168),
                retries: 3
            });
            for (let i = 0; i < 16; i++) out.payload.push(0);
            await out.sendAsync();
            return group;
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
                retries: 5
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
            out.payload.push(0, 0, eggHours, eggMins, 0, 0, 0);
            await out.sendAsync();
            sgroup.type = group.type = 1;
            sgroup.lightingTheme = group.lightingTheme = theme;
            group.eggTimer = eggTimer;
            group.dontStop = obj.dontStop;
            if (typeof obj.circuits !== 'undefined') {
                for (let i = 0; i < obj.circuits.length; i++) {
                    let c = group.circuits.getItemByIndex(i, true, { id: i + 1 });
                    c.circuit = obj.circuits[i].circuit;
                    c.swimDelay = obj.circuits[i].swimDelay;
                    if (typeof obj.circuits[i].color !== 'undefined') c.color = obj.circuits[i].color;
                }
                group.circuits.length = obj.circuits.length;
            }

            out = Outbound.create({
                action: 168,
                payload: [6, 1, id - sys.board.equipmentIds.circuitGroups.start],
                response: IntelliCenterBoard.getAckResponse(168),
                retries: 3
            });
            for (let i = 0; i < 16; i++) out.payload.push(255);
            out.payload[3] = 10;
            const groupName = normalizeIntelliCenterName(obj.name, group.name);
            out.appendPayloadString(groupName, 16);
            await out.sendAsync();
            if (typeof obj.name !== 'undefined') sgroup.name = group.name = groupName;

            out = Outbound.create({
                action: 168,
                payload: [6, 2, id - sys.board.equipmentIds.circuitGroups.start],
                response: IntelliCenterBoard.getAckResponse(168),
                retries: 3
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
            out.appendPayloadString(groupName, 16);
            await out.sendAsync();
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
            return group;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async deleteLightGroupAsync(obj: any): Promise<LightGroup> {
        let group: LightGroup = null;
        let id = parseInt(obj.id, 10);
        if (isNaN(id) || !sys.board.equipmentIds.circuitGroups.isInRange(id)) return Promise.reject(new Error(`Invalid light group id: ${obj.id}`));
        group = sys.lightGroups.getItemById(id);
        try {
            let out = Outbound.create({
                action: 168,
                payload: [6, 0, id - sys.board.equipmentIds.circuitGroups.start, 0, 0, 0],
                response: IntelliCenterBoard.getAckResponse(168),
                retries: 5
            });
            for (let i = 0; i < 16; i++) i < group.circuits.length ? out.payload.push(group.circuits.getItemByIndex(i).circuit - 1) : out.payload.push(255);
            for (let i = 0; i < 16; i++) out.payload.push(0);
            out.payload.push(12);
            out.payload.push(0);
            await out.sendAsync();
            let gstate = state.lightGroups.getItemById(id);
            gstate.isActive = false;
            gstate.emitEquipmentChange();
            sys.lightGroups.removeItemById(id);
            state.lightGroups.removeItemById(id);
            out = Outbound.create({
                action: 168,
                retries: 5,
                response: IntelliCenterBoard.getAckResponse(168),
                payload: [6, 1, id - sys.board.equipmentIds.circuitGroups.start]
            });
            for (let i = 0; i < 16; i++) out.payload.push(255);
            out.appendPayloadString(group.name);
            await out.sendAsync();

            out = Outbound.create({
                action: 168,
                retries: 5,
                response: IntelliCenterBoard.getAckResponse(168),
                payload: [6, 2, id - sys.board.equipmentIds.circuitGroups.start]
            });
            for (let i = 0; i < 16; i++) out.payload.push(0);
            await out.sendAsync();

            return group;
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
            msgs.msg0.response = IntelliCenterBoard.getAckResponse(168);
            msgs.msg0.retries = 5;
            await msgs.msg0.sendAsync();
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

            msgs.msg1.response = IntelliCenterBoard.getAckResponse(168);
            msgs.msg1.retries = 5;
            await msgs.msg1.sendAsync();
            msgs.msg2.response = IntelliCenterBoard.getAckResponse(168);
            msgs.msg2.retries = 5;
            await msgs.msg2.sendAsync();
            return grp;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async runLightGroupCommandAsync(obj: any): Promise<ICircuitState> {
        try {
            let id = parseInt(obj.id, 10);
            let cmd = typeof obj.command !== 'undefined' ? sys.board.valueMaps.lightGroupCommands.findItem(obj.command) : { val: 0, name: 'undefined' };
            if (cmd.val === 0) return Promise.reject(new InvalidOperationError(`Light group command ${cmd.name} does not exist`, 'runLightGroupCommandAsync'));
            if (isNaN(id)) return Promise.reject(new InvalidOperationError(`Light group ${id} does not exist`, 'runLightGroupCommandAsync'));
            let grp = sys.lightGroups.getItemById(id);
            let sgrp = state.lightGroups.getItemById(grp.id);
            let cmdByte = 0;
            let actionName = '';
            switch (cmd.name) {
                case 'colorswim': cmdByte = 1; actionName = 'colorswim'; break;
                case 'colorset': cmdByte = 2; actionName = 'colorset'; break;
                case 'colorsync': cmdByte = 3; actionName = 'colorsync'; break;
                default: return sgrp;
            }
            let nop = sys.board.valueMaps.circuitActions.getValue(actionName);
            sgrp.action = nop;
            sgrp.emitEquipmentChange();
            for (let i = 0; i < grp.circuits.length; i++) {
                let mc = grp.circuits.getItemByIndex(i);
                if (mc.circuit) {
                    let cs = state.circuits.getItemById(mc.circuit);
                    if (cs) { cs.action = nop; cs.emitEquipmentChange(); }
                }
            }
            let groupIdx = id - sys.board.equipmentIds.circuitGroups.start;
            let out = Outbound.createMessage(184, [88, 163, groupIdx, 0, 138, 177, cmdByte, 0, 0, 0], 3);
            out.dest = 16;
            await out.sendAsync();
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
            out.retries = 5;
            out.response = IntelliCenterBoard.getAckResponse(168);
            await out.sendAsync();
            sgroup.action = sys.board.valueMaps.circuitActions.getValue(cmd.name);
            state.emitEquipmentChanges();
            return sgroup;
        } catch (err) {
            sgroup.action = 0;
            return Promise.reject(new InvalidOperationError(`Error Sequencing Light Group: ${err.message}`, 'sequenceLightGroupAsync'));
        }
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
        //        await out.sendAsync();
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
    protected async getConfigAsync(payload: number[]): Promise<boolean> {

        const dest = 16;
        let out = Outbound.create({
            dest,
            action: 222,
            scope: 'v3CommandReadback',
            retries: 3,
            payload: payload,
            response: Response.create({ dest: -1, action: 30, payload: payload })
        });
        await out.sendAsync();
        // Do NOT ACK(30). Wireless captures show config succeeds without ACK(30), and v1 queue avoids ACK(30).
        return true;

    }
    public async setCircuitStateAsync(id: number, val: boolean, ignoreDelays?: boolean): Promise<ICircuitState> {
        // v3.004+ features: dashPanel (and other callers) may route feature toggles through the "circuit" path.
        // IntelliCenter features live in a different Action 184 channel (0xE89D), so delegate feature IDs here.
        if (sys.board.equipmentIds.features.isInRange(id)) {
            logger.info(`v3.004+ setCircuitStateAsync: ID ${id} is a feature; delegating to setFeatureStateAsync -> ${val ? 'ON' : 'OFF'}`);
            return await this.board.features.setFeatureStateAsync(id, val, ignoreDelays);
        }
        if (sys.board.equipmentIds.circuitGroups.isInRange(id)) {
            await this.setCircuitGroupStateAsync(id, val);
            return state.circuitGroups.getInterfaceById(id);
        }
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
        
        // Add to pending states BEFORE building the message. This ensures that if multiple commands
        // are sent in quick succession, subsequent commands will include this pending change.
        // Fix for: "only last change takes effect when multiple circuits toggled quickly"
        this.addPendingState(id, val);
        try {
            // v3.004+ body circuits (Spa=1, Pool=6): Wireless does NOT control bodies by sending the circuit's targetId directly.
            // Captures show body control uses a "body toggle" primitive (target=168,237 state=0/1) plus
            // additional body context/selection packets (notably targets 212,182 and 114,145).
            // See .plan/202-intellicenter-bodies-temps.md for full protocol documentation.
            if (this.isBodyCircuit(id)) {
                const isPool = (id === 6);
                const bodyName = isPool ? 'Pool' : 'Spa';
                if (state.freeze) {
                    logger.info(`v3.004+ freeze override: Sending ON for ${bodyName} (freeze active, original request=${val ? 'ON' : 'OFF'})`);
                    val = true;
                }
                logger.debug(`v3.004+ setCircuitStateAsync: Using Wireless-style body control sequence for ${bodyName} (circuit ${id}) -> ${val ? 'ON' : 'OFF'}`);
                await this.sendV3BodyControlSequenceAsync(isPool, val);
                // Request updated config to confirm state change
                await this.getConfigAsync([15, 0]);
                let circ = state.circuits.getInterfaceById(id);
                state.emitEquipmentChanges();
                return circ;
            }

            // v3.004+ non-body circuits: Use indexed Action 184 (Wireless-style)
            {
                const circuit = sys.circuits.getItemById(id, false);
                logger.info(`v3.004+ setCircuitStateAsync: Using indexed Action 184 for circuit ${id} (${circuit?.name || 'unnamed'}) -> ${val ? 'ON' : 'OFF'}`);
                const idx = Math.max(0, Math.min(255, (id | 0) - 1));
                const out = Outbound.createMessage(184, [
                    104, 143,
                    idx,
                    255,
                    168, 237,
                    val ? 1 : 0,
                    0, 0, 0
                ], 3);
                out.dest = 16;
                out.scope = `circuitState${id}`;
                out.retries = 5;
                out.response = IntelliCenterBoard.getAckResponse(184);
                await out.sendAsync();
                await this.getConfigAsync([15, 0]);
                let circ = state.circuits.getInterfaceById(id);
                state.emitEquipmentChanges();
                return circ;
            }

        }
        catch (err) { return Promise.reject(err); }
        finally {
            // Clear the pending state after command completes (success or failure).
            // The getConfigAsync([15, 0]) above should have updated state from OCP response.
            this.clearPendingState(id);
        }
    }

    /**
     * Determines if a circuit ID corresponds to a body circuit (Pool or Spa).
     * Body circuits require special Wireless-style control sequences on v3.004+.
     * 
     * On IntelliCenter, body circuits are:
     *   - Circuit 1 = Spa
     *   - Circuit 6 = Pool
     * 
     * These IDs are standard across IntelliCenter installations.
     */
    private isBodyCircuit(id: number): boolean {
        return id === 1 || id === 6;
    }

    /**
     * v3.004+ IntelliCenter body control sequence (Wireless-style).
     *
     * Evidence (Replay 68 "bodies-cycle-all"):
     * - Body selection uses Action 184 target 114,145 with payload byte6=1 (Pool) or byte6=0 (Spa)
     * - Body context uses Action 184 target 212,182 with body-specific bytes 6-9
     * - Actual toggle uses Action 184 target 168,237 with state in byte6 (0/1)
     *
     * This sequence is used for both Pool (id=6) and Spa (id=1) on v3.004+.
     * See .plan/202-intellicenter-bodies-temps.md for full protocol documentation.
     */
    private async sendV3BodyControlSequenceAsync(isPool: boolean, isOn: boolean): Promise<void> {
        const bodyName = isPool ? 'Pool' : 'Spa';
        const seq = isPool ? 5 : 0;  // Sequence varies by body in captures

        // 1) Body select (target 114,145 / 0x7291) — chooses Pool (byte6=1) vs Spa (byte6=0)
        const select = Outbound.createMessage(184, [
            128, 142,        // Channel/context (observed)
            0,               // Sequence
            0,               // Format (observed)
            114, 145,        // Target 0x7291
            isPool ? 1 : 0,  // Select: 1=Pool, 0=Spa
            0, 0, 0
        ], 3);
        select.dest = 16;
        select.scope = `bodySelect${bodyName}`;
        select.retries = 5;
        select.response = IntelliCenterBoard.getAckResponse(184);
        await select.sendAsync();

        // 2) Body context (target 212,182 / 0xD4B6) — body-specific bytes 6-9
        // Observed: Spa ON=[0,101,4,0], Pool ON=[128,151,6,0], OFF=[255,255,255,255]
        const ctxBytes = !isOn ? [255, 255, 255, 255] : (isPool ? [128, 151, 6, 0] : [0, 101, 4, 0]);
        const ctx = Outbound.createMessage(184, [
            104, 143,        // Default channel
            seq,             // Sequence
            255,             // Format (command)
            212, 182,        // Target 0xD4B6
            ...ctxBytes
        ], 3);
        ctx.dest = 16;
        ctx.scope = `bodyContext${bodyName}`;
        ctx.retries = 5;
        ctx.response = IntelliCenterBoard.getAckResponse(184);
        await ctx.sendAsync();

        // 3) Body toggle (target 168,237 / 0xA8ED) — state in byte6
        const toggle = Outbound.createMessage(184, [
            104, 143,        // Default channel
            seq,             // Sequence
            255,             // Format (command)
            168, 237,        // Target 0xA8ED
            isOn ? 1 : 0,    // State
            0, 0, 0
        ], 3);
        toggle.dest = 16;
        toggle.scope = `bodyToggle${bodyName}`;
        toggle.retries = 5;
        toggle.response = IntelliCenterBoard.getAckResponse(184);
        await toggle.sendAsync();
    }
    public async setCircuitGroupStateAsync(id: number, val: boolean): Promise<ICircuitGroupState> {
        let grp = sys.circuitGroups.getItemById(id, false, { isActive: false });
        let gstate = (grp.dataName === 'circuitGroupConfig') ? state.circuitGroups.getItemById(grp.id, grp.isActive !== false) : state.lightGroups.getItemById(grp.id, grp.isActive !== false);
        let isLightGroup = grp.dataName === 'lightGroupConfig';
        if (isLightGroup && val) {
            let nop = sys.board.valueMaps.circuitActions.getValue('settheme');
            (gstate as LightGroupState).action = nop;
            gstate.emitEquipmentChange();
        }
        try {
            let groupIdx = id - sys.board.equipmentIds.circuitGroups.start;
            let out = Outbound.createMessage(184, [
                88, 163,
                groupIdx,
                0,
                168, 237,
                val ? 1 : 0,
                0, 0, 0
            ], 3);
            out.dest = 16;
            out.scope = `circuitGroupState${id}`;
            out.retries = 5;
            out.response = IntelliCenterBoard.getAckResponse(184);
            await out.sendAsync();
            if (isLightGroup && val) {
                setTimeout(() => {
                    (gstate as LightGroupState).action = 0;
                    gstate.emitEquipmentChange();
                }, 15000);
            }
            return state.circuitGroups.getInterfaceById(id);
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setLightGroupStateAsync(id: number, val: boolean): Promise<ICircuitGroupState> { return this.setCircuitGroupStateAsync(id, val); }
    public async setLightGroupThemeAsync(id: number, theme: number): Promise<ICircuitState> {
        try {
            let group = sys.lightGroups.getItemById(id);
            let sgroup = state.lightGroups.getItemById(id);
            let nop = sys.board.valueMaps.circuitActions.getValue('settheme');
            sgroup.action = nop;
            sgroup.emitEquipmentChange();
            let msgs = this.createLightGroupMessages(group);
            msgs.msg0.payload[4] = (theme << 2) + 1;
            msgs.msg0.response = IntelliCenterBoard.getAckResponse(168);
            msgs.msg0.retries = 5;
            await msgs.msg0.sendAsync();
            group.lightingTheme = theme;
            sgroup.lightingTheme = theme;
            setTimeout(() => {
                sgroup.action = 0;
                sgroup.emitEquipmentChange();
            }, 15000);
            state.emitEquipmentChanges();
            return sgroup;
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
                out.appendPayloadString(normalizeIntelliCenterName(circuit.name), 16);
                await out.sendAsync();
                circuit.lightingTheme = theme;
                cstate.lightingTheme = theme;
                cstate.action = 0;
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
        msgs.msg1.appendPayloadString(normalizeIntelliCenterName(group.name), 16);
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
            let cstate = state.circuits.getItemByIndex(i);
            let ordinal = cstate.id - 1;
            if (ordinal >= 40) continue;
            let ndx = Math.floor(ordinal / 8);
            let byte = out.payload[ndx + 3];
            let bit = ordinal - (ndx * 8);
            // Use pending state if available to avoid race conditions when multiple commands sent quickly
            let effectiveState = cstate.id === id ? isOn : this.getEffectiveState(cstate.id, cstate.isOn);
            if (effectiveState) byte = byte | (1 << bit);
            out.payload[ndx + 3] = byte;
        }
        // IntelliCenter has "special" circuits (not in equipmentIds.circuits range) used by bodies (e.g. Spa circuit 1 when circuits.start=2).
        // Ensure the body circuit bit is represented so dashPanel can turn Spa ON (replay.27 shows Spa is body2.circuit=1).
        try {
            if (sys.bodies.length > 1) {
                const spaState = state.temps.bodies.getItemById(2, false);
                const spaCfg = sys.bodies.getItemById(2, false);
                const spaCircuitId = spaCfg && typeof spaCfg.circuit === 'number' ? spaCfg.circuit : 1;
                if (spaCircuitId > 0 && spaCircuitId < sys.board.equipmentIds.circuits.start) {
                    const ordinal = spaCircuitId - 1;
                    const ndx = Math.floor(ordinal / 8);
                    const bit = ordinal - (ndx * 8);
                    let byte = out.payload[ndx + 3] || 0;
                    const shouldBeOn = (typeof id !== 'undefined' && id === spaCircuitId) ? !!isOn : !!(spaState && spaState.isOn);
                    if (shouldBeOn) byte = byte | (1 << bit);
                    out.payload[ndx + 3] = byte;
                }
            }
        } catch (e) { /* best-effort; do not block circuit toggles */ }
        // Set the bits for the features.
        for (let i = 0; i < state.data.features.length; i++) {
            // We are using the index and setting the features based upon
            // the index.  This way it doesn't matter what the sort happens to
            // be and whether there are gaps in the ids or not.  The ordinal is the bit number.
            let feature = state.features.getItemByIndex(i);
            let ordinal = feature.id - sys.board.equipmentIds.features.start;
            if (ordinal >= 32) continue;
            let ndx = Math.floor(ordinal / 8);
            let byte = out.payload[ndx + 9];
            let bit = ordinal - (ndx * 8);
            // Use pending state if available to avoid race conditions when multiple commands sent quickly
            let effectiveState = feature.id === id ? isOn : this.getEffectiveState(feature.id, feature.isOn);
            if (effectiveState) byte = byte | (1 << bit);
            out.payload[ndx + 9] = byte;
        }
        // Set the bits for the circuit groups.
        for (let i = 0; i < state.data.circuitGroups.length; i++) {
            let group = state.circuitGroups.getItemByIndex(i);
            let ordinal = group.id - sys.board.equipmentIds.circuitGroups.start;
            if (ordinal >= 16) continue;
            let ndx = Math.floor(ordinal / 8);
            let byte = out.payload[ndx + 13];
            let bit = ordinal - (ndx * 8);
            // Use pending state if available to avoid race conditions when multiple commands sent quickly
            let effectiveState = group.id === id ? isOn : this.getEffectiveState(group.id, group.isOn);
            if (effectiveState) byte = byte | (1 << bit);
            out.payload[ndx + 13] = byte;
        }
        // Set the bits for the light groups.
        for (let i = 0; i < state.data.lightGroups.length; i++) {
            let group = state.lightGroups.getItemByIndex(i);
            let ordinal = group.id - sys.board.equipmentIds.circuitGroups.start;
            if (ordinal >= 16) continue;
            let ndx = Math.floor(ordinal / 8);
            let byte = out.payload[ndx + 13];
            let bit = ordinal - (ndx * 8);
            // Use pending state if available to avoid race conditions when multiple commands sent quickly
            let effectiveState = group.id === id ? isOn : this.getEffectiveState(group.id, group.isOn);
            if (effectiveState) byte = byte | (1 << bit);
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
            if (ordinal >= 100) continue;
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
                    //let dayVal = sd.bitVal || sd.val;  // The bitval allows mask overrides.
                    let ts = dt.getHours() * 60 + dt.getMinutes();
                    if ((sched.scheduleDays & sd.bitval) > 0 && ts >= sched.startTime && ts <= sched.endTime) byte = byte | (1 << bit);
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
            let out = Outbound.create({
                action: 168, payload: [1, 0, id - 1, circuit.type, circuit.freeze ? 1 : 0, circuit.showInFeatures ? 1 : 0,
                    level, Math.floor(circuit.eggTimer / 60), circuit.eggTimer - ((Math.floor(circuit.eggTimer) / 60) * 60), circuit.dontStop ? 1 : 0],
                response: IntelliCenterBoard.getAckResponse(168),
                retries: 5
            });
            out.appendPayloadString(normalizeIntelliCenterName(circuit.name), 16);
            await out.sendAsync();
            circuit.level = level;
            cstate.level = level;
            sys.board.circuits.setEndTime(circuit, cstate, true);
            cstate.isOn = true;
            state.emitEquipmentChanges();
            return cstate;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async toggleCircuitStateAsync(id: number): Promise<ICircuitState> {
        // v3.004+ features: dashPanel may attempt to toggle features via the circuit endpoint.
        if (sys.board.equipmentIds.features.isInRange(id)) {
            return await this.board.features.toggleFeatureStateAsync(id);
        }
        let circ = state.circuits.getInterfaceById(id);
        return sys.board.circuits.setCircuitStateAsync(id, !circ.isOn);
    }
    public syncVirtualCircuitStates() {
        try {
            let arrCircuits = sys.board.valueMaps.virtualCircuits.toArray();
            let poolStates = sys.board.bodies.getPoolStates();
            let spaStates = sys.board.bodies.getSpaStates();
            let allBodyStates = poolStates.concat(spaStates);
            for (let i = 0; i < arrCircuits.length; i++) {
                let vc = arrCircuits[i];
                let remove = false;
                let bState = false;
                let cstate: VirtualCircuitState = null;
                switch (vc.name) {
                    case 'poolHeater':
                        remove = true;
                        for (let j = 0; j < poolStates.length; j++) {
                            if (poolStates[j].heaterOptions.total > 0) remove = false;
                        }
                        if (!remove) {
                            for (let j = 0; j < poolStates.length && !bState; j++) {
                                let hstatus = sys.board.valueMaps.heatStatus.getName(poolStates[j].heatStatus);
                                if (hstatus !== 'off') bState = true;
                            }
                        }
                        break;
                    case 'spaHeater':
                        remove = true;
                        for (let j = 0; j < spaStates.length; j++) {
                            if (spaStates[j].heaterOptions.total > 0) remove = false;
                        }
                        if (!remove) {
                            for (let j = 0; j < spaStates.length && !bState; j++) {
                                let hstatus = sys.board.valueMaps.heatStatus.getName(spaStates[j].heatStatus);
                                if (hstatus !== 'off') bState = true;
                            }
                        }
                        break;
                    case 'heater':
                        remove = true;
                        for (let j = 0; j < allBodyStates.length; j++) {
                            if (allBodyStates[j].heaterOptions.gas > 0) remove = false;
                        }
                        if (!remove) {
                            for (let j = 0; j < allBodyStates.length && !bState; j++) {
                                let hstatus = sys.board.valueMaps.heatStatus.getName(allBodyStates[j].heatStatus);
                                if (hstatus === 'heater') bState = true;
                            }
                        }
                        break;
                    case 'freeze':
                        bState = state.freeze;
                        break;
                    case 'poolSpa':
                        for (let j = 0; j < allBodyStates.length && !bState; j++) {
                            if (allBodyStates[j].isOn) bState = true;
                        }
                        break;
                    case 'solarHeat':
                    case 'solar':
                        remove = true;
                        for (let j = 0; j < allBodyStates.length; j++) {
                            if (allBodyStates[j].heaterOptions.solar) remove = false;
                        }
                        if (!remove) {
                            for (let j = 0; j < allBodyStates.length && !bState; j++) {
                                let hstatus = sys.board.valueMaps.heatStatus.getName(allBodyStates[j].heatStatus);
                                if (hstatus === 'solar') bState = true;
                            }
                        }
                        break;
                    case 'anyHeater':
                        remove = true;
                        for (let j = 0; j < allBodyStates.length; j++) {
                            if (allBodyStates[j].heaterOptions.total > 0) remove = false;
                        }
                        if (!remove) {
                            for (let j = 0; j < allBodyStates.length && !bState; j++) {
                                let heat = sys.board.valueMaps.heatStatus.getName(allBodyStates[j].heatStatus);
                                if (heat !== 'off') bState = true;
                            }
                        }
                        break;
                    case 'heatPump':
                        remove = true;
                        for (let j = 0; j < allBodyStates.length; j++) {
                            if (allBodyStates[j].heaterOptions.heatpump > 0) remove = false;
                        }
                        if (!remove) {
                            for (let j = 0; j < allBodyStates.length && !bState; j++) {
                                let hstatus = sys.board.valueMaps.heatStatus.getName(allBodyStates[j].heatStatus);
                                if (hstatus === 'hpheat') bState = true;
                            }
                        }
                        break;
                    case 'ultraTemp':
                        remove = true;
                        for (let j = 0; j < allBodyStates.length; j++) {
                            if (allBodyStates[j].heaterOptions.ultratemp > 0) remove = false;
                        }
                        if (!remove) {
                            for (let j = 0; j < allBodyStates.length && !bState; j++) {
                                let hstatus = sys.board.valueMaps.heatStatus.getName(allBodyStates[j].heatStatus);
                                if (hstatus === 'utheat' || hstatus === 'utcool') bState = true;
                            }
                        }
                        break;
                    case 'hybrid':
                        remove = true;
                        for (let j = 0; j < allBodyStates.length; j++) {
                            if (allBodyStates[j].heaterOptions.hybrid > 0) remove = false;
                        }
                        if (!remove) {
                            for (let j = 0; j < allBodyStates.length && !bState; j++) {
                                let hstatus = sys.board.valueMaps.heatStatus.getName(allBodyStates[j].heatStatus);
                                if (hstatus === 'hybheat') bState = true;
                            }
                        }
                        break;
                    case 'heatBoost':
                    case 'heatEnable':
                    case 'poolHeatEnable':
                    case 'pumpSpeedUp':
                    case 'pumpSpeedDown':
                        remove = true;
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
}
export class IntelliCenterFeatureCommands extends FeatureCommands {
    declare board: IntelliCenterBoard;

    protected async getConfigAsync(payload: number[]): Promise<boolean> {
        const dest = 16;
        let out = Outbound.create({
            dest,
            action: 222,
            scope: 'v3CommandReadback',
            retries: 3,
            payload: payload,
            response: Response.create({ dest: -1, action: 30, payload: payload })
        });
        await out.sendAsync();
        // Do NOT ACK(30). Wireless captures show config succeeds without ACK(30), and v1 queue avoids ACK(30).
        return true;
    }

    public async setFeatureStateAsync(id: number, val: boolean, ignoreDelays?: boolean): Promise<ICircuitState> {
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid feature id: ${id}`, id, 'Feature'));
        if (!sys.board.equipmentIds.features.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid feature id: ${id}`, id, 'Feature'));

        const feature = sys.features.getItemById(id, false, { isActive: false });
        logger.info(`v3.004+ setFeatureStateAsync: Using indexed Action 184 for feature ${id} (${feature?.name || 'unnamed'}) -> ${val ? 'ON' : 'OFF'}`);

        const idx = Math.max(0, Math.min(255, (id | 0) - 1));
        const out = Outbound.createMessage(184, [
            232, 157,
            idx,
            0,
            168, 237,
            val ? 1 : 0,
            0, 0, 0
        ], 3);
        out.dest = 16;
        out.scope = `featureState${id}`;
        out.retries = 5;
        out.response = IntelliCenterBoard.getAckResponse(184);
        await out.sendAsync();

        await this.getConfigAsync([15, 0]);

        const fstate = state.features.getItemById(id, true);
        state.emitEquipmentChanges();
        return fstate;
    }

    public async toggleFeatureStateAsync(id: number): Promise<ICircuitState> {
        const feat = state.features.getItemById(id);
        return this.setFeatureStateAsync(id, !(feat.isOn || false));
    }
    public syncGroupStates() { } // Do nothing and let IntelliCenter do it.
    public async setFeatureAsync(data: any): Promise<Feature> {

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
                eggHrs, eggMins, data.dontStop ? 1 : 0]
        });
        let nameStr = normalizeIntelliCenterName(data.name, feature.name);
        out.appendPayloadString(nameStr, 16);
        await out.sendAsync();
        feature = sys.features.getItemById(id, true);
        let fstate = state.features.getItemById(id, true);

        feature.eggTimer = eggTimer;
        feature.dontStop = data.dontStop;
        fstate.freezeProtect = feature.freeze = (typeof data.freeze !== 'undefined' ? utils.makeBool(data.freeze) : feature.freeze);
        fstate.showInFeatures = feature.showInFeatures = (typeof data.showInFeatures !== 'undefined' ? utils.makeBool(data.showInFeatures) : feature.showInFeatures);
        fstate.name = feature.name = nameStr;
        fstate.type = feature.type = typeof data.type !== 'undefined' ? parseInt(data.type, 10) : feature.type;
        fstate.emitEquipmentChange();
        return feature;

    }
    public async deleteFeatureAsync(data: any): Promise<Feature> {
        let id = parseInt(data.id, 10);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('feature Id has not been defined', data.id, 'Feature'));
        let feature = sys.features.getItemById(id, false);
        let out = Outbound.create({
            action: 168,
            payload: [2, 0, id - sys.board.equipmentIds.features.start,
                255, // Delete the feature
                0, 0, 12, 0, 0],
            response: IntelliCenterBoard.getAckResponse(168),
            retries: 5
        });
        out.appendPayloadString(normalizeIntelliCenterName(data.name, feature.name), 16);
        await out.sendAsync();
        sys.features.removeItemById(id);
        feature.isActive = false;
        let fstate = state.features.getItemById(id, false);
        fstate.showInFeatures = false;
        state.features.removeItemById(id);
        return feature;
    }

}
export class IntelliCenterChlorinatorCommands extends ChlorinatorCommands {
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

        let name = normalizeIntelliCenterName(obj.name, chlor.name || 'IntelliChlor' + id);
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

        let out = Outbound.create({
            action: 168,
            payload: [7, 0, id - 1, body.val, 1,
                    disabled ? 0 : isDosing ? 100 : poolSetpoint,
                    disabled ? 0 : isDosing ? 100 : spaSetpoint,
                    0, 0, superChlorHours, 1, 20, 20],
            response: IntelliCenterBoard.getAckResponse(168),
            retries: 5
        });
        await out.sendAsync();
        if (superChlorinate !== utils.makeBool(chlor.superChlor)) {
            let scOut = Outbound.createMessage(184, [
                128, 142, 0, 0, 236, 239, superChlorinate ? 1 : 0, 0, 0, 0
            ], 3);
            scOut.dest = 16;
            scOut.retries = 5;
            scOut.response = IntelliCenterBoard.getAckResponse(184);
            await scOut.sendAsync();
        }
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
        return schlor;

    }
    public async deleteChlorAsync(obj: any): Promise<ChlorinatorState> {
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentDataError(`Chlorinator id is not valid: ${obj.id}`, 'chlorinator', obj.id));
        let chlor = sys.chlorinators.getItemById(id);
        if (chlor.master === 1) return await super.deleteChlorAsync(obj);
        let schlor = state.chlorinators.getItemById(id);
        // Verify the data.
        let out = Outbound.create({
            action: 168,
            payload: [7, 0, id - 1, schlor.body || 0, 0, schlor.poolSetpoint || 0, schlor.spaSetpoint || 0, 0, schlor.superChlorHours || 0, 0, 0],
            response: IntelliCenterBoard.getAckResponse(168),
            retries: 5
        });
        await out.sendAsync();
        ncp.chlorinators.deleteChlorinatorAsync(id).then(() => { });
        schlor = state.chlorinators.getItemById(id, true);
        state.chlorinators.removeItemById(id);
        sys.chlorinators.removeItemById(id);
        return schlor;
    }
}
export class IntelliCenterPumpCommands extends PumpCommands {
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
        outName.appendPayloadString(normalizeIntelliCenterName(pump.name), 16);
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
        try {
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
            // maxPumps is the count of pump slots (ids 1..maxPumps); reject only when strictly above that range
            else if (id > sys.equipment.maxPumps) return Promise.reject(new Error(`Pump id out of range: ${id}`));
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
            let outc = Outbound.create({ dest: 16, action: 168, payload: [4, 0, id - 1, ntype, 0] });
            const normalizeNumber = (value: any): number | undefined => {
                const parsed = parseInt(value, 10);
                return isNaN(parsed) ? undefined : parsed;
            };
            const pickNumber = (...candidates: any[]): number | undefined => {
                for (const candidate of candidates) {
                    const parsed = normalizeNumber(candidate);
                    if (typeof parsed !== 'undefined') return parsed;
                }
                return undefined;
            };
            const toIntelliCenterAddress = (address: number | undefined): number | undefined => {
                if (typeof address === 'undefined') return undefined;
                // API/UI uses 1..16 slots; wire payload uses 96..111.
                if (address > 0 && address <= 16) return address + 95;
                return address;
            };
            const resolvedAddress = toIntelliCenterAddress(pickNumber(data.address, pump.address, id + 95));
            const resolvedMinSpeed = pickNumber(data.minSpeed, pump.minSpeed, type.minSpeed, 450);
            const resolvedMaxSpeed = pickNumber(data.maxSpeed, pump.maxSpeed, type.maxSpeed, 3450);
            const resolvedMinFlow = pickNumber(data.minFlow, pump.minFlow, type.minFlow, 0);
            const resolvedMaxFlow = pickNumber(data.maxFlow, pump.maxFlow, type.maxFlow, 130);
            const resolvedFlowStepSize = pickNumber(data.flowStepSize, pump.flowStepSize, type.flowStepSize, 1);
            const resolvedPrimingSpeed = pickNumber(data.primingSpeed, pump.primingSpeed, type.primingSpeed, 2500);
            const resolvedSpeedStepSize = pickNumber(data.speedStepSize, pump.speedStepSize, type.speedStepSize, 10);
            const resolvedPrimingTime = pickNumber(data.primingTime, pump.primingTime, type.maxPrimingTime, 0);
            outc.appendPayloadByte(resolvedAddress, id + 95);        // 5
            // v3.004+ uses big-endian for 16-bit speed/flow values
            outc.appendPayloadIntBE(resolvedMinSpeed, 450);  // 6
            outc.appendPayloadIntBE(resolvedMaxSpeed, 3450);  // 8
            outc.appendPayloadByte(resolvedMinFlow, 0);   // 10
            outc.appendPayloadByte(resolvedMaxFlow, 130);   // 11
            outc.appendPayloadByte(resolvedFlowStepSize, 1); // 12
            outc.appendPayloadIntBE(resolvedPrimingSpeed, 2500); // 13
            outc.appendPayloadByte(Math.max(1, Math.floor((resolvedSpeedStepSize || 10) / 10)), 1); // 15
            outc.appendPayloadByte(resolvedPrimingTime, 0); // 17
            outc.appendPayloadByte(255); //
            outc.appendPayloadBytes(255, 8);    // 18
            outc.appendPayloadBytes(0, 8);      // 26
            let outn = Outbound.create({ dest: 16, action: 168, payload: [4, 1, id - 1] });
            outn.appendPayloadBytes(0, 16);
            const pumpName = normalizeIntelliCenterName(data.name, pump.name || type.name);
            outn.appendPayloadString(pumpName, 16);
            const isDualSpeed = type.name === 'ds';
            const circuitPayloadNdx = isDualSpeed ? 19 : 18;
            const unitsPayloadNdx = isDualSpeed ? 27 : 26;
            const maxPayloadCircuits = isDualSpeed ? 7 : 8;
            const poolBody = sys.board.valueMaps.pumpBodies.getValue('pool');
            const spaBody = sys.board.valueMaps.pumpBodies.getValue('spa');
            const poolSpaBody = sys.board.valueMaps.pumpBodies.getValue('poolspa');
            const normalizeBody = (body: number) => {
                if (body === 1) return poolBody;
                if (body === 2) return spaBody;
                if (body === 32) return poolSpaBody;
                return body;
            };
            const toBodyWireCode = (body: number) => {
                if (body === spaBody) return 1;
                if (body === poolSpaBody) return 32;
                return 0;
            };
            const requestedBody = normalizeBody(sys.board.valueMaps.pumpBodies.encode(data.body));
            const currentBody = normalizeBody(sys.board.valueMaps.pumpBodies.encode(pump.body));
            const bodyPayload = (!isNaN(requestedBody) && sys.board.valueMaps.pumpBodies.valExists(requestedBody))
                ? requestedBody
                : ((!isNaN(currentBody) && sys.board.valueMaps.pumpBodies.valExists(currentBody)) ? currentBody : poolBody);
            const bodyWireCode = toBodyWireCode(bodyPayload);
            if (type.hasBody === true) outc.setPayloadByte(10, bodyWireCode);
            if (isDualSpeed) outc.setPayloadByte(18, bodyPayload);
            if (type.name === 'ss') {
                outc.setPayloadByte(5, 0); // Clear the pump address

                // At some point we may add these to the pump model.
                // v3.004+ uses big-endian for 16-bit speed/flow values
                outc.setPayloadIntBE(6, type.minSpeed, 450);
                outc.setPayloadIntBE(8, type.maxSpeed, 3450);
                outc.setPayloadByte(10, bodyWireCode);
                outc.setPayloadByte(11, type.maxFlow, 130);
                outc.setPayloadByte(12, 1);
                outc.setPayloadIntBE(13, type.primingSpeed, 2500);
                outc.setPayloadByte(15, 10);
                outc.setPayloadByte(16, 1);
                outc.setPayloadByte(17, 5);
                outc.setPayloadByte(18, bodyPayload);
                outc.setPayloadByte(26, 0);
                outn.setPayloadIntBE(3, 0);
                for (let i = 1; i < 8; i++) {
                    outc.setPayloadByte(i + 18, 255);
                    outc.setPayloadByte(i + 26, 0);
                    outn.setPayloadIntBE((i * 2) + 3, 1000);
                }
            }
            else {
                // All of these pumps potentially have circuits.
                // Add in all the circuits
                if (typeof data.circuits === 'undefined') {
                    // The endpoint isn't changing the circuits and is just setting the attributes.
                    for (let i = 0; i < maxPayloadCircuits; i++) {
                        let circ = pump.circuits.getItemByIndex(i, false, { circuit: 255 });
                        circ.id = i + 1;
                        outc.setPayloadByte(i + circuitPayloadNdx, circ.circuit);
                    }
                }
                else {
                    if (typeof type.maxCircuits !== 'undefined' && type.maxCircuits > 0) {
                        for (let i = 0; i < maxPayloadCircuits; i++) {
                            let circ = pump.circuits.getItemByIndex(i, false, { circuit: 255 });
                            if (i >= data.circuits.length) {
                                // The incoming data does not include this circuit so we will set it to 255.
                                outc.setPayloadByte(i + circuitPayloadNdx, 255);
                                if (typeof type.minSpeed !== 'undefined')
                                    outn.setPayloadIntBE((i * 2) + 3, type.minSpeed);
                                else if (typeof type.minFlow !== 'undefined') {
                                    outn.setPayloadIntBE((i * 2) + 3, type.minFlow);
                                    outc.setPayloadByte(i + unitsPayloadNdx, 1);
                                }
                                else
                                    outn.setPayloadIntBE((i * 2) + 3, 0);
                            }
                            else {
                                let c = data.circuits[i];
                                let speed = parseInt(c.speed, 10);
                                let flow = parseInt(c.flow, 10);
                                let existingSpeed = parseInt(circ.speed as any, 10);
                                let existingFlow = parseInt(circ.flow as any, 10);
                                let speedChanged = !isNaN(speed) && (isNaN(existingSpeed) || speed !== existingSpeed);
                                let flowChanged = !isNaN(flow) && (isNaN(existingFlow) || flow !== existingFlow);
                                let circuit = i < type.maxCircuits ? parseInt(c.circuit, 10) : 256;
                                let currentCircuit = parseInt(circ.circuit as any, 10);
                                let circuitByte = !isNaN(circuit) ? circuit - 1 : (!isNaN(currentCircuit) ? currentCircuit - 1 : 255);
                                if (isNaN(circuitByte) || circuitByte < 0 || circuitByte > 255) circuitByte = 255;
                                const rpmUnits = sys.board.valueMaps.pumpUnits.getValue('rpm');
                                const gpmUnits = sys.board.valueMaps.pumpUnits.getValue('gpm');
                                let units: number;
                                if (type.name === 'vf') units = gpmUnits;
                                else if (type.name === 'vs') units = rpmUnits;
                                else {
                                    units = sys.board.valueMaps.pumpUnits.encode(c.units);
                                    if (isNaN(units)) units = parseInt(circ.units as any, 10);
                                    if (isNaN(units)) units = !isNaN(flow) && isNaN(speed) ? gpmUnits : rpmUnits;
                                }
                                // If the units marker and provided values disagree, prefer the populated value to avoid
                                // emitting NaN bytes in the outbound Action 168 payload.
                                if (units === rpmUnits && isNaN(speed) && !isNaN(flow)) units = gpmUnits;
                                else if (units === gpmUnits && isNaN(flow) && !isNaN(speed)) units = rpmUnits;
                                // If only one side changed, trust the side that changed even when units are stale.
                                else if (flowChanged && !speedChanged && typeof type.minFlow !== 'undefined') units = gpmUnits;
                                else if (speedChanged && !flowChanged && typeof type.minSpeed !== 'undefined') units = rpmUnits;
                                outc.setPayloadByte(i + circuitPayloadNdx, circuitByte, 255);
                                if (typeof type.minSpeed !== 'undefined' && units === rpmUnits) {
                                    outc.setPayloadByte(i + unitsPayloadNdx, 0); // Set to rpm
                                    const minSpeed = (typeof type.minSpeed === 'number' && !isNaN(type.minSpeed)) ? type.minSpeed : 450;
                                    const speedCandidate = !isNaN(speed) ? speed : existingSpeed;
                                    const safeSpeed = !isNaN(speedCandidate) ? Math.max(speedCandidate, minSpeed) : minSpeed;
                                    outn.setPayloadIntBE((i * 2) + 3, safeSpeed, minSpeed);
                                }
                                else if (typeof type.minFlow !== 'undefined' && units === gpmUnits) {
                                    outc.setPayloadByte(i + unitsPayloadNdx, 1); // Set to gpm
                                    const minFlow = (typeof type.minFlow === 'number' && !isNaN(type.minFlow)) ? type.minFlow : 15;
                                    const flowCandidate = !isNaN(flow) ? flow : existingFlow;
                                    const safeFlow = !isNaN(flowCandidate) ? Math.max(flowCandidate, minFlow) : minFlow;
                                    outn.setPayloadIntBE((i * 2) + 3, safeFlow, minFlow);
                                }
                            }
                        }
                    }
                }
            }
            // We now have our messages.  Let's send them off and update our values.
            outc.response = IntelliCenterBoard.getAckResponse(168);
            outc.retries = 5;
            await outc.sendAsync();
            // We have been successful so lets set our pump with the new data.
            pump = sys.pumps.getItemById(id, true);
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
                if (typeof data.body !== 'undefined') pump.body = bodyPayload;
            }
            else if (type.name === 'ds') {
                pump.address = undefined;
                pump.primingTime = 0;
                pump.primingSpeed = type.primingSpeed || 2500;
                pump.minSpeed = type.minSpeed || 450;
                pump.maxSpeed = type.maxSpeed || 3450;
                pump.minFlow = type.minFlow, 0;
                pump.maxFlow = type.maxFlow, 130;
                if (typeof data.body !== 'undefined') pump.body = bodyPayload;
            }
            else {
                if (typeof data.address !== 'undefined') {
                    const parsedAddress = normalizeNumber(data.address);
                    const normalizedAddress = toIntelliCenterAddress(parsedAddress);
                    if (typeof normalizedAddress !== 'undefined') pump.address = normalizedAddress;
                }
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
                const maxConfigCircuits = type.name === 'ds' ? 7 : 8;
                for (let i = 0; i < 8; i++) {
                    if (i >= maxConfigCircuits || i >= data.circuits.length) pump.circuits.removeItemByIndex(i);
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


            outn.response = IntelliCenterBoard.getAckResponse(168);
            outn.retries = 5;
            await outn.sendAsync();
            // We have been successful so lets set our pump with the new data.
            pump = sys.pumps.getItemById(id, true);
            spump = state.pumps.getItemById(id, true);
            if (typeof data.name !== 'undefined') spump.name = pump.name = pumpName;
            spump.type = pump.type = ntype;
            if (type.name !== 'ss') {
                if (typeof data.circuits !== 'undefined') {
                    // Set all the circuits
                    const maxConfigCircuits = type.name === 'ds' ? 7 : 8;
                    for (let i = 0; i < 8; i++) {
                        if (i >= maxConfigCircuits || i >= data.circuits.length) pump.circuits.removeItemByIndex(i);
                        else {
                            let c = data.circuits[i];
                            let circuitId = typeof c.circuit !== 'undefined' ? parseInt(c.circuit, 10) : pump.circuits.getItemById(i, false).circuit;
                            let circ = pump.circuits.getItemByIndex(i, true);
                            circ.circuit = circuitId;
                            const rpmUnits = sys.board.valueMaps.pumpUnits.getValue('rpm');
                            const gpmUnits = sys.board.valueMaps.pumpUnits.getValue('gpm');
                            let speed = parseInt(c.speed, 10);
                            let flow = parseInt(c.flow, 10);
                            let existingSpeed = parseInt(circ.speed as any, 10);
                            let existingFlow = parseInt(circ.flow as any, 10);
                            let speedChanged = !isNaN(speed) && (isNaN(existingSpeed) || speed !== existingSpeed);
                            let flowChanged = !isNaN(flow) && (isNaN(existingFlow) || flow !== existingFlow);
                            let units: number;
                            if (type.name === 'vf') units = gpmUnits;
                            else if (type.name === 'vs') units = rpmUnits;
                            else {
                                units = sys.board.valueMaps.pumpUnits.encode(c.units);
                                if (isNaN(units)) units = parseInt(circ.units as any, 10);
                                if (isNaN(units)) units = !isNaN(flow) && isNaN(speed) ? gpmUnits : rpmUnits;
                            }
                            if (units === rpmUnits && isNaN(speed) && !isNaN(flow)) units = gpmUnits;
                            else if (units === gpmUnits && isNaN(flow) && !isNaN(speed)) units = rpmUnits;
                            else if (flowChanged && !speedChanged && typeof type.minFlow !== 'undefined') units = gpmUnits;
                            else if (speedChanged && !flowChanged && typeof type.minSpeed !== 'undefined') units = rpmUnits;
                            circ.units = units;
                            if (circ.units === gpmUnits && typeof type.minFlow !== 'undefined') {
                                const minFlow = (typeof type.minFlow === 'number' && !isNaN(type.minFlow)) ? type.minFlow : 15;
                                const flowCandidate = !isNaN(flow) ? flow : existingFlow;
                                circ.flow = !isNaN(flowCandidate) ? Math.max(flowCandidate, minFlow) : minFlow;
                                circ.speed = undefined;
                            }
                            else if (circ.units === rpmUnits && typeof type.minSpeed !== 'undefined') {
                                const minSpeed = (typeof type.minSpeed === 'number' && !isNaN(type.minSpeed)) ? type.minSpeed : 450;
                                const speedCandidate = !isNaN(speed) ? speed : existingSpeed;
                                circ.speed = !isNaN(speedCandidate) ? Math.max(speedCandidate, minSpeed) : minSpeed;
                                circ.flow = undefined;
                            }
                        }
                    }
                }
            }
            state.emitEquipmentChanges();
            return sys.pumps.getItemById(id);
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
            outc.appendPayloadIntBE(450);  // 6
            outc.appendPayloadIntBE(3450);  // 8
        outc.appendPayloadByte(15);   // 10
        outc.appendPayloadByte(130);   // 11
        outc.appendPayloadByte(1); // 12
            outc.appendPayloadIntBE(1000);  // 13
            outc.appendPayloadIntBE(10);   // 15
        outc.appendPayloadByte(5);   // 17
        outc.appendPayloadBytes(255, 8);    // 18
        outc.appendPayloadBytes(0, 8);      // 26
        let outn = Outbound.create({ action: 168, payload: [4, 1, id - 1] });
        outn.appendPayloadBytes(0, 16);
        outn.appendPayloadString('Pump -' + (id + 1), 16);
        // We now have our messages.  Let's send them off and update our values.
        try {
            outc.retries = 5;
            outc.response = IntelliCenterBoard.getAckResponse(168);
            await outc.sendAsync();
            let spump = state.pumps.getItemById(id);
            sys.pumps.removeItemById(id);
            state.pumps.removeItemById(id);
            spump.isActive = false;
            spump.emitEquipmentChange();

            outn.response = IntelliCenterBoard.getAckResponse(168);
            outn.retries = 2;
            await outn.sendAsync();
            state.emitEquipmentChanges();
            return pump;
        } catch (err) { return Promise.reject(err); }
    }
}
export class IntelliCenterBodyCommands extends BodyCommands {
    private bodyHeatSettings: {
        processing: boolean,
        bytes: number[],
        body1: { heatMode: number, heatSetpoint: number, coolSetpoint: number },
        body2: { heatMode: number, heatSetpoint: number, coolSetpoint: number },
        _processingStartTime?: number
    };
    protected async queueBodyHeatSettings(bodyId?: number, byte?: number, data?: any): Promise<Boolean> {
        logger.debug(`queueBodyHeatSettings: ${JSON.stringify(this.bodyHeatSettings)}`);
        if (typeof this.bodyHeatSettings === 'undefined') {
            let body1 = sys.bodies.getItemById(1);
            let body2 = sys.bodies.getItemById(2);
            this.bodyHeatSettings = {
                processing: false,
                bytes: [],
                body1: { heatMode: body1.heatMode || 1, heatSetpoint: body1.heatSetpoint || 78, coolSetpoint: body1.coolSetpoint || 100 },
                body2: { heatMode: body2.heatMode || 1, heatSetpoint: body2.heatSetpoint || 78, coolSetpoint: body2.coolSetpoint || 100 }
            };
        }
        let bhs = this.bodyHeatSettings;
        
        if (bhs.processing && bhs._processingStartTime && (Date.now() - bhs._processingStartTime > 10000)) {
            logger.warn(`Resetting stuck bodyHeatSettings processing state after timeout`);
            bhs.processing = false;
            bhs.bytes = [];
            delete bhs._processingStartTime;
        }
        
        if (typeof data !== 'undefined' && typeof bodyId !== 'undefined' && bodyId > 0) {
            let body = bodyId === 2 ? bhs.body2 : bhs.body1;
            if (!bhs.bytes.includes(byte) && byte) bhs.bytes.push(byte);
            if (typeof data.heatSetpoint !== 'undefined') body.heatSetpoint = data.heatSetpoint;
            if (typeof data.coolSetpoint !== 'undefined') body.coolSetpoint = data.coolSetpoint;
            if (typeof data.heatMode !== 'undefined') body.heatMode = data.heatMode;
        }
        if (!bhs.processing && bhs.bytes.length > 0) {
            bhs.processing = true;
            bhs._processingStartTime = Date.now();
            let byte2 = bhs.bytes.shift();

            let payload = this.buildBodyHeatPayload(bhs, byte2);

            let out = Outbound.create({
                dest: 16,
                action: 168,
                payload: payload,
                retries: 2,
                response: IntelliCenterBoard.getAckResponse(168)
            });
            try {
                await out.sendAsync();
                this.applyBodyHeatState(bhs);
            } catch (err) {
                logger.error(`Error in queueBodyHeatSettings: ${err.message}`);
                bhs.processing = false;
                bhs.bytes = [];
                delete bhs._processingStartTime;
                throw (err);
            }
            finally {
                bhs.processing = false;
                bhs.bytes = [];
                delete bhs._processingStartTime;
            }
            return true;
        }
        else {
            if (bhs.bytes.length > 0) {
                setTimeout(async () => {
                    try {
                        await this.queueBodyHeatSettings();
                    } catch (err) {
                        logger.error(`Error sending queued body setpoint message: ${err.message}`);
                        throw (err);
                    }
                }, 3000);
            }
            else {
                bhs.processing = false;
                delete bhs._processingStartTime;
            }
            return true;
        }
    }
    protected buildBodyHeatPayload(bhs: any, byte2: number): number[] {
        const dt = new Date();
        const yy = dt.getFullYear() - 2000;
        const mm = dt.getMonth() + 1;
        const dd = dt.getDate();
        const hh = dt.getHours();
        const min = dt.getMinutes();
        return [
            0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0,
            160, yy, mm, dd, hh, min,
            bhs.body1.heatSetpoint, bhs.body1.coolSetpoint, bhs.body2.heatSetpoint, bhs.body2.coolSetpoint,
            bhs.body1.heatMode, bhs.body2.heatMode,
            15,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
        ];
    }
    protected applyBodyHeatState(bhs: any): void {
        let body1 = sys.bodies.getItemById(1);
        let sbody1 = state.temps.bodies.getItemById(1);
        body1.heatMode = sbody1.heatMode = bhs.body1.heatMode;
        body1.heatSetpoint = sbody1.heatSetpoint = bhs.body1.heatSetpoint;
        body1.coolSetpoint = sbody1.coolSetpoint = bhs.body1.coolSetpoint;
        if (sys.bodies.length > 1) {
            let body2 = sys.bodies.getItemById(2);
            let sbody2 = state.temps.bodies.getItemById(2);
            body2.heatMode = sbody2.heatMode = bhs.body2.heatMode;
            body2.heatSetpoint = sbody2.heatSetpoint = bhs.body2.heatSetpoint;
            body2.coolSetpoint = sbody2.coolSetpoint = bhs.body2.coolSetpoint;
        }
        state.emitEquipmentChanges();
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
                const bodyName = normalizeIntelliCenterName(obj.name, body.name);
                let out = Outbound.create({
                    action: 168,
                    payload: [13, 0, byte],
                    retries: 5,
                    response: IntelliCenterBoard.getAckResponse(168)
                });

                out.appendPayloadString(bodyName, 16);
                await out.sendAsync();
                body.name = bodyName;
            }
            if (typeof obj.capacity !== 'undefined') {
                let cap = parseInt(obj.capacity, 10);
                if (cap !== body.capacity) {
                    let out = Outbound.create({
                        action: 168,
                        retries: 2,
                        response: IntelliCenterBoard.getAckResponse(168),
                        payload: [13, 0, byte + 4, Math.floor(cap / 1000)]
                    });
                    await out.sendAsync();
                    body.capacity = cap;
                }
            }
            if (typeof obj.manualHeat !== 'undefined') {
                let manHeat = utils.makeBool(obj.manualHeat);
                if (manHeat !== body.manualHeat) {
                    let out = Outbound.create({
                        action: 168,
                        payload: [13, 0, byte + 8, manHeat ? 1 : 0]
                    });
                    await out.sendAsync();
                    body.manualHeat = manHeat;
                }
            }
            if (typeof obj.showInDashboard !== 'undefined') {
                let sbody = state.temps.bodies.getItemById(id, false);
                body.showInDashboard = sbody.showInDashboard = utils.makeBool(obj.showInDashboard);
            }
            return body;
        }

        catch (err) { return Promise.reject(err); }
    }
    public async setHeatModeAsync(body: Body, mode: number): Promise<BodyTempState> {
        let modes = sys.board.bodies.getHeatModesV2(body.id);
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
            await out.sendAsync();
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
            await out.sendAsync();
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
            await out.sendAsync();
        });
        */
    }
    // IntelliCenter: body heat modes are encoded using IntelliCenter heatSources values (1=off,3=solar,4=solarpref,5=ultratemp,6=ultratemppref,...),
    // not the *Touch heatModes value map. Returning heatSources here fixes dashPanel's blank entries and makes validation accept the right values.
    public getHeatSources(bodyId: number) {
        const sources = super.getHeatSources(bodyId);
        // IntelliCenter v3.004+: keep body-level picklists aligned with what the controller actually presents.
        // Preferred modes are not reliably shown/used by Pentair clients on v3, so suppress them here (board-specific),
        // rather than gating shared SystemBoard behavior.
        return sources.filter(s => {
            const name = s && (s as any).name;
            return name !== 'solarpref' && name !== 'ultratemppref' && name !== 'heatpumppref';
        });
    }
    public getHeatModes(bodyId: number) {
        const sources = this.getHeatSources(bodyId);
        // remove "nochange" which is not a valid body mode selection in dashPanel
        return sources.filter(s => s && (s as any).name !== 'nochange');
    }
    public getHeatModesV2(bodyId: number) {
        sys.board.heaters.updateHeaterServices();
        let heatModes = [];
        let heatTypes = (sys.board.heaters as IntelliCenterHeaterCommands).getInstalledHeaterTypesV2(bodyId);
        let combustionInstalled = (heatTypes.gas > 0 || heatTypes.mastertemp > 0 || heatTypes.maxetherm > 0 || heatTypes.eti250 > 0);
        heatModes.push(this.board.valueMaps.heatSources.transformByName('off'));
        if (heatTypes.hybrid > 0) {
            heatModes.push(this.board.valueMaps.heatSources.transformByName('hybheat'));
            heatModes.push(this.board.valueMaps.heatSources.transformByName('hybheatpump'));
            heatModes.push(this.board.valueMaps.heatSources.transformByName('hybhybrid'));
            heatModes.push(this.board.valueMaps.heatSources.transformByName('hybdual'));
        }
        if (heatTypes.gas > 0) heatModes.push(this.board.valueMaps.heatSources.transformByName('heater'));
        if (heatTypes.mastertemp > 0) heatModes.push(this.board.valueMaps.heatSources.transformByName('mtheater'));
        if (heatTypes.maxetherm > 0) heatModes.push(this.board.valueMaps.heatSources.transformByName('maxetherm'));
        if (heatTypes.eti250 > 0) heatModes.push(this.board.valueMaps.heatSources.transformByName('eti250'));
        if (heatTypes.solar > 0) {
            heatModes.push(this.board.valueMaps.heatSources.transformByName('solar'));
            if (combustionInstalled) heatModes.push(this.board.valueMaps.heatSources.transformByName('solarpref'));
        }
        if (heatTypes.ultratemp > 0) {
            heatModes.push(this.board.valueMaps.heatSources.transformByName('ultratemp'));
            if (combustionInstalled) heatModes.push(this.board.valueMaps.heatSources.transformByName('ultratemppref'));
        }
        if (heatTypes.heatpump > 0) {
            heatModes.push(this.board.valueMaps.heatSources.transformByName('heatpump'));
            if (combustionInstalled) heatModes.push(this.board.valueMaps.heatSources.transformByName('heatpumppref'));
        }
        return heatModes;
    }
}
export class IntelliCenterScheduleCommands extends ScheduleCommands {
    _lastScheduleCheck: number = 0;
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
            let endTimeOffset = typeof data.endTimeOffset !== 'undefined' ? data.endTimeOffset : sched.endTimeOffset;
            let startTimeOffset = typeof data.startTimeOffset !== 'undefined' ? data.startTimeOffset : sched.startTimeOffset;

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
            let schedGroup = typeof data.schedGroup !== 'undefined' ? parseInt(data.schedGroup, 10) : sched.schedGroup || 0;
            if (schedGroup === 1) runOnce |= 0x40;
            // This was always the cooling setpoint for ultratemp.
            //let flags = (circuit === 1 || circuit === 6) ? 81 : 100;
            // v3.004+ uses big-endian for 16-bit time values
            let startTimeLo = startTime - Math.floor(startTime / 256) * 256;
            let startTimeHi = Math.floor(startTime / 256);
            let endTimeLo = endTime - Math.floor(endTime / 256) * 256;
            let endTimeHi = Math.floor(endTime / 256);
            let out = Outbound.createMessage(168, [
                3
                , 0
                , id - 1 // IntelliCenter schedules start at 0.
                , startTimeHi
                , startTimeLo
                , endTimeHi
                , endTimeLo
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

            out.response = IntelliCenterBoard.getAckResponse(168);
            out.retries = 5;

            await out.sendAsync(); // Send it off in a letter to yourself.
            sched = sys.schedules.getItemById(id, true);
            ssched = state.schedules.getItemById(id, true);
            sched.circuit = ssched.circuit = circuit;
            sched.scheduleDays = ssched.scheduleDays = schedDays;
            sched.scheduleType = ssched.scheduleType = schedType;
            sched.schedGroup = ssched.schedGroup = schedGroup;
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
            ssched.startTimeOffset = sched.startTimeOffset = startTimeOffset;
            ssched.endTimeOffset = sched.endTimeOffset = endTimeOffset;
            return sched;
        }
        else
            return Promise.reject(new InvalidEquipmentIdError('No schedule information provided', undefined, 'Schedule'));
    }
    public syncScheduleStates() {
        if (this._lastScheduleCheck > new Date().getTime() - 10000) return;
        try {
            ncp.schedules.triggerSchedules();
            for (let i = 0; i < state.schedules.length; i++) {
                let ssched = state.schedules.getItemByIndex(i);
                if (ssched.disabled || !ssched.isActive) continue;
                let scirc = state.circuits.getInterfaceById(ssched.circuit);
                let schedIsOn = scirc.isOn && ssched.scheduleTime.shouldBeOn;
                if (schedIsOn !== ssched.isOn) {
                    ssched.isOn = schedIsOn;
                    ssched.emitEquipmentChange();
                }
            }
            let scheds = state.schedules.getActiveSchedules();
            let circs: { state: ICircuitState, endTime: number }[] = [];
            for (let i = 0; i < scheds.length; i++) {
                let ssched = scheds[i];
                if (!ssched.isOn || ssched.disabled || !ssched.isActive) continue;
                let c = circs.find(x => x.state.id === ssched.circuit);
                if (typeof c === 'undefined') {
                    let cstate = state.circuits.getInterfaceById(ssched.circuit);
                    c = { state: cstate, endTime: ssched.scheduleTime.endTime.getTime() };
                    circs.push(c);
                }
                if (c.endTime < ssched.scheduleTime.endTime.getTime()) c.endTime = ssched.scheduleTime.endTime.getTime();
            }
            for (let i = 0; i < circs.length; i++) {
                let c = circs[i];
                if (c.state.endTime.getTime() !== c.endTime) {
                    c.state.endTime = new Timestamp(new Date(c.endTime));
                    c.state.emitEquipmentChange();
                }
            }
            this._lastScheduleCheck = new Date().getTime();
        } catch (err) { logger.error(`Error synchronizing schedule states`); }
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

            await out.sendAsync();
            sys.schedules.removeItemById(id);
            state.schedules.removeItemById(id);
            ssched.emitEquipmentChange();
            ssched.isActive = sched.isActive = false;
            return sched;

        }
        else
            return Promise.reject(new InvalidEquipmentIdError('No schedule information provided', undefined, 'Schedule'));
    }
    // RKS: 06-24-20 - Need to talk to Russ.  This needs to go away and reconstituted in the async.
    public setSchedule(sched: Schedule, obj: any) { }
}
export class IntelliCenterHeaterCommands extends HeaterCommands {
    protected get heatPumpValue(): number { return 14; }
    protected get heatPumpPrefValue(): number { return 15; }
    private createHeaterConfigMessage(heater: Heater): Outbound {
        let out = Outbound.createMessage(
            168, [10, 0, heater.id, heater.type, heater.body, heater.differentialTemp, heater.startTempDelta, heater.stopTempDelta, heater.coolingEnabled ? 1 : 0,
            heater.cooldownDelay || 6, heater.address,
            //, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 // Name
            heater.efficiencyMode, heater.maxBoostTemp, heater.economyTime], 0);
        out.insertPayloadString(11, heater.name, 16);
        return out;
    }
    // Per-controller body-association predicate. Default semantics here are the v1.x
    // IntelliCenter encoding (body circuit IDs in Action 30 byte 17): 32 = shared, 6 =
    // Pool circuit, 1 = Spa circuit, 12 = body 3, 22 = body 4. v3-WS uses a different
    // encoding (parseBodyRef: 0 = unassigned, 1 = Pool, 2 = Spa, 32 = both) and overrides
    // this method in IntelliCenterWSHeaterCommands.
    protected matchesBody(heaterBody: number, requestedBody: number): boolean {
        if (heaterBody === 32) return requestedBody <= 2;
        if (heaterBody === 6) return sys.equipment.shared ? requestedBody <= 2 : requestedBody === 1; // Pool circuit
        if (heaterBody === 1) return sys.equipment.shared ? requestedBody <= 2 : requestedBody === 2; // Spa circuit
        if (heaterBody === 12) return requestedBody === 3; // Body 3 circuit
        if (heaterBody === 22) return requestedBody === 4; // Body 4 circuit
        // Fallback to existing generic formats.
        return requestedBody === heaterBody + 1 || requestedBody === heaterBody;
    }
    public getInstalledHeaterTypes(body?: number): any {
        const heaters = sys.heaters.get();
        const types = sys.board.valueMaps.heaterTypes.toArray();
        const inst: any = { total: 0 };
        for (let i = 0; i < types.length; i++) if (types[i].name !== 'none') inst[types[i].name] = 0;

        for (let i = 0; i < heaters.length; i++) {
            const heater = heaters[i];
            if (typeof body !== 'undefined' && typeof heater.body !== 'undefined') {
                if (!this.matchesBody(heater.body, body)) continue;
            }
            const type = types.find(elem => elem.val === heater.type);
            if (typeof type !== 'undefined') {
                if (inst[type.name] === 'undefined') inst[type.name] = 0;
                inst[type.name] = inst[type.name] + 1;
                if (heater.coolingEnabled === true && type.hasCoolSetpoint === true) inst['hasCoolSetpoint'] = true;
                inst.total++;
            }
        }
        return inst;
    }
    public getInstalledHeaterTypesV2(body?: number): any {
        const heaters = sys.heaters.get();
        const types = sys.board.valueMaps.heaterTypes.toArray();
        const inst: any = { total: 0 };
        for (let i = 0; i < types.length; i++) if (types[i].name !== 'none') inst[types[i].name] = 0;

        for (let i = 0; i < heaters.length; i++) {
            const heater = heaters[i];
            if (typeof body !== 'undefined' && typeof heater.body !== 'undefined') {
                if (!this.matchesBody(heater.body, body)) continue;
            }
            const type = types.find(elem => elem.val === heater.type);
            if (typeof type !== 'undefined') {
                if (inst[type.name] === 'undefined') inst[type.name] = 0;
                inst[type.name] = inst[type.name] + 1;
                if (heater.coolingEnabled === true && type.hasCoolSetpoint === true) inst['hasCoolSetpoint'] = true;
                inst.total++;
            }
        }
        return inst;
    }
    public async setHeater(heater: Heater, obj?: any) {
        super.setHeater(heater, obj);
        let out = this.createHeaterConfigMessage(heater);
        await out.sendAsync();
    }
    public async setHeaterAsync(obj: any): Promise<Heater> {
        if (obj.master === 1 || parseInt(obj.id, 10) > 255) return super.setHeaterAsync(obj);
        let id = typeof obj.id === 'undefined' ? -1 : parseInt(obj.id, 10);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Heater Id is not valid.', obj.id, 'Heater'));
        let heater: Heater;
        if (id <= 0) {
            if (sys.heaters.length >= 5) return Promise.reject(new InvalidEquipmentDataError(`Maximum of 5 heaters allowed`, 'Heater', id));
            id = sys.heaters.getNextEquipmentId(new EquipmentIdRange(1, 16));
        }
        heater = sys.heaters.getItemById(id, false);
        let type = 0;
        if (typeof obj.type === 'undefined') {
            if (heater.type === 0 || typeof heater.type === 'undefined')
                return Promise.reject(new InvalidEquipmentDataError(`Heater type was not specified for new heater`, 'Heater', obj.type));
            type = heater.type;
        } else {
            if (typeof obj.type === 'string' && isNaN(parseInt(obj.type, 10)))
                type = sys.board.valueMaps.heaterTypes.getValue(obj.type);
            else
                type = parseInt(obj.type, 10);
            if (!sys.board.valueMaps.heaterTypes.valExists(type)) return Promise.reject(new InvalidEquipmentDataError(`Heater type ${obj.type} is not valid`, 'Heater', obj.type));
            heater.type = type;
        }
        let htype = sys.board.valueMaps.heaterTypes.transform(type);
        let address = heater.address || 112;
        if (htype.hasAddress) {
            if (typeof obj.address !== 'undefined') {
                address = parseInt(obj.address, 10);
                if (isNaN(address) || address < 112 || address > 128) return Promise.reject(new InvalidEquipmentDataError(`Invalid Heater address was specified`, 'Heater', obj.address));
            }
        }
        let differentialTemp = heater.differentialTemp || 6;
        if (typeof obj.differentialTemp !== 'undefined') {
            differentialTemp = parseInt(obj.differentialTemp, 10);
            if (isNaN(differentialTemp) || differentialTemp < 0) return Promise.reject(new InvalidEquipmentDataError(`Invalid Differential Temp was specified`, 'Heater', obj.differentialTemp));
        }
        let efficiencyMode = heater.efficiencyMode || 0;
        if (typeof obj.efficiencyMode !== 'undefined') {
            efficiencyMode = parseInt(obj.efficiencyMode, 10);
            if (isNaN(efficiencyMode) || efficiencyMode < 0) return Promise.reject(new InvalidEquipmentDataError(`Invalid Efficiency Mode was specified`, 'Heater', obj.efficiencyMode));
        }
        let maxBoostTemp = heater.maxBoostTemp || 0;
        if (typeof obj.maxBoostTemp !== 'undefined') {
            maxBoostTemp = parseInt(obj.maxBoostTemp, 10);
            if (isNaN(maxBoostTemp) || maxBoostTemp < 0) return Promise.reject(new InvalidEquipmentDataError(`Invalid Max Boost Temp was specified`, 'Heater', obj.maxBoostTemp));
        }
        let startTempDelta = heater.startTempDelta || 5;
        if (typeof obj.startTempDelta !== 'undefined') {
            startTempDelta = parseInt(obj.startTempDelta, 10);
            if (isNaN(startTempDelta) || startTempDelta < 0) return Promise.reject(new InvalidEquipmentDataError(`Invalid Start Temp Delta was specified`, 'Heater', obj.startTempDelta));
        }
        let stopTempDelta = heater.stopTempDelta || 3;
        if (typeof obj.stopTempDelta !== 'undefined') {
            stopTempDelta = parseInt(obj.stopTempDelta, 10);
            if (isNaN(stopTempDelta) || stopTempDelta < 0) return Promise.reject(new InvalidEquipmentDataError(`Invalid Stop Temp Delta was specified`, 'Heater', obj.stopTempDelta));
        }
        let economyTime = heater.economyTime || 1;
        if (typeof obj.economyTime !== 'undefined') {
            economyTime = parseInt(obj.economyTime, 10);
            if (isNaN(economyTime) || economyTime < 0) return Promise.reject(new InvalidEquipmentDataError(`Invalid Economy Time was specified`, 'Heater', obj.economyTime));
        }
        let body = heater.body || 0;
        if (typeof obj.body !== 'undefined') {
            body = parseInt(obj.body, 10);
            if (isNaN(obj.body) && typeof obj.body === 'string') body = sys.board.valueMaps.bodies.getValue(obj.body);
            if (typeof body === 'undefined' || isNaN(body)) return Promise.reject(new InvalidEquipmentDataError(`Invalid Body was specified`, 'Heater', obj.body));
        }
        if (htype.hasAddress) {
            if (isNaN(address) || address < 112 || address > 128) return Promise.reject(new InvalidEquipmentDataError(`Invalid Heater address was specified`, 'Heater', obj.address));
            for (let i = 0; i < sys.heaters.length; i++) {
                let h = sys.heaters.getItemByIndex(i);
                if (h.id === id) continue;
                let t = sys.board.valueMaps.heaterTypes.transform(h.type);
                if (!t.hasAddress) continue;
                if (h.address === address) return Promise.reject(new InvalidEquipmentDataError(`Heater id# ${h.id} ${t.desc} is already communicating on this address.`, 'Heater', obj.address));
            }
        }
        let cooldownDelay = heater.cooldownDelay || 5;
        if (typeof obj.cooldownDelay !== 'undefined') {
            cooldownDelay = parseInt(obj.cooldownDelay, 10);
            if (isNaN(cooldownDelay) || cooldownDelay < 0 || cooldownDelay > 20) return Promise.reject(new InvalidEquipmentDataError(`Invalid cooldown delay was specified`, 'Heater', obj.cooldownDelay));
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
        let nameStr = typeof obj.name !== 'undefined' ? obj.name.toString().substring(0, 15) : heater.name;
        out.appendPayloadString(nameStr, 16);
        out.appendPayloadByte(efficiencyMode);
        out.appendPayloadByte(maxBoostTemp);
        out.appendPayloadByte(economyTime);

        await out.sendAsync();
        heater = sys.heaters.getItemById(heater.id, true);
        let hstate = state.heaters.getItemById(heater.id, true);
        hstate.type = heater.type = type;
        heater.body = body;
        heater.address = address;
        hstate.name = heater.name = nameStr;
        heater.coolingEnabled = typeof obj.coolingEnabled !== 'undefined' ? utils.makeBool(obj.coolingEnabled) : utils.makeBool(heater.coolingEnabled);
        heater.differentialTemp = differentialTemp;
        heater.economyTime = economyTime;
        heater.startTempDelta = startTempDelta;
        heater.stopTempDelta = stopTempDelta;
        heater.cooldownDelay = cooldownDelay;
        sys.board.heaters.updateHeaterServices();
        sys.board.heaters.syncHeaterStates();
        return heater;
    }
    public async deleteHeaterAsync(obj): Promise<Heater> {
        if (obj.master === 1 || parseInt(obj.id, 10) > 255) return await super.deleteHeaterAsync(obj);
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
        await out.sendAsync();
        heater.isActive = false;
        sys.heaters.removeItemById(id);
        state.heaters.removeItemById(id);
        return heater;
    }
    public updateHeaterServices() {
        let htypes = sys.board.heaters.getInstalledHeaterTypes();
        let solarInstalled = htypes.solar > 0;
        let heatPumpInstalled = htypes.heatpump > 0;
        let gasHeaterInstalled = htypes.gas > 0;
        let ultratempInstalled = htypes.ultratemp > 0;
        let mastertempInstalled = htypes.mastertemp > 0;
        let maxethermInstalled = htypes.maxetherm > 0;
        let eti250Installed = htypes.eti250 > 0;
        let combustionHeaterInstalled = gasHeaterInstalled || mastertempInstalled || maxethermInstalled || eti250Installed;


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
            // 7 = Hybrid Gas Only
            // 8 = Hybrid Heatpump Only
            // 9 = Hybrid - Hybrid Mode
            // 10 = Hybrid - Dual Heat
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
            sys.board.valueMaps.heatModes = new byteValueMap([[1, { name: 'off', desc: 'Off' }]]);
            if (htypes.hybrid > 0) {
                sys.board.valueMaps.heatModes.merge([
                    [7, { name: 'hybheat', desc: 'Hybrid - Gas Only Mode' }],
                    [8, { name: 'hybheatpump', desc: 'Hybrid - Heat Pump Only Mode' }],
                    [9, { name: 'hybhybrid', desc: 'Hybrid - Hybrid Mode' }],
                    [10, { name: 'hybdual', desc: 'Hybrid - Dual Mode' }]
                ]);
                sys.board.valueMaps.heatSources.merge([
                    [7, { name: 'hybheat', desc: 'Hybrid - Gas Only Mode' }],
                    [8, { name: 'hybheatpump', desc: 'Hybrid - Heat Pump Only Mode' }],
                    [9, { name: 'hybhybrid', desc: 'Hybrid - Hybrid Mode' }],
                    [10, { name: 'hybdual', desc: 'Hybrid - Dual Mode' }]
                ]);
            }
            if (gasHeaterInstalled) sys.board.valueMaps.heatSources.merge([[2, { name: 'heater', desc: 'Heater' }]]);
            if (mastertempInstalled) sys.board.valueMaps.heatSources.merge([[11, { name: 'mtheater', desc: 'MasterTemp' }]]);
            if (maxethermInstalled) sys.board.valueMaps.heatSources.merge([[12, { name: 'maxetherm', desc: 'Max-E-Therm' }]]);
            if (eti250Installed) sys.board.valueMaps.heatSources.merge([[13, { name: 'eti250', desc: 'ETI250' }]]);
            // "Preferred" modes only appear when a combustion heater (gas/mastertemp/maxetherm/eti250) is installed —
            // "preferred" means "prefer this source, fall back to combustion heater."
            if (solarInstalled && combustionHeaterInstalled) sys.board.valueMaps.heatSources.merge([[3, { name: 'solar', desc: 'Solar Only', hasCoolSetpoint: htypes.hasCoolSetpoint }], [4, { name: 'solarpref', desc: 'Solar Preferred', hasCoolSetpoint: htypes.hasCoolSetpoint }]]);
            else if (solarInstalled && htypes.total > 1) sys.board.valueMaps.heatSources.merge([[3, { name: 'solar', desc: 'Solar Only', hasCoolSetpoint: htypes.hasCoolSetpoint }]]);
            else if (solarInstalled) sys.board.valueMaps.heatSources.merge([[3, { name: 'solar', desc: 'Solar', hasCoolSetpoint: htypes.hasCoolSetpoint }]]);
            // v3.004+ uses val=14 for heat pump (v1.x used val=9)
            let hpVal = this.heatPumpValue;
            let hpPrefVal = this.heatPumpPrefValue;
            if (heatPumpInstalled && combustionHeaterInstalled) sys.board.valueMaps.heatSources.merge([[hpVal, { name: 'heatpump', desc: 'Heat Pump Only' }], [hpPrefVal, { name: 'heatpumppref', desc: 'Heat Pump Preferred' }]]);
            else if (heatPumpInstalled && htypes.total > 1) sys.board.valueMaps.heatSources.merge([[hpVal, { name: 'heatpump', desc: 'Heat Pump Only' }]]);
            else if (heatPumpInstalled) sys.board.valueMaps.heatSources.merge([[hpVal, { name: 'heatpump', desc: 'Heat Pump' }]]);
            if (ultratempInstalled && combustionHeaterInstalled) sys.board.valueMaps.heatSources.merge([[5, { name: 'ultratemp', desc: 'UltraTemp Only', hasCoolSetpoint: htypes.hasCoolSetpoint }], [6, { name: 'ultratemppref', desc: 'UltraTemp Preferred', hasCoolSetpoint: htypes.hasCoolSetpoint }]]);
            else if (ultratempInstalled && htypes.total > 1) sys.board.valueMaps.heatSources.merge([[5, { name: 'ultratemp', desc: 'UltraTemp Only', hasCoolSetpoint: htypes.hasCoolSetpoint }]]);
            else if (ultratempInstalled) sys.board.valueMaps.heatSources.merge([[5, { name: 'ultratemp', desc: 'UltraTemp', hasCoolSetpoint: htypes.hasCoolSetpoint }]]);
            sys.board.valueMaps.heatSources.merge([[0, { name: 'nochange', desc: 'No Change' }]]);

            if (gasHeaterInstalled) sys.board.valueMaps.heatModes.merge([[2, { name: 'heater', desc: 'Heater' }]]);
            if (mastertempInstalled) sys.board.valueMaps.heatModes.merge([[11, { name: 'mtheater', desc: 'MasterTemp' }]]);
            if (maxethermInstalled) sys.board.valueMaps.heatModes.merge([[12, { name: 'maxetherm', desc: 'Max-E-Therm' }]]);
            if (eti250Installed) sys.board.valueMaps.heatModes.merge([[13, { name: 'eti250', desc: 'ETI250' }]]);
            if (solarInstalled && combustionHeaterInstalled) sys.board.valueMaps.heatModes.merge([[3, { name: 'solar', desc: 'Solar Only', hasCoolSetpoint: htypes.hasCoolSetpoint }], [4, { name: 'solarpref', desc: 'Solar Preferred', hasCoolSetpoint: htypes.hasCoolSetpoint }]]);
            else if (solarInstalled && htypes.total > 1) sys.board.valueMaps.heatModes.merge([[3, { name: 'solar', desc: 'Solar Only', hasCoolSetpoint: htypes.hasCoolSetpoint }]]);
            else if (solarInstalled) sys.board.valueMaps.heatModes.merge([[3, { name: 'solar', desc: 'Solar', hasCoolSetpoint: htypes.hasCoolSetpoint }]]);
            if (ultratempInstalled && combustionHeaterInstalled) sys.board.valueMaps.heatModes.merge([[5, { name: 'ultratemp', desc: 'UltraTemp Only', hasCoolSetpoint: htypes.hasCoolSetpoint }], [6, { name: 'ultratemppref', desc: 'UltraTemp Preferred', hasCoolSetpoint: htypes.hasCoolSetpoint }]]);
            else if (ultratempInstalled && htypes.total > 1) sys.board.valueMaps.heatModes.merge([[5, { name: 'ultratemp', desc: 'UltraTemp Only', hasCoolSetpoint: htypes.hasCoolSetpoint }]]);
            else if (ultratempInstalled) sys.board.valueMaps.heatModes.merge([[5, { name: 'ultratemp', desc: 'UltraTemp', hasCoolSetpoint: htypes.hasCoolSetpoint }]]);
            if (heatPumpInstalled && combustionHeaterInstalled) sys.board.valueMaps.heatModes.merge([[hpVal, { name: 'heatpump', desc: 'Heat Pump Only' }], [hpPrefVal, { name: 'heatpumppref', desc: 'Heat Pump Preferred' }]]);
            else if (heatPumpInstalled && htypes.total > 1) sys.board.valueMaps.heatModes.merge([[hpVal, { name: 'heatpump', desc: 'Heat Pump Only' }]]);
            else if (heatPumpInstalled) sys.board.valueMaps.heatModes.merge([[hpVal, { name: 'heatpump', desc: 'Heat Pump' }]]);

        }
        else {
            sys.board.valueMaps.heatSources = new byteValueMap([[0, { name: 'off', desc: 'Off' }]]);
            if (gasHeaterInstalled) sys.board.valueMaps.heatSources.set(3, { name: 'heater', desc: 'Heater' });
            if (solarInstalled && (gasHeaterInstalled || heatPumpInstalled)) sys.board.valueMaps.heatSources.merge([[5, { name: 'solar', desc: 'Solar Only' }], [21, { name: 'solarpref', desc: 'Solar Preferred' }]]);
            else if (solarInstalled) sys.board.valueMaps.heatSources.set(5, { name: 'solar', desc: 'Solar' });
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
        let v = extend(true, valve.get(true), obj);
        const nameStr = normalizeIntelliCenterName(v.name, valve.name);
        let out = Outbound.create({
            action: 168,
            payload: [9, 0, v.id - 1, v.circuit - 1],
            response: IntelliCenterBoard.getAckResponse(168),
            retries: 5
        }).appendPayloadString(nameStr, 16);
        await out.sendAsync();
        valve.name = nameStr;
        valve.circuit = v.circuit;
        valve.type = v.type;
        return valve;
    }
}
class IntelliCenterRemoteCommands extends RemoteCommands {
    public async setRemoteAsync(obj: any): Promise<Remote> {
        let id = parseInt(obj.id, 10);
        if (isNaN(id) || id < 1 || id > sys.equipment.maxRemotes) return Promise.reject(new InvalidEquipmentIdError('Remote Id is not valid', obj.id, 'Remote'));
        let remote = sys.remotes.getItemById(id);
        let v = extend(true, remote.get(true), obj);
        const nameStr = normalizeIntelliCenterName(v.name, remote.name || `Remote ${id}`);
        let type = typeof v.type !== 'undefined' ? parseInt(v.type, 10) : remote.type;
        let isActive = typeof v.isActive !== 'undefined' ? utils.makeBool(v.isActive) : remote.isActive;
        let pumpId = typeof v.pumpId !== 'undefined' ? parseInt(v.pumpId, 10) : (remote.pumpId !== undefined ? remote.pumpId : 255);
        let address = typeof v.address !== 'undefined' ? parseInt(v.address, 10) : (remote.address || 0);
        let body = typeof v.body !== 'undefined' ? parseInt(v.body, 10) : (remote.body || 0);
        let payload = [5, 0, id - 1, type, isActive ? 1 : 0,
            (pumpId !== undefined && pumpId < 255) ? pumpId : 255,
            address > 0 ? address + 63 : 0,
            body];
        for (let b = 1; b <= 10; b++) {
            let btn = typeof v['button' + b] !== 'undefined' ? parseInt(v['button' + b], 10) : (remote['button' + b] !== undefined ? remote['button' + b] : 255);
            payload.push(isNaN(btn) || btn >= 255 ? 255 : btn);
        }
        let out = Outbound.create({
            action: 168,
            payload: payload,
            response: IntelliCenterBoard.getAckResponse(168),
            retries: 5
        });
        out.appendPayloadString(nameStr, 16);
        await out.sendAsync();
        remote.type = type;
        remote.name = nameStr;
        remote.isActive = isActive;
        remote.pumpId = pumpId;
        remote.address = address;
        remote.body = body;
        for (let b = 1; b <= 10; b++) {
            remote['button' + b] = payload[7 + b];
        }
        return remote;
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
        let name = normalizeIntelliCenterName(data.name, chem.name || `IntelliChem - ${address - 143}`);
        let type = sys.board.valueMaps.chemControllerTypes.transformByName('intellichem');
        // So now we are down to the nitty gritty setting the data for the REM Chem controller.
        let calciumHardness = typeof data.calciumHardness !== 'undefined' ? parseInt(data.calciumHardness, 10) : chem.calciumHardness;
        let cyanuricAcid = typeof data.cyanuricAcid !== 'undefined' ? parseInt(data.cyanuricAcid, 10) : chem.cyanuricAcid;
        let alkalinity = typeof data.alkalinity !== 'undefined' ? parseInt(data.alkalinity, 10) : chem.alkalinity;
        let borates = typeof data.borates !== 'undefined' ? parseInt(data.borates, 10) : chem.borates || 0;
        let intellichemStandalone = sys.controllerType === ControllerType.Nixie
            ? (typeof data.intellichemStandalone !== 'undefined' ? utils.makeBool(data.intellichemStandalone) : chem.intellichemStandalone)
            : false;
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
        let out = Outbound.create({
            protocol: Protocol.Broadcast,
            action: 168,
            payload: [],
            retries: 3, // We are going to try 4 times.
            response: IntelliCenterBoard.getAckResponse(168),
            //onAbort: () => { },
        });

        //[8, 0, chem.id - 1, body.val, 1, chem.address, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0]
        out.insertPayloadBytes(0, 0, 20);
        out.setPayloadByte(0, 8);
        out.setPayloadByte(1, 0);
        out.setPayloadByte(2, chem.id - 1);
        out.setPayloadByte(3, body.val);
        //out.setPayloadByte(4, acidTankLevel + 1);
        out.setPayloadByte(4, 1);
        out.setPayloadByte(5, address);
        out.setPayloadByte(6, 1);
        out.setPayloadInt(7, Math.round(pHSetpoint * 100), 700);
        out.setPayloadInt(9, orpSetpoint, 400);
        //out.setPayloadByte(11, 1);
        //out.setPayloadByte(12, 1);
        out.setPayloadByte(11, acidTankLevel + 1, 1);
        out.setPayloadByte(12, orpTankLevel + 1, 1);

        out.setPayloadInt(13, calciumHardness, 25);
        out.setPayloadInt(15, cyanuricAcid, 0);
        out.setPayloadInt(17, alkalinity, 25);
        await out.sendAsync();
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
        chem.intellichemStandalone = intellichemStandalone;
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
        return chem;
    }
    public async deleteChemControllerAsync(data: any): Promise<ChemController> {
        let id = typeof data.id !== 'undefined' ? parseInt(data.id, 10) : -1;
        if (typeof id === 'undefined' || isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid Chem Controller Id`, id, 'chemController'));
        let chem = sys.chemControllers.getItemById(id);
        if (chem.master === 1) return super.deleteChemControllerAsync(data);
        let out = Outbound.create({
            action: 168,
            response: IntelliCenterBoard.getAckResponse(168),
            retries: 3,
            payload: [8, 0, id - 1, 0, 1, chem.address || 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0]
        });
        out.setPayloadInt(7, Math.round(chem.ph.setpoint * 100), 700);
        out.setPayloadInt(9, chem.orp.setpoint, 400);
        out.setPayloadInt(13, chem.calciumHardness, 25);
        out.setPayloadInt(15, chem.cyanuricAcid, 0);
        await out.sendAsync();
        let schem = state.chemControllers.getItemById(id);
        chem.isActive = false;
        chem.ph.tank.capacity = chem.orp.tank.capacity = 6;
        chem.ph.tank.units = chem.orp.tank.units = '';
        schem.isActive = false;
        sys.chemControllers.removeItemById(id);
        state.chemControllers.removeItemById(id);
        return chem;
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
    //        await out.sendAsync();

    //    });
    //}
}

// ISSUE-080: Action 168 cat=14 outbound write path for IntelliCenter covers.
// Packet reference: .plan/v3.008/covers-packet-reference.md §2.2
//
//   A168 cat=14 payload (30 bytes):
//     [0]=14 (cat)
//     [1]=0  (sub — always 0 observed)
//     [2]=slot (0=Cover 1, 1=Cover 2)
//     [3..18]=name (16 bytes, ASCII, null-padded) — hard-fixed to "Cover 1"/"Cover 2"
//     [19..28]=circuits (10 bytes, 0xFF=empty)
//     [29]=flags  (bit 0=chlorActive, bit 1=normallyOn, bit 2=isActive, bit 3=Pool body)
//
// Body output caps (enforced server-side, mirrors OCP UI):
//   Pool body: chlorOutput 0-50
//   Spa body : chlorOutput 0-10
//
// Per-body routing: `chlorOutput` is applied via the chlorinator cat=7 piggyback, NOT cat=14.
// This method encodes the cover config itself; the output update flows through the chlorinator
// path on the next OCP rebroadcast (or user-driven OCP edit). Writing output from dashPanel is
// therefore a two-step OCP operation — note this in the UI.
class IntelliCenterCoverCommands extends CoverCommands {
    public async setCoverAsync(obj: any): Promise<Cover> {
        const id = parseInt(obj.id, 10);
        if (isNaN(id) || id < 1 || id > 2)
            return Promise.reject(new InvalidEquipmentIdError('Cover Id is not valid (1 or 2).', obj.id, 'Cover'));

        const cover = sys.covers.getItemById(id, false);
        if (!cover || typeof cover.name === 'undefined')
            return Promise.reject(new InvalidEquipmentIdError(`Cover ${id} does not exist. Enable it on the OCP first.`, obj.id, 'Cover'));

        // Name is read-only per OCP behavior (no rename UI on the panel). Reject any attempt.
        if (typeof obj.name !== 'undefined' && obj.name !== cover.name)
            return Promise.reject(new InvalidEquipmentDataError(`Cover names cannot be changed — OCP does not expose a rename UI. Keep name: ${cover.name}`, 'Cover', obj.name));

        const poolBodyId = sys.board.valueMaps.bodies.getValue('pool');
        const spaBodyId = sys.board.valueMaps.bodies.getValue('spa');

        let body: number;
        if (typeof obj.body !== 'undefined') {
            if (typeof obj.body === 'string' && isNaN(parseInt(obj.body, 10)))
                body = sys.board.valueMaps.bodies.getValue(obj.body);
            else body = parseInt(obj.body, 10);
            if (body !== poolBodyId && body !== spaBodyId)
                return Promise.reject(new InvalidEquipmentDataError(`Cover body must be Pool or Spa.`, 'Cover', obj.body));
        } else {
            body = sys.board.valueMaps.bodies.encode(cover.body);
        }

        const isActive = typeof obj.isActive !== 'undefined' ? utils.makeBool(obj.isActive) : cover.isActive;
        const normallyOn = typeof obj.normallyOn !== 'undefined' ? utils.makeBool(obj.normallyOn) : cover.normallyOn;
        const chlorActive = typeof obj.chlorActive !== 'undefined' ? utils.makeBool(obj.chlorActive) : cover.chlorActive;

        // Circuits: up to 10; reject IDs that don't resolve to a real circuit/feature.
        let circuits: number[] = Array.isArray(obj.circuits) ? obj.circuits.map((c: any) => parseInt(c, 10)).filter((n: number) => !isNaN(n)) : cover.circuits.slice();
        if (circuits.length > 10)
            return Promise.reject(new InvalidEquipmentDataError(`A cover can have at most 10 Affected Circuits; got ${circuits.length}.`, 'Cover', circuits));
        const validRefs = sys.board.circuits.getCircuitReferences(true, true, false, false);
        for (const cid of circuits) {
            if (!validRefs.find((r: any) => r.id === cid))
                return Promise.reject(new InvalidEquipmentDataError(`Affected Circuit id ${cid} is not a valid circuit or feature.`, 'Cover', cid));
        }

        // Body-aware output cap. OCP auto-disables chlorActive when body swap brings output
        // out of range; mirror that here so the OCP and njsPC agree on post-swap state.
        const capMax = body === spaBodyId ? 10 : 50;
        let chlorOutput = typeof obj.chlorOutput !== 'undefined' ? parseInt(obj.chlorOutput, 10) : (cover.chlorOutput || 0);
        if (isNaN(chlorOutput) || chlorOutput < 0)
            return Promise.reject(new InvalidEquipmentDataError(`IntelliChlor Output must be between 0 and ${capMax}.`, 'Cover', obj.chlorOutput));
        let postChlorActive = chlorActive;
        if (chlorOutput > capMax) {
            logger.info(`setCoverAsync: cover ${id} chlorOutput ${chlorOutput} exceeds ${body === spaBodyId ? 'Spa' : 'Pool'} max ${capMax}; clamping and disabling chlorActive.`);
            chlorOutput = capMax;
            postChlorActive = false;
        }

        // Build the flags byte from the semantic inputs.
        const flags =
            (postChlorActive ? 0x01 : 0) |
            (normallyOn ? 0x02 : 0) |
            (isActive ? 0x04 : 0) |
            (body === spaBodyId ? 0x08 : 0);

        const slot = id - 1;
        const out = Outbound.create({
            action: 168,
            payload: [14, 0, slot],
            retries: 5,
            response: IntelliCenterBoard.getAckResponse(168)
        });
        // Name: preserve OCP-fixed value ("Cover 1"/"Cover 2"), 16 bytes, null-padded.
        out.appendPayloadString(cover.name || `Cover ${id}`, 16);
        // Circuits: 10 slots, unused filled with 0xFF.
        // Wire protocol is 0-indexed (wire 0 = njsPC circuit id 1).
        for (let i = 0; i < 10; i++) {
            out.appendPayloadByte(i < circuits.length ? circuits[i] - 1 : 0xFF);
        }
        out.appendPayloadByte(flags);

        await out.sendAsync();

        // Commit the config — parser will overwrite on next OCP broadcast anyway, but
        // dashPanel needs immediate values (Rule 18).
        cover.body = body;
        cover.isActive = isActive;
        cover.normallyOn = normallyOn;
        cover.chlorActive = postChlorActive;
        cover.chlorOutput = chlorOutput;
        cover.circuits = circuits;

        const scover = state.covers.getItemById(cover.id, true);
        scover.name = cover.name;
        scover.body = cover.body;
        scover.isActive = cover.isActive;
        scover.normallyOn = cover.normallyOn;
        scover.chlorActive = cover.chlorActive;
        scover.chlorOutput = cover.chlorOutput;
        state.emitEquipmentChanges();

        return cover;
    }
}
class IntelliCenterAlertCommands {
    constructor(private board: IntelliCenterBoard) {}
    private static readonly SELECTOR_BYTE_COUNTS: { [key: number]: number } = {
        12: 1, 13: 2, 14: 2, 15: 1, 16: 4, 17: 4, 18: 2
    };
    private static readonly FIELD_TO_SELECTOR: { [key: string]: number } = {
        circuits: 12, pumps: 13, ultratemp: 14, chlorinator: 15,
        intellichem: 16, hybrid: 17, connectedGas: 18
    };
    private maskToBytes(mask: number, byteCount: number): number[] {
        const bytes: number[] = [];
        if (byteCount <= 2) {
            for (let i = byteCount - 1; i >= 0; i--) {
                bytes.push((mask >>> (i * 8)) & 0xFF);
            }
        } else {
            for (let i = 0; i < byteCount; i++) {
                bytes.push((mask >>> (i * 8)) & 0xFF);
            }
        }
        return bytes;
    }
    public async setAlertNotificationsAsync(obj: any): Promise<any> {
        for (const [field, selector] of Object.entries(IntelliCenterAlertCommands.FIELD_TO_SELECTOR)) {
            if (typeof obj[field] === 'undefined') continue;
            const mask = parseInt(obj[field], 10) >>> 0;
            const byteCount = IntelliCenterAlertCommands.SELECTOR_BYTE_COUNTS[selector];
            const dataBytes = this.maskToBytes(mask, byteCount);
            const payload = [13, 0, selector, ...dataBytes];
            const out = Outbound.create({
                action: 168,
                payload: payload,
                response: IntelliCenterBoard.getAckResponse(168),
                retries: 5
            });
            await out.sendAsync();
            switch (selector) {
                case 12: sys.alerts.circuitNotifications = mask; break;
                case 13: sys.alerts.pumpNotifications = mask; break;
                case 14: sys.alerts.ultratempNotifications = mask; break;
                case 15: sys.alerts.chlorinatorNotifications = mask; break;
                case 16: sys.alerts.intellichemNotifications = mask; break;
                case 17: sys.alerts.hybridNotifications = mask; break;
                case 18: sys.alerts.connectedGasNotifications = mask; break;
            }
            sys.alerts.setRaw(selector, dataBytes);
        }
        return sys.alerts.get(true);
    }
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

