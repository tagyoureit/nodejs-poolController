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
import { settings, logger, pump } from'../../../etc/internal'
import * as constants from '../../../etc/constants'
import * as pump_1 from './pump/1'
import * as pump_2 from './pump/2'
import * as pump_4 from './pump/4'
import * as pump_5 from './pump/5'
import * as pump_6 from './pump/6'
import * as common_7 from './common/7'

    var decoded
export namespace processPump
{
    export function processPumpPacket ( data: number[], counter: number )
    {
        {

            if ( settings.get( 'logPumpMessages' ) )
                logger.silly( 'Msg# %s  Decoding pump packet %s', counter, data )

            switch ( data[ constants.packetFields.ACTION ] )
            {
                case 1: // Set speed setting (VS or VF)
                case 9: // Set GPM on VSF
                case 10: // Set RPM on VSF
                    {
                        pump_1.process( data, counter )
                        decoded = true;
                        break;
                    }
                case 2: //??
                    {
                        pump_2.process( data, counter )
                        decoded = true;
                        break;
                    }
                case 4: //Pump control panel on/off
                    {
                        pump_4.process( data, counter )
                        decoded = true;
                        break;
                    }
                case 5: //Set pump mode
                    {
                        pump_5.process( data, counter )
                        decoded = true;
                        break;
                    }
                case 6: //Turn pump on/off
                    {
                        pump_6.process( data, counter )
                        decoded = true;
                        break;
                    }
                case 7: //cyclical status of pump requesting pump status
                    {
                        common_7.process( data, counter )
                        decoded = true;
                        break;
                    }
                case 255:
                    {
                        logger.warn( 'Msg# %s: %s rejected the command. %s', counter, pump.getFriendlyName( data[ 3 ] ), JSON.stringify( data ) )
                        decoded = true;
                        break;
                    }
                default:
                    {
                        if ( settings.get( 'logPumpMessages' ) )
                            logger.verbose( 'Msg# %s is UNKNOWN: %s', counter, JSON.stringify( data ) );
                        decoded = false;
                    }
            }


        }
        return decoded
    }
}