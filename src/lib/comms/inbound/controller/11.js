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

// Get Circuit Names
module.exports = function(container) {

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: 11.js')

        var logger = container.logger

    function process(data, counter) {

        var circuit = data[container.constants.namePacketFields.NUMBER]
        if (container.settings.get('logMessageDecoding')) logger.silly('Msg# %s  Get Circuit Info  %s', counter, JSON.stringify(data))

        container.circuit.setCircuitFromController(circuit, data[container.constants.namePacketFields.NAME], data[container.constants.namePacketFields.CIRCUITFUNCTION], counter)
        return true
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: 11.js')

    return {
        process: process
    }
}
