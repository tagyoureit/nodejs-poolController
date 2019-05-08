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

//TODO: Type Declaration Files
import { logger } from '../etc/internal';
import * as deepdiff from 'deep-diff';
import { testJson } from './testJson';
import * as fs from 'fs';
import * as _path from 'path'
let path = _path.posix
let _settings:any = {}
let observableDiff = deepdiff.observableDiff
let applyChange = deepdiff.applyChange
let ready = false
let opts: any = {};
let configurationFileContent: Settings.ISettingsInterface
let sysDefaultFileContent: any = {}
let argv = require( 'yargs-parser' )( process.argv.slice( 2 ), opts = { boolean: [ 'capturePackets', 'suppressWrite' ] } )

let packageJson = JSON.parse( fs.readFileSync( path.join( process.cwd(), '/package.json' ), 'utf-8' ) )
_settings.appVersion = packageJson.version

export namespace settings
{
    //var envParam = process.argv[2];
    //export var configurationFileContent, sysDefaultFileContent;

    export function has ( param:string ): boolean
    {
        try
        {
            if ( param === undefined )
                return _settings
            else if ( param.indexOf( '.' ) !== -1 )
            {
                let tempCopy = JSON.parse( JSON.stringify( _settings ) )
                var arr = param.split( '.' )
                while ( arr.length )
                {
                    tempCopy = tempCopy[ arr.shift() ]
                }
                return true
            }
            else
                return true
        }
        catch ( err )
        {
            return false
        }
    }


    export function lookup ( param: string ): any
    {
        // thought is to use a lookup, instead of hardcoding everything in _settings.
        switch ( param )
        {
            case "equipment":
                return configurationFileContent.equipment;
                break;
            case "controller":
                return configurationFileContent.equipment.controller
                break
            case "intellicom":
                return configurationFileContent.equipment.controller.intellicom
                break
            case "intellitouch":
                return configurationFileContent.equipment.controller.intellitouch
                break
            case "virtual":
                return configurationFileContent.equipment.controller.virtual
                break
            case "virtualPumpController":
                return configurationFileContent.equipment.controller.virtual.pumpController
                break
            case "virtualChlorinatorController":
                return configurationFileContent.equipment.controller.virtual.chlorinatorController
                break
            case "circuitFriendlyNames":
                return configurationFileContent.equipment.circuit.friendlyName
                break
            case "chlorinator":
                return configurationFileContent.equipment.chlorinator
                break
            case "pump":
                return configurationFileContent.equipment.pump
                break
            case "appAddress":
                return configurationFileContent.poolController.appAddress
                break
            case "circuit":
                return configurationFileContent.equipment.circuit
                break
            case "intellichem":
                return configurationFileContent.equipment.intellichem.installed
                break
            case "spa":
                return configurationFileContent.equipment.spa.installed
                break
            case "solar":
                return configurationFileContent.equipment.solar.installed
                break
            case "httpEnabled":
                return configurationFileContent.poolController.http.enabled
                break
            case "httpRedirectionToHttps":
                return configurationFileContent.poolController.http.redirectToHttps
                break
            case "httpExpressPort":
                return configurationFileContent.poolController.http.expressPort
                break
            case "httpExpressAuth":
                return configurationFileContent.poolController.http.expressAuth
                break
            case "httpExpressAuthFile":
                return configurationFileContent.poolController.http.expressAuthFile
                break
            case "httpsEnabled":
                return configurationFileContent.poolController.https.enabled
                break
            case "httpsExpressPort":
                return configurationFileContent.poolController.https.expressPort
                break
            case "httpsExpressAuth":
                return configurationFileContent.poolController.https.expressAuth
                break
            case "httpsExpressAuthFile":
                return configurationFileContent.poolController.https.expressAuthFile
                break
            case "httpsExpressKeyFile":
                return configurationFileContent.poolController.https.expressKeyFile
                break
            case "httpsExpressCertFile":
                return configurationFileContent.poolController.https.expressCertFile
                break
            case "netConnect":
                return configurationFileContent.poolController.network.netConnect
                break
            case "rs485Port":
                return configurationFileContent.poolController.network.rs485Port
                break
            case "netPort":
                return configurationFileContent.poolController.network.netPort
                break
            case "netHost":
                return configurationFileContent.poolController.network.netHost
                break
            case "inactivityRetry":
                return configurationFileContent.poolController.network.inactivityRetry
                break
            case "logLevel":
                return configurationFileContent.poolController.log.logLevel
                break
            case "socketLogLevel":
                return configurationFileContent.poolController.log.socketLogLevel
                break
            case "fileLog":
                return configurationFileContent.poolController.log.fileLog
                break
            case "logPumpMessages":
                return configurationFileContent.poolController.log.logPumpMessages
                break
            case "logDuplicateMessages":
                return configurationFileContent.poolController.log.logDuplicateMessages
                break
            case "logConsoleNotDecoded":
                return configurationFileContent.poolController.log.logConsoleNotDecoded
                break
            case "logConfigMessages":
                return configurationFileContent.poolController.log.logConfigMessages
                break
            case "logMessageDecoding":
                return configurationFileContent.poolController.log.logMessageDecoding
                break
            case "logChlorinator":
                return configurationFileContent.poolController.log.logChlorinator
                break
            case "logIntellichem":
                return configurationFileContent.poolController.log.logIntellichem
                break
            case "logPacketWrites":
                return configurationFileContent.poolController.log.logPacketWrites
                break
            case "logPumpTimers":
                return configurationFileContent.poolController.log.logPumpTimers
                break
            case "logApi":
                return configurationFileContent.poolController.log.logApi
                break
            case "influxEnabled":
                return configurationFileContent.poolController.database.influx.enabled
                break
            case "influxHost":
                return configurationFileContent.poolController.database.influx.host
                break
            case "influxPort":
                return configurationFileContent.poolController.database.influx.port
                break
            case "influxDB":
                return configurationFileContent.poolController.database.influx.database
                break
            case "integrations":
                return configurationFileContent.integrations
                break
            case "notifications":
                return configurationFileContent.meta.notifications
                break
        }

    }

