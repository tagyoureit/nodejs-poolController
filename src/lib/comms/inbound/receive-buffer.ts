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

import { settings, logger, packetBuffer, decodeHelper, intellitouch } from '../../../etc/internal'
import * as constants from '../../../etc/constants';


var processingBuffer = {
    processingBuffer: false
}
var bufferToProcess: number[] = []
var msgCounter = {
    counter: 0
}

var iterateTimer: NodeJS.Timeout;  // timer to check for new packets
export namespace receiveBuffer
{
    export function getCurrentMsgCounter ()
    {
        return msgCounter.counter
    }

    export function pushBufferToArray ()
    {

        var tempPkt = packetBuffer.pop()
        // if we are in capture packet mode, capture it
        if ( settings.get( 'capturePackets.enable' ) )
        {
            logger.packet( {
                type: 'packet',
                //counter: counter,
                packet: tempPkt.slice(),
                //equipment: packetType,
                direction: 'inbound'
            } )
        }
        // es3 bufferToProcess.push.apply(bufferToProcess, tempPkt)
        bufferToProcess.push( ...tempPkt ) // es6
        //bufferToProcess.push.apply(bufferToProcess, packetBuffer.pop())
        /*         if ( settings.get( 'logMessageDecoding' ) )
                    logger.silly( 'pBTA: bufferToProcess length>0;  bufferArrayOfArrays>0.  CONCAT packetBuffer to BTP' )
         */
    }

