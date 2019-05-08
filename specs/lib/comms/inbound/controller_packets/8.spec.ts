import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers, decodeHelper, processController, processChlorinator, processPump } from '../../../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let queuePacketStub: sinon.SinonStub;

describe( 'processes 8 (Heat mode/set point) packets', function ()
{
    var data = [
        Buffer.from( [ 255, 0, 255, 165, 33, 15, 16, 8, 13, 60, 60, 55, 89, 91, 7, 0, 0, 51, 0, 0, 0, 0, 2, 151 ] )
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
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
                queuePacketStub = sinon.stub( queuePacket, 'queuePacket' )
                heat.init()
            } )

            afterEach( function ()
            {
                sinon.restore()
            } )

            after( async function ()
            {
                await globalAny.stopAllAsync()
            } )

            it( '#Pool set point should be Solar Only @ 89 degrees', async function ()
            {
                packetBuffer.push( data[ 0 ] )
                await globalAny.wait( 100 )
                let json = temperature.getTemperature().temperature
                //console.log('json for heat: ', JSON.stringify(json,null,2))
                json.poolHeatModeStr.should.equal( 'Solar Only' )
                json.poolSetPoint.should.equal( 89 )
            } )
        } )


    } )
} )