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

import { settings, logger, queuePacket, intellitouch, circuit, io } from '../../etc/internal';
import * as constants from "../../etc/constants"
import { formatTime, pad } from "../../etc/formatTime";

export namespace schedule
{

    var currentSchedule: ScheduleModule.ScheduleObj = {}

    //TODO: rename all UPPERCASE to camelCase
    class Schedule implements ScheduleModule.ScheduleClass
    {
        circuit: string;
        circuitNum: number;
        bytes: number[];
        id: number;
        mode: ScheduleModule.SchedType;
        duration: string;
        friendlyName: string;
        days: string;
        startTime: ITime.BaseTime;
        endTime: ITime.BaseTime

        constructor( id: number, _circuit?: number, days?: number, time1?: number, time2?: number, time3?: number, time4?: number, bytes?: number[], counter?: number )
        {
            let BaseTime:ITime.BaseTime = {
                minute: -1,
                hour: -1,
                hour24: -1,
                meridiem: 'notset',
                time: 'notset',
                time24: 'notset'
            }
            this.id = id;
            if ( _circuit !== undefined )
            {
                this.circuit = _circuit === 0 ? constants.strCircuitName[ _circuit ] : circuit.getCircuitName( _circuit );
                this.friendlyName = _circuit === 0 ? constants.strCircuitName[ _circuit ] : circuit.getFriendlyName( _circuit );
                this.circuitNum = _circuit
                this.bytes = bytes
                this.startTime = Object.assign( {}, BaseTime);
                this.endTime = Object.assign( {}, BaseTime);
                if ( time1 === 25 ) //25 = Egg Timer
                {
                    this.mode = 'Egg Timer'
                    this.duration = time3 + ':' + time4;
                } else
                {
                    this.mode = 'Schedule'
                    this.duration = 'n/a'
                    // Extended Start Time parameters
                    if ( time1 > 12 )
                    {
                        this.startTime.hour = time1 - 12;
                        this.startTime.meridiem = 'pm';
                    }
                    else
                    {

                        this.startTime.hour = time1;
                        this.startTime.meridiem = 'am';
                    }
                    this.startTime.hour24 = time1;
                    this.startTime.minute = time2;
                    this.startTime.time = formatTime( this.startTime.hour, this.startTime.minute )
                    this.startTime.time24 = pad( time1, 2, "0" ) + ':' + pad( time2, 2, "0" )

                    // Extended End Time parameters
                    if ( time3 > 12 )
                    {
                        this.endTime.hour = time3 - 12;
                        this.endTime.meridiem = 'pm';
                    }
                    else
                    {

                        this.endTime.hour = time1;
                        this.endTime.meridiem = 'am';
                    }
                    this.endTime.hour24 = time3;
                    this.endTime.minute = time4;
                    this.endTime.time = formatTime( this.endTime.hour, this.endTime.minute )
                    this.endTime.time24 = pad( time3, 2, "0" ) + ':' + pad( time4, 2, "0" );
                    this.days = dayStr( days )

                }
            }

        }

    }


    //var bufferArr = []; //variable to process buffer.  interimBufferArr will be copied here when ready to process
    //var interimBufferArr = []; //variable to hold all serialport.open data; incomind data is appended to this with each read
    var initialSchedulesDiscovered = 0
    var numberOfSchedules = 12

    export function init ()
    {
        numberOfSchedules = settings.get( 'equipment.controller.intellitouch.numberOfSchedules' )

        currentSchedule = {}; //schedules

    }

    export function formatSchedId ( _id: number )
    {
        var str = ''
        str += '\nID:'
        str += currentSchedule[ _id ].id < 10 ? ' ' + currentSchedule[_id ].id : currentSchedule[ _id ].id
        return str
    }

    export function formatEggTimerStr ( id: number )
    {
        var str = ' MODE:' + currentSchedule[ id ].mode + ' DURATION:' + currentSchedule[ id ].duration
        return str
    }

