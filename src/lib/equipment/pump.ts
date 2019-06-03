//  nodejs-poolController.  An application to control pool equipment.
//  Copyright (C) 2016, 2017, 2018, 2019.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU Affero General Public License as
//  published by the Free Software Foundation, either version 3 of the
//  License, or (at your option) any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU Affero General Public License for more details.
//
//  You should have received a copy of the GNU Affero General Public License
//  along with this program.  If not, see <http://www.gnu.org/licenses/>.



import { settings, logger, time, queuePacket, intellitouch, io, influx, pumpConfig } from '../../etc/internal'
import * as constants from '../../etc/constants';
import { formatTime } from "../../etc/formatTime";

import { pumpAddressToIndex, PumpIndexToAddress, getPumpIndexFromSerialBusAddress, packetFromPump, packetToPump } from '../../etc/pumpAddress'


var _ = require( 'underscore' )

export namespace pump
{

    var currentRunning: Pump.CurrentRunning = {
        'mode': 'off',
        'value': 0,
        'remainingduration': -1
    }

    var externalProgram: Pump.ExternalProgram = {
        "1": -1,
        "2": -1,
        "3": -1,
        "4": -1
    }

    class Pump implements Pump.Equipment
    {
        pump: number;
        name: string;
        friendlyName: string;
        type: Pump.PumpType;
        time: string;
        run: number;
        mode: number;
        drivestate: number;
        watts: number;
        rpm: number;
        gpm: number;
        ppc: number;
        err: number;
        timer: number;
        duration: number; //duration on pump, not program duration
        currentprogram: number;
        currentrunning: Pump.CurrentRunning;
        externalProgram: Pump.ExternalProgram;
        remotecontrol: number;
        power: number;
        virtualControllerType: Pump.VirtualControllerType;
        virtualControllerStatus: Pump.VirtualControllerStatus;

        constructor( pumpNum: number )
        {

            this.pump = pumpNum;
            this.name = constants.ctrlString[ pumpNum + 95 ]
            this.type = 'NONE';
            this.time = 'timenotset';
            this.run = -1;
            this.mode = -1;
            this.drivestate = -1;
            this.watts = -1;
            this.rpm = -1;
            this.gpm = -1;
            this.ppc = -1;
            this.err = -1;
            this.timer = -1;
            this.duration = -1;
            this.currentrunning = currentRunning
            this.externalProgram = externalProgram
            this.remotecontrol = -1;
            this.power = -1;
            this.loadProgramsFromConfig();

        }

        private loadProgramsFromConfig = function ()
        {
            var pumpConfig: any = settings.get( 'pump' )[ this.pump ]
            Object.assign( this, pumpConfig )
            if ( pumpConfig.friendlyName !== "" )
            {
                this.friendlyName = pumpConfig.friendlyName
            }
            else
            {
                this.friendlyName = this.name
            }

        }
    }

    /*     function Pump(number, name, type, time, run, mode, drivestate, watts, rpm, gpm, ppc, err, timer, duration, currentrunning, externalProgram, remotecontrol, power) {
            this.pump = number; //1 or 2
            this.name = name;
            this.type = type;
            this.time = time;
            this.run = run;
            this.mode = mode;
            this.drivestate = drivestate;
            this.watts = watts;
            this.rpm = rpm;
            this.gpm = gpm;
            this.ppc = ppc;
            this.err = err;
            this.timer = timer;
            this.duration = duration; //duration on pump, not program duration
            this.currentrunning = currentrunning
            this.externalProgram = externalProgram
            // this.program1rpm = program1rpm;
            // this.program2rpm = program2rpm;
            // this.program3rpm = program3rpm;
            // this.program4rpm = program4rpm;
            this.remotecontrol = remotecontrol;
            this.power = power;
        } */

    var /* pump1,
        pump2,
        pump3,
        pump4,
        pump5,
        pump6,
        pump7,
        pump8,
        pump9,
        pump10,
        pump11,
        pump12,
        pump13,
        pump14,
        pump15,
        pump16, */
        currentPumpStatus: Pump.PumpStatus,
        numPumps = -1



