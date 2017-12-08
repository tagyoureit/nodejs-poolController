describe('pump controller - save speed (2/2)', function() {


    describe('#checks that the right functions are called', function() {


        before(function() {
            return global.initAll()
        });

        beforeEach(function() {
            sandbox = sinon.sandbox.create()
            loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
            loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
            loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
            loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
            loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
           //endPumpCommandStub = sandbox.stub()
            emitToClientsStub = sandbox.stub(bottle.container.io.emit)
            queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
            setPumpToRemoteControlStub = sandbox.spy(bottle.container.pumpController, 'setPumpToRemoteControl')
            saveProgramOnPumpStub = sandbox.spy(bottle.container.pumpController, 'saveProgramOnPump')
            setPumpToLocalControlStub = sandbox.spy(bottle.container.pumpController, 'setPumpToLocalControl')
            requestPumpStatusStub = sandbox.spy(bottle.container.pumpController, 'requestPumpStatus')
            configEditorStub = sandbox.stub(bottle.container.configEditor, 'updateExternalPumpProgram')
        })

        afterEach(function() {
            //restore the sandbox after each function
            bottle.container.pumpControllerTimers.clearTimer(1)
            bottle.container.pumpControllerTimers.clearTimer(2)
            sandbox.restore()
        })

        after(function() {
            return global.stopAll()
        })


        it('#sets pump 1 program 1 to 1000 rpm', function() {
            var index = 1
            var program = 1
            var speed = 1000

            bottle.container.pumpControllerMiddleware.pumpCommandSaveProgram(index, program, speed)


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
            setPumpToLocalControlStub  [ [ 96 ] ]
            requestPumpStatusStub [ [ 96 ] ]
            emitToClientsStub [ [ 'pump' ] ]
            */

            //pump 1 (96) should be set to remote


            setPumpToRemoteControlStub.args[0][0].should.eq(96)
            saveProgramOnPumpStub.args[0][0].should.eq(96)
            saveProgramOnPumpStub.args[0][1].should.eq(program)
            saveProgramOnPumpStub.args[0][2].should.eq(speed)
            //or
            saveProgramOnPumpStub.alwaysCalledWith(96, 1, 1000).should.be.true

            //set pump to local
            // setPumpToLocalControlStub.args[0][0].should.eq(96)
            setPumpToLocalControlStub.callCount.should.eq(0)
            //request pump status
            requestPumpStatusStub.calledWith(96).should.be.true

            //and finally emit to any clients
            emitToClientsStub.alwaysCalledWith('pump')

        });



        it('sets pump 1 program 2 to 1000 rpm', function() {

            var index = 1
            var program = 2
            var speed = 1000

            bottle.container.pumpControllerMiddleware.pumpCommandSaveProgram(index, program, speed)


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
            setPumpToLocalControlStub  [ [ 96 ] ]
            requestPumpStatusStub [ [ 96 ] ]
            emitToClientsStub [ [ 'pump' ] ]
            */

            //pump 1 (96) should be set to remote
            setPumpToRemoteControlStub.args[0][0].should.eq(96)

            saveProgramOnPumpStub.args[0][0].should.eq(96)
            saveProgramOnPumpStub.args[0][1].should.eq(program)
            saveProgramOnPumpStub.args[0][2].should.eq(speed)
            //or
            saveProgramOnPumpStub.alwaysCalledWith(96, 2, 1000).should.be.true

            //set pump to local
            // setPumpToLocalControlStub.args[0][0].should.eq(96)
            setPumpToLocalControlStub.callCount.should.eq(0)
            //request pump status
            requestPumpStatusStub.calledWith(96).should.be.true

            //and finally emit to any clients
            emitToClientsStub.alwaysCalledWith('pump')
        });

        it('sets pump 2 program 2 to 2000 rpm', function() {



            var index = 2
            var program = 2
            var speed = 2000
            bottle.container.pumpControllerMiddleware.pumpCommandSaveProgram(index, program, speed)


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
            setPumpToLocalControlStub  [ [ 97 ] ]
            requestPumpStatusStub [ [ 97 ] ]
            emitToClientsStub [ [ 'pump' ] ]
            */

            //pump 1 (96) should be set to remote
            setPumpToRemoteControlStub.args[0][0].should.eq(97)

            saveProgramOnPumpStub.args[0][0].should.eq(97)
            saveProgramOnPumpStub.args[0][1].should.eq(program)
            saveProgramOnPumpStub.args[0][2].should.eq(speed)
            //or
            saveProgramOnPumpStub.alwaysCalledWith(97, 2, 2000).should.be.true

            //set pump to local
            // setPumpToLocalControlStub.args[0][0].should.eq(97)
            setPumpToLocalControlStub.callCount.should.eq(0)
            //request pump status
            requestPumpStatusStub.calledWith(97).should.be.true

            //and finally emit to any clients
            emitToClientsStub.alwaysCalledWith('pump')
        });



        it('sets pump 1 program 5 to 1000 rpm (should fail)', function() {

            loggerWarnStub.restore()
            loggerWarnStub = sandbox.stub(bottle.container.logger,'warn')
            var index = 1
            var program = 5
            var speed = 1000

            bottle.container.pumpControllerMiddleware.pumpCommandSaveProgram(index, program, speed)

            //none of these should be called
            setPumpToRemoteControlStub.callCount.should.eq(0)
            saveProgramOnPumpStub.callCount.should.eq(0)
            setPumpToLocalControlStub.callCount.should.eq(0)
            requestPumpStatusStub.callCount.should.eq(0)
            emitToClientsStub.callCount.should.eq(0)
            loggerWarnStub.callCount.should.equal(1)
        });


        it('sets pump 55 program 1 to 1000 rpm (should fail)', function() {

            loggerWarnStub.restore()
            loggerWarnStub = sandbox.stub(bottle.container.logger,'warn')
            var index = 55
            var program = 1
            var speed = 1000

            bottle.container.pumpControllerMiddleware.pumpCommandSaveProgram(index, program, speed)

            //none of these should be called
            setPumpToRemoteControlStub.callCount.should.eq(0)
            saveProgramOnPumpStub.callCount.should.eq(0)
            setPumpToLocalControlStub.callCount.should.eq(0)
            requestPumpStatusStub.callCount.should.eq(0)
            emitToClientsStub.callCount.should.eq(0)
            loggerWarnStub.callCount.should.equal(1)
        });

        it('sets pump 1 program 1 to 5000 rpm (should fail)', function() {

            loggerWarnStub.restore()
            loggerWarnStub = sandbox.stub(bottle.container.logger,'warn')
            var index = 1
            var program = 1
            var speed = 5000

            bottle.container.pumpControllerMiddleware.pumpCommandSaveProgram(index, program, speed)

            //none of these should be called
            setPumpToRemoteControlStub.callCount.should.eq(0)
            saveProgramOnPumpStub.callCount.should.eq(0)
            setPumpToLocalControlStub.callCount.should.eq(0)
            requestPumpStatusStub.callCount.should.eq(0)
            emitToClientsStub.callCount.should.eq(0)
            loggerWarnStub.callCount.should.equal(2)
        })
    });


})