    export function formatScheduleStr ( id: number, schedule?: ScheduleModule.ScheduleClass )
    {
        var str = ''
        if ( id === 0 )
        { //format the temp schedule
            str += 'MODE:' + schedule.mode + ' startTime:' + schedule.startTime.time24 + ' END_TIME:' + schedule.endTime.time24 + ' days:' + schedule.days

        } else //format currentSchedule
        {
            str += ' MODE:' + currentSchedule[ id ].mode + ' startTime:' + currentSchedule[ id ].startTime.time24 + ' END_TIME:' + currentSchedule[ id ].endTime.time24 + ' DAYS:' + currentSchedule[ id ].days
        }
        return str

    }

    export function getCurrentSchedule ()
    {
        return { 'schedule': currentSchedule }
    }


    export function broadcastInitialSchedules ( counter: number )
    {
        var scheduleStr = 'Msg# ' + counter + '  Schedules discovered:'
        for ( var i = 1; i <= numberOfSchedules; i++ )
        {
            scheduleStr += formatSchedId( i )
            scheduleStr += '  CIRCUIT:(' + currentSchedule[ i ].circuitNum + ')' + currentSchedule[ i ].circuit + ' '
            if ( currentSchedule[ i ].circuit !== 'NOT USED' )
            {
                if ( currentSchedule[ i ].mode === 'Egg Timer' )
                {
                    scheduleStr += formatEggTimerStr( i )
                } else
                {
                    scheduleStr += formatScheduleStr( i )
                    // scheduleStr += formatScheduleStr( i, 0 )
                }
            }
        }
        logger.info( '%s\n\n', scheduleStr )
    }

    export function broadcastScheduleChange ( id: number, schedule: ScheduleModule.ScheduleClass, counter: number )
    {
        //Explicitly writing out the old/new packets because if we call .whatsDifferent and the schedule switches from an egg timer to schedule (or vice versa) it will throw an error)

        var scheduleChgStr = ''
        scheduleChgStr += 'Msg# ' + counter
        scheduleChgStr += '  Schedule '
        scheduleChgStr += formatSchedId( id )
        scheduleChgStr += ' changed from:\n'
        scheduleChgStr += 'ID:' + currentSchedule[ id ].id + ' CIRCUIT:(' + id + ')' + currentSchedule[ id ].circuit
        //FROM string
        if ( currentSchedule[ id ].mode === 'Egg Timer' )
        {
            scheduleChgStr += formatEggTimerStr( id )

        } else
        {

            // scheduleChgStr += formatScheduleStr( id, 0 )
            scheduleChgStr += formatScheduleStr( 0, schedule )

        }


        scheduleChgStr += '\n'
        scheduleChgStr += ' CIRCUIT:(' + id + ')' + schedule.circuit + ' '
        //TO string
        if ( schedule.mode === 'Egg Timer' )
        {

            scheduleChgStr += formatEggTimerStr( id )
        } else
        {

            scheduleChgStr += formatScheduleStr( 0, schedule )
        }
        logger.verbose( scheduleChgStr )
    }

    export function dayStr ( days: number )
    {
        var dayStr = ''
        if ( ( days === 0 ) )
            dayStr += 'None';
        if ( ( days & 1 ) === 1 )
            dayStr += 'Sunday '; //1
        if ( ( days & 2 ) >> 1 === 1 )
            dayStr += 'Monday '; // 2
        if ( ( days & 4 ) >> 2 === 1 )
            dayStr += 'Tuesday '; // 4
        if ( ( days & 8 ) >> 3 === 1 )
            dayStr += 'Wednesday '; //8
        if ( ( days & 16 ) >> 4 === 1 )
            dayStr += 'Thursday '; //16
        if ( ( days & 32 ) >> 5 === 1 )
            dayStr += 'Friday '; //32
        if ( ( days & 64 ) >> 6 === 1 )
            dayStr += 'Saturday '; //64
        // is 128 "no days"?
        return dayStr
    }



    export function addScheduleDetails ( id: number, _circuit: number, days: number, time1: number, time2: number, time3: number, time4: number, bytes: number[], counter: number )
    {

        var schedule = new Schedule( id, _circuit, days, time1, time2, time3, time4, bytes, counter )

        if ( currentSchedule[ id ] === undefined )
        {
            currentSchedule[ id ] = schedule
        }
        if ( id === numberOfSchedules && initialSchedulesDiscovered === 0 )
        {
            broadcastInitialSchedules( counter )
            initialSchedulesDiscovered = 1
        } else if ( initialSchedulesDiscovered === 1 )
        { //TODO: AND A CHANGE.  Either circuit by circuit or all of them?
            if ( JSON.stringify( currentSchedule[ id ] ) !== JSON.stringify( schedule ) )
            {
                broadcastScheduleChange( id, schedule, counter )
                currentSchedule[ id ] = schedule
               emit()
            } else
            {
                if ( settings.get( 'logConfigMessages' ) )
                    logger.debug( 'Msg# %s:  Schedule %s has not changed.', counter, id )
            }
        }
        if ( id === numberOfSchedules )
        {
            emit()
        }
    }

