describe('socket.io basic tests', function() {



    before(function() {

    });

    beforeEach(function() {


        sandbox = sinon.sandbox.create()
        // // clock = sandbox.useFakeTimers()  //do not use with setTimeout... if we want to enable, then use Promise.delay(int)
        // bottle.container.time.init()
        loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
        loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
        loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
        loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
        loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
        loggerErrorStub = sandbox.spy(bottle.container.logger, 'error')
        queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
        preambleStub = sandbox.stub(bottle.container.intellitouch, 'getPreambleByte').returns(99)
        pWPHStub = sandbox.stub(bottle.container.writePacket,'preWritePacketHelper')
        // updateAvailStub = sandbox.stub(bottle.container.updateAvailable, 'getResultsAsync').returns(Promise.resolve({}))
        // bootstrapConfigEditorStub = sandbox.stub(bottle.container.bootstrapConfigEditor, 'reset')
        writeSPPacketStub = sandbox.stub(bottle.container.sp, 'writeSP')
        controllerConfigNeededStub = sandbox.stub(bottle.container.intellitouch, 'checkIfNeedControllerConfiguration')


        return global.initAllAsync()

    })

    afterEach(function() {
        //restore the sandbox after each function
        //console.log('full queue', bottle.container.queuePacket.fullQ)
        sandbox.restore()
        return global.stopAllAsync()
    })

    after(function() {

    })


    it('#connects to the auth', function() {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)
        client.on('connect', function (data) {
            // console.log('connected client:')
            client.emit('echo', 'my test')

        })
        client.on('echo', function (msg) {
            // console.log(msg)
            msg.should.eq('my test')
            client.disconnect()
            clearTimeout(aTimer)
            myResolve()
        })
        aTimer =  setTimeout(function(){myReject()}, 1500)
        return new Promise(function(resolve, reject) {
            myResolve = resolve
            myReject = reject
        })
    })

    it('#sets date/time', function() {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)
        var myResolve, myReject
        client.on('connect', function(data) {
            client.emit('setDateTime', 21, 55, 4, 3, 4, 18, 0)
        })

        client.on('time', function (data) {
            // controller may throw out multiple emits as it parses through the set time request
            if (data.time.controllerTime !== -1) {
                data.time.controllerDateStr.should.eq('4/3/2018')
                data.time.controllerDayOfWeekStr.should.eq('Tuesday')
                clearTimeout(aTimer)
                client.disconnect()
                myResolve()
            }
        })

        aTimer =  setTimeout(function(){myReject()}, 1500)
        return new Promise(function(resolve, reject) {
            myResolve = resolve
            myReject = reject
        })



    })

    it('#fails to set date/time (invalid input)', function() {
        // loggerWarnStub.restore()loggerWarnStub = sandbox.stub(bottle.container.logger,'warn')

        var client = global.ioclient.connect(global.socketURL, global.socketOptions)
        client.on('connect', function() {
            client.emit('setDateTime', 26, 55, 4, 3, 4, 18, 0)
            client.disconnect()
        })
        var myResolve, myReject
        var a = setTimeout(function(){myReject()}, 1950)
        setTimeout(function () {
            loggerWarnStub.args[0][0].text.should.contain('FAIL:')
            loggerWarnStub.callCount.should.eq(1)

            clearTimeout(a)
            myResolve()
        }, 1900)
        return new Promise(function(resolve, reject) {
            myResolve = resolve
            myReject = reject
        })
    })


    it('#sets a schedule', function() {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)

        client.on('connect', function(data) {
            // console.log('connected client:')
            client.emit('setSchedule', 12, 5, 13, 20, 13, 40, 131)
            client.disconnect()

        })
        var myResolve, myReject
        a = setTimeout(function(){myReject()}, 1900)
        setTimeout(function () {
                //console.log('queuePacketStub.args', queuePacketStub.args)
                queuePacketStub.args[0][0].should.deep.equal([ 165, 99, 16, 33, 145, 7, 12, 5, 13, 20, 13, 40, 131 ])
                queuePacketStub.callCount.should.equal(13) // request all schedules
                clearTimeout(a)
                myResolve()}
            , 1800)
        return new Promise(function(resolve, reject) {
            myResolve = resolve
            myReject = reject
        })


    })

    it('#sends packets and checks the correct preamble is passed', function() {

        var client = global.ioclient.connect(global.socketURL, global.socketOptions)
        client.on('connect', function() {
            client.emit('sendPacket', JSON.parse('{"1":[96,16,6,1,10],"2":[16,2,80,20,0,118],"3":[16,34,134,2,9,0]}'))
            //results should be Queued packet(s): [165,0,96,16,6,1,10] [16,2,80,20,0,118,236] [165,16,16,34,134,2,9,0]
            client.disconnect()
        })
        //setTimeout(reject(new Error('send packet with correct preamble timeout')),1500)
        global.waitForSocketResponseAsync('sendPacketResults')
            .then(function(res){
                res.should.contain('165,0,96,16,6,1,10')
                res.should.contain('16,2,80,20,0,118')
                res.should.contain('16,34,134,2,9,0')
                queuePacketStub.args[0][0].should.deep.eq([165, 0, 96, 16, 6, 1, 10])
                queuePacketStub.args[1][0].should.deep.eq([16, 2, 80, 20, 0, 118])
                queuePacketStub.args[2][0].should.deep.eq([165, 99, 16, 34, 134, 2, 9, 0])
                clearTimeout(a)
                myResolve()
            })
            .catch(function(err){
                bottle.container.logger.error('Should not get here when checking preamble')
                console.log(err)
                myReject(err)
            })
        var myResolve, myReject
        var a = setTimeout(function(){myReject(new Error('Socket Timeout error'))}, 1500)
        return new Promise(function(resolve, reject){
            myResolve = resolve
            myReject = reject
        })


    })




    it('#cancels the delay', function() {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)

        client.on('connect', function() {
            client.emit('cancelDelay')
            client.disconnect()
        })
        var myResolve, myReject

        setTimeout(function(){
            queuePacketStub.args[0][0].should.deep.equal([ 165, 99, 16, 33, 131, 1, 0 ])
            clearTimeout(a)
            myResolve()
        }, 100)

        var a = setTimeout(function(){myReject()}, 1500)

        return new Promise(function(resolve, reject){
            myResolve = resolve
            myReject = reject
        })
    })

    it('#sends and receives search socket', function() {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)
        var socketResults = [], myResolve, myReject
        client.on('connect', function() {
            client.emit('search', 'start', 16, 15, 17)
        })
        client.on('searchResults', function(results) {
            socketResults.push(results)
            if (socketResults.length===1)
                bottle.container.packetBuffer.push(Buffer.from(global.schedules_chk[0]))

            if (socketResults.length===2){
                socketResults[0].should.contain('Listening')
                socketResults[1].should.contain('[165,33,15,16,17,7,1,6,9,20,15,59,255,2,106]')
                client.disconnect()
                clearTimeout(a)
                myResolve()
            }
        })
        var a = setTimeout(function(){myReject()}, 1500)
        return new Promise(function(resolve, reject){
            myReject = reject
            myResolve = resolve
        })

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
    it('#closes a connection from the auth', function() {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)

        client.on('connect', function() {
            setTimeout(function(){client.emit('close', client.id)},50)
        })
        var myResolve, myReject

        client.on('disconnect', function() {
            clearTimeout(a)
            myResolve()
        })
        var a = setTimeout(function() {
                myReject(new Error('Timeout on closes a connection'))
            }
            ,1500)
        return new Promise(function(resolve,reject){
            myResolve = resolve
            myReject = reject
        })

    })

    it('#requests all config (all)', function() {
        return global.waitForSocketResponseAsync('all')
            .then(function(data){
                data.circuit.should.exist
                data.pump.should.exist
                data.schedule.should.exist
            })
        setTimeout(Promise.reject(), 1900)

    })

    it('#requests all config (one)', function() {
        return global.waitForSocketResponseAsync('one')
            .then(function(data){
                data.circuit.should.exist
                data.pump.should.exist
                data.schedule.should.exist
            })
        setTimeout(Promise.reject(), 1900)

    })

