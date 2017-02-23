describe('socket.io basic tests', function() {



    before(function() {

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
        preambleStub = sandbox.stub(bottle.container.intellitouch, 'getPreambleByte').returns(99)

    })

    afterEach(function() {
        //restore the sandbox after each function
        sandbox.restore()

    })

    after(function() {
        bottle.container.time.init()
        bottle.container.server.close()
    })


    it('#connects to the server', function(done) {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)
        // var client =  global.ioclient.connect('http://localhost:3000');

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
        // var client =  global.ioclient.connect('http://localhost:3000');

        client.on('connect', function(data) {
            // console.log('connected client:')
            client.emit('setDateTime', 21, 55, 4, 3, 4, 18, 0)
            client.disconnect()
        })

        setTimeout(function() {
            var res = bottle.container.time.getTime()
            console.log(res)
            res.controllerDateStr.should.eq('4/3/2018')
            res.controllerDayOfWeekStr.should.eq('Tuesday')
            done()
        }, 500)
    })

    it('#sets a schedule', function(done) {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)
        // var client =  global.ioclient.connect('http://localhost:3000');

        client.on('connect', function(data) {
            // console.log('connected client:')
            client.emit('setSchedule', 12, 5, 13, 20, 13, 40, 131)
            client.disconnect()
        })

        setTimeout(function() {
          loggerInfoStub.args[0][0].text.should.contain('SOCKET')
          queuePacketStub.args[0][0].should.contain.members([165,99,16,33,145,7,12,5,13,20,13,40,131])
          queuePacketStub.args[1][0].should.contain.members([165, 99, 16, 33, 209, 1, 1])
          queuePacketStub.args[12][0].should.contain.members([165, 99, 16, 33, 209, 1, 12])          
            done()
        }, 500)
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
        // loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
        // loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
        // loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
        // loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
        // loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
        queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
        pumpCommandStub = sandbox.spy(bottle.container.pumpControllerMiddleware, 'pumpCommand')
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




    it('#requests pump status', function(done) {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)
        // var client =  global.ioclient.connect('http://localhost:3000');

        client.on('connect', function(data) {
            // console.log('connected client:')
            client.emit('all')
            client.on('one', function(msg) {
                // console.log(msg)
                msg.circuits[0].should.eq('blank')
                msg.pumps[1].pump.should.eq(1)
                msg.schedule[0].should.eq('blank')
                client.disconnect()
                done()
            })
        })
    })

})
