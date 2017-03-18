var Promise = require('bluebird')

describe('checks if there is a newer version available', function() {


    describe('#by talking (stubbing) to Git', function() {
        context('compares local version to latest published release', function() {

            before(function() {
                bottle.container.logger.transports.console.level = 'silly';
                bottle.container.server.init()
                bottle.container.io.init()
            });

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                //clock = sandbox.useFakeTimers()
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
                socketIOSpy = sandbox.stub(bottle.container.io, 'emitToClients')
            })

            afterEach(function() {
                sandbox.restore()

            })

            after(function() {
                bottle.container.logger.transports.console.level = 'info'
                bottle.container.server.close()
            })

            it('#notifies of a new release available (remote > local)', function(done) {
                this.timeout(5000)
                var scope = nock('https://api.github.com')
                    .get('/repos/tagyoureit/nodejs-poolController/releases/latest')
                    .replyWithFile(200, path.join(process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease4.1.200.json'))

                //need to use rewire so variables are not already set
                var myModule = rewire(path.join(process.cwd(), '/src/lib/helpers/update-available.js'))
                myModule.__with__({
                    'location': path.join(process.cwd(), '/specs/assets/package.json')
                })(function() {
                    myModule(bottle.container).check()
                        .then(function() {
                            loggerWarnStub.args[0][0].should.contain('Update available!')
                            done()
                        })
                })
            })

            it('#returns with equal versions', function(done) {
                this.timeout(5000)
                var scope = nock('https://api.github.com')
                    .get('/repos/tagyoureit/nodejs-poolController/releases/latest')
                    .replyWithFile(200, path.join(process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease4.1.0.json'))

                //need to use rewire so variables are not already set
                var myModule = rewire(path.join(process.cwd(), '/src/lib/helpers/update-available.js'))
                myModule.__with__({
                    'location': path.join(process.cwd(), '/specs/assets/package.json')
                })(function() {
                    myModule(bottle.container).check()
                        .then(function() {
                            loggerInfoStub.args[0][0].should.contain('is the same as the')
                            done()
                        })
                })
            })

            it('#returns with newer version running locally (newer < remote)', function(done) {
                this.timeout(5000)
                var scope = nock('https://api.github.com')
                    .get('/repos/tagyoureit/nodejs-poolController/releases/latest')
                    .replyWithFile(200, path.join(process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease4.0.0.json'))

                //need to use rewire so variables are not already set
                var myModule = rewire(path.join(process.cwd(), '/src/lib/helpers/update-available.js'))
                myModule.__with__({
                    'location': path.join(process.cwd(), '/specs/assets/package.json')
                })(function() {
                    myModule(bottle.container).check()
                        .then(function() {
                            loggerInfoStub.args[0][0].should.contain('You are running a newer release')
                            done()
                        })
                })
            })

            it('#sends updateAvailable with no data with dismissUntilNextRemoteVersionBump false', function(done) {

                var scope = nock('https://api.github.com')
                    .get('/repos/tagyoureit/nodejs-poolController/releases/latest')
                    .replyWithFile(200, path.join(process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease4.1.200.json'))
                var getVersionNotification = sandbox.stub(bottle.container.configEditor, 'getVersionNotification').returns({"version":"0.0.0","tag_name":"v0.0.0","dismissUntilNextRemoteVersionBump":true})

                var client = global.ioclient.connect(global.socketURL, global.socketOptions)

                client.on('connect', function(data) {
                  bottle.container.io.emitToClients('updateAvailable')

                    client.on('updateAvailable', function(msg) {
                        console.log('updateAvailable', msg)
                        'i should not'.should.not.equal('be called')
                        client.disconnect()
                        done()
                    })
                })
                //if the above isn't called in 1.5 seconds, test passes.  Is there a better way to see if the socket was NOT called?
                setTimeout(done, 1500)
            })

        })
    })
})
