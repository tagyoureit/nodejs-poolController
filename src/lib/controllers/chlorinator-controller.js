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
 var NanoTimer = require('nanotimer')
 var chlorinatorTimer = new NanoTimer();

module.exports = function(container) {
  var logger = container.logger
  if (container.logModuleLoading)
      logger.info('Loading: chlorinator-controller.js')




    function startChlorinatorController() {

      chlorinatorTimer.setTimeout(chlorinatorStatusCheck, '', '3500m')

      return true
    }


    function chlorinatorStatusCheck() {
        var desiredChlorinatorOutput = container.chlorinator.getDesiredChlorinatorOutput()
        if (desiredChlorinatorOutput >= 0 && desiredChlorinatorOutput <= 101) {
            container.queuePacket.queuePacket([16, 2, 80, 17, desiredChlorinatorOutput])

            //not 100% sure if we need this, but just in case we get here in the middle of the 1800s timeout, let's clear it out
            //this would happen if the users sets the chlorinator from 0 to 1-100.
            chlorinatorTimer.clearTimeout()

            //if 0, then only check every 30 mins; else resend the packet every 4 seconds as a keep-alive
            if (desiredChlorinatorOutput === 0) {
                return chlorinatorTimer.setTimeout(chlorinatorStatusCheck, '', '1800s') //30 minutes
            } else {
                return chlorinatorTimer.setTimeout(chlorinatorStatusCheck, '', '4s') // every 4 seconds
            }
            return true
        }
        return false
    }

    if (container.logModuleLoading)
        logger.info('Loaded: chlorinator-controller.js')

    return {
        startChlorinatorController: startChlorinatorController,
        chlorinatorStatusCheck: chlorinatorStatusCheck
    }

}
