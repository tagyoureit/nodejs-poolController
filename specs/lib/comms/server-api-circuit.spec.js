
describe('server', function() {
    describe('#circuit api calls', function() {

        context('with a URL', function() {

            before(function() {
                return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config.pump.VS.json'})
            })

            beforeEach(function() {
                loggers = setupLoggerStubOrSpy('stub','stub')
                writeSPPacketStub = sinon.stub(bottle.container.sp, 'writeSP')//.callsFake(function(){bottle.container.writePacket.postWritePacketHelper()})
                preambleStub = sinon.stub(bottle.container.intellitouch, 'getPreambleByte').returns(33)

            })

            afterEach(function() {
                bottle.container.writePacket.init()
                bottle.container.queuePacket.init()
                sinon.restore()
            })

            after(function() {
                return global.stopAllAsync()
            })



            it('toggle circuit 1', function(done) {
                global.requestPoolDataWithURLAsync('circuit/1/toggle')
                    .delay(50)
                    .then(function(obj) {
                //     console.log('logger?', loggers)
                //         console.log('sinon', sinon)
                    writeSPPacketStub.args[0][0].should.deep.equal([ 255, 0, 255, 165, 33, 16, 33, 134, 2, 1, 1, 1, 129 ])
                }).then(done,done)
            });

            it('set circuit 1 on', function(done) {
                global.requestPoolDataWithURLAsync('circuit/2/set/1').then(function(obj) {
                    writeSPPacketStub.args[0][0].should.deep.equal([ 255, 0, 255, 165, 33, 16, 33, 134, 2, 2, 1, 1, 130 ])
                }).then(done,done)
            });

            it('toggle circuit 1', function(done) {
                global.requestPoolDataWithURLAsync('circuit/3/toggle').then(function(obj) {
                    writeSPPacketStub.args[0][0].should.deep.equal([ 255, 0, 255, 165, 33, 16, 33, 134, 2, 3, 1, 1, 131 ])
                }).then(done,done)
            });

            it('cancels the delay', function(done) {
                global.requestPoolDataWithURLAsync('cancelDelay').then(function(obj) {
                    writeSPPacketStub.args[0][0].should.deep.equal([ 255, 0, 255, 165, 33, 16, 33, 131, 1, 0, 1, 123 ])
                }).then(done,done)
            });

        });

    });
});
