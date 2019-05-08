import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
let loggers: Init.StubType;
let queuePacketStub: sinon.SinonStub;
let preambleStub: sinon.SinonStub

describe( '#fails to set various functions', function ()
{
    describe( '#sets the date/time', function ()
    {

        before( async function ()
        {
            await globalAny.initAllAsync()
        } );

        beforeEach( function ()
        {
            loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'stub' )
            queuePacketStub = sinon.stub( queuePacket, 'queuePacket' )
            preambleStub = sinon.stub( intellitouch, 'getPreambleByte' ).returns( 33 )
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


        context( 'with an invalid HTTP REST call', function ()
        {

            it( 'fails to set a valid date/time with invalid time (should fail)', async function ()
            {
                let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'datetime/set/time/21/61/date/2/01/02/19/0' )

                obj.text.should.contain( 'FAIL' )
                var res = time.getTime().time
                res.controllerTime.should.eq( 'notset' )
            } )
            it( 'fails to set a valid date/time with invalid date (should fail)', async function ()
            {
                let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'datetime/set/time/28/31/date/128/01/02/19/0' )
                obj.text.should.contain( 'FAIL' )
                var res = time.getTime().time
                res.controllerTime.should.eq( 'notset' )

            } )
            it( 'fails to set a valid date/time with invalid dst (should fail)', async function ()
            {
                let obj: API.Response = await globalAny.requestPoolDataWithURLAsync( 'datetime/set/time/21/31/date/8/01/02/19/3' )
                obj.text.should.contain( 'FAIL' )
                var res = time.getTime().time
                res.controllerTime.should.eq( 'notset' )
            } )
        } )
    } )

} )