    export function get ( param: string )
    {
        try
        {
            if ( param === undefined )
                return _settings
            else if ( param.indexOf( '.' ) !== -1 )
            {
                let tempCopy = Object.assign({},_settings) 
                var arr = param.split( '.' )
                while ( arr.length )
                {
                    tempCopy = tempCopy[ arr.shift() ]
                }
                return tempCopy
            }
            else
                return _settings[ param ]
        }
        catch ( err )
        {
            console.log( err )
            logger.error( 'Error getting setting %s: %s', param, err )
            console.log( 'settings are', JSON.stringify( _settings, null, 2 ) )
            return false
        }
    }

    export function set ( param: string, value: string | number )
    {
        if ( value === undefined )
            logger.warn( 'Trying to set settings parameter "%s" with no value.', param )
        else if ( param.indexOf( '.' ) !== -1 )
        {
            recurseSet( _settings, param.split( '.' ), value )
        }
        else
        {
            _settings[ param ] = value
        }
        writeConfigFile()
    }

    function recurseSet ( obj: any, arr: any, value:string|number )
    {
        if ( arr.length > 1 )
        {
            recurseSet( obj[ arr.shift() ], arr, value )
        }
        else
        {
            obj[ arr[ 0 ] ] = value
        }
    }

    export function writeConfigFile ()
    {

        fs.writeFileSync( _settings.configurationFileLocation, JSON.stringify( configurationFileContent, null, 4 ), 'utf-8' )
        //_settings.configurationFileContent = configurationFileContent
    }

    export function loadSysDefaultFile (): void
    {
        try
        {
            let _defaults = fs.readFileSync( _settings.sysDefaultFileLocation, 'utf-8' )
            sysDefaultFileContent = JSON.parse( _defaults )
            logger.silly( 'Loaded sysDefaults file: ', _settings.sysDefaultFileLocation )
        }
        catch ( err )
        {
            console.log(err)
            logger.error( `Settings: Error in loadSysDefaultFile ${ err }` )
        }
    }


