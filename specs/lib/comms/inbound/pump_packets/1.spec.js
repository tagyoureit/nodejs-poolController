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
                return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config.pump.VS.json'})
            });

            beforeEach(function() {
                loggers = setupLoggerStubOrSpy('stub', 'spy')
                settingsStub = sinon.stub(bottle.container.settings, 'updateExternalPumpProgramAsync')
                queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
                circuitNameStub = sinon.stub(bottle.container.circuit, 'getCircuitName').returns("POOL")

                bottle.container.pump.init()
            })

            afterEach(function() {
                sinon.restore()

            })

            after(function() {
                return global.stopAllAsync()
            })

            it('#Pump 1 Program 1 should be set to 490', function() {
                return Promise.resolve()
                    .then(function(){
                        bottle.container.packetBuffer.push(Buffer.from(global.pump1SetProgram1RPM490Packet_chk))
                    })
                    .delay(50)
                    .then(function(){
                        var json = bottle.container.pump.getCurrentPumpStatus().pump
                        //console.log('json for pumps: ', JSON.stringify(json,null,2))
                        json[1].externalProgram[1].should.equal(490)
                    })

            })
            it('#Pump 1 Program 2 should be set to 500 and then 2500', function() {
                return Promise.resolve()
                    .then(function(){
                        bottle.container.packetBuffer.push(Buffer.from(global.pump1SetProgram2RPM500Packet_chk))
                      })
                    .delay(50)
                    .then(function() {
                        var json = bottle.container.pump.getCurrentPumpStatus().pump

                        //console.log('json for pumps: ', JSON.stringify(json,null,2))
                        json[1].externalProgram[2].should.equal(500)
                        bottle.container.packetBuffer.push(Buffer.from(global.pump1SetProgram2RPM2500Packet_chk))
                    })
                    .delay(50)
                    .then(function(){
                        var json = bottle.container.pump.getCurrentPumpStatus().pump
                        json[1].externalProgram[2].should.equal(2500)
                    })
            })
            it('#Pump 1 Program 3 should be set to 2490', function() {
                return Promise.resolve()
                    .then(function(){
                        bottle.container.packetBuffer.push(Buffer.from(global.pump1SetProgram3RPM2490Packet_chk))
                    })
                    .delay(50)
                    .then(function(){
                        var json = bottle.container.pump.getCurrentPumpStatus().pump
                        //console.log('json for pumps: ', JSON.stringify(json,null,2))
                        json[1].externalProgram[3].should.equal(2490)
                    })



            })
            it('#Pump 1 Program 4 should be set to 2480', function() {
                return Promise.resolve()
                    .then(function(){
                        bottle.container.packetBuffer.push(Buffer.from(global.pump1SetProgram4RPM2480Packet_chk))
                    })
                    .delay(50)
                    .then(function(){
                        var json = bottle.container.pump.getCurrentPumpStatus().pump
                        //console.log('json for pumps: ', JSON.stringify(json,null,2))
                        json[1].externalProgram[4].should.equal(2480)
                    })



            })


            it('#Pump 2 Program 1 should be set to 490', function() {
                return Promise.resolve()
                    .then(function(){
                        bottle.container.packetBuffer.push(Buffer.from(global.pump2SetProgram1RPM490Packet_chk))
                    })
                    .delay(50)
                    .then(function(){
                        var json = bottle.container.pump.getCurrentPumpStatus().pump
                        //console.log('json for pumps: ', JSON.stringify(json,null,2))
                        json[2].externalProgram[1].should.equal(490)
                    })




            })
            it('#Pump 2 Program 2 should be set to 2500', function() {
                return Promise.resolve()
                    .then(function(){
                        bottle.container.packetBuffer.push(Buffer.from(global.pump2SetProgram2RPM2500Packet_chk))
                    })
                    .delay(50)
                    .then(function(){
                        var json = bottle.container.pump.getCurrentPumpStatus().pump
                        //console.log('json for pumps: ', JSON.stringify(json,null,2))
                        json[2].externalProgram[2].should.equal(2500)
                    })
            })
            it('#Pump 2 Program 3 should be set to 2490', function() {
                return Promise.resolve()
                    .then(function(){
                        bottle.container.packetBuffer.push(Buffer.from(global.pump2SetProgram3RPM2490Packet_chk))
                    })
                    .delay(50)
                    .then(function(){
                        var json = bottle.container.pump.getCurrentPumpStatus().pump
                        //console.log('json for pumps: ', JSON.stringify(json,null,2))
                        json[2].externalProgram[3].should.equal(2490)
                    })
            })

            it('#Pump 2 Program 4 should be set to 3450', function() {
                return Promise.resolve()
                    .then(function(){
                        bottle.container.packetBuffer.push(Buffer.from(global.pump2SetProgram4RPM3450Packet_chk))
                    })
                    .delay(50)
                    .then(function(){
                        var json = bottle.container.pump.getCurrentPumpStatus().pump
                        //console.log('json for pumps: ', JSON.stringify(json,null,2))
                        json[2].externalProgram[4].should.equal(3450)
                    })
            })


        })
    })
})
