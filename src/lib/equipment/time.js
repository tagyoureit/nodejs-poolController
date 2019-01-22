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

module.exports = function (container) {

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: time.js')

    var time;

    var init = function () {
        time = {
            "controllerTime": -1,
            "controllerDateStr": 'datestrnotset',
            "controllerDay": 'daynotset',
            "controllerMonth": 'monthnotset',
            "controllerYear": 'yearnotset',
            "controllerDayOfWeekStr": 'dayofweekstrnotset',
            "controllerDayOfWeek": 'dayofweeknotset',
            "automaticallyAdjustDST": 0,
            "pump1Time": -1,
            "pump2Time": -1
        }
    }

        var setAutomaticallyAdjustDST = function(bool) {
           time.automaticallyAdjustDST = bool
       } 

    var lookupDOW = function (dayofweek) {
        switch (dayofweek) {
            case 1:
                {
                    return 'Sunday'
                    break
                }
            case 2:
                {
                    return 'Monday'
                    break
                }
            case 4:
                {
                    return 'Tuesday'
                    break
                }
            case 8:
                {
                    return 'Wednesday'
                    break
                }
            case 16:
                {
                    return 'Thursday'
                    break
                }
            case 32:
                {
                    return 'Friday'
                    break
                }
            case 64:
                {
                    return 'Saturday'
                    break
                }
            default:
                {
                    return -1
                }
        }
    }

    /* var setControllerDate = function(dayofweek, day, month, year, dst) {
        time.controllerDay = day
        time.controllerMonth = month
        time.controllerYear = year
        time.controllerDateStr = month + '/' + day + '/20' + year
        time.controllerDayOfWeek = dayofweek
        time.controllerDayOfWeekStr = lookupDOW(dayofweek)
        if (dst !== null) setAutomaticallyAdjustDST(dst)
        // container.io.emitToClients('time')
    }
    */
    var setControllerTime = function (hour, min) {
        if ((hour !== time.hour && min !== time.minute) || time.controllerTime === -1) {
            var timeStr = container.helpers.formatTime(hour, min)
           
                time.minute = min
                time.hour24 = hour
                if (hour > 12) {
                    time.hour = hour - 12
                    time.meridem = 'pm'
                }
                else {
                    time.hour = hour
                    time.meridiem = 'am'
                }
                time.controllerTime = timeStr;
                //container.io.emitToClients('time')
             
        }
        else {
            if (container.settings.get('logConfigMessages')) container.logger.silly('No change in time.')
        }

    }

    var updateDateTime = function (hour, min, dayofweek, day, month, year, autodst, callback) {
        //setControllerDate(dayofweek, day, month, year, autodst)
        //setControllerTime(hour, min)

        //date
        time.controllerDay = day
        time.controllerMonth = month
        time.controllerYear = year
        time.controllerDateStr = month + '/' + day + '/20' + year
        time.controllerDayOfWeek = dayofweek
        time.controllerDayOfWeekStr = lookupDOW(dayofweek)

        var timeStr = container.helpers.formatTime(hour, min)
        time.controllerTime = timeStr;
        time.hour24 = hour
        time.minute = min
        if (hour > 12) {
            time.hour = hour - 12
            time.meridem = 'pm'
        }
        else {
            time.hour = hour
            time.meridiem = 'am'
        }
        let UTC = new Date('20' + year, month - 1, day, hour, min)
        time.UTC = UTC.toUTCString()
        time.locale = UTC.toLocaleString()
        time.ISO = UTC.toISOString()

        time.automaticallyAdjustDST = autodst
    }

    var setDateTime = function (hour, min, dayofweek, day, month, year, autodst, callback) {

        if (container.intellitouch.getPreambleByte()!==undefined) {
            var setDateTimePacket = [165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 133, 8, hour, min, dayofweek, day, month, year, 0, autodst];
            container.queuePacket.queuePacket(setDateTimePacket);
            var response = {}
            response.text = 'User request to set date and time to '
            response.text += hour + ':' + min + ' ' + dayofweek + ', ' + month + '/' + day + '/20' + year + ' (mm/dd/yyyy)'
            container.logger.info(response)
        }
        //callback will be present when we are responding back to the Express auth and showing the user a message.  But not with SocketIO call where we will just log it.
        if (callback !== undefined) {
            callback(response)
        }
    }



    var setPumpTime = function (pump, time) {
        var pumpStr = "pump" + pump + "Time"
        time[pumpStr] = time
    }

    var getTime = function () {
        return { 'time': time }
    }


    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: time.js')


    return {
        updateDateTime: updateDateTime,
        //time,
        setControllerTime: setControllerTime,
        getTime: getTime,
        setDateTime: setDateTime,
        setPumpTime: setPumpTime,
        setAutomaticallyAdjustDST: setAutomaticallyAdjustDST,
        //setControllerDate: setControllerDate,
        lookupDOW: lookupDOW,
        init: init
    }
}
