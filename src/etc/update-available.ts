//  nodejs-poolController.  An application to control pool equipment.
//  Copyright (C) 2016, 2017, 2018, 2019.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU Affero General Public License as
//  published by the Free Software Foundation, either version 3 of the
//  License, or (at your option) any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU Affero General Public License for more details.
//
//  You should have received a copy of the GNU Affero General Public License
//  along with this program.  If not, see <http://www.gnu.org/licenses/>.


import request = require( 'request-promise' );
import { settings, logger, io } from './internal';
var _ = require( 'underscore' );
import * as path from 'path';
import { UriOptions } from 'request';
import * as fs from 'fs';
import { clientConfig } from './client-config-editor';

var userAgent = 'tagyoureit-nodejs-poolController-app',

    gitApiHost = 'api.github.com',
    gitLatestReleaseJSONPath = 'repos/tagyoureit/nodejs-poolController/releases/latest'


export namespace updateAvailable
{


    let jsons: IUpdateAvailable.Ijsons

    export function compareLocalToRemoteVersion (): void
    {


        var clientVersion = jsons.local.version,
            remoteVersion = jsons.remote.version,
            clientVerArr,
            remoteVerArr
        logger.silly( 'updateAvail: local ver: %s    latest published release ver: %s', clientVersion, remoteVersion )
        //compare the version numbers sequentially (major, minor, patch) to make sure there is a newer version and not just a different version
        //nice to have the try block here in case we can't split the result
        try
        {
            clientVerArr = jsons.local.version.split( "." ).map( function ( val: string )
            {
                return Number( val );
            } );
            remoteVerArr = jsons.remote.version.split( "." ).map( function ( val: string )
            {
                return Number( val );
            } );
        }
        catch ( err )
        {
            /*istanbul ignore next */
            logger.warn( 'updateAvail: error comparing versions: ', err )
            /*istanbul ignore next */
            throw new Error( err )
        }
        var clientVerCompare = 'equal';
        if ( clientVerArr.length !== remoteVerArr.length )
        {
            /*istanbul ignore next */
            // this is in case local a.b.c doesn't have same # of elements as another version a.b.c.d.  We should never get here.
            throw new Error( 'Version length of client (' + clientVersion + ') and remote ( ' + remoteVersion + ') do not match.' )
        } else
        {
            for ( var i = 0; i < clientVerArr.length; i++ )
            {
                if ( remoteVerArr[ i ] > clientVerArr[ i ] )
                {
                    clientVerCompare = 'local_is_older'
                    break
                } else if ( remoteVerArr[ i ] < clientVerArr[ i ] )
                {
                    clientVerCompare = 'local_is_newer'
                    break
                }
            }
        }

        jsons.result = clientVerCompare
        logger.silly( `updateAvail: versions discovered:  ${JSON.stringify(jsons,null,2)} `)
        //return jsons
    }

    export function compareLocalToSavedLocalVersion (): void
    {
        let _cachedJsonRemote = settings.get( 'notifications.version.remote' )
        logger.silly( 'updateAvail.compareLocaltoSavedLocal: (current) published release (%s) to cached/last published config.json version (%s)', jsons.remote.version, _cachedJsonRemote.version )
        let configJsonRemote = _cachedJsonRemote,
            remoteVersion = jsons.remote.version,
            configJsonVerArr,
            remoteVerArr
        //compare the version numbers sequentially (major, minor, patch) to make sure there is a newer version and not just a different version
        //nice to have the try block here in case we can't split the result
        if ( configJsonRemote.version === '' ) configJsonRemote.version = '0.0.0'

        configJsonVerArr = configJsonRemote.version.split( "." ).map( function ( val: string )
        {
            return Number( val );
        } );
        remoteVerArr = jsons.remote.version.split( "." ).map( function ( val: string )
        {
            return Number( val );
        } );
        var configJsonVerCompare = 'equal';
        if ( configJsonVerArr.length !== remoteVerArr.length )
        {
            /*istanbul ignore next */
            logger.error( `Version length of configJson \n ${JSON.stringify(configJsonRemote,null,2)} \n and remote\n${JSON.stringify(remoteVersion,null,2)} \n do not match.` )
            //emit(self, 'error', 'Version length of configJson (' + configJsonRemote + ') and remote ( ' + remoteVersion + ') do not match.')
        } else
        {
            for ( var i = 0; i < configJsonVerArr.length; i++ )
            {
                if ( remoteVerArr[ i ] > configJsonVerArr[ i ] )
                {
                    configJsonVerCompare = 'local_is_older'
                    break
                } else if ( remoteVerArr[ i ] < configJsonVerArr[ i ] )
                {

                    configJsonVerCompare = 'local_is_newer'
                    break
                }
            }
        }
        if ( configJsonVerCompare === 'equal' )
        {
            logger.silly( 'updateAvail: no change in current remote version compared to local cached config.json version of app' )
        } else if ( configJsonVerCompare === 'local_is_older' )
        {
            logger.info( 'Remote version of nodejs-poolController has been updated to %s.  Resetting local updateVersionNotificationSetting in config.json.', jsons.remote.version )
            settings.updateVersionNotificationSetting( false, jsons.remote )
        } else if ( configJsonVerCompare === 'local_is_newer' )
        {
            logger.silly( 'updateAvail: The local version is newer than the GitHub release.  Probably running a dev build.' )
        }


    }

