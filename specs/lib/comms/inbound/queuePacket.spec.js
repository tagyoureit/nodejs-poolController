describe('decodeHelper processes controller packets', function() {
    var pumpPacket = [165, 0, 96, 16, 6, 1, 10],
        chlorinatorPacket = [16, 2, 80, 20, 0],
        controllerPacket = [165, 99, 16, 34, 134, 2, 9, 0]

    describe('#When queueing packets', function() {

        before(function() {
            bottle.container.settings.logMessageDecoding = 1
            bottle.container.settings.logPacketWrites = 1
            bottle.container.settings.logConsoleNotDecoded = 1
            bottle.container.logger.transports.console.level = 'silly';
        });

        beforeEach(function() {
            sandbox = sinon.sandbox.create()
            //clock = sandbox.useFakeTimers()
            loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
            loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
            loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
            loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
            loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')

            queuePacketStub = sandbox.spy(bottle.container.queuePacket, 'queuePacket')
            pumpCommandSpy = sandbox.spy(bottle.container.pumpControllerMiddleware, 'pumpCommand')
            // checksumSpy = sandbox.spy(bottle.container.decodeHelper, 'checksum')
            // isResponseSpy = sandbox.spy(bottle.container.decodeHelper.isResponse)
            // isResponsePumpSpy = sandbox.spy(bottle.container.decodeHelper.isResponsePump)
            // isResponseChlorinatorSpy = sandbox.spy(bottle.container.decodeHelper.isResponseChlorinator)
            // isResponseControllerSpy = sandbox.spy(bottle.container.decodeHelper.isResponseController)
            writePacketStub = sandbox.stub(bottle.container.writePacket, 'isWriteQueueActive').returns(true)
            // controllerConfigNeededStub = sandbox.stub(bottle.container.intellitouch, 'checkIfNeedControllerConfiguration')
            // processControllerPacketStub = sandbox.stub(bottle.container.processController, 'processControllerPacket')
            // processPumpPacketStub = sandbox.stub(bottle.container.processPump, 'processPumpPacket')
            // processChlorinatorPacketStub = sandbox.stub(bottle.container.processChlorinator, 'processChlorinatorPacket')
            bottle.container.queuePacket.queuePacketsArrLength = 0
        })

        afterEach(function() {
            bottle.container.queuePacket.queuePacketsArrLength = 0
            sandbox.restore()

        })

        after(function() {
            bottle.container.settings.logPacketWrites = 0
            bottle.container.settings.logMessageDecoding = 0
            bottle.container.settings.logConsoleNotDecoded = 0
            bottle.container.logger.transports.console.level = 'info';
        })

        it('#queuePacket should try to write a chlorinator packet with checksum', function() {
            bottle.container.queuePacket.queuePacket(chlorinatorPacket)
            bottle.container.queuePacket.first().should.deep.eq([16, 2, 80, 20, 0, 118, 16, 3])
            bottle.container.queuePacket.eject()
        })

        it('#queuePacket should try to write a pump packet with checksum', function() {
            bottle.container.queuePacket.queuePacket(pumpPacket)
            bottle.container.queuePacket.first().should.deep.eq([255, 0, 255, 165, 0, 96, 16, 6, 1, 10, 1, 38])
            bottle.container.queuePacket.eject()
        })

        it('#queuePacket should try to write a controller packet with checksum', function() {
            bottle.container.queuePacket.queuePacket(controllerPacket)
            bottle.container.queuePacket.first().should.deep.eq([255, 0, 255, 165, 99, 16, 34, 134, 2, 9, 0, 1, 203])
            bottle.container.queuePacket.eject()
        })

    })

})
