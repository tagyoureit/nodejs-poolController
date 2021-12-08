import { EquipmentNotFoundError, InvalidEquipmentDataError, InvalidEquipmentIdError, ParameterOutOfRangeError } from '../../Errors';
import { utils, Timestamp } from '../../Constants';
import { logger } from '../../../logger/Logger';

import { NixieEquipment, NixieChildEquipment, NixieEquipmentCollection, INixieControlPanel } from "../NixieEquipment";
import { Valve, ValveCollection, sys } from "../../../controller/Equipment";
import { ValveState, state, } from "../../State";
import { setTimeout, clearTimeout } from 'timers';
import { NixieControlPanel } from '../Nixie';
import { webApp, InterfaceServerResponse } from "../../../web/Server";

export class NixieValveCollection extends NixieEquipmentCollection<NixieValve> {
    public async deleteValveAsync(id: number) {
        try {
            for (let i = this.length - 1; i >= 0; i--) {
                let valve = this[i];
                if (valve.id === id) {
                    await valve.closeAsync();
                    this.splice(i, 1);
                }
            }
        } catch (err) { return Promise.reject(`Nixie Control Panel deleteValveAsync ${err.message}`); }
    }
    public async setValveStateAsync(vstate: ValveState, isDiverted: boolean) {
        try {
            let valve: NixieValve = this.find(elem => elem.id === vstate.id) as NixieValve;
            if (typeof valve === 'undefined') {
                vstate.isDiverted = isDiverted;
                return logger.error(`Nixie Control Panel Error setValveState could not find valve ${vstate.id}-${vstate.name}`);
            }
            await valve.setValveStateAsync(vstate, isDiverted);
        } catch (err) { return Promise.reject(new Error(`Nixie Error setting valve state ${vstate.id}-${vstate.name}: ${err.message}`)); }
    }
    public async setValveAsync(valve: Valve, data: any) {
        // By the time we get here we know that we are in control and this is a Nixie valve.
        try {
            let c: NixieValve = this.find(elem => elem.id === valve.id) as NixieValve;
            if (typeof c === 'undefined') {
                valve.master = 1;
                c = new NixieValve(this.controlPanel, valve);
                this.push(c);
                await c.setValveAsync(data);
                logger.info(`A valve was not found for id #${valve.id} creating valve`);
            }
            else {
                await c.setValveAsync(data);
            }
        }
        catch (err) { logger.error(`setValveAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async initAsync(valves: ValveCollection) {
        try {
            for (let i = 0; i < valves.length; i++) {
                let valve = valves.getItemByIndex(i);
                if (valve.master === 1) {
                    if (typeof this.find(elem => elem.id === valve.id) === 'undefined') {
                        let nvalve = new NixieValve(this.controlPanel, valve);
                        logger.info(`Initializing Nixie Valve ${nvalve.id}-${valve.name}`);
                        this.push(nvalve);
                    }
                }
            }
        }
        catch (err) { logger.error(`Nixie Valve initAsync Error: ${err.message}`); return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            for (let i = this.length - 1; i >= 0; i--) {
                try {
                    await this[i].closeAsync();
                    this.splice(i, 1);
                } catch (err) { logger.error(`Error stopping Nixie Valve ${err}`); }
            }

        } catch (err) { } // Don't bail if we have an errror.
    }

    public async initValveAsync(valve: Valve): Promise<NixieValve> {
        try {
            let c: NixieValve = this.find(elem => elem.id === valve.id) as NixieValve;
            if (typeof c === 'undefined') {
                c = new NixieValve(this.controlPanel, valve);
                this.push(c);
            }
            return c;
        } catch (err) { return Promise.reject(logger.error(`Nixie Controller: initValveAsync Error: ${err.message}`)); }
    }

}
export class NixieValve extends NixieEquipment {
    public pollingInterval: number = 10000;
    private _pollTimer: NodeJS.Timeout = null;
    public valve: Valve;
    private _lastState;
    constructor(ncp: INixieControlPanel, valve: Valve) {
        super(ncp);
        this.valve = valve;
        this.pollEquipmentAsync();
    }
    public get id(): number { return typeof this.valve !== 'undefined' ? this.valve.id : -1; }
    public async setValveStateAsync(vstate: ValveState, isDiverted: boolean) {
        try {
            // Here we go we need to set the valve state.
            if (vstate.isDiverted !== isDiverted) {
                logger.verbose(`Nixie: Set valve ${vstate.id}-${vstate.name} to ${isDiverted}`);
            }
            if (utils.isNullOrEmpty(this.valve.connectionId) || utils.isNullOrEmpty(this.valve.deviceBinding)) {
                vstate.isDiverted = isDiverted;
                return new InterfaceServerResponse(200, 'Success');
            }
            if (typeof this._lastState === 'undefined' || isDiverted || this._lastState !== isDiverted) {
                let res = await NixieEquipment.putDeviceService(this.valve.connectionId, `/state/device/${this.valve.deviceBinding}`, { isOn: isDiverted, latch: isDiverted ? 10000 : undefined });
                if (res.status.code === 200) this._lastState = vstate.isDiverted = isDiverted;
                return res;
            }
            else {
                vstate.isDiverted = isDiverted;
                return new InterfaceServerResponse(200, 'Success');
            }
        } catch (err) { return logger.error(`Nixie Error setting valve state ${vstate.id}-${vstate.name}: ${err.message}`); }
    }
    public async setValveAsync(data: any) {
        try {
            let valve = this.valve;
        }
        catch (err) { logger.error(`Nixie setValveAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async pollEquipmentAsync() {
        let self = this;
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let success = false;
        }
        catch (err) { logger.error(`Nixie Error polling valve - ${err}`); }
        finally { this._pollTimer = setTimeout(async () => await self.pollEquipmentAsync(), this.pollingInterval || 10000); }
    }
    private async checkHardwareStatusAsync(connectionId: string, deviceBinding: string) {
        try {
            let dev = await NixieEquipment.getDeviceService(connectionId, `/status/device/${deviceBinding}`);
            return dev;
        } catch (err) { logger.error(`Nixie Valve checkHardwareStatusAsync: ${err.message}`); return { hasFault: true } }
    }
    public async validateSetupAsync(valve: Valve, vstate: ValveState) {
        try {
            if (typeof valve.connectionId !== 'undefined' && valve.connectionId !== ''
                && typeof valve.deviceBinding !== 'undefined' && valve.deviceBinding !== '') {
                try {
                    let stat = await this.checkHardwareStatusAsync(valve.connectionId, valve.deviceBinding);
                    // If we have a status check the return.
                    vstate.commStatus = stat.hasFault ? 1 : 0;
                } catch (err) { vstate.commStatus = 1; }
            }
            else
                vstate.commStatus = 0;
            // The validation will be different if the valve is on or not.  So lets get that information.
        } catch (err) { logger.error(`Nixie Error checking Valve Hardware ${this.valve.name}: ${err.message}`); vstate.commStatus = 1; return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let vstate = state.valves.getItemById(this.valve.id);
            this.setValveStateAsync(vstate, false);
            vstate.emitEquipmentChange();
        }
        catch (err) { logger.error(`Nixie Valve closeAsync: ${err.message}`); return Promise.reject(err); }
    }
    public logData(filename: string, data: any) { this.controlPanel.logData(filename, data); }
}
