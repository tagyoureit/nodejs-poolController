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
import { IntelliCenterBoard, IntelliCenterCircuitCommands, IntelliCenterFeatureCommands, IntelliCenterBodyCommands, IntelliCenterSystemCommands, IntelliCenterScheduleCommands, IntelliCenterPumpCommands, IntelliCenterChlorinatorCommands, IntelliCenterHeaterCommands, IntelliCenterChemControllerCommands } from './IntelliCenterBoard';
import { SystemBoard, EquipmentIdRange, ValveCommands, CoverCommands } from './SystemBoard';
import { PoolSystem, Options, General, Schedule, Pump, sys, Heater, Chlorinator, Body, Feature, CircuitGroup, LightGroup, Valve, Cover, Location, Owner, ICircuit, ChemController } from '../Equipment';
import { icws } from '../comms/IntelliCenterWS';
import { state, ICircuitState, ICircuitGroupState, LightGroupState, ChlorinatorState, BodyTempState } from '../State';
import { utils } from '../../controller/Constants';
import { setTimeout as setTimeoutSync } from 'timers';
import { logger } from '../../logger/Logger';
import { InvalidEquipmentIdError, InvalidEquipmentDataError, InvalidOperationError, EquipmentNotFoundError } from '../Errors';

export class IntelliCenterWSBoard extends IntelliCenterBoard {
    constructor(system: PoolSystem) {
        super(system);
        this.system = new IntelliCenterWSSystemCommands(this);
        this.circuits = new IntelliCenterWSCircuitCommands(this);
        this.features = new IntelliCenterWSFeatureCommands(this);
        this.bodies = new IntelliCenterWSBodyCommands(this);
        this.schedules = new IntelliCenterWSScheduleCommands(this);
        this.pumps = new IntelliCenterWSPumpCommands(this);
        this.chlorinator = new IntelliCenterWSChlorinatorCommands(this);
        this.chemControllers = new IntelliCenterWSChemControllerCommands(this);
        this.heaters = new IntelliCenterWSHeaterCommands(this);
        this.valves = new IntelliCenterWSValveCommands(this);
        this.covers = new IntelliCenterWSCoverCommands(this);
        state.time.setTimeFromSystemClock();
        this.processStatusAsync();
    }
    protected startStatePoll(): void { }
    public announceDevice(): Promise<void> { return Promise.resolve(); }
    protected async requestVersionsAsync(dest: number): Promise<void> { }
    protected startAnnounceDeviceInterval(): void { }
    protected async ensureRegisteredAsync(): Promise<void> { }
    protected startRegistrationBootstrapAsync(): void { }
    private _clockTimer: NodeJS.Timeout | undefined;
    public async processStatusAsync(): Promise<void> {
        try {
            if (this._clockTimer) return;
            this._clockTimer = setTimeoutSync(async () => {
                this._clockTimer = undefined;
                try {
                    state.time.setTimeFromSystemClock();
                    sys.board.system.setTZ();
                } catch (err) { logger.error(`Error updating WS clock: ${err.message}`); }
                this.processStatusAsync();
            }, 60000);
        } catch (err) { logger.error(`Error in WS processStatusAsync: ${err.message}`); }
    }
    public initExpansionModules(ocp0A: number, ocp0B: number, xcp1A: number, xcp1B: number, xcp2A: number, xcp2B: number, xcp3A: number, xcp3B: number): void { }
    public reloadConfig() {
        // In WS mode, reload = re-snapshot all config from OCP over the WebSocket.
        // Do NOT use the RS-485 parent path (sys.configVersion.clear, needsConfigChanges,
        // modulesAcquired) — those flags only drive the RS-485 config queue and are
        // meaningless here (initExpansionModules is a no-op in this class).
        state.status = 0;
        icws.loadInitialConfigAsync().catch(err =>
            logger.error(`IntelliCenterWSBoard.reloadConfig: snapshot failed: ${err?.message || err}`)
        );
    }
}

