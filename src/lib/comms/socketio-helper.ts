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
import socket = require( 'socket.io' )
import { settings, logger, reload, pumpControllerTimers, circuit, schedule, chlorinator, queuePacket, packetBuffer, intellitouch, intellichem, intellicenterCircuitFunctions, UOM, heat, pump, time, pumpControllerMiddleware, helpers, temperature, clientConfig, updateAvailable, getConfigOverview } from '../../etc/internal';
import * as constants from '../../etc/constants';
import * as intellicenter from '../equipment/intellicenter';

import { ISearch, setSearch } from '../../etc/api-search'
import * as validator from 'validator'


let ioServer: { [ key: string ]: any, http: { sockets: any }, https: { sockets: any }, httpEnabled: number, httpsEnabled: number } = { http: { sockets: [] }, https: { sockets: [] }, httpEnabled: 0, httpsEnabled: 0 }
let socketList: { [ key: string ]: any, http: any, https: any } = { http: [], https: [] };
var iterateQueueTimer: NodeJS.Timeout;

export namespace io
{

    export function emitToClientsOnEnabledSockets ( channel: string, data?: any )
    {
        if ( ioServer[ 'httpEnabled' ] === 1 )
        {
            ioServer[ 'http' ].sockets.emit( channel, data )
        }
        if ( ioServer[ 'httpsEnabled' ] === 1 )
        {
            ioServer[ 'https' ].sockets.emit( channel, data )
        }
    }


    export async function emitToClients ( outputType: string, data?: any )
    {

        // emitToClientsOnEnabledSockets( 'temperature', data );
        // removed 6.0
        // emitToClientsOnEnabledSockets('temp', temp )
        // removed 6.0
        // emitToClientsOnEnabledSockets('temperatures', temp)


        if ( data === undefined || data === null )
        {
            switch ( outputType )
            {
                case 'all':
                    data = helpers.allEquipmentInOneJSON()
                    break;
                case 'heat':
                    data = heat.getCurrentHeat()
                    break;
                case 'updateAvailable':
                    data = await updateAvailable.getResultsAsync()
                    break;
                default:
                    // if ( outputType === 'all' || data === undefined )
                    console.log( `No data was provided for ${ outputType } and there is not a case statement.  Sending 'all'.` )
                    data = helpers.allEquipmentInOneJSON()

            }
        }


        emitToClientsOnEnabledSockets( outputType, data );
    }

    // /**
    //  * Function to check the emit queue on the timer interval
    //  */
    // function checkQueue ()
    // {
    //     let queue: [ string, any ][] = getEmitToClientsQueue()
    //     queue.forEach( ( [ output, data ] ) =>
    //     {
    //         console.log( `emitting queue: ${ output }` )

    //     } )
    // }

    function toNum ( x: string | number ): number
    {
        if ( typeof x === 'string' )
        {
            return parseInt( x )
        }
        else
        {
            return x
        }
    }

    export function init ( server: Express.Application, type: string )
    {
        // initialize socket.io with http/https
        ioServer[ type ] = socket( server )

        socketList[ type ] = [];
        logger.verbose( 'Socket.IO %s server listening. ', type )

        ioServer[ type ].on( 'error', function ( err: Error )
        {
            logger.error( 'Something went wrong with the Socket.IO server error.  ', err.message )
            console.log( err )
        } )
        ioServer[ type ].on( 'connect_error', function ( err: Error )
        {
            logger.error( 'Something went wrong with the Socket.IO server connect_error.  ', err.message )
            console.log( err )
        } )
        ioServer[ type ].on( 'reconnect_failed', function ( err: Error )
        {
            logger.error( 'Something went wrong with the Socket.IO server reconnect_failed.  ', err.message )
            console.log( err )
        } )

        ioServer[ type ].on( 'connection', function ( socket: SocketIO.Socket )
        {
            logger.silly( `New SOCKET.IO Client connected ${ socket.id }` )
            socketHandler( socket, type )
            emitToClients( 'all', helpers.allEquipmentInOneJSON() )
            emitToClients( 'updateAvailable' )
        } )


        // TODO: Want to figure out how to log Socket requests.
        // ioServer[type].use((socket, next) => {
        //
        //
        //     // if we are in capture packet mode, capture it
        //     if (settings.get('capturePackets.enable')) {
        //         logger.packet({
        //             type: 'socket',
        //             counter: 0,
        //             url: socket.handshake.query,
        //             direction: 'inbound'
        //         })
        //
        //     }
        //     console.log('socket.io')
        //
        //     console.log(JSON.stringify(socket.handshake.query,null,2))
        //     next()
        // })

        ioServer[ type + 'Enabled' ] = 1

        //
        //io.emitToClients( 'all' )
        if ( iterateQueueTimer )
        {
            clearTimeout( iterateQueueTimer );
        }
        // iterateQueueTimer = setInterval( checkQueue, 500 )
    }

