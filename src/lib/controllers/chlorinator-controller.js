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


var chlorinatorTimer;
module.exports = function(container) {
    var logger = container.logger
    /*istanbul ignore next */
    if (container.logModuleLoading)
        logger.info('Loading: chlorinator-controller.js')



    function chlorinatorStatusCheck() {

        var desiredChlorinatorOutput = container.chlorinator.getDesiredChlorinatorOutput() === -1 ? 0 : container.chlorinator.getDesiredChlorinatorOutput();

        if (desiredChlorinatorOutput >= 0 && desiredChlorinatorOutput <= 101) {
            container.queuePacket.queuePacket([16, 2, 80, 17, desiredChlorinatorOutput])

            //not 100% sure if we need this, but just in case we get here in the middle of the 1800s timeout, let's clear it out
            //this would happen if the users sets the chlorinator from 0 to 1-100.
            if (chlorinatorTimer !== undefined)
                clearTimeout(chlorinatorTimer)

            //if 0, then only check every 30 mins; else resend the packet every 4 seconds as a keep-alive
            if (desiredChlorinatorOutput === 0) {
                chlorinatorTimer = setTimeout(chlorinatorStatusCheck, 30 * 1000) //30 minutes
            } else {
                chlorinatorTimer = setTimeout(chlorinatorStatusCheck, 4 * 1000) // every 4 seconds
            }
            return true
        }
        return false
    }

    function clearTimer() {
        if (chlorinatorTimer !== undefined)
            clearTimeout(chlorinatorTimer)

        return true
    }

    function startChlorinatorController() {
        if (container.settings.chlorinator.installed) {
            if (container.settings.virtual.chlorinatorController === 'always' || !(container.settings.intellicom || container.settings.intellitouch)) {
                if (container.settings.logChlorinator) container.logger.info('Virtual chlorinator controller starting.')
                chlorinatorTimer = setTimeout(chlorinatorStatusCheck, 4 * 1000)
            } else {
                if (container.settings.logChlorinator) container.logger.info('Virtual chlorinator controller not starting because it is set to default and another controller (Intellitouch/Intellicom) is present.')
            }
        } else {
            if (container.settings.logChlorinator) container.logger.info('Virtual chlorinator controller not starting because it is not installed.')
        }

        return true
    }
    /*istanbul ignore next */
    if (container.logModuleLoading)
        logger.info('Loaded: chlorinator-controller.js')

    return {
        startChlorinatorController: startChlorinatorController,
        chlorinatorStatusCheck: chlorinatorStatusCheck,
        clearTimer: clearTimer
    }

}
