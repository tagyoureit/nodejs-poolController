describe('chlorinator controller', function() {

    describe('#startChlorinatorController starts the timer for 1 or 2 chlorinators', function() {

        before(function() {
            return global.initAll()
                .then(function () {
                    return global.useShadowConfigFile('/specs/assets/config/templates/config_intellichlor.json')
                })
            // bottle.container.settings.virtual.chlorinatorController = "default"
            // bottle.container.settings.chlorinator.installed = 1
            // bottle.container.settings.logChlorinator = 1
            // bottle.container.settings.intellitouch.installed = 0
            // bottle.container.settings.intellicom.installed = 0

        });

        beforeEach(function() {
            sandbox = sinon.sandbox.create()
            clock = sandbox.useFakeTimers()
            loggerInfoStub = sandbox.spy(bottle.container.logger, 'info')

            loggerVerboseStub = sandbox.spy(bottle.container.logger, 'verbose')
            loggerDebugStub = sandbox.spy(bottle.container.logger, 'debug')
            loggerSillyStub = sandbox.spy(bottle.container.logger, 'silly')

            loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
            pumpControllerProgramTimersSpy = sandbox.spy(bottle.container.pumpControllerTimers, 'startProgramTimer')

            queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
            //emitToClientsStub = sandbox.stub(bottle.container.io, 'emitToClients')
        })

        afterEach(function() {
            //restore the sandbox after each function
            bottle.container.chlorinatorController.clearTimer()
            sandbox.restore()

        })

        after(function() {
            return global.removeShadowConfigFile()
                .then(global.stopAll)

        })

        it('sets chlorinator timer to run after 4 seconds at 0%', function() {
            //bottle.container.settings.chlorinator.desiredOutput = 0
            getChlorStub = sandbox.stub(bottle.container.configEditor, 'getChlorinatorDesiredOutput').returns(Promise.resolve({
                "pool": 0,
                "spa": 12
            }))
            return Promise.resolve()
                .then(bottle.container.chlorinator.init)
                .then(function(){
                    bottle.container.chlorinatorController.startChlorinatorController()
                    queuePacketStub.callCount.should.eq(0)
                    clock.tick(4001)
                    queuePacketStub.callCount.should.eq(1)
                    queuePacketStub.args[0][0].should.deep.equal([16, 2, 80, 17, 0])
                    clock.tick(59 * 1000) //63 seconds
                    queuePacketStub.callCount.should.eq(2)
                    clock.tick(1 * 1000) //64 seconds
                    queuePacketStub.callCount.should.eq(3)
                })


        });

        it('sets chlorinator timer to run after 4 seconds at 10%', function() {
            // getChlorStub = sandbox.stub(bottle.container.configEditor, 'getChlorinatorDesiredOutput').returns(Promise.resolve({
            //     "pool": 10,
            //     "spa": 12
            // }))
            return Promise.resolve()
                .then(function(){
                    return bottle.container.chlorinator.init()
                })
                .then(function() {
                    return bottle.container.chlorinatorController.startChlorinatorController()
                })
                .then(function(){
                    return bottle.container.chlorinator.setChlorinatorLevel(10)
                })
                .then(function(){
                    queuePacketStub.callCount.should.eq(1)
                    clock.tick(4000)
                    queuePacketStub.callCount.should.eq(2)
                    queuePacketStub.args[0][0].should.deep.equal([16, 2, 80, 17, 10])
                    clock.tick(59 * 1000) //63 seconds
                    queuePacketStub.callCount.should.eq(16)
                    clock.tick(1 * 1000) //64 Seconds
                    queuePacketStub.callCount.should.eq(17)
                })


        });

    });



});
