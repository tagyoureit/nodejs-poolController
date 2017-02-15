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
        container.logger.info('Loading: 2.js')


    function process(data, counter) {
        var remotecontrol
        if (data[container.constants.pumpPacketFields.CMD] === 255) //Set pump control panel off (Main panel control only)
        {
            remotecontrol = 1;
        } else //0 = Set pump control panel on
        {
            remotecontrol = 0;
        }
        container.pump.setRemoteControl(remotecontrol, data[container.constants.packetFields.FROM], data, counter)
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: 2.js')



    return {
        process: process
    }
}
