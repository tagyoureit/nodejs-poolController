describe('socket.io basic tests', function() {



    before(function() {

        bottle.container.server.init()
        bottle.container.io.init()
        bottle.container.logger.transports.console.level = 'silly';
    });

    beforeEach(function() {
        sandbox = sinon.sandbox.create()
        // clock = sandbox.useFakeTimers()  //do not use with setTimeout... if we want to enable, then use Promise.delay(int)
        bottle.container.time.init()
        loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
        loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
        loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
        loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
        loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
        loggerErrorStub = sandbox.stub(bottle.container.logger, 'error')
        queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
        preambleStub = sandbox.stub(bottle.container.intellitouch, 'getPreambleByte').returns(99)
        updateAvailStub = sandbox.stub(bottle.container.updateAvailable, 'getResults').returns({})
        bootstrapConfigEditorStub = sandbox.stub(bottle.container.bootstrapConfigEditor, 'reset')

    })

    afterEach(function() {
        //restore the sandbox after each function
        sandbox.restore()

    })

    after(function() {
        bottle.container.time.init()
        bottle.container.server.close()
        bottle.container.logger.transports.console.level = 'info';
    })


    it('#connects to the server', function(done) {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)

        client.on('connect', function(data) {
            // console.log('connected client:')
            client.emit('echo', 'my test')
            client.on('echo', function(msg) {
                // console.log(msg)
                msg.should.eq('my test')
                client.disconnect()
                done()
            })
        })
    })

    it('#sets date/time', function(done) {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)

        client.on('connect', function(data) {
            // console.log('connected client:')
            client.emit('setDateTime', 21, 55, 4, 3, 4, 18, 0)
            client.on('time', function(data){
                data.controllerDateStr.should.eq('4/3/2018')
                data.controllerDayOfWeekStr.should.eq('Tuesday')
                client.disconnect()
                done()
            })

        })
    })

    it('#fails to set date/time (invalid input)', function(done) {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)
        client.on('connect', function(data) {
            client.emit('setDateTime', 26, 55, 4, 3, 4, 18, 0)
        })
        Promise.resolve()
            .delay(500)
            .then(function(){
                loggerWarnStub.args[0][0].text.should.contain('FAIL:')
            })
            .then(done,done)

    })

    it('#sets a schedule', function(done) {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)

        client.on('connect', function(data) {
            // console.log('connected client:')
            client.emit('setSchedule', 12, 5, 13, 20, 13, 40, 131)
            client.disconnect()
        })

        Promise.resolve()
            .delay(500)
            .then(function(){
                loggerInfoStub.args[0][0].text.should.contain('SOCKET')
                queuePacketStub.args[0][0].should.deep.equal([ 165, 99, 16, 33, 145, 7, 12, 5, 13, 20, 13, 40, 131 ])
                queuePacketStub.callCount.should.equal(13) // request all schedules
            })
            .then(done,done)


    })

    it('#sends packets and checks the correct preamble is passed', function(done) {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)

        writeSPPacketStub = sandbox.stub(bottle.container.sp, 'writeSP')
        client.on('connect', function(data) {
            client.emit('sendPacket', JSON.parse('{"1":[96,16,6,1,10],"2":[16,2,80,20,0,118],"3":[16,34,134,2,9,0]}'))
            //results should be Queued packet(s): [165,0,96,16,6,1,10] [16,2,80,20,0,118,236] [165,16,16,34,134,2,9,0]
        })

        client.on('sendPacketResults', function(res) {
            res.should.contain('165,0,96,16,6,1,10')
            res.should.contain('16,2,80,20,0,118')
            res.should.contain('16,34,134,2,9,0')
        })
        Promise.resolve()
            .delay(500)
            .then(function(){
                queuePacketStub.args[0][0].should.deep.eq([165, 0, 96, 16, 6, 1, 10])
                queuePacketStub.args[1][0].should.deep.eq([16, 2, 80, 20, 0, 118])
                queuePacketStub.args[2][0].should.deep.eq([165, 99, 16, 34, 134, 2, 9, 0])
                client.disconnect()
            }).then(done,done)

    })




    it('#cancels the delay', function(done) {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)

        client.on('connect', function(data) {
            client.emit('cancelDelay')
        })

        Promise.resolve()
            .delay(500)
            .then(function(){
                queuePacketStub.args[0][0].should.deep.equal([ 165, 99, 16, 33, 131, 1, 0 ])
            })
            .then(done,done)
    })

    it('#resets the Bootstrap UI Config file', function(done) {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)

        client.on('connect', function(data) {
            client.emit('resetConfigClient')
        })
        Promise.resolve()
            .delay(200)
            .then(function(){
                bootstrapConfigEditorStub.calledOnce
            })
            .then(done,done)
    })

    it('#sends and receives search socket', function(done) {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)
        var count = 0
        client.on('connect', function(data) {
            client.emit('search', 'start', 16, 15, 17)
        })

        client.on('searchResults', function(res) {
            count++
            if (count===0){
                res.should.contain('[165,33,15,16,17,7,1,6,9,20,15,59,255,2,106]')
            }



        })
        Promise.resolve()
            .delay(100)
            .then(function(){
                global.schedules_chk.forEach(function(el){
                    bottle.container.packetBuffer.push(Buffer.from(el))
                })

            })
            .delay(200)
            .then(function(){
                (count>0).should.be.true
                // console.log('should see results?')
                //
                // var json = bottle.container.schedule.getCurrentSchedule()
                // console.log('json for schedule 1: ', JSON.stringify(json,null,2))

                bottle.container.schedule.init()
            })
            .then(done,done)


    })
    // it('API #1: turns off pump 1', function(done) {
    //     // this.timeout(61 * 60 * 1000)
    //     bottle.container.settings.logPumpMessages = 1
    //     bottle.container.settings.logPumpTimers = 1
    //     console.log('newly reset pump status:', bottle.container.pump.getCurrentPumpStatus())
    //     var client = global.ioclient.connect(global.socketURL, global.socketOptions)
    //     client.on('connect', function(data) {
    //         client.emit('setPumpCommand', 'off', 1, null, null, null)
    //         clock.tick(60 * 1000) //+1 min
    //         console.log('huh???', bottle.container.pump.getCurrentRemainingDuration(1))
    //         bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
    //         bottle.container.pump.getCurrentRunningMode(1).should.eq('off')
    //         bottle.container.pump.getCurrentRunningValue(1).should.eq(0)
    //
    //         clock.tick(59 * 60 * 1000) //+1 hr
    //         bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
    //         done()
    //     })
    //     // client.on('pump', function(msg) {
    //     //     console.log('inside socket received pump:', msg[1].currentrunning.remainingduration)
    //     //     if (msg[1].currentrunning.remainingduration === -1) {
    //     //         client.disconnect()
    //     //         done()
    //     //     }
    //     // })
    //
    //     // bottle.container.io.emitToClients('pump')
    //
    // })
    //
    // it('API #3: turns on pump 1 for 15 minutes', function(done) {
    //     this.timeout(61 * 60 * 1000)
    //     var client = global.ioclient.connect(global.socketURL, global.socketOptions)
    //     client.once('connect', function(data) {
    //
    //         client.emit('setPumpCommand', 'run', 1, null, null, 15)
    //         bottle.container.pump.getCurrentRemainingDuration(1).should.eq(15)
    //         clock.tick(60*1000)
    //         bottle.container.pump.getCurrentRemainingDuration(1).should.eq(14)
    //         clock.tick(14.5*60*1000)
    //         bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
    //         done()
    //
    //     })
    // var callCount = 0
    // client.on('pump', function(msg) {
    //     callCount++
    //     console.log('2: ', callCount, msg[1].currentrunning.remainingduration)
    //     // bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
    //     // bottle.container.pump.getCurrentRunningMode(1).should.eq('off')
    //     // bottle.container.pump.getCurrentRunningValue(1).should.eq(0)
    //     if (callCount > 1 && msg[1].currentrunning.remainingduration === -1) {
    //         console.log('client disconnecting')
    //         client.disconnect()
    //         done()
    //     }
    // })



    // })
    it('#closes a connection', function(done) {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)

        client.on('connect', function(data) {
            client.emit('close')
        })
        Promise.resolve()
            .delay(200)
            .then(function(){
                loggerDebugStub.args[0][0].should.eq('socket closed')
            })
            .then(done,done)
    })



    it('#stops the Socket server', function(done) {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)
        client.on('connect', function(data) {
            bottle.container.io.stop()

        })
        client.on('connect_error', function(err_data){
            err_data.type.should.eq('TransportError')
        })
        Promise.resolve()
            .delay(100)
            .then(function(){

                client.open(function(new_data){
                    console.log('client opened', new_data)
                })
            })
            .delay(500)
            .then(function(){
                bottle.container.server.init()
                bottle.container.io.init()
            })
            .then(done,done)
    })
})


