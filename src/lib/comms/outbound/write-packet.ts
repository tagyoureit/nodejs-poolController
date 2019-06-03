//  nodejs-poolController.  An application to control pool equipment.
//  Copyright (C) 2016, 2017, 2018, 2019.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU Affero General Public License as
//  published by the Free Software Foundation, either version 3 of the
//  License, or (at your option) any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU Affero General Public License for more details.
//
//  You should have received a copy of the GNU Affero General Public License
//  along with this program.  If not, see <http://www.gnu.org/licenses/>.

import { settings, logger, sp, queuePacket, receiveBuffer, whichPacket, packetBuffer } from '../../../etc/internal'
import * as constants from '../../../etc/constants';
export namespace writePacket
{
    var writeQueueActive = {
        writeQueueActive: false
    } //flag to tell us if we are currently processing the write queue or note

    var msgWrote: number[] = []
    var msgWriteCounter = {
        counter: 0, //how many times the packet has been written to the bus
        packetWrittenAt: 0, //var to hold the message counter variable when the message was sent.  Used to keep track of how many messages passed without a successful counter.
        msgWrote: msgWrote
    }; //How many times are we writing the same packet to the bus?
    var skipPacketWrittenCount = {
        skipPacketWrittenCount: 0
    } //keep track of how many times we skipped writing the packet
    var writePacketTimer: NodeJS.Timeout // = new nanotimer
    var logPacketWrites = settings.get( 'logPacketWrites' )


    export function init ()
    {
        if ( settings.get( 'logPacketWrites' ) ) logger.silly( 'Init writePacket and flushing any existing packets.' )
        if ( writePacketTimer !== null )
            clearTimeout( writePacketTimer )

        // reset write queue
        writeQueueActive = {
            writeQueueActive: false
        }
        msgWriteCounter = {
            counter: 0, //how many times the packet has been written to the bus
            packetWrittenAt: 0, //var to hold the message counter variable when the message was sent.  Used to keep track of how many messages passed without a successful counter.
            msgWrote: []
        }
        skipPacketWrittenCount = {
            skipPacketWrittenCount: 0
        }
    }

    export function ejectPacketAndReset ()
    {
        queuePacket.eject()
        msgWriteCounter.counter = 0
        msgWriteCounter.msgWrote = []
        msgWriteCounter.packetWrittenAt = 0
    }

