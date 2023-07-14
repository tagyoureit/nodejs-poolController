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
import { PumpState, HeaterState, BodyTempState, ICircuitState, state } from "./State";
import { Equipment, sys } from "./Equipment";
import { Timestamp, utils } from "./Constants";
import { logger } from "../logger/Logger";
import { webApp } from "../web/Server";
// LOCKOUT PRIMER
// Lockouts are either time based (Delays) or based upon the current state configuration for
// the system.  So in some cases circuits can only be engaged in pool mode or in spa mode.  In
// others a period of time must occur before a particular action can continue.  Delays can typically
// be cancelled manually while lockouts can only be cancelled when the condition required for the lockout
// is changed.

// DELAYS:
// Pump Off During Valve Rotation (30 sec):  This turns any pump associated with the body being turned on to
// so that is is off.  This gives the valves time to rotate so that cold water from the pool does not cycle into
// the spa and hot water from the spa does not escape into the pool.  This has nothing to do with
// water hammer or anything else.
//
// Heater Cooldown Delay (based on max heater time):  When the system is heating and an event is occurring
// that will cause the heater to be turned off, the current mode will be retained until the delay is either
// cancelled or expired.  
//    Delay Conditions:
//    1. Being in either pool or spa mode and simply turning off that mode where the heater will be turned off.
//    2. Switching between pool and spa when the target mode does not use the identified heater.
//    Exceptions:
//    1. The last call for heat was earlier than the current time minus the cooldown delay defined for the heater.
//    2. The heater mode is in a cooling mode.
//
// Heater Startup: When a body is first turned on the heater will not be engaged for 10 seconds after any pump delay
// or the time that the body is engaged.
//
// Cleaner Circuit Start Delay: Delays turning on any circuit with a cleaner function until the delay expires.  This is
// so booster pumps can be assured of sufficient forward pressure prior to turning on.  These pumps often require sufficient
// pressure before engaging and will cavitate if they do not have it.  The Pentair default is 5min.
//
// Cleaner Circuit Solar Delay: This only exists with Pentair panels.  This shuts off any circuit 
// designated as a pool cleaner circuit if it is on and delays turning it on for 5min after the solar starts.  The assumption
// here is that pressure reduction that can occur when the solar kicks on can cavitate the pump.
//
// Manual Operation Priority Delay: 
//   From the manual: 
//   Manual OP Priority: ON: This feature allows for a circuit to be manually switched OFF and switched ON within 
//   a scheduled program, the circuit will continue to run for a maximum of 12 hours or whatever that circuit Egg 
//   Timer is set to, after which the scheduled program will resume. This feature will turn off any scheduled 
//   program to allow manual pump override. The Default setting is OFF.
//
//   ## When on
//   1.  If a schedule should be on and the user turns the schedule off then the schedule expires until such time 
//   as the time off has expired.  When that occurs the schedule should be reset to run at the designated time.  
//   If the user resets the schedule by turning the circuit back on again then the schedule will be ignored and 
//   the circuit will run until the egg timer expires or the circuit/feature is manually turned off.  This setting 
//   WILL affect other schedules that may impact this circuit.
// 
//   ## When off
//   1. "Normal" = If a schedule should be on and the user turns the schedule off then the schedule expires until 
//   such time as the time off has expired.  When that occurs the schedule should be reset to run at the designated 
//   time.  If the user resets the schedule by turning the circuit back on again then the schedule will resume and 
//   turn off at the specified time.
//
// LOCKOUTS (Proposed):
// Spillway Lockout: This locks out any circuit or feature that is marked with a Spillway circuit function (type) whenever
// whenever the pool circuit is not engaged.  This should mark the spillway circuit as a delayStart then release it when the
// pool body starts.
interface ILockout {
    type: string
}
export class EquipmentLockout implements ILockout {
    public id = utils.uuid();
    public create() { }
    public startTime: Date;
    public type: string = 'lockout';
    public message: string = '';
}
export class EquipmentDelay implements ILockout {
    public constructor() { this.id = delayMgr.getNextId(); }
    public id;
    public type: string = 'delay';
    public startTime: Date;
    public endTime: Date;
    public canCancel: boolean = true;
    public cancelDelay() { };
    public reset() { };
    public clearDelay() { };
    public message;
    protected _delayTimer: NodeJS.Timeout;
    public serialize(): any {
        return {
            id: this.id,
            type: this.type,
            canCancel: this.canCancel,
            message: this.message,
            startTime: typeof this.startTime !== 'undefined' ? Timestamp.toISOLocal(this.startTime) : undefined,
            endTime: typeof this.endTime !== 'undefined' ? Timestamp.toISOLocal(this.endTime) : undefined,
            duration: typeof this.startTime !== 'undefined' && typeof this.endTime !== 'undefined' ? (this.endTime.getTime() - this.startTime.getTime()) / 1000 : 0
        };
    }
}
export class ManualPriorityDelay extends EquipmentDelay {
    public constructor(cs: ICircuitState) {
        super();
        this.type = 'manualOperationPriorityDelay';
        this.message = `${cs.name} will override future schedules until expired/cancelled.`;
        this.circuitState = cs;
        this.circuitState.manualPriorityActive = true;
        this.startTime = new Date();
        this.endTime = cs.endTime.clone().toDate();
        this._delayTimer = setTimeout(() => {
            logger.info(`Manual Operation Priority expired for ${this.circuitState.name}`);
            this.circuitState.manualPriorityActive = false;
            delayMgr.deleteDelay(this.id);
        }, this.endTime.getTime() - new Date().getTime());
        logger.info(`Manual Operation Priority delay in effect until ${this.circuitState.name} - ${cs.endTime.toDate()}`);
    }
    public circuitState: ICircuitState;
    public cancelDelay() {
        this.circuitState.manualPriorityActive = false;
        if (typeof this._delayTimer !== 'undefined') clearTimeout(this._delayTimer);
        logger.info(`Manual Operation Priority cancelled for ${this.circuitState.name}`);
        this._delayTimer = undefined;
        this.circuitState.manualPriorityActive = false;
        // Rip through all the schedules and clear the manual priority.
        let sscheds = state.schedules.getActiveSchedules();
        let circIds = [];
        for (let i = 0; i < sscheds.length; i++) {
            let ssched = sscheds[i];
            ssched.manualPriorityActive = false;
            if (!circIds.includes(ssched.circuit)) circIds.push(ssched.circuit);
        }
        for (let i = 0; i < circIds.length; i++) {
            let circ = sys.circuits.getInterfaceById(circIds[i]);
            if (!circ.isActive) continue;
            let cstate = state.circuits.getInterfaceById(circ.id);
            sys.board.circuits.setEndTime(circ, cstate, cstate.isOn, true);
        }

        delayMgr.deleteDelay(this.id);
    }
    public clearDelay() {
        if (typeof this._delayTimer !== 'undefined') clearTimeout(this._delayTimer);
        logger.info(`Manual Operation Priority cleared for ${this.circuitState.name}`);
        this._delayTimer = undefined;
        delayMgr.deleteDelay(this.id);
    }
}
export class PumpValveDelay extends EquipmentDelay {
    public constructor(ps: PumpState, delay?: number) {
        super();
        this.type = 'pumpValveDelay';
        this.message = `${ps.name} will start after valve delay`;
        this.pumpState = ps;
        this.pumpState.pumpOnDelay = true;
        this.startTime = new Date();
        this.endTime = new Date(this.startTime.getTime() + (delay * 1000 || sys.general.options.valveDelayTime * 1000));
        this._delayTimer = setTimeout(() => {
            logger.info(`Valve delay expired for ${this.pumpState.name}`);
            this.pumpState.pumpOnDelay = false;
            delayMgr.deleteDelay(this.id);
        }, delay * 1000 || sys.general.options.valveDelayTime * 1000);
        logger.info(`Valve delay started for ${this.pumpState.name} - ${delay || sys.general.options.valveDelayTime}sec`);
    }
    public pumpState: PumpState;
    public cancelDelay() {
        this.pumpState.pumpOnDelay = false;
        if (typeof this._delayTimer !== 'undefined') clearTimeout(this._delayTimer);
        logger.info(`Valve delay cancelled for ${this.pumpState.name}`);
        this._delayTimer = undefined;
        delayMgr.deleteDelay(this.id);
    }
    public clearDelay() {
        if (typeof this._delayTimer !== 'undefined') clearTimeout(this._delayTimer);
        logger.info(`Valve delay cleared for ${this.pumpState.name}`);
        this._delayTimer = undefined;
        delayMgr.deleteDelay(this.id);
    }
}
export class HeaterStartupDelay extends EquipmentDelay {
    public constructor(hs: HeaterState, delay?: number) {
        super();
        this.type = 'heaterStartupDelay';
        this.message = `${hs.name} will start after delay`;
        this.heaterState = hs;
        this.heaterState.startupDelay = true;
        this.startTime = new Date();
        this.endTime = new Date(this.startTime.getTime() + (delay * 1000 || sys.general.options.heaterStartDelayTime * 1000));
        this._delayTimer = setTimeout(() => {
            logger.info(`Heater Startup delay expired for ${this.heaterState.name}`);
            this.heaterState.startupDelay = false;
            delayMgr.deleteDelay(this.id);
        }, delay * 1000 || sys.general.options.heaterStartDelayTime * 1000);
        logger.info(`Heater delay started for ${this.heaterState.name} - ${delay || sys.general.options.heaterStartDelayTime}sec`);
    }
    public heaterState: HeaterState;
    public cancelDelay() {
        this.heaterState.startupDelay = false;
        if (typeof this._delayTimer !== 'undefined') clearTimeout(this._delayTimer);
        logger.info(`Heater Startup delay cancelled for ${this.heaterState.name}`);
        this._delayTimer = undefined;
        delayMgr.deleteDelay(this.id);
    }
    public clearDelay() {
        this.heaterState.startupDelay = false;
        if (typeof this._delayTimer !== 'undefined') clearTimeout(this._delayTimer);
        logger.info(`Heater Startup delay cancelled for ${this.heaterState.name}`);
        this._delayTimer = undefined;
        delayMgr.deleteDelay(this.id);
    }
}
export class HeaterCooldownDelay extends EquipmentDelay {
    public constructor(bsoff: BodyTempState, bson?: BodyTempState, delay?: number) {
        super();
        this.type = 'heaterCooldownDelay';
        this.message = `${bsoff.name} Heater Cooldown in progress`;
        this.bodyStateOff = bsoff;
        this.bodyStateOff.heaterCooldownDelay = true;
        this.bodyStateOff.heatStatus = sys.board.valueMaps.heatStatus.getValue('cooldown');
        let cstateOff = state.circuits.getItemById(bsoff.circuit);
        this.bodyStateOn = bson;
        this.bodyStateOff.stopDelay = cstateOff.stopDelay = true;
        let cstateOn = (typeof bson !== 'undefined') ? state.circuits.getItemById(bson.circuit) : undefined;
        if (typeof cstateOn !== 'undefined') {
            this.bodyStateOn.startDelay = cstateOn.startDelay = true;
        }
        logger.verbose(`Heater Cooldown Delay started for ${this.bodyStateOff.name} - ${delay/1000}sec`);
        this.startTime = new Date();
        this.endTime = new Date(this.startTime.getTime() + (delay * 1000));
        this._delayTimer = setTimeout(() => {
            logger.verbose(`Heater Cooldown delay expired for ${this.bodyStateOff.name}`);
            this.bodyStateOff.stopDelay = state.circuits.getItemById(this.bodyStateOff.circuit).stopDelay = false;
            // Now that the startup delay expired cancel the delay and shut off the circuit.
            (async () => {
                try {
                    await sys.board.circuits.setCircuitStateAsync(cstateOff.id, false, true);
                    if (typeof this.bodyStateOn !== 'undefined') {
                        this.bodyStateOn.startDelay = state.circuits.getItemById(this.bodyStateOn.circuit).startDelay = false;
                        await sys.board.circuits.setCircuitStateAsync(this.bodyStateOn.circuit, true);
                    }
                } catch (err) { logger.error(`Error executing Cooldown Delay completion: ${err}`); }
            })();
            this.bodyStateOff.heaterCooldownDelay = false;
            this.bodyStateOff.heatStatus = sys.board.valueMaps.heatStatus.getValue('off');
            delayMgr.deleteDelay(this.id);
        }, delay);
        state.emitEquipmentChanges();
    }
    public bodyStateOff: BodyTempState;
    public bodyStateOn: BodyTempState;
    public setBodyStateOn(bson?: BodyTempState) {
        if (typeof this.bodyStateOn !== 'undefined' && (typeof bson === 'undefined' || this.bodyStateOn.id !== bson.id))
            this.bodyStateOn.startDelay = state.circuits.getItemById(this.bodyStateOn.circuit).startDelay = false;
        if (typeof bson !== 'undefined') {
            if (typeof this.bodyStateOn === 'undefined' || this.bodyStateOn.id !== bson.id) {
                bson.startDelay = state.circuits.getItemById(bson.circuit).startDelay = true;
                logger.info(`${bson.name} will Start After Cooldown Delay`);
                this.bodyStateOn = bson;
            }
        }
        else this.bodyStateOn = undefined;
    }
    public cancelDelay() {
        let cstateOff = state.circuits.getItemById(this.bodyStateOff.circuit);
        cstateOff.stopDelay = false;
        (async () => {
            await sys.board.circuits.setCircuitStateAsync(cstateOff.id, false);
            if (typeof this.bodyStateOn !== 'undefined') {
                this.bodyStateOn.startDelay = state.circuits.getItemById(this.bodyStateOn.circuit).startDelay = false;
                await sys.board.circuits.setCircuitStateAsync(this.bodyStateOn.circuit, true);
            }
        })();
        this.bodyStateOff.stopDelay = this.bodyStateOff.heaterCooldownDelay = false;
        this.bodyStateOff.heatStatus = sys.board.valueMaps.heatStatus.getValue('off');
        if (typeof this._delayTimer !== 'undefined') clearTimeout(this._delayTimer);
        logger.info(`Heater Cooldown delay cancelled for ${this.bodyStateOff.name}`);
        this._delayTimer = undefined;
        delayMgr.deleteDelay(this.id);
        state.emitEquipmentChanges();
    }
    public clearDelay() {
        let cstateOff = state.circuits.getItemById(this.bodyStateOff.circuit);
        cstateOff.stopDelay = false;
        (async () => {
            await sys.board.circuits.setCircuitStateAsync(cstateOff.id, false);
            if (typeof this.bodyStateOn !== 'undefined') {
                this.bodyStateOn.startDelay = state.circuits.getItemById(this.bodyStateOn.circuit).startDelay = false;
                await sys.board.circuits.setCircuitStateAsync(this.bodyStateOn.circuit, true);
            }
        })();
        this.bodyStateOff.stopDelay = this.bodyStateOff.heaterCooldownDelay = false;
        this.bodyStateOff.heatStatus = sys.board.valueMaps.heatStatus.getValue('off');
        if (typeof this._delayTimer !== 'undefined') clearTimeout(this._delayTimer);
        logger.info(`Heater Cooldown delay cleared for ${this.bodyStateOff.name}`);
        this._delayTimer = undefined;
        delayMgr.deleteDelay(this.id);
        state.emitEquipmentChanges();
    }
}
interface ICleanerDelay {
    cleanerState: ICircuitState,
    bodyId: number
}
export class CleanerStartDelay extends EquipmentDelay implements ICleanerDelay {
    constructor(cs: ICircuitState, bodyId: number, delay?: number) {
        super();
        this.type = 'cleanerStartDelay';
        this.message = `${cs.name} will start after delay`;
        this.bodyId = bodyId;
        this.cleanerState = cs;
        cs.startDelay = true;
        this.startTime = new Date();
        this.endTime = new Date(this.startTime.getTime() + (delay * 1000 || sys.general.options.cleanerStartDelayTime * 1000));
        this._delayTimer = setTimeout(() => {
            logger.info(`Cleaner delay expired for ${this.cleanerState.name}`);
            this.cleanerState.startDelay = false;
            (async () => {
                try {
                    await sys.board.circuits.setCircuitStateAsync(this.cleanerState.id, true, true);
                    this.cleanerState.startDelay = false;
                } catch (err) { logger.error(`Error executing Cleaner Start Delay completion: ${err}`); }
            })();
            delayMgr.deleteDelay(this.id);
        }, delay * 1000 || sys.general.options.cleanerStartDelayTime * 1000);
        logger.info(`Cleaner delay started for ${this.cleanerState.name} - ${delay || sys.general.options.cleanerStartDelayTime}sec`);
    }
    public cleanerState: ICircuitState;
    public bodyId: number;
    public cancelDelay() {
        this.cleanerState.startDelay = false;
        if (typeof this._delayTimer !== 'undefined') clearTimeout(this._delayTimer);
        logger.info(`Cleaner Start delay cancelled for ${this.cleanerState.name}`);
        this._delayTimer = undefined;
        this.cleanerState.startDelay = false;
        (async () => {
            try {
                await sys.board.circuits.setCircuitStateAsync(this.cleanerState.id, true, true);
            } catch (err) { logger.error(`Error executing Cleaner Start Delay completion: ${err}`); }
        })();
        delayMgr.deleteDelay(this.id);
    }
    public clearDelay() {
        this.cleanerState.startDelay = false;
        if (typeof this._delayTimer !== 'undefined') clearTimeout(this._delayTimer);
        logger.info(`Cleaner Start delay cleared for ${this.cleanerState.name}`);
        this._delayTimer = undefined;
        this.cleanerState.startDelay = false;
        delayMgr.deleteDelay(this.id);
    }

