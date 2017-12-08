describe('processes 2 (Status) packets', function() {
    var data = [
        Buffer.from([255, 0, 255, 165,33,15,16,2,29,12,41,32,0,0,0,0,0,0,0,3,0,64,4,60,60,0,0,62,71,0,0,0,0,0,74,142,0,13,3,130])
    ]

    var equip = 'controller'

    describe('#When packets arrive', function() {
        context('via serialport or Socat', function() {

            before(function() {
                return global.initAll()
            });

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                //clock = sandbox.useFakeTimers()
                // queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')

                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
                // writeNetPacketStub = sandbox.stub(bottle.container.sp, 'writeNET')
                // writeSPPacketStub = sandbox.stub(bottle.container.sp, 'writeSP')

                bottle.container.circuit.init()
            })

            afterEach(function() {
                sandbox.restore()

            })

            after(function() {
                return global.stopAll()
            })

            it('#Processes a controller status packet', function(done) {
                Promise.resolve()
                    .then(function(){
                        return bottle.container.packetBuffer.push(data[0])
                    })
                    .delay(50)
                    .then(
                        function(){
                            bottle.container.temperatures.getTemperatures().temperature.airTemp.should.equal(62)
                            bottle.container.time.getTime().time.controllerTime.should.equal('12:41 PM')
                        })
                    .then(done, done)
            })

            it('#Processes a Duplicate Broadcast controller status packet', function(done) {
                Promise.resolve()
                    .then(function(){
                        return bottle.container.packetBuffer.push(data[0])
                    })
                    .then(function(){
                        return bottle.container.packetBuffer.push(data[0])
                    })
                    .delay(50)
                    .then(
                        function(){
                            bottle.container.temperatures.getTemperatures().temperature.airTemp.should.equal(62)
                            bottle.container.time.getTime().time.controllerTime.should.equal('12:41 PM')
                            loggerVerboseStub.args[1][0].should.contain('Duplicate broadcast.')
                        })
                    .then(done, done)
            })

        })
    })
})
