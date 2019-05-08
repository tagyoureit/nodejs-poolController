import { settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController, promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers, pumpController } from '../../../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let updateAvailStub: sinon.SinonStub;
let setPumpRemoteSpy: sinon.SinonSpy;
let requestPumpStatusSpy: sinon.SinonSpy;
let settingsStub: sinon.SinonStub;
let queuePacketStub: sinon.SinonStub;
let clock: sinon.SinonFakeTimers

describe( 'pump controller', function ()
{

    describe('#startPumpController starts the timer for 1 or 2 pumps', function() {

        before(async()=> {
            await globalAny.initAllAsync()
        })

        beforeEach(function() {
            // sinon = sinon.sinon.create()
            loggers = globalAny.setupLoggerStubOrSpy('stub', 'spy')


            // socketIOStub = sinon.stub(io, 'emitToClients')
            clock = sinon.useFakeTimers()

            setPumpRemoteSpy = sinon.spy(pumpController, 'setPumpToRemoteControl')
            requestPumpStatusSpy = sinon.spy(pumpController, 'requestPumpStatus')
            settingsStub = sinon.stub(settings, 'updateExternalPumpProgram')
            queuePacketStub = sinon.stub(queuePacket, 'queuePacket')
        })

        afterEach(async()=> {
            sinon.restore()
        })

        after(async()=> {
            await globalAny.stopAllAsync()
        })

        it('starts pump 1 timer to check for status every 30 seconds', function() {
            this.timeout(5000)
            let numPumpStub = sinon.stub(pump, 'numberOfPumps').returns(1)

            settings.set('virtual.pumpController', 'always') //TODO: add test for 'default' and 'never'
            pumpControllerTimers.startPumpController()

            clock.tick(29 * 1000)
            setPumpRemoteSpy.callCount.should.eq(1)
            requestPumpStatusSpy.callCount.should.eq(1)
            clock.tick(4 * 1000)
            setPumpRemoteSpy.callCount.should.eq(1)
            // console.log('setPumpRemoteSpy: ', setPumpRemoteSpy.args)
            // console.log('requestPumpStatusSpy: ', requestPumpStatusSpy.args)
            setPumpRemoteSpy.args[0][0].should.eq(96)
            requestPumpStatusSpy.callCount.should.eq(1)
            requestPumpStatusSpy.args[0][0].should.eq(96)

            clock.tick(6 * 60 * 1000)
            setPumpRemoteSpy.callCount.should.eq(13)
            setPumpRemoteSpy.args[1][0].should.eq(96)
            requestPumpStatusSpy.callCount.should.eq(13)
            requestPumpStatusSpy.args[1][0].should.eq(96)
            // console.log('setPumpRemoteSpy: ', setPumpRemoteSpy.callCount, setPumpRemoteSpy.args)
            // console.log('requestPumpStatusSpy: ', requestPumpStatusSpy.args)

        });


        it('starts pump 1 & 2 timers to check for status every 30 seconds', function() {
            this.timeout(5000)
            let numPumpStub = sinon.stub(pump, 'numberOfPumps').returns(2)
            settings.set('virtual.pumpController','always')
            //TODO: add test for 'default' and 'never'

            pumpControllerTimers.startPumpController()

            clock.tick(29 * 1000)
            setPumpRemoteSpy.callCount.should.eq(2)
            requestPumpStatusSpy.callCount.should.eq(2)
            clock.tick(5 * 1000)

            setPumpRemoteSpy.callCount.should.eq(4)
            setPumpRemoteSpy.args[0][0].should.eq(96)
            setPumpRemoteSpy.args[1][0].should.eq(97)
            requestPumpStatusSpy.callCount.should.eq(4)
            requestPumpStatusSpy.args[0][0].should.eq(96)
            requestPumpStatusSpy.args[1][0].should.eq(97)

            clock.tick(5 * 60 * 1000)
            setPumpRemoteSpy.callCount.should.eq(24)
            setPumpRemoteSpy.args[2][0].should.eq(96)
            setPumpRemoteSpy.args[3][0].should.eq(97)
            requestPumpStatusSpy.callCount.should.eq(24)
            requestPumpStatusSpy.args[2][0].should.eq(96)
            requestPumpStatusSpy.args[3][0].should.eq(97)
            queuePacketStub.callCount.should.eq(48)

        });

        it('does not start virtual.pumpController with never setting', function() {
            loggers.loggerWarnStub.restore()
            loggers.loggerWarnStub = sinon.stub(logger,'warn')

            settings.set('virtual.pumpController','never')
            pumpControllerTimers.startPumpController()

            clock.tick(10 * 1000)
            setPumpRemoteSpy.callCount.should.eq(0)
            requestPumpStatusSpy.callCount.should.eq(0)
            loggers.loggerWarnStub.callCount.should.eq(1)

            settings.set('virtual.pumpController', 'default')
        });

        it('starts pump 1 & 2 timers to check for status every 30 seconds with virtual.pumpController set to always', function() {
            settings.set('virtual.pumpController', 'always')
            settings.set('intellitouch.installed', 1)
            let numPumpStub = sinon.stub(pump, 'numberOfPumps').returns(2)


            pumpControllerTimers.startPumpController()

            clock.tick(29 * 1000)
            setPumpRemoteSpy.callCount.should.eq(2)
            requestPumpStatusSpy.callCount.should.eq(2)
            clock.tick(4 * 1000)
            setPumpRemoteSpy.callCount.should.eq(2)
            //  console.log('setPumpRemoteSpy: ', setPumpRemoteSpy.args)
            //  console.log('requestPumpStatusSpy: ', requestPumpStatusSpy.args)
            //  setPumpRemoteSpy:  [ [ 96 ], [ 97 ] ]
            //  requestPumpStatusSpy:  [ [ 96 ], [ 97 ] ]
            setPumpRemoteSpy.args[0][0].should.eq(96)
            setPumpRemoteSpy.args[1][0].should.eq(97)
            requestPumpStatusSpy.callCount.should.eq(2)
            requestPumpStatusSpy.args[0][0].should.eq(96)
            requestPumpStatusSpy.args[1][0].should.eq(97)

            clock.tick(5 * 60  * 1000)
            // console.log('setPumpRemoteSpy: ', setPumpRemoteSpy.args)
            // console.log('requestPumpStatusSpy: ', requestPumpStatusSpy.args)
            // setPumpRemoteSpy:  [ [ 96 ], [ 97 ], [ 96 ], [ 97 ] ]
            // requestPumpStatusSpy:  [ [ 96 ], [ 97 ], [ 96 ], [ 97 ] ]
            setPumpRemoteSpy.callCount.should.eq(22)
            setPumpRemoteSpy.args[2][0].should.eq(96)
            setPumpRemoteSpy.args[3][0].should.eq(97)
            requestPumpStatusSpy.callCount.should.eq(22)
            requestPumpStatusSpy.args[2][0].should.eq(96)
            requestPumpStatusSpy.args[3][0].should.eq(97)
            settings.set('virtual.pumpController', 'default')
            settings.set('intellitouch.installed', 0)
        });

        it('runs pump 1 at 1000 rpm for 5 minute', function() {
            this.timeout(5 * 1000)
            let numPumpStub = sinon.stub(pump, 'numberOfPumps').returns(1)
            let pumpCurrentProgramSpy = sinon.spy(pump, 'setCurrentProgram')
            let pumpDurationSpy = sinon.spy(pump, 'setDuration')
            pumpControllerTimers.startRPMTimer(1, 1000, 5)

            clock.tick(30 * 1000)

            //  console.log('setPumpRemoteSpy: ', setPumpRemoteSpy.args)
            //  console.log('requestPumpStatusSpy: ', requestPumpStatusSpy.args)
            //  console.log('queuePacketStub: ', queuePacketStub.args)
            //  console.log('pumpCurrentProgramSpy: ', pumpCurrentProgramSpy.args)
            //  console.log('pumpDurationSpy: ', pumpDurationSpy.args)

            //  setPumpRemoteSpy:  [ [ 96 ], [ 97 ] ]
            //  requestPumpStatusSpy:  [ [ 96 ], [ 97 ] ]


            clock.tick(30 * 1000)
            // console.log('setPumpRemoteSpy: ', setPumpRemoteSpy.args)
            // console.log('requestPumpStatusSpy: ', requestPumpStatusSpy.args)
            // setPumpRemoteSpy:  [ [ 96 ], [ 97 ], [ 96 ], [ 97 ] ]
            // requestPumpStatusSpy:  [ [ 96 ], [ 97 ], [ 96 ], [ 97 ] ]

            // console.log('setPumpRemoteSpy: ', setPumpRemoteSpy.callCount, setPumpRemoteSpy.args)
            // console.log('requestPumpStatusSpy: ', requestPumpStatusSpy.args)
            setPumpRemoteSpy.callCount.should.eq(3)
            requestPumpStatusSpy.callCount.should.eq(3)

            clock.tick(10 * 60 * 1000)
            queuePacketStub.callCount.should.eq(70)
            clock.tick(10 * 60 * 1000)
            queuePacketStub.callCount.should.eq(110)
        });

    });
})
