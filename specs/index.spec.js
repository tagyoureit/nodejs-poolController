//var expect = require('chai').expect
//var nodejspentair = require('../index')
var Bottle = require('bottlejs')
var bottle = Bottle.pop('poolController-Bottle');


describe('nodejs-poolController', function () {


    describe('Loads/checks for a valid configuration file', function () {

        before(function () {

        })


        beforeEach(function () {

            updateAvailStub = sandbox.stub(bottle.container.updateAvailable, 'getResultsAsync').returns(Promise.resolve({}))
            if (global.logInitAndStop) {
                loggerInfoStub = sandbox.spy(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.spy(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.spy(bottle.container.logger, 'debug')
                loggerErrorStub = sandbox.spy(bottle.container.logger, 'error')
                loggerSillyStub = sandbox.spy(bottle.container.logger, 'silly')
            }
            else {
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerErrorStub = sandbox.stub(bottle.container.logger, 'error')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
                consoleStub = sandbox.stub(console, 'error')

            }
        })

        afterEach(function () {
            //restore the sandbox after each function
            sandbox.restore()
            //console.log('afterEach')
        })

        after(function () {
            //console.log('after All')
            return global.stopAllAsync()
        })

        it('#should load settings', function () {

                return bottle.container.settings.loadAsync('./specs/assets/config/config.json')
                .then(function () {
                    bottle.container.settings.get('intellitouch.installed').should.equal(1)
                })

        })

        it('#should load logger', function () {
            bottle.container.logger.init()
            bottle.container.logger.info("I can output to the console, woot!")
            bottle.container.logger.should.exist

        })


        it('#bottle should exist', function () {
            bottle.should.exist

        })

        // it('#loads/checks all instances of variables to store state', function () {
        //     //initialize variables to hold status
        //     return new Promise(function (resolve, reject) {
        //         return bottle.container.settings.loadAsync()
        //             .then(bottle.container.chlorinator.init)
        //             .then(function () {
        //                 bottle.container.heat.init()
        //                 bottle.container.time.init()
        //                 bottle.container.pump.init()
        //                 bottle.container.schedule.init()
        //                 bottle.container.circuit.init()
        //                 bottle.container.customNames.init()
        //                 bottle.container.intellitouch.init()
        //                 bottle.container.temperatures.init()
        //                 bottle.container.UOM.init()
        //                 bottle.container.valves.init()
        //             })
        //             .then(resolve)
        //             .catch(function (err) {
        //                 reject(err)
        //             })
        //
        //
        //     })
        //
        // })

        it('#loads/checks helper functions', function () {
            bottle.container.logger.init()
            bottle.container.winstonToIO.init()
            bottle.container.helpers

            bottle.container.settings.displayIntroMsg()
            bottle.container.settings.displaySettingsMsg()
            bottle.container.settings.getConfig()
            bottle.container.settings.set('myvalismissing')
            bottle.container.integrations.init()
        })


        it('#throws an error with invalid config', function () {
            var priorLogInitAndStop = global.logInitAndStop
            return Promise.resolve()
                .then(function () {
                    global.logInitAndStop = 0
                    sandbox.restore()
                    setupLoggerStubOrSpy('stub', 'stub')
                    consoleEStub = sandbox.stub(console, 'error')
                    consoleStub = sandbox.stub(console, 'log')
                })

                .then(global.initAllAsync('/specs/assets/config/templates/config_not_here.json'))

                .catch(function (err) {
                    err.message.should.contain('does not exist')
                })
                .finally(function () {
                    // console.log('loggerErrorStub.callCount', loggerErrorStub.callCount)
                    //loggerErrorStub.callCount.should.equal(2)
                    sandbox.restore()
                    global.logInitAndStop = priorLogInitAndStop
                })
        })

    })

})


