
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
/// <reference path="../../../@types/api.d.ts" />

import * as constants from '../../etc/constants';
import { settings, logger, queuePacket, intellitouch, io } from '../../etc/internal';


/*
 //Pentair controller sends the pool and spa heat status as a 4 digit binary byte from 0000 (0) to 1111 (15).  The left two (xx__) is for the spa and the right two (__xx) are for the pool.  EG 1001 (9) would mean 10xx = 2 (Spa mode Solar Pref) and xx01 = 1 (Pool mode Heater)
 //0: all off
 //1: Pool heater            Spa off
 //2: Pool Solar Pref        Spa off
 //3: Pool Solar Only        Spa off
 //4: Pool Off               Spa Heater
 //5: Pool Heater            Spa Heater
 //6: Pool Solar Pref        Spa Heater
 //7: Pool Solar Only        Spa Heater
 //8: Pool Off               Spa Solar Pref
 //9: Pool Heater            Spa Solar Pref
 //10: Pool Solar Pref       Spa Solar Pref
 //11: Pool Solar Only       Spa Solar Pref
 //12: Pool Off              Spa Solar Only
 //13: Pool Heater           Spa Solar Only
 //14: Pool Solar Pref       Spa Solar Only
 //15: Pool Solar Only       Spa Solar Only
 0: 'Off',
 1: 'Heater',
 2: 'Solar Pref',
 3: 'Solar Only'
 */

var currentHeat: HeatModule.CurrentHeat;
export namespace heat
{
    class Heat implements HeatModule.CurrentHeat
    {

        poolSetPoint: number;
        poolHeatMode: number;
        poolHeatModeStr: any;
        spaSetPoint: number;
        spaHeatMode: number;
        spaHeatModeStr: any;
        heaterActive: number;
        solarActive: number;
        spaManualHeatMode: string;
        whatsDifferent: ( arg0: any ) => void;

        constructor( poolSetPoint?: number, poolHeatMode?: number, spaSetPoint?: number, spaHeatMode?: number, spaManualHeatMode?: string )
        {
            this.poolSetPoint = poolSetPoint;
            this.poolHeatMode = poolHeatMode;
            this.poolHeatModeStr = constants.heatModeStr[ poolHeatMode ]
            this.spaSetPoint = spaSetPoint;
            this.spaManualHeatMode = spaManualHeatMode;
            this.spaHeatMode = spaHeatMode;
            this.spaHeatModeStr = constants.heatModeStr[ spaHeatMode ]
            this.heaterActive = 0
            this.solarActive = 0
        }
    }

    export function init ()
    {
        currentHeat = new Heat();
    }

    export function copyHeat ( heat: any )
    {
        Object.assign(currentHeat, heat)
    }

    export function newHeatSameAsExistingHeat ( heat: { poolSetPoint: number; poolHeatMode: number; poolHeatModeStr: any; spaSetPoint: number; spaHeatMode: number; spaHeatModeStr: any; } )
    {
        if (
            currentHeat.poolSetPoint === heat.poolSetPoint &&
            currentHeat.poolHeatMode === heat.poolHeatMode &&
            currentHeat.poolHeatModeStr === heat.poolHeatModeStr &&
            currentHeat.spaSetPoint === heat.spaSetPoint &&
            currentHeat.spaHeatMode === heat.spaHeatMode &&
            currentHeat.spaHeatModeStr === heat.spaHeatModeStr
        )
        {
            return true
        } else
        {
            return false
        }
    }


    export function setHeatActiveFromController ( data: number )
    {
        // heater active bits
        if ( (( data >> 2 ) & 3) === 3)
        {
            currentHeat.heaterActive = 1
        }
        else
        {
            currentHeat.heaterActive = 0
        }
        // solar active bits
        if ( (( data >> 4 ) & 3)===3  )
        {
            currentHeat.solarActive = 1
        }
        else
        {
            currentHeat.solarActive = 0
        }
    }