    export function loadConfigFile ()
    {

        // Read in the file at the location specified.  
        // If it isn't there, then write out a blank, new file.
        try
        {
            var stat = fs.statSync( _settings.configurationFileLocation )
            logger.silly( 'Settings: Found valid file at %s.  %s', _settings.configurationFileLocation, stat.isFile() )
        }
        catch ( err )
        {
            logger.info( 'Config file %s not present.  Creating it.', _settings.configurationFileLocation )
            fs.writeFileSync( _settings.configurationFileLocation, '{}' )
        }

        let data = fs.readFileSync( _settings.configurationFileLocation, 'utf-8' )
        configurationFileContent = JSON.parse( data )
        logger.silly( 'Loaded configuration file: ', _settings.configurationFileLocation )
    }

    export function moveConfigFileKeys (): void
    {

        try
        {
            //this is implemented for >=4.1.34
            //move equipment.controller.circuitFriendlyNames to equipment.circuit:{friendlyName} if it exists
            if ( configurationFileContent.equipment.controller.hasOwnProperty( "circuitFriendlyNames" ) )
            {
                // add circuit key if not exists
                if ( !configurationFileContent.equipment.hasOwnProperty( "circuit" ) )
                {
                    configurationFileContent.equipment.circuit = { "friendlyName": {} }
                }
                // move key
                configurationFileContent.equipment.circuit.friendlyName = JSON.parse( JSON.stringify( configurationFileContent.equipment.controller.circuitFriendlyNames ) )
                // delete old key
                delete configurationFileContent.equipment.controller.circuitFriendlyNames
            }
        }
        catch ( err )
        {
            logger.silly( 'Settings: Error in moveConfigFileKeys.', err )
        }



    }

    export function migrateSysDefaultsToConfigFile ()
    {

        // if (configurationFileContent.version === sysDefaultFileContent.version) {
        //     logger.debug('Not comparing system defaults file to configuration file (%s) because they are the same version.', _settings.configurationFileLocation)
        // }
        // else {
        //var differences = diff(configurationFileContent, sysDefaultFileContent);
        // console.log(' differences in configurationFileContent, sysDefaultFileContent: ', differences)
        // console.log('\n\n')
        try
        {
            var diffs: {[key: string]: any, newKeys:string[], editedKeys: string[], deprecatedKeys: string[]} = { newKeys: [], editedKeys: [], deprecatedKeys: [] }
            observableDiff( configurationFileContent, sysDefaultFileContent, function ( d )
            {
                // console.log(d, d.kind)
                if ( d.kind === 'D' )
                {
                    // check for numberOfCircuits in config file and do not show warning for friendly names/pumps that are not in the sysDefault
                    if ( d.path[ 2 ] === 'friendlyName' )
                    {
                        if ( d.path[ 3 ] > configurationFileContent.equipment.controller.intellitouch.numberOfCircuits )
                        {
                            // too many circuits
                            diffs.deprecatedKeys.push( d.path.join( '.' ) + ':' + JSON.stringify( d.lhs ) )
                        }
                    }
                    else if ( d.path[ 1 ] === 'pump' )
                    {
                        if ( d.path[ 2 ] > configurationFileContent.equipment.controller.intellitouch.numberOfPumps )
                        {
                            // too many pumps
                            diffs.deprecatedKeys.push( d.path.join( '.' ) + ':' + JSON.stringify( d.lhs ) )
                        }
                    }
                    else
                    {
                        //logger.warn('Potential expired/deprecated key: %s:%s', d.path.join('.'), JSON.stringify(d.lhs))
                        diffs.deprecatedKeys.push( d.path.join( '.' ) + ':' + JSON.stringify( d.lhs ) )
                    }
                }
                if ( d.kind === 'E' )
                {
                    //ignore all edits except version number
                    if ( d.path[ 0 ] === 'version' )
                    {

                        diffs.editedKeys.push( d.path.join( '.' ) + ':' + JSON.stringify( d.rhs ) )

                        applyChange( configurationFileContent, sysDefaultFileContent, d )
                    }
                    // console.log('changes that are edited:', d)
                }
                if ( d.kind === 'N' )
                {
                    //logger.debug('New keys to be copied \n\tfrom %s\n\tto   %s\n\t %s:%s', _settings.sysDefaultFileLocation, _settings.configurationFileLocation, d.path.join('.'), JSON.stringify(d.rhs))
                    diffs.newKeys.push( d.path.join( '.' ) + ':' + JSON.stringify( d.rhs ) )

                    applyChange( configurationFileContent, sysDefaultFileContent, d )
                }
            }, function ( path, key )
                {
                    //console.log('\nanalyzing prefilter:', path, key)
                    // console.log('path[0]=integrations:', path[0] === 'integrations')
                    // console.log('sysDefaultFileContent.integrations:', sysDefaultFileContent.integrations)


                    for ( var integration in configurationFileContent.integrations )
                    {
                        if ( configurationFileContent.integrations.hasOwnProperty( integration ) )
                        {
                            //console.log('custom integration found:',integration, integration===key)
                            // ignore all of the custom integration entries
                            if ( key === integration )
                            {
                                return true
                            }
                        }
                    }
                    if ( path[ 0 ] === 'integrations' )
                    {
                        // ignore the 'integrations' object
                        return true
                    }

                    // if nothing else is true, continue processing
                    return false
                }
            );
            let str: string;
            if ( diffs.deprecatedKeys.length > 0 )
            {
                str = 'Potential expired/deprecated keys in  \n\tfile: ' + _settings.configurationFileLocation
                diffs.deprecatedKeys.forEach( function ( key )
                {
                    str += '\n\tkey: ' + key
                } )
                logger.info( str )
            }
            if ( diffs.newKeys.length > 0 )
            {
                str = 'New keys copied \n\tfrom: ' + _settings.sysDefaultFileLocation + '\n\t  to: ' + _settings.configurationFileLocation
                diffs.newKeys.forEach( function ( key )
                {
                    str += '\n\tkey: ' + key
                } )
                logger.info( str )
            }
            if ( diffs.editedKeys.length > 0 )
            {
                str = 'Edited keys updated \n\tfrom: ' + _settings.sysDefaultFileLocation + '\n\t  to: ' + _settings.configurationFileLocation
                diffs.editedKeys.forEach( function ( key )
                {
                    str += '\n\tkey: ' + key
                } )
                logger.info( str )
            }

            writeConfigFile()
        }
        catch ( err )
        {
            logger.error( 'Error in migrateSysDefaultsToConfigFile: %s', err )
            console.log( err )
        }
    };


