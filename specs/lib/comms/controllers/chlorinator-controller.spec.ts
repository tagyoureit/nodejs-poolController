import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers } from '../../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
import * as fs from 'fs'
import * as readline from 'readline';
let clock: sinon.SinonFakeTimers;
let queuePacketStub: sinon.SinonStub;
let pumpControllerProgramTimersSpy: sinon.SinonSpy;

describe( 'chlorinator controller - Virtual', function ()
{

    describe( '#startChlorinatorController starts the timer for 1 or 2 chlorinators', function ()
    {

        before( async function ()
        {
            await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_intellichlor_virtual.json' } )
        } );

        beforeEach( function ()
        {
            loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
            clock = sinon.useFakeTimers()
            pumpControllerProgramTimersSpy = sinon.spy( pumpControllerTimers, 'startProgramTimer' )
            queuePacketStub = sinon.stub( queuePacket, 'queuePacket' )
            chlorinator.init()
        } )

        afterEach( function ()
        {
            chlorinatorController.clearTimer()
            sinon.restore()
        } )

        after( async function ()
        {
            await globalAny.stopAllAsync()
        } )

        it( 'sets chlorinator timer to run after 4 seconds at 0%',  () =>
        {
            chlorinatorController.startChlorinatorController()
            queuePacketStub.callCount.should.eq( 0 )
            clock.tick( 4001 )
            queuePacketStub.callCount.should.eq( 1 )
            queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 16, 2, 80, 17, 0 ] )
            clock.tick( 59 * 1000 ) //63 seconds
            queuePacketStub.callCount.should.eq( 2 )
            clock.tick( 1 * 1000 ) //64 seconds
            queuePacketStub.callCount.should.eq( 3 )
        } );

        it( 'sets chlorinator timer to run after 4 seconds at 10%', async function ()
        {
            chlorinatorController.startChlorinatorController()
            let response = chlorinator.setChlorinatorLevel( 10 )
            response.value.should.equal( 10 )
            queuePacketStub.callCount.should.eq( 1 )
            clock.tick( 4000 )
            queuePacketStub.callCount.should.eq( 2 )
            queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 16, 2, 80, 17, 10 ] )
            clock.tick( 59 * 1000 ) //63 seconds
            queuePacketStub.callCount.should.eq( 16 )
            clock.tick( 1 * 1000 ) //64 Seconds
            queuePacketStub.callCount.should.eq( 17 )
        } );
    } );
} );