    function emit ()
    {
        io.emitToClients( 'schedule', { schedule: currentSchedule } )

    }

    export function numberOfSchedulesRegistered ()
    {
        return Object.keys( currentSchedule ).length
    }

    export function getControllerScheduleByID ( _id: number )
    {
        logger.verbose( 'Queueing packet to retrieve schedule by id %s', _id )
        queuePacket.queuePacket( [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 209, 1, _id ] );
    }

    export function getControllerScheduleAll ()
    {
        //get schedules
        for ( var i = 1; i <= numberOfSchedules; i++ )
        {

            queuePacket.queuePacket( [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 209, 1, i ] );
        }
    }

    export function setControllerSchedule ( id: number, _circuit: number, starthh: number, startmm: number, endhh: number, endmm: number, days: number )
    {
        //validate
        if ( id >= 0 && id <= numberOfSchedules && starthh >= 0 && starthh <= 25 && startmm >= 0 && startmm <= 59 && endhh >= 0 && endmm <= 59 )
        {
            var scheduleStr = 'Queueing message to set schedule '
            scheduleStr += id < 10 ? ' ' + id : id
            // var circuitTmpStr = circuit === 0 ? constants.strCircuitName[circuit] : circuit.getCircuitName(circuit)
            var circuitTmpStr = _circuit === 0 ? constants.strCircuitName[ _circuit ] : circuit.getCircuit( _circuit ).name
            scheduleStr += ' CIRCUIT:(' + _circuit + ')' + circuitTmpStr + ' '

            if ( starthh === 25 )
            {
                scheduleStr += ' MODE: Egg Timer DURATION:' + endhh + ':' + endmm
            } else
            {
                scheduleStr += 'MODE: Schedule startTime:' + starthh + ':' + startmm + ' endTime:' + endhh + ':' + endmm + ' DAYS:' + dayStr( days )
            }

            logger.info( scheduleStr )

            queuePacket.queuePacket( [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 145, 7, id, _circuit, starthh, startmm, endhh, endmm, days ] );
            getControllerScheduleAll()
        } else
        {
            logger.warn( 'Aborting Queue set schedule packet with an invalid value: ', id, _circuit, starthh, startmm, endhh, endmm, days + 128 )
        }
    }

    export function deleteScheduleOrEggTimer ( id: number )
    {
        setControllerSchedule( id, 0, 0, 0, 0, 0, 0 )
    }

    /*     export function getControllerScheduleByCircuitID ( _circuit: number )
        {
            for ( var i = 0; i <= numberOfSchedules; i++ )
            {
                // if ( currentSchedule[circuit] === _circuit )
                if ( currentSchedule[i].circuitNum === _circuit )
                {
                    logger.verbose( 'Queueing packet to retrieve schedule %s by circuit id %s', i, _circuit )
                    queuePacket.queuePacket( [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 209, 1, i ] );
                }
            }
        } */

    export function dayOfWeekAsInt ( day: string )
    {
        var index = 0
        if ( day.length === 3 )
        {
            index = [ "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" ].indexOf( day )
        } else
        {
            index = [ "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" ].indexOf( day )
        }
        return ( 1 << index )
    }