    export function load ( _opts?: any )
    {
        try
        {
            if ( _opts === undefined )
            {
                _opts = {}
            }
            // _opts can be
            // sysDefaultLocation, configLocation, capturePackets, suppressWrite

            if ( _opts.sysDefaultLocation )
            {
                _settings.sysDefaultFileLocation = _opts.sysDefaultLocation;
            }
            else
            {
                _settings.sysDefaultFileLocation = path.join( process.cwd(), '/sysDefault.json' );
            }
            logger.silly( 'Using system default file: ', _settings.sysDefaultLocation )

            if ( _opts.configLocation )
            {
                _settings.configurationFileLocation = _opts.configLocation;
            } else if ( argv._.length )
            {

                _settings.configurationFileLocation = argv._[ 0 ]
            }
            else
            {
                _settings.configurationFileLocation = 'config.json';
            }
            logger.silly( 'Using config file: ', _settings.configurationFileLocation )

            loadSysDefaultFile()
            loadConfigFile()
            moveConfigFileKeys()
            migrateSysDefaultsToConfigFile()

            /*   Equipment   */
            //Controller
            _settings.equipment = configurationFileContent.equipment
            _settings.controller = configurationFileContent.equipment.controller
            _settings.intellicom = configurationFileContent.equipment.controller.intellicom;
            _settings.intellitouch = configurationFileContent.equipment.controller.intellitouch;
            _settings.virtual = configurationFileContent.equipment.controller.virtual
            _settings.virtualPumpController = configurationFileContent.equipment.controller.virtual.pumpController
            _settings.virtualChlorinatorController = configurationFileContent.equipment.controller.virtual.chlorinatorController

            _settings.circuitFriendlyNames = configurationFileContent.equipment.circuit.friendlyName

            //chlorinator
            _settings.chlorinator = configurationFileContent.equipment.chlorinator;

            //pump(s)
            _settings.pump = configurationFileContent.equipment.pump;
            /*   END Equipment   */
            _settings.appAddress = configurationFileContent.poolController.appAddress;

            //circuit
            _settings.circuit = configurationFileContent.equipment.circuit

            //intellichem
            _settings.intellichem = configurationFileContent.equipment.intellichem.installed

            //spa
            _settings.spa = configurationFileContent.equipment.spa.installed

            //solar
            _settings.solar = configurationFileContent.equipment.solar.installed

            //Web
            _settings.httpEnabled = configurationFileContent.poolController.http.enabled;
            _settings.httpRedirectToHttps = configurationFileContent.poolController.http.redirectToHttps;
            _settings.httpExpressPort = configurationFileContent.poolController.http.expressPort;
            _settings.httpExpressAuth = configurationFileContent.poolController.http.expressAuth;
            _settings.httpExpressAuthFile = configurationFileContent.poolController.http.expressAuthFile;
            _settings.httpsEnabled = configurationFileContent.poolController.https.enabled;
            _settings.httpsExpressPort = configurationFileContent.poolController.https.expressPort;
            _settings.httpsExpressAuth = configurationFileContent.poolController.https.expressAuth;
            _settings.httpsExpressAuthFile = configurationFileContent.poolController.https.expressAuthFile;
            _settings.httpsExpressKeyFile = configurationFileContent.poolController.https.expressKeyFile;
            _settings.httpsExpressCertFile = configurationFileContent.poolController.https.expressCertFile;


            //Network
            _settings.netConnect = configurationFileContent.poolController.network.netConnect;
            _settings.rs485Port = configurationFileContent.poolController.network.rs485Port;
            _settings.netPort = configurationFileContent.poolController.network.netPort;
            _settings.netHost = configurationFileContent.poolController.network.netHost;
            _settings.inactivityRetry = configurationFileContent.poolController.network.inactivityRetry;


            //Logs
            _settings.logLevel = configurationFileContent.poolController.log.logLevel;
            _settings.socketLogLevel = configurationFileContent.poolController.log.socketLogLevel;
            _settings.fileLog = configurationFileContent.poolController.log.fileLog;
            _settings.logPumpMessages = configurationFileContent.poolController.log.logPumpMessages;
            _settings.logDuplicateMessages = configurationFileContent.poolController.log.logDuplicateMessages;
            _settings.logConsoleNotDecoded = configurationFileContent.poolController.log.logConsoleNotDecoded;
            _settings.logConfigMessages = configurationFileContent.poolController.log.logConfigMessages;
            _settings.logMessageDecoding = configurationFileContent.poolController.log.logMessageDecoding;
            _settings.logChlorinator = configurationFileContent.poolController.log.logChlorinator;
            _settings.logIntellichem = configurationFileContent.poolController.log.logIntellichem;
            _settings.logPacketWrites = configurationFileContent.poolController.log.logPacketWrites;
            _settings.logPumpTimers = configurationFileContent.poolController.log.logPumpTimers;
            _settings.logApi = configurationFileContent.poolController.log.logApi;
            _settings.logIntellibrite = configurationFileContent.poolController.log.logIntellibrite;

            // Database
            _settings.influxEnabled = configurationFileContent.poolController.database.influx.enabled;
            _settings.influxHost = configurationFileContent.poolController.database.influx.host;
            _settings.influxPort = configurationFileContent.poolController.database.influx.port;
            _settings.influxDB = configurationFileContent.poolController.database.influx.database;

            // Integrations
            _settings.integrations = configurationFileContent.integrations;

            // Meta
            _settings.notifications = configurationFileContent.meta.notifications;
            logger.silly( 'Finished loading settings.' )
            logger.debug( 'Finished Loading Settings' )

            // Config File
            _settings.client = configurationFileContent.poolController.client

            // are we starting the app with packet capture enabled?
            if ( argv.capturePackets || _opts.capturePackets )
            {
                _settings.capturePackets = true
                _settings.fileLog = {
                    "enable": 1,
                    "fileLogLevel": "silly",
                    "fileName": "replay/packetCapture.log"
                };
                _settings.logPumpMessages = 1;
                _settings.logDuplicateMessages = 1;
                _settings.logConsoleNotDecoded = 1;
                _settings.logConfigMessages = 1;
                _settings.logMessageDecoding = 1;
                _settings.logChlorinator = 1;
                _settings.logIntellichem = 1;
                _settings.logPacketWrites = 1;
                _settings.logPumpTimers = 1;
                _settings.logApi = 1;
                _settings.logIntellibrite = 1;

                // copy the config file
                fs.writeFileSync( path.join( process.cwd(), '/replay/', _settings.configurationFileLocation ), fs.readFileSync( path.join( process.cwd(), _settings.configurationFileLocation ) ) );
            }
            else
            {
                _settings.capturePackets = false
            }

            // are we starting the app in Replay mode?
            if ( argv.suppressWrite || _opts.suppressWrite )
            {
                _settings.suppressWrite = true
                _settings.logPumpMessages = 1;
                _settings.logDuplicateMessages = 1;
                _settings.logConsoleNotDecoded = 1;
                _settings.logConfigMessages = 1;
                _settings.logMessageDecoding = 1;
                _settings.logChlorinator = 1;
                _settings.logIntellichem = 1;
                _settings.logPacketWrites = 1;
                _settings.logPumpTimers = 1;
                _settings.logApi = 1;
                _settings.logIntellibrite = 1;

            }
            else
            {
                _settings.suppressWrite = false
            }
        }
        catch ( err )
        {
            console.log( `Error in settings.js init` )
            console.log( err )
            logger.error( 'Error reading in settings.js %s.  %s', _settings.configurationFileLocation, err )

        }

        logger.info('Settings: Finished reading (settings.load())')
        logger.debug( 'Finished settings.load()' )
        ready = true;


    }


