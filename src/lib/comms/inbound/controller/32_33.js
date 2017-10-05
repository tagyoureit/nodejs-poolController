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
    container.logger.info('Loading: 32_33.js')

  function process(data, counter) {
    // process Spa-side remotes
    // for is4  [165,33,16,34,32,11,type,button1,button2,button3,button4,5,6,7,8,9,10,chkh,chkl]
    // for is10:[165,33,16,34,32,11,type,button1,button2,button3,button4,btn5,btn1bot,btn2bot,btn3bot,btn4bot,btn5bot,chkh,chkl]
    // for quicktouch:  [165,33,16,34,32,11,type,button1,button2,button3,button4,chkh,chkl]

    var spaside0 = {}
    if (data[4] === 32) { // is4/is10
      if (data[6] === 0) { // just set this first for aesthetic purposes
        spaside0.controllerType = 'is4'
      } else {
        spaside0.controllerType = 'is10'
      }
      spaside0.button1 = container.circuit.getCircuitName(data[7])
      spaside0.button2 = container.circuit.getCircuitName(data[8])
      spaside0.button3 = container.circuit.getCircuitName(data[9])
      spaside0.button4 = container.circuit.getCircuitName(data[10])
      if (spaside0.controllerType === 'is4') {
        //is4 packet has these bytes, but they don't appear to be used
        spaside0.byte5 = 'Not used -- ' + data[11]
        spaside0.byte6 = 'Not used -- ' + data[12]
        spaside0.byte7 = 'Not used -- ' + data[13]
        spaside0.byte8 = 'Not used -- ' + data[14]
        spaside0.byte9 = 'Not used -- ' + data[15]
        spaside0.byte10 = 'Not used -- ' + data[16]
      } else {
        // is10 uses these packets.
        spaside0.button5 = container.circuit.getCircuitName(data[11])
        spaside0.button1bottom = container.circuit.getCircuitName(data[12])
        spaside0.button2bottom = container.circuit.getCircuitName(data[13])
        spaside0.button3bottom = container.circuit.getCircuitName(data[14])
        spaside0.button4bottom = container.circuit.getCircuitName(data[15])
        spaside0.button5bottom = container.circuit.getCircuitName(data[16])
      }
    } else { // quick touch
      spaside0.controllerType = 'QuickTouch'
      spaside0.button1 = container.circuit.getCircuitName(data[6])
      spaside0.button2 = container.circuit.getCircuitName(data[7])
      spaside0.button3 = container.circuit.getCircuitName(data[8])
      spaside0.button4 = container.circuit.getCircuitName(data[9])
    }




    if (container.settings.logMessageDecoding)
    container.logger.debug('Msg#: %s  Spa side controller %s: %s', counter, spaside0.controllerType, JSON.stringify(spaside0, null, 2));

    return true
  }



  /*istanbul ignore next */
  if (container.logModuleLoading)
    container.logger.info('Loaded: 32_33.js')



  return {
    process: process
  }
}
