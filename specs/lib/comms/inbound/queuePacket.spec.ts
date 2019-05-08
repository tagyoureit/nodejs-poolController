import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers } from '../../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let writeQueueActiveStub: sinon.SinonStub;
let writeSPPacketStub: sinon.SinonStub;
let writeNetPacketStub: sinon.SinonStub

describe( 'decodeHelper processes controller packets', function ()
{
    var pumpPacket = [ 165, 0, 96, 16, 6, 1, 10 ],
        chlorinatorPacket = [ 16, 2, 80, 20, 0 ],
        controllerPacket = [ 165, 99, 16, 34, 134, 2, 9, 0 ],
        heaterPacket = [ 165, 33, 16, 33, 136, 4, 70, 91, 1, 0 ]


    describe( '#When queueing packets', function ()
    {
        context( 'with write queue active = false (should write packets)', function ()
        {
            before( async function ()
            {
                await globalAny.initAllAsync()
            } );

            beforeEach( function ()
            {
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
                writeQueueActiveStub = sinon.stub( writePacket, 'isWriteQueueActive' ).returns( false )
                writeNetPacketStub = sinon.stub( sp, 'writeNET' )
                writeSPPacketStub = sinon.stub( sp, 'writeSP' )
                queuePacket.init()
            } )

            afterEach( function ()
            {
                queuePacket.init()
                writePacket.init()
                queuePacket.eject()
                sinon.restore()

            } )

            after( async function ()
            {
                await globalAny.stopAllAsync()
            } )

            it( '#queuePacket should try to write a chlorinator packet with checksum', async function ()
            {
                queuePacket.queuePacket( chlorinatorPacket )
                await globalAny.wait( 50 )
                queuePacket.first().should.deep.eq( [ 16, 2, 80, 20, 0, 118, 16, 3 ] )
                queuePacket.eject()
            } )

            it( '#queuePacket should try to write a pump packet with checksum', () =>
            {
                queuePacket.queuePacket( pumpPacket )
                //console.log('queuePacket.first()', queuePacket.first())
                queuePacket.first().should.deep.eq( [ 255, 0, 255, 165, 0, 96, 16, 6, 1, 10, 1, 38 ] )
                queuePacket.eject()

            } )

            it( '#queuePacket should try to write a controller packet with checksum', () =>
            {
                queuePacket.queuePacket( controllerPacket )
                //console.log('queuePacket.first()', queuePacket.first())
                queuePacket.first().should.deep.eq( [ 255, 0, 255, 165, 99, 16, 34, 134, 2, 9, 0, 1, 203 ] )
                queuePacket.eject()

            } )

            it( '#queuePacket should try to write a heat packet with checksum that will trigger a get temperature', () =>
            {
                queuePacket.queuePacket( heaterPacket )
                //console.log('queuePacket.first()', queuePacket.first())
                queuePacket.first().should.deep.eq( [ 255, 0, 255, 165, 33, 16, 33, 136, 4, 70, 91, 1, 0, 2, 37 ] )
                queuePacket.eject()
                loggers.loggerErrorStub.callCount.should.eq( 0 )
            } )
        } )
    } )


    describe( '#When queueing packets', function ()
    {
        context( 'with write queue active = false (should write packets); multiple tries', function ()
        {

            let pumpPacket = [ 165, 0, 96, 16, 6, 1, 10 ],
                chlorinatorPacket = [ 16, 2, 80, 20, 0 ],
                controllerPacket = [ 165, 99, 16, 34, 134, 2, 9, 0 ]

            before( async function ()
            {
                await globalAny.initAllAsync()
            } );

            beforeEach( function ()
            {
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'stub' )

                writeNetPacketStub = sinon.stub( sp, 'writeNET' ).callsFake( function ()
                {
                    writePacket.postWritePacketHelper()
                } )
                writeSPPacketStub = sinon.stub( sp, 'writeSP' ).callsFake( function ()
                {
                    writePacket.postWritePacketHelper()
                } )

                queuePacket.init()
                writePacket.init()
            } )

            afterEach( function ()
            {
                queuePacket.init()
                writePacket.init()
                queuePacket.eject()
                sinon.restore()
            } )

            after( async function ()
            {
                await globalAny.stopAllAsync()
            } )

            it( '#queuePacket should try to abort the write after 10 tries', async function () 
            {
                // Note: Do not use fat arrow syntax here or timeout won't work.
                this.timeout( 10000 )
                queuePacket.queuePacket( controllerPacket )
                queuePacket.first().should.deep.eq( [ 255, 0, 255, 165, 99, 16, 34, 134, 2, 9, 0, 1, 203 ] )
                await globalAny.wait( 5000 )
                loggers.loggerWarnStub.calledOnce
                loggers.loggerErrorStub.calledOnce
                loggers.loggerErrorStub.args[ 0 ][ 0 ].should.contain( 'Aborting controller packet' )
                //console.log('container.writePacket.isWriteQueueActive()', writePacket.isWriteQueueActive())
            } )
        } )
    } )
} )