import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, whichPacket, updateAvailable, writePacket, helpers, decodeHelper, processController, processChlorinator, processPump, intellitouch } from '../../../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let controllerConfigNeededStub: sinon.SinonStub;
let queuePacketStub: sinon.SinonStub;
import {getExtendedPumpConfig} from '../../../../../src/lib/comms/inbound/controller/27'

describe( 'processes 27 (Extended Pump Config) packets', function ()
{
    let equip = 'controller'

    describe( '#When packets arrive', function ()
    {
        context( 'via serialport or Socat', function ()
        {

            before( async function ()
            {
                await globalAny.initAllAsync()
                loggers = globalAny.setupLoggerStubOrSpy( 'stub', 'spy' )
                queuePacketStub = sinon.stub( queuePacket, 'queuePacket' )
            } );

            beforeEach( function ()
            {
                
            } )

            afterEach( function ()
            {
               
            } )

            after( async function ()
            {
                sinon.restore()
                await globalAny.stopAllAsync()
            } )

            it( '#Extended Pump Configurations Received for VS/VSF', async function () 
            {
                let data: Buffer[] = [
                    Buffer.from( [ 255, 0, 255, 165, 33, 15, 16, 27, 46, 1, 128, 1, 2, 0, 1, 6, 2, 12, 4, 9, 11, 7, 6, 7, 128, 8, 132, 3, 15, 5, 3, 234, 128, 46, 108, 58, 2, 232, 220, 232, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 5 ] ),  //VS
                    Buffer.from( [ 255, 0, 255, 165, 33, 15, 16, 27, 46, 2, 64, 0, 0, 2, 1, 33, 2, 4, 0, 30, 0, 30, 0, 30, 0, 30, 0, 30, 0, 30, 0, 0, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 94 ] )  //VSF

                ]
                globalAny.customNames_chk.forEach( function ( el: Buffer )
                {
                    packetBuffer.push( el )
                } )
                globalAny.circuits_chk.forEach( function ( el: Buffer )
                {
                    packetBuffer.push( el )
                } )
                data.forEach( function ( el )
                {
                    packetBuffer.push( el )
                } )
                await globalAny.wait( 100 )
                let pumpConfig = getExtendedPumpConfig();
                pumpConfig[ 1 ].type.should.eq( 'VS' )
                pumpConfig[ 1 ].circuit_slot[ 1 ].rpm.should.eq( 1770 )
                pumpConfig[ 1 ].circuit_slot[ 1 ].name.should.eq('SPA' )
                pumpConfig[2].type.should.eq('VSF')                
                pumpConfig[2].circuit_slot[1].gpm.should.eq(33)
                pumpConfig[2].circuit_slot[1].name.should.eq('SPA')
                pumpConfig[2].circuit_slot[2].rpm.should.eq(1040)
                pumpConfig[2].circuit_slot[2].name.should.eq('JETS')
            } )

            it( '#Extended Pump Configurations Received for VF', async function ()
            {
                let data: Buffer[] = [
                    Buffer.from( [ 255, 0, 255, 165, 33, 15, 16, 27, 46, 1, 128, 1, 2, 0, 1, 6, 2, 12, 4, 9, 11, 7, 6, 7, 128, 8, 132, 3, 15, 5, 3, 234, 128, 46, 108, 58, 2, 232, 220, 232, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 5 ] ),  //VS
                    Buffer.from( [ 255, 0, 255, 165, 33, 15, 16, 27, 46, 2, 6, 15, 2, 0, 1, 29, 11, 35, 0, 30, 0, 30, 0, 30, 0, 30, 0, 30, 0, 30, 30, 55, 5, 10, 60, 5, 1, 50, 0, 10, 0, 0, 0, 0, 0, 0, 0
                        , 0, 0, 0, 0, 0, 0, 0, 0, 3, 41 ] )  //VF

                ]
                globalAny.customNames_chk.forEach( function ( el: Buffer )
                {
                    packetBuffer.push( el )
                } )
                globalAny.circuits_chk.forEach( function ( el: Buffer )
                {
                    packetBuffer.push( el )
                } )
                data.forEach( function ( el )
                {
                    packetBuffer.push( el )
                } )
                await globalAny.wait( 100 )
                let pumpConfig = getExtendedPumpConfig();
                pumpConfig[ 2 ].type.should.eq( 'VF' )
                pumpConfig[ 2 ].circuit_slot[ 1 ].gpm.should.eq( 29 )
                pumpConfig[ 2 ].circuit_slot[ 1 ].name.should.eq('SPA' )
                pumpConfig[2].filtering.filter.poolSize.should.eq(15000)             
            } )
        } )
    } )
} )
