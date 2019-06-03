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



import { settings, logger } from'../../../etc/internal';;
import * as events from 'events'

let emitter = new events.EventEmitter;
let queue: number[][];
export function push ( packet:number[] )
{
    queue.push(packet)
}


export function pop ()
{
    return queue.shift()
}

export function length ()
{
    return queue.length
}

export function clear ()
{
    if ( settings.get( 'logPacketWrites' ) )
    {
        logger.debug('Outbound Packet Buffer cleared.')
    }
    queue = [];
    // receiveBuffer.clear()
}

export function init ()
{
    clear();
}
