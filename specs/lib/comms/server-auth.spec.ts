import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let updateAvailStub: sinon.SinonStub;
import * as fs from 'fs'
import requestPromise = require( 'request-promise' );
import request = require( 'request' );
import { StatusCodeError } from 'request-promise/errors';
let rp = require( 'request-promise' );

let serverURL: string
let protocol: string
let user: string
let password: string;


describe( 'tests web servers and authorization', function ()
{
    describe( '#http with authorization', function ()
    {

        context( 'by a URL', async function ()
        {
            before( async function ()
            {
                await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_auth.json' } )
            } )

            beforeEach( function ()
            {
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
                protocol = 'http://'
                serverURL = 'localhost:' + settings.get( 'httpExpressPort' ) + '/'
                user = ''
                password = ''
            } )

            afterEach( function ()
            {
            } )

            after( async function ()
            {
                await globalAny.stopAllAsync()
            } )

            it( 'fails with no authorization provided', async function ()
            {
                var options = {
                    method: 'GET',
                    uri: protocol + serverURL + 'pump',
                    resolveWithFullResponse: true,
                    json: true,
                };
                try
                {
                    let res = await rp( options )
                    res.statusCode.should.not.eq( 200 )
                }
                catch ( err )
                {
                    err.error.should.eq( '401 Unauthorized' )
                }
            } );


            it( 'authorizes a known user', async function ()
            {
                user = 'user'
                password = 'password'

                var options = {
                    method: 'GET',
                    uri: protocol + user + ':' + password + '@' + serverURL + 'pump',
                    resolveWithFullResponse: true,
                    json: true,
                };
                let res = await rp( options )
                res.statusCode.should.eq( 200 )
                res.statusMessage.should.eq( 'OK' )
            } );

            it( 'fails to authorize an unknown user ', async function ()
            {
                user = 'mr'
                password = 'hacker'

                var options = {
                    method: 'GET',
                    uri: protocol + user + ':' + password + '@' + serverURL + 'pump',
                    resolveWithFullResponse: true,
                    json: true,
                };
                try
                {
                    let res: any = await rp( options )
                    res.statusCode.should.not.eq( 200 )
                }
                catch ( err )
                {
                    err.error.should.eq( '401 Unauthorized' )
                }
            } );

        } );
    } )

    describe( '#with https and auth', function ()
    {

        context( 'by a URL', function ()
        {
            before( async function ()
            {
                protocol = 'https://'
                serverURL = 'localhost:' + settings.get( 'httpsExpressPort' ) + '/'
                await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_https.json' } )

            } )

            beforeEach( function ()
            {
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )


            } )

            afterEach( function ()
            {
            } )

            after( async function ()
            {

                await globalAny.stopAllAsync()
            } )


            it( 'starts auth with https ', async function ()
            {

                              var options = {
                    method: 'GET',
                    uri: protocol + serverURL,
                    resolveWithFullResponse: true,
                    json: true,
                    ca: [ fs.readFileSync( path.join( process.cwd(), './specs/assets/data/server.crt' ) ) ],
                    rejectUnauthorized: true,
                    requestCert: true,
                    agent: false
                };

                try
                {
                    let res: any = await rp( options )
                }
                            catch( err )
                {
                    err.error.should.eq('401 Unauthorized')
                    } 
            } );

            it( 'fails with no authorization provided', async function ()
            {
                var options = {
                    method: 'GET',
                    uri: protocol + serverURL + 'pump',
                    resolveWithFullResponse: true,
                    json: true,
                    ca: [ fs.readFileSync( path.join( process.cwd(), './specs/assets/data/server.crt' ) ) ],
                    rejectUnauthorized: true,
                    requestCert: true,
                    agent: false

                };

                try
                {
                    let res: any = await rp( options )    
                }
                catch ( err )
                {
                    err.error.should.eq('401 Unauthorized')
                }

            } );

            it( 'authorizes a known user', async function ()
            {
                user = 'user'
                password = 'password'

                var options = {
                    method: 'GET',
                    uri: protocol + user + ':' + password + '@' + serverURL + 'pump',
                    resolveWithFullResponse: true,
                    json: true,
                    ca: [ fs.readFileSync( path.join( process.cwd(), './specs/assets/data/server.crt' ) ) ],
                    rejectUnauthorized: true,
                    requestCert: true,
                    agent: false

                };
                    let res: any = await rp( options )
                    res.req.connection.encrypted.should.be.true
                    res.statusCode.should.eq( 200 )
                        res.statusMessage.should.eq( 'OK' )
            } );

            it( 'fails to authorize an unknown user ', async function ()
            {
                user = 'mr'
                password = 'hacker'

                var options = {
                    method: 'GET',
                    uri: protocol + user + ':' + password + '@' + serverURL + 'pump',
                    resolveWithFullResponse: true,
                    json: true,
                    ca: [ fs.readFileSync( path.join( process.cwd(), 'specs/assets/data/server.crt' ) ) ],
                    rejectUnauthorized: true,
                    requestCert: true,
                    agent: false

                };
           
                try
                {
                    let res: any = await rp( options )    
                }
                catch ( err )
                {
                    err.error.should.eq('401 Unauthorized')
                }

            } );


        } );

        describe( '#with http redirect to https', function ()
        {

            context( 'by a URL', function ()
            {
                before( async function ()
                {
                    protocol = 'http://'
                    serverURL = 'localhost:' + settings.get( 'httpExpressPort' ) + '/'
                    await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_https_httpRedirect.json' } )
                } )

                beforeEach( function ()
                {
                    loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )


                } )

                afterEach( function ()
                {

                } )

                after( async function ()
                {
                    await globalAny.stopAllAsync()
                } )


                it( 'forces a 302 error by not following redirects', async function ()
                {
                    user = 'user'
                    password = 'password'

                    var options = {
                        method: 'GET',
                        uri: protocol + user + ':' + password + '@' + serverURL + 'pump',
                        resolveWithFullResponse: true,
                        json: true,
                        ca: [ fs.readFileSync( path.join( process.cwd(), './specs/assets/data/server.crt' ) ) ],
                        rejectUnauthorized: true,
                        requestCert: true,
                        agent: false,
                        followRedirect: false

                    };

                    try
                    {
                        let res: any = await rp( options )    
                    }
                    catch ( err )
                    {
                        err.message.should.eq( '302 - undefined')
                    }

                } );

                it( 'authorizes a known user after redirect', async function ()
                {
                    user = 'user'
                    password = 'password'

                    var options = {
                        method: 'GET',
                        uri: protocol + user + ':' + password + '@' + serverURL + 'pump',
                        resolveWithFullResponse: true,
                        json: true,
                        ca: [ fs.readFileSync( path.join( process.cwd(), './specs/assets/data/server.crt' ) ) ],
                        rejectUnauthorized: true,
                        requestCert: true,
                        agent: false
                    };                 
                        let res: any = await rp( options )    
                        res.statusCode.should.eq( 200 )
                } );

            } );
        } );
    } )
} )
