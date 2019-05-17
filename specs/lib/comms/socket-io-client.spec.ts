import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket } from '../../../src/etc/internal';
import * as sinon from 'sinon';
import nock = require( 'nock' );
const globalAny: any = global;
let loggers: Init.StubType;
let scope: any;
import * as _path from 'path'
let path = _path.posix;
let queuePacketStub: sinon.SinonStub;
let preambleStub: sinon.SinonStub
let pWPHStub: sinon.SinonStub
let updateAvailStub: sinon.SinonStub
let writeSPPacketStub: sinon.SinonStub
let controllerConfigNeededStub: sinon.SinonStub
import * as ioclient from 'socket.io-client'

describe( 'socket.io basic tests', function ()
{
    before( function ()
    {
    } );

    beforeEach( async function ()
    {
        await globalAny.initAllAsync()
        loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
        queuePacketStub = sinon.stub( queuePacket, 'queuePacket' )
        preambleStub = sinon.stub( intellitouch, 'getPreambleByte' ).returns( 99 )
        pWPHStub = sinon.stub( writePacket, 'preWritePacketHelper' )
        let fakeObj: IUpdateAvailable.Ijsons = { local: { version: '1.2.3' }, remote: { version: '4.5.6', tag_name: '4.5.6' }, result: 'faked12!' }
        updateAvailStub = sinon.stub( updateAvailable, 'getResultsAsync' ).returns( Promise.resolve( fakeObj ) )
        // clientConfigStub = sinon.stub(clientConfig, 'reset')
        writeSPPacketStub = sinon.stub( sp, 'writeSP' )
        controllerConfigNeededStub = sinon.stub( intellitouch, 'checkIfNeedControllerConfiguration' )
    } )

    afterEach( async function ()
    {
        sinon.restore()
        await globalAny.stopAllAsync()
    } )

    after( function ()
    {

    } )


    it( '#connects to the server', function ( done )
    {
        let client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )
        client.on( 'connect', function ()
        {
            // console.log('connected client:')
            client.emit( 'echo', 'my test' )

        } )
        client.on( 'echo', function ( msg: string )
        {
            // console.log(msg)
            msg.should.eq( 'my test' )
            client.disconnect()
            done()
        } )
    } )

    it( '#sets date/time', async function ()
    {
        let client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )

        client.on( 'connect', function ()
        {
            client.emit( 'setDateTime', 21, 55, 4, 3, 4, 18, 0 )
        } )
        await globalAny.wait( 250 )
        // console.log(`queuePacketStub: ${queuePacketStub.args[0][0]}`)
        queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 99, 16, 33, 133, 8, 21, 55, 4, 3, 4, 18, 0, 0 ] )
    } )

    it( '#fails to set date/time (invalid input)', async function ()
    {
        let client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )
        client.on( 'connect', function ()
        {
            client.emit( 'setDateTime', 26, 55, 4, 3, 4, 18, 0 )
            client.disconnect()
        } )
        await globalAny.wait( 250 )
        loggers.loggerWarnStub.args[ 0 ][ 0 ].text.should.contain( 'FAIL:' )
        loggers.loggerWarnStub.callCount.should.eq( 1 )
    } )


    it( '#sets a schedule', async function ()
    {
        this.timeout( 4000 )
        var client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )

        client.on( 'connect', function ()
        {
            // console.log('connected client:')
            client.emit( 'setSchedule', 12, 5, 13, 20, 13, 40, 131 )
            client.disconnect()

        } )
        await globalAny.wait( 1800 )
        queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 99, 16, 33, 145, 7, 12, 5, 13, 20, 13, 40, 131 ] )
        queuePacketStub.callCount.should.equal( 13 ) // request all schedules
    } )

    it( '#sends packets and checks the correct preamble is passed', ( done ) =>
    {
         let client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )
        client.on( 'connect', function ()
        {
            client.emit( 'sendPacket', [[96,16,6,1,10],[16,2,80,20,0,118],[16,34,134,2,9,0]]  )
            //results should be Queued packet(s): [165,0,96,16,6,1,10] [16,2,80,20,0,118,236] [165,16,16,34,134,2,9,0]
        } )

        client.on( 'sendPacketResults', function ( res: number[] )
        {
            res.should.contain( '165,0,96,16,6,1,10' )
            res.should.contain( '16,2,80,20,0,118' )
            res.should.contain( '16,34,134,2,9,0' )
            queuePacketStub.args[ 0 ][ 0 ].should.deep.eq( [ 165, 0, 96, 16, 6, 1, 10 ] )
            queuePacketStub.args[ 1 ][ 0 ].should.deep.eq( [ 16, 2, 80, 20, 0, 118 ] )
            queuePacketStub.args[ 2 ][ 0 ].should.deep.eq( [ 165, 99, 16, 34, 134, 2, 9, 0 ] )
            client.disconnect()
            done()
        } ) 
    } )


    it( '#cancels the delay', async function ()
    {
        let client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )

        client.on( 'connect', function ()
        {
            client.emit( 'cancelDelay' )
            client.disconnect()
        } )
        await globalAny.wait( 250 )
        queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 99, 16, 33, 131, 1, 0 ] )
    } )

    it( '#sends and receives search socket', () =>
    {
        let client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )
        let socketResults: any = []
        client.on( 'connect', function ()
        {
            client.emit( 'search', 'start', 16, 15, 17 )
            packetBuffer.push( Buffer.from( globalAny.schedules_chk[ 0 ] ) )
        } )
        client.on( 'searchResults', function ( results: any )
        {
            socketResults.push( results )

            if ( socketResults.length === 2 )
            {
                socketResults[ 0 ].should.contain( 'Listening' )
                socketResults[ 1 ].should.contain( '[165,33,15,16,17,7,1,6,9,20,15,59,255,2,106]' )
                client.disconnect()

            }
        } )
    } )

    // TODO: Re-enable these with the mock serialport
    /*  DO NOT ENABLE THESE.  It tries to open a physical serial port which messes up the tests.
        it('#reloads', function(done) {
            var client = ioclient.connect(globalAny.socketURL, globalAny.socketOptions)

            var time1, time2
            client.on('connect', function() {
                client.emit('setDateTime', 21, 55, 4, 3, 4, 18, 0)

            })
            var a = setTimeout(function(){
                time1 = time.getTime()
                client.emit('reload')
            }, 50)
            var b = setTimeout(function(){
                time2 = time.getTime()
                console.log('1: %s 2: %s', time1, time2)
                time1.time.controllerTime.should.equal(time2.time.controllerTime)
                client.disconnect()
                done()
            }, 100)


        })

        it('#reloads & resets', function(done) {
            var client = ioclient.connect(globalAny.socketURL, globalAny.socketOptions)
            var time1, time2
            closeStub = sinon.stub(sp,'close')
            client.on('connect', function() {
                client.emit('setDateTime', 21, 55, 4, 3, 4, 18, 0)
            })
            var a = setTimeout(function(){
                time1 = time.getTime()
                client.emit('reload')
            }, 50)
            var b = setTimeout(function(){
                time2 = time.getTime()
                time1.time.controllerTime.should.equal(time2.time.controllerTime)
                globalAny.initAllAsync({'configLocation': './specs/assets/config/templates/config_vanilla.json'}).then(done)
                done()
            }, 1500)  //need time for all services to start up again.

        })
        */

    // it('API #1: turns off pump 1', function(done) {
    //     // this.timeout(61 * 60 * 1000)
    //     settings.logPumpMessages = 1
    //     settings.logPumpTimers = 1
    //     console.log('newly reset pump status:', pump.getCurrentPumpStatus())
    //     var client = ioclient.connect(globalAny.socketURL, globalAny.socketOptions)
    //     client.on('connect', function(data) {
    //         client.emit('setPumpCommand', 'off', 1, null, null, null)
    //         clock.tick(60 * 1000) //+1 min
    //         console.log('huh???', pump.getCurrentRemainingDuration(1))
    //         pump.getCurrentRemainingDuration(1).should.eq(-1)
    //         pump.getCurrentRunningMode(1).should.eq('off')
    //         pump.getCurrentRunningValue(1).should.eq(0)
    //
    //         clock.tick(59 * 60 * 1000) //+1 hr
    //         pump.getCurrentRemainingDuration(1).should.eq(-1)
    //         done()
    //     })
    //     // client.on('pump', function(msg) {
    //     //     console.log('inside socket received pump:', msg[1].currentrunning.remainingduration)
    //     //     if (msg[1].currentrunning.remainingduration === -1) {
    //     //         client.disconnect()
    //     //         done()
    //     //     }
    //     // })
    //
    //     // io.io.emitToClients('pump')
    //
    // })
    //
    // it('API #3: turns on pump 1 for 15 minutes', function(done) {
    //     this.timeout(61 * 60 * 1000)
    //     var client = ioclient.connect(globalAny.socketURL, globalAny.socketOptions)
    //     client.once('connect', function(data) {
    //
    //         client.emit('setPumpCommand', 'run', 1, null, null, 15)
    //         pump.getCurrentRemainingDuration(1).should.eq(15)
    //         clock.tick(60*1000)
    //         pump.getCurrentRemainingDuration(1).should.eq(14)
    //         clock.tick(14.5*60*1000)
    //         pump.getCurrentRemainingDuration(1).should.eq(-1)
    //         done()
    //
    //     })
    // var callCount = 0
    // client.on('pump', function(msg) {
    //     callCount++
    //     console.log('2: ', callCount, msg[1].currentrunning.remainingduration)
    //     // pump.getCurrentRemainingDuration(1).should.eq(-1)
    //     // pump.getCurrentRunningMode(1).should.eq('off')
    //     // pump.getCurrentRunningValue(1).should.eq(0)
    //     if (callCount > 1 && msg[1].currentrunning.remainingduration === -1) {
    //         console.log('client disconnecting')
    //         client.disconnect()
    //         done()
    //     }
    // })


    // })
    it( '#closes a connection from the server', function ( done )
    {
        let client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )

        client.on( 'connect', function ()
        {
            setTimeout( function ()
            {
                client.emit( 'close', client.id )
            }, 50 )
        } )


        client.on( 'disconnect', function ()
        {
            done()
        } )
    } )

    it( '#requests all config (all)', async function ()
    {
        let data: any = await globalAny.waitForSocketResponseAsync( 'all' )
        data.circuit.should.exist
        data.pump.should.exist
        data.schedule.should.exist
    } )


    // it('#stops the Socket auth', function(done) {
    //     var client = ioclient.connect(globalAny.socketURL, globalAny.socketOptions)
    //     var _err_data
    //     client.on('connect', function(data) {
    //         io.stop()
    //     })
    //     client.on('connect_error', function(err_data){
    //         _err_data = JSON.parse(JSON.stringify(err_data))
    //     })
    //     Promise.resolve()
    //         .delay(50)
    //         .then(function(){
    //             console.log('trying to open client again')
    //             client.open(function(new_data){
    //                 console.log('client opened', new_data)
    //             })
    //         })
    //         .delay(50)
    //         .then(function(){
    //             auth.init()
    //             io.init()
    //             _err_data.type.should.eq('TransportError')
    //         })
    //         .then(done,done)
    // })
} )


