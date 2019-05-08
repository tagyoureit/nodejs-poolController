import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
import * as fs from 'fs'
import requestPromise = require( 'request-promise' );
import request = require( 'request' );
let writeSPPacketStub:sinon.SinonStub

describe( 'server', function ()
{
    describe('#circuit api calls', function() {

        context('with a URL', function() {

            before(async ()=> {
                await globalAny.initAllAsync()
            })

            beforeEach(function() {
                loggers = globalAny.setupLoggerStubOrSpy('stub', 'spy')
                writeSPPacketStub = sinon.stub(sp, 'writeSP')//.callsFake(function(){writePacket.postWritePacketHelper()})
                sinon.stub(intellitouch, 'getPreambleByte').returns(33)
            })

            afterEach(function() {
                writePacket.init()
                queuePacket.init()
            })

            after(async function () {
                await globalAny.stopAllAsync()
            })

            it('sends a user provided pump packet', async ()=> {
                //[255,0,255,165,0,96,16,6,1,10,1,38]
                let packet = globalAny.pump1PowerOn_chk.slice(5,10)
                let packetWithDash = ''
                packet.forEach(function(el:string){
                    packetWithDash += el + '-'
                })
                packetWithDash=packetWithDash.slice(0,-1) //remove last -
                await globalAny.requestPoolDataWithURLAsync( 'sendthispacket/' + packetWithDash )
                console.log(writeSPPacketStub.args)
                writeSPPacketStub.args[0][0].should.deep.equal(globalAny.pump1PowerOn_chk)
            
            });

            it('sends a user provided controller packet', async function () {
                //[255,0,255,165,33,15,16,17,7,1,6,9,20,15,59,255,2,106]
                let packet = globalAny.schedules_chk[0].slice(5,16)
                let packetWithDash = ''
                packet.forEach(function(el:string){
                    packetWithDash += el + '-'
                })
                packetWithDash=packetWithDash.slice(0,-1) //remove last -
                await globalAny.requestPoolDataWithURLAsync('sendthispacket/'+packetWithDash)
                    writeSPPacketStub.args[0][0].should.deep.equal(globalAny.schedules_chk[0])
            });

            it('sends a user provided chlorinator packet', async function () {
                let chlorPkt = [16,2,80,0,0,98,16,3]
                let packet = chlorPkt.slice(0,-3)
                let packetWithDash = ''
                packet.forEach(function(el){
                    packetWithDash += el + '-'
                })
                packetWithDash=packetWithDash.slice(0,-1) //remove last -
                await globalAny.requestPoolDataWithURLAsync('sendthispacket/'+packetWithDash)
                writeSPPacketStub.args[ 0 ][ 0 ].should.deep.equal( chlorPkt )
                
                });

        });

    });
});
