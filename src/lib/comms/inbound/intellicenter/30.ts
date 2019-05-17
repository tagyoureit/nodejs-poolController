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

//Set Intellichlor status
import { settings, logger } from'../../../../etc/internal';
import * as constants from '../../../../etc/constants'
import * as intellicenter_30_1 from './30_1';
import * as intellicenter_30_2 from './30_2';
import * as intellicenter_30_12 from './30_12';
import * as intellicenter_30_15 from './30_15';

const subAction = 6;

export function process ( data: number[], counter: number )
{
  switch ( data[ subAction ] )
  {

    case 1: // Circuits
      {
        intellicenter_30_1.process( data, counter )
        break
      }
    case 2: // ?
      {
        intellicenter_30_2.process( data, counter )
        break
      }
    case 12: // ?
      {
        intellicenter_30_12.process( data, counter )
        break
      }
    case 15: // ?
      {
        intellicenter_30_15.process( data, counter )
        break
      }



    default:
      {

        var currentAction = constants.intellicenterConfigurationItem[ data[ subAction ] ]
        if ( currentAction !== undefined )
        {
          if ( settings.get( 'logConsoleNotDecoded' ) )
            logger.verbose( 'Msg# %s   Controller Configuration sub-packet is known to be a %s packet: %s', counter, currentAction, data )
          let decoded = true
        } else
        {
          if ( settings.get( 'logConsoleNotDecoded' ) )
            logger.verbose( 'Msg# %s  Identifier Controller Configuration sub-packet %s is NOT DEFINED and NOT DECODED packet: %s', counter, data[ 3 ], data )
          let decoded = true

        }
      }
  }

  /*       if (settings.get('logMessageDecoding'))
          logger.debug(`Msg#: ${counter}:  ${constants.intellicenterPackets[data[subAction]]}  %j  \n\tFull packet: $j`, {put:'data here'}, data); */

  return true
}