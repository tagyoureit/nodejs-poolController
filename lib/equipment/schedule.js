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

module.exports = function(container) {

    if (container.logModuleLoading)
        container.logger.info('Loading: schedule.js')

    //var bufferArr = []; //variable to process buffer.  interimBufferArr will be copied here when ready to process
    //var interimBufferArr = []; //variable to hold all serialport.open data; incomind data is appended to this with each read
    var currentSchedule = ["blank"]; //schedules
    var initialSchedulesDiscovered = 0
    var logger = container.logger

    function getCurrentSchedule() {
        return currentSchedule
    }

    function addScheduleDetails(id, circuit, days, time1, time2, time3, time4, counter) {

        var schedule = {}

        schedule.ID = id;
        schedule.CIRCUIT = circuit === 0 ? container.constants.strCircuitName[circuit] : container.circuit.getCircuitName(circuit); //Correct???
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
            schedule.DAYS = '';
            // if (data[12] == 255) { //not sure this is needed as it is really x1111111 with the x=1 being unknown.  See following note.
            //    schedule[id].DAYS += 'EVERY DAY'
            //} else { //0 = none;  My Pentiar Intellitouch always adds a leading 1xxxxxxx to the schedule[id].  Don't know the significance of that.
            if ((days === 0))
                schedule.DAYS += 'None';
            if ((days & 1) === 1)
                schedule.DAYS += 'Sunday '; //1
            if ((days & 2) >> 1 === 1)
                schedule.DAYS += 'Monday '; // 2
            if ((days & 4) >> 2 === 1)
                schedule.DAYS += 'Tuesday '; // 4
            if ((days & 8) >> 3 === 1)
                schedule.DAYS += 'Wednesday '; //8
            if ((days & 16) >> 4 === 1)
                schedule.DAYS += 'Thursday '; //16
            if ((days & 32) >> 5 === 1)
                schedule.DAYS += 'Friday '; //32
            if ((days & 64) >> 6 === 1)
                schedule.DAYS += 'Saturday '; //64
            //}
        }

        if (currentSchedule[id] === undefined) {
            currentSchedule[id] = schedule
        }
        if (id === 12 && initialSchedulesDiscovered === 0) {
            broadcastInitialSchedules(counter)
            initialSchedulesDiscovered = 1
        } else
        if (initialSchedulesDiscovered === 1) { //TODO: AND A CHANGE.  Either circuit by circuit or all of them?
            broadcastScheduleChange(id, schedule, counter)
            currentSchedule[id] = schedule
        } else if ('no change') { //TODO: and finally, no change
            if (container.settings.logConfigMessages)
                logger.debug('Msg# %s:  Schedule %s has not changed.', counter, id)
        }
        if (id === 12) {
            container.io.emitToClients('schedule')
        }
    }


    function broadcastInitialSchedules(counter) {
        var scheduleStr = 'Msg# ' + counter + '  Schedules discovered:'
        for (var i = 1; i <= 12; i++) {
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

    function broadcastScheduleChange(id, schedule, counter) {
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
        scheduleChgStr += ' CIRCUIT:(' + id + ')' + schedule.CIRCUIT
            //TO string
        if (schedule.MODE === 'Egg Timer') {

            scheduleChgStr += formatEggTimerStr(id)
        } else {

            scheduleChgStr += formatScheduleStr(0, schedule)
        }
        logger.verbose(scheduleChgStr)
    }

    function formatSchedId(id) {
        var str = ''
        str += '\nID:'
        str += currentSchedule[id].ID < 10 ? ' ' + currentSchedule[id].ID : currentSchedule[id].ID
        return str
    }

    function formatEggTimerStr(id) {
        var str = ' MODE:' + currentSchedule[id].MODE + ' DURATION:' + currentSchedule[id].DURATION
        return str
    }

    function formatScheduleStr(id, schedule) {
        var str = ''
        if (id === 0) { //format the temp schedule
            str += 'MODE:' + schedule.MODE + ' START_TIME:' + schedule.START_TIME + ' END_TIME:' + schedule.END_TIME + ' DAYS:' + schedule.DAYS

        } else //format currentSchedule
        {
            str += ' MODE:' + currentSchedule[id].MODE + ' START_TIME:' + currentSchedule[id].START_TIME + ' END_TIME:' + currentSchedule[id].END_TIME + ' DAYS:' + currentSchedule[id].DAYS
        }
        return str

    }

    function numberOfSchedulesRegistered() {
        return currentSchedule.length
    }

    if (container.logModuleLoading)
        container.logger.info('Loaded: schedule.js')

    return {
        getCurrentSchedule: getCurrentSchedule,
        addScheduleDetails: addScheduleDetails,
        numberOfSchedulesRegistered: numberOfSchedulesRegistered
        //currentSchedule
    }


}
