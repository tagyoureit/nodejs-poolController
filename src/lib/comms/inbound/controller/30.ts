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
import { settings, logger, circuit } from '../../../../etc/internal';

export function process ( data: number[], counter: number )
{
  // set packet:
  // status packet: 165,33,16,34,158,16,9,9,2,132,1,72,0,0,0,0,0,0,0,0,0,0,2,135
  //                165,33,16,34,158,[circuit1],[circuit2],[circuit3],[circuit4],132,1,72,0,0,0,0,0,0,0,0,0,0,2,135

  var highSpeedCircuits: any = {
    "1": {},
    "2": {},
    "3": {},
    "4": {}
  }

  let circ1 = {
    number: data[ 6 ],
    name: circuit.getCircuitName( data[ 6 ] ),
    friendlyName: circuit.getFriendlyName( data[ 6 ] )
  }

  highSpeedCircuits[ 1 ] = Object.assign( {}, highSpeedCircuits[ 1 ], circ1 )

  let circ2 = {
    number: data[ 7 ],
    name: circuit.getCircuitName( data[ 7 ] ),
    friendlyName: circuit.getFriendlyName( data[ 7 ] )
  }

  highSpeedCircuits[ 2 ] = Object.assign( {}, highSpeedCircuits[ 2 ].number, circ2 )

  let circ3 = {
    number: data[ 8 ],
    name: circuit.getCircuitName( data[ 8 ] ),
    friendlyName: circuit.getFriendlyName( data[ 8 ] )
  }
  highSpeedCircuits[ 3 ] = Object.assign( {}, highSpeedCircuits[ 3 ].number, circ3 )
  let circ4 = {
    number: data[ 9 ],
    name: circuit.getCircuitName( data[ 9 ] ),
    friendlyName: circuit.getFriendlyName( data[ 9 ] )
  }
  highSpeedCircuits[ 4 ] = Object.assign( {}, highSpeedCircuits[ 4 ].number, circ4 )

  if ( settings.get( 'logMessageDecoding' ) )
    logger.debug( 'Msg#: %s  High speed circuits.  %s  Full packet: %s', counter, JSON.stringify( highSpeedCircuits, null, 2 ), data );

  return true
}
