
describe('server', function() {
    describe('#circuit api calls', function() {

        context('with a URL', function() {

            before(function() {
                return global.initAllAsync()
            })

            beforeEach(function() {
                loggers = setupLoggerStubOrSpy('stub', 'spy')
            })

            afterEach(function() {
                // sinon.restore()
            })

            after(function() {
                return global.stopAllAsync()
            })

            it('Requests a custom express route', function() {
                return global.requestPoolDataWithURLAsync('api/myruntimeroute').then(function(res) {
                    res.runtime.should.equal('route')
                })
            });

        });

    });
});
