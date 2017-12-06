describe('#set functions', function() {

    describe('#sends chlorinator commands', function() {
        context('with NO chlorinator installed, with a REST API', function() {

            before(function () {
                bottle.container.settings.set('virtual.chlorinatorController', 0)
                bottle.container.settings.set('chlorinator.installed', 0)
                return global.initAll()
            });

            beforeEach(function () {
                sandbox = sinon.sandbox.create()
                clock = sandbox.useFakeTimers()
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
                queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
                socketIOStub = sandbox.stub(bottle.container.io, 'emitToClients')
            })

            afterEach(function () {
                //restore the sandbox after each function

                sandbox.restore()

            })

            after(function () {
                return global.stopAll()
            })


            it('should send a message if chlorinator is not installed', function (done) {
                global.requestPoolDataWithURL('chlorinator/0')
                    .then(function (result) {
                        result.text.should.contain('FAIL')
                        queuePacketStub.callCount.should.eq(0)
                    })
                    .then(done, done)
            })
        })


        context('with a REST API', function() {

            before(function() {
                bottle.container.settings.set('virtual.chlorinatorController', 1)
                bottle.container.settings.set('chlorinator.installed', 1)
                return global.initAll()
            });

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                clock = sandbox.useFakeTimers()
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
                queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
                socketIOStub = sandbox.stub(bottle.container.io, 'emitToClients')
                configEditorStub = sandbox.stub(bottle.container.configEditor, 'updateChlorinatorDesiredOutput')

            })

            afterEach(function() {
                //restore the sandbox after each function
                bottle.container.chlorinator.setChlorinatorLevel(0)
                bottle.container.chlorinatorController.clearTimer()
                sandbox.restore()
            })

            after(function() {
                bottle.container.settings.set('virtual.chlorinatorController', 0)
                bottle.container.settings.set('chlorinator.installed', 0)
                return global.stopAll()
            })

            it('starts chlorinator at 50%', function(done) {

                global.requestPoolDataWithURL('chlorinator/50')
                    .then(function(result) {
                        result.status.should.eq('on')
                        result.value.should.eq(50)
                        queuePacketStub.callCount.should.eq(1)
                        queuePacketStub.args[0][0].should.deep.equal([16, 2, 80, 17, 50])

                    })
                    .then(done,done)
            })
            it('starts chlorinator at 100%', function(done) {

                global.requestPoolDataWithURL('chlorinator/100')
                    .then(function(result) {
                        result.status.should.eq('on')
                        result.value.should.eq(100)
                        queuePacketStub.callCount.should.eq(1)
                        queuePacketStub.args[0][0].should.deep.equal([16, 2, 80, 17, 100])
                    })
                    .then(done,done)
            })
            it('starts chlorinator at 101% (super chlorinate)', function(done) {

                global.requestPoolDataWithURL('chlorinator/101')
                    .then(function(result) {
                        result.status.should.eq('on')
                        result.value.should.eq(101)
                        queuePacketStub.callCount.should.eq(1)
                        queuePacketStub.args[0][0].should.deep.equal([16, 2, 80, 17, 101])
                    })
                    .then(done,done)
            })
            it('starts chlorinator at -1% (should fail)', function(done) {

                global.requestPoolDataWithURL('chlorinator/-1')
                    .then(function(result) {
                        result.text.should.contain('FAIL')
                        queuePacketStub.callCount.should.eq(0)
                    })
                    .then(done,done)
            })
            it('starts chlorinator at 150% (should fail)', function(done) {

                global.requestPoolDataWithURL('chlorinator/150')
                    .then(function(result){
                        result.text.should.contain('FAIL')
                        queuePacketStub.callCount.should.eq(0)
                    })
                    .then(done,done)
            })
            it('starts chlorinator at 0%', function(done) {
                //do this one last so
                global.requestPoolDataWithURL('chlorinator/0')
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
