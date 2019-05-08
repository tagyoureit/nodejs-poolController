// TODO: implement these

/*
describe('Tests the code that captures packets and a full log for troubleshooting', function () {
    var data = [
        Buffer.from([255, 0, 255, 165, 33, 15, 16, 2, 29, 12, 41, 32, 0, 0, 0, 0, 0, 0, 0, 3, 0, 64, 4, 60, 60, 0, 0, 62, 71, 0, 0, 0, 0, 0, 74, 142, 0, 13, 3, 130])
    ]

    var equip = 'controller'

    describe('#When packets arrive', function () {
        context('via serialport or Socat', function () {

            before(async function () {
                await globalAny.initAllAsync()
                    .then(settings.loadAsync(0, 0, true))
                    .then(logger.init())
            });

            beforeEach(function () {
                loggers = globalAny.setupLoggerStubOrSpy('stub', 'spy')
                getControllerConfigurationStub = sinon.stub(intellitouch, 'getControllerConfiguration')

            })

            afterEach(function () {
                sinon.restore()

            })

            after(async function () {
                globalAny.stopAllAsync()
            })

            it('#Processes a controller status packet', function () {
               return Promise.resolve()
                    .then(function () {
                        return packetBuffer.push(data[0])
                    })
                    .delay(50)
                    .then(
                        function () {
                            temperature.getTemperature().temperature.airTemp.should.equal(62)
                            time.getTime().time.controllerTime.should.equal('12:41 PM')
                        })

            })

            it('#Processes a Duplicate Broadcast controller status packet', function (done) {
                Promise.resolve()
                    .then(function () {
                        return packetBuffer.push(data[0])
                    })
                    .then(function () {
                        return packetBuffer.push(data[0])
                    })
                    .delay(50)
                    .then(
                        function () {
                            temperature.getTemperature().temperature.airTemp.should.equal(62)
                            time.getTime().time.controllerTime.should.equal('12:41 PM')
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
