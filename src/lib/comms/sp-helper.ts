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

import { settings, logger, queuePacket, writePacket } from '../../etc/internal'
import * as events from 'events';
import * as net from 'net';
//const SerialPort = require('serialport')

import SerialPort = require( 'serialport' );
const MockBinding = require( '@serialport/binding-mock' )

var connectionTimer: NodeJS.Timeout;
var useMockBinding = false
var _isOpen = false // net.socket does not have a native open property/function call

var emitter = new events.EventEmitter();

// let serialport: SerialPort;
let serialport: SerialPort;

let netsocket: net.Socket;
let commType: string; // sp or net


export namespace sp
{
    export function isOpen ()
    {
        return _isOpen || serialport.isOpen
    }

    export async function init ( timeOut?: string )
    {
        commType = settings.get( 'netConnect' ) ? 'net' : 'sp';
        if ( settings.get( 'suppressWrite' ) )
        {
            useMockBinding = true
            await mockSPBinding()
            logger.info( 'Using MOCK serial port for replaying packets' )
        }
        else
        {
            useMockBinding = false


            if ( connectionTimer !== null )
            {
                clearTimeout( connectionTimer )
            }
            // for testing... none will not try to open the port
            if ( timeOut !== 'none' )
            {
                if ( settings.get( 'netConnect' ) === 0 )
                {
                    if ( timeOut === 'timeout' )
                    {
                        logger.error( 'Serial port connection lost.  Will retry every %s seconds to reconnect.', settings.get( 'inactivityRetry' ) )
                    }
                    serialport = new SerialPort( settings.get( 'rs485Port' ), {
                        baudRate: 9600,
                        dataBits: 8,
                        parity: 'none',
                        stopBits: 1,
                        autoOpen: false,
                        lock: false
                    } );
                    serialport.open( function ( err: Error )
                    {
                        if ( err )
                        {
                            connectionTimer = setTimeout( init, settings.get( 'inactivityRetry' ) * 1000 )
                            _isOpen = false
                            return logger.error( 'Error opening port: %s.  Will retry in 10 seconds', err.message );
                        }
                    } )
                    serialport.on( 'open', function ()
                    {
                        if ( timeOut === 'retry_timeout' || timeOut === 'timeout' )
                        {
                            logger.info( 'Serial port recovering from lost connection.' )
                        }
                        else
                        {
                            logger.verbose( 'Serial Port opened' );
                        }
                        queuePacket.init()
                        writePacket.init()
                        _isOpen = true

                    } )
                    serialport.on( 'readable', function ()
                    {

                        var buf = serialport.read()
                        // console.log('Data as JSON:', JSON.stringify(buf.toJSON()))

                        // packetBuffer.push(buf)
                        emitter.emit( 'packetread', buf )
                        // data = serialport.read()
                        // console.log('Data in Buffer as Hex:', data);
                        resetConnectionTimer()
                    } );
                    // error is a common function for Net and Serialport
                    serialport.on( 'error', function ( err: Error )
                    {
                        logger.error( 'Error with port: %s.  Will retry in 10 seconds', err.message )
                        connectionTimer = setTimeout( init, 10 * 1000 )
                        _isOpen = false
                    } )


                } else
                {
                    if ( timeOut === 'timeout' )
                    {
                        logger.error( 'Net connect (socat) connection lost.  Will retry every %s seconds to reconnect.', settings.get( 'inactivityRetry' ) )
                    }
                    netsocket = new net.Socket();
                    netsocket.connect( settings.get( 'netPort' ), settings.get( 'netHost' ), function ()
                    {
                        if ( timeOut === 'retry_timeout' || timeOut === 'timeout' )
                        {
                            logger.info( 'Net connect (socat) recovering from lost connection.' )
                        }
                        logger.info( 'Net connect (socat) connected to: ' + settings.get( 'netHost' ) + ':' + settings.get( 'netPort' ) );

                        queuePacket.init()
                        writePacket.init()
                        _isOpen = true
                    } );
                    netsocket.on( 'data', function ( data )
                    {
                        //Push the incoming array onto the end of the dequeue array
                        // packetBuffer.push(data)
                        emitter.emit( 'packetread', data )
                        // console.log('Data in Buffer as Hex:', data);
                        // console.log('Data as JSON:', JSON.stringify(data.toJSON()))
                        resetConnectionTimer()
                    } );
                    // error is a common function for Net and netsocket
                    netsocket.on( 'error', function ( err: Error )
                    {
                        logger.error( 'Error with Net Connect: %s.  Will retry in 10 seconds', err.message )
                        connectionTimer = setTimeout( init, 10 * 1000 )
                        _isOpen = false
                    } )


                }
                connectionTimer = setTimeout( init, settings.get( 'inactivityRetry' ) * 1000, 'retry_timeout' )



            }
        }

    }

