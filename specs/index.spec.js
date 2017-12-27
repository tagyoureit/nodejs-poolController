//var expect = require('chai').expect
//var nodejspentair = require('../index')
var Bottle = require('bottlejs')
var bottle = Bottle.pop('poolController-Bottle');

describe('nodejs-poolController', function() {



    describe('Loads/checks for a valid configuration file', function() {

        before(function() {

        })


        beforeEach(function() {
            sandbox = sinon.sandbox.create()
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

        afterEach(function() {
            //restore the sandbox after each function
            sandbox.restore()
            //console.log('afterEach')
        })

        after(function() {
            //console.log('after All')
            //return global.stopAllAsync()
        })

        it('#should load settings', function() {
            console.log('starting should load settings')
            return Promise.resolve()
                .then(bottle.container.settings.loadAsync)
                .then(function(res){
                    bottle.container.settings.get('intellitouch.installed').should.equal(0)
                })
        })

        it('#should load logger', function() {
            bottle.container.logger.init()
            bottle.container.logger.info("I can output to the console, woot!")
            bottle.container.logger.should.exist

        })


        it('#bottle should exist', function() {
            bottle.should.exist

        })

        it('#fails to load an invalid configuration file', function() {
            // stub exit so we don't... well, exit
            exitStub = sandbox.stub(global, 'exit_nodejs_poolController')
            // stub Error so we stub the invalid properties output
            loggerErrorStub.restore()
            loggerErrorStub = sandbox.stub(bottle.container.logger, 'error')

            return bottle.container.configEditor.initAsync('/specs/assets/config/templates/config.OUTDATED.json')
                .then(function(){
                    exitStub.callCount.should.equal(3)  // because we stub the exit, it will fire 3 times

                })
        })

        it('#loads/checks all instances of variables to store state', function() {
            //initialize variables to hold status
            return new Promise(function(resolve,reject){
                return bottle.container.settings.loadAsync()
                    .then(bottle.container.chlorinator.init)
                    .then(function(){
                        bottle.container.heat.init()
                        bottle.container.time.init()
                        bottle.container.pump.init()
                        bottle.container.schedule.init()
                        bottle.container.circuit.init()
                        bottle.container.customNames.init()
                        bottle.container.intellitouch.init()
                        bottle.container.temperatures.init()
                        bottle.container.UOM.init()
                        bottle.container.valves.init()
                    })
                    .then(resolve)
                    .catch(function(err){
                        reject(err)
                    })


            })

        })

        it('#loads/checks helper functions', function() {
            bottle.container.logger.init()
            bottle.container.winstonToIO.init()
            bottle.container.helpers
            bottle.container.integrations.init()
            bottle.container.settings.displayIntroMsg()
            bottle.container.settings.displaySettingsMsg()
            bottle.container.settings.getConfig()
            bottle.container.settings.set('myvalismissing')
        })


        it('#tests internal logDebug for debugging testing', function(){
            var priorLogInitAndStop = global.logInitAndStop
            return Promise.resolve()
                .then(function(){

                    changeInitAndStop(1)
                })
                .then(global.initAllAsync)
                .then(global.stopAllAsync)
                .then(global.useShadowConfigFileAsync('/specs/assets/config/templates/config_vanilla.json'))
                .then(global.removeShadowConfigFileAsync)
                .then(function(){
                    changeInitAndStop(priorLogInitAndStop)
                })

        })

        it('#throws an error with invalid config', function(){
            var priorLogInitAndStop = global.logInitAndStop
            return Promise.resolve()
                .then(function(){
                    changeInitAndStop(1)
                })
                .then(global.initAllAsync)
                .then(global.stopAllAsync)
                .then(global.useShadowConfigFileAsync('/specs/assets/config/templates/config_vanilla.json'))
                .then(global.removeShadowConfigFileAsync)
                .then(function(){
                    setupLoggerStubOrSpy('stub', 'stub')
                    consoleEStub = sandbox.stub(console, 'error')
                    consoleStub = sandbox.stub(console, 'log')
                })
                .then(global.removeShadowConfigFileAsync)  // should throw an error
                .then(global.useShadowConfigFileAsync('/specs/assets/config/templates/config_not_here.json'))
                .then(function(){
                    // console.log('loggerErrorStub.callCount', loggerErrorStub.callCount)
                    //loggerErrorStub.callCount.should.equal(2)
                    sandbox.restore()
                    changeInitAndStop(priorLogInitAndStop)
                })
                .catch(function(err){
                    console.log('we want an err here, trying to remove shadow config 2x.')
                    err.message.should.contain('does not exist')
                })

        })

    })

})
