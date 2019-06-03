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

import * as constants from '../../etc/constants';

export namespace whichPacket
{
  export function outbound ( packet: number[] )
  {
    if ( packet[ constants.packetFields.DEST + 3 ] >= constants.ctrl.PUMP1 && packet[ constants.packetFields.DEST + 3 ] <= constants.ctrl.PUMP16 )
    {
      return 'pump'
    } else if ( packet[ 0 ] === 16 )
    {

      return 'chlorinator'
    } else
    {
      return 'controller'
    }
  }

  export function inbound ( packet: number[] )
  {
    // changes to support 16 pumps
    // if (packet[constants.packetFields.DEST] === 96 || packet[constants.packetFields.DEST] === 97) {
    if ( packet[ constants.packetFields.DEST ] >= constants.ctrl.PUMP1 && packet[ constants.packetFields.DEST ] <= constants.ctrl.PUMP16 )
    {
      return 'pump'
    } else if ( packet[ 0 ] === 16 )
    {
      return 'chlorinator'
    } else
    {
      return 'controller'
    }
  }
}