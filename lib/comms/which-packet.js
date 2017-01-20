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


    if (container.logModuleLoading)
        container.logger.info('Loading: which-packet.js')


    function outbound(packet) {
        //TODO: swap out 96/97 for ctrlString vars

        if (packet[container.constants.packetFields.DEST + 3] === 96 || packet[container.constants.packetFields.DEST + 3] === 97) {
            return 'pump'
        } else if (packet[0] === 16) {

            return 'chlorinator'
        } else {
            return 'controller'
        }
    }

    function inbound(packet) {
        if (packet[container.constants.packetFields.DEST] === 96 || packet[container.constants.packetFields.DEST] === 97) {
            return 'pump'
        } else if (packet[0] === 16) {
            return 'chlorinator'
        } else {
            return 'controller'
        }
    }

    if (container.logModuleLoading)
        container.logger.info('Loaded: which-packet.js')

    return {
        outbound: outbound,
        inbound: inbound
    }

}