describe('socket.io pump tests', function() {



    before(function() {
        bottle.container.settings.logPumpMessages = 1
        bottle.container.settings.logPumpTimers = 1
        bottle.container.logger.transports.console.level = 'silly'
        bottle.container.server.init()
        bottle.container.io.init()
    });

    beforeEach(function() {
        sandbox = sinon.sandbox.create()
        //clock = sandbox.useFakeTimers()
        bottle.container.time.init()
        loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
        loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
        loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
        loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
        loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
        queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
        // pumpCommandStub = sandbox.spy(bottle.container.pumpControllerMiddleware, 'pumpCommand')
        updateAvailStub = sandbox.stub(bottle.container.updateAvailable, 'getResults').returns({})
        bottle.container.pump.init()
        bottle.container.pumpControllerTimers.clearTimer(1)
        bottle.container.pumpControllerTimers.clearTimer(2)
    })

    afterEach(function() {
        //restore the sandbox after each function
        bottle.container.pumpControllerTimers.clearTimer(1)
        bottle.container.pumpControllerTimers.clearTimer(2)
        sandbox.restore()

    })

    after(function() {
        bottle.container.time.init()
        bottle.container.settings.logPumpTimers = 0
        bottle.container.settings.logPumpMessages = 0
        bottle.container.logger.transports.console.level = 'info'
        bottle.container.server.close()
    })




    it('#requests all config (all)', function(done) {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)
        // var client =  global.ioclient.connect('http://localhost:3000');

        client.on('connect', function(data) {
            // console.log('connected client:')
            client.emit('all')
            client.on('all', function(msg) {
                // console.log(msg)
                msg.circuits.should.exist
                msg.pumps.should.exist
                msg.schedule.should.exist
                client.disconnect()
                done()
            })
        })
    })

    it('#requests all config (one)', function(done) {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)
        // var client =  global.ioclient.connect('http://localhost:3000');

        client.on('connect', function(data) {
            // console.log('connected client:')
            client.emit('one')
            client.on('one', function(msg) {
                // console.log(msg)
                msg.circuits.should.exist
                msg.pumps.should.exist
                msg.schedule.should.exist
                client.disconnect()
                done()
            })
        })
    })

})


// describe('socket.io updateAvailable tests', function() {
//
//
//
//     before(function() {
//         bottle.container.logger.transports.console.level = 'silly'
//         bottle.container.server.init()
//         bottle.container.io.init()
//     });
//
//     beforeEach(function() {
//         sandbox = sinon.sandbox.create()
//         //clock = sandbox.useFakeTimers()
//         bottle.container.time.init()
//         loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
//         loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
//         loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
//         loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
//         loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
//         queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
//         pumpCommandStub = sandbox.spy(bottle.container.pumpControllerMiddleware, 'pumpCommand')
//         updateAvailStub = sandbox.stub(bottle.container.updateAvailable, 'getResults').returns({})
//     })
//
//
//
//     afterEach(function() {
//
//         sandbox.restore()
//
//     })
//
//     after(function() {
//         bottle.container.logger.transports.console.level = 'info'
//         bottle.container.server.close()
//     })
//
//
//
//
//
//
// })
