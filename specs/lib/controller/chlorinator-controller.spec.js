describe('chlorinator controller', function() {

    describe('#startChlorinatorController starts the timer for 1 or 2 chlorinators', function() {

        before(function() {

            bottle.container.settings.chlorinator = 1
            bottle.container.settings.logChlorinator = 1

        });

        beforeEach(function() {
            sandbox = sinon.sandbox.create()
            clock = sandbox.useFakeTimers()
            loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
            // loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
            // loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
            pumpControllerProgramTimersSpy = sandbox.spy(bottle.container.pumpControllerTimers, 'startProgramTimer')

            queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
            emitToClientsStub = sandbox.stub(bottle.container.io, 'emitToClients')
        })

        afterEach(function() {
            //restore the sandbox after each function
            bottle.container.chlorinatorController.clearTimer()
            sandbox.restore()

        })

        after(function() {
            bottle.container.settings.chlorinator = 0
            bottle.container.settings.logChlorinator = 0

        })

        it('sets chlorinator timer to run after 4 seconds', function() {

            bottle.container.chlorinatorController.startChlorinatorController()
            queuePacketStub.callCount.should.eq(0)
            clock.tick(4000)
            queuePacketStub.callCount.should.eq(1)
            queuePacketStub.args[0][0].should.include.members([16, 2, 80, 17, 0])
            clock.tick(59 * 1000) //59+4 mins
            queuePacketStub.callCount.should.eq(2)
            clock.tick(1 * 1000) //60+4 mins
            queuePacketStub.callCount.should.eq(3)

        });


    });



});
