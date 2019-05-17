import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, intellitouch, temperature, UOM, valve, intellichem, chlorinatorController, updateAvailable, queuePacket, writePacket, clientConfig } from '../../src/etc/internal';
import * as _path from 'path'
import * as sinon from 'sinon'
import * as ioclient from 'socket.io-client'
import rp = require( 'request-promise' )
let path = _path.posix;
import * as fs from 'fs'
import requestPromise = require( 'request-promise' );
import { TimeoutError } from 'bluebird';
let snapshotLogging: number = 0  // temp variable to hold logging state

// Workaround for Global from https://stackoverflow.com/questions/40743131/how-to-prevent-property-does-not-exist-on-type-global-with-jsdom-and-t
const globalAny: any = global;

export let logging: number = 0;
globalAny.logging = logging;
//variable to tell us if general logging of information is happening during tests.  This should be changed in each test; not here.

var logInitAndStop = 0;
globalAny.logInitAndStop = logInitAndStop;
//variable to tell us if we want to output start/stop/init of each module.  This should be changed here and will be enabled/disabled for all tests

let loggers: any;

globalAny.initAllAsync = async function ( opts: Init.OptsType = {} ): Promise<any>
{
    try
    {
        snapshotLogging = globalAny.logging
        if ( logInitAndStop )
        {
            enableLogging()
            logger.debug( '###Starting Init All###' )
        }
        else
        {

            globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
        }
        if ( opts.configLocation === undefined )
        {
            opts.configLocation = path.join( process.cwd(), '/specs/assets/config/templates/config_vanilla.json' )
        }
        await useShadowConfigFileAsync( opts )
        await server.initAsync()
        sp.mockSPBinding()
        packetBuffer.init()
        receiveBuffer.init()
        heat.init() // synchronous
        time.init() // synchronous
        pump.init() // synchronous
        schedule.init() // synchronous
        customNames.init() // synchronous
        circuit.init() // synchronous
        customNames.init() // synchronous
        intellitouch.init() // synchronous
        clientConfig.init() // synchronous
        //intellicenter.init() // synchronous
        temperature.init() // synchronous
        UOM.init() // synchronous
        valve.init() // synchronous
        queuePacket.init() // synchronous
        writePacket.init() // synchronous
        intellitouch.init() // synchronous
        intellichem.init() // synchronous
        chlorinator.init()


        if ( logInitAndStop )
        {
            logger.debug( '###Done Init All###' )
            disableLogging()
        }
        else
            sinon.restore()
        // restore logging
        if ( snapshotLogging ) enableLogging()
        else disableLogging()
    }
    catch ( err )
    {
        logger.error( 'Error in globalAny.initAllAsync. ', err )
        throw new Error( err )
    }


}


globalAny.stopAllAsync = async function (): Promise<void>
{
    try
    {
        if ( logInitAndStop )
        {
            snapshotLogging = globalAny.logging
            enableLogging()
            logger.debug( '***Starting Stop All***' )
        }
        else
        {
            globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
        }
        await server.closeAllAsync()
        writePacket.init()
        queuePacket.init()
        packetBuffer.clear()
        chlorinatorController.clearTimer()
        pumpControllerTimers.clearTimer( 1 )
        pumpControllerTimers.clearTimer( 2 )
        sp.close()
        await removeShadowConfigFile()
    }
    catch ( err )
    {
        logger.error( 'Error in stopAllAsync.', err )
        console.log( err )
    }
    if ( logInitAndStop )
    {
        logger.debug( '***Stop All Completed***' )
        disableLogging()
    }
    else
        sinon.restore()
    if ( snapshotLogging ) enableLogging()
    else disableLogging()
}



export function enableLogging (): void
{
    globalAny.logging = 1
    logger.changeLevel( 'silly', 'console' )
    settings.set( 'logPumpMessages', 1 )
    settings.set( 'logDuplicateMessages', 1 )
    settings.set( 'logConsoleNotDecoded', 1 )
    settings.set( 'logConfigMessages', 1 )
    settings.set( 'logMessageDecoding', 1 )
    settings.set( 'logChlorinator', 1 )
    settings.set( 'logPacketWrites', 1 )
    settings.set( 'logPumpTimers', 1 )
    settings.set( 'logIntellichem', 1 )
    settings.set( 'logReload', 1 )
    settings.set( 'logApi', 1 )
    settings.set( 'logIntellibrite', 1 )

}

export function disableLogging (): void
{
    globalAny.logging = 0
    logger.changeLevel( 'info', 'console' )
    settings.set( 'logPumpMessages', 0 )
    settings.set( 'logDuplicateMessages', 0 )
    settings.set( 'logConsoleNotDecoded', 0 )
    settings.set( 'logConfigMessages', 0 )
    settings.set( 'logMessageDecoding', 0 )
    settings.set( 'logChlorinator', 0 )
    settings.set( 'logPacketWrites', 0 )
    settings.set( 'logPumpTimers', 0 )
    settings.set( 'logIntellichem', 0 )
    settings.set( 'logReload', 0 )
    settings.set( 'logApi', 0 )
    settings.set( 'logIntellibrite', 0 )
}