    export function postWritePacketHelper ()
    {
        var pktType

        if ( msgWriteCounter.counter === 0 )
        {
            //if we are here because we wrote a packet, but it is the first time, then the counter will be 0 and we need to set the variables for later comparison
            msgWriteCounter.packetWrittenAt = receiveBuffer.getCurrentMsgCounter();
            msgWriteCounter.msgWrote = queuePacket.first().slice( 0 )
            msgWriteCounter.counter++
            if ( logPacketWrites ) logger.debug( 'postWritePacketHelper: First time writing packet.', msgWriteCounter )
        } else
            if ( msgWriteCounter.counter === 5 ) //if we get to 5 retries, then throw an Error.
            {
                pktType = whichPacket.outbound( queuePacket.first() )
                if ( pktType === 'pump' )
                {
                    logger.warn( 'Error writing pump packet \'%s\' to serial bus.  Tried %s times to write %s', constants.strPumpActions[ queuePacket.first()[ constants.packetFields.ACTION + 3 ] ], msgWriteCounter.counter, msgWriteCounter.msgWrote )
                }
                //chlorinator
                else if ( pktType === 'chlorinator' )
                {
                    logger.warn( 'Error writing chlorinator packet \'%s\' to serial bus.  Tried %s times to write %s', constants.strChlorinatorActions[ queuePacket.first()[ 3 ] ], msgWriteCounter.counter, msgWriteCounter.msgWrote )

                }
                //controller packet
                else
                {
                    logger.warn( 'Error writing controller packet \'%s\' to serial bus.  Tried %s times to write %s', constants.strControllerActions[ queuePacket.first()[ constants.packetFields.ACTION + 3 ] ], msgWriteCounter.counter, msgWriteCounter.msgWrote )

                }

                if ( logPacketWrites ) logger.silly( 'postWritePacketHelper: msgWriteCounter: ', msgWriteCounter )
                msgWriteCounter.counter++;
            } else
                if ( msgWriteCounter.counter === 10 ) //if we get to 10 retries, then abort this packet.
                {
                    pktType = whichPacket.outbound( queuePacket.first() )
                    if ( pktType === 'pump' )
                    {
                        logger.error( 'Aborting pump packet %s.  Tried %s times to write %s', constants.strPumpActions[ queuePacket.first()[ constants.packetFields.ACTION + 3 ] ], msgWriteCounter.counter, msgWriteCounter.msgWrote )

                    }
                    //chlorinator
                    else if ( pktType === 'chlorinator' )
                    {
                        logger.error( 'Aborting chlorinator packet %s.  Tried %s times to write %s', constants.strChlorinatorActions[ queuePacket.first()[ 3 ] ], msgWriteCounter.counter, msgWriteCounter.msgWrote )
                    }
                    //controller packet
                    else
                    {
                        logger.error( 'Aborting controller packet %s.  Tried %s times to write %s', constants.strControllerActions[ queuePacket.first()[ constants.packetFields.ACTION + 3 ] ], msgWriteCounter.counter, msgWriteCounter.msgWrote )

                    }
                    if ( logPacketWrites ) logger.silly( 'postWritePacketHelper: Tries===%s.  Will eject current packet from the queue.', msgWriteCounter.counter )

                    ejectPacketAndReset()
                    //let's reconsider if we want to change the logging levels, or just fail silently/gracefully?
                    if ( settings.get( 'logLevel' ) === "info" || settings.get( 'logLevel' ) === "warn" || settings.get( 'logLevel' ) === "error" )
                    {
                        var prevLevel = settings.get( 'logLevel' )
                        logger.warn( 'Setting logging level to Debug.  Will revert to previous level in 2 minutes.' )
                        settings.set( 'logLevel', 'debug' )
                        logger.changeLevel( 'debug', 'console' );
                        setTimeout( function ()
                        {
                            logger.warn( 'Setting logging level to %s', prevLevel )
                            settings.set( 'logLevel', prevLevel )
                            logger.changeLevel( prevLevel, 'console' );
                        }, 2 * 60 * 1000 )
                    }
                } else //we should get here between 1-4 packet writes
                {
                    msgWriteCounter.counter++;
                    if ( logPacketWrites ) logger.debug( 'postWritePacketHelper: Try %s.  Wrote: %s ', msgWriteCounter.counter, queuePacket.first() )
                }

        if ( queuePacket.getQueuePacketsArrLength() === 0 )
        {
            if ( settings.get( 'logPacketWrites' ) ) logger.debug( 'postWritePacketHelper: Write queue empty.  writeQueueActive=false' )
            writeQueueActive.writeQueueActive = false
        } else
        {
            if ( logPacketWrites ) logger.debug( 'writePacketHelper: Setting timeout to write next packet (will call preWritePacketHelper())\n' )
            writePacketTimer = setTimeout( preWritePacketHelper, 175 )

        }
    }



