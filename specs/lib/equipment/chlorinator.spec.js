describe('chlorinator tests', function() {

    //var spied = sinon.spy(bottle.container.chlorinator.setChlorinatorLevelAsync)
    var equip = 'controller'
    before(function() {
        return Promise.resolve()
            .then(function(){
                bottle.container.settings.set('virtual.chlorinatorController', "always")
                bottle.container.settings.set('chlorinator.installed',1)
                bottle.container.settings.set('intellitouch.installed',0)
                bottle.container.settings.set('intellicom.installed', 0)
            })
            .then(global.initAllAsync)
    });

    beforeEach(function() {
        sandbox = sinon.sandbox.create()
        clock = sandbox.useFakeTimers()
        loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
        loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
        loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
        loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
        loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
        pumpControllerProgramTimersSpy = sandbox.spy(bottle.container.pumpControllerTimers, 'startProgramTimer')

        queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
        emitToClientsStub = sandbox.stub(bottle.container.io, 'emitToClients')

        updateAvailStub = sandbox.stub(bottle.container.updateAvailable, 'getResultsAsync').returns(Promise.resolve({}))
        bottle.container.chlorinatorController.startChlorinatorController()
    })

    afterEach(function() {
        //restore the sandbox after each function
        bottle.container.chlorinatorController.clearTimer()
        sandbox.restore()


    })

    after(function() {
        return Promise.resolve()
            .then(function(){
                bottle.container.settings.set('virtual.chlorinatorController', "default")
                bottle.container.settings.set('chlorinator.installed', 0)
                bottle.container.settings.set('intellitouch.installed', 1)
                bottle.container.settings.set('intellicom.installed', 0)
                bottle.container.chlorinatorController.clearTimer()
            })
            .then(global.stopAllAsync)
    })

    describe('#setChlorinatorLevel returns objects', function() {
        it('@ 0 it should return a response object', function() {
            return bottle.container.chlorinator.setChlorinatorLevelAsync(0)
                .then(function(res){
                    res.should.have.property('status')
                    res.value.should.eq(0)
                    res.status.should.eq('off')

                })
        })

        it('@ 0 should return a callback', function() {
            return bottle.container.chlorinator.setChlorinatorLevelAsync(0)
                .then(function(res) {
                    res.should.have.property('status')
                    res.value.should.eq(0)
                    res.status.should.eq('off')

                })
        })

    })

    describe('#setChlorinatorLevel sends the right packets to the chlorinator', function() {

        it('@10% sends packets every 4 seconds (test covers 1 hour)', function() {
            return bottle.container.chlorinator.setChlorinatorLevelAsync(10)
                .then(function(){
                    // console.log('chlor args: ', queuePacketStub.args)
                    queuePacketStub.callCount.should.eq(1)
                    clock.tick(4000)
                    queuePacketStub.callCount.should.eq(2)
                    queuePacketStub.args[0][0].should.deep.equal([16, 2, 80, 17, 10])
                    clock.tick(60 * 1000) //59+4 secs
                    queuePacketStub.callCount.should.eq(17)
                    clock.tick(60 * 60 * 1000) //1hr+5 mins
                    queuePacketStub.callCount.should.eq(917)
                })

        });

        it('@0% sends packets every 30 seconds (test covers 1 hour)', function() {
            return bottle.container.chlorinator.setChlorinatorLevelAsync(0)
                .then(function(){
                    // console.log('chlor args: ', queuePacketStub.args)
                    queuePacketStub.callCount.should.eq(1)
                    clock.tick(30 * 1000)
                    queuePacketStub.callCount.should.eq(2)
                    queuePacketStub.args[0][0].should.deep.equal([16, 2, 80, 17, 0])
                    clock.tick(60 * 1000) //1.5 min
                    queuePacketStub.callCount.should.eq(4)
                    clock.tick(60 * 60 * 1000) //1hr+1.5 mins
                    queuePacketStub.callCount.should.eq(124)
                })

        });

        it('@101% (super-chlorinate) sends packets every 4 seconds (test covers 1 hour)', function() {
            return bottle.container.chlorinator.setChlorinatorLevelAsync(101)
                .then(function(){
                    // console.log('chlor args: ', queuePacketStub.args)
                    queuePacketStub.callCount.should.eq(1)
                    clock.tick(4000)
                    queuePacketStub.callCount.should.eq(2)
                    queuePacketStub.args[0][0].should.deep.equal([16, 2, 80, 17, 101])
                    clock.tick(60 * 1000) //59+4 secs
                    queuePacketStub.callCount.should.eq(17)
                    clock.tick(60 * 60 * 1000) //1hr+5 mins
                    queuePacketStub.callCount.should.eq(917)
                })


        });

        it('@102% (should fail -- does not change previous state)', function() {
            return Promise.resolve()
                .then(function(){
                    loggerWarnStub.restore()
                    loggerWarnStub = sandbox.stub(bottle.container.logger,'warn')
                })
                .then(function(){
                    return bottle.container.chlorinator.setChlorinatorLevelAsync(102)
                })
                .then(function(res){
                    res.text.should.contain('FAIL')
                    loggerWarnStub.callCount.should.equal(1)
                })

        });
    })
});