    /*  var template = new Pump( 1, 'namenotset', 'typenotset', 'timenotset', 'runnotset', 'modenotset', 'drivestatenotset', 'wattsnotset', 'rpmnotset', 'gpmnotset', 'ppcnotset', 'errnotset', 'timernotset', 'durationnotset', {
         'mode': 'off',
         'value': 0,
         'remainingduration': -1
     }, externalProgram, 'remotecontrolnotset', 'powernotset' )
  */
    export function numberOfPumps ()
    {

        return numPumps
    }

    export function setVirtualControllerStatus ( status: Pump.VirtualControllerStatus )
    {
        for ( var _pump in settings.get( 'pump' ) )
        {
            if ( parseInt( _pump ) <= numPumps )
            {
                currentPumpStatus[ parseInt( _pump ) ].virtualControllerStatus = status
            }
        }
    }

    export function checkPumpsInConfig ()
    {

        var pumpTemplate: object = {
            type: 'none',
            externalProgram: externalProgram
        }

        var configPumps = settings.get( 'equipment.pump' )
        var expectedCountPumps = settings.get( 'equipment.controller.intellitouch.numberOfPumps' )
        var existingCountPumps = _.size( configPumps )
        if ( existingCountPumps < expectedCountPumps )
        {
            for ( var i = existingCountPumps + 1; i <= expectedCountPumps; i++ )
            {
                configPumps[ i ] = JSON.parse( JSON.stringify( pumpTemplate ) )
            }
            settings.set( 'equipment.pump', configPumps )
        }
        logger.info( 'Just expanded %s to include additional Pumps for circuits.', settings.get( 'configurationFileLocation' ) )
    }

    export function init ()
    {
        currentPumpStatus = {}
        checkPumpsInConfig()
        let pumpConfig = settings.get( 'pump' )

        for ( var _pump in pumpConfig )
        {
            if ( pumpConfig[ _pump ].type.toLowerCase() !== 'none' )
            {
                numPumps = parseInt( _pump )
            }
        }

        // currentPumpStatus[ 1 ] = new Pump( 1 )

        // assign the right objects to the currentPumpStatus object.
        for ( var i = 1; i <= numPumps; i++ )
        {
            currentPumpStatus[ i ] = new Pump( i );
            // currentPumpStatus[ i ].pump = i;
        }

        //loadProgramsFromConfig()

        if ( settings.get( 'logPumpMessages' ) )
            logger.silly( 'Pump settings initialized/reset' )
    }

    export function pumpType ( index: number ): Pump.PumpType
    {
        if ( index <= numPumps + 95 )
        {
            return currentPumpStatus[ index ].type
        } else
        {
            return "NONE"
        }
    }

    export function setTime ( pump: number, hour: number, min: number ): void
    {
        if ( pump <= numPumps )
        {
            var timeStr = formatTime( hour, min )
            currentPumpStatus[ pump ].time = timeStr
            time.setPumpTime( pump, timeStr )
        }
    }


    // export function isPump ( data )
    // {

    // }

    export function significantWattsChange ( pump: number, watts: number, counter: number ): boolean
    {
        if ( pump <= numPumps )
        {
            if ( ( Math.abs( ( watts - currentPumpStatus[ pump ].watts ) / watts ) ) > ( 5 / 100 ) )
            {
                if ( settings.get( 'logPumpMessages' ) ) logger.info( 'Msg# %s   Pump %s watts changed >5%: %s --> %s \n', counter, pump, currentPumpStatus[ pump ].watts, watts )
                return true
            }
            return false
        }
    }

    export function pumpACK ( data: number[], from: number, counter: number )
    {
        if ( settings.get( 'logPumpMessages' ) )
            logger.verbose( 'Msg# %s   %s responded with acknowledgement: %s', counter, constants.ctrlString[ from ], JSON.stringify( data ) );
    }

