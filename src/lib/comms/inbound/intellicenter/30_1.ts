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
import { settings, logger, intellicenterCircuit } from'../../../../etc/internal';
import * as constants from '../../../../etc/constants'


export function process ( data: number[], counter: number )
{
  // check for circuit names first because it is clumsy to write 21 empty switch statements
  if ( data[ 7 ] >= 3 && data[ 7 ] <= 24 )
  {
    intellicenterCircuit.updateCircuitName( data )
  }
  else
  {
    switch ( data[ 7 ] )
    {
      case 0: // circuit functions
        {
          intellicenterCircuit.updateCircuitFunction( data )
          break;
        }
      case 1: // freeze protection
        {
          intellicenterCircuit.updateFreezeProtection( data )
          break
        }
      case 25: // unknown
        {
          logger.info( `INTELLICENTER: Unknown 30,x,25 configuration packet: %j`, data )
          break;
        }
      case 26: // Lighting theme
        {
          intellicenterCircuit.updateLightingScene( data )
        }
    }
  }



  /* if (settings.get('logMessageDecoding'))
    logger.debug(`Msg#: ${counter}:  ${constants.intellicenterPackets[data[7]]}  %j  \n\tFull packet: $j`, { some: 'data' }, data);
*/

  return true
}