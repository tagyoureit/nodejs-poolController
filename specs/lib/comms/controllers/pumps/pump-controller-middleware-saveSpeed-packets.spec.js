describe('pump controller - save speed (1/2)', function() {


    describe('#checks that the right packets are queued', function() {


        before(function() {
            return global.initAllAsync()
        });

        beforeEach(function() {
            sandbox = sinon.sandbox.create()
            loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
            loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
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
            configEditorStub = sandbox.stub(bottle.container.configEditor, 'updateExternalPumpProgramAsync')
        })

        afterEach(function() {
            //restore the sandbox after each function
            sandbox.restore()
        })

        after(function() {
            return global.stopAllAsync()
        })


        it('sets pump 1 program 1 to 1000 rpm', function() {


            var index = 1
            var program = 1
            var speed = 1000
            //var address = myModule('whatever').pumpIndexToAddress(index)

            bottle.container.pumpControllerMiddleware.pumpCommandSaveProgram(index, program, speed)


            /* Desired output
            loggerInfoStub:  []
            queuePacketStub.args: [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 3, 39, 3, 232 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ] ]
            queuePacketStub.callCount:  3

            */

            //loggerInfoStub.callCount.should.eq(0) //hmmm?  does this depend on config settings?
            // console.log('sets pump 1 program 1 to 1000 rpm queuePacketStub:', queuePacketStub.args)
            queuePacketStub.callCount.should.eq(3)
            queuePacketStub.args[0][0].should.deep.equal([165, 0, 96, 33, 4, 1, 255])
            queuePacketStub.args[1][0].should.deep.equal([165, 0, 96, 33, 1, 4, 3, 39, 3, 232])
            queuePacketStub.args[2][0].should.deep.equal([165, 0, 96, 33, 7, 0])

        });

        it('sets pump 1 program 2 to 500 rpm', function() {

            var index = 1
            var program = 2
            var speed = 500
            //var address = myModule('whatever').pumpIndexToAddress(index)

            bottle.container.pumpControllerMiddleware.pumpCommandSaveProgram(index, program, speed)


            /* Desired output
            queuePacketsStub:  [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 3, 40, 1, 244 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ] ]
            queuePacketStub.callCount:  4

            */
            // console.log('sets pump 1 program 2 to 500 rpm queuePacketStub:', queuePacketStub.args)
            //loggerInfoStub.callCount.should.eq(0)
            queuePacketStub.callCount.should.eq(3)
            queuePacketStub.args[0][0].should.deep.equal([165, 0, 96, 33, 4, 1, 255])
            queuePacketStub.args[1][0].should.deep.equal([165, 0, 96, 33, 1, 4, 3, 40, 1, 244])
            queuePacketStub.args[2][0].should.deep.equal([165, 0, 96, 33, 7, 0])

        });



        it('sets pump 2 program 4 to 3450 rpm', function() {

            var index = 2
            var program = 4
            var speed = 3450
            //var address = myModule('whatever').pumpIndexToAddress(index)

            bottle.container.pumpControllerMiddleware.pumpCommandSaveProgram(index, program, speed)


            /* Desired output
                    queuePacketsStub:  [ [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
                  [ [ 165, 0, 97, 33, 1, 4, 3, 42, 13, 122 ] ],
                  [ [ 165, 0, 97, 33, 7, 0 ] ] ]
                    queuePacketStub.callCount:  4

                    */

            //  loggerInfoStub.callCount.should.eq(0)
            // console.log('sets pump 2 program 4 to 3450 rpm queuePacketStub:', queuePacketStub.args)
            queuePacketStub.callCount.should.eq(3)
            queuePacketStub.args[0][0].should.deep.equal([165, 0, 97, 33, 4, 1, 255])
            queuePacketStub.args[1][0].should.deep.equal([165, 0, 97, 33, 1, 4, 3, 42, 13, 122])
            queuePacketStub.args[2][0].should.deep.equal([165, 0, 97, 33, 7, 0])
        });



    })
})