    export function setHeatModeFromController ( poolHeat: number, spaHeat: number)
    {
        currentHeat.poolHeatMode = poolHeat
        currentHeat.poolHeatModeStr = constants.heatModeStr[ poolHeat ]
        currentHeat.spaHeatMode = spaHeat
        currentHeat.spaHeatModeStr = constants.heatModeStr[ spaHeat ]


    }

    export function getCurrentHeat (): HeatModule.CurrentHeat 
    {
        return currentHeat
    }

    function emit ()
    {
        io.emitToClients( 'heat', { heat: currentHeat } );
    }

    export function setHeatModeAndSetPoints ( poolSetPoint: number, poolHeatMode: number, spaSetPoint: number, spaHeatMode: number, counter: number )
    {
        var heat = new Heat( poolSetPoint, poolHeatMode, spaSetPoint, spaHeatMode )

        if ( currentHeat.poolSetPoint === undefined )
        {
            copyHeat( heat )
            if ( settings.get( 'logConfigMessages' ) )
                logger.info( 'Msg# %s   Pool/Spa heat set point discovered:  \n  Pool heat mode: %s @ %s degrees \n  Spa heat mode: %s @ %s degrees', counter, currentHeat.poolHeatModeStr, currentHeat.poolSetPoint, currentHeat.spaHeatModeStr, currentHeat.spaSetPoint );

           emit()
        } else
        {

            if ( newHeatSameAsExistingHeat( heat ) )
            {
                logger.debug( 'Msg# %s  Pool/Spa heat set point HAS NOT CHANGED:  pool heat mode: %s @ %s degrees; spa heat mode %s at %s degrees', counter, currentHeat.poolHeatModeStr, currentHeat.poolSetPoint, currentHeat.spaHeatModeStr, currentHeat.spaSetPoint )
            } else
            {

                if ( settings.get( 'logConfigMessages' ) )
                {
                    logger.verbose( 'Msg# %s   Pool/Spa heat set point changed:  pool heat mode: %s @ %s degrees; spa heat mode %s at %s degrees', counter, heat.poolHeatModeStr, heat.poolSetPoint, heat.spaHeatModeStr, heat.spaSetPoint );
                    logger.info( `Msg# ${counter}  Change in Pool/Spa Heat Mode:  \n\tNew: ${JSON.stringify(heat)} \n\tOld: ${JSON.stringify(heat)}` )
                    // Todo: display differences without 'whats different'
                }
                copyHeat( heat )
                emit()
            }
        }
    }

    export function setHeatSetPoint ( equip: string, change: number, src: string ): void
    {
        //ex spa-->103
        //255,0,255,165,16,16,34,136,4,95,103,7,0,2,65

        /*
        FROM SCREENLOGIC
     
        20:49:39.032 DEBUG iOAOA: Packet being analyzed: 255,0,255,165,16,16,34,136,4,95,102,7,0,2,63
        20:49:39.032 DEBUG Msg# 153  Found incoming controller packet: 165,16,16,34,136,4,95,102,7,0,2,63
        20:49:39.032 INFO Msg# 153   Wireless asking Main to change pool heat mode to Solar Only (@ 95 degrees) & spa heat mode to Heater (at 102 degrees): [165,16,16,34,136,4,95,102,7,0,2,63]
        #1 - request
     
        20:49:39.126 DEBUG iOAOA: Packet being analyzed: 255,255,255,255,255,255,255,255,0,255,165,16,34,16,1,1,136,1,113
        20:49:39.127 DEBUG Msg# 154  Found incoming controller packet: 165,16,34,16,1,1,136,1,113
        #2 - ACK
     
        20:49:41.241 DEBUG iOAOA: Packet being analyzed: 255,255,255,255,255,255,255,255,0,255,165,16,15,16,2,29,20,57,0,0,0,0,0,0,0,0,3,0,64,4,68,68,32,0,61,59,0,0,7,0,0,152,242,0,13,4,69
        20:49:41.241 DEBUG Msg# 155  Found incoming controller packet: 165,16,15,16,2,29,20,57,0,0,0,0,0,0,0,0,3,0,64,4,68,68,32,0,61,59,0,0,7,0,0,152,242,0,13,4,69
        20:49:41.241 VERBOSE -->EQUIPMENT Msg# 155  .....
        #3 - Controller responds with status
        */

        /*  This function sets the values of the values directly  */
        logger.debug( 'cHSP: setHeatPoint called with %s %s from %s', equip, change, src )
        var updateHeatMode = ( currentHeat.spaHeatMode << 2 ) | currentHeat.poolHeatMode;
        var updateHeat: any[] | number[];
        if ( equip === 'pool' )
        {
            updateHeat = [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 136, 4, change, currentHeat.spaSetPoint, updateHeatMode, 0 ]
            logger.info( 'User request to update %s set point to %s', equip, currentHeat.poolSetPoint + change )
        } else
        {
            updateHeat = [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 136, 4, currentHeat.poolSetPoint, change, updateHeatMode, 0 ]
            logger.info( 'User request to update %s set point to %s', equip, currentHeat.spaSetPoint + change )
        }
        queuePacket.queuePacket( updateHeat );
        emit()
    }

