describe('chlorinator tests', function() {

    //var spied = sinon.spy(bottle.container.chlorinator.setChlorinatorLevel)
    var equip = 'controller'
    before(function() {

        bottle.container.settings.chlorinator = 1
        bottle.container.settings.logChlorinator = 1

    });

    beforeEach(function() {
        sandbox = sinon.sandbox.create()
        clock = sandbox.useFakeTimers()
        loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
        // loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
        loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
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
        bottle.container.chlorinatorController.clearTimer()

    })

    describe('#setChlorinatorLevel returns objects', function() {
        it('@ 0 it should return a response object', function() {
            var res = bottle.container.chlorinator.setChlorinatorLevel(0)
            res.should.have.property('status')
            res.value.should.eq(0)
            res.status.should.eq('off')
        })

        it('@ 0 should return a callback', function(done) {
            bottle.container.chlorinator.setChlorinatorLevel(0, function(res) {
                res.should.have.property('status')
                res.value.should.eq(0)
                res.status.should.eq('off')
                done()
            })
        })

    })

    describe('#setChlorinatorLevel sends the right packets to the chlorinator', function() {

        it('@10% sends packets every 4 seconds (test covers 1 hour)', function() {
            bottle.container.chlorinator.setChlorinatorLevel(10)
            // console.log('chlor args: ', queuePacketStub.args)
            queuePacketStub.callCount.should.eq(1)
            clock.tick(4000)
            queuePacketStub.callCount.should.eq(2)
            queuePacketStub.args[0][0].should.deep.equal([16, 2, 80, 17, 10])
            clock.tick(60 * 1000) //59+4 secs
            queuePacketStub.callCount.should.eq(17)
            clock.tick(60*60 * 1000) //1hr+5 mins
            queuePacketStub.callCount.should.eq(917)
        });

        it('@0% sends packets every 30 seconds (test covers 1 hour)', function() {
          bottle.container.chlorinator.setChlorinatorLevel(0)
          // console.log('chlor args: ', queuePacketStub.args)
          queuePacketStub.callCount.should.eq(1)
          clock.tick(30*1000)
          queuePacketStub.callCount.should.eq(2)
          queuePacketStub.args[0][0].should.deep.equal([16, 2, 80, 17, 0])
          clock.tick(60 * 1000) //1.5 min
          queuePacketStub.callCount.should.eq(4)
          clock.tick(60*60 * 1000) //1hr+1.5 mins
          queuePacketStub.callCount.should.eq(124)
        });

        it('@101% (super-chlorinate) sends packets every 4 seconds (test covers 1 hour)', function() {
          bottle.container.chlorinator.setChlorinatorLevel(101)
          // console.log('chlor args: ', queuePacketStub.args)
          queuePacketStub.callCount.should.eq(1)
          clock.tick(4000)
          queuePacketStub.callCount.should.eq(2)
          queuePacketStub.args[0][0].should.deep.equal([16, 2, 80, 17, 101])
          clock.tick(60 * 1000) //59+4 secs
          queuePacketStub.callCount.should.eq(17)
          clock.tick(60*60 * 1000) //1hr+5 mins
          queuePacketStub.callCount.should.eq(917)

        });

        it('@102% (should fail -- does not change previous state)', function() {
          var res = bottle.container.chlorinator.setChlorinatorLevel(102)
          res.text.should.contain('FAIL')

        });
    })
});
