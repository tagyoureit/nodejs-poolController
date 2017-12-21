var fs = require('fs'),
    // fsio = require('promised-io/fs'),
    path = require('path').posix,
    Promise = require('bluebird')
Promise.promisifyAll(fs)

describe('updates config.json variables', function() {
    context('when called with the internal function', function () {


        before(function () {
            return global.initAllAsync()
                .then(console.log('done with before'))

        })

        beforeEach(function () {

            return global.useShadowConfigFileAsync('/specs/assets/config/templates/config_vanilla.json')
                .then(function(){
                    console.log('in beforeeach')
                    // sandbox = sinon.sandbox.create()
                    loggers = setupLoggerStubOrSpy('stub', 'spy')
                })
        })

        afterEach(function () {

            return Promise.resolve()
                .then(function(){
                    console.log('befor sandbx restro')
                    sandbox.restore()
                    console.log('after sandbox restore')

                })
                .then(global.removeShadowConfigFileAsync)
                .then(console.log('don with afterEach'))
                .catch(function(err){
                    console.log(err)
                })
        })

        after(function () {
            return global.stopAllAsync()

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

        // it('#tests updateExternalPumpProgramAsync', function(done) {
        //     myModule.__with__({
        //         'bottle.container.settings.configurationFile': '/specs/assets/config/_config.json'
        //
        //     })(function() {
        //         myModule(bottle.container).updateExternalPumpProgramAsync(1, 1, 500)
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


        // it('sets updateVersionNotificationAsync variables', function(done) {
        // verStub = sandbox.stub(bottle.container.updateAvailable, 'getResultsAsync').returns({
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
        //             myModule(bottle.container).updateVersionNotificationAsync(true)
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
        //             console.log('some error with updateVersionNotificationAsync:', err)
        //         })
        // })
        // })

        it('#gets pumpExternalProgram', function (done) {
            bottle.container.configEditor.initAsync('/specs/assets/config/_config.json')
                .then(function () {
                    return bottle.container.configEditor.getPumpExternalProgramAsync(1)
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
                return global.initAllAsync()
            })

            beforeEach(function () {

                return global.useShadowConfigFileAsync('/specs/assets/config/templates/config_vanilla.json')
                    .then(function(){
                        // sandbox = sinon.sandbox.create()
                        loggers = setupLoggerStubOrSpy('stub', 'spy')
                        ceStub = sandbox.stub(bottle.container.configEditor, 'updateVersionNotificationAsync')
                    })

            })

            afterEach(function () {

                return Promise.resolve()
                    .then(function(){
                        sandbox.restore()
                    })
                    .then(global.removeShadowConfigFileAsync)

            })

            after(function () {
                return global.stopAllAsync()
            })

            it('#updates dismissUntilNextRemoteVersionBump to true', function (done) {
                /* NOTE: best we can do here is make sure the function is called...
                  no good way I know of to rewire the internal variables if not calling the function directly.
                  So long as we test the function above, this should be sufficient.
                  */
                var client = global.ioclient.connect(global.socketURL, global.socketOptions)
                client.on('connect', function (data) {
                    // console.log('connected client:')
                    client.emit('updateVersionNotificationAsync', true)
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
