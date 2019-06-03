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

import { server, settings, logger, sp, pumpControllerTimers, chlorinator, chlorinatorController, time, heat, pump, schedule, circuit, customNames, intellitouch, temperature, UOM, valve } from './internal'

export namespace reload
{
    export async function stopAsync ()
    {

        try
        {
            if ( !settings.get( 'pump' ).standalone )
            {
                //only clear timers if we go from 1 or 2 pumps to 0 pumps
                pumpControllerTimers.clearTimer( 1 )
                pumpControllerTimers.clearTimer( 2 )
            }
            if ( !settings.get( 'chlorinator' ).standalone )
            {
                chlorinatorController.clearTimer()
            }

            await server.closeAllAsync

            sp.close()
            console.log( 'nodejs-poolController services stopped successfully' )
        }
        catch ( err )
        {
            console.log( 'Error stopping services:', err )
            return Promise.resolve()
        }

    }

    // export async function reloadAsync ( from?: string, callback?: () => {} )
    export async function reloadAsync ( from?: string )
    {
        //reset is a variable to also reset the status of objects.
        var reloadStr = 'Reloading settings.  Stopping/Starting Serialport.  Pool, Pump and Chlorinator controllers will be re-initialized \r\n \
            This will _NOT_ restart the express (web) auth and will not affect bootstrap, auth, or ssl.'
        var res = reloadStr + '<p>'
        res += 'Settings: <p>' + settings.displaySettingsMsg() + '<p>'


        await stopAsync()
        try
        {
            settings.load()

            if ( from !== 'server' )
                server.initAsync()

            // if ( from !== 'io' )
            // {
            // io.stopAll()

            // }

            logger.warn( 'Settings: ', settings.displaySettingsMsg() )
            sp.init()

            if ( settings.get( 'pump.standalone' ) && !settings.get( 'intellicom.installed' ) && !settings.get( 'intellitouch.installed' ) )
            {
                pumpControllerTimers.startPumpController()
            }
            if ( settings.get( 'chlorinator.standalone' ) )
            {
                chlorinatorController.startChlorinatorController()
            }

            chlorinator.init()
            heat.init()
            time.init()
            pump.init()
            schedule.init()
            circuit.init()
            customNames.init()
            intellitouch.init()
            temperature.init()
            UOM.init()
            valve.init()

            logger.info( 'Successfully reloaded services' )
        }
        catch ( err )
        {
            logger.error( 'Error reloading services:', err )
        }
    }
}