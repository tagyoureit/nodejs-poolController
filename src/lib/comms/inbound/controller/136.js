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

//This is _SET_ heat/temp... not the response.
module.exports = function(container) {

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: 136.js')

        var logger = container.logger
        var s = container.settings
       var c = container.constants



    function process(data, counter) {
        //  [16,34,136,4,POOL HEAT,SPA HEAT,Heat Mode,0,2,56]

        var status = {

            source: null,
            destination: null,
            b3: null,
            CMD: null,
            sFeature: null,
            ACTION: null,
            b7: null

        }
        status.source = data[c.packetFields.FROM]
        status.destination = data[c.packetFields.DEST]

        status.POOLSETPOINT = data[6];
        status.SPASETPOINT = data[7];
        status.POOLHEATMODE = c.heatModeStr[data[8] & 3]; //mask the data[6] with 0011
        status.SPAHEATMODE = c.heatModeStr[(data[8] & 12) >> 2]; //mask the data[6] with 1100 and shift right two places
        logger.info('Msg# %s   %s asking %s to change pool heat mode to %s (@ %s degrees) & spa heat mode to %s (at %s degrees): %s', counter, c.ctrlString[data[c.packetFields.FROM]], c.ctrlString[data[c.packetFields.DEST]], status.POOLHEATMODE, status.POOLSETPOINT, status.SPAHEATMODE, status.SPASETPOINT, JSON.stringify(data));
        var decoded = true;


        return decoded
    }


    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: 136.js')


    return {
        process: process
    }
}
