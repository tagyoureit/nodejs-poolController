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
import { Inbound } from "../Messages";
import { sys, Schedule, EggTimer } from "../../../Equipment";
import { state } from "../../../State";
import { ControllerType } from "../../../Constants";
import { logger } from "../../../../logger/Logger";
export class ScheduleMessage {
    // [165, 63, 15, 16, 30, 42][3, 28, 5, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][1, 143]
    //

    // [165, 63, 15, 16, 164, 48][0, 0, 0, 0, 0, 0, 39, 159, 117, 122, 137, 64, 92, 201, 126, 201, 79, 248, 39, 141, 2, 96, 20, 108, 123, 22, 56, 30, 8, 21, 49, 147, 22, 64, 24, 141, 4, 29, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][12, 130]
    // [165, 63, 15, 16, 164, 48][0, 0, 0, 0, 0, 0, 39, 159, 117, 122, 137, 64, 92, 228, 126, 201, 79, 248, 39, 141, 2, 96, 20, 108, 123, 22, 56, 30, 8, 21, 49, 147, 22, 64, 24, 141, 4, 29, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][12, 157]

    // Change heat source #1
    // [165, 63, 15, 16, 30, 42][3, 28, 32, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][1, 170]
    // [165, 63, 15, 16, 30, 42][3, 28, 5, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][1, 143]

