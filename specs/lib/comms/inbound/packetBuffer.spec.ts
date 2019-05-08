import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers, decodeHelper } from '../../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let decodeHelperStub: sinon.SinonStub;


describe( 'packetBuffer receives raw packets from serial bus', function ()
{


    describe( '#When packets arrive', function ()
    {
        context( 'via serialport or Socat', function ()
        {

            before( async function ()
            {
                await globalAny.initAllAsync()
            } );

            beforeEach( function ()
            {
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
                decodeHelperStub = sinon.stub( decodeHelper, 'processChecksum' ).returns( )
            } )

            afterEach( function ()
            {
                sinon.restore()

            } )

            after( async function ()
            {
                await globalAny.stopAllAsync()
            } )

            it( '#should accept all packets and be picked up by processing buffer', async function ()
            {
                // console.log('rb:', globalAny.rawBuffer.length, globalAny.rawBuffer[10])
                for ( var i = 0; i < globalAny.rawBuffer.length; i++ )
                {
                    packetBuffer.push( new Buffer( globalAny.rawBuffer[ i ] ) )
                }
                await globalAny.wait( 200 )
                decodeHelperStub.callCount.should.eq( 281 )
            } )
        } )
    } )
} )