    export function displaySettingsMsg ()
    {
        var settingsStr;

        logger.info( 'Configuration settings:' )

        settingsStr = '\n*******************************';
        settingsStr += '\n Version: ' + _settings.appVersion;
        //settingsStr += '\n Config File: ' + _settings.userOverrideFileLocation
        settingsStr += '\n ';
        // settingsStr += '\n //-------  EQUIPMENT SETUP -----------';
        // settingsStr += '\n var intellicom = ' + JSON.stringify(_settings.intellicom, null, 4);
        // settingsStr += '\n var intellitouch = ' + JSON.stringify(_settings.intellitouch, null, 4);
        // settingsStr += '\n var virtual = ' + JSON.stringify(_settings.virtual, null, 4);
        // settingsStr += '\n var controller.id = ' + JSON.stringify(_settings.controller.id, null, 4);
        // settingsStr += '\n var circuit = ' + JSON.stringify(_settings.circuit, null, 4)
        // settingsStr += '\n'
        // settingsStr += '\n var chlorinator = ' + JSON.stringify(_settings.chlorinator, null, 4);
        // settingsStr += '\n'
        // settingsStr += '\n var pump = ' + JSON.stringify(_settings.pump, null, 4)
        // settingsStr += '\n //-------  END EQUIPMENT SETUP -----------';
        // settingsStr += '\n ';
        // settingsStr += '\n //-------  POOLCONTROLLER SETUP -----------';
        // settingsStr += '\n var appAddress = ' + _settings.appAddress;
        // settingsStr += '\n //-------  WEB SETUP -----------';
        // settingsStr += '\n var expressPort = ' + _settings.expressPort;
        // settingsStr += '\n var expressTransport = ' + _settings.expressTransport;
        // settingsStr += '\n var expressAuth = ' + _settings.expressAuth;
        // settingsStr += '\n var expressAuthFile = ' + _settings.expressAuthFile;
        // settingsStr += '\n //-------  END MISC SETUP -----------';
        // settingsStr += '\n ';
        // settingsStr += '\n //-------  NETWORK SETUP -----------';
        // settingsStr += '\n // Setup for Network Connection (socat or nc)';
        // settingsStr += '\n var netConnect = ' + _settings.netConnect;
        // settingsStr += '\n var rs485Port = ' + _settings.rs485Port;
        // settingsStr += '\n var netHost = ' + _settings.netHost;
        // settingsStr += '\n var netPort = ' + _settings.netPort;
        // settingsStr += '\n var timeout = ' + _settings.inactivityRetry;
        // settingsStr += '\n //-------  END NETWORK SETUP -----------';
        // settingsStr += '\n ';
        // settingsStr += '\n //-------  LOG SETUP -----------';
        // settingsStr += '\n var logLevel = ' + _settings.logLevel;
        // settingsStr += '\n var socketLogLevel = ' + _settings.socketLogLevel;`
        // settingsStr += '\n var fileLog = ' + JSON.stringify(_settings.fileLog);
        // settingsStr += '\n var logPumpMessages = ' + _settings.logPumpMessages;
        // settingsStr += '\n var logDuplicateMessages = ' + _settings.logDuplicateMessages;
        // settingsStr += '\n var logConsoleNotDecoded = ' + _settings.logConsoleNotDecoded;
        // settingsStr += '\n var logConfigMessages = ' + _settings.logConfigMessages;
        // settingsStr += '\n var logMessageDecoding = ' + _settings.logMessageDecoding;
        // settingsStr += '\n var logChlorinator = ' + _settings.logChlorinator;
        // settingsStr += '\n var logIntellichem = ' + _settings.logIntellichem;
        // settingsStr += '\n var logPacketWrites = ' + _settings.logPacketWrites;
        // settingsStr += '\n var logPumpTimers = ' + _settings.logPumpTimers;
        // settingsStr += '\n var logApi = ' + _settings.logApi;
        // settingsStr += '\n //-------  END LOG SETUP -----------\n\n';
        // settingsStr += '\n ';
        // settingsStr += '\n //-------  DATABASE SETUP -----------';
        // settingsStr += '\n var influxEnabled = ' + _settings.influxEnabled;
        // settingsStr += '\n var influxHost = ' + _settings.influxHost;
        // settingsStr += '\n var influxPort = ' + _settings.influxPort;
        // settingsStr += '\n var influxDB = ' + _settings.influxDB;
        // settingsStr += '\n //-------  END DATABASE SETUP -----------\n\n';

        settingsStr += '\nConfiguration file name: ' + _settings.configurationFileLocation
        settingsStr += '\n*******************************';

        settingsStr += JSON.stringify( configurationFileContent, null, 4 )
        logger.info( 'Settings:\n' + settingsStr )


        return settingsStr
    }

