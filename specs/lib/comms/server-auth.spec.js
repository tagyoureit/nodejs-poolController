var protocol = 'http://'
var server = 'localhost:3000/'

var sandbox,
    user = '',
    password = ''


describe('server', function() {
    describe('#with authorization', function() {

        context('by a URL', function() {
            before(function() {

                //stop the express server and restart with authentication
                bottle.container.settings.expressAuth = 1
                bottle.container.settings.expressAuthFile = '/specs/assets/server/users.htpasswd'
                bottle.container.settings.expressDir = '/bootstrap'
                // bottle.container.server.close()
                bottle.container.server.init()
                bottle.container.logger.transports.console.level = 'silly';
            })

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
            })

            afterEach(function() {
                sandbox.restore()
            })

            after(function() {
                //stop the express server and restart without authentication
                bottle.container.settings.expressAuth = 0
                bottle.container.settings.expressAuthFile = ''
                bottle.container.server.close()
                bottle.container.logger.transports.console.level = 'info';
                // bottle.container.server.init()
            })

            it('fails with no authorization provided', function(done) {
                var options = {
                    method: 'GET',
                    uri: protocol + server + 'pump',
                    resolveWithFullResponse: true,
                    json: true,
                };
                var promise = global.rp(options)

                promise

                    .then(
                        /* istanbul ignore next */
                        function(res) {
                            // console.log('1:', res.statusCode)
                            res.statusCode.should.not.eq(200)
                        }).catch(function(error) {
                        // console.log('2:', error)
                        error.statusCode.should.eq(401)
                        done()
                    });

            });

            it('authorizes a known user', function(done) {
                user = 'user'
                password = 'password'

                var options = {
                    method: 'GET',
                    uri: protocol + user + ':' + password + '@' + server + 'pump',
                    resolveWithFullResponse: true,
                    json: true,
                };
                var promise = global.rp(options)

                promise.then(function(res) {
                    res.statusCode.should.eq(200)
                    res.statusMessage.should.eq('OK')
                    done()
                });

            });

            it('fails to authorize an unknown user ', function(done) {
                user = 'mr'
                password = 'hacker'

                var options = {
                    method: 'GET',
                    uri: protocol + user + ':' + password + '@' + server + 'pump',
                    resolveWithFullResponse: true,
                    json: true,
                };
                var promise = global.rp(options)
                // console.log('htaccess file: ', bottle.container.settings.expressAuthFile)
                promise.then(
                    /* istanbul ignore next */
                    function(res) {
                        // console.log('1:', res.statusCode)
                        res.statusCode.should.not.eq(200)
                    }).catch(function(error) {
                    // console.log('2:', error)
                    error.statusCode.should.eq(401)
                    done()
                });

            });



        });

    });
});
