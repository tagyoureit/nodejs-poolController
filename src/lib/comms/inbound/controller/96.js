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

//Set Intellibrite Lights
module.exports = function(container) {

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: 96.js')


    function process(data, counter) {
        //          0  1  2  3  4 5   6 7 8  9
        //eg RED: 165,16,16,34,96,2,195,0,2,12
        // data[6] = color
        // data[7] = light group
        if (container.settings.get('logIntellibrite')) {
            container.logger.silly('Msg# %s: Set Light Group packet: %s\ncolor: %s \t light group: %s', counter, JSON.stringify(data), data[6], data[7])
        }
        container.circuit.assignControllerLightColor(data[6], data[7], counter)

        return true
    }


    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: 96.js')


    return {
        process: process
    }
}
