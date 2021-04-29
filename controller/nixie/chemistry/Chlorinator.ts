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
    public async setChlorinatorAsync(chlor: Chlorinator, data: any) {
        // By the time we get here we know that we are in control and this is a REMChem.
        try {
            let c: NixieChlorinator = this.find(elem => elem.id === chlor.id) as NixieChlorinator;
            if (typeof c === 'undefined') {
                chlor.master = 1;
                c = new NixieChlorinator(this.controlPanel, chlor);
                this.push(c);
                await c.setChlorinatorAsync(data);
                logger.info(`A Chlorinator was not found for id #${chlor.id} starting REM Chem`);
            }
            else {
                await c.setChlorinatorAsync(data);
            }
        }
        catch (err) { logger.error(`setChlorinatorAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async initAsync(chlorinators: ChlorinatorCollection) {
        try {
            this.length = 0;
            for (let i = 0; i < chlorinators.length; i++) {
                let cc = chlorinators.getItemByIndex(i);
                if (cc.master === 1) {
                    logger.info(`Initializing chlorinator ${cc.name}`);
                    let ncc = new NixieChlorinator(this.controlPanel, cc);
                    this.push(ncc);
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
                } catch (err) { logger.error(`Error stopping Nixie Chem Controller ${err}`); }
            }

        } catch (err) { } // Don't bail if we have an error
    }
}
export class NixieChlorinator extends NixieEquipment {
    public pollingInterval: number = 10000;
    private _pollTimer: NodeJS.Timeout = null;
    private superChlorinating: boolean = false;
    private chlorinating: boolean = false;
    public chlor: Chlorinator;
    public bodyOnTime: number;
    constructor(ncp: INixieControlPanel, chlor: Chlorinator) {
        super(ncp);
        this.chlor = chlor;
    }
    public get id(): number { return typeof this.chlor !== 'undefined' ? this.chlor.id : -1; }
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
            if (typeof body === 'undefined') return Promise.reject(new InvalidEquipmentDataError(`Invalid body assignment`, 'chlorinator', data.body || chlor.body));
            if (isNaN(poolSetpoint)) poolSetpoint = 0;
            if (isNaN(spaSetpoint)) spaSetpoint = 0;
            if (isNaN(chlorType)) chlorType = sys.board.valueMaps.chlorinatorType.getValue('intellichlor');
            // Do a final validation pass so we dont send this off in a mess.
            let schlor = state.chlorinators.getItemById(chlor.id, true);
            schlor.poolSetpoint = chlor.poolSetpoint = poolSetpoint;
            schlor.spaSetpoint = chlor.spaSetpoint = spaSetpoint;
            schlor.superChlor = chlor.superChlor = superChlor;
            schlor.superChlorHours = chlor.superChlorHours = superChlorHours;
            schlor.type = chlor.type = chlorType;
            chlor.body = body;
            schlor.name = chlor.name = data.name || chlor.name || `Chlorinator ${chlor.id}`;
            schlor.isActive = chlor.isActive = true;
        }
        catch (err) { logger.error(`setChlorinatorAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
        }
        catch (err) { logger.error(`Chlorinator closeAsync: ${err.message}`); return Promise.reject(err); }
    }
    public isBodyOn() {
        let isOn = sys.board.bodies.isBodyOn(this.chlor.body);
        return isOn;
    }
    public async setOutput() {
        try {
            let cstate = state.chlorinators.getItemById(this.chlor.id, true);
            let body = state.temps.bodies.getBodyIsOn();
            let setpoint = 0;
            if (typeof body !== 'undefined') {
                setpoint = (body.id === 1) ? this.chlor.spaSetpoint : this.chlor.poolSetpoint;
                if (this.chlor.superChlor) setpoint = 100;
            }
            // Tell the chlorinator that we are to use the current output.             
            await new Promise<void>((resolve, reject) => {
                let out = Outbound.create({
                    protocol: Protocol.Chlorinator,
                    dest: this.chlor.id,
                    action: 17,
                    payload: [setpoint],
                    retries: 3,
                    response: Response.create({ protocol: Protocol.Chlorinator, action: 18 }),
                    onComplete: (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                });
                conn.queueSendMessage(out);
            });

        } catch (err) { logger.error(`Communication error with Chlorinator ${this.chlor.name} : ${err.message}`); }

    }
    public async takeControl() {
        try {
            let cstate = state.chlorinators.getItemById(this.chlor.id, true);
            // The sequence is as follows.
            // 0 = Disabled control panel
            // 17 = Set the current setpoint
            // 20 = Request the status
            // Disable the control panel by sending an action 0 the chlorinator should respond with an action 1.
            await new Promise<void>((resolve, reject) => {
                let out = Outbound.create({
                    protocol: Protocol.Chlorinator,
                    dest: this.chlor.id,
                    action: 0,
                    payload: [0],
                    retries: 3,
                    response: Response.create({ protocol: Protocol.Chlorinator, action: 1 }),
                    onComplete: (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                });
                conn.queueSendMessage(out);
            });
            let body = state.temps.bodies.getBodyIsOn();
            let setpoint = 0;
            if (typeof body !== 'undefined') {
                setpoint = (body.id === 1) ? this.chlor.spaSetpoint : this.chlor.poolSetpoint;
                if (this.chlor.superChlor) setpoint = 100;
            }
            // Send a             
            await new Promise<void>((resolve, reject) => {
                let out = Outbound.create({
                    protocol: Protocol.Chlorinator,
                    dest: this.chlor.id,
                    action: 0,
                    payload: [0],
                    retries: 3,
                    response: Response.create({ protocol: Protocol.Chlorinator, action: 1 }),
                    onComplete: (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                });
                conn.queueSendMessage(out);
            });

        } catch (err) { logger.error(`Communication error with Chlorinator ${this.chlor.name} : ${err.message}`); }
    }
}
