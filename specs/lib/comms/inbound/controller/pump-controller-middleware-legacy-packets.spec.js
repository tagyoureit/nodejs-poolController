describe('pump controller - checks legacy pumpCommand API', function() {


    describe('#by calling pumpCommand function directly', function() {


        before(function() {

            bottle.container.settings.logApi = 1
            bottle.container.settings.logPumpTimers = 1
            bottle.container.settings.logPumpMessages = 1
            bottle.container.logger.transports.console.level = 'silly';
        });

        beforeEach(function() {
            sandbox = sinon.sandbox.create()
            clock = sandbox.useFakeTimers()
            loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
            loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
            loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
            loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
            loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
            pumpControllerProgramTimersSpy = sandbox.spy(bottle.container.pumpControllerTimers, 'startProgramTimer')
            pumpControllerPowerTimersSpy = sandbox.spy(bottle.container.pumpControllerTimers, 'startPowerTimer')
            pumpControllerRPMTimersSpy = sandbox.spy(bottle.container.pumpControllerTimers, 'startRPMTimer')
            queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
            emitToClientsStub = sandbox.stub(bottle.container.io, 'emitToClients')
            configEditorStub = sandbox.stub(bottle.container.configEditor, 'updatePumpProgramRPM')
        })

        afterEach(function() {
            //restore the sandbox after each function
            bottle.container.pump.init()
            sandbox.restore()

        })

        after(function() {
            bottle.container.settings.logApi = 0
            bottle.container.settings.logPumpTimers = 0
            bottle.container.settings.logPumpMessages = 0
            bottle.container.logger.transports.console.level = 'info';
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
            // console.log('start timer 1,1,1000,null : ', pumpControllerTimersSpy.args)
            // loggerStub.callCount.should.eq(2)
            // console.log('queuePacketStub 1,1,1000: ', queuePacketStub.args)
            queuePacketStub.callCount.should.eq(3)
            queuePacketStub.args[0][0].should.deep.equal(global.pump1RemotePacket)
            queuePacketStub.args[1][0].should.deep.equal(global.pump1SetProgram1RPM1000Packet)
            queuePacketStub.args[2][0].should.deep.equal(global.pump1RequestStatusPacket)

            pumpControllerProgramTimersSpy.callCount.should.eq(0)
            pumpControllerPowerTimersSpy.callCount.should.eq(0)
            pumpControllerRPMTimersSpy.callCount.should.eq(0)
            // console.log('emitToClientsStub: ', emitToClientsStub.args)
            emitToClientsStub.callCount.should.eq(0)
            return

        });

        it('runs pump 1 program 1 at 1000 RPM for 1 minute', function() {

            var index = 1
            var program = 1
            var speed = 1000
            var duration = 1

            bottle.container.pumpControllerMiddleware.pumpCommand(index, program, speed, duration)

            /* Desired output
            run 1,1,1000,1 (after 30s):  10 [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 3, 39, 3, 232 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ],
              [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 8 ] ],
              [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ],
              [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 8 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ] ]
              and now after 2 mins:  13

              [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],   pump remote
                [ [ 165, 0, 96, 33, 1, 4, 3, 39, 3, 232 ] ],  save speed
                [ [ 165, 0, 96, 33, 7, 0 ] ],   status

                [ [ 165, 0, 96, 33, 4, 1, 255 ] ],   pump remote
                [ [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 8 ] ],  run prg 1
                [ [ 165, 0, 96, 33, 6, 1, 10 ] ],   power on
                [ [ 165, 0, 96, 33, 7, 0 ] ],  status

                [ [ 165, 0, 96, 33, 4, 1, 255 ] ],  pump remote
                [ [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 8 ] ],  run prg 1
                [ [ 165, 0, 96, 33, 7, 0 ] ],  status

                [ [ 165, 0, 96, 33, 4, 1, 255 ] ],   pump remote
                [ [ 165, 0, 96, 33, 6, 1, 4 ] ],  power off
                [ [ 165, 0, 96, 33, 7, 0 ] ] ]  status
            start timer 1,1,1000,1 :  [ [ 1, 1, 1 ] ]

            */

            //console.log('logger 1,1,1000,1: ', loggerStub.args)
            // console.log('run 1,1,1000,1: ', queuePacketStub.callCount, queuePacketStub.args)
            //console.log('start timer 1,1,1000,1 : ', pumpControllerProgramTimersSpy.args)
            queuePacketStub.callCount.should.eq(7)

            queuePacketStub.args[0][0].should.deep.equal(global.pump1RemotePacket)
            queuePacketStub.args[1][0].should.deep.equal(global.pump1SetProgram1RPM1000Packet)
            // queuePacketStub.args[2][0].should.deep.equal(global.pump1RemotePacket)
            queuePacketStub.args[2][0].should.deep.equal(global.pump1RequestStatusPacket)
            queuePacketStub.args[3][0].should.deep.equal(global.pump1RemotePacket)
            queuePacketStub.args[4][0].should.deep.equal(global.pump1RunProgram1Packet)
            queuePacketStub.args[5][0].should.deep.equal(global.pump1PowerOnPacket)
            // queuePacketStub.args[7][0].should.deep.equal(global.pump1RemotePacket)
            queuePacketStub.args[6][0].should.deep.equal(global.pump1RequestStatusPacket)
            emitToClientsStub.callCount.should.eq(1)
            pumpControllerProgramTimersSpy.callCount.should.eq(1)
            pumpControllerPowerTimersSpy.callCount.should.eq(0)
            pumpControllerRPMTimersSpy.callCount.should.eq(0)

            clock.tick(29 * 1000)
            //should still be same # of calls before 30 seconds expires
            queuePacketStub.callCount.should.eq(7)
            clock.tick(1 * 1000)
            //and now the timer is executed and we have 3 new packets
            queuePacketStub.callCount.should.eq(10)
            // console.log('run 1,1,1000,1 (after 30s): ', queuePacketStub.callCount, queuePacketStub.args)
            clock.tick(240 * 1000) //advance 4 mins
            //Save(3) + run/power(4) + Run(3) +Off(3) = 13
            // console.log('and now after 2 mins: ', queuePacketStub.callCount, queuePacketStub.args)
            queuePacketStub.callCount.should.eq(13)
            return

        });

        it('runs pump 1 (no program) at 1000 RPM for 1 minute', function() {

            var index = 1
            var program = null
            var speed = 1000
            var duration = 1

            bottle.container.pumpControllerMiddleware.pumpCommand(index, program, speed, duration)

            /* Desired output
            run 1,null,1000,1:  4 [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 2, 196, 3, 232 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ] ]
            queuePacketStub.callCount:  4
            run 1,null,1000,1 (after 1 hour):  15 [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 2, 196, 3, 232 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ],
              [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 2, 196, 3, 232 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ],
              [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 2, 196, 3, 232 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ],
              [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 6, 1, 4 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ] ]
            */

            // console.log('logger 1,null,1000,1: ', loggerStub.args)
            // console.log('run 1,null,1000,1: ', queuePacketStub.callCount, queuePacketStub.args)
            //console.log('start timer 1,null,1000,1 : ', pumpControllerProgramTimersSpy.args)
            queuePacketStub.callCount.should.eq(4)
            queuePacketStub.args[0][0].should.deep.equal(global.pump1RemotePacket)
            queuePacketStub.args[1][0].should.deep.equal(global.pump1PowerOnPacket)
            queuePacketStub.args[2][0].should.deep.equal(global.pump1SetRPM1000Packet)
            queuePacketStub.args[3][0].should.deep.equal(global.pump1RequestStatusPacket)
            emitToClientsStub.callCount.should.eq(1)
            pumpControllerProgramTimersSpy.callCount.should.eq(0)
            pumpControllerPowerTimersSpy.callCount.should.eq(0)
            pumpControllerRPMTimersSpy.callCount.should.eq(1)

            clock.tick(29 * 1000)
            //should still be same # of calls before 30 seconds expires
            queuePacketStub.callCount.should.eq(4)
            clock.tick(1 * 1000)
            //and now the timer is executed and we have 4 new packets
            queuePacketStub.callCount.should.eq(8)
            clock.tick((59 * 60 * 1000) + (30 * 1000)) //after 1 hour
            //On/Run (4) + On/Run(4) + Off(3)
            // console.log('run 1,null,1000,1 (after 1 hour): ', queuePacketStub.callCount, queuePacketStub.args)
            queuePacketStub.callCount.should.eq(11)
            clock.tick(120 * 1000) //after 2 more minutes
            queuePacketStub.callCount.should.eq(11)
            return

        });

        it('runs pump 1 (no program) at 1000 RPM for 60 minute', function() {

            var index = 1
            var program = null
            var speed = 1000
            var duration = 60

            bottle.container.pumpControllerMiddleware.pumpCommand(index, program, speed, duration)

            /* Desired output
            run 1,null,1000,1:  4 [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
              [ [ 165, 0, 96, 33, 1, 4, 2, 196, 3, 232 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ] ]
            queuePacketStub.callCount:  4
            */

            // console.log('logger 1,null,1000,1: ', loggerStub.args)
            // console.log('run 1,null,1000,1: ', queuePacketStub.callCount, queuePacketStub.args)
            //console.log('start timer 1,null,1000,1 : ', pumpControllerProgramTimersSpy.args)
            queuePacketStub.callCount.should.eq(4)
            queuePacketStub.args[0][0].should.deep.equal(global.pump1RemotePacket)
            queuePacketStub.args[1][0].should.deep.equal(global.pump1PowerOnPacket)
            queuePacketStub.args[2][0].should.deep.equal(global.pump1SetRPM1000Packet)
            queuePacketStub.args[3][0].should.deep.equal(global.pump1RequestStatusPacket)
            emitToClientsStub.callCount.should.eq(1)
            pumpControllerProgramTimersSpy.callCount.should.eq(0)
            pumpControllerPowerTimersSpy.callCount.should.eq(0)
            pumpControllerRPMTimersSpy.callCount.should.eq(1)

            clock.tick(29 * 1000)
            //should still be same # of calls before 30 seconds expires
            queuePacketStub.callCount.should.eq(4)
            clock.tick(1 * 1000)
            //and now the timer is executed and we have 5 new packets
            queuePacketStub.callCount.should.eq(8)
            clock.tick((60 * 60 * 1000) + (30 * 1000)) //after 1 hour
            //On/Run(4) * 2x/min(120)=480+Off(3)=483??
            queuePacketStub.callCount.should.eq(483)
            clock.tick(240 * 1000) //after 2 more mins
            queuePacketStub.callCount.should.eq(483)
            return

        });


        it('turns off pump 1', function() {
            var index = 1
            var program = 'off'
            var speed = null
            var duration = null
            //var address = myModule('whatever').pumpIndexToAddress(index)

            bottle.container.pumpControllerMiddleware.pumpCommand(index, program, speed, duration)
            queuePacketStub.callCount.should.eq(3)
            queuePacketStub.args[0][0].should.deep.equal(global.pump1RemotePacket)
            queuePacketStub.args[1][0].should.deep.equal(global.pump1PowerOffPacket)
            queuePacketStub.args[2][0].should.deep.equal(global.pump1RequestStatusPacket)
            return
        })


        it('turns on pump 1 (runs for 1 minute, then turns off)', function() {

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

              run 1,on,null,null after 30 seconds:  [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ],
              [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ] ]

              run 1,on,null,null after 1 min:  [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ],
              [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ],
              [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
              [ [ 165, 0, 96, 33, 7, 0 ] ] ]

            start timer 1 :  []
            queuePacketStub.callCount:  3

            */
            // console.log('logger 1,on,null,null: ', loggerStub.args)
            // console.log('run 1,on,null,null: ', queuePacketStub.args)
            // console.log('start timer 1,on,null,null: ', pumpControllerTimersSpy.args)
            //loggerStub.callCount.should.eq(0) //hmmm?  does this depend on config settings?
            queuePacketStub.callCount.should.eq(3)
            queuePacketStub.args[0][0].should.deep.equal(global.pump1RemotePacket)
            queuePacketStub.args[1][0].should.deep.equal(global.pump1PowerOnPacket)
            queuePacketStub.args[2][0].should.deep.equal(global.pump1RequestStatusPacket)
            emitToClientsStub.callCount.should.eq(1)
            emitToClientsStub.calledWith('pump')
            pumpControllerPowerTimersSpy.callCount.should.eq(1)

            clock.tick(30 * 1000)
            // console.log('run 1,on,null,null after 30 seconds: ', queuePacketStub.args)
            queuePacketStub.callCount.should.eq(6)
            clock.tick(30 * 1000)
            // console.log('run 1,on,null,null after 1 min: ', queuePacketStub.args)
            queuePacketStub.callCount.should.eq(9)
            bottle.container.pumpControllerTimers.clearTimer(1)
            queuePacketStub.callCount.should.eq(12)
            return

        });


        it('saves and runs pump 2 program 2 at 500 rpm for 60 minutes', function() {


            var index = 2
            var program = 2
            var speed = 500
            var duration = 60
            //var address = myModule('whatever').pumpIndexToAddress(index)
            bottle.container.pump.getPower(2).should.eq('powernotset')
            bottle.container.pumpControllerMiddleware.pumpCommand(index, program, speed, duration)


            /* Desired output
            run 2,2,500:  [ [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 97, 33, 1, 4, 3, 40, 1, 244 ] ],
              [ [ 165, 0, 97, 33, 7, 0 ] ],
              [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 97, 33, 1, 4, 3, 33, 0, 16 ] ],
              [ [ 165, 0, 97, 33, 6, 1, 10 ] ],
              [ [ 165, 0, 97, 33, 7, 0 ] ] ]
            queuePacketStub.callCount:  7

            */
            // console.log('run 2,2,500: ', queuePacketStub.args)
            // console.log('logger 2,2,500: ', loggerStub.args)


            queuePacketStub.callCount.should.eq(7)
            queuePacketStub.args[0][0].should.deep.equal(global.pump2RemotePacket)
            queuePacketStub.args[1][0].should.deep.equal(global.pump2SetProgram2RPM500Packet)
            queuePacketStub.args[2][0].should.deep.equal(global.pump2RequestStatusPacket)
            queuePacketStub.args[3][0].should.deep.equal(global.pump2RemotePacket)
            queuePacketStub.args[4][0].should.deep.equal(global.pump2RunProgram2Packet)
            queuePacketStub.args[5][0].should.deep.equal(global.pump2PowerOnPacket)
            queuePacketStub.args[6][0].should.deep.equal(global.pump2RequestStatusPacket)
            //emitToClientsStub.callCount.should.eq(3)
            //emitToClientsStub.calledWith('pump')

            clock.tick(30 * 1000)
            //console.log('call count after 30: ', queuePacketStub.callCount)
            queuePacketStub.callCount.should.eq(10)

            //after 70 mins we should only have 60 mins of calls
            //initial call = 9
            //1st call @ 30s = (7 total)
            //2nd call @ 1m = (10 total)
            //59 mins * 3 calls * 2x/min = 354 (367 total)
            clock.tick(70 * 60 * 1000) //70 mins
            queuePacketStub.callCount.should.eq(367)
            clock.tick(240 * 1000) //after two more minutes (timer expired)
            queuePacketStub.callCount.should.eq(367)
            bottle.container.pumpControllerTimers.clearTimer(2)
            return

        });



        it('runs pump 2 program 4 at 3450 rpm for 120 minutes', function() {


            var index = 2
            var program = 4
            speed = 3450
            var duration = 120
            //var address = myModule('whatever').pumpIndexToAddress(index)

            bottle.container.pumpControllerMiddleware.pumpCommand(index, program, speed, duration)


            /* Desired output
            run 2,4,3450,120:  [ [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 97, 33, 1, 4, 3, 42, 13, 122 ] ],
              [ [ 165, 0, 97, 33, 7, 0 ] ],
              [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
              [ [ 165, 0, 97, 33, 1, 4, 3, 33, 0, 32 ] ],
              [ [ 165, 0, 97, 33, 6, 1, 10 ] ],
              [ [ 165, 0, 97, 33, 7, 0 ] ] ]
            start timer 2,4,3450,120 :  [ [ 2 ] ]
            queuePacketStub.callCount:  10

            */
            // console.log('run 2,4,3450,120: ', queuePacketStub.args)
            // console.log('start timer 2,4,3450,120 : ', pumpControllerTimersSpy.args)
            // console.log('logger 2,4,3450,120: ', loggerStub.args)
            //
            //loggerStub.callCount.should.eq(0)
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
