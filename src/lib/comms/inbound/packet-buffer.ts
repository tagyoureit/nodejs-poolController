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


import { logger, sp, receiveBuffer} from '../../../etc/internal'
import Dequeue = require( 'dequeue' );
import { EventEmitter } from 'events';
let spemitter: EventEmitter;
let bufferArrayOfArrays = new Dequeue()
export namespace packetBuffer
{
    export function push ( packet: Buffer )
    {

        try
        {
            if ( packet )
            {
                var packetArr = packet.toJSON().data
                bufferArrayOfArrays.push( packetArr );
            
            }
        }
        catch ( err )
        {
            console.error( err )
            logger.error( 'Error: ', err )
            logger.warn( 'Could not push packet to buffer, empty packet?' )
        }
    }


    export function pop ()
    {
        return bufferArrayOfArrays.shift()
    }

    export function length ()
    {
        return bufferArrayOfArrays.length
    }

    export function clear ()
    {
        logger.silly( 'Emptying the packet buffer queue' )
        bufferArrayOfArrays.empty()
        receiveBuffer.clear()
    }

    export function init ()
    {
        if ( !spemitter )
        {
            spemitter = sp.getEmitter()
            spemitter.on( 'packetread', function ( packet: Buffer )
            {
                push( packet )

            } )
        }
    }

}