    export function getConfig ()
    {
        return configurationFileContent
    }

    export function updateClientPanelState ( configClient: Client.IPanelState ):void
    {
        Object.assign( configurationFileContent.poolController.client, configClient )
        writeConfigFile()
    }

    export function updatePumpType ( _pump: number, _type: string )
    {
        try
        {
            configurationFileContent.equipment.pump[ _pump ].type = _type
            get( 'pump' )[ _pump ].type = _type //TODO: we should re-read the file from disk at this point?
            if ( !testJson( configurationFileContent ) )
            {
                throw new Error( 'Error with updatePumpType format.  Aborting write.' )
            }

            writeConfigFile()
            logger.verbose( 'Updated pump %s type %s', _pump, _type, configurationFileContent )
            //pump.init()
            //pumpControllerTimers.startPumpController()

        }
        catch ( err )
        {
            logger.warn( 'Error updating pump type settings %s: ', configurationFileContent, err )
        }
    }

    export function updateExternalPumpProgram ( _pump: number, program: number, rpm: number )
    {
        try
        {
            configurationFileContent.equipment.pump[ _pump ].externalProgram[ program ] = rpm
            get( 'pump' )[ _pump ].externalProgram[ program ] = rpm
            if ( !testJson( configurationFileContent ) )
            {
                throw new Error( 'Error with updatExternalPumpProgram format.  Aborting write.' )
            }

            writeConfigFile()
            logger.verbose( 'Updated pump RPM settings %s', configurationFileContent )
        }
        catch ( err )
        {
            logger.warn( 'Error updating pump RPM settings %s: ', configurationFileContent, err )
        }
    }

