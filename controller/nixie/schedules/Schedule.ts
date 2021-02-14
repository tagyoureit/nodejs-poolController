import { EquipmentNotFoundError, InvalidEquipmentDataError, InvalidEquipmentIdError, ParameterOutOfRangeError } from '../../Errors';
import { utils, Timestamp } from '../../Constants';
import { logger } from '../../../logger/Logger';

import { NixieEquipment, NixieChildEquipment, NixieEquipmentCollection, INixieControlPanel } from "../NixieEquipment";
import { Schedule, ScheduleCollection, sys } from "../../../controller/Equipment";
import { ScheduleState, state, } from "../../State";
import { setTimeout, clearTimeout } from 'timers';
import { NixieControlPanel } from '../Nixie';
import { webApp, InterfaceServerResponse } from "../../../web/Server";

export class NixieScheduleCollection extends NixieEquipmentCollection<NixieSchedule> {
    public async setScheduleAsync(schedule: Schedule, data: any) {
        // By the time we get here we know that we are in control and this is a REMChem.
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
            this.length = 0;
            for (let i = 0; i < schedules.length; i++) {
                let schedule = schedules.getItemByIndex(i);
                if (schedule.master === 1) {
                    logger.info(`Initializing Schedule ${schedule.id}`);
                    let nSchedule = new NixieSchedule(this.controlPanel, schedule);
                    this.push(nSchedule);
                }
            }
        }
        catch (err) { logger.error(`Nixie Schedule initAsync: ${err.message}`); return Promise.reject(err); }
    }
}
export class NixieSchedule extends NixieEquipment {
    public pollingInterval: number = 10000;
    private _pollTimer: NodeJS.Timeout = null;
    public schedule: Schedule;
    constructor(ncp: INixieControlPanel, schedule: Schedule) {
        super(ncp);
        this.schedule = schedule;
        this.pollEquipmentAsync();
    }
    public get id(): number { return typeof this.schedule !== 'undefined' ? this.schedule.id : -1; }
    public async setScheduleAsync(data: any) {
        try {
            let schedule = this.schedule;
        }
        catch (err) { logger.error(`Nixie setScheduleAsync: ${err.message}`); return Promise.reject(err); }
    }
    public async pollEquipmentAsync() {
        try {
            if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
            this._pollTimer = null;
            let success = false;
        }
        catch (err) { logger.error(`Nixie Error polling Schedule - ${err}`); }
        finally { this._pollTimer = setTimeout(async () => await this.pollEquipmentAsync(), this.pollingInterval || 10000); }
    }
    private async checkHardwareStatusAsync(connectionId: string, deviceBinding: string) {
        try {
            let dev = await NixieEquipment.getDeviceService(connectionId, `/status/device/${deviceBinding}`);
            return dev;
        } catch (err) { logger.error(`Nixie Schedule checkHardwareStatusAsync: ${err.message}`); return { hasFault: true } }
    }
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
}
