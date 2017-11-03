describe('processes Intellichem packets', function() {
    var intellichemPackets = [
        [165,16,15,16,18,41,2,227,2,175,2,238,2,188,0,0,0,2,0,0,0,42,0,4,0,92,6,5,24,1,144,0,0,0,150,20,0,81,0,0,101,32,60,1,0,0,0,7,116]
    ]

    var equip = 'controller'

    describe('#When packets arrive', function() {
        context('via serialport or Socat', function() {

            before(function() {
              bottle.container.settings.logConfigMessages = 1
                //bottle.container.settings.logMessageDecoding = 1
                //bottle.container.settings.logPacketWrites = 1
                //bottle.container.settings.logConsoleNotDecoded = 1
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

                // queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
                // // pumpCommandSpy = sandbox.spy(bottle.container.pumpControllerMiddleware, 'pumpCommand')
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
                //bottle.container.queuePacket.queuePacketsArrLength = 0
            })

            afterEach(function() {
                //bottle.container.queuePacket.queuePacketsArrLength = 0
                sandbox.restore()

            })

            after(function() {
              bottle.container.settings.logConfigMessages = 0
                //bottle.container.settings.logPacketWrites = 0
                //bottle.container.settings.logMessageDecoding = 0
                //bottle.container.settings.logConsoleNotDecoded = 0
                bottle.container.logger.transports.console.level = 'info';
            })

            it('#SI should equal -0.31', function() {

                //    bottle.container.decodeHelper.checksum(testarrayGOOD[0], 25, equip).should.be.true

                bottle.container.controller_18.process(intellichemPackets[0], 0)
                var json = bottle.container.intellichem.getIntellichem()
                //console.log('json for intellichem: ', JSON.stringify(json,null,2))
                json.readings.SI.should.equal(-0.31)
            })



            //
            // it('should try to decode the packet as a controller packet', function() {
            //
            //     // bottle.container.settings.logMessageDecoding = 1
            //     // bottle.container.logger.transports.console.level = 'silly'
            //
            //     for (var i = 0; i < testarrayGOOD.length; i++) {
            //         bottle.container.decodeHelper.processChecksum(testarrayGOOD[i], i * 10, equip)
            //         // console.log('testarrayGOOD:', testarrayGOOD[i])
            //         // console.log('processControllerPacketStub.args', processControllerPacketStub.args)
            //         processControllerPacketStub.args[i][0].should.contain.members(testarrayGOOD[i])
            //         processPumpPacketStub.callCount.should.eq(0)
            //         processChlorinatorPacketStub.callCount.should.eq(0)
            //     }
            // })
            //


            // it('#isResponse should return false', function() {
            //
            //     // var checksumStub = sinon.stub()
            //     // checksumStub.returns(true)
            //     // var successfulAckStub = sinon.stub()
            //     //
            //     // var isResponseStub = sinon.stub()
            //     // isResponseStub.returns(true)
            //     // var decodeStub = sinon.stub()
            //     //
            //     // //myModule.__set__("checksum", checksumStub)
            //     //
            //     // myModule.__with__({
            //     //     'checksum': function() {
            //     //         return 'hello'
            //     //     },
            //     //     //'fred': function(){console.log('WAS CALLED')},
            //     //     'bottle.container': {
            //     //         'queuePacket': {
            //     //             'first': function() {
            //     //                 return [255, 0, 255, 165, 0, 96, 16, 1, 4, 3, 39, 3, 32, 1, 103]
            //     //             }
            //     //         },
            //     //         'logger': {
            //     //             silly: function() {},
            //     //             error: function() {}
            //     //         }
            //     //     },
            //     //     'decode': decodeStub,
            //     //
            //     //     'isResponse': isResponseStub,
            //     //     'successfulAck': successfulAckStub
            //
            //     // })(function() {
            //     for (var i = 0; i < testarrayGOOD.length; i++) {
            //
            //     }
            //     // })
            // })
        })
    })
})
