import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers, decodeHelper, processController, processChlorinator, processPump } from '../../../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let controllerConfigNeededStub: sinon.SinonStub;
let queuePacketStub: sinon.SinonStub;

describe('processes 25 (Chlorinator) packets', function () {
    let equip = 'controller'

    describe('#When packets arrive', function () {
        context('via serialport or Socat', function () {

            before(async function () {
                await globalAny.initAllAsync()
            });

            beforeEach(function () {
                loggers = globalAny.setupLoggerStubOrSpy('stub', 'spy')
                queuePacketStub = sinon.stub(queuePacket, 'queuePacket')
            })

            afterEach(function () {
                sinon.restore()
            })

            after(async function () {
                await globalAny.stopAllAsync()
            })

            it('#Chlorinator Packet Received', async function () {
                // multiple packets for code coverage
                let data = [
                    Buffer.from([255, 0, 255, 165, 33, 15, 16, 25, 22, 1, 10, 128, 29, 132, 0, 73, 110, 116, 101, 108, 108, 105, 99, 104, 108, 111, 114, 45, 45, 52, 48, 7, 231]),
                    Buffer.from([255, 0, 255, 165, 33, 15, 16, 25, 22, 1, 5, 64, 29, 132, 0, 73, 110, 116, 101, 108, 108, 105, 99, 104, 108, 111, 114, 45, 45, 52, 48, 7, 162]),
                    Buffer.from([255, 0, 255, 165, 33, 15, 16, 25, 22, 1, 10, 64, 29, 132, 0, 73, 110, 116, 101, 108, 108, 105, 99, 104, 108, 111, 114, 45, 45, 52, 48, 7, 167]),
                    Buffer.from([255, 0, 255, 165, 33, 15, 16, 25, 22, 1, 10, 64, 29, 132, 0, 73, 110, 116, 101, 108, 108, 105, 99, 104, 108, 111, 114, 45, 45, 52, 48, 7, 167])
                ]

                data.forEach(function (el:Buffer) {
                    packetBuffer.push(el)
                })
                await globalAny.wait(200)
                chlorinator.getChlorinatorStatus().chlorinator.saltPPM.should.eq(1450)
            })
        })
    })
})