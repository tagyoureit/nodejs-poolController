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
        container.logger.info('Loading: 39.js')


    function process(data, counter) {
        //                                                                                      1         2            3           4           5           6           7           8
        //                                                                    0  1  2  3   4  5 6  7 8 9 10  11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38   39
        // 14:43:31.925 VERBOSE Msg# 416   Set Light Special Groups packet: 165,16,16,34,167,32,9,32,0,0, 7, 32, 0, 0, 18, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 254

        var _temp = data.slice(6, data.length) // create new array with all packets after the preamble, dest, src, action, and length
        _temp.splice(_temp.length-2, _temp.length)  // remove checksum high/low bytes

        container.circuit.assignControllerLightGroup(_temp, counter)

        return true
    }


    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: 39.js')


    return {
        process: process
    }
}