    export function setCurrentProgramFromController ( program: number, from: number, data: number[], counter: number )
    {
        //setAmount = setAmount / 8
        var pump = getPumpIndexFromSerialBusAddress( data )
        if ( pump <= numPumps )
        {
            if ( currentPumpStatus[ pump ].currentprogram !== program )
            {
                currentPumpStatus[ pump ].currentprogram = program;
                if ( settings.get( 'logPumpMessages' ) )
                    logger.verbose( 'Msg# %s   %s: Set Current Program to %s %s', counter, constants.ctrlString[ from ], program.toString(), JSON.stringify( data ) );
            }
            emit()
            influx.writePumpData( currentPumpStatus )


        }
    }

    function emit ()
    {
        io.emitToClients( 'pump', {
            pump: currentPumpStatus,
            pumpConfig: pumpConfig.getExtendedPumpConfig() 
        } )
    }

    // export function getCurrentProgram ( pump: number )
    // {
    //     if ( pump <= numPumps )
    //     {
    //         return currentPumpStatus[ pump ].currentprogram
    //     } else
    //     {
    //         return -1
    //     }
    // }


    export function saveExternalProgramAs ( program: number, value: number, from: number, data: number[], counter: number )
    {

        var _pump = getPumpIndexFromSerialBusAddress( data )
        if ( _pump <= numPumps )
        {
            if ( currentPumpStatus[ _pump ].externalProgram[ program ] !== value )
            {
                settings.updateExternalPumpProgram( _pump, program, value )
                currentPumpStatus[ _pump ].externalProgram[ program ] = value;
                if ( settings.get( 'logPumpMessages' ) )
                    logger.verbose( 'Msg# %s   %s: Save Program %s as %s RPM %s', counter, constants.ctrlString[ from ], program, value, JSON.stringify( data ) );
            }
            emit()
            influx.writePumpData( currentPumpStatus )

        }
    }

    export function setRemoteControl ( remotecontrol: number, from: number, data: number[], counter: number )
    {

        var remoteControlStr = remotecontrol === 0 ? 'enable' : 'disable'
        var pump = getPumpIndexFromSerialBusAddress( data )
        if ( pump <= numPumps )
        {
            // code to support up to 16 pumps
            // if (data[constants.packetFields.DEST] === 96 || data[constants.packetFields.DEST] === 97) //Command to the pump
            if ( packetToPump( data ) ) // command to the pump
            {
                if ( settings.get( 'logPumpMessages' ) )
                    logger.verbose( 'Msg# %s   %s --> %s: Remote control - %s pump control panel: %s', counter, constants.ctrlString[ from ], constants.ctrlString[ data[ constants.packetFields.DEST ] ], remoteControlStr, JSON.stringify( data ) );
            } else
            {
                if ( settings.get( 'logPumpMessages' ) )
                    logger.verbose( 'Msg# %s   %s: Remote control -  %s pump control panel: %s', counter, constants.ctrlString[ from ], remoteControlStr, JSON.stringify( data ) );
            }
            currentPumpStatus[ pump ].remotecontrol = remotecontrol
        }
    }

