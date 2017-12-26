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


/*
 //Pentair controller sends the pool and spa heat status as a 4 digit binary byte from 0000 (0) to 1111 (15).  The left two (xx__) is for the spa and the right two (__xx) are for the pool.  EG 1001 (9) would mean 10xx = 2 (Spa mode Solar Pref) and xx01 = 1 (Pool mode Heater)
 //0: all off
 //1: Pool heater            Spa off
 //2: Pool Solar Pref        Spa off
 //3: Pool Solar Only        Spa off
 //4: Pool Off               Spa Heater
 //5: Pool Heater            Spa Heater
 //6: Pool Solar Pref        Spa Heater
 //7: Pool Solar Only        Spa Heater
 //8: Pool Off               Spa Solar Pref
 //9: Pool Heater            Spa Solar Pref
 //10: Pool Solar Pref       Spa Solar Pref
 //11: Pool Solar Only       Spa Solar Pref
 //12: Pool Off              Spa Solar Only
 //13: Pool Heater           Spa Solar Only
 //14: Pool Solar Pref       Spa Solar Only
 //15: Pool Solar Only       Spa Solar Only
 0: 'Off',
 1: 'Heater',
 2: 'Solar Pref',
 3: 'Solar Only'
 */

var currentHeat;

module.exports = function(container) {

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: heat.js')

    function Heat(poolSetPoint, poolHeatMode, spaSetPoint, spaHeatMode, spaManualHeatMode) {
        this.poolSetPoint = poolSetPoint;
        this.poolHeatMode = poolHeatMode;
        this.poolHeatModeStr = container.constants.heatModeStr[poolHeatMode]
        this.spaSetPoint = spaSetPoint;
        this.spaManualHeatMode = spaManualHeatMode;
        this.spaHeatMode = spaHeatMode;
        this.spaHeatModeStr = container.constants.heatModeStr[spaHeatMode]
        this.heaterActive = 0
    }

    var init = function() {
        currentHeat = new Heat();
    }


    var copyHeat = function(heat) {
        currentHeat.poolSetPoint = heat.poolSetPoint;
        currentHeat.poolHeatMode = heat.poolHeatMode;
        currentHeat.poolHeatModeStr = heat.poolHeatModeStr
        currentHeat.spaSetPoint = heat.spaSetPoint;
        currentHeat.spaHeatMode = heat.spaHeatMode;
        currentHeat.spaHeatModeStr = heat.spaHeatModeStr
    }

    var newHeatSameAsExistingHeat = function(heat) {
        if (
            currentHeat.poolSetPoint === heat.poolSetPoint &&
            currentHeat.poolHeatMode === heat.poolHeatMode &&
            currentHeat.poolHeatModeStr === heat.poolHeatModeStr &&
            currentHeat.spaSetPoint === heat.spaSetPoint &&
            currentHeat.spaHeatMode === heat.spaHeatMode &&
            currentHeat.spaHeatModeStr === heat.spaHeatModeStr
        ) {
            return true
        } else {
            return false
        }
    }

    function setHeatActiveFromController(data) {
        if (data === 0) {
            currentHeat.heaterActive = 0
        } else
        if (data === 32) {
            currentHeat.heaterActive = 1
        } else {
            currentHeat.heaterActive = -1 //Unknown
        }
    }

    function setHeatModeFromController(poolHeat, spaHeat) {
        currentHeat.poolHeatMode = poolHeat
        currentHeat.poolHeatModeStr = container.constants.heatModeStr[poolHeat]
        currentHeat.spaHeatMode = spaHeat
        currentHeat.spaHeatModeStr = container.constants.heatModeStr[spaHeat]
    }

    function getCurrentHeat() {
        return currentHeat
    }

    function setHeatModeAndSetPoints(poolSetPoint, poolHeatMode, spaSetPoint, spaHeatMode, counter) {
        var heat = new Heat(poolSetPoint, poolHeatMode, spaSetPoint, spaHeatMode)

        if (currentHeat.poolSetPoint === undefined) {
            copyHeat(heat)
            if (container.settings.get('logConfigMessages'))
                container.logger.info('Msg# %s   Pool/Spa heat set point discovered:  \n  Pool heat mode: %s @ %s degrees \n  Spa heat mode: %s @ %s degrees', counter, currentHeat.poolHeatModeStr, currentHeat.poolSetPoint, currentHeat.spaHeatModeStr, currentHeat.spaSetPoint);

            container.io.emitToClients('heat');
        } else {

            if (newHeatSameAsExistingHeat(heat)) {
                container.logger.debug('Msg# %s   Pool/Spa heat set point HAS NOT CHANGED:  pool heat mode: %s @ %s degrees; spa heat mode %s at %s degrees', counter, currentHeat.poolHeatModeStr, currentHeat.poolSetPoint, currentHeat.spaHeatModeStr, currentHeat.spaSetPoint)
            } else {

                if (container.settings.get('logConfigMessages')) {
                    container.logger.verbose('Msg# %s   Pool/Spa heat set point changed:  pool heat mode: %s @ %s degrees; spa heat mode %s at %s degrees', counter, heat.poolHeatModeStr, heat.poolSetPoint, heat.spaHeatModeStr, heat.spaSetPoint);
                    container.logger.info('Msg# %s  Change in Pool/Spa Heat Mode:  %s', counter, currentHeat.whatsDifferent(heat))
                }
                copyHeat(heat)
                container.io.emitToClients('heat');
            }
        }
    }





    function setHeatSetPoint(equip, change, src) {
        //ex spa-->103
        //255,0,255,165,16,16,34,136,4,95,103,7,0,2,65

        /*
        FROM SCREENLOGIC

        20:49:39.032 DEBUG iOAOA: Packet being analyzed: 255,0,255,165,16,16,34,136,4,95,102,7,0,2,63
        20:49:39.032 DEBUG Msg# 153  Found incoming controller packet: 165,16,16,34,136,4,95,102,7,0,2,63
        20:49:39.032 INFO Msg# 153   Wireless asking Main to change pool heat mode to Solar Only (@ 95 degrees) & spa heat mode to Heater (at 102 degrees): [165,16,16,34,136,4,95,102,7,0,2,63]
        #1 - request

        20:49:39.126 DEBUG iOAOA: Packet being analyzed: 255,255,255,255,255,255,255,255,0,255,165,16,34,16,1,1,136,1,113
        20:49:39.127 DEBUG Msg# 154  Found incoming controller packet: 165,16,34,16,1,1,136,1,113
        #2 - ACK

        20:49:41.241 DEBUG iOAOA: Packet being analyzed: 255,255,255,255,255,255,255,255,0,255,165,16,15,16,2,29,20,57,0,0,0,0,0,0,0,0,3,0,64,4,68,68,32,0,61,59,0,0,7,0,0,152,242,0,13,4,69
        20:49:41.241 DEBUG Msg# 155  Found incoming controller packet: 165,16,15,16,2,29,20,57,0,0,0,0,0,0,0,0,3,0,64,4,68,68,32,0,61,59,0,0,7,0,0,152,242,0,13,4,69
        20:49:41.241 VERBOSE -->EQUIPMENT Msg# 155  .....
        #3 - Controller responds with status
        */

        /*  This function sets the values of the values directly  */
        container.logger.debug('cHSP: setHeatPoint called with %s %s from %s', equip, change, src)
        var updateHeatMode = (currentHeat.spaHeatMode << 2) | currentHeat.poolHeatMode;
        var updateHeat;
        if (equip === 'pool') {
            updateHeat = [165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 136, 4, parseInt(change), currentHeat.spaSetPoint, updateHeatMode, 0]
            container.logger.info('User request to update %s set point to %s', equip, currentHeat.poolSetPoint + change)
        } else {
            updateHeat = [165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 136, 4, currentHeat.poolSetPoint, parseInt(change), updateHeatMode, 0]
            container.logger.info('User request to update %s set point to %s', equip, currentHeat.spaSetPoint + change)
        }
        container.queuePacket.queuePacket(updateHeat);
        container.io.emitToClients('heat')
    }

    function changeHeatMode(equip, heatmode, src) {

        //pool
        var updateHeatMode,
            updateHeat
        if (equip === 'pool') {
            updateHeatMode = (currentHeat.spaHeatMode << 2) | heatmode;
            updateHeat = [165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 136, 4, currentHeat.poolSetPoint, currentHeat.spaSetPoint, updateHeatMode, 0]
            container.queuePacket.queuePacket(updateHeat);
            container.logger.info('User request to update pool heat mode to %s', container.constants.heatModeStr[heatmode])
        } else {
            //spaSetPoint
            updateHeatMode = (parseInt(heatmode) << 2) | currentHeat.poolHeatMode;
            updateHeat = [165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 136, 4, currentHeat.poolSetPoint, currentHeat.spaSetPoint, updateHeatMode, 0]
            container.queuePacket.queuePacket(updateHeat);
            container.logger.info('User request to update spa heat mode to %s', container.constants.heatModeStr[heatmode])
        }
        container.io.emitToClients('heat')
    }

    function setSpaSetPoint(setpoint, callback) {
        //  [16,34,136,4,POOL HEAT Temp,SPA HEAT Temp,Heat Mode,0,2,56]
        var response = {}
        if (setpoint === null || setpoint === undefined) {
            response.text = 'Null value passed to heat.setSpaPoint'
            container.logger.warn(response.text)
        } else {
            setpoint = parseInt(setpoint)
            //NOTE: need to fix for celcius
            if (setpoint < 40 || setpoint > 104) {
                response.text = 'Setpoint outside of allowed values (' + setpoint + ')'
                container.logger.warn(response.text)

            } else {
                var updateHeatMode = (currentHeat.spaHeatMode << 2) | currentHeat.poolHeatMode;
                var updateHeat = [165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 136, 4, currentHeat.poolSetPoint, setpoint, updateHeatMode, 0]
                container.logger.info('User request to update spa set point to %s', setpoint, updateHeat)
                container.queuePacket.queuePacket(updateHeat);

                response.text = 'Request to set spa heat setpoint to ' + setpoint + ' sent to controller'
                response.status = container.constants.heatModeStr[currentHeat.spaHeatMode]
                response.value = setpoint
                container.io.emitToClients('heat')
            }
        }
        if (callback !== undefined) {
            callback(response)
        }
    }

    function incrementSpaSetPoint(increment, callback) {
       if (increment === null || increment === undefined || isNaN(increment))
              increment = 1
            else parseInt(increment)
        setSpaSetPoint(currentHeat.spaSetPoint + increment, callback)
    }

    function decrementSpaSetPoint(decrement, callback) {
      if (decrement === null || decrement === undefined || isNaN(decrement))
        decrement = 1
      else parseInt(decrement)
        setSpaSetPoint(currentHeat.spaSetPoint - decrement, callback)
    }

    function setSpaHeatMode(heatmode, callback) {
        var updateHeatMode = (heatmode << 2) | currentHeat.poolHeatMode;
        var updateHeat = [165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 136, 4, currentHeat.poolSetPoint, currentHeat.spaSetPoint, updateHeatMode, 0]
        container.queuePacket.queuePacket(updateHeat);

        container.logger.info('User request to update spa heat mode to %s', container.constants.heatModeStr[heatmode], updateHeat)
        var response = {}
        response.text = 'Request to set spa heat mode to ' + container.constants.heatModeStr[heatmode] + ' sent to controller'
        response.status = container.constants.heatModeStr[heatmode]
        response.value = currentHeat.spaSetPoint
        container.io.emitToClients('heat')
        if (callback !== undefined) {
            callback(response)
        }
    }



    function setPoolSetPoint(setpoint, callback) {
        var response = {}
        if (setpoint === null || setpoint === undefined) {
            response.text = 'Null value passed to heat.setSpaPoint'
            container.logger.warn(response.text)
        } else {
            setpoint = parseInt(setpoint)
            var updateHeatMode = (currentHeat.spaHeatMode << 2) | currentHeat.poolHeatMode;
            var updateHeat = [165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 136, 4, setpoint, currentHeat.spaSetPoint, updateHeatMode, 0]
            container.queuePacket.queuePacket(updateHeat);

            response.text = 'User request to update pool heat set point to ' + setpoint + ': ' + updateHeat
            response.status = container.constants.heatModeStr[currentHeat.poolHeatMode]
            response.value = setpoint
            container.logger.info(response)
            container.io.emitToClients('heat')
        }
        if (callback !== undefined) {
            callback(response)
        }
    }

    function incrementPoolSetPoint(increment, callback) {
        if (increment === null || increment === undefined || isNaN(increment))
          increment = 1
        else parseInt(increment)
        setPoolSetPoint(currentHeat.poolSetPoint + increment, callback)
    }

    function decrementPoolSetPoint(decrement, callback) {
      if (decrement === null || decrement === undefined || isNaN(decrement))
        decrement = 1
      else parseInt(decrement)
        setPoolSetPoint(currentHeat.poolSetPoint - decrement, callback)
    }

    function setPoolHeatMode(heatmode, callback) {

        var updateHeatMode = (currentHeat.spaHeatMode << 2) | heatmode;
        var updateHeat = [165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 136, 4, currentHeat.poolSetPoint, currentHeat.spaSetPoint, updateHeatMode, 0]
        container.queuePacket.queuePacket(updateHeat);

        var response = {}
        response.text = 'Request to set pool heat mode to ' + container.constants.heatModeStr[heatmode] + ' sent to controller : ' + updateHeat
        response.status = container.constants.heatModeStr[heatmode]
        response.value = currentHeat.poolSetPoint
        container.logger.info(response)
        if (callback !== undefined) {
            callback(response)
        }

    }

    function setSpaManualHeatMode(data, counter){
      // Something to do with heat modes...
      // 165,33,16,34,168,10,0,0,0,254,0,0,0,0,0,0,2,168 = manual heat mode off
      // 165,33,16,34,168,10,0,0,0,254,1,0,0,0,0,0,2,169 = manual heat mode on

      var spaManualHeatMode = data[10]===0?'Off':'On'

      currentHeat.spaManualHeatMode = spaManualHeatMode;

      if (container.settings.get('logMessageDecoding'))
        container.logger.debug('Msg#: %s  Settings/Manual heat packet.  Manual Heat %s  Full packet: %s', counter, spaManualHeatMode , data);

    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: heat.js')


    return {
        init: init,
        getCurrentHeat: getCurrentHeat,
        changeHeatMode: changeHeatMode,
        setHeatSetPoint: setHeatSetPoint,
        setSpaHeatMode: setSpaHeatMode,
        setSpaSetPoint: setSpaSetPoint,
        incrementSpaSetPoint: incrementSpaSetPoint,
        decrementSpaSetPoint: decrementSpaSetPoint,
        setPoolSetPoint: setPoolSetPoint,
        incrementPoolSetPoint: incrementPoolSetPoint,
        decrementPoolSetPoint: decrementPoolSetPoint,
        setPoolHeatMode: setPoolHeatMode,
        setHeatModeFromController: setHeatModeFromController,
        setHeatActiveFromController: setHeatActiveFromController,
        setHeatModeAndSetPoints: setHeatModeAndSetPoints,
        setSpaManualHeatMode: setSpaManualHeatMode
    }
}
