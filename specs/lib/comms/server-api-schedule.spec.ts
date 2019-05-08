import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let updateAvailStub: sinon.SinonStub;
let writeSPPacketStub: sinon.SinonStub;
let writeNETPacketStub: sinon.SinonStub;
let checkIfNeedControllerConfigurationStub: sinon.SinonStub



describe( 'server', function ()
{
    describe( '#schedule api calls', function ()
    {
        context( 'with a URL', function ()
        {

            before( async function ()
            {
                await globalAny.initAllAsync()
            } )

            beforeEach( async function ()
            {
                loggers = globalAny.setupLoggerStubOrSpy( 'stspyub', 'spy' )
                sinon.stub( intellitouch, 'getPreambleByte' ).returns( 33 )

                writeSPPacketStub = sinon.stub( sp, 'writeSP' ).callsFake( function () { writePacket.postWritePacketHelper() } )
                writeNETPacketStub = sinon.stub( sp, 'writeNET' ).callsFake( function () { writePacket.postWritePacketHelper() } )
                checkIfNeedControllerConfigurationStub = sinon.stub( intellitouch, 'checkIfNeedControllerConfiguration' )

                globalAny.schedules_chk.forEach( function ( el: number[] )
                {
                    packetBuffer.push( Buffer.from( el ) )
                } )
                await globalAny.wait( 50 )
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

            it( 'send a packet to toggle schedule 1 day Sunday', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'schedule/toggle/id/1/day/1' )
                writeSPPacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 255, 0, 255, 165, 33, 16, 33, 145, 7, 1, 6, 9, 20, 15, 59, 254, 2, 251 ] )
            } );

            it( 'send a packet to delete schedule 1', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'schedule/delete/id/1' )
                writeSPPacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 255, 0, 255, 165, 33, 16, 33, 145, 7, 1, 0, 0, 0, 0, 0, 0, 1, 144 ] )

            } );

            it( 'send a packet to start schedule 1 at 11:11am', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'schedule/set/id/1/startOrEnd/start/hour/11/min/11' )
                writeSPPacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 255, 0, 255, 165, 33, 16, 33, 145, 7, 1, 6, 11, 11, 15, 59, 255, 2, 245 ] )
            } );

            it( 'send a packet to end schedule 1 at 12:12am', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'schedule/set/id/1/startOrEnd/end/hour/12/min/12' )
                writeSPPacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 255, 0, 255, 165, 33, 16, 33, 145, 7, 1, 6, 9, 20, 12, 12, 255, 2, 202 ] )
            } );

            it( 'send a packet to set schedule 1 to circuit 15', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'schedule/set/id/1/circuit/15' )
                writeSPPacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 255, 0, 255, 165, 33, 16, 33, 145, 7, 1, 15, 9, 20, 15, 59, 255, 3, 5 ] )
            } );

            it( 'send a packet to set schedule 1 to circuit 15, 1:23 to 3:45 on Sunday (old method)', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'setSchedule/1/15/1/23/3/45/1' )
                writeSPPacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 255, 0, 255, 165, 33, 16, 33, 145, 7, 1, 15, 1, 23, 3, 45, 1, 1, 232 ] )
            } );


            it( 'send a packet to set egg timer 9 to circuit 10, 3 hr 45 min', async function ()
            {
                await globalAny.requestPoolDataWithURLAsync( 'eggtimer/set/id/9/circuit/10/hour/3/min/45' )
                writeSPPacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 255, 0, 255, 165, 33, 16, 33, 145, 7, 9, 10, 25, 0, 3, 45, 0, 1, 235 ] )
            } );

        } );

    } );
} )