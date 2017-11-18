describe('processes 32 (Circuit Name/Function) packets', function() {
  var data = [
    Buffer.from([255,0,255,165,33,15,16,11,5,1,1,72,0,0,1,63]),
    Buffer.from([255,0,255,165,33,15,16,11,5,2,0,46,0,0,1,37])
  ]

  var equip = 'controller'

  describe('#When packets arrive', function() {
    context('via serialport or Socat', function() {

      before(function() {
        bottle.container.settings.logConfigMessages = 1
        bottle.container.settings.logMessageDecoding = 1
        bottle.container.logger.transports.console.level = 'silly';
      });

      beforeEach(function() {
        sandbox = sinon.sandbox.create()
        clock = sandbox.useFakeTimers()
        queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
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
        bottle.container.settings.logConfigMessages = 0
        bottle.container.settings.logMessageDecoding = 0
        bottle.container.logger.transports.console.level = 'info';
      })

      it('#Circuit 1 should be a Spa Circuit', function() {
        bottle.container.packetBuffer.push(data[0])
        clock.tick(1000)
        var json = bottle.container.circuit.getCurrentCircuits().circuit
        //console.log('json for circuit 1: ', JSON.stringify(json,null,2))
        json[1].number.should.equal(1)
        json[1].name.should.equal("SPA")
      })


    })
  })
})
