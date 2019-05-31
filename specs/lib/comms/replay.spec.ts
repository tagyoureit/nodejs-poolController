import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
import * as fs from 'fs'
import * as readline from 'readline';

describe( 'Tests the code that captures packets and a full log for troubleshooting', () =>
{
    type IType = 'packet' | 'api'
    type IDirection = 'inbound' | 'outbound'
    interface ILine
    {
        type: IType;
        direction: IDirection;
        packet: number[]
        message: number;
        timestamp: string
    }


    let fileContents: string[] = []

    const loadFile = async ( file: string ) =>
    {

        return new Promise( ( resolve: any, reject: any ) =>
        {
            const rl = readline.createInterface( {
                input: fs.createReadStream( path.join( process.cwd(), file ) )
            } );

            rl.on( 'line', function ( line: string )
            {
                let newline = JSON.parse( line )
                fileContents.push( newline );
            } );

            rl.on( 'close', function ()
            {
                resolve( 'done' )
            } );
        } )
    }

    let playFile = async function ()
    {
        return promise.resolve()
            .then( function ()
            {
                fileContents.forEach( function ( line: any )
                {
                    if ( line.type === 'packet' )
                    {
                        packetBuffer.push( Buffer.from( line.packet ) )
                    }
                    else
                    {
                        logger.debug( 'Skipping packet %s', JSON.stringify( line ) )
                    }
                } )
            } )
            .then( function ()
            {
                logger.debug( `Read ${ fileContents.length } lines. ` )
            } )
            .delay( 2 * fileContents.length )
    }

    describe( '#Replay packets from various systems', () =>
    {
        context( 'via the replay tool', function ()
        {
            before( async function ()
            {
                this.timeout( '10s' )
                await globalAny.initAllAsync( {
                    'configLocation': './specs/assets/replays/1/config.json',
                    'suppressWrite': true
                } )

                loggers = globalAny.setupLoggerStubOrSpy( 'spy', 'spy' )
            } );

            beforeEach( function ()
            {

            } )

            afterEach( function ()
            {
                sinon.restore()

            } )

            after( async function ()
            {
                await globalAny.stopAllAsync()
            } )

            it( '#Check intellibrite with two controllers', async function ()
            {
                await loadFile( './specs/assets/replays/1/packetCapture.json' )
                await playFile()
                let json = circuit.getLightGroup()
                // console.log('all lights:', JSON.stringify(json))
                json[ 3 ].position.should.eq( 1 )
                json[ 4 ].colorSet.should.eq( 0 )
                json[ 4 ].colorSwimDelay.should.eq( 5 )
            } )
        } )
    } )
} )