//describe('socket.io pump tests', function () {



    // before(function() {
    //     settings.loadAsync('/specs/assets/config/config.json')
    //     await globalAny.initAllAsync()
    // });
    //
    // beforeEach(function() {
    //     sinon = sinon.sinon.create()
    //     //clock = sinon.useFakeTimers()
    //     time.init()
    //     loggerInfoStub = sinon.stub(logger, 'info')
    //     loggerWarnStub = sinon.spy(logger, 'warn')
    //     loggerVerboseStub = sinon.stub(logger, 'verbose')
    //     loggerDebugStub = sinon.stub(logger, 'debug')
    //     loggerSillyStub = sinon.stub(logger, 'silly')
    //     queuePacketStub = sinon.stub(queuePacket, 'queuePacket')
    //     // pumpCommandStub = sinon.spy(pumpControllerMiddleware, 'pumpCommand')
    //     updateAvailStub = sinon.stub(updateAvailable, 'getResultsAsync').returns(Promise.resolve({}))
    //     pump.init()
    //     pumpControllerTimers.clearTimer(1)
    //     pumpControllerTimers.clearTimer(2)
    // })
    //
    // afterEach(function() {
    //     //restore the sinon after each function
    //     pumpControllerTimers.clearTimer(1)
    //     pumpControllerTimers.clearTimer(2)
    //     sinon.restore()
    //
    // })
    //
    // after(function() {
    //     await globalAny.stopAllAsync()
    // })
    //


    // it('#requests all config (all)', function() {
    //     return globalAny.waitForSocketResponseAsync('all')
    //         .then(function(data){
    //             data.circuit.should.exist
    //             data.pump.should.exist
    //             data.schedule.should.exist
    //         })
    //
    // })
    //
    // it('#requests all config (one)', function() {
    //     return globalAny.waitForSocketResponseAsync('one')
    //         .then(function(data){
    //             data.circuit.should.exist
    //             data.pump.should.exist
    //             data.schedule.should.exist
    //         })
    //
    // })

//})


// describe('socket.io updateAvailable tests', function() {
//
//
//
//     before(function() {
//         globalAny.initAllAsync()
//     });
//
//     beforeEach(function() {
//         sinon = sinon.sinon.create()
//         //clock = sinon.useFakeTimers()
//         time.init()
//         loggerInfoStub = sinon.stub(logger, 'info')
//         loggerWarnStub = sinon.spy(logger, 'warn')
//         loggerVerboseStub = sinon.stub(logger, 'verbose')
//         loggerDebugStub = sinon.stub(logger, 'debug')
//         loggerSillyStub = sinon.stub(logger, 'silly')
//         queuePacketStub = sinon.stub(queuePacket, 'queuePacket')
//         pumpCommandStub = sinon.spy(pumpControllerMiddleware, 'pumpCommand')
//         updateAvailStub = sinon.stub(updateAvailable, 'getResultsAsync').returns(Promise.resolve({}))
//     })
//
//
//
//     afterEach(function() {
//
//         sinon.restore()
//
//     })
//
//     after(function() {
//         globalAny.stopAllAsync()
//     })
//
//
//
//
//
//
// })
