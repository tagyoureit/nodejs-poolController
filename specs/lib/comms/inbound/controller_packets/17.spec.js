describe('processes 17 (Schedule) packets', function () {
    var data = [
        Buffer.from([255, 0, 255, 165, 16, 15, 16, 17, 7, 1, 6, 9, 25, 15, 55, 255, 2, 90])
    ]

    var equip = 'controller'

    describe('#When packets arrive', function () {
        context('via serialport or Socat', function () {

            before(function () {
                return global.initAllAsync()
            });

            beforeEach(function () {
                loggers = setupLoggerStubOrSpy('stub', 'spy')
                queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
                circuitNameStub = sinon.stub(bottle.container.circuit, 'getCircuitName').returns("POOL")

                controllerConfigNeededStub = sinon.stub(bottle.container.intellitouch, 'checkIfNeedControllerConfiguration')
            })

            afterEach(function () {
                sinon.restore()
            })

            after(function () {
                return global.stopAllAsync()
            })

            it('#Schedule 1 should have ID:1 START_TIME:9:25', function () {
                return Promise.resolve()
                    .then(function () {
                        return global.schedules_chk.forEach(function (el) {
                            bottle.container.packetBuffer.push(Buffer.from(el))
                        })
                    })
                    .delay(200)
                    .then(function () {
                        var json = bottle.container.schedule.getCurrentSchedule().schedule
                        //console.log('json for schedule 1: ', JSON.stringify(json,null,2))
                        json[1].ID.should.equal(1)
                        json[1].START_TIME.should.equal("9:20")
                        json[1].CIRCUIT.should.equal("POOL")
                        loggers.loggerInfoStub.args[0][1].should.contain("Schedules discovered:")
                    })
            })

        })
    })
})
