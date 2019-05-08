import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
let loggers: Init.StubType;

describe( 'whichPacket tells the app what type of packet is in the queue', function ()
{
    var inboundPumpPacket = [165, 0, 96, 16, 6, 1, 10],
        inboundChlorinatorPacket = [16, 2, 80, 20, 0],
        inboundControllerPacket = [165, 99, 16, 34, 134, 2, 9, 0],
        outboundPumpPacket = [255,0,255,165, 0, 98, 16, 6, 1, 10],
        outboundChlorinatorPacket = [16, 2, 80, 20, 0],
        outboundControllerPacket = [255,0,255,165, 99, 16, 34, 134, 2, 9, 0]



    describe('#When queueing packets', function() {
        context('returns the right values', function() {
            before(function() {
                // await globalAny.initAllAsync()
            });

            beforeEach(function() {
                loggers = globalAny.setupLoggerStubOrSpy('stub', 'spy')
            })

            afterEach(function() {
                sinon.restore()
            })

            after(function() {
                // await globalAny.stopAllAsync()
            })

            it('#checks outbound packets', function() {
                whichPacket.outbound(outboundPumpPacket).should.equal('pump')
                whichPacket.outbound(outboundChlorinatorPacket).should.equal('chlorinator')
                whichPacket.outbound(outboundControllerPacket).should.equal('controller')
            })

            it('#checks inbound packets', function() {
                whichPacket.inbound(inboundPumpPacket).should.equal('pump')
                whichPacket.inbound(inboundChlorinatorPacket).should.equal('chlorinator')
                whichPacket.inbound(inboundControllerPacket).should.equal('controller')
            })
        })
    })
})
