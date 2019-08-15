// add source map support for .js to .ts files
require( 'source-map-support' ).install();

import { logger } from "./logger/Logger";
import { config } from "./config/Config";
import { conn } from "./controller/comms/Comms";
import { PF, sys } from "./controller/Equipment";
import { state } from "./controller/State";
import { webApp } from "./web/Server";
import * as readline from 'readline';
import { ControllerType } from "./controller/Constants";


export function initAsync ()
{
    return Promise.resolve()
        .then( function () { config.init(); } )
        .then( function () { logger.init(); } )
        .then( function () { conn.init(); } )
        .then( function ()
        {
            let c = config.getSection( 'controller.type' )
            if ( c.intellitouch )
            // return Promise.resolve().then( function () { IntelliTouchState.init(); } )
            {
                console.log( `init intellitouch state` )
                return Promise.resolve().then( function () { state.init(); } )
            }
            else if ( c.intellicenter )
                return Promise.resolve().then( function () { state.init(); } )
        } )
        .then( function ()
        {
            let c = config.getSection( 'controller.type' )
            if ( c.intellitouch )
                return Promise.resolve().then( function ()
                {
                    PF.controllerType = ControllerType.IntelliTouch;
                    console.log( `Init ${ PF.controllerType } in App.js` )
                    PF.getPool()
                    sys.init();
                } )
            else if ( c.intellicenter )
                return Promise.resolve().then( function ()
                {
                    PF.controllerType = ControllerType.IntelliCenter;
                    console.log( `Init ${ PF.controllerType } in App.js` )
                    PF.getPool();
                    PF.getPool()
                    sys.init();
                } )
        } )
        .then( function () { webApp.init(); } );
}
export function stopAsync (): Promise<void>
{
    return Promise.resolve()
        .then( function () { console.log( 'Shutting down open processes' ); } )
        .then( function () { conn.stopAsync(); } )
        .then( function () { sys.stopAsync(); } )
        .then( function () { state.stopAsync(); } )
        .then( function () { process.exit(); } );
}
if ( process.platform === 'win32' )
{
    let rl = readline.createInterface( { input: process.stdin, output: process.stdout } );
    rl.on( 'SIGINT', function () { stopAsync(); } );
}
else
{
    process.on( 'SIGINT', function () { return stopAsync(); } );
}
initAsync();