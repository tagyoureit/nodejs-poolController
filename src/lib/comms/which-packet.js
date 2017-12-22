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
    container.logger.info('Loading: which-packet.js')


  function outbound(packet) {
    if (packet[container.constants.packetFields.DEST + 3] >= container.constants.ctrl.PUMP1 && packet[container.constants.packetFields.DEST + 3] <= container.constants.ctrl.PUMP16) {
      return 'pump'
    } else if (packet[0] === 16) {

      return 'chlorinator'
    } else {
      return 'controller'
    }
  }

  function inbound(packet) {
    // changes to support 16 pumps
    // if (packet[container.constants.packetFields.DEST] === 96 || packet[container.constants.packetFields.DEST] === 97) {
    if (packet[container.constants.packetFields.DEST] >= container.constants.ctrl.PUMP1 && packet[container.constants.packetFields.DEST] <= container.constants.ctrl.PUMP16) {
      return 'pump'
    } else if (packet[0] === 16) {
      return 'chlorinator'
    } else {
      return 'controller'
    }
  }

  /*istanbul ignore next */
  if (container.logModuleLoading)
    container.logger.info('Loaded: which-packet.js')

  return {
    outbound: outbound,
    inbound: inbound
  }

}
