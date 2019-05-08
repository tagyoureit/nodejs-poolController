//TODO: Implement this

/*
describe('chlorinator packets: receives packets from buffer and follows them to decoding', function () {


    describe('#Without an intellitouch controller', function () {
        context('via serialport or Socat and ending with Socket.io', function () {

            before(async function () {

            });

            beforeEach(function () {
                await globalAny.initAllAsync({'configLocation': './specs/assets/config/templates/config_intellichlor_virtual.json'})
                    .then(function () {
                        sinon = sinon.sinon.create()
                        loggers = globalAny.setupLoggerStubOrSpy('stub', 'spy')

                        queuePacketStub = sinon.stub(queuePacket, 'queuePacket')

                        // intellitouchStub = sinon.stub(intellitouch, 'checkIfNeedControllerConfiguration').returns(false)
                        //
                        updateAvailStub = sinon.stub(updateAvailable, 'getResultsAsync').returns(Promise.resolve({}))


                       // getVersionNotificationStub = sinon.stub(settings, 'get').withArgs('notifications.version.remote').returns({'dismissUntilNextRemoteVersionBump': true})


                    })

            })

            afterEach(function () {
                return Promise.resolve()
                    .then(function () {
                        return sinon.restore()
                    })
                    .then(function () {
                        await globalAny.stopAllAsync()
                    })
                    .then(function () {

                        return chlorinator.init()

                    })
                    .then(function () {
                        return chlorinatorController.clearTimer()
                    })
                    .catch(function (err) {
                        console.error('Error in after each:', err)
                        sinon.restore()
                    })

            })

            after(async function () {
                await globalAny.stopAllAsync()
            })

            it('#decodes status messages received from Intellitouch', function () {

                // 17:18:54.775 DEBUG Msg# 128   Chlorinator status packet: 165,16,15,16,25,22,25,9,128,23,133,0,73,110,116,101,108,108,105,99,104,108,111,114,45,45,52,48,7,232
                // updateChlorinatorStatusFromController: 23 9 25 133 Intellichlor--40 128
                // 17:18:54.775 INFO Msg# 128   Initial chlorinator settings discovered:  {"saltPPM":1150,"outputPoolPercent":9,"outputSpaPercent":12,"SuperChlorinate":0,"status":133,"name":"Intellichlor--40"}
                var chlorinatorPkt_chk = [255, 0, 255, 165, 16, 15, 16, 25, 22, 25, 9, 128, 23, 133, 0, 73, 110, 116, 101, 108, 108, 105, 99, 104, 108, 111, 114, 45, 45, 52, 48, 7, 232]
                var client
                // return Promise.resolve()
                //     .then(function() {

                return Promise.resolve()
                    .then(function () {
                        chlorinator.getChlorinatorStatus().chlorinator.saltPPM.should.eq(-1)
                        packetBuffer.push(new Buffer(chlorinatorPkt_chk))
                    })
                    .then(function () {
                        return globalAny.waitForSocketResponseAsync('chlorinator')
                            .then(function (data) {
                                data.chlorinator.saltPPM.should.eq(1150)
                                chlorinator.getChlorinatorStatus().chlorinator.saltPPM.should.eq(1150)
                            })

                    })
            })

            it('#decodes status messages received from Intellichlor, and does not request name on subsequent chlorinator packets', function (done) {

                // 17:18:54.775 DEBUG Msg# 128   Chlorinator status packet: 165,16,15,16,25,22,25,9,128,23,133,0,73,110,116,101,108,108,105,99,104,108,111,114,45,45,52,48,7,232
                // updateChlorinatorStatusFromController: 23 9 25 133 Intellichlor--40 128
                // 17:18:54.775 INFO Msg# 128   Initial chlorinator settings discovered:  {"saltPPM":1150,"outputPoolPercent":9,"outputSpaPercent":12,"SuperChlorinate":0,"status":133,"name":"Intellichlor--40"}
                var chlorPkt_GetStatus = [16, 2, 80, 0, 0, 98, 16, 3]

                var chlorPkt_StatusResponse = [16, 2, 0, 1, 0, 0, 19, 16, 3]
                var chlorPkt2_StatusResponse = [16, 2, 80, 1, 0, 0, 99, 16, 3]
                var chlorPkt_SetGeneratePercent = [16, 2, 80, 17, 3, 118, 16, 3]
                var chlorPkt_SetSuperChlor = [16, 2, 80, 17, 101, 216, 16, 3]
                var chlorPkt2_SetGeneratePercent = [16, 2, 80, 21, 39, 158, 16, 3]
                var chlorPkt_GetVersion = [16, 2, 80, 20, 0, 118, 16, 3]
                var chlorPkt_chk = [16, 2, 0, 0, 0, 0, 18, 16, 3]


                var chlorinatorPkt_Controller = [255, 0, 255, 16, 2, 0, 3, 0, 73, 110, 116, 101, 108, 108, 105, 99, 104, 108, 111, 114, 45, 45, 52, 48, 188, 16, 3]
                var chlorinatorPkt2_Controller = [255, 0, 255, 16, 2, 0, 3, 0, 73, 110, 116, 101, 108, 108, 105, 99, 104, 108, 111, 114, 45, 45, 52, 48, 188, 16, 3]

                var client;
                //return
                Promise.resolve()

                    .then(function () {

                        // settings.updateChlorinatorNameAsync(-1)
                        // chlorinator.init()

                        chlorinator.getChlorinatorStatus().chlorinator.name.should.eq(-1)
                        packetBuffer.push(new Buffer(chlorPkt_StatusResponse))
                        packetBuffer.push(new Buffer(chlorinatorPkt_Controller))
                        packetBuffer.push(new Buffer(chlorinatorPkt2_Controller))
                        packetBuffer.push(new Buffer(chlorPkt_StatusResponse))
                        packetBuffer.push(new Buffer(chlorPkt_StatusResponse))

                        packetBuffer.push(new Buffer(chlorPkt2_StatusResponse))
                        packetBuffer.push(new Buffer(chlorPkt_SetGeneratePercent))
                        packetBuffer.push(new Buffer(chlorPkt2_SetGeneratePercent))
                        packetBuffer.push(new Buffer(chlorPkt_GetVersion))
                        packetBuffer.push(new Buffer(chlorPkt_GetStatus))
                        packetBuffer.push(new Buffer(chlorPkt_SetSuperChlor))
                        packetBuffer.push(new Buffer(chlorPkt_chk))
                    })
                    .delay(100)
                    .then(function () {
                        //clock.tick(1000)
                        chlorinator.getChlorinatorStatus().chlorinator.name.should.eq(`Intellichlor--40`)

                        client = globalAny.ioclient.connect(globalAny.socketURL, globalAny.socketOptions)
                        client.on('chlorinator', function (data) {
                            data.chlorinator.name.should.eq(`Intellichlor--40`)
                            client.disconnect()
                            done()
                        })
                    })


            })

            it('#decodes status messages received from Intellitouch, and processes same message and changes', function (done) {

                // 17:18:54.775 DEBUG Msg# 128   Chlorinator status packet: 165,16,15,16,25,22,25,9,128,23,133,0,73,110,116,101,108,108,105,99,104,108,111,114,45,45,52,48,7,232
                // updateChlorinatorStatusFromController: 23 9 25 133 Intellichlor--40 128
                // 17:18:54.775 INFO Msg# 128   Initial chlorinator settings discovered:  {"saltPPM":1150,"outputPoolPercent":9,"outputSpaPercent":12,"SuperChlorinate":0,"status":133,"name":"Intellichlor--40"}
                var chlorinatorPkt_chk = [255, 0, 255, 165, 16, 15, 16, 25, 22, 25, 0, 128, 23, 133, 0, 73, 110, 116, 101, 108, 108, 105, 99, 104, 108, 111, 114, 45, 45, 52, 48, 7, 223]
                var chlorinatorPkt2_chk = [255, 0, 255, 165, 16, 15, 16, 25, 22, 25, 10, 128, 23, 255, 0, 73, 110, 116, 101, 108, 108, 105, 99, 104, 108, 111, 114, 45, 45, 52, 48, 8, 99]

                 Promise.resolve()

                    .then(function () {

                        // settings.updateChlorinatorNameAsync(-1)
                        // chlorinator.init()
                        chlorinator.getChlorinatorStatus().chlorinator.name.should.eq(-1)
                        packetBuffer.push(new Buffer(chlorinatorPkt_chk))
                        packetBuffer.push(new Buffer(chlorinatorPkt_chk))
                        packetBuffer.push(new Buffer(chlorinatorPkt2_chk))
                    })
                    .delay(100)
                    .then(function () {

                        chlorinator.getChlorinatorStatus().chlorinator.name.should.eq(`Intellichlor--40`)

                        settings.get('equipment.chlorinator.id.productName').should.equal('Intellichlor--40')
                        chlorinator.getChlorinatorName().should.equal('Intellichlor--40')
                    })
                     .then(done,done)


            })
        })
        context('via serialport or Socat and ending with Socket.io', function () {

            before(async function () {

            });

            beforeEach(function () {
                await globalAny.initAllAsync({'configLocation': './specs/assets/config/templates/config_intellitouch_intellichlor.json'})
                    .then(function () {
                        // sinon = sinon.sinon.create()
                        loggers = globalAny.setupLoggerStubOrSpy('stub', 'spy')

                        queuePacketStub = sinon.stub(queuePacket, 'queuePacket')

                        updateAvailStub = sinon.stub(updateAvailable, 'getResultsAsync').returns(Promise.resolve({}))

                    })

            })

            afterEach(function () {
                return Promise.resolve()
                    .then(function () {
                        sinon.restore()

                    })
                    .then(globalAny.stopAllAsync)
                    .then(function () {

                        return chlorinator.init()

                    })
                    .then(function () {
                        return chlorinatorController.clearTimer()
                    })


            })

            after(async function () {

            })

            it('#decodes status packet and does not request name with Intellitouch present', function () {

                // 17:18:54.775 DEBUG Msg# 128   Chlorinator status packet: 165,16,15,16,25,22,25,9,128,23,133,0,73,110,116,101,108,108,105,99,104,108,111,114,45,45,52,48,7,232
                // updateChlorinatorStatusFromController: 23 9 25 133 Intellichlor--40 128
                // 17:18:54.775 INFO Msg# 128   Initial chlorinator settings discovered:  {"saltPPM":1150,"outputPoolPercent":9,"outputSpaPercent":12,"SuperChlorinate":0,"status":133,"name":"Intellichlor--40"}
                var chlorinatorPkt_chk = [16, 2, 0, 1, 0, 0, 19, 16, 3]

                return Promise.resolve()
                    .then(function () {
                        chlorinator.getChlorinatorStatus().chlorinator.name.should.eq(-1)
                        packetBuffer.push(new Buffer(chlorinatorPkt_chk))
                    })
                    .delay(50)
                    .then(function () {
                        queuePacketStub.callCount.should.eq(0)
                        // loggers.loggerVerboseStub.args[0][0].should.contain('I am here')  // this breaks if debugLog is changed.  find a better test.
                    })


            })

            it('#decodes status packet and requests name with Intellitouch virtual controller started', function (done) {
                // 17:18:54.775 DEBUG Msg# 128   Chlorinator status packet: 165,16,15,16,25,22,25,9,128,23,133,0,73,110,116,101,108,108,105,99,104,108,111,114,45,45,52,48,7,232
                // updateChlorinatorStatusFromController: 23 9 25 133 Intellichlor--40 128
                // 17:18:54.775 INFO Msg# 128   Initial chlorinator settings discovered:  {"saltPPM":1150,"outputPoolPercent":9,"outputSpaPercent":12,"SuperChlorinate":0,"status":133,"name":"Intellichlor--40"}
                var chlorinatorPkt_chk = [255, 0, 255, 16, 2, 0, 1, 0, 0, 19, 16, 3]
                Promise.resolve()
                    .then(function () {
                        settings.set('equipment.controller.virtual.chlorinatorController', 'always')
                        packetBuffer.push(new Buffer(chlorinatorPkt_chk))
                    })
                    .delay(25)
                    .then(function () {

                        queuePacketStub.args[0][0].should.deep.equal([16, 2, 80, 20, 0]) //request name
                        // loggers.loggerVerboseStub.args[0][0].should.contain('I am here') // this breaks if debugLog is changed.  find a better test.

                        chlorinatorController.isChlorinatorTimerRunning().should.eq(1)

                    })
                    .then(done, done)
            })
        })
    })
})

*/
