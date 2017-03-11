//var expect = require('chai').expect
//var nodejspentair = require('../index')
var Bottle = require('bottlejs')
var bottle = Bottle.pop('poolController-Bottle');

describe('nodejs-poolController', function() {



    describe('Loads/checks for a valid configuration file', function() {

      before(function() {
                    bottle.container.settings.load()
          bottle.container.server.init()
          bottle.container.io.init()
          bottle.container.logger.transports.console.level = 'silly';
      });

      beforeEach(function() {
          sandbox = sinon.sandbox.create()
          loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
          loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
          loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
          loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
          loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
          updateAvailStub = sandbox.stub(bottle.container.updateAvailable, 'getResults').returns({})

      })

      afterEach(function() {
          //restore the sandbox after each function
          sandbox.restore()
      })

      after(function() {
          bottle.container.time.init()
          bottle.container.server.close()
          bottle.container.logger.transports.console.level = 'info';
      })

        it('#loads a valid file', function() {
            var processStub = sinon.stub(process, 'exit')
            bottle.container.settings.load()
            processStub.restore()
        })

        it('#bottle should exist', function() {
            bottle.should.exist

        })

        it('#should load logger', function() {
            bottle.container.logger.should.exist

        })

        it('#fails to load an invalid configuration file', function(done) {
            var myModule = rewire(path.join(process.cwd(), '/src/etc/settings.js'))
            myModule.__with__({
                'envParam': path.join(process.cwd(),'./specs/assets/config/config.OUTDATED.json')
            })(function() {
                var stub = sinon.spy(myModule, 'load')
                try {
                    myModule.load()
                } catch (e) {

                }
                stub.threw().should.equal.true
                stub.restore()
                done()

            })
        })

        it('#loads/checks all instances of variables to store state', function() {
            //initialize variables to hold status
            bottle.container.chlorinator.init()
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

        it('#loads/checks helper functions', function() {
            bottle.container.winstonToIO.init()
            bottle.container.helpers
            bottle.container.integrations.init()
            bottle.container.logger.info('Intro: ', bottle.container.settings.displayIntroMsg())
            bottle.container.logger.warn('Settings: ', bottle.container.settings.displaySettingsMsg())
        })

    })

})
