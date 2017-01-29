var reqString = path.join(process.cwd(), '/src/lib/controllers/pump-controller-middleware.js')

var myModule = rewire(reqString)


describe('pump controller - checks legacy pumpCommand API', function() {


    describe('#by calling pumpCommand function directly', function() {


        before(function() {

            bottle.container.settings.logApi = 1
        });

        beforeEach(function() {
            sandbox = sinon.sandbox.create()
            loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
            loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
            loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
            // setPumpToRemoteControlStub = sandbox.stub(bottle.container.pumpController, 'setPumpToRemoteControl')
            // saveProgramOnPumpStub = sandbox.stub(bottle.container.pumpController, 'saveProgramOnPump')
            endPumpCommandStub = sandbox.stub().returns()
            // setPumpToLocalControlStub = sandbox.stub(bottle.container.pumpController, 'setPumpToLocalControl')
            // requestPumpStatusStub = sandbox.stub(bottle.container.pumpController, 'requestPumpStatus')
            pumpControllerTimersStub = sandbox.stub(bottle.container.pumpControllerTimers, 'startTimer')
            queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
            emitToClientsStub = sandbox.stub(bottle.container.io, 'emitToClients')
        })

        afterEach(function() {
            //restore the sandbox after each function
            sandbox.restore()
        })

        after(function() {
            bottle.container.settings.logApi = 0
        })


        it('saves pump 1 program 1 at 1000', function() {
            var index = 1
            var program = 1
            var speed = 1000
            var duration = null
            //var address = myModule('whatever').pumpIndexToAddress(index)

            bottle.container.pumpControllerMiddleware.pumpCommand(index, program, speed, duration)


            /* Desired output
            [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 3, 39, 3, 232 ] ],
              [ [ 165, 0, 96, 33, 4, 1, 0 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ] ]
            start timer 1 :  []
            queuePacketStub.callCount:  4

            */
            // console.log('logger 1,1,1000,null: ', loggerStub.args)
            // console.log('run 1,1,1000,null: ', queuePacketStub.args)
            // console.log('start timer 1,1,1000,null : ', pumpControllerTimersStub.args)
            // loggerStub.callCount.should.eq(2)
            console.log('queuePacketStub 1,1,1000: ', queuePacketStub.args)
            queuePacketStub.callCount.should.eq(4)
            queuePacketStub.args[0][0].should.include.members([165, 0, 96, 33, 4, 1, 255])
            queuePacketStub.args[1][0].should.include.members([165, 0, 96, 33, 1, 4, 3, 39, 3, 232])
            queuePacketStub.args[2][0].should.include.members([165, 0, 96, 33, 4, 1, 0])
            queuePacketStub.args[3][0].should.include.members([165, 0, 96, 33, 7, 0])

            pumpControllerTimersStub.callCount.should.eq(0)
            console.log('emitToClientsStub: ', emitToClientsStub.args)
            emitToClientsStub.callCount.should.eq(1)
            return

        });

        it('runs pump 1 program 1 at 1000 (ignores duration)', function() {

            var index = 1
            var program = 1
            var speed = 1000
            var duration = 1
            //var address = myModule('whatever').pumpIndexToAddress(index)

            bottle.container.pumpControllerMiddleware.pumpCommand(index, program, speed, duration)


            /* Desired output
            run 1,1,1000,1:  [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 3, 39, 3, 232 ] ],
              [ [ 165, 0, 96, 33, 4, 1, 0 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ],
              [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 8 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 3, 43, 0, 1 ] ],
              [ [ 165, 0, 96, 33, 4, 1, 0 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ] ]
            start timer 1,1,1000,1 :  [ [ 1 ] ]
            queuePacketStub.callCount:  10
            */


            // console.log('logger 1,1,1000,1: ', loggerStub.args)
            // console.log('run 1,1,1000,1: ', queuePacketStub.args)
            // console.log('start timer 1,1,1000,1 : ', pumpControllerTimersStub.args)
            //loggerStub.callCount.should.eq(6)
            queuePacketStub.callCount.should.eq(10)
            queuePacketStub.args[0][0].should.include.members(global.pump1LocalPacket)
            queuePacketStub.args[1][0].should.include.members(global.pump1SetProgram1RPM1000Packet)
            queuePacketStub.args[2][0].should.include.members(global.pump1LocalPacket)
            queuePacketStub.args[3][0].should.include.members(global.pump1RequestStatusPacket)
            queuePacketStub.args[4][0].should.include.members(global.pump1LocalPacket)
            queuePacketStub.args[5][0].should.include.members(global.pump1PowerOnPacket)
            queuePacketStub.args[6][0].should.include.members(global.pump1RunProgram1Packet)
            queuePacketStub.args[7][0].should.include.members(global.pump1SetTimerPacket)
            queuePacketStub.args[8][0].should.include.members(global.pump1LocalPacket)
            queuePacketStub.args[9][0].should.include.members(global.pump1RequestStatusPacket)
            pumpControllerTimersStub.calledWith('[ 1 ]')
            emitToClientsStub.callCount.should.eq(3)
            emitToClientsStub.calledWith('pump')
            return

        });


        it('turns on pump 1 ', function() {

            var index = 1
            var program = 'on'
            var speed = null
            var duration = null
            //var address = myModule('whatever').pumpIndexToAddress(index)

            bottle.container.pumpControllerMiddleware.pumpCommand(index, program, speed, duration)


            /* Desired output
            run 1:  [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 4, 1, 0 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ] ]
            start timer 1 :  []
            queuePacketStub.callCount:  3

            */
            // console.log('logger 1,on,null,null: ', loggerStub.args)
            // console.log('run 1,on,null,null: ', queuePacketStub.args)
            // console.log('start timer 1,on,null,null: ', pumpControllerTimersStub.args)
            //loggerStub.callCount.should.eq(0) //hmmm?  does this depend on config settings?
            queuePacketStub.callCount.should.eq(4)
            queuePacketStub.args[0][0].should.include.members(global.pump1RemotePacket)
            queuePacketStub.args[1][0].should.include.members(global.pump1PowerOnPacket)
            queuePacketStub.args[2][0].should.include.members(global.pump1LocalPacket)
            queuePacketStub.args[3][0].should.include.members(global.pump1RequestStatusPacket)
            emitToClientsStub.callCount.should.eq(1)
            emitToClientsStub.calledWith('pump')
            pumpControllerTimersStub.callCount.should.eq(0)
            return

        });


        it('saves pump 2 program 2 at 500 rpm (ignores duration)', function() {


            var index = 2
            var program = 2
            var speed = 500
            var duration = 60
            //var address = myModule('whatever').pumpIndexToAddress(index)

            myModule(bottle.container).pumpCommand(index, program, speed, duration)


            /* Desired output
            run 2,2,500:  [ [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 97, 33, 1, 4, 3, 40, 1, 244 ] ],
              [ [ 165, 0, 97, 33, 1, 4, 3, 33, 0, 16 ] ],
              [ [ 165, 0, 97, 33, 1, 4, 3, 43, 0, 1 ] ],
              [ [ 165, 0, 97, 33, 4, 1, 0 ] ],
              [ [ 165, 0, 97, 33, 7, 0 ] ] ]
            start timer 2,2,500 :  [ [ 2 ] ]
            queuePacketStub.callCount:  6

            */
            // console.log('run 2,2,500: ', queuePacketStub.args)
            // console.log('start timer 2,2,500 : ', pumpControllerTimersStub.args)
            // console.log('logger 2,2,500: ', loggerStub.args)


            queuePacketStub.callCount.should.eq(10)
            queuePacketStub.args[0][0].should.include.members(global.pump2LocalPacket)
            queuePacketStub.args[1][0].should.include.members(global.pump2SetProgram2RPM500Packet)
            queuePacketStub.args[2][0].should.include.members(global.pump2LocalPacket)
            queuePacketStub.args[3][0].should.include.members(global.pump2RequestStatusPacket)
            queuePacketStub.args[4][0].should.include.members(global.pump2LocalPacket)
            queuePacketStub.args[5][0].should.include.members(global.pump2PowerOnPacket)
            queuePacketStub.args[6][0].should.include.members(global.pump2RunProgram2Packet)
            queuePacketStub.args[7][0].should.include.members(global.pump2SetTimerPacket)
            queuePacketStub.args[8][0].should.include.members(global.pump2LocalPacket)
            queuePacketStub.args[9][0].should.include.members(global.pump2RequestStatusPacket)
            pumpControllerTimersStub.calledWith('[ 2 ]')
            emitToClientsStub.callCount.should.eq(3)
            emitToClientsStub.calledWith('pump')


            // loggerStub.callCount.should.eq(0)
            // queuePacketStub.callCount.should.eq(6)
            // queuePacketStub.args[0][0].should.include.members([165, 0, 97, 33, 4, 1, 255])
            // queuePacketStub.args[1][0].should.include.members([165, 0, 97, 33, 1, 4, 3, 40, 1, 244])
            // queuePacketStub.args[2][0].should.include.members([165, 0, 97, 33, 1, 4, 3, 33, 0, 16])
            // queuePacketStub.args[3][0].should.include.members([165, 0, 97, 33, 1, 4, 3, 43, 0, 1])
            // queuePacketStub.args[4][0].should.include.members([165, 0, 97, 33, 4, 1, 0])
            // queuePacketStub.args[5][0].should.include.members([165, 0, 97, 33, 7, 0])
            // pumpControllerTimersStub.calledWith('[ 2 ]')
            return

        });



        it('runs pump 2 program 4 at 3450 rpm for 120 minutes', function() {


            var index = 2
            var program = 4
            speed = 3450
            var duration = 120
            //var address = myModule('whatever').pumpIndexToAddress(index)

            myModule(bottle.container).pumpCommand(index, program, speed, duration)


            /* Desired output
            run 2,4,3450,120:  [ [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 97, 33, 1, 4, 3, 42, 13, 122 ] ],
              [ [ 165, 0, 97, 33, 4, 1, 0 ] ],
              [ [ 165, 0, 97, 33, 7, 0 ] ],
              [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 97, 33, 6, 1, 10 ] ],
              [ [ 165, 0, 97, 33, 1, 4, 3, 33, 0, 32 ] ],
              [ [ 165, 0, 97, 33, 1, 4, 3, 43, 0, 1 ] ],
              [ [ 165, 0, 97, 33, 4, 1, 0 ] ],
              [ [ 165, 0, 97, 33, 7, 0 ] ] ]
            start timer 2,4,3450,120 :  [ [ 2 ] ]
            queuePacketStub.callCount:  10

            */
            // console.log('run 2,4,3450,120: ', queuePacketStub.args)
            // console.log('start timer 2,4,3450,120 : ', pumpControllerTimersStub.args)
            // console.log('logger 2,4,3450,120: ', loggerStub.args)
            //
            //loggerStub.callCount.should.eq(0)
            queuePacketStub.callCount.should.eq(10)

            queuePacketStub.args[0][0].should.include.members(global.pump2LocalPacket)
            queuePacketStub.args[1][0].should.include.members(global.pump2SetProgram4RPM3450Packet)
            queuePacketStub.args[2][0].should.include.members(global.pump2LocalPacket)
            queuePacketStub.args[3][0].should.include.members(global.pump2RequestStatusPacket)
            queuePacketStub.args[4][0].should.include.members(global.pump2LocalPacket)
            queuePacketStub.args[5][0].should.include.members(global.pump2PowerOnPacket)
            queuePacketStub.args[6][0].should.include.members(global.pump2RunProgram4Packet)
            queuePacketStub.args[7][0].should.include.members(global.pump2SetTimerPacket)
            queuePacketStub.args[8][0].should.include.members(global.pump2LocalPacket)
            queuePacketStub.args[9][0].should.include.members(global.pump2RequestStatusPacket)
            pumpControllerTimersStub.calledWith('[ 2 ]')
            return

        });



    })
})
