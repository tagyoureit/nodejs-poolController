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

//Set Intellichlor status
module.exports = function(container) {

  /*istanbul ignore next */
  if (container.logModuleLoading)
    container.logger.info('Loading: 40.js')

  function process(data, counter) {
    // Something to do with heat modes...
    // 165,33,16,34,168,10,0,0,0,254,0,0,0,0,0,0,2,168 = manual heat mode off
    // 165,33,16,34,168,10,0,0,0,254,1,0,0,0,0,0,2,169 = manual heat mode on

    var manualHeatMode = data[10]===0?'On':'Off'

    if (container.settings.logMessageDecoding)
      container.logger.debug('Msg#: %s  Settings/Manual heat packet.  Manual Heat %s  Full packet: %s', counter, manualHeatMode , data);


    return true
  }



  /*istanbul ignore next */
  if (container.logModuleLoading)
    container.logger.info('Loaded: 40.js')



  return {
    process: process
  }
}
