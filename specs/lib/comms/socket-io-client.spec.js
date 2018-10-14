describe('socket.io basic tests', function () {


    before(function () {
    });

    beforeEach(function () {


        return global.initAllAsync()
            .then(function () {
                loggers = setupLoggerStubOrSpy('stub', 'stub')
                queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
                preambleStub = sinon.stub(bottle.container.intellitouch, 'getPreambleByte').returns(99)
                pWPHStub = sinon.stub(bottle.container.writePacket, 'preWritePacketHelper')
                updateAvailStub = sinon.stub(bottle.container.updateAvailable, 'getResultsAsync').returns(Promise.resolve({}))
                // bootstrapsettingsStub = sinon.stub(bottle.container.bootstrapsettings, 'reset')
                writeSPPacketStub = sinon.stub(bottle.container.sp, 'writeSP')
                controllerConfigNeededStub = sinon.stub(bottle.container.intellitouch, 'checkIfNeedControllerConfiguration')

            })

    })

    afterEach(function () {
        //restore the sinon after each function
        //console.log('full queue', bottle.container.queuePacket.fullQ)

        return global.stopAllAsync()
    })

    after(function () {

    })


    it('#connects to the server', function () {
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
        aTimer = setTimeout(function () {
            myReject()
        }, 1500)
        return new Promise(function (resolve, reject) {
            myResolve = resolve
            myReject = reject
        })
    })

    it('#sets date/time', function () {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)
        var myResolve, myReject
        client.on('connect', function (data) {
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

        aTimer = setTimeout(function () {
            myReject()
        }, 1500)
        return new Promise(function (resolve, reject) {
            myResolve = resolve
            myReject = reject
        })


    })

    it('#fails to set date/time (invalid input)', function () {
        return Promise.resolve()
            .then(function () {
                var client = global.ioclient.connect(global.socketURL, global.socketOptions)
                client.on('connect', function () {
                    client.emit('setDateTime', 26, 55, 4, 3, 4, 18, 0)
                    client.disconnect()
                })
            })
            .delay(50)
            .then(function () {
                loggers.loggerWarnStub.args[0][0].text.should.contain('FAIL:')
                loggers.loggerWarnStub.callCount.should.eq(1)
            })
    })


    it('#sets a schedule', function (done) {
        this.timeout(4000)
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)

        client.on('connect', function (data) {
            // console.log('connected client:')
            client.emit('setSchedule', 12, 5, 13, 20, 13, 40, 131)
            client.disconnect()

        })
        setTimeout(function () {
            //console.log('queuePacketStub.args', queuePacketStub.args)
            try {
                queuePacketStub.args[0][0].should.deep.equal([165, 99, 16, 33, 145, 7, 12, 5, 13, 20, 13, 40, 131])
                queuePacketStub.callCount.should.equal(13) // request all schedules
                done()
            }
            catch (err) {
                console.log('in sets a schedule, error...', err)
                done()
            }

        }, 1800)
    })

    it('#sends packets and checks the correct preamble is passed', function () {

        var client = global.ioclient.connect(global.socketURL, global.socketOptions)
        client.on('connect', function () {
            client.emit('sendPacket', JSON.parse('{"1":[96,16,6,1,10],"2":[16,2,80,20,0,118],"3":[16,34,134,2,9,0]}'))
            //results should be Queued packet(s): [165,0,96,16,6,1,10] [16,2,80,20,0,118,236] [165,16,16,34,134,2,9,0]
            client.disconnect()
        })
        //setTimeout(reject(new Error('send packet with correct preamble timeout')),1500)
        global.waitForSocketResponseAsync('sendPacketResults')
            .then(function (res) {
                res.should.contain('165,0,96,16,6,1,10')
                res.should.contain('16,2,80,20,0,118')
                res.should.contain('16,34,134,2,9,0')
                queuePacketStub.args[0][0].should.deep.eq([165, 0, 96, 16, 6, 1, 10])
                queuePacketStub.args[1][0].should.deep.eq([16, 2, 80, 20, 0, 118])
                queuePacketStub.args[2][0].should.deep.eq([165, 99, 16, 34, 134, 2, 9, 0])
                clearTimeout(a)
                myResolve()
            })
            .catch(function (err) {
                bottle.container.logger.error('Should not get here when checking preamble')
                console.log(err)
                myReject(err)
            })
        var myResolve, myReject
        var a = setTimeout(function () {
            myReject(new Error('Socket Timeout error'))
        }, 1500)
        return new Promise(function (resolve, reject) {
            myResolve = resolve
            myReject = reject
        })


    })


    it('#cancels the delay', function (done) {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)

        client.on('connect', function () {
            client.emit('cancelDelay')
            client.disconnect()
        })
        setTimeout(function () {
            queuePacketStub.args[0][0].should.deep.equal([165, 99, 16, 33, 131, 1, 0])

            done()
        }, 200)


    })

    it('#sends and receives search socket', function () {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)
        var socketResults = [], myResolve, myReject
        client.on('connect', function () {
            client.emit('search', 'start', 16, 15, 17)
        })
        client.on('searchResults', function (results) {
            socketResults.push(results)
            if (socketResults.length === 1)
                bottle.container.packetBuffer.push(Buffer.from(global.schedules_chk[0]))

            if (socketResults.length === 2) {
                socketResults[0].should.contain('Listening')
                socketResults[1].should.contain('[165,33,15,16,17,7,1,6,9,20,15,59,255,2,106]')
                client.disconnect()
                clearTimeout(a)
                myResolve()
            }
        })
        var a = setTimeout(function () {
            myReject()
        }, 1500)
        return new Promise(function (resolve, reject) {
            myReject = reject
            myResolve = resolve
        })

    })

    /*  DO NOT ENABLE THESE.  It tries to open a physical serial port which messes up the tests.
        it('#reloads', function(done) {
            var client = global.ioclient.connect(global.socketURL, global.socketOptions)

            var time1, time2
            client.on('connect', function() {
                client.emit('setDateTime', 21, 55, 4, 3, 4, 18, 0)

            })
            var a = setTimeout(function(){
                time1 = bottle.container.time.getTime()
                client.emit('reload')
            }, 50)
            var b = setTimeout(function(){
                time2 = bottle.container.time.getTime()
                console.log('1: %s 2: %s', time1, time2)
                time1.time.controllerTime.should.equal(time2.time.controllerTime)
                client.disconnect()
                done()
            }, 100)


        })

        it('#reloads & resets', function(done) {
            var client = global.ioclient.connect(global.socketURL, global.socketOptions)
            var time1, time2
            closeStub = sinon.stub(bottle.container.sp,'close')
            client.on('connect', function() {
                client.emit('setDateTime', 21, 55, 4, 3, 4, 18, 0)
            })
            var a = setTimeout(function(){
                time1 = bottle.container.time.getTime()
                client.emit('reload')
            }, 50)
            var b = setTimeout(function(){
                time2 = bottle.container.time.getTime()
                time1.time.controllerTime.should.equal(time2.time.controllerTime)
                global.initAllAsync({'configLocation': '/specs/assets/config/templates/config_vanilla.json'}).then(done)
                done()
            }, 1500)  //need time for all services to start up again.

        })
        */

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
    it('#closes a connection from the server', function () {
        var client = global.ioclient.connect(global.socketURL, global.socketOptions)

        client.on('connect', function () {
            setTimeout(function () {
                client.emit('close', client.id)
            }, 50)
        })
        var myResolve, myReject

        client.on('disconnect', function () {
            clearTimeout(a)
            myResolve()
        })
        var a = setTimeout(function () {
                myReject(new Error('Timeout on closes a connection'))
            }
            , 1500)
        return new Promise(function (resolve, reject) {
            myResolve = resolve
            myReject = reject
        })

    })

    it('#requests all config (all)', function () {
        return global.waitForSocketResponseAsync('all')
            .then(function (data) {
                data.circuit.should.exist
                data.pump.should.exist
                data.schedule.should.exist
            })

    })

    it('#requests all config (one)', function () {
        return global.waitForSocketResponseAsync('one')
            .then(function (data) {
                data.circuit.should.exist
                data.pump.should.exist
                data.schedule.should.exist
            })


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


describe('socket.io pump tests', function () {



    // before(function() {
    //     bottle.container.settings.loadAsync('/specs/assets/config/config.json')
    //     return global.initAllAsync()
    // });
    //
    // beforeEach(function() {
    //     sinon = sinon.sinon.create()
    //     //clock = sinon.useFakeTimers()
    //     bottle.container.time.init()
    //     loggerInfoStub = sinon.stub(bottle.container.logger, 'info')
    //     loggerWarnStub = sinon.spy(bottle.container.logger, 'warn')
    //     loggerVerboseStub = sinon.stub(bottle.container.logger, 'verbose')
    //     loggerDebugStub = sinon.stub(bottle.container.logger, 'debug')
    //     loggerSillyStub = sinon.stub(bottle.container.logger, 'silly')
    //     queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
    //     // pumpCommandStub = sinon.spy(bottle.container.pumpControllerMiddleware, 'pumpCommand')
    //     updateAvailStub = sinon.stub(bottle.container.updateAvailable, 'getResultsAsync').returns(Promise.resolve({}))
    //     bottle.container.pump.init()
    //     bottle.container.pumpControllerTimers.clearTimer(1)
    //     bottle.container.pumpControllerTimers.clearTimer(2)
    // })
    //
    // afterEach(function() {
    //     //restore the sinon after each function
    //     bottle.container.pumpControllerTimers.clearTimer(1)
    //     bottle.container.pumpControllerTimers.clearTimer(2)
    //     sinon.restore()
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
//         sinon = sinon.sinon.create()
//         //clock = sinon.useFakeTimers()
//         bottle.container.time.init()
//         loggerInfoStub = sinon.stub(bottle.container.logger, 'info')
//         loggerWarnStub = sinon.spy(bottle.container.logger, 'warn')
//         loggerVerboseStub = sinon.stub(bottle.container.logger, 'verbose')
//         loggerDebugStub = sinon.stub(bottle.container.logger, 'debug')
//         loggerSillyStub = sinon.stub(bottle.container.logger, 'silly')
//         queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
//         pumpCommandStub = sinon.spy(bottle.container.pumpControllerMiddleware, 'pumpCommand')
//         updateAvailStub = sinon.stub(bottle.container.updateAvailable, 'getResultsAsync').returns(Promise.resolve({}))
//     })
//
//
//
//     afterEach(function() {
//
//         sinon.restore()
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
