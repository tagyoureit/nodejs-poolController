describe('chlorinator tests', function() {

    //var spied = sinon.spy(bottle.container.chlorinator.setChlorinatorLevelAsync)
    var equip = 'controller'
    before(function() {
        return global.initAllAsync()
            .then(function(){
                bottle.container.settings.set('virtual.chlorinatorController', "always")
                bottle.container.settings.set('chlorinator.installed',1)
                bottle.container.settings.set('intellitouch.installed',0)
                bottle.container.settings.set('intellicom.installed', 0)
            })

    });

    beforeEach(function() {
        loggers = setupLoggerStubOrSpy('stub', 'stub')
        clock = sinon.useFakeTimers()

        pumpControllerProgramTimersSpy = sinon.spy(bottle.container.pumpControllerTimers, 'startProgramTimer')

        queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
        emitToClientsStub = sinon.stub(bottle.container.io, 'emitToClients')

        updateAvailStub = sinon.stub(bottle.container.updateAvailable, 'getResultsAsync').returns(Promise.resolve({}))
        bottle.container.chlorinatorController.startChlorinatorController()
    })

    afterEach(function() {
        //restore the sinon after each function
        bottle.container.chlorinatorController.clearTimer()
        sinon.restore()


    })

    after(function() {

        return global.stopAllAsync()
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
                    return bottle.container.chlorinator.setChlorinatorLevelAsync(102)
                })
                .then(function(res){
                    res.text.should.contain('FAIL')
                    loggers.loggerWarnStub.callCount.should.equal(1)
                })

        });
    })




});

describe('#When packets arrive', function () {
    context('via serialport or Socat', function () {

        before(function () {
            return global.initAllAsync()
        });

        beforeEach(function () {
            loggers = setupLoggerStubOrSpy('stub', 'spy')
            queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')


        })

        afterEach(function () {
            sinon.restore()

        })

        after(function () {
            return global.stopAllAsync()
        })

        it('#Chlorinator packets are processed', function () {
            return Promise.resolve()
                .then(function () {
                    // multiple packets for code coverage
                    var data = [

                        Buffer.from([16, 2, 0, 18, 58,144, 238,16,3]),
                        Buffer.from([16, 2, 0, 1, 0, 0, 19, 16, 3]),
                        Buffer.from([16, 2, 0, 3, 0, 73, 110, 116, 101, 108, 108, 105, 99, 104, 108, 111, 114, 45, 45, 52, 48, 188, 16, 3]),
                        Buffer.from([16, 2, 80, 20, 2, 120, 16, 3]),
                        Buffer.from([16, 2, 80, 21, 2, 120, 16, 3]),
                        Buffer.from([16, 2, 80, 17, 3, 118, 16, 3]),
                        Buffer.from([16, 2, 80, 0, 0, 98, 16, 3])




                    ]

                    data.forEach(function (el) {
                        bottle.container.packetBuffer.push(el)
                    })
                })
                .delay(100)
                .then(function () {
                    // console.log(bottle.container.chlorinator.getChlorinatorStatus())
                    bottle.container.chlorinator.getChlorinatorStatus().chlorinator.saltPPM.should.eq(2900)
                    bottle.container.chlorinator.getChlorinatorStatus().chlorinator.name.should.eq('Intellichlor--40')
                })
        })


    })
})
