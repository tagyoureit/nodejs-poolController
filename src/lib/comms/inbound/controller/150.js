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

//Set Intellichlor status
module.exports = function(container) {

  /*istanbul ignore next */
  if (container.logModuleLoading)
    container.logger.info('Loading: 150.js')

  var packet;
  var pump, stepSize, pumpFriendlyName;

  function process(data, counter) {

    // sample packet with pump 2 at 220rpm step size:  165,33,16,34,150,16,0,1,0,0,0,2,220,10,1,144,13,122,15,130,0,0,4,48

    var currentAction = container.constants.strControllerActions[data[container.constants.packetFields.ACTION]]


    if (packet === undefined) {
      packet = data;
    } else {
      // let's use some logic to see what the other values here are...
      packet[11] = data[11]
      packet[12] = data[12]
      packet[22] = data[22] //check bit h -- don't really care about this
      packet[23] = data[23] //check bit l -- don't really care about this
      if (!container._.isEqual(packet, data)) {
        // something has changed
        if (container.settings.get('logMessageDecoding'))
          container.logger.warn('Msg# %s   Set %s: ***Something changed besides known packets***.  \n\tPacket: %s\n\tData: %s', counter, currentAction, packet, data)
      }
    }

    if (pump !== data[11] || stepSize !== data[12]) {
      pump = data[11]

      if (pump !== 0) {
        pumpFriendlyName = container.pump.getFriendlyName(pump);
        stepSize = data[12]
      } else {
        stepSize = 'n/a' //may need to make this an integer if it ever gets used.  Fine for string output for now.
        pumpFriendlyName = 'None';
      }

      if (container.settings.get('logMessageDecoding'))
        container.logger.debug('Msg# %s   Set %s: Pump %s (%s) step size is %s RPM.  Packet: %s', counter, currentAction, pumpFriendlyName, pump, stepSize, data)

    } else { // no change
      if (container.settings.get('logMessageDecoding'))
        container.logger.silly('Msg# %s   No change in Set %s: Pump %s (%s) step size is %s.  Packet: %s', counter, currentAction, pumpFriendlyName, pump, stepSize, data)
    }

    return true
  }

  /*istanbul ignore next */
  if (container.logModuleLoading)
    container.logger.info('Loaded: 150.js')

  return {
    process: process
  }
}
