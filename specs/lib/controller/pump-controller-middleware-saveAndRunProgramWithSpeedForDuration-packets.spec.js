var reqString = path.join(process.cwd(), '/src/lib/controllers/pump-controller-middleware.js')

var myModule = rewire(reqString)


describe('pump controller - save and run program with speed for duration', function() {


    describe('#checks that the right packets are queued', function() {


        before(function() {
            sandbox = sinon.sandbox.create()
        });

        beforeEach(function() {})

        afterEach(function() {
            //restore the sandbox after each function
            sandbox.restore()
        })

        after(function() {})


        it('runs pump 1 program 1 at 1000 rpm for 1 minute', function() {

            var loggerStub = sandbox.stub()
            var queuePacketStub = sandbox.stub()

            var emitToClientsStub = sandbox.stub()
            var pumpControllerTimersStub = sandbox.stub()

            myModule.__with__({
                'bottle.container.logger': {
                    'info': loggerStub,
                    'verbose': loggerStub,
                    'warn': loggerStub
                },

                'bottle.container.settings': {

                    'logApi': true
                },
                'bottle.container.queuePacket': {
                    'queuePacket': queuePacketStub
                },
                'bottle.container.io': {
                    'emitToClients': emitToClientsStub
                },
                'bottle.container.pumpControllerTimers': {
                    'startTimer': pumpControllerTimersStub
                }


            })(function() {
                var index = 1
                var program = 1
                var speed = 1000
                var duration = 1
                //var address = myModule('whatever').pumpIndexToAddress(index)

                myModule(bottle.container).pumpCommandSaveAndRunProgramWithSpeedForDuration(index, program, speed, duration)


                /* Desired output
                [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
                 [ [ 165, 0, 96, 33, 1, 4, 3, 39, 3, 232 ] ],
                 [ [ 165, 0, 96, 33, 4, 1, 0 ] ],
                 [ [ 165, 0, 96, 33, 7, 0 ] ],
                 [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
                 [ [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 8 ] ],
                 [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
                 [ [ 165, 0, 96, 33, 1, 4, 3, 43, 0, 1 ] ],
                 [ [ 165, 0, 96, 33, 4, 1, 0 ] ],
                 [ [ 165, 0, 96, 33, 7, 0 ] ] ]
               start timer 1 :  [ [ 1 ] ]
                queuePacketStub.callCount:  10

                */
                //console.log('logger 1: ', loggerStub.args)
                //console.log('run 1: ', queuePacketStub.args)
                //console.log('start timer 1 : ', pumpControllerTimersStub.args)
                loggerStub.callCount.should.eq(0) //hmmm?  does this depend on config settings?
                queuePacketStub.callCount.should.eq(10)
                queuePacketStub.args[0][0].should.include.members([165, 0, 96, 33, 4, 1, 255])
                queuePacketStub.args[1][0].should.include.members([165, 0, 96, 33, 1, 4, 3, 39, 3, 232])
                queuePacketStub.args[2][0].should.include.members([165, 0, 96, 33, 4, 1, 0])
                queuePacketStub.args[3][0].should.include.members([165, 0, 96, 33, 7, 0])
                queuePacketStub.args[4][0].should.include.members([165, 0, 96, 33, 4, 1, 255])
                queuePacketStub.args[5][0].should.include.members([165, 0, 96, 33, 1, 4, 3, 33, 0, 8])
                queuePacketStub.args[6][0].should.include.members([165, 0, 96, 33, 6, 1, 10])
                queuePacketStub.args[7][0].should.include.members([165, 0, 96, 33, 1, 4, 3, 43, 0, 1])
                queuePacketStub.args[8][0].should.include.members([165, 0, 96, 33, 4, 1, 0])
                queuePacketStub.args[9][0].should.include.members([165, 0, 96, 33, 7, 0])

                pumpControllerTimersStub.calledWith('[ 1 ]')
                return
            })
        });

        it('runs pump 1 program 2 at 500 rpm for 60 minutes', function() {

            var loggerStub = sandbox.stub()
            var queuePacketStub = sandbox.stub()

            var emitToClientsStub = sandbox.stub()
            var pumpControllerTimersStub = sandbox.stub()
            myModule.__with__({
                'bottle.container.logger': {
                    'info': loggerStub,
                    'verbose': loggerStub,
                    'warn': loggerStub
                },

                'bottle.container.settings': {

                    'logApi': true
                },
                'bottle.container.queuePacket': {
                    'queuePacket': queuePacketStub
                },
                'bottle.container.io': {
                    'emitToClients': emitToClientsStub
                },
                'bottle.container.pumpControllerTimers': {
                    'startTimer': pumpControllerTimersStub
                }


            })(function() {
                var index = 1
                var program = 2
                var speed = 500
                var duration = 60
                //var address = myModule('whatever').pumpIndexToAddress(index)

                myModule(bottle.container).pumpCommandSaveAndRunProgramWithSpeedForDuration(index, program, speed, duration)


                /* Desired output
                run 2:  [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
                  [ [ 165, 0, 96, 33, 1, 4, 3, 40, 1, 244 ] ],
                  [ [ 165, 0, 96, 33, 4, 1, 0 ] ],
                  [ [ 165, 0, 96, 33, 7, 0 ] ],
                  [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
                  [ [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 16 ] ],
                  [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
                  [ [ 165, 0, 96, 33, 1, 4, 3, 43, 0, 1 ] ],
                  [ [ 165, 0, 96, 33, 4, 1, 0 ] ],
                  [ [ 165, 0, 96, 33, 7, 0 ] ] ]
                start timer 2 :  [ [ 1 ] ]
                queuePacketStub.callCount:  10

                */
                //console.log('run 2: ', queuePacketStub.args)
                //console.log('start timer 2 : ', pumpControllerTimersStub.args)
                //console.log('logger 2: ', loggerStub.args)

                loggerStub.callCount.should.eq(0)
                queuePacketStub.callCount.should.eq(10)
                queuePacketStub.args[0][0].should.include.members([165, 0, 96, 33, 4, 1, 255])
                queuePacketStub.args[1][0].should.include.members([165, 0, 96, 33, 1, 4, 3, 40, 1, 244])
                queuePacketStub.args[2][0].should.include.members([165, 0, 96, 33, 4, 1, 0])
                queuePacketStub.args[3][0].should.include.members([165, 0, 96, 33, 7, 0])
                queuePacketStub.args[4][0].should.include.members([165, 0, 96, 33, 4, 1, 255])
                queuePacketStub.args[5][0].should.include.members([165, 0, 96, 33, 1, 4, 3, 33, 0, 16])
                queuePacketStub.args[6][0].should.include.members([165, 0, 96, 33, 6, 1, 10])
                queuePacketStub.args[7][0].should.include.members([165, 0, 96, 33, 1, 4, 3, 43, 0, 1])
                queuePacketStub.args[8][0].should.include.members([165, 0, 96, 33, 4, 1, 0])
                queuePacketStub.args[9][0].should.include.members([165, 0, 96, 33, 7, 0])
                pumpControllerTimersStub.calledWith('[ 1 ]')
                return
            })
        });



        it('runs pump 2 program 4 at 3450 rpm for 120 minutes', function() {

            var loggerStub = sandbox.stub()
            var queuePacketStub = sandbox.stub()

            var emitToClientsStub = sandbox.stub()
            var pumpControllerTimersStub = sandbox.stub()
            myModule.__with__({
                'bottle.container.logger': {
                    'info': loggerStub,
                    'verbose': loggerStub,
                    'warn': loggerStub
                },

                'bottle.container.settings': {

                    'logApi': true
                },
                'bottle.container.queuePacket': {
                    'queuePacket': queuePacketStub
                },
                'bottle.container.io': {
                    'emitToClients': emitToClientsStub
                },
                'bottle.container.pumpControllerTimers': {
                    'startTimer': pumpControllerTimersStub
                }


            })(function() {
                var index = 2
                var program = 4
                speed = 3450
                var duration = 120
                //var address = myModule('whatever').pumpIndexToAddress(index)

                myModule(bottle.container).pumpCommandSaveAndRunProgramWithSpeedForDuration(index, program, speed, duration)


                /* Desired output
                run 2/4:  [ [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
                  [ [ 165, 0, 97, 33, 1, 4, 3, 42, 13, 122 ] ],
                  [ [ 165, 0, 97, 33, 4, 1, 0 ] ],
                  [ [ 165, 0, 97, 33, 7, 0 ] ],
                  [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
                  [ [ 165, 0, 97, 33, 1, 4, 3, 33, 0, 32 ] ],
                  [ [ 165, 0, 97, 33, 6, 1, 10 ] ],
                  [ [ 165, 0, 97, 33, 1, 4, 3, 43, 0, 1 ] ],
                  [ [ 165, 0, 97, 33, 4, 1, 0 ] ],
                  [ [ 165, 0, 97, 33, 7, 0 ] ] ]
                start timer 2/4 :  [ [ 2 ] ]
                queuePacketStub.callCount:  10

                */
                //console.log('run 2/4: ', queuePacketStub.args)
                //console.log('start timer 2/4 : ', pumpControllerTimersStub.args)
                //console.log('logger 2/4: ', loggerStub.args)

                loggerStub.callCount.should.eq(0)
                queuePacketStub.callCount.should.eq(10)
                queuePacketStub.args[0][0].should.include.members([165, 0, 97, 33, 4, 1, 255])
                queuePacketStub.args[1][0].should.include.members([165, 0, 97, 33, 1, 4, 3, 42, 13, 122])
                queuePacketStub.args[2][0].should.include.members([165, 0, 97, 33, 4, 1, 0])
                queuePacketStub.args[3][0].should.include.members([165, 0, 97, 33, 7, 0])
                queuePacketStub.args[4][0].should.include.members([165, 0, 97, 33, 4, 1, 255])
                queuePacketStub.args[5][0].should.include.members([165, 0, 97, 33, 1, 4, 3, 33, 0, 32])
                queuePacketStub.args[6][0].should.include.members([165, 0, 97, 33, 6, 1, 10])
                queuePacketStub.args[7][0].should.include.members([165, 0, 97, 33, 1, 4, 3, 43, 0, 1])
                queuePacketStub.args[8][0].should.include.members([165, 0, 97, 33, 4, 1, 0])
                queuePacketStub.args[9][0].should.include.members([165, 0, 97, 33, 7, 0])
                pumpControllerTimersStub.calledWith('[ 2 ]')
                return
            })
        });



    })
})
