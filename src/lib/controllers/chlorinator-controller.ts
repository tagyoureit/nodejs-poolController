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

import { settings, logger, chlorinator, queuePacket } from '../../etc/internal';

let chlorinatorTimer: NodeJS.Timeout, isRunning:ZeroOrOne = 0;
let alreadyChecked: boolean = false;

export namespace chlorinatorController
{
    export function isChlorinatorTimerRunning (): 0|1
    {
        return isRunning
    }


    export function chlorinatorStatusCheck (): void
    {
        var desiredChlorinatorOutput = chlorinator.getDesiredChlorinatorOutput() === -1 ? 0 : chlorinator.getDesiredChlorinatorOutput();

        if ( desiredChlorinatorOutput >= 0 && desiredChlorinatorOutput <= 101 )
        {
            queuePacket.queuePacket( [ 16, 2, 80, 17, desiredChlorinatorOutput ] )

            //not 100% sure if we need this, but just in case we get here in the middle of the 1800s timeout, let's clear it out
            //this would happen if the users sets the chlorinator from 0 to 1-100.
            if ( chlorinatorTimer !== undefined )
                clearTimeout( chlorinatorTimer )

            //if 0, then only check every 30 mins; else resend the packet every 4 seconds as a keep-alive
            let recheckTime = desiredChlorinatorOutput === 0 ? 30 : 4
            if ( settings.get( 'logChlorinator' ) )
                logger.silly( 'Will check chlorinator status again in %s minutes.', recheckTime )
            chlorinatorTimer = setTimeout( chlorinatorStatusCheck, recheckTime * 1000 ) //30 minutes

            isRunning = 1
        } else
        {
            logger.error( 'Desired chlorinator settings (%s) is outside tolerances (1-101)', chlorinator.getDesiredChlorinatorOutput() )
        }
        isRunning = 0
    }

    export function clearTimer (): void
    {
        if ( chlorinatorTimer !== undefined )
            clearTimeout( chlorinatorTimer )
        isRunning = 0;
        alreadyChecked = false;
    }

    export function startChlorinatorController (): void
    {
        // if the controller is already running or this has been checked
        // once, then skip checking it again
        if ( !(isRunning || alreadyChecked) )
        {
            alreadyChecked = true;
            if ( settings.get( 'chlorinator.installed' ) )
            {
                if ( settings.get( 'virtual.chlorinatorController' ) === 'always' || !( settings.get( 'intellicom.installed' ) || settings.get( 'intellitouch.installed' ) ) )
                {
                    if ( settings.get( 'logChlorinator' ) ) logger.info( 'Virtual chlorinator controller starting.' )
                    isRunning = 1
                    chlorinatorTimer = setTimeout( chlorinatorStatusCheck, 4 * 1000 )
                    chlorinator.setChlorinatorControlledBy( 'virtual' )
                } else
                {
                    if ( settings.get( 'logChlorinator' ) )
                    {
                        logger.info( `Virtual chlorinator controller not starting because it is set to default and another controller (${ settings.get( 'intellitouch.installed' ) === 1 ? 'Intellitouch' : 'Intellicom' }) is present.` )

                        if ( settings.get( 'intellitouch.installed' ) )
                        {
                            chlorinator.setChlorinatorControlledBy( 'intellitouch' )
                        }
                        else if ( settings.get( 'intellicom.installed' ) )
                        {
                            chlorinator.setChlorinatorControlledBy( 'intellicom' )
                        }
                    }
                }
            } else
            {
                if ( settings.get( 'logChlorinator' ) )
                {
                    logger.info( 'Virtual chlorinator controller not starting because it is not installed.' )
                    chlorinator.setChlorinatorControlledBy( 'none' )
                }
            }
        }

    }
}