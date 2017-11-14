var URL = 'http://localhost:3000/'
var sandbox;

function requestPoolDataWithURL(endpoint) {
    //console.log('pending - request sent for ' + endpoint)
    return getAllPoolData(endpoint).then(
        function(response) {
            //  console.log('success - received data for %s request: %s', endpoint, JSON.stringify(response.body));
            return response.body;
        }
    );
};

function getAllPoolData(endpoint) {
    var options = {
        method: 'GET',
        uri: URL + endpoint,
        resolveWithFullResponse: true,
        json: true
    };
    return rp(options);
};


describe('server', function() {
    describe('#circuit api calls', function() {

        context('with a URL', function() {

            before(function() {
                bottle.container.server.init()
                bottle.container.circuit.init()
                bottle.container.logger.transports.console.level = 'silly';
            })

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                clock = sandbox.useFakeTimers()
                writeSPPacketStub = sandbox.stub(bottle.container.sp, 'writeSP')//.callsFake(function(){bottle.container.writePacket.postWritePacketHelper()})
                sandbox.stub(bottle.container.intellitouch, 'getPreambleByte').returns(33)
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
            })

            afterEach(function() {
                bottle.container.writePacket.init()
                bottle.container.queuePacket.init()
                sandbox.restore()
            })

            after(function() {
                bottle.container.circuit.init()
                bottle.container.server.close()
                bottle.container.logger.transports.console.level = 'info'
            })



            it('toggle circuit 1', function(done) {
                requestPoolDataWithURL('circuit/1/toggle').then(function(obj) {
                    writeSPPacketStub.args[0][0].should.deep.equal([ 255, 0, 255, 165, 33, 16, 33, 134, 2, 1, 1, 1, 129 ])
                }).then(done,done)
            });

            it('set circuit 1 on', function(done) {
                requestPoolDataWithURL('circuit/2/set/1').then(function(obj) {
                    writeSPPacketStub.args[0][0].should.deep.equal([ 255, 0, 255, 165, 33, 16, 33, 134, 2, 2, 1, 1, 130 ])
                }).then(done,done)
            });

            it('toggle circuit 1', function(done) {
                requestPoolDataWithURL('circuit/3/toggle').then(function(obj) {
                    writeSPPacketStub.args[0][0].should.deep.equal([ 255, 0, 255, 165, 33, 16, 33, 134, 2, 3, 1, 1, 131 ])
                }).then(done,done)
            });

            it('cancels the delay', function(done) {
                requestPoolDataWithURL('cancelDelay').then(function(obj) {
                    writeSPPacketStub.args[0][0].should.deep.equal([ 255, 0, 255, 165, 33, 16, 33, 131, 1, 0, 1, 123 ])
                }).then(done,done)
            });

        });

    });
});
