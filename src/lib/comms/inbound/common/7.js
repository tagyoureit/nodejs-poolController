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


//Send request/response for pump status
module.exports = function(container) {

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: 2.js')

    var logger = container.logger
    var s = container.settings
    var c = container.constants



    function process(data, counter) {
        // changes to support 16 pumps
        // if (data[c.packetFields.DEST] === 96 || data[c.packetFields.DEST] === 97) //Command to the pump
        if (container.pump.packetToPump(data)) //Command to the pump
        {
            container.pump.provideStatus(data, counter)
        } else //response
        {
            var pump;
            // code to support 16 pumps
            // if (data[c.packetFields.FROM] === 96 || data[c.packetFields.DEST] === 96) {
            //     pump = 1
            // } else {
            //     pump = 2
            // }

            pump = container.pump.getPumpNumber(data)

            var hour = data[c.pumpPacketFields.HOUR]
            var min = data[c.pumpPacketFields.MIN];
            var run = data[c.pumpPacketFields.CMD]
            var mode = data[c.pumpPacketFields.MODE]
            var drivestate = data[c.pumpPacketFields.DRIVESTATE]
            var watts = (data[c.pumpPacketFields.WATTSH] * 256) + data[c.pumpPacketFields.WATTSL]
            var rpm = (data[c.pumpPacketFields.RPMH] * 256) + data[c.pumpPacketFields.RPML]
            var gpm = data[c.pumpPacketFields.GPM]
            var ppc = data[c.pumpPacketFields.PPC]
            var err = data[c.pumpPacketFields.ERR]
            var timer = data[c.pumpPacketFields.TIMER]
            container.pump.setPumpStatus(pump, hour, min, run, mode, drivestate, watts, rpm, gpm, ppc, err, timer, data, counter)
        }

    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: 2.js')


    return {
        process: process
    }
}
