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
/// <reference path="../../@types/pump.d.ts" />


import * as constants from './constants';


//helper function to convert index (1, 2... 16) to pump addres (96, 97...112)
export function PumpIndexToAddress ( index: Pump.PumpIndex ): Pump.PumpAddress 
{
    try
    {
        if ( index >= 1 && index <= 16 )
        {
            return <Pump.PumpAddress>( index + 95 );
        }
    }
    catch ( err )
    {
        throw new Error(`Tried to convert invalid pump index (${index}) to address.`)
    }
}

//helper function to convert pump address (96, 97...112) to index (1, 2...16)
export function pumpAddressToIndex ( address: Pump.PumpAddress ): Pump.PumpIndex
{
    try
    {
        if ( address >= constants.ctrl.PUMP1 && address <= constants.ctrl.PUMP16 )
        {
            return <Pump.PumpIndex>(address - 95)
        }
    }
    catch ( err )
    {
        throw new Error(`Tried to convert invalid pump address (${address}) to index.`)
    }
}

//  Get the pump number from it's serial bus address
export function getPumpIndexFromSerialBusAddress ( data: number[] ): Pump.PumpIndex
{
    let pump: Pump.PumpIndex;

    // convert code to support up to 16 pumps`
    // if (data[constants.packetFields.FROM] === 96 || data[constants.packetFields.DEST] === 96) {
    //           pump = 1
    //         } else {
    //           pump = 2
    //         }
    // }
    if ( packetFromPump( data ) )
    {
        pump = <Pump.PumpIndex>(data[ constants.packetFields.FROM ] - 95)
    } else if ( packetToPump( data ) )
    {
        pump = <Pump.PumpIndex>(data[ constants.packetFields.DEST ] - 95)
    }

    return pump
}

export function packetToPump ( data: number[] )
{
    return ( data[ constants.packetFields.DEST ] >= constants.ctrl.PUMP1 && data[ constants.packetFields.DEST ] <= constants.ctrl.PUMP16 )
}

export function packetFromPump ( data: number[] ): boolean
{
    return ( data[ constants.packetFields.FROM ] >= constants.ctrl.PUMP1 && data[ constants.packetFields.FROM ] <= constants.ctrl.PUMP16 )
}