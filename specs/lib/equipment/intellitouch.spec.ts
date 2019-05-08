import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
/// <reference path="../../../types/intellitouch.d.ts" />
// import * as sinon from 'ts-sinon'
// const stubInterface = sinon.stubInterface();

describe( 'processes Intellitouch packets', function ()
{
    describe( '#when requested', function ()
    {

        before( async function ()
        {

            await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config_intellitouch.json' } )

        } )

        beforeEach( function ()
        {
            globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
            sinon.stub(queuePacket, 'queuePacket');
        } )

        afterEach( function ()
        {
            sinon.restore()

        } )

        after( async function ()
        {

            await globalAny.stopAllAsync()

        } )


        it( '#should request checkIfNeedControllerConfiguration before preamble is set', () =>
        {
            intellitouch.getPreambleByte().should.equal( -1 )
            intellitouch.checkIfNeedControllerConfiguration().should.equal( 1 )
        } )

        it( '#should set and get the preamble and request configuration', async function ()
        {
            // interface Test {
            //     method(): number
            // }
            //let gCCSpy = sinon.spy( intellitouch, 'getControllerConfiguration' )
            //const gCCStub = stubInterface( { checkIfNeedControllerConfiguration: 99 } )
            // const testStub = stubInterface({method: 99})


            //ts-mockito
            // let mockedIntellitouch:Intellitouch.

            intellitouch.setPreambleByte( 33 )
            intellitouch.getPreambleByte().should.equal( 33 )
            intellitouch.checkIfNeedControllerConfiguration().should.equal( 0 )

            //gCCSpy.callCount.should.equal( 1 )
        } )



        it( '#will request configuration', function ()
        {
            intellitouch.getControllerConfiguration()

        } )


    } )
} )
