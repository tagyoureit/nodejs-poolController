import { EquipmentNotFoundError, InvalidEquipmentDataError, InvalidEquipmentIdError, ParameterOutOfRangeError } from '../../Errors';
import { utils, Timestamp } from '../../Constants';
import { logger } from '../../../logger/Logger';

import { NixieEquipment, NixieChildEquipment, NixieEquipmentCollection, INixieControlPanel } from "../NixieEquipment";
import { CircuitGroup, CircuitGroupCircuit, ICircuitGroup, ICircuitGroupCircuit, LightGroup, LightGroupCircuit, Schedule, ScheduleCollection, sys } from "../../../controller/Equipment";
import { CircuitGroupState, ICircuitGroupState, ScheduleState, state, } from "../../State";
import { setTimeout, clearTimeout } from 'timers';
import { NixieControlPanel } from '../Nixie';
import { webApp, InterfaceServerResponse } from "../../../web/Server";
import { delayMgr } from '../../../controller/Lockouts';


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
            else {
                await c.setScheduleAsync(data);
            }
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
            let ctx = new NixieScheduleContext();
            for (let i = 0; i < this.length; i++) {
                (this[i] as NixieSchedule).triggerScheduleAsync(ctx);
            }
            // Set the heat modes for the bodies.
            for (let i = 0; i < ctx.heatModes.length; i++) {
                let mode = ctx.heatModes[i];
                let body = sys.bodies.getItemById(mode.id);
                await sys.board.bodies.setHeatModeAsync(sys.bodies.getItemById(mode.id), mode.heatMode);
                if (typeof mode.heatSetpoint !== 'undefined') await sys.board.bodies.setHeatSetpointAsync(body, mode.heatSetpoint);
                if (typeof mode.coolSetpoint !== 'undefined') await sys.board.bodies.setCoolSetpointAsync(body, mode.coolSetpoint);
            }
            // Alright now that we are done with that we need to set all the circuit states that need changing.
            for (let i = 0; i < ctx.circuits.length; i++) {
                let circuit = ctx.circuits[i];
                await sys.board.circuits.setCircuitStateAsync(circuit.id, circuit.isOn);
            }
        } catch (err) { logger.error(`Error triggering schedules: ${err}`); }
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
        }
        catch (err) { logger.error(`Nixie setScheduleAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async pollEquipmentAsync() {
        let self = this;
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let success = false;
        }
        catch (err) { logger.error(`Nixie Error polling Schedule - ${err}`); }
        finally { this._pollTimer = setTimeout(async () => await self.pollEquipmentAsync(), this.pollingInterval || 10000); }
    }
    public async validateSetupAsync(Schedule: Schedule, temp: ScheduleState) {
        try {
            // The validation will be different if the Schedule is on or not.  So lets get that information.
        } catch (err) { logger.error(`Nixie Error checking Schedule Hardware ${this.schedule.id}: ${err.message}`); return Promise.reject(err); }
    }
    public async triggerScheduleAsync(ctx: NixieScheduleContext) {
        try {
            if (this.schedule.isActive === false) return;
            let ssched = state.schedules.getItemById(this.id, true);
            // RULES FOR NIXIE SCHEDULES
            // ------------------------------------------------------
            // Schedules can be overridden so it is important that when the 
            // state is changed for the schedule if it is currently active that
            // Nixie does not override the state of the scheduled circuit or feature.
            /*
            RSG 5-8-22
            Manual OP needs to play a role here.  From the IC manual: 
            # Manual OP General

            From the manual: 
            Manual OP Priority: ON: This feature allows for a circuit to be manually switched OFF and switched ON within a scheduled program, the circuit will continue to run for a maximum of 12 hours or whatever that circuit Egg Timer is set to, after which the scheduled program will resume. This feature will turn off any scheduled program to allow manual pump override. The Default setting is OFF.

            ## When on
            1.  If a schedule should be on and the user turns the schedule off then the schedule expires until such time as the time off has expired.  When that occurs the schedule should be reset to run at the designated time.  If the user resets the schedule by turning the circuit back on again ~~then the schedule will resume and turn off at the specified time~~ then the schedule will be ignored and the circuit will run until the egg timer expires or the circuit/feature is manually turned off.  This setting WILL affect other schedules that may impact this circuit.

            ## When off
            1. "Normal" = If a schedule should be on and the user turns the schedule off then the schedule expires until such time as the time off has expired.  When that occurs the schedule should be reset to run at the designated time.  If the user resets the schedule by turning the circuit back on again then the schedule will resume and turn off at the specified time.

            Interestingly, there also seems to be a schedule level setting for this.  We will ignore that for now as the logic could get much more complicated.
            */
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
            let shouldBeOn = this.shouldBeOn(); // This should also set the validity for the schedule if there are errors.
            
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
                // With mOP, we need to see if the schedule will come back into play and also set the circut
                if (this.suspended && cstate.isOn) {
                    if (sys.general.options.manualPriority) {
                        delayMgr.setManualPriorityDelay(cstate);
                        ssched.manualPriorityActive = true;
                    }
                    this.resumed = true;
                }
                this.suspended = !cstate.isOn;
                if (manualPriorityActive){
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
    protected calcTime(dt: Timestamp, type: number, offset: number): Timestamp {
        let tt = sys.board.valueMaps.scheduleTimeTypes.transform(type);
        switch (tt.name) {
            case 'sunrise':
                return new Timestamp(state.heliotrope.sunrise);
            case 'sunset':
                return new Timestamp(state.heliotrope.sunset);
            default:
                return dt.startOfDay().addMinutes(offset);
        }
    }
    protected shouldBeOn(): boolean {
        if (this.schedule.isActive === false) return false;
        if (this.schedule.disabled) return false;
        // Be careful with toDate since this returns a mutable date object from the state timestamp.  startOfDay makes it immutable.
        let sod = state.time.startOfDay()
        let dow = sod.toDate().getDay();
        let type = sys.board.valueMaps.scheduleTypes.transform(this.schedule.scheduleType);
        if (type.name === 'runonce') {
            // If we are not matching up with the day then we shouldn't be running.
            if (sod.fullYear !== this.schedule.startYear || sod.month + 1 !== this.schedule.startMonth || sod.date !== this.schedule.startDay) return false;
        }
        else {
            // Convert the dow to the bit value.
            let sd = sys.board.valueMaps.scheduleDays.toArray().find(elem => elem.dow === dow);
            let dayVal = sd.bitVal || sd.val;  // The bitval allows mask overrides.
            // First check to see if today is one of our days.
            if ((this.schedule.scheduleDays & dayVal) === 0) return false;
        }
        // Next normalize our start and end times.  Fortunately, the start and end times are normalized here so that
        // [0, {name: 'manual', desc: 'Manual }]
        // [1, { name: 'sunrise', desc: 'Sunrise' }],
        // [2, { name: 'sunset', desc: 'Sunset' }]
        let tmStart = this.calcTime(sod, this.schedule.startTimeType, this.schedule.startTime).getTime();
        let tmEnd = this.calcTime(sod, this.schedule.endTimeType, this.schedule.endTime).getTime();

        if (isNaN(tmStart)) return false;
        if (isNaN(tmEnd)) return false;
        // If we are past our window we should be off.
        let tm = state.time.getTime();
        if (tm >= tmEnd) return false;
        if (tm <= tmStart) return false;

        // Let's now check to see 

        // If we make it here we should be on.
        return true;
    }
    

    public async closeAsync() {
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
        }
        catch (err) { logger.error(`Nixie Schedule closeAsync: ${err.message}`); return Promise.reject(err); }
    }
    public logData(filename: string, data: any) { this.controlPanel.logData(filename, data); }
}
class NixieScheduleContext {
    constructor() {

    }
    public circuits: { id: number, isOn: boolean }[] = [];
    public heatModes: { id: number, heatMode: number, heatSetpoint?: number, coolSetpoint?: number }[] = [];
    public setCircuit(id: number, isOn: boolean) {
        let c = this.circuits.find(elem => elem.id === id);
        if (typeof c === 'undefined') this.circuits.push({ id: id, isOn: isOn });
        else c.isOn = isOn;
    }
    public setHeatMode(id: number, heatMode: string, heatSetpoint?: number, coolSetpoint?: number) {
        let mode = sys.board.valueMaps.heatModes.transformByName(heatMode);
        let hm = this.heatModes.find(elem => elem.id == id);
        if (typeof hm === 'undefined') this.heatModes.push({ id: id, heatMode: mode.val, heatSetpoint: heatSetpoint, coolSetpoint: coolSetpoint });
        else {
            hm.heatMode = mode.val;
            if (typeof heatSetpoint !== 'undefined') hm.heatSetpoint = heatSetpoint;
            if (typeof coolSetpoint !== 'undefined') hm.coolSetpoint = coolSetpoint;
        }
    }
}