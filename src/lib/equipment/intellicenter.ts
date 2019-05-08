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

import { settings, logger, queuePacket } from'../../etc/internal';

export namespace intellicenter
{
    var controllerSettings: any = {}


    var init = function ()
    {
        controllerSettings = {
            'appAddress': settings.get( 'appAddress' ),
            'needConfiguration': 1, //variable to let the program know we need the configuration from the intellicenter
            'preambleByte': -1 //variable to hold the 2nd preamble byte... it used to by 10 for me.  Now it is 16.  Very strange.  So here is a variable to find it.
        }
    }


    function getControllerConfiguration ()
    {
        if ( !settings.get( 'intellicenter.installed' ) )
        {
            return
        }
        logger.info( 'Queueing messages to retrieve configuration from Intellicenter' )

        logger.verbose( 'Queueing messages to retrieve all packets' )

        queuePacket.queuePacket( [ 165, controllerSettings.preambleByte, 15, controllerSettings.appAddress, 30, 29, 15, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255 ] );
            
        return true

    }

    function setPreambleByte ( byte: number )
    {
        controllerSettings.preambleByte = byte
    }

    function getPreambleByte ()
    {
        return controllerSettings.preambleByte
    }

    function checkIfNeedControllerConfiguration ()
    {
        if ( controllerSettings.needConfiguration )
        {

            if ( settings.get( 'intellitouch.installed' ) ) 
            {
                if ( controllerSettings.preambleByte !== -1 )
                {
                    // need to use full path here or Mocha/Sinon won't recognize the call to the function in the same Bottle.
                    getControllerConfiguration()
                    controllerSettings.needConfiguration = 0; //we will no longer request the configuration.  Need this first in case multiple packets come through.
                }
            } else
            {
                if ( settings.get( 'intellicom.installed' ) )
                {
                    logger.info( 'IntellicomII Controller installed.  No configuration request messages sent.' )
                } else
                {
                    logger.info( 'No pool controller (Intellitouch or IntelliComII) detected.  No configuration request messages sent.' )
                }
                controllerSettings.needConfiguration = 0; //we will no longer request the configuration.  Need this first in case multiple packets come through.
                return controllerSettings.needConfiguration
            }
 
        }
        return controllerSettings.needConfiguration
    }


}