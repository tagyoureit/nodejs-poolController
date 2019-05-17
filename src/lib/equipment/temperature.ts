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

import { heat, io, influx } from '../../etc/internal';

var _temperature: { poolTemp: any; spaTemp: any; airTemp: any; solarTemp: any; freeze: any; spaLastKnownTemperature?: any; poolLastKnownTemperature?: any; }


var _ = require( 'underscore' )

var _ = require( 'underscore' )
export namespace temperature
{
    export function init ()
    {
        _temperature = {
            "poolTemp": 0,
            "spaTemp": 0,
            "airTemp": 0,
            "solarTemp": 0,
            "freeze": 0
        }
    }

    export function setTempFromController ( poolTemp: number, spaTemp: number, airTemp: number, solarTemp: number, freeze: number )
    {
        _temperature.poolTemp = poolTemp
        _temperature.spaTemp = spaTemp
        _temperature.airTemp = airTemp
        _temperature.solarTemp = solarTemp
        _temperature.freeze = freeze
        let retTemp = getTemperature()
        io.emitToClients( 'temperature', retTemp)
        // TODO: Check in Influx should write retTemp or just _temperature values
        influx.writeTemperatureData( _temperature )
        return _temperature
    }

    export function getTemperature (): any
    {
        // var heat = heat.getCurrentHeat()
        // var combine = _.extend( _temperature, heat )
        let combine = Object.assign( {}, _temperature, heat.getCurrentHeat() )
        return { 'temperature': combine }
    }

    export function saveLastKnownTemp ( circuitFunction: string ): void
    {
        if ( circuitFunction.toUpperCase() === 'SPA' )
        {
            _temperature.spaLastKnownTemperature = _temperature.spaTemp;
        }
        else if ( circuitFunction.toUpperCase() === 'POOL' )
        {
            _temperature.poolLastKnownTemperature = _temperature.poolTemp
        }
    }
}