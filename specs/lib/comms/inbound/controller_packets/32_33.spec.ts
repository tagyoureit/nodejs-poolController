import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers, decodeHelper, processController, processChlorinator, processPump } from '../../../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let controllerConfigNeededStub: sinon.SinonStub;
let queuePacketStub: sinon.SinonStub;
let writeNETPacketStub: sinon.SinonStub;
let writeSPPacketStub: sinon.SinonStub
import { getSpaSideRemotes } from '../../../../../src/lib/comms/inbound/controller/32_33'
// TODO: replace all packet stubs with tests that get results from Mock Serialport

describe( 'processes 32_33 (Spa Side Remotes) packets', function ()
{
    var data = [

        Buffer.from( [ 255, 0, 255, 165, 33, 15, 16, 32, 11, 1, 8, 2, 7, 7, 5, 8, 9, 8, 9, 3, 1, 83 ] ),
        Buffer.from( [ 255, 0, 255, 165, 33, 15, 16, 32, 11, 0, 1, 5, 18, 13, 5, 6, 7, 8, 9, 10, 1, 98 ] ),
        Buffer.from( [ 255, 0, 255, 165, 33, 15, 16, 33, 4, 12, 7, 14, 5, 1, 48 ] )
    ]

    var equip = 'controller'

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
                // sinon = sinon.sinon.create()
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
                queuePacketStub = sinon.stub( queuePacket, 'queuePacket' )


                writeSPPacketStub = sinon.stub( sp, 'writeSP' )
                writeNETPacketStub = sinon.stub( sp, 'writeNET' )
                controllerConfigNeededStub = sinon.stub( intellitouch, 'checkIfNeedControllerConfiguration' )

            } )

            afterEach( function ()
            {
                sinon.restore()

            } )

            after( async function ()
            {
                await globalAny.stopAllAsync()
            } )

            it( '#Spa side remote is4/is10/Quicktouch', async function ()
            {

                globalAny.customNames_chk.forEach( function ( el: Buffer )
                {
                    packetBuffer.push( el )
                } )
                globalAny.circuits_chk.forEach( function ( el: Buffer )
                {
                    packetBuffer.push( el )
                } )
                data.forEach( function ( el )
                {
                    packetBuffer.push( el )
                } )

                await globalAny.wait( 200 )
                let spaSideRemotes = getSpaSideRemotes()
                spaSideRemotes.is4.button1.should.eq( 'SPA' )
                spaSideRemotes.is10.button1.should.eq( 'POOL LIGHT' )
                spaSideRemotes.quicktouch.button2.should.eq( 'SPA LIGHT' )
            } )
        } )

    } )
} )
