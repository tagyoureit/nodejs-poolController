import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers, decodeHelper, processController, processChlorinator, processPump } from '../../../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let updateAvailStub: sinon.SinonStub;
let queuePacketStub: sinon.SinonStub;

describe( 'processes 2 (Status) packets', function ()
{
    var data = [
        Buffer.from( [ 255, 0, 255, 165, 33, 15, 16, 2, 29, 12, 41, 32, 0, 0, 0, 0, 0, 0, 0, 3, 0, 64, 4, 60, 60, 0, 0, 62, 71, 0, 0, 0, 0, 0, 74, 142, 0, 13, 3, 130 ] )
    ]

    var equip = 'controller'

    describe( '#When packets arrive', function ()
    {
        context( 'via serialport or Socat', function ()
        {

            before( async function ()
            {
                await globalAny.initAllAsync()
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
                queuePacketStub = sinon.stub(queuePacket, 'queuePacket')
                let fakeObj: IUpdateAvailable.Ijsons = { local: { version: '1.2.3' }, remote: { version: '4.5.6', tag_name: '4.5.6' }, result: 'faked5!' }
                updateAvailStub = sinon.stub( updateAvailable, 'getResultsAsync' ).returns( Promise.resolve( fakeObj ) )
            } );

            beforeEach( async function ()
            {
                
            } )

            afterEach( function ()
            {
                circuit.init()
            } )
            
            after( async function ()
            {
                sinon.restore()
                await globalAny.stopAllAsync()
            } )

            it( '#Processes a controller status packet', async function ()
            {
                packetBuffer.push( data[ 0 ] )
                await globalAny.wait( 50 )
                let temp = temperature.getTemperature() 
                temp.temperature.airTemp.should.equal( 62 )
                time.getTime().time.controllerTime.should.equal( '12:41 PM' )
            } )

            it( '#Processes a Duplicate Broadcast controller status packet', async function ()
            {
                packetBuffer.push( data[ 0 ] )
                packetBuffer.push( data[ 0 ] )
                await globalAny.wait( 50 )
                let _temp = temperature.getTemperature() 
                _temp.temperature.airTemp.should.equal( 62 )
                let _time = time.getTime()
                _time.time.controllerTime.should.equal( '12:41 PM' )
                var text = 'not found'
                // iterate through debug statements to see if we find 'duplicate broadcast
                loggers.loggerDebugStub.args.forEach( function ( i: string[] )
                {
                    i.forEach( function ( j )
                    {
                        if ( typeof j === 'string' )
                        {
                            if ( j.includes( 'Duplicate broadcast' ) )
                            {
                                text = 'found'
                            }
                        }
                    } )
                } )
                text.should.eq( 'found' )
                // loggers.loggerDebugStub.args[4][0].should.contain('Duplicate broadcast.')
            } )
        } )
    } )
} )