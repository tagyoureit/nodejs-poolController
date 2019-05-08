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

import { logger, pump } from '../../../../etc/internal';
import * as constants from '../../../../etc/constants';

/*istanbul ignore next */
// if (logModuleLoading)
//     logger.info('Loading: 2.js')


export function process ( data: number[], counter: number )
{
    let remotecontrol: number;
    if ( data[ constants.pumpPacketFields.CMD ] === 255 ) //Set pump control panel off (Main panel control only)
    {
        remotecontrol = 1;
    } else //0 = Set pump control panel on
    {
        remotecontrol = 0;
    }
    pump.setRemoteControl( remotecontrol, data[ constants.packetFields.FROM ], data, counter )
}

/*istanbul ignore next */
    // if (logModuleLoading)
    //     logger.info('Loaded: 2.js')



