import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers, io } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let queuePacketStub: sinon.SinonStub;
let preambleStub: sinon.SinonStub
let clock: sinon.SinonFakeTimers
let getCurrentStatusStub: sinon.SinonStub;
let socketIOStub: sinon.SinonStub;
let updateAvailStub: sinon.SinonStub;
let settingsStub: sinon.SinonStub;
import * as fs from 'fs'

describe( '#set functions', function ()
{

    describe( '#sends chlorinator commands', function ()
    {
        context( 'with NO chlorinator installed, with a REST API', function ()
        {

            before( async function ()
            {

                // return Promise.resolve()
                //     .then(function () {
                //         settings.set('virtual.chlorinatorController', 0)
                //         settings.set('chlorinator.installed', 0)
                //     })
                //     .then(globalAny.initAllAsync)
                await globalAny.initAllAsync()
            } );

            beforeEach( function ()
            {
                // sinon = sinon.sinon.create()
                //clock = sinon.useFakeTimers()
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
                queuePacketStub = sinon.stub( queuePacket, 'queuePacket' )
                //socketIOStub = sinon.stub(io, 'emitToClients')
            } )

            afterEach( function ()
            {
                sinon.restore()

            } )

            after( async function ()
            {
                await globalAny.stopAllAsync()
            } )


            it( 'should send a message if chlorinator is not installed', async function ()
            {
                let result: API.Response = await globalAny.requestPoolDataWithURLAsync( 'chlorinator/0' )
                result.text.should.contain( 'FAIL' )
                queuePacketStub.callCount.should.eq( 0 )
            } )
        } )
    } )
    describe( '#sends chlorinator commands', function ()
    {

        context( 'with the VIRTUAL chlorinator with a REST API', () =>
        {

            before( async function ()
            {
                await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_intellichlor_virtual.json' } )
            } );

            beforeEach( function ()
            {
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'stub' )
                queuePacketStub = sinon.stub( queuePacket, 'queuePacket' )
                settingsStub = sinon.stub( settings, 'updateChlorinatorDesiredOutput' )
            } )

            afterEach( function ()
            {
                chlorinator.setChlorinatorLevel( 0, 0, 0 )
                chlorinatorController.clearTimer()
                // Clear out the write queues
                queuePacket.init()
                writePacket.init()
                sinon.restore()
            } )

            after( async function ()
            {
                settings.set( 'virtual.chlorinatorController', 0 )
                settings.set( 'chlorinator.installed', 0 )
                await globalAny.stopAllAsync()
            } )

            it( 'starts chlorinator at 50%', async function ()
            {

                let result: API.Response = await globalAny.requestPoolDataWithURLAsync( 'chlorinator/50' )

                result.status.should.eq( 'on' )
                result.value.should.eq( 50 )
                queuePacketStub.callCount.should.eq( 1 )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 16, 2, 80, 17, 50 ] )

            } )
            it( 'starts chlorinator at 100%', async function ()
            {

                let result: API.Response = await globalAny.requestPoolDataWithURLAsync( 'chlorinator/100' )

                result.status.should.eq( 'on' )
                result.value.should.eq( 100 )
                queuePacketStub.callCount.should.eq( 1 )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 16, 2, 80, 17, 100 ] )
            } )
            it( 'starts chlorinator at 101% (super chlorinate)', async function ()
            {

                let result: API.Response = await globalAny.requestPoolDataWithURLAsync( 'chlorinator/101' )

                result.status.should.eq( 'on' )
                result.value.should.eq( 101 )
                queuePacketStub.callCount.should.eq( 1 )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 16, 2, 80, 17, 101 ] )
            } )
            it( 'starts chlorinator at -1% (should fail)', async function ()
            {

                let result: API.Response = await globalAny.requestPoolDataWithURLAsync( 'chlorinator/-1' )
                result.text.should.contain( 'FAIL' )
                queuePacketStub.callCount.should.eq( 0 )
            } )
            it( 'starts chlorinator at 150% (should fail)', async function ()
            {

                let result: API.Response = await globalAny.requestPoolDataWithURLAsync( 'chlorinator/150' )
                result.text.should.contain( 'FAIL' )
                queuePacketStub.callCount.should.eq( 0 )
            } )
            it( 'starts chlorinator at 0%', async function ()
            {
                //do this one last so
                let result: API.Response = await globalAny.requestPoolDataWithURLAsync( 'chlorinator/0' )
                result.status.should.eq( 'off' )
                result.value.should.eq( 0 )
                queuePacketStub.callCount.should.eq( 1 )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 16, 2, 80, 17, 0 ] )
            } )
        } );
    } );


    describe( '#sends chlorinator commands', function ()
    {

        context( 'with a Intellitouch chlorinator with a REST API', function ()
        {

            before( async function ()
            {

                await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_intellitouch_intellichlor.json' } )
            } );

            beforeEach( function ()
            {
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'stub' )
                queuePacketStub = sinon.stub( queuePacket, 'queuePacket' )
                settingsStub = sinon.stub( settings, 'updateChlorinatorDesiredOutput' )
                preambleStub = sinon.stub( intellitouch, 'getPreambleByte' ).returns( 99 )
            } )

            afterEach( function ()
            {
                chlorinator.setChlorinatorLevel( 0, 0, 0 )

                chlorinatorController.clearTimer()
                // Clear out the write queues
                queuePacket.init()
                writePacket.init()
                sinon.restore()
            } )

            after( async function ()
            {
                settings.set( 'virtual.chlorinatorController', 0 )
                settings.set( 'chlorinator.installed', 0 )
                await globalAny.stopAllAsync()
            } )

            it( 'starts chlorinator at 50%', async function ()
            {

                let result: API.Response = await globalAny.requestPoolDataWithURLAsync( 'chlorinator/50' )
                result.status.should.eq( 'on' )
                result.value.should.eq( 50 )
                queuePacketStub.callCount.should.eq( 1 )
                // NOTE: this spa setting should be 22 (11%) because that is what is saved in the config file
                // all others should then be 0 because we reset the value after each test
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 99, 16, 33, 153, 10, 22, 50, 0, 0, 0, 0, 0, 0, 0, 0 ] )
            } )
            it( 'starts chlorinator at 100%', async function ()
            {

                let result: API.Response = await globalAny.requestPoolDataWithURLAsync( 'chlorinator/100' )
                result.status.should.eq( 'on' )
                result.value.should.eq( 100 )
                queuePacketStub.callCount.should.eq( 1 )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 99, 16, 33, 153, 10, 0, 100, 0, 0, 0, 0, 0, 0, 0, 0 ] )
            } )
            it( 'starts chlorinator at 101% (super chlorinate)', async function ()
            {

                let result: API.Response = await globalAny.requestPoolDataWithURLAsync( 'chlorinator/101' )
                result.status.should.eq( 'on' )
                queuePacketStub.callCount.should.eq( 1 )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 99, 16, 33, 153, 10, 0, 0, 152, 0, 0, 0, 0, 0, 0, 0 ] )
            } )
            it( 'starts chlorinator at -2% (should fail)', async function ()
            {
                let result: API.Response = await globalAny.requestPoolDataWithURLAsync( 'chlorinator/-2' )
                result.text.should.contain( 'FAIL' )
                queuePacketStub.callCount.should.eq( 0 )
            } )
            it( 'starts chlorinator at 150% (should fail)', async function ()
            {
                let result: API.Response = await globalAny.requestPoolDataWithURLAsync( 'chlorinator/150' )
                result.text.should.contain( 'FAIL' )
                queuePacketStub.callCount.should.eq( 0 )
            } )

            it( 'tests /pool API at 75%', async function ()
            {
                let result: API.Response = await globalAny.requestPoolDataWithURLAsync( 'chlorinator/pool/75' )
                queuePacketStub.callCount.should.eq( 1 )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 99, 16, 33, 153, 10, 0, 75, 0, 0, 0, 0, 0, 0, 0, 0 ] )
            } )


            it( 'tests /spa API at 75%', async function ()
            {
                let result: API.Response = await globalAny.requestPoolDataWithURLAsync( 'chlorinator/spa/75' )
                queuePacketStub.callCount.should.eq( 1 )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 99, 16, 33, 153, 10, 150, 0, 0, 0, 0, 0, 0, 0, 0, 0 ] )
            } )

            it( 'tests /pool/x/spa/y API at 85%/25%', async function ()
            {
                let result: API.Response = await globalAny.requestPoolDataWithURLAsync( 'chlorinator/pool/85/spa/25' )
                queuePacketStub.callCount.should.eq( 1 )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 99, 16, 33, 153, 10, 50, 85, 0, 0, 0, 0, 0, 0, 0, 0 ] )
            } )


            it( 'tests /superChlorinateHours/x API at 2', async function ()
            {
                let result: API.Response = await globalAny.requestPoolDataWithURLAsync( 'chlorinator/superChlorinateHours/2' )
                queuePacketStub.callCount.should.eq( 1 )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 99, 16, 33, 153, 10, 0, 0, 130, 0, 0, 0, 0, 0, 0, 0 ] )
            } )

            it( 'tests /pool/x/spa/y/superChlorinateHours/z API at 2', async function ()
            {
                let result: API.Response = await globalAny.requestPoolDataWithURLAsync( 'chlorinator/pool/1/spa/2/superChlorinateHours/3' )
                queuePacketStub.callCount.should.eq( 1 )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 99, 16, 33, 153, 10, 4, 1, 131, 0, 0, 0, 0, 0, 0, 0 ] )
            } )

            it( 'sets chlorinator at 0%', async function ()
            {
                let result: API.Response = await globalAny.requestPoolDataWithURLAsync( 'chlorinator/0' )
                queuePacketStub.callCount.should.eq( 1 )
                queuePacketStub.args[ 0 ][ 0 ].should.deep.equal( [ 165, 99, 16, 33, 153, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ] )
            } )
        } );
    } );
} )