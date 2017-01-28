var reqString = path.join(process.cwd(), '/src/lib/controllers/pump-controller-middleware.js')

var myModule = rewire(reqString)


describe('pump controller - run program', function() {


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


        it('runs pump 1 program 1', function() {

            var loggerStub = sandbox.stub()
            var queuePacketStub = sandbox.stub()

            var emitToClientsStub = sandbox.stub()

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
                }


            })(function() {
                var index = 1
                var program = 1
                var speed = 1000
                //var address = myModule('whatever').pumpIndexToAddress(index)

                myModule(bottle.container).pumpCommandRunProgram(index, program, speed)


                /* Desired output
                run 1:  [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
                  [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
                  [ [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 8 ] ],
                  [ [ 165, 0, 96, 33, 1, 4, 3, 43, 0, 1 ] ],
                  [ [ 165, 0, 96, 33, 4, 1, 0 ] ],
                  [ [ 165, 0, 96, 33, 7, 0 ] ] ]
                
                queuePacketStub.callCount:  6

                */
                //console.log('run 1: ', queuePacketStub.args)
                queuePacketStub.callCount.should.eq(6)
                queuePacketStub.args[0][0].should.include.members(global.pump1RemotePacket)
                queuePacketStub.args[1][0].should.include.members(global.pump1PowerOnPacket)
                queuePacketStub.args[2][0].should.include.members(global.pump1RunProgram1Packet)
                queuePacketStub.args[3][0].should.include.members(global.pump1SetTimerPacket)
                queuePacketStub.args[4][0].should.include.members(global.pump1LocalPacket)
                queuePacketStub.args[5][0].should.include.members(global.pump1RequestStatusPacket)
                return
            })
        });

        it('runs pump 1 program 2', function() {

            var loggerStub = sandbox.stub()
            var queuePacketStub = sandbox.stub()

            var emitToClientsStub = sandbox.stub()

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
                }


            })(function() {
                var index = 1
                var program = 2
                var speed = 500
                //var address = myModule('whatever').pumpIndexToAddress(index)

                myModule(bottle.container).pumpCommandRunProgram(index, program, speed)


                /* Desired output
                queuePacketsStub:  [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
                  [ [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 16 ] ],
                  [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
                  [ [ 165, 0, 96, 33, 4, 1, 0 ] ],
                  [ [ 165, 0, 96, 33, 7, 0 ] ] ]
                queuePacketStub.callCount:  5

                */
                //console.log('run 2: ', queuePacketStub.args)
                queuePacketStub.callCount.should.eq(6)
                queuePacketStub.args[0][0].should.include.members(global.pump1RemotePacket)
                queuePacketStub.args[1][0].should.include.members(global.pump1PowerOnPacket)
                queuePacketStub.args[2][0].should.include.members(global.pump1RunProgram2Packet)
                queuePacketStub.args[3][0].should.include.members(global.pump1SetTimerPacket)
                queuePacketStub.args[4][0].should.include.members(global.pump1LocalPacket)
                queuePacketStub.args[5][0].should.include.members(global.pump1RequestStatusPacket)
                return
            })
        });



        it('runs pump 2 program 4', function() {

            var loggerStub = sandbox.stub()
            var queuePacketStub = sandbox.stub()

            var emitToClientsStub = sandbox.stub()

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
                }


            })(function() {
                var index = 2
                var program = 4
                var speed = 3450
                //var address = myModule('whatever').pumpIndexToAddress(index)

                myModule(bottle.container).pumpCommandRunProgram(index, program, speed)


                /* Desired output
                queuePacketsStub:  [ [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
                [ [ 165, 0, 97, 33, 1, 4, 3, 33, 0, 32 ] ],
                [ [ 165, 0, 97, 33, 6, 1, 10 ] ],
                [ [ 165, 0, 97, 33, 4, 1, 0 ] ],
                [ [ 165, 0, 97, 33, 7, 0 ] ] ]
                queuePacketStub.callCount:  5

                */
                //console.log('run 2/4: ', queuePacketStub.args)
                queuePacketStub.callCount.should.eq(6)
                queuePacketStub.args[0][0].should.include.members(global.pump2RemotePacket)
                queuePacketStub.args[1][0].should.include.members(global.pump2PowerOnPacket)
                queuePacketStub.args[2][0].should.include.members(global.pump2RunProgram4Packet)
                queuePacketStub.args[3][0].should.include.members(global.pump2SetTimerPacket)
                queuePacketStub.args[4][0].should.include.members(global.pump2LocalPacket)
                queuePacketStub.args[5][0].should.include.members(global.pump2RequestStatusPacket)
                return
            })
        });



    })
})
