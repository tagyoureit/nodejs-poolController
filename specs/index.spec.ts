import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, intellitouch, temperature, UOM, valve, intellichem, chlorinatorController, promise, updateAvailable, integrations } from '../src/etc/internal';
import * as sinon from 'sinon'


const globalAny: any = global;

describe( 'nodejs-poolController', function ()
{
    describe( 'Loads/checks for a valid configuration file', function ()
    {
        before( async function ()
        {
            // initialize winston once with defaults
            await logger.init()
            await globalAny.wait( 50 )
            console.log( "done" )
            logger.info( "test logger" )
            logger.warn( "test warn" )
            logger.error( "test error" )
        } )

        beforeEach( function ()
        {
            let fakeObj: IUpdateAvailable.Ijsons = { local: { version: '1.2.3' }, remote: { version: '4.5.6', tag_name: '4.5.6' }, result: 'faked2!' }
            let updateAvailStub = sinon.stub( updateAvailable, 'getResultsAsync' ).returns( Promise.resolve(  fakeObj  ) )
            if ( globalAny.logInitAndStop )
            {
                let loggerInfoStub = sinon.spy( logger, 'info' )
                let loggerWarnStub = sinon.spy( logger, 'warn' )
                let loggerVerboseStub = sinon.spy( logger, 'verbose' )
                let loggerDebugStub = sinon.spy( logger, 'debug' )
                let loggerErrorStub = sinon.spy( logger, 'error' )
                let loggerSillyStub = sinon.spy( logger, 'silly' )
            }
            else
            {
                let loggerInfoStub = sinon.stub( logger, 'info' )
                let loggerWarnStub = sinon.stub( logger, 'warn' )
                let loggerVerboseStub = sinon.stub( logger, 'verbose' )
                let loggerDebugStub = sinon.stub( logger, 'debug' )
                let loggerErrorStub = sinon.stub( logger, 'error' )
                let loggerSillyStub = sinon.stub( logger, 'silly' )
                //consoleStub = sinon.stub(console, 'error')

            }
        } )

        afterEach( function ()
        {
            sinon.restore()
        } )

        after( async function ()
        {
            await globalAny.stopAllAsync()
        } )

        it( '#should load settings', async function ()
        {
            settings.load( { "configLocation": './specs/assets/config/config.json' } )
            settings.get( 'intellitouch.installed' ).should.equal( 1 )
        } )

        it( '#should load logger', function ()
        {
            logger.init()
            logger.info( "I can output to the console, woot!" )
            logger.should.exist

        } )

        it( '#loads/checks helper functions', function ( )
        {
            logger.init()
            settings.displaySettingsMsg()
            settings.getConfig()

            integrations.init()
            
        } )


        it( '#throws an error with invalid config', async function ()
        {
            try
            {
                let loggerErrorStub = sinon.stub( logger, 'error' )
                await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_not_here.json' } )
                sinon.assert.fail( 'Should not get here' )

            }
            catch ( err )
            {
                sinon.assert.pass( 'It failed, yay!' )
            }
        } )

    } )

} )


