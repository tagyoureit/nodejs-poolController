import { EquipmentNotFoundError, InvalidEquipmentDataError, InvalidEquipmentIdError, ParameterOutOfRangeError } from '../../Errors';
import { utils, Timestamp } from '../../Constants';
import { logger } from '../../../logger/Logger';

import { NixieEquipment, NixieChildEquipment, NixieEquipmentCollection, INixieControlPanel } from "../NixieEquipment";
import { Body, BodyCollection, sys } from "../../../controller/Equipment";
import { BodyTempState, state, } from "../../State";
import { setTimeout, clearTimeout } from 'timers';
import { NixieControlPanel } from '../Nixie';
import { webApp, InterfaceServerResponse } from "../../../web/Server";

export class NixieBodyCollection extends NixieEquipmentCollection<NixieBody> {
    public async setBodyAsync(body: Body, data: any) {
        // By the time we get here we know that we are in control and this is a REMChem.
        try {
            let c: NixieBody = this.find(elem => elem.id === body.id) as NixieBody;
            if (typeof c === 'undefined') {
                body.master = 1;
                c = new NixieBody(this.controlPanel, body);
                this.push(c);
                await c.setBodyAsync(data);
                logger.info(`A body was not found for id #${body.id} creating body`);
            }
            else {
                await c.setBodyAsync(data);
            }
        }
        catch (err) { logger.error(`setBodyAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async initAsync(bodies: BodyCollection) {
        try {
            this.length = 0;
            for (let i = 0; i < bodies.length; i++) {
                let body = bodies.getItemByIndex(i);
                if (body.master === 1) {
                    if (typeof this.find(elem => elem.id === body.id) === 'undefined') {
                        logger.info(`Initializing Nixie body ${body.name}`);
                        let nbody = new NixieBody(this.controlPanel, body);
                        this.push(nbody);
                    }
                }
            }
        }
        catch (err) { logger.error(`Nixie Body initAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            for (let i = this.length - 1; i >= 0; i--) {
                try {
                    await this[i].closeAsync();
                    this.splice(i, 1);
                } catch (err) { logger.error(`Error stopping Nixie Body ${err}`); }
            }

        } catch (err) { } // Don't bail if we have an errror.
    }

}
export class NixieBody extends NixieEquipment {
    public pollingInterval: number = 10000;
    private _pollTimer: NodeJS.Timeout = null;
    public body: Body;
    constructor(ncp: INixieControlPanel, body: Body) {
        super(ncp);
        this.body = body;
        this.pollEquipmentAsync();
        let bs = state.temps.bodies.getItemById(body.id);
        bs.heaterCooldownDelay = false;
        bs.heatStatus = 0;
    }
    public get id(): number { return typeof this.body !== 'undefined' ? this.body.id : -1; }
    public async setBodyAsync(data: any) {
        try {
            let body = this.body;
        }
        catch (err) { logger.error(`Nixie setBodyAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async setBodyStateAsync(bstate: BodyTempState, isOn: boolean) {
        try {
            // Here we go we need to set the valve state.
            if (bstate.isOn !== isOn) {
                logger.info(`Nixie: Set Body ${bstate.id}-${bstate.name} to ${isOn}`); 
            }
            bstate.isOn = isOn;
        } catch (err) { logger.error(`Nixie Error setting body state ${bstate.id}-${bstate.name}: ${err.message}`); }
    }

    public async pollEquipmentAsync() {
        let self = this;
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let success = false;
        }
        catch (err) { logger.error(`Nixie Error polling body - ${err}`); }
        finally { this._pollTimer = setTimeout(async () => await self.pollEquipmentAsync(), this.pollingInterval || 10000); }
    }
    private async checkHardwareStatusAsync(connectionId: string, deviceBinding: string) {
        try {
            let dev = await NixieEquipment.getDeviceService(connectionId, `/status/device/${deviceBinding}`);
            return dev;
        } catch (err) { logger.error(`Nixie Body checkHardwareStatusAsync: ${err.message}`); return { hasFault: true } }
    }
    public async validateSetupAsync(body: Body, temp: BodyTempState) {
        try {
            // The validation will be different if the body is on or not.  So lets get that information.
        } catch (err) { logger.error(`Nixie Error checking Body Hardware ${this.body.name}: ${err.message}`); return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let bstate = state.temps.bodies.getItemById(this.body.id);
            await this.setBodyStateAsync(bstate, false);
            bstate.emitEquipmentChange();
        }
        catch (err) { logger.error(`Nixie Body closeAsync: ${err.message}`); return Promise.reject(err); }
    }
    public logData(filename: string, data: any) { this.controlPanel.logData(filename, data); }
}
