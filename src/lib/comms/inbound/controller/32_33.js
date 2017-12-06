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

  var spasideRemote = {'is4':{}, 'is10': {}, 'quicktouch': {}}

  function process(data, counter) {
    // process Spa-side remotes
    // for is4  [165,33,16,34,32,11,type,button1,button2,button3,button4,5,6,7,8,9,10,chkh,chkl]
    // for is10:[165,33,16,34,32,11,type,button1,button2,button3,button4,btn5,btn1bot,btn2bot,btn3bot,btn4bot,btn5bot,chkh,chkl]
    // for quicktouch:  [165,33,16,34,32,11,type,button1,button2,button3,button4,chkh,chkl]

    var spaside0 = {}, controllerType;
    if (data[4] === 32) { // is4/is10
      if (data[6] === 0) { // just set this first for aesthetic purposes
        controllerType = 'is4'
      } else {
        controllerType = 'is10'
      }
      spasideRemote[controllerType].button1 = container.circuit.getCircuitName(data[7])
      spasideRemote[controllerType].button2 = container.circuit.getCircuitName(data[8])
      spasideRemote[controllerType].button3 = container.circuit.getCircuitName(data[9])
      spasideRemote[controllerType].button4 = container.circuit.getCircuitName(data[10])
      if (controllerType === 'is4') {
        //is4 packet has these bytes, but they don't appear to be used
        spasideRemote[controllerType].byte5 = 'Not used -- ' + data[11]
        spasideRemote[controllerType].byte6 = 'Not used -- ' + data[12]
        spasideRemote[controllerType].byte7 = 'Not used -- ' + data[13]
        spasideRemote[controllerType].byte8 = 'Not used -- ' + data[14]
        spasideRemote[controllerType].byte9 = 'Not used -- ' + data[15]
        spasideRemote[controllerType].byte10 = 'Not used -- ' + data[16]

      } else {
        // is10 uses these packets.
        spasideRemote[controllerType].button5 = container.circuit.getCircuitName(data[11])
        spasideRemote[controllerType].button1bottom = container.circuit.getCircuitName(data[12])
        spasideRemote[controllerType].button2bottom = container.circuit.getCircuitName(data[13])
        spasideRemote[controllerType].button3bottom = container.circuit.getCircuitName(data[14])
        spasideRemote[controllerType].button4bottom = container.circuit.getCircuitName(data[15])
        spasideRemote[controllerType].button5bottom = container.circuit.getCircuitName(data[16])
      }
    } else { // quick touch
      controllerType = 'quicktouch'
      spasideRemote[controllerType].button1 = container.circuit.getCircuitName(data[6])
      spasideRemote[controllerType].button2 = container.circuit.getCircuitName(data[7])
      spasideRemote[controllerType].button3 = container.circuit.getCircuitName(data[8])
      spasideRemote[controllerType].button4 = container.circuit.getCircuitName(data[9])
    }




    // write out the packet when the 33 message appears.  It always follows the 32/is4 and 32/is10.
    if (container.settings.get('logMessageDecoding') && controllerType === 'quicktouch')
      container.logger.debug('Msg#: %s  All spa side controllers: %s', counter, JSON.stringify(spasideRemote, null, 2));


    return true
  }



  /*istanbul ignore next */
  if (container.logModuleLoading)
    container.logger.info('Loaded: 32_33.js')



  return {
    process: process
  }
}
