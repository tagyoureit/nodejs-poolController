describe('chlorinator controller - Virtual', function () {

    describe('#startChlorinatorController starts the timer for 1 or 2 chlorinators', function () {

        before(function () {
            return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config_intellichlor_virtual.json'})
        });

        beforeEach(function () {

            loggers = setupLoggerStubOrSpy('stub', 'spy')
            clock = sinon.useFakeTimers()
            pumpControllerProgramTimersSpy = sinon.spy(bottle.container.pumpControllerTimers, 'startProgramTimer')
            queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
        })

        afterEach(function () {
            bottle.container.chlorinatorController.clearTimer()
            sinon.restore()

        })

        after(function () {
            return global.stopAllAsync()

        })

        it('sets chlorinator timer to run after 4 seconds at 0%', function () {
            bottle.container.chlorinator.init()
            bottle.container.chlorinatorController.startChlorinatorController()

            queuePacketStub.callCount.should.eq(0)
            clock.tick(4001)
            queuePacketStub.callCount.should.eq(1)
            queuePacketStub.args[0][0].should.deep.equal([16, 2, 80, 17, 0])
            clock.tick(59 * 1000) //63 seconds
            queuePacketStub.callCount.should.eq(2)
            clock.tick(1 * 1000) //64 seconds
            queuePacketStub.callCount.should.eq(3)


        });

        it('sets chlorinator timer to run after 4 seconds at 10%', function () {

            return Promise.resolve()
                .then(function () {
                    bottle.container.chlorinator.init()
                    bottle.container.chlorinatorController.startChlorinatorController()
                })


                .then(function () {
                    return bottle.container.chlorinator.setChlorinatorLevelAsync(10)
                })
                .then(function (response) {
                    response.value.should.equal(10)
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
