import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, updateAvailable } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
let loggers: Init.StubType;
let queuePacketStub: sinon.SinonStub;
let clock: sinon.SinonFakeTimers;


describe( 'chlorinator tests', function ()
{

    //var spied = sinon.spy(chlorinator.setChlorinatorLevel)
    var equip = 'controller'
    before( async function ()
    {
        await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_intellichlor.json' } )
    } );
    
    beforeEach( function ()
    {
        loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'stub' )
        clock = sinon.useFakeTimers()

        let pumpControllerProgramTimersSpy = sinon.spy( pumpControllerTimers, 'startProgramTimer' )

        queuePacketStub = sinon.stub( queuePacket, 'queuePacket' )
        let fakeObj: IUpdateAvailable.Ijsons = { local: { version: '1.2.3' }, remote: { version: '4.5.6', tag_name: '4.5.6' }, result: 'faked7!' }
        let updateAvailStub = sinon.stub( updateAvailable, 'getResultsAsync' ).returns( Promise.resolve( fakeObj ) )
        chlorinatorController.startChlorinatorController()
    } )

    afterEach( function ()
    {
        //restore the sinon after each function
        chlorinatorController.clearTimer()
        clock.restore()
        sinon.restore()
    } )

    after( async function ()
    {
        await globalAny.stopAllAsync()
    } )

    describe( '#setChlorinatorLevel returns objects', function ()
    {
        it( '@ 0 it should return a response object', () =>
        {
            let res = chlorinator.setChlorinatorLevel( 0 )
            res.should.have.property( 'status' )
            res.value.should.eq( 0 )
            res.status.should.eq( 'off' )
        } )

        it( '@ 0 should return a callback', async function ()
        {
            let res = await chlorinator.setChlorinatorLevel( 0 )
            res.should.have.property( 'status' )
            res.value.should.eq( 0 )
            res.status.should.eq( 'off' )
        } )

    } )

    describe( '#setChlorinatorLevel sends the right packets to the chlorinator', function ()
    {

        it( '@10% sends packets every 4 seconds (test covers 1 hour)', () =>
        {
            chlorinator.setChlorinatorLevel( 10 )

            // console.log('chlor args: ', queuePacketStub.args)
            queuePacketStub.callCount.should.eq( 1 )
            clock.tick( 4000 )
            queuePacketStub.callCount.should.eq( 2 )
            queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 16, 2, 80, 17, 10 ] )
            clock.tick( 60 * 1000 ) //59+4 secs
            queuePacketStub.callCount.should.eq( 17 )
            clock.tick( 60 * 60 * 1000 ) //1hr+5 mins
            queuePacketStub.callCount.should.eq( 917 )
        } );

        it( '@0% sends packets every 30 seconds (test covers 1 hour)', () =>
        {
            chlorinator.setChlorinatorLevel( 0 )
            // console.log('chlor args: ', queuePacketStub.args)
            queuePacketStub.callCount.should.eq( 1 )
            clock.tick( 30 * 1000 )
            queuePacketStub.callCount.should.eq( 2 )
            queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 16, 2, 80, 17, 0 ] )
            clock.tick( 60 * 1000 ) //1.5 min
            queuePacketStub.callCount.should.eq( 4 )
            clock.tick( 60 * 60 * 1000 ) //1hr+1.5 mins
            queuePacketStub.callCount.should.eq( 124 )
        } );

        it( '@101% (super-chlorinate) sends packets every 4 seconds (test covers 1 hour)', () =>
        {
            chlorinator.setChlorinatorLevel( 101 )
            // console.log('chlor args: ', queuePacketStub.args)
            queuePacketStub.callCount.should.eq( 1 )
            clock.tick( 4000 )
            queuePacketStub.callCount.should.eq( 2 )
            queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 16, 2, 80, 17, 101 ] )
            clock.tick( 60 * 1000 ) //59+4 secs
            queuePacketStub.callCount.should.eq( 17 )
            clock.tick( 60 * 60 * 1000 ) //1hr+5 mins
            queuePacketStub.callCount.should.eq( 917 )
        } );

        it( '@102% (should fail -- does not change previous state)', () =>
        {
            let res = chlorinator.setChlorinatorLevel( 102 )
            res.text.should.contain( 'FAIL' )
            loggers.loggerWarnStub.callCount.should.equal( 1 )
        } )
    } );
} )

describe( '#When packets arrive', function ()
{
    context( 'via serialport or Socat', function ()
    {

        before( async function ()
        {
            await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_intellichlor.json' } )
        } );

        beforeEach( function ()
        {
            loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
            let queuePacketStub = sinon.stub( queuePacket, 'queuePacket' )
        } )

        afterEach( function ()
        {
            sinon.restore()

        } )

        after( async function ()
        {
            await globalAny.stopAllAsync()
        } )

        it( '#Chlorinator packets are processed', async function ()
        {
            // multiple packets for code coverage
            var data = [
                Buffer.from( [ 16, 2, 0, 18, 58, 144, 238, 16, 3 ] ),
                Buffer.from( [ 16, 2, 0, 1, 0, 0, 19, 16, 3 ] ),
                Buffer.from( [ 16, 2, 0, 3, 0, 73, 110, 116, 101, 108, 108, 105, 99, 104, 108, 111, 114, 45, 45, 52, 48, 188, 16, 3 ] ),
                Buffer.from( [ 16, 2, 80, 20, 2, 120, 16, 3 ] ),
                Buffer.from( [ 16, 2, 80, 21, 2, 120, 16, 3 ] ),
                Buffer.from( [ 16, 2, 80, 17, 3, 118, 16, 3 ] ),
                Buffer.from( [ 16, 2, 80, 0, 0, 98, 16, 3 ] )
            ]
            data.forEach( function ( el )
            {
                packetBuffer.push( el )
            } )
            await globalAny.wait( 250 )
            // console.log(chlorinator.getChlorinatorStatus())
            chlorinator.getChlorinatorStatus().chlorinator.saltPPM.should.eq( 2900 )
            chlorinator.getChlorinatorStatus().chlorinator.name.should.eq( 'Intellichlor--40' )
        } )

    } )

} )