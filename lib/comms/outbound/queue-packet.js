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

    if (container.logModuleLoading)
        container.logger.info('Loading: queue-packet.js')


    var logger = container.logger
    var s = container.settings

    var queuePacketsArr = []; //array to hold messages to send



    function queuePacket(message, callback) {
        if (s.logPacketWrites) logger.debug('queuePacket: Adding checksum and validating packet to be written %s', message)

        var response = {}


        var checksum = 0;
        for (var j = 0; j < message.length; j++) {
            checksum += message[j]
        }


        var packet;
        var requestGet = 0;
        if (message[0] === 16 && message[1] === container.constants.ctrl.CHLORINATOR) {
            message.push(checksum)
            message.push(16)
            message.push(3)
            packet = message.slice();
            logger.silly('chrlorinator packet configured as: ', packet)
        } else {
            //Process the packet to include the preamble and checksum

            message.push(checksum >> 8)
            message.push(checksum & 0xFF)
            packet = [255, 0, 255];
            Array.prototype.push.apply(packet, message);

            //if we request to "SET" a variable on the HEAT STATUS
            if (packet[7] === 136 && s.intellitouch) {
                requestGet = 1;
            }
        }

        //-------Internally validate checksum
        var len,
            packetchecksum,
            databytes
        if (message[0] === 16 && message[1] === container.constants.ctrl.CHLORINATOR) //16,2 packet
        {
            //example packet: 16,2,80,0,98,16,3
            len = packet.length;
            //checksum is calculated by 256*2nd to last bit + last bit
            packetchecksum = packet[len - 3];
            databytes = 0;
            // add up the data in the payload
            for (var i = 0; i < len - 3; i++) {
                databytes += packet[i];
            }
        } else //255,0,255,165 packet
        {
            //example packet: 255,0,255,165,10,16,34,2,1,0,0,228
            len = packet.length;
            //checksum is calculated by 256*2nd to last bit + last bit
            packetchecksum = (packet[len - 2] * 256) + packet[len - 1];
            databytes = 0;
            // add up the data in the payload
            for (var i = 3; i < len - 2; i++) {
                databytes += packet[i];
            }
        }

        var validPacket = (packetchecksum === databytes);

        if (!validPacket) {
            logger.error('Asking to queue malformed packet: %s', packet)
            response.text = 'Pump packet queued: ' + packet
            response.status = 'error'
        } else {
            //addPacketToOutboundQueue(packet);
            queuePacketsArr.push(packet)
                //pump packet
            if (packet[container.constants.packetFields.DEST + 3] === 96 || packet[container.constants.packetFields.DEST + 3] === 97) {
                if (s.logPacketWrites) logger.verbose('Just Queued Pump Message \'%s\' to send: %s', container.constants.strPumpActions[packet[container.constants.packetFields.ACTION + 3]], packet)
                response.text = 'Pump packet queued: ' + packet
                response.status = 'ok'
            }
            //chlorinator
            else if (packet[0] === 16) {
                if (s.logPacketWrites) logger.verbose('Just Queued Chlorinator Message \'%s\' to send: %s', container.constants.strChlorinatorActions[packet[3]], packet)
                response.text = 'Chlorinator packet queued: ' + packet
                response.status = 'ok'
            }
            //controller packet
            else {
                if (s.logPacketWrites) logger.verbose('Just Queued Message \'%s\' to send: %s', container.constants.strControllerActions[packet[container.constants.packetFields.ACTION + 3]], packet)
                response.text = 'Controller packet queued: ' + packet
                response.status = 'ok'
            }
        }


        //-------End Internally validate checksum

        if (requestGet) {
            //request the GET version of the SET packet
            var getPacket = [165, container.intellitouch.getPreambleByte(), 16, s.appAddress, packet[container.constants.packetFields.ACTION + 3] + 64, 1, 0]
            if (s.logPacketWrites) logger.debug('Queueing message %s to retrieve \'%s\'', getPacket, container.constants.strControllerActions[getPacket[container.constants.packetFields.ACTION]])
            queuePacket(getPacket);

            //var statusPacket = [165, preambleByte, 16, 34, 194, 1, 0]
            //logger.debug('Queueing messages to retrieve \'%s\'', container.constants.strControllerActions[statusPacket[container.constants.packetFields.ACTION]])
            //queuePacket(statusPacket);
        }
        if (s.logPacketWrites) logger.silly('queuePacket: Message: %s now has checksum added: %s', message, packet)

        //if length > 0 then we will loop through from isResponse
        if (!container.writePacket.isWriteQueueActive())
            container.writePacket.preWritePacketHelper();



        if (callback !== undefined) {
            callback(response)
        }
    }



    function getQueuePacketsArrLength() {
        return queuePacketsArr.length
    }

    function addPacketToOutboundQueue(packet) {
        //queuePacketsArr.push(packet)
    }

    function first() {
        return queuePacketsArr[0]
    }

    function entireQueue() {
        return queuePacketsArr
    }

    function eject() {
        if (queuePacketsArr.length > 0) {
            queuePacketsArr.shift();
        }
    }

    function sendThisPacket(packet, callback) {
        logger.info('User request (REST API) to send packet: %s', packet);
        var preamblePacket;
        packet = packet.split('-');
        for (i = 0; i < packet.length; i++) {
            packet[i] = parseInt(packet[i])
        }
        if (packet[0] === 16 && packet[1] === container.constants.ctrl.CHLORINATOR) {
            logger.silly('packet (chlorinator) detected: ', packet)
        } else {
            if (packet[0] === 96 || packet[0] === 97 || packet[1] === 96 || packet[1] === 97)
            //if a message to the pumps, use 165,0
            {
                preamblePacket = [165, 0]; //255,0,255 will be added later
            } else
            //If a message to the controller, use the preamble that we have recorded
            {
                preamblePacket = [165, container.intellitouch.getPreambleByte()]
            }
            Array.prototype.push.apply(preamblePacket, packet);
            packet = preamblePacket.slice(0);
            logger.silly('packet (pool) detected: ', packet)
        }
        var responseStr;
        queuePacket(packet, function(res) {
            logger.info(res)
            responseStr = res

        });
        //var response = 'Request to send packet ' + packet + ' sent.'
        if (callback !== undefined) {
            callback(responseStr)
        }

    }


    if (container.logModuleLoading)
        logger.info('Loaded: queue-packet.js')



    return {
        queuePacket: queuePacket,
        getQueuePacketsArrLength: getQueuePacketsArrLength,
        addPacketToOutboundQueue: addPacketToOutboundQueue,
        first: first,
        entireQueue: entireQueue,
        eject: eject,
        sendThisPacket: sendThisPacket
    }
}
