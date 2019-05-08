import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, io } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
let loggers: Init.StubType;
let queuePacketStub: sinon.SinonStub;
let preambleStub: sinon.SinonStub
let clock: sinon.SinonFakeTimers
let getCurrentStatusStub: sinon.SinonStub;
let socketIOStub: sinon.SinonStub;
let settingsStub: sinon.SinonStub;

describe( '#Tests a VS pump', function ()
{

    describe( '#by sending commands to the pump', function ()
    {
        context( 'with a HTTP REST API', function ()
        {

            before( async function ()
            {

            } );

            beforeEach( async function ()
            {
                await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config.pump.VS.json' } )

                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'stub' )
                clock = sinon.useFakeTimers()
                queuePacketStub = sinon.stub( queuePacket, 'queuePacket' )
                getCurrentStatusStub = sinon.stub( pump, 'getCurrentPumpStatus' ).returns( <any> {
                    "pump": {
                        "1": { type: 'VS' },
                        "2": { type: 'VS' }
                    }
                } )
                // pumpCommandStub = sinon.spy(pumpControllerMiddleware, 'pumpCommand')
                // socketIOStub = sinon.stub(io, 'emitToClients')
                logger.silly( 'beforeEach done in VS' )
            } )

            afterEach( async function ()
            {
                sinon.restore()
                await globalAny.stopAllAsync()

            } )

            after( async function ()
            {

            } )

            it( 'API #1: turns off pump 1', async function ()
            {

                let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/off/pump/1' )
                obj.text.should.contain( 'REST API' )
                obj.pump.should.eq( 1 )
                // obj.duration.should.eq(600)
                // console.log('pumpQueue:', queuePacketStub.args)
                clock.tick( 60 * 1000 ) //+1 min

                pump.getCurrentRemainingDuration( 1 ).should.eq( -1 )
                pump.getCurrentRunningMode( 1 ).should.eq( 'off' )
                pump.getCurrentRunningValue( 1 ).should.eq( 0 )

                clock.tick( 59 * 60 * 1000 ) //+1 hr
                pump.getCurrentRemainingDuration( 1 ).should.eq( -1 )

            } )

            it( 'API #1: turns off pump 2', async function ()
            {

                let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/off/pump/2' )
                obj.text.should.contain( 'REST API' )
                obj.pump.should.eq( 2 )
                // obj.duration.should.eq(600)
                // console.log('pumpQueue:', queuePacketStub.args)
                clock.tick( 1000 ) //because this isn't a callback, put in a small delay
                clock.tick( 60 * 1000 ) //+1 min

                pump.getCurrentRemainingDuration( 2 ).should.eq( -1 )
                pump.getCurrentRunningMode( 2 ).should.eq( 'off' )
                pump.getCurrentRunningValue( 2 ).should.eq( 0 )

                clock.tick( 59 * 60 * 1000 ) //+1 hr
                pump.getCurrentRemainingDuration( 2 ).should.eq( -1 )

            } )

            it( 'API #2: turns on pump 1', async function ()
            {

                let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/run/pump/1' )
                obj.text.should.contain( 'REST API' )
                obj.pump.should.eq( 1 )
                // obj.duration.should.eq(600)
                // console.log('pumpQueue:', queuePacketStub.args)
                clock.tick( 60 * 1000 ) //+1 min

                pump.getCurrentRemainingDuration( 1 ).should.eq( -1 )
                pump.getCurrentRunningMode( 1 ).should.eq( 'power' )
                pump.getCurrentRunningValue( 1 ).should.eq( 1 )

                clock.tick( 59 * 60 * 1000 ) //+1 hr
                pump.getCurrentRemainingDuration( 1 ).should.eq( -1 )
            } )

            it( 'API #2: turns on pump 2', async function ()
            {
                this.timeout( 4 * 1000 )
                let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/run/pump/2' )
                obj.text.should.contain( 'REST API' )
                obj.pump.should.eq( 2 )
                // obj.duration.should.eq(600)
                // console.log('pumpQueue:', queuePacketStub.args)
                clock.tick( 60 * 1000 ) //+1 min

                pump.getCurrentRemainingDuration( 2 ).should.eq( -1 )
                pump.getCurrentRunningMode( 2 ).should.eq( 'power' )
                pump.getCurrentRunningValue( 2 ).should.eq( 1 )

                clock.tick( 59 * 60 * 1000 ) //+1 hr
                pump.getCurrentRemainingDuration( 2 ).should.eq( -1 )
            } )

            it( 'API #3: turns on pump 2 for a duration of 30 mins', async function ()
            {
                let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/run/pump/2/duration/30' )
                obj.text.should.contain( 'REST API' )
                obj.pump.should.eq( 2 )
                // obj.duration.should.eq(600)
                // console.log('pumpQueue:', queuePacketStub.args)
                clock.tick( 60 * 1000 )
                pump.getCurrentRemainingDuration( 2 ).should.eq( 29 )
                pump.getCurrentRunningMode( 2 ).should.eq( 'power' )
                pump.getCurrentRunningValue( 2 ).should.eq( 1 )
                clock.tick( 29 * 60 * 1000 ) //+29 mins (30 total)
                pump.getCurrentRemainingDuration( 2 ).should.eq( 0 )
                clock.tick( 1 * 60 * 1000 ) //+1 min (31 total)
                pump.getCurrentRemainingDuration( 2 ).should.eq( -1 )

            } )

        } )


        describe( '#sends pump commands', function ()
        {

            before( async function ()
            {
                await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config.pump.VS.json' } )
            } );

            beforeEach( function ()
            {
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'stub' )
                clock = sinon.useFakeTimers()
                queuePacketStub = sinon.stub( queuePacket, 'queuePacket' )
                settingsStub = sinon.stub( settings, 'updateExternalPumpProgram' )
            } )

            afterEach( function ()
            {
                //restore the sinon after each function
                pumpControllerTimers.clearTimer( 1 )
                pumpControllerTimers.clearTimer( 2 )
                sinon.restore()
            } )

            after( async function ()
            {
                await globalAny.stopAllAsync()
            } )
            context( 'with the current HTTP REST API', function ()
            {


                it( 'API #3: turns on pump 1 for 15 minutes', async function ()
                {
                    this.timeout( 4 * 1000 )
                    let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/run/pump/1/duration/15' )
                    obj.text.should.contain( 'REST API' )
                    obj.pump.should.eq( 1 )
                    // obj.duration.should.eq(600)
                    // console.log('pumpQueue:', queuePacketStub.args)
                    clock.tick( 60 * 1000 ) //+1 min

                    pump.getCurrentRemainingDuration( 1 ).should.eq( 14 )
                    pump.getCurrentRunningMode( 1 ).should.eq( 'power' )
                    pump.getCurrentRunningValue( 1 ).should.eq( 1 )

                    clock.tick( 59 * 60 * 1000 ) //+1 hr
                    pump.getCurrentRemainingDuration( 1 ).should.eq( -1 )
                    pump.getCurrentRunningMode( 1 ).should.eq( 'off' )
                    pump.getCurrentRunningValue( 1 ).should.eq( 0 )


                } )

                // it('API #4: runs pump 1, program 1', function(done) {
                //     let obj: API.Response = await globalAny.requestPoolDataWithURLAsync('pumpCommand/1/1').then(function(result) {
                //         // console.log('loggerInfoStub called with: ', loggerInfoStub.args)
                //         // console.log('loggerWarnStub called with: ', loggerWarnStub.args)
                //         // console.log('pumpCommandStub called with: ', pumpCommandStub.args)
                //         // console.log('result: ', result)
                //         pumpCommandStub.args[0][0].should.eq(1)
                //         pumpCommandStub.args[0][1].should.eq('1') //should be a sting because it could be 0-4 or on/off
                //         loggerWarnStub.calledOnce.should.be.true
                //         result.program.should.eq('1')
                //         done()
                //
                //     })
                //
                // });
                it( 'API #4: runs pump 1, program 1 (NEW URL)', async function ()
                {

                    let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/run/pump/1/program/1' )
                    // console.log('obj: ', obj)
                    obj.text.should.contain( 'REST API' )
                    obj.pump.should.eq( 1 )
                    obj.duration.should.eq( -1 )
                    clock.tick( 60 * 1000 ) //+1 min

                    pump.getCurrentRemainingDuration( 1 ).should.eq( -1 )

                    clock.tick( 59 * 60 * 1000 ) //+1 hr
                    pump.getCurrentRemainingDuration( 1 ).should.eq( -1 )

                } );
                it( 'API #4: runs pump 2, program 1 (NEW URL)', async function ()
                {

                    let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/run/pump/2/program/4' )
                    obj.text.should.contain( 'REST API' )
                    obj.pump.should.eq( 2 )
                    obj.program.should.eq( 4 )
                    obj.duration.should.eq( -1 )
                    clock.tick( 1000 )
                    clock.tick( 60 * 1000 ) //+1 min

                    pump.getCurrentRemainingDuration( 2 ).should.eq( -1 )

                    clock.tick( 59 * 60 * 1000 ) //+1 hr
                    pump.getCurrentRemainingDuration( 2 ).should.eq( -1 )

                } );

                it( 'API #5: runs pump 1, program 1 for 2 minutes (NEW URL)', async function ()
                {
                    this.timeout( 4 * 1000 )
                    let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/run/pump/1/program/1/duration/2' )
                    obj.text.should.contain( 'REST API' )
                    obj.pump.should.eq( 1 )
                    obj.program.should.eq( 1 )

                    obj.duration.should.eq( 2 )
                    clock.tick( 59 * 1000 ) // +59 seconds
                    pump.getCurrentRemainingDuration( 1 ).should.eq( 1 )
                    clock.tick( 1 * 1000 ) //1 min
                    pump.getCurrentRemainingDuration( 1 ).should.eq( 0.5 )
                    clock.tick( 59 * 60 * 1000 ) //+1 hr
                    pump.getCurrentRemainingDuration( 1 ).should.eq( -1 )

                } );

                it( 'API #5: runs pump 1, program 1 for 600 minutes ', async function ()
                {

                    let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/run/pump/1/program/1/duration/600' )
                    obj.text.should.contain( 'REST API' )
                    obj.pump.should.eq( 1 )
                    obj.duration.should.eq( 600 )
                    // console.log('pumpQueue:', queuePacketStub.args)
                    clock.tick( 59 * 1000 ) //+59 seconds

                    pump.getCurrentRemainingDuration( 1 ).should.eq( 599 )
                    clock.tick( 59 * 60 * 1000 ) //+59 mins (59min 59sec total)
                    pump.getCurrentRemainingDuration( 1 ).should.eq( 540 )
                } )
                it( 'API #5: runs pump 1, program 2 for 10 minutes ', async function ()
                {
                    this.timeout( 4 * 1000 )
                    let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/run/pump/1/program/2/duration/10' )

                    obj.text.should.contain( 'REST API' )
                    obj.pump.should.eq( 1 )
                    obj.duration.should.eq( 10 )
                    // console.log('pumpQueue:', queuePacketStub.args)
                    clock.tick( 59 * 1000 ) //+59 seconds

                    pump.getCurrentRemainingDuration( 1 ).should.eq( 9 )

                    clock.tick( 59 * 60 * 1000 ) //+59 mins (59min 59sec total)
                    pump.getCurrentRemainingDuration( 1 ).should.eq( -1 )



                } )

                it( 'API #6: runs pump 1, rpm 1000', async function ()
                {

                    let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/run/pump/1/rpm/1000' )
                    //console.log('obj: ', obj)
                    obj.text.should.contain( 'REST API' )
                    obj.pump.should.eq( 1 )
                    obj.duration.should.eq( -1 )
                    clock.tick( 60 * 1000 ) //+1 min
                    queuePacketStub.args[ 0 ][ 0 ].should.deep.eq( [ 165, 0, 96, 33, 4, 1, 255 ] )
                    queuePacketStub.args[ 1 ][ 0 ].should.deep.eq( [ 165, 0, 96, 33, 6, 1, 10 ] )
                    queuePacketStub.args[ 2 ][ 0 ].should.deep.eq( [ 165, 0, 96, 33, 1, 4, 2, 196, 3, 232 ] )
                    queuePacketStub.args[ 3 ][ 0 ].should.deep.eq( [ 165, 0, 96, 33, 7, 0 ] )
                    pump.getCurrentRemainingDuration( 1 ).should.eq( -1 )

                    clock.tick( 59 * 60 * 1000 ) //+1 hr
                    pump.getCurrentRemainingDuration( 1 ).should.eq( -1 )

                } );

                it( 'API #6: runs pump 2, rpm 1000', async function ()
                {

                    let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/run/pump/2/rpm/1000' )
                    obj.text.should.contain( 'REST API' )
                    obj.pump.should.eq( 2 )
                    // obj.duration.should.eq(600)
                    // console.log('pumpQueue:', queuePacketStub.args)
                    clock.tick( 60 * 1000 ) //+1 min

                    pump.getCurrentRemainingDuration( 2 ).should.eq( -1 )

                    clock.tick( 59 * 60 * 1000 ) //+1 hr
                    pump.getCurrentRemainingDuration( 2 ).should.eq( -1 )

                } )

                it( 'API #7: runs pump 2, rpm 1000 for 600 minutes ', async function ()
                {
                    this.timeout( 10 * 1000 )
                    let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/run/pump/2/rpm/1000/duration/600' )
                    obj.text.should.contain( 'REST API' )
                    obj.pump.should.eq( 2 )
                    obj.duration.should.eq( 600 )
                    // console.log('pumpQueue:', queuePacketStub.args)
                    clock.tick( 59 * 1000 ) //+59 sec

                    pump.getCurrentRemainingDuration( 2 ).should.eq( 599 )

                    clock.tick( 59 * 60 * 1000 ) //59 min, 59 sec
                    pump.getCurrentRemainingDuration( 2 ).should.eq( 540 )
                    clock.tick( 9 * 60 * 60 * 1000 ) //+9 hours(9:59:59 total)
                    pump.getCurrentRemainingDuration( 2 ).should.eq( 0 )
                    clock.tick( 60 * 60 * 1000 ) //+1 min more
                    pump.getCurrentRemainingDuration( 2 ).should.eq( -1 )

                } )
                it( 'API #7: runs pump 2, rpm 1000, duration 600, then turns it off', async function ()
                {

                    let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/run/pump/2/rpm/1000/duration/600' )
                    obj.text.should.contain( 'REST API' )
                    obj.pump.should.eq( 2 )
                    // obj.duration.should.eq(600)
                    // console.log('pumpQueue:', queuePacketStub.args)
                    clock.tick( 59 * 1000 ) //+59 secs

                    pump.getCurrentRemainingDuration( 2 ).should.eq( 599 )
                    pump.getCurrentRunningValue( 2 ).should.eq( 1000 )

                    clock.tick( 59 * 60 * 1000 ) //+59:59
                    pump.getCurrentRemainingDuration( 2 ).should.eq( 540 )

                    obj = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/off/pump/2' )
                    clock.tick( 1 * 1000 )
                    pump.getCurrentRemainingDuration( 2 ).should.eq( -1 )
                    pump.getCurrentRunningValue( 2 ).should.eq( 0 )
                    pump.getCurrentRunningMode( 2 ).should.eq( 'off' )


                } )

                it( 'API #8: saves pump 1 program 1 to 1000 rpm (NEW URL)', async function ()
                {

                    let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/save/pump/1/program/1/rpm/1010' )

                    obj.text.should.contain( 'REST API' )
                    obj.pump.should.eq( 1 )
                    obj.program.should.eq( 1 )
                    obj.speed.should.eq( 1010 )
                    clock.tick( 59 * 1000 ) //+59 sec

                    pump.getCurrentRemainingDuration( 1 ).should.eq( -1 )

                    clock.tick( 59 * 60 * 1000 ) //59:59
                    pump.getCurrentRemainingDuration( 1 ).should.eq( -1 )

                } )

                it( 'API #9: saves and runs pump 1 to program 3 at 2000 rpm for unspecified (NEW URL)', async function ()
                {

                    let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/saverun/pump/1/program/3/rpm/2000/' )
                    obj.text.should.contain( 'REST API' )
                    obj.pump.should.eq( 1 )
                    obj.program.should.eq( 3 )
                    obj.speed.should.eq( 2000 )
                    obj.duration.should.eq( -1 )
                    clock.tick( 59 * 1000 ) //+59 sec

                    pump.getCurrentRemainingDuration( 1 ).should.eq( -1 )

                    clock.tick( 59 * 60 * 1000 ) //+1 hr
                    pump.getCurrentRemainingDuration( 1 ).should.eq( -1 )


                } )


                it( 'API #10: saves and runs pump 1 to program 1 at 1000 rpm for 2 minutes (NEW URL)', async function ()
                {
                    this.timeout( 5 * 1000 )
                    let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/saverun/pump/1/program/1/rpm/1000/duration/2' )
                    obj.text.should.contain( 'REST API' )
                    obj.pump.should.eq( 1 )
                    obj.program.should.eq( 1 )
                    obj.speed.should.eq( 1000 )
                    obj.duration.should.eq( 2 )
                    clock.tick( 59 * 1000 ) //+59 sec min

                    pump.getCurrentRemainingDuration( 1 ).should.eq( 1 )

                    clock.tick( 59 * 60 * 1000 ) //+1 hr
                    pump.getCurrentRemainingDuration( 1 ).should.eq( -1 )

                } )

                it( 'Multiple starts/stops: runs pump 1, rpm 1000, duration 5m, but turns it off after 3 min, then 2 mins later runs it for 3 mins @ 2500 rpm, then monitors off for 2 mins ', async function ()
                {
                    let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/run/pump/1/rpm/1000/duration/5' )

                    obj.text.should.contain( 'REST API' )
                    obj.pump.should.eq( 1 )
                    obj.duration.should.eq( 5 )
                    // console.log('pumpQueue:', queuePacketStub.args)
                    clock.tick( 60 * 1000 ) // 1 min
                    // console.log('after 59 tick')
                    pump.getCurrentRemainingDuration( 1 ).should.eq( 3.5 )
                    pump.getCurrentRunningValue( 1 ).should.eq( 1000 )

                    clock.tick( 2 * 60 * 1000 ) // 3 mins total
                    // console.log('pumpQueue2:', queuePacketStub.args)
                    pump.getCurrentRemainingDuration( 1 ).should.eq( 1.5 )
                    obj = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/off/pump/1' )

                    //clock.tick(1 * 1000)
                    // console.log('pumpQueue3:', queuePacketStub.args)
                    pump.getCurrentRemainingDuration( 1 ).should.eq( -1 )
                    pump.getCurrentRunningValue( 1 ).should.eq( 0 )
                    pump.getCurrentRunningMode( 1 ).should.eq( 'off' )
                    clock.tick( 2 * 60 * 1000 )
                    // console.log('pumpQueue4:', queuePacketStub.args)

                    obj = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/run/pump/1/rpm/2500/duration/3' )


                    // console.log('pumpQueue5:', queuePacketStub.args)

                    obj.text.should.contain( 'REST API' )
                    obj.pump.should.eq( 1 )
                    obj.duration.should.eq( 3 )
                    clock.tick( 2 * 60 * 1000 )
                    pump.getCurrentRemainingDuration( 1 ).should.eq( 0.5 )
                    pump.getCurrentRunningValue( 1 ).should.eq( 2500 )
                    pump.getCurrentRunningMode( 1 ).should.eq( 'rpm' )
                    // console.log('pumpQueue6:', queuePacketStub.args)
                    clock.tick( 2 * 60 * 1000 )
                    pump.getCurrentRemainingDuration( 1 ).should.eq( -1 )
                    pump.getCurrentRunningValue( 1 ).should.eq( 0 )
                    pump.getCurrentRunningMode( 1 ).should.eq( 'off' )
                    clock.tick( 5 * 60 * 1000 )
                    pump.getCurrentRemainingDuration( 1 ).should.eq( -1 )
                    pump.getCurrentRunningValue( 1 ).should.eq( 0 )
                    pump.getCurrentRunningMode( 1 ).should.eq( 'off' )
                    // console.log('pumpQueue7:', queuePacketStub.args)


                } )

            } )


        } )

        describe( '#sends pump commands that fail', function ()
        {

            before( async function ()
            {
                await globalAny.initAllAsync()
            } );

            beforeEach( function ()
            {
                loggers = globalAny.setupLoggerStubOrSpy( 'spy', 'stub' )
                // clock = sinon.useFakeTimers()

                queuePacketStub = sinon.stub( queuePacket, 'queuePacket' )
                // pumpCommandStub = sinon.spy(pumpControllerMiddleware, 'pumpCommand')
                //socketIOStub = sinon.stub( io, 'emitToClients' )
                settingsStub = sinon.stub( settings, 'updateExternalPumpProgram' )
            } )

            afterEach( function ()
            {
                //restore the sinon after each function
                pumpControllerTimers.clearTimer( 1 )
                pumpControllerTimers.clearTimer( 2 )
                sinon.restore()

            } )

            after( async function ()
            {
                await globalAny.stopAllAsync()
            } )
            context( 'with the current HTTP REST API, but sending GPM to a VS pump, Should Fail', function ()
            {



                it( 'API #13: saves program 3 as 27GPM', async function ()
                {
                    this.timeout( 5 * 1000 )
                    let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/save/pump/1/program/3/gpm/27' )
                    obj.text.should.contain( 'FAIL' );

                } )

                it( 'API #14: saves and run program 4 as 28GPM for indefinite duration', async function ()
                {
                    //[ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
                    // [ [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 32 ] ],
                    //     [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
                    //     [ [ 165, 0, 96, 33, 7, 0 ] ] ]
                    this.timeout( 5 * 1000 )
                    let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/saverun/pump/1/program/4/gpm/28' )
                        obj.text.should.contain( 'FAIL' );
                    } )


                    it( 'API #15: saves and run program 4 as 28GPM for 3 mins', async function ()
                    {
                        this.timeout( 5 * 1000 )
                        let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/saverun/pump/1/program/4/gpm/28/duration/3' )
                            
                                obj.text.should.contain( 'FAIL' );
                            
                    } )
                } )

                context( 'with invalid URIs', function ()
                {

                    // it('sets pump 1 program 1 to 1000 rpm', function(done) {

                    //     let obj: API.Response = await globalAny.requestPoolDataWithURLAsync('pumpCommand/1/1/1000').then(function(obj) {
                    //         // console.log('obj: ', obj)
                    //         obj.text.should.contain('REST API')
                    //         obj.pump.should.eq(1)
                    //         obj.program.should.eq(1)
                    //         obj.value.should.eq(1000)
                    //         loggerWarnStub.calledOnce.should.be.true
                    //         clock.tick(60 * 1000) //+1 min
                    //
                    //         pump.getCurrentRemainingDuration(1).should.eq(-1)
                    //
                    //         clock.tick(59 * 60 * 1000) //+1 hr
                    //         pump.getCurrentRemainingDuration(1).should.eq(-1)
                    //         done()
                    //     });
                    // });


                    it( 'saves pump 1 at program 1 (should fail // no speed)', async function ()
                    {

                        let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/save/pump/1/program/1' )

                            obj.text.should.contain( 'FAIL' );

                        } );

                        it( 'saves pump 1 and rpm 1000 (should fail // no program)', async function ()
                        {
                            
                            // consoleEStub = sinon.stub( console, 'error' )
                            // consoleStub = sinon.stub( console, 'log' )
                            let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/save/pump/1/rpm/1000' )

                                obj.text.should.contain( 'Please provide the program' )

                        } );
                    
                            it( 'saves speed 1000 to program 1 (should fail // no pump)', async function ()
                            {

                                try
                                {
                                    let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/save/program/1/rpm/1000' )
                                }
                                catch  ( err )
                                    {
                                        err.message.should.contain( '404' )
                                    }
                                }
                                     );
                        } )

                    } )




                } )





            } )
