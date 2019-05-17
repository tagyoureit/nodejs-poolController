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


import { logger, io } from './internal';
import { testJson } from './testJson';
import { settings } from './settings';
import * as _path from 'path'

let configClient: Client.IPanelState

export namespace clientConfig
{
    export function init (): void
    {
        loadDefaultClientConfig()
        getConfigClient()
    }

    function loadDefaultClientConfig (): void
    {
        configClient = {
            hideAux: true,
            panelState: {
                system: {
                    state: "visible"
                },
                pool: {
                    state: "visible"
                },
                spa: {
                    state: "visible"
                },
                chlorinator: {
                    state: "visible"
                },
                feature: {
                    state: "visible"
                },
                pump: {
                    state: "visible"
                },
                schedule: {
                    state: "visible"
                },
                eggtimer: {
                    state: "visible"
                },
                debug: {
                    state: "visible"
                },
                intellichem: {
                    state: "visible"
                },
                release: {
                    state: "visible"
                },
                light: {
                    state: "visible"
                },
                updateStatus: {
                    state: "visible"
                }
            }
        }
    }

    export function getConfigClient ()
    {
        configClient = settings.get( 'client' )
    }

    export function updateConfigEntry ( a: string, b: string, c: string, d?: string | boolean )
    {
        try
        {
            if ( b === null || b === undefined )
            {
                configClient[ a ] = d
            }
            else if ( c === null || c === undefined )
            {
                logger.verbose( `Updated configClient.json with values: ${ a } ${ b } ${ d }` )
                configClient[ a ][ b ] = d
            } else
            {
                logger.verbose( `Updated configClient.json with values: ${ a } ${ b } ${ c } ${ d }` )
                configClient[ a ][ b ][ c ] = d
            }
            if ( !testJson( configClient ) )
            {
                throw new Error( 'Error with update bootstrap config format.  Aborting write.' )
            }

            settings.updateClientPanelState( configClient )
            console.log(`OUTPUTTING ALL SOCKET`)
            io.emitToClients('all')
        }
        catch ( err )
        {
            logger.warn( `Error updating client config with values: ${ a } ${ b } ${ c } ${ d }` )
            logger.warn(`${err.message}\n${err.stack}`)
        }
    }

    export function resetPanelState ()
    {
        loadDefaultClientConfig()
        settings.updateClientPanelState( configClient )
        io.emitToClients( 'all' )
        logger.verbose( 'Reset client configuration settings' )
    }

    export function updatePanel ( panel: string, state: Client.Visibility ) 
    {
        if ( panel === null || state === null )
        {
            logger.error( `Recevied request to update panel but ${ panel } or ${ state } is null` )
        }
        else
        {
            logger.verbose( `Updated Panel ${ panel } to ${ state }` )
            updateConfigEntry( 'panelState', panel, 'state', state )
        }
    }
}