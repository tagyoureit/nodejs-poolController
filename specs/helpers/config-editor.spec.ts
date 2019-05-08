import
{
    settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, io,
    pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController,
    promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers, pumpController, pumpControllerMiddleware,
} from '../../src/etc/internal';
import * as sinon from 'sinon';
import nock = require( 'nock' );
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let settingsStub: sinon.SinonStub;
let queuePacketStub: sinon.SinonStub;
import * as ioclient from 'socket.io-client'
import * as fs from 'fs';

describe( 'updates config.json variables', function ()
{
    context( 'when called with the internal function', function ()
    {


        before( async function ()
        {


        } )

        beforeEach( async function ()
        {

            await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config.pump.VS.json' } )

            loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'stub' )

        } )

        afterEach( async function ()
        {
            sinon.restore()
            await globalAny.stopAllAsync()
        } )

        after( async function ()
        {


        } )

        // it('#gets version notification information', function(done) {
        // myModule.__with__({
        //     'settings.configurationFile': '/specs/assets/config/config.json'
        //
        // })(function() {
        //     return Promise.resolve()
        //         .then(function() {
        //             return myModule(bottle.container).getVersionNotification()
        //         })
        //         .then(function(data) {
        //             data.tag_name.should.eq('v3.1.13')
        //             done()
        //         })
        //         .catch(function(err) {
        //         /* istanbul ignore next */
        //             console.log('error with getting version notification:', err)
        //         })
        //
        // })
        // });

        // it('#tests updateExternalPumpProgramAsync', function(done) {
        //     myModule.__with__({
        //         'settings.configurationFile': '/specs/assets/config/config.json'
        //
        //     })(function() {
        //         myModule(bottle.container).updateExternalPumpProgramAsync(1, 1, 500)
        //         setTimeout(function() {
        //             //need delay to allow for file to write to disk
        //             return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/config.json'), 'utf-8')
        //                 .then(function(changed) {
        //                     changed = JSON.parse(changed)
        //                     changed.equipment.pump[1].externalProgram[1].should.eq(500)
        //                     done()
        //                 })
        //
        //         }, 150)
        //
        //     })
        // });


        // it('sets updateVersionNotificationSetting variables', function(done) {
        // verStub = sinon.stub(updateAvailable, 'getResultsAsync').returns({
        //     "version": "10.10.10",
        //     "tag_name": "v10.10.10"
        // })
        // myModule.__with__({
        //     //'dir': '/specs/assets',
        //     'settings.configurationFile': '/specs/assets/config/config.json'
        //
        // })(function() {
        //     return Promise.resolve()
        //         .then(function() {
        //             myModule(bottle.container).updateVersionNotificationSetting(true)
        //         })
        //         .delay(150)
        //         .then(function() {
        //             return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/config.json'), 'utf-8')
        //                 .then(function(changed) {
        //                     changed = JSON.parse(changed)
        //                     changed.notifications.version.remote.dismissUntilNextRemoteVersionBump.should.eq(true)
        //                 })
        //         })
        //         .then(function() {
        //             verStub.restore()
        //             done()
        //         })
        //         .catch(function(err) {
        //         /* istanbul ignore next */
        //             console.log('some error with updateVersionNotificationSetting:', err)
        //         })
        // })
        // })

        it( '#gets pumpExternalProgram', async function ()
        {
            let data = settings.getPumpExternalProgram( 1 )
            data[ 1 ].should.eq( 1000 )
        } )
    } )
    context( 'when called with the Socket API', function ()
    {
        describe( '#updates config.json', function ()
        {
            let scope
            before( async function ()
            {


            } )

            beforeEach( async function ()
            {
                await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_updateavail_410_dismissfalse.json' } )
                loggers = globalAny.setupLoggerStubOrSpy( 'spy', 'spy' )
            } )

            afterEach( async function ()
            {
                nock.cleanAll()
                sinon.restore()
                await globalAny.stopAllAsync()
            } )

            after( async function ()
            {

            } )

            it( '#updates dismissUntilNextRemoteVersionBump to true', function ( done )
            {

                // published release: 4.1.0
                // current version running: 4.1.0
                // cached remote release: 4.1.0
                // dismissUntilNextVerBump: false
                // expected result: local config.json file has dismissUntil... set to true

                let client: SocketIOClient.Socket;
                let scope = nock( 'https://api.github.com' )
                    .get( '/repos/tagyoureit/nodejs-poolController/releases/latest' )
                    .replyWithFile( 200, path.join( process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease4.1.0.json' ) )
                    .persist().log( console.log )

                promise.resolve()
                    .then( () => { return updateAvailable.initAsync( './specs/assets/package.json' ) } )
                    .then( () =>
                    {
                        client = ioclient.connect( globalAny.socketURL, globalAny.socketOptions )
                        client.on( 'connect', function ()
                        {
                            client.emit( 'updateVersionNotificationSetting', true )
                            return promise.resolve()
                                .delay( 500 )
                                .then( () =>
                                {
                                    return fs.readFileSync( path.join( process.cwd(), './specs/assets/config/config.json' ), 'utf8' )
                                } )
                                .then( ( _data ) =>
                                {
                                    let data = JSON.parse( _data )
                                    data.meta.notifications.version.remote.dismissUntilNextRemoteVersionBump.should.equal( true )
                                    scope.done()
                                    client.disconnect()
                                    done()
                                } )
                                .catch( ( err ) =>
                                {
                                    console.log( `err: ${ err.message }` )
                                    throw new Error( err )
                                } )
                        } )
                    } )
                // .delay( 500 )


            } );
        } )
    } )
} )