    // export function updatePumpProgramGPM(_pump, program, gpm) {
    //     return Promise.resolve()
    //         .then(function() {
    //             configurationFileContent.equipment.pump[_pump].programGPM[program] = gpm  //TODO: this does not exist.  can we get rid of it?
    //             return fs.writeFileAsync(configurationFileContent, JSON.stringify(config, null, 4), 'utf-8')
    //         })
    //         .then(function() {
    //             logger.verbose('Updated pump GPM settings %s', configurationFileContent)
    //         })
    //         .catch(function(err) {
    //             logger.warn('Error updating config GPM pump settings %s: ', configurationFileContent, err)
    //         })
    // }


    export function updateVersionNotificationSetting ( dismissUntilNextRemoteVersionBump:boolean, _remote?:IUpdateAvailable.IJsonsRemote): void
    {
        console.log(`??? dismissUntilNextRemoteVersionBump: ${dismissUntilNextRemoteVersionBump}`)
        try
        {
            configurationFileContent.meta.notifications.version.remote.dismissUntilNextRemoteVersionBump = dismissUntilNextRemoteVersionBump
            if ( !( _remote === null || _remote === undefined ))
            {
                configurationFileContent.meta.notifications.version.remote.version = _remote.version
                configurationFileContent.meta.notifications.version.remote.tag_name = _remote.tag_name
            }
            if ( !testJson( configurationFileContent ) )
            {
                throw new Error( 'Error with updateVersionNotificationSetting format.  Aborting write.' )
            }
            writeConfigFile()
            logger.verbose( 'Updated version notification settings %s', JSON.stringify( configurationFileContent.meta.notifications ) )

        }
        catch ( err )
        {
            logger.warn( 'Error updating version notification settings %s: ', _settings.configurationFileLocation, err.message )
            console.error( err )
        }
    }

