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

import { logger, circuit, pump, schedule, temperature, time, UOM, valve, chlorinator, intellichem, updateAvailable, pumpConfig } from './internal';
import * as getConfigOverview from "./getConfigOverview";
let getmac = require( 'getmac' )

export namespace helpers
{
    export function allEquipmentInOneJSON ()
    {
        var pool = Object.assign(
            {},
            getConfigOverview.getConfigOverview(),
            circuit.getCurrentCircuits(),
            pump.getCurrentPumpStatus(),
            schedule.getCurrentSchedule(),
            temperature.getTemperature(),
            time.getTime(),
            UOM.getUOM(),
            valve.getValve(),
            chlorinator.getChlorinatorStatus(),
            intellichem.getCurrentIntellichem()
        )
        return pool
    }

    export async function deviceXML ()
    {
        let results = await updateAvailable.getResultsAsync()
        let mac = await _getMac()
        let XML = "<?xml version=\"1.0\"?><root xmlns=\"urn:schemas-upnp-org:PoolController-1-0\"><specVersion><major>"
        XML += results.local.version.split( '.' )[ 0 ]
        XML += "</major><minor>"
        XML += results.local.version.split( '.' )[ 1 ]
        XML += "</minor><patch>"
        XML += results.local.version.split( '.' )[ 2 ]
        XML += "</patch></specVersion><device><deviceType>urn:echo:device:PoolController:1</deviceType><friendlyName>NodeJS Pool Controller</friendlyName><manufacturer>tagyoureit</manufacturer><manufacturerURL>https://github.com/tagyoureit/nodejs-poolController</manufacturerURL><modelDescription>An application to control pool equipment.</modelDescription><serialNumber>0</serialNumber>				<UDN>uuid:806f52f4-1f35-4e33-9299-";
        XML += mac
        XML += "</UDN><serviceList></serviceList></device></root>";
        return XML;
    }

    export async function _getMac ()
    {
        getmac.getMac( ( err: Error, macAddress: string ) =>
        {
            if ( err )
            {
                logger.error( `Error retrieving mac address for this computer.` )
                console.log( err )
                return '00:00:00:00:00:00'
            }
            return macAddress.replace( /:/g, '' ).toLowerCase()
        } )

    }
}