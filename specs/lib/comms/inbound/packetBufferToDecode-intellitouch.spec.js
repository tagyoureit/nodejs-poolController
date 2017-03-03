describe('recieves packets from buffer and follows them to decoding', function() {


    describe('#When packets arrive', function() {
        context('via serialport or Socat and ending with Socket.io', function() {

            before(function() {

                bottle.container.settings.logMessageDecoding = 1
                bottle.container.settings.logConfigMessages = 1
                bottle.container.logger.transports.console.level = 'silly';
                bottle.container.server.init()
                bottle.container.io.init()
            });

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
                bottle.container.pump.init()
                updateAvailStub = sandbox.stub(bottle.container.updateAvailable, 'getResults').returns({})
                receiveBufferStub = sandbox.spy(bottle.container.receiveBuffer, 'getProcessingBuffer')
                socketIOSpy = sandbox.spy(bottle.container.io, 'emitToClients')
                iOAOAStub = sandbox.spy(bottle.container.receiveBuffer, 'iterateOverArrayOfArrays')

            })

            afterEach(function() {
                bottle.container.pump.init()
                sandbox.restore()

            })

            after(function() {
                bottle.container.settings.logMessageDecoding = 0
                bottle.container.settings.logConfigMessages = 0
                bottle.container.logger.transports.console.level = 'info'
                bottle.container.server.close()
            })

            it('#should set/get the temperature', function(done) {
                configNeededStub = sandbox.stub(bottle.container.intellitouch, 'checkIfNeedControllerConfiguration')
                bottle.container.temperatures.getTemperatures().poolTemp.should.eq(0)
                bottle.container.packetBuffer.push(new Buffer([255, 0, 255, 165, 16, 15, 16, 8, 13, 53, 53, 42, 83, 71, 0, 0, 0, 39, 0, 0, 0, 0, 2, 62]))

                // console.log('logger args:', loggerVerboseStub.args)
                // console.log('getCurrentPumpStatus(1) END:', bottle.container.pump.getCurrentPumpStatus(1))
                // loggerVerboseStub.args[0][2].should.contain('Main')
                // loggerVerboseStub.args[0][3].should.contain('Pump 1')
                // loggerVerboseStub.args[0][4].should.contain('off')
                // loggerVerboseStub.args[1][2].should.contain('Pump 1')
                // loggerVerboseStub.args[1][3].should.contain('off')



                var client = global.ioclient.connect(global.socketURL, global.socketOptions)
                client.on('temp', function(data) {
                    // console.log(data)
                    data.poolTemp.should.eq(53)


                    setTimeout(function() {
                        bottle.container.temperatures.getTemperatures().poolTemp.should.eq(53)
                    client.disconnect()
                        done()
                    }, 100)

                })
            })






        })
    })
})
