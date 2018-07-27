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

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: decode.js')

    var emitter = new container.events.EventEmitter();


    var countChecksumMismatch = {
        "counter": 0
    }; //variable to count checksum mismatches


    var successfulAck = function(chatter, counter, messageAck) {

        //TODO: There is nothing to do with mesageAck===0 currently.  We only care about matching if we have written something, so we'll account for this in the writePacket() function
        if (container.settings.get('logMessageDecoding') || container.settings.get('logPacketWrites')) {
            container.logger.debug('Msg# %s  Msg received: %s \n                           Msg written: %s \n                           Match?: %s', counter, chatter, container.queuePacket.first(), messageAck?'true':false)
        }
        if (messageAck === 1) {
            if (container.settings.get('logPacketWrites')) {
                container.logger.debug('successfulAck: Incoming packet is a match. \nRemoving packet %s from queuePacketsArr and resetting msgWriteCounter variables', container.queuePacket.first())
            }
            container.writePacket.ejectPacketAndReset()
        }
    }

    var checksum = function(chatterdata, counter, packetType) {
        //make a copy so when we callback the decode method it isn't changing our log output in Winston
        if (container.settings.get('logMessageDecoding')) container.logger.silly("Msg# %s   Making sure we have a valid %s packet (matching checksum to actual packet): %s", counter, packetType, JSON.stringify(chatterdata));

        var chatterCopy = chatterdata.slice(0);
        var len = chatterCopy.length;


        var chatterdatachecksum;
        var databytes = 0;
        if (packetType === 'chlorinator') {

            chatterdatachecksum = chatterCopy[len - 3];
            for (var i = 0; i < len - 3; i++) {
                databytes += chatterCopy[i];
            }
            databytes %= 256; //Mod 256 because there is only the lower checksum byte.  No higher (256*x) byte.
        } else {
            //checksum is calculated by 256*2nd to last bit + last bit
            chatterdatachecksum = (chatterCopy[len - 2] * 256) + chatterCopy[len - 1];


            // add up the data in the payload
            for (var j = 0; j < len - 2; j++) {
                databytes += chatterCopy[j];
            }
        }

        var validChatter = (chatterdatachecksum === databytes);
        if (!validChatter) {
            (countChecksumMismatch.counter) ++
            if (container.settings.get('logMessageDecoding')) {
                // if (countChecksumMismatch.counter === 1) {
                //     container.logger.silly('Msg# %s  Always get a first mismatch when opening the port.  Ignoring.', counter)
                // } else {
                    container.logger.silly('Msg# %s   Packet collision on bus detected. (Count of collissions: %s)', counter, countChecksumMismatch.counter)
                    container.logger.verbose('Msg# %s   Mismatch #%s on checksum:   %s!=%s   %s', counter, countChecksumMismatch.counter, chatterdatachecksum, databytes, chatterCopy);

                // }
            }

        } else {
            if (container.settings.get('logMessageDecoding')) container.logger.silly('Msg# %s   Match on Checksum:    %s==%s   %s', counter, chatterdatachecksum, databytes, chatterCopy)
        }


        return validChatter

    }

    var isResponsePump = function(chatter, counter) {

        var tempObj = container.queuePacket.first().slice(3);
        var tempDest = tempObj[2];
        tempObj[2] = tempObj[3];
        tempObj[3] = tempDest;
        if (container.settings.get('logMessageDecoding')) container.logger.silly('Msg# %s  Comparing pump message for match: \n                                      Sent: %s  Received: %s \n                                      Method 1 - Swap bytes: sent (%s) to received (%s): %s \n                                      Method 2 or 3 - ACK or Status: %s to %s: %s ', counter, container.queuePacket.first(), chatter, tempObj, chatter, tempObj.equals(chatter), container.queuePacket.first()[7], chatter[container.constants.packetFields.ACTION], container.queuePacket.first()[7] === 1 && chatter[container.constants.packetFields.ACTION] === 1)

        if (tempObj.equals(chatter)) //Scenario 1, pump messages are mimics of each other but the dest/src are swapped
        {
            return (true);

        } else
        //For pump response to set program 1 to 800 RPM
        //                                               0 1  2   3  4  5  6  7 8 9 10 11 12 13 14
        //    17:29:44.943 DEBUG Msg# 8  Msg received: 165,0,16, 96, 1, 2, 3,32,1,59
        //                      Msg written:           255,0,255,165,0,96,16, 1,4,3,39, 3,32, 1,103
        if (container.queuePacket.first()[7] === 1 && chatter[container.constants.packetFields.ACTION] === 1) //Any commands with <01> are 4 bytes.  The responses are 2 bytes (after the length).  The 3rd/4th byte of the request seem to match the 1st/2nd bytes of the response.
        {
            if (container.queuePacket.first()[11] === chatter[6] && container.queuePacket.first()[12] === chatter[7]) {
                return (true);
            } else {
                return (false)
            }

        }
        //165,0,16,96,7,15,4,0,0,0,0,0,0,0,0,0,0,0,0,17,31,1,95
        //                                                    0 1  2  3   4  5  6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22
        //17:29:41.589 DEBUG Msg# 4  Msg received:          165,0,16, 96, 7,15, 4,0,0,0, 0, 0, 0, 0, 0, 0, 0, 0, 0,17,31, 1,95
        //                           Msg written:           255,0,255,165,0,96,16,7,0,1,28
        else if ((container.queuePacket.first()[7] === 7 && chatter[container.constants.packetFields.ACTION] === 7)) //Scenario 3.  Request for pump status.
        {
            return (true)
        } else //no match
        {
            return (false)
        }

    }

    var isResponseChlorinator = function(chatter) {
        /* CHECK FOR RESPONSES
         0=>1
         17=>18
         21=>18
         20=>3*/
        if (chatter[chatter.length - 2] === 16 && chatter[chatter.length - 1] === 3)
        //quick double check here to make sure last two bytes of packet we are matching is 16,3
        {
            if ((container.queuePacket.first()[3] === 0 && chatter[3] === 1) ||
                (container.queuePacket.first()[3] === 17 && chatter[3] === 18) ||
                (container.queuePacket.first()[3] === 21 && chatter[3] === 18) ||
                (container.queuePacket.first()[3] === 20 && chatter[3] === 3)) {
                return true
            }
        } else {
            return false
        }

    }

    var isResponseController = function(chatter) {
        if (chatter[container.constants.packetFields.ACTION] === 1 && chatter[6] === container.queuePacket.first()[7])
        //if an ACK
        {
            return (true)
        }
        //If a broadcast response to request 202 --> 10
        else if ((chatter[container.constants.packetFields.ACTION] === (container.queuePacket.first()[7] & 63))) {
            /*this works because:
            There appears to be a relationship between the various Status, Get, and Set messages. It may be that the low order bits designate the type of message and the high order bits control whether or not you are requesting the current status or setting the current values. For example the Date/Time message is type 5(00000101). To request the Date/Time you would set the top two bits resulting in a type of 197(11000101). To set the Date/Time you would set only the topmost bit resulting in a type of 133(10000101). The same seems to apply to many of the other message types.

            see https://github.com/tagyoureit/nodejs-poolController/wiki/Broadcast
            */

            //the following will additionally check if the custom name (10), circuit (11), or schedule (17) ID match.
            //without this, a request for schedule 1 would match a response for schedule 3 (for example)
            //                             0  1   2   3  4  5   6   7  8  9 10  11
            //example request username:  255  0 255 165  x 16  34 202  1  0  1 181
            //example response           165  x  15  16 10 12   0  85 83 69 82  78 65  77 69 45 48 49 3 219
            if (chatter[container.constants.packetFields.ACTION] === 10 || chatter[container.constants.packetFields.ACTION] === 11 || chatter[container.constants.packetFields.ACTION] === 17) {
                if ((chatter[6]) === container.queuePacket.first()[9]) {
                    return true
                }
                return false
            }

            return true
        }
        //Request for Get configuration (252); Response is Send configuration (253)
        else if (chatter[container.constants.packetFields.ACTION] === 252 && (container.queuePacket.first()[7]) === 253) {
            return true
        }

    }


    //isResponse: function(chatter, counter, packetType, logMessageDecoding, queuePacketsArr)
    var isResponse = function(chatter, counter, packetType) {

        if (container.settings.get('logMessageDecoding')) container.logger.silly('Msg# %s  Checking to see if inbound message matches previously sent outbound message (isResponse function): %s ', counter, chatter, packetType)


        //For Broadcast Packets
        //Ex set circuit name[255,0,255,165, 10, 16, 32, 139, 5, 7, 0, 7, 0, 0, 1,125]
        //Ex ACK circuit name[255,0,255,165, 10, 15, 16,  10,12, 0,85,83,69,82,78, 65,77,69,45,48,49]


        if (container.settings.get('logMessageDecoding')) container.logger.silly('   isResponse:  Msg#: %s  chatterreceived.action: %s (10?) === queue[0].action&63: %s ALL TRUE?  %s \n\n', counter, chatter[container.constants.packetFields.ACTION], ((container.queuePacket.first()[7]) & 63), ((chatter[container.constants.packetFields.ACTION] === (container.queuePacket.first()[7] & 63))))

        if (packetType === 'pump') {
            return isResponsePump(chatter, counter)
        } else
        if (packetType === 'chlorinator') {
            return isResponseChlorinator(chatter)
        } else

        if (packetType === 'controller') {
            return isResponseController(chatter)
        } else //if we get here, no match
        {
            container.logger.error('Msg# %s  No match on response.  How did we get here? %s', counter, chatter)
            return false
        }

    }

    var decode = function(data, counter, packetType) {
        var decoded = false;
        var searchMatch = true;
        //when searchMode (from socket.io) is in 'start' status, any matching packets will be set to the browser at http://machine.ip:3000/debug.html
        if (container.apiSearch.searchMode === 'start') {
            if (container.apiSearch.searchAction !== -1) {
                if (container.apiSearch.searchAction !== data[container.constants.packetFields.ACTION]) {
                    searchMatch = false
                }
            }
            if (container.apiSearch.searchSrc !== -1) {
                if (container.apiSearch.searchSrc !== data[container.constants.packetFields.FROM]) {
                    searchMatch=false
                }
            }
            if (container.apiSearch.searchDest !==-1) {
                if (container.apiSearch.searchDest !== data[container.constants.packetFields.DEST]) {
                    searchMatch = false
                }
            }
            if (searchMatch===true){
                var resultStr = 'Msg#: ' + counter + ' Data: ' + JSON.stringify(data)
                container.io.emitToClients('searchResults',
                    resultStr
                )
            }
        }

        container.intellitouch.checkIfNeedControllerConfiguration()

        if (container.settings.get('logMessageDecoding'))
            container.logger.silly('Msg# %s  TYPE %s,  packet %s', counter, packetType, data)

        //Start Controller Decode

        if (packetType === 'controller') {
            decoded = container.processController.processControllerPacket(data, counter)
            emitter.emit('controllerpacket', data, counter)
        }

        //Start Pump Decode
        else if (packetType === 'pump') {

            decoded = container.processPump.processPumpPacket(data, counter)
            emitter.emit('pumppacket', data, counter)
        }
        //Start Chlorinator Decode
        else if (packetType === 'chlorinator') {
            decoded = container.processChlorinator.processChlorinatorPacket(data, counter)
            emitter.emit('chlorinatorpacket', data, counter)
        }

        if (!decoded) {
            if (container.settings.get('logConsoleNotDecoded')) {
                container.logger.info('Msg# %s is NOT DECODED %s', counter, JSON.stringify(data));
            }
            emitter.emit('notdecodedpacket', data, counter)
        } else {

            decoded = false
        }
        //return true; //fix this; turn into callback(?)  What do we want to do with it?

    }

    var processChecksum = function(chatter, counter, packetType) {
        //call new function to process message; if it isn't valid, we noted above so just don't continue
        //TODO: countChecksumMismatch is not incrementing properly
        if (checksum(chatter, counter, packetType)) {
            if (container.queuePacket.getQueuePacketsArrLength() > 0) {
                if (isResponse(chatter, counter, packetType)) {

                    successfulAck(chatter, counter, 1);
                } else {
                    successfulAck(chatter, counter, 0);
                }
            }
            decode(chatter, counter, packetType)


            // } else {
            //     //TODO: we shouldn't need to increment the countChecksumMismatch.  Why is it not being increased with decodeHelper.checksum above?
            //     //countChecksumMismatch.counter ++
            //
            // }
        }
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: decode.js')


    return {
        processChecksum: processChecksum,
        checksum: checksum,
        emitter: emitter

    }


}





//module.exports = new Decode();
