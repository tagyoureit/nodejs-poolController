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

// Get Schedules
module.exports = function(container) {

    if (container.logModuleLoading)
        container.logger.info('Loading: 17.js')


    //TODO:  Merge this to a common function with the pump packet

    function process(data, counter) {
        //byte:      0  1  2  3  4 5 6 7 8  9 10 11  12 13 14
        //example: 165,16,15,16,17,7,1,6,9,25,15,55,255,2, 90

        //TODO: Move this to constants
        var schedulePacketBytes = {
            "ID": 6,
            "CIRCUIT": 7,
            "TIME1": 8,
            "TIME2": 9,
            "TIME3": 10,
            "TIME4": 11,
            "DAYS": 12
        };

        container.schedule.addScheduleDetails(data[schedulePacketBytes.ID], data[schedulePacketBytes.CIRCUIT], data[schedulePacketBytes.DAYS], data[schedulePacketBytes.TIME1], data[schedulePacketBytes.TIME2], data[schedulePacketBytes.TIME3], data[schedulePacketBytes.TIME4], counter)

        if (s.logConfigMessages)
            logger.silly('\nMsg# %s  schedulePacketBytes packet %s', counter, JSON.stringify(data))

        decoded = true;
        return decoded
    }

    if (container.logModuleLoading)
        container.logger.info('Loaded: 17.js')


    return {
        process: process
    }
}
