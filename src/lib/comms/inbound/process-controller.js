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
      case 2: //C ontroller Status
        {
          decoded = container.controller_2.process(data, counter)
          break;
        }
      case 5: // Broadcast date & time
        {
          decoded = container.controller_5.process(data, counter)
          break;
        }
      case 7: // Pump status
        {
          decoded = container.common_7.process(data, counter)
          break;
        }
      case 8: // Broadcast current heat set point and mode
        {
          decoded = container.controller_8.process(data, counter)
          break;
        }
      case 10: // Custom Names
        {
          decoded = container.controller_10.process(data, counter)
          break;
        }

      case 11: // Circuit Names
        {
          decoded = container.controller_11.process(data, counter)
          break;
        }
      case 17: // Schedules
        {
          decoded = container.controller_17.process(data, counter)
          break;
        }
      case 18: // IntelliChem
        {
          decoded = container.controller_18.process(data, counter)
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
      case 29: // Valves
        {
          decoded = container.controller_29.process(data, counter)
          break;
        }
      case 30: // High speed circuits
        {
          decoded = container.controller_30.process(data, counter)
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
      case 35: // Delay Status
        {
          decoded = container.controller_35.process(data, counter)
          break;
        }
      case 39: //Intellibrite lights/groups
        {
          decoded = container.controller_39.process(data, counter)
          break;
        }
      case 40: // settings?  heat mode.
        {
          decoded = container.controller_40.process(data, counter)
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
        //   case 96: 'Set Color', //Intellibrite, maybe more?
        //   case 131: 'Set Delay Cancel',
        //   case 133: 'Set Date/Time',
        //   case 134: 'Set Circuit',
        //   case 136: 'Set Heat/Temperature',
        //   case 138: 'Set Custom Name',
        //   case 139: 'Set Circuit Name/Function',
        //   case 144: 'Set Heat Pump',
        //   case 145: 'Set Schedule',
        //   case 147: 'Set IntelliChem',
        //   case 150: 'Set Intelliflow Spa Side Control',
        //   case 152: 'Set Pump Config',
        //   case 153: 'Set IntelliChlor',
        //   case 155: 'Set Pump Config (Extended)',
        //   case 157: 'Set Valves',
        //   case 160: 'Set is4/is10 Spa Side Remote',
        //   case 161: 'Set QuickTouch Spa Side Remote',
        //   case 162: 'Set Solar/Heat Pump',
        //   case 163: 'Set Delay',
        //   case 167: 'Set Light Groups/Positions',
        //   case 168: 'Set Heat Mode',  //probably more
        // case 139: //Set circuit name/function
        // case 157: //Set valves
        // case 160: //Set Spa-side is4/is10 remotes
        // case 161: //Set Spa-side Quicktouch remotes
        // case 194: //'Get Status/',
        // case 197: //'Get Date/Time',
        // case 200: //'Get Heat/Temperature',
        // case 202: //'Get Custom Name',
        // case 203: //'Get Circuit Name/Function',
        // case 208: //'Get Heat Pump',
        // case 209: //'Get Schedule',
        // case 211: //'Get IntelliChem',
        // case 215: //'Get Pump Status',
        // case 216: //'Get Pump Config',
        // case 217: //'Get IntelliChlor',
        // case 219: //'Get Pump Config (Extended)',
        // case 221: //'Get Valves',
        // case 224: // Get is4/is10,
        // case 225: // Get Quicktouch,
        // case 226: //'Get Solar/Heat Pump',
        // case 227: //'Get Delays',
        // case 231: //'Get Light group/positions',
        // case 232: // Settings?  manual heat mode
        //   {
        //     decoded = container.controller_get.process(data, counter)
        //     break;
        //   }
      case 252: //Get system settings
        {
          decoded = container.controller_252.process(data, counter)
          break;
        }
      default:
        {

          var currentAction = container.constants.strControllerActions[data[container.constants.packetFields.ACTION]]
          if (currentAction !== undefined) {
            if (container.settings.get('logConsoleNotDecoded'))
              container.logger.verbose('Msg# %s   Controller packet is known to be a %s packet: %s', counter, currentAction, data)
            decoded = true
          } else {
            if (container.settings.get('logConsoleNotDecoded'))
              container.logger.verbose('Msg# %s  Identifier %s is NOT DEFINED and NOT DECODED packet: %s', counter, data[3], data)
            decoded = true

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
