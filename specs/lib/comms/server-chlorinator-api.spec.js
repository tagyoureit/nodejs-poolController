describe('#set functions', function() {

    describe('#sends chlorinator commands', function() {
        context('with NO chlorinator installed, with a REST API', function () {

            before(function () {

                // return Promise.resolve()
                //     .then(function () {
                //         bottle.container.settings.set('virtual.chlorinatorController', 0)
                //         bottle.container.settings.set('chlorinator.installed', 0)
                //     })
                //     .then(global.initAllAsync)
                return global.initAllAsync()
            });

            beforeEach(function () {
                // sinon = sinon.sinon.create()
                //clock = sinon.useFakeTimers()
                loggers = setupLoggerStubOrSpy('stub', 'spy')
                queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
                socketIOStub = sinon.stub(bottle.container.io, 'emitToClients')
            })

            afterEach(function () {
                sinon.restore()

            })

            after(function () {
                return global.stopAllAsync()
            })


            it('should send a message if chlorinator is not installed', function (done) {
                global.requestPoolDataWithURLAsync('chlorinator/0')
                    .then(function (result) {
                        result.text.should.contain('FAIL')
                        queuePacketStub.callCount.should.eq(0)
                    })
                    .then(done)
                    .catch(function (err) {
                        bottle.container.logger.error('Error with chlor not installed.', err)
                        console.error(err)
                    })
            })
        })
    })
    describe('#sends chlorinator commands', function() {

        context('with a REST API', function() {

            before(function() {

                // return Promise.resolve()
                //     .then(function(){
                //         bottle.container.settings.set('virtual.chlorinatorController', 1)
                //         bottle.container.settings.set('chlorinator.installed', 1)
                //     })
                //     .then(global.initAllAsync)
                return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config_intellichlor.json'})
            });

            beforeEach(function() {
                loggers = setupLoggerStubOrSpy('stub','spy')
                queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
                settingsStub = sinon.stub(bottle.container.settings, 'updateChlorinatorDesiredOutputAsync')
                //getVersionNotificationStub = sinon.stub(bottle.container.settings, 'get').withArgs('notifications.version.remote').returns({'dismissUntilNextRemoteVersionBump': true})

            })

            afterEach(function() {
                bottle.container.chlorinator.setChlorinatorLevelAsync(0)
                    .then(function(){
                        bottle.container.chlorinatorController.clearTimer()
                        // Clear out the write queues
                        bottle.container.queuePacket.init()
                        bottle.container.writePacket.init()
                        sinon.restore()
                    })

            })

            after(function() {
                return Promise.resolve()
                    .then(function(){
                        bottle.container.settings.set('virtual.chlorinatorController', 0)
                        bottle.container.settings.set('chlorinator.installed', 0)
                    })
                    .then(global.stopAllAsync)
            })

            it('starts chlorinator at 50%', function() {

                return global.requestPoolDataWithURLAsync('chlorinator/50')
                    .delay(50)
                    .then(function(result) {
                        result.status.should.eq('on')
                        result.value.should.eq(50)
                        queuePacketStub.callCount.should.eq(1)
                        queuePacketStub.args[0][0].should.deep.equal([16, 2, 80, 17, 50])
                    })
                    .catch(function(err){
                        bottle.container.logger.error(err.toString())
                    })
            })
            it('starts chlorinator at 100%', function(done) {

                global.requestPoolDataWithURLAsync('chlorinator/100')
                    .then(function(result) {
                        result.status.should.eq('on')
                        result.value.should.eq(100)
                        queuePacketStub.callCount.should.eq(1)
                        queuePacketStub.args[0][0].should.deep.equal([16, 2, 80, 17, 100])
                    })
                    .then(done,done)
            })
            it('starts chlorinator at 101% (super chlorinate)', function(done) {

                global.requestPoolDataWithURLAsync('chlorinator/101')
                    .then(function(result) {
                        result.status.should.eq('on')
                        result.value.should.eq(101)
                        queuePacketStub.callCount.should.eq(1)
                        queuePacketStub.args[0][0].should.deep.equal([16, 2, 80, 17, 101])
                    })
                    .then(done,done)
            })
            it('starts chlorinator at -1% (should fail)', function(done) {

                global.requestPoolDataWithURLAsync('chlorinator/-1')
                    .then(function(result) {
                        result.text.should.contain('FAIL')
                        queuePacketStub.callCount.should.eq(0)
                    })
                    .then(done,done)
            })
            it('starts chlorinator at 150% (should fail)', function(done) {

                global.requestPoolDataWithURLAsync('chlorinator/150')
                    .then(function(result){
                        result.text.should.contain('FAIL')
                        queuePacketStub.callCount.should.eq(0)
                    })
                    .then(done,done)
            })
            it('starts chlorinator at 0%', function(done) {
                //do this one last so
                global.requestPoolDataWithURLAsync('chlorinator/0')
                    .then(function(result) {
                        result.status.should.eq('off')
                        result.value.should.eq(0)
                        queuePacketStub.callCount.should.eq(1)
                        queuePacketStub.args[0][0].should.deep.equal([16, 2, 80, 17, 0])
                    })
                    .then(done,done)
            })
        });
    });
})

