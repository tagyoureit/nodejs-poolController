import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
import * as fs from 'fs'
import requestPromise = require( 'request-promise' );
import request = require( 'request' );
let writeSPPacketStub: sinon.SinonStub
let preambleStub: sinon.SinonStub

describe( 'server', function ()
{
    describe( '#circuit api calls', function ()
    {
``
        context( 'with a URL', function ()
        {

            before( async function ()
            {

                await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config.pump.VS.json' } )

            } )

            beforeEach( function ()
            {
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'stub' )
                writeSPPacketStub = sinon.stub( sp, 'writeSP' )//.callsFake(function(){writePacket.postWritePacketHelper()})
                preambleStub = sinon.stub( intellitouch, 'getPreambleByte' ).returns( 33 )

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



            it( 'toggle circuit 1', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'circuit/1/toggle' )


                //     console.log('logger?', loggers)
                //         console.log('sinon', sinon)
                writeSPPacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 255, 0, 255, 165, 33, 16, 33, 134, 2, 1, 1, 1, 129 ] )

            } );

            it( 'set circuit 1 on', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'circuit/2/set/1' )
                writeSPPacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 255, 0, 255, 165, 33, 16, 33, 134, 2, 2, 1, 1, 130 ] )
            } );

            it( 'toggle circuit 1', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'circuit/3/toggle' )
                writeSPPacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 255, 0, 255, 165, 33, 16, 33, 134, 2, 3, 1, 1, 131 ] )
            } );

            it( 'cancels the delay', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'cancelDelay' )
                writeSPPacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 255, 0, 255, 165, 33, 16, 33, 131, 1, 0, 1, 123 ] )
            } );
        } );
    } );
} );