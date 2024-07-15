import { EquipmentNotFoundError, InvalidEquipmentDataError, InvalidEquipmentIdError, ParameterOutOfRangeError } from '../../Errors';
import { utils, Timestamp } from '../../Constants';
import { logger } from '../../../logger/Logger';

import { NixieEquipment, NixieChildEquipment, NixieEquipmentCollection, INixieControlPanel } from "../NixieEquipment";
import { CircuitGroup, CircuitGroupCircuit, ICircuitGroup, ICircuitGroupCircuit, LightGroup, LightGroupCircuit, Schedule, ScheduleCollection, sys } from "../../../controller/Equipment";
import { ICircuitState, CircuitGroupState, ICircuitGroupState, ScheduleState, ScheduleTime, state, } from "../../State";
import { setTimeout, clearTimeout } from 'timers';
import { NixieControlPanel } from '../Nixie';
import { webApp, InterfaceServerResponse } from "../../../web/Server";
import { delayMgr } from '../../../controller/Lockouts';
import { time } from 'console';


export class NixieScheduleCollection extends NixieEquipmentCollection<NixieSchedule> {
    public async setScheduleAsync(schedule: Schedule, data: any) {
        // By the time we get here we know that we are in control and this is a schedule we should be in control of.
        try {
            let c: NixieSchedule = this.find(elem => elem.id === schedule.id) as NixieSchedule;
            if (typeof c === 'undefined') {
                schedule.master = 1;
                c = new NixieSchedule(this.controlPanel, schedule);
                this.push(c);
                await c.setScheduleAsync(data);
                logger.info(`A Schedule was not found for id #${schedule.id} creating Schedule`);
            }
            else 
                await c.setScheduleAsync(data);
        }
        catch (err) { logger.error(`setScheduleAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async initAsync(schedules: ScheduleCollection) {
        try {
            for (let i = 0; i < schedules.length; i++) {
                let schedule = schedules.getItemByIndex(i);
                if (schedule.master === 1) {
                    if (typeof this.find(elem => elem.id === schedule.id) === 'undefined') {
                        logger.info(`Initializing Schedule ${schedule.id}`);
                        let nSchedule = new NixieSchedule(this.controlPanel, schedule);
                        this.push(nSchedule);
                    }
                }
            }
        }
        catch (err) { logger.error(`Nixie Schedule initAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async triggerSchedules() {
        try {
            // This is a listing of all the active schedules that are either currently on or should be on.
            let sscheds: ScheduleState[] = state.schedules.getActiveSchedules();
            // Go through all the schedules and hash them by circuit id.
            let circuits: { circuitId: number, cstate: ICircuitState, hasNixie: boolean, sscheds: ScheduleState[] }[] = []
            for (let i = 0; i < sscheds.length; i++) {
                // We only care about schedules that are currently running or should be running.
                if (!sscheds[i].isOn && !sscheds[i].scheduleTime.shouldBeOn) continue;
                let circ = circuits.find(elem => elem.circuitId === sscheds[i].circuit);
                let sched = sys.schedules.getItemById(sscheds[i].id)
                if (typeof circ === 'undefined') circuits.push({
                    circuitId: sscheds[i].circuit,
                    cstate: state.circuits.getInterfaceById(sscheds[i].circuit), hasNixie: sched.master !== 0, sscheds: [sscheds[i]]
                });
                else {
                    if (sched.master !== 0) circ.hasNixie = true;
                    circ.sscheds.push(sscheds[i]);
                }
            }
            // Sort this so that body circuits are evaluated first.  This is required when there are schedules for things like cleaner
            // or delay circuits.  If we do not do this then a schedule that requires the pool to be on for instance will never
            // get triggered.
            circuits.sort((x, y) => y.circuitId === 6 || y.circuitId === 1 ? 1 : y.circuitId - x.circuitId);


            /*
            RSG 5-8-22
            Manual OP needs to play a role here.From the IC manual: 
            # Manual OP General

            From the manual: 
            Manual OP Priority: ON: This feature allows for a circuit to be manually switched OFF and switched ON within a scheduled program, 
            the circuit will continue to run for a maximum of 12 hours or whatever that circuit Egg Timer is set to, after which the scheduled 
            program will resume. This feature will turn off any scheduled program to allow manual pump override.The Default setting is OFF.

            ## When on
            1.  If a schedule should be on and the user turns the schedule off then the schedule expires until such time as the time off has 
            expired.When that occurs the schedule should be reset to run at the designated time.If the user resets the schedule by turning the 
            circuit back on again ~~then the schedule will resume and turn off at the specified time~~then the schedule will be ignored and 
            the circuit will run until the egg timer expires or the circuit / feature is manually turned off.This setting WILL affect 
            other schedules that may impact this circuit.

            ## When off
            1. "Normal" = If a schedule should be on and the user turns the schedule off then the schedule expires until such time as the time 
            off has expired.When that occurs the schedule should be reset to run at the designated time.If the user resets the schedule by 
            turning the circuit back on again then the schedule will resume and turn off at the specified time.
            */

            let mOP = sys.general.options.manualPriority;

            // Now lets evaluate the schedules by virtue of their state related to the circuits.
            for (let i = 0; i < circuits.length; i++) {
                let c = circuits[i];
                if (!c.hasNixie) continue; // If this has nothing to do with Nixie move on.
                let shouldBeOn = typeof c.sscheds.find(elem => elem.scheduleTime.shouldBeOn === true) !== 'undefined';
                // 1. If the feature is currently running and the schedule is not on then it will set the priority for the circuit to [scheduled].
                // 2. If the feature is currently running but there are overlapping schedules then this will catch any schedules that need to be turned off.
                if (c.cstate.isOn && shouldBeOn) {
                    c.cstate.priority = shouldBeOn ? 'scheduled' : 'manual';
                    for (let j = 0; j < c.sscheds.length; j++) {
                        let ssched = c.sscheds[j];
                        ssched.triggered = ssched.scheduleTime.shouldBeOn;
                        if (mOP && ssched.manualPriorityActive) {
                            ssched.isOn = false;
                            // Not sure what setting a delay for this does but ok.
                            if (!c.cstate.manualPriorityActive) delayMgr.setManualPriorityDelay(c.cstate);
                        }
                        else ssched.isOn = ssched.scheduleTime.shouldBeOn && !ssched.manualPriorityActive;
                    }
                }
                // 3. If the schedule should be on and it isn't and the schedule has not been triggered then we need to 
                // turn the schedule and circuit on.
                else if (!c.cstate.isOn && shouldBeOn) {
                    // The circuit is not on but it should be. Check to ensure all schedules have been triggered.
                    let untriggered = false;
                    // If this schedule has been triggered then mOP comes into play if manualPriority has been set in the config.
                    for (let j = 0; j < c.sscheds.length; j++) {
                        let ssched = c.sscheds[j];
                        // If this schedule is turned back on then the egg timer will come into play.  This is all that is required
                        // for the mOP function.  The setEndDate for the circuit makes the determination as to when off will occur.
                        if (mOP && ssched.scheduleTime.shouldBeOn && ssched.triggered) {
                            ssched.manualPriorityActive = true;
                        }
                        // The reason we check to see if anything has not been triggered is so we do not have to perform the circuit changes
                        // if the schedule has already been triggered.
                        else if (!ssched.triggered) untriggered = true;
                    }
                    let heatSource = { heatMode: 'nochange', heatSetpoint: undefined, coolSetpoint: undefined };
                    // Check to see if any of the schedules have not been triggered.  If they haven't then trigger them and turn the circuit on.
                    if (untriggered) {
                        // Get the heat modes and temps for all the schedules that have not been triggered.
                        let body = sys.bodies.find(elem => elem.circuit === c.circuitId);
                        if (typeof body !== 'undefined') {
                            // If this is a body circuit then we need to set the heat mode and the temperature but only do this once. If
                            // the user changes it later then that is on them.
                            for (let j = 0; j < c.sscheds.length; j++) {
                                if (sscheds[j].triggered) continue;
                                let ssched = sscheds[j];
                                let hs = sys.board.valueMaps.heatSources.transform(c.sscheds[i].heatSource);
                                switch (hs.name) {
                                    case 'nochange':
                                    case 'dontchange':
                                        break;
                                    case 'off':
                                        // If the heatsource setting is off only change it if it is currently don't change.
                                        if (heatSource.heatMode === 'nochange') heatSource.heatMode = hs.name;
                                        break;
                                    default:
                                        switch (heatSource.heatMode) {
                                            case 'off':
                                            case 'nochange':
                                            case 'dontchange':
                                                heatSource.heatMode = hs.name;
                                                heatSource.heatSetpoint = ssched.heatSetpoint;
                                                heatSource.coolSetpoint = hs.hasCoolSetpoint ? ssched.coolSetpoint : undefined;
                                                break;
                                        }
                                        break;
                                }
                                // Ok if we need to change the setpoint or the heatmode then lets do it.
                                if (heatSource.heatMode !== 'nochange') {
                                    await sys.board.bodies.setHeatModeAsync(body, sys.board.valueMaps.heatSources.getValue(heatSource.heatMode));
                                    if (typeof heatSource.heatSetpoint !== 'undefined') await sys.board.bodies.setHeatSetpointAsync(body, heatSource.heatSetpoint);
                                    if (typeof heatSource.coolSetpoint !== 'undefined') await sys.board.bodies.setCoolSetpointAsync(body, heatSource.coolSetpoint);
                                }
                            }
                        }
                        // By now we have everything we need to turn on the circuit.
                        for (let j = 0; j < c.sscheds.length; j++) {
                            let ssched = c.sscheds[j];
                            if (!ssched.triggered && ssched.scheduleTime.shouldBeOn) {
                                if (!c.cstate.isOn) {
                                    await sys.board.circuits.setCircuitStateAsync(c.circuitId, true);
                                }
                                let ssched = c.sscheds[j];
                                c.cstate.priority = 'scheduled';
                                ssched.triggered = ssched.isOn = ssched.scheduleTime.shouldBeOn;
                                ssched.manualPriorityActive = false;
                            }
                        }
                    }
                }
                else if (c.cstate.isOn && !shouldBeOn) {
                    // Time to turn off the schedule.
                    for (let j = 0; j < c.sscheds.length; j++) {
                        let ssched = c.sscheds[j];
                        // Only turn off the schedule if it is not actively mOP.
                        if (c.cstate.isOn && !ssched.manualPriorityActive) await sys.board.circuits.setCircuitStateAsync(c.circuitId, false);
                        c.cstate.priority = 'manual';
                        // The schedule has expired we need to clear all the info for it.
                        ssched.manualPriorityActive = ssched.triggered = ssched.isOn = c.sscheds[j].scheduleTime.shouldBeOn;
                    }
                }
                else if (!c.cstate.isOn && !shouldBeOn) {
                    // Everything is off so lets clear it all.
                    for (let j = 0; j < c.sscheds.length; j++) {
                        let ssched = c.sscheds[j];
                        ssched.isOn = ssched.manualPriorityActive = ssched.triggered = false;
                    }
                }
                state.emitEquipmentChanges();
            }
        } catch (err) { logger.error(`Error triggering nixie schedules: ${err.message}`); }
    }
}
export class NixieSchedule extends NixieEquipment {
    public pollingInterval: number = 10000;
    private _pollTimer: NodeJS.Timeout = null;
    public schedule: Schedule;
    private suspended: boolean = false;
    private resumed: boolean = false;
    private running: boolean = false;
    constructor(ncp: INixieControlPanel, schedule: Schedule) {
        super(ncp);
        this.schedule = schedule;
        this.pollEquipmentAsync();
        let ssched = state.schedules.getItemById(schedule.id, true);
        ssched.circuit = schedule.circuit;
        ssched.scheduleDays = schedule.scheduleDays;
        ssched.scheduleType = schedule.scheduleType;
        ssched.changeHeatSetpoint = schedule.changeHeatSetpoint;
        ssched.heatSetpoint = schedule.heatSetpoint;
        ssched.coolSetpoint = schedule.coolSetpoint;
        ssched.heatSource = schedule.heatSource;
        ssched.startTime = schedule.startTime;
        ssched.endTime = schedule.endTime;
        ssched.startTimeType = schedule.startTimeType;
        ssched.endTimeType = schedule.endTimeType;
        ssched.startDate = schedule.startDate;
    }
    public get id(): number { return typeof this.schedule !== 'undefined' ? this.schedule.id : -1; }
    public async setScheduleAsync(data: any) {
        try {
            let schedule = this.schedule;
            let sschedule = state.schedules.getItemById(schedule.id);
            sschedule.scheduleTime.calculated = false;
        }
        catch (err) { logger.error(`Nixie setScheduleAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async pollEquipmentAsync() {}
    public async validateSetupAsync(Schedule: Schedule, temp: ScheduleState) {
        try {
            // The validation will be different if the Schedule is on or not.  So lets get that information.
        } catch (err) { logger.error(`Nixie Error checking Schedule Hardware ${this.schedule.id}: ${err.message}`); return Promise.reject(err); }
    }
    public async closeAsync() {
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
        }
        catch (err) { logger.error(`Nixie Schedule closeAsync: ${err.message}`); return Promise.reject(err); }
    }
    public logData(filename: string, data: any) { this.controlPanel.logData(filename, data); }
    /*
    public async triggerScheduleAsync(ctx: NixieScheduleContext) {
        try {
            if (this.schedule.isActive === false) return;
            let ssched = state.schedules.getItemById(this.id, true);
            // RULES FOR NIXIE SCHEDULES
            // ------------------------------------------------------
            // Schedules can be overridden so it is important that when the 
            // state is changed for the schedule if it is currently active that
            // Nixie does not override the state of the scheduled circuit or feature.
            //RSG 5-8-22
            //Manual OP needs to play a role here.  From the IC manual: 
            //# Manual OP General

            //From the manual: 
            //Manual OP Priority: ON: This feature allows for a circuit to be manually switched OFF and switched ON within a scheduled program, the circuit will continue to run for a maximum of 12 hours or whatever that circuit Egg Timer is set to, after which the scheduled program will resume. This feature will turn off any scheduled program to allow manual pump override. The Default setting is OFF.

            //## When on
            //1.  If a schedule should be on and the user turns the schedule off then the schedule expires until such time as the time off has expired.  When that occurs the schedule should be reset to run at the designated time.  If the user resets the schedule by turning the circuit back on again ~~then the schedule will resume and turn off at the specified time~~ then the schedule will be ignored and the circuit will run until the egg timer expires or the circuit/feature is manually turned off.  This setting WILL affect other schedules that may impact this circuit.

            //## When off
            //1. "Normal" = If a schedule should be on and the user turns the schedule off then the schedule expires until such time as the time off has expired.  When that occurs the schedule should be reset to run at the designated time.  If the user resets the schedule by turning the circuit back on again then the schedule will resume and turn off at the specified time.

            //Interestingly, there also seems to be a schedule level setting for this.  We will ignore that for now as the logic could get much more complicated.
            // 1. If the feature happens to be running and the schedule is not yet turned on then
            // it should not override what the user says.
            // 2. If a schedule is running and the state of the circuit changes to off then the new state should suspend the schedule
            // until which time the feature is turned back on again.  
            // Manual OP Off: Then the off time will come into play.
            // Manual OP On: The egg timer will take precedence.  No other schedules will turn off this feature
            // 3. Egg timers will be managed by the individual circuit.  If this is being turned on via the schedule then
            // the egg timer is not in effect.
            // 4. If there are overlapping schedules, then the off date is determined by
            // the maximum off date.
            // 5. If a schedule should be on and the user turns the schedule off then the schedule expires until such time
            // as the time off has expired.  When that occurs the schedule should be reset to run at the designated time.  If the
            // user resets the schedule by turning the circuit back on again then the schedule will...
            // Manual OP Off: ..resume and turn off at the specified time.
            // Manual OP On: ...continue to run until the egg timer time is reached or the circuit is manually turned off.
            // 6. Heat setpoints should only be changed when the schedule is first turning on the scheduled circuit.
            // 7. If schedule is disabled, skip it
            // 8. Manual OP On: If another schedule has been resumed and this schedule would affect that feature, do not start this schedule.

            // Definitions:
            // this.resumed = Flag to show if this schedule has been suspended and resumed.
            // this.manualPriorityActive = Flag to show if this schedule has been suspended and resumed, and Manual Priority (global is active)
            // this.delayed = Flag to show if this schedule is running, but another schedule is mOP and overriding this one.
            let cstate = state.circuits.getInterfaceById(this.schedule.circuit, false);
            let circuit = sys.circuits.getInterfaceById(this.schedule.circuit, false, { isActive: false });
            if (circuit.isActive === false) {
                ssched.isOn = false;
                return;
            }
            let shouldBeOn = ssched.shouldBeOn(); // This should also set the validity for the schedule if there are errors.
            let manualPriorityActive: boolean = shouldBeOn ? sys.board.schedules.manualPriorityActive(ssched) : false;
            //console.log(`Processing schedule ${this.schedule.id} - ${circuit.name} : ShouldBeOn: ${shouldBeOn} ManualPriorityActive: ${manualPriorityActive} Running: ${this.running} Suspended: ${this.suspended} Resumed: ${this.resumed}`);


            // COND 1: The schedule should be on and the schedule is not yet on.
            if (shouldBeOn && !this.running && !this.suspended || manualPriorityActive) {
                // If the circuit is on then we need to clear the suspended flag and set the running flag.
                if (cstate.isOn) {
                    // If the suspended flag was previously on then we need to clear it
                    // because the user turned it back on.
                    this.suspended = false;
                }
                if (manualPriorityActive) {
                    ssched.manualPriorityActive = true;
                    ssched.isOn = false;
                }
                else {
                    ctx.setCircuit(circuit.id, true);
                    // Alright we are turning on the circuit.  If these are body circuits then we need to determine
                    // whether we will be setting the setpoints/heatmode on the body.
                    let body = sys.bodies.find(elem => elem.circuit === circuit.id);
                    if (typeof body !== 'undefined') {
                        let heatSource = sys.board.valueMaps.heatSources.transform(this.schedule.heatSource);
                        if (heatSource.name !== 'nochange') {
                            switch (heatSource.name) {
                                case 'nochange':
                                case 'dontchange':
                                    break;
                                case 'off':
                                    ctx.setHeatMode(body.id, 'off');
                                    break;
                                default:
                                    ctx.setHeatMode(body.id, heatSource.name, this.schedule.heatSetpoint, heatSource.hasCoolSetpoint ? this.schedule.coolSetpoint : undefined);
                                    break;
                            }
                        }
                    }
                    ssched.manualPriorityActive = false;
                    ssched.isOn = true;
                }
                this.running = true;
            }
            else if (shouldBeOn && this.running) {
                // Check to see if circuit is on, if not turn it on.
                // RKS: 07-09-23 - This was in PR#819 buut this needs further review since the circuit states are not to be set here. This would
                // trash delays and manualPriority.
                // if(!cstate.isOn) ctx.setCircuit(circuit.id, true);

                // With mOP, we need to see if the schedule will come back into play and also set the circut
                if (this.suspended && cstate.isOn) {
                    if (sys.general.options.manualPriority) {
                        delayMgr.setManualPriorityDelay(cstate);
                        ssched.manualPriorityActive = true;
                    }
                    this.resumed = true;
                }
                this.suspended = !cstate.isOn;
                if (manualPriorityActive) {
                    ssched.isOn = false;
                    ssched.manualPriorityActive = true;
                }
                else {
                    ssched.isOn = cstate.isOn;
                    ssched.manualPriorityActive = false;
                }
            }
            // Our schedule has expired it is time to turn it off, but only if !manualPriorityActive.
            else if (!shouldBeOn) {
                // Turn this sucker off.  But wait if there is an overlapping schedule then we should
                // not turn it off. We will need some logic to deal with this.
                if (this.running && !cstate.manualPriorityActive) ctx.setCircuit(circuit.id, false);
                ssched.isOn = false;
                this.running = false;
                this.suspended = false;
                this.resumed = false;
                ssched.manualPriorityActive = false;
            }
            if (!shouldBeOn && ssched.isOn === true) {
                // Turn off the circuit.
                if (!manualPriorityActive) ctx.setCircuit(circuit.id, false);
                ssched.isOn = false;
            }
            ssched.emitEquipmentChange();
        } catch (err) { logger.error(`Error processing schedule: ${err.message}`); }
    }
    */
}