    export function setRunMode ( mode: number, from: number, data: any[] | number[], counter: number )
    {


        var pump = getPumpIndexFromSerialBusAddress( data )
        if ( pump <= numPumps )
        {
            let _mode: string;
            // code to support up to 16 pumps
            // if (data[constants.packetFields.DEST] === 96 || data[constants.packetFields.DEST] === 97) //Command to the pump
            if ( packetToPump( data ) ) // command to the pump
            {

                switch ( mode )
                {
                    case 0: {
                        _mode = "Filter";
                        break;
                    }
                    case 1: {
                        _mode = "Manual";
                        break;
                    }
                    case 2: {
                        _mode = "Speed 1";
                        break;
                    }
                    case 3: {
                        _mode = "Speed 2";
                        break;
                    }
                    case 4: {
                        _mode = "Speed 3";
                        break;
                    }
                    case 5: {
                        _mode = "Speed 4";
                        break;
                    }
                    case 6: {
                        _mode = "Feature 1";
                        break;
                    }
                    case 7: {
                        _mode = "Unknown pump mode";
                        break;
                    }
                    case 8: {
                        _mode = "Unknown pump mode";
                        break;
                    }
                    case 9: {
                        _mode = "External Program 1";
                        break;
                    }
                    case 10: {
                        _mode = "External Program 2";
                        break;
                    }
                    case 11: {
                        _mode = "External Program 3";
                        break;
                    }
                    case 12: {
                        _mode = "External Program 4";
                        break;
                    }
                    default: {
                        _mode = "Oops, we missed something!"
                    }

                }
                if ( currentPumpStatus[ pump ].mode !== mode )
                {
                    currentPumpStatus[ pump ].mode = mode;
                    if ( settings.get( 'logPumpMessages' ) )
                        logger.verbose( 'Msg# %s   %s --> %s: Set pump mode to _%s_: %s', counter, constants.ctrlString[ from ], constants.ctrlString[ data[ constants.packetFields.DEST ] ], _mode, JSON.stringify( data ) );
                }
                emit()
                influx.writePumpData( currentPumpStatus )


            } else
            {
                if ( settings.get( 'logPumpMessages' ) )
                    logger.verbose( 'Msg# %s   %s confirming it is in mode %s: %s', counter, constants.ctrlString[ data[ constants.packetFields.FROM ] ], data[ constants.packetFields.ACTION ], JSON.stringify( data ) );
            }
        }
    }

    export function setPowerFromController ( power: number, from: number, data: number[], counter: number )
    {


        var pump = getPumpIndexFromSerialBusAddress( data )
        if ( pump <= numPumps )
        {
            var powerStr = power === 1 ? 'on' : 'off'
            // code to support up to 16 pumps
            // if (data[constants.packetFields.DEST] === 96 || data[constants.packetFields.DEST] === 97) //Command to the pump
            if ( packetToPump( data ) ) // command to the pump
            {
                if ( settings.get( 'logPumpMessages' ) )
                    logger.verbose( 'Msg# %s   %s --> %s: Pump power to %s: %s', counter, constants.ctrlString[ from ], constants.ctrlString[ data[ constants.packetFields.DEST ] ], powerStr, JSON.stringify( data ) );
            } else
            {
                if ( currentPumpStatus[ pump ].power !== power )
                {
                    currentPumpStatus[ pump ].power = power;
                    if ( settings.get( 'logPumpMessages' ) )
                        logger.verbose( 'Msg# %s   %s: Pump power %s: %s', counter, constants.ctrlString[ from ], powerStr, JSON.stringify( data ) );
                    emit()
                    influx.writePumpData( currentPumpStatus )
                }
            }
        }
    }

    export function provideStatus ( data: number[], counter: number )
    {
        if ( settings.get( 'logPumpMessages' ) )
            logger.verbose( 'Msg# %s   %s --> %s: Provide status: %s', counter, constants.ctrlString[ data[ constants.packetFields.FROM ] ], constants.ctrlString[ data[ constants.packetFields.DEST ] ], JSON.stringify( data ) );
    }

