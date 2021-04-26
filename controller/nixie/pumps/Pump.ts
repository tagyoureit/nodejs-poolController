import { EquipmentNotFoundError, InvalidEquipmentDataError, InvalidEquipmentIdError, ParameterOutOfRangeError } from '../../Errors';
import { utils, Timestamp } from '../../Constants';
import { logger } from '../../../logger/Logger';

import { NixieEquipment, NixieChildEquipment, NixieEquipmentCollection, INixieControlPanel } from "../NixieEquipment";
import { Pump, PumpCollection, sys } from "../../../controller/Equipment";
import { PumpState, state, } from "../../State";
import { setTimeout, clearTimeout } from 'timers';
import { NixieControlPanel } from '../Nixie';
import { webApp, InterfaceServerResponse } from "../../../web/Server";

export class NixiePumpCollection extends NixieEquipmentCollection<NixiePump> {
    public async deletePumpAsync(id: number) {
        try {
            for (let i = this.length - 1; i >= 0; i--) {
                let pump = this[i];
                if (pump.id === id) {
                    await pump.closeAsync();
                    this.splice(i, 1);
                }
            }
        } catch (err) { return Promise.reject(`Nixie Control Panel deletePumpAsync ${err.message}`); }
    }
    public async setPumpStateAsync(pstate: PumpState, isDiverted: boolean) {
        try {
            let pump: NixiePump = this.find(elem => elem.id === pstate.id) as NixiePump;
            if (typeof pump === 'undefined') {
                return logger.reject(`Nixie Control Panel Error setPumpState could not find pump ${pstate.id}-${pstate.name}`);
            }
            await pump.setPumpStateAsync(pstate, isDiverted);
        } catch (err) { return Promise.reject(new Error(`Nixie Error setting pump state ${pstate.id}-${pstate.name}: ${err.message}`)); }
    }
    public async setPumpAsync(pump: Pump, data: any) {
        // By the time we get here we know that we are in control and this is a Nixie pump.
        try {
            let c: NixiePump = this.find(elem => elem.id === pump.id) as NixiePump;
            if (typeof c === 'undefined') {
                pump.master = 1;
                c = new NixiePump(this.controlPanel, pump);
                this.push(c);
                await c.setPumpAsync(data);
                logger.info(`A pump was not found for id #${pump.id} creating pump`);
            }
            else {
                await c.setPumpAsync(data);
            }
        }
        catch (err) { logger.error(`setPumpAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async initAsync(pumps: PumpCollection) {
        try {
            this.length = 0;
            for (let i = 0; i < pumps.length; i++) {
                let pump = pumps.getItemByIndex(i);
                if (pump.master === 1) {
                    let npump = new NixiePump(this.controlPanel, pump);
                    logger.info(`Initializing Nixie Pump ${npump.id}-${pump.name}`);
                    this.push(npump);
                }
            }
        }
        catch (err) { logger.error(`Nixie Pump initAsync Error: ${err.message}`); return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            for (let i = this.length - 1; i >= 0; i--) {
                try {
                    await this[i].closeAsync();
                    this.splice(i, 1);
                } catch (err) { logger.error(`Error stopping Nixie Pump ${err}`); }
            }

        } catch (err) { } // Don't bail if we have an errror.
    }

    public async initPumpAsync(pump: Pump): Promise<NixiePump> {
        try {
            let c: NixiePump = this.find(elem => elem.id === pump.id) as NixiePump;
            if (typeof c === 'undefined') {
                c = new NixiePump(this.controlPanel, pump);
                this.push(c);
            }
            return c;
        } catch (err) { return Promise.reject(logger.error(`Nixie Controller: initPumpAsync Error: ${err.message}`)); }
    }

}
export class NixiePump extends NixieEquipment {
    public pollingInterval: number = 10000;
    private _pollTimer: NodeJS.Timeout = null;
    public pump: Pump;
    private _lastState;
    constructor(ncp: INixieControlPanel, pump: Pump) {
        super(ncp);
        this.pump = pump;
        this.pollEquipmentAsync();
    }
    public get id(): number { return typeof this.pump !== 'undefined' ? this.pump.id : -1; }
    public async setPumpStateAsync(pstate: PumpState, isDiverted: boolean) {
        try {
            // Here we go we need to set the pump state.
        } catch (err) { return logger.reject(`Nixie Error setting pump state ${pstate.id}-${pstate.name}: ${err.message}`); }
    }
    public async setPumpAsync(data: any) {
        try {
            let pump = this.pump;
        }
        catch (err) { logger.error(`Nixie setPumpAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async pollEquipmentAsync() {
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let success = false;
        }
        catch (err) { logger.error(`Nixie Error polling pump - ${err}`); }
        finally { this._pollTimer = setTimeout(async () => await this.pollEquipmentAsync(), this.pollingInterval || 10000); }
    }
    private async checkHardwareStatusAsync(connectionId: string, deviceBinding: string) {
        try {
            let dev = await NixieEquipment.getDeviceService(connectionId, `/status/device/${deviceBinding}`);
            return dev;
        } catch (err) { logger.error(`Nixie Pump checkHardwareStatusAsync: ${err.message}`); return { hasFault: true } }
    }
    public async validateSetupAsync(pump: Pump, pstate: PumpState) {
        try {
        } catch (err) { logger.error(`Nixie Error checking Pump Hardware ${this.pump.name}: ${err.message}`); return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let pstate = state.pumps.getItemById(this.pump.id);
            this.setPumpStateAsync(pstate, false);
        }
        catch (err) { logger.error(`Nixie Pump closeAsync: ${err.message}`); return Promise.reject(err); }
    }
    public logData(filename: string, data: any) { this.controlPanel.logData(filename, data); }
}
