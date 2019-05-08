import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers } from '../../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let updateAvailStub: sinon.SinonStub;

describe( 'receives packets from buffer and follows them to decoding', function ()
{


    describe( '#When packets arrive', function ()
    {
        context( 'via serialport or Socat and ending with Socket.io', function ()
        {

            before( async function ()
            {
                await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config.pump.VS.json' } )
            } );

            beforeEach( function ()
            {
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
                let fakeObj: IUpdateAvailable.Ijsons = { local: { version: '1.2.3' }, remote: { version: '4.5.6', tag_name: '4.5.6' }, result: 'faked6!' }
                updateAvailStub = sinon.stub( updateAvailable, 'getResultsAsync' ).returns( Promise.resolve( fakeObj ) )
            } )

            afterEach( function ()
            {
                pump.init()
                sinon.restore()
            } )

            after( async function ()
            {
                await globalAny.stopAllAsync()
            } )

            it( '#decodes pump 1 power off command from the controller', async function ()
            {
                pump.getPower( 1 ).should.eq( -1 )
                packetBuffer.push( new Buffer( globalAny.pump1PowerOff_chk ) )
                packetBuffer.push( new Buffer( globalAny.pump1PowerOffAck_chk ) )
                await globalAny.wait( 100 )
                // console.log('loggers.logger args:', loggers.loggerVerboseStub.args)
                // console.log('getCurrentPumpStatus(1) END:', pump.getCurrentPumpStatus(1))
                loggers.loggerVerboseStub.args[ 0 ][ 2 ].should.contain( 'Main' )
                loggers.loggerVerboseStub.args[ 0 ][ 3 ].should.contain( 'Pump 1' )
                loggers.loggerVerboseStub.args[ 0 ][ 4 ].should.contain( 'off' )
                loggers.loggerVerboseStub.args[ 1 ][ 2 ].should.contain( 'Pump 1' )
                loggers.loggerVerboseStub.args[ 1 ][ 3 ].should.contain( 'off' )
                pump.getPower( 1 ).should.eq( 0 )
                let data = await globalAny.waitForSocketResponseAsync( 'pump' )
                data.pump[ 1 ].power.should.eq( 0 )
            } )


            it( '#decodes pump 1 power on command from the controller', async function ()
            {
                pump.getPower( 1 ).should.eq( -1 )
                packetBuffer.push( new Buffer( globalAny.pump1PowerOn_chk ) )
                packetBuffer.push( new Buffer( globalAny.pump1PowerOnAck_chk ) )
                await globalAny.wait( 100 )
                // console.log('loggers.logger args:', loggers.loggerVerboseStub.args)
                // console.log('getCurrentPumpStatus(1) END:', pump.getCurrentPumpStatus(1))
                loggers.loggerVerboseStub.args[ 0 ][ 2 ].should.contain( 'Main' )
                loggers.loggerVerboseStub.args[ 0 ][ 3 ].should.contain( 'Pump 1' )
                loggers.loggerVerboseStub.args[ 0 ][ 4 ].should.contain( 'on' )
                loggers.loggerVerboseStub.args[ 1 ][ 2 ].should.contain( 'Pump 1' )
                loggers.loggerVerboseStub.args[ 1 ][ 3 ].should.contain( 'on' )
                pump.getPower( 1 ).should.eq( 1 )
                let data = await globalAny.waitForSocketResponseAsync( 'pump' )
                data.pump[ 1 ].power.should.eq( 1 )
            } )

            it( '#decodes pump 1 remote control on command from the controller', async ( ) =>
            {
                        pump.getCurrentPumpStatus().pump[ 1 ].remotecontrol.should.eq( -1 )
                        packetBuffer.push( new Buffer( globalAny.pump1RemoteControlOn_chk ) )
                        packetBuffer.push( new Buffer( globalAny.pump1RemoteControlOnAck_chk ) )
await globalAny.wait(100)
                        // console.log('loggers.logger args:', loggers.loggerVerboseStub.args)
                        // console.log('getCurrentPumpStatus(1) END:', pump.getCurrentPumpStatus(1))
                        loggers.loggerVerboseStub.args[ 0 ][ 2 ].should.contain( 'Main' )
                        loggers.loggerVerboseStub.args[ 0 ][ 3 ].should.contain( 'Pump 1' )
                        loggers.loggerVerboseStub.args[ 0 ][ 4 ].should.contain( 'disable' )
                        loggers.loggerVerboseStub.args[ 1 ][ 2 ].should.contain( 'Pump 1' )
                        loggers.loggerVerboseStub.args[ 1 ][ 3 ].should.contain( 'disable' )
                        pump.getCurrentPumpStatus().pump[ 1 ].remotecontrol.should.eq( 1 )
                        let data = await globalAny.waitForSocketResponseAsync( 'pump' )
                        data.pump[ 1 ].remotecontrol.should.eq( 1 )
            } )

            it( '#decodes pump 2 remote control off command from the controller', async (  ) =>
            {
                        pump.getCurrentPumpStatus().pump[ 2 ].remotecontrol.should.eq( -1 )
                        packetBuffer.push( new Buffer( globalAny.pump2RemoteControlOff_chk ) )
                        packetBuffer.push( new Buffer( globalAny.pump2RemoteControlOffAck_chk ) )
                await globalAny.wait( 100 )
                                                // console.log('loggers.logger args:', loggers.loggerVerboseStub.args)
                        // console.log('getCurrentPumpStatus(1) END:', pump.getCurrentPumpStatus(1))
                        loggers.loggerVerboseStub.args[ 0 ][ 2 ].should.contain( 'Main' )
                        loggers.loggerVerboseStub.args[ 0 ][ 3 ].should.contain( 'Pump 2' )
                        loggers.loggerVerboseStub.args[ 0 ][ 4 ].should.contain( 'enable' )
                        loggers.loggerVerboseStub.args[ 1 ][ 2 ].should.contain( 'Pump 2' )
                        loggers.loggerVerboseStub.args[ 1 ][ 3 ].should.contain( 'enable' )
                        pump.getCurrentPumpStatus().pump[ 2 ].remotecontrol.should.eq( 0 )
                        let data = await globalAny.waitForSocketResponseAsync( 'pump' )
                        data.pump[ 2 ].remotecontrol.should.eq( 0 )
            } )

            // it('#should decode a pump 1 reply with status command from the controller', function() {
            //     //TODO: What are we testing here?
            //     return Promise.resolve()
            //         .then(function(){
            //             iOAOAStub = sinon.spy(receiveBuffer, 'iterateOverArrayOfArrays')
            //             packetBuffer.push(new Buffer(globalAny.pump1SendStatus_chk))
            //         })
            //         .delay(50)
            //         .then(function(){
            //             // packet = {
            //             //     "type": "Buffer",
            //             //     "data": globalAny.pump1PowerOffAck_chk
            //             // }
            //             // packetBuffer.push(new Buffer(packet))
            //             iOAOAStub.callCount.should.eq(1)
            //
            //         })
            // })


        } )
    } )
} )
