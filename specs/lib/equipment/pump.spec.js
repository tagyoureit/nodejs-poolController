var fs = require('fs'),
    // fsio = require('promised-io/fs'),
    path = require('path').posix,
    Promise = require('bluebird')


Promise.promisifyAll(fs)

describe('pump controller', function() {
    before(function() {
        return global.initAll()
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
        return global.stopAll()
    })

    it('initializes the pump variables', function() {

        return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config', 'config.json'), 'utf8')
            .then(function(data) {
                return JSON.parse(data)
            })
            .then(function(config) {

                bottle.container.settings.set('pump',config.equipment.pump);
                bottle.container.pump.init()
                var pumpStatus = bottle.container.pump.getCurrentPumpStatus().pump
                pumpStatus[1].externalProgram[2].should.eq(2500)
                pumpStatus[2].externalProgram[3].should.eq(3450)
            })
    })

    it('initializes the pump variables with 16 pumps', function() {

        return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config', 'config_16_pumps.json'), 'utf8')
            .then(function(data) {
                return JSON.parse(data)
            })
            .then(function(config) {

                bottle.container.settings.set('pump', config.equipment.pump);
                bottle.container.pump.init()

                var pumpStatus = bottle.container.pump.getCurrentPumpStatus().pump
                pumpStatus[1].externalProgram[2].should.eq(2500)
                pumpStatus[2].externalProgram[3].should.eq(3450)
                pumpStatus[16].pump.should.eq(16)
                pumpStatus[16].name.should.eq('Pump 16')
            })
    })


})
