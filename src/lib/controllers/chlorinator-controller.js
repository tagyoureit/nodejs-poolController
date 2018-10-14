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


var chlorinatorTimer, isRunning = 0;

module.exports = function (container) {
    var logger = container.logger
    /*istanbul ignore next */
    if (container.logModuleLoading)
        logger.info('Loading: chlorinator-controller.js')

    var isChlorinatorTimerRunning = function () {
        return isRunning
    }


    function chlorinatorStatusCheck() {
        var desiredChlorinatorOutput = container.chlorinator.getDesiredChlorinatorOutput() === -1 ? 0 : container.chlorinator.getDesiredChlorinatorOutput();

        if (desiredChlorinatorOutput >= 0 && desiredChlorinatorOutput <= 101) {
            container.queuePacket.queuePacket([16, 2, 80, 17, desiredChlorinatorOutput])

            //not 100% sure if we need this, but just in case we get here in the middle of the 1800s timeout, let's clear it out
            //this would happen if the users sets the chlorinator from 0 to 1-100.
            if (chlorinatorTimer !== undefined)
                clearTimeout(chlorinatorTimer)

            //if 0, then only check every 30 mins; else resend the packet every 4 seconds as a keep-alive
            recheckTime = desiredChlorinatorOutput === 0 ? 30 : 4
            if (container.settings.get('logChlorinator'))
                container.logger.silly('Will check chlorinator status again in %s minutes.', recheckTime)
            chlorinatorTimer = setTimeout(chlorinatorStatusCheck, recheckTime * 1000) //30 minutes

            isRunning = 1
            return true
        } else {
            container.logger.error('Desired chlorinator settings (%s) is outside tolerances (1-101)', container.chlorinator.getDesiredChlorinatorOutput())
        }
        isRunning = 0
        return false
    }

    function clearTimer() {
        if (chlorinatorTimer !== undefined)
            clearTimeout(chlorinatorTimer)
        isRunning = 0
        return true
    }

    function startChlorinatorController() {
        if (container.settings.get('chlorinator.installed')) {
            if (container.settings.get('virtual.chlorinatorController') === 'always' || !(container.settings.get('intellicom.installed') || container.settings.get('intellitouch.installed'))) {
                if (container.settings.get('logChlorinator')) container.logger.info('Virtual chlorinator controller starting.')
                isRunning = 1
                chlorinatorTimer = setTimeout(chlorinatorStatusCheck, 4 * 1000)
                container.chlorinator.setChlorinatorControlledBy('virtual')
            } else {
                if (container.settings.get('logChlorinator')) {
                    container.logger.info(`Virtual chlorinator controller not starting because it is set to default and another controller (${container.settings.get('intellitouch.installed')===1?'Intellitouch':'Intellicom'}) is present.`)

                    if (container.settings.get('intellitouch.installed')) {
                        container.chlorinator.setChlorinatorControlledBy('intellitouch')
                    }
                    else if (container.settings.get('intellicom.installed')){
                        container.chlorinator.setChlorinatorControlledBy('intellicom')
                    }
                }
            }
        } else {
            if (container.settings.get('logChlorinator')) {
                container.logger.info('Virtual chlorinator controller not starting because it is not installed.')
                container.chlorinator.setChlorinatorControlledBy('none')
            }
        }

    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        logger.info('Loaded: chlorinator-controller.js')

    return {
        startChlorinatorController: startChlorinatorController,
        chlorinatorStatusCheck: chlorinatorStatusCheck,
        clearTimer: clearTimer,
        isChlorinatorTimerRunning: isChlorinatorTimerRunning
    }

}
