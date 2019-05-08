import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers, decodeHelper, processController, processChlorinator, processPump } from '../../../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let controllerConfigNeededStub: sinon.SinonStub;
let queuePacketStub: sinon.SinonStub;
let updateAvailStub: sinon.SinonStub;

describe( 'processes 17 (Schedule) packets', function ()
{
    let data = [
        Buffer.from( [ 255, 0, 255, 165, 16, 15, 16, 17, 7, 1, 6, 9, 25, 15, 55, 255, 2, 90 ] )
    ]

    let equip = 'controller'

    describe( '#When packets arrive', function ()
    {
        context( 'via serialport or Socat', function ()
        {

            before( async function ()
            {
                await globalAny.initAllAsync()
                let fakeObj: IUpdateAvailable.Ijsons = { local: { version: '1.2.3' }, remote: { version: '4.5.6', tag_name: '4.5.6' }, result: 'faked9!' }
                updateAvailStub = sinon.stub( updateAvailable, 'getResultsAsync' ).returns( Promise.resolve( fakeObj ) )
            } );

            beforeEach( function ()
            {
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
                queuePacketStub = sinon.stub( queuePacket, 'queuePacket' )
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

            it( '#Schedule 1 should have ID:1 START_TIME:09:20', async function ()
            {
                globalAny.schedules_chk.forEach( function ( el: number[] )
                {
                    packetBuffer.push( Buffer.from( el ) )
                } )
                await globalAny.wait( 200 )
                let json = schedule.getCurrentSchedule().schedule
                json[ 1 ].ID.should.equal( 1 )
                json[ 1 ].START_TIME.should.equal( "09:20" )
                json[ 1 ].CIRCUITNUM.should.equal( 6 )
            } )
        } )
    } )
} )