    // Run once
    // [165, 63, 15, 16, 30, 42][3, 8, 128, 128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][2, 86]
    // [165, 63, 15, 16, 30, 42][3, 8, 129, 128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][2, 87]
    public static _maxSchedId: number = 0;
    public static process(msg: Inbound): void {
        if (sys.controllerType === ControllerType.IntelliCenter)
            switch (msg.extractPayloadByte(1)) {
                case 0:
                case 1:
                case 2:
                case 3:
                case 4:
                    ScheduleMessage.processStartTimes(msg);
                    break;
                case 5:
                case 6:
                    ScheduleMessage.processCircuit(msg);
                    break;
                case 8: // Schedule Type
                case 9:
                case 10:
                    ScheduleMessage.processScheduleType(msg);
                    break;
                case 11:
                case 12:
                case 13:
                    ScheduleMessage.processDays(msg);
                    break;
                case 14: // Start Month
                case 15:
                case 16:
                    ScheduleMessage.processStartMonth(msg);
                    break;
                case 17: // Start Day
                case 18:
                case 19:
                    ScheduleMessage.processStartDay(msg);
                    break;
                case 20: // Start Year
                case 21:
                case 22:
                    ScheduleMessage.processStartYear(msg);
                    break;
                case 23:
                case 24:
                case 25:
                case 26:
                case 27:
                    ScheduleMessage.processEndTimes(msg);
                    break;
                case 28: // Heat Source
                case 29:
                case 30:
                    ScheduleMessage.processHeatSource(msg);
                    break;
                case 31: // Heat Setpoint
                case 32:
                case 33:
                    ScheduleMessage.processHeatSetpoint(msg);
                    break;
                case 34: // Cool Setpoint
                case 35:
                case 36:
                    ScheduleMessage.processCoolSetpoint(msg);
                    break;
                default:
                    logger.debug(`Unprocessed Config Message ${msg.toPacket()}`)
                    break;

            }
        else if (sys.controllerType !== ControllerType.Unknown && sys.controllerType !== ControllerType.SunTouch)
            ScheduleMessage.processScheduleDetails(msg);
    }
    public static processSunTouch(msg: Inbound): void {
        //[255, 0, 255][165, 1, 15, 16, 30, 16][0, 0, 0, 0, 2, 0, 1, 224, 1, 239, 6, 1, 1, 224, 3, 132][4, 53]
        // Bytes 0-3 contain no data.
        for (let i = 0; i < 2; i++) {
            let schedId = i + 1;
            let pos = (i * 6) + 4;
            let cid = msg.extractPayloadByte(pos);
            if (cid === 5) cid = 7;
            else if (cid > 6) cid = cid + 1;
            let start = (msg.extractPayloadByte(pos + 2) * 256) + msg.extractPayloadByte(pos + 3);
            let end = (msg.extractPayloadByte(pos + 4) * 256) + msg.extractPayloadByte(pos + 5);
            let circ = cid > 0 && start < end ? sys.circuits.getInterfaceById(cid, false) : undefined;
            if (typeof circ !== 'undefined' && circ.isActive) {
                let sched = sys.schedules.getItemById(schedId, true);
                let ssched = state.schedules.getItemById(schedId, true);
                sched.master = 0;
                ssched.circuit = sched.circuit = circ.id;
                ssched.scheduleDays = sched.scheduleDays = 127;  // SunTouch does not allow you to set the days.
                ssched.startTime = sched.startTime = start;
                ssched.endTime = sched.endTime = end;
                ssched.startTimeType = sched.startTimeType = 0;
                ssched.endTimeType = sched.endTimeType = 0;
                ssched.isActive = sched.isActive = true;
                ssched.scheduleType = sched.scheduleType = sys.board.valueMaps.scheduleTypes.getValue('repeat');
                if (sys.circuits.getItemById(circ.id).hasHeatSource && typeof sched.heatSource === 'undefined') ssched.heatSource = sched.heatSource = sys.board.valueMaps.heatSources.getValue('nochange');
                if (typeof sched.heatSetpoint === 'undefined') sched.heatSetpoint = 78;
                ssched.emitEquipmentChange();
            }
            else {
                let ssched = state.schedules.find(elem => elem.id === schedId);
                if (typeof ssched !== 'undefined') {
                    ssched.isActive = false;
                    ssched.emitEquipmentChange();
                    state.schedules.removeItemById(schedId);
                }
                sys.schedules.removeItemById(schedId);
            }
        }
    }
    public static processScheduleDetails(msg: Inbound) {
        // Sample packet
        // [165,33,15,16,17,7][6,12,25,0,6,30,0][1,76]
        const schedId = msg.extractPayloadByte(0);
        const circuitId = msg.extractPayloadByte(1) & 127;
        const eggTimerRunTime = msg.extractPayloadByte(4) * 60 + msg.extractPayloadByte(5);
        const eggTimerActive = msg.extractPayloadByte(2) === 25 && circuitId > 0 && eggTimerRunTime !== 256;
        const scheduleActive = !eggTimerActive && circuitId > 0;
        if (eggTimerActive) {
            // egg timer
            const eggTimer: EggTimer = sys.eggTimers.getItemById(schedId, true);
            eggTimer.circuit = circuitId;
            eggTimer.runTime = eggTimerRunTime;
            eggTimer.isActive = eggTimerActive;
            const circuit = sys.circuits.getInterfaceById(circuitId);
            circuit.eggTimer = eggTimer.runTime;
            //circuit.eggTimer === 720;
            circuit.dontStop = circuit.eggTimer === 1620;
            // When eggTimers are found go back and check existing schedules to see if a runOnce schedule already exists.
             // It is possible that the runOnce schedule will be discovered before the eggTimer so we need to adjust the endTime 
            for (let i = 0; i < sys.schedules.length; i++){
                const schedule: Schedule = sys.schedules.getItemByIndex(i);
                if (schedule.scheduleType === sys.board.valueMaps.scheduleTypes.getValue('runonce') && schedule.circuit === eggTimer.circuit){
                    const sstate = state.schedules.getItemById(schedule.id);
                    schedule.master = 0;
                    sstate.endTime = schedule.endTime = (schedule.startTime + eggTimer.runTime) % 1440; // remove days if we go past midnight                   
                }
            }
        } else if (circuitId > 0) {
            const schedule: Schedule = sys.schedules.getItemById(schedId, true);
            schedule.circuit = circuitId;
            schedule.startTime = msg.extractPayloadByte(2) * 60 + msg.extractPayloadByte(3);
            // 26 is 'let the eggTimer control end time' & run once
            schedule.scheduleType = msg.extractPayloadByte(4) === 26 ? 26 : 0; 
            if (msg.extractPayloadByte(4) !== 26)
                schedule.endTime = msg.extractPayloadByte(4) * 60 + msg.extractPayloadByte(5);
            else {
                let _eggTimer = sys.circuits.getInterfaceById(circuitId).eggTimer || 720;
                schedule.endTime = (schedule.startTime + _eggTimer) % 1440; // remove days if we go past midnight
            }
            schedule.isActive = schedule.startTime !== 0;
            schedule.scheduleDays = msg.extractPayloadByte(6) & 0x7F; // 127
            if (schedule.startTimeType === 'undefined') schedule.startTimeType = 0;  
            if (schedule.endTimeType === 'undefined') schedule.endTimeType = 0; 

            if (sys.circuits.getItemById(schedule.circuit).hasHeatSource && typeof schedule.heatSource === 'undefined') schedule.heatSource = sys.board.valueMaps.heatSources.getValue('nochange');
            // todo: add to base sched item
            //  (msg.extractPayloadByte(1) & 128) === 1 ? schedule.smartStart = 1 : schedule.smartStart = 0;
            schedule.master = 0;
            if (schedule.isActive) {
                const sstate = state.schedules.getItemById(schedule.id, true);
                sstate.circuit = schedule.circuit;
                sstate.startTime = schedule.startTime;
                sstate.endTime = schedule.endTime;
                sstate.scheduleType = schedule.scheduleType;
                sstate.scheduleDays = schedule.scheduleDays;
                sstate.startTimeType = schedule.startTimeType;
                sstate.endTimeType = schedule.endTimeType;
                sstate.heatSource = schedule.heatSource;
                sstate.heatSetpoint = schedule.heatSetpoint;
                sstate.isActive = schedule.isActive;
                state.schedules.sortById();
            }
        }
        if (!scheduleActive) {
            sys.schedules.removeItemById(schedId);
            state.schedules.removeItemById(schedId);
            state.emitEquipmentChanges();
        }

        if (!eggTimerActive) {
            const circId = sys.eggTimers.getItemById(schedId).circuit;
            if (circId)
            {
                const circuit = sys.circuits.getInterfaceById(circId);
                circuit.eggTimer = 0;
            }
            sys.eggTimers.removeItemById(schedId);
        }
    }
    private static processStartMonth(msg: Inbound) {
        let schedId = (msg.extractPayloadByte(1) - 14) * 40 + 1;
        for (let i = 1; i < msg.payload.length && schedId <= ScheduleMessage._maxSchedId; i++) {
            const schedule: Schedule = sys.schedules.getItemById(schedId++, false, { isActive: false });
            if (schedule.isActive !== false) schedule.startMonth = msg.extractPayloadByte(i + 1);
        }
        msg.isProcessed = true;
    }
    private static processStartDay(msg: Inbound) {
        let schedId = (msg.extractPayloadByte(1) - 17) * 40 + 1;
        for (let i = 1; i < msg.payload.length && schedId <= ScheduleMessage._maxSchedId; i++) {
            const schedule: Schedule = sys.schedules.getItemById(schedId++, false, { isActive: false });
            if (schedule.isActive !== false) {
                schedule.startDay = msg.extractPayloadByte(i + 1);
                let csched = state.schedules.getItemById(schedule.id);
                csched.startTime = schedule.startTime;
            }
        }
        msg.isProcessed = true;
    }
    private static processStartYear(msg: Inbound) {
        let schedId = (msg.extractPayloadByte(1) - 20) * 40 + 1;
        for (let i = 1; i < msg.payload.length && schedId <= ScheduleMessage._maxSchedId; i++) {
            const schedule: Schedule = sys.schedules.getItemById(schedId++, false, { isActive: false });
            if (schedule.isActive !== false) {
                schedule.startYear = msg.extractPayloadByte(i + 1);
            }
        }
        msg.isProcessed = true;
    }
    private static processStartTimes(msg: Inbound) {
        let schedId = msg.extractPayloadByte(1) * 20 + 1;
        for (let i = 1; i < msg.payload.length - 1 && schedId <= ScheduleMessage._maxSchedId;) {
            let schedule: Schedule = sys.schedules.getItemById(schedId++, false, { isActive: false });
            if (schedule.isActive) {
                schedule.startTime = msg.extractPayloadInt(i + 1);
                let csched = state.schedules.getItemById(schedule.id, true);
                csched.startTime = schedule.startTime;
            }
            i += 2;
        }
        msg.isProcessed = true;
    }
    private static processEndTimes(msg: Inbound) {
        let schedId = (msg.extractPayloadByte(1) - 23) * 20 + 1;
        for (let i = 1; i < msg.payload.length - 1 && schedId <= ScheduleMessage._maxSchedId;) {
            const time = msg.extractPayloadInt(i + 1);
            const schedule: Schedule = sys.schedules.getItemById(schedId++, false, { isActive: false });
            if (schedule.isActive !== false) {
                schedule.endTime = time;
                let csched = state.schedules.getItemById(schedule.id, true);
                csched.endTime = schedule.endTime;
            }
            i += 2;
        }
        msg.isProcessed = true;
    }
    private static processCircuit(msg: Inbound) {
        let schedId = (msg.extractPayloadByte(1) - 5) * 40 + 1;
        for (let i = 1; i < msg.payload.length && schedId <= ScheduleMessage._maxSchedId; i++) {
            let schedule: Schedule = sys.schedules.getItemById(schedId++, false, { isActive: false });
            if (schedule.isActive) {
                let csched = state.schedules.getItemById(schedule.id, true);
                schedule.circuit = msg.extractPayloadByte(i + 1) + 1;
                if (schedule.circuit === 256 || schedule.circuit === 0) {
                    // This is some of the IntelliCenter craziness where the schedule is marked as active but the circuit is not defined.
                    csched.isActive = false;
                    state.schedules.removeItemById(schedule.id);
                    sys.schedules.removeItemById(schedule.id);
                }
                else
                    csched.circuit = schedule.circuit;
            }
        }
        msg.isProcessed = true;
    }
    private static processScheduleType(msg: Inbound) {
        let schedId = (msg.extractPayloadByte(1) - 8) * 40 + 1;
        for (let i = 1; i < msg.payload.length; i++) {
            let byte = msg.extractPayloadByte(i + 1);
            let schedule: Schedule = sys.schedules.getItemById(schedId++, (byte & 128) === 128);
            if ((byte & 128) === 128) {
                // If bit 8 is set on the time type then this indicates whether the schedule is active.  If it is not
                // active then we will be removing it.
                schedule.isActive = true;
                schedule.master = 0;
                schedule.scheduleType = (byte & 1 & 0xFF) === 1 ? 0 : 128;
                if ((byte & 4 & 0xFF) === 4) schedule.startTimeType = 1;
                else if ((byte & 8 & 0xFF) === 8) schedule.startTimeType = 2;
                else schedule.startTimeType = 0;

                if ((byte & 16 & 0xFF) === 16) schedule.endTimeType = 1;
                else if ((byte & 32 & 0xFF) === 32) schedule.endTimeType = 2;
                else schedule.endTimeType = 0;
                let csched = state.schedules.getItemById(schedule.id);
                csched.isActive = true;
                csched.startTimeType = schedule.startTimeType;
                csched.endTimeType = schedule.endTimeType;
                csched.scheduleType = schedule.scheduleType;
            }
            else {
                // Now we need to remove this pig because this is not an active schedule.
                sys.schedules.removeItemById(schedule.id);
                if (schedule.isActive) {
                    let csched = state.schedules.getItemById(schedule.id);
                    schedule.isActive = csched.isActive = false;
                }
                state.schedules.removeItemById(schedule.id);
            }
        }
        ScheduleMessage._maxSchedId = sys.schedules.getMaxId(true, 0);
        msg.isProcessed = true;
    }
    private static processDays(msg: Inbound) {
        let schedId = (msg.extractPayloadByte(1) - 11) * 40 + 1;
        for (let i = 1; i < msg.payload.length && schedId <= ScheduleMessage._maxSchedId; i++) {
            let schedule: Schedule = sys.schedules.getItemById(schedId++, false, { isActive: false });
            if (schedule.isActive !== false) {
                schedule.scheduleDays = msg.extractPayloadByte(i + 1);
                let csched = state.schedules.getItemById(schedule.id);
                csched.scheduleDays = csched.scheduleType === 128 ? schedule.scheduleDays : 0;
            }
        }
        msg.isProcessed = true;
    }
    private static processHeatSource(msg: Inbound) {
        let schedId = (msg.extractPayloadByte(1) - 28) * 40 + 1;
        for (let i = 1; i < msg.payload.length && schedId <= ScheduleMessage._maxSchedId; i++) {
            let schedule: Schedule = sys.schedules.getItemById(schedId++, false, { isActive: false });
            if (schedule.isActive !== false) {
                let hs = msg.extractPayloadByte(i + 1);
                // RKS: During the transition to 1.047 then heat sources were all screwed up.  This meant that 0 was no change and 1 was off.
                //if (hs === 1) hs = 0; // Shim for 1.047 a heat source of 1 is not valid.
                schedule.heatSource = hs;
                let csched = state.schedules.getItemById(schedule.id);
                csched.heatSource = schedule.heatSource;
            }
        }
        msg.isProcessed = true;
    }
    private static processHeatSetpoint(msg: Inbound) {
        let schedId = (msg.extractPayloadByte(1) - 31) * 40 + 1;
        for (let i = 1; i < msg.payload.length && schedId <= ScheduleMessage._maxSchedId; i++) {
            let schedule: Schedule = sys.schedules.getItemById(schedId++, false, { isActive: false });
            if (schedule.isActive !== false) {
                schedule.heatSetpoint = msg.extractPayloadByte(i + 1);
                let csched = state.schedules.getItemById(schedule.id);
                csched.heatSetpoint = schedule.heatSetpoint;
            }
        }
        msg.isProcessed = true;
    }
    private static processCoolSetpoint(msg: Inbound) {
        let schedId = (msg.extractPayloadByte(1) - 34) * 40 + 1;
        for (let i = 1; i < msg.payload.length && schedId <= ScheduleMessage._maxSchedId; i++) {
            let schedule: Schedule = sys.schedules.getItemById(schedId++, false, { isActive: false });
            if (schedule.isActive !== false) {
                schedule.coolSetpoint = msg.extractPayloadByte(i + 1);
                let csched = state.schedules.getItemById(schedule.id);
                csched.coolSetpoint = schedule.coolSetpoint;
            }
        }
        msg.isProcessed = true;
    }
}