    export function changeHeatMode ( equip: string, heatmode: number, src: string )
    {

        //pool
        var updateHeatMode: number,
            updateHeat: any[] | number[]
        if ( equip === 'pool' )
        {
            updateHeatMode = ( currentHeat.spaHeatMode << 2 ) | heatmode;
            updateHeat = [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 136, 4, currentHeat.poolSetPoint, currentHeat.spaSetPoint, updateHeatMode, 0 ]
            queuePacket.queuePacket( updateHeat );
            logger.info( 'User request to update pool heat mode to %s', constants.heatModeStr[ heatmode ] )
        } else
        {
            //spaSetPoint
            updateHeatMode = ( heatmode << 2 ) | currentHeat.poolHeatMode;
            updateHeat = [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 136, 4, currentHeat.poolSetPoint, currentHeat.spaSetPoint, updateHeatMode, 0 ]
            queuePacket.queuePacket( updateHeat );
            logger.info( 'User request to update spa heat mode to %s', constants.heatModeStr[ heatmode ] )
        }
        emit()
    }

    export function setSpaSetPoint ( setpoint: number, callback?: ( func: any ) => void ): void
    {
        //  [16,34,136,4,POOL HEAT Temp,SPA HEAT Temp,Heat Mode,0,2,56]
        var response: API.Response = {}
        if ( setpoint === null || setpoint === undefined )
        {
            response.text = 'Null value passed to heat.setSpaPoint'
            logger.warn( response.text )
        } else
        {
            //TODO: need to fix for celcius
            if ( setpoint < 40 || setpoint > 104 )
            {
                response.text = 'Setpoint outside of allowed values (' + setpoint + ')'
                logger.warn( response.text )

            } else
            {
                var updateHeatMode = ( currentHeat.spaHeatMode << 2 ) | currentHeat.poolHeatMode;
                var updateHeat = [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 136, 4, currentHeat.poolSetPoint, setpoint, updateHeatMode, 0 ]
                logger.info( 'User request to update spa set point to %s', setpoint, updateHeat )
                queuePacket.queuePacket( updateHeat );
                
                response.text = 'Request to set spa heat setpoint to ' + setpoint + ' sent to controller'
                response.status = constants.heatModeStr[ currentHeat.spaHeatMode ]
                response.value = setpoint
                emit()
            }
        }
        if ( callback !== undefined )
        {
            callback( response )
        }
    }

    export function incrementSpaSetPoint ( increment?: number, callback?: ( func: any ) => void )
    {
        if ( increment === null || increment === undefined || isNaN( increment ) )
            increment = 1

        setSpaSetPoint( currentHeat.spaSetPoint + increment, callback )
    }

    export function decrementSpaSetPoint ( decrement: number, callback?: ( func: any ) => void ): void
    {
        if ( decrement === null || decrement === undefined || isNaN( decrement ) )
            decrement = 1
        else decrement
        setSpaSetPoint( currentHeat.spaSetPoint - decrement, callback )
    }

