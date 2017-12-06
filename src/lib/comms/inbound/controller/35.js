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
    container.logger.info('Loading: 35.js')

  var pumpOffDuringValveOperation = -1

  function process(data, counter) {
    // 165,33,15,16,35,2,132,0,1,142
    //                   ^^^ 128 = Pump off during valve operation



    if ((data[6] >> 7) !== pumpOffDuringValveOperation || pumpOffDuringValveOperation === -1) {
      pumpOffDuringValveOperation = data[6] >> 7
      if (container.settings.get('logMessageDecoding'))
        container.logger.debug('Msg#: %s  Delay Status packet. pumpOffDuringValveOperation: %s  Full packet: %s', counter, pumpOffDuringValveOperation===1?'on':'off', data);
    } else {
        if (container.settings.get('logMessageDecoding'))
          container.logger.debug('Msg#: %s  Delay Status packet, but something unknown changed.  Full packet: %s', counter, data);

    }


    return true
  }



  /*istanbul ignore next */
  if (container.logModuleLoading)
    container.logger.info('Loaded: 35.js')



  return {
    process: process
  }
}
