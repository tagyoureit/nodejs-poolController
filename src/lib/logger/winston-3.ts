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
import { io } from '../../etc/internal'
import * as winston from 'winston';
import { MESSAGE } from 'triple-beam';
import { posix } from 'path';
import dateFormat = require( 'dateformat' );
import Transport = require( 'winston-transport' );

import { TransportStreamOptions } from 'winston-transport';

export namespace logger
{

    const myFormat = winston.format.printf( info =>
    {
        //info.timestamp = dateFormat( Date.now(), "HH:MM:ss.l" )
        return `${ info.timestamp } ${ info.level }: ${ info.message }`;
    } );

    let debugFormat = winston.format.printf( info =>
    {
        // ':'  Otherwise could combine.
        return `${ info.timestamp } ${ info.level } ${ info.message }`
    } )

    let packetLogger: winston.Logger;
    let socketLogger: winston.Logger;
    let packetCaptureEnabled: boolean = false;
    let socketLogEnabled: boolean = false;



    //
    // Inherit from `winston-transport` so you can take advantage
    // of the base functionality and `.exceptions.handle()`.
    //
    class SocketTransport extends Transport
    {
        constructor( opts: TransportStreamOptions )
        {
            super( opts );
        }

        log ( info: any, callback?: winston.LogCallback )
        {

            console.log( `should be emitting to outputLog NOW: ${ info[MESSAGE]}` )

            io.emitToClients( 'outputLog', info[MESSAGE] )

            if ( callback )
            {
                callback();
            }
            return
        }
    };

    function timestampFormat() {
        return dateFormat( new Date().toLocaleString(), "HH:MM:ss.l" );
      }

    let _transports: any = {
        console: new winston.transports.Console( {
            level: 'error',
            format: winston.format.combine(
                winston.format.timestamp({
                    format: timestampFormat()
                  }),
                winston.format.colorize(),
                winston.format.splat(),
                winston.format.simple(),
                myFormat)
        } ),

    };


    initLogger()
    console.log( `Starting logging service with default options` )


    var _logger: winston.Logger;
    function initLogger ()
    {

        _logger = winston.createLogger( {
            level: 'error',
            
    



            //handleExceptions: true,  <-- add back when TS is updated
            exitOnError: false,
            transports: [ _transports.console ]
        } )
        //logger.exceptions.handle();
        _logger.info( 'Winston initialised with default settings.' )
        _logger.error( 'hello' )
    }





    export function error ( message: string | any, ...args: any ) { _logger.error( message, ...args ) }
    export function warn ( message: string | any, ...args: any ) { _logger.warn( message, ...args ) }
    export function info ( message: string | any, ...args: any )
    {
        _logger.info( message, ...args )
        // if ( socketLogger )
        // {
        //     socketLogger.info(message, ...args)
        // }
    }
    export function verbose ( message: string | any, ...args: any ) { _logger.verbose( message, ...args ) }
    export function debug ( message: string | any, ...args: any ) { _logger.debug( message, ...args ) }
    export function silly ( message: string | any, ...args: any ) { _logger.silly( message, ...args ) }
    export function log ( level: string | any, message: string, ...args: any ) { _logger.log( level, message, ...args ) }


    export function init ( consoleLogLevel: string = 'info' )
    {
        if ( packetCaptureEnabled )
        {
            _logger.warn( 'Winston: Turning off packet capture due to re-init.' )
            packetCaptureEnabled = false;
        }
        //if ( settings.isReady(logLevel) )

        console.log( `Starting logging service with custom options with level ${ consoleLogLevel }` )
        // update _logger level to value read from config file

        //changeLevel( settings.get( 'logLevel' ) || 'info', 'console' )
        changeLevel( consoleLogLevel || 'info', 'console' )


        _logger.info( 'splat test', [ 'a', 'b', 'c' ] )
        _logger.info( 'splat2 test', { 'a': 1, 'b': 2 } )
        _logger.info( 'splat test 3 %s', { 'a': 1, 'b': 2 } )

    }