    export function setSpaHeatMode ( heatmode: number, callback?: ( func: any ) => void ): void
    {
        var updateHeatMode = ( heatmode << 2 ) | currentHeat.poolHeatMode;
        var updateHeat = [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 136, 4, currentHeat.poolSetPoint, currentHeat.spaSetPoint, updateHeatMode, 0 ]
        queuePacket.queuePacket( updateHeat );


        logger.info( 'User request to update spa heat mode to %s', constants.heatModeStr[ heatmode ], updateHeat )
        var response: API.Response = {}
        response.text = 'Request to set spa heat mode to ' + constants.heatModeStr[ heatmode ] + ' sent to controller'
        response.status = constants.heatModeStr[ heatmode ]
        response.value = currentHeat.spaSetPoint
        emit()
        if ( callback !== undefined )
        {
            callback( response )
        }
    }



    export function setPoolSetPoint ( setpoint: number, callback?: ( func: any ) => void )
    {
        var response: API.Response = {}
        if ( setpoint === null || setpoint === undefined )
        {
            response.text = 'Null value passed to heat.setSpaPoint'
            logger.warn( response.text )
        } else
        {
            var updateHeatMode = ( currentHeat.spaHeatMode << 2 ) | currentHeat.poolHeatMode;
            var updateHeat = [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 136, 4, setpoint, currentHeat.spaSetPoint, updateHeatMode, 0 ]
            queuePacket.queuePacket( updateHeat );

            response.text = 'User request to update pool heat set point to ' + setpoint + ': ' + updateHeat
            response.status = constants.heatModeStr[ currentHeat.poolHeatMode ]
            response.value = setpoint
            logger.info( 'API Response', response )
            emit()
        }
        if ( callback !== undefined )
        {
            callback( response )
        }
    }

    export function incrementPoolSetPoint ( increment: number, callback?: ( func: any ) => void )
    {
        if ( increment === null || increment === undefined || isNaN( increment ) )
            increment = 1
        setPoolSetPoint( currentHeat.poolSetPoint + increment, callback )
    }

    export function decrementPoolSetPoint ( decrement: number, callback?: ( func: any ) => void )
    {
        if ( decrement === null || decrement === undefined || isNaN( decrement ) )
            decrement = 1
        setPoolSetPoint( currentHeat.poolSetPoint - decrement, callback )
    }

    export function setPoolHeatMode ( heatmode: number, callback?: ( func: any ) => void )
    {

        var updateHeatMode = ( currentHeat.spaHeatMode << 2 ) | heatmode;
        var updateHeat = [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 136, 4, currentHeat.poolSetPoint, currentHeat.spaSetPoint, updateHeatMode, 0 ]
        queuePacket.queuePacket( updateHeat );

        var response: API.Response = {}
        response.text = 'Request to set pool heat mode to ' + constants.heatModeStr[ heatmode ] + ' sent to controller : ' + updateHeat
        response.status = constants.heatModeStr[ heatmode ]
        response.value = currentHeat.poolSetPoint
        logger.info( 'API Response', response )
        if ( callback !== undefined )
        {
            callback( response )
        }

    }

    export function setSpaManualHeatMode ( data: number[], counter: number )
    {
        // Something to do with heat modes...
        // 165,33,16,34,168,10,0,0,0,254,0,0,0,0,0,0,2,168 = manual heat mode off
        // 165,33,16,34,168,10,0,0,0,254,1,0,0,0,0,0,2,169 = manual heat mode on

        var spaManualHeatMode = data[ 10 ] === 0 ? 'Off' : 'On'

        currentHeat.spaManualHeatMode = spaManualHeatMode;

        if ( settings.get( 'logMessageDecoding' ) )
            logger.debug( 'Msg#: %s  Settings/Manual heat packet.  Manual Heat %s  Full packet: %s', counter, spaManualHeatMode, data );

    }
}