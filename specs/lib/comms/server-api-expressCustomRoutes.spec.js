
describe('server', function() {
    describe('#circuit api calls', function() {

        context('with a URL', function() {

            before(function() {
                return global.initAll()
            })

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
            })

            afterEach(function() {
                sandbox.restore()
            })

            after(function() {
                return global.stopAll()
            })

            it('Requests a custom express route', function() {
                return global.requestPoolDataWithURL('api/myruntimeroute').then(function(res) {
                    res.runtime.should.equal('route')
                })
            });

        });

    });
});
