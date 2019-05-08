import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers } from '../../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let writeQueueActiveStub: sinon.SinonStub;
let writeSPPacketStub: sinon.SinonStub;
let writeNetPacketStub: sinon.SinonStub;
let updateAvailStub: sinon.SinonStub;
let controllerConfigNeededStub: sinon.SinonStub;
let getControllerConfigurationStub: sinon.SinonStub;
let ejectAndResetSpy: sinon.SinonSpy;

describe( 'receives packets from buffer and follows them to decoding', function ()
{
    describe( '#When packets arrive', function ()
    {
        context( 'via serialport or Socat and ending with Socket.io', function ()
        {

            before( async function ()
            {
                await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_intellitouch.json' } )
            } )

            beforeEach( function ()
            {
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
                let fakeObj: IUpdateAvailable.Ijsons = { local: { version: '1.2.3' }, remote: { version: '4.5.6', tag_name: '4.5.6' }, result: 'faked10!' }
                updateAvailStub = sinon.stub( updateAvailable, 'getResultsAsync' ).returns( Promise.resolve( fakeObj ) )
                writeQueueActiveStub = sinon.stub( writePacket, 'isWriteQueueActive' ).returns( false )
                writeNetPacketStub = sinon.stub( sp, 'writeNET' )
                writeSPPacketStub = sinon.stub( sp, 'writeSP' )
                controllerConfigNeededStub = sinon.stub( intellitouch, 'checkIfNeedControllerConfiguration' )
                getControllerConfigurationStub = sinon.stub( intellitouch, 'getControllerConfiguration' )
                ejectAndResetSpy = sinon.spy( writePacket, 'ejectPacketAndReset' )
            } )

            afterEach( function ()
            {
                temperature.init()
                pump.init()
                queuePacket.init()
                sinon.restore()
            } )

            after( async function ()
            {
                await globalAny.stopAllAsync()
            } )

            it( '#should set/get the temperature', async ( ) =>
            {
                temperature.getTemperature().temperature.poolTemp.should.eq( 0 )
                packetBuffer.push( new Buffer( [ 255, 0, 255, 165, 16, 15, 16, 8, 13, 53, 53, 42, 83, 71, 0, 0, 0, 39, 0, 0, 0, 0, 2, 62 ] ) )
                await globalAny.wait( 50 )
                let data = await globalAny.waitForSocketResponseAsync( 'temperature' )
                data.temperature.poolTemp.should.eq( 53 )
                temperature.getTemperature().temperature.poolTemp.should.eq( 53 )
            } )

            it( '#should recognize an ACK after sending a controller packet', async function ()
            {

                /*
                09:57:30.478 DEBUG successfulAck: Incoming packet is a match.
                Removing packet 255,0,255,165,33,16,33,203,1,18,1,213 from queuePacketsArr and resetting msgWriteCounter variables
                09:57:30.496 DEBUG postWritePacketHelper: First time writing packet.
                    {"counter":1,"packetWrittenAt":47,"msgWrote":[255,0,255,165,33,16,33,203,1,19,1,214]}
                09:57:30.496 DEBUG writePacketHelper: Setting timeout to write next packet (will call preWritePacketHelper())

                09:57:30.594 DEBUG Msg# 48  Incoming controller packet: 165,33,15,16,11,5,19,0,0,0,0,1,8
                09:57:30.594 DEBUG Msg# 48  Msg received: 165,33,15,16,11,5,19,0,0,0,0,1,8
                                           Msg written: 255,0,255,165,33,16,33,203,1,19,1,214
                                           Match?: true
                09:57:30.595 DEBUG successfulAck: Incoming packet is a match.
                 */

                queuePacket.queuePacket( [ 165, 33, 16, 33, 203, 1, 19 ] )
                await globalAny.wait( 50 )
                packetBuffer.push( new Buffer( [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 19, 0, 0, 0, 0, 1, 8 ] ) )
                await globalAny.wait( 50 )
                ejectAndResetSpy.calledOnce.should.be.true
            } )


            it( '#should recognize an ACK after sending a chlorinator packet', async function ()
            {

                /*

                17:34:08.391 SILLY pBTA: bufferToProcess length>0;  bufferArrayOfArrays>0.  CONCAT AoA to BTP
                17:34:08.392 SILLY iOAOA: Packet being analyzed: 16,2,0,18,31,132,199,16,3  ******START OF NEW PACKET******
                17:34:08.392 DEBUG Msg# 279  Incoming chlorinator packet: 16,2,0,18,31,132,199,16,3
                17:34:08.392 SILLY Msg# 279   Making sure we have a valid chlorinator packet (matching checksum to actual packet): [16,2,0,18,31,132,199,16,3]
                17:34:08.392 SILLY Msg# 279   Match on Checksum:    199==199   16,2,0,18,31,132,199,16,3
                17:34:08.392 SILLY Msg# 279  Checking to see if inbound message matches previously sent outbound message (isResponse function): 16,2,0,18,31,132,199,16,3  chlorinator
                17:34:08.392 SILLY    isResponse:  Msg#: 279  chatterreceived.action: 31 (10?) === queue[0].action&63: 3 ALL TRUE?  false


                17:34:08.392 DEBUG Msg# 279  Msg received: 16,2,0,18,31,132,199,16,3
                                           Msg written: 16,2,80,17,10,125,16,3
                                           Match?: true
                 */

                queuePacket.queuePacket( [ 16, 2, 80, 17, 10, 125, 16, 3 ] )
                await globalAny.wait( 50 )
                packetBuffer.push( new Buffer( [ 16, 2, 0, 18, 31, 132, 199, 16, 3 ] ) )
                await globalAny.wait( 50 )
                ejectAndResetSpy.calledOnce.should.be.true
            } )


            it( '#should recognize an ACK after sending a pump packet', async function ()
            {

                /*
                7:09:47.298 INFO Pump 1 program changing from:
                    Mode: off     Value: 0    remaining duration: -1
                    to
                    Mode: program     Value: 1    remainingduration: -1
                17:09:47.299 VERBOSE App -> Pump 1: Sending Run Pump Program 1. -1 minutes left. (pump1ProgramTimerMode)

                17:09:47.301 INFO
                    {"text":"Socket pumpCommand variables - pump: 1, program: 1, value: null, duration: -1","pump":1,"program":1,"duration":-1}
                    17:19:34.477 DEBUG Msg# 102  Msg received: 165,0,33,96,4,1,255,2,42
                           Msg written: 255,0,255,165,0,96,33,4,1,255,2,42
                           Match?: true

                 */

                queuePacket.queuePacket( [ 165, 0, 96, 33, 4, 1, 255 ] )
                await globalAny.wait( 50 )
                packetBuffer.push( new Buffer( [ 255, 0, 255, 165, 0, 33, 96, 4, 1, 255, 2, 42 ] ) )
                await globalAny.wait( 50 )
                ejectAndResetSpy.calledOnce.should.be.true
            } )

            it( '#processes an known get packet (these are not processed by this app; but triggers default case in process-controller.js', () =>
            {
                let tempPkt = [ 255, 0, 255, 165, 33, 15, 16, 208, 13, 51, 51, 58, 70, 92, 0, 0, 0, 55, 0, 0, 0, 0, 3, 59 ]
                packetBuffer.push( new Buffer( tempPkt ) )
                // Todo: anything to test here?  or just for code coverage?


            } )
            it( '#processes an unknown packet (these are not processed by this app; but triggers default case in process-controller.js', () =>
            {
                let tempPkt = [ 255, 0, 255, 165, 33, 15, 16, 190, 13, 51, 51, 58, 70, 92, 0, 0, 0, 55, 0, 0, 0, 0, 3, 41 ]
                packetBuffer.push( new Buffer( tempPkt ) )
                // Todo: anything to test here?  or just for code coverage?


            } )

            it( '#warns with a 21st circuit when only 20 are configured', () =>
            {
                let tempPkt = [ 255, 0, 255, 165, 1, 15, 16, 11, 5, 21, 0, 0, 0, 0, 0, 234 ]
                packetBuffer.push( new Buffer( tempPkt ) )
                // Todo: anything to test here?  or just for code coverage?
            } )
        } )
    } )
} )