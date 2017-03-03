var fs = require('fs'),
    // fsio = require('promised-io/fs'),
    path = require('path').posix,
    Promise = require('bluebird')


Promise.promisifyAll(fs)

describe('pump controller', function() {

    describe('#', function() {

        before(function() {
            bottle.container.logger.transports.console.level = 'silly';
            bottle.container.logPumpMessages = 1
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
            bottle.container.logPumpMessages = 0
        })

        it('initializes the pump variables', function() {

            return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/', 'config.json'), 'utf8')
                .then(function(data) {
                    return JSON.parse(data)
                })
                .then(function(config) {

                    bottle.container.settings.pump = config.equipment.pump;
                    bottle.container.pump.init()
                    var pumpStatus = bottle.container.pump.getCurrentPumpStatus()
                    pumpStatus[1].programRPM[2].should.eq(2500)
                    pumpStatus[2].programRPM[3].should.eq(3450)

                })

        });
    })


})
