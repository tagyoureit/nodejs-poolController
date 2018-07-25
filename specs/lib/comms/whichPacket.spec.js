describe('whichPacket tells the app what type of packet is in the queue', function() {
    var inboundPumpPacket = [165, 0, 96, 16, 6, 1, 10],
        inboundChlorinatorPacket = [16, 2, 80, 20, 0],
        inboundControllerPacket = [165, 99, 16, 34, 134, 2, 9, 0],
        outboundPumpPacket = [255,0,255,165, 0, 98, 16, 6, 1, 10],
        outboundChlorinatorPacket = [16, 2, 80, 20, 0],
        outboundControllerPacket = [255,0,255,165, 99, 16, 34, 134, 2, 9, 0]



    describe('#When queueing packets', function() {
        context('returns the right values', function() {
            before(function() {
                // return global.initAllAsync()
            });

            beforeEach(function() {
                loggers = setupLoggerStubOrSpy('stub', 'spy')
            })

            afterEach(function() {
                sinon.restore()
            })

            after(function() {
                // return global.stopAllAsync()
            })

            it('#checks outbound packets', function() {
                bottle.container.whichPacket.outbound(outboundPumpPacket).should.equal('pump')
                bottle.container.whichPacket.outbound(outboundChlorinatorPacket).should.equal('chlorinator')
                bottle.container.whichPacket.outbound(outboundControllerPacket).should.equal('controller')
            })

            it('#checks inbound packets', function() {
                bottle.container.whichPacket.inbound(inboundPumpPacket).should.equal('pump')
                bottle.container.whichPacket.inbound(inboundChlorinatorPacket).should.equal('chlorinator')
                bottle.container.whichPacket.inbound(inboundControllerPacket).should.equal('controller')
            })
        })
    })
})
