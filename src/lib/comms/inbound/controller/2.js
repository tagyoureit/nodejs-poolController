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
        container.logger.info('Loading: 2.js')

        var logger = container.logger
        var s = container.settings
        var c = container.constants


        /*istanbul ignore next */
    if (container.logModuleLoading)
            logger.info('Loaded: 2.js')


            function process(data, counter) {
              //Only run through this if there is a change
              if (JSON.stringify(data) !== JSON.stringify(container.circuit.getCurrentStatusBytes())) {
                container.circuit.setCurrentStatusBytes(data, counter)



                  container.time.setControllerTime(data[c.controllerStatusPacketFields.HOUR], data[c.controllerStatusPacketFields.MIN])
                  container.time.setAutomaticallyAdjustDST(data[c.controllerStatusPacketFields.MISC2] & 1)
                  container.temperatures.setTempFromController(data[c.controllerStatusPacketFields.POOL_TEMP],data[c.controllerStatusPacketFields.SPA_TEMP],data[c.controllerStatusPacketFields.AIR_TEMP],data[c.controllerStatusPacketFields.SOLAR_TEMP], (data[c.controllerStatusPacketFields.UOM] & 8) >> 3)

                  //TODO: Figure out what this heat mode string does...
                  var status = {}
                  status.poolHeatMode2 = c.heatModeStr[data[c.controllerStatusPacketFields.UNKNOWN] & 3]; //mask the data[6] with 0011
                  status.spaHeatMode2 = c.heatModeStr[(data[c.controllerStatusPacketFields.UNKNOWN] & 12) >> 2]; //mask the data[6] with 1100 and shift right two places

                                                              //mask the data[6] with 0011                            shift right two places for 1100 mask (11xx-->11)
                  container.heat.setHeatModeFromController(data[c.controllerStatusPacketFields.HEATER_MODE]&3, data[c.controllerStatusPacketFields.HEATER_MODE] >> 2)
                  container.valve.setValve(data)

                  status.runmode = c.strRunMode[data[c.controllerStatusPacketFields.UOM] & 129]; // more here?
                  container.UOM.setUOM(data[c.controllerStatusPacketFields.UOM] & 4)



                  container.heat.setHeatActiveFromController(data[c.controllerStatusPacketFields.HEATER_ACTIVE])
                  container.circuit.assignCircuitStatusFromControllerStatus(data, counter)

                  container.circuit.assignCircuitDelayFromControllerStatus(data[c.controllerStatusPacketFields.DELAY]&63, counter)


              } else {
                  if (container.settings.get('logDuplicateMessages'))
                      logger.debug('Msg# %s   Duplicate broadcast.', counter)
              }

              var decoded = true;
              return decoded

            }


    return {
      process : process
    }



}
