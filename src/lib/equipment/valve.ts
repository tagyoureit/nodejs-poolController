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

import { logger, io, settings } from '../../etc/internal';
import * as constants from '../../etc/constants';


let _valve: { valve: number};

export namespace valve
{
    export function init ()
    {
        _valve = {
            "valve": 0
        }
    }

    export function setValve ( data: number[] )
    {
        if ( settings.get( 'logConsoleNotDecoded' ) )
        {
            logger.silly( 'Received valve status packet.  \n\tPossible association with %s. \n\t  valve data: %s', data[ constants.controllerStatusPacketFields.VALVE ], data )
        }
        _valve.valve = data[ constants.controllerStatusPacketFields.VALVE ];
        io.emitToClients( 'valve', { valve: _valve } )
    }

    export function getValve ()
    {
        return { 'valve': _valve }
    }
}