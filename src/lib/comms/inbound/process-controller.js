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

module.exports = function(container) {


    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: process-controller.js')


    function processControllerPacket(data, counter) {
        var decoded = false;
        switch (data[container.constants.packetFields.ACTION]) {

            case 1: // Ack
                {
                    // Nothing to process with ACK at this time
                    decoded = true;
                    break
                }
            case 2: //Controller Status
                {
                    decoded = container.controller_2.process(data, counter)
                    break;
                }
            case 5: //Broadcast date & time
                {
                    decoded = container.controller_5.process(data, counter)
                    break;
                }
            case 7: //Send request/response for pump status
                {
                    decoded = container.common_7.process(data, counter)
                    break;
                }
            case 8: //Broadcast current heat set point and mode
                {
                    decoded = container.controller_8.process(data, counter)
                    break;
                }
            case 10: //Get Custom Names
                {
                    decoded = container.controller_10.process(data, counter)
                    break;
                }

            case 11: // Get Circuit Names
                {
                    decoded = container.controller_11.process(data, counter)
                    break;
                }
            case 17: // Get Schedules
                {
                    decoded = container.controller_17.process(data, counter)
                    break;
                }
            case 25: //Intellichlor status
                {
                    decoded = container.controller_25.process(data, counter)
                    break;
                }
            case 39: //Intellibrite lights/groups
                {
                    decoded = container.controller_39.process(data, counter)
                    break;
                }
            case 96: //Set Intellibrite colors
                {
                    decoded = container.controller_96.process(data, counter)
                    break;
                }
            case 134: //Set Circuit Function On/Off
                {
                    decoded = container.controller_134.process(data, counter)
                    break;
                }
            case 136: //Set Heat/temp
                {
                    decoded = container.controller_136.process(data, counter)
                    break;
                }
            case 145: //Set Schedule
                {
                    decoded = container.controller_145.process(data, counter)
                    break;
                }
            case 153: //Set Intellichlor status
                {
                    decoded = container.controller_153.process(data, counter)
                    break;
                }
            case 167: //Intellibrite lights/groups
                {
                    // This is the same packet as 39 (Light Group/Status)
                    // but when setting this remotely, the new values are not re-broadcast
                    // so we will treat the assignment the same as the broadcast (for now...)
                    decoded = container.controller_39.process(data, counter)
                    break;
                }
            case 217: //Get Intellichlor status
                {
                    decoded = container.controller_217.process(data, counter)
                    break;
                }
            case 252: //Get system settings
                {
                    decoded = container.controller_252.process(data, counter)
                    break;
                }
            default:
                {

                    var currentAction = container.constants.strControllerActions[data[container.constants.packetFields.ACTION]]
                    if (currentAction !== undefined) {
                        if (container.settings.logConsoleNotDecoded)
                            container.logger.verbose('Msg# %s   Controller packet is known to be a %s packet, but is NOT DECODED: %s', counter, currentAction, data)
                        decoded = true; //don't need to display the message again
                    } else {
                        if (container.settings.logConsoleNotDecoded)
                            container.logger.verbose('Msg# %s   is NOT DEFINED and NOT DECODED packet: %s', counter, data)
                        decoded = true; //don't need to display the message again

                    }
                }
        }
        return decoded
    }



    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: process-controller.js')


    return {
        processControllerPacket: processControllerPacket
    }
}
//End Controller Decode
