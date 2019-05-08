import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket } from '../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
let loggers: Init.StubType;
let queuePacketStub: sinon.SinonStub;
let preambleStub: sinon.SinonStub


describe( '#sets various functions', function ()
{
    describe('#sets the date/time', function() {

        before(async ()=> {
            await globalAny.initAllAsync()
        });

        beforeEach(function() {
            loggers = globalAny.setupLoggerStubOrSpy('spy', 'stub')
            //clock = sinon.useFakeTimers();
            queuePacketStub = sinon.stub(queuePacket, 'queuePacket')
            preambleStub = sinon.stub(intellitouch, 'getPreambleByte').returns(33)
        })

        afterEach(function() {
            //restore the sinon after each function
            time.init()
            sinon.restore()
        })

        after(async function () {
            await globalAny.stopAllAsync()
        })

        context('with the HTTP REST API', function() {

            it('gets the date/time', function(done) {
                globalAny.requestPoolDataWithURLAsync('datetime')
                    .then(function(obj: {time:{controllerTime:string}}) {
                        obj.time.controllerTime.should.equal('notset')
                    })
                    .then(done,done)
            })


            it('sets a valid date/time', function(done) {
                globalAny.requestPoolDataWithURLAsync('datetime/set/time/21/55/date/2/01/02/19/0')
                    .then(function(obj: any) {
                        obj.text.should.contain('REST API')                     
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 133, 8, 21, 55, 2, 1, 2, 19, 0, 0 ])
                    })
                    .then(done,done)
            })
        })
    })

})
