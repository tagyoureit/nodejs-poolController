import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, updateAvailable, io, writePacket } from '../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
let loggers: Init.StubType;
import * as ioclient from 'socket.io-client';
import _path = require( 'path' )
let path = _path.posix
import * as fs from 'fs'
import nock = require( 'nock' );
//TODO: Why is this test not respecting the Stub & Spy methods on logger?
describe( 'checks if there is a newer version available', function ()
{
    describe( '#by talking (stubing) to Git', function ()
    {
        beforeEach( async function ()
        {
            loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
        } )

        afterEach( async function ()
        {
            writePacket.init()
            queuePacket.init()
            nock.cleanAll()
            sinon.restore()
            await globalAny.stopAllAsync()
        } )

        it( '#notifies of a new release available (remote > local)', function ()
        {
            // published release: 4.1.200
            // current version running: 4.1.0
            // cached remote release: 3.0.0
            // dismissUntilNextVerBump: false
            // expected result: update avail notifies of new release
            console.log( `starting 1` )
            this.timeout( 10000 ) //times out on Travis with 5000 timeout.

            let scope1 = nock( 'https://api.github.com' )
                .get( '/repos/tagyoureit/nodejs-poolController/releases/latest' )
                .replyWithFile( 200, path.join( process.cwd(), './specs/assets/webJsonReturns/gitLatestRelease4.1.200.json' ) )
                .persist().log( console.log )

            return promise.resolve()
                .then( globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_updateavail_410_dismissfalse.json' } ) )
                .then( () => { return updateAvailable.initAsync( './specs/assets/package.json' ) } )
                .delay( 200 )
                .then( updateAvailable.getResultsAsync )
                .then( ( res: IUpdateAvailable.Ijsons ) =>
                {
                    res.result.should.eq( 'local_is_older' )
                    let _configfile = fs.readFileSync( path.join( process.cwd(), './specs/assets/config/config.json' ), 'utf-8' )
                    let configFile = JSON.parse( _configfile )
                    configFile.meta.notifications.version.remote.version.should.equal( '4.1.200' )
                    scope1.done()
                    console.log( `ending 1` )
                } )
        } )

        it( '#notifies of a new release available (remote > local) with local cached version blank', function ()
        {
            // published release: 4.1.200
            // current version running: 4.1.0
            // cached remote release:
            // dismissUntilNextVerBump: false
            // expected result: update avail notifies of new release

            this.timeout( '10s' ) //times out on Travis with 5000 timeout.
            let scope2 = nock( 'https://api.github.com' )
                .get( '/repos/tagyoureit/nodejs-poolController/releases/latest' )
                .replyWithFile( 200, path.join( process.cwd(), './specs/assets/webJsonReturns/gitLatestRelease4.1.200.json' ) )
                .persist()
                .log( console.log )
            console.log( `starting 2` )
            return promise.resolve()
                .then( globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_updateavail_blank.json' } ) )
                .then( () => { updateAvailable.initAsync( './specs/assets/package.json' ) } )
                .delay( 200 )
                .then( updateAvailable.getResultsAsync )
                .then( ( res: IUpdateAvailable.Ijsons ) =>
                {
                    res.result.should.eq( 'local_is_older' )
                    // check the file now has the right version stored
                    let file = fs.readFileSync( path.join( process.cwd(), './specs/assets/config/config.json' ), 'utf-8' )
                    let configFile: IUpdateAvailable.Ijsons = JSON.parse( file )
                    configFile.meta.notifications.version.remote.version.should.equal( '4.1.200' )
                    scope2.done()
                    console.log( `ending 2` )
                } )
        } )

        it( '#returns with newer version running locally (newer > remote)', function ( done )
        {
            // published release: 4.0.0
            // current version running: 4.1.0
            // cached remote release: 4.1.0
            // dismissUntilNextVerBump: false
            // expected result: update avail notifies of new release

            let scope3 = nock( 'https://api.github.com' )
                .get( '/repos/tagyoureit/nodejs-poolController/releases/latest' )
                .replyWithFile( 200, path.join( process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease4.0.0.json' ) )
                .persist()
                .log( console.log )
            let client: SocketIOClient.Socket;
            this.timeout( '10s' )
            console.log( `starting 3` )

            promise.resolve()
                .then( () => { return globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_updateavail_410_dismissfalse.json' } ) } )
                .then( () => { return updateAvailable.initAsync( './specs/assets/package.json' ) } )
                .delay( 500 )
                .then( () =>
                {
                    client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )
                    client.on( 'connect', async function ()
                    {
                        io.emitToClients( 'updateAvailable' )
                    } )
                    client.on( 'updateAvailable', function ( msg: IUpdateAvailable.Ijsons )
                    {
                        console.log( `received...` )
                        console.log( JSON.stringify( msg, null, 2 ) )
                        msg.result.should.equal( 'local_is_newer' )
                        client.disconnect()
                        scope3.done()
                        console.log( `ending 3` )
                        done()
                    } )
                } )
        } )


        it( '#sends updateAvailable with dismissUntilNextRemoteVersionBump=false', function ( done )
        {
            // published release: 4.1.200
            // current version running: 4.1.0
            // cached remote release: 3.0.0
            // dismissUntilNextVerBump: false
            // expected result: update avail notifies of new release
            let scope4 = nock( 'https://api.github.com' )
                .get( '/repos/tagyoureit/nodejs-poolController/releases/latest' )
                .replyWithFile( 200, path.join( process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease4.1.200.json' ) )
                .persist().log( console.log )
            console.log( `starting 4` )
            this.timeout( '10s' )

            let client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )
            client.on( 'connect', function ()
            {
                // note: do NOT request emit updateAvailable here because it should emit automatically
            } )
            client.on( 'updateAvailable', function ( msg: IUpdateAvailable.Ijsons )
            {
                if ( msg.result === '' )
                {
                    // TODO: doing an extra emit now with added code for updatePanelState of code status...look to fix ?
                    logger.info(`Skipping empty results... known item for now.`)
                }
                else
                {
                    // console.log( `message???` )
                    // console.log( msg )
                    msg.result.should.equal( 'local_is_older' )
                    client.disconnect()
                    scope4.done()
                    // console.log( `ending 4` )
                    done()
                    
                }
            } )
            promise.resolve()
                .then( () => { return globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_updateavail_410_dismissfalse.json' } ) } )
                .then( () => { return updateAvailable.initAsync( './specs/assets/package.json' ) } )
                .delay( 200 )


        } )

        it( '#should not send updateAvailable equal with dismissUntilNextRemoteVersionBump=true', async function ()
        {

            // published release: 4.1.0
            // current version running: 4.1.0
            // cached remote release: 4.1.0
            // dismissUntilNextVerBump: true
            // expected result: no updateAvail socket sent because of dismissUntil; versions equal
            let scope5 = nock( 'https://api.github.com' )
                .get( '/repos/tagyoureit/nodejs-poolController/releases/latest' )
                .replyWithFile( 200, path.join( process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease4.1.0.json' ) )
                .persist()

            console.log( `starting 5` )
            let client: SocketIOClient.Socket

            client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )
            client.on( 'connect', async function ()
            {
                // note: do NOT request emit updateAvailable here because it should emit automatically
                // wait for any socket response
                await globalAny.wait( 300 )
            } )
            client.on( 'updateAvailable', function ( msg: IUpdateAvailable.Ijsons )
            {
                client.disconnect()
                '1'.should.not.eq( '2' )

            } )
            await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_updateavail_410_dismisstrue.json' } )
            await updateAvailable.initAsync( '/specs/assets/package.json' )
            await globalAny.wait( 100 )
            let res = await updateAvailable.getResultsAsync()
            res.result.should.equal( 'equal' )
            client.disconnect()
            scope5.done()
            console.log( `ending 5` )





            /*    return new promise( function ( resolve, reject )
               {
                   return promise.resolve()
                       .then( () =>
                       {
                           return globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_updateavail_410_dismisstrue.json' } )
    
                       } )
    
                       .then( () => { return updateAvailable.initAsync( '/specs/assets/package.json' ) } )
                       .delay( 200 )
                       .then( updateAvailable.getResultsAsync )
                       .then( ( res: IUpdateAvailable.Ijsons ) =>
                       {
                           res.result.should.equal( 'equal' )
                           client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )
                           client.on( 'connect', function ()
                           {
                               // note: do NOT request emit updateAvailable here because it should emit automatically
                           } )
                           client.on( 'updateAvailable', function ( msg: IUpdateAvailable.Ijsons )
                           {
                               client.disconnect()
                               '1'.should.not.eq( '2' )
                               reject( 'should not receive an emit' )
                           } )
    
    
                       } )
                       .delay( 100 )
                       .then( () =>
                       {
                           client.disconnect()
                           scope5.done()
                           console.log( `ending 5` )
                           resolve()
                       } )
               } ) */
        } )




        it( '#should send updateAvailable with dismissUntilNextRemoteVersionBump=true (new version available)', async function ()
        {

            // published release: 4.1.200
            // current version running: 4.1.0
            // cached remote release: 4.1.0
            // dismissUntilNextVerBump: true
            // expected result: current release is 'older'.
            let scope6 = nock( 'https://api.github.com' )
                .get( '/repos/tagyoureit/nodejs-poolController/releases/latest' )
                .replyWithFile( 200, path.join( process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease4.1.200.json' ) )
                .persist()
                .log( console.log )
            console.log( `starting 6` )

            await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_updateavail_410_dismisstrue.json' } )
            await updateAvailable.initAsync( './specs/assets/package.json' )

            await globalAny.wait( 100 )
            let client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )

            client.on( 'connect', async function ()
            {
                io.emitToClients( 'updateAvailable' )
                // wait for the socket response
                await globalAny.wait( 200 )
            } )
            client.on( 'updateAvailable', function ( msg: IUpdateAvailable.Ijsons )
            {
                msg.result.should.equal( 'local_is_older' )
                client.disconnect()
                scope6.done()
                console.log( 'ending 6' )
            } )





            /*
                        return promise.resolve()
                            .then( () => { return globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_updateavail_410_dismisstrue.json' } ) } )
                            .then( () => { return updateAvailable.initAsync( './specs/assets/package.json' ) } )
                            .delay( 200 )
                            .then( () =>
                            {
                                let client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )
    
                                client.on( 'connect', function ()
                                {
                                    io.emitToClients( 'updateAvailable' )
                                } )
                                client.on( 'updateAvailable', function ( msg: IUpdateAvailable.Ijsons )
                                {
                                    msg.result.should.equal( 'local_is_older' )
                                    client.disconnect()
                                    scope6.done()
                                    console.log( 'ending 6' )
                                } )
    
                            } )
                            .delay( 1000 ) */
        } )
    } )
} )