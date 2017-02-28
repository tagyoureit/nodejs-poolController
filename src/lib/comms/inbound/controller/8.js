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

//Broadcast current heat set point and mode
module.exports = function(container) {

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: 8.js')

        var logger = container.logger
        var s = container.settings

        //currentHeat = container.heat.currentHeat <--Not sure why, but this isn't working very well.  :-(  Can't do currentHeat = heat and have it set container.heat.currentHeat at the same time.




        function process(data, counter) {
            //   0 1  2  3 4  5  6 7   8  9  19 11 12 13  14 15 16 17 18 19  20
            //[165,x,15,16,8,13,75,75,64,87,101,11,0,  0 ,62 ,0 ,0 ,0 ,0 ,2,190]
            //function heatObj(poolSetPoint, poolHeatMode, spaSetPoint, spaHeatMode)


            container.heat.setHeatModeAndSetPoints(data[9], data[11] & 3, data[10], (data[11] & 12) >> 2, counter)
            container.temperatures.setTempFromController(data[6], data[7], data[8], data[14], 0) //TODO: which one is freeze?


            if (s.logConfigMessages) {
                logger.silly('Msg# %s  Heat status packet data: %s  currentHeat: %s', counter, data);
            }


            var decoded = true;

            return decoded
        }

        /*istanbul ignore next */
        if (container.logModuleLoading)
            container.logger.info('Loaded: 8.js')

    return {
        process: process
    }
}
