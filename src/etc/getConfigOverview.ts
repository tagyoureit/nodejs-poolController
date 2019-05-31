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

import { settings, intellitouch, queuePacket, circuit, pumpConfig } from './internal';

interface IConfigObj
{
    config: Settings.IConfigInterface
}

// this function returns relevant information for the `all` socket
export function getConfigOverview () : IConfigObj
{
    let configurationFileContent = settings.getConfig();
    let configTemp: any = {};
    try
    {
        configTemp.systemReady = 1
        // configTemp.systemReady = ( ( intellitouch.checkIfNeedControllerConfiguration() === 0 ? 1 : 0 ) && ( queuePacket.getQueuePacketsArrLength() === 0 ? 1 : 0 ) );
        configTemp.version = configurationFileContent.version;
        configTemp.client = configurationFileContent.poolController.client;
        if ( configTemp.systemReady )
        {
            configTemp.equipment = Object.assign( {}, configurationFileContent.equipment)
            // configTemp.equipment = JSON.parse( JSON.stringify( configurationFileContent.equipment ) );
            // configTemp.circuit = {}
            configTemp.equipment.circuit.nonLightCircuit = Object.assign({}, circuit.getAllNonLightCircuits()) 
            configTemp.equipment.circuit.lightCircuit = Object.assign( {}, circuit.getAllLightCircuits() )

            // configTemp.circuit.hideAux = configurationFileContent.equipment.circuit.hideAux
            // configTemp.chlorinator = _settings.chlorinator.installed
            // configTemp.pumps = pump.numberOfPumps()
            // configTemp.intellichem = _settings.intellichem
            // configTemp.spa = _settings.spa
            // configTemp.solar = _settings.solar
        }
    }
    catch ( err )
    {
        configTemp.systemReady = 0;
    }
    return { config: configTemp };
}
