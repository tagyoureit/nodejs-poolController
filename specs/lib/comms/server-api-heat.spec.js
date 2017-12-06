

var data = [
    Buffer.from([255,0,255,165,33,15,16,8,13,60,60,55,70,100,7,0,0,51,0,0,0,0,2,141])
]
describe('server', function() {
    describe('#heat api calls', function() {

        context('with a URL', function() {

            before(function() {
                return global.initAll()
            })

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                clock = sandbox.useFakeTimers()
                queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
                sandbox.stub(bottle.container.intellitouch, 'getPreambleByte').returns(33)
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
                writeSPPacketStub = sandbox.stub(bottle.container.sp, 'writeSP').callsFake(function(){bottle.container.writePacket.postWritePacketHelper()})
                writeSPPacketStub = sandbox.stub(bottle.container.sp, 'writeNET').callsFake(function(){bottle.container.writePacket.postWritePacketHelper()})
                checkIfNeedControllerConfigurationStub = sandbox.stub(bottle.container.intellitouch, 'checkIfNeedControllerConfiguration')
                bottle.container.queuePacket.init()
                bottle.container.packetBuffer.push(data[0])


            })

            afterEach(function() {
                bottle.container.queuePacket.init()
                sandbox.restore()
            })

            after(function() {
                return global.stopAll()
            })


            it('set spa heat to 103', function(done) {
                global.requestPoolDataWithURL('spaheat/setpoint/103')
                    .then(function(obj) {
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 136, 4, 70, 103, 3, 0])
                    })
                    .then(done,done)
            });

            it('increment spa heat by 1', function(done) {
                global.requestPoolDataWithURL('spaheat/increment')
                    .then(function(obj) {
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 136, 4, 70, 101, 3, 0 ])
                    })
                    .then(done,done)
            });

            it('increment spa heat by 2', function(done) {

                global.requestPoolDataWithURL('spaheat/increment/2')
                    .then(function(obj) {
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 136, 4, 70, 102, 3, 0 ])
                    })
                    .then(done,done)
            });

            it('decrement spa heat by 1', function(done) {
                global.requestPoolDataWithURL('spaheat/decrement')
                    .then(function(obj) {
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 136, 4, 70, 99, 3, 0 ])
                    })

                    .then(done,done)
            });

            it('decrement spa heat by 5', function(done) {
                global.requestPoolDataWithURL('spaheat/decrement/5')
                    .then(function(obj) {
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 136, 4, 70, 95, 3, 0 ])
                    })
                    .then(done,done)
            });

            it('set spa heat mode to 0 (off)', function(done) {
                global.requestPoolDataWithURL('spaheat/mode/0').then(function(obj) {
                    queuePacketStub.args[0][0].should.deep.equal([  165, 33, 16, 33, 136, 4, 70, 100, 3, 0 ])
                }).then(done,done)
            });

            it('set spa heat mode to 1 (heater)', function(done) {
                global.requestPoolDataWithURL('spaheat/mode/1').then(function(obj) {
                    queuePacketStub.args[0][0].should.deep.equal([  165, 33, 16, 33, 136, 4, 70, 100, 7, 0 ])
                }).then(done,done)
            });

            it('set pool heat to 82', function(done) {
                global.requestPoolDataWithURL('poolheat/setpoint/82')
                    .then(function(obj) {
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 136, 4, 82, 100, 3, 0])
                    })
                    .then(done,done)
            });

            it('increment pool heat by 1', function(done) {
                global.requestPoolDataWithURL('poolheat/increment')
                    .then(function(obj) {
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 136, 4, 71, 100, 3, 0 ])
                    })
                    .then(done,done)
            });

            it('increment pool heat by 2', function(done) {

                global.requestPoolDataWithURL('poolheat/increment/2')
                    .then(function(obj) {
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 136, 4, 72, 100, 3, 0 ])
                    })
                    .then(done,done)
            });

            it('decrement pool heat by 1', function(done) {
                global.requestPoolDataWithURL('poolheat/decrement')
                    .then(function(obj) {
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 136, 4, 69, 100, 3, 0 ])
                    })

                    .then(done,done)
            });

            it('decrement pool heat by 5', function(done) {
                global.requestPoolDataWithURL('poolheat/decrement/5')
                    .then(function(obj) {
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 136, 4, 65, 100, 3, 0 ])
                    })
                    .then(done,done)
            });

            it('set pool heat mode to 0 (off)', function(done) {
                global.requestPoolDataWithURL('poolheat/mode/0').then(function(obj) {
                    queuePacketStub.args[0][0].should.deep.equal([  165, 33, 16, 33, 136, 4, 70, 100, 0, 0])
                }).then(done,done)
            });



            it('set pool heat mode to 1 (heater)', function(done) {
                global.requestPoolDataWithURL('poolheat/mode/1').then(function(obj) {
                    queuePacketStub.args[0][0].should.deep.equal([  165, 33, 16, 33, 136, 4, 70, 100, 1, 0 ]
                    )
                }).then(done,done)
            });

        });

    });
});
