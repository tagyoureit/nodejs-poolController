describe('pump controller initialized', function() {
    before(function () {
        return global.initAllAsync()
    });

    beforeEach(function () {
        sandbox = sinon.sandbox.create()
        loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
        loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
        loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
        loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
        loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
        loggerErrorStub = sandbox.spy(bottle.container.logger, 'error')
    })

    afterEach(function () {
        sandbox.restore()
    })

    after(function () {
        return global.stopAllAsync()
    })

    it('initializes the pump variables', function () {
        var pumpStatus = bottle.container.pump.getCurrentPumpStatus().pump
        pumpStatus[1].externalProgram[2].should.eq(2500)
        pumpStatus[2].externalProgram[3].should.eq(3450)
    })
})

describe('pump controller initializes with 16 pumps', function() {

    before(function() {
        return global.useShadowConfigFileAsync('/specs/assets/config/templates/config_16_pumps.json')
            .then(global.initAllAsync)
    });

    beforeEach(function() {
        sandbox = sinon.sandbox.create()
        clock = sandbox.useFakeTimers()
        loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
        loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
        loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
        loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
        loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
        ioStub = sandbox.stub(bottle.container.io, 'emitToClients')
    })

    afterEach(function() {
        sandbox.restore()
    })

    after(function() {
        return global.removeShadowConfigFileAsync()
            .then(global.stopAllAsync)
    })
    it('initializes the pump variables with 16 pumps', function() {
        var pumpStatus = bottle.container.pump.getCurrentPumpStatus().pump
        pumpStatus[1].externalProgram[2].should.eq(2500)
        pumpStatus[2].externalProgram[3].should.eq(3450)
        pumpStatus[16].pump.should.eq(16)
        pumpStatus[16].name.should.eq('Pump 16')
    })
})
