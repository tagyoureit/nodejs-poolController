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

import { pumpAddressToIndex } from '../../etc/pumpAddress';
import { settings, logger, pump, queuePacket } from'../../etc/internal';

/* ----- COMMANDS SENT DIRECTLY TO THE PUMP -----*/

//turn pump on/off
export namespace pumpController
{
    export function sendPumpPowerPacket ( address: Pump.PumpAddress, power: number )
    {
        var index = pumpAddressToIndex( address )
        var setPrg;
        //if (settings.get('logApi')) logger.info('User request to set pump %s to %s', pump, power);
        if ( power === 0 )
        {
            setPrg = [ 6, 1, 4 ];
            //manually set power packet here since it would not be done elsewhere
            pump.setPower( index, 0 )
        } else if ( power === 1 ) // pump set to on
        {
            setPrg = [ 6, 1, 10 ];
            pump.setPower( index, 1 )
        }
        var pumpPowerPacket = [ 165, 0, address, settings.get( 'appAddress' ) ];
        Array.prototype.push.apply( pumpPowerPacket, setPrg )
        if ( settings.get( 'logApi' ) ) logger.verbose( 'Sending Turn pump %s to %s: %s', index, power, pumpPowerPacket );
        queuePacket.queuePacket( pumpPowerPacket );
    }


    //set pump to remote control
    export function setPumpToRemoteControl ( address: number )
    {
        var remoteControlPacket = [ 165, 0, address, settings.get( 'appAddress' ), 4, 1, 255 ];
        if ( settings.get( 'logApi' ) ) logger.verbose( 'Sending Set pump to remote control: %s', remoteControlPacket )
        queuePacket.queuePacket( remoteControlPacket );
    }

    //set pump to local control
    export function setPumpToLocalControl ( address: any )
    {
        var localControlPacket = [ 165, 0, address, settings.get( 'appAddress' ), 4, 1, 0 ];
        if ( settings.get( 'logPumpMessages' ) ) logger.verbose( 'Sending Set pump to local control: %s', localControlPacket )
        queuePacket.queuePacket( localControlPacket );
    }

    //NOTE: This pump timer doesn't do what we think it does... I think.
    /* istanbul ignore next */
    export function setPumpDuration ( address: any, duration: any )
    {
        var setTimerPacket = [ 165, 0, address, settings.get( 'appAddress' ), 1, 4, 3, 43, 0, 1 ];
        if ( settings.get( 'logApi' ) ) logger.info( 'Sending Set a 30 second timer (safe mode enabled, timer will reset 2x/minute for a total of %s minutes): %s', duration, setTimerPacket );

        queuePacket.queuePacket( setTimerPacket );
    }

    //run program packet
    export function runProgram ( address: number, program: number )
    {
        //run program
        var runPrg = [ 1, 4, 3, 33, 0 ]
        runPrg.push( 8 * program )

        var runProgramPacket = [ 165, 0, address, settings.get( 'appAddress' ) ];
        Array.prototype.push.apply( runProgramPacket, runPrg );
        if ( settings.get( 'logApi' ) ) logger.verbose( 'Sending Run Program %s: %s', program, runProgramPacket )
        queuePacket.queuePacket( runProgramPacket );
    }

    //run RPM packet
    export function runRPM ( address: number, rpm: number )
    {
        var runPrg = []
        // what type of pump?
        var type = pump.getCurrentPumpStatus().pump[ address - 95 ].type
        if ( type === 'VS' )
        {
            runPrg[ 0 ] = 1
            runPrg[ 3 ] = 196
        }
        else if ( type === 'VSF' ) // VSF
        {
            runPrg[ 0 ] = 10
            runPrg[ 3 ] = 196
        }
        else if ( type === 'VF' )
        {
            logger.error( 'Cannot set RPM on VF Pump' )
        }
        runPrg[ 1 ] = 4
        runPrg[ 2 ] = 2
        //run program
        //var runPrg = [1, 4, 2, 196]
        runPrg.push( Math.floor( rpm / 256 ) )
        runPrg.push( rpm % 256 )

        var runProgramPacket = [ 165, 0, address, settings.get( 'appAddress' ) ];
        Array.prototype.push.apply( runProgramPacket, runPrg );
        if ( settings.get( 'logApi' ) ) logger.verbose( 'Sending run at RPM %s: %s', rpm, runProgramPacket )
        queuePacket.queuePacket( runProgramPacket );
    }

    //run GPM packet
    export function runGPM ( address: number, gpm: number )
    {
        var runPrg = []
        // what type of pump?
        var type = pump.getCurrentPumpStatus().pump[ address - 95 ].type
        if ( type === 'VF' )
        {
            runPrg[ 0 ] = 1
            runPrg[ 3 ] = 228
        }
        else if ( type === 'VSF' )
        {
            runPrg[ 0 ] = 9
            runPrg[ 3 ] = 196
        }
        else if ( type === 'VS' )
        {
            logger.error( 'Cannot set GPM on VS Pump' )
        }
        runPrg[ 1 ] = 4
        runPrg[ 2 ] = 2
        // run program
        // var runPrg = [1, 4, 2, 196]
        runPrg.push( Math.floor( gpm / 256 ) )
        runPrg.push( gpm % 256 )

        var runProgramPacket = [ 165, 0, address, settings.get( 'appAddress' ) ];
        Array.prototype.push.apply( runProgramPacket, runPrg );
        if ( settings.get( 'logApi' ) ) logger.verbose( 'Sending run at GPM %s: %s', gpm, runProgramPacket )
        queuePacket.queuePacket( runProgramPacket );
    }

    export function saveProgramOnPump ( _address: number, _program: number, _speed: number )
    {

        //save program on pump
        //set speed
        let setPrg: number[] = [ 1, 4, 3 ]
        setPrg.push( 38 + _program );
        setPrg.push( Math.floor( _speed / 256 ) )
        setPrg.push( _speed % 256 );
        var setProgramPacket = [ 165, 0, _address, settings.get( 'appAddress' ) ];
        Array.prototype.push.apply( setProgramPacket, setPrg );
        //logger.info(setProgramPacket, setPrg)
        if ( settings.get( 'logApi' ) ) logger.verbose( 'Sending Set Program %s to %s RPM: %s', _program, _speed, setProgramPacket );
        queuePacket.queuePacket( setProgramPacket );

    }

    //request pump status
    export function requestPumpStatus ( address: number )
    {
        var statusPacket = [ 165, 0, address, settings.get( 'appAddress' ), 7, 0 ];
        if ( settings.get( 'logApi' ) ) logger.verbose( 'Sending Request Pump Status: %s', statusPacket )
        queuePacket.queuePacket( statusPacket );
    }
}