    export function setPumpStatus ( pump: Pump.PumpIndex, hour: number, min: number, run: number, mode: number, drivestate: number, watts: number, rpm: number, gpm: number, ppc: number, err: number, timer: number, data: number[], counter: number )
    {
        if ( pump <= numPumps )
        {

            setTime( pump, hour, min )
            var needToEmit = 0
            var whatsDifferent = ''

            // if ( currentPumpStatus[ pump ].watts === 'wattsnotset' )
            if ( currentPumpStatus[ pump ].watts === -1 )
            {
                needToEmit = 1
                currentPumpStatus[ pump ].run = run
                currentPumpStatus[ pump ].mode = mode
                currentPumpStatus[ pump ].drivestate = drivestate
                currentPumpStatus[ pump ].watts = watts
                currentPumpStatus[ pump ].rpm = rpm
                currentPumpStatus[ pump ].gpm = gpm
                currentPumpStatus[ pump ].ppc = ppc
                currentPumpStatus[ pump ].err = err
                currentPumpStatus[ pump ].timer = timer
            } else
            {

                if ( significantWattsChange( pump, watts, counter ) || currentPumpStatus[ pump ].run !== run || currentPumpStatus[ pump ].mode !== mode )
                {
                    needToEmit = 1
                }

                if ( currentPumpStatus[ pump ].run !== run )
                {
                    whatsDifferent += 'Run: ' + currentPumpStatus[ pump ].run + '-->' + run + ' '
                    currentPumpStatus[ pump ].run = run
                    needToEmit = 1
                }
                if ( currentPumpStatus[ pump ].mode !== mode )
                {
                    whatsDifferent += 'Mode: ' + currentPumpStatus[ pump ].mode + '-->' + mode + ' '
                    currentPumpStatus[ pump ].mode = mode
                    needToEmit = 1
                }
                if ( currentPumpStatus[ pump ].drivestate !== drivestate )
                {
                    whatsDifferent += 'Drivestate: ' + currentPumpStatus[ pump ].drivestate + '-->' + drivestate + ' '
                    currentPumpStatus[ pump ].drivestate = drivestate
                }
                if ( currentPumpStatus[ pump ].watts !== watts )
                {
                    whatsDifferent += 'Watts: ' + currentPumpStatus[ pump ].watts + '-->' + watts + ' '
                    currentPumpStatus[ pump ].watts = watts
                }
                if ( currentPumpStatus[ pump ].rpm !== rpm )
                {
                    whatsDifferent += 'rpm: ' + currentPumpStatus[ pump ].rpm + '-->' + rpm + ' '
                    currentPumpStatus[ pump ].rpm = rpm
                }
                if ( currentPumpStatus[ pump ].gpm !== gpm )
                {
                    whatsDifferent += 'gpm: ' + currentPumpStatus[ pump ].gpm + '-->' + gpm + ' '
                    currentPumpStatus[ pump ].gpm = gpm
                }
                if ( currentPumpStatus[ pump ].ppc !== ppc )
                {
                    whatsDifferent += 'ppc: ' + currentPumpStatus[ pump ].ppc + '-->' + ppc + ' '
                    currentPumpStatus[ pump ].ppc = ppc
                }
                if ( currentPumpStatus[ pump ].err !== err )
                {
                    whatsDifferent += 'Err: ' + currentPumpStatus[ pump ].err + '-->' + err + ' '
                    currentPumpStatus[ pump ].err = err
                }
                if ( currentPumpStatus[ pump ].timer !== timer )
                {
                    whatsDifferent += 'Timer: ' + currentPumpStatus[ pump ].timer + '-->' + timer + ' '
                    currentPumpStatus[ pump ].timer = timer
                }

                if ( settings.get( 'logPumpMessages' ) )
                    logger.verbose( '\n Msg# %s  %s Status changed %s : ', counter, constants.ctrlString[ pump + 95 ], whatsDifferent, data, '\n' );

            }
            if ( needToEmit )
            {
                emit();
            }
            influx.writePumpData( currentPumpStatus )

        }
    }

    export function setPower ( pump: number, power: number )
    {
        if ( pump <= numPumps )
        {
            currentPumpStatus[ pump ].power = power
            if ( power === 0 )
            {
                currentPumpStatus[ pump ].duration = 0;
                currentPumpStatus[ pump ].currentprogram = 0;
            }
        }
    }


    export function getPower ( index: number )
    {
        if ( index <= numPumps + 95 )
        {
            return currentPumpStatus[ index ].power
        }
    }


