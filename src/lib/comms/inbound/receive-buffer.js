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

    /*istanbul ignore next */
    if (container.logModuleLoading)
        logger.info('Loading: receive-buffer.js')
    var processingBuffer = {
        processingBuffer: false
    }
    var bufferToProcess = []
    var msgCounter = {
        counter: 0
    }


    function getCurrentMsgCounter() {
        return msgCounter.counter
    }

    var pushBufferToArray = function() {

        bufferToProcess.push.apply(bufferToProcess, container.packetBuffer.pop())
        if (s.logMessageDecoding)
            logger.silly('pBTA: bufferToProcess length>0;  bufferArrayOfArrays>0.  CONCAT AoA to BTP')


    }

    var iterateOverArrayOfArrays = function() {

        var chatter = []; //a {potential} message we have found on the bus
        var packetType;
        var preambleStd = [255, 165];
        var preambleChlorinator = [16, 2]
        var breakLoop = false

        processingBuffer.processingBuffer = true; //we don't want this function to run asynchronously beyond this point or it will start to process the same array multiple times

        pushBufferToArray()

        if (s.logMessageDecoding) {
            if (container.settings.logLevel === 'debug')
                console.log('\n\n')
            logger.debug('iOAOA: Packet being analyzed: %s', bufferToProcess);
        }


        while (bufferToProcess.length > 0 && !breakLoop) {
            if (preambleStd[0] === bufferToProcess[0] && preambleStd[1] === bufferToProcess[1]) //match on pump or controller packet
            {

                var chatterlen = bufferToProcess[6] + 6 + 2; //chatterlen is length of following message not including checksum (need to add 6 for start of chatter, 2 for checksum)
                //   0,   1,      2,      3,    4, 5,        6
                //(255,165,preambleByte,Dest,Src,cmd,chatterlen) and 2 for checksum)

                if (chatterlen >= 50) //we should never get a packet greater than or equal to 50.  So if the chatterlen is greater than that let's shift the array and retry
                {
                    if (s.logMessageDecoding) logger.debug('iOAOA: Will shift first element out of bufferToProcess because it appears there is an invalid length packet (>=50) Lengeth: %s  Packet: %s', bufferToProcess[6], bufferToProcess)
                    bufferToProcess.shift() //remove the first byte so we look for the next [255,165] in the array.

                } else if ((bufferToProcess.length - chatterlen) <= 0) {
                    if (s.logMessageDecoding)
                        logger.silly('Msg#  n/a   Incomplete message in bufferToProcess. %s', bufferToProcess)
                    if (container.packetBuffer.length > 0) {
                        pushBufferToArray()
                    } else {
                        if (s.logMessageDecoding) logger.silly('iOAOA: Setting breakLoop=true because (bufferToProcess.length(%s) - chatterlen) <= 0(%s): %s', bufferToProcess.length, chatterlen === undefined || ((bufferToProcess.length - chatterlen), chatterlen === undefined || (bufferToProcess.length - chatterlen) <= 0))
                        breakLoop = true //do nothing, but exit until we get a second buffer to concat
                    }
                } else
                if (chatterlen === undefined || isNaN(chatterlen)) {
                    if (s.logMessageDecoding)
                        logger.silly('Msg#  n/a   chatterlen NaN: %s.', bufferToProcess)
                    if (container.packetBuffer.length > 0) {
                        pushBufferToArray()
                    } else {
                        if (s.logMessageDecoding) logger.silly('iOAOA: Setting breakLoop=true because isNan(chatterlen) is %s.  bufferToProcess:', chatterlen, bufferToProcess)
                        breakLoop = true //do nothing, but exit until we get a second buffer to concat
                    }
                } else {
                    if (s.logMessageDecoding)
                        logger.silly('iOAOA: Think we have a packet. bufferToProcess: %s  chatterlen: %s', bufferToProcess, chatterlen)
                    msgCounter.counter += 1;
                    bufferToProcess.shift() //remove the 255 byte
                    chatter = bufferToProcess.splice(0, chatterlen); //splice modifies the existing buffer.  We remove chatter from the bufferarray.

                    if (((chatter[2] === container.constants.ctrl.PUMP1 || chatter[2] === container.constants.ctrl.PUMP2)) || chatter[3] === container.constants.ctrl.PUMP1 || chatter[3] === container.constants.ctrl.PUMP2) {
                        packetType = 'pump'
                    } else {
                        packetType = 'controller';
                        container.intellitouch.setPreambleByte(chatter[1]); //we dynamically adjust this based on what the controller is using.  It is also different for the pumps (should always be 0 for pump messages)
                    }
                    if (s.logMessageDecoding)
                        logger.debug('Msg# %s  Found incoming %s packet: %s', msgCounter.counter, packetType, chatter)

                    container.decodeHelper.processChecksum(chatter, msgCounter.counter, packetType);
                }
                //breakLoop = true;
            } else if (preambleChlorinator[0] === bufferToProcess[0] && preambleChlorinator[1] === bufferToProcess[1] &&
                (bufferToProcess[2] === 0 || bufferToProcess[2] === 80)) {
                /*Match on chlorinator packet
                 //the ==80 and ==0 is a double check in case a partial packet comes through.

                 //example packet:
                 //byte  0  1   2   3  4    5   6  7
                 //len                             8
                 //     16  2  80  20  2  120  16  3*/


                chatter = [];
                var i = 0;
                //Looking for the Chlorinator preamble 16,2
                while (!(bufferToProcess[i] === 16 && bufferToProcess[i + 1] === 3) && !breakLoop) {
                    //check to make sure we aren't reaching the end of the buffer.
                    if ((i + 1) === bufferToProcess.length) {
                        //if we get here, kill the buffer because we never get a partial chlorinator packet.
                        bufferToProcess.splice(0, i)
                        breakLoop = true
                        if (s.logMessageDecoding) logger.silly('Aborting chlorinator packet because we reached the end of the buffer.')
                    } else {
                        packetType = 'chlorinator';
                        chatter.push(bufferToProcess[i]);
                        i++;
                        if (bufferToProcess[i] === 16 && bufferToProcess[i + 1] === 3) {
                            chatter.push(bufferToProcess[i]);
                            chatter.push(bufferToProcess[i + 1]);
                            i += 2;
                            msgCounter.counter += 1;
                            if (s.logMessageDecoding)
                                logger.debug('Msg# %s  Found incoming %s packet: %s', msgCounter.counter, packetType, chatter)
                            container.decodeHelper.processChecksum(chatter, msgCounter.counter, 'chlorinator');
                            bufferToProcess.splice(0, i)
                            breakLoop = true;
                        }
                    }

                }

            } else { //not a preamble for chlorinator or pump/controller packet.  Eject the first byte.
                bufferToProcess.shift();
            }

        }

        logger.silly('iOAOA: Criteria for recursing/exting.  \nbreakLoop: %s\ncontainer.packetBuffer.length()(%s) === 0 && bufferToProcess.length(%s) > 0: %s', breakLoop, container.packetBuffer.length(), bufferToProcess.length, container.packetBuffer.length() === 0 && bufferToProcess.length > 0)
        if (breakLoop) {
            processingBuffer.processingBuffer = false;
            if (s.logMessageDecoding)
                logger.silly('iOAOA: Exiting because breakLoop: %s', breakLoop)
        } else
        if (bufferToProcess.length > 0) {
            if (s.logMessageDecoding)
                logger.silly('iOAOA: Recursing back into iOAOA because no bufferToProcess.length > 0: %s', bufferToProcess.length > 0)
            iterateOverArrayOfArrays()
        } else
        if (container.packetBuffer.length() === 0) {
            processingBuffer.processingBuffer = false;
            if (s.logMessageDecoding)
                logger.silly('iOAOA: Exiting out of loop because no further incoming buffers to append. container.packetBuffer.length() === 0 (%s) ', container.packetBuffer.length() === 0)

        } else {
            if (s.logMessageDecoding)
                logger.silly('iOAOA: Recursing back into iOAOA because no other conditions met.')
            iterateOverArrayOfArrays()
        }
    }

    var getProcessingBuffer=function() {
        return processingBuffer.processingBuffer
    }

    var getBufferToProcessLength = function() {
        return bufferToProcess.length
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        logger.info('Loaded: receive-buffer.js')


    return {
        //processingBuffer, //flag to tell us if we are processing the buffer currently
        getProcessingBuffer: getProcessingBuffer,

        //bufferToProcess,
        getBufferToProcessLength: getBufferToProcessLength,
        iterateOverArrayOfArrays: iterateOverArrayOfArrays,
        getCurrentMsgCounter: getCurrentMsgCounter
    }
}
