describe('recieves packets from buffer and follows them to decoding', function() {


    describe('#When packets arrive', function() {
        context('via serialport or Socat and ending with Socket.io', function() {

            before(function() {

                bottle.container.settings.logMessageDecoding = 1
                bottle.container.settings.logPumpMessages = 1
                bottle.container.logger.transports.console.level = 'verbose'
                bottle.container.server.init()
                bottle.container.io.init()
            });

            beforeEach(function() {
                bottle.container.pump.init()
                sandbox = sinon.sandbox.create()
                clock = sandbox.useFakeTimers()
                // loggerInfoStub = sandbox.spy(bottle.container.logger, 'info')
                // queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
                // loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
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
                receiveBufferStub = sandbox.spy(bottle.container.receiveBuffer, 'getProcessingBuffer')
                socketIOSpy = sandbox.spy(bottle.container.io, 'emitToClients')
                iOAOAStub = sandbox.spy(bottle.container.receiveBuffer, 'iterateOverArrayOfArrays')
                // bottle.container.queuePacket.queuePacketsArrLength = 0
            })

            afterEach(function() {
                // bottle.container.queuePacket.queuePacketsArrLength = 0
                sandbox.restore()

            })

            after(function() {
                bottle.container.pump.init()
                bottle.container.settings.logMessageDecoding = 0
                bottle.container.settings.logPumpMessages = 0
                bottle.container.logger.transports.console.level = 'info'
                bottle.container.server.close()
            })

            it('#decodes pump 1 power off command from the controller', function(done) {
                // console.log('getCurrentPumpStatus(1):', bottle.container.pump.getCurrentPumpStatus(1))
                bottle.container.pump.getPower(1).should.eq('powernotset')
                bottle.container.packetBuffer.push(new Buffer(global.pump1PowerOff_chk))
                bottle.container.packetBuffer.push(new Buffer(global.pump1PowerOffAck_chk))
                // console.log('logger args:', loggerVerboseStub.args)
                // console.log('getCurrentPumpStatus(1) END:', bottle.container.pump.getCurrentPumpStatus(1))
                loggerVerboseStub.args[0][2].should.contain('Main')
                loggerVerboseStub.args[0][3].should.contain('Pump 1')
                loggerVerboseStub.args[0][4].should.contain('off')
                loggerVerboseStub.args[1][2].should.contain('Pump 1')
                loggerVerboseStub.args[1][3].should.contain('off')
                bottle.container.pump.getPower(1).should.eq(0)

                var client = global.ioclient.connect(global.socketURL, global.socketOptions)
                client.on('pump', function(data) {
                    // console.log(data)
                    data[1].power.should.eq(0)
                    client.disconnect()
                    done()
                })



            })

            it('#decodes pump 1 power on command from the controller', function(done) {
                // console.log('getCurrentPumpStatus(1):', bottle.container.pump.getCurrentPumpStatus(1))
                bottle.container.pump.getPower(1).should.eq('powernotset')
                bottle.container.packetBuffer.push(new Buffer(global.pump1PowerOn_chk))
                bottle.container.packetBuffer.push(new Buffer(global.pump1PowerOnAck_chk))
                // console.log('logger args:', loggerVerboseStub.args)
                // console.log('getCurrentPumpStatus(1) END:', bottle.container.pump.getCurrentPumpStatus(1))
                loggerVerboseStub.args[0][2].should.contain('Main')
                loggerVerboseStub.args[0][3].should.contain('Pump 1')
                loggerVerboseStub.args[0][4].should.contain('on')
                loggerVerboseStub.args[1][2].should.contain('Pump 1')
                loggerVerboseStub.args[1][3].should.contain('on')
                bottle.container.pump.getPower(1).should.eq(1)
                var client = global.ioclient.connect(global.socketURL, global.socketOptions)
                client.on('pump', function(data) {
                    // console.log(data)
                    data[1].power.should.eq(1)
                    client.disconnect()
                    done()
                })
            })

            it('#decodes pump 1 remote control on command from the controller', function(done) {
                // console.log('getCurrentPumpStatus(1):', bottle.container.pump.getCurrentPumpStatus(1))
                bottle.container.pump.getCurrentPumpStatus()[1].remotecontrol.should.eq('remotecontrolnotset')
                bottle.container.packetBuffer.push(new Buffer(global.pump1RemoteControlOn_chk))
                bottle.container.packetBuffer.push(new Buffer(global.pump1RemoteControlOnAck_chk))
                // console.log('logger args:', loggerVerboseStub.args)
                // console.log('getCurrentPumpStatus(1) END:', bottle.container.pump.getCurrentPumpStatus(1))
                loggerVerboseStub.args[0][2].should.contain('Main')
                loggerVerboseStub.args[0][3].should.contain('Pump 1')
                loggerVerboseStub.args[0][4].should.contain('disable')
                loggerVerboseStub.args[1][2].should.contain('Pump 1')
                loggerVerboseStub.args[1][3].should.contain('disable')
                bottle.container.pump.getCurrentPumpStatus()[1].remotecontrol.should.eq(1)
                var client = global.ioclient.connect(global.socketURL, global.socketOptions)
                client.on('pump', function(data) {
                    // console.log(data)
                    data[1].remotecontrol.should.eq(1)
                    client.disconnect()
                    done()
                })

            })

            it('#decodes pump 2 remote control off command from the controller', function(done) {
                // console.log('getCurrentPumpStatus(1):', bottle.container.pump.getCurrentPumpStatus(1))
                bottle.container.pump.getCurrentPumpStatus()[2].remotecontrol.should.eq('remotecontrolnotset')
                bottle.container.packetBuffer.push(new Buffer(global.pump2RemoteControlOff_chk))
                bottle.container.packetBuffer.push(new Buffer(global.pump2RemoteControlOffAck_chk))
                // console.log('logger args:', loggerVerboseStub.args)
                // console.log('getCurrentPumpStatus(1) END:', bottle.container.pump.getCurrentPumpStatus(1))
                loggerVerboseStub.args[0][2].should.contain('Main')
                loggerVerboseStub.args[0][3].should.contain('Pump 2')
                loggerVerboseStub.args[0][4].should.contain('enable')
                loggerVerboseStub.args[1][2].should.contain('Pump 2')
                loggerVerboseStub.args[1][3].should.contain('enable')
                bottle.container.pump.getCurrentPumpStatus()[2].remotecontrol.should.eq(0)
                var client = global.ioclient.connect(global.socketURL, global.socketOptions)
                client.on('pump', function(data) {
                    // console.log(data)
                    data[2].remotecontrol.should.eq(0)
                    client.disconnect()
                    done()
                })

            })

            it('#should decode a pump 1 reply with status command from the controller', function() {

                bottle.container.packetBuffer.push(new Buffer(global.pump1SendStatus_chk))
                // packet = {
                //     "type": "Buffer",
                //     "data": global.pump1PowerOffAck_chk
                // }
                // bottle.container.packetBuffer.push(new Buffer(packet))
                iOAOAStub.callCount.should.eq(1)

            })


        })
    })
})
