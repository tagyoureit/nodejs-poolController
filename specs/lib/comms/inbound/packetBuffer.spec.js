describe('packetBuffer receives raw packets from serial bus', function() {


    describe('#When packets arrive', function() {
        context('via serialport or Socat', function() {

            before(function() {
                return global.initAll()
            });

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                clock = sandbox.useFakeTimers()
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
                // queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
                // pumpCommandSpy = sandbox.spy(bottle.container.pumpControllerMiddleware, 'pumpCommand')
                // checksumSpy = sandbox.spy(bottle.container.decodeHelper, 'checksum')
                // isResponseSpy = sandbox.spy(bottle.container.decodeHelper.isResponse)
                // isResponsePumpSpy = sandbox.spy(bottle.container.decodeHelper.isResponsePump)
                // isResponseChlorinatorSpy = sandbox.spy(bottle.container.decodeHelper.isResponseChlorinator)
                // isResponseControllerSpy = sandbox.spy(bottle.container.decodeHelper.isResponseController)
                // writePacketStub = sandbox.stub(bottle.container.writePacket, 'ejectPacketAndReset')
                // controllerConfigNeededStub = sandbox.stub(bottle.container.intellitouch, 'checkIfNeedControllerConfiguration')
                // processControllerPacketStub = sandbox.stub(bottle.container.processController, 'processControllerPacket')
                // processPumpPacketStub = sandbox.stub(bottle.container.processPump, 'processPumpPacket')
                // processChlorinatorPacketStub = sandbox.stub(bottle.container.processChlorinator, 'processChlorinatorPacket')
                receiveBufferStub = sandbox.stub(bottle.container.receiveBuffer, 'getProcessingBuffer')

                iOAOAStub = sandbox.stub(bottle.container.receiveBuffer, 'iterateOverArrayOfArrays')
                // bottle.container.queuePacket.queuePacketsArrLength = 0
            })

            afterEach(function() {
                // bottle.container.queuePacket.queuePacketsArrLength = 0
                sandbox.restore()

            })

            after(function() {
                return global.stopAll()
            })

            it('#should accept all packets and kick off processing buffer', function() {
                receiveBufferStub.onFirstCall().returns(false)
                receiveBufferStub.returns(true)
                // console.log('rb:', global.rawBuffer.length, global.rawBuffer[10])
                for (var i = 0; i < global.rawBuffer.length; i++) {
                    if (i === 1) bottle.container.receiveBuffer.processingBuffer = {
                        'processingBuffer': true
                    }
                    bottle.container.packetBuffer.push(new Buffer(global.rawBuffer[i]))
                }
                iOAOAStub.callCount.should.eq(1)
                bottle.container.packetBuffer.length().should.eq(276)
            })

            it('#should push all packets with pop()', function() {
                // console.log('rb:', global.rawBuffer.length, global.rawBuffer[10])
                var packet
                for (var i = 0; i < global.rawBuffer.length; i++) {
                    packet = bottle.container.packetBuffer.pop()
                    // console.log('popped:', i, packet, global.rawBuffer[i].data)
                    packet.should.contain.members(global.rawBuffer[i].data)
                }

                bottle.container.packetBuffer.length().should.eq(0)
            })



        })
    })
})
