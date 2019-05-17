import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, updateAvailable, io, writePacket, clientConfig } from '../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
let loggers: Init.StubType;
import * as ioclient from 'socket.io-client';
import _path = require( 'path' )
let path = _path.posix
import * as fs from 'fs'
let updateAvailStub: sinon.SinonStub

describe( 'updates/resets client configClient.json', function ()
{
    context( 'when called with the internal function', function ()
    {

        before( async function ()
        {
            await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_clientConfig.json' } )
        } )

        beforeEach( async function ()
        {
            loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
            let fakeObj: IUpdateAvailable.Ijsons = { local: { version: '1.2.3' }, remote: { version: '4.5.6', tag_name: '4.5.6' }, result: 'faked1!' }
            updateAvailStub = sinon.stub( updateAvailable, 'getResultsAsync' ).returns( Promise.resolve( fakeObj ) )
        } )

        afterEach( async function ()
        {
            sinon.restore()
            clientConfig.resetPanelState()
        } )

        after( async function ()
        {
            await globalAny.stopAllAsync()
        } )

        describe( '#updates panelState', function ()
        {
            it( 'resets all panelStates to visible', async function () 
            {
                clientConfig.resetPanelState()
                await globalAny.wait( 150 )
                let changed = settings.get( 'client' )
                for ( var key in changed.panelState )
                {
                    changed.panelState[ key ].state.should.eq( "visible" )
                }
            } )

            it( 'changes system state from visible to hidden', async function ()
            {
                clientConfig.updateConfigEntry( 'panelState', 'system', 'state', 'hidden' )
                await globalAny.wait( 50 )

                let configClient = settings.get( 'client' )
                configClient.panelState.system.state.should.eq( 'hidden' )
            } );

            it( 'changes hideAux state from visible (false) to hidden (true)', async function ()
            {
                clientConfig.updateConfigEntry( 'hideAux', null, null, true )
                await globalAny.wait( 50 )
                let configClient = settings.get( 'client' )
                configClient.hideAux.should.eq( true )

            } );

            it( 'receives a property it cannot find (should fail)',   async ()=>
            {
                let configClient = settings.get( 'client' )
                loggers.loggerWarnStub.restore()
                loggers.loggerWarnStub = sinon.stub( logger, 'warn' )
                clientConfig.updateConfigEntry( 'not', 'here', null, true )
                await globalAny.wait(50)
                let changed = settings.get( 'client' )
                    configClient.should.deep.eq( changed )  
            } );
        } );
    } )

    context( 'when called with the Socket API', function ()
    {

        before( async function ()
        {
            await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_clientConfig.json' } )
        } )

        beforeEach( async function ()
        {
            loggers = globalAny.setupLoggerStubOrSpy( 'spy', 'spy' )
            let fakeObj: IUpdateAvailable.Ijsons = { local: { version: '1.2.3' }, remote: { version: '4.5.6', tag_name: '4.5.6' }, result: 'faked1a!' }
            updateAvailStub = sinon.stub( updateAvailable, 'getResultsAsync' ).returns( Promise.resolve( fakeObj ) )
        } )

        afterEach( async function ()
        {
            sinon.restore()
            clientConfig.resetPanelState()
        } )

        after( async function ()
        {
            await globalAny.stopAllAsync()
        } )

        describe( '#updates panelState', function ()
        {
            it( '#resets the Client Config Settings with Socket.IO',  (done) =>
            {
                let client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )
                client.on( 'connect', async function ()
                {
                    client.emit( 'resetConfigClient' )
                    client.disconnect()
                    await globalAny.wait( 200 )
                    let configClient = settings.get( 'client' )
                    for ( var key in configClient.panelState )
                    {
                       configClient.panelState[ key ].state.should.eq("visible" )
                    }
                    done()
                } )
            } )

            it( 'changes system state from visible to hidden',  (done) =>
            {
                let client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )
                client.on( 'connect', async function ()
                {
                    client.emit( 'setConfigClient', 'panelState', 'system', 'state', 'hidden' )
                    client.disconnect()
                    await globalAny.wait( 50 )
                    let changed = settings.get( 'client' )
                    changed.panelState.system.state.should.eq( 'hidden' )
                    done()
                } )
            } );


            it( 'changes hideAux state from visible (false) to hidden (true)',  (done) =>
            {
                let client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )
                client.on( 'connect', async function ()
                {
                    client.emit( 'setConfigClient', 'hideAux', null, null, true )
                    client.disconnect()
                    await globalAny.wait( 200 )
                    let changed = settings.get( 'client' )
                    changed.hideAux.should.eq( true )
                    done()
                } )
            } )


            it( 'receives a property it cannot find (should fail)',  (done)=>
            {
                loggers.loggerWarnStub.restore()
                loggers.loggerWarnStub = sinon.stub( logger, 'warn' )
                let configClient = settings.get( 'client' )
                let client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )
                client.on( 'connect', async function ()
                {
                    client.emit( 'setConfigClient', 'not', 'here', null, true )
                    client.disconnect()
                    await globalAny.wait( 25 )
                    let changed = settings.get( 'client' )
                    changed.should.deep.eq( configClient )
                    done()
                } )

            } );
        } );
    } )
} )