class IntelliCenterWSSystemCommands extends IntelliCenterSystemCommands {
    public async setOptionsAsync(obj?: any): Promise<Options> {
        try {
            logger.info(`WSBoard.setOptionsAsync called with: ${JSON.stringify(obj)}`);
            await this.setTempSensorCalibrationAsync(obj, []);
            await this.setClockOptionsAsync(obj, []);
            await this.setUnitsOptionsAsync(obj, []);
            await this.setDelayOptionsAsync(obj, []);
            await this.setPumpDelayAsync(obj, []);
            await this.setCooldownDelayAsync(obj, []);
            await this.setManualPriorityAsync(obj, []);
            await this.setManualHeatAsync(obj, []);
            await this.setDisplayOptionsAsync(obj);
            return Promise.resolve(sys.general.options);
        }
        catch (err) { logger.error(`WSBoard.setOptionsAsync error: ${err}`); return Promise.reject(err); }
    }
    protected async setClockOptionsAsync(obj: any, payload: number[]): Promise<void> {
        let changed = false;
        const params: Record<string, string> = {};
        if (typeof obj.clockMode !== 'undefined' && obj.clockMode !== sys.general.options.clockMode) {
            params.CLK24A = obj.clockMode === 24 ? '24HR' : 'AMPM';
            changed = true;
        }
        if (typeof obj.adjustDST !== 'undefined' && obj.adjustDST !== sys.general.options.adjustDST) {
            params.DLSTIM = obj.adjustDST ? 'ON' : 'OFF';
            changed = true;
        }
        if (changed)
            await icws.setParamList('_C10C', params);
        if (typeof obj.clockMode !== 'undefined') sys.general.options.clockMode = obj.clockMode === 24 ? 24 : 12;
        if (typeof obj.adjustDST !== 'undefined') sys.general.options.adjustDST = obj.adjustDST ? true : false;
        if (typeof obj.clockSource !== 'undefined' && obj.clockSource !== sys.general.options.clockSource) {
            await icws.setParamList('_C105', { SOURCE: obj.clockSource === 'internet' ? 'INTERNET' : 'LOCAL' });
            if (obj.clockSource === 'internet' || obj.clockSource === 'server' || obj.clockSource === 'manual')
                sys.general.options.clockSource = obj.clockSource;
            sys.board.system.setTZ();
        }
    }
    protected async setUnitsOptionsAsync(obj: any, payload: number[]): Promise<void> {
        if (typeof obj.units === 'undefined') return;
        const requestedUnits = sys.board.valueMaps.tempUnits.encode(obj.units);
        if (isNaN(requestedUnits) || requestedUnits === sys.general.options.units) return;
        await icws.setParamList('_5451', { MODE: requestedUnits === sys.board.valueMaps.tempUnits.getValue('C') ? 'METRIC' : 'ENGLISH' });
        sys.general.options.units = requestedUnits;
        state.temps.units = requestedUnits;
        const bodyUnits = requestedUnits === sys.board.valueMaps.tempUnits.getValue('C') ? 2 : 1;
        for (let i = 0; i < sys.bodies.length; i++) sys.bodies.getItemByIndex(i).capacityUnits = bodyUnits;
        state.emitEquipmentChanges();
    }
    protected async setDelayOptionsAsync(obj: any, payload: number[]): Promise<void> {
        let delayRequested = typeof obj.freezeCycleTime !== 'undefined' || typeof obj.valveDelay !== 'undefined' || typeof obj.cooldownDelay !== 'undefined';
        if (!delayRequested) return;
        const params: Record<string, string> = {};
        if (typeof obj.freezeCycleTime !== 'undefined')
            params.FREEZEDLY = String(Math.max(1, Math.min(60, parseInt(obj.freezeCycleTime, 10) || 15)));
        if (typeof obj.valveDelay !== 'undefined')
            params.VALVE = obj.valveDelay ? 'ON' : 'OFF';
        if (typeof obj.cooldownDelay !== 'undefined')
            params.HEATING = obj.cooldownDelay ? 'ON' : 'OFF';
        if (Object.keys(params).length > 0)
            await icws.setParamList('_5451', params);
        if (typeof obj.freezeCycleTime !== 'undefined')
            sys.general.options.freezeCycleTime = Math.max(1, Math.min(60, parseInt(obj.freezeCycleTime, 10) || 15));
        if (typeof obj.valveDelay !== 'undefined') sys.general.options.valveDelay = obj.valveDelay ? true : false;
        if (typeof obj.cooldownDelay !== 'undefined') sys.general.options.cooldownDelay = obj.cooldownDelay ? true : false;
    }
    protected async setPumpDelayAsync(obj: any, payload: number[]): Promise<void> {
        // TODO: verify WS key for pumpDelay — not located on _5451 per mitm capture
        if (typeof obj.pumpDelay === 'undefined' || obj.pumpDelay === sys.general.options.pumpDelay) return;
        sys.general.options.pumpDelay = obj.pumpDelay ? true : false;
    }
    protected async setCooldownDelayAsync(obj: any, payload: number[]): Promise<void> {
        if (typeof obj.cooldownDelay === 'undefined' || obj.cooldownDelay === sys.general.options.cooldownDelay) return;
        await icws.setParamList('_5451', { HEATING: obj.cooldownDelay ? 'ON' : 'OFF' });
        sys.general.options.cooldownDelay = obj.cooldownDelay ? true : false;
    }
    protected async setManualPriorityAsync(obj: any, payload: number[]): Promise<void> {
        if (typeof obj.manualPriority === 'undefined' || obj.manualPriority === sys.general.options.manualPriority) return;
        await icws.setParamList('_CFEA', { MANOVR: obj.manualPriority ? 'ON' : 'OFF' });
        sys.general.options.manualPriority = obj.manualPriority ? true : false;
    }
    protected async setManualHeatAsync(obj: any, payload: number[]): Promise<void> {
        if (typeof obj.manualHeat === 'undefined' || obj.manualHeat === sys.general.options.manualHeat) return;
        await icws.setParamList('_5451', { MANHT: obj.manualHeat ? 'ON' : 'OFF' });
        sys.general.options.manualHeat = obj.manualHeat ? true : false;
    }
    protected async setDisplayOptionsAsync(obj: any): Promise<void> {
        if (typeof obj.solarAsHeatPump === 'undefined') return;
        const params: Record<string, string> = {};
        if (typeof obj.solarAsHeatPump !== 'undefined')
            params.SASHP = obj.solarAsHeatPump ? 'ON' : 'OFF';
        if (Object.keys(params).length > 0)
            await icws.setParamList('_5451', params);
        if (typeof obj.solarAsHeatPump !== 'undefined')
            sys.general.options.solarAsHeatPump = obj.solarAsHeatPump ? true : false;
    }
    protected async setTempSensorCalibrationAsync(obj: any, payload: number[]): Promise<void> {
        const sensorMap: Array<{ prop: string, objnam: string, calibKey: string }> = [
            { prop: 'waterTempAdj1', objnam: 'SSW11', calibKey: 'water1' },
            { prop: 'solarTempAdj1', objnam: 'SSS11', calibKey: 'solar1' },
            { prop: 'airTempAdj', objnam: '_A135', calibKey: 'air' },
        ];
        for (const s of sensorMap) {
            if (typeof obj[s.prop] !== 'undefined' && parseInt(obj[s.prop], 10) !== sys.equipment.tempSensors.getCalibration(s.calibKey)) {
                await icws.setParamList(s.objnam, { CALIB: String(parseInt(obj[s.prop], 10)) });
                sys.equipment.tempSensors.setCalibration(s.calibKey, parseInt(obj[s.prop], 10));
            }
        }
        // TODO: verify WS objnam for water2/solar2/water3/solar3/water4/solar4 sensors — not yet confirmed
        const extSensorMap: Array<{ prop: string, calibKey: string }> = [
            { prop: 'waterTempAdj2', calibKey: 'water2' },
            { prop: 'waterTempAdj3', calibKey: 'water3' },
            { prop: 'waterTempAdj4', calibKey: 'water4' },
            { prop: 'solarTempAdj2', calibKey: 'solar2' },
            { prop: 'solarTempAdj3', calibKey: 'solar3' },
            { prop: 'solarTempAdj4', calibKey: 'solar4' },
        ];
        for (const s of extSensorMap) {
            if (typeof obj[s.prop] !== 'undefined') {
                sys.equipment.tempSensors.setCalibration(s.calibKey, parseInt(obj[s.prop], 10));
            }
        }
    }
    public async setGeneralAsync(obj?: any): Promise<General> {
        try {
            let general = sys.general;
            let params: Record<string, string> = {};
            if (typeof obj.owner !== 'undefined') {
                if (typeof obj.owner.name !== 'undefined') params.PROPNAME = obj.owner.name;
                if (typeof obj.owner.phone !== 'undefined') params.PROPPHONE = obj.owner.phone;
                if (typeof obj.owner.email !== 'undefined') params.PROPMAIL = obj.owner.email;
                if (typeof obj.owner.phone2 !== 'undefined') params.PROPPHONE2 = obj.owner.phone2;
            }
            if (typeof obj.location !== 'undefined') {
                if (typeof obj.location.address !== 'undefined') params.LOCADDR = obj.location.address;
                if (typeof obj.location.zip !== 'undefined') params.LOCZIP = obj.location.zip;
                if (typeof obj.location.city !== 'undefined') params.LOCCITY = obj.location.city;
                if (typeof obj.location.state !== 'undefined') params.LOCSTATE = obj.location.state;
                if (typeof obj.location.country !== 'undefined') params.LOCCOUNTRY = obj.location.country;
                if (typeof obj.location.latitude !== 'undefined') params.LOCLAT = String(obj.location.latitude);
                if (typeof obj.location.longitude !== 'undefined') params.LOCLONG = String(obj.location.longitude);
            }
            if (typeof obj.pool !== 'undefined') {
                if (typeof obj.pool.name !== 'undefined') params.POOLNAME = obj.pool.name;
            }
            if (Object.keys(params).length > 0)
                await icws.setParamList('_5451', params);
            if (typeof obj.options !== 'undefined') {
                await this.setOptionsAsync(obj.options);
                if (typeof obj.options.vacation !== 'undefined')
                    await this.setVacationAsync(obj.options.vacation);
            }
            if (typeof obj.owner !== 'undefined') {
                if (typeof obj.owner.name !== 'undefined') general.owner.name = obj.owner.name;
                if (typeof obj.owner.phone !== 'undefined') general.owner.phone = obj.owner.phone;
                if (typeof obj.owner.email !== 'undefined') general.owner.email = obj.owner.email;
                if (typeof obj.owner.phone2 !== 'undefined') general.owner.phone2 = obj.owner.phone2;
            }
            if (typeof obj.location !== 'undefined') {
                if (typeof obj.location.address !== 'undefined') general.location.address = obj.location.address;
                if (typeof obj.location.zip !== 'undefined') general.location.zip = obj.location.zip;
                if (typeof obj.location.city !== 'undefined') general.location.city = obj.location.city;
                if (typeof obj.location.state !== 'undefined') general.location.state = obj.location.state;
                if (typeof obj.location.country !== 'undefined') general.location.country = obj.location.country;
                if (typeof obj.location.latitude !== 'undefined') general.location.latitude = obj.location.latitude;
                if (typeof obj.location.longitude !== 'undefined') general.location.longitude = obj.location.longitude;
            }
            if (typeof obj.pool !== 'undefined') {
                if (typeof obj.pool.name !== 'undefined') general.alias = obj.pool.name;
            }
            return general;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async cancelDelay(): Promise<any> {
        // TODO: verify exact WS keys for cancel-delay from live capture
        await icws.setParamList('_5451', { VALVE: 'OFF', HEATING: 'OFF' });
        state.delay = sys.board.valueMaps.delay.getValue('nodelay');
        return state.data.delay;
    }
    public async setVacationAsync(obj?: any): Promise<Options> {
        try {
            let opts = sys.general.options;
            let enabled = typeof obj.enabled !== 'undefined' ? utils.makeBool(obj.enabled) : opts.vacation.enabled;
            let useTimeframe = typeof obj.useTimeframe !== 'undefined' ? utils.makeBool(obj.useTimeframe) : opts.vacation.useTimeframe;
            let startDate = new Date(obj.startDate || opts.vacation.startDate || new Date());
            let endDate = new Date(obj.endDate || opts.vacation.endDate || new Date());
            // Use UTC accessors to avoid local timezone shifting date-only strings back a day
            const params: Record<string, string> = {
                VACFLO: enabled ? 'ON' : 'OFF',
                VACTIM: useTimeframe ? 'ON' : 'OFF',
                START: `${startDate.getUTCMonth() + 1},${String(startDate.getUTCDate()).padStart(2, '0')},${String(startDate.getUTCFullYear() - 2000).padStart(2, '0')}`,
                STOP: `${endDate.getUTCMonth() + 1},${String(endDate.getUTCDate()).padStart(2, '0')},${String(endDate.getUTCFullYear() - 2000).padStart(2, '0')}`
            };
            await icws.setParamList('_5451', params);
            opts.vacation.enabled = enabled;
            opts.vacation.useTimeframe = useTimeframe;
            opts.vacation.startDate = startDate;
            opts.vacation.endDate = endDate;
            state.vacation = enabled;
            return opts;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setDateTimeAsync(obj: any): Promise<any> {
        const params: Record<string, string> = {};
        if (typeof obj.hour !== 'undefined' || typeof obj.min !== 'undefined' || typeof obj.sec !== 'undefined') {
            let hh = typeof obj.hour !== 'undefined' ? parseInt(obj.hour, 10) : new Date().getHours();
            let mm = typeof obj.min !== 'undefined' ? parseInt(obj.min, 10) : new Date().getMinutes();
            let ss = typeof obj.sec !== 'undefined' ? parseInt(obj.sec, 10) : 0;
            params.MIN = `${String(hh).padStart(2, '0')},${String(mm).padStart(2, '0')},${String(ss).padStart(2, '0')}`;
        }
        if (typeof obj.year !== 'undefined' || typeof obj.month !== 'undefined' || typeof obj.day !== 'undefined') {
            let month = typeof obj.month !== 'undefined' ? parseInt(obj.month, 10) : new Date().getMonth() + 1;
            let day = typeof obj.day !== 'undefined' ? parseInt(obj.day, 10) : new Date().getDate();
            let year = typeof obj.year !== 'undefined' ? parseInt(obj.year, 10) : new Date().getFullYear();
            if (year > 2000) year -= 2000;
            params.DAY = `${String(month).padStart(2, '0')},${String(day).padStart(2, '0')},${String(year).padStart(2, '0')}`;
        }
        if (Object.keys(params).length > 0)
            await icws.setParamList('_C10C', params);
        if (typeof obj.clockSource !== 'undefined') {
            await icws.setParamList('_C105', { SOURCE: obj.clockSource === 'internet' ? 'INTERNET' : 'LOCAL' });
            if (obj.clockSource === 'internet' || obj.clockSource === 'server' || obj.clockSource === 'manual')
                sys.general.options.clockSource = obj.clockSource;
        }
        return { time: state.time.format(), adjustDST: sys.general.options.adjustDST, clockSource: sys.general.options.clockSource };
    }
    public async setLocationAsync(obj?: any): Promise<Location> {
        let location = sys.general.location;
        const params: Record<string, string> = {};
        if (typeof obj.address !== 'undefined') params.ADDRESS = obj.address;
        if (typeof obj.city !== 'undefined') params.CITY = obj.city;
        if (typeof obj.state !== 'undefined') params.STATE = obj.state;
        if (typeof obj.zip !== 'undefined') params.ZIP = obj.zip;
        if (typeof obj.country !== 'undefined') params.COUNTRY = obj.country;
        if (typeof obj.latitude !== 'undefined') params.LOCX = String(obj.latitude);
        if (typeof obj.longitude !== 'undefined') params.LOCY = String(obj.longitude);
        if (typeof obj.timeZone !== 'undefined') params.TIMZON = String(obj.timeZone);
        if (Object.keys(params).length > 0)
            await icws.setParamList('_5451', params);
        if (typeof obj.address !== 'undefined') location.address = obj.address;
        if (typeof obj.city !== 'undefined') location.city = obj.city;
        if (typeof obj.state !== 'undefined') location.state = obj.state;
        if (typeof obj.zip !== 'undefined') location.zip = obj.zip;
        if (typeof obj.country !== 'undefined') location.country = obj.country;
        if (typeof obj.latitude !== 'undefined') location.latitude = obj.latitude;
        if (typeof obj.longitude !== 'undefined') location.longitude = obj.longitude;
        if (typeof obj.timeZone !== 'undefined') location.timeZone = obj.timeZone;
        return location;
    }
    public async setOwnerAsync(obj?: any): Promise<Owner> {
        let owner = sys.general.owner;
        const params: Record<string, string> = {};
        if (typeof obj.name !== 'undefined') params.NAME = obj.name;
        if (typeof obj.email !== 'undefined') params.EMAIL = obj.email;
        if (typeof obj.phone !== 'undefined') params.PHONE = obj.phone;
        if (typeof obj.phone2 !== 'undefined') params.PHONE2 = obj.phone2;
        if (Object.keys(params).length > 0)
            await icws.setParamList('_5451', params);
        if (typeof obj.name !== 'undefined') owner.name = obj.name;
        if (typeof obj.email !== 'undefined') owner.email = obj.email;
        if (typeof obj.phone !== 'undefined') owner.phone = obj.phone;
        if (typeof obj.phone2 !== 'undefined') owner.phone2 = obj.phone2;
        return owner;
    }
}

class IntelliCenterWSValveCommands extends ValveCommands {
    public async setValveAsync(obj?: any): Promise<Valve> {
        if (obj.master === 1) return super.setValveAsync(obj);
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Valve Id has not been defined', obj.id, 'Valve'));
        let valve = sys.valves.getItemById(id);
        try {
            const objnam = 'VAL' + String(id).padStart(2, '0');
            const params: Record<string, string> = {};
            if (typeof obj.name !== 'undefined') params.SNAME = obj.name;
            if (typeof obj.circuit !== 'undefined') params.CIRCUIT = 'X' + String(parseInt(obj.circuit, 10)).padStart(4, '0');
            if (Object.keys(params).length > 0)
                await icws.setParamList(objnam, params);
            if (typeof obj.name !== 'undefined') valve.name = obj.name;
            if (typeof obj.circuit !== 'undefined') valve.circuit = parseInt(obj.circuit, 10);
            if (typeof obj.type !== 'undefined') valve.type = parseInt(obj.type, 10);
            return valve;
        }
        catch (err) { return Promise.reject(err); }
    }
}

class IntelliCenterWSCoverCommands extends CoverCommands {
    public async setCoverAsync(obj: any): Promise<Cover> {
        const id = parseInt(obj.id, 10);
        if (isNaN(id) || id < 1 || id > 2)
            return Promise.reject(new InvalidEquipmentIdError('Cover Id is not valid (1 or 2).', obj.id, 'Cover'));
        const cover = sys.covers.getItemById(id, false);
        if (!cover || typeof cover.name === 'undefined')
            return Promise.reject(new InvalidEquipmentIdError(`Cover ${id} does not exist. Enable it on the OCP first.`, obj.id, 'Cover'));
        try {
            const objnam = 'CVR' + String(id).padStart(2, '0');
            const params: Record<string, string> = {};
            if (typeof obj.isActive !== 'undefined') params.STATUS = utils.makeBool(obj.isActive) ? 'ON' : 'OFF';
            if (typeof obj.body !== 'undefined') {
                let bodyVal = parseInt(obj.body, 10);
                params.BODY = bodyVal === 2 ? 'B1202' : 'B1101';
            }
            if (Object.keys(params).length > 0)
                await icws.setParamList(objnam, params);
            if (typeof obj.body !== 'undefined') cover.body = parseInt(obj.body, 10);
            if (typeof obj.isActive !== 'undefined') cover.isActive = utils.makeBool(obj.isActive);
            if (typeof obj.normallyOn !== 'undefined') cover.normallyOn = utils.makeBool(obj.normallyOn);
            if (typeof obj.circuits !== 'undefined') cover.circuits = obj.circuits;
            const scover = state.covers.getItemById(cover.id, true);
            scover.name = cover.name;
            scover.body = cover.body;
            scover.isActive = cover.isActive;
            state.emitEquipmentChanges();
            return cover;
        }
        catch (err) { return Promise.reject(err); }
    }
}

class IntelliCenterWSCircuitCommands extends IntelliCenterCircuitCommands {
    public async setCircuitStateAsync(id: number, val: boolean, ignoreDelays?: boolean): Promise<ICircuitState> {
        logger.debug(`IntelliCenterWS: setCircuitStateAsync id=${id} val=${val}`);
        if (sys.board.equipmentIds.features.isInRange(id))
            return await this.board.features.setFeatureStateAsync(id, val, ignoreDelays);
        if (sys.board.equipmentIds.circuitGroups.isInRange(id)) {
            await this.setCircuitGroupStateAsync(id, val);
            return state.circuitGroups.getInterfaceById(id);
        }
        let c = sys.circuits.getInterfaceById(id);
        logger.debug(`IntelliCenterWS: circuit ${id} master=${c.master} name=${c.name}`);
        if (c.master !== 0) return await super.setCircuitStateAsync(id, val);
        try {
            let objnam: string;
            if (id === 1 || id === 6) {
                objnam = (id === 6) ? 'B1101' : 'B1202';
                if (state.freeze) val = true;
            } else {
                const circ = sys.circuits.getItemById(id, false);
                objnam = circ.objnam || ('C00' + String(id).padStart(2, '0'));
            }
            logger.debug(`IntelliCenterWS: sending SetParamList objnam=${objnam} STATUS=${val ? 'ON' : 'OFF'}`);
            const resp = await icws.setParamList(objnam, { STATUS: val ? 'ON' : 'OFF' });
            if (resp?.command === 'Error' || (resp?.response && String(resp.response) !== '200')) {
                logger.error(`IntelliCenterWS: SetParamList REJECTED for ${objnam}: ${JSON.stringify(resp).slice(0, 300)}`);
                return Promise.reject(new Error(`OCP rejected SetParamList for ${objnam}`));
            }
            return state.circuits.getInterfaceById(id);
        }
        catch (err) { return Promise.reject(err); }
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
            const idx = id - sys.board.equipmentIds.circuitGroups.start + 1;
            await icws.setParamList('GRP' + String(idx).padStart(2, '0'), { STATUS: val ? 'ON' : 'OFF' });
            if (isLightGroup && val) {
                setTimeoutSync(() => {
                    (gstate as LightGroupState).action = 0;
                    gstate.emitEquipmentChange();
                }, 15000);
            }
            return state.circuitGroups.getInterfaceById(id);
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
            let actValue = '';
            let actionName = '';
            switch (cmd.name) {
                case 'colorswim': actValue = 'SWIM'; actionName = 'colorswim'; break;
                case 'colorset': actValue = 'SET'; actionName = 'colorset'; break;
                case 'colorsync': actValue = 'SYNC'; actionName = 'colorsync'; break;
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
            const idx = id - sys.board.equipmentIds.circuitGroups.start + 1;
            // TODO: verify ACT values (SWIM/SET/SYNC) from live WS capture
            await icws.setParamList('GRP' + String(idx).padStart(2, '0'), { ACT: actValue, STATUS: 'ON' });
            return sgrp;
        }
        catch (err) { return Promise.reject(`Error runLightGroupCommandAsync ${err.message}`); }
    }
    public async setCircuitAsync(data: any): Promise<ICircuit> {
        let id = parseInt(data.id, 10);
        let circuit = sys.circuits.getItemById(id, false);
        if (id === -1 || circuit.master !== 0) return await super.setCircuitAsync(data);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Circuit Id has not been defined', data.id, 'Circuit'));
        if (!sys.board.equipmentIds.circuits.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Circuit Id ${id}: is out of range.`, id, 'Circuit'));
        try {
            const objnam = circuit.objnam || ('C' + String(id).padStart(4, '0'));
            const params: Record<string, string> = {};
            if (typeof data.name !== 'undefined') params.SNAME = data.name.toString().substring(0, 15);
            if (typeof data.type !== 'undefined') {
                let t = sys.board.valueMaps.circuitFunctions.transform(parseInt(data.type, 10));
                if (t.name) params.SUBTYP = t.name.toUpperCase();
            }
            if (typeof data.freeze !== 'undefined') params.FREEZE = utils.makeBool(data.freeze) ? 'ON' : 'OFF';
            if (typeof data.showInFeatures !== 'undefined') params.FEATR = utils.makeBool(data.showInFeatures) ? 'ON' : 'OFF';
            let eggTimer = typeof data.eggTimer !== 'undefined' ? Math.min(parseInt(data.eggTimer, 10), 1440) : undefined;
            if (data.dontStop === true) eggTimer = 1440;
            if (typeof eggTimer !== 'undefined') params.TIME = String(eggTimer);
            if (Object.keys(params).length > 0)
                await icws.setParamList(objnam, params);
            let scircuit = state.circuits.getItemById(circuit.id, true);
            if (typeof eggTimer !== 'undefined') { circuit.eggTimer = eggTimer; circuit.dontStop = eggTimer === 1440; }
            if (typeof data.freeze !== 'undefined') circuit.freeze = utils.makeBool(data.freeze);
            if (typeof data.showInFeatures !== 'undefined') scircuit.showInFeatures = circuit.showInFeatures = utils.makeBool(data.showInFeatures);
            if (typeof data.name !== 'undefined') scircuit.name = circuit.name = data.name.toString().substring(0, 15);
            if (typeof data.type !== 'undefined') scircuit.type = circuit.type = parseInt(data.type, 10);
            scircuit.isActive = circuit.isActive = true;
            circuit.master = 0;
            return circuit;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setCircuitGroupAsync(obj: any): Promise<CircuitGroup> {
        let id = typeof obj.id !== 'undefined' ? parseInt(obj.id, 10) : -1;
        let isAdd = id <= 0;
        if (isAdd) {
            let range = sys.board.equipmentIds.circuitGroups;
            for (let i = range.start; i <= range.end; i++) {
                if (!sys.lightGroups.find(elem => elem.id === i) && !sys.circuitGroups.find(elem => elem.id === i)) { id = i; break; }
            }
        }
        if (isNaN(id) || !sys.board.equipmentIds.circuitGroups.isInRange(id))
            return Promise.reject(new InvalidEquipmentIdError(`Invalid circuit group id: ${obj.id}`, obj.id, 'circuitGroup'));
        let group = sys.circuitGroups.getItemById(id, isAdd);
        let sgroup = state.circuitGroups.getItemById(id, isAdd);
        try {
            const idx = id - sys.board.equipmentIds.circuitGroups.start + 1;
            const grpObjnam = 'GRP' + String(idx).padStart(2, '0');
            if (isAdd) {
                const params: Record<string, string> = { SUBTYP: 'CIRCGRP' };
                if (typeof obj.name !== 'undefined') params.SNAME = obj.name;
                await icws.createObject('CIRCGRP', params);
            } else {
                const params: Record<string, string> = {};
                if (typeof obj.name !== 'undefined') params.SNAME = obj.name;
                if (Object.keys(params).length > 0) await icws.setParamList(grpObjnam, params);
            }
            if (typeof obj.name !== 'undefined') sgroup.name = group.name = obj.name;
            sgroup.type = group.type = 2;
            sgroup.isActive = group.isActive = true;
            if (typeof obj.showInFeatures !== 'undefined') group.showInFeatures = utils.makeBool(obj.showInFeatures);
            sgroup.showInFeatures = group.showInFeatures;
            if (typeof obj.circuits !== 'undefined' && Array.isArray(obj.circuits)) {
                for (let i = 0; i < obj.circuits.length; i++) {
                    let c = group.circuits.getItemByIndex(i, true);
                    c.id = i + 1;
                    c.circuit = obj.circuits[i].circuit;
                }
                group.circuits.length = obj.circuits.length;
            }
            let eggTimer = typeof obj.eggTimer !== 'undefined' ? Math.max(1, Math.min(1440, parseInt(obj.eggTimer, 10))) : group.eggTimer;
            if (obj.dontStop === true) eggTimer = 1440;
            group.eggTimer = eggTimer;
            group.dontStop = eggTimer === 1440;
            return group;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async deleteCircuitGroupAsync(obj: any): Promise<CircuitGroup> {
        let id = parseInt(obj.id, 10);
        if (isNaN(id) || !sys.board.equipmentIds.circuitGroups.isInRange(id))
            return Promise.reject(new EquipmentNotFoundError(`Invalid group id: ${obj.id}`, 'CircuitGroup'));
        let group = sys.circuitGroups.getItemById(id);
        try {
            const idx = id - sys.board.equipmentIds.circuitGroups.start + 1;
            await icws.deleteObject('GRP' + String(idx).padStart(2, '0'));
            sys.circuitGroups.removeItemById(id);
            state.circuitGroups.removeItemById(id);
            return group;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setLightGroupAsync(obj: any): Promise<LightGroup> {
        let id = typeof obj.id !== 'undefined' ? parseInt(obj.id, 10) : -1;
        let isAdd = id <= 0;
        if (isAdd) {
            let range = sys.board.equipmentIds.circuitGroups;
            for (let i = range.start; i <= range.end; i++) {
                if (!sys.lightGroups.find(elem => elem.id === i) && !sys.circuitGroups.find(elem => elem.id === i)) { id = i; break; }
            }
        }
        if (isNaN(id) || !sys.board.equipmentIds.circuitGroups.isInRange(id))
            return Promise.reject(new InvalidEquipmentIdError(`Invalid light group id: ${obj.id}`, obj.id, 'LightGroup'));
        let group = sys.lightGroups.getItemById(id, isAdd);
        let sgroup = state.lightGroups.getItemById(id, isAdd);
        try {
            const idx = id - sys.board.equipmentIds.circuitGroups.start + 1;
            const grpObjnam = 'GRP' + String(idx).padStart(2, '0');
            if (isAdd) {
                const params: Record<string, string> = { SUBTYP: 'LITSHO' };
                if (typeof obj.name !== 'undefined') params.SNAME = obj.name;
                await icws.createObject('LITSHO', params);
            } else {
                const params: Record<string, string> = {};
                if (typeof obj.name !== 'undefined') params.SNAME = obj.name;
                if (Object.keys(params).length > 0) await icws.setParamList(grpObjnam, params);
            }
            if (typeof obj.name !== 'undefined') sgroup.name = group.name = obj.name;
            sgroup.type = group.type = 1;
            sgroup.isActive = group.isActive = true;
            if (typeof obj.circuits !== 'undefined' && Array.isArray(obj.circuits)) {
                for (let i = 0; i < obj.circuits.length; i++) {
                    let c = group.circuits.getItemByIndex(i, true);
                    c.id = i + 1;
                    c.circuit = obj.circuits[i].circuit;
                    if (typeof obj.circuits[i].swimDelay !== 'undefined') c.swimDelay = obj.circuits[i].swimDelay;
                    if (typeof obj.circuits[i].color !== 'undefined') c.color = obj.circuits[i].color;
                }
                group.circuits.length = obj.circuits.length;
            }
            if (typeof obj.lightingTheme !== 'undefined') group.lightingTheme = sgroup.lightingTheme = parseInt(obj.lightingTheme, 10);
            return group;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async deleteLightGroupAsync(obj: any): Promise<LightGroup> {
        let id = parseInt(obj.id, 10);
        if (isNaN(id) || !sys.board.equipmentIds.circuitGroups.isInRange(id))
            return Promise.reject(new EquipmentNotFoundError(`Invalid light group id: ${obj.id}`, 'LightGroup'));
        let group = sys.lightGroups.getItemById(id);
        try {
            const idx = id - sys.board.equipmentIds.circuitGroups.start + 1;
            await icws.deleteObject('GRP' + String(idx).padStart(2, '0'));
            sys.lightGroups.removeItemById(id);
            state.lightGroups.removeItemById(id);
            return group;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setLightGroupThemeAsync(id: number, theme: number): Promise<ICircuitState> {
        let group = sys.lightGroups.getItemById(id);
        let sgroup = state.lightGroups.getItemById(id);
        try {
            const idx = id - sys.board.equipmentIds.circuitGroups.start + 1;
            const themeName = sys.board.valueMaps.lightThemes.transform(theme);
            let actValue = themeName.name ? themeName.name.toUpperCase() : String(theme);
            await icws.setParamList('GRP' + String(idx).padStart(2, '0'), { ACT: actValue, STATUS: 'ON' });
            group.lightingTheme = theme;
            sgroup.lightingTheme = theme;
            let nop = sys.board.valueMaps.circuitActions.getValue('settheme');
            sgroup.action = nop;
            sgroup.emitEquipmentChange();
            setTimeoutSync(() => { sgroup.action = 0; sgroup.emitEquipmentChange(); }, 15000);
            return sgroup;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setLightThemeAsync(id: number, theme: number): Promise<ICircuitState> {
        // Light groups (id range 193+) must take the WS path even when their
        // `master` is `1` (IntelliCenter-managed). The previous ordering
        // short-circuited to super on master===1 BEFORE the circuitGroups
        // range check, so theme PUTs against a light group never sent a
        // SetParamList to OCP.
        if (sys.board.equipmentIds.circuitGroups.isInRange(id)) {
            await this.setLightGroupThemeAsync(id, theme);
            return state.lightGroups.getItemById(id);
        }
        let circuit = sys.circuits.getInterfaceById(id);
        // On v3 WS, OCP-managed circuits are master===0. Anything else
        // (Nixie/REM master===1) goes through the inherited Nixie path.
        if (circuit.master !== 0) return await super.setLightThemeAsync(id, theme);
        let cstate = state.circuits.getItemById(id);
        try {
            const objnam = sys.circuits.getItemById(id).objnam || ('C' + String(id).padStart(4, '0'));
            const themeName = sys.board.valueMaps.lightThemes.transform(theme);
            let actValue = themeName.name ? themeName.name.toUpperCase() : String(theme);
            logger.debug(`IntelliCenterWS: setLightThemeAsync sending SetParamList objnam=${objnam} ACT=${actValue}`);
            // TODO: verify per-circuit theme WS key — may require writing via parent LITSHO group ACT
            await icws.setParamList(objnam, { ACT: actValue });
            sys.circuits.getItemById(id).lightingTheme = theme;
            cstate.lightingTheme = theme;
            if (!cstate.isOn) await this.setCircuitStateAsync(id, true);
            state.emitEquipmentChanges();
            return cstate;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async setColorHoldAsync(id: number): Promise<ICircuitState> {
        // Bypass IntelliCenterBoard's master===1 short-circuit (which routes
        // to RS-485 super and is a no-op on a WS-only transport). On v3 WS,
        // hold/recall is just a theme write with the colorhold/colorrecall
        // value (12/13).
        if (sys.board.equipmentIds.circuitGroups.isInRange(id)) {
            await this.setLightGroupThemeAsync(id, 12);
            return state.lightGroups.getItemById(id);
        }
        return await this.setLightThemeAsync(id, 12);
    }
    public async setColorRecallAsync(id: number): Promise<ICircuitState> {
        if (sys.board.equipmentIds.circuitGroups.isInRange(id)) {
            await this.setLightGroupThemeAsync(id, 13);
            return state.lightGroups.getItemById(id);
        }
        return await this.setLightThemeAsync(id, 13);
    }
    public async setDimmerLevelAsync(id: number, level: number): Promise<ICircuitState> {
        let circuit = sys.circuits.getItemById(id);
        let cstate = state.circuits.getItemById(id);
        try {
            if (!cstate.isOn) await this.setCircuitStateAsync(id, true);
            const objnam = circuit.objnam || ('C' + String(id).padStart(4, '0'));
            // TODO: verify dimmer level WS key — not captured in mitm
            await icws.setParamList(objnam, { ACT: String(level) });
            circuit.level = level;
            cstate.level = level;
            return cstate;
        }
        catch (err) { return Promise.reject(err); }
    }
}

class IntelliCenterWSFeatureCommands extends IntelliCenterFeatureCommands {
    public async setFeatureStateAsync(id: number, val: boolean, ignoreDelays?: boolean): Promise<ICircuitState> {
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid feature id: ${id}`, id, 'Feature'));
        if (!sys.board.equipmentIds.features.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`Invalid feature id: ${id}`, id, 'Feature'));
        const idx = id - sys.board.equipmentIds.features.start + 1;
        const objnam = 'FTR' + String(idx).padStart(2, '0');
        logger.debug(`IntelliCenterWS: setFeatureStateAsync id=${id} val=${val} objnam=${objnam}`);
        const resp = await icws.setParamList(objnam, { STATUS: val ? 'ON' : 'OFF' });
        if (resp?.command === 'Error' || (resp?.response && String(resp.response) !== '200')) {
            logger.error(`IntelliCenterWS: SetParamList REJECTED for feature ${objnam}: ${JSON.stringify(resp).slice(0, 300)}`);
            return Promise.reject(new Error(`OCP rejected SetParamList for ${objnam}`));
        }
        return state.features.getItemById(id, true);
    }
    public async setFeatureAsync(data: any): Promise<Feature> {
        let id = parseInt(data.id, 10);
        let isNew = id <= 0;
        if (isNew) id = sys.features.getNextEquipmentId(sys.board.equipmentIds.features);
        let feature = sys.features.getItemById(id, false);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('feature Id has not been defined', data.id, 'Feature'));
        if (!sys.board.equipmentIds.features.isInRange(id)) return Promise.reject(new InvalidEquipmentIdError(`feature Id ${id}: is out of range.`, id, 'Feature'));
        try {
            const idx = id - sys.board.equipmentIds.features.start + 1;
            const objnam = 'FTR' + String(idx).padStart(2, '0');
            const params: Record<string, string> = {};
            if (typeof data.name !== 'undefined') params.SNAME = data.name;
            let eggTimer = typeof data.eggTimer !== 'undefined' ? Math.min(parseInt(data.eggTimer, 10), 1440) : undefined;
            if (data.dontStop === true) eggTimer = 1440;
            if (typeof eggTimer !== 'undefined') params.TIME = String(eggTimer);
            if (isNew) {
                await icws.createObject('FEATR', params);
            } else if (Object.keys(params).length > 0) {
                await icws.setParamList(objnam, params);
            }
            feature = sys.features.getItemById(id, true);
            let fstate = state.features.getItemById(id, true);
            if (typeof eggTimer !== 'undefined') { feature.eggTimer = eggTimer; feature.dontStop = eggTimer === 1440; }
            if (typeof data.name !== 'undefined') fstate.name = feature.name = data.name;
            if (typeof data.type !== 'undefined') fstate.type = feature.type = parseInt(data.type, 10);
            if (typeof data.freeze !== 'undefined') fstate.freezeProtect = feature.freeze = utils.makeBool(data.freeze);
            if (typeof data.showInFeatures !== 'undefined') fstate.showInFeatures = feature.showInFeatures = utils.makeBool(data.showInFeatures);
            fstate.emitEquipmentChange();
            return feature;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async deleteFeatureAsync(data: any): Promise<Feature> {
        let id = parseInt(data.id, 10);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('feature Id has not been defined', data.id, 'Feature'));
        let feature = sys.features.getItemById(id, false);
        try {
            const idx = id - sys.board.equipmentIds.features.start + 1;
            await icws.deleteObject('FTR' + String(idx).padStart(2, '0'));
            sys.features.removeItemById(id);
            state.features.removeItemById(id);
            return feature;
        }
        catch (err) { return Promise.reject(err); }
    }
}

class IntelliCenterWSBodyCommands extends IntelliCenterBodyCommands {
    private _bodyHeatSettings: {
        processing: boolean,
        bytes: number[],
        body1: { heatMode: number, heatSetpoint: number, coolSetpoint: number },
        body2: { heatMode: number, heatSetpoint: number, coolSetpoint: number },
        _processingStartTime?: number
    };
    protected async queueBodyHeatSettings(bodyId?: number, byte?: number, data?: any): Promise<Boolean> {
        if (typeof this._bodyHeatSettings === 'undefined') {
            let body1 = sys.bodies.getItemById(1);
            let body2 = sys.bodies.getItemById(2);
            this._bodyHeatSettings = {
                processing: false,
                bytes: [],
                body1: { heatMode: body1.heatMode || 1, heatSetpoint: body1.heatSetpoint || 78, coolSetpoint: body1.coolSetpoint || 100 },
                body2: { heatMode: body2.heatMode || 1, heatSetpoint: body2.heatSetpoint || 78, coolSetpoint: body2.coolSetpoint || 100 }
            };
        }
        let bhs = this._bodyHeatSettings;
        if (bhs.processing && bhs._processingStartTime && (Date.now() - bhs._processingStartTime > 10000)) {
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
            bhs.bytes.shift();
            try {
                const objnam = bodyId === 2 ? 'B1202' : 'B1101';
                const body = bodyId === 2 ? bhs.body2 : bhs.body1;
                const params: Record<string, string> = {};
                params.LOTMP = String(body.heatSetpoint);
                params.MODE = String(body.heatMode);
                await icws.setParamList(objnam, params);
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
                setTimeoutSync(async () => {
                    try { await this.queueBodyHeatSettings(); }
                    catch (err) { logger.error(`Error sending queued body setpoint message: ${err.message}`); }
                }, 3000);
            }
            else {
                bhs.processing = false;
                delete bhs._processingStartTime;
            }
            return true;
        }
    }
    public async setBodyAsync(obj: any): Promise<Body> {
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Body Id is not defined', obj.id, 'Body'));
        let body = sys.bodies.getItemById(id, false);
        const objnam = id === 2 ? 'B1202' : 'B1101';
        try {
            const params: Record<string, string> = {};
            if (typeof obj.name !== 'undefined') params.SNAME = obj.name;
            if (typeof obj.capacity !== 'undefined') params.VOL = String(parseInt(obj.capacity, 10));
            if (Object.keys(params).length > 0)
                await icws.setParamList(objnam, params);
            if (typeof obj.name !== 'undefined') body.name = obj.name;
            if (typeof obj.capacity !== 'undefined') body.capacity = parseInt(obj.capacity, 10);
            if (typeof obj.manualHeat !== 'undefined') body.manualHeat = utils.makeBool(obj.manualHeat);
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
        if (typeof modes.find(elem => elem.val === mode) === 'undefined')
            return Promise.reject(new InvalidEquipmentDataError(`Cannot set heat mode to ${mode} since this is not a valid mode for the ${body.name}`, 'Body', mode));
        const objnam = body.id === 2 ? 'B1202' : 'B1101';
        await icws.setParamList(objnam, { MODE: String(mode) });
        body.heatMode = mode;
        let bstate = state.temps.bodies.getItemById(body.id);
        bstate.heatMode = mode;
        state.emitEquipmentChanges();
        return bstate;
    }
    public async setHeatSetpointAsync(body: Body, setPoint: number): Promise<BodyTempState> {
        if (typeof setPoint === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Cannot set heat setpoint to undefined for the ${body.name}`, 'Body', setPoint));
        if (setPoint < 0 || setPoint > 110) return Promise.reject(new InvalidEquipmentDataError(`Cannot set heat setpoint to ${setPoint} for the ${body.name}`, 'Body', setPoint));
        const objnam = body.id === 2 ? 'B1202' : 'B1101';
        await icws.setParamList(objnam, { LOTMP: String(setPoint) });
        body.heatSetpoint = setPoint;
        let bstate = state.temps.bodies.getItemById(body.id);
        bstate.heatSetpoint = setPoint;
        state.emitEquipmentChanges();
        return bstate;
    }
    public async setCoolSetpointAsync(body: Body, setPoint: number): Promise<BodyTempState> {
        if (typeof setPoint === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Cannot set cooling setpoint to undefined for the ${body.name}`, 'Body', setPoint));
        if (setPoint < 0 || setPoint > 110) return Promise.reject(new InvalidEquipmentDataError(`Cannot set cooling setpoint to ${setPoint} for the ${body.name}`, 'Body', setPoint));
        const objnam = body.id === 2 ? 'B1202' : 'B1101';
        await icws.setParamList(objnam, { HITMP: String(setPoint) });
        body.coolSetpoint = setPoint;
        let bstate = state.temps.bodies.getItemById(body.id);
        bstate.coolSetpoint = setPoint;
        state.emitEquipmentChanges();
        return bstate;
    }
}

class IntelliCenterWSScheduleCommands extends IntelliCenterScheduleCommands {
    public async setScheduleAsync(data: any): Promise<Schedule> {
        let id = typeof data.id === 'undefined' ? -1 : parseInt(data.id, 10);
        let isNew = id <= 0;
        if (isNaN(id) && !isNew) return Promise.reject(new InvalidEquipmentIdError(`Invalid schedule id: ${data.id}`, data.id, 'Schedule'));
        try {
            const params: Record<string, string> = {};
            if (typeof data.circuit !== 'undefined') {
                let circId = parseInt(data.circuit, 10);
                if (sys.board.equipmentIds.features.isInRange(circId))
                    params.CIRCUIT = 'FTR' + String(circId - sys.board.equipmentIds.features.start + 1).padStart(2, '0');
                else if (sys.board.equipmentIds.circuitGroups.isInRange(circId))
                    params.CIRCUIT = 'GRP' + String(circId - sys.board.equipmentIds.circuitGroups.start + 1).padStart(2, '0');
                else
                    params.CIRCUIT = 'C' + String(circId).padStart(4, '0');
            }
            if (typeof data.startTime !== 'undefined') {
                let st = typeof data.startTime === 'number' ? data.startTime : parseInt(data.startTime, 10);
                let hh = Math.floor(st / 60);
                let mm = st - (hh * 60);
                params.TIME = `${String(hh).padStart(2, '0')},${String(mm).padStart(2, '0')},00`;
            }
            if (typeof data.endTime !== 'undefined') {
                let et = typeof data.endTime === 'number' ? data.endTime : parseInt(data.endTime, 10);
                let hh = Math.floor(et / 60);
                let mm = et - (hh * 60);
                params.TIMOUT = `${String(hh).padStart(2, '0')},${String(mm).padStart(2, '0')},00`;
            }
            if (typeof data.scheduleDays !== 'undefined' || typeof data.flags !== 'undefined') {
                let days = typeof data.scheduleDays !== 'undefined' ? data.scheduleDays : data.flags;
                let dayVal = typeof days === 'number' ? days : parseInt(days, 10);
                let dayStr = '';
                if (dayVal & 1) dayStr += 'U';
                if (dayVal & 2) dayStr += 'M';
                if (dayVal & 4) dayStr += 'T';
                if (dayVal & 8) dayStr += 'W';
                if (dayVal & 16) dayStr += 'R';
                if (dayVal & 32) dayStr += 'F';
                if (dayVal & 64) dayStr += 'A';
                params.DAY = dayStr || 'MTWRFAU';
            }
            if (typeof data.scheduleType !== 'undefined')
                params.SINGLE = parseInt(data.scheduleType, 10) === 128 ? 'OFF' : 'ON';
            if (typeof data.startDate !== 'undefined') {
                let dt = new Date(data.startDate);
                if (!isNaN(dt.getTime())) {
                    let mm = String(dt.getMonth() + 1).padStart(2, '0');
                    let dd = String(dt.getDate()).padStart(2, '0');
                    let yy = String(dt.getFullYear() - 2000).padStart(2, '0');
                    params.UPDATE = `${mm}/${dd}/${yy}`;
                }
            }
            if (typeof data.isActive !== 'undefined')
                params.MODE = utils.makeBool(data.isActive) ? '3' : '0';
            if (typeof data.startTimeType !== 'undefined') {
                let stt = parseInt(data.startTimeType, 10);
                params.START = stt === 1 ? 'SRIS' : stt === 2 ? 'SSET' : 'ABSTIM';
            }
            if (typeof data.endTimeType !== 'undefined') {
                let ett = parseInt(data.endTimeType, 10);
                params.STOP = ett === 1 ? 'SRIS' : ett === 2 ? 'SSET' : 'ABSTIM';
            }
            if (typeof data.heatSource !== 'undefined') {
                let hs = parseInt(data.heatSource, 10);
                params.HEATER = hs > 0 ? 'H' + String(hs).padStart(4, '0') : '00000';
            }
            if (typeof data.coolSetpoint !== 'undefined')
                params.COOLING = String(parseInt(data.coolSetpoint, 10));
            if (typeof data.dontStop !== 'undefined')
                params.DNTSTP = utils.makeBool(data.dontStop) ? 'ON' : 'OFF';
            if (isNew) {
                if (!params.VACFLO) params.VACFLO = 'OFF';
                if (!params.CIRCUIT) return Promise.reject(new InvalidEquipmentDataError('Schedule requires a circuit', 'Schedule', -1));
                let resp = await icws.createObject('SCHED', params);
                if (resp?.objnam) id = parseInt(resp.objnam.replace(/\D/g, ''), 10) + 1;
                else id = sys.schedules.getNextEquipmentId(new EquipmentIdRange(1, 100));
            } else {
                await icws.setParamList('SCH' + String(id - 1).padStart(2, '0'), params);
            }
            let sched = sys.schedules.getItemById(id, isNew);
            let ssched = state.schedules.getItemById(id, isNew);
            if (typeof data.circuit !== 'undefined') sched.circuit = parseInt(data.circuit, 10);
            if (typeof data.startTime !== 'undefined') sched.startTime = parseInt(data.startTime, 10);
            if (typeof data.endTime !== 'undefined') sched.endTime = parseInt(data.endTime, 10);
            if (typeof data.scheduleDays !== 'undefined') sched.scheduleDays = parseInt(data.scheduleDays, 10);
            if (typeof data.scheduleType !== 'undefined') sched.scheduleType = parseInt(data.scheduleType, 10);
            if (typeof data.isActive !== 'undefined') ssched.isOn = sched.isActive = utils.makeBool(data.isActive);
            if (typeof data.startTimeType !== 'undefined') sched.startTimeType = parseInt(data.startTimeType, 10);
            if (typeof data.endTimeType !== 'undefined') sched.endTimeType = parseInt(data.endTimeType, 10);
            if (typeof data.heatSource !== 'undefined') sched.heatSource = parseInt(data.heatSource, 10);
            if (typeof data.coolSetpoint !== 'undefined') sched.coolSetpoint = parseInt(data.coolSetpoint, 10);
            ssched.emitEquipmentChange();
            return sched;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async deleteScheduleAsync(data: any): Promise<Schedule> {
        let id = parseInt(data.id, 10);
        if (isNaN(id) || id < 0) return Promise.reject(new InvalidEquipmentIdError(`Invalid schedule id: ${data.id}`, data.id, 'Schedule'));
        let sched = sys.schedules.getItemById(id);
        try {
            const objnam = 'SCH' + String(id - 1).padStart(2, '0');
            await icws.destroyObject(objnam);
            sys.schedules.removeItemById(id);
            state.schedules.removeItemById(id);
            return sched;
        }
        catch (err) { return Promise.reject(err); }
    }
}

class IntelliCenterWSPumpCommands extends IntelliCenterPumpCommands {
    public async setPumpAsync(data: any): Promise<Pump> {
        let id = (typeof data.id === 'undefined' || data.id <= 0) ? sys.pumps.getNextEquipmentId(sys.board.equipmentIds.pumps) : parseInt(data.id, 10);
        if (isNaN(id)) return Promise.reject(new Error(`Invalid pump id: ${data.id}`));
        let pump = sys.pumps.getItemById(id, false);
        if (data.master > 0 || pump.master > 0) return await super.setPumpAsync(data);
        try {
            const pumpObjnam = 'PMP' + String(id).padStart(2, '0');
            let isNew = !pump.isActive;
            if (isNew) {
                let subtyp = 'SPEED';
                if (typeof data.type !== 'undefined') {
                    let ptype = sys.board.valueMaps.pumpTypes.transform(parseInt(data.type, 10));
                    if (ptype.name === 'vf') subtyp = 'FLOW';
                    else if (ptype.name === 'vsf') subtyp = 'VSF';
                    else if (ptype.name === 'ss') subtyp = 'SINGLE';
                }
                const params: Record<string, string> = { SUBTYP: subtyp };
                if (typeof data.name !== 'undefined') params.SNAME = data.name;
                if (typeof data.address !== 'undefined') params.COMUART = String(parseInt(data.address, 10) - 95);
                if (typeof data.minSpeed !== 'undefined') params.MIN = String(data.minSpeed);
                else if (typeof data.minFlow !== 'undefined') params.MIN = String(data.minFlow);
                if (typeof data.maxSpeed !== 'undefined') params.MAX = String(data.maxSpeed);
                else if (typeof data.maxFlow !== 'undefined') params.MAX = String(data.maxFlow);
                if (typeof data.primingSpeed !== 'undefined') params.PRIMFLO = String(data.primingSpeed);
                if (typeof data.primingTime !== 'undefined') params.PRIMTIM = String(data.primingTime);
                await icws.createObject('PUMP', params);
                pump = sys.pumps.getItemById(id, true);
                pump.isActive = true;
            } else {
                const params: Record<string, string> = {};
                const isFlowPump = pump.type === 5;
                const isVsfPump = pump.type === 4;
                if (typeof data.name !== 'undefined') params.SNAME = data.name;
                if (typeof data.address !== 'undefined') params.COMUART = String(parseInt(data.address, 10) - 95);
                if (isFlowPump) {
                    if (typeof data.minFlow !== 'undefined') params.MIN = String(data.minFlow);
                    else if (typeof data.minSpeed !== 'undefined') params.MIN = String(data.minSpeed);
                    if (typeof data.maxFlow !== 'undefined') params.MAX = String(data.maxFlow);
                    else if (typeof data.maxSpeed !== 'undefined') params.MAX = String(data.maxSpeed);
                    if (typeof data.flowStepSize !== 'undefined') params.SETTMP = String(data.flowStepSize);
                } else if (isVsfPump) {
                    if (typeof data.minSpeed !== 'undefined') params.MIN = String(data.minSpeed);
                    if (typeof data.maxSpeed !== 'undefined') params.MAX = String(data.maxSpeed);
                    if (typeof data.minFlow !== 'undefined') params.MINF = String(data.minFlow);
                    if (typeof data.maxFlow !== 'undefined') params.MAXF = String(data.maxFlow);
                    if (typeof data.speedStepSize !== 'undefined') params.SETTMP = String(data.speedStepSize);
                    if (typeof data.flowStepSize !== 'undefined') params.SETTMPNC = String(data.flowStepSize);
                } else {
                    if (typeof data.minSpeed !== 'undefined') params.MIN = String(data.minSpeed);
                    if (typeof data.maxSpeed !== 'undefined') params.MAX = String(data.maxSpeed);
                    if (typeof data.speedStepSize !== 'undefined') params.SETTMP = String(data.speedStepSize);
                }
                if (typeof data.primingSpeed !== 'undefined') params.PRIMFLO = String(data.primingSpeed);
                if (typeof data.primingTime !== 'undefined') params.PRIMTIM = String(data.primingTime);
                if (Object.keys(params).length > 0)
                    await icws.setParamList(pumpObjnam, params);
            }
            if (typeof data.circuits !== 'undefined' && Array.isArray(data.circuits)) {
                const circuitList: Array<Record<string, string>> = [];
                for (const circ of data.circuits) {
                    const slot: Record<string, string> = {};
                    if (typeof circ.circuit !== 'undefined') {
                        const cid = parseInt(circ.circuit, 10);
                        if (cid > 192) slot.CIRCUIT = 'GRP' + String(cid - 192).padStart(2, '0');
                        else if (cid > 128) slot.CIRCUIT = 'FTR' + String(cid - 128).padStart(2, '0');
                        else slot.CIRCUIT = 'C' + String(cid).padStart(4, '0');
                    }
                    if (typeof circ.speed !== 'undefined') slot.SPEED = String(circ.speed);
                    if (typeof circ.flow !== 'undefined') slot.SPEED = String(circ.flow);
                    if (typeof circ.units !== 'undefined') {
                        let u = sys.board.valueMaps.pumpUnits.transform(circ.units);
                        slot.SELECT = u.name === 'gpm' ? 'GPM' : 'RPM';
                    }
                    if (Object.keys(slot).length > 0) circuitList.push(slot);
                }
                if (circuitList.length > 0) {
                    await icws.createObjectAffect(pumpObjnam, circuitList);
                    pump.circuits.length = 0;
                    for (let i = 0; i < data.circuits.length; i++) {
                        const circ = data.circuits[i];
                        const pc = pump.circuits.getItemById(i + 1, true);
                        if (typeof circ.circuit !== 'undefined') pc.circuit = parseInt(circ.circuit, 10);
                        if (typeof circ.speed !== 'undefined') pc.speed = parseInt(circ.speed, 10);
                        if (typeof circ.flow !== 'undefined') pc.flow = parseInt(circ.flow, 10);
                        if (typeof circ.units !== 'undefined') pc.units = parseInt(circ.units, 10);
                    }
                }
            }
            if (typeof data.type !== 'undefined') pump.type = parseInt(data.type, 10);
            if (typeof data.name !== 'undefined') pump.name = data.name;
            if (typeof data.address !== 'undefined') pump.address = parseInt(data.address, 10);
            if (typeof data.minSpeed !== 'undefined') pump.minSpeed = parseInt(data.minSpeed, 10);
            if (typeof data.maxSpeed !== 'undefined') pump.maxSpeed = parseInt(data.maxSpeed, 10);
            if (typeof data.minFlow !== 'undefined') pump.minFlow = parseInt(data.minFlow, 10);
            if (typeof data.maxFlow !== 'undefined') pump.maxFlow = parseInt(data.maxFlow, 10);
            if (typeof data.flowStepSize !== 'undefined') pump.flowStepSize = parseInt(data.flowStepSize, 10);
            if (typeof data.speedStepSize !== 'undefined') pump.speedStepSize = parseInt(data.speedStepSize, 10);
            let spump = state.pumps.getItemById(id, true);
            spump.name = pump.name;
            spump.type = pump.type;
            spump.emitEquipmentChange();
            return pump;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async deletePumpAsync(data: any): Promise<Pump> {
        let id = parseInt(data.id, 10);
        if (isNaN(id)) return Promise.reject(new Error(`Invalid pump id: ${data.id}`));
        let pump = sys.pumps.getItemById(id, false);
        try {
            const pumpObjnam = 'PMP' + String(id).padStart(2, '0');
            await icws.deleteObject(pumpObjnam);
            sys.pumps.removeItemById(id);
            state.pumps.removeItemById(id);
            return pump;
        }
        catch (err) { return Promise.reject(err); }
    }
}

class IntelliCenterWSChlorinatorCommands extends IntelliCenterChlorinatorCommands {
    public async setChlorAsync(obj: any): Promise<ChlorinatorState> {
        let id = typeof obj.id !== 'undefined' ? parseInt(obj.id, 10) : 1;
        let chlor = sys.chlorinators.getItemById(id);
        let schlor = state.chlorinators.getItemById(id);
        try {
            const objnam = chlor.objnam || 'CHR' + String(id).padStart(2, '0');
            const params: Record<string, string> = {};
            if (typeof obj.name !== 'undefined') params.SNAME = obj.name;
            if (typeof obj.poolSetpoint !== 'undefined') params.PRIM = String(parseInt(obj.poolSetpoint, 10));
            if (typeof obj.spaSetpoint !== 'undefined') params.SEC = String(parseInt(obj.spaSetpoint, 10));
            if (typeof obj.superChlorinate !== 'undefined') params.SUPER = utils.makeBool(obj.superChlorinate) ? 'ON' : 'OFF';
            if (typeof obj.superChlorHours !== 'undefined') params.TIMOUT = String(parseInt(obj.superChlorHours, 10) * 3600);
            if (typeof obj.body !== 'undefined') params.BODY = obj.body === 32 || obj.body === 2 ? 'B1101 B1202' : 'B1101';
            if (Object.keys(params).length > 0)
                await icws.setParamList(objnam, params);
            if (typeof obj.name !== 'undefined') chlor.name = schlor.name = obj.name;
            if (typeof obj.poolSetpoint !== 'undefined') chlor.poolSetpoint = schlor.poolSetpoint = parseInt(obj.poolSetpoint, 10);
            if (typeof obj.spaSetpoint !== 'undefined') chlor.spaSetpoint = schlor.spaSetpoint = parseInt(obj.spaSetpoint, 10);
            if (typeof obj.superChlorinate !== 'undefined') chlor.superChlor = schlor.superChlor = utils.makeBool(obj.superChlorinate);
            if (typeof obj.superChlorHours !== 'undefined') chlor.superChlorHours = schlor.superChlorHours = parseInt(obj.superChlorHours, 10);
            if (typeof obj.saltTarget !== 'undefined') chlor.saltTarget = schlor.saltTarget = parseInt(obj.saltTarget, 10);
            schlor.emitEquipmentChange();
            return schlor;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async deleteChlorAsync(obj: any): Promise<ChlorinatorState> {
        let id = typeof obj.id !== 'undefined' ? parseInt(obj.id, 10) : 1;
        let schlor = state.chlorinators.getItemById(id);
        try {
            await icws.deleteObject('CHR01');
            sys.chlorinators.removeItemById(id);
            state.chlorinators.removeItemById(id);
            return schlor;
        }
        catch (err) { return Promise.reject(err); }
    }
}

class IntelliCenterWSChemControllerCommands extends IntelliCenterChemControllerCommands {
    protected async setIntelliChemAsync(data: any): Promise<ChemController> {
        let chem = sys.board.chemControllers.findChemController(data);
        let isAdd = typeof chem === 'undefined' || typeof chem.isActive === 'undefined';
        if (isAdd) {
            data.id = sys.chemControllers.getNextControllerId(sys.board.valueMaps.chemControllerTypes.encode('intellichem'));
            chem = sys.chemControllers.getItemById(data.id, true);
            chem.type = sys.board.valueMaps.chemControllerTypes.encode('intellichem');
            chem.isActive = true;
        } else {
            chem = sys.chemControllers.getItemById(data.id);
        }
        let schem = state.chemControllers.getItemById(chem.id, true);
        const objnam = chem.objnam || 'CHM' + String(chem.id).padStart(2, '0');
        const params: Record<string, string> = {};
        if (typeof data.name !== 'undefined') params.SNAME = data.name;
        if (typeof data.body !== 'undefined') {
            let bodyVal = parseInt(data.body, 10);
            if (bodyVal === 32) params.BODY = 'B1101 B1202';
            else if (bodyVal === 1) params.BODY = 'B1202';
            else params.BODY = 'B1101';
        }
        if (typeof data.ph !== 'undefined' && typeof data.ph.setpoint !== 'undefined')
            params.PHSET = String(parseFloat(data.ph.setpoint));
        if (typeof data.orp !== 'undefined' && typeof data.orp.setpoint !== 'undefined')
            params.ORPSET = String(parseInt(data.orp.setpoint, 10));
        if (typeof data.alkalinity !== 'undefined')
            params.ALK = String(parseInt(data.alkalinity, 10));
        if (typeof data.calciumHardness !== 'undefined')
            params.CALC = String(parseInt(data.calciumHardness, 10));
        if (typeof data.cyanuricAcid !== 'undefined')
            params.CYACID = String(parseInt(data.cyanuricAcid, 10));
        if (Object.keys(params).length > 0)
            await icws.setParamList(objnam, params);
        if (typeof data.name !== 'undefined') chem.name = schem.name = data.name;
        if (typeof data.body !== 'undefined') chem.body = schem.body = sys.board.valueMaps.bodies.encode(data.body);
        if (typeof data.ph !== 'undefined' && typeof data.ph.setpoint !== 'undefined')
            chem.ph.setpoint = schem.ph.setpoint = parseFloat(data.ph.setpoint);
        if (typeof data.orp !== 'undefined' && typeof data.orp.setpoint !== 'undefined')
            chem.orp.setpoint = schem.orp.setpoint = parseInt(data.orp.setpoint, 10);
        if (typeof data.alkalinity !== 'undefined') chem.alkalinity = parseInt(data.alkalinity, 10);
        if (typeof data.calciumHardness !== 'undefined') chem.calciumHardness = parseInt(data.calciumHardness, 10);
        if (typeof data.cyanuricAcid !== 'undefined') chem.cyanuricAcid = parseInt(data.cyanuricAcid, 10);
        if (typeof data.borates !== 'undefined') chem.borates = parseInt(data.borates, 10);
        if (typeof data.siCalcType !== 'undefined') chem.siCalcType = sys.board.valueMaps.siCalcTypes.encode(data.siCalcType, 0);
        if (typeof data.lsiRange !== 'undefined') {
            if (typeof data.lsiRange.enabled !== 'undefined') chem.lsiRange.enabled = utils.makeBool(data.lsiRange.enabled);
            if (typeof data.lsiRange.low !== 'undefined') chem.lsiRange.low = parseFloat(data.lsiRange.low);
            if (typeof data.lsiRange.high !== 'undefined') chem.lsiRange.high = parseFloat(data.lsiRange.high);
        }
        if (typeof data.ph !== 'undefined' && typeof data.ph.tolerance !== 'undefined') {
            if (typeof data.ph.tolerance.enabled !== 'undefined') chem.ph.tolerance.enabled = utils.makeBool(data.ph.tolerance.enabled);
            if (typeof data.ph.tolerance.low !== 'undefined') chem.ph.tolerance.low = parseFloat(data.ph.tolerance.low);
            if (typeof data.ph.tolerance.high !== 'undefined') chem.ph.tolerance.high = parseFloat(data.ph.tolerance.high);
        }
        if (typeof data.orp !== 'undefined' && typeof data.orp.tolerance !== 'undefined') {
            if (typeof data.orp.tolerance.enabled !== 'undefined') chem.orp.tolerance.enabled = utils.makeBool(data.orp.tolerance.enabled);
            if (typeof data.orp.tolerance.low !== 'undefined') chem.orp.tolerance.low = parseFloat(data.orp.tolerance.low);
            if (typeof data.orp.tolerance.high !== 'undefined') chem.orp.tolerance.high = parseFloat(data.orp.tolerance.high);
        }
        chem.isActive = schem.isActive = true;
        schem.type = chem.type;
        schem.emitEquipmentChange();
        return chem;
    }
    public async deleteChemControllerAsync(data: any): Promise<ChemController> {
        let id = typeof data.id !== 'undefined' ? parseInt(data.id, 10) : -1;
        if (isNaN(id) || id <= 0) return Promise.reject(new InvalidEquipmentIdError(`Invalid Chem Controller Id`, id, 'chemController'));
        let chem = sys.chemControllers.getItemById(id);
        const objnam = chem.objnam || 'CHM' + String(id).padStart(2, '0');
        await icws.deleteObject(objnam);
        let schem = state.chemControllers.getItemById(id);
        chem.isActive = false;
        schem.isActive = false;
        sys.chemControllers.removeItemById(id);
        state.chemControllers.removeItemById(id);
        schem.emitEquipmentChange();
        return chem;
    }
}

class IntelliCenterWSHeaterCommands extends IntelliCenterHeaterCommands {
    // v3 over WebSocket: heater.body uses the parseBodyRef encoding
    // (0 = unassigned, 1 = Pool, 2 = Spa, 32 = shared/both).
    // Source: controller/comms/IntelliCenterWSController.ts parseBodyRef.
    // OCP/official-app picklists exclude unassigned (BODY="00000") heaters,
    // so heaterBody=0 must NOT match any body — defensive fallback would
    // resurrect the v1.x bug where unassigned heaters showed up on Pool.
    protected matchesBody(heaterBody: number, requestedBody: number): boolean {
        if (heaterBody === 32) return requestedBody <= 2; // both/shared
        if (heaterBody === 1) return requestedBody === 1; // Pool
        if (heaterBody === 2) return requestedBody === 2; // Spa
        return false;                                      // 0/unknown -> exclude
    }
    public async setHeaterAsync(obj: any): Promise<Heater> {
        if (obj.master === 1 || parseInt(obj.id, 10) > 255) return super.setHeaterAsync(obj);
        let id = typeof obj.id === 'undefined' ? -1 : parseInt(obj.id, 10);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Heater Id is not valid.', obj.id, 'Heater'));
        let isNew = id <= 0;
        if (isNew) {
            if (sys.heaters.length >= 5) return Promise.reject(new InvalidEquipmentDataError(`Maximum of 5 heaters allowed`, 'Heater', id));
            id = sys.heaters.getNextEquipmentId(new EquipmentIdRange(1, 16));
        }
        let heater = sys.heaters.getItemById(id, isNew);
        try {
            const objnam = 'H' + String(id).padStart(4, '0');
            const params: Record<string, string> = {};
            if (typeof obj.name !== 'undefined') params.SNAME = obj.name;
            if (typeof obj.coolingEnabled !== 'undefined') params.COOL = utils.makeBool(obj.coolingEnabled) ? 'ON' : 'OFF';
            if (typeof obj.cooldownDelay !== 'undefined') params.DLY = String(parseInt(obj.cooldownDelay, 10));
            if (typeof obj.body !== 'undefined') {
                let bodyVal = parseInt(obj.body, 10);
                if (bodyVal === 32) params.BODY = 'B1101 B1202';
                else if (bodyVal === 1) params.BODY = 'B1101';
                else if (bodyVal === 2) params.BODY = 'B1202';
            }
            if (typeof obj.type !== 'undefined') {
                let htype = sys.board.valueMaps.heaterTypes.transform(parseInt(obj.type, 10));
                let subtypMap = { gas: 'MASTER', solar: 'SOLAR', ultratemp: 'ULTRA', hybrid: 'HCOMBO', heatpump: 'HTPMP', maxetherm: 'MAXE', mastertemp: 'MASTER', eti250: 'ETI' };
                params.SUBTYP = subtypMap[htype.name] || 'MASTER';
            }
            if (isNew)
                await icws.createObject('HEATER', params);
            else if (Object.keys(params).length > 0)
                await icws.setParamList(objnam, params);
            if (typeof obj.name !== 'undefined') heater.name = obj.name;
            if (typeof obj.type !== 'undefined') heater.type = parseInt(obj.type, 10);
            if (typeof obj.body !== 'undefined') heater.body = parseInt(obj.body, 10);
            if (typeof obj.coolingEnabled !== 'undefined') heater.coolingEnabled = utils.makeBool(obj.coolingEnabled);
            if (typeof obj.cooldownDelay !== 'undefined') heater.cooldownDelay = parseInt(obj.cooldownDelay, 10);
            heater.isActive = true;
            sys.board.heaters.updateHeaterServices();
            let sheater = state.heaters.getItemById(id, true);
            sheater.name = heater.name;
            sheater.emitEquipmentChange();
            return heater;
        }
        catch (err) { return Promise.reject(err); }
    }
    public async deleteHeaterAsync(obj): Promise<Heater> {
        let id = parseInt(obj.id, 10);
        if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Heater Id is not valid.', obj.id, 'Heater'));
        let heater = sys.heaters.getItemById(id);
        try {
            const objnam = 'H' + String(id).padStart(4, '0');
            await icws.deleteObject(objnam);
            sys.heaters.removeItemById(id);
            state.heaters.removeItemById(id);
            sys.board.heaters.updateHeaterServices();
            return heater;
        }
        catch (err) { return Promise.reject(err); }
    }
}
