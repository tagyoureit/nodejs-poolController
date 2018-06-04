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
    container.logger.info('Loading: 29.js')


  function process(data, counter) {
    // set packet: 165,33,16,34,157,6,0,0,5,255,255,255,4,157
    // status packet: 165,33,15,16,29,24,2,0,0,0,128,13,255,255,255,0,11,5,18,13,5,6,7,8,9,10,14,7,14,5,5,42
    //165,33,15,16,29,24,2,0,0,0,[Solar A?],[Solar B Circuit],255,255,255,0,11,5,18,13,5,6,7,8,9,10,14,7,14,5,5,42

    var valveBName = container.circuit.getCircuitName(data[11])
    var valveBFriendlyName = container.circuit.getFriendlyName(data[11])


    if (container.settings.get('logMessageDecoding'))
      container.logger.debug('Msg#: %s  Valve status.  Valve B --> %s (%s)  Full packet: %s', counter, valveBFriendlyName, valveBName, data);

    return true
  }



  /*istanbul ignore next */
  if (container.logModuleLoading)
    container.logger.info('Loaded: 29.js')



  return {
    process: process
  }
}
