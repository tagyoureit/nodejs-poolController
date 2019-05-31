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
/// <reference path="../../../../@types/api.d.ts" />
import { settings, logger, sp, writePacket, packetBuffer, intellitouch } from'../../../etc/internal';
import * as constants from '../../../etc/constants';


var queuePacketsArr: number[][] = []; //array to hold messages to send
export namespace queuePacket
{
    export function init ()
    {
        if ( settings.get( 'logPacketWrites' ) ) logger.silly( 'Resetting queuepackets array and flushing queue' )
        queuePacketsArr = []
    }

    export function queuePacket ( message: number[], callback?: ( func: any ) => void )
    {
        if ( settings.get( 'suppressWrite' ) )
        {
            logger.debug( 'NOT queueing packet %s because of replay feature', message )
        }
        else
        {
            var response: API.Response = {}
            var logPacketWrites = settings.get( 'logPacketWrites' )
            if ( sp.isOpen() )
            {
                if ( logPacketWrites ) logger.debug( 'queuePacket: Adding checksum and validating packet to be written %s', message )


                var checksum = 0;
                for ( var j = 0; j < message.length; j++ )
                {
                    checksum += message[ j ]
                }


                var packet;
                var requestGet = 0;
                if ( message[ 0 ] === 16 && message[ 1 ] === constants.ctrl.CHLORINATOR )
                {
                    message.push( checksum )
                    message.push( 16 )
                    message.push( 3 )
                    packet = message.slice();
                    logger.silly( 'chrlorinator packet configured as: ', packet )
                } else
                {
                    //Process the packet to include the preamble and checksum

                    message.push( checksum >> 8 )
                    message.push( checksum & 0xFF )
                    packet = [ 255, 0, 255 ];
                    Array.prototype.push.apply( packet, message );

                    //if we request to "SET" a variable on outgoing packets.  96 is Intellibrite and there seems to be no "Get" (#106)
                    if ( ( ( packet[ 7 ] >= 131 && packet[ 7 ] === 168 ) || packet[ 7 ] === 96 ) && settings.get( 'intellitouch.installed' ) )
                    {
                        requestGet = 1;
                    }
                }

                //-------Internally validate checksum
                var len,
                    packetchecksum,
                    databytes
                if ( message[ 0 ] === 16 && message[ 1 ] === constants.ctrl.CHLORINATOR ) //16,2 packet
                {
                    //example packet: 16,2,80,0,98,16,3
                    len = packet.length;
                    //checksum is calculated by 256*2nd to last bit + last bit
                    packetchecksum = packet[ len - 3 ];
                    databytes = 0;
                    // add up the data in the payload
                    for ( var i = 0; i < len - 3; i++ )
                    {
                        databytes += packet[ i ];
                    }
                } else //255,0,255,165 packet
                {
                    //example packet: 255,0,255,165,10,16,34,2,1,0,0,228
                    len = packet.length;
                    //checksum is calculated by 256*2nd to last bit + last bit
                    packetchecksum = ( packet[ len - 2 ] * 256 ) + packet[ len - 1 ];
                    databytes = 0;
                    // add up the data in the payload
                    for ( var i = 3; i < len - 2; i++ )
                    {
                        databytes += packet[ i ];
                    }
                }

                var validPacket = ( packetchecksum === databytes );

                if ( !validPacket )
                {
                    logger.error( 'Asking to queue malformed packet: %s', packet )
                    response.text = 'Pump packet queued: ' + packet
                    response.status = 'error'
                } else
                {
                    //addPacketToOutboundQueue(packet);
                    queuePacketsArr.push( packet )
                    //pump packet
                    // changes to support 16 pumps
                    // if (packet[constants.packetFields.DEST + 3] === 96 || packet[constants.packetFields.DEST + 3] === 97) {
                    if ( packet[ constants.packetFields.DEST + 3 ] >= constants.ctrl.PUMP1 && packet[ constants.packetFields.DEST + 3 ] <= constants.ctrl.PUMP16 )
                    {
                        if ( logPacketWrites ) logger.verbose( 'Just Queued Pump Message \'%s\' to send: %s', constants.strPumpActions[ packet[ constants.packetFields.ACTION + 3 ] ], packet )
                        response.text = 'Pump packet queued: ' + packet
                        response.status = 'ok'
                    }
                    //chlorinator
                    else if ( packet[ 0 ] === 16 )
                    {
                        if ( logPacketWrites ) logger.verbose( 'Just Queued Chlorinator Message \'%s\' to send: %s', constants.strChlorinatorActions[ packet[ 3 ] ], packet )
                        response.text = 'Chlorinator packet queued: ' + packet
                        response.status = 'ok'
                    }
                    //controller packet
                    else
                    {
                        if ( logPacketWrites ) logger.verbose( 'Just Queued Message \'%s\' to send: %s', constants.strControllerActions[ packet[ constants.packetFields.ACTION + 3 ] ], packet )
                        response.text = 'Controller packet queued: ' + packet
                        response.status = 'ok'
                    }
                }


                //-------End Internally validate checksum

                if ( requestGet )
                {
                    if ( packet[ 7 ] === 96 )
                    {
                        packetBuffer.push( Buffer.from( packet ) )
                    }
                    else
                    {
                        //request the GET version of the SET packet
                        var getPacket = [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), packet[ constants.packetFields.ACTION + 3 ] + 64, 1, 0 ]
                        if ( logPacketWrites ) logger.debug( 'Queueing message %s to retrieve \'%s\'', getPacket, constants.strControllerActions[ getPacket[ constants.packetFields.ACTION ] ] )
                        queuePacket( getPacket );
                    }

                }
                if ( logPacketWrites ) logger.silly( `queuePacket: Message to be written: \n\t${packet}` )

                //if length > 0 then we will loop through from isResponse
                if ( !writePacket.isWriteQueueActive() )
                    writePacket.preWritePacketHelper();

            }
            else
            {
                logger.warn( 'queuePacket: Not queueing packet %s because SerialPort/Net connect is not open.', message )
                response.text = 'Packet NOT queued: ' + packet
                response.status = 'fail'
            }

            if ( callback !== undefined )
            {
                callback( response )
            }
        }
    }


    export function getQueuePacketsArrLength ()
    {
        return queuePacketsArr.length
    }

    export function addPacketToOutboundQueue ( packet: any )
    {
        //queuePacketsArr.push(packet)
    }

    export function first ()
    {
        return queuePacketsArr[ 0 ]
    }

    export function entireQueue ()
    {
        return queuePacketsArr
    }

    export function eject ()
    {
        if ( queuePacketsArr.length > 0 )
        {
            let ejected = queuePacketsArr.shift();
            if ( settings.get( 'logPacketWrites' ) ) logger.silly( 'queuePacket.eject: Removed %s from queuePacketsArr. Length of remaining queue: %s ', ejected, queuePacketsArr.length )

        }
    }

    export function sendThisPacket ( _packet: string, callback: { ( response: any ): void; ( arg0: undefined ): void; } )
    {
        logger.info( 'User request (REST API) to send packet: %s', _packet );
        var preamblePacket;
        let packetStr = _packet.split( '-' );
        let packet: number[] = [];
        for ( var i = 0; i < packetStr.length; i++ )
        {
            packet[ i ] = parseInt( packetStr[ i ] )
        }
        if ( packet[ 0 ] === 16 && packet[ 1 ] === constants.ctrl.CHLORINATOR )
        {
            logger.silly( 'packet (chlorinator) detected: ', packet )
        } else
        {
            if ( packet[ 0 ] === 96 || packet[ 0 ] === 97 || packet[ 1 ] === 96 || packet[ 1 ] === 97 )
            //if a message to the pumps, use 165,0
            {
                preamblePacket = [ 165, 0 ]; //255,0,255 will be added later
            } else
            //If a message to the controller, use the preamble that we have recorded
            {
                preamblePacket = [ 165, intellitouch.getPreambleByte() ]
            }
            Array.prototype.push.apply( preamblePacket, packet );
            packet = preamblePacket.slice( 0 );
            logger.silly( 'packet (pool) detected: ', packet )
        }
        let responseStr;
    
        queuePacket( packet, function ( res )
        {
            logger.info( res )
            responseStr = res

        } );
        //var response = 'Request to send packet ' + packet + ' sent.'
        if ( callback !== undefined )
        {
            callback( responseStr )
        }

    }
}