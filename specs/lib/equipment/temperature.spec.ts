import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, updateAvailable } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
let loggers: Init.StubType;

describe( 'tests temperature functions', function ()
{
    describe( '#when requested', function ()
    {

        before( async function ()
        {
            await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_vanilla.json' } )
        } )

        beforeEach( function ()
        {
            loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
        } )

        afterEach( function ()
        {
            sinon.restore()
        } )

        after( async function ()
        {
            await globalAny.stopAllAsync()
        } )

        it( '#decodes temperature packet from the controller', async function ()
        {
            let tempPkt = [ 255, 0, 255, 165, 33, 15, 16, 8, 13, 51, 51, 58, 70, 92, 0, 0, 0, 55, 0, 0, 0, 0, 2, 115 ]
            let temps = temperature.getTemperature()
            temps.temperature.poolTemp.should.equal( 0 )
            packetBuffer.push( new Buffer( tempPkt ) )
            await globalAny.wait( 550 )
            temps = temperature.getTemperature()
            temps.temperature.poolTemp.should.equal( 51 )
        } )

        it( 'returns temps in a JSON', async function ()
        {
            let obj = await globalAny.requestPoolDataWithURLAsync( 'temperature' )
            obj.temperature.poolTemp.should.equal( 51 );
        } );

    } )
} )