    export function initSocketLog ( level: string )
    {
        /*         socketLogEnabled = true;
                _logger.info( 'Winston: Turning on socket log.' )
                       _transports.socketTransport = new SocketTransport( { })
        
                //_logger.add( _transports.packetCaptureLog );
                _logger.info( `Socket Log added with level: ${level}.` );
                // }
                // initPacketLogger();
        
                
        
                socketLogger = winston.createLogger( {
                    level: level,
                    format: debugFormat,
                    exitOnError: false,
                    transports: [ _transports.socketTransport ]
                } );
                socketLogger.exceptions.handle();
        
                // //this.info = (...args) => packetLogger.info(...args)
            */


        _transports.socketTransport = new SocketTransport( {

            level: level,
            format: winston.format.combine(
                winston.format.timestamp({
                    format: timestampFormat()
                  }),
                winston.format.splat(),
                winston.format.simple(),
                debugFormat
            ),
        } )
        _logger.add( _transports.socketTransport );
        _logger.info( `Socket Log added with level: ${ level }.` );

    }


    // code to setup logging for replay
    export function initPacketLogger ( { enable: fileLogEnable, fileLogLevel, fileName }: Settings.IFileLog )
    {
        packetCaptureEnabled = true;
        _logger.info( 'Winston: Turning on packet capture.' )
        // if ( settings.get( 'capturePackets.enable' ) )
        // {
        var file = posix.join( process.cwd(), fileName );
        _transports.packetCaptureLog = new winston.transports.File( {
            filename: file,
            level: 'error',
            format: winston.format.combine( winston.format.timestamp( { format: '() => new Date().toLocaleString()' } ), winston.format.uncolorize(), winston.format.simple(),
                //format.align(),
                winston.format.splat(), myFormat )
        } );
        //_logger.add( _transports.packetCaptureLog );
        _logger.info( `Packet Capture Log (${ file }) added with level silly.` );
        // }
        // initPacketLogger();

        // code to setup logging for packets to replay/packetCapture.json
        let packetFile = posix.join( process.cwd(), 'replay/packetCapture.json' )

        _transports.capturePackets = new winston.transports.File( {
            filename: packetFile,
        } )

        const packetLoggerFormat = winston.format.printf( info =>
        {
            info.timestamp = dateFormat( Date.now(), "HH:MM:ss.l" )
            return `${ info.timestamp } ${ info.level } ${ info.message }`;
        } );

        packetLogger = winston.createLogger( {
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp( { format: '() => new Date()' } ),
                winston.format.json()

            ),
            //handleExceptions: true,
            exitOnError: false,
            transports: [ _transports.capturePackets ]
        } );
        packetLogger.exceptions.handle();

        //this.info = (...args) => packetLogger.info(...args)

        _logger.info( `Packet Logging to (${ packetFile }) started.` )

    }

    // code to setup file log if enabled in config.json
    export function initFileLog ( { enable: fileLogEnable, fileLogLevel, fileName }: Settings.IFileLog )
    {
        if ( fileLogEnable )
        {
            var file = posix.join( process.cwd(), fileName );
            _transports.fileLog = new winston.transports.File( {
                filename: file,
                level: fileLogLevel,
                format: winston.format.combine( winston.format.timestamp( { format: "() => new Date().toLocaleString()" } ), winston.format.uncolorize(), winston.format.simple(), winston.format.splat(), myFormat )
            } );
            _logger.add( _transports.fileLog );
            _logger.info( `File Log (${ file }) added with level ${ fileLogLevel }.` );
        }
        return file;
    }

    export function packet ( msg: any )
    {
        if ( packetCaptureEnabled )
        {
            packetLogger.info( msg )
        }
        else
        {
            _logger.error( `Trying to log packets through Winston but packetCapture is not enabled.` )
        }
    }


    export function changeLevel ( lvl: string, tport = 'console' )
    {
        _transports[ tport ].level = lvl
    }
}