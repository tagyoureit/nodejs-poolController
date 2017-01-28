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
    if (container.logModuleLoading)
        logger.info('Loading: write-packet.js')

    var writeQueueActive = {
            writeQueueActive: false
        } //flag to tell us if we are currently processing the write queue or note
    var msgWriteCounter = {
        counter: 0, //how many times the packet has been written to the bus
        packetWrittenAt: 0, //var to hold the message counter variable when the message was sent.  Used to keep track of how many messages passed without a successful counter.
        msgWrote: []
    }; //How many times are we writing the same packet to the bus?
    var skipPacketWrittenCount = {
            skipPacketWrittenCount: 0
        } //keep track of how many times we skipped writing the packet
    var writePacketTimer = container.nanoTimer

    preWritePacketHelper = function() {
        if (container.queuePacket.getQueuePacketsArrLength() === 0) // need this because the correct packet might come back during the container.timers.writePacketTimer.timeout.
        {
            if (container.settings.logPacketWrites) logger.silly('preWritePacketHelper: Setting writeQueueActive=false because last message was successfully received and there is no message to send. %s')
            writeQueueActive.writeQueueActive = false
        } else {
            //msgWriteCounter===0;  this means no packet has been written yet (queuePacketsArr.shift() was called and msgWriteCounter reset)
            if (msgWriteCounter.counter === 0) {
                if (container.settings.logPacketWrites) logger.silly('preWritePacketHelper: Ok to write message %s because it has not been written yet', container.queuePacket.first())
                skipPacketWrittenCount.skipPacketWrittenCount = 0
                writePacket()
            } else if (skipPacketWrittenCount.skipPacketWrittenCount === 2) {
                if (container.settings.logPacketWrites) logger.silly('preWritePacketHelper: Ok to write message %s because it has been skipped twice', container.queuePacket.first())
                skipPacketWrittenCount.skipPacketWrittenCount = 0
                writePacket()
            }
            //if we have not processed more than 4 messages, let's delay again.  However, if we do this twice, then skipPacketWrittenCount >= 2 will be processed and we will write the message no matter what
            else if (container.receiveBuffer.getCurrentMsgCounter() - msgWriteCounter.packetWrittenAt <= 4) {
                if (container.settings.logPacketWrites) logger.silly('preWritePacketHelper: Skipping write packet %s time(s) because we have not processed four incoming messages since the last write. Packet: %s', skipPacketWrittenCount.skipPacketWrittenCount, container.queuePacket.first())
                skipPacketWrittenCount.skipPacketWrittenCount++
                    writePacketTimer.setTimeout(container.writePacket.preWritePacketHelper, '', '150m')
            }
            //if the incoming buffer (bufferArrayOfArrays)>=2
            //OR
            //part of buffer current processing (bufferToProcess)>=50 bytes, let's skip writing the packet twice
            else if (container.packetBuffer.length() >= 2 || container.receiveBuffer.getBufferToProcessLength() >= 50) {
                //skipPacketWrittenCount>=2;  we've skipped writting it twice already, so write it now.
                skipPacketWrittenCount.skipPacketWrittenCount++
                    if (container.settings.logPacketWrites) logger.silly('preWritePacketHelper: Skipping write packet %s time(s) due to \n1. bufferArrayOfArrays.length>=2: %s (%s) \n2. bufferToProcess.length>=50:  %s (%s)', skipPacketWrittenCount.skipPacketWrittenCount, container.packetBuffer.length() >= 2, container.packetBuffer.length(), container.receiveBuffer.getBufferToProcessLength() >= 50, container.receiveBuffer.getBufferToProcessLength())
                writePacketTimer.setTimeout(container.writePacket.preWritePacketHelper, '', '150m')
            } else
            //if none of the conditions above are met, let's write the packet
            {
                if (container.settings.logPacketWrites) logger.silly('preWritePacketHelper: Ok to write message %s because no other conditions have been met', container.queuePacket.first())
                skipPacketWrittenCount.skipPacketWrittenCount = 0
                writePacket()
            }
        }
    }


    writePacket = function() {
        if (container.settings.logPacketWrites) logger.silly('writePacket: Entering writePacket() to write: %s\nFull queue: [[%s]]', container.queuePacket.first(), (container.queuePacket.entireQueue()).join('],\n['))

        writeQueueActive.writeQueueActive = true
        if (container.settings.netConnect === 0) {
            container.sp.sp.write(container.queuePacket.first(), function(err) {
                if (err) {
                    logger.error('Error writing packet (%s): %s',container.queuePacket.first(),  err.message)
                } else {
                    //if (container.settings.logPacketWrites) logger.silly('Packet written: ', queuePacketsArr[0])
                    postWritePacketHelper()
                }
            })
        } else {
            container.sp.sp.write(new Buffer(container.queuePacket.first()), 'binary', function(err) {
                if (err) {
                    logger.error('Error writing packet (%s): %s',container.queuePacket.first(),  err.message)
                } else {
                    //if (container.settings.logPacketWrites) logger.silly('Packet written: ', queuePacketsArr[0])
                    postWritePacketHelper()
                }
            })
        }


    }

    postWritePacketHelper = function() {

        if (msgWriteCounter.counter === 0) {
            //if we are here because we wrote a packet, but it is the first time, then the counter will be 0 and we need to set the variables for later comparison
            msgWriteCounter.packetWrittenAt = container.receiveBuffer.getCurrentMsgCounter();
            msgWriteCounter.msgWrote = container.queuePacket.first().slice(0)
            msgWriteCounter.counter++
                if (container.settings.logPacketWrites) logger.debug('postWritePacketHelper: First time writing packet.', msgWriteCounter)
        } else
        if (msgWriteCounter.counter === 5) //if we get to 5 retries, then throw an Error.
        {
            var pktType = container.whichPacket.outbound(container.queuePacket.first())
            if (pktType === 'pump') {
                logger.warn('Error writing pump packet \'%s\' to serial bus.  Tried %s times to write %s', container.constants.strPumpActions[container.queuePacket.first()[container.constants.packetFields.ACTION + 3]], msgWriteCounter.counter, msgWriteCounter.msgWrote)
            }
            //chlorinator
            else if (pktType === 'chlorinator') {
                logger.warn('Error writing chlorinator packet \'%s\' to serial bus.  Tried %s times to write %s', container.constants.strChlorinatorActions[container.queuePacket.first()[3]], msgWriteCounter.counter, msgWriteCounter.msgWrote)

            }
            //controller packet
            else {
                logger.warn('Error writing controller packet \'%s\' to serial bus.  Tried %s times to write %s', container.constants.strControllerActions[container.queuePacket.first()[container.constants.packetFields.ACTION + 3]], msgWriteCounter.counter, msgWriteCounter.msgWrote)

            }

            if (container.settings.logPacketWrites) logger.silly('postWritePacketHelper: msgWriteCounter: ', msgWriteCounter)
            msgWriteCounter.counter++;
        } else
        if (msgWriteCounter.counter === 10) //if we get to 10 retries, then abort this packet.
        {
          var pktType = container.whichPacket.outbound(container.queuePacket.first())
            if (pktType === 'pump') {
                logger.error('Aborting pump packet \'%s\'.  Tried %s times to write %s', container.constants.strPumpActions[container.queuePacket.first()[container.constants.packetFields.ACTION + 3]], msgWriteCounter.counter, msgWriteCounter.msgWrote)

            }
            //chlorinator
            else if (pktType === 'chlorinator') {
                logger.error('Aborting chlorinator packet \'%s\'.  Tried %s times to write %s', container.constants.strChlorinatorActions[container.queuePacket.first()[3]], msgWriteCounter.counter, msgWriteCounter.msgWrote)

            }
            //controller packet
            else {
                logger.error('Aborting controller packet \'%s\'.  Tried %s times to write %s', container.constants.strControllerActions[container.queuePacket.first()[container.constants.packetFields.ACTION + 3]], msgWriteCounter.counter, msgWriteCounter.msgWrote)

            }
            ejectPacketAndReset()
            if (container.settings.logPacketWrites) logger.silly('postWritePacketHelper: Tries===10.  Shifted queuePacketsArr.  \nWrite queue now: %s\nmsgWriteCounter:', container.queuePacket.entireQueue(), msgWriteCounter)
                //let's reconsider if we want to change the logging levels, or just fail silently/gracefully?
                /*if (logLevel == "info" || logLevel == "warn" || logLevel == "error") {
                    logger.warn('Setting logging level to Debug')
                    logLevel = 'debug'
                    logger.transportcontainer.settings.console.level = 'debug';
                }*/
        } else //we should get here between 1-4 packet writes
        {
            msgWriteCounter.counter++;
            if (container.settings.logPacketWrites) logger.debug('postWritePacketHelper: Try %s.  Wrote: %s ', msgWriteCounter.counter, container.queuePacket.first())
        }

        if (container.queuePacket.getQueuePacketsArrLength === 0) {
            if (container.settings.logPacketWrites) logger.debug('postWritePacketHelper: Write queue empty.  writeQueueActive=false')
            writeQueueActive.writeQueueActive = false
        } else {
            if (container.settings.logPacketWrites) logger.debug('writePacketHelper: Setting timeout to write next packet (will call preWritePacketHelper())\n')
            writePacketTimer.setTimeout(preWritePacketHelper, '', '175m')

        }
    }


    ejectPacketAndReset = function() {
        container.queuePacket.eject()
        msgWriteCounter.counter = 0
        msgWriteCounter.msgWrote = []
        msgWriteCounter.packetWrittenAt = 0
    }




    function isWriteQueueActive() {
        return writeQueueActive.writeQueueActive
    }

    if (container.logModuleLoading)
        logger.info('Loaded: write-packet.js')



    return {
        isWriteQueueActive: isWriteQueueActive,
        preWritePacketHelper: preWritePacketHelper,
        ejectPacketAndReset: ejectPacketAndReset
    }


}
