describe('processes 17 (Schedule) packets', function() {
    var data = [
        Buffer.from([255, 0, 255, 165,0,96,16,1, 4, 3, 33, 0,8,1,136]), // run program 1
        Buffer.from([255, 0, 255, 165,0,96,16,1,4,2,196,7,58,2,33]),
        Buffer.from([255, 0, 255, 165,0,97,16,1,4,2,196,30,10,2,9])
    ]

    var equip = 'pump'

    describe('#When packets arrive', function() {
        context('via serialport or Socat', function() {

            before(function() {
                return global.initAllAsync()
            });

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                clock = sandbox.useFakeTimers()
                configEditorStub = sandbox.stub(bottle.container.configEditor, 'updateExternalPumpProgramAsync')
                queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
                circuitNameStub = sandbox.stub(bottle.container.circuit, 'getCircuitName').returns("POOL")
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
                bottle.container.pump.init()
            })

            afterEach(function() {
                sandbox.restore()

            })

            after(function() {
                return global.stopAllAsync()
            })

            it('#Pump 1 Program 1 should be set to 490', function() {
                bottle.container.packetBuffer.push(Buffer.from(global.pump1SetProgram1RPM490Packet_chk))
                var json = bottle.container.pump.getCurrentPumpStatus().pump
                //console.log('json for pumps: ', JSON.stringify(json,null,2))
                json[1].externalProgram[1].should.equal(490)

            })
            it('#Pump 1 Program 2 should be set to 500 and then 2500', function() {
                bottle.container.packetBuffer.push(Buffer.from(global.pump1SetProgram2RPM500Packet_chk))
                var json = bottle.container.pump.getCurrentPumpStatus().pump
                //console.log('json for pumps: ', JSON.stringify(json,null,2))
                json[1].externalProgram[2].should.equal(500)
                bottle.container.packetBuffer.push(Buffer.from(global.pump1SetProgram2RPM2500Packet_chk))
                json = bottle.container.pump.getCurrentPumpStatus().pump
                json[1].externalProgram[2].should.equal(2500)
            })
            it('#Pump 1 Program 3 should be set to 2490', function() {
                bottle.container.packetBuffer.push(Buffer.from(global.pump1SetProgram3RPM2490Packet_chk))
                var json = bottle.container.pump.getCurrentPumpStatus().pump
                //console.log('json for pumps: ', JSON.stringify(json,null,2))
                json[1].externalProgram[3].should.equal(2490)
            })
            it('#Pump 1 Program 4 should be set to 2480', function() {
                bottle.container.packetBuffer.push(Buffer.from(global.pump1SetProgram4RPM2480Packet_chk))
                var json = bottle.container.pump.getCurrentPumpStatus().pump
                //console.log('json for pumps: ', JSON.stringify(json,null,2))
                json[1].externalProgram[4].should.equal(2480)
            })


            it('#Pump 2 Program 1 should be set to 490', function() {
                bottle.container.packetBuffer.push(Buffer.from(global.pump2SetProgram1RPM490Packet_chk))
                var json = bottle.container.pump.getCurrentPumpStatus().pump
                //console.log('json for pumps: ', JSON.stringify(json,null,2))
                json[2].externalProgram[1].should.equal(490)

            })
            it('#Pump 2 Program 2 should be set to 2500', function() {
                bottle.container.packetBuffer.push(Buffer.from(global.pump2SetProgram2RPM2500Packet_chk))
                var json = bottle.container.pump.getCurrentPumpStatus().pump
                //console.log('json for pumps: ', JSON.stringify(json,null,2))
                json[2].externalProgram[2].should.equal(2500)

            })
            it('#Pump 2 Program 3 should be set to 2490', function() {
                bottle.container.packetBuffer.push(Buffer.from(global.pump2SetProgram3RPM2490Packet_chk))
                var json = bottle.container.pump.getCurrentPumpStatus().pump
                //console.log('json for pumps: ', JSON.stringify(json,null,2))
                json[2].externalProgram[3].should.equal(2490)
            })

            it('#Pump 2 Program 4 should be set to 3450', function() {
                bottle.container.packetBuffer.push(Buffer.from(global.pump2SetProgram4RPM3450Packet_chk))
                clock.tick(1000)
                var json = bottle.container.pump.getCurrentPumpStatus().pump
                //console.log('json for pumps: ', JSON.stringify(json,null,2))
                json[2].externalProgram[4].should.equal(3450)

            })


        })
    })
})
