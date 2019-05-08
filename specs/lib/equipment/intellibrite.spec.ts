import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, updateAvailable, io, writePacket } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
let loggers: Init.StubType;
import * as ioclient from 'socket.io-client';

describe( 'processes Intellibrite packets', function ()
{

    var circuitPackets = [
        Buffer.from( [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 1, 1, 72, 0, 0, 1, 63 ] ),
        Buffer.from( [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 2, 0, 46, 0, 0, 1, 37 ] ),
        Buffer.from( [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 7, 16, 74, 0, 0, 1, 86 ] ),
        Buffer.from( [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 8, 16, 63, 0, 0, 1, 76 ] ),
        Buffer.from( [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 16, 16, 41, 0, 0, 1, 62 ] )
    ]
    var intellibriteAssignment = [ 255, 0, 255, 165, 33, 15, 16, 39, 32, 7, 8, 4, 0, 8, 20, 10, 0, 16, 32, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 159 ] //light group and colorSet assignments
    // issue 99
    var issue99 = [ 255, 0, 255, 165, 1, 15, 16, 39, 25, 0, 3, 0, 0, 0, 4, 16, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 38 ]



    var intellibriteCyan = [ 255, 0, 255, 165, 33, 16, 34, 167, 32, 7, 12, 4, 0, 8, 22, 10, 0, 16, 32, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 56 ] // change pool light to cyan and spa light to magenta


    var intellibritePosition1 = [ 255, 0, 255, 165, 33, 16, 34, 167, 32, 7, 12, 4, 0, 8, 22, 10, 0, 16, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 24 ] // change pool light to cyan and spa light to magenta


    var intellibriteSwimDelay = [ 255, 0, 255, 165, 33, 16, 34, 167, 32, 7, 12, 4, 0, 8, 22, 14, 0, 16, 32, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 60 ] // change pool light swim delay to 7
    var intellibriteSwimDelay10 = [ 255, 0, 255, 165, 33, 16, 34, 167, 32, 7, 12, 4, 0, 8, 22, 20, 0, 16, 32, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 66 ] // change pool light swim delay to 10

    var intellibriteOff = [ 255, 0, 255, 165, 33, 16, 34, 96, 2, 0, 0, 1, 90 ] // intellibrite lights to off
    var intellibriteOn = [ 255, 0, 255, 165, 33, 16, 34, 96, 2, 1, 0, 1, 91 ] // intellibrite lights to on
    var intellibriteColorSet = [ 255, 0, 255, 165, 33, 16, 34, 96, 2, 160, 0, 1, 250 ] // intellibrite lights to color set
    var intellibriteCaribbean = [ 255, 0, 255, 165, 33, 16, 34, 96, 2, 179, 0, 2, 13 ] // intellibrite to caribbean
    var intellibriteSave = [ 255, 0, 255, 165, 33, 16, 34, 96, 2, 190, 0, 2, 24 ] // intellibrite save
    var intellibriteRecall = [ 255, 0, 255, 165, 33, 16, 34, 96, 2, 191, 0, 2, 25 ] // intellibrite recall

    // 2 intellibrite controllers; raised by issue 99
    var intellibrite2_1 = [ 255, 0, 255, 165, 1, 15, 16, 39, 25, 0, 3, 0, 0, 0, 4, 16, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 38 ]
    var intellibrite2_2 = [ 255, 0, 255, 165, 1, 15, 16, 39, 25, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 6 ]

    let equip: string = 'controller'
    let checkIfNeedControllerConfigurationStub: sinon.SinonStub
    let writeSPPacketStub: sinon.SinonStub;

    describe( '#When packets arrive', function ()
    {
        context( 'via serialport or Socat', function ()
        {

            before( async function ()
            {
                await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_intellibrite.json' } )
            } );

            beforeEach( function ()
            {
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
                checkIfNeedControllerConfigurationStub = sinon.stub( intellitouch, 'checkIfNeedControllerConfiguration' )

            } )

            afterEach( function ()
            {
                sinon.restore()

            } )

            after( async function ()
            {
                await globalAny.stopAllAsync()
            } )

            it( '#Tests incoming packets with 2 Intellibrite controllers', async function ()
            {
                // try
                // {
                packetBuffer.push( new Buffer( intellibrite2_1 ) )
                packetBuffer.push( new Buffer( intellibrite2_2 ) )
                await globalAny.wait( 50 )
                let json = circuit.getLightGroup()
                json[ 3 ].circuit.should.eq( 3 )
                json[ 4 ].colorSwimDelay.should.eq( 5 )
                // }
                // catch ( err )
                // {
                //     throw new Error( 'Cyan: ' + err ) 
                // }

            } )
        } )
    } )

    describe( '#When packets arrive', function ()
    {
        context( 'via serialport or Socat', function ()
        {

            before( async function ()
            {
                await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_intellibrite.json' } )
            } );

            beforeEach( function ()
            {
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
                checkIfNeedControllerConfigurationStub = sinon.stub( intellitouch, 'checkIfNeedControllerConfiguration' ).returns( 0 )

            } )

            afterEach( function ()
            {
                sinon.restore()

            } )

            after( async function ()
            {
                //await globalAny.stopAllAsync()
            } )

            it( '#Loads circuit information', async function ()
            {
                for ( var i in circuitPackets )
                {
                    packetBuffer.push( circuitPackets[ i ] )
                }
                await globalAny.wait( 50 )
                let json = circuit.getCurrentCircuits().circuit
                json[ 1 ].number.should.equal( 1 )
                json[ 1 ].name.should.equal( "SPA" )
            } )

            it( '#Light positions and colors should be discovered', async function ()
            {
                packetBuffer.push( new Buffer( intellibriteAssignment ) )
                await globalAny.wait( 150 )
                let json = circuit.getLightGroup()
                json[ 7 ].position.should.eq( 1 )
                json[ 7 ].colorSet.should.eq( 8 )
                json[ 8 ].colorSwimDelay.should.eq( 5 )

                // .catch( function ( err )
                // {
                //     return Promise.reject( new Error( 'Light positions: ' + err ) )
                // } )
            } )

            it( '#Changes pool light colorSet to Cyan', async function ()
            {
                packetBuffer.push( new Buffer( intellibriteCyan ) )
                await globalAny.wait( 50 )
                var json = circuit.getLightGroup()
                json[ 8 ].colorSet.should.eq( 6 )
                json[ 8 ].colorSetStr.should.eq( 'Cyan' )
                // .catch( function ( err )
                // {
                //     return Promise.reject( new Error( 'Cyan: ' + err ) )
                // } )
            } )

            it( '#Changes garden lights position to 1', async function ()
            {
                packetBuffer.push( new Buffer( intellibritePosition1 ) )
                await globalAny.wait( 50 )
                let json = circuit.getLightGroup()
                json[ 16 ].position.should.eq( 1 )
                //reset it to position 3
                packetBuffer.push( new Buffer( intellibriteCyan ) )
            } )

            it( '#Changes pool swim delay to 7', async function ()
            {
                packetBuffer.push( new Buffer( intellibriteSwimDelay ) )
                await globalAny.wait( 50 )
                let json = circuit.getLightGroup()
                json[ 8 ].colorSwimDelay.should.eq( 7 )

                // .catch( function ( err )
                // {
                //     return Promise.reject( new Error( 'Swim Delay: ' + err ) )
                // } )
            } )

            it( '#Changes Intellibrite to Color Set', async function ()
            {

                /* var _circuit = {
                     "number": 8,
                     "numberStr": "circuit8",
                     "name": "POOL LIGHT",
                     "circuitFunction": "Intellibrite",
                     "freeze": 0,
                     "macro": 0,
                     "light": {
                         "position": 2,
                         "colorStr": "Custom",
                         "color": -1,
                         "colorSet": 6,
                         "colorSetStr": "Cyan",
                         "prevColor": "Cyan",
                         "colorSwimDelay": 5,
                         "mode": -1,
                         "modeStr": "Custom"
                     }
                 }*/

                packetBuffer.push( new Buffer( intellibriteColorSet ) )
                await globalAny.wait( 50 )
                let json = circuit.getCircuit( 7 )
                json.light.mode.should.eq( 160 )
                json.light.modeStr.should.eq( 'Color Set' )
                json.light.colorStr.should.eq( 'Magenta' )
                json = circuit.getCircuit( 8 )
                json.light.mode.should.eq( 160 )
                json.light.modeStr.should.eq( 'Color Set' )
                json.light.colorStr.should.eq( 'Cyan' )
                // .catch( function ( err )
                // {
                //     return Promise.reject( new Error( 'Color Set: ' + err ) )
                // } )

            } )


            it( '#Changes Intellibrite to Off', async function ()
            {
                packetBuffer.push( new Buffer( intellibriteOff ) )
                await globalAny.wait( 50 )
                let json = circuit.getCircuit( 8 )
                json.light.mode.should.eq( 0 )
                json.light.modeStr.should.eq( 'Off' )
                json.light.color.should.eq( 0 )
                json.light.prevColor.should.eq( 6 )
                json.light.prevColorStr.should.eq( 'Cyan' )
                json.light.prevMode.should.eq( 160 )

                // .catch( function ( err )
                // {
                //     return Promise.reject( new Error( 'Off: ' + err ) )
                // } )
            } )


            it( '#Changes Intellibrite to On', async function ()
            {
                packetBuffer.push( new Buffer( intellibriteOn ) )
                await globalAny.wait( 50 )
                let json = circuit.getCircuit( 8 )
                json.light.modeStr.should.eq( 'Color Set' )
                json.light.mode.should.eq( 160 )
                json.light.colorStr.should.eq( 'Cyan' )
                json.light.prevMode.should.eq( 0 )

                // .catch( function ( err )
                // {
                //     return Promise.reject( new Error( 'On: ' + err ) )
                // } )

            } )

            it( '#Changes Intellibrite to Caribbean', async function ()
            {
                packetBuffer.push( new Buffer( intellibriteCaribbean ) )
                await globalAny.wait( 50 )
                let json = circuit.getCircuit( 8 )
                json.light.modeStr.should.eq( 'Caribbean' )
                json.light.mode.should.eq( 179 )
                json.light.colorStr.should.eq( 'Caribbean' )
                json.light.color.should.eq( 179 )
                // .catch( function ( err )
                // {
                //     return Promise.reject( new Error( 'Caribbean: ' + err ) )
                // } )
            } )

            it( '#Changes Intellibrite to Save', async function ()
            {
                packetBuffer.push( new Buffer( intellibriteSave ) )
                await globalAny.wait( 50 )
                let json = circuit.getCircuit( 8 )
                json.light.mode.should.eq( 190 )
                json.light.modeStr.should.eq( 'Save' )
                json.light.color.should.eq( 190 )
                json.light.colorStr.should.eq( 'Save' )
                // .catch( function ( err )
                // {
                //     return Promise.reject( new Error( 'Save: ' + err ) )
                // } )

            } )

            it( '#Changes Intellibrite to Recall', async function ()
            {
                packetBuffer.push( new Buffer( intellibriteCyan ) )
                packetBuffer.push( new Buffer( intellibriteRecall ) )
                await globalAny.wait( 50 )
                let json = circuit.getCircuit( 8 )
                json.light.mode.should.eq( 191 )
                json.light.modeStr.should.eq( 'Recall' )
                json.light.color.should.eq( 191 )
                json.light.colorStr.should.eq( 'Recall' )
                // } )
                // .catch( function ( err )
                // {
                //     return Promise.reject( new Error( 'Recall: ' + err ) )
                // } )

            } )

        } )
    } )

    describe( '#circuit api calls', function ()
    {

        context( 'with a URL', function ()
        {

            before( function ()
            {
                // await globalAny.initAllAsync()
            } )

            beforeEach( function ()
            {
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
                writeSPPacketStub = sinon.stub( sp, 'writeSP' )
                sinon.stub( intellitouch, 'getPreambleByte' ).returns( 33 )
                checkIfNeedControllerConfigurationStub = sinon.stub( intellitouch, 'checkIfNeedControllerConfiguration' )

            } )

            afterEach( function ()
            {
                writePacket.init()
                queuePacket.init()
                sinon.restore()
            } )

            after( async function ()
            {
                await globalAny.stopAllAsync()
            } )

            it( 'sets the color of pool circuit color via the api to cyan', async function ()
            {
                let obj = await globalAny.requestPoolDataWithURLAsync( 'light/circuit/8/setColor/6' )
                writeSPPacketStub.args[ 0 ][ 0 ].should.deep.equal( intellibriteCyan )
            } );

            it( 'sets the Circuit 16 light position to 1 (from 3)', async function ()
            {
                let obj = globalAny.requestPoolDataWithURLAsync( 'light/circuit/16/setPosition/1' )
                await globalAny.wait( 50 )
                writeSPPacketStub.args[ 0 ][ 0 ].should.deep.equal( intellibritePosition1 )
                await globalAny.requestPoolDataWithURLAsync( 'light/circuit/16/setPosition/3' )
                await globalAny.wait( 250 )
                let queue = queuePacket.entireQueue()
                queue[ 1 ].should.deep.equal( intellibriteCyan )
            } );

            it( 'sets the color of pool circuit delay via the api to 10 seconds', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'light/circuit/8/setSwimDelay/10' )
                await globalAny.wait(50)
                        writeSPPacketStub.args[ 0 ][ 0 ].should.deep.equal( intellibriteSwimDelay10 )
            } );

            it( 'sets the Intellibrite light mode to Off', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'light/mode/0' )
                await globalAny.wait(50)
                        writeSPPacketStub.args[ 0 ][ 0 ].should.deep.equal( intellibriteOff )

            } );

            it( 'sets the Intellibrite light mode to Caribbean', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'light/mode/179' )
                await globalAny.wait(50)
                        writeSPPacketStub.args[ 0 ][ 0 ].should.deep.equal( intellibriteCaribbean )
            } );

        } )
    } )

    describe( 'Socket.io tests', function ()
    {
        context( 'for Intellibrite', function ()
        {
            before( async function ()
            {

                await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_intellibrite.json' } )
                                        writePacket.init()
                        queuePacket.init()
                            } );

            beforeEach( function ()
            {
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
                checkIfNeedControllerConfigurationStub = sinon.stub( intellitouch, 'checkIfNeedControllerConfiguration' )
                writeSPPacketStub = sinon.stub( sp, 'writeSP' )

            } )

            afterEach( function ()
            {
                writePacket.init()
                queuePacket.init()
                sinon.restore()
            } )

            after( async function ()
            {
                await globalAny.stopAllAsync()
            } )

            it( '#resets packet info', async function ()
            {
                for ( var i in circuitPackets )
                {
                    packetBuffer.push( circuitPackets[ i ] )
                }
                await globalAny.wait( 50 )
                let json = circuit.getCurrentCircuits().circuit
                json[ 1 ].number.should.equal( 1 )
                json[ 1 ].name.should.equal( "SPA" )
                packetBuffer.push( new Buffer( intellibriteAssignment ) )

                await globalAny.wait( 50 )
                let jsonLG = circuit.getLightGroup()
                jsonLG[ 7 ].position.should.eq( 1 )
                jsonLG[ 7 ].colorSet.should.eq( 8 )
                jsonLG[ 8 ].colorSwimDelay.should.eq( 5 )
                // .catch( function ( err )
                // {
                //     return Promise.reject( new Error( 'Light positions: ' + err ) )
                // } )
            } )

            it( '#sets the color of the pool circuit via the socket to Cyan', async function ()
            {
                let client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )
                client.on( 'connect', function ( )
                {
                    client.emit( 'setLightColor', 8, 6 )
                    client.emit( 'setLightColor', 7, 12 )
                    client.disconnect()
                } )
                await globalAny.wait(100)
                let queue = queuePacket.entireQueue()
                        queue[ 1 ].should.deep.equal( intellibriteCyan )
            } );


            it( '#sets the position of the circuit 16 to 1 (and back to 3)', async function ()
            {
                let client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )
                client.on( 'connect', function ()
                {
                    client.emit( 'setLightPosition', 16, 1 )
                    client.emit( 'setLightPosition', 16, 3 )
                    client.disconnect()
                } )
                await globalAny.wait( 100 )
                let queue = queuePacket.entireQueue()
                        queue[ 0 ].should.deep.equal( intellibritePosition1 )
                        queue[ 1 ].should.deep.equal( intellibriteCyan )
                    } );


            it( '#sets the swim delay of the pool circuit via the socket to 10', async function ()
            {
                let client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )
                client.on( 'connect', function ()
                {
                    client.emit( 'setLightSwimDelay', 8, 10 )
                    client.disconnect()
                } )
                await globalAny.wait(100)
                writeSPPacketStub.args[ 0 ][ 0 ].should.deep.equal( intellibriteSwimDelay10 )
            } )
        } )
    } )
} )