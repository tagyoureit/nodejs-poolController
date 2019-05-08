import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable } from '../../../src/etc/internal';
import * as sinon from 'sinon';
import nock = require( 'nock' );
const globalAny: any = global;
let loggers: Init.StubType;
let scope: any;
import * as _path from 'path'
let path = _path.posix;

describe( 'tests SSDP/uPNP', function ()
{
    // TODO : Nock doesn't seem to be grabbing requests.  Turn off wifi/network and see errors.

    context( '#with the SSDP client', function ()
    {
        before( async function ()
        {
            await globalAny.initAllAsync()
                .then( function ()
                {
                    loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'stub' )
                } )
                .then( updateAvailable.initAsync( '/specs/assets/packageJsonTemplates/package_3.1.9.json' ) )
        } )

        beforeEach( function ()
        {

            this.timeout( 5000 )
            scope = nock( 'https://api.github.com' )
                .get( '/repos/tagyoureit/nodejs-poolController/releases/latest' )
                .replyWithFile( 200, path.join( process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease4.0.0.json' ) )
                .persist()
        } )

        afterEach( function ()
        {
            nock.cleanAll();
        } )

        after( async function ()
        {
            return updateAvailable.initAsync( '/specs/assets/package.json' )
                .then( globalAny.stopAllAsync )
        } )

        it( 'responds to an m-search', function ( done )
        {
            var ssdp = require( 'node-ssdp' ).Client
                , client = new ssdp( {} )

            client.on( 'response', function inResponse ( headers: any, code: number, rinfo: string )
            {
                // console.log('Got a response to an m-search:\n%d\n%s\n%s', code, JSON.stringify(headers, null, '  '), JSON.stringify(rinfo, null, '  '))
                headers.ST.should.equal( 'urn:schemas-upnp-org:device:PoolController:1' )
                code.should.equal( 200 )
                client.stop()
                done()
            } )

            client.search( 'urn:schemas-upnp-org:device:PoolController:1' )
        } );

        it( 'requests /device URI', async function ()
        {
            let obj = await globalAny.requestPoolDataWithURLAsync( 'device' )
            obj.should.contain( '<major>3</major>' )  // should really parse XML, but this may do for now.
            obj.should.contain( '<minor>1</minor>' )
        } );
    } );
} )
