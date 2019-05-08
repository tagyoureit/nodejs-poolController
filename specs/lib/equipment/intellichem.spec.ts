import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
let loggers: Init.StubType;
let checkIfNeedControllerConfigurationStub: sinon.SinonStub;
let queuePacketStub: sinon.SinonStub
describe( 'processes Intellichem packets', function ()
{
    var intellichemPackets = [
        [ 255, 0, 255, 165, 16, 15, 16, 18, 41, 2, 227, 2, 175, 2, 238, 2, 188, 0, 0, 0, 2, 0, 0, 0, 42, 0, 4, 0, 92, 6, 5, 24, 1, 144, 0, 0, 0, 150, 20, 0, 81, 0, 0, 101, 32, 60, 1, 0, 0, 0, 7, 80 ],
        [ 255, 0, 255, 165, 16, 15, 16, 18, 41, 2, 227, 2, 175, 2, 238, 2, 188, 0, 0, 0, 2, 0, 0, 0, 42, 0, 4, 0, 92, 6, 5, 24, 1, 144, 0, 0, 0, 150, 20, 0, 81, 0, 0, 101, 32, 61, 1, 0, 0, 0, 7, 81 ]

    ]
    var equip = 'controller'

    describe( '#When packets arrive', function ()
    {
        context( 'via serialport or Socat', function ()
        {

            before( async function ()
            {
                await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_intellichem.json' } )
                loggers = globalAny.setupLoggerStubOrSpy( 'stubgit ', 'spy' )
                checkIfNeedControllerConfigurationStub = sinon.stub( intellitouch, 'checkIfNeedControllerConfiguration' ).returns( 0 )
                queuePacketStub = sinon.stub( queuePacket, 'queuePacket' ).callsFake( () => { console.log( 'faked...' ) } )
            } );

            beforeEach( function ()
            {

        
            } )

            afterEach( function ()
            {
                intellichem.init()
                
            } )
            
            after( async function ()
            {
                sinon.restore()
                await globalAny.stopAllAsync()
            } )

            it( '#SI should equal -0.31', async function ()
            {
                    packetBuffer.push( new Buffer( intellichemPackets[ 0 ] ) )
                    await globalAny.wait( 250 )
                    var json = intellichem.getCurrentIntellichem()
                    json.intellichem.readings.SI.should.equal( -0.31 )
            } )

            it( '#Get Intellichem via API', async function ()
            {
                packetBuffer.push( new Buffer( intellichemPackets[ 0 ] ) )
                await globalAny.wait( 250 )
                let obj = await globalAny.requestPoolDataWithURLAsync( 'intellichem' )
                obj.intellichem.readings.SI.should.equal( -0.31 )
            } )

            // TODO: these tests fail when run as part of the Suite but not when this file is run individually... find a better way to test them.
            // it( '#Will not log output with the same packet received twice', async function ()
            // {

            //     loggers.loggerInfoStub.callCount.should.eq( 0 )
            //     packetBuffer.push( new Buffer( intellichemPackets[ 0 ] ) )
            //     await globalAny.wait( 250 )
            //     loggers.loggerInfoStub.callCount.should.eq( 2 ) // from previous buffer
            //     packetBuffer.push( new Buffer( intellichemPackets[ 0 ] ) )
            //     await globalAny.wait( 250 )
            //     loggers.loggerInfoStub.callCount.should.eq( 2 ) // from previous buffer
            //     packetBuffer.push( new Buffer( intellichemPackets[ 1 ] ) )
            //     await globalAny.wait( 250 )
            //     loggers.loggerInfoStub.callCount.should.eq( 4 ) // no change from prior
            // } )

            // it( '#Get Intellichem via Socket', async () =>
            // {
            //     await packetBuffer.push( new Buffer( intellichemPackets[ 0 ] ) )
            //     globalAny.wait( 450 )
            //     let data = await globalAny.waitForSocketResponseAsync( 'intellichem' )
            //     console.log(`Readings SI:... ${intellichem.getCurrentIntellichem().intellichem.readings.SI}`)
            //     data.intellichem.readings.SI.should.equal( -0.31 )
            // } )

        } )
    } )
} )