// it('#stops the Socket auth', function(done) {
//     var client = global.ioclient.connect(global.socketURL, global.socketOptions)
//     var _err_data
//     client.on('connect', function(data) {
//         bottle.container.io.stop()
//     })
//     client.on('connect_error', function(err_data){
//         _err_data = JSON.parse(JSON.stringify(err_data))
//     })
//     Promise.resolve()
//         .delay(50)
//         .then(function(){
//             console.log('trying to open client again')
//             client.open(function(new_data){
//                 console.log('client opened', new_data)
//             })
//         })
//         .delay(50)
//         .then(function(){
//             bottle.container.auth.init()
//             bottle.container.io.init()
//             _err_data.type.should.eq('TransportError')
//         })
//         .then(done,done)
// })
})


describe('socket.io pump tests', function() {



    // before(function() {
    //     bottle.container.configEditor.initAsync('/specs/assets/config/config.json')
    //     return global.initAllAsync()
    // });
    //
    // beforeEach(function() {
    //     sandbox = sinon.sandbox.create()
    //     //clock = sandbox.useFakeTimers()
    //     bottle.container.time.init()
    //     loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
    //     loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
    //     loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
    //     loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
    //     loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
    //     queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
    //     // pumpCommandStub = sandbox.spy(bottle.container.pumpControllerMiddleware, 'pumpCommand')
    //     updateAvailStub = sandbox.stub(bottle.container.updateAvailable, 'getResultsAsync').returns(Promise.resolve({}))
    //     bottle.container.pump.init()
    //     bottle.container.pumpControllerTimers.clearTimer(1)
    //     bottle.container.pumpControllerTimers.clearTimer(2)
    // })
    //
    // afterEach(function() {
    //     //restore the sandbox after each function
    //     bottle.container.pumpControllerTimers.clearTimer(1)
    //     bottle.container.pumpControllerTimers.clearTimer(2)
    //     sandbox.restore()
    //
    // })
    //
    // after(function() {
    //     return global.stopAllAsync()
    // })
    //



    // it('#requests all config (all)', function() {
    //     return global.waitForSocketResponseAsync('all')
    //         .then(function(data){
    //             data.circuit.should.exist
    //             data.pump.should.exist
    //             data.schedule.should.exist
    //         })
    //
    // })
    //
    // it('#requests all config (one)', function() {
    //     return global.waitForSocketResponseAsync('one')
    //         .then(function(data){
    //             data.circuit.should.exist
    //             data.pump.should.exist
    //             data.schedule.should.exist
    //         })
    //
    // })

})


// describe('socket.io updateAvailable tests', function() {
//
//
//
//     before(function() {
//         global.initAllAsync()
//     });
//
//     beforeEach(function() {
//         sandbox = sinon.sandbox.create()
//         //clock = sandbox.useFakeTimers()
//         bottle.container.time.init()
//         loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
//         loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
//         loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
//         loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
//         loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
//         queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
//         pumpCommandStub = sandbox.spy(bottle.container.pumpControllerMiddleware, 'pumpCommand')
//         updateAvailStub = sandbox.stub(bottle.container.updateAvailable, 'getResultsAsync').returns(Promise.resolve({}))
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
//         global.stopAllAsync()
//     })
//
//
//
//
//
//
// })
