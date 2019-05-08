import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, updateAvailable, io, writePacket } from '../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
let loggers: Init.StubType;
import * as ioclient from 'socket.io-client';
import _path = require( 'path' )
let path = _path.posix
import * as fs from 'fs'


describe( 'updates config.json variables to match number of circuits and pumps', function ()
{
    context( 'when called with the internal function', function ()
    {


        before( async function ()
        {
            await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_multiple_controllers.json' } )
            loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'stub' )
        } )

        beforeEach( function ()
        {

        } )

        afterEach( function ()
        {
        } )

        after( async function ()
        {
            await globalAny.stopAllAsync()
        } )


        it( '#gets pumpExternalProgram', async function ()
        {
            var circuits = settings.get( 'equipment.circuit.friendlyName' )
            Object.keys( circuits ).length.should.eq( 50 )
            var pumps = settings.get( 'equipment.pump' )
            Object.keys( pumps ).length.should.eq( 8 )
        } )
    } )
} )
