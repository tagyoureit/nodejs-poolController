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

// Get Circuit Names
import { settings, logger, circuit } from'../../../../etc/internal';
import * as constants from '../../../../etc/constants'

/*istanbul ignore next */
// if (logModuleLoading)
//     logger.info('Loading: 11.js')


export function process ( data: number[], counter: number )
{

    var circuitNum = data[ constants.namePacketFields.NUMBER ]
    if ( settings.get( 'logMessageDecoding' ) ) logger.silly( 'Msg# %s  Get Circuit Info  %s', counter, JSON.stringify( data ) )

    circuit.setCircuitFromController( circuitNum, data[ constants.namePacketFields.NAME ], data[ constants.namePacketFields.CIRCUITFUNCTION ], counter )
    return true
}

/*istanbul ignore next */
    // if (logModuleLoading)
    //     logger.info('Loaded: 11.js')

