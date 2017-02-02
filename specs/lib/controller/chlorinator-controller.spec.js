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

            //console.log('before time:', this.clock.now)
            bottle.container.chlorinatorController.startChlorinatorController()
            queuePacketStub.callCount.should.eq(0)
            clock.tick(4000)
            queuePacketStub.callCount.should.eq(1)
            queuePacketStub.args[0][0].should.include.members([16, 2, 80, 17, 0])
            clock.tick(60 * 1000) //1 hour
            queuePacketStub.callCount.should.eq(3)
            //console.log('res:', res)
            //this.clock.tick(3500)
            //console.log('after time:', this.clock.now, res)

            //expect(stub).to.be.true
            //console.log('stub: ', stub)
            //return expect(stub).to.be.calledOnce
        });


    });

    describe('#chlorinatorStatusCheck requests chlorinator status', function() {


        it('requests status and resets the timer with a valid desired output (0)', function() {


            //bottle.container.chlorinator.setChlorinatorLevel(2);
            //expect(bottle.container.chlorinatorController.chlorinatorStatusCheck()).to.be.true;
            // bottle.container.chlorinatorController.chlorinatorStatusCheck()


        });


        it('requests status and resets the timer with a valid desired output (10)', function() {

            //bottle.container.chlorinator.setChlorinatorLevel(2);
            //expect(bottle.container.chlorinatorController.chlorinatorStatusCheck()).to.be.true;


        });

        it('requests status and resets the timer with a valid desired output (102) (should fail)', function() {


        });
    });

});
