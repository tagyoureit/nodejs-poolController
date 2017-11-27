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
    var logger = container.logger
    var s = container.settings


    var bufferArrayOfArrays = container.dequeue;
    //var bufferArrayOfArrays =  new Dequeue()

    function push(packet){
      var packetArr = packet.toJSON().data
      bufferArrayOfArrays.push(packetArr);

      if (!container.receiveBuffer.getProcessingBuffer()) {
          //console.log('Arrays being passed for processing: \n[[%s]]\n\n', testbufferArrayOfArrays.join('],\n['))
          container.receiveBuffer.iterateOverArrayOfArrays()
              //testbufferArrayOfArrays=[]
      }
      container.sp.resetConnectionTimer()
    }

    function pop(){
      return bufferArrayOfArrays.shift()
    }

    function length() {
      return bufferArrayOfArrays.length
    }

return{
    push : push,
    pop : pop,
    length : length }
}
