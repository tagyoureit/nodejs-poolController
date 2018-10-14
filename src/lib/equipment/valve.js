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


var valve

module.exports = function (container) {

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: valve.js')

    var init = function () {
        valve = {
            "valve": 0
        }
    }

    function setValve(data) {
        container.logger.silly('Received valve status packet.  \n\tPossible association with %s. \n\t  valve data: %s', data[container.constants.controllerStatusPacketFields.VALVE], data)
        valve.valve = data[container.constants.controllerStatusPacketFields.valve];
        container.io.emitToClients('valve')
    }

    function getValve() {
        return {'valve': valve}
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: valve.js')


    return {
        init: init,
        setValve: setValve,
        getValve: getValve
    }
}