    export function preWritePacketHelper ()
    {
        let logPacketWrites = settings.get( 'logPacketWrites' )
        if ( queuePacket.getQueuePacketsArrLength() === 0 ) // need this because the correct packet might come back during the timers.writePacketTimer.timeout.
        {
            if ( logPacketWrites ) logger.silly( 'preWritePacketHelper: Setting writeQueueActive=false because last message was successfully received and there is no message to send. %s' )
            writeQueueActive.writeQueueActive = false
        } else
        {
            //msgWriteCounter===0;  this means no packet has been written yet (queuePacketsArr.shift() was called and msgWriteCounter reset)
            if ( msgWriteCounter.counter === 0 )
            {
                if ( logPacketWrites ) logger.silly( 'preWritePacketHelper: Ok to write message %s because it has not been written yet', queuePacket.first() )
                skipPacketWrittenCount.skipPacketWrittenCount = 0
                writePacket()
            } else if ( skipPacketWrittenCount.skipPacketWrittenCount === 2 )
            {
                if ( logPacketWrites ) logger.silly( 'preWritePacketHelper: Ok to write message %s because it has been skipped twice', queuePacket.first() )
                skipPacketWrittenCount.skipPacketWrittenCount = 0
                writePacket()
            }
            //if we have not processed more than 4 messages, let's delay again.  However, if we do this twice, then skipPacketWrittenCount >= 2 will be processed and we will write the message no matter what
            else if ( receiveBuffer.getCurrentMsgCounter() - msgWriteCounter.packetWrittenAt <= 4 )
            {
                if ( logPacketWrites ) logger.silly( 'preWritePacketHelper: Skipping write packet %s time(s) because we have not processed four incoming messages since the last write. Packet: %s', skipPacketWrittenCount.skipPacketWrittenCount, queuePacket.first() )
                skipPacketWrittenCount.skipPacketWrittenCount++
                writePacketTimer = setTimeout( preWritePacketHelper, 150 )
            }
            //if the incoming buffer (bufferArrayOfArrays)>=2
            //OR
            //part of buffer current processing (bufferToProcess)>=50 bytes, let's skip writing the packet twice
            else if ( packetBuffer.length() >= 2 || receiveBuffer.getBufferToProcessLength() >= 50 )
            {
                //skipPacketWrittenCount>=2;  we've skipped writting it twice already, so write it now.
                skipPacketWrittenCount.skipPacketWrittenCount++
                if ( logPacketWrites ) logger.silly( 'preWritePacketHelper: Skipping write packet %s time(s) due to \n1. bufferArrayOfArrays.length>=2: %s (%s) \n2. bufferToProcess.length>=50:  %s (%s)', skipPacketWrittenCount.skipPacketWrittenCount, packetBuffer.length() >= 2, packetBuffer.length(), receiveBuffer.getBufferToProcessLength() >= 50, receiveBuffer.getBufferToProcessLength() )
                writePacketTimer = setTimeout( preWritePacketHelper, 150 )
            } else
            //if none of the conditions above are met, let's write the packet
            {
                if ( logPacketWrites ) logger.silly( 'preWritePacketHelper: Ok to write message %s because no other conditions have been met', queuePacket.first() )
                skipPacketWrittenCount.skipPacketWrittenCount = 0
                writePacket()
            }
        }
    }


    export function writePacket ()
    {
        if ( logPacketWrites ) logger.silly( 'writePacket: Entering writePacket() to write: %s\nFull queue: [[%s]]', queuePacket.first(), ( queuePacket.entireQueue() ).join( '],\n[' ) )

        writeQueueActive.writeQueueActive = true

        // if we are in capture packet mode, capture it
        if ( settings.get( 'capturePackets.enable' ) )
        {
            logger.packet( {
                type: 'packet',
                packet: queuePacket.first(),
                counter: 0,
                equipment: whichPacket.outbound( queuePacket.first() ),
                direction: 'outbound'
            } )
        }

        if ( settings.get( 'netConnect' ) === 0 )
        {
            sp.writeSP( queuePacket.first(), function ( err: Error )
            {
                if ( err )
                {
                    logger.error( 'Error writing packet (%s).  Ejecting Packet.  Error: %s', queuePacket.first(), err.message )
                    ejectPacketAndReset()
                } else
                {
                    //if (settings.get('logPacketWrites')) logger.silly('Packet written: ', queuePacketsArr[0])
                    postWritePacketHelper()
                    sp.drainSP( function ( err: Error ) { if ( err ) logger.error( 'Error draining serialport buffer. %s', err ) } )
                }
            } )
        } else
        {
            sp.writeNET( new Buffer( queuePacket.first() ), 'binary', function ( err: Error )
            {
                if ( err )
                {
                    logger.error( 'Error writing packet (%s).  Ejecting Packet.  Error: %s', queuePacket.first(), err.message )
                    ejectPacketAndReset()
                } else
                {
                    //if (settings.get('logPacketWrites')) logger.silly('Packet written: ', queuePacketsArr[0])
                    postWritePacketHelper()
                }
            } )
        }


    }

    export function isWriteQueueActive ()
    {
        return writeQueueActive.writeQueueActive
    }
}