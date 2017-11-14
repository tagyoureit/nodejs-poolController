describe('processes 2 (Status) packets', function() {
    var data = [
        Buffer.from([255, 0, 255, 165,33,15,16,2,29,12,41,32,0,0,0,0,0,0,0,3,0,64,4,60,60,0,0,62,71,0,0,0,0,0,74,142,0,13,3,130])
    ]

    var equip = 'controller'

    describe('#When packets arrive', function() {
        context('via serialport or Socat', function() {

            before(function() {
                bottle.container.settings.logConfigMessages = 1
                bottle.container.settings.logDuplicateMessages = 1
                bottle.container.logger.transports.console.level = 'silly';
            });

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                clock = sandbox.useFakeTimers()
                // queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')

                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
                bottle.container.circuit.init()
            })

            afterEach(function() {
                sandbox.restore()

            })

            after(function() {
                bottle.container.circuit.init()
                bottle.container.settings.logConfigMessages = 0
                bottle.container.settings.logDuplicateMessages = 0
                bottle.container.logger.transports.console.level = 'info';
            })

            it('#Processes a controller status packet', function() {
                bottle.container.packetBuffer.push(data[0])
                loggerSillyStub.args[5][3].should.equal(1) // circuit 6 is on.
                bottle.container.packetBuffer.push(data[0])
                loggerVerboseStub.args[1][0].should.contain('Duplicate broadcast.')

            })


        })
    })
})