    // export function getVersionFromJson ( _data: {version: string} ): string
    // {
    //     // let data: { version: string }
    //     // if ( !_.isObject( _data ) )
    //     // {
    //     //     data = JSON.parse( _data )
    //     // }
    //     /*istanbul ignore next */
    //     if ( !data.hasOwnProperty( 'version' ) )
    //     {
    //         logger.error( 'Could not read package.json version.  error!' )
    //         throw Error( 'Could not read package.json version.  error!' )
    //     }
    //     return _data.version
    // }



    /**
     * Sets jsons.remote by fetching it from Github
     */
    export async function getLatestReleaseJsonAsync (): Promise<void>
    {
        let options: ( UriOptions & request.RequestPromiseOptions ) = {
            method: 'GET',
            uri: 'https://' + gitApiHost + '/' + gitLatestReleaseJSONPath,
            headers: {
                'User-Agent': userAgent
            }
        }
        try
        {
            let _data: string = await request( options )
            let data = JSON.parse( _data );
            logger.silly( 'updateAvailable.getLatestRelease from Github (latest published release)...', data.tag_name )
            jsons.remote = {
                tag_name: data.tag_name,
                version: data.tag_name.replace( 'v', '' )
            }
        }
        catch ( e )
        {
            logger.error( 'Error contacting Github for latest published release: ' + e );
            // Promise.reject( e )
            console.log(e)
        }
    }

    /**
     * Emits results of version check to SocketIO clients
     */
    function emitResults (): void
    {
        var remote = settings.get( 'notifications.version.remote' )
        logger.silly( 'UpdateAvail: checking if we need to output updateAvail: %s (will send if false)', remote.dismissUntilNextRemoteVersionBump )
        if ( remote.dismissUntilNextRemoteVersionBump !== true )
        {
            // true = means that we will suppress the update until the next available version bump

            if ( jsons.hasOwnProperty( 'result' ) )
            {
                logger.silly( 'UpdateAvail outputting socket: %s ', JSON.stringify( jsons ) )
                // make sure panel is visible in clientConfig settings.
                clientConfig.updatePanel('updateStatus', 'visible')
                io.emitToClients( 'updateAvailable', jsons )
            }
            else
            {
                logger.silly( 'UpdateAvail: NOT outputting socket because it is missing the result string: %s ', JSON.stringify( jsons ) )
            }

        }
        else
        {
            logger.silly( `UpdateAvail: NOT outputting socket because config setting remote.dismissUntilNextRemoteVersionBump is ${ remote.dismissUntilNextRemoteVersionBump }` )
        }
    }

    /**
     * Prints results of version check to logger
     */
    function printResults (): void
    {

        if ( jsons.result === 'older' )
        {
            jsons.resultStr = 'Update available!  Version ' + jsons.remote.version + ' can be installed.  You have ' + jsons.local.version
            logger.warn( jsons.resultStr )
        } else if ( jsons.result === 'newer' )
        {
            jsons.resultStr = 'You are running a newer release (' + jsons.local.version + ') than the published release (' + jsons.remote.version + ')'
            logger.info( jsons.resultStr )
        } else if ( jsons.result === 'equal' )
        {
            jsons.resultStr = 'Your version (' + jsons.local.version + ') is the same as the latest published release.'
            logger.info( jsons.resultStr )
        }


    }

    export async function checkAsync (): Promise<void>
    {
        try
        {
            await getLatestReleaseJsonAsync()
            compareLocalToSavedLocalVersion()
            compareLocalToRemoteVersion()
            printResults()
            emitResults()
            logger.silly( 'updateAvail: finished successfully' )
        }
        catch /*istanbul ignore next */ ( err )
        {
            logger.error( 'Error getting version information for local or remote systems.', err )
            console.log( err )
        }
    }

    /**
     * This function is called externally to get the jsons object.
     * If jsons object is empty, this will initiate the process to check the versions.
     */
    export async function getResultsAsync (): Promise<IUpdateAvailable.Ijsons>
    {
        if ( jsons===undefined || Object.keys( jsons ).length === 0 )
        {
            await initAsync()

        }
        return jsons


    }

    /**
     * 
     * @param _location
     * Takes the _location parameter as a custom location for package.json (used for testing)
     */
    export async function initAsync ( _location?: string )
    {
        try
        {
            // reset variable
            jsons = {
                local: {
                    version: ''
                },
                remote: {
                    tag_name: '',
                    version: ''
                },
                result: ''
            }
            let location = ''
            if ( _location === undefined )
                location = path.join( process.cwd(), '/package.json' )
            else
                location = path.join( process.cwd(), _location )

            logger.silly( 'updateAvail: reading local version at:', location )
            let _data = await fs.readFileSync( location, 'utf-8' )
            let data = JSON.parse( _data )
            jsons.local = {
                //'version': getVersionFromJson( data )
                version: data.version
            }
            await checkAsync()
        }
        catch /*istanbul ignore next */ ( error )
        {
            console.error( error )
            logger.warn( 'updateAvail: Error reading local package.json: ', error )
        }

    }

}