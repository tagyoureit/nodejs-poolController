import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket } from '../../../src/etc/internal';
import * as sinon from 'sinon';
import nock = require( 'nock' );
const globalAny: any = global;
let loggers: Init.StubType;
let scope: any;
import * as _path from 'path'
let path = _path.posix;
let queuePacketStub: sinon.SinonStub;
let preambleStub: sinon.SinonStub
let pWPHStub: sinon.SinonStub
let updateAvailStub: sinon.SinonStub
let writeSPPacketStub: sinon.SinonStub
let controllerConfigNeededStub: sinon.SinonStub
import * as ioclient from 'socket.io-client'
import { RequestAPI } from 'request';

describe( '#sets various functions', function ()
{

    describe( '#sets the date/time', function ()
    {

        before( async function ()
        {
            await globalAny.initAllAsync()
        } );

        beforeEach( function ()
        {
            loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
            queuePacketStub = sinon.stub( queuePacket, 'queuePacket' )
            preambleStub = sinon.stub( intellitouch, 'getPreambleByte' ).returns( 99 )
        } )

        afterEach( function ()
        {
            //restore the sinon after each function
            time.init()
            sinon.restore()
        } )

        after( async function ()
        {
            await globalAny.stopAllAsync()
        } )

        context( 'with the HTTP REST API', function ()
        {
            it( 'sets a valid schedule 12', async function ()
            {
                return globalAny.requestPoolDataWithURLAsync( 'schedule/set/12/5/13/20/13/40/131' )
                    .then( function ( obj: API.Response )
                    {
                        obj.text.should.contain( 'REST API' )
                        //                    console.log('queuePacketStub', queuePacketStub.args)
                        queuePacketStub.args[ 0 ][ 0 ].should.contain.members( [ 165, 99, 16, 33, 145, 7, 12, 5, 13, 20, 13, 40, 131 ] )
                        queuePacketStub.args[ 1 ][ 0 ].should.contain.members( [ 165, 99, 16, 33, 209, 1, 1 ] )
                        queuePacketStub.args[ 12 ][ 0 ].should.contain.members( [ 165, 99, 16, 33, 209, 1, 12 ] )

                    } )
            } )

        } )
        context( 'with an invalid HTTP REST call', function ()
        {


            // it('fails to set a valid date/time with invalid time (should fail)', function(done) {
            //     globalAny.requestPoolDataWithURLAsync('datetime/set/time/21/61/date/2/01/02/19/0').then(function(obj) {
            //         obj.text.should.contain('FAIL')
            //         var res = time.getTime()
            //         res.controllerTime.should.eq(-1)
            //         done()
            //     })
            // })
            // it('fails to set a valid date/time with invalid date (should fail)', function(done) {
            //     globalAny.requestPoolDataWithURLAsync('datetime/set/time/21/31/date/128/01/02/19/0').then(function(obj) {
            //         obj.text.should.contain('FAIL')
            //         var res = time.getTime()
            //         res.controllerTime.should.eq(-1)
            //         done()
            //     })
            // })
            // it('fails to set a valid date/time with invalid dst (should fail)', function(done) {
            //     globalAny.requestPoolDataWithURLAsync('datetime/set/time/21/31/date/8/01/02/19/3').then(function(obj) {
            //         obj.text.should.contain('FAIL')
            //         var res = time.getTime()
            //         res.controllerTime.should.eq(-1)
            //         done()
            //     })
            // })
        } )
    } )

} )
