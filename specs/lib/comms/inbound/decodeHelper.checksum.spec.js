describe('decodeHelper processes controller packets', function() {
    var testarrayGOOD = [
        [165, 16, 15, 16, 8, 13, 73, 73, 49, 85, 100, 2, 0, 0, 45, 0, 0, 0, 0, 2, 148],
        [165, 16, 15, 16, 10, 12, 3, 87, 116, 114, 70, 97, 108, 108, 32, 51, 0, 251, 4, 247],
        [165, 16, 15, 16, 10, 12, 4, 80, 111, 111, 108, 32, 76, 111, 119, 50, 0, 251, 5, 7],
        [165, 16, 15, 16, 10, 12, 0, 87, 116, 114, 70, 97, 108, 108, 32, 49, 0, 251, 4, 242]
    ]
    var testarrayBAD = [
        [165, 16, 15, 16, 8, 13, 73, 73, 49, 85, 100, 2, 0, 0, 45, 0, 0, 0, 0, 2, 149],
        [165, 16, 15, 17, 10, 12, 3, 87, 116, 114, 70, 97, 108, 108, 32, 51, 1, 251, 4, 247],
        [165, 16, 15, 16, 12, 12, 4, 80, 111, 111, 108, 32, 76, 111, 119, 50, 0, 251, 2, 7],
        [165, 16, 15, 16, 10, 12, 0, 99, 116, 114, 70, 97, 108, 108, 32, 49, 0, 251, 4, 242]
    ]
    var equip = 'controller'

    describe('#When packets arrive', function() {
        context('via serialport or Socat', function() {

            before(function() {
                return global.initAll()
            });

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                clock = sandbox.useFakeTimers()
                // suppress warnings for bad packets
                sandbox.restore()
                loggers = setupLoggerStubOrSpy(sandbox, 'stub', 'spy')

                queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
                // pumpCommandSpy = sandbox.spy(bottle.container.pumpControllerMiddleware, 'pumpCommand')
                checksumSpy = sandbox.spy(bottle.container.decodeHelper, 'checksum')
                isResponseSpy = sandbox.spy(bottle.container.decodeHelper.isResponse)
                isResponsePumpSpy = sandbox.spy(bottle.container.decodeHelper.isResponsePump)
                isResponseChlorinatorSpy = sandbox.spy(bottle.container.decodeHelper.isResponseChlorinator)
                isResponseControllerSpy = sandbox.spy(bottle.container.decodeHelper.isResponseController)
                writePacketStub = sandbox.stub(bottle.container.writePacket, 'ejectPacketAndReset')
                controllerConfigNeededStub = sandbox.stub(bottle.container.intellitouch, 'checkIfNeedControllerConfiguration')
                processControllerPacketStub = sandbox.stub(bottle.container.processController, 'processControllerPacket')
                processPumpPacketStub = sandbox.stub(bottle.container.processPump, 'processPumpPacket')
                processChlorinatorPacketStub = sandbox.stub(bottle.container.processChlorinator, 'processChlorinatorPacket')
                bottle.container.queuePacket.queuePacketsArrLength = 0
            })

            afterEach(function() {
                bottle.container.queuePacket.queuePacketsArrLength = 0
                sandbox.restore()

            })

            after(function() {
                return global.stopAll()
            })

            it('#checksum should return true with various controller packets', function() {

                for (var i = 0; i < testarrayGOOD.length; i++) {
                    bottle.container.decodeHelper.checksum(testarrayGOOD[i], 25, equip).should.be.true

                }
            })

            it('#checksum should return false with various invalid controller packets', function() {
                for (var i = 0; i < testarrayBAD.length; i++) {
                    bottle.container.decodeHelper.checksum(testarrayBAD[i], 25, equip).should.be.false
                }

            })


            it('should try to decode the packet as a controller packet', function() {
                for (var i = 0; i < testarrayGOOD.length; i++) {
                    bottle.container.decodeHelper.processChecksum(testarrayGOOD[i], i * 10, equip)
                    processControllerPacketStub.args[i][0].should.contain.members(testarrayGOOD[i])
                    processPumpPacketStub.callCount.should.eq(0)
                    processChlorinatorPacketStub.callCount.should.eq(0)
                }
            })


        })
    })
})
