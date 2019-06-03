/*  nodejs-poolController.  An application to control pool equipment.
 *  Copyright (C) 2016, 2017.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as
 *  published by the Free Software Foundation, either version 3 of the
 *  License, or (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

// Setup express server, both http and https (looping over the two types, each can support Auth or not - independently)


import events = require( 'events' );
import { settings, logger, reload, pumpControllerTimers, temperature, schedule, valve, time, chlorinator, intellichem, heat, queuePacket, pumpControllerMiddleware, circuit, pump, io, helpers, pumpConfig } from '../../etc/internal'
import * as getConfigOverview from "../../etc/getConfigOverview";
import * as http from 'http';
import * as https from 'https'
import httpShutdown = require( 'http-shutdown' )
import * as _path from 'path';
import express = require( 'express' )
import * as fs from 'fs'
import * as ssdp from 'node-ssdp';
let MDNS = require( 'multicast-dns' )()
import * as ip from 'ip';
import * as customRoutes from '../../integrations/customExpressRoutes';
import auth = require( 'http-auth' )
import helmet = require( 'helmet' );
import * as validator from 'validator'

// import * as Bundler from 'parcel-bundler';
import Bundler = require( 'parcel-bundler' );

interface IServersObj 
{
    [ key: string ]: any;
    http: IHTTPObj
    https: IHTTPSObj
    ssdp: ISSDPObj
    mdns: any
}
interface IHTTPObj extends IHTTPBaseObj
{
    [ key: string ]: any
    app?: express.Application;
}
interface IHTTPSObj extends IHTTPBaseObj
{
    [ key: string ]: any
    app?: express.Application
}
interface IHTTPBaseObj
{
    [ key: string ]: string
}
interface ISSDPObj
{
    [ key: string ]: any
    ssdp?: ssdp.Base
}
interface IMDNSObj
{
    [ key: string ]: any
    mdns?: any
}

var servers: IServersObj = { http: {}, https: {}, ssdp: {}, mdns: {} }
var path = require( 'path' ).posix;
var defaultPort: { [ key: string ]: number; http: number; https: number } = { http: 3000, https: 3001 }
var mdnsEmitter = new events.EventEmitter();
var mdns: { query: string[], answers: string[] } = { query: [], answers: [] }
var emitter = new events.EventEmitter();

const dev = process.env.NODE_ENV !== 'production'
export namespace server
{
    export async function startServerAsync ( type: string )
    {
        return new Promise( ( resolve, reject ) =>
        {
            if ( !settings.get( type + 'Enabled' ) )
            {
                resolve( `${ type } server not starting because it is disabled in config.json file.` )
            }
            if ( dev )
            {
                // Parcel: absolute path to entry point
                const file = path.join( process.cwd(), '/www/pages/index.html' )
                logger.debug( `Parcel serving files from: ${ file }` )
                // Parcel: set options
                const options = {
                    outDir: './dist/dev'
                };
                // Parcel: Initialize a new bundler
                servers[ type ].parcel = new Bundler( file, options )
            }
            else
            {
                servers[ type ].parcel = {}
            }

            servers[ type ].app = express();
            servers [type].app.use(helmet())
            servers[ type ].port = settings.get( type + 'ExpressPort' ) || defaultPort[ type ];
            servers[ type ].server = undefined;

            logger.info( 'Starting up express server, ' + type + ' (port %d)', servers[ type ].port );

            // And Enable Authentication (if configured)
            if ( settings.get( type + 'ExpressAuth' ) === 1 )
            {
                let basic = auth.basic( {
                    file: path.join( process.cwd(), settings.get( type + 'ExpressAuthFile' ) )
                } );
                servers[ type ].app.use( auth.connect( basic ) );
            }

            //  Create Server
            if ( type === 'https' )
            {
                let opt_https = {
                    key: fs.readFileSync( path.join( process.cwd(), settings.get( 'httpsExpressKeyFile' ) ) ),
                    cert: fs.readFileSync( path.join( process.cwd(), settings.get( 'httpsExpressCertFile' ) ) ),
                    requestCert: false,
                    rejectUnauthorized: false
                };
                servers[ type ].server = https.createServer( opt_https, servers[ type ].app );
            } else
                servers[ type ].server = http.createServer( servers[ type ].app );

            // Configure Server
            if ( type === 'http' && settings.get( 'httpRedirectToHttps' ) )
            {

                servers[ type ].app.get( '*', function ( req: { get: ( arg0: string ) => string; url: any; }, res: { redirect: ( arg0: string ) => void; } )
                {
                    var host: string = req.get( 'Host' );
                    // replace the port in the host
                    host = host.replace( /:\d+$/, ":" + settings.get( 'httpsExpressPort' ) );
                    // determine the redirect destination
                    var destination = [ 'https://', host, req.url ].join( '' );
                    return res.redirect( destination );
                } );

            }
            else
                configExpressServer( servers[ type ].app, express, servers[ type ].parcel );


            //And Start Listening
            /*            servers[type].server = servers[type].server.listen(servers[type].port, function () {
                           logger.verbose('Express Server ' + type + ' listening at port %d', servers[type].port);
                           io.init(servers[type].server, type)
                           resolve('Server ' + type + ' started.');
                       }); */
            servers[ type ].server = httpShutdown( servers[ type ].server.listen( servers[ type ].port, function ()
            {
                logger.verbose( 'Express Server ' + type + ' listening at port %d', servers[ type ].port );
                io.init( servers[ type ].server, type )
                resolve( 'Server ' + type + ' started.' );
            } ) );

            servers[ type ].server.on( 'error', function ( e: any )
            {

                logger.error( 'error from ' + type + ':', e )
                console.error( e )
                // reject( e )
            } );


        } )
            .catch( ( err: Error ) =>
            {
                var res = 'Not starting ' + type + ' server.'
                logger.debug( res )
                throw new Error( err.message )
            } )
    }

    export function configExpressServer ( app: express.Application, express: any, bundlerParcel?: { middleware: () => any; } )
    {

        // Hook to use custom routes

        customRoutes.init( app );

        // Middleware
        app.use( ( req, res, next ) =>
        {
            // Middleware to capture requests to log
            var reqType: string[] = req.originalUrl.split( '/' )
            if ( ![ 'bootstrap', 'assets', 'poolController', 'public' ].includes( reqType[ 1 ] ) )
            {

                // if we are in capture packet mode, capture it
                if ( settings.get( 'capturePackets' ) )
                {
                    logger.packet( {
                        type: 'url',
                        counter: 0,
                        url: req.originalUrl,
                        direction: 'inbound'
                    } )
                }
            }

            /*            console.log('looking at session: ', req.sessionID)
                       //store session in memory store
                       if (req.session.views) {
                           req.session.views++
                           res.setHeader('Content-Type', 'text/html')
                           res.write('<p>views: ' + req.session.views + '</p>')
                           res.write('<p>expires in: ' + (req.session.cookie.maxAge / 1000) + 's</p>')
                           res.write('<p>json session: <br>' + JSON.stringify(req.session) )
                           res.end()
                         } else {
                           req.session.views = 1
                           res.end('welcome to the session demo. refresh!')
                         }
           
                       //output request variables
                       console.log(`Request session: ${req}`)
            */
            next()
        } )
        let max_age = {}
        if ( !dev )
        {
            app.use( express.static( path.join( process.cwd(), '/dist/www' ), { maxAge: '14d' } ) );

            // link back to public directory also
            // TODO: can clean this up and remove old files
            app.use( '/public', express.static( path.join( process.cwd(), '/www/public' ), { maxAge: '14d' } ) )
            app.use( '/bootstrap_old', express.static( path.join( process.cwd(), '/www/bootstrap_old' ), { maxAge: '14d' } ) )
            max_age = { maxAge: '60d' }
        }
        else
        {
            app.use( express.static( path.join( process.cwd(), '/www' ) ) );
            max_age = {}  // no maxAge in dev
        }
        // TODO: remove these when upgrade to react is complete
        // Routing
        app.use( '/bootstrap', express.static( path.join( process.cwd(), '/node_modules/bootstrap/dist/' ), max_age ) );
        app.use( '/jquery', express.static( path.join( process.cwd(), '/node_modules/jquery/' ), max_age ) );
        app.use( '/jquery-ui', express.static( path.join( process.cwd(), '/node_modules/jquery-ui-dist/' ), max_age ) );
        app.use( '/jquery-clockpicker', express.static( path.join( process.cwd(), '/node_modules/jquery-clockpicker/dist/' ), max_age ) );
        app.use( '/socket.io-client', express.static( path.join( process.cwd(), '/node_modules/socket.io-client/dist/' ), max_age ) );

        // disable for security
        app.disable( 'x-powered-by' )

        /*app.get('/status', function(req, res) {
            res.send(status.getCurrentStatus())
        })*/



        app.get( '/all', function ( req: any, res: { send: ( arg0: any ) => void; } )
        {
            res.send( helpers.allEquipmentInOneJSON() );
            io.emitToClients( 'all' );
        } );

        app.get( '/one', function ( req: any, res: { send: ( arg0: any ) => void; } )
        {
            res.send( helpers.allEquipmentInOneJSON() );
            io.emitToClients( 'all' );
        } );

        app.get( '/device', function ( req: any, res: { set: ( arg0: string, arg1: string ) => void; send: ( arg0: string ) => void; } )
        {
            helpers.deviceXML()
                .then( function ( XML )
                {
                    res.set( 'Content-Type', 'text/xml' );
                    res.send( XML );
                } )

        } );

        app.get( '/config', function ( req: any, res: { send: ( arg0: { config: any; } ) => void; } )
        {
            res.send( getConfigOverview.getConfigOverview() )
        } )

        /*istanbul ignore next */
        app.get( '/reload', function ( req: any, res: { send: ( arg0: string ) => void; } )
        {
            reload.reloadAsync( 'server' );
            res.send( 'reloading configuration' );
            closeAllAsync().then( initAsync )
        } );

        app.get( '/cancelDelay', function ( req: any, res: { send: ( arg0: void ) => void; } )
        {
            res.send( circuit.setDelayCancel() );
        } );
        // removed in 6.0
        /*         app.get('/heat', function (req, res) {
                    res.send(temperature.getTemperature());
                }); */
        // removed in 6.0
        /*         app.get('/temperatures', function (req, res) {
                    res.send(temperature.getTemperature());
                }); */
        app.get( '/temperature', function ( req: any, res: { send: ( arg0: any ) => void; } )
        {
            res.send( temperature.getTemperature() );
        } );
        // removed in 6.0
        /*         app.get('/temp', function (req, res) {
                    res.send(temperature.getTemperature());
                });
         */
        app.get( '/circuit', function ( req: any, res: { send: ( arg0: { 'circuit': Circuit.ICurrentCircuits; } ) => void; } )
        {
            res.send( circuit.getCurrentCircuits() );
        } );

        app.get( '/schedule', function ( req: any, res: { send: ( arg0: { 'schedule': ScheduleModule.ScheduleObj; } ) => void; } )
        {
            res.send( schedule.getCurrentSchedule() );
        } );
        app.get( '/valve', function ( req: any, res: { send: ( arg0: { 'valve': { valve: number; }; } ) => void; } )
        {
            res.send( valve.getValve() );
        } );

        app.get( '/schedule/toggle/id/:id/day/:_day', function ( req: { params: { id: string; _day: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
                var id = parseInt( req.params.id );
                var day = parseInt(req.params._day);
                var response: API.Response = {};
               
                    response.text = 'REST API received request to toggle day ' + day + ' on schedule with ID:' + id;
                    logger.info( response );
                    schedule.toggleDay( id, day );
                    res.send( response );

        } );

        app.get( '/schedule/delete/id/:id', function ( req: { params: { id: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            var id = parseInt( req.params.id );
            var response: API.Response = {};
            response.text = 'REST API received request to delete schedule or egg timer with ID:' + id;
            logger.info( response );
            schedule.deleteScheduleOrEggTimer( id );
            res.send( response );
        } );

        app.get( '/schedule/set/id/:id/startOrEnd/:sOE/hour/:hour/min/:min', function ( req: { params: { id: string; hour: string; min: string; sOE: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            var id = parseInt( req.params.id );
            var hour = parseInt( req.params.hour );
            var min = parseInt( req.params.min );
            var response: API.Response = {};
            response.text = 'REST API received request to set ' + req.params.sOE + ' time on schedule with ID (' + id + ') to ' + hour + ':' + min;
            logger.info( response );
            schedule.setControllerScheduleStartOrEndTime( id, req.params.sOE, hour, min );
            res.send( response );
        } );

        app.get( '/schedule/set/id/:id/circuit/:circuit', function ( req: { params: { id: string; circuit: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            let _id = parseInt( req.params.id );
            let _circuit = parseInt( req.params.circuit );
            let _response: API.Response = {};
            _response.text = 'REST API received request to set circuit on schedule with ID (' + _id + ') to ' + circuit.getFriendlyName( _circuit )
            logger.info( _response )
            schedule.setControllerScheduleCircuit( _id, _circuit )
            res.send( _response )
        } )

        app.get( '/eggtimer/set/id/:id/circuit/:circuit/hour/:hour/min/:min', function ( req: { params: { id: string; circuit: string; hour: string; min: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            let _id = parseInt( req.params.id )
            let _circuit = parseInt( req.params.circuit )
            let _hr = parseInt( req.params.hour )
            let _min = parseInt( req.params.min )
            let _response: API.Response = {}
            _response.text = 'REST API received request to set eggtimer with ID (' + _id + '): ' + circuit.getFriendlyName( _circuit ) + ' for ' + _hr + ' hours, ' + _min + ' minutes'
            logger.info( _response )
            schedule.setControllerEggTimer( _id, _circuit, _hr, _min )
            res.send( _response )
        } )

        app.get( '/schedule/set/:id/:circuit/:starthh/:startmm/:endhh/:endmm/:days', function ( req: { params: { id: string; circuit: string; starthh: string; startmm: string; endhh: string; endmm: string; days: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            var id = parseInt( req.params.id )
            var circuit = parseInt( req.params.circuit )
            var starthh = parseInt( req.params.starthh )
            var startmm = parseInt( req.params.startmm )
            var endhh = parseInt( req.params.endhh )
            var endmm = parseInt( req.params.endmm )
            var days = parseInt( req.params.days )
            var response: API.Response = {}
            response.text = 'REST API received request to set schedule ' + id + ' with values (start) ' + starthh + ':' + startmm + ' (end) ' + endhh + ':' + endmm + ' with days value ' + days
            logger.info( response )
            schedule.setControllerSchedule( id, circuit, starthh, startmm, endhh, endmm, days )
            res.send( response )
        } )

        app.get( '/time', function ( req: any, res: { send: ( arg0: { 'time': ITime.ETime; } ) => void; } )
        {
            res.send( time.getTime() )
        } )

        app.get( '/datetime', function ( req: any, res: { send: ( arg0: { 'time': ITime.ETime; } ) => void; } )
        {
            res.send( time.getTime() )
        } )

        app.get( '/datetime/set/time/:hh/:mm/date/:dow/:dd/:mon/:yy/:dst', function ( req: { params: { hh: string; mm: string; dd: string; mon: string; yy: string; dst: string; dow: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            var hour = parseInt( req.params.hh )
            var min = parseInt( req.params.mm )
            var day = parseInt( req.params.dd )
            var month = parseInt( req.params.mon )
            var year = parseInt( req.params.yy )
            var autodst = parseInt( req.params.dst )
            var dayofweek = parseInt( req.params.dow )
            var dowIsValid: ITime.DOW = time.lookupDOW( dayofweek )
            var response: API.Response = {}
            // if ( ( hour >= 0 && hour <= 23 ) && ( min >= 0 && min <= 59 ) && ( day >= 1 && day <= 31 ) && ( month >= 1 && month <= 12 ) && ( year >= 0 && year <= 99 ) && dowIsValid !== -1 && ( autodst === 0 || autodst === 1 ) )
            if ( ( hour >= 0 && hour <= 23 ) && ( min >= 0 && min <= 59 ) && ( day >= 1 && day <= 31 ) && ( month >= 1 && month <= 12 ) && ( year >= 0 && year <= 99 ) && ( autodst === 0 || autodst === 1 ) )
            {
                response.text = 'REST API received request to set date/time to: ' + hour + ':' + min + '(military time)'
                response.text += 'dayofweek: ' + dowIsValid + '(' + dayofweek + ') date: ' + month + '/' + day + '/20' + year + ' (mm/dd/yyyy)'
                response.text += 'automatically adjust dst (currently no effect): ' + autodst
                time.setDateTime( hour, min, dayofweek, day, month, year, autodst )
                logger.info( response )
            } else
            {
                response.text = 'FAIL: hour (' + hour + ') should be 0-23 and minute (' + min + ') should be 0-59.  Received: ' + hour + ':' + min
                response.text += 'Day (' + day + ') should be 0-31, month (' + month + ') should be 0-12 and year (' + year + ') should be 0-99.'
                response.text += 'Day of week (' + dayofweek + ') should be one of: [1,2,4,8,16,32,64] [Sunday->Saturday]'
                response.text += 'dst (' + autodst + ') should be 0 or 1'
                logger.warn( response )
            }
            res.send( response )
        } )


        app.get( '/datetime/set/time/hour/:hh/min/:mm/date/dow/:dow/day/:dd/mon/:mon/year/:yy/dst/:dst', function ( req: { params: { hh: string; mm: string; dd: string; mon: string; yy: string; dst: string; dow: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            var hour = parseInt( req.params.hh )
            var min = parseInt( req.params.mm )
            var day = parseInt( req.params.dd )
            var month = parseInt( req.params.mon )
            var year = parseInt( req.params.yy )
            var autodst = parseInt( req.params.dst )
            var dayofweek = parseInt( req.params.dow )
            var dowIsValid: ITime.DOW = time.lookupDOW( dayofweek )
            var response: API.Response = {}
            // if ( ( hour >= 0 && hour <= 23 ) && ( min >= 0 && min <= 59 ) && ( day >= 1 && day <= 31 ) && ( month >= 1 && month <= 12 ) && ( year >= 0 && year <= 99 ) && dowIsValid !== -1 && ( autodst === 0 || autodst === 1 ) )
            if ( ( hour >= 0 && hour <= 23 ) && ( min >= 0 && min <= 59 ) && ( day >= 1 && day <= 31 ) && ( month >= 1 && month <= 12 ) && ( year >= 0 && year <= 99 ) && ( autodst === 0 || autodst === 1 ) )
            {
                response.text = 'REST API received request to set date/time to: ' + hour + ':' + min + '(military time)'
                response.text += 'dayofweek: ' + dowIsValid + '(' + dayofweek + ') date: ' + month + '/' + day + '/20' + year + ' (mm/dd/yyyy)'
                response.text += 'automatically adjust dst (currently no effect): ' + autodst
                time.setDateTime( hour, min, dayofweek, day, month, year, autodst )
                logger.info( response )
            } else
            {
                response.text = 'FAIL: hour (' + hour + ') should be 0-23 and minute (' + min + ') should be 0-59.  Received: ' + hour + ':' + min
                response.text += 'Day (' + day + ') should be 0-31, month (' + month + ') should be 0-12 and year (' + year + ') should be 0-99.'
                response.text += 'Day of week (' + dayofweek + ') should be one of: [1,2,4,8,16,32,64] [Sunday->Saturday]'
                response.text += 'dst (' + autodst + ') should be 0 or 1'
                logger.warn( response )
            }
            res.send( response )
        } )

        app.get( '/pump', function ( req: any, res: { send: ( arg0: { 'pump': Pump.PumpStatus; } ) => void; } )
        {
            res.send( pump.getCurrentPumpStatus() )
        } )

        app.get( '/chlorinator', function ( req: any, res: any )
        {
            res.send( chlorinator.getChlorinatorStatus() )
        } )

        app.get( '/intellichem', function ( req: any, res: { send: ( arg0: { 'intellichem': any; } ) => void; } )
        {
            res.send( intellichem.getCurrentIntellichem() )
        } )
        
        // // TODO: This should be deprecated
        app.get( '/chlorinator/:chlorinateLevel', function ( req: { params: { chlorinateLevel: string; }; }, res: { send: ( arg0: any ) => void; } )
        {
            let response = chlorinator.setChlorinatorLevel( parseInt( req.params.chlorinateLevel ) )

            res.send( response )

        } )

        app.get( '/chlorinator/pool/:poolChlorinateLevel', function ( req: { params: { poolChlorinateLevel: string; }; }, res: { send: ( arg0: any ) => void; } )
        {
            let response = chlorinator.setChlorinatorLevel( parseInt( req.params.poolChlorinateLevel ) )
            res.send( response )
        } )

        app.get( '/chlorinator/spa/:spaChlorinateLevel', function ( req: { params: { spaChlorinateLevel: string; }; }, res: { send: ( arg0: any ) => void; } )
        {
            let response = chlorinator.setChlorinatorLevel( -1, parseInt( req.params.spaChlorinateLevel ) )
            res.send( response )
        } )

        app.get( '/chlorinator/pool/:poolChlorinateLevel/spa/:spaChlorinateLevel', function ( req: { params: { poolChlorinateLevel: string; spaChlorinateLevel: string; }; }, res: { send: ( arg0: any ) => void; } )
        {
            let response = chlorinator.setChlorinatorLevel( parseInt( req.params.poolChlorinateLevel ), parseInt( req.params.spaChlorinateLevel ) )
            res.send( response )
        } )


        app.get( '/chlorinator/superChlorinateHours/:hours', function ( req: { params: { hours: string; }; }, res: { send: ( arg0: any ) => void; } )
        {
            let response = chlorinator.setChlorinatorLevel( -1, -1, parseInt( req.params.hours ) )
            res.send( response )
        } )

        app.get( '/chlorinator/pool/:poolChlorinateLevel/spa/:spaChlorinateLevel/superChlorinateHours/:hours', function ( req: { params: { poolChlorinateLevel: string; spaChlorinateLevel: string; hours: string; }; }, res: { send: ( arg0: any ) => void; } )
        {
            let response = chlorinator.setChlorinatorLevel( parseInt( req.params.poolChlorinateLevel ), parseInt( req.params.spaChlorinateLevel ), parseInt( req.params.hours ) )
            res.send( response )
        } )


        app.get( '/light/mode/:mode', function ( req: { params: { mode: string; }; }, res: { send: { ( arg0: string ): void; ( arg0: string ): void; }; } )
        {
            if ( parseInt( req.params.mode ) >= 0 && parseInt( req.params.mode ) <= 256 )
            {
                res.send( circuit.setLightMode( parseInt( req.params.mode ) ) )
            } else
            {
                res.send( 'Not a valid light power command.' )
            }
        } )
//
        app.get( '/light/circuit/:circuit/setColor/:color', function ( req: { params: { circuit: string; color: string; }; }, res: { send: { ( arg0: string ): void; ( arg0: string ): void; }; } )
        {
            if ( parseInt( req.params.circuit ) > 0 && parseInt( req.params.circuit ) <= circuit.getNumberOfCircuits() )
            {
                if ( parseInt( req.params.color ) >= 0 && parseInt( req.params.color ) <= 256 )
                {
                    res.send( circuit.setLightColor( parseInt( req.params.circuit ), parseInt( req.params.color ) ) )
                } else
                {
                    res.send( 'Not a valid light set color.' )
                }
            }
        } )

        app.get( '/light/circuit/:circuit/setSwimDelay/:delay', function ( req: { params: { circuit: string; delay: string; }; }, res: { send: { ( arg0: string ): void; ( arg0: string ): void; }; } )
        {
            if ( parseInt( req.params.circuit ) > 0 && parseInt( req.params.circuit ) <= circuit.getNumberOfCircuits() )
            {
                if ( parseInt( req.params.delay ) >= 0 && parseInt( req.params.delay ) <= 256 )
                {
                    res.send( circuit.setLightSwimDelay( parseInt( req.params.circuit ), parseInt( req.params.delay ) ) )
                } else
                {
                    res.send( 'Not a valid light swim delay.' )
                }
            }
        } )

        app.get( '/light/circuit/:circuit/setPosition/:position', function ( req: { params: { circuit: string; position: string; }; }, res: { send: { ( arg0: string ): void; ( arg0: string ): void; }; } )
        {
            if ( parseInt( req.params.circuit ) > 0 && parseInt( req.params.circuit ) <= circuit.getNumberOfCircuits() )
            {
                if ( parseInt( req.params.position ) >= 0 && parseInt( req.params.position ) <= circuit.getNumberOfCircuits() )
                {
                    res.send( circuit.setLightPosition( parseInt( req.params.circuit ), parseInt( req.params.position ) ) )
                } else
                {
                    res.send( 'Not a valid light position.' )
                }
            }
        } )

        app.get( '/circuit/:circuit', function ( req: { params: { circuit: string; }; }, res: { send: { ( arg0: Circuit.CircuitClass ): void; ( arg0: string ): void; }; } )
        {
            if ( parseInt( req.params.circuit ) > 0 && parseInt( req.params.circuit ) <= circuit.getNumberOfCircuits() )
            {
                res.send( circuit.getCircuit( parseInt( req.params.circuit ) ) )
            } else
            {
                res.send( 'Not a valid circuit' )
            }
        } )

        app.get( '/circuit/:circuit/toggle', function ( req: { params: { circuit: string; }; }, res: { send: ( arg0: any ) => void; } )
        {
            circuit.toggleCircuit( parseInt( req.params.circuit ), function ( response: any )
            {
                res.send( response )
            } )
        } )

        app.get( '/circuit/:circuit/set/:set', function ( req: { params: { circuit: string; set: string; }; }, res: { send: ( arg0: any ) => void; } )
        {
            circuit.setCircuit( parseInt( req.params.circuit ), parseInt( req.params.set ), function ( response: any )
            {
                res.send( response )
            } )
        } )

        app.get( '/spaheat/setpoint/:spasetpoint', function ( req: { params: { spasetpoint: string; }; }, res: { send: ( arg0: any ) => void; } )
        {
            heat.setSpaSetPoint( parseInt( req.params.spasetpoint ), function ( response )
            {
                res.send( response )
            } )
        } )

        app.get( '/spaheat/increment', function ( req: any, res: { send: ( arg0: any ) => void; } )
        {
            heat.incrementSpaSetPoint( 1, function ( response )
            {
                res.send( response )
            } )
        } )

        app.get( '/spaheat/increment/:spasetpoint', function ( req: { params: { spasetpoint: string; }; }, res: { send: ( arg0: any ) => void; } )
        {
            heat.incrementSpaSetPoint( parseInt( req.params.spasetpoint ), function ( response )
            {
                res.send( response )
            } )
        } )

        app.get( '/spaheat/decrement', function ( req: any, res: { send: ( arg0: any ) => void; } )
        {
            heat.decrementSpaSetPoint( 1, function ( response )
            {
                res.send( response )
            } )
        } )

        app.get( '/spaheat/decrement/:spasetpoint', function ( req: { params: { spasetpoint: string; }; }, res: { send: ( arg0: any ) => void; } )
        {
            heat.decrementSpaSetPoint( parseInt( req.params.spasetpoint ), function ( response )
            {
                res.send( response )
            } )
        } )

        app.get( '/spaheat/mode/:spaheatmode', function ( req: { params: { spaheatmode: string; }; }, res: { send: ( arg0: any ) => void; } )
        {
            heat.setSpaHeatMode( parseInt( req.params.spaheatmode ), function ( response )
            {
                res.send( response )
            } )
        } )

        app.get( '/poolheat/setpoint/:poolsetpoint', function ( req: { params: { poolsetpoint: string; }; }, res: { send: ( arg0: any ) => void; } )
        {
            heat.setPoolSetPoint( parseInt( req.params.poolsetpoint ), function ( response )
            {
                res.send( response )
            } )
        } )

        app.get( '/poolheat/decrement', function ( req: any, res: { send: ( arg0: any ) => void; } )
        {
            heat.decrementPoolSetPoint( 1, function ( response )
            {
                res.send( response )
            } )
        } )


        app.get( '/poolheat/decrement/:poolsetpoint', function ( req: { params: { poolsetpoint: string; }; }, res: { send: ( arg0: any ) => void; } )
        {
            heat.decrementPoolSetPoint( parseInt( req.params.poolsetpoint ), function ( response )
            {
                res.send( response )
            } )
        } )

        app.get( '/poolheat/increment', function ( req: any, res: { send: ( arg0: any ) => void; } )
        {
            heat.incrementPoolSetPoint( 1, function ( response )
            {
                res.send( response )
            } )
        } )

        app.get( '/poolheat/increment/:poolsetpoint', function ( req: { params: { poolsetpoint: string; }; }, res: { send: ( arg0: any ) => void; } )
        {
            heat.incrementPoolSetPoint( parseInt( req.params.poolsetpoint ), function ( response )
            {
                res.send( response )
            } )
        } )

        app.get( '/poolheat/mode/:poolheatmode', function ( req: { params: { poolheatmode: string; }; }, res: { send: ( arg0: any ) => void; } )
        {
            heat.setPoolHeatMode( parseInt( req.params.poolheatmode ), function ( response )
            {
                res.send( response )
            } )

        } )

        app.get( '/sendthispacket/:packet', function ( req: { params: { packet: string; }; }, res: { send: ( arg0: any ) => void; } )
        {
            queuePacket.sendThisPacket( req.params.packet, function ( response: any )
            {
                res.send( response )
            } )

        } )

        app.get( 'pumpCommand/pump/:pump/type/:type', function ( req: { params: { _pumpNum: string; _type: string }; }, res: any )
        {
            var pumpNum = parseInt( req.params._pumpNum )
            var type = <Pump.PumpType>req.params._type
            var response: API.Response = {}
            response.text = 'Socket setPumpType variables - pump: ' + pumpNum + ', type: ' + type
            response.pump = pumpNum
            response.type = type
            settings.updatePumpType( pumpNum, type )
            pump.init()
            pumpControllerTimers.startPumpController()
            io.emitToClients( 'pump', pump.getCurrentPumpStatus() ) 
            logger.info( response )
        } )

        /* New pumpCommand API's  */
        //#1  Turn pump off
        app.get( '/pumpCommand/off/pump/:pump', function ( req: { params: { pump: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            let pump = <Pump.PumpIndex> parseInt( req.params.pump )
            var response: API.Response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', power: off, duration: null'
            response.pump = pump
            response.value = null
            response.duration = -1
            pumpControllerTimers.clearTimer( pump )
            res.send( response )
        } )

        //#2  Run pump indefinitely.
        app.get( '/pumpCommand/run/pump/:pump', function ( req, res )
        {
            let pump = <Pump.PumpIndex> parseInt( req.params.pump )
            var response: API.Response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', power: on, duration: null'
            response.pump = pump
            response.value = 1
            response.duration = -1
            pumpControllerTimers.startPowerTimer( pump, -1 ) //-1 for indefinite duration
            res.send( response )
        } )

        // //variation on #2.  Probably should get rid of this as "on" is synonym to "run"
        // app.get('/pumpCommand/on/pump/:pump', function(req, res) {
        //     let pump:Pump.PumpIndex = <Pump.PumpIndex>parseInt( req.params.pump )
        //     var response:API.Response = {}
        //     response.text = 'REST API pumpCommand variables - pump: ' + pump + ', power: on, duration: null'
        //     response.pump = pump
        //     response.value = 1
        //     response.duration = -1
        //     pumpControllerTimers.startPowerTimer(pump, -1) //-1 for indefinite duration
        //     res.send(response)
        // })

        //#3  Run pump for a duration.
        app.get( '/pumpCommand/run/pump/:pump/duration/:duration', function ( req: { params: { pump: string; duration: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            let pump: Pump.PumpIndex = <Pump.PumpIndex> parseInt( req.params.pump )
            var duration = parseInt( req.params.duration )
            var response: API.Response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', power: on, duration: ' + duration
            response.pump = pump
            response.value = null
            response.duration = duration
            pumpControllerTimers.startPowerTimer( pump, duration ) //-1 for indefinite duration
            res.send( response )
        } )

        // //variation on #3.  Probably should get rid of this as "on" is synonym to "run"
        // app.get('/pumpCommand/on/pump/:pump/duration/:duration', function(req, res) {
        //     let pump:Pump.PumpIndex = <Pump.PumpIndex>parseInt( req.params.pump )
        //     var duration = parseInt(req.params.duration)
        //     var response:API.Response = {}
        //     response.text = 'REST API pumpCommand variables - pump: ' + pump + ', power: on, duration: ' + duration
        //     response.pump = pump
        //     response.value = null
        //     response.duration = duration
        //     pumpControllerTimers.startPowerTimer(pump, duration) //-1 for indefinite duration
        //     res.send(response)
        // })


        //#4  Run pump program for indefinite duration
        app.get( '/pumpCommand/run/pump/:pump/program/:program', function ( req: { params: { pump: string; program: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            let pump: Pump.PumpIndex = <Pump.PumpIndex> parseInt( req.params.pump )
            var program = parseInt( req.params.program )

            var response: API.Response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', program: ' + program + ', value: null, duration: null'
            response.pump = pump
            response.program = program
            response.duration = -1
            pumpControllerTimers.startProgramTimer( pump, program, -1 )
            res.send( response )
        } )

        //#5 Run pump program for a specified duration
        app.get( '/pumpCommand/run/pump/:pump/program/:program/duration/:duration', function ( req: { params: { pump: string; program: string; duration: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            let pump: Pump.PumpIndex = <Pump.PumpIndex> parseInt( req.params.pump )
            var program = parseInt( req.params.program )
            var duration = parseInt( req.params.duration )
            var response: API.Response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', program: ' + program + ', duration: ' + duration
            response.pump = pump
            response.program = program
            response.duration = duration
            pumpControllerTimers.startProgramTimer( pump, program, duration )
            res.send( response )
        } )

        //#6 Run pump at RPM for an indefinite duration
        app.get( '/pumpCommand/run/pump/:pump/rpm/:rpm', function ( req: { params: { pump: string; rpm: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            let pump: Pump.PumpIndex = <Pump.PumpIndex> parseInt( req.params.pump )
            var rpm = parseInt( req.params.rpm )
            var response: API.Response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', rpm: ' + rpm + ', duration: null'
            response.pump = pump
            response.speed = rpm
            response.duration = -1
            // pumpControllerMiddleware.runRPMSequence(pump, rpm)
            pumpControllerTimers.startRPMTimer( pump, rpm, -1 )
            res.send( response )
        } )

        //#7 Run pump at RPM for specified duration
        app.get( '/pumpCommand/run/pump/:pump/rpm/:rpm/duration/:duration', function ( req: { params: { pump: string; rpm: string; duration: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            let pump: Pump.PumpIndex = <Pump.PumpIndex> parseInt( req.params.pump )
            var rpm = parseInt( req.params.rpm )
            var duration = parseInt( req.params.duration )
            var response: API.Response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', rpm: ' + rpm + ', duration: ' + duration
            response.pump = pump
            response.value = rpm
            response.duration = duration
            pumpControllerTimers.startRPMTimer( pump, rpm, duration )
            res.send( response )
        } )

        //#8  Save program to pump
        app.get( '/pumpCommand/save/pump/:pump/program/:program/rpm/:speed', function ( req: { params: { pump: string; program: string; speed: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            let pump = <Pump.PumpIndex> parseInt( req.params.pump )
            var program = parseInt( req.params.program )
            var speed = parseInt( req.params.speed )
            var response: API.Response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', program: ' + program + ', rpm: ' + speed + ', duration: null'
            response.pump = pump
            response.program = program
            response.speed = speed
            response.duration = null
            pumpControllerMiddleware.pumpCommandSaveProgram( pump, program, speed )
            res.send( response )
        } )

        //#9  Save and run program for indefinite duration
        app.get( '/pumpCommand/saverun/pump/:pump/program/:program/rpm/:speed', function ( req: { params: { pump: string; program: string; speed: string; duration: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            var _pump = <Pump.PumpIndex> parseInt( req.params.pump )
            var program = parseInt( req.params.program )
            var speed = parseInt( req.params.speed )
            let duration = -1
            var response: API.Response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + _pump + ', program: ' + program + ', speed: ' + speed + ', duration: indefinite'
            response.pump = _pump
            response.program = program
            response.speed = speed
            response.duration = duration


            pumpControllerMiddleware.pumpCommandSaveProgramWithValueForDuration( _pump, program, speed, -1 )
            pumpControllerTimers.startProgramTimer( _pump, program, duration )
            res.send( response )
        } )

        //#10  Save and run program for specified duration
        app.get( '/pumpCommand/saverun/pump/:pump/program/:program/rpm/:speed/duration/:duration', function ( req: { params: { pump: string; program: string; speed: string; duration: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            let _pump: Pump.PumpIndex = <Pump.PumpIndex> parseInt( req.params.pump )
            var program = parseInt( req.params.program )
            var speed = parseInt( req.params.speed )
            var duration = parseInt( req.params.duration )
            var response: API.Response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', program: ' + program + ', speed: ' + speed + ', duration: ' + duration
            response.pump = _pump
            response.program = program
            response.speed = speed
            response.duration = duration
            pumpControllerMiddleware.pumpCommandSaveProgramWithValueForDuration( _pump, program, speed, duration )
            pumpControllerTimers.startProgramTimer( _pump, program, duration )
            res.send( response )
        } )

        //#11 Run pump at GPM for an indefinite duration
        app.get( '/pumpCommand/run/pump/:pump/gpm/:gpm', function ( req: { params: { pump: string; gpm: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            let pump: Pump.PumpIndex = <Pump.PumpIndex> parseInt( req.params.pump )
            var gpm = parseInt( req.params.gpm )
            var response: API.Response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', gpm: ' + gpm + ', duration: -1'
            response.pump = pump
            response.speed = gpm
            response.duration = -1
            // pumpControllerMiddleware.runGPMSequence(pump, gpm)
            pumpControllerTimers.startGPMTimer( pump, gpm, -1 )
            res.send( response )
        } )

        //#12 Run pump at GPM for specified duration
        app.get( '/pumpCommand/run/pump/:pump/gpm/:gpm/duration/:duration', function ( req: { params: { pump: string; gpm: string; duration: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            let pump: Pump.PumpIndex = <Pump.PumpIndex> parseInt( req.params.pump )
            var gpm = parseInt( req.params.gpm )
            var duration = parseInt( req.params.duration )
            var response: API.Response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', gpm: ' + gpm + ', duration: ' + duration
            response.pump = pump
            response.speed = gpm
            response.duration = duration
            pumpControllerTimers.startGPMTimer( pump, gpm, duration )
            res.send( response )
        } )

        //#13  Save program to pump
        app.get( '/pumpCommand/save/pump/:pump/program/:program/gpm/:speed', function ( req: { params: { pump: string; program: string; speed: string; }; }, res: { send: { ( arg0: API.Response ): void; ( arg0: API.Response ): void; }; } )
        {
            let pump: Pump.PumpIndex = <Pump.PumpIndex> parseInt( req.params.pump )
            var program = parseInt( req.params.program )
            var speed = parseInt( req.params.speed )
            var response: API.Response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', program: ' + program + ', gpm: ' + speed + ', duration: null'
            response.pump = pump
            response.program = program
            response.speed = speed
            response.duration = null
            if ( pumpControllerMiddleware.pumpCommandSaveProgram( pump, program, speed ) )
            {
                res.send( response )

            }
            else
            {
                response.text = 'FAIL: ' + response.text
                res.send( response )
            }
        } )

        //#14  Save and run program for indefinite duration
        app.get( '/pumpCommand/saverun/pump/:pump/program/:program/gpm/:speed', function ( req: { params: { pump: string; program: string; speed: string; }; }, res: { send: { ( arg0: API.Response ): void; ( arg0: API.Response ): void; }; } )
        {
            let pump: Pump.PumpIndex = <Pump.PumpIndex> parseInt( req.params.pump )
            var program = parseInt( req.params.program )
            var speed = parseInt( req.params.speed )
            var response: API.Response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', program: ' + program + ', speed: ' + speed + ', duration: indefinite'
            response.pump = pump
            response.program = program
            response.speed = speed
            response.duration = -1
            if ( pumpControllerMiddleware.pumpCommandSaveProgramWithValueForDuration( pump, program, speed, -1 ) )
                res.send( response )
            else
            {
                response.text = 'FAIL: ' + response.text
                res.send( response )
            }
        } )

        //#15  Save and run program for specified duration

        app.get( '/pumpCommand/saverun/pump/:pump/program/:program/gpm/:speed/duration/:duration', function ( req: { params: { pump: string; program: string; speed: string; duration: string; }; }, res: { send: { ( arg0: API.Response ): void; ( arg0: API.Response ): void; }; } )
        {
            let pump: Pump.PumpIndex = <Pump.PumpIndex> parseInt( req.params.pump )
            var program = parseInt( req.params.program )
            var speed = parseInt( req.params.speed )
            var duration = parseInt( req.params.duration )
            var response: API.Response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', program: ' + program + ', speed: ' + speed + ', duration: ' + duration
            response.pump = pump
            response.program = program
            response.speed = speed
            response.duration = duration
            if ( pumpControllerMiddleware.pumpCommandSaveProgramWithValueForDuration( pump, program, speed, duration ) )
            {
                res.send( response )
            }
            else
            {
                response.text = 'FAIL: ' + response.text
                res.send( response )
            }

        } )

        /* END New pumpCommand API's  */


        /* Invalid pump commands -- sends response */
        app.get( '/pumpCommand/save/pump/:pump/rpm/:rpm', function ( req: any, res: { send: ( arg0: API.Response ) => void; } )
        {
            var response: API.Response = {}
            response.text = 'FAIL: Please provide the program number when saving the program.  /pumpCommand/save/pump/#/program/#/rpm/#'
            res.send( response )
        } )


        app.get( '/pumpCommand/save/pump/:pump/program/:program', function ( req: { params: { pump: string; program: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            let pump: Pump.PumpIndex = <Pump.PumpIndex> parseInt( req.params.pump )
            var program = parseInt( req.params.program )

            var response: API.Response = {}
            response.text = 'FAIL: Please provide a speed /speed/{speed} when requesting to save the program'
            response.pump = pump
            response.program = program
            response.duration = null
            res.send( response )
        } )

        /* END Invalid pump commands -- sends response */

        app.get( '/pumpConfig/pump/:pump/circuitSlot/:circuitSlot/speed/:speed', function ( req: any, res: { send: ( arg0: API.Response ) => void; } )
        {
            let _pump: Pump.PumpIndex = <Pump.PumpIndex> parseInt( req.params.pump )
            var _circuitSlot = parseInt( req.params.circuitSlot )
            var _speed = parseInt( req.params.speed )
            var response: API.Response = {}
            response.text = `Request to set pump ${_pump} circuit slot ${_circuitSlot} to speed ${_speed}`
            response.pump = _pump
            pumpConfig.setSpeedViaAPI(_pump, _circuitSlot, _speed)
            res.send( response )
        } )

        app.get( '/pumpConfig/pump/:pump/circuitSlot/:circuitSlot/circuit/:circuit', function ( req: any, res: { send: ( arg0: API.Response ) => void; } )
        {
            let _pump = <Pump.PumpIndex> parseInt( req.params.pump )
            var _circuitSlot = parseInt( req.params.circuitSlot )
            var _circuit = parseInt( req.params.circuit )
            var response: API.Response = {}
            response.text = `Request to set pump ${_pump} circuit slot ${_circuit} to circuit ${_circuit}`
            response.pump = _pump
            pumpConfig.setCircuitViaAPI(_pump, _circuitSlot, _circuit)
            res.send( response )
        } )

        app.get( '/pumpConfig/pump/:pump/type/:type', function ( req: any, res: { send: ( arg0: API.Response ) => void; } )
        {
            let _pump = <Pump.PumpIndex> parseInt( req.params.pump )
            var _type = <Pump.PumpType>  req.params.type 
            var response: API.Response = {}
            response.text = `Request to set pump ${_pump} to type ${_type}`
            response.pump = _pump
            pumpConfig.setTypeViaAPI(_pump, _type)
            res.send( response )
        } )

        app.get( '/pumpConfig/pump/:pump/circuitSlot/:circuitSlot/speedType/:type', function ( req: any, res: { send: ( arg0: API.Response ) => void; } )
        {
            let _pump = <Pump.PumpIndex> parseInt( req.params.pump )
            var _circuitSlot = parseInt( req.params.circuitSlot )
            var _type = <Pump.PumpSpeedType> req.params.type 
            var response: API.Response = {}
            response.text = `Request to set pump ${_pump} circuit slot ${_circuitSlot} to type ${_type}`
            response.pump = _pump
            pumpConfig.setRPMGPMViaAPI(_pump, _circuitSlot, _type)
            res.send( response )
        } )

        if ( dev )
        {
            // Parcel: middleware
            app.use( bundlerParcel.middleware() )
        }
    }

    async function startSSDPServer ( type: string )
    {
        try
        {
            let mac = helpers._getMac()
            logger.info( 'Starting up SSDP server' );
            var udn = 'uuid:806f52f4-1f35-4e33-9299-' + mac
            var port = settings.get( type + 'ExpressPort' ) || defaultPort[ type ]
            var location = type + '://' + ip.address() + ':' + port + '/device'
            var SSDP = ssdp.Server
            servers[ 'ssdp' ].server = new SSDP( {
                //logLevel: 'INFO',
                udn: udn,
                location: location,
                ssdpPort: 1900
            } )
            servers[ 'ssdp' ].isRunning = 0
            servers[ 'ssdp' ].server.addUSN( 'urn:schemas-upnp-org:device:PoolController:1' );
            // start the server
            await servers[ 'ssdp' ].server.start()
               
            logger.verbose( 'SSDP/UPnP Server started.' )
            servers[ 'ssdp' ].isRunning = 1
              

            servers[ 'ssdp' ].server.on( 'error', function ( e: any )
            {
                logger.error( 'error from SSDP:', e );
                console.error( e );
                // reject( e );
            } )
            return 'Server SSDP started.'
            // resolve( 'Server SSDP started.' )

        }
        catch ( err )
        {
            logger.warn(`Error starting SSDP Server ${err.message}`)
        }
       

    }

    export async function startMDNS (): Promise<string>
    {

        return new Promise( function ( resolve, reject )
        {


            logger.info( 'Starting up MDNS server' );
            servers[ 'mdns' ] = MDNS;

            servers[ 'mdns' ].on( 'response', function ( response: { answers: { [ key: string ]: any, name: string[] } } )
            {
                //logger.silly('got a response packet:', response)
                mdns.query.forEach( function ( mdnsname )
                {
                    logger.silly( 'looking to match on ', mdnsname )
                    if ( response.answers[ 0 ].name.includes( mdnsname ) )
                    {
                        // logger.silly('TXT data:', response.additionals[0].data.toString())
                        // logger.silly('SRV data:', JSON.stringify(response.additionals[1].data))
                        // logger.silly('IP Address:', response.additionals[2].data)
                        mdnsEmitter.emit( 'response', response )
                    }
                } )
            } )

            servers[ 'mdns' ].on( 'query', function ( query: any )
            {
                //logger.silly('got a query packet:', query)
                // if (query.name === '_nodejs._poolcontroller') {
                //     // send an A-record response for example.local
                //     mdns.respond({
                //         answers: [{
                //             name: 'example.local',
                //             type: 'A',
                //             ttl: 300,
                //             data: '192.168.1.5'
                //         }]
                //     })
                // }
            } )


            servers[ 'mdns' ].isRunning = 1
            servers[ 'mdns' ].query( {
                questions: [ {
                    name: 'myserver.local',
                    type: 'A'
                } ]
            },
                resolve( 'Server MDNS started.' )
            )
        } )

    }

    export function mdnsQuery ( query: string )
    {
        if ( mdns.query.indexOf( query ) === -1 )
        {
            mdns.query.push( query )
        }
        mdns.query.forEach( function ( el )
        {
            logger.debug( 'MDNS: going to send query for ', el )
            servers[ 'mdns' ].query( {
                questions: [ {
                    name: el,
                    type: 'PTR'
                } ]
            } )
        } )
    }

    export async function initAsync (): Promise<void>
    {
        var serversPromise = []
        serversPromise.push( startServerAsync( 'https' ) )
        serversPromise.push( startServerAsync( 'http' ) )
        serversPromise.push( startSSDPServer( 'http' ) )
        serversPromise.push( startMDNS() )


        return Promise.all( serversPromise )
            .then( ( results: any ) =>
            {
                logger.debug( 'Server starting complete.', results )
                emitter.emit( 'serverstarted', 'success!' )
            } )
            .catch( function ( e: Error )
            {
                console.error( e )
                logger.error( 'Error starting servers.', e )
                throw new Error( 'initAsync failed: Error starting servers. ' + e )
            } )


    }

    export async function closeAsync ( type: string ): Promise<void>
    {
        try
        {
            if ( servers === undefined )
            {
                logger.debug( `Not closing server ${ type } because servers object isn't defined yet.` )
                return
            }
            if ( servers.hasOwnProperty( type ) )
            {
                if ( type === 'mdns' )
                {
                    if ( servers[ 'mdns' ].isRunning )
                    {
                        servers['mdns'].removeAllListeners()
                        await servers[ 'mdns' ].destroy()
                    }
                }
                else if ( type === 'ssdp' )
                {
                    if ( servers[ 'ssdp' ].isRunning )
                    {
                        servers['ssdp'].server.removeAllListeners()
                        await servers[ 'ssdp' ].server.stop()
                        logger.verbose( 'SSDP/uPNP Server closed' );
                    }
                    // advertise shutting down and stop listening
                }
                else if ( servers[ type ].server !== undefined )
                {
                    io.stop( type )
                    await servers[ type ].server.close()
                    logger.verbose( 'Express Server ' + type + ' stopped taking new requests.' );
                    // graceful shutdown thanks to http-shutdown
                    await servers[ type ].server.shutdown()
                    logger.verbose( 'Express Server ' + type + ' closed.' );
                } else
                {
                    logger.debug( `Request to close ${ type } skipped because it is not running.` );
                }
            }
            else
            {
                logger.debug( `Stopping server ${ type } is skipped because it is an invalid type.` )
            }
        }
        catch ( err )
        {
            logger.error( 'error closing express or socket server.', err.toString() )
            console.error( err )
        }
    }

    export async function closeAllAsync (): Promise<void>
    {
        var serversPromise = []
        serversPromise.push( closeAsync( 'http' ), closeAsync( 'https' ), closeAsync( 'ssdp' ), closeAsync( 'mdns' ) )
        return Promise.all( serversPromise )
            .then( function ()
            {
                logger.verbose( 'All express + ssdp servers closed' )
            } )
            .catch( function ( err )
            {
                logger.error( 'Problem stopping express + ssdp servers' )
                console.error( err )
            } )
    }

    export function getServer (): IServersObj
    {
        return servers;
    };

}