describe('processes 27 (Extended Pump Config) packets', function() {


  var equip = 'controller'

  describe('#When packets arrive', function() {
    context('via serialport or Socat', function() {

      before(function() {
        return global.initAll()
      });

      beforeEach(function() {
        sandbox = sinon.sandbox.create()
        clock = sandbox.useFakeTimers()
        queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
        loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
        loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
        loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
        loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
        loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')

      })

      afterEach(function() {
        sandbox.restore()

      })

      after(function() {
        return global.stopAll()
      })

      it('#Extended Pump Configurations Received for VS/VSF', function() {

        var data = [
          Buffer.from([255, 0, 255, 165, 33, 15, 16, 27, 46, 1, 128, 1, 2, 0, 1, 6, 2, 12, 4, 9, 11, 7, 6, 7, 128, 8, 132, 3, 15, 5, 3, 234, 128, 46, 108, 58, 2, 232, 220, 232, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 5]),  //VS
          Buffer.from([255,0,255,165,33,15,16,27,46,2,64,0,0,2,1,33,2,4,0,30,0,30,0,30,0,30,0,30,0,30,0,0,16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,94])  //VSF

        ]
        global.customNames_chk.forEach(function(el) {
          bottle.container.packetBuffer.push(el)
        })
        global.circuits_chk.forEach(function(el) {
          bottle.container.packetBuffer.push(el)
        })
        data.forEach(function(el) {
          bottle.container.packetBuffer.push(el)
        })

        clock.tick(1000)

        JSON.parse(loggerInfoStub.args[loggerInfoStub.args.length - 1][1])[1].type.should.equal("VS")
        JSON.parse(loggerInfoStub.args[loggerInfoStub.args.length - 1][1])[1].circuit_slot[1].rpm.should.equal(1770)
        JSON.parse(loggerInfoStub.args[loggerInfoStub.args.length - 1][1])[1].circuit_slot[1].name.should.equal("SPA")

        JSON.parse(loggerInfoStub.args[loggerInfoStub.args.length - 1][1])[2].type.should.equal("VSF")
        JSON.parse(loggerInfoStub.args[loggerInfoStub.args.length - 1][1])[2].circuit_slot[1].gpm.should.equal(33)
        JSON.parse(loggerInfoStub.args[loggerInfoStub.args.length - 1][1])[2].circuit_slot[1].name.should.equal("SPA")
        JSON.parse(loggerInfoStub.args[loggerInfoStub.args.length - 1][1])[2].circuit_slot[2].rpm.should.equal(1040)
        JSON.parse(loggerInfoStub.args[loggerInfoStub.args.length - 1][1])[2].circuit_slot[2].name.should.equal("JETS")


      })

      it('#Extended Pump Configurations Received for VF', function() {

        var data = [
          Buffer.from([255, 0, 255, 165, 33, 15, 16, 27, 46, 1, 128, 1, 2, 0, 1, 6, 2, 12, 4, 9, 11, 7, 6, 7, 128, 8, 132, 3, 15, 5, 3, 234, 128, 46, 108, 58, 2, 232, 220, 232, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 5]),  //VS
          Buffer.from([255, 0, 255,  165,33,15,16,27,46,2,6,15,2,0,1,29,11,35,0,30,0,30,0,30,0,30,0,30,0,30,30,55,5,10,60,5,1,50,0,10,0,0,0,0,0,0,0
,0,0,0,0,0,0,0,0,3,41])  //VF

        ]
        global.customNames_chk.forEach(function(el) {
          bottle.container.packetBuffer.push(el)
        })
        global.circuits_chk.forEach(function(el) {
          bottle.container.packetBuffer.push(el)
        })
        data.forEach(function(el) {
          bottle.container.packetBuffer.push(el)
        })

        clock.tick(1000)
        JSON.parse(loggerInfoStub.args[loggerInfoStub.args.length - 1][1])[2].type.should.equal("VF")
        JSON.parse(loggerInfoStub.args[loggerInfoStub.args.length - 1][1])[2].circuit_slot[1].gpm.should.equal(29)
        JSON.parse(loggerInfoStub.args[loggerInfoStub.args.length - 1][1])[2].circuit_slot[1].name.should.equal("SPA")
        JSON.parse(loggerInfoStub.args[loggerInfoStub.args.length - 1][1])[2].filtering.filter.poolSize.should.equal(15000)
      })

    })
  })
})