    export function toggleDay ( id: number, day: any )
    {
        // this function will take a schedule ID and toggle the day(s) that are passed to it.
        // day can be in the format of:
        // - a 3 digit string (Sun, Sat, etc)
        // - the full name (Sunday, Saturday, etc)
        // - a value representing one or more days (1=Sunday, 2=Monday, 3=Sunday+Monday) as represented by the binary days bit

        var dayIndex = parseInt( day )
        if ( isNaN( dayIndex ) )
        {
            dayIndex = dayOfWeekAsInt( day )
        }

        var old_days = currentSchedule[ id ].bytes[ constants.schedulePacketBytes.DAYS ]
        var new_days = currentSchedule[ id ].bytes[ constants.schedulePacketBytes.DAYS ]
        new_days = new_days ^= dayIndex

        if ( settings.get( 'logApi' ) )
            logger.info( "Schedule change requested for %s (id:%s). Toggle Day(s) %s: \n\tFrom: %s \n\tTo: %s", currentSchedule[ id ].friendlyName, id, day, dayStr( old_days ), dayStr( new_days ) )
        setControllerSchedule( currentSchedule[ id ].bytes[ constants.schedulePacketBytes.ID ],
            currentSchedule[ id ].bytes[ constants.schedulePacketBytes.CIRCUIT ], currentSchedule[ id ].bytes[ constants.schedulePacketBytes.TIME1 ], currentSchedule[ id ].bytes[ constants.schedulePacketBytes.TIME2 ], currentSchedule[ id ].bytes[ constants.schedulePacketBytes.TIME3 ],
            currentSchedule[ id ].bytes[ constants.schedulePacketBytes.TIME4 ],
            new_days )
    }

    export function setControllerScheduleStartOrEndTime ( id: number, startOrEnd: string, hour: number, min: number )
    {
        // this function will take a schedule ID set the start or end time.
        // time should be sent in 24hr format.  EG 4:01pm = 16, 1

        if ( settings.get( 'logApi' ) )
            logger.info( "Schedule change requested for %s (id:%s). Set %s time to %s:%s", currentSchedule[ id ].friendlyName, id, startOrEnd, hour, min )

        if ( startOrEnd === 'start' )
        {
            setControllerSchedule( currentSchedule[ id ].bytes[ constants.schedulePacketBytes.ID ],
                currentSchedule[ id ].bytes[ constants.schedulePacketBytes.CIRCUIT ], hour, min, currentSchedule[ id ].bytes[ constants.schedulePacketBytes.TIME3 ],
                currentSchedule[ id ].bytes[ constants.schedulePacketBytes.TIME4 ],
                currentSchedule[ id ].bytes[ constants.schedulePacketBytes.DAYS ] )
        } else
        {
            setControllerSchedule( currentSchedule[ id ].bytes[ constants.schedulePacketBytes.ID ],
                currentSchedule[ id ].bytes[ constants.schedulePacketBytes.CIRCUIT ], currentSchedule[ id ].bytes[ constants.schedulePacketBytes.TIME1 ], currentSchedule[ id ].bytes[ constants.schedulePacketBytes.TIME2 ], hour, min,
                currentSchedule[ id ].bytes[ constants.schedulePacketBytes.DAYS ] )
        }
    }

    export function setControllerEggTimer ( id: number, circuit: number, hour: number, min: number )
    {
        // this function will take a schedule ID set the circuit and duration.
        // time should be sent in 24hr format.  EG 4:01pm = 16, 1

        if ( settings.get( 'logApi' ) )
            logger.info( "Egg Timer change requested for %s (id:%s). Set %s duration to %s hours, %s minutes", currentSchedule[ id ].friendlyName, id, hour, min )

        setControllerSchedule( currentSchedule[ id ].bytes[ constants.schedulePacketBytes.ID ],
            circuit, 25, 0, hour, min, 0 )

    }

    export function setControllerScheduleCircuit ( id: number, _circuit: number )
    {
        // this function will take a schedule ID and change the circuit


        if ( settings.get( 'logApi' ) )
            logger.info( "Schedule change requested for %s (id:%s). Change circuit to: %s", currentSchedule[ id ].circuit, id, circuit.getCircuit( _circuit ).friendlyName )
        setControllerSchedule( currentSchedule[ id ].bytes[ constants.schedulePacketBytes.ID ],
            _circuit, currentSchedule[ id ].bytes[ constants.schedulePacketBytes.TIME1 ], currentSchedule[ id ].bytes[ constants.schedulePacketBytes.TIME2 ], currentSchedule[ id ].bytes[ constants.schedulePacketBytes.TIME3 ],
            currentSchedule[ id ].bytes[ constants.schedulePacketBytes.TIME4 ],
            currentSchedule[ id ].bytes[ constants.schedulePacketBytes.DAYS ] )
    }
}