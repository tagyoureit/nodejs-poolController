import { InvalidEquipmentDataError, InvalidEquipmentIdError, InvalidOperationError } from '../../Errors';
import { utils, Timestamp } from '../../Constants';
import { logger } from '../../../logger/Logger';

import { NixieEquipment, NixieChildEquipment, NixieEquipmentCollection, INixieControlPanel } from "../NixieEquipment";
import { Chlorinator, sys, ChlorinatorCollection } from "../../../controller/Equipment";
import { ChlorinatorState, state,  } from "../../State";
import { setTimeout, clearTimeout } from 'timers';
import { webApp, InterfaceServerResponse } from "../../../web/Server";
import { Outbound, Protocol, Response } from '../../comms/messages/Messages';
import { conn } from '../../comms/Comms';

export class NixieChlorinatorCollection extends NixieEquipmentCollection<NixieChlorinator> {
    public async deleteChlorinatorAsync(id: number) {
        try {
            // Since we don't have hash tables per se in TS go through all the entries and remove every one that
            // matches the id.  This will ensure cleanup of a dirty array.
            for (let i = this.length - 1; i >= 0; i--) {
                let c = this[i];
                if (c.id === id) {
                    await c.closeAsync();
                    this.splice(i, 1);
                }
            }
        } catch (err) { logger.error(`NCP: Error removing chlorinator`); }

    }
    public async setChlorinatorAsync(chlor: Chlorinator, data: any) {
        // By the time we get here we know that we are in control and this is a REMChem.
        try {
            let c: NixieChlorinator = this.find(elem => elem.id === chlor.id) as NixieChlorinator;
            if (typeof c === 'undefined') {
                chlor.master = 1;
                c = new NixieChlorinator(this.controlPanel, chlor);
                this.push(c);
                await c.setChlorinatorAsync(data);
                logger.info(`A Chlorinator was not found for id #${chlor.id} starting Nixie Chlorinator`);
                await c.initAsync();
            }
            else {
                await c.setChlorinatorAsync(data);
            }
        }
        catch (err) { logger.error(`setChlorinatorAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async initAsync(chlorinators: ChlorinatorCollection) {
        try {
            for (let i = 0; i < chlorinators.length; i++) {
                let cc = chlorinators.getItemByIndex(i);
                if (cc.master === 1) {
                    if (typeof this.find(elem => elem.id === cc.id) === 'undefined') {
                        logger.info(`Initializing Nixie chlorinator ${cc.name}`);
                        let ncc = new NixieChlorinator(this.controlPanel, cc);
                        this.push(ncc);
                        await ncc.initAsync();
                    }
                }
            }
        }
        catch (err) { logger.error(`initAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            for (let i = this.length - 1; i >= 0; i--) {
                try {
                    await this[i].closeAsync();
                    this.splice(i, 1);
                } catch (err) { logger.error(`Error stopping Nixie Chlorinator ${err}`); }
            }
        } catch (err) { } // Don't bail if we have an error
    }
}
export class NixieChlorinator extends NixieEquipment {
    public pollingInterval: number = 3000;
    private _pollTimer: NodeJS.Timeout = null;
    private superChlorinating: boolean = false;
    private superChlorStart: number = 0;
    private chlorinating: boolean = false;
    public chlor: Chlorinator;
    public bodyOnTime: number;
    protected _suspendPolling: number = 0;
    public closing = false;
    constructor(ncp: INixieControlPanel, chlor: Chlorinator) {
        super(ncp);
        this.chlor = chlor;
    }
    public get id(): number { return typeof this.chlor !== 'undefined' ? this.chlor.id : -1; }
    public get suspendPolling(): boolean { return this._suspendPolling > 0; }
    public set suspendPolling(val: boolean) { this._suspendPolling = Math.max(0, this._suspendPolling + (val ? 1 : -1));  }
    public async setChlorinatorAsync(data: any) {
        try {
            let chlor = this.chlor;
            if (chlor.type === sys.board.valueMaps.chlorinatorType.getValue('intellichlor')) {

            }
            let poolSetpoint = typeof data.poolSetpoint !== 'undefined' ? parseInt(data.poolSetpoint, 10) : chlor.poolSetpoint;
            let spaSetpoint = typeof data.spaSetpoint !== 'undefined' ? parseInt(data.spaSetpoint, 10) : chlor.spaSetpoint;
            let body = sys.board.bodies.mapBodyAssociation(typeof data.body === 'undefined' ? chlor.body : data.body);
            let superChlor = typeof data.superChlor !== 'undefined' ? utils.makeBool(data.superChlor) : chlor.superChlor;
            let chlorType = typeof data.type !== 'undefined' ? sys.board.valueMaps.chlorinatorType.encode(data.type) : chlor.type;
            let superChlorHours = typeof data.superChlorHours !== 'undefined' ? parseInt(data.superChlorHours, 10) : chlor.superChlorHours;
            let model = typeof data.model !== 'undefined' ? data.model : chlor.model;
            if (typeof body === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Invalid body assignment`, 'chlorinator', data.body || chlor.body));
            if (isNaN(poolSetpoint)) poolSetpoint = 0;
            if (isNaN(spaSetpoint)) spaSetpoint = 0;
            if (isNaN(chlorType)) chlorType = sys.board.valueMaps.chlorinatorType.getValue('intellichlor');
            chlor.ignoreSaltReading = (typeof data.ignoreSaltReading !== 'undefined') ? utils.makeBool(data.ignoreSaltReading) : utils.makeBool(chlor.ignoreSaltReading);
            // Do a final validation pass so we dont send this off in a mess.
            let schlor = state.chlorinators.getItemById(chlor.id, true);
            schlor.poolSetpoint = chlor.poolSetpoint = poolSetpoint;
            schlor.spaSetpoint = chlor.spaSetpoint = spaSetpoint;
            schlor.superChlor = chlor.superChlor = superChlor;
            schlor.superChlorHours = chlor.superChlorHours = superChlorHours;
            schlor.type = chlor.type = chlorType;
            chlor.body = body;
            chlor.model = model;
            schlor.body = chlor.body;
            schlor.name = chlor.name = data.name || chlor.name || `Chlorinator ${chlor.id}`;
            schlor.isActive = chlor.isActive = true;
        }
        catch (err) { logger.error(`setChlorinatorAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            this.closing = true; // This will tell the polling cycle to stop what it is doing and don't restart.
            if (this._pollTimer) {
                clearTimeout(this._pollTimer);
                this._pollTimer = undefined;
            }
            // Let the Nixie equipment do its thing if it needs to.
            await super.closeAsync();
        }
        catch (err) { logger.error(`Chlorinator closeAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async initAsync() {
        try {
            // Start our polling but only after we clean up any other polling going on.
            if (this._pollTimer) {
                clearTimeout(this._pollTimer);
                this._pollTimer = undefined;
            }
            this.closing = false;
            this._suspendPolling = 0;
            // During startup it won't be uncommon for the comms to be out.  This will be because the body will be off so don't stress it so much.
            this.pollEquipment();
        } catch (err) { logger.error(`Error initializing ${this.chlor.name} : ${err.message}`); }
    }
    public isBodyOn() {
        let isOn = sys.board.bodies.isBodyOn(this.chlor.body);
        return isOn;
    }
    public async pollEquipment() {
        let self = this;
        try {
            if (this._pollTimer) {
                clearTimeout(this._pollTimer);
                this._pollTimer = undefined;
            }
            if (!this.suspendPolling) {
                logger.debug(`Begin sending chlorinator messages ${this.chlor.name}`);
                try {
                    this.suspendPolling = true;
                    if (!this.closing) await this.takeControl();
                    if (!this.closing) await utils.sleep(300);
                    if (!this.closing) await this.setOutput();
                    if (!this.closing) await utils.sleep(300);
                    if (!this.closing) await this.getModel();
                } catch (err) {
                    // We only display an error here if the body is on.  The chlorinator should be powered down when it is not.
                    if (this.isBodyOn()) logger.error(`Chlorinator ${this.chlor.name} comms failure: ${err.message}`);
                }
                finally { this.suspendPolling = false; }
            }
        } catch (err) {
            // Comms failure will be handeled by the message processor.
            logger.error(`Chlorinator ${this.chlor.name} comms failure: ${err.message}`);
        }
        finally { if(!this.closing) this._pollTimer = setTimeout(async () => { await self.pollEquipment(); }, this.pollingInterval); }
    }
    public async takeControl(): Promise<boolean> {
        try {
            let cstate = state.chlorinators.getItemById(this.chlor.id, true);
            // The sequence is as follows.
            // 0 = Disabled control panel by taking control of it.
            // 17 = Set the current setpoint
            // 20 = Request the status
            // Disable the control panel by sending an action 0 the chlorinator should respond with an action 1.
            //[16, 2, 80, 0][0][98, 16, 3]
            let success = await new Promise<boolean>((resolve, reject) => {
                let out = Outbound.create({
                    protocol: Protocol.Chlorinator,
                    dest: this.chlor.id,
                    action: 0,
                    payload: [0],
                    retries: 3, // IntelliCenter tries 4 times to get a response.
                    response: Response.create({ protocol: Protocol.Chlorinator, action: 1 }),
                    onAbort: () => {},
                    onComplete: (err) => {
                        if (err) {
                            // This flag is cleared in ChlorinatorStateMessage
                            cstate.status = 128;
                            resolve(false);
                        }
                        else {
                            // If this is successful the action 1 message will have been
                            // digested by ChlorinatorStateMessage and the lastComm will have been set clearing the
                            // communication lost flag.
                            resolve(true);
                        }
                    }
                });
                conn.queueSendMessage(out);
            });
            return success;
        } catch (err) { logger.error(`Communication error with Chlorinator ${this.chlor.name} : ${err.message}`); }
    }
    public async setOutput() {
        try {
            // A couple of things need to be in place before setting the output.
            // 1. The chlorinator will have to have responded to the takeControl message.
            // 2. If the body is not on then we need to send it a 0 output.  This is just in case the
            //    chlorinator is not wired into the filter relay.  The current output should be 0 if no body is on.
            // 3. If we are superchlorinating and the remaing superChlor time is > 0 then we need to keep it at 100%.
            // 4. If the chlorinator disabled flag is set then we need to make sure the setpoint is 0.
            let cstate = state.chlorinators.getItemById(this.chlor.id, true);
            let body = state.temps.bodies.getBodyIsOn();
            let setpoint = 0;
            if (typeof body !== 'undefined') {
                setpoint = (body.id === 1) ? this.chlor.poolSetpoint : this.chlor.spaSetpoint;
                if (this.chlor.superChlor === true) setpoint = 100;
                if (this.chlor.disabled === true) setpoint = 0; // Our target should be 0 because we have other things going on.  For instance,
                // we may be dosing acid which will cause the disabled flag to be true.
            }
            // RKS: Not sure if it needs to be smart enough to force an off message when the comms die.
            //if (cstate.status === 128) setpoint = 0; // If we haven't been able to get a response from the clorinator tell is to turn itself off.
            // Perhaps we will be luckier on the next poll cycle.
            // Tell the chlorinator that we are to use the current output.
            //[16, 2, 80, 17][0][115, 16, 3]
            cstate.targetOutput = setpoint;
            let success = await new Promise<boolean>((resolve, reject) => {
                let out = Outbound.create({
                    protocol: Protocol.Chlorinator,
                    dest: this.chlor.id,
                    action: 17,
                    payload: [setpoint],
                    retries: 7, // IntelliCenter tries 8 times to make this happen.
                    response: Response.create({ protocol: Protocol.Chlorinator, action: 18 }),
                    onAbort: () => {},
                    onComplete: (err) => {
                        if (err) {
                            this.chlorinating = false;
                            cstate.currentOutput = 0;
                            cstate.status = 128;
                            resolve(false);
                        }
                        else {
                            // The action:17 message originated from us so we will not see it in the
                            // ChlorinatorStateMessage module.
                            cstate.currentOutput = setpoint;
                            this.chlorinating = true;
                            if (!this.superChlorinating && cstate.superChlor) {
                                cstate.superChlorRemaining = cstate.superChlorHours * 3600;
                                this.superChlorStart = Math.floor(new Date().getTime() / 1000) * 1000;
                            }
                            else if (cstate.superChlor) {
                                cstate.superChlorRemaining = cstate.superChlorHours * 3600 - ((Math.floor(new Date().getTime() / 1000) * 1000) - this.superChlorStart);
                            }
                            else if (!cstate.superChlor)
                                cstate.superChlorRemaining = 0;
                            resolve(true);
                        }
                    }
                });
                conn.queueSendMessage(out);
            });

        } catch (err) { logger.error(`Communication error with Chlorinator ${this.chlor.name} : ${err.message}`); return Promise.reject(err);}

    }
    public async getModel() {
        try {
            // We only need to ask for this if we can communicate with the chlorinator.  IntelliCenter
            // asks for this anyway but it really is gratuitous.  If the setOutput and takeControl fail
            // then this will too.
            let cstate = state.chlorinators.getItemById(this.chlor.id, true);
            if (cstate.status !== 128) {
                // Ask the chlorinator for its model.
                //[16, 2, 80, 20][0][118, 16, 3]
                let success = await new Promise<boolean>((resolve, reject) => {
                    let out = Outbound.create({
                        protocol: Protocol.Chlorinator,
                        dest: this.chlor.id,
                        action: 20,
                        payload: [0],
                        retries: 3, // IntelliCenter tries 4 times to get a response.
                        response: Response.create({ protocol: Protocol.Chlorinator, action: 3 }),
                        onAbort: () => { },
                        onComplete: (err) => {
                            if (err) resolve(false);
                            else resolve(true);
                        }
                    });
                    conn.queueSendMessage(out);
                });
            }
        } catch (err) { logger.error(`Communication error with Chlorinator ${this.chlor.name} : ${err.message}`); return Promise.reject(err);}

    }

}
