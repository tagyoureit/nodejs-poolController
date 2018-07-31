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

/* global logger */
var controllerSettings

module.exports = function(container) {

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: intellitouch.js')

    var init =function() {
      controllerSettings = {
        'appAddress': container.settings.get('appAddress'),
        'needConfiguration': 1, //variable to let the program know we need the configuration from the Intellitouch
        'preambleByte': -1 //variable to hold the 2nd preamble byte... it used to by 10 for me.  Now it is 16.  Very strange.  So here is a variable to find it.
    }
  }


    function getControllerConfiguration() {
        container.logger.info('Queueing messages to retrieve configuration from Intellitouch')

        container.logger.verbose('Queueing messages to retrieve SW Version')
            //get Heat Mode
        container.queuePacket.queuePacket([165, controllerSettings.preambleByte, 16, controllerSettings.appAddress, 253, 1, 0]);

        container.logger.verbose('Queueing messages to retrieve time')
        container.queuePacket.queuePacket([165, controllerSettings.preambleByte, 16, controllerSettings.appAddress, 197, 1, 0]);

        container.logger.verbose('Queueing messages to retrieve Pool/Spa Heat Mode')
        container.queuePacket.queuePacket([165, controllerSettings.preambleByte, 16, controllerSettings.appAddress, 200, 1, 0]);

        container.logger.verbose('Queueing messages to retrieve Valve information')
        container.queuePacket.queuePacket([165, controllerSettings.preambleByte, 16, controllerSettings.appAddress, 221, 1, 0]);

        container.logger.verbose('Queueing messages to retrieve settings(?)')
        container.queuePacket.queuePacket([165, controllerSettings.preambleByte, 16, controllerSettings.appAddress, 232, 1, 0]);

        container.logger.verbose('Queueing messages to retrieve Custom Names')
        var i = 0;
        //get custom names
        for (i; i < container.customNames.getNumberOfCustomNames(); i++) {
            container.queuePacket.queuePacket([165, controllerSettings.preambleByte, 16, controllerSettings.appAddress, 202, 1, i]);
        }


        container.logger.verbose('Queueing messages to retrieve Circuit Names')
            //get circuit names
        for (i = 1; i <= container.circuit.getNumberOfCircuits(); i++) {
            container.queuePacket.queuePacket([165, controllerSettings.preambleByte, 16, controllerSettings.appAddress, 203, 1, i]);
        }
        container.logger.verbose('Queueing messages to retrieve light groups/positions')
        container.queuePacket.queuePacket([165, controllerSettings.preambleByte, 16, controllerSettings.appAddress, 231, 1, 0]);

        container.logger.verbose('Queueing messages to retrieve Schedules')
        container.schedule.getControllerScheduleAll()

        container.logger.verbose('Queueing messages to retrieve pump configurations')
        container.pump.getPumpConfiguration()
        return true

    }

    function setPreambleByte(byte){
        controllerSettings.preambleByte = byte
    }

    function getPreambleByte(){
        return controllerSettings.preambleByte
    }

    function checkIfNeedControllerConfiguration() {
       if (controllerSettings.needConfiguration) {

           if (container.settings.get('intellitouch.installed')) // ONLY check the configuration if the controller is Intellitouch (address 16)
           {
               if (controllerSettings.preambleByte !== -1) {
                   // need to use full path here or Mocha/Sinon won't recognize the call to the function in the same Bottle.
                   container.intellitouch.getControllerConfiguration()
                   controllerSettings.needConfiguration = 0; //we will no longer request the configuration.  Need this first in case multiple packets come through.
               }
           } else {
               if (container.settings.get('intellicom.installed')) {
                   container.logger.info('IntellicomII Controller installed.  No configuration request messages sent.')
               } else {
                   container.logger.info('No pool controller (Intellitouch or IntelliComII) detected.  No configuration request messages sent.')
               }
               controllerSettings.needConfiguration = 0; //we will no longer request the configuration.  Need this first in case multiple packets come through.
               return controllerSettings.needConfiguration
           }

       }
        return controllerSettings.needConfiguration
   }



    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: intellitouch.js')

    return {
        init: init,
        checkIfNeedControllerConfiguration: checkIfNeedControllerConfiguration,
        getPreambleByte: getPreambleByte,
        setPreambleByte : setPreambleByte,
        getControllerConfiguration: getControllerConfiguration
    }

}
