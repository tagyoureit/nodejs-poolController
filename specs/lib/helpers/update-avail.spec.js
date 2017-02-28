describe('checks if there is a newer version available', function() {


    describe('#by talking to Git', function() {
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
                socketIOSpy = sandbox.spy(bottle.container.io, 'emitToClients')
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
                    .replyWithFile(200, path.join(process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease.json'))

                //need to use rewire so variables are not already set
                var myModule = rewire(path.join(process.cwd(), '/src/lib/helpers/update-available.js'))
                var Deferred = require("promised-io/promise").Deferred;
                var deferred = new Deferred();
                fsStub = sandbox.stub(fs, 'readFile').returns(deferred.promise)

                myModule(bottle.container).check()
                var packageJsons = {
                    "name": "nodejs-poolcontroller",
                    "version": "3.1.12"
                }
                deferred.resolve(packageJsons)
                setTimeout(function() {
                    loggerWarnStub.args[0][0].should.contain('Update available!')
                    done()
                }, 300)
            })

            it('#returns with equal versions', function(done) {
                this.timeout(5000)
                var scope = nock('https://api.github.com')
                    .get('/repos/tagyoureit/nodejs-poolController/releases/latest')
                    .replyWithFile(200, path.join(process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease.json'))

                //need to use rewire so variables are not already set
                var myModule = rewire(path.join(process.cwd(), '/src/lib/helpers/update-available.js'))
                var Deferred = require("promised-io/promise").Deferred;
                var deferred = new Deferred();
                fsStub = sandbox.stub(fs, 'readFile').returns(deferred.promise)

                myModule(bottle.container).check()
                var packageJsons = {
                    "name": "nodejs-poolcontroller",
                    "version": "3.1.200"
                }
                deferred.resolve(packageJsons)
                setTimeout(function() {
                    loggerInfoStub.args[0][0].should.contain('is the same as the')
                    done()
                }, 300)




            })

            it('#returns with newer version running locally (newer < remote)', function(done) {
                this.timeout(5000)
                var scope = nock('https://api.github.com')
                    .get('/repos/tagyoureit/nodejs-poolController/releases/latest')
                    .replyWithFile(200, path.join(process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease.json'))

                //need to use rewire so variables are not already set
                var myModule = rewire(path.join(process.cwd(), '/src/lib/helpers/update-available.js'))
                var Deferred = require("promised-io/promise").Deferred;
                var deferred = new Deferred();
                fsStub = sandbox.stub(fs, 'readFile').returns(deferred.promise)

                myModule(bottle.container).check()
                var packageJsons = {
                    "name": "nodejs-poolcontroller",
                    "version": "3.1.400"
                }
                deferred.resolve(packageJsons)
                setTimeout(function() {
                    loggerInfoStub.args[0][0].should.contain('You are running a newer release')

                    done()
                }, 300)

            })
        })
    })
})
