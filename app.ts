// add source map support for .js to .ts files
require( 'source-map-support' ).install();

import { logger } from "./logger/Logger";
import { config } from "./config/Config";
import { conn } from "./controller/comms/Comms";
import { sys } from "./controller/Equipment";
import { SF, state } from "./controller/State";
import { webApp } from "./web/Server";
import * as readline from 'readline';
import { ControllerType } from "./controller/Constants";


export function initAsync ()
{
    return Promise.resolve()
        .then( function () { config.init(); } )
        .then( function () { logger.init(); } )
        .then(function () { conn.init(); })
        .then(function () {
            let c = config.getSection('controller.type');
            if (c.intellitouch) {
                SF.controllerType = ControllerType.IntelliTouch;
            }
            else if (c.intellicenter) {
                SF.controllerType = ControllerType.IntelliCenter;
            }
            else {
                SF.controllerType = ControllerType.Unknown;
            }
            console.log(`Init ${SF.controllerType} in App.js`)
        })
        //.then( function ()
        //{
        //    let c = config.getSection( 'controller.type' )
        //    if ( c.intellitouch )
        //        {
        //            PF.controllerType = ControllerType.IntelliTouch;
        //            SF.controllerType = ControllerType.IntelliTouch;
        //        } 
        //    else if ( c.intellicenter )
        //        {
        //            PF.controllerType = ControllerType.IntelliCenter;
        //            SF.controllerType = ControllerType.IntelliCenter;
        //    } 
        //    else
        //    {
        //        PF.controllerType = ControllerType.Unknown;
        //        SF.controllerType = ControllerType.Unknown;
        //    }
        //    console.log(`Init ${PF.controllerType} in App.js`)
        //} )
        // Moved the following into the factory set functions.
        .then( function () { state.init(); } )
        .then( function () { sys.init(); } )
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