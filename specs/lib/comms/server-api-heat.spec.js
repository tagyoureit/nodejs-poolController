

var data = [
    Buffer.from([255,0,255,165,33,15,16,8,13,60,60,55,70,100,7,0,0,51,0,0,0,0,2,141])
]
describe('server', function() {
    describe('#heat api calls', function() {

        context('with a URL', function() {

            before(function() {
                return global.initAllAsync()
            })

            beforeEach(function() {
                return Promise.resolve()
                    .then(function(){
                        loggers = setupLoggerStubOrSpy('stub', 'spy')
                        //clock = sinon.useFakeTimers()
                        queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
                        sinon.stub(bottle.container.intellitouch, 'getPreambleByte').returns(33)

                        writeSPPacketStub = sinon.stub(bottle.container.sp, 'writeSP').callsFake(function(){bottle.container.writePacket.postWritePacketHelper()})
                        writeSPPacketStub = sinon.stub(bottle.container.sp, 'writeNET').callsFake(function(){bottle.container.writePacket.postWritePacketHelper()})
                        checkIfNeedControllerConfigurationStub = sinon.stub(bottle.container.intellitouch, 'checkIfNeedControllerConfiguration')
                        bottle.container.queuePacket.init()
                        bottle.container.packetBuffer.push(data[0])

                    })
                    .delay(50)

            })

            afterEach(function() {
                bottle.container.queuePacket.init()

            })

            after(function() {
                sinon.restore() //need to call manually whenever we use fake timers
                return global.stopAllAsync()
            })


            it('set spa heat to 103', function(done) {
                global.requestPoolDataWithURLAsync('spaheat/setpoint/103')
                    .then(function(obj) {
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 136, 4, 70, 103, 7, 0])
                    })
                    .then(done,done)
            });

            it('increment spa heat by 1', function(done) {
                global.requestPoolDataWithURLAsync('spaheat/increment')
                    .then(function(obj) {
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 136, 4, 70, 101, 7, 0 ])
                    })
                    .then(done,done)
            });

            it('increment spa heat by 2', function(done) {

                global.requestPoolDataWithURLAsync('spaheat/increment/2')
                    .then(function(obj) {
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 136, 4, 70, 102, 7, 0 ])
                    })
                    .then(done,done)
            });

            it('decrement spa heat by 1', function(done) {
                global.requestPoolDataWithURLAsync('spaheat/decrement')
                    .then(function(obj) {
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 136, 4, 70, 99, 7, 0 ])
                    })

                    .then(done,done)
            });

            it('decrement spa heat by 5', function(done) {
                global.requestPoolDataWithURLAsync('spaheat/decrement/5')
                    .then(function(obj) {
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 136, 4, 70, 95, 7, 0 ])
                    })
                    .then(done,done)
            });

            it('set spa heat mode to 0 (off)', function(done) {
                global.requestPoolDataWithURLAsync('spaheat/mode/0').then(function(obj) {
                    queuePacketStub.args[0][0].should.deep.equal([  165, 33, 16, 33, 136, 4, 70, 100, 3, 0 ])
                }).then(done,done)
            });

            it('set spa heat mode to 1 (heater)', function(done) {
                global.requestPoolDataWithURLAsync('spaheat/mode/1').then(function(obj) {
                    queuePacketStub.args[0][0].should.deep.equal([  165, 33, 16, 33, 136, 4, 70, 100, 7, 0 ])
                }).then(done,done)
            });

            it('set pool heat to 82', function(done) {
                global.requestPoolDataWithURLAsync('poolheat/setpoint/82')
                    .then(function(obj) {
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 136, 4, 82, 100, 7, 0])
                    })
                    .then(done,done)
            });

            it('increment pool heat by 1', function(done) {
                global.requestPoolDataWithURLAsync('poolheat/increment')
                    .then(function(obj) {
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 136, 4, 71, 100, 7, 0 ])
                    })
                    .then(done,done)
            });

            it('increment pool heat by 2', function(done) {

                global.requestPoolDataWithURLAsync('poolheat/increment/2')
                    .then(function(obj) {
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 136, 4, 72, 100, 7, 0 ])
                    })
                    .then(done,done)
            });

            it('decrement pool heat by 1', function(done) {
                global.requestPoolDataWithURLAsync('poolheat/decrement')
                    .then(function(obj) {
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 136, 4, 69, 100, 7, 0 ])
                    })

                    .then(done,done)
            });

            it('decrement pool heat by 5', function(done) {
                global.requestPoolDataWithURLAsync('poolheat/decrement/5')
                    .then(function(obj) {
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 136, 4, 65, 100, 7, 0 ])
                    })
                    .then(done,done)
            });

            it('set pool heat mode to 0 (off)', function(done) {
                global.requestPoolDataWithURLAsync('poolheat/mode/0').then(function(obj) {
                    queuePacketStub.args[0][0].should.deep.equal([  165, 33, 16, 33, 136, 4, 70, 100, 4, 0])
                }).then(done,done)
            });



            it('set pool heat mode to 1 (heater)', function(done) {
                global.requestPoolDataWithURLAsync('poolheat/mode/1').then(function(obj) {
                    queuePacketStub.args[0][0].should.deep.equal([  165, 33, 16, 33, 136, 4, 70, 100, 5, 0 ]
                    )
                }).then(done,done)
            });

        });

    });
});
