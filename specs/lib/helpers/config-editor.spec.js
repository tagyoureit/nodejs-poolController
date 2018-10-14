var fs = require('fs'),
    // fsio = require('promised-io/fs'),
    path = require('path').posix,
    Promise = require('bluebird')
Promise.promisifyAll(fs)

describe('updates config.json variables', function () {
    context('when called with the internal function', function () {


        before(function () {


        })

        beforeEach(function () {

            return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config.pump.VS.json'})
                .then(function () {
                    // sinon = sinon.sinon.create()
                    loggers = setupLoggerStubOrSpy('stub', 'stub')

                })
                .delay(25)
        })

        afterEach(function () {
            return global.stopAllAsync()
        })

        after(function () {


        })

        // it('#gets version notification information', function(done) {
        // myModule.__with__({
        //     'bottle.container.settings.configurationFile': '/specs/assets/config/config.json'
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

        // it('#tests updateExternalPumpProgramAsync', function(done) {
        //     myModule.__with__({
        //         'bottle.container.settings.configurationFile': '/specs/assets/config/config.json'
        //
        //     })(function() {
        //         myModule(bottle.container).updateExternalPumpProgramAsync(1, 1, 500)
        //         setTimeout(function() {
        //             //need delay to allow for file to write to disk
        //             return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/config.json'), 'utf-8')
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


        // it('sets updateVersionNotificationAsync variables', function(done) {
        // verStub = sinon.stub(bottle.container.updateAvailable, 'getResultsAsync').returns({
        //     "version": "10.10.10",
        //     "tag_name": "v10.10.10"
        // })
        // myModule.__with__({
        //     //'dir': '/specs/assets',
        //     'bottle.container.settings.configurationFile': '/specs/assets/config/config.json'
        //
        // })(function() {
        //     return Promise.resolve()
        //         .then(function() {
        //             myModule(bottle.container).updateVersionNotificationAsync(true)
        //         })
        //         .delay(150)
        //         .then(function() {
        //             return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/config.json'), 'utf-8')
        //                 .then(function(changed) {
        //                     changed = JSON.parse(changed)
        //                     changed.notifications.version.remote.dismissUntilNextRemoteVersionBump.should.eq(true)
        //                 })
        //         })
        //         .then(function() {
        //             verStub.restore()
        //             done()
        //         })
        //         .catch(function(err) {
        //         /* istanbul ignore next */
        //             console.log('some error with updateVersionNotificationAsync:', err)
        //         })
        // })
        // })

        it('#gets pumpExternalProgram', function (done) {
            // bottle.container.settings.loadAsync('/specs/assets/config/config.json')
            //     .then(function () {
            bottle.container.settings.getPumpExternalProgramAsync(1)
            // })
                .then(function (data) {
                    data[1].should.eq(1000)
                })
                .then(done, done)


        })
    })
    context('when called with the Socket API', function () {
        describe('#updates config.json', function () {
            var scope
            before(function () {

                return Promise.resolve()
                    .then(function () {
                        scope = nock('https://api.github.com')
                            .get('/repos/tagyoureit/nodejs-poolController/releases/latest')
                            .replyWithFile(200, path.join(process.cwd(), '/specs/assets/webJsonReturns/gitLatestRelease4.1.0.json'))
                            .persist()
                        // .log(console.log)
                    })
                    //.then(global.initAllAsync)
                    .then(bottle.container.updateAvailable.initAsync('/specs/assets/package.json'))

            })

            beforeEach(function () {

                return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config_updateavail_410_dismissfalse.json'})
                    .then(function () {
                        loggers = setupLoggerStubOrSpy('stub', 'spy')
                    })

            })

            afterEach(function () {

                return Promise.resolve()
                    .then(function () {
                        nock.cleanAll()
                        sinon.restore()
                    })
                    .then(global.stopAllAsync)

            })

            after(function () {

            })

            it('#updates dismissUntilNextRemoteVersionBump to true', function (done) {

                // published release: 4.1.0
                // current version running: 4.1.0
                // cached remote release: 4.1.0
                // dismissUntilNextVerBump: false
                // expected result: local config.json file has dismissUntil... set to true

                var client = global.ioclient.connect(global.socketURL, global.socketOptions)
                client.on('connect', function (data) {
                    // need nested setTimout so we don't hit a read error on the JSON file
                    setTimeout(function () {
                        // console.log('connected client:')
                        client.emit('updateVersionNotificationAsync', true)
                        client.disconnect()
                        setTimeout(function () {
                            fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/config.json'), 'utf8')
                                .then(function (data) {
                                    JSON.parse(data).meta.notifications.version.remote.dismissUntilNextRemoteVersionBump.should.equal(true)

                                }).then(done, done)
                        }, 150)
                    }, 75)
                })
            });

        })


    })
})
