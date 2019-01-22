/*  nodejs-poolController.  An application to control pool equipment.
 *  Copyright (C) 2016, 2017.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as
 *  published by the Free Software Foundation, either version 3 of the
 *  License, or (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var currentSchedule

module.exports = function (container) {

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: schedule.js')

    //var bufferArr = []; //variable to process buffer.  interimBufferArr will be copied here when ready to process
    //var interimBufferArr = []; //variable to hold all serialport.open data; incomind data is appended to this with each read
    var initialSchedulesDiscovered = 0
    var logger = container.logger
    var numberOfSchedules = 12

    var init = function () {
        numberOfSchedules = container.settings.get('equipment.controller.intellitouch.numberOfSchedules')

        currentSchedule = {}; //schedules
    }

    var formatSchedId = function (id) {
        var str = ''
        str += '\nID:'
        str += currentSchedule[id].ID < 10 ? ' ' + currentSchedule[id].ID : currentSchedule[id].ID
        return str
    }

    var formatEggTimerStr = function (id) {
        var str = ' MODE:' + currentSchedule[id].MODE + ' DURATION:' + currentSchedule[id].DURATION
        return str
    }

    var formatScheduleStr = function (id, schedule) {
        var str = ''
        if (id === 0) { //format the temp schedule
            str += 'MODE:' + schedule.MODE + ' START_TIME:' + schedule.START_TIME + ' END_TIME:' + schedule.END_TIME + ' DAYS:' + schedule.DAYS

        } else //format currentSchedule
        {
            str += ' MODE:' + currentSchedule[id].MODE + ' START_TIME:' + currentSchedule[id].START_TIME + ' END_TIME:' + currentSchedule[id].END_TIME + ' DAYS:' + currentSchedule[id].DAYS
        }
        return str

    }

    var getCurrentSchedule = function () {
        return {'schedule': currentSchedule}
    }


    var broadcastInitialSchedules = function (counter) {
        var scheduleStr = 'Msg# ' + counter + '  Schedules discovered:'
        for (var i = 1; i <= numberOfSchedules; i++) {
            scheduleStr += formatSchedId(i)
            scheduleStr += '  CIRCUIT:(' + currentSchedule[i].CIRCUITNUM + ')' + currentSchedule[i].CIRCUIT + ' '
            if (currentSchedule[i].CIRCUIT !== 'NOT USED') {
                if (currentSchedule[i].MODE === 'Egg Timer') {
                    scheduleStr += formatEggTimerStr(i)
                } else {
                    scheduleStr += formatScheduleStr(i, 0)
                }
            }
        }
        logger.info('%s\n\n', scheduleStr)
    }

    var broadcastScheduleChange = function (id, schedule, counter) {
        //Explicitly writing out the old/new packets because if we call .whatsDifferent and the schedule switches from an egg timer to schedule (or vice versa) it will throw an error)

        var scheduleChgStr = ''
        scheduleChgStr += 'Msg# ' + counter
        scheduleChgStr += '  Schedule '
        scheduleChgStr += formatSchedId(id)
        scheduleChgStr += ' changed from:\n'
        scheduleChgStr += 'ID:' + currentSchedule[id].ID + ' CIRCUIT:(' + id + ')' + currentSchedule[id].CIRCUIT
        //FROM string
        if (currentSchedule[id].MODE === 'Egg Timer') {
            scheduleChgStr += formatEggTimerStr(id)

        } else {

            scheduleChgStr += formatScheduleStr(id, 0)
        }


        scheduleChgStr += '\n'
        scheduleChgStr += ' CIRCUIT:(' + id + ')' + schedule.CIRCUIT + ' '
        //TO string
        if (schedule.MODE === 'Egg Timer') {

            scheduleChgStr += formatEggTimerStr(id)
        } else {

            scheduleChgStr += formatScheduleStr(0, schedule)
        }
        logger.verbose(scheduleChgStr)
    }

    var dayStr = function (days) {
        var dayStr = ''
        if ((days === 0))
            dayStr += 'None';
        if ((days & 1) === 1)
            dayStr += 'Sunday '; //1
        if ((days & 2) >> 1 === 1)
            dayStr += 'Monday '; // 2
        if ((days & 4) >> 2 === 1)
            dayStr += 'Tuesday '; // 4
        if ((days & 8) >> 3 === 1)
            dayStr += 'Wednesday '; //8
        if ((days & 16) >> 4 === 1)
            dayStr += 'Thursday '; //16
        if ((days & 32) >> 5 === 1)
            dayStr += 'Friday '; //32
        if ((days & 64) >> 6 === 1)
            dayStr += 'Saturday '; //64
        // is 128 "no days"?
        return dayStr
    }

    // from https://stackoverflow.com/a/10073788/7386278
    function pad(n, width, z) {
        return (String(z).repeat(width) + String(n)).slice(String(n).length)
    }

    var addScheduleDetails = function (id, circuit, days, time1, time2, time3, time4, bytes, counter) {

        var schedule = {}

        schedule.ID = id;
        schedule.CIRCUIT = circuit === 0 ? container.constants.strCircuitName[circuit] : container.circuit.getCircuitName(circuit);
        schedule.friendlyName = circuit === 0 ? container.constants.strCircuitName[circuit] : container.circuit.getFriendlyName(circuit);
        schedule.CIRCUITNUM = circuit
        schedule.BYTES = bytes

        if (time1 === 25) //25 = Egg Timer
        {
            schedule.MODE = 'Egg Timer'
            schedule.DURATION = time3 + ':' + time4;
        } else {
            schedule.MODE = 'Schedule'
            schedule.DURATION = 'n/a'
            schedule.START_TIME = time1.len===2?pad(time1, 2, "0"):time1 + ':' + pad(time2, 2, "0");
            schedule.END_TIME = pad(time3, 2, "0") + ':' + pad(time4, 2, "0");
            schedule.DAYS = dayStr(days)

        }

        if (currentSchedule[id] === undefined) {
            currentSchedule[id] = schedule
        }
        if (id === numberOfSchedules && initialSchedulesDiscovered === 0) {
            broadcastInitialSchedules(counter)
            initialSchedulesDiscovered = 1
        } else if (initialSchedulesDiscovered === 1) { //TODO: AND A CHANGE.  Either circuit by circuit or all of them?
            if (JSON.stringify(currentSchedule[id]) !== JSON.stringify(schedule)) {
                broadcastScheduleChange(id, schedule, counter)
                currentSchedule[id] = schedule
                container.io.emitToClients('schedule')
            } else {
                if (container.settings.get('logConfigMessages'))
                    logger.debug('Msg# %s:  Schedule %s has not changed.', counter, id)
            }
        }
        if (id === numberOfSchedules) {
            container.io.emitToClients('schedule')
        }
    }


    var numberOfSchedulesRegistered = function () {
        return Object.keys(currentSchedule).length
    }

    var getControllerScheduleByID = function (id) {
        container.logger.verbose('Queueing packet to retrieve schedule by id %s', id)
        container.queuePacket.queuePacket([165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 209, 1, id]);
    }

    var getControllerScheduleAll = function () {
        //get schedules
        for (var i = 1; i <= numberOfSchedules; i++) {

            container.queuePacket.queuePacket([165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 209, 1, i]);
        }
    }

    var setControllerSchedule = function (id, circuit, starthh, startmm, endhh, endmm, days) {
        //validate
        if (id >= 0 && id <= numberOfSchedules && starthh >= 0 && starthh <= 25 && startmm >= 0 && startmm <= 59 && endhh >= 0 && endmm <= 59) {
            var scheduleStr = 'Queueing message to set schedule '
            scheduleStr += id < 10 ? ' ' + id : id
            var circuitTmpStr = circuit === 0 ? container.constants.strCircuitName[circuit] : container.circuit.getCircuitName(circuit)
            scheduleStr += '  CIRCUIT:(' + circuit + ')' + circuitTmpStr + ' '

            if (starthh === 25) {
                scheduleStr += ' MODE: Egg Timer DURATION:' + endhh + ':' + endmm
            } else {
                scheduleStr += 'MODE: Schedule START_TIME:' + starthh + ':' + startmm + ' END_TIME:' + endhh + ':' + endmm + ' DAYS:' + dayStr(days)
            }

            container.logger.info(scheduleStr)

            container.queuePacket.queuePacket([165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 145, 7, id, circuit, starthh, startmm, endhh, endmm, days]);
            getControllerScheduleAll()
        } else {
            container.logger.warn('Aborting Queue set schedule packet with an invalid value: ', id, circuit, starthh, startmm, endhh, endmm, days + 128)
        }
    }

    var deleteScheduleOrEggTimer = function (id) {
        setControllerSchedule(id, 0, 0, 0, 0, 0, 0)
    }

    var getControllerScheduleByCircuitID = function (circuit) {
        for (var i = 0; i <= numberOfSchedules; i++) {
            if (currentSchedule.CIRCUIT === circuit) {
                container.logger.verbose('Queueing packet to retrieve schedule %s by circuit id %s', i, circuit)
                container.queuePacket.queuePacket([165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 209, 1, i]);
            }
        }
    }

    var dayOfWeekAsInt = function (day) {
        var index = 0
        if (day.length === 3) {
            index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day)
        } else {
            index = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(day)
        }
        return (1 << index)
    }

    var toggleDay = function (id, day) {
        // this function will take a schedule ID and toggle the day(s) that are passed to it.
        // day can be in the format of:
        // - a 3 digit string (Sun, Sat, etc)
        // - the full name (Sunday, Saturday, etc)
        // - a value representing one or more days (1=Sunday, 2=Monday, 3=Sunday+Monday) as represented by the binary days bit

        var dayIndex = parseInt(day)
        if (isNaN(dayIndex)) {
            dayIndex = dayOfWeekAsInt(day)
        }

        var old_days = currentSchedule[id].BYTES[container.constants.schedulePacketBytes.DAYS]
        var new_days = currentSchedule[id].BYTES[container.constants.schedulePacketBytes.DAYS]
        new_days = new_days ^= dayIndex

        if (container.settings.get('logApi'))
            container.logger.info("Schedule change requested for %s (id:%s). Toggle Day(s) %s: \n\tFrom: %s \n\tTo: %s", currentSchedule[id].friendlyName, id, day, dayStr(old_days), dayStr(new_days))
        setControllerSchedule(currentSchedule[id].BYTES[container.constants.schedulePacketBytes.ID],
            currentSchedule[id].BYTES[container.constants.schedulePacketBytes.CIRCUIT], currentSchedule[id].BYTES[container.constants.schedulePacketBytes.TIME1], currentSchedule[id].BYTES[container.constants.schedulePacketBytes.TIME2], currentSchedule[id].BYTES[container.constants.schedulePacketBytes.TIME3],
            currentSchedule[id].BYTES[container.constants.schedulePacketBytes.TIME4],
            new_days)
    }

    var setControllerScheduleStartOrEndTime = function (id, startOrEnd, hour, min) {
        // this function will take a schedule ID set the start or end time.
        // time should be sent in 24hr format.  EG 4:01pm = 16, 1

        if (container.settings.get('logApi'))
            container.logger.info("Schedule change requested for %s (id:%s). Set %s time to %s:%s", currentSchedule[id].friendlyName, id, startOrEnd, hour, min)

        if (startOrEnd === 'start') {
            setControllerSchedule(currentSchedule[id].BYTES[container.constants.schedulePacketBytes.ID],
                currentSchedule[id].BYTES[container.constants.schedulePacketBytes.CIRCUIT], hour, min, currentSchedule[id].BYTES[container.constants.schedulePacketBytes.TIME3],
                currentSchedule[id].BYTES[container.constants.schedulePacketBytes.TIME4],
                currentSchedule[id].BYTES[container.constants.schedulePacketBytes.DAYS])
        } else {
            setControllerSchedule(currentSchedule[id].BYTES[container.constants.schedulePacketBytes.ID],
                currentSchedule[id].BYTES[container.constants.schedulePacketBytes.CIRCUIT], currentSchedule[id].BYTES[container.constants.schedulePacketBytes.TIME1], currentSchedule[id].BYTES[container.constants.schedulePacketBytes.TIME2], hour, min,
                currentSchedule[id].BYTES[container.constants.schedulePacketBytes.DAYS])
        }
    }

    var setControllerEggTimer = function (id, circuit, hour, min) {
        // this function will take a schedule ID set the circuit and duration.
        // time should be sent in 24hr format.  EG 4:01pm = 16, 1

        if (container.settings.get('logApi'))
            container.logger.info("Egg Timer change requested for %s (id:%s). Set %s duration to %s hours, %s minutes", currentSchedule[id].friendlyName, id, hour, min)

        setControllerSchedule(currentSchedule[id].BYTES[container.constants.schedulePacketBytes.ID],
            circuit, 25, 0, hour, min, 0)

    }

    var setControllerScheduleCircuit = function (id, circuit) {
        // this function will take a schedule ID and change the circuit


        if (container.settings.get('logApi'))
            container.logger.info("Schedule change requested for %s (id:%s). Change circuit to: %s", currentSchedule[id].CIRCUIT, id, container.circuit.getFriendlyName(circuit))
        setControllerSchedule(currentSchedule[id].BYTES[container.constants.schedulePacketBytes.ID],
            circuit, currentSchedule[id].BYTES[container.constants.schedulePacketBytes.TIME1], currentSchedule[id].BYTES[container.constants.schedulePacketBytes.TIME2], currentSchedule[id].BYTES[container.constants.schedulePacketBytes.TIME3],
            currentSchedule[id].BYTES[container.constants.schedulePacketBytes.TIME4],
            currentSchedule[id].BYTES[container.constants.schedulePacketBytes.DAYS])
    }


    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: schedule.js')

    return {
        init: init,
        getCurrentSchedule: getCurrentSchedule,
        addScheduleDetails: addScheduleDetails,
        numberOfSchedulesRegistered: numberOfSchedulesRegistered,
        deleteScheduleOrEggTimer: deleteScheduleOrEggTimer,
        setControllerSchedule: setControllerSchedule,
        setControllerScheduleStartOrEndTime: setControllerScheduleStartOrEndTime,
        setControllerEggTimer: setControllerEggTimer,
        setControllerScheduleCircuit: setControllerScheduleCircuit,
        getControllerScheduleByID: getControllerScheduleByID,
        getControllerScheduleByCircuitID: getControllerScheduleByCircuitID,
        getControllerScheduleAll: getControllerScheduleAll,
        toggleDay: toggleDay
    }


}
