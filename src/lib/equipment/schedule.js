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

module.exports = function(container) {

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: schedule.js')

    //var bufferArr = []; //variable to process buffer.  interimBufferArr will be copied here when ready to process
    //var interimBufferArr = []; //variable to hold all serialport.open data; incomind data is appended to this with each read
    var initialSchedulesDiscovered = 0
    var logger = container.logger
    var numberOfSchedules = 12

    var init = function() {
      currentSchedule = {}; //schedules
    }

    var formatSchedId = function(id) {
        var str = ''
        str += '\nID:'
        str += currentSchedule[id].ID < 10 ? ' ' + currentSchedule[id].ID : currentSchedule[id].ID
        return str
    }

    var formatEggTimerStr = function(id) {
        var str = ' MODE:' + currentSchedule[id].MODE + ' DURATION:' + currentSchedule[id].DURATION
        return str
    }

    var formatScheduleStr = function(id, schedule) {
        var str = ''
        if (id === 0) { //format the temp schedule
            str += 'MODE:' + schedule.MODE + ' START_TIME:' + schedule.START_TIME + ' END_TIME:' + schedule.END_TIME + ' DAYS:' + schedule.DAYS

        } else //format currentSchedule
        {
            str += ' MODE:' + currentSchedule[id].MODE + ' START_TIME:' + currentSchedule[id].START_TIME + ' END_TIME:' + currentSchedule[id].END_TIME + ' DAYS:' + currentSchedule[id].DAYS
        }
        return str

    }

    var getCurrentSchedule = function() {
        return currentSchedule
    }



    var broadcastInitialSchedules = function(counter) {
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

    var broadcastScheduleChange = function(id, schedule, counter) {
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

    var dayStr = function(days) {
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
        return dayStr
    }


    var addScheduleDetails = function(id, circuit, days, time1, time2, time3, time4, counter) {

        var schedule = {}

        schedule.ID = id;
        schedule.CIRCUIT = circuit === 0 ? container.constants.strCircuitName[circuit] : container.circuit.getCircuitName(circuit); //Correct???
        schedule.friendlyName = circuit === 0 ? container.constants.strCircuitName[circuit] : container.circuit.getCircuitName(circuit);
        schedule.CIRCUITNUM = circuit

        if (time1 === 25) //25 = Egg Timer
        {
            schedule.MODE = 'Egg Timer'
            schedule.DURATION = time3 + ':' + time4;
        } else {
            schedule.MODE = 'Schedule'
            schedule.DURATION = 'n/a'
            schedule.START_TIME = time1 + ':' + time2;
            schedule.END_TIME = time3 + ':' + time4;
            schedule.DAYS = dayStr(days)

        }

        if (currentSchedule[id] === undefined) {
            currentSchedule[id] = schedule
        }
        if (id === numberOfSchedules && initialSchedulesDiscovered === 0) {
            broadcastInitialSchedules(counter)
            initialSchedulesDiscovered = 1
        } else
        if (initialSchedulesDiscovered === 1) { //TODO: AND A CHANGE.  Either circuit by circuit or all of them?
            if (JSON.stringify(currentSchedule[id]) !== JSON.stringify(schedule)) {
                broadcastScheduleChange(id, schedule, counter)
                currentSchedule[id] = schedule
                container.io.emitToClients('schedule')
            } else {
                if (container.settings.logConfigMessages)
                    logger.debug('Msg# %s:  Schedule %s has not changed.', counter, id)
            }
        }
        if (id === numberOfSchedules) {
            container.io.emitToClients('schedule')
        }
    }




    var numberOfSchedulesRegistered = function() {
        return Object.keys(currentSchedule).length
    }

    var getControllerScheduleByID = function(id) {
        container.logger.verbose('Queueing packet to retrieve schedule by id %s', id)
        container.queuePacket.queuePacket([165, container.intellitouch.getPreambleByte(), 16, container.settings.appAddress, 209, 1, id]);
    }

    var getControllerScheduleAll = function() {
        //get schedules
        for (var i = 1; i <= numberOfSchedules; i++) {

            container.queuePacket.queuePacket([165, container.intellitouch.getPreambleByte(), 16, container.settings.appAddress, 209, 1, i]);
        }
    }

    var setControllerSchedule = function(id, circuit, starthh, startmm, endhh, endmm, days) {
        //validate
        if (id >= 0 && id <= numberOfSchedules && starthh >= 0 && starthh <= 25 && startmm >= 0 && startmm <= 59 && endhh >= 0 && endmm <= 59) {
            //TODO: validate days is one of 0,1,2,4,8,16,32 (+128 for any >0 entry??)
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

            container.queuePacket.queuePacket([165, container.intellitouch.getPreambleByte(), 16, container.settings.appAddress, 145, 7, id, circuit, starthh, startmm, endhh, endmm, days]);
            getControllerScheduleAll()
        } else {
            container.logger.warn('Aborting Queue set schedule packet with an invalid value: ', id, circuit, starthh, startmm, endhh, endmm, days + 128)
        }
    }

    var getControllerScheduleByCircuitID = function(circuit) {
        for (var i = 0; i <= numberOfSchedules; i++) {
            if (currentSchedule.CIRCUIT === circuit) {
                container.logger.verbose('Queueing packet to retrieve schedule %s by circuit id %s', i, circuit)
                container.queuePacket.queuePacket([165, container.intellitouch.getPreambleByte(), 16, container.settings.appAddress, 209, 1, i]);
            }
        }
    }




    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: schedule.js')

    return {
        init: init,
        getCurrentSchedule: getCurrentSchedule,
        addScheduleDetails: addScheduleDetails,
        numberOfSchedulesRegistered: numberOfSchedulesRegistered,
        setControllerSchedule: setControllerSchedule,
        getControllerScheduleByID: getControllerScheduleByID,
        getControllerScheduleByCircuitID: getControllerScheduleByCircuitID,
        getControllerScheduleAll: getControllerScheduleAll,
        numberOfSchedules: numberOfSchedules
    }


}