    //for testing and replaying
    export function mockSPBinding ()
    {

        useMockBinding = true
        //_isOpen = true
        SerialPort.Binding = MockBinding
        var portPath = 'FAKE_PORT'
        MockBinding.createPort( portPath, { echo: false, record: true } )
        serialport = new SerialPort( portPath )
        serialport.on( 'open', function ()
        {
            logger.silly( 'Mock SerialPort is now open.' )
            return ( serialport )
        } )
        serialport.on( 'readable', function ()
        {
            // packetBuffer.push(serialport.read())
            emitter.emit( 'packetread', serialport.read() )
            resetConnectionTimer()
        } );
        serialport.on( 'error', function ( err )
        {
            logger.error( 'Error with Mock SerialPort: %s.  Will retry in 10 seconds', err.message )
        } )

    }

    export function writeNET ( data: string | Uint8Array | Buffer, type: string, callback: { ( err: any ): void; ( error: any, bytesWritten: number ): void; ( err?: Error ): void; } )
    {
        // if ( commType === 'sp' || useMockBinding )
        //     serialport.write( data, type, callback )
        // else
        netsocket.write( data, type, callback )
    }

    export function writeSP ( data: string | Buffer | number[], callback: any )
    {
        //if ( commType === 'sp' || useMockBinding )
        serialport.write( data, callback )
        //else
        //    netsocket.write( data, callback )

    }

    export function drainSP ( callback: { ( err: any ): void; ( error: Error ): void; } )
    {
        serialport.drain( callback )
    }

    export function close ()
    {

        if ( connectionTimer !== null )
        {
            clearTimeout( connectionTimer )
        }
        try
        {
            if ( serialport === undefined )
            {
                logger.warn( 'Request to close serialport/NetSocket, but it is not opened.' )
            }
            else if ( serialport.isOpen )
            {
                // logger.silly( 'Resetting SerialPort Mock Binding' )
                // MockBinding.reset()
                useMockBinding = false
                let tempPort = serialport.path;
                serialport.close( function ( err )
                {
                    if ( err )
                    {
                        return "Error closing serialport: " + err
                    } else
                    {
                        return "Serialport closed."
                    }
                } )
                serialport.destroy();
                logger.debug( `Serialport destroyed on port ${ tempPort }.` )
            }
            else if ( _isOpen )
            {
                netsocket.destroy()
                logger.debug( 'Net socket closed' )
            }
            else
            {
                logger.warn( `SerialPort and Socket.net are both NOT running.  Nothing to close.` )
            }
        }
        catch ( err )
        {
            logger.warn( `Trying to shut down SerialPort/net.Socket, but there was an error.
            isOpen: ${_isOpen }
            useMockBinding: ${useMockBinding }
            serialport.isOpen: ${serialport.isOpen }
            serialport: ${JSON.stringify( serialport, null, 2 ) }
            `)
        }
    }

    export function resetConnectionTimer ()
    {
        if ( connectionTimer !== null )
        {
            clearTimeout( connectionTimer )
        }
        if ( !useMockBinding )
            connectionTimer = setTimeout( init, settings.get( 'inactivityRetry' ) * 1000, 'timeout' )
    }

    export function getEmitter ()
    {
        return emitter
    }

    export function getLastWriteMockSP ():number[]
    {
        return (<any>serialport).binding.lastWrite.toJSON().data
    }
    export function mockSPFlush (): void
    {
        serialport.flush()
    }
}