    //sets the current running program to pump & program & (optional) rpm
    export function setCurrentProgram ( pump: number, program: number, rpm: number )
    {
        if ( pump <= numPumps )
        {

            //console.log('pump: %s,  program %s, rpm %s', pump, program, rpm)
            if ( rpm === undefined )
            {
                currentPumpStatus[ pump ].currentprogram = program;
            } else
            {
                // var str = 'program' + program + 'rpm';
                // currentPumpStatus[pump][str] = rpm;
                currentPumpStatus[ pump ].externalProgram[ program ] = rpm;
                //settings.updatePump( pump, 'externalProgram', null, rpm )
                settings.updateExternalPumpProgram( pump, program, rpm )
                currentPumpStatus[ pump ].currentprogram = program;
            }
        }
    }

    //saves a program & rpm/gpm
    export function saveProgram ( pump: number, program: number, val: number )
    {
        if ( pump <= numPumps )
        {

            // var str = 'program' + program + 'rpm';
            currentPumpStatus[ pump ].externalProgram[ program ] = val;
            settings.updateExternalPumpProgram( pump, program, val )
        }
    }
    // export function setCurrentRPM(index, rpm) {
    //     currentPumpStatus[index].currentrpm = rpm
    //
    // }

    export function getCurrentPumpStatus ()
    {
        return { pump: currentPumpStatus ,
             pumpConfig: pumpConfig.getExtendedPumpConfig() }
        
    }

    export function setDuration ( index: number, _duration: number )
    {
        if ( index <= numPumps + 95 )
        {

            currentPumpStatus[ index ].duration = _duration;
        }
    }

    export function getDuration ( index: number )
    {
        if ( index <= numPumps + 95 )
        {
            return currentPumpStatus[ index ].duration;
        }
    }
    export function getCurrentRemainingDuration ( index: number )
    {
        if ( index <= numPumps + 95 )
        {
            return currentPumpStatus[ index ].currentrunning.remainingduration;
        }
    }

    export function getCurrentRunningMode ( pump: number )
    {
        if ( pump <= numPumps )
        {
            return currentPumpStatus[ pump ].currentrunning.mode;
        }
    }

    export function getCurrentRunningValue ( pump: number )
    {
        if ( pump <= numPumps )
        {
            return currentPumpStatus[ pump ].currentrunning.value;
        }
    }

    export function getFriendlyName ( pump: number )
    {
        if ( pump <= numPumps )
        {
            return currentPumpStatus[ pump ].friendlyName;
        }
        else return currentPumpStatus[ pump - 95 ].friendlyName
    }

    export function updatePumpDuration ( pump: number, _duration: number )
    {
        if ( pump <= numPumps )
        {
            currentPumpStatus[ pump ].duration = ( currentPumpStatus[ pump ].duration + _duration );
        }
    }

    export function updateCurrentRunningPumpDuration ( pump: number, _duration: number )
    {
        if ( pump <= numPumps )
        {
            currentPumpStatus[ pump ].currentrunning.remainingduration += _duration
        }
    }

    export function setCurrentRunning ( index: number, program: string, value: number, duration: number )
    {
        if ( index <= numPumps + 95 )
        {
            //we have the option to broadcast because when we start the pump for x minutes, we set it for x.5 minutes.  We don't
            //need/want to broadcast this first message as it will be confusing.
            var newCurrentRunning = {
                'mode': program,
                'value': value,
                'remainingduration': duration
            }
            if ( !_.isEqual( currentPumpStatus[ index ].currentrunning, newCurrentRunning ) )
            {
                if ( settings.get( 'logPumpMessages' ) )
                {
                    logger.info( `Pump ${ index } program changing from:
                    \t    Mode: ${currentPumpStatus[ index ].currentrunning.mode }     Value: ${ currentPumpStatus[ index ].currentrunning.value }    remaining duration: ${ currentPumpStatus[ index ].currentrunning.remainingduration } \r\n    to 
                    \t    Mode: ${program }     Value: ${ value }    remainingduration: ${ duration }` )
                }

                Object.assign( currentPumpStatus[ index ].currentrunning, newCurrentRunning )
                // currentPumpStatus[ index ].currentrunning = JSON.parse( JSON.stringify( newCurrentRunning ) )
                emit()
            }
        }
    }

}