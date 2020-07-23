/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com

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
                case 8: // Run Once Flags
                case 9:
                case 10:
                    ScheduleMessage.processRunOnce(msg);
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
                case 34: // Unknown
                case 35:
                case 36:
                    ScheduleMessage.processFlags(msg);
                    break;
                default:
                    logger.debug(`Unprocessed Config Message ${msg.toPacket()}`)
                    break;

            }
        else if (sys.controllerType !== ControllerType.Unknown)
            ScheduleMessage.processScheduleDetails(msg);
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
             // When eggTimers are found go back and check existing schedules to see if a runOnce schedule already exists.
             // It is possible that the runOnce schedule will be discovered before the eggTimer so we need to adjust the endTime 
            for (let i = 0; i < sys.schedules.length; i++){
                const schedule: Schedule = sys.schedules.getItemByIndex(i);
                if (schedule.scheduleType === 0 && schedule.circuit === eggTimer.circuit){
                    const sstate = state.schedules.getItemById(schedule.id);
                    sstate.endTime = schedule.endTime = (schedule.startTime + eggTimer.runTime) % 1440; // remove days if we go past midnight                   
                }
            }
        } else if (circuitId > 0) {
            const schedule: Schedule = sys.schedules.getItemById(schedId, true);
            schedule.circuit = circuitId;
            schedule.startTime = msg.extractPayloadByte(2) * 60 + msg.extractPayloadByte(3);
            // 26 is 'let the eggTimer control end time'
            if (msg.extractPayloadByte(4) !== 26)
                schedule.endTime = msg.extractPayloadByte(4) * 60 + msg.extractPayloadByte(5);
            else {
                let _eggTimer = sys.circuits.getInterfaceById(circuitId).eggTimer || 720;
                schedule.endTime = (schedule.startTime + _eggTimer) % 1440; // remove days if we go past midnight
                
            }
            schedule.isActive = schedule.startTime !== 0;
            schedule.scheduleDays = msg.extractPayloadByte(6) & 0x7F; // 127
            // todo: double check if this is opposity of IntelliCenter; if so add to easytouch board 
            // this should be scheduleType
            schedule.runOnce = (msg.extractPayloadByte(6) & 0x80); // 128; 
            schedule.scheduleType = schedule.runOnce > 0 ? 128 : 0;
            schedule.startTimeType = 0;  // Normalize as not supported by *Touch using manual.
            schedule.endTimeType = 0; // Normalize as not supported by *Touch using manual.
            // todo: add to base sched item
            //  (msg.extractPayloadByte(1) & 128) === 1 ? schedule.smartStart = 1 : schedule.smartStart = 0;
            if (schedule.isActive) {
                const sstate = state.schedules.getItemById(schedule.id, true);
                sstate.circuit = schedule.circuit;
                sstate.startTime = schedule.startTime;
                sstate.endTime = schedule.endTime;
                sstate.scheduleType = schedule.runOnce;
                sstate.scheduleDays = schedule.scheduleDays;
                sstate.scheduleType = schedule.scheduleType;
                sstate.startTimeType = schedule.startTimeType;
                sstate.endTimeType = schedule.endTimeType;
            }
        }
        if (!scheduleActive) {
            sys.schedules.removeItemById(schedId);
            state.schedules.removeItemById(schedId);
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
    }
    private static processStartDay(msg: Inbound) {
        let schedId = (msg.extractPayloadByte(1) - 17) * 40 + 1;
        for (let i = 1; i < msg.payload.length; i++) {
            const schedule: Schedule = sys.schedules.getItemById(schedId++, false, { isActive: false });
            if (schedule.isActive !== false) {
                schedule.startDay = msg.extractPayloadByte(i + 1);
                let csched = state.schedules.getItemById(schedule.id);
                csched.startTime = schedule.startTime;
            }
        }
    }
    private static processStartYear(msg: Inbound) {
        let schedId = (msg.extractPayloadByte(1) - 20) * 40 + 1;
        for (let i = 1; i < msg.payload.length; i++) {
            const schedule: Schedule = sys.schedules.getItemById(schedId++, false, { isActive: false });
            if (schedule.isActive !== false) {
                schedule.startYear = msg.extractPayloadByte(i + 1);
            }
        }
    }
    private static processStartTimes(msg: Inbound) {
        let schedId = msg.extractPayloadByte(1) * 20 + 1;
        for (let i = 1; i < msg.payload.length - 1;) {
            let time = msg.extractPayloadInt(i + 1);
            let schedule: Schedule = sys.schedules.getItemById(schedId++, time !== 0);
            if (time !== 0) {
                schedule.startTime = time;
                schedule.isActive = schedule.startTime !== 0;
                let csched = state.schedules.getItemById(schedule.id, true);
                csched.startTime = schedule.startTime;
            }
            else {
                state.schedules.removeItemById(schedule.id);
                sys.schedules.removeItemById(schedule.id);
            }
            i += 2;
        }
        ScheduleMessage._maxSchedId = sys.schedules.getMaxId(true, 0);
    }
    private static processEndTimes(msg: Inbound) {
        let schedId = (msg.extractPayloadByte(1) - 23) * 20 + 1;
        for (let i = 1; i < msg.payload.length - 1 && schedId <= ScheduleMessage._maxSchedId;) {
            const time = msg.extractPayloadInt(i + 1);
            const schedule: Schedule = sys.schedules.getItemById(schedId++, false, { isActive: false });
            if (schedule.isActive !== false) {
                schedule.endTime = time;
                let csched = state.schedules.getItemById(schedule.id);
                csched.endTime = schedule.endTime;
            }
            i += 2;
        }
    }
    private static processCircuit(msg: Inbound) {
        let schedId = (msg.extractPayloadByte(1) - 5) * 40 + 1;
        for (let i = 1; i < msg.payload.length && schedId <= ScheduleMessage._maxSchedId; i++) {
            let schedule: Schedule = sys.schedules.getItemById(schedId++, false, { isActive: false });
            if (schedule.isActive) {
                let csched = state.schedules.getItemById(schedule.id);
                schedule.circuit = msg.extractPayloadByte(i + 1) + 1;
                if (schedule.circuit === 256 || schedule.circuit === 0) {
                    // This is some of the IntelliCenter craziness where the schedule has a start time but
                    // the circuit is undefined.
                    csched.isActive = false;
                    state.schedules.removeItemById(schedule.id);
                    sys.schedules.removeItemById(schedule.id);
                }
                else
                    csched.circuit = schedule.circuit;
            }
        }
    }
    private static processRunOnce(msg: Inbound) {
        let schedId = (msg.extractPayloadByte(1) - 8) * 40 + 1;
        for (let i = 1; i < msg.payload.length && schedId <= ScheduleMessage._maxSchedId; i++) {
            let schedule: Schedule = sys.schedules.getItemById(schedId++, false, { isActive: false });
            if (schedule.isActive !== false) {
                let byte = msg.extractPayloadByte(i + 1);
                schedule.runOnce = byte;
                schedule.scheduleType = (byte & 1 & 0xFF) === 1 ? 0 : 128;
                if ((byte & 4 & 0xFF) === 4) schedule.startTimeType = 1;
                else if ((byte & 8 & 0xFF) === 8) schedule.startTimeType = 2;
                else schedule.startTimeType = 0;

                if ((byte & 16 & 0xFF) === 16) schedule.endTimeType = 1;
                else if ((byte & 32 & 0xFF) === 32) schedule.endTimeType = 2;
                else schedule.endTimeType = 0;
                let csched = state.schedules.getItemById(schedule.id);
                csched.startTimeType = schedule.startTimeType;
                csched.endTimeType = schedule.endTimeType;
                csched.scheduleType = schedule.scheduleType;
            }
        }
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
    }
    private static processHeatSource(msg: Inbound) {
        let schedId = (msg.extractPayloadByte(1) - 28) * 40 + 1;
        for (let i = 1; i < msg.payload.length && schedId <= ScheduleMessage._maxSchedId; i++) {
            let schedule: Schedule = sys.schedules.getItemById(schedId++, false, { isActive: false });
            if (schedule.isActive !== false) {
                let hs = msg.extractPayloadByte(i + 1);
                if (hs === 1) hs = 0; // Shim for 1.047 a heat source of 1 is not valid.
                schedule.heatSource = hs;
                let csched = state.schedules.getItemById(schedule.id);
                csched.heatSource = schedule.heatSource;
            }
        }
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
    }
    private static processFlags(msg: Inbound) {
        let schedId = (msg.extractPayloadByte(1) - 34) * 40 + 1;
        for (let i = 1; i < msg.payload.length && schedId <= ScheduleMessage._maxSchedId; i++) {
            let schedule: Schedule = sys.schedules.getItemById(schedId++, false, { isActive: false });
            if (schedule.isActive !== false) {
                schedule.flags = msg.extractPayloadByte(i + 1);
            }
        }
    }
}
