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


//Send request/response for pump status
import * as c from '../../../../etc/constants';
import { pump } from '../../../../etc/internal';
import { pumpAddressToIndex, packetFromPump, packetToPump, getPumpIndexFromSerialBusAddress } from '../../../../etc/pumpAddress'

export function process ( data: number[], counter: number )
{
    // changes to support 16 pumps
    // if (data[c.packetFields.DEST] === 96 || data[c.packetFields.DEST] === 97) //Command to the pump
    if ( packetToPump( data ) ) //Command to the pump
    {
        pump.provideStatus( data, counter )
    } else //response
    {

        let hour = data[ c.pumpPacketFields.HOUR ]
        let min = data[ c.pumpPacketFields.MIN ];
        let run = data[ c.pumpPacketFields.CMD ]
        let mode = data[ c.pumpPacketFields.MODE ]
        let drivestate = data[ c.pumpPacketFields.DRIVESTATE ]
        let watts = ( data[ c.pumpPacketFields.WATTSH ] * 256 ) + data[ c.pumpPacketFields.WATTSL ]
        let rpm = ( data[ c.pumpPacketFields.RPMH ] * 256 ) + data[ c.pumpPacketFields.RPML ]
        let gpm = data[ c.pumpPacketFields.GPM ]
        let ppc = data[ c.pumpPacketFields.PPC ]
        let err = data[ c.pumpPacketFields.ERR ]
        let timer = data[ c.pumpPacketFields.TIMER ]
        let pumpIndex = getPumpIndexFromSerialBusAddress( data)
        
        pump.setPumpStatus( pumpIndex, hour, min, run, mode, drivestate, watts, rpm, gpm, ppc, err, timer, data, counter )
    }
    return true;
}