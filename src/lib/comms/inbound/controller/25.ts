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

//Intellichlor status
import { settings, logger, chlorinator } from'../../../../etc/internal';
import * as constants from '../../../../etc/constants'

/*istanbul ignore next */
// if (logModuleLoading)
//     logger.info('Loading: 25.js')

export function process ( data: number[], counter: number )
{


    if ( settings.get( 'logChlorinator' ) )
        logger.debug( 'Msg# %s   Chlorinator status packet: %s', counter, data )

    // set packet
    // sample packet:  165,33,16,34,153,10,0,10,0,0,0,0,0,0,0,0,1,165
    //                 165,33,16,34,153,10,0,10,0,0,0,0,0,0,0,0,1,165
    //
    // status (response to get)
    // sample packet:  165,33,15,16,25,22,1,10,128,29,132,0,73,110,116,101,108,108,105,99,104,108,111,114,45,45,52,48,7,231 <-- installed
    //                 165,33,15,16,25,22,0,10,128,29,132,0,73,110,116,101,108,108,105,99,104,108,111,114,45,45,52,48,7,230  <-- not installed
    //                 165,33,15,16,25,22,1,10,128,29,132,0,73,110,116,101,108,108,105,99,104,108,111,114,45,45,52,48,7,231
    //


    var outputSpaPercent = data[ constants.controllerChlorinatorPacketFields.OUTPUTSPAPERCENT ]
    var outputPercent = data[ constants.controllerChlorinatorPacketFields.OUTPUTPERCENT ];
    var saltPPM = data[ constants.controllerChlorinatorPacketFields.SALTPPM ];
    var status = data[ constants.controllerChlorinatorPacketFields.STATUS ]
    var superChlorinate = data[ constants.controllerChlorinatorPacketFields.SUPERCHLORINATE ]

    var name = chlorinator.getChlorinatorNameByBytes( data.slice( 12, 28 ) )
    chlorinator.updateChlorinatorStatusFromController( saltPPM, outputPercent, outputSpaPercent, superChlorinate, status, name, counter )



    return true
}


/*istanbul ignore next */
    // if (logModuleLoading)
    //         logger.info('Loaded: 25.js')