    public reset(delay?: number) {
        if (typeof this._delayTimer !== 'undefined') clearTimeout(this._delayTimer);
        this.cleanerState.startDelay = true;
        logger.info(`Cleaner Start delay reset for ${this.cleanerState.name}`);
        this.startTime = new Date();
        this.endTime = new Date(this.startTime.getTime() + (delay * 1000 || sys.general.options.cleanerStartDelayTime * 1000));
        this._delayTimer = setTimeout(() => {
            logger.info(`Cleaner delay expired for ${this.cleanerState.name}`);
            this.cleanerState.startDelay = false;
            (async () => {
                try {
                    await sys.board.circuits.setCircuitStateAsync(this.cleanerState.id, true);
                    this.cleanerState.startDelay = false;
                } catch (err) { logger.error(`Error executing Cleaner Start Delay completion: ${err}`); }
            })();
            delayMgr.deleteDelay(this.id);
        }, delay * 1000 || sys.general.options.cleanerStartDelayTime * 1000);
    }
}
export class DelayManager extends Array<EquipmentDelay> {
    protected _id = 1;
    private _emitTimer: NodeJS.Timeout;
    public setDirty() {
        if (typeof this._emitTimer) clearTimeout(this._emitTimer);
        this._emitTimer = setTimeout(() => this.emitDelayState(), 1000);
    }
    public getNextId() { return this._id++; }
    public cancelDelay(id: number) {
        let del = this.find(x => x.id === id);
        if (typeof del !== 'undefined') del.cancelDelay();
    }
    public clearAllDelays() {
        for (let i = this.length - 1; i >= 0; i--) {
            let del = this[i];
            del.clearDelay();
        }
    }
    public setManualPriorityDelay(cs: ICircuitState) {
        let cds = this.filter(x => x.type === 'manualOperationPriorityDelay');
        for (let i = 0; i < cds.length; i++) {
            let delay = cds[i] as ManualPriorityDelay;
            if (delay.circuitState.id === cs.id) delay.clearDelay();
        }
        this.push(new ManualPriorityDelay(cs)); this.setDirty();
    }
    public cancelManualPriorityDelays() { this.cancelDelaysByType('manualOperationPriorityDelay'); this.setDirty(); }
    public cancelManualPriorityDelay(id: number){
            let delays = this.filter(x => x.type === 'manualOperationPriorityDelay');
            for (let i = 0; i < delays.length; i++) {
                if((delays[i] as ManualPriorityDelay).circuitState.id === id) delays[i].cancelDelay();  
        }
    }
    public setPumpValveDelay(ps: PumpState, delay?: number) {
        let cds = this.filter(x => x.type === 'pumpValveDelay');
        for (let i = 0; i < cds.length; i++) {
            let delay = cds[i] as PumpValveDelay;
            if (delay.pumpState.id === ps.id) delay.clearDelay();
        }
        this.push(new PumpValveDelay(ps, delay)); this.setDirty();
    }
    public cancelPumpValveDelays() { this.cancelDelaysByType('pumpValveDelay'); this.setDirty(); }
    public setHeaterStartupDelay(hs: HeaterState, delay?: number) {
        let cds = this.filter(x => x.type === 'heaterStartupDelay');
        for (let i = 0; i < cds.length; i++) {
            let delay = cds[i] as HeaterStartupDelay;
            if (delay.heaterState.id === hs.id) delay.cancelDelay();
        }
        this.push(new HeaterStartupDelay(hs, delay)); this.setDirty();
    }
    public cancelHeaterStartupDelays() {
        this.cancelDelaysByType('heaterStartupDelay');
    }
    public setHeaterCooldownDelay(bsOff: BodyTempState, bsOn?: BodyTempState, delay?: number) {
        logger.info(`Setting Heater Cooldown Delay for ${bsOff.name}`);
        let cds = this.filter(x => x.type === 'heaterCooldownDelay');
        for (let i = 0; i < cds.length; i++) {
            let delay = cds[i] as HeaterCooldownDelay;
            if (delay.bodyStateOff.id === bsOff.id) {
                if(typeof bsOn !== 'undefined') logger.info(`Found Cooldown Delay adding on circuit ${bsOn.name}`);
                delay.setBodyStateOn(bsOn);
                this.setDirty();
                return;
            }
        }
        this.push(new HeaterCooldownDelay(bsOff, bsOn, delay));
        this.setDirty();
    }
    public clearBodyStartupDelay(bs: BodyTempState) {
        logger.info(`Clearing startup delays for ${bs.name}`);
        // We are doing this non type safety thing below so that
        // we can only emit when the body is cleared.
        let cds = this.filter(x => {
            return x.type === 'heaterCooldownDelay' &&
                typeof x['bodyStateOn'] !== 'undefined' &&
                x['bodyStateOn'].id === bs.id;
        });
        for (let i = 0; i < cds.length; i++) {
            let delay = cds[i] as HeaterCooldownDelay;
            logger.info(`Clearing ${bs.name} from Cooldown Delay`);
            delay.setBodyStateOn();
        }
        if (cds.length) this.setDirty();
    }
    public cancelHeaterCooldownDelays() { this.cancelDelaysByType('heaterCooldownDelay'); }
    public setCleanerStartDelay(cs: ICircuitState, bodyId: number, delay?: number) {
        let cds = this.filter(x => x.type === ('cleanerStartDelay' || 'cleanerSolarDelay'));
        let startDelay: CleanerStartDelay;
        for (let i = 0; i < cds.length; i++) {
            let delay = cds[i] as unknown as ICleanerDelay;
            if (delay.cleanerState.id === cs.id) {
                if (delay.bodyId !== bodyId || cds[i].type !== 'cleanerStartDelay') cds[i].cancelDelay();
                else if (typeof startDelay !== 'undefined') {
                    startDelay.cancelDelay();
                    startDelay = cds[i] as CleanerStartDelay;
                }
                else startDelay = cds[i] as CleanerStartDelay;
            }
        }
        if (typeof startDelay !== 'undefined') {
            startDelay.reset(delay);
            this.setDirty();
        }
        else {
            this.push(new CleanerStartDelay(cs, bodyId, delay));
            this.setDirty();
        }
    }
    public cancelCleanerStartDelays(bodyId?: number) {
        if (typeof bodyId === 'undefined') this.cancelDelaysByType('cleanerStartDelay');
        else {
            let delays = this.filter(x => x.type === 'cleanerStartDelay' && x['bodyId'] === bodyId);
            for (let i = 0; i < delays.length; i++) {
                delays[i].cancelDelay();
            }
            if (delays.length > 0) this.setDirty();
        }
    }
    public clearCleanerStartDelays(bodyId?: number) {
        if (typeof bodyId === 'undefined') this.clearDelaysByType('cleanerStartDelay');
        else {
            let delays = this.filter(x => x.type === 'cleanerStartDelay' && x['bodyId'] === bodyId);
            for (let i = 0; i < delays.length; i++) {
                delays[i].clearDelay();
            }
            if (delays.length > 0) this.setDirty();
        }
    }
    public deleteDelay(id: number) {
        for (let i = this.length - 1; i >= 0; i--) {
            if (this[i].id === id) {
                this.splice(i, 1);
                this.setDirty();
            }
        }
    }
    public setSolarStartupDelay
    protected cancelDelaysByType(type: string) {
        let delays = this.filter(x => x.type === type);
        for (let i = 0; i < delays.length; i++) {
            delays[i].cancelDelay();
        }
    }
    protected clearDelaysByType(type: string) {
        let delays = this.filter(x => x.type === type);
        for (let i = 0; i < delays.length; i++) {
            delays[i].clearDelay();
        }
        if (delays.length > 0) this.setDirty();
    }
    public serialize() {
        try {
            let delays = [];
            for (let i = 0; i < this.length; i++) {
                delays.push(this[i].serialize());
            }
            return delays;
        } catch (err) { logger.error(`Error serializing delays: ${err.message}`); }
    }
    public emitDelayState() {
        try {
            // We have to use a custom serializer because the properties of
            // our delays will create a circular reference due to the timers and state references.
            webApp.emitToClients('delays', this.serialize());
        } catch (err) { logger.error(`Error emitting delay states ${err.message}`); }
    }
}
export let delayMgr = new DelayManager();