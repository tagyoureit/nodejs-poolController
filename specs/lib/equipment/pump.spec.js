describe('pump controller initialized', function() {
    before(function () {
        return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config.pump.VS.json'})


    });

    beforeEach(function () {
        loggers = setupLoggerStubOrSpy('stub', 'stub')
    })

    afterEach(function () {
        // sinon.restore()
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
        return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config_16_pumps.json'})
    });

    beforeEach(function() {
        loggers = setupLoggerStubOrSpy('spy', 'spy')

        ioStub = sinon.stub(bottle.container.io, 'emitToClients')
    })

    afterEach(function() {
        sinon.restore()
    })

    after(function() {
        return global.stopAllAsync()
    })
    it('initializes the pump variables with 16 pumps', function() {
        return Promise.resolve()
            .delay(100)
            .then(function(){
                var pumpStatus = bottle.container.pump.getCurrentPumpStatus().pump
                // console.log('pumpStatus: %j', pumpStatus)
                pumpStatus[1].externalProgram[2].should.eq(2500)
                pumpStatus[2].externalProgram[3].should.eq(3450)
                pumpStatus[16].pump.should.eq(16)
                pumpStatus[16].name.should.eq('Pump 16')
            })
    })
})
