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

 var temperature

module.exports = function(container) {


    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: temperature.js')

        var _ = require('underscore')

    var init = function(){
      temperature = {
          "poolTemp": 0,
          "spaTemp": 0,
          "airTemp": 0,
          "solarTemp": 0,
          "freeze": 0,
          "poolLastKnownTemp": 0,
          "spaLastKnownTemp": 0
      }
    }

    function setTempFromController(poolTemp, spaTemp, airTemp, solarTemp, freeze) {
        temperature.poolTemp = poolTemp
        temperature.spaTemp = spaTemp
        temperature.airTemp = airTemp
        temperature.solarTemp = solarTemp
        temperature.freeze = freeze
        container.io.emitToClients('temperature')
                container.influx.writeTemperatureData(temperature)
        return temperature
    }

    function getTemperature(){
        var heat = container.heat.getCurrentHeat()
        var combine = _.extend(temperature, heat)
            return {'temperature': combine}
    }

    const saveLastKnownTemp = (which) =>{
        if (which.toUpperCase() === 'POOL'){
            temperature.poolLastKnownTempPool = temperature.poolTemp
        }
        else if (which.toUpperCase()==='SPA'){
            temperature.spaLastKnownTempPool = temperature.spaTemp
        }
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: temperature.js')


    return {
        init: init,
        setTempFromController: setTempFromController,
        getTemperature : getTemperature,
        saveLastKnownTemp : saveLastKnownTemp
    }
}
