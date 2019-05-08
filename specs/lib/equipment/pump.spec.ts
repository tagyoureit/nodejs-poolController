import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, updateAvailable } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
let loggers: Init.StubType;

describe( 'pump controller initialized', function ()
{
    before( async function ()
    {
        await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config.pump.VS.json' } )
    } );

    beforeEach( function ()
    {
        loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'stub' )
    } )

    afterEach( function ()
    {
        // sinon.restore()
    } )

    after( async function ()
    {
        await globalAny.stopAllAsync()
    } )

    it( 'initializes the pump variables', function ()
    {
        var pumpStatus = pump.getCurrentPumpStatus().pump
        pumpStatus[ 1 ].externalProgram[ 2 ].should.eq( 2500 )
        pumpStatus[ 2 ].externalProgram[ 3 ].should.eq( 3450 )
    } )
} )

describe( 'pump controller initializes with 16 pumps', function ()
{

    before( async function ()
    {
        await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_16_pumps.json' } )
    } );

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
    
    it( 'initializes the pump variables with 16 pumps', () =>
    {
        var pumpStatus = pump.getCurrentPumpStatus().pump
        // console.log('pumpStatus: %j', pumpStatus)
        pumpStatus[ 1 ].externalProgram[ 2 ].should.eq( 2500 )
        pumpStatus[ 2 ].externalProgram[ 3 ].should.eq( 3450 )
        pumpStatus[ 16 ].pump.should.eq( 16 )
        pumpStatus[ 16 ].name.should.eq( 'Pump 16' )
    } )
} )
