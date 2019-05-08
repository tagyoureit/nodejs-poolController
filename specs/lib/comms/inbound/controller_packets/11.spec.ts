import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers, decodeHelper, processController, processChlorinator, processPump } from '../../../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let controllerConfigNeededStub: sinon.SinonStub;

describe( 'processes 11 (Get Current Circuits) packets', function ()
{
    var data = [
        Buffer.from( [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 1, 1, 72, 0, 0, 1, 63 ] ),
        Buffer.from( [ 255, 0, 255, 165, 33, 15, 16, 11, 5, 2, 0, 46, 0, 0, 1, 37 ] )
    ]

    var equip = 'controller'

    describe( '#When packets arrive', function ()
    {
        context( 'via serialport or Socat', function ()
        {

            before( async function ()
            {
                // let fakeObj: IUpdateAvailable.Ijsons = { local: { version: '1.2.3' }, remote: { version: '4.5.6', tag_name: '4.5.6' }, result: 'faked4!' }
                // updateAvailStub = sinon.stub( updateAvailable, 'getResultsAsync' ).returns( Promise.resolve( fakeObj ) )
                await globalAny.initAllAsync()
            } );

            beforeEach( function ()
            {
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
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

            it( '#Circuit 1 should be a Spa Circuit', async function ()
            {
                packetBuffer.push( data[ 0 ] )
                await globalAny.wait( 50 )
                let json = circuit.getCurrentCircuits().circuit
                json[ 1 ].number.should.equal( 1 )
                json[ 1 ].name.should.equal( "SPA" )
            } )
        } )
    } )
} )
