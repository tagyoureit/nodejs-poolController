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

//Get Intellichlor status
module.exports = function(container) {

  /*istanbul ignore next */
  if (container.logModuleLoading)
    container.logger.info('Loading: 217.js')

  function process(data, counter) {


    if (container.settings.get('logMessageDecoding')) {
      var currentAction = container.constants.strControllerActions[data[container.constants.packetFields.ACTION]]

      container.logger.verbose('Msg# %s   Controller packet is a %s packet: %s', counter, currentAction, data)
    }


    return true;
  }


  /*istanbul ignore next */
  if (container.logModuleLoading)
    container.logger.info('Loaded: 217.js')



  return {
    process: process
  }
}