    export function getPumpExternalProgram ( _pump: number ): Pump.ExternalProgram
    {
        return configurationFileContent.equipment.pump[ _pump ].externalProgram
    }

    export function updateChlorinatorInstalled ( installed: number ): void
    {
        try
        {
            configurationFileContent.equipment.chlorinator.installed = installed
            //settings.get('equipment.chlorinator').installed = installed
            if ( !testJson( configurationFileContent ) )
            {
                throw new Error( 'Error with updateChlorinatorInstalledAsync format.  Aborting write.' )
            }
            writeConfigFile()
            if ( get( 'logChlorinator' ) )
                logger.verbose( 'Updated chlorinator settings (installed) %s', _settings.configurationFileLocation )
        }
        catch ( err )
        {
            logger.warn( 'Error updating chlorinator installed %s: ', _settings.configurationFileLocation, err )
            console.error( err )
        }
    }


    export function updateChlorinatorDesiredOutput ( pool: number, spa: number ): void
    {
        try
        {
            //configurationFileContent.equipment.chlorinator.desiredOutput = {}
            configurationFileContent.equipment.chlorinator.desiredOutput.pool = pool
            configurationFileContent.equipment.chlorinator.desiredOutput.spa = spa
            //settings.get().equipment.chlorinator.desiredOutput.pool = pool
            //settings.get().equipment.chlorinator.desiredOutput.spa = spa
            if ( !testJson( configurationFileContent ) )
            {
                throw new Error( 'Error with updateChlorinatorDesiredOutputAsync format.  Aborting write.' )
            }
            writeConfigFile()
            if ( get( 'logChlorinator' ) )
                logger.verbose( 'Updated chlorinator settings (desired output) %s', _settings.configurationFileLocation )
        }
        catch ( err )
        {
            logger.warn( 'Error updating chlorinator settings %s: ', _settings.configurationFileLocation, err )
            console.error( err )
        }
    }

    export function updateChlorinatorName ( name: string ): void
    {
        try
        {
            configurationFileContent.equipment.chlorinator.id.productName = name
            //         if (testJson(configurationFileContent)) {       
            writeConfigFile()
            logger.verbose( 'Updated chlorinator settings (name) %s', _settings.configurationFileLocation )
        }
        catch ( err )
        {
            logger.warn( 'Error updating chlorinator name %s: ', _settings.configurationFileLocation, err )
        }
    }

    export function isReady ()
    {
        return ready;
    }

}