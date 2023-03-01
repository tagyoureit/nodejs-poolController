import { EquipmentNotFoundError, InvalidEquipmentDataError, InvalidEquipmentIdError, InvalidOperationError, ParameterOutOfRangeError } from '../../Errors';
import { utils, Timestamp } from '../../Constants';
import { logger } from '../../../logger/Logger';

import { NixieEquipment, NixieChildEquipment, NixieEquipmentCollection, INixieControlPanel } from "../NixieEquipment";
import { Body, Heater, HeaterCollection, sys } from "../../../controller/Equipment";
import { BodyTempState, HeaterState, state, } from "../../State";
import { setTimeout, clearTimeout } from 'timers';
import { NixieControlPanel } from '../Nixie';
import { webApp, InterfaceServerResponse } from "../../../web/Server";
import { conn } from '../../../controller/comms/Comms';
import { Inbound, Outbound, Protocol, Response } from '../../../controller/comms/messages/Messages';
import { delayMgr } from '../../Lockouts';

export class NixieHeaterCollection extends NixieEquipmentCollection<NixieHeaterBase> {
    public async deleteHeaterAsync(id: number) {
        try {
            for (let i = this.length - 1; i >= 0; i--) {
                let heater = this[i];
                if (heater.id === id) {
                    await heater.closeAsync();
                    this.splice(i, 1);
                }
            }
        } catch (err) { return Promise.reject(`Nixie Control Panel deleteHeaterAsync ${err.message}`); }
    }
    public async setHeaterStateAsync(hstate: HeaterState, val: boolean, isCooling: boolean) {
        try {
            let h: NixieHeaterBase = this.find(elem => elem.id === hstate.id) as NixieHeaterBase;
            if (typeof h === 'undefined') {
                return Promise.reject(new Error(`NCP: Heater ${hstate.id}-${hstate.name} could not be found to set the state to ${val}.`));
            }
            await h.setHeaterStateAsync(hstate, val, isCooling);
        }
        catch (err) { return logger.error(`NCP: setHeaterStateAsync ${hstate.id}-${hstate.name}: ${err.message}`); }
    }
    public async setHeaterAsync(heater: Heater, data: any) {
        // By the time we get here we know that we are in control and this is a Nixie heater.
        try {
            let h: NixieHeaterBase = this.find(elem => elem.id === heater.id) as NixieHeaterBase;
            if (typeof h === 'undefined') {
                heater.master = 1;
                h = NixieHeaterBase.create(this.controlPanel, heater);
                this.push(h);
                await h.setHeaterAsync(data);
                logger.info(`A Heater was not found for id #${heater.id} creating Heater`);
            }
            else {
                await h.setHeaterAsync(data);
            }
        }
        catch (err) { logger.error(`setHeaterAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async initAsync(heaters: HeaterCollection) {
        try {
            for (let i = 0; i < heaters.length; i++) {
                let heater = heaters.getItemByIndex(i);
                if (heater.master === 1) {
                    if (typeof this.find(elem => elem.id === heater.id) === 'undefined') {
                        logger.info(`Initializing Heater ${heater.name}`);
                        let nHeater = NixieHeaterBase.create(this.controlPanel, heater);
                        this.push(nHeater);
                    }
                }
            }
        }
        catch (err) { logger.error(`Nixie Heater initAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            for (let i = this.length - 1; i >= 0; i--) {
                try {
                    await this[i].closeAsync();
                    this.splice(i, 1);
                } catch (err) { logger.error(`Error stopping Nixie Heater ${err}`); }
            }
        } catch (err) { } // Don't bail if we have an errror.
    }
    public async initHeaterAsync(heater: Heater): Promise<NixieHeaterBase> {
        try {
            let c: NixieHeaterBase = this.find(elem => elem.id === heater.id) as NixieHeaterBase;
            if (typeof c === 'undefined') {
                c = NixieHeaterBase.create(this.controlPanel, heater);
                this.push(c);
            }
            return c;
        } catch (err) { logger.error(`initHeaterAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async setServiceModeAsync() {
        try {
            for (let i = this.length - 1; i >= 0; i--) {
                let heater = this[i] as NixieHeaterBase;
                await heater.setServiceModeAsync();
            }
        } catch (err) { return Promise.reject(`Nixie Control Panel setServiceMode ${err.message}`); }
    }
}
export class NixieHeaterBase extends NixieEquipment {
    protected _suspendPolling: number = 0;
    public pollingInterval: number = 10000;
    public heater: Heater;
    protected _pollTimer: NodeJS.Timeout = null;
    protected _lastState;
    protected closing = false;
    protected bodyOnTime: number;
    protected isOn: boolean = false;
    protected isCooling: boolean = false;
    protected lastHeatCycle: Date;
    protected lastCoolCycle: Date;
    constructor(ncp: INixieControlPanel, heater: Heater) {
        super(ncp);
        this.heater = heater;
    }
    public get suspendPolling(): boolean { return this._suspendPolling > 0; }
    public set suspendPolling(val: boolean) { this._suspendPolling = Math.max(0, this._suspendPolling + (val ? 1 : -1)); }
    public get id(): number { return typeof this.heater !== 'undefined' ? this.heater.id : -1; }
    public getCooldownTime() { return 0; }
    public static create(ncp: INixieControlPanel, heater: Heater): NixieHeaterBase {
        let type = sys.board.valueMaps.heaterTypes.transform(heater.type);
        switch (type.name) {
            case 'heatpump':
                return new NixieHeatpump(ncp, heater);
            case 'ultratemp':
                return new NixieUltratemp(ncp, heater);
            case 'gas':
                return new NixieGasHeater(ncp, heater);
            case 'mastertemp':
                return new NixieMastertemp(ncp, heater);
            case 'solar':
                return new NixieSolarHeater(ncp, heater);
            case 'hybrid':
                return new NixieUltraTempETi(ncp, heater);
            default:
                return new NixieHeaterBase(ncp, heater);
        }
    }
    public isBodyOn() {
        let isOn = sys.board.bodies.isBodyOn(this.heater.body);
        if (isOn && typeof this.bodyOnTime === 'undefined') {
            this.bodyOnTime = new Date().getTime();
        }
        else if (!isOn) this.bodyOnTime = undefined;
        return isOn;
    }
    public async setHeaterStateAsync(hstate: HeaterState, isOn: boolean, isCooling: boolean) {
        try {
            return Promise.reject(new InvalidOperationError(`You cannot change the state on this type of heater ${hstate.name}`, 'setHeaterStateAsync'));
        } catch (err) { return logger.error(`Nixie Error setting heater state ${hstate.id}-${hstate.name}: ${err.message}`); }
    }
    public async setHeaterAsync(data: any) {
        try {
            let heater = this.heater;

        }
        catch (err) { logger.error(`Nixie setHeaterAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async closeAsync() { }
    public async setServiceModeAsync() {
        let hstate = state.heaters.getItemById(this.heater.id);
        await this.setHeaterStateAsync(hstate, false, false);
    }
}
export class NixieGasHeater extends NixieHeaterBase {
    public pollingInterval: number = 10000;
    //declare heater: Heater;
    constructor(ncp: INixieControlPanel, heater: Heater) {
        super(ncp, heater);
        this.heater = heater;
        if (typeof this.heater.stopTempDelta === 'undefined') this.heater.stopTempDelta = 1;
        if (typeof this.heater.minCycleTime === 'undefined') this.heater.minCycleTime = 2;
        this.pollEquipmentAsync();
    }
    public get id(): number { return typeof this.heater !== 'undefined' ? this.heater.id : -1; }
    public getCooldownTime(): number {
        // Delays are always in terms of seconds so convert the minute to seconds.
        if (this.heater.cooldownDelay === 0 || typeof this.lastHeatCycle === 'undefined') return 0;
        let now = new Date().getTime();
        let cooldown = this.isOn ? this.heater.cooldownDelay * 60000 : Math.round(((this.lastHeatCycle.getDate() + this.heater.cooldownDelay * 60000) - now) / 1000);
        return Math.min(Math.max(0, cooldown), this.heater.cooldownDelay * 60);
    }
    public async setHeaterStateAsync(hstate: HeaterState, isOn: boolean) {
        try {
            // Initialize the desired state.
            this.isOn = isOn;
            this.isCooling = false;
            let target = hstate.startupDelay === false && isOn;
            if (target && typeof hstate.endTime !== 'undefined') {
                // Calculate a short cycle time so that the gas heater does not cycle
                // too often.  For gas heaters this is 60 seconds.  This gives enough time
                // for the heater control circuit to make a full cycle.
                if (new Date().getTime() - hstate.endTime.getTime() < this.heater.minCycleTime * 60000) {
                    logger.verbose(`${hstate.name} short cycle detected deferring turn on state`);
                    target = false;
                }
            }
            // Here we go we need to set the firemans switch state.
            if (hstate.isOn !== target) {
                logger.info(`Nixie: Set Heater ${hstate.id}-${hstate.name} to ${isOn}`);
            }
            if (typeof this._lastState === 'undefined' || target || this._lastState !== target) {
                if (utils.isNullOrEmpty(this.heater.connectionId) || utils.isNullOrEmpty(this.heater.deviceBinding)) {
                    this._lastState = hstate.isOn = target;
                }
                else {
                    let res = await NixieEquipment.putDeviceService(this.heater.connectionId, `/state/device/${this.heater.deviceBinding}`,
                        { isOn: target, latch: target ? 10000 : undefined });
                    if (res.status.code === 200) this._lastState = hstate.isOn = target;
                    else logger.error(`Nixie Error setting heater state: ${res.status.code} -${res.status.message} ${res.error.message}`);
                }
                if (target) this.lastHeatCycle = new Date();
            }
        } catch (err) { return logger.error(`Nixie Error setting heater state ${hstate.id}-${hstate.name}: ${err.message}`); }
    }
    public async pollEquipmentAsync() {
        let self = this;
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let success = false;
        }
        catch (err) { logger.error(`Nixie Error polling Heater - ${err}`); }
        finally { this._pollTimer = setTimeout(async () => await self.pollEquipmentAsync(), this.pollingInterval || 10000); }
    }
    private async checkHardwareStatusAsync(connectionId: string, deviceBinding: string) {
        try {
            let dev = await NixieEquipment.getDeviceService(connectionId, `/status/device/${deviceBinding}`);
            return dev;
        } catch (err) { logger.error(`Nixie Heater Error checkHardwareStatusAsync: ${err.message}`); return { hasFault: true } }
    }
    public async validateSetupAsync(heater: Heater, hstate: HeaterState) {
        try {
            if (typeof heater.connectionId !== 'undefined' && heater.connectionId !== ''
                && typeof heater.deviceBinding !== 'undefined' && heater.deviceBinding !== '') {
                try {
                    let stat = await this.checkHardwareStatusAsync(heater.connectionId, heater.deviceBinding);
                    // If we have a status check the return.
                    hstate.commStatus = stat.hasFault ? 1 : 0;
                } catch (err) { hstate.commStatus = 1; }
            }
            else
                hstate.commStatus = 0;
        } catch (err) { logger.error(`Nixie Error checking heater Hardware ${this.heater.name}: ${err.message}`); hstate.commStatus = 1; return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let hstate = state.heaters.getItemById(this.heater.id);
            await this.setHeaterStateAsync(hstate, false);
            hstate.emitEquipmentChange();
        }
        catch (err) { logger.error(`Nixie Heater closeAsync: ${err.message}`); return Promise.reject(err); }
    }
    public logData(filename: string, data: any) { this.controlPanel.logData(filename, data); }
}
export class NixieSolarHeater extends NixieHeaterBase {
    public pollingInterval: number = 10000;
    declare heater: Heater;
    constructor(ncp: INixieControlPanel, heater: Heater) {
        super(ncp, heater);
        this.heater = heater;
        this.pollEquipmentAsync();
    }
    public get id(): number { return typeof this.heater !== 'undefined' ? this.heater.id : -1; }
    public async setHeaterStateAsync(hstate: HeaterState, isOn: boolean, isCooling: boolean) {
        try {
            let origState = hstate.isOn;
            // Initialize the desired state.
            this.isOn = isOn;
            this.isCooling = isCooling;
            let target = hstate.startupDelay === false && isOn;
            if (target && typeof hstate.endTime !== 'undefined') {
                // Calculate a short cycle time so that the solar heater does not cycle
                // too often.  For solar heaters this is 60 seconds.  This gives enough time
                // for the valve to rotate and start heating.  If the solar and water sensors are
                // not having issues this should be plenty of time.
                if (new Date().getTime() - hstate.endTime.getTime() < 60000) {
                    logger.verbose(`${hstate.name} short cycle detected deferring turn on state`);
                    target = false;
                }
            }

            // Here we go we need to set the valve status that is attached to solar.
            if (hstate.isOn !== target) {
                logger.info(`Nixie: Set Heater ${hstate.id}-${hstate.name} to ${isOn}`);
            }
            if (typeof this._lastState === 'undefined' || target || this._lastState !== target) {
                if (utils.isNullOrEmpty(this.heater.connectionId) || utils.isNullOrEmpty(this.heater.deviceBinding)) {
                    this._lastState = hstate.isOn = target;
                }
                else {
                    let res = await NixieEquipment.putDeviceService(this.heater.connectionId, `/state/device/${this.heater.deviceBinding}`,
                        { isOn: target, latch: target ? 10000 : undefined });
                    if (res.status.code === 200) this._lastState = hstate.isOn = target;
                    else logger.error(`Nixie Error setting heater state: ${res.status.code} -${res.status.message} ${res.error.message}`);
                }
                if (target) {
                    if (isCooling) this.lastCoolCycle = new Date();
                    else if (isOn) this.lastHeatCycle = new Date();
                }
            }
            // In this instance we need to see if there are cleaner circuits that we need to turn off
            // then delay for the current body because the solar just came on.
            if (hstate.isOn && sys.general.options.cleanerSolarDelay && !origState) {
                let arrTypes = sys.board.valueMaps.circuitFunctions.toArray().filter(x => { return x.name.indexOf('cleaner') !== -1 && x.body === hstate.bodyId });
                let cleaners = sys.circuits.filter(x => { return arrTypes.findIndex(t => { return t.val === x.type }) !== -1 });
                // Turn off all the cleaner circuits and set an on delay if they are on.
                for (let i = 0; i < cleaners.length; i++) {
                    let cleaner = cleaners.getItemByIndex(i);
                    if (cleaner.isActive) {
                        let cstate = state.circuits.getItemById(cleaner.id);
                        if (cstate.isOn && sys.general.options.cleanerSolarDelayTime > 0) {
                            // Turn off the circuit then set a delay.
                            logger.info(`Setting cleaner solar delay for ${cleaner.name} to ${sys.general.options.cleanerSolarDelayTime}`);
                            await sys.board.circuits.setCircuitStateAsync(cstate.id, false);
                            delayMgr.setCleanerStartDelay(cstate, hstate.bodyId, sys.general.options.cleanerSolarDelayTime);
                        }
                    }
                }
            }
        } catch (err) { return logger.error(`Nixie Error setting heater state ${hstate.id}-${hstate.name}: ${err.message}`); }
    }
    public async pollEquipmentAsync() {
        let self = this;
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let success = false;
        }
        catch (err) { logger.error(`Nixie Error polling Heater - ${err}`); }
        finally { this._pollTimer = setTimeout(async () => await self.pollEquipmentAsync(), this.pollingInterval || 10000); }
    }
    private async checkHardwareStatusAsync(connectionId: string, deviceBinding: string) {
        try {
            let dev = await NixieEquipment.getDeviceService(connectionId, `/status/device/${deviceBinding}`);
            return dev;
        } catch (err) { logger.error(`Nixie Heater Error checkHardwareStatusAsync: ${err.message}`); return { hasFault: true } }
    }
    public async validateSetupAsync(heater: Heater, hstate: HeaterState) {
        try {
            if (typeof heater.connectionId !== 'undefined' && heater.connectionId !== ''
                && typeof heater.deviceBinding !== 'undefined' && heater.deviceBinding !== '') {
                try {
                    let stat = await this.checkHardwareStatusAsync(heater.connectionId, heater.deviceBinding);
                    // If we have a status check the return.
                    hstate.commStatus = stat.hasFault ? 1 : 0;
                } catch (err) { hstate.commStatus = 1; }
            }
            else
                hstate.commStatus = 0;
        } catch (err) { logger.error(`Nixie Error checking heater Hardware ${this.heater.name}: ${err.message}`); hstate.commStatus = 1; return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let hstate = state.heaters.getItemById(this.heater.id);
            await this.setHeaterStateAsync(hstate, false, false);
            hstate.emitEquipmentChange();
        }
        catch (err) { logger.error(`Nixie Heater closeAsync: ${err.message}`); return Promise.reject(err); }
    }
    public logData(filename: string, data: any) { this.controlPanel.logData(filename, data); }
}
export class NixieHeatpump extends NixieHeaterBase {
    public pollingInterval: number = 10000;
    //declare heater: Heater;
    constructor(ncp: INixieControlPanel, heater: Heater) {
        super(ncp, heater);
        this.heater = heater;
        if (typeof this.heater.stopTempDelta === 'undefined') this.heater.stopTempDelta = 1;
        if (typeof this.heater.minCycleTime === 'undefined') this.heater.minCycleTime = 2;
        this.pollEquipmentAsync();
    }
    public get id(): number { return typeof this.heater !== 'undefined' ? this.heater.id : -1; }
    public getCooldownTime(): number { return 0; } // There is no cooldown delay at this time for a heatpump
    public async setHeaterStateAsync(hstate: HeaterState, isOn: boolean) {
        try {
            // Initialize the desired state.
            this.isOn = isOn;
            this.isCooling = false;
            let target = hstate.startupDelay === false && isOn;
            if (target && typeof hstate.endTime !== 'undefined') {
                // Calculate a short cycle time so that the gas heater does not cycle
                // too often.  For gas heaters this is 60 seconds.  This gives enough time
                // for the heater control circuit to make a full cycle.
                if (new Date().getTime() - hstate.endTime.getTime() < this.heater.minCycleTime * 60000) {
                    logger.verbose(`${hstate.name} short cycle detected deferring turn on state`);
                    target = false;
                }
            }
            // Here we go we need to set the firemans switch state.
            if (hstate.isOn !== target) {
                logger.info(`Nixie: Set Heatpump ${hstate.id}-${hstate.name} to ${isOn}`);
            }
            if (typeof this._lastState === 'undefined' || target || this._lastState !== target) {
                if (utils.isNullOrEmpty(this.heater.connectionId) || utils.isNullOrEmpty(this.heater.deviceBinding)) {
                    this._lastState = hstate.isOn = target;
                }
                else {
                    let res = await NixieEquipment.putDeviceService(this.heater.connectionId, `/state/device/${this.heater.deviceBinding}`,
                        { isOn: target, latch: target ? 10000 : undefined });
                    if (res.status.code === 200) this._lastState = hstate.isOn = target;
                    else logger.error(`Nixie Error setting heatpump state: ${res.status.code} -${res.status.message} ${res.error.message}`);
                }
                if (target) this.lastHeatCycle = new Date();
            }
        } catch (err) { return logger.error(`Nixie Error setting heatpump state ${hstate.id}-${hstate.name}: ${err.message}`); }
    }
    public async pollEquipmentAsync() {
        let self = this;
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let success = false;
        }
        catch (err) { logger.error(`Nixie Error polling Heatpump - ${err}`); }
        finally { this._pollTimer = setTimeout(async () => await self.pollEquipmentAsync(), this.pollingInterval || 10000); }
    }
    private async checkHardwareStatusAsync(connectionId: string, deviceBinding: string) {
        try {
            let dev = await NixieEquipment.getDeviceService(connectionId, `/status/device/${deviceBinding}`);
            return dev;
        } catch (err) { logger.error(`Nixie Heatpump Error checkHardwareStatusAsync: ${err.message}`); return { hasFault: true } }
    }
    public async validateSetupAsync(heater: Heater, hstate: HeaterState) {
        try {
            if (typeof heater.connectionId !== 'undefined' && heater.connectionId !== ''
                && typeof heater.deviceBinding !== 'undefined' && heater.deviceBinding !== '') {
                try {
                    let stat = await this.checkHardwareStatusAsync(heater.connectionId, heater.deviceBinding);
                    // If we have a status check the return.
                    hstate.commStatus = stat.hasFault ? 1 : 0;
                } catch (err) { hstate.commStatus = 1; }
            }
            else
                hstate.commStatus = 0;
        } catch (err) { logger.error(`Nixie Error checking heatpump Hardware ${this.heater.name}: ${err.message}`); hstate.commStatus = 1; return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let hstate = state.heaters.getItemById(this.heater.id);
            await this.setHeaterStateAsync(hstate, false);
            hstate.emitEquipmentChange();
        }
        catch (err) { logger.error(`Nixie Heatpump closeAsync: ${err.message}`); return Promise.reject(err); }
    }
    public logData(filename: string, data: any) { this.controlPanel.logData(filename, data); }
}
export class NixieUltratemp extends NixieHeaterBase {
    constructor(ncp: INixieControlPanel, heater: Heater) {
        super(ncp, heater);
        // Set the polling interval to 3 seconds.
        this.pollEquipmentAsync();
    }
    public async setServiceModeAsync() {
        let hstate = state.heaters.getItemById(this.heater.id);
        await this.setHeaterStateAsync(hstate, false, false);
        await this.releaseHeater(hstate);
    }

    public async pollEquipmentAsync() {
        let self = this;
        try {
            this.suspendPolling = true;
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            if (this._suspendPolling > 1) return;
            let sheater = state.heaters.getItemById(this.heater.id, !this.closing);
            // If the body isn't on then we won't communicate with the chem controller.  There is no need
            // since most of the time these are attached to the filter relay.
            if (!this.closing) {
                await this.setStatus(sheater);
            }
        }
        catch (err) { logger.error(`Error polling UltraTemp heater - ${err}`); }
        finally {
            this.suspendPolling = false; if (!this.closing) this._pollTimer = setTimeout(async () => {
                try { await self.pollEquipmentAsync() } catch (err) { }
            }, this.pollingInterval || 10000);
        }
    }
    public async setHeaterStateAsync(hstate: HeaterState, isOn: boolean, isCooling: boolean) {
        try {
            // Initialize the desired state.
            this.isCooling = isCooling;
            if (hstate.isOn !== isOn) {
                logger.info(`Nixie: Set Heater ${hstate.id}-${hstate.name} to ${isCooling ? 'cooling' : isOn ? 'heating' : 'off'}`);

            }
            if (isOn && !hstate.startupDelay) this.lastHeatCycle = new Date();
            this.isOn = hstate.isOn = isOn;
        } catch (err) { return logger.error(`Nixie Error setting heater state ${hstate.id}-${hstate.name}: ${err.message}`); }
    }
    public async releaseHeater(sheater: HeaterState): Promise<boolean> {
        try {
            let out = Outbound.create({
                portId: this.heater.portId || 0,
                protocol: Protocol.Heater,
                source: 16,
                dest: this.heater.address,
                action: 114,
                payload: [],
                retries: 3, // We are going to try 4 times.
                response: Response.create({ protocol: Protocol.Heater, action: 115 }),
                onAbort: () => { }
            });
            out.appendPayloadBytes(0, 10);
            out.setPayloadByte(0, 144);
            out.setPayloadByte(1, 0, 0);
            await out.sendAsync();
            return true;

        } catch (err) {
            // If the Ultratemp is not responding we need to store that off but at this point we know none of the codes.  If a 115 does
            // come across this will be cleared by the processing of that message.
            sheater.commStatus = sys.board.valueMaps.equipmentCommStatus.getValue('commerr');
            state.equipment.messages.setMessageByCode(`heater:${sheater.id}:comms`, 'error', `Communication error with ${sheater.name}`);
            logger.error(`Communication error with Ultratemp : ${err.message}`);
            return false;
        }
    }
    public async setStatus(sheater: HeaterState): Promise<boolean> {
        try {
            let out = Outbound.create({
                portId: this.heater.portId || 0,
                protocol: Protocol.Heater,
                source: 16,
                dest: this.heater.address,
                action: 114,
                payload: [],
                retries: 3, // We are going to try 4 times.
                response: Response.create({ protocol: Protocol.Heater, action: 115 }),
                onAbort: () => { }
            });
            out.appendPayloadBytes(0, 10);
            out.setPayloadByte(0, 144);
            // If we are in startup delay simply tell the heater that it is off.
            if (sheater.startupDelay || this.closing)
                out.setPayloadByte(1, 0, 0);
            else {
                if (this.isOn) {
                    if (!this.isCooling) this.lastHeatCycle = new Date();
                    else this.lastCoolCycle = new Date();
                }
                //console.log(`Setting the heater byte ${this.isOn} ${sheater.isOn} to ${this.isOn ? (this.isCooling ? 2 : 1) : 0}`);
                out.setPayloadByte(1, this.isOn ? (this.isCooling ? 2 : 1) : 0, 0);
            }
            let success = await out.sendAsync();
            return success;
        } catch (err) {
            // If the Ultratemp is not responding we need to store that off but at this point we know none of the codes.  If a 115 does
            // come across this will be cleared by the processing of that message.
            sheater.commStatus = sys.board.valueMaps.equipmentCommStatus.getValue('commerr');
            state.equipment.messages.setMessageByCode(`heater:${sheater.id}:comms`, 'error', `Communication error with ${sheater.name}`);
            logger.error(`Communication error with Ultratemp : ${err.message}`);
            return false;
        }
    }
    public async closeAsync() {
        try {
            this.suspendPolling = true;
            this.closing = true;
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let sheater = state.heaters.getItemById(this.id);
            await this.releaseHeater(sheater);
            logger.info(`Closing Heater ${this.heater.name}`);
        }
        catch (err) { logger.error(`Ultratemp closeAsync: ${err.message}`); return Promise.reject(err); }
    }
}
export class NixieMastertemp extends NixieGasHeater {
    constructor(ncp: INixieControlPanel, heater: Heater) {
        super(ncp, heater);
        // Set the polling interval to 3 seconds.
        this.pollEquipmentAsync();
        this.pollingInterval = 3000;
    }
    /*     public getCooldownTime(): number {
            // Delays are always in terms of seconds so convert the minute to seconds.
            if (this.heater.cooldownDelay === 0 || typeof this.lastHeatCycle === 'undefined') return 0;
            let now = new Date().getTime();
            let cooldown = this.isOn ? this.heater.cooldownDelay * 60000 : Math.round(((this.lastHeatCycle.getDate() + this.heater.cooldownDelay * 60000) - now) / 1000);
            return Math.min(Math.max(0, cooldown), this.heater.cooldownDelay * 60);
        } */
    public async setHeaterStateAsync(hstate: HeaterState, isOn: boolean) {
        try {
            // Initialize the desired state.
            this.isCooling = false;
            // Here we go we need to set the firemans switch state.
            if (hstate.isOn !== isOn) {
                logger.info(`Nixie: Set Heater ${hstate.id}-${hstate.name} to ${isOn}`);
            }
            if (isOn && !hstate.startupDelay) this.lastHeatCycle = new Date();
            hstate.isOn = isOn;
        } catch (err) { return logger.error(`Nixie Error setting heater state ${hstate.id}-${hstate.name}: ${err.message}`); }
    }
    public async pollEquipmentAsync() {
        let self = this;
        try {
            this.suspendPolling = true;
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            if (this._suspendPolling > 1) return;
            let sheater = state.heaters.getItemById(this.heater.id, !this.closing);
            if (!this.closing) await this.setStatus(sheater);
        }
        catch (err) { logger.error(`Error polling MasterTemp heater - ${err}`); }
        finally {
            this.suspendPolling = false; if (!this.closing) this._pollTimer = setTimeout(async () => {
                try { await self.pollEquipmentAsync() } catch (err) { }
            }, this.pollingInterval || 3000);
        }
    }
    public async setStatus(sheater: HeaterState): Promise<boolean> {
        try {
            let out = Outbound.create({
                portId: this.heater.portId || 0,
                protocol: Protocol.Heater,
                source: 16,
                dest: this.heater.address,
                action: 112,
                payload: [],
                retries: 3, // We are going to try 4 times.
                response: Response.create({ protocol: Protocol.Heater, action: 116 }),
                onAbort: () => { }
            });
            out.appendPayloadBytes(0, 11);
            // If we have a startup delay we need to simply send 0 to the heater to make sure that it is off.
            if (sheater.startupDelay)
                out.setPayloadByte(0, 0);
            else {
                // The cooldown delay is a bit hard to figure out here since I think the heater does it on its own.
                out.setPayloadByte(0, sheater.bodyId <= 2 ? sheater.bodyId : 0);
            }
            out.setPayloadByte(1, sys.bodies.getItemById(1).heatSetpoint || 0);
            out.setPayloadByte(2, sys.bodies.getItemById(2).heatSetpoint || 0);
            let success = await out.sendAsync();
            return success;
        } catch (err) {
            // If the MasterTemp is not responding we need to store that off but at this point we know none of the codes.  If a 115 does
            // come across this will be cleared by the processing of that message.
            sheater.commStatus = sys.board.valueMaps.equipmentCommStatus.getValue('commerr');
            state.equipment.messages.setMessageByCode(`heater:${sheater.id}:comms`, 'error', `Communication error with ${sheater.name}`);
            logger.error(`Communication error with MasterTemp : ${err.message}`);
            return false;
        }
    }
    public async setServiceModeAsync() {
        let hstate = state.heaters.getItemById(this.heater.id);
        await this.setHeaterStateAsync(hstate, false);
    }
    public async closeAsync() {
        try {
            this.suspendPolling = true;
            this.closing = true;
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            logger.info(`Closing Heater ${this.heater.name}`);

        }
        catch (err) { logger.error(`MasterTemp closeAsync: ${err.message}`); return Promise.reject(err); }
    }
}
export class NixieUltraTempETi extends NixieHeaterBase {
    constructor(ncp: INixieControlPanel, heater: Heater) {
        super(ncp, heater);
        // Set the polling interval to 3 seconds.
        this.pollEquipmentAsync();
    }
    public async pollEquipmentAsync() {
        let self = this;
        try {
            this.suspendPolling = true;
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            if (this._suspendPolling > 1) return;
            let sheater = state.heaters.getItemById(this.heater.id, !this.closing);
            // If the body isn't on then we won't communicate with the chem controller.  There is no need
            // since most of the time these are attached to the filter relay.
            if (!this.closing) {
                await this.setStatus(sheater);
            }
        }
        catch (err) { logger.error(`Error polling UltraTemp ETi heater - ${err}`); }
        finally {
            this.suspendPolling = false; if (!this.closing) this._pollTimer = setTimeout(async () => {
                try { await self.pollEquipmentAsync() } catch (err) { }
            }, this.pollingInterval || 10000);
        }
    }
    public async setHeaterStateAsync(hstate: HeaterState, isOn: boolean, isCooling: boolean) {
        try {
            // Initialize the desired state.
            this.isCooling = isCooling;
            if (hstate.isOn !== isOn) {
                logger.info(`Nixie: Set Heater ${hstate.id}-${hstate.name} to ${isCooling ? 'cooling' : isOn ? 'heating' : 'off'}`);

            }
            if (isOn && !hstate.startupDelay) this.lastHeatCycle = new Date();
            this.isOn = hstate.isOn = isOn;
        } catch (err) { return logger.error(`Nixie Error setting heater state ${hstate.id}-${hstate.name}: ${err.message}`); }
    }
    public async releaseHeater(sheater: HeaterState): Promise<boolean> {
        try {
            let out = Outbound.create({
                portId: this.heater.portId || 0,
                protocol: Protocol.Heater,
                source: 16,
                dest: this.heater.address,
                action: 112,
                payload: [],
                retries: 3, // We are going to try 4 times.
                response: Response.create({ protocol: Protocol.Heater, action: 113 }),
                onAbort: () => { }
            });
            out.appendPayloadBytes(0, 10);
            out.setPayloadByte(0, 0);
            out.setPayloadByte(1, 0);
            out.setPayloadByte(2, 78);
            out.setPayloadByte(3, 1);
            out.setPayloadByte(4, 5);
            let success = await out.sendAsync();
            return success;
        } catch (err) {
            // If the Ultratemp is not responding we need to store that off but at this point we know none of the codes.  If a 113 does
            // come across this will be cleared by the processing of that message.
            sheater.commStatus = sys.board.valueMaps.equipmentCommStatus.getValue('commerr');
            state.equipment.messages.setMessageByCode(`heater:${sheater.id}:comms`, 'error', `Communication error with ${sheater.name}`);
            logger.error(`Communication error with Ultratemp : ${err.message}`);
            return false;
        }
    }
    protected calcHeatModeByte(body: Body): number {
        let byte = 0;
        if (this.closing) return 0; // We are closing so just set the heat mode to off.
        let mode = sys.board.valueMaps.heatModes.transform(body.heatMode || 0);
        switch (mode.name) {
            case 'hpump':
            case 'heatpump':
                byte = 1;
                break;
            case 'heater':
                byte = 2;
                break;
            case 'heatpumpref':
            case 'heatpumppref':
            case 'hybrid':
                byte = 3;
                break;
            case 'dual':
                byte = 4;
                break;
        }
        return byte;
    }
    public async setServiceModeAsync() {
        let hstate = state.heaters.getItemById(this.heater.id);
        await this.setHeaterStateAsync(hstate, false, false);
        await this.releaseHeater(hstate);
    }
    public async setStatus(sheater: HeaterState): Promise<boolean> {
        try {
            let out = Outbound.create({
                portId: this.heater.portId || 0,
                protocol: Protocol.Heater,
                source: 16,
                dest: this.heater.address,
                action: 112,
                payload: [],
                retries: 3, // We are going to try 4 times.
                response: Response.create({ protocol: Protocol.Heater, action: 113 }),
                onAbort: () => { }
            });
            out.appendPayloadBytes(0, 10);
            out.setPayloadByte(0, this.isOn && !sheater.startupDelay && !this.closing ? 1 : 0);
            if (sheater.bodyId > 0) {
                let body = sys.bodies.getItemById(sheater.bodyId);
                out.setPayloadByte(1, this.calcHeatModeByte(body));
                out.setPayloadByte(2, body.setPoint);
            }
            else out.setPayloadByte(2, utils.convert.temperature.convertUnits(78, 'F', sys.board.valueMaps.tempUnits.getName(state.temps.units) || 'F')); // Just set it to a valid setpoint and call it a day.
            out.setPayloadByte(3, this.heater.economyTime, 1);
            out.setPayloadByte(4, this.heater.maxBoostTemp, 5);
            if (this.isOn) {
                if (!this.isCooling) this.lastHeatCycle = new Date();
                else this.lastCoolCycle = new Date();
            }
            let success = await out.sendAsync();
            return success;
        } catch (err) {
            // If the Ultratemp ETi is not responding we need to store that off but at this point we know none of the codes.  If a 113 does
            // come across this will be cleared by the processing of that message.
            sheater.commStatus = sys.board.valueMaps.equipmentCommStatus.getValue('commerr');
            state.equipment.messages.setMessageByCode(`heater:${sheater.id}:comms`, 'error', `Communication error with ${sheater.name}`);
            logger.error(`Communication error with Ultratemp ETi : ${err.message}`);
            return false;
        }
    }
    public async closeAsync() {
        try {
            this.suspendPolling = true;
            this.closing = true;
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let sheater = state.heaters.getItemById(this.id);
            await this.releaseHeater(sheater);
            logger.info(`Closing Heater ${this.heater.name}`);
        }
        catch (err) { logger.error(`Ultratemp closeAsync: ${err.message}`); return Promise.reject(err); }
    }
}
