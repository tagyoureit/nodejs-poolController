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
                [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
                  [ [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 8 ] ],
                  [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
                  [ [ 165, 0, 96, 33, 4, 1, 0 ] ],
                  [ [ 165, 0, 96, 33, 7, 0 ] ] ]
                queuePacketStub.callCount:  5

                */
                //console.log('run 1: ', queuePacketStub.args)
                loggerStub.callCount.should.eq(0) //hmmm?  does this depend on config settings?
                queuePacketStub.callCount.should.eq(5)
                queuePacketStub.args[0][0].should.include.members([165, 0, 96, 33, 4, 1, 255])
                queuePacketStub.args[1][0].should.include.members([165, 0, 96, 33, 1, 4, 3, 33, 0, 8])
                queuePacketStub.args[2][0].should.include.members([165, 0, 96, 33, 6, 1, 10])
                queuePacketStub.args[3][0].should.include.members([165, 0, 96, 33, 4, 1, 0])
                queuePacketStub.args[4][0].should.include.members([165, 0, 96, 33, 7, 0])
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
                loggerStub.callCount.should.eq(0)
                queuePacketStub.callCount.should.eq(5)
                queuePacketStub.args[0][0].should.include.members([165, 0, 96, 33, 4, 1, 255])
                queuePacketStub.args[1][0].should.include.members([165, 0, 96, 33, 1, 4, 3, 33, 0, 16])
                queuePacketStub.args[2][0].should.include.members([165, 0, 96, 33, 6, 1, 0])
                queuePacketStub.args[3][0].should.include.members([165, 0, 96, 33, 4, 1, 0])
                queuePacketStub.args[4][0].should.include.members([165, 0, 96, 33, 7, 0])
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
                loggerStub.callCount.should.eq(0)
                queuePacketStub.callCount.should.eq(5)
                queuePacketStub.args[0][0].should.include.members([165, 0, 97, 33, 4, 1, 255])
                queuePacketStub.args[1][0].should.include.members([165, 0, 97, 33, 1, 4, 3, 33, 0, 32])
                queuePacketStub.args[2][0].should.include.members([165, 0, 97, 33, 6, 1, 10])
                queuePacketStub.args[3][0].should.include.members([165, 0, 97, 33, 4, 1, 0])
                queuePacketStub.args[4][0].should.include.members([165, 0, 97, 33, 7, 0])
                return
            })
        });



    })
})
