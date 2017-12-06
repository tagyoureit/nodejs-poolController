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

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: 17.js')

    function process(data, counter) {
        //byte:      0  1  2  3  4 5 6 7 8  9 10 11  12 13 14
        //example: 165,16,15,16,17,7,1,6,9,25,15,55,255,2, 90

        //var bytes = [data[container.constants.schedulePacketBytes.ID], data[container.constants.schedulePacketBytes.CIRCUIT], data[container.constants.schedulePacketBytes.DAYS], data[container.constants.schedulePacketBytes.TIME1], data[container.constants.schedulePacketBytes.TIME2], data[container.constants.schedulePacketBytes.TIME3], data[container.constants.schedulePacketBytes.TIME4]]

        container.schedule.addScheduleDetails(data[container.constants.schedulePacketBytes.ID], data[container.constants.schedulePacketBytes.CIRCUIT], data[container.constants.schedulePacketBytes.DAYS], data[container.constants.schedulePacketBytes.TIME1], data[container.constants.schedulePacketBytes.TIME2], data[container.constants.schedulePacketBytes.TIME3], data[container.constants.schedulePacketBytes.TIME4], data, counter)

        if (container.settings.get('logConfigMessages'))
            container.logger.silly('\nMsg# %s  Schedule packet %s', counter, JSON.stringify(data))

        var decoded = true;
        return decoded
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: 17.js')


    return {
        process: process
    }
}
