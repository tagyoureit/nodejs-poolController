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
        container.logger.info('Loading: 5.js')

        var logger = container.logger
        var s = container.settings

        var process=function(data, counter) {
          //                         2   3    4 5  6   7   8   9  10 11 12 13 14 15
          //example packet  165	16	16	34	133	8	21	31	64	11	3	 17	 0	0	 2	7

          //Following packet (time) also is broadcast in #2, as is adjust DST...
          container.time.setControllerTime(data[6], data[7])

          //But the DATE is not broadcast anywhere else (unless hidden in status packet?)
          container.time.setControllerDate(data[8], data[9], data[10], data[11], data[13])  //day of week, day, month, year, autoadjustDST

            if (s.logConfigMessages) {
                logger.silly('Msg# %s  Heat status packet data: %s  currentHeat: %s', counter, data);
            }


            var decoded = true;

            return decoded
        }

        /*istanbul ignore next */
        if (container.logModuleLoading)
            container.logger.info('Loaded: 5.js')

    return {
        process: process
    }
}
