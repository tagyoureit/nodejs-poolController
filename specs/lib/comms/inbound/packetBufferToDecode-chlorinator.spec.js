describe('chlorinator packets: receives packets from buffer and follows them to decoding', function() {


    describe('#Without an intellitouch controller', function() {
        context('via serialport or Socat and ending with Socket.io', function() {

            before(function() {
                return global.initAll()
            });

            beforeEach(function() {

                sandbox = sinon.sandbox.create()
                //clock = sandbox.useFakeTimers()
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
                loggerErrorStub = sandbox.stub(bottle.container.logger, 'error')
                queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')

                intellitouchStub = sandbox.stub(bottle.container.intellitouch, 'checkIfNeedControllerConfiguration').returns(false)

                updateAvailStub = sandbox.stub(bottle.container.updateAvailable, 'getResults').returns({})
                getVersionNotificationStub = sandbox.stub(bottle.container.configEditor, 'getVersionNotification').returns({'dismissUntilNextRemoteVersionBump':true})
                receiveBufferStub = sandbox.spy(bottle.container.receiveBuffer, 'getProcessingBuffer')
                socketIOSpy = sandbox.spy(bottle.container.io, 'emitToClients')
                iOAOAStub = sandbox.spy(bottle.container.receiveBuffer, 'iterateOverArrayOfArrays')
                fsStub = sandbox.spy(bottle.container.fs, 'writeFileAsync')//.returns(Promise.resolve())

            })

            afterEach(function() {
                bottle.container.chlorinator.init()
                sandbox.restore()

            })

            after(function() {
                return global.stopAll()
            })

            it('#decodes status messages received from Intellichlor', function(done) {

                // 17:18:54.775 DEBUG Msg# 128   Chlorinator status packet: 165,16,15,16,25,22,25,9,128,23,133,0,73,110,116,101,108,108,105,99,104,108,111,114,45,45,52,48,7,232
                // setChlorinatorStatusFromController: 23 9 25 133 Intellichlor--40 128
                // 17:18:54.775 INFO Msg# 128   Initial chlorinator settings discovered:  {"saltPPM":1150,"outputPoolPercent":9,"outputSpaPercent":12,"SuperChlorinate":0,"status":133,"name":"Intellichlor--40"}
                var chlorinatorPkt_chk = [255, 0, 255, 165, 16, 15, 16, 25, 22, 25, 9, 128, 23, 133, 0, 73, 110, 116, 101, 108, 108, 105, 99, 104, 108, 111, 114, 45, 45, 52, 48, 7, 232]
                var client
                Promise.resolve()
                    .then(function(){
                        bottle.container.chlorinator.getChlorinatorStatus().chlorinator.saltPPM.should.eq(-1)
                        bottle.container.packetBuffer.push(new Buffer(chlorinatorPkt_chk))

                        // console.log('queuePacketStub: ', queuePacketStub.args)
                        bottle.container.chlorinator.getChlorinatorStatus().chlorinator.saltPPM.should.eq(1150)

                        client = global.ioclient.connect(global.socketURL, global.socketOptions)
                        client.on('chlorinator', function(data) {
//                            console.log('chlorinator:', data)
                            data.chlorinator.saltPPM.should.eq(1150)
                            client.disconnect()
                        })
                    })
                    .delay(50)  // need this in here for time to process, otherwise we get a circular reference error
                    .then(done,done)



            })

            it('#decodes status messages received from Intellichlor, and does not request name on subsequent chlorinator packets', function(done) {

                // 17:18:54.775 DEBUG Msg# 128   Chlorinator status packet: 165,16,15,16,25,22,25,9,128,23,133,0,73,110,116,101,108,108,105,99,104,108,111,114,45,45,52,48,7,232
                // setChlorinatorStatusFromController: 23 9 25 133 Intellichlor--40 128
                // 17:18:54.775 INFO Msg# 128   Initial chlorinator settings discovered:  {"saltPPM":1150,"outputPoolPercent":9,"outputSpaPercent":12,"SuperChlorinate":0,"status":133,"name":"Intellichlor--40"}
                var chlorinatorPkt_chk = [255, 0, 255, 16, 2, 0, 3, 0, 73, 110, 116, 101, 108, 108, 105, 99, 104, 108, 111, 114, 45, 45, 52, 48, 188, 16, 3]
                var client;
                Promise.resolve()

                    .then(function() {
                        bottle.container.configEditor.updateChlorinatorName(-1)
                        bottle.container.chlorinator.init()
                        bottle.container.chlorinator.getChlorinatorStatus().chlorinator.name.should.eq(-1)
                        bottle.container.packetBuffer.push(new Buffer(chlorinatorPkt_chk))

                        bottle.container.chlorinator.getChlorinatorStatus().chlorinator.name.should.eq(`Intellichlor--40`)

                        client = global.ioclient.connect(global.socketURL, global.socketOptions)
                        client.on('chlorinator', function(data) {
                            data.chlorinator.name.should.eq(`Intellichlor--40`)
                            client.disconnect()
                        })
                    })
                    .delay(50)
                    .then(done,done)

            })


            it('#decodes status packet and does not request name with Intellitouch present', function(done) {

                // 17:18:54.775 DEBUG Msg# 128   Chlorinator status packet: 165,16,15,16,25,22,25,9,128,23,133,0,73,110,116,101,108,108,105,99,104,108,111,114,45,45,52,48,7,232
                // setChlorinatorStatusFromController: 23 9 25 133 Intellichlor--40 128
                // 17:18:54.775 INFO Msg# 128   Initial chlorinator settings discovered:  {"saltPPM":1150,"outputPoolPercent":9,"outputSpaPercent":12,"SuperChlorinate":0,"status":133,"name":"Intellichlor--40"}
                var chlorinatorPkt_chk = [255, 0, 255, 16, 2, 0, 1, 0, 0, 19, 16, 3]
                isRunningStub = sandbox.stub(bottle.container.chlorinatorController, 'isChlorinatorTimerRunning').returns(1)
                Promise.resolve()
                    .then(function() {
                        bottle.container.configEditor.updateChlorinatorName(-1)
                        bottle.container.chlorinator.init()

                        bottle.container.chlorinator.getChlorinatorStatus().chlorinator.name.should.eq(-1)
                        bottle.container.packetBuffer.push(new Buffer(chlorinatorPkt_chk))

                        // console.log('queuePacketStub: ', queuePacketStub.args)
                        queuePacketStub.args[0][0].should.deep.eq([16, 2, 80, 20, 0]) //request name
                        loggerVerboseStub.args[0][0].should.contain('I am here')

                        var client = global.ioclient.connect(global.socketURL, global.socketOptions)
                        client.on('connect', function () {
                            bottle.container.io.emitToClients('chlorinator')
                        })
                        client.on('chlorinator', function (data) {
                            // console.log('chlorinator:', data)
                            data.chlorinator.name.should.eq(-1)
                            client.disconnect()

                        })
                    })
                    .delay(50)
                    .then(done,done)
            })

            it('#decodes status packet and requests name without Intellitouch controller', function(done) {

                // 17:18:54.775 DEBUG Msg# 128   Chlorinator status packet: 165,16,15,16,25,22,25,9,128,23,133,0,73,110,116,101,108,108,105,99,104,108,111,114,45,45,52,48,7,232
                // setChlorinatorStatusFromController: 23 9 25 133 Intellichlor--40 128
                // 17:18:54.775 INFO Msg# 128   Initial chlorinator settings discovered:  {"saltPPM":1150,"outputPoolPercent":9,"outputSpaPercent":12,"SuperChlorinate":0,"status":133,"name":"Intellichlor--40"}
                bottle.container.settings.set('intellitouch.installed', 0)
                isRunningStub = sandbox.stub(bottle.container.chlorinatorController, 'isChlorinatorTimerRunning').returns(1)
                var chlorinatorPkt_chk = [255, 0, 255, 16, 2, 0, 1, 0, 0, 19, 16, 3]
                Promise.resolve()
                    .then(function() {
                        bottle.container.configEditor.updateChlorinatorName(-1)
                        bottle.container.chlorinator.init()
                        bottle.container.chlorinator.getChlorinatorStatus().chlorinator.name.should.eq(-1)
                        bottle.container.packetBuffer.push(new Buffer(chlorinatorPkt_chk))

                        // console.log('queuePacketStub: ', queuePacketStub.args)
                        queuePacketStub.args[0][0].should.deep.eq([16, 2, 80, 20, 0]) //request name
                        loggerVerboseStub.args[0][0].should.contain('I am here')

                        var client = global.ioclient.connect(global.socketURL, global.socketOptions)
                        client.on('connect', function() {
                            bottle.container.io.emitToClients('chlorinator')
                        })

                        client.on('chlorinator', function(data) {
                            // console.log('chlorinator:', data)
                            data.chlorinator.name.should.eq(-1)
                            client.disconnect()

                        })
                    })
                    .delay(50)
                    .then(done,done)
            })
        })
    })
})
