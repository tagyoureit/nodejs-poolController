import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers, decodeHelper, processController, processChlorinator, processPump } from '../../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let isResponseSpy: sinon.SinonSpy;
let isResponsePumpSpy: sinon.SinonSpy;
let isResponseControllerSpy: sinon.SinonSpy;
let isResponseChlorinatorSpy: sinon.SinonSpy;
let checksumSpy: sinon.SinonSpy;
let controllerConfigNeededStub: sinon.SinonStub;
let getControllerConfigurationStub: sinon.SinonStub;
let ejectPacketAndResetSpy: sinon.SinonSpy;
let queuePacketStub: sinon.SinonStub;
let processChlorinatorPacketStub: sinon.SinonStub;
let processControllerPacketStub: sinon.SinonStub;
let processPumpPacketStub: sinon.SinonStub;


describe( 'decodeHelper processes controller packets', function ()
{
    var testarrayGOOD = [
        [165, 16, 15, 16, 8, 13, 73, 73, 49, 85, 100, 2, 0, 0, 45, 0, 0, 0, 0, 2, 148],
        [165, 16, 15, 16, 10, 12, 3, 87, 116, 114, 70, 97, 108, 108, 32, 51, 0, 251, 4, 247],
        [165, 16, 15, 16, 10, 12, 4, 80, 111, 111, 108, 32, 76, 111, 119, 50, 0, 251, 5, 7],
        [165, 16, 15, 16, 10, 12, 0, 87, 116, 114, 70, 97, 108, 108, 32, 49, 0, 251, 4, 242]
    ]
    var testarrayBAD = [
        [165, 16, 15, 16, 8, 13, 73, 73, 49, 85, 100, 2, 0, 0, 45, 0, 0, 0, 0, 2, 149],
        [165, 16, 15, 17, 10, 12, 3, 87, 116, 114, 70, 97, 108, 108, 32, 51, 1, 251, 4, 247],
        [165, 16, 15, 16, 12, 12, 4, 80, 111, 111, 108, 32, 76, 111, 119, 50, 0, 251, 2, 7],
        [165, 16, 15, 16, 10, 12, 0, 99, 116, 114, 70, 97, 108, 108, 32, 49, 0, 251, 4, 242]
    ]
    var equip = 'controller'

    describe('#When packets arrive', function() {
        context('via serialport or Socat', function() {

            before(async function () {
                await globalAny.initAllAsync()
            });

            beforeEach(function() {

                loggers = globalAny.setupLoggerStubOrSpy('stub', 'spy')
                queuePacketStub = sinon.stub(queuePacket, 'queuePacket')
                // pumpCommandSpy = sinon.spy(pumpControllerMiddleware, 'pumpCommand')
                checksumSpy = sinon.spy(decodeHelper, 'checksum')
                isResponseSpy = sinon.spy(decodeHelper.isResponse)
                isResponsePumpSpy = sinon.spy(decodeHelper.isResponsePump)
                isResponseChlorinatorSpy = sinon.spy(decodeHelper.isResponseChlorinator)
                isResponseControllerSpy = sinon.spy(decodeHelper.isResponseController)
                ejectPacketAndResetSpy = sinon.stub(writePacket, 'ejectPacketAndReset')
                controllerConfigNeededStub = sinon.stub(intellitouch, 'checkIfNeedControllerConfiguration')
                processControllerPacketStub = sinon.stub(processController, 'processControllerPacket')
                processPumpPacketStub = sinon.stub(processPump, 'processPumpPacket')
                processChlorinatorPacketStub = sinon.stub(processChlorinator, 'processChlorinatorPacket')
                queuePacket.init()
            })

            afterEach(function() {
                sinon.restore()

            })

            after(async function () {
                await globalAny.stopAllAsync()
            })

            it('#checksum should return true with various controller packets', function() {

                for (var i = 0; i < testarrayGOOD.length; i++) {
                    decodeHelper.checksum(testarrayGOOD[i], 25, equip).should.be.true

                }
            })

            it('#checksum should return false with various invalid controller packets', function() {
                for (var i = 0; i < testarrayBAD.length; i++) {
                    decodeHelper.checksum(testarrayBAD[i], 25, equip).should.be.false
                }

            })


            it('should try to decode the packet as a controller packet', function() {
                for (var i = 0; i < testarrayGOOD.length; i++) {
                    decodeHelper.processChecksum(testarrayGOOD[i], i * 10, equip)
                    processControllerPacketStub.args[i][0].should.contain.members(testarrayGOOD[i])
                    processPumpPacketStub.callCount.should.eq(0)
                    processChlorinatorPacketStub.callCount.should.eq(0)
                }
            })


        })
    })
})
