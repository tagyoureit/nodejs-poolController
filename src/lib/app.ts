
import * as bluebird from 'bluebird';
import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, intellitouch, temperature, UOM, valve, intellichem, chlorinatorController, updateAvailable, integrations, clientConfig, io } from '../etc/internal';
import {getConfigOverview} from '../etc/getConfigOverview'
//import * as intellicenter from './equipment/intellicenter';
// import * as helpers from '../etc/helpers'
let promise = bluebird.Promise
let sysReadyEmitTimer: NodeJS.Timeout

/* istanbul ignore next */
export async function initAsync ()
{
    //Call the modules to initialize them

    try
    {
        // return promise.resolve()
        //     .then( function ()
        //     {
        logger.init()
        // } )
        // .then( settings.load )
        settings.load()

        // .delay( 25 )
        // .then( function ()
        // {
        if ( settings.isReady() )
        {
            logger.init( settings.get( 'logLevel' ) )
            let fileLog = settings.get( 'fileLog' )
            if ( settings.get( 'capturePackets' ) )
            {
                logger.initPacketLogger( fileLog )
            }
            else if ( fileLog.enabled )
            {
                logger.initFileLog( fileLog )
            }
            let socketLogLevel = settings.get( 'socketLogLevel' ) || 'info'
            logger.initSocketLog(socketLogLevel)
        }
        else
        {
            console.log( 'App should be ready by now, but it is not.' )
        }

        // } )
        // .delay( 25 )


        // .then( function ()
        // {
        await server.initAsync()
        sp.init()
        packetBuffer.init()
        receiveBuffer.init()
        logger.info( 'initializing logger' )
        clientConfig.init()
        integrations.init()
        updateAvailable.initAsync()
        // initialize variables to hold status
        pump.init()
        chlorinator.init()
        heat.init()
        time.init()
        schedule.init()
        customNames.init()
        circuit.init()
        intellitouch.init()
        temperature.init()
        UOM.init()
        valve.init()
        intellichem.init()

        // logger.info('Intro: ', settings.displayIntroMsg())
        // logger.info('Settings: ', settings.displaySettingsMsg())
        settings.displaySettingsMsg()
        //logic if we start the virtual pump/chlorinator controller is in the function
        pumpControllerTimers.startPumpController()
        chlorinatorController.startChlorinatorController()

        // helpers


        sysReadyEmitTimer = setInterval(checkSysReady, 250)


    }
    catch ( err )
    {
        logger.error( 'Error with initialization:', err )
        console.error( err )
    } 


}

const checkSysReady = () =>
{
    try
    {
        let _config = getConfigOverview()
        let ready = _config.config.systemReady
        if ( ready )
        {
            io.emitToClients( 'all' )
            clearInterval( sysReadyEmitTimer )
        }
    }
    catch (err) {
        logger.warn(`Not able to get systemReady status.  ${err.message}`)
    }

}

/* UNCOMMENT TO ALLOW V8 PROFILING */
//var profile = require(__dirname + '/helpers/profiler.js').init(__dirname + '/../profiler')


// Exit process cleanly.  From http://stackoverflow.com/questions/10021373/what-is-the-windows-equivalent-of-process-onsigint-in-node-js
/* istanbul ignore next */
process.on( 'exit', function ()
{
    //handle your on exit code
    console.log( "nodejs-poolController has closed successfully." );
} );



/* istanbul ignore next */
process.on( 'SIGINT', function ()
{
    console.log( 'Shutting down open processes' )
    return reload.stopAsync()
        .then( function ()
        {
            process.exit();
        } )

} );

// /* istanbul ignore next */
// global.exit_nodejs_poolController = function ()
// {
//     process.exit()
// }

