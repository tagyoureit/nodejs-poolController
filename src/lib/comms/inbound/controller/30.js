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


  function process(data, counter) {
    // set packet:
    // status packet: 165,33,16,34,158,16,9,9,2,132,1,72,0,0,0,0,0,0,0,0,0,0,2,135
    //                165,33,16,34,158,[circuit1],[circuit2],[circuit3],[circuit4],132,1,72,0,0,0,0,0,0,0,0,0,0,2,135

    var highSpeedCircuits = {
      "1": {},
      "2": {},
      "3": {},
      "4": {}
    }
    highSpeedCircuits[1].number = data[6]
    highSpeedCircuits[1].name = container.circuit.getCircuitName(data[6])
    highSpeedCircuits[1].friendlyName = container.circuit.getFriendlyName(data[6])

    highSpeedCircuits[2].number = data[7]
    highSpeedCircuits[2].name = container.circuit.getCircuitName(data[7])
    highSpeedCircuits[2].friendlyName = container.circuit.getFriendlyName(data[7])

    highSpeedCircuits[3].number = data[8]
    highSpeedCircuits[3].name = container.circuit.getCircuitName(data[8])
    highSpeedCircuits[3].friendlyName = container.circuit.getFriendlyName(data[8])

    highSpeedCircuits[4].number = data[9]
    highSpeedCircuits[4].name = container.circuit.getCircuitName(data[9])
    highSpeedCircuits[4].friendlyName = container.circuit.getFriendlyName(data[9])



    if (container.settings.get('logMessageDecoding'))
      container.logger.debug('Msg#: %s  High speed circuits.  %s  Full packet: %s', counter, JSON.stringify(highSpeedCircuits, null, 2), data);

    return true
  }



  /*istanbul ignore next */
  if (container.logModuleLoading)
    container.logger.info('Loaded: 30.js')



  return {
    process: process
  }
}
