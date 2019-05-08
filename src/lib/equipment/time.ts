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

import { settings, logger, intellitouch, queuePacket } from'../../etc/internal';
import { formatTime } from "../../etc/formatTime";

export namespace time
{
    var time:ITime.ETime;


    export function init ()
    {
        time = {
            controllerTime: 'notset',
            controllerDateStr: 'datestrnotset',
            controllerDay: -1,
            controllerMonth: -1,
            controllerYear: -1,
            controllerDayOfWeekStr: 'Sunday',
            controllerDayOfWeek: -'',
            automaticallyAdjustDST: 0,
            pump1Time: 'notset',
            pump2Time: 'notset',
            minute: -1,
            hour: -1,
            hour24: -1,
            meridiem: 'notset',
            UTC: 'notset',
            locale: 'notset',
            ISO: 'notset',
            pumpTime: {}
        }
    }

    export var setAutomaticallyAdjustDST = function ( bool: number )
    {
        time.automaticallyAdjustDST = bool
    }

    export function lookupDOW ( dayofweek: number ): ITime.DOW
    {
        switch ( dayofweek )
        {
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
                    return 'Sunday'
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
        // io.emitToClients('time')
    }
    */
    export function setControllerTime ( hour: number, min:number)
    {
        if ( ( hour !== time.hour && min !== time.minute ) || time.controllerTime.includes('notset') )
        {
            var timeStr = formatTime( hour, min )
           
            time.minute = min
            time.hour24 = hour
            if ( hour > 12 )
            {
                time.hour = hour - 12
                time.meridiem = 'pm'
            }
            else
            {
                time.hour = hour
                time.meridiem = 'am'
            }
            time.controllerTime = timeStr;
            //io.emitToClients('time')
             
        }
        else
        {
            if ( settings.get( 'logConfigMessages' ) ) logger.silly( 'No change in time.' )
        }

    }

    export function updateDateTime ( hour: number, min: number, dayofweek: number, day: number, month: number, year: number, autodst: number, callback?: ( ( func: any ) => {} ) )
    {
        //setControllerDate(dayofweek, day, month, year, autodst)
        //setControllerTime(hour, min)

        //date
        time.controllerDay = day
        time.controllerMonth = month
        time.controllerYear = year
        time.controllerDateStr = month + '/' + day + '/20' + year
        time.controllerDayOfWeek = dayofweek
        time.controllerDayOfWeekStr = lookupDOW( dayofweek )

        var timeStr = formatTime( hour, min )
        time.controllerTime = timeStr;
        time.hour24 = hour
        time.minute = min
        if ( hour > 12 )
        {
            time.hour = hour - 12
            time.meridiem = 'pm'
        }
        else
        {
            time.hour = hour
            time.meridiem = 'am'
        }
        let UTC = new Date( 2000 + year, month - 1, day, hour, min )
        time.UTC = UTC.toUTCString()
        time.locale = UTC.toLocaleString()
        time.ISO = UTC.toISOString()

        time.automaticallyAdjustDST = autodst
    }

    export function setDateTime ( hour: number, min: number, dayofweek: number, day: number, month: number, year: number, autodst: number, callback?: ( func: any ) => {} )
    {

        if ( intellitouch.getPreambleByte() !== undefined )
        {
            var setDateTimePacket = [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 133, 8, hour, min, dayofweek, day, month, year, 0, autodst ];
            queuePacket.queuePacket( setDateTimePacket );
            var response: API.Response = {}
            response.text = 'User request to set date and time to '
            response.text += hour + ':' + min + ' ' + dayofweek + ', ' + month + '/' + day + '/20' + year + ' (mm/dd/yyyy)'
            logger.info( 'API Response', response )
        }
        //callback will be present when we are responding back to the Express auth and showing the user a message.  But not with SocketIO call where we will just log it.
        if ( callback !== undefined )
        {
            callback( response )
        }
    }



    export function setPumpTime ( pump: number | number, _time: string )
    {
        // var pumpStr = "pump" + pump + "Time"
        time.pumpTime[ pump ] = _time
    }

    export function getTime ()
    {
        return { 'time': time }
    }


    /*istanbul ignore next */
    // if (logModuleLoading)
    //     logger.info('Loaded: time.js')
}