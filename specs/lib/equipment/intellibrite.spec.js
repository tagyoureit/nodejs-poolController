describe('processes Intellibrite packets',function () {

    var circuitPackets = [
        Buffer.from([255,0,255,165,33,15,16,11,5,1,1,72,0,0,1,63]),
        Buffer.from([255,0,255,165,33,15,16,11,5,2,0,46,0,0,1,37]),
        Buffer.from([255,0,255,165,33,15,16,11,5,7,16,74,0,0,1,86]),
        Buffer.from([255,0,255,165,33,15,16,11,5,8,16,63,0,0,1,76]),
        Buffer.from([255,0,255,165,33,15,16,11,5,16,16,41,0,0,1,62])
    ]
    var intellibriteAssignment = [255,0,255,165,33,15,16,39,32,7,8,4,0,8,20,10,0,16,32,10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,159] //light group and colorSet assignments
    // issue 99
    var issue99 = [255,0,255,165,1,15,16,39,25,0,3,0,0,0,4,16,10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,38]



    var intellibriteCyan = [255,0,255,165,33,16,34,167,32,7,12,4,0,8,22,10,0,16,32,10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,56] // change pool light to cyan and spa light to magenta


    var intellibritePosition1 = [255,0,255,165,33,16,34,167,32,7,12,4,0,8,22,10,0,16,0,10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,24] // change pool light to cyan and spa light to magenta


    var intellibriteSwimDelay = [255,0,255,165,33,16,34,167,32,7,12,4,0,8,22,14,0,16,32,10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,60] // change pool light swim delay to 7
    var intellibriteSwimDelay10 = [255,0,255,165,33,16,34,167,32,7,12,4,0,8,22,20,0,16,32,10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,66] // change pool light swim delay to 10

    var intellibriteOff = [255,0,255,165,33,16,34,96,2,0,0,1,90] // intellibrite lights to off
    var intellibriteOn = [255,0,255,165,33,16,34,96,2,1,0,1,91] // intellibrite lights to on
    var intellibriteColorSet = [255,0,255,165,33,16,34,96,2,160,0,1,250] // intellibrite lights to color set
    var intellibriteCaribbean = [255,0,255,165,33,16,34,96,2,179,0,2,13] // intellibrite to caribbean
    var intellibriteSave = [255,0,255,165,33,16,34,96,2,190,0,2,24] // intellibrite save
    var intellibriteRecall = [255,0,255,165,33,16,34,96,2,191,0,2,25] // intellibrite recall

    // 2 intellibrite controllers; raised by issue 99
    var intellibrite2_1 = [255,0,255,165,1,15,16,39,25,0,3,0,0,0,4,16,10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,38]
    var intellibrite2_2 = [255,0,255,165,1,15,16,39,25,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,6]

    var equip = 'controller'

    describe('#When packets arrive',function () {
        context('via serialport or Socat',function () {

            before(function () {
                return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config_intellibrite.json'})
            });

            beforeEach(function () {
                // sinon = sinon.sinon.create()
                loggers = setupLoggerStubOrSpy('stub','spy')
                checkIfNeedControllerConfigurationStub = sinon.stub(bottle.container.intellitouch,'checkIfNeedControllerConfiguration')

            })

            afterEach(function () {
                sinon.restore()

            })

            after(function () {
                   return global.stopAllAsync()
            })

            it('#Tests incoming packets with 2 Intellibrite controllers',function () {
                return Promise.resolve()
                    .then(function () {
                        bottle.container.packetBuffer.push(new Buffer(intellibrite2_1))
                        bottle.container.packetBuffer.push(new Buffer(intellibrite2_2))

                    })
                    .delay(50)
                    .then(function () {
                        var json = bottle.container.circuit.getLightGroup()
                        // console.log('all lights:',JSON.stringify(json))
                        json[3].circuit.should.eq(3)
                        json[4].colorSwimDelay.should.eq(5)
                    })
                    .catch(function (err) {
                        return Promise.reject(new Error('Cyan: ' + err))
                    })

            })
        })
    })

    describe('#When packets arrive',function () {
        context('via serialport or Socat',function () {

            before(function () {
                return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config_intellibrite.json'})
            });

            beforeEach(function () {
                // sinon = sinon.sinon.create()
                loggers = setupLoggerStubOrSpy('stub','spy')
                checkIfNeedControllerConfigurationStub = sinon.stub(bottle.container.intellitouch,'checkIfNeedControllerConfiguration').returns(0)

            })

            afterEach(function () {
                sinon.restore()

            })

            after(function () {
                //   return global.stopAllAsync()
            })

            it('#Loads circuit information',function () {
                return Promise.resolve()
                    .then(function () {
                        for (var i in circuitPackets) {
                            bottle.container.packetBuffer.push(circuitPackets[i])
                        }
                    })
                    .delay(50)
                    .then(function () {
                        var json = bottle.container.circuit.getCurrentCircuits().circuit
                        // console.log('current Circuits:',JSON.stringify(json))
                        json[1].number.should.equal(1)
                        json[1].name.should.equal("SPA")
                    })
            })

            it('#Light positions and colors should be discovered',function () {
                return Promise.resolve()
                    .then(function () {
                        bottle.container.packetBuffer.push(new Buffer(intellibriteAssignment))

                    })
                    .delay(50)
                    .then(function () {
                        var json = bottle.container.circuit.getLightGroup()
                        // console.log('all lights:',JSON.stringify(json))
                        json[7].position.should.eq(1)
                        json[7].colorSet.should.eq(8)
                        json[8].colorSwimDelay.should.eq(5)
                    })
                    .catch(function (err) {
                        return Promise.reject(new Error('Light positions: ' + err))
                    })

            })

            it('#Changes pool light colorSet to Cyan',function () {
                return Promise.resolve()
                    .then(function () {
                        bottle.container.packetBuffer.push(new Buffer(intellibriteCyan))

                    })
                    .delay(50)
                    .then(function () {
                        var json = bottle.container.circuit.getLightGroup()
                        // console.log('all lights:',JSON.stringify(json))
                        json[8].colorSet.should.eq(6)
                        json[8].colorSetStr.should.eq('Cyan')
                    })
                    .catch(function (err) {
                        return Promise.reject(new Error('Cyan: ' + err))
                    })

            })

            it('#Changes garden lights position to 1',function () {
                return Promise.resolve()
                    .then(function () {
                        bottle.container.packetBuffer.push(new Buffer(intellibritePosition1))

                    })
                    .delay(50)
                    .then(function () {
                        var json = bottle.container.circuit.getLightGroup()
                        // console.log('all lights:',JSON.stringify(json))
                        json[16].position.should.eq(1)
                    })
                    .then(function () {
                        //reset it to position 3
                        bottle.container.packetBuffer.push(new Buffer(intellibriteCyan))

                    })
                    // .catch(function (err) {
                    //     return Promise.reject(new Error('Position: ' + err))
                    // })

            })

            it('#Changes pool swim delay to 7',function () {
                return Promise.resolve()
                    .then(function () {
                        bottle.container.packetBuffer.push(new Buffer(intellibriteSwimDelay))

                    })
                    .delay(50)
                    .then(function () {
                        var json = bottle.container.circuit.getLightGroup()
                        // console.log('all lights:',JSON.stringify(json))
                        json[8].colorSwimDelay.should.eq(7)
                    })
                    .catch(function (err) {
                        return Promise.reject(new Error('Swim Delay: ' + err))
                    })

            })


            it('#Changes Intellibrite to Color Set',function () {

                /* var _circuit = {
                     "number": 8,
                     "numberStr": "circuit8",
                     "name": "POOL LIGHT",
                     "circuitFunction": "Intellibrite",
                     "freeze": 0,
                     "macro": 0,
                     "light": {
                         "position": 2,
                         "colorStr": "Custom",
                         "color": -1,
                         "colorSet": 6,
                         "colorSetStr": "Cyan",
                         "prevColor": "Cyan",
                         "colorSwimDelay": 5,
                         "mode": -1,
                         "modeStr": "Custom"
                     }
                 }*/


                return Promise.resolve()
                    .then(function () {
                        bottle.container.packetBuffer.push(new Buffer(intellibriteColorSet))

                    })
                    .delay(50)
                    .then(function () {
                        var json = bottle.container.circuit.getCircuit(7)
                        // console.log('circuit 7:',JSON.stringify(json,null,2))
                        json.light.mode.should.eq(160)
                        json.light.modeStr.should.eq('Color Set')
                        json.light.colorStr.should.eq('Magenta')
                        json = bottle.container.circuit.getCircuit(8)
                        // console.log('circuit 8:',JSON.stringify(json,null,2))
                        json.light.mode.should.eq(160)
                        json.light.modeStr.should.eq('Color Set')
                        json.light.colorStr.should.eq('Cyan')
                    })
                    .catch(function (err) {
                        return Promise.reject(new Error('Color Set: ' + err))
                    })

            })


            it('#Changes Intellibrite to Off',function () {
                return Promise.resolve()
                    .then(function () {
                        bottle.container.packetBuffer.push(new Buffer(intellibriteOff))

                    })
                    .delay(50)
                    .then(function () {
                        var json = bottle.container.circuit.getCircuit(8)
                        // console.log('circuit:',JSON.stringify(json))
                        json.light.mode.should.eq(0)
                        json.light.modeStr.should.eq('Off')
                        json.light.color.should.eq(0)
                        json.light.prevColor.should.eq(6)
                        json.light.prevColorStr.should.eq('Cyan')
                        json.light.prevMode.should.eq(160)
                    })
                    .catch(function (err) {
                        return Promise.reject(new Error('Off: ' + err))
                    })

            })


            it('#Changes Intellibrite to On',function () {
                return Promise.resolve()
                    .then(function () {
                        bottle.container.packetBuffer.push(new Buffer(intellibriteOn))

                    })
                    .delay(50)
                    .then(function () {
                        var json = bottle.container.circuit.getCircuit(8)
                        // console.log('circuit:',JSON.stringify(json))
                        json.light.mode.should.eq(160)
                        json.light.modeStr.should.eq('Color Set')
                        json.light.colorStr.should.eq('Cyan')
                        json.light.prevMode.should.eq(0)
                    })
                    .catch(function (err) {
                        return Promise.reject(new Error('On: ' + err))
                    })

            })

            it('#Changes Intellibrite to Caribbean',function () {
                return Promise.resolve()
                    .then(function () {
                        bottle.container.packetBuffer.push(new Buffer(intellibriteCaribbean))

                    })
                    .delay(50)
                    .then(function () {
                        var json = bottle.container.circuit.getCircuit(8)
                        // console.log('circuit:',JSON.stringify(json))
                        json.light.modeStr.should.eq('Caribbean')
                        json.light.mode.should.eq(179)
                        json.light.colorStr.should.eq('Caribbean')
                        json.light.color.should.eq(179)
                    })
                    .catch(function (err) {
                        return Promise.reject(new Error('Caribbean: ' + err))
                    })

            })

            it('#Changes Intellibrite to Save',function () {
                return Promise.resolve()
                    .then(function () {
                        bottle.container.packetBuffer.push(new Buffer(intellibriteSave))

                    })
                    .delay(50)
                    .then(function () {
                        var json = bottle.container.circuit.getCircuit(8)
                        // console.log('circuit:',JSON.stringify(json))
                        json.light.mode.should.eq(190)
                        json.light.modeStr.should.eq('Save')
                        json.light.color.should.eq(190)
                        json.light.colorStr.should.eq('Save')
                    })
                    .catch(function (err) {
                        return Promise.reject(new Error('Save: ' + err))
                    })

            })

            it('#Changes Intellibrite to Recall',function () {
                return Promise.resolve()
                    .then(function () {
                        bottle.container.packetBuffer.push(new Buffer(intellibriteCyan))

                    })
                    .delay(50)
                    .then(function () {
                        bottle.container.packetBuffer.push(new Buffer(intellibriteRecall))

                    })
                    .delay(50)
                    .then(function () {
                        var json = bottle.container.circuit.getCircuit(8)
                        // console.log('circuit:',JSON.stringify(json))
                        json.light.mode.should.eq(191)
                        json.light.modeStr.should.eq('Recall')
                        json.light.color.should.eq(191)
                        json.light.colorStr.should.eq('Recall')

                    })
                    .catch(function (err) {
                        return Promise.reject(new Error('Recall: ' + err))
                    })

            })

        })
    })

    describe('#circuit api calls',function () {

        context('with a URL',function () {

            // before(function() {
            //     return global.initAllAsync()
            //         .catch(function(err){
            //             console.log('what is the error?',err)
            //         })
            // })

            beforeEach(function () {
                loggers = setupLoggerStubOrSpy('stub','spy')
                //clock = sinon.useFakeTimers()
                writeSPPacketStub = sinon.stub(bottle.container.sp,'writeSP')//.callsFake(function(){bottle.container.writePacket.postWritePacketHelper()})
                sinon.stub(bottle.container.intellitouch,'getPreambleByte').returns(33)
                //queuePacketStub = sinon.stub(bottle.container.queuePacket,'queuePacket')
                checkIfNeedControllerConfigurationStub = sinon.stub(bottle.container.intellitouch,'checkIfNeedControllerConfiguration')

            })

            afterEach(function () {
                bottle.container.writePacket.init()
                bottle.container.queuePacket.init()
                sinon.restore()

            })

            after(function () {

                return global.stopAllAsync()
            })

            it('sets the color of pool circuit color via the api to cyan',function (done) {
                global.requestPoolDataWithURLAsync('light/circuit/8/setColor/6')

                    .delay(50)
                    .then(function (obj) {
                        writeSPPacketStub.args[0][0].should.deep.equal(intellibriteCyan)
                    })
                    .then(done,done)
            });

            it('sets the Circuit 16 light position to 1 (from 3)',function (done) {
                global.requestPoolDataWithURLAsync('light/circuit/16/setPosition/1')
                    .delay(50)

                    .then(function (obj) {
                        writeSPPacketStub.args[0][0].should.deep.equal(intellibritePosition1)
                        return global.requestPoolDataWithURLAsync('light/circuit/16/setPosition/3')
                    })
                    .delay(500)
                    .then(function (obj) {
                        queue = bottle.container.queuePacket.entireQueue()
                        //console.log('queue: ', queue)
                        queue[1].should.deep.equal(intellibriteCyan)
                    })
                    .then(done,done)
            });

            it('sets the color of pool circuit delay via the api to 10 seconds',function (done) {
                global.requestPoolDataWithURLAsync('light/circuit/8/setSwimDelay/10')
                    .delay(50)

                    .then(function (obj) {
                        writeSPPacketStub.args[0][0].should.deep.equal(intellibriteSwimDelay10)
                    })
                    .then(done,done)
            });

            it('sets the Intellibrite light mode to Off',function (done) {
                global.requestPoolDataWithURLAsync('light/mode/0')
                    .delay(50)

                    .then(function (obj) {
                        writeSPPacketStub.args[0][0].should.deep.equal(intellibriteOff)
                    })
                    .then(done,done)
            });

            it('sets the Intellibrite light mode to Caribbean',function (done) {
                global.requestPoolDataWithURLAsync('light/mode/179')
                    .delay(50)

                    .then(function (obj) {
                        writeSPPacketStub.args[0][0].should.deep.equal(intellibriteCaribbean)
                    })
                    .then(done,done)
            });





        })
    })
    describe('Socket.io tests',function () {
        context('for Intellibrite',function () {

            before(function () {

                return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config_intellibrite.json'})
                    .then(function(){
                        bottle.container.writePacket.init()
                        bottle.container.queuePacket.init()
                    })


            });

            beforeEach(function () {
                // sinon = sinon.sinon.create()
                loggers = setupLoggerStubOrSpy('spy','spy')
                checkIfNeedControllerConfigurationStub = sinon.stub(bottle.container.intellitouch,'checkIfNeedControllerConfiguration')
                writeSPPacketStub = sinon.stub(bottle.container.sp,'writeSP')

            })

            afterEach(function () {
                bottle.container.writePacket.init()
                bottle.container.queuePacket.init()
                sinon.restore()

            })

            after(function () {
                   return global.stopAllAsync()
            })

            it('#resets packet info',function () {
                return Promise.resolve()
                    .then(function () {
                        for (var i in circuitPackets) {
                            bottle.container.packetBuffer.push(circuitPackets[i])
                        }
                    })
                    .delay(50)
                    .then(function () {
                        var json = bottle.container.circuit.getCurrentCircuits().circuit
                        // console.log('current Circuits:',JSON.stringify(json,null,2))
                        json[1].number.should.equal(1)
                        json[1].name.should.equal("SPA")
                    })
                     .then(function () {
                        return bottle.container.packetBuffer.push(new Buffer(intellibriteAssignment))

                    })
                    .delay(50)
                    .then(function () {
                        // console.log('current Circuits:',JSON.stringify(json,null,2))
                        var json = bottle.container.circuit.getLightGroup()
                        // console.log('all lights:',JSON.stringify(json))
                        json[7].position.should.eq(1)
                        json[7].colorSet.should.eq(8)
                        json[8].colorSwimDelay.should.eq(5)
                    })
                    .catch(function (err) {
                        return Promise.reject(new Error('Light positions: ' + err))
                    })
            })

            it('#sets the color of the pool circuit via the socket to Cyan',function () {
                var client = global.ioclient.connect(global.socketURL,global.socketOptions)
                client.on('connect',function (data) {

                    client.emit('setLightColor',8,6)
                    client.emit('setLightColor',7,12)
                    client.disconnect()


                })
                return Promise.resolve()
                    .delay(100)
                    .then(function () {
                        queue = bottle.container.queuePacket.entireQueue()
                        //console.log('Queue: ', JSON.stringify(queue,null,2))
                        queue[1].should.deep.equal(intellibriteCyan)

                    })


            });


            it('#sets the position of the circuit 16 to 1 (and back to 3)',function () {
                var client = global.ioclient.connect(global.socketURL,global.socketOptions)
                client.on('connect',function (data) {

                    client.emit('setLightPosition',16,1)
                    client.emit('setLightPosition',16,3)

                    client.disconnect()


                })
                return Promise.resolve()
                    .delay(100)
                    .then(function () {
                        queue = bottle.container.queuePacket.entireQueue()
                        queue[0].should.deep.equal(intellibritePosition1)
                        queue[1].should.deep.equal(intellibriteCyan)
                    })


            });


            it('#sets the swim delay of the pool circuit via the socket to 10',function () {
                var client = global.ioclient.connect(global.socketURL,global.socketOptions)
                client.on('connect',function (data) {

                    client.emit('setLightSwimDelay',8,10)
                    client.disconnect()


                })

                return Promise.resolve()
                    .delay(100)
                    .then(function () {
                        //console.log('writeSP: ',writeSPPacketStub.args)
                        writeSPPacketStub.args[0][0].should.deep.equal(intellibriteSwimDelay10)
                    })

            })


        })


    })

})
