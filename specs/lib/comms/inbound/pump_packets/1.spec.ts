import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers, decodeHelper, processController, processChlorinator, processPump } from '../../../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let settingsStub: sinon.SinonStub;
let queuePacketStub: sinon.SinonStub;


describe( 'processes 1 (Pump Program) packets', async function ()
{
    let data = [
        Buffer.from( [ 255, 0, 255, 165, 0, 96, 16, 1, 4, 3, 33, 0, 8, 1, 136 ] ), // run program 1
        Buffer.from( [ 255, 0, 255, 165, 0, 96, 16, 1, 4, 2, 196, 7, 58, 2, 33 ] ),
        Buffer.from( [ 255, 0, 255, 165, 0, 97, 16, 1, 4, 2, 196, 30, 10, 2, 9 ] )
    ]

    let equip = 'pump'

    describe( '#When packets arrive', async function ()
    {
        context( 'via serialport or Socat', async function ()
        {

            before( async function ()
            {
                await globalAny.initAllAsync( { 'configLocation': './specs/assets/config/templates/config.pump.VS.json' } )
            } );

            beforeEach( function ()
            {
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
                settingsStub = sinon.stub( settings, 'updateExternalPumpProgram' )
                queuePacketStub = sinon.stub( queuePacket, 'queuePacket' )

                pump.init()
            } )

            afterEach( function ()
            {
                sinon.restore()

            } )

            after( async function ()
            {
                await globalAny.stopAllAsync()
            } )

            it( '#Pump 1 Program 1 should be set to 490', async function ()
            {
                packetBuffer.push( Buffer.from( globalAny.pump1SetProgram1RPM490Packet_chk ) )
                await globalAny.wait( 50 )

                let json = pump.getCurrentPumpStatus().pump
                //console.log('json for pumps: ', JSON.stringify(json,null,2))
                json[ 1 ].externalProgram[ 1 ].should.equal( 490 )
            } )

            it( '#Pump 1 Program 2 should be set to 500 and then 2500', async function ()
            {
                packetBuffer.push( Buffer.from( globalAny.pump1SetProgram2RPM500Packet_chk ) )
                await globalAny.wait( 50 )
                let json = pump.getCurrentPumpStatus().pump
                //console.log('json for pumps: ', JSON.stringify(json,null,2))
                json[ 1 ].externalProgram[ 2 ].should.equal( 500 )
                packetBuffer.push( Buffer.from( globalAny.pump1SetProgram2RPM2500Packet_chk ) )
                await globalAny.wait( 50 )
                json = pump.getCurrentPumpStatus().pump
                json[ 1 ].externalProgram[ 2 ].should.equal( 2500 )
            } )

            it( '#Pump 1 Program 3 should be set to 2490', async function ()
            {
                        packetBuffer.push( Buffer.from( globalAny.pump1SetProgram3RPM2490Packet_chk ) )
                await globalAny.wait( 50 )
                        let json = pump.getCurrentPumpStatus().pump
                        //console.log('json for pumps: ', JSON.stringify(json,null,2))
                        json[ 1 ].externalProgram[ 3 ].should.equal( 2490 )
            } )

            it( '#Pump 1 Program 4 should be set to 2480', async function ()
            {
                        packetBuffer.push( Buffer.from( globalAny.pump1SetProgram4RPM2480Packet_chk ) )
                await globalAny.wait( 50 )
                        let json = pump.getCurrentPumpStatus().pump
                        //console.log('json for pumps: ', JSON.stringify(json,null,2))
                        json[ 1 ].externalProgram[ 4 ].should.equal( 2480 )
            } )

            it( '#Pump 2 Program 1 should be set to 490', async  () =>
            {
                        packetBuffer.push( Buffer.from( globalAny.pump2SetProgram1RPM490Packet_chk ) )
                await globalAny.wait( 50 )
                        let json = pump.getCurrentPumpStatus().pump
                        //console.log('json for pumps: ', JSON.stringify(json,null,2))
                        json[ 2 ].externalProgram[ 1 ].should.equal( 490 )
            } )

            it( '#Pump 2 Program 2 should be set to 2500', async  () =>
            {
                        packetBuffer.push( Buffer.from( globalAny.pump2SetProgram2RPM2500Packet_chk ) )
                await globalAny.wait( 50 )
                        let json = pump.getCurrentPumpStatus().pump
                        //console.log('json for pumps: ', JSON.stringify(json,null,2))
                        json[ 2 ].externalProgram[ 2 ].should.equal( 2500 )
            } )

            it( '#Pump 2 Program 3 should be set to 2490', async function ()
            {
                        packetBuffer.push( Buffer.from( globalAny.pump2SetProgram3RPM2490Packet_chk ) )
                await globalAny.wait( 50 )
                        let json = pump.getCurrentPumpStatus().pump
                        //console.log('json for pumps: ', JSON.stringify(json,null,2))
                        json[ 2 ].externalProgram[ 3 ].should.equal( 2490 )
            } )

            it( '#Pump 2 Program 4 should be set to 3450', async function ()
            {
                        packetBuffer.push( Buffer.from( globalAny.pump2SetProgram4RPM3450Packet_chk ) )
                await globalAny.wait( 50 )
                        let json = pump.getCurrentPumpStatus().pump
                        //console.log('json for pumps: ', JSON.stringify(json,null,2))
                        json[ 2 ].externalProgram[ 4 ].should.equal( 3450 )
            } )
    } )
    } )
} )