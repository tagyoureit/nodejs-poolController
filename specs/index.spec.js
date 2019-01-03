//var expect = require('chai').expect
//var nodejspentair = require('../index')
var Bottle = require('bottlejs')
var bottle = Bottle.pop('poolController-Bottle');


describe('nodejs-poolController', function () {


    describe('Loads/checks for a valid configuration file', function () {

        before(function () {
            // initialize winston once with defaults
            return Promise.resolve()
            .then(function(){
                bottle.container.logger.init()
            })
            .delay(50)
            .then(function(){
                console.log("done")
                bottle.container.logger.info("test logger")
                bottle.container.logger.warn("test warn")
                bottle.container.logger.error("test error")
            })
        })


        beforeEach(function () {
            
            updateAvailStub = sinon.stub(bottle.container.updateAvailable, 'getResultsAsync').returns(Promise.resolve({}))
            if (global.logInitAndStop) {
                loggerInfoStub = sinon.spy(bottle.container.logger, 'info')
                loggerWarnStub = sinon.spy(bottle.container.logger, 'warn')
                loggerVerboseStub = sinon.spy(bottle.container.logger, 'verbose')
                loggerDebugStub = sinon.spy(bottle.container.logger, 'debug')
                loggerErrorStub = sinon.spy(bottle.container.logger, 'error')
                loggerSillyStub = sinon.spy(bottle.container.logger, 'silly')
            }
            else {
                loggerInfoStub = sinon.stub(bottle.container.logger, 'info')
                loggerWarnStub = sinon.stub(bottle.container.logger, 'warn')
                loggerVerboseStub = sinon.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sinon.stub(bottle.container.logger, 'debug')
                loggerErrorStub = sinon.stub(bottle.container.logger, 'error')
                loggerSillyStub = sinon.stub(bottle.container.logger, 'silly')
                //consoleStub = sinon.stub(console, 'error')

            }
        })

        afterEach(function () {
            sinon.restore()
        })

        after(function () {
            //console.log('after All')
            return global.stopAllAsync()
        })

        it('#should load settings', function () {

                return bottle.container.settings.loadAsync({"configLocation":'./specs/assets/config/config.json'})
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
        //                 bottle.container.valve.init()
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

        it('#loads/checks helper functions', function (done) {
            bottle.container.logger.init()
            bottle.container.winstonToIO.init()
            bottle.container.helpers

            // bottle.container.settings.displayIntroMsg()
            bottle.container.settings.displaySettingsMsg()
            bottle.container.settings.getConfig()
            bottle.container.settings.set('myvalismissing')
            bottle.container.integrations.init()
            setTimeout(function(){
                done()
            }, 300)
        })


        it('#throws an error with invalid config', function () {
            var priorLogInitAndStop = global.logInitAndStop
            return Promise.resolve()
                .then(function () {
                    global.logInitAndStop = 0
                    return global.initAllAsync({'configLocation':'/specs/assets/config/templates/config_not_here.json'})
                })
                .then(function(){
                    sinon.assert.fail('Should not get here')
                })
                .catch(function (err) {
                    sinon.assert.pass()
                })
                .finally(function () {
                    global.logInitAndStop = priorLogInitAndStop
                })
        })

    })

})


