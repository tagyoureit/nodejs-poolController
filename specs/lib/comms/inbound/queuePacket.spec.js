describe('decodeHelper processes controller packets', function() {
    var pumpPacket = [165, 0, 96, 16, 6, 1, 10],
        chlorinatorPacket = [16, 2, 80, 20, 0],
        controllerPacket = [165, 99, 16, 34, 134, 2, 9, 0]



    describe('#When queueing packets', function() {
        context('with write queue active = false (should write packets)', function() {
            before(function() {
                bottle.container.settings.logMessageDecoding = 1
                bottle.container.settings.logPacketWrites = 1
                bottle.container.settings.logConsoleNotDecoded = 1
                bottle.container.queuePacket.init()
                bottle.container.writePacket.init()
                bottle.container.logger.transports.console.level = 'silly';
            });

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                //clock = sandbox.useFakeTimers()
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')

                queuePacketStub = sandbox.spy(bottle.container.queuePacket, 'queuePacket')
                // pumpCommandSpy = sandbox.spy(bottle.container.pumpControllerMiddleware, 'pumpCommand')
                writeQueueActiveStub = sandbox.stub(bottle.container.writePacket, 'isWriteQueueActive').returns(false)
                writeNetPacketStub = sandbox.stub(bottle.container.sp, 'writeNET')
                writeSPPacketStub = sandbox.stub(bottle.container.sp, 'writeSP')
                bottle.container.queuePacket.queuePacketsArrLength = 0
            })

            afterEach(function() {
                bottle.container.queuePacket.init()
                bottle.container.writePacket.init()

                bottle.container.queuePacket.eject()
                sandbox.restore()

            })

            after(function() {
                bottle.container.settings.logPacketWrites = 0
                bottle.container.settings.logMessageDecoding = 0
                bottle.container.settings.logConsoleNotDecoded = 0
                bottle.container.logger.transports.console.level = 'info';
            })

            it('#queuePacket should try to write a chlorinator packet with checksum', function(done) {
                Promise.resolve()
                    .then(function(){
                        return bottle.container.queuePacket.queuePacket(chlorinatorPacket)
                    })
                    .then(function(){
                        return bottle.container.queuePacket.first().should.deep.eq([16, 2, 80, 20, 0, 118, 16, 3])
                    })
                    .then(function(){
                        return bottle.container.queuePacket.eject()
                    })
                    .then(done,done)

            })

            it('#queuePacket should try to write a pump packet with checksum', function() {
                bottle.container.queuePacket.queuePacket(pumpPacket)
                //console.log('bottle.container.queuePacket.first()', bottle.container.queuePacket.first())
                bottle.container.queuePacket.first().should.deep.eq([255, 0, 255, 165, 0, 96, 16, 6, 1, 10, 1, 38])
                bottle.container.queuePacket.eject()

            })

            it('#queuePacket should try to write a controller packet with checksum', function() {
                bottle.container.queuePacket.queuePacket(controllerPacket)
                //console.log('bottle.container.queuePacket.first()', bottle.container.queuePacket.first())
                bottle.container.queuePacket.first().should.deep.eq([255, 0, 255, 165, 99, 16, 34, 134, 2, 9, 0, 1, 203])
                bottle.container.queuePacket.eject()

            })
        })
    })


    describe('#When queueing packets', function() {
        context('with write queue active = false (should write packets); multiple tries', function() {

            var pumpPacket = [165, 0, 96, 16, 6, 1, 10],
                chlorinatorPacket = [16, 2, 80, 20, 0],
                controllerPacket = [165, 99, 16, 34, 134, 2, 9, 0]
            before(function() {

                bottle.container.settings.logMessageDecoding = 1
                bottle.container.settings.logPacketWrites = 1
                bottle.container.settings.logConsoleNotDecoded = 1
                bottle.container.settings.netConnect = 0 //serial port, and not net connect
                bottle.container.logger.transports.console.level = 'silly';
            });

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                clock = sandbox.useFakeTimers()
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
                loggerErrorStub = sandbox.stub(bottle.container.logger, 'error')

                queuePacketStub = sandbox.spy(bottle.container.queuePacket, 'queuePacket')
                // pumpCommandSpy = sandbox.spy(bottle.container.pumpControllerMiddleware, 'pumpCommand')
                //writeQueueActiveStub = sandbox.stub(bottle.container.writePacket, 'isWriteQueueActive').returns(false)
                //writeNetPacketStub = sandbox.spy(bottle.container.sp, 'writeNET')
                writeSPPacketStub = sandbox.stub(bottle.container.sp, 'writeSP').callsFake(function(){bottle.container.writePacket.postWritePacketHelper()})

                bottle.container.queuePacket.queuePacketsArrLength = 0
                bottle.container.writePacket.init()
            })

            afterEach(function() {
                bottle.container.queuePacket.queuePacketsArrLength = 0
                sandbox.restore()

            })

            after(function() {
                bottle.container.settings.logPacketWrites = 0
                bottle.container.settings.logMessageDecoding = 0
                bottle.container.settings.logConsoleNotDecoded = 0
                bottle.container.logger.transports.console.level = 'info';
            })

            it('#queuePacket should try to abort the write after 10 tries', function() {

                bottle.container.queuePacket.queuePacket(controllerPacket)
                bottle.container.queuePacket.first().should.deep.eq([255, 0, 255, 165, 99, 16, 34, 134, 2, 9, 0, 1, 203])
                clock.tick(5000)
                loggerWarnStub.calledOnce
                loggerErrorStub.calledOnce
                loggerErrorStub.args[0][0].should.contain('Aborting controller packet')
                //console.log('container.writePacket.isWriteQueueActive()', bottle.container.writePacket.isWriteQueueActive())
            })
        })
    })



})