function useShadowConfigFileAsync ( opts?: Init.OptsType ): void
{
    try
    {

        let orig = fs.readFileSync( opts.configLocation )
        fs.writeFileSync( path.join( process.cwd(), '/specs/assets/config/config.json' ), orig )
        if ( logInitAndStop )
        {
            let copy = fs.readFileSync( path.join( process.cwd(), '/specs/assets/config/config.json' ), 'utf-8' )
            logger.silly( 'useShadowConfigFileAsync: Shadow file just copied %s (%s bytes) to config.json', opts.configLocation, copy.length )
        }
        if ( opts.sysDefaultLocation === undefined )
        {
            opts.sysDefaultLocation = path.join( process.cwd(), '/sysDefault.json' )
        }

        settings.load( { 'configLocation': path.join( process.cwd(), '/specs/assets/config/config.json' ), 'sysDefaultLocation': ( opts.sysDefaultLocation || false ), 'capturePackets': ( opts.capturePackets || false ), 'suppressWrite': ( opts.suppressWrite || false ) } )
    }
    catch ( err )
    {
        logger.error( 'oops, we hit an error in useShadowConfigFileAsync', err )
        console.error( err )
        throw new Error( err )
    }
}

function removeShadowConfigFile (): void
{

    let shadowLocation = path.join( process.cwd(), '/specs/assets/config/config.json' )
    try
    {

        fs.statSync( shadowLocation )
        fs.unlinkSync( shadowLocation )
        logger.silly( 'config.json file removed' )

    }

    catch ( err )
    {
        console.log( `not removed~` )
        console.error( err )
        throw new Error( `File /specs/assets/config/config.json does not exist. ${ err }` )

    }
}


globalAny.waitForSocketResponseAsync = async ( _which: string ): Promise<any> =>
{
    return new Promise( ( resolve: any, reject: any ) =>
    {
        let timer: NodeJS.Timeout = setTimeout( function ()
        {
            reject( new Error( 'timeout in waitForSocketResponseAsync to ' + _which + ' call' ) )
        }, 1500 )  //in case no response, reject the promise

        let client = ioclient.connect( socketURL, socketOptions )
        client.emit( 'test', _which )
        client.on( _which, function ( data: any )
        {
            client.disconnect()
            clearTimeout( timer )
            resolve( data )
        } )
    } )

}

globalAny.requestPoolDataWithURLAsync = function ( endpoint: string, URL: string )
{
    if ( URL === undefined )
    {
        URL = 'http://localhost:' + settings.get( 'httpExpressPort' ) + '/'
    }
    var options = {
        method: 'GET',
        uri: URL + endpoint,
        resolveWithFullResponse: true,
        json: true
    };
    return rp( options )
        .then( function ( response: { body: any; } )
        {
            return response.body
        } )
        .catch( function ( err: string )
        {
            logger.error( 'Error with requestPoolDataWithURLAsync.', err.toString() )
            //console.error('Error in requestPoolDataWithURLAsync - settings:', settings.get())
            throw new Error( err )
        } )
}

globalAny.setupLoggerStubOrSpy = function ( normalLvL: string, errorLvl: string ): any
{
    sinon.restore()
    enableLogging()




    if ( normalLvL === undefined )
    {
        if ( logInitAndStop === 0 )
        {
            normalLvL = 'stub'
        }
        else normalLvL = 'spy'
    }

    if ( errorLvl === undefined )
    {
        if ( logInitAndStop === 0 )
        {
            errorLvl = 'stub'
        }
        else errorLvl = 'spy'
    }
    let normstub: Init.StubType = {}
    let errstub: Init.StubType;

    if ( normalLvL === 'spy' )
    {
        normstub = {
            loggerInfoStub: sinon.spy( logger, 'info' ),
            loggerVerboseStub: sinon.spy( logger, 'verbose' ),
            loggerDebugStub: sinon.spy( logger, 'debug' ),
            loggerSillyStub: sinon.spy( logger, 'silly' )
        }
    }
    else
    {
        normstub = {
            loggerInfoStub: sinon.stub( logger, 'info' ),
            loggerVerboseStub: sinon.stub( logger, 'verbose' ),
            loggerDebugStub: sinon.stub( logger, 'debug' ),
            loggerSillyStub: sinon.stub( logger, 'silly' )
        }
    }
    if ( errorLvl === 'spy' )
    {
        errstub = {
            loggerWarnStub: sinon.spy( logger, 'warn' ),
            loggerErrorStub: sinon.spy( logger, 'error' )
        }
    }
    else
    {
        errstub = {
            loggerWarnStub: sinon.stub( logger, 'warn' ),
            loggerErrorStub: sinon.stub( logger, 'error' )
        }
    }

    return Object.assign({}, normstub, errstub)
}

export function load ()
{
    console.log( 'I am loaded.' )
}
