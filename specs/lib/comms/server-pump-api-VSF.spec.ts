import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
let loggers: Init.StubType;
let queuePacketStub: sinon.SinonStub;
let preambleStub: sinon.SinonStub
let clock: sinon.SinonFakeTimers
let writePacketStub: sinon.SinonStub;

describe( '#sends pump commands to a VSF pump', function ()
{
    context( 'with a HTTP REST API', function ()
    {

        before( async function ()
        {

        } );

        beforeEach( async function ()
        {
            await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config.pump.VF_VSF.json' } )
            loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
            clock = sinon.useFakeTimers()
            queuePacketStub = sinon.stub( queuePacket, 'queuePacket' )
            writePacketStub = sinon.stub(writePacket, 'writePacket')
            pump.init()
        } )

        afterEach( async function ()
        {
            sinon.restore()
            await globalAny.stopAllAsync()
        } )

        after( async function ()
        {
        } )

        it( 'API #6: runs pump 2, rpm 1000', async function ()
        {
            let obj: API.Response = await globalAny.requestPoolDataWithURLAsync('pumpCommand/run/pump/2/rpm/1000')
            obj.text.should.contain( 'REST API' )
            obj.pump.should.eq( 2 )
            obj.duration.should.eq( -1 )
            clock.tick( 60 * 1000 ) //+1 min
            queuePacketStub.args[ 0 ][ 0 ].should.deep.eq( [ 165, 0, 97, 33, 4, 1, 255 ] )
            queuePacketStub.args[ 1 ][ 0 ].should.deep.eq( [ 165, 0, 97, 33, 6, 1, 10 ] )
            queuePacketStub.args[ 2 ][ 0 ].should.deep.eq( [ 165, 0, 97, 33, 10, 4, 2, 196, 3, 232 ] )
            queuePacketStub.args[ 3 ][ 0 ].should.deep.eq( [ 165, 0, 97, 33, 7, 0 ] )
            pump.getCurrentRemainingDuration( 2 ).should.eq( -1 )

            clock.tick( 59 * 60 * 1000 ) //+1 hr
            pump.getCurrentRemainingDuration( 2 ).should.eq( -1 )
        } );


        it( 'API #11: runs pump 2 at 20GPM for indefinite duration', async function ()
        {
            //[ [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
            // [ [ 165, 0, 97, 33, 6, 1, 10 ] ],
            //     [ [ 165, 0, 97, 33, 1, 4, 2, 196, 0, 20 ] ],
            // [ [ 165, 0, 97, 33, 7, 0 ] ] ]
            this.timeout( 5 * 1000 )
            let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/run/pump/2/gpm/20' )
            obj.text.should.contain( 'REST API' )
            obj.pump.should.eq( 2 )
            obj.speed.should.eq( 20 )
            obj.duration.should.eq( -1 )
            clock.tick( 59 * 1000 ) //+59 sec min
            queuePacketStub.args[ 0 ][ 0 ].should.deep.eq( [ 165, 0, 97, 33, 4, 1, 255 ] )
            queuePacketStub.args[ 1 ][ 0 ].should.deep.eq( [ 165, 0, 97, 33, 6, 1, 10 ] )
            queuePacketStub.args[ 2 ][ 0 ].should.deep.eq( [ 165, 0, 97, 33, 9, 4, 2, 196, 0, 20 ] )
            queuePacketStub.args[ 3 ][ 0 ].should.deep.eq( [ 165, 0, 97, 33, 7, 0 ] )

            pump.getCurrentRemainingDuration( 2 ).should.eq( -1 )

            clock.tick( 59 * 60 * 1000 ) //+1 hr
            pump.getCurrentRemainingDuration( 2 ).should.eq( -1 )

        } )

        it( 'API #12: runs pump 2 at 25GPM for 5 mins', async function ()
        {
            // api 12: {"text":"REST API pumpCommand variables - pump: 1, gpm: 25, duration: 5","pump":1,"value":25,"duration":5}
            // qps: [ [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
            //     [ [ 165, 0, 97, 33, 6, 1, 10 ] ],
            //     [ [ 165, 0, 97, 33, 1, 4, 2, 196, 0, 25 ] ],
            //     [ [ 165, 0, 97, 33, 7, 0 ] ] ]
            this.timeout( 5 * 1000 )
            let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'pumpCommand/run/pump/2/gpm/25/duration/5' )
            obj.text.should.contain( 'REST API' )
            obj.pump.should.eq( 2 )
            obj.speed.should.eq( 25 )
            obj.duration.should.eq( 5 )
            queuePacketStub.args[ 0 ][ 0 ].should.deep.eq( [ 165, 0, 97, 33, 4, 1, 255 ] )
            queuePacketStub.args[ 1 ][ 0 ].should.deep.eq( [ 165, 0, 97, 33, 6, 1, 10 ] )
            queuePacketStub.args[ 2 ][ 0 ].should.deep.eq( [ 165, 0, 97, 33, 9, 4, 2, 196, 0, 25 ] )
            queuePacketStub.args[ 3 ][ 0 ].should.deep.eq( [ 165, 0, 97, 33, 7, 0 ] )
            clock.tick( 59 * 1000 ) //+59 sec min

            pump.getCurrentRemainingDuration( 2 ).should.eq( 4 )

            clock.tick( 59 * 60 * 1000 ) //+1 hr
            pump.getCurrentRemainingDuration( 2 ).should.eq( -1 )
        } )

    } )
} )
