import { EquipmentNotFoundError, InvalidEquipmentDataError, InvalidEquipmentIdError, ParameterOutOfRangeError } from '../../Errors';
import { utils, Timestamp } from '../../Constants';
import { logger } from '../../../logger/Logger';

import { NixieEquipment, NixieChildEquipment, NixieEquipmentCollection, INixieControlPanel } from "../NixieEquipment";
import { Filter, FilterCollection, sys } from "../../../controller/Equipment";
import { FilterState, state, } from "../../State";
import { setTimeout, clearTimeout } from 'timers';
import { NixieControlPanel } from '../Nixie';
import { webApp, InterfaceServerResponse } from "../../../web/Server";

export class NixieFilterCollection extends NixieEquipmentCollection<NixieFilter> {
    public async setFilterStateAsync(fstate: FilterState, val: boolean) {
        try {
            let f: NixieFilter = this.find(elem => elem.id === fstate.id) as NixieFilter;
            if (typeof f === 'undefined') return Promise.reject(new Error(`NCP: Filter ${fstate.id}-${fstate.name} could not be found to set the state to ${val}.`));
            await f.setFilterStateAsync(fstate, val);
        }
        catch (err) { return logger.error(`NCP: setCircuitFilterAsync ${fstate.id}-${fstate.name}: ${err.message}`); }
    }

    public async setFilterAsync(filter: Filter, data: any) {
        // By the time we get here we know that we are in control and this is a REMChem.
        try {
            let c: NixieFilter = this.find(elem => elem.id === filter.id) as NixieFilter;
            if (typeof c === 'undefined') {
                filter.master = 1;
                c = new NixieFilter(this.controlPanel, filter);
                this.push(c);
                await c.setFilterAsync(data);
                logger.info(`A Filter was not found for id #${filter.id} creating Filter`);
            }
            else {
                await c.setFilterAsync(data);
            }
        }
        catch (err) { logger.error(`setFilterAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async initAsync(filters: FilterCollection) {
        try {
            this.length = 0;
            for (let i = 0; i < filters.length; i++) {
                let filter = filters.getItemByIndex(i);
                if (filter.master === 1) {
                    logger.info(`Initializing Filter ${Filter.name}`);
                    let nFilter = new NixieFilter(this.controlPanel, filter);
                    this.push(nFilter);
                }
            }
        }
        catch (err) { logger.error(`Nixie Filter initAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            for (let i = this.length - 1; i >= 0; i--) {
                try {
                    await this[i].closeAsync();
                    this.splice(i, 1);
                } catch (err) { logger.error(`Error stopping Nixie Filter ${err}`); }
            }

        } catch (err) { } // Don't bail if we have an errror.
    }
}
export class NixieFilter extends NixieEquipment {
    public pollingInterval: number = 10000;
    private _pollTimer: NodeJS.Timeout = null;
    private _lastState;
    public filter: Filter;
    constructor(ncp: INixieControlPanel, filter: Filter) {
        super(ncp);
        this.filter = filter;
        this.pollEquipmentAsync();
    }
    public get id(): number { return typeof this.filter !== 'undefined' ? this.filter.id : -1; }
    public async setFilterAsync(data: any) {
        try {
            let filter = this.filter;
        }
        catch (err) { logger.error(`Nixie setFilterAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async setFilterStateAsync(fstate: FilterState, val: boolean): Promise<InterfaceServerResponse> {
        try {
            if (utils.isNullOrEmpty(this.filter.connectionId) || utils.isNullOrEmpty(this.filter.deviceBinding)) {
                fstate.isOn = val;
                return new InterfaceServerResponse(200, 'Success');
            }
            if (typeof this._lastState === 'undefined' || val || this._lastState !== val) {
                let res = await NixieEquipment.putDeviceService(this.filter.connectionId, `/state/device/${this.filter.deviceBinding}`, { isOn: val, latch: val ? 10000 : undefined });
                if (res.status.code === 200) this._lastState = fstate.isOn = val;
                return res;
            }
            else {
                fstate.isOn = val;
                return new InterfaceServerResponse(200, 'Success');
            }
        } catch (err) { logger.error(`Nixie: Error setting filter state ${fstate.id}-${fstate.name} to ${val}`); }
    }

    public async pollEquipmentAsync() {
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let success = false;
        }
        catch (err) { logger.error(`Nixie Error polling Filter - ${err}`); }
        finally { this._pollTimer = setTimeout(async () => await this.pollEquipmentAsync(), this.pollingInterval || 10000); }
    }
    private async checkHardwareStatusAsync(connectionId: string, deviceBinding: string) {
        try {
            let dev = await NixieEquipment.getDeviceService(connectionId, `/status/device/${deviceBinding}`);
            return dev;
        } catch (err) { logger.error(`Nixie Filter checkHardwareStatusAsync: ${err.message}`); return { hasFault: true } }
    }
    public async validateSetupAsync(Filter: Filter, temp: FilterState) {
        try {
            // The validation will be different if the Filter is on or not.  So lets get that information.
        } catch (err) { logger.error(`Nixie Error checking Filter Hardware ${this.filter.name}: ${err.message}`); return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let fstate = state.filters.getItemById(this.filter.id);
            logger.info(`Closing filter ${fstate.name}`)
            await this.setFilterStateAsync(fstate, false);
        }
        catch (err) { logger.error(`Nixie Filter closeAsync: ${err.message}`); return Promise.reject(err); }
    }
    public logData(filename: string, data: any) { this.controlPanel.logData(filename, data); }
}
