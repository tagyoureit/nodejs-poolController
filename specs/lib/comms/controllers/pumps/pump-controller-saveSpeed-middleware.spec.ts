import
{
    settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, io,
    pump, chlorinator, heat, time, schedule, customNames, circuit, temperature, UOM, valve, intellichem, chlorinatorController,
    promise, queuePacket, intellicenter, intellitouch, whichPacket, updateAvailable, writePacket, helpers, pumpController, pumpControllerMiddleware, 
} from '../../../../../src/etc/internal';
import * as sinon from 'sinon';
const globalAny: any = global;
import * as _path from 'path'
let path = _path.posix;
let loggers: Init.StubType;
let updateAvailStub: sinon.SinonStub;
let setPumpToLocalControlSpy: sinon.SinonSpy;
let setPumpToRemoteControlSpy: sinon.SinonSpy;
let settingsStub: sinon.SinonStub;
let queuePacketStub: sinon.SinonStub;
let saveProgramOnPumpSpy: sinon.SinonSpy
let requestPumpStatusSpy: sinon.SinonSpy
let emitToClientsStub: sinon.SinonStub


describe('pump controller - save speed (2/2)', function () {


    describe('#checks that the right functions are called', function() {


        before(async()=> {
            await globalAny.initAllAsync({'configLocation': './specs/assets/config/templates/config.pump.VS.json'})
        });

        beforeEach(function() {
            loggers = globalAny.setupLoggerStubOrSpy('stub', 'spy')
           //endPumpCommandStub = sinon.stub()
            emitToClientsStub = sinon.stub(io,'emitToClients' )
            queuePacketStub = sinon.stub(queuePacket, 'queuePacket')
            setPumpToRemoteControlSpy = sinon.spy(pumpController, 'setPumpToRemoteControl')
            saveProgramOnPumpSpy = sinon.spy(pumpController, 'saveProgramOnPump')
            setPumpToLocalControlSpy = sinon.spy(pumpController, 'setPumpToLocalControl')
            requestPumpStatusSpy = sinon.spy(pumpController, 'requestPumpStatus')
            settingsStub = sinon.stub(settings, 'updateExternalPumpProgram')
        })

        afterEach(function() {
            //restore the sinon after each function
            pumpControllerTimers.clearTimer(1)
            pumpControllerTimers.clearTimer(2)
            sinon.restore()
        })

        after(async() =>{
            await globalAny.stopAllAsync()
        })


        it('#sets pump 1 program 1 to 1000 rpm', function() {
            var index = <Pump.PumpIndex>1
            var program = 1
            var speed = 1000

            pumpControllerMiddleware.pumpCommandSaveProgram(index, program, speed)


            /* Desired output
            logger:  [ [ 'User request to save pump %s (index %s) to Program %s as %s RPM',
              1,
              96,
              1,
              1000 ],
              [ 'End of Sending Pump Packet \n \n' ] ]
            setPumpRemote:  [ [ 96 ] ]
            saveProgram:  [ [ 96, 1, 1000 ] ]
            endPumpCommandStub:  undefined
            setPumpToLocalControlSpy  [ [ 96 ] ]
            requestPumpStatusSpy [ [ 96 ] ]
            emitToClientsStub [ [ 'pump' ] ]
            */

            //pump 1 (96) should be set to remote


            setPumpToRemoteControlSpy.args[0][0].should.eq(96)
            saveProgramOnPumpSpy.args[0][0].should.eq(96)
            saveProgramOnPumpSpy.args[0][1].should.eq(program)
            saveProgramOnPumpSpy.args[0][2].should.eq(speed)
            //or
            saveProgramOnPumpSpy.alwaysCalledWith(96, 1, 1000).should.be.true

            //set pump to local
            // setPumpToLocalControlSpy.args[0][0].should.eq(96)
            setPumpToLocalControlSpy.callCount.should.eq(0)
            //request pump status
            requestPumpStatusSpy.calledWith(96).should.be.true

            //and finally emit to any clients
            emitToClientsStub.alwaysCalledWith('pump')

        });



        it('sets pump 1 program 2 to 1000 rpm', function() {

            var index = <Pump.PumpIndex>1
            var program = 2
            var speed = 1000

            pumpControllerMiddleware.pumpCommandSaveProgram(index, program, speed)


            /* Desired output
            logger:  [ [ 'User request to save pump %s (index %s) to Program %s as %s RPM',
              1,
              96,
              1,
              1000 ],
              [ 'End of Sending Pump Packet \n \n' ] ]
            setPumpRemote:  [ [ 96 ] ]
            saveProgram:  [ [ 96, 1, 1000 ] ]
            endPumpCommandStub:  undefined
            setPumpToLocalControlSpy  [ [ 96 ] ]
            requestPumpStatusSpy [ [ 96 ] ]
            emitToClientsStub [ [ 'pump' ] ]
            */

            //pump 1 (96) should be set to remote
            setPumpToRemoteControlSpy.args[0][0].should.eq(96)

            saveProgramOnPumpSpy.args[0][0].should.eq(96)
            saveProgramOnPumpSpy.args[0][1].should.eq(program)
            saveProgramOnPumpSpy.args[0][2].should.eq(speed)
            //or
            saveProgramOnPumpSpy.alwaysCalledWith(96, 2, 1000).should.be.true

            //set pump to local
            // setPumpToLocalControlSpy.args[0][0].should.eq(96)
            setPumpToLocalControlSpy.callCount.should.eq(0)
            //request pump status
            requestPumpStatusSpy.calledWith(96).should.be.true

            //and finally emit to any clients
            emitToClientsStub.alwaysCalledWith('pump')
        });

        it('sets pump 2 program 2 to 2000 rpm', function() {



            var index = <Pump.PumpIndex> 2
            var program = 2
            var speed = 2000
            pumpControllerMiddleware.pumpCommandSaveProgram(index, program, speed)


            /* Desired output
            logger:  [ [ 'User request to save pump %s (index %s) to Program %s as %s RPM',
              1,
              96,
              1,
              1000 ],
              [ 'End of Sending Pump Packet \n \n' ] ]
            setPumpRemote:  [ [ 97 ] ]
            saveProgram:  [ [ 97, 1, 1000 ] ]
            endPumpCommandStub:  undefined
            setPumpToLocalControlSpy  [ [ 97 ] ]
            requestPumpStatusSpy [ [ 97 ] ]
            emitToClientsStub [ [ 'pump' ] ]
            */

            //pump 1 (96) should be set to remote
            setPumpToRemoteControlSpy.args[0][0].should.eq(97)

            saveProgramOnPumpSpy.args[0][0].should.eq(97)
            saveProgramOnPumpSpy.args[0][1].should.eq(program)
            saveProgramOnPumpSpy.args[0][2].should.eq(speed)
            //or
            saveProgramOnPumpSpy.alwaysCalledWith(97, 2, 2000).should.be.true

            //set pump to local
            // setPumpToLocalControlSpy.args[0][0].should.eq(97)
            setPumpToLocalControlSpy.callCount.should.eq(0)
            //request pump status
            requestPumpStatusSpy.calledWith(97).should.be.true

            //and finally emit to any clients
            emitToClientsStub.alwaysCalledWith('pump')
        });



        it('sets pump 1 program 5 to 1000 rpm (should fail)', function() {

            loggers.loggerWarnStub.restore()
            loggers.loggerWarnStub = sinon.stub(logger,'warn')
            var index =  <Pump.PumpIndex> 1
            var program = 5
            var speed = 1000

            pumpControllerMiddleware.pumpCommandSaveProgram(index, program, speed)

            //none of these should be called
            setPumpToRemoteControlSpy.callCount.should.eq(0)
            saveProgramOnPumpSpy.callCount.should.eq(0)
            setPumpToLocalControlSpy.callCount.should.eq(0)
            requestPumpStatusSpy.callCount.should.eq(0)
            emitToClientsStub.callCount.should.eq(0)
            loggers.loggerWarnStub.callCount.should.equal(1)
        });


        it('sets pump 55 program 1 to 1000 rpm (should fail)', function() {

            loggers.loggerWarnStub.restore()
            loggers.loggerWarnStub = sinon.stub(logger,'warn')
            var index = <Pump.PumpIndex>55
            var program = 1
            var speed = 1000

            pumpControllerMiddleware.pumpCommandSaveProgram(index, program, speed)

            //none of these should be called
            setPumpToRemoteControlSpy.callCount.should.eq(0)
            saveProgramOnPumpSpy.callCount.should.eq(0)
            setPumpToLocalControlSpy.callCount.should.eq(0)
            requestPumpStatusSpy.callCount.should.eq(0)
            emitToClientsStub.callCount.should.eq(0)
            loggers.loggerWarnStub.callCount.should.equal(1)
        });

        it('sets pump 1 program 1 to 5000 rpm (should fail)', function() {

            loggers.loggerWarnStub.restore()
            loggers.loggerWarnStub = sinon.stub(logger,'warn')
            var index = <Pump.PumpIndex>1
            var program = 1
            var speed = 5000

            pumpControllerMiddleware.pumpCommandSaveProgram(index, program, speed)

            //none of these should be called
            setPumpToRemoteControlSpy.callCount.should.eq(0)
            saveProgramOnPumpSpy.callCount.should.eq(0)
            setPumpToLocalControlSpy.callCount.should.eq(0)
            requestPumpStatusSpy.callCount.should.eq(0)
            emitToClientsStub.callCount.should.eq(0)
            loggers.loggerWarnStub.callCount.should.equal(2)
        })
    });


})
