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
      case 27: // Pump Config (Extended)
        {
          decoded = container.controller_27.process(data, counter)
          break;
        }
      case 32: // Spa-side is4/is10 remotes
      case 33: // Spa-side Quicktouch remotes
        {
          decoded = container.controller_32_33.process(data, counter)
          break;
        }
      case 34: // Solar/Heat Pump Status
        {
          decoded = container.controller_34.process(data, counter)
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
      case 150: //Set Intelliflo Spa Side Control
        {
          decoded = container.controller_150.process(data, counter)
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
      case 139: //Set circuit name/function
      case 157: //Set valves
      case 160: //Set Spa-side is4/is10 remotes
      case 161: //Set Spa-side Quicktouch remotes
      case 194: //'Get Status/',
      case 197: //'Get Date/Time',
      case 200: //'Get Heat/Temperature',
      case 202: //'Get Custom Name',
      case 203: //'Get Circuit Name/Function',
      case 208: //'Get Heat Pump',
      case 209: //'Get Schedule',
      case 211: //'Get IntelliChem',
      case 215: //'Get Pump Status',
      case 216: //'Get Pump Config',
      case 217: //'Get IntelliChlor',
      case 219: //'Get Pump Config (Extended)',
      case 221: //'Get Valves',
      case 224: // Get is4/is10,
      case 225: // Get Quicktouch,
      case 226: //'Get Solar/Heat Pump',
      case 227: //'Get Delays',
      case 231: //'Get Light group/positions',
        {
          decoded = container.controller_get.process(data, counter)
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
              container.logger.verbose('Msg# %s  %s is NOT DEFINED and NOT DECODED packet: %s', counter, data[3], data)
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
