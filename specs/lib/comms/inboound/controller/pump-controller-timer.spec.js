
describe('pump controller', function() {

    describe('#startPumpController starts the timer for 1 or 2 pumps', function() {

        before(function() {

        })

        beforeEach(function() {
            sandbox = sinon.sandbox.create()
            socketIOStub = sandbox.stub(bottle.container.io, 'emitToClients')
            clock = sandbox.useFakeTimers()
        })

        afterEach(function() {
            sandbox.restore()
        })

        it('starts pump 1 timer to check for status every 30 seconds', function() {

            bottle.container.settings.numberOfPumps = 1
            bottle.container.settings.logPumpTimers = 1
            bottle.container.settings.logLevel = 'info'
            setPumpRemoteStub = sandbox.stub(bottle.container.pumpController, 'setPumpToRemoteControl')
            requestPumpStatusStub = sandbox.stub(bottle.container.pumpController, 'requestPumpStatus')

            bottle.container.pumpControllerTimers.startPumpController()

            clock.tick(3999)
            setPumpRemoteStub.callCount.should.eq(0)
            requestPumpStatusStub.callCount.should.eq(0)
            clock.tick(1)
            setPumpRemoteStub.callCount.should.eq(1)
            // console.log('setPumpRemoteStub: ', setPumpRemoteStub.args)
            // console.log('requestPumpStatusStub: ', requestPumpStatusStub.args)
            setPumpRemoteStub.args[0][0].should.eq(96)
            requestPumpStatusStub.callCount.should.eq(1)
            requestPumpStatusStub.args[0][0].should.eq(96)

            clock.tick(26000)
            setPumpRemoteStub.callCount.should.eq(2)
            setPumpRemoteStub.args[1][0].should.eq(96)
            requestPumpStatusStub.callCount.should.eq(2)
            requestPumpStatusStub.args[1][0].should.eq(96)
            // console.log('setPumpRemoteStub: ', setPumpRemoteStub.callCount, setPumpRemoteStub.args)
            // console.log('requestPumpStatusStub: ', requestPumpStatusStub.args)
            return
        });


        it('starts pump 1 & 2 timers to check for status every 30 seconds', function() {

            bottle.container.settings.numberOfPumps = 2
            bottle.container.settings.logPumpTimers = 1
            bottle.container.settings.logLevel = 'info'
            setPumpRemoteStub = sandbox.stub(bottle.container.pumpController, 'setPumpToRemoteControl')
            requestPumpStatusStub = sandbox.stub(bottle.container.pumpController, 'requestPumpStatus')

            bottle.container.pumpControllerTimers.startPumpController()

            clock.tick(3999)
            setPumpRemoteStub.callCount.should.eq(0)
            requestPumpStatusStub.callCount.should.eq(0)
            clock.tick(1)
            setPumpRemoteStub.callCount.should.eq(2)
            //  console.log('setPumpRemoteStub: ', setPumpRemoteStub.args)
            //  console.log('requestPumpStatusStub: ', requestPumpStatusStub.args)
            //  setPumpRemoteStub:  [ [ 96 ], [ 97 ] ]
            //  requestPumpStatusStub:  [ [ 96 ], [ 97 ] ]
            setPumpRemoteStub.args[0][0].should.eq(96)
            setPumpRemoteStub.args[1][0].should.eq(97)
            requestPumpStatusStub.callCount.should.eq(2)
            requestPumpStatusStub.args[0][0].should.eq(96)
            requestPumpStatusStub.args[1][0].should.eq(97)

            clock.tick(26000)
            // console.log('setPumpRemoteStub: ', setPumpRemoteStub.args)
            // console.log('requestPumpStatusStub: ', requestPumpStatusStub.args)
            // setPumpRemoteStub:  [ [ 96 ], [ 97 ], [ 96 ], [ 97 ] ]
            // requestPumpStatusStub:  [ [ 96 ], [ 97 ], [ 96 ], [ 97 ] ]
            setPumpRemoteStub.callCount.should.eq(4)
            setPumpRemoteStub.args[2][0].should.eq(96)
            setPumpRemoteStub.args[3][0].should.eq(97)
            requestPumpStatusStub.callCount.should.eq(4)
            requestPumpStatusStub.args[2][0].should.eq(96)
            requestPumpStatusStub.args[3][0].should.eq(97)
            // console.log('setPumpRemoteStub: ', setPumpRemoteStub.callCount, setPumpRemoteStub.args)
            // console.log('requestPumpStatusStub: ', requestPumpStatusStub.args)
            return
        });

        it('runs pump 1 at 1000 rpm for 5 minutes', function() {

            bottle.container.settings.numberOfPumps = 1
            bottle.container.settings.logPumpTimers = 1
            bottle.container.settings.logLevel = 'info'
            setPumpRemoteSpy = sandbox.spy(bottle.container.pumpController, 'setPumpToRemoteControl')
            requestPumpStatusSpy = sandbox.spy(bottle.container.pumpController, 'requestPumpStatus')
            queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
            pumpCurrentProgramSpy = sandbox.spy(bottle.container.pump, 'setCurrentProgram')
            pumpDurationSpy = sandbox.spy(bottle.container.pump, 'setDuration')
            bottle.container.pumpControllerMiddleware.pumpCommand(1,1,1000,1)

            clock.tick(30*1000)

            //  console.log('setPumpRemoteSpy: ', setPumpRemoteSpy.args)
            //  console.log('requestPumpStatusSpy: ', requestPumpStatusSpy.args)
            //  console.log('queuePacketStub: ', queuePacketStub.args)
            //  console.log('pumpCurrentProgramSpy: ', pumpCurrentProgramSpy.args)
            //  console.log('pumpDurationSpy: ', pumpDurationSpy.args)

            //  setPumpRemoteStub:  [ [ 96 ], [ 97 ] ]
            //  requestPumpStatusStub:  [ [ 96 ], [ 97 ] ]


            clock.tick(26000)
            // console.log('setPumpRemoteStub: ', setPumpRemoteStub.args)
            // console.log('requestPumpStatusStub: ', requestPumpStatusStub.args)
            // setPumpRemoteStub:  [ [ 96 ], [ 97 ], [ 96 ], [ 97 ] ]
            // requestPumpStatusStub:  [ [ 96 ], [ 97 ], [ 96 ], [ 97 ] ]

            // console.log('setPumpRemoteStub: ', setPumpRemoteStub.callCount, setPumpRemoteStub.args)
            // console.log('requestPumpStatusStub: ', requestPumpStatusStub.args)
            return
        });

    });
})
