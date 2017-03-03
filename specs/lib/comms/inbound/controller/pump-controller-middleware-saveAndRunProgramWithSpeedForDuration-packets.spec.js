describe('pump controller - save and run program with speed for duration', function() {


    describe('#checks that the right packets are queued', function() {

        before(function() {
            bottle.container.logApi = 1
            sandbox = sinon.sandbox.create()
            bottle.container.logger.transports.console.level = 'silly';
        });

        beforeEach(function() {
            loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
            loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
            loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
            loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
            loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
            //setPumpToRemoteControlStub = sandbox.stub(bottle.container.pumpController, 'setPumpToRemoteControl')
            //saveProgramOnPumpStub = sandbox.stub(bottle.container.pumpController, 'saveProgramOnPump')
            endPumpCommandStub = sandbox.stub()
            //setPumpToLocalControlStub = sandbox.stub(bottle.container.pumpController, 'setPumpToLocalControl')
            //requestPumpStatusStub = sandbox.stub(bottle.container.pumpController, 'requestPumpStatus')
            emitToClientsStub = sandbox.stub(bottle.container.io.emit)
            queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
            socketIOStub = sandbox.stub(bottle.container.io, 'emitToClients')
            configEditorStub = sandbox.stub(bottle.container.configEditor, 'updatePumpProgramRPM')
        })

        afterEach(function() {
            bottle.container.pump.init()
            //restore the sandbox after each function
            sandbox.restore()
        })

        after(function() {
            bottle.container.logApi = 0
            bottle.container.logger.transports.console.level = 'info';
        })


        it('runs pump 1 program 1 at 1000 rpm for 1 minute', function() {



            var index = 1
            var program = 1
            var speed = 1000
            var duration = 1
            //var address = myModule('whatever').pumpIndexToAddress(index)

            bottle.container.pumpControllerMiddleware.pumpCommandSaveAndRunProgramWithSpeedForDuration(index, program, speed, duration)


            /* Desired output
            run 1:  [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 3, 39, 3, 232 ] ],

              [ [ 165, 0, 96, 33, 7, 0 ] ],
              [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 8 ] ],
              [ [ 165, 0, 96, 33, 6, 1, 10 ] ],

              [ [ 165, 0, 96, 33, 7, 0 ] ] ]
            queuePacketStub.callCount:  9

            */
            // console.log('logger 1: ', loggerStub.args)
            //  console.log('run 1: ', queuePacketStub.args)
            queuePacketStub.callCount.should.eq(7)
            queuePacketStub.args[0][0].should.deep.equal(global.pump1RemotePacket)
            queuePacketStub.args[1][0].should.deep.equal(global.pump1SetProgram1RPM1000Packet)
            queuePacketStub.args[2][0].should.deep.equal(global.pump1RequestStatusPacket)
            queuePacketStub.args[3][0].should.deep.equal(global.pump1RemotePacket)

            queuePacketStub.args[4][0].should.deep.equal(global.pump1RunProgram1Packet)
            queuePacketStub.args[5][0].should.deep.equal(global.pump1PowerOnPacket)
            queuePacketStub.args[6][0].should.deep.equal(global.pump1RequestStatusPacket)

            bottle.container.pumpControllerTimers.clearTimer(1)
            return

        });

        it('runs pump 1 program 2 at 500 rpm for 60 minutes', function() {

            var index = 1
            var program = 2
            var speed = 500
            var duration = 60
            //var address = myModule('whatever').pumpIndexToAddress(index)

            bottle.container.pumpControllerMiddleware.pumpCommandSaveAndRunProgramWithSpeedForDuration(index, program, speed, duration)


            /* Desired output
            run 2:  [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 3, 40, 1, 244 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ],
              [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 16 ] ],
              [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ] ]
            queuePacketStub.callCount:  7

            */
            // console.log('run 2: ', queuePacketStub.args)
            //console.log('logger 2: ', loggerStub.args)

            queuePacketStub.callCount.should.eq(7)
            queuePacketStub.args[0][0].should.deep.equal(global.pump1RemotePacket)
            queuePacketStub.args[1][0].should.deep.equal(global.pump1SetProgram2RPM500Packet)
            queuePacketStub.args[2][0].should.deep.equal(global.pump1RequestStatusPacket)
            queuePacketStub.args[3][0].should.deep.equal(global.pump1RemotePacket)
            queuePacketStub.args[4][0].should.deep.equal(global.pump1RunProgram2Packet)
            queuePacketStub.args[5][0].should.deep.equal(global.pump1PowerOnPacket)
            queuePacketStub.args[6][0].should.deep.equal(global.pump1RequestStatusPacket)
            bottle.container.pumpControllerTimers.clearTimer(1)
            return

        });



        it('runs pump 2 program 4 at 3450 rpm for 120 minutes', function() {

            var index = 2
            var program = 4
            speed = 3450
            var duration = 120
            //var address = myModule('whatever').pumpIndexToAddress(index)

            bottle.container.pumpControllerMiddleware.pumpCommandSaveAndRunProgramWithSpeedForDuration(index, program, speed, duration)


            /* Desired output
            run 2/4:  [ [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
            [ [ 165, 0, 97, 33, 1, 4, 3, 42, 13, 122 ] ],
            [ [ 165, 0, 97, 33, 7, 0 ] ],
            [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
            [ [ 165, 0, 97, 33, 1, 4, 3, 33, 0, 32 ] ],
            [ [ 165, 0, 97, 33, 6, 1, 10 ] ],
            [ [ 165, 0, 97, 33, 7, 0 ] ] ]
            start timer 2/4 :  [ [ 2 ] ]
            queuePacketStub.callCount:  7

            */
            // console.log('run 2/4: ', queuePacketStub.args)

            queuePacketStub.callCount.should.eq(7)

            queuePacketStub.args[0][0].should.deep.equal(global.pump2RemotePacket)
            queuePacketStub.args[1][0].should.deep.equal(global.pump2SetProgram4RPM3450Packet)
            queuePacketStub.args[2][0].should.deep.equal(global.pump2RequestStatusPacket)
            queuePacketStub.args[3][0].should.deep.equal(global.pump2RemotePacket)
            queuePacketStub.args[4][0].should.deep.equal(global.pump2RunProgram4Packet)
            queuePacketStub.args[5][0].should.deep.equal(global.pump2PowerOnPacket)
            queuePacketStub.args[6][0].should.deep.equal(global.pump2RequestStatusPacket)
            bottle.container.pumpControllerTimers.clearTimer(2)
            return

        });



    })
})