    export function iterateOverArrayOfArrays ()
    {

        var chatter = []; //a {potential} message we have found on the bus
        var packetType;
        var preambleStd = [ 255, 165 ];
        var preambleChlorinator = [ 16, 2 ]
        var breakLoop = false
        var logMessageDecoding = settings.get( 'logMessageDecoding' )

        processingBuffer.processingBuffer = true; //we don't want this function to run asynchronously beyond this point or it will start to process the same array multiple times

        pushBufferToArray()

        /* if ( logMessageDecoding )
        {
            logger.silly( 'iOAOA: Packet being analyzed: %s  ******START OF NEW PACKET******', bufferToProcess );
        } */


        while ( bufferToProcess.length > 0 && !breakLoop )
        {
            if ( preambleStd[ 0 ] === bufferToProcess[ 0 ] && preambleStd[ 1 ] === bufferToProcess[ 1 ] ) //match on pump or controller packet
            {

                var chatterlen = bufferToProcess[ 6 ] + 6 + 2; //chatterlen is length of following message not including checksum (need to add 6 for start of chatter, 2 for checksum)
                //   0,   1,      2,      3,    4, 5,        6
                //(255,165,preambleByte,Dest,Src,cmd,chatterlen) and 2 for checksum)

                if ( chatterlen >= 100 ) //we should never get a packet greater than or equal to 50.  So if the chatterlen is greater than that let's shift the array and retry
                {
                    if ( settings.get( 'logMessageDecoding' ) ) logger.silly( 'iOAOA: Will shift first element out of bufferToProcess because it appears there is an invalid length packet (>=100) Length: %s  Packet: %s', bufferToProcess[ 6 ], bufferToProcess )
                    bufferToProcess.shift() //remove the first byte so we look for the next [255,165] in the array.

                } else if ( ( bufferToProcess.length - chatterlen ) <= 0 )
                {
/*                     if ( logMessageDecoding )
                        logger.silly( 'Msg#  n/a   Incomplete message in bufferToProcess. %s', bufferToProcess )
 */                    if ( packetBuffer.length() > 0 )
                    {
                        pushBufferToArray()
                    } else
                    {
/*                         if ( logMessageDecoding ) logger.silly( 'iOAOA: Setting breakLoop=true because (bufferToProcess.length(%s) - chatterlen) <= 0(%s): %s', bufferToProcess.length, chatterlen === undefined || ( ( bufferToProcess.length - chatterlen ), chatterlen === undefined || ( bufferToProcess.length - chatterlen ) <= 0 ) )
 */                        breakLoop = true //do nothing, but exit until we get a second buffer to concat
                    }
                } else
                    if ( chatterlen === undefined || isNaN( chatterlen ) )
                    {
/*                         if ( logMessageDecoding )
                            logger.silly( 'Msg#  n/a   chatterlen NaN: %s.', bufferToProcess )
 */                        if ( packetBuffer.length() > 0 )
                        {
                            pushBufferToArray()
                        } else
                        {
                            // if ( logMessageDecoding ) logger.silly( 'iOAOA: Setting breakLoop=true because isNan(chatterlen) is %s.  bufferToProcess:', chatterlen, bufferToProcess )
                            breakLoop = true //do nothing, but exit until we get a second buffer to concat
                        }
                    } else
                    {
/*                         if ( logMessageDecoding )
                            logger.silly( 'iOAOA: Think we have a packet. bufferToProcess: %s  chatterlen: %s', bufferToProcess, chatterlen )
 */                        msgCounter.counter += 1;
                        bufferToProcess.shift() //remove the 255 byte
                        chatter = bufferToProcess.splice( 0, chatterlen ); //splice modifies the existing buffer.  We remove chatter from the bufferarray.

                        // convert code to support up to 16 pumps
                        //if (((chatter[2] === constants.ctrl.PUMP1 || chatter[2] === constants.ctrl.PUMP2)) || chatter[3] === constants.ctrl.PUMP1 || chatter[3] === constants.ctrl.PUMP2) {
                        if ( ( ( chatter[ 2 ] >= constants.ctrl.PUMP1 && chatter[ 2 ] <= constants.ctrl.PUMP16 ) ) || ( chatter[ 3 ] >= constants.ctrl.PUMP1 && chatter[ 3 ] <= constants.ctrl.PUMP16 ) )
                        {
                            packetType = 'pump'
                            if ( logMessageDecoding )
                                logger.debug( 'Msg# %s  Incoming %s packet: %s', msgCounter.counter, packetType, chatter )
                        } else
                        {
                            packetType = 'controller';
                            intellitouch.setPreambleByte( chatter[ 1 ] ); //we dynamically adjust this based on what the controller is using.  It is also different for the pumps (should always be 0 for pump messages)
                            if ( logMessageDecoding )
                                logger.debug( 'Msg# %s  Incoming %s packet: %s', msgCounter.counter, packetType, chatter )
                        }


                        decodeHelper.processChecksum( chatter, msgCounter.counter, packetType );
                    }
                //breakLoop = true;
            } else if ( preambleChlorinator[ 0 ] === bufferToProcess[ 0 ] && preambleChlorinator[ 1 ] === bufferToProcess[ 1 ] &&
                ( bufferToProcess[ 2 ] === 0 || bufferToProcess[ 2 ] === 80 ) )
            {
                /*Match on chlorinator packet
                 //the ==80 and ==0 is a double check in case a partial packet comes through.
    
                 //example packet:
                 //byte  0  1   2   3  4    5   6  7
                 //len                             8
                 //     16  2  80  20  2  120  16  3*/


                chatter = [];
                var i = 0;
                //Looking for the Chlorinator preamble 16,2
                while ( !( bufferToProcess[ i ] === 16 && bufferToProcess[ i + 1 ] === 3 ) && !breakLoop )
                {
                    //check to make sure we aren't reaching the end of the buffer.
                    if ( ( i + 1 ) === bufferToProcess.length )
                    {
                        //if we get here, kill the buffer because we never get a partial chlorinator packet.
                        bufferToProcess.splice( 0, i )
                        breakLoop = true
                        if ( logMessageDecoding ) logger.silly( 'Aborting chlorinator packet because we reached the end of the buffer.' )
                    } else
                    {
                        packetType = 'chlorinator';
                        chatter.push( bufferToProcess[ i ] );
                        i++;
                        if ( bufferToProcess[ i ] === 16 && bufferToProcess[ i + 1 ] === 3 )
                        {
                            chatter.push( bufferToProcess[ i ] );
                            chatter.push( bufferToProcess[ i + 1 ] );
                            i += 2;
                            msgCounter.counter += 1;
                            if ( logMessageDecoding )
                                logger.debug( 'Msg# %s  Incoming %s packet: %s', msgCounter.counter, packetType, chatter )
                            decodeHelper.processChecksum( chatter, msgCounter.counter, 'chlorinator' );
                            bufferToProcess.splice( 0, i )
                            breakLoop = true;
                        }
                    }

                }

            } else
            { //not a preamble for chlorinator or pump/controller packet.  Eject the first byte.
                bufferToProcess.shift();
            }

        }
        /*         if ( settings.get( 'logMessageDecoding' ) )
                    logger.silly( 'iOAOA: Criteria for recursing/exting.  \nbreakLoop: %s\npacketBuffer.length()(%s) === 0 && bufferToProcess.length(%s) > 0: %s', breakLoop, packetBuffer.length(), bufferToProcess.length, packetBuffer.length() === 0 && bufferToProcess.length > 0 ) */
        if ( breakLoop )
        {
            processingBuffer.processingBuffer = false;
/*             if ( logMessageDecoding )
                logger.silly( 'iOAOA: Exiting because breakLoop: %s', breakLoop )
 */        } else
            if ( bufferToProcess.length > 0 )
            {
/*                 if ( logMessageDecoding )
                    logger.silly( 'iOAOA: Recursing back into iOAOA because no bufferToProcess.length > 0: %s', bufferToProcess.length > 0 )
 */                iterateOverArrayOfArrays()
            } else
                if ( packetBuffer.length() === 0 )
                {
                    processingBuffer.processingBuffer = false;
                    /*                     if ( logMessageDecoding )
                                            logger.silly( 'iOAOA: Exiting out of loop because no further incoming buffers to append. packetBuffer.length() === 0 (%s) ', packetBuffer.length() === 0 )
                     */
                } else
                {
/*                     if ( logMessageDecoding )
                        logger.silly( 'iOAOA: Recursing back into iOAOA because no other conditions met.' )
 */                    iterateOverArrayOfArrays()
                }
    }

    export function isBufferCurrentlyProcessing ()
    {
        return processingBuffer.processingBuffer
    }

    export function resetBufferCurrentlyProcessing ()
    {
        processingBuffer.processingBuffer = false
    }

    export function getBufferToProcessLength ()
    {
        return bufferToProcess.length
    }

    export function clear ()
    {
        bufferToProcess = []
    }

    export function isActive ()
    {
        return processingBuffer.processingBuffer
    }

    export function checkIterate ()
    {
        if ( !processingBuffer.processingBuffer )
        {
            if ( packetBuffer.length() )
            {
                iterateOverArrayOfArrays()
            }
        }
    }


    export function init ()
    {

        if ( iterateTimer )
        {
            clearTimeout( iterateTimer )
            processingBuffer.processingBuffer = false;
        }
        iterateTimer = setInterval( checkIterate, 20 )
        // if (!spemitter) {
        //     spemitter = sp.getEmitter()
        //     spemitter.on('iterate', function () {
        //         iterateOverArrayOfArrays()
        //     })
        // }
    }
}