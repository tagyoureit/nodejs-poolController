describe('pump controller', function() {

    describe('#startPumpController starts the timer for 1 or 2 pumps', function() {

        before(function() {
            bottle.container.logger.transports.console.level = 'silly';
            bottle.container.settings.logApi = 1
            bottle.container.settings.logPumpTimers = 1
            bottle.container.settings.intellitouch.installed = 0
            bottle.container.settings.intellicom = 0

        })

        beforeEach(function() {
            sandbox = sinon.sandbox.create()
            socketIOStub = sandbox.stub(bottle.container.io, 'emitToClients')
            clock = sandbox.useFakeTimers()
            loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
            loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
            loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
            loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
            loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')


            setPumpRemoteStub = sandbox.stub(bottle.container.pumpController, 'setPumpToRemoteControl')
            requestPumpStatusStub = sandbox.stub(bottle.container.pumpController, 'requestPumpStatus')
            configEditorStub = sandbox.stub(bottle.container.configEditor, 'updatePumpProgramRPM')
        })

        afterEach(function() {
            sandbox.restore()
        })

        after(function() {
            bottle.container.logger.transports.console.level = 'info';
            bottle.container.settings.logApi = 0
            bottle.container.settings.logPumpTimers = 0
            bottle.container.settings.intellitouch.installed = 1
            bottle.container.settings.intellicom = 0
        })

        it('starts pump 1 timer to check for status every 30 seconds', function() {
            numPumpStub = sandbox.stub(bottle.container.pump, 'numberOfPumps').returns(1)

            bottle.container.settings.virtual.pumpController = 'always' //TODO: add test for 'default' and 'never'
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

            numPumpStub = sandbox.stub(bottle.container.pump, 'numberOfPumps').returns(2)
            bottle.container.settings.virtual.pumpController = 'always' //TODO: add test for 'default' and 'never'


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
        });

        it('does not start virtual.pumpController with never setting', function() {

            bottle.container.settings.virtual.pumpController = 'never'
            bottle.container.pumpControllerTimers.startPumpController()

            clock.tick(10 * 1000)
            setPumpRemoteStub.callCount.should.eq(0)
            requestPumpStatusStub.callCount.should.eq(0)
            bottle.container.settings.virtual.pumpController = 'default'
        });

        it('starts pump 1 & 2 timers to check for status every 30 seconds with virtual.pumpController set to always', function() {
            bottle.container.settings.virtual.pumpController = 'always'
            bottle.container.settings.intellitouch.installed = 1
            numPumpStub = sandbox.stub(bottle.container.pump, 'numberOfPumps').returns(2)


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
            bottle.container.settings.virtual.pumpController = 'default'
            bottle.container.settings.intellitouch.installed = 0
        });

        it('runs pump 1 at 1000 rpm for 5 minutes', function() {

            numPumpStub = sandbox.stub(bottle.container.pump, 'numberOfPumps').returns(1)
            queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
            pumpCurrentProgramSpy = sandbox.spy(bottle.container.pump, 'setCurrentProgram')
            pumpDurationSpy = sandbox.spy(bottle.container.pump, 'setDuration')
            bottle.container.pumpControllerMiddleware.pumpCommand(1, 1, 1000, 1)

            clock.tick(30 * 1000)

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
