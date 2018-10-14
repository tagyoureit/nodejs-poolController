/*
describe('Tests the code that captures packets and a full log for troubleshooting', function () {
    var data = [
        Buffer.from([255, 0, 255, 165, 33, 15, 16, 2, 29, 12, 41, 32, 0, 0, 0, 0, 0, 0, 0, 3, 0, 64, 4, 60, 60, 0, 0, 62, 71, 0, 0, 0, 0, 0, 74, 142, 0, 13, 3, 130])
    ]

    var equip = 'controller'

    describe('#When packets arrive', function () {
        context('via serialport or Socat', function () {

            before(function () {
                return global.initAllAsync()
                    .then(bottle.container.settings.loadAsync(0, 0, true))
                    .then(bottle.container.logger.init())
            });

            beforeEach(function () {
                loggers = setupLoggerStubOrSpy('spy', 'spy')
                getControllerConfigurationStub = sinon.stub(bottle.container.intellitouch, 'getControllerConfiguration')

            })

            afterEach(function () {
                sinon.restore()

            })

            after(function () {
                global.stopAllAsync()
            })

            it('#Processes a controller status packet', function () {
               return Promise.resolve()
                    .then(function () {
                        return bottle.container.packetBuffer.push(data[0])
                    })
                    .delay(50)
                    .then(
                        function () {
                            bottle.container.temperatures.getTemperatures().temperature.airTemp.should.equal(62)
                            bottle.container.time.getTime().time.controllerTime.should.equal('12:41 PM')
                        })

            })

            it('#Processes a Duplicate Broadcast controller status packet', function (done) {
                Promise.resolve()
                    .then(function () {
                        return bottle.container.packetBuffer.push(data[0])
                    })
                    .then(function () {
                        return bottle.container.packetBuffer.push(data[0])
                    })
                    .delay(50)
                    .then(
                        function () {
                            bottle.container.temperatures.getTemperatures().temperature.airTemp.should.equal(62)
                            bottle.container.time.getTime().time.controllerTime.should.equal('12:41 PM')
                            var text = 'not found'
                            // iterate through debug statements to see if we find 'duplicate broadcast
                            loggers.loggerDebugStub.args.forEach(function (i) {
                                i.forEach(function (j) {
                                    if (typeof j === 'string') {
                                        if (j.includes('Duplicate broadcast')) {
                                            text = 'found'
                                        }
                                    }
                                })
                            })
                            text.should.eq('found')
                            // loggers.loggerDebugStub.args[4][0].should.contain('Duplicate broadcast.')

                        })
                    .then(done, done)
            })

        })
    })
})
*/
