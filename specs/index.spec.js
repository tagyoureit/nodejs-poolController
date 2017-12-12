//var expect = require('chai').expect
//var nodejspentair = require('../index')
var Bottle = require('bottlejs')
var bottle = Bottle.pop('poolController-Bottle');

describe('nodejs-poolController', function() {



    describe('Loads/checks for a valid configuration file', function() {

        before(function() {


            //    bottle.container.settings.load()
            //         bottle.container.logger.init()
            // return global.initAll()

        })


        beforeEach(function() {
            sandbox = sinon.sandbox.create()
            loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
            loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
            loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
            loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
            loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
            loggerErrorStub = sandbox.spy(bottle.container.logger, 'error')
            updateAvailStub = sandbox.stub(bottle.container.updateAvailable, 'getResults').returns({})

        })

        afterEach(function() {
            //restore the sandbox after each function
            sandbox.restore()
        })

        after(function() {
            return global.stopAll()
                // .then(global.removeShadowConfigFile)
                .finally(function(){
                    console.log('Finished Index.spec.js')
                })
        })

        it('#should load settings', function() {
            console.log('starting should load settings')
            return Promise.resolve()
                .then(bottle.container.settings.load)
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

            return bottle.container.configEditor.init('/specs/assets/config/templates/config.OUTDATED.json')
                .then(function(){
                    exitStub.callCount.should.equal(3)  // because we stub the exit, it will fire 3 times

                })
        })

        it('#loads/checks all instances of variables to store state', function() {
            //initialize variables to hold status
            return new Promise(function(resolve,reject){
                return bottle.container.settings.load()
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
        })



    })

})
