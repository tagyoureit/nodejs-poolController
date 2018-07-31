describe('processes 25 (Chlorinator) packets', function () {


    var equip = 'controller'

    describe('#When packets arrive', function () {
        context('via serialport or Socat', function () {

            before(function () {
                return global.initAllAsync()
            });

            beforeEach(function () {
                loggers = setupLoggerStubOrSpy('stub', 'spy')
                queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')


            })

            afterEach(function () {
                sinon.restore()

            })

            after(function () {
                return global.stopAllAsync()
            })

            it('#Chlorinator Packet Received', function () {
                return Promise.resolve()
                    .then(function () {
                        // multiple packets for code coverage
                        var data = [

                            Buffer.from([255, 0, 255, 165,33,15,16,25,22,1,10,128,29,132,0,73,110,116,101,108,108,105,99,104,108,111,114,45,45,52,48,7,231]),
                            Buffer.from([255, 0, 255, 165,33,15,16,25,22,1,5,64,29,132,0,73,110,116,101,108,108,105,99,104,108,111,114,45,45,52,48,7,162]),
                            Buffer.from([255, 0, 255, 165,33,15,16,25,22,1,10,64,29,132,0,73,110,116,101,108,108,105,99,104,108,111,114,45,45,52,48,7,167]),
                            Buffer.from([255, 0, 255, 165,33,15,16,25,22,1,10,64,29,132,0,73,110,116,101,108,108,105,99,104,108,111,114,45,45,52,48,7,167])



                        ]

                        data.forEach(function (el) {
                            bottle.container.packetBuffer.push(el)
                        })
                    })
                    .delay(100)
                    .then(function () {
                        bottle.container.chlorinator.getChlorinatorStatus().chlorinator.saltPPM.should.eq(1450)

                    })
            })


        })
    })
})