    export function stop ( type: string )
    {
        if ( type === undefined )
        {
            logger.error( 'io.stop() should be called with http or https' )
        }
        else
        {
            try
            {
                logger.debug( `Stopping Socket IO ${ type } Server` )

                while ( socketList[ type ].length !== 0 )
                {
                    logger.silly( 'total sockets in list: ', socketList[ type ].length )
                    logger.silly( 'removing socket:', socketList[ type ][ 0 ].id )
                    socketList[ type ][ 0 ].disconnect();
                    var removed = socketList[ type ].shift()
                    logger.silly( 'socket removed:', removed.id )
                }
                logger.silly( 'All sockets removed from connection' )


                if ( typeof ioServer[ type ].close === 'function' )
                {
                    ioServer[ type ].close();
                    ioServer[ type + 'Enabled' ] = 0
                    logger.debug( `Socket IO ${ type } Server closed` )
                }
                else
                {
                    logger.silly( 'Trying to close IO server, but already closed.' )
                }
            }
            catch ( err )
            {
                logger.error( 'oops, we hit an error closing the socket server', err )
                throw new Error( err )
            }
        }

    }

    export function stopAll ()
    {
        stop( 'http' );
        stop( 'https' );
    }

    function socketHandler ( socket: SocketIO.Socket, type: string )
    {
        socketList[ type ].push( socket );
        // socket.emit('socket_is_connected', 'You are connected!');
        socket.on( 'error', function ( err: any )
        {
            logger.error( 'Error with socket: ', err )
        } )

        socket.on( 'close', function ( myid: any )
        {
            for ( var i = 0; i < socketList[ type ].length; i++ )
            {
                if ( socketList[ type ][ i ].id === myid )
                {
                    logger.debug( 'socket closed' );
                    socketList[ type ][ i ].disconnect();
                    socketList[ type ].splice( socketList[ type ][ i ], 1 );
                }
            }

        } );

        socket.on( 'echo', function ( msg: any )
        {
            socket.emit( 'echo', msg )
        } )
        // when the client emits 'toggleEquipment', this listens and executes
        socket.on( 'toggleCircuit', function ( equipment: string )
        {
            circuit.toggleCircuit( parseInt( equipment ) )
        } );

        // when the client emits 'cancelDelay', this listens and executes
        socket.on( 'cancelDelay', function ()
        {
            circuit.setDelayCancel()
        } );


        socket.on( 'search', function ( mode: string, src: string, dest: string, action: string )
        {
            //check if we don't have all valid values, and then emit a message to correct.
            let apiSearch: ISearch
            logger.debug( 'from socket.on search: mode: %s  src %s  dest %s  action %s', mode, src, dest, action );

            apiSearch = {
                searchMode: mode,
                searchSrc: parseInt( src ),
                searchDest: parseInt( dest ),
                searchAction: parseInt( action )
            }
            setSearch( apiSearch )

            if ( mode === 'start' )
            {
                var resultStr = "Listening for source: " + src + ", destination: " + dest + ", action: " + action
                //emitToClientsOnEnabledSockets( "searchResults", resultStr )
            } else if ( mode === 'stop' )
            {
                //emitToClientsOnEnabledSockets( "searchResults", 'Stopped listening.' )
            }
            else if ( mode === 'load' )
            {
                //emitToClientsOnEnabledSockets( "searchResults", 'Input values and click start. All values optional. Please refer to https://github.com/tagyoureit/nodejs-poolController/wiki/Broadcast for possible action values.' )
            }

        } )

        // socket.on( 'all', function ()
        // {
        //     emitToClientsOnEnabledSockets( 'all' )
        // } )


        // socket.on( 'one', function ()
        // {
        //     emitToClientsOnEnabledSockets( 'one' )
        // } )

        socket.on( 'setConfigClient', function ( a: any, b: any, c: any, d: any )
        {
            logger.debug( `Setting config_client properties: ${ a }, ${ b }, ${ c }, ${ d }` )
            try
            {
                if ( validator.isAlpha( a ) && ( validator.isAlpha( b ) || b === undefined ) && ( validator.isAlpha( c ) || c === undefined ) && validator.isAlpha( d ) )
                {
                    clientConfig.updateConfigEntry( a, b, c, d )
                }
            }
            catch ( err )
            {
                logger.error( `setConfigClient emit received invalid input: a:${ a } b:${ b } c:${ c } d:${ d }. \n${ err.message }` )
            }

        } )

        socket.on( 'resetConfigClient', function ()
        {
            logger.info( 'Socket received:  Reset bootstrap config' )
            clientConfig.resetPanelState()
        } )

        socket.on( 'sendPacket', function ( incomingPacket: number[][] )
        {
            try
            {
                var preamblePacket, sendPacket;
                var str = 'Queued packet(s): '
                logger.info( 'User request (send_request.html) to send packet: %s', JSON.stringify( incomingPacket ) );
                // console.log( _incomingPacket )
                
                incomingPacket.forEach( ( packet: number[], idx: number ) =>
                {
                    // for (var byte in incomingPacket[packet]) {
                    //     incomingPacket[packet][byte] = parseInt(incomingPacket[packet][byte])
                    // }

                    if ( packet[ 0 ] === 16 && packet[ 1 ] === constants.ctrl.CHLORINATOR )
                    {
                        sendPacket = packet
                        if ( settings.get( 'logApi' ) ) logger.silly( 'packet (chlorinator) now: ', packet )
                    } else
                    {
                        if ( packet[ 0 ] === 96 || packet[ 0 ] === 97 || packet[ 1 ] === 96 || packet[ 1 ] === 97 )
                        //if a message to the pumps, use 165,0
                        {
                            preamblePacket = [ 165, 0 ]
                        } else
                        //If a message to the controller, use the preamble that we have recorded
                        {
                            preamblePacket = [ 165, intellitouch.getPreambleByte() ]; //255,0,255 will be added later

                        }
                        sendPacket = preamblePacket.concat( packet );
                    }
                    queuePacket.queuePacket( sendPacket );
                    str += JSON.stringify( sendPacket ) + ' '
                } )

                emitToClientsOnEnabledSockets( 'sendPacketResults', str )
                logger.info( str )
            }
            catch ( err )
            {
                logger.error( `Error with sendPacket socket: ${ err.message }` )
            }
        } )

        socket.on( 'receivePacket', function ( _incomingPacket: string )
        {
            var preamblePacket, sendPacket
            var str = 'Receiving packet(s): '
            logger.info( 'User request (send_request.html) to RECEIVE packet: %s', JSON.stringify( _incomingPacket ) );
            let incomingPacket = JSON.parse( _incomingPacket )
            incomingPacket.forEach( ( packet: number[], idx: number ) =>
            {

                // for (var byte in incomingPacket[packet]) {
                //     incomingPacket[packet][byte] = parseInt(incomingPacket[packet][byte])
                // }

                if ( packet[ 0 ] === 16 && packet[ 1 ] === constants.ctrl.CHLORINATOR )
                {
                    sendPacket = packet
                    if ( settings.get( 'logApi' ) ) logger.silly( 'packet (chlorinator) now: ', packet )
                } else
                {
                    if ( packet[ 0 ] === 96 || packet[ 0 ] === 97 || packet[ 1 ] === 96 || packet[ 1 ] === 97 )
                    //if a message to the pumps, use 165,0
                    {
                        preamblePacket = [ 255, 0, 255, 165, 0 ]
                    } else
                    //If a message to the controller, use the preamble that we have recorded
                    {
                        preamblePacket = [ 255, 0, 255, 165, intellitouch.getPreambleByte() ]; //255,0,255 will be added later

                    }
                    sendPacket = preamblePacket.concat( packet );
                }
                //queuePacket.queuePacket(sendPacket);
                packetBuffer.push( new Buffer( sendPacket ) );
                str += JSON.stringify( sendPacket ) + ' '
            } )

            emitToClientsOnEnabledSockets( 'sendPacketResults', str )
            logger.info( str )

        } )

        socket.on( 'receivePacketRaw', function ( incomingPacket: any[] )
        {

            var str = 'Add packet(s) to incoming buffer: '
            logger.info( 'User request (replay.html) to RECEIVE packet: %s', JSON.stringify( incomingPacket ) );

            for ( var i = 0; i < incomingPacket.length; i++ )
            {

                packetBuffer.push( new Buffer( incomingPacket[ i ] ) );
                str += JSON.stringify( incomingPacket[ i ] ) + ' '
            }
            emitToClientsOnEnabledSockets( 'sendPacketResults', str )
            logger.info( str )
        } )

        socket.on( 'setchlorinator', function ( desiredChlorinatorPoolOutput: number, desiredChlorinatorSpaOutput: number = -1, desiredSuperChlorHours: number = -1 )
        {
            if ( typeof desiredChlorinatorPoolOutput === 'string' )
                desiredChlorinatorPoolOutput = parseInt( desiredChlorinatorPoolOutput )
            if ( typeof desiredChlorinatorSpaOutput === 'string' )
            {
                desiredChlorinatorSpaOutput = parseInt( desiredChlorinatorSpaOutput )
            }
            if ( typeof desiredSuperChlorHours === 'string' )
            {
                desiredSuperChlorHours = parseInt( desiredSuperChlorHours )
            }

            if ( desiredChlorinatorSpaOutput === -1 )
            {

                chlorinator.setChlorinatorLevel( desiredChlorinatorPoolOutput )
            }
            else
            {
                chlorinator.setChlorinatorLevel( desiredChlorinatorPoolOutput, desiredChlorinatorSpaOutput, desiredSuperChlorHours )
            }

        } )

        socket.on( 'setSpaSetPoint', function ( _spasetpoint: string )
        {
            let spasetpoint = toNum( _spasetpoint )

            heat.setSpaSetPoint( spasetpoint )
        } )

        socket.on( 'incrementSpaSetPoint', function ( _increment: string | number )
        {
            let increment = toNum( _increment )
            heat.incrementSpaSetPoint( increment )
        } )

        socket.on( 'decrementSpaSetPoint', function ( _decrement: string | number )
        {
            let decrement = toNum( _decrement )
            heat.decrementSpaSetPoint( decrement )
        } )


        socket.on( 'spaheatmode', function ( _spaheatmode: string | number )
        {
            let spaheatmode = toNum( _spaheatmode )
            heat.setSpaHeatMode( spaheatmode )

        } )

        socket.on( 'setPoolSetPoint', function ( _poolsetpoint: string | number )
        {
            let poolsetpoint = toNum( _poolsetpoint )
            heat.setPoolSetPoint( poolsetpoint )
        } )

        socket.on( 'incrementPoolSetPoint', function ( _increment: string | number )
        {
            let increment = toNum( _increment )
            heat.incrementPoolSetPoint( increment )
        } )

        socket.on( 'decrementPoolSetPoint', function ( _decrement: string | number )
        {
            let decrement = toNum( _decrement )
            heat.decrementPoolSetPoint( decrement )
        } )

        socket.on( 'poolheatmode', function ( _poolheatmode: string | number )
        {
            let poolheatmode = toNum( _poolheatmode )
            heat.setPoolHeatMode( poolheatmode )
        } )

        socket.on( 'setHeatSetPoint', function ( equip: string, _change: string | number )
        {
            let change = toNum( _change )
            if ( equip !== null && change !== null )
            {
                heat.setHeatSetPoint( equip, change, 'socket.io setHeatSetPoint' )
            } else
            {
                logger.warn( 'setHeatPoint called with invalid values: %s %s', equip, change )
            }
        } )

        socket.on( 'setHeatMode', function ( equip: string, _change: string | number )
        {
            let change = toNum( _change )
            if ( equip === "pool" )
            {
                heat.changeHeatMode( 'pool', change, 'socket.io setHeatMode ' + equip + ' ' + change )

            } else
            {
                heat.changeHeatMode( 'spa', change, 'socket.io setHeatMode ' + equip + ' ' + change )
            }
        } )

        // socket.on( 'pump', function ()
        // {
        //     io.emitToClients( 'pump' )
        // } )

        socket.on( 'setLightMode', function ( _mode: string | number )
        {
            let mode = toNum( _mode )
            if ( mode >= 0 && mode <= 256 )
            {
                circuit.setLightMode( mode )
            } else
            {
                logger.warn( 'Socket lightMode: Not a valid light power command.' )
            }
        } )

        socket.on( 'setLightColor', function ( _circuit: string | number, _color: string | number )
        {

            let circuitNum = toNum( _circuit )
            let color = toNum( _color )
            if ( circuitNum > 0 && circuitNum <= circuit.getNumberOfCircuits() )
            {
                if ( color >= 0 && color <= 256 )
                {
                    ( circuit.setLightColor( circuitNum, color ) )
                } else
                {
                    logger.warn( 'Socket lightSetColor: Not a valid light set color.' )
                }
            }
        } )

        socket.on( 'setLightSwimDelay', function ( _circuitNum: number | string, _delay: string | number )
        {
            let circuitNum = toNum( _circuitNum )
            let delay = toNum( _delay )
            if ( circuitNum > 0 && circuitNum <= circuit.getNumberOfCircuits() )
            {
                if ( delay >= 0 && delay <= 256 )
                {
                    ( circuit.setLightSwimDelay( circuitNum, delay ) )
                } else
                {
                    logger.warn( 'Socket lightSetSwimDelay: Not a valid light swim delay.' )
                }
            }
        } )


        socket.on( 'setLightPosition', function ( _circuitNum: string | number, _position: string | number )
        {
            let circuitNum = toNum( _circuitNum )
            let position = toNum( _position )
            if ( circuitNum > 0 && circuitNum <= circuit.getNumberOfCircuits() )
            {
                if ( position >= 0 && position <= circuit.getNumberOfCircuits() )
                {
                    ( circuit.setLightPosition( circuitNum, position ) )
                } else
                {
                    logger.warn( 'Socket lightSetPosition: Not a valid light swim position.' )
                }
            }
        } )

        /* New pumpCommand API's  */
        //#1  Turn pump off
        socket.on( 'pumpCommandOff', function ( _pump: number | string )
        {
            let pumpNum = toNum( _pump )
            var response: API.Response = {}
            response.text = 'Socket pumpCommand variables - pump: ' + pumpNum + ', power: off, duration: null'
            response.pump = pumpNum
            response.value = null
            response.duration = -1
            pumpControllerTimers.clearTimer( pumpNum )
            logger.info( response )
        } )

        //#2  Run pump indefinitely.
        //#3  Run pump for a duration
        socket.on( 'pumpCommandRun', function ( _pumpNum: number | string, _duration: string | number = -1 )
        {
            let pumpNum = toNum( _pumpNum )
            let duration = toNum( _duration )
            var response: API.Response = {}
            response.text = 'Socket pumpCommand variables - pump: ' + pumpNum + ', power: on, duration: ' + duration
            //response.pump = pump
            //response.value = 1
            //response.duration = _duration
            pumpControllerTimers.startPowerTimer( pumpNum, duration ) //-1 for indefinite duration
            logger.info( 'API Response', response )
        } )

        //#4  Run pump program for indefinite duration
        //#5  Run pump program for a specified
        socket.on( 'pumpCommandRunProgram', function ( _pumpNum: string | number, _program: string | number, _duration: string | number = -1 )
        {
            let pumpNum = <Pump.PumpIndex> toNum( _pumpNum )
            let program = toNum( _program )
            let duration = toNum( _duration )


            //TODO: Push the callback into the pump functions so we can get confirmation back and not simply regurgitate the request
            var response: any = {}
            response.text = 'Socket pumpCommand variables - pump: ' + pumpNum + ', program: ' + program + ', value: null, duration: ' + duration
            response.pump = pumpNum
            response.program = program
            response.duration = duration
            pumpControllerTimers.startProgramTimer( pumpNum, program, duration )
            logger.info( response )
        } )

        //#6 Run pump at RPM for an indefinite duration
        //#7 Run pump at RPM for specified duration
        socket.on( 'pumpCommandRunRpm', function ( _pumpNum: string | number, _rpm: string | number, _duration: string | number = -1 )
        {
            let pumpNum = <Pump.PumpIndex> toNum( _pumpNum )
            let rpm = toNum( _rpm )
            let duration = toNum( _duration )
            var response: any = {}
            response.text = 'Socket pumpCommand variables - pump: ' + pumpNum + ', rpm: ' + rpm + ', duration: ' + duration
            response.pump = pumpNum
            response.value = rpm
            response.duration = duration
            pumpControllerTimers.startRPMTimer( pumpNum, rpm, duration )
            logger.info( response )
        } )

        //#8  Save program to pump
        socket.on( 'setPumpProgramSpeed', function ( _pumpNum: number | string, _program: number | string, _speed: number | string )
        {
            let pumpNum = <Pump.PumpIndex> toNum( _pumpNum )
            let program = toNum( _program )
            let speed = toNum( _speed )
            var response: any = {}
            response.text = 'Socket setPumpProgramSpeed variables - pump: ' + pumpNum + ', program: ' + program + ', speed: ' + speed + ', duration: n/a'
            response.pump = pump
            response.program = _program
            response.speed = _speed
            response.duration = null
            pumpControllerMiddleware.pumpCommandSaveProgram( pumpNum, program, speed )
            logger.info( response )
        } )

        //#9  Save and run program for indefinite duration
        //#10  Save and run program for specified duration
        socket.on( 'pumpCommandSaveRunRpm', function ( _pumpNum: string, _program: string | number, _speed: string | number, _duration: string | number = -1 )
        {
            let pumpNum = <Pump.PumpIndex> toNum( _pumpNum )
            let program = toNum( _program )
            let speed = toNum( _speed )
            let duration = toNum( _duration )

            var response: any = {}
            response.text = 'Socket pumpCommand variables - pump: ' + pump + ', program: ' + _program + ', speed: ' + _speed + ', duration: ' + duration
            response.pump = pumpNum
            response.program = program
            response.speed = speed
            response.duration = duration
            pumpControllerMiddleware.pumpCommandSaveProgramWithValueForDuration( pumpNum, program, speed, duration )
            logger.info( response )
        } )

        //#11 Run pump at GPM for an indefinite duration
        //#12 Run pump at GPM for specified duration
        socket.on( 'pumpCommandRunGpm', function ( _pumpNum: number | string, _gpm: number | string, _duration: number | string = -1 )
        {
            let pumpNum = <Pump.PumpIndex> toNum( _pumpNum )
            let gpm = toNum( _gpm )
            let duration = toNum( _duration )
            var response: any = {}
            response.text = 'Socket pumpCommand variables - pump: ' + pumpNum + ', gpm: ' + gpm + ', duration: ' + duration
            response.pump = pumpNum
            response.speed = _gpm
            response.duration = duration
            pumpControllerTimers.startGPMTimer( pumpNum, gpm, duration )
            logger.info( response )
        } )

        //#13  Save program to pump
        socket.on( '/pumpCommand/save/pump/:pump/program/:program/gpm/:speed', function ( _pumpNum: string | number, _program: string | number, _speed: string | number )
        {
            let pumpNum = <Pump.PumpIndex> toNum( _pumpNum )
            let program = toNum( _program )
            let speed = toNum( _speed )
            let response: API.Response = {}
            response.text = 'Socket pumpCommand variables - pump: ' + pumpNum + ', program: ' + program + ', gpm: ' + speed + ', duration: null'
            response.pump = pumpNum
            response.program = program
            response.speed = speed
            response.duration = null
            pumpControllerMiddleware.pumpCommandSaveProgram( pumpNum, program, speed )
            logger.info( 'API Response', response )
        } )

        //#14  Save and run program for indefinite duration
        //#15  Save and run program for specified duration
        socket.on( 'pumpCommandSaveRunGpm', function ( _pumpNum: string | number, _program: string | number, _speed: string | number, _duration: string | number = -1 )
        {
            let pump = <Pump.PumpIndex> toNum( _pumpNum )
            let program = toNum( _program )
            let speed = toNum( _speed )
            let duration = toNum( _duration )
            var response: any = {}
            response.text = 'Socket pumpCommand variables - pump: ' + pump + ', program: ' + program + ', speed: ' + speed + ', duration: ' + duration
            response.pump = pump
            response.program = program
            response.speed = speed
            response.duration = duration
            pumpControllerMiddleware.pumpCommandSaveProgramWithValueForDuration( pump, program, speed, duration )
            logger.info( response )
        } )

        socket.on( 'setPumpType', function ( _pumpNum: string, _type: string )
        {
            let pumpNum = <Pump.PumpIndex> toNum( _pumpNum )
            var response: any = {}
            response.text = 'Socket setPumpType variables - pump: ' + pumpNum + ', type: ' + _type
            response.pump = pumpNum
            response.type = _type
            settings.updatePumpType( pumpNum, _type )
            logger.info( response )
        } )


        socket.on( 'setDateTime', function ( _hh: string, _mm: string, _dow: string, _dd: string, _mon: string, _yy: string, _dst: string )
        {
            var hour = toNum( _hh )
            var min = toNum( _mm )
            var day = toNum( _dd )
            var month = toNum( _mon )
            var year = toNum( _yy )
            var autodst = toNum( _dst )
            var dayofweek = toNum( _dow )
            var dowIsValid = time.lookupDOW( dayofweek )
            var response: any = {}
            if ( ( hour >= 0 && hour <= 23 ) && ( min >= 0 && min <= 59 ) && ( day >= 1 && day <= 31 ) && ( month >= 1 && month <= 12 ) && ( year >= 0 && year <= 99 ) && !dowIsValid.includes( 'notset' ) && ( autodst === 0 || autodst === 1 ) )
            {
                response.text = 'SOCKET API received request to set date/time to: ' + hour + ':' + min + '(military time)'
                response.text += 'dayofweek: ' + dowIsValid + '(' + dayofweek + ') date: ' + month + '/' + day + '/20' + year + ' (mm/dd/yyyy)'
                response.text += 'automatically adjust dst (currently no effect): ' + autodst
                time.setDateTime( hour, min, dayofweek, day, month, year, autodst )
                logger.info( response )
            } else
            {
                response.text = 'FAIL: SOCKET API - hour (' + hour + ') should be 0-23 and minute (' + min + ') should be 0-59.  Received: ' + hour + ':' + min
                response.text += 'Day (' + day + ') should be 0-31, month (' + month + ') should be 0-12 and year (' + year + ') should be 0-99.'
                response.text += 'Day of week (' + dayofweek + ') should be one of: [1,2,4,8,16,32,64] [Sunday->Saturday]'
                response.text += 'dst (' + autodst + ') should be 0 or 1'
                logger.warn( response )
            }

        } )

        socket.on( 'setSchedule', function ( _id: string, _circuit: string, _starthh: string, _startmm: string, _endhh: string, _endmm: string, _days: string )
        {
            let id = toNum( _id )
            let circuit = toNum( _circuit )
            let starthh = toNum( _starthh )
            let startmm = toNum( _startmm )
            let endhh = toNum( _endhh )
            let endmm = toNum( _endmm )
            let days = toNum( _days )
            var response: any = {}
            response.text = 'SOCKET received request to set schedule ' + id + ' with values (start) ' + starthh + ':' + startmm + ' (end) ' + endhh + ':' + endmm + ' with days value ' + days
            logger.info( response )
            schedule.setControllerSchedule( id, circuit, starthh, startmm, endhh, endmm, days )
        } )

        socket.on( 'toggleScheduleDay', function ( _id: string, _day: string )
        {
            let id = toNum( _id )
            let day = toNum( _day )
            var response: any = {}
            if ( day !== undefined )
            {
                response.text = 'Socket received request to toggle day ' + day + ' on schedule with ID:' + id
                logger.info( response )
                schedule.toggleDay( id, day )
            }
            else
            {
                logger.warn( 'Socket toggleScheduleDay received with no valid day value.' )
            }
        } )

        socket.on( 'deleteScheduleOrEggTimer', function ( _id: string )
        {

            let id = toNum( _id )
            var response: any = {}
            response.text = 'Socket received request delete schedule with ID:' + id
            logger.info( response )
            schedule.deleteScheduleOrEggTimer( id )
        } )

        socket.on( 'setScheduleStartOrEndTime', function ( _id: string, sOE: string, _hour: string, _min: string )
        {
            let id = toNum( _id )
            let hour = toNum( _hour )
            let min = toNum( _min )
            let response: any = {}
            response.text = 'Socket received request to set ' + sOE + ' time on schedule with ID (' + id + ') to ' + hour + ':' + min
            logger.info( response )
            schedule.setControllerScheduleStartOrEndTime( id, sOE, hour, min )
        } )

        socket.on( 'setScheduleCircuit', function ( _id: string, _circuitNum: string )
        {
            let id = toNum( _id )
            let circuitNum = toNum( _circuitNum )
            var response: any = {}
            response.text = 'Socket received request to set circuit on schedule with ID (' + id + ') to ' + circuit.getFriendlyName( circuitNum )
            logger.info( response )
            schedule.setControllerScheduleCircuit( id, circuitNum )
        } )

        socket.on( 'setEggTimer', function ( _id: string, _circuitNum: string, _hour: string, _min: string )
        {
            let id = toNum( _id )
            let circuitNum = toNum( _circuitNum )
            let hour = toNum( _hour )
            let min = toNum( _min )
            let response: any = {}
            response.text = 'Socket received request to set eggtimer with ID (' + id + '): ' + circuit.getFriendlyName( circuitNum ) + 'for ' + hour + ' hours, ' + min + ' minutes'
            logger.info( response )
            schedule.setControllerEggTimer( id, circuitNum, hour, min )
        } )

        socket.on( 'reload', function ()
        {
            logger.info( 'Reload requested from Socket.io' )
            reload.reloadAsync()
        } )

        socket.on( 'updateVersionNotificationSetting', function ( _bool: string | boolean )
        {
            let bool: boolean;
            if ( typeof ( _bool ) === 'string' )
            {
                bool = _bool === 'true' ? true : false;
            }
            else
            {
                bool = _bool
            }
            logger.info( `updateVersionNotificationSetting requested from Socket.io.  value: ${ bool }` )
            settings.updateVersionNotificationSetting( bool, null )
        } )

        socket.on( 'hidePanel', ( panel: string ): void =>
        {
            console.log( `received hide panel ${ panel }` )
            if ( validator.isAlpha( panel ) )
            {

                clientConfig.updatePanel( panel, 'hidden' )
            }
            else
            {
                logger.error( `hidePanel socket received invalid input: ${ panel }` )
            }
        } )


        // used by test to request a specific socket output
        socket.on( 'test', ( _which: string ) =>
        {
            let data: any;
            switch ( _which )
            {
                case 'intellichem':
                    data = intellichem.getCurrentIntellichem()
                    break;
                case 'all':
                    data = helpers.allEquipmentInOneJSON()
                    break;
                case 'pump':
                    data = pump.getCurrentPumpStatus()
                    break;
                case 'temperature':
                    data = temperature.getTemperature()
                    break;
                default:
                    throw new Error( `Please add socket case statement for ${ _which }` )
            }
            emitToClientsOnEnabledSockets( _which, data )
        } )


    }


    export function emitDebugLog ( msg: any )
    {
        //console.log('EMITTING DEBUG LOG: %s', msg)
        emitToClientsOnEnabledSockets( 'outputLog', msg )
    }
}