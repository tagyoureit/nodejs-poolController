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
let writeNetPacketStub: sinon.SinonStub
let queuePacketStub: sinon.SinonStub
let checkIfNeedControllerConfigurationStub: sinon.SinonStub

let data = [
    Buffer.from( [ 255, 0, 255, 165, 33, 15, 16, 8, 13, 60, 60, 55, 70, 100, 7, 0, 0, 51, 0, 0, 0, 0, 2, 141 ] )
]
describe( 'server', function ()
{
    describe( '#heat api calls', function ()
    {

        context( 'with a URL', function ()
        {

            before( async function ()
            {
                await globalAny.initAllAsync()
            } )

            beforeEach( async function ()
            {
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
                queuePacketStub = sinon.stub( queuePacket, 'queuePacket' )
                sinon.stub( intellitouch, 'getPreambleByte' ).returns( 33 )
                writeSPPacketStub = sinon.stub( sp, 'writeSP' ).callsFake( function () { writePacket.postWritePacketHelper() } )
                writeNetPacketStub = sinon.stub( sp, 'writeNET' ).callsFake( function () { writePacket.postWritePacketHelper() } )
                checkIfNeedControllerConfigurationStub = sinon.stub( intellitouch, 'checkIfNeedControllerConfiguration' ).returns(0)
                queuePacket.init()
                packetBuffer.push( data[ 0 ] )
                await globalAny.wait(200) // wait for buffer to process.
            } )

            afterEach( function ()
            {
                queuePacket.init()
            } )

            after( async function ()
            {
                sinon.restore()
                await globalAny.stopAllAsync()
            } )

            it( 'set spa heat to 103', async function ( )
            {
                console.log(`heat?? ${JSON.stringify(heat.getCurrentHeat())}`)
                return promise.resolve()
                    .then( () =>
                    {
                        console.log(`calling request pool data with url async`)
                        return globalAny.requestPoolDataWithURLAsync( 'spaheat/setpoint/103' )
                                
                    } )
                    .delay( 1000 )
                    .then( () =>
                    {
                        console.log( `analyzing results` )
                        console.log(queuePacketStub.args[0][0])
                        queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 33, 16, 33, 136, 4, 70, 103, 7, 0 ] )
                    
                })
                
            } );

            it( 'increment spa heat by 1', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'spaheat/increment' )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 33, 16, 33, 136, 4, 70, 101, 7, 0 ] )
            } );

            it( 'increment spa heat by 2', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'spaheat/increment/2' )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 33, 16, 33, 136, 4, 70, 102, 7, 0 ] )
            } );

            it( 'decrement spa heat by 1', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'spaheat/decrement' )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 33, 16, 33, 136, 4, 70, 99, 7, 0 ] )
            } );

            it( 'decrement spa heat by 5', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'spaheat/decrement/5' )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 33, 16, 33, 136, 4, 70, 95, 7, 0 ] )
            } );

            it( 'set spa heat mode to 0 (off)', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'spaheat/mode/0' )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 33, 16, 33, 136, 4, 70, 100, 3, 0 ] )
            } );

            it( 'set spa heat mode to 1 (heater)', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'spaheat/mode/1' )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 33, 16, 33, 136, 4, 70, 100, 7, 0 ] )
            } );

            it( 'set pool heat to 82', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'poolheat/setpoint/82' )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 33, 16, 33, 136, 4, 82, 100, 7, 0 ] )
            } );

            it( 'increment pool heat by 1', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'poolheat/increment' )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 33, 16, 33, 136, 4, 71, 100, 7, 0 ] )
            } );

            it( 'increment pool heat by 2', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'poolheat/increment/2' )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 33, 16, 33, 136, 4, 72, 100, 7, 0 ] )
            } );

            it( 'decrement pool heat by 1', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'poolheat/decrement' )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 33, 16, 33, 136, 4, 69, 100, 7, 0 ] )
            } );

            it( 'decrement pool heat by 5', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'poolheat/decrement/5' )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 33, 16, 33, 136, 4, 65, 100, 7, 0 ] )
            } );

            it( 'set pool heat mode to 0 (off)', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'poolheat/mode/0' )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 33, 16, 33, 136, 4, 70, 100, 4, 0 ] )
            } );

            it( 'set pool heat mode to 1 (heater)', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'poolheat/mode/1' )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 33, 16, 33, 136, 4, 70, 100, 5, 0 ])
            } );
        } );
    } );
} );
