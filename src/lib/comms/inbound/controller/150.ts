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

//Set Intellichlor status
import { settings, logger, pump } from'../../../../etc/internal';
import * as constants from '../../../../etc/constants'
import * as circuit from '../../../equipment/circuit';
var _ = require( 'underscore' );

var packet: number[];
var pumpNum: number, stepSize: number, pumpFriendlyName: string;

export function process ( data: number[], counter: number )
{

  // sample packet with pump 2 at 220rpm step size:  165,33,16,34,150,16,0,1,0,0,0,2,220,10,1,144,13,122,15,130,0,0,4,48

  var currentAction = constants.strControllerActions[ data[ constants.packetFields.ACTION ] ]


  if ( packet === undefined )
  {
    packet = data;
  } else
  {
    // let's use some logic to see what the other values here are...
    packet[ 11 ] = data[ 11 ]
    packet[ 12 ] = data[ 12 ]
    packet[ 22 ] = data[ 22 ] //check bit h -- don't really care about this
    packet[ 23 ] = data[ 23 ] //check bit l -- don't really care about this
    if ( !_.isEqual( packet, data ) )
    {
      // something has changed
      if ( settings.get( 'logMessageDecoding' ) )
        logger.warn( 'Msg# %s   Set %s: ***Something changed besides known packets***.  \n\tPacket: %s\n\tData: %s', counter, currentAction, packet, data )
    }
  }

  if ( pumpNum !== data[ 11 ] || stepSize !== data[ 12 ] )
  {
    pumpNum = data[ 11 ]

    if ( pumpNum !== 0 )
    {
      pumpFriendlyName = pump.getFriendlyName( pumpNum );
      stepSize = data[ 12 ]
    } else
    {
      stepSize = -1
      pumpFriendlyName = 'None';
    }

    if ( settings.get( 'logMessageDecoding' ) )
      logger.debug( 'Msg# %s   Set %s: Pump %s (%s) step size is %s RPM.  Packet: %s', counter, currentAction, pumpFriendlyName, pumpNum, stepSize, data )

  } else
  { // no change
    if ( settings.get( 'logMessageDecoding' ) )
      logger.silly( 'Msg# %s   No change in Set %s: Pump %s (%s) step size is %s.  Packet: %s', counter, currentAction, pumpFriendlyName, pumpNum, stepSize, data )
  }

  return true
}