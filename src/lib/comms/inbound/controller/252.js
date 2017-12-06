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

//Get system settings
module.exports = function(container) {

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: 252.js')

    logger = container.logger
    currentStatusBytes = container.currentStatusBytes
    currentCircuitArrObj = container.circuit.currentCircuitArrObj
    currentSchedule = container.currentSchedule
    customNameArr = container.circuit.customNameArr
    c = container.constants


    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: 252.js')

    //TODO:  Merge this to a common function with the pump packet

    return {
        process: function(data, counter) {
            //Software/Bootloader Revision
            if (container.settings.get('logConfigMessages')) {
                logger.info('Controller Bootloader Revision: %s  Full Packet: %s', data[11] + '.' + data[12] + data[13], JSON.stringify(data))
            }
            var decoded = true
            return decoded
        }
    }
}
