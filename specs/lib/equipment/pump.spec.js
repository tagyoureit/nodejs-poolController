var fs = require('fs'),
    // fsio = require('promised-io/fs'),
    path = require('path').posix,
    Promise = require('bluebird')
    var myModule = rewire(path.join(process.cwd(), '/src/lib/equipment/pump.js'))

Promise.promisifyAll(fs)

describe('pump controller', function() {

    describe('#sets the friendlyNames', function() {

      before(function() {
          bottle.container.logger.transports.console.level = 'silly';
      });

      beforeEach(function() {
          sandbox = sinon.sandbox.create()
          clock = sandbox.useFakeTimers()
          loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
          loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
          loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
          loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
          loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
          ioStub = sandbox.stub(bottle.container.io, 'emitToClients')
        })

        afterEach(function() {
            sandbox.restore()
        })

        after(function() {
            bottle.container.logger.transports.console.level = 'info'
        })

        it('initializes the pump variables', function() {

            return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/', 'config.json'), 'utf8')
            .then(function(data){
                return JSON.parse(data)
            })
            .then(function(config){
              myModule.__with__({
                  'bottle.container.settings.pump': config.equipment.pump
              })(function() {
console.log('ps0', myModule(bottle.container).getCurrentPumpStatus())
                  myModule(bottle.container).init()

                  var pumpStatus = myModule(bottle.container).getCurrentPumpStatus()
                  console.log('ps1', pumpStatus)
                  pumpStatus[1].Pump.programRPM[2].should.eq(2500)
                  pumpStatus[2].Pump.programRPM[3].should.eq(3450)
              })
            })




        });
    })


})
