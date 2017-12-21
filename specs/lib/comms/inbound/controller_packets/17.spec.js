describe('processes 17 (Schedule) packets', function() {
  var data = [
    Buffer.from([255, 0, 255, 165, 16, 15, 16, 17, 7, 1, 6, 9, 25, 15, 55, 255, 2, 90])
  ]

  var equip = 'controller'

  describe('#When packets arrive', function() {
    context('via serialport or Socat', function() {

      before(function() {
        return global.initAllAsync()
      });

      beforeEach(function() {
          loggers = setupLoggerStubOrSpy('stub', 'spy')
        clock = sandbox.useFakeTimers()
        queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
        circuitNameStub = sandbox.stub(bottle.container.circuit, 'getCircuitName').returns("POOL")

        controllerConfigNeededStub = sandbox.stub(bottle.container.intellitouch, 'checkIfNeedControllerConfiguration')
        bottle.container.schedule.init()
      })

      afterEach(function() {
        sandbox.restore()

      })

      after(function() {
        return global.stopAllAsync()
      })

      it('#Schedule 1 should have ID:1 START_TIME:9:25', function() {
        global.schedules_chk.forEach(function(el){
            bottle.container.packetBuffer.push(Buffer.from(el))
        })

        clock.tick(1000)
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
