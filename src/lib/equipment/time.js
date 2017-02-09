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
        container.logger.info('Loading: time.js')

    //How to use this.... container.dateFormat

    var time = {
        "controllerTime": -1,
        "pump1Time": -1,
        "pump2Time": -1
    }


    function setControllerTime(hour, min) {
        var timeStr = container.helpers.formatTime(hour, min)

        if (time.controllerTime === -1) {
            time.controllerTime = timeStr;
            container.io.emitToClients('time')
        } else if (timeStr !== time.controllerTime) {
            container.io.emitToClients('time')
            time.controllerTime = timeStr;
        }
        else {
          if (container.settings.logConfigMessages) container.logger.debug('No change in time.')
        }

    }

    function setPumpTime(pump, time){
      var pumpStr = "pump" + pump + "Time"
      time[pumpStr] = time
    }

    function getTime(callback) {
        return time
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: time.js')


    return {
        //time,
        setControllerTime: setControllerTime,
        getTime: getTime,
        setPumpTime: setPumpTime
    }
}
