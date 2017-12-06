var fs = require('fs'),
    // fsio = require('promised-io/fs'),
    path = require('path').posix,
    Promise = require('bluebird')
Promise.promisifyAll(fs)

describe('updates config.json variables', function() {
    context('when called with the internal function', function () {


        before(function () {
            return global.initAll()

        })

        beforeEach(function () {
            sandbox = sinon.sandbox.create()
            loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
            loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
            loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
            loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
            loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
            return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/config.json'))
                .then(function (orig) {
                    return fs.writeFileAsync(path.join(process.cwd(), '/specs/assets/config/_config.json'), orig)
                })
                // .then(function() {
                //     return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/_config.json'), 'utf-8')
                // })
                // .then(function(copy) {
                //     console.log('just copied _', copy)
                // })
                .catch(function (err) {
                    /* istanbul ignore next */
                    console.log('oops, we hit an error', err)
                })
        })

        afterEach(function () {
            sandbox.restore()
            return Promise.resolve()
                .then(function () {
                    return fs.unlinkAsync(path.join(process.cwd(), '/specs/assets/config/_config.json'))
                })
                // .then(function() {
                //     console.log('file removed')
                // })
                .catch(function (err) {
                    /* istanbul ignore next */
                    console.log('Error removing file:', err)
                })
        })

        after(function () {
            return global.stopAll()

        })

        // it('#gets version notification information', function(done) {
        // myModule.__with__({
        //     'bottle.container.settings.configurationFile': '/specs/assets/config/_config.json'
        //
        // })(function() {
        //     return Promise.resolve()
        //         .then(function() {
        //             return myModule(bottle.container).getVersionNotification()
        //         })
        //         .then(function(data) {
        //             data.tag_name.should.eq('v3.1.13')
        //             done()
        //         })
        //         .catch(function(err) {
        //         /* istanbul ignore next */
        //             console.log('error with getting version notification:', err)
        //         })
        //
        // })
        // });

        // it('#tests updateExternalPumpProgram', function(done) {
        //     myModule.__with__({
        //         'bottle.container.settings.configurationFile': '/specs/assets/config/_config.json'
        //
        //     })(function() {
        //         myModule(bottle.container).updateExternalPumpProgram(1, 1, 500)
        //         setTimeout(function() {
        //             //need delay to allow for file to write to disk
        //             return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/_config.json'), 'utf-8')
        //                 .then(function(changed) {
        //                     changed = JSON.parse(changed)
        //                     changed.equipment.pump[1].externalProgram[1].should.eq(500)
        //                     done()
        //                 })
        //
        //         }, 150)
        //
        //     })
        // });


        // it('sets updateVersionNotification variables', function(done) {
        // verStub = sandbox.stub(bottle.container.updateAvailable, 'getResults').returns({
        //     "version": "10.10.10",
        //     "tag_name": "v10.10.10"
        // })
        // myModule.__with__({
        //     //'dir': '/specs/assets',
        //     'bottle.container.settings.configurationFile': '/specs/assets/config/_config.json'
        //
        // })(function() {
        //     return Promise.resolve()
        //         .then(function() {
        //             myModule(bottle.container).updateVersionNotification(true)
        //         })
        //         .delay(150)
        //         .then(function() {
        //             return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/_config.json'), 'utf-8')
        //                 .then(function(changed) {
        //                     changed = JSON.parse(changed)
        //                     changed.poolController.notifications.version.remote.dismissUntilNextRemoteVersionBump.should.eq(true)
        //                 })
        //         })
        //         .then(function() {
        //             verStub.restore()
        //             done()
        //         })
        //         .catch(function(err) {
        //         /* istanbul ignore next */
        //             console.log('some error with updateVersionNotification:', err)
        //         })
        // })
        // })

        it('#gets pumpExternalProgram', function (done) {
            bottle.container.configEditor.init('/specs/assets/config/config.json')
                .then(function () {
                    return bottle.container.configEditor.getPumpExternalProgram(1)
                })
                .then(function (data) {
                    data[1].should.eq(1000)
                })
                .then(done, done)


        })
    })
    context('when called with the Socket API', function () {
        describe('#updates config.json', function () {

            before(function () {
                return global.initAll()
                // bottle.container.logger.transports.console.level = 'silly';
                //
                // bottle.container.server.init()
                // bottle.container.io.init()
            })

            beforeEach(function () {
                sandbox = sinon.sandbox.create()
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
                ceStub = sandbox.stub(bottle.container.configEditor, 'updateVersionNotification')
                return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/config.json'))
                    .then(function (orig) {
                        return fs.writeFileAsync(path.join(process.cwd(), '/specs/assets/config/_config.json'), orig)
                    })
                    .catch(function (err) {
                        /* istanbul ignore next */
                        console.log('oops, we hit an error', err)
                    })

            })

            afterEach(function () {
                sandbox.restore()
                return fs.unlinkAsync(path.join(process.cwd(), '/specs/assets/config/_config.json'))

            })

            after(function () {
                // bottle.container.server.close()
                // bottle.container.logger.transports.console.level = 'info';
                return global.stopAll()
            })

            it('#updates dismissUntilNextRemoteVersionBump to true', function (done) {
                /* NOTE: best we can do here is make sure the function is called...
                  no good way I know of to rewire the internal variables if not calling the function directly.
                  So long as we test the function above, this should be sufficient.
                  */
                var client = global.ioclient.connect(global.socketURL, global.socketOptions)
                client.on('connect', function (data) {
                    // console.log('connected client:')
                    client.emit('updateVersionNotification', true)
                    client.disconnect()
                    setTimeout(function () {
                        ceStub.callCount.should.eq(1)
                        ceStub.args[0][0].should.deep.eq(true)
                        done()
                    }, 75)
                })
            });

        })


    })
})
