

describe('#Tests a VS pump', function() {

    describe('#by sending commands to the pump', function () {
        context('with a HTTP REST API', function () {

            before(function () {

            });

            beforeEach(function(){
                return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config.pump.VS.json'})
                    .then(function(){
                        loggers = setupLoggerStubOrSpy('stub','stub')
                        clock = sinon.useFakeTimers()
                        queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
                        getCurrentStatusStub = sinon.stub(bottle.container.pump, 'getCurrentPumpStatus').returns({"pump":{
                                "1": {type: 'VS'},
                                "2": {type: 'VS'}
                            }
                        })
                        // pumpCommandStub = sinon.spy(bottle.container.pumpControllerMiddleware, 'pumpCommand')
                        socketIOStub = sinon.stub(bottle.container.io, 'emitToClients')
                        bottle.container.logger.silly('beforeEach done in VS')

                    })
                    .catch(function(err){
                        bottle.container.logger.error('err???', err)
                    })


            })

            afterEach(function () {
                sinon.restore()
                return global.stopAllAsync()

            })

            after(function () {

            })

            it('API #1: turns off pump 1', function (done) {

                global.requestPoolDataWithURLAsync('pumpCommand/off/pump/1').then(function (obj) {
                    obj.text.should.contain('REST API')
                    obj.pump.should.eq(1)
                    // obj.duration.should.eq(600)
                    // console.log('pumpQueue:', queuePacketStub.args)
                    clock.tick(60 * 1000) //+1 min

                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                    bottle.container.pump.getCurrentRunningMode(1).should.eq('off')
                    bottle.container.pump.getCurrentRunningValue(1).should.eq(0)

                    clock.tick(59 * 60 * 1000) //+1 hr
                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                }).then(done, done)
            })

            it('API #1: turns off pump 2', function (done) {

                global.requestPoolDataWithURLAsync('pumpCommand/off/pump/2').then(function (obj) {
                    obj.text.should.contain('REST API')
                    obj.pump.should.eq(2)
                    // obj.duration.should.eq(600)
                    // console.log('pumpQueue:', queuePacketStub.args)
                    clock.tick(1000) //because this isn't a callback, put in a small delay
                    clock.tick(60 * 1000) //+1 min

                    bottle.container.pump.getCurrentRemainingDuration(2).should.eq(-1)
                    bottle.container.pump.getCurrentRunningMode(2).should.eq('off')
                    bottle.container.pump.getCurrentRunningValue(2).should.eq(0)

                    clock.tick(59 * 60 * 1000) //+1 hr
                    bottle.container.pump.getCurrentRemainingDuration(2).should.eq(-1)
                }).then(done, done)
            })

            it('API #2: turns on pump 1', function (done) {

                global.requestPoolDataWithURLAsync('pumpCommand/run/pump/1').then(function (obj) {
                    obj.text.should.contain('REST API')
                    obj.pump.should.eq(1)
                    // obj.duration.should.eq(600)
                    // console.log('pumpQueue:', queuePacketStub.args)
                    clock.tick(60 * 1000) //+1 min

                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                    bottle.container.pump.getCurrentRunningMode(1).should.eq('power')
                    bottle.container.pump.getCurrentRunningValue(1).should.eq(1)

                    clock.tick(59 * 60 * 1000) //+1 hr
                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)


                }).then(done, done)
            })

            it('API #2: turns on pump 2', function (done) {
                this.timeout(4 * 1000)
                global.requestPoolDataWithURLAsync('pumpCommand/run/pump/2').then(function (obj) {
                    obj.text.should.contain('REST API')
                    obj.pump.should.eq(2)
                    // obj.duration.should.eq(600)
                    // console.log('pumpQueue:', queuePacketStub.args)
                    clock.tick(60 * 1000) //+1 min

                    bottle.container.pump.getCurrentRemainingDuration(2).should.eq(-1)
                    bottle.container.pump.getCurrentRunningMode(2).should.eq('power')
                    bottle.container.pump.getCurrentRunningValue(2).should.eq(1)

                    clock.tick(59 * 60 * 1000) //+1 hr
                    bottle.container.pump.getCurrentRemainingDuration(2).should.eq(-1)
                }).then(done, done)
            })

            it('API #3: turns on pump 2 for a duration of 30 mins', function (done) {
                global.requestPoolDataWithURLAsync('pumpCommand/run/pump/2/duration/30').then(function (obj) {
                    obj.text.should.contain('REST API')
                    obj.pump.should.eq(2)
                    // obj.duration.should.eq(600)
                    // console.log('pumpQueue:', queuePacketStub.args)
                    clock.tick(60 * 1000)
                    bottle.container.pump.getCurrentRemainingDuration(2).should.eq(29)
                    bottle.container.pump.getCurrentRunningMode(2).should.eq('power')
                    bottle.container.pump.getCurrentRunningValue(2).should.eq(1)
                    clock.tick(29 * 60 * 1000) //+29 mins (30 total)
                    bottle.container.pump.getCurrentRemainingDuration(2).should.eq(0)
                    clock.tick(1 * 60 * 1000) //+1 min (31 total)
                    bottle.container.pump.getCurrentRemainingDuration(2).should.eq(-1)
                }).then(done, done)
            })

        })


        describe('#sends pump commands', function () {

            before(function () {
                return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config.pump.VS.json'})
            });

            beforeEach(function () {
                // sinon = sinon.sinon.create()
                loggers = setupLoggerStubOrSpy('stub', 'stub')
                clock = sinon.useFakeTimers()

                queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
                // pumpCommandStub = sinon.spy(bottle.container.pumpControllerMiddleware, 'pumpCommand')
                socketIOStub = sinon.stub(bottle.container.io, 'emitToClients')
                settingsStub = sinon.stub(bottle.container.settings, 'updateExternalPumpProgramAsync')
            })

            afterEach(function () {
                //restore the sinon after each function
                bottle.container.pumpControllerTimers.clearTimer(1)
                bottle.container.pumpControllerTimers.clearTimer(2)
                sinon.restore()

            })

            after(function () {
                return global.stopAllAsync()
            })
            context('with the current HTTP REST API', function () {


                it('API #3: turns on pump 1 for 15 minutes', function (done) {
                    this.timeout(4 * 1000)
                    global.requestPoolDataWithURLAsync('pumpCommand/run/pump/1/duration/15').then(function (obj) {
                        obj.text.should.contain('REST API')
                        obj.pump.should.eq(1)
                        // obj.duration.should.eq(600)
                        // console.log('pumpQueue:', queuePacketStub.args)
                        clock.tick(60 * 1000) //+1 min

                        bottle.container.pump.getCurrentRemainingDuration(1).should.eq(14)
                        bottle.container.pump.getCurrentRunningMode(1).should.eq('power')
                        bottle.container.pump.getCurrentRunningValue(1).should.eq(1)

                        clock.tick(59 * 60 * 1000) //+1 hr
                        bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                        bottle.container.pump.getCurrentRunningMode(1).should.eq('off')
                        bottle.container.pump.getCurrentRunningValue(1).should.eq(0)

                    }).then(done, done)
                })

                // it('API #4: runs pump 1, program 1', function(done) {
                //     global.requestPoolDataWithURLAsync('pumpCommand/1/1').then(function(result) {
                //         // console.log('loggerInfoStub called with: ', loggerInfoStub.args)
                //         // console.log('loggerWarnStub called with: ', loggerWarnStub.args)
                //         // console.log('pumpCommandStub called with: ', pumpCommandStub.args)
                //         // console.log('result: ', result)
                //         pumpCommandStub.args[0][0].should.eq(1)
                //         pumpCommandStub.args[0][1].should.eq('1') //should be a sting because it could be 0-4 or on/off
                //         loggerWarnStub.calledOnce.should.be.true
                //         result.program.should.eq('1')
                //         done()
                //
                //     })
                //
                // });
                it('API #4: runs pump 1, program 1 (NEW URL)', function (done) {

                    global.requestPoolDataWithURLAsync('pumpCommand/run/pump/1/program/1').then(function (obj) {
                        // console.log('obj: ', obj)
                        obj.text.should.contain('REST API')
                        obj.pump.should.eq(1)
                        obj.duration.should.eq(-1)
                        clock.tick(60 * 1000) //+1 min

                        bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)

                        clock.tick(59 * 60 * 1000) //+1 hr
                        bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                    }).then(done, done)
                });
                it('API #4: runs pump 2, program 1 (NEW URL)', function (done) {

                    global.requestPoolDataWithURLAsync('pumpCommand/run/pump/2/program/4').then(function (obj) {
                        obj.text.should.contain('REST API')
                        obj.pump.should.eq(2)
                        obj.program.should.eq(4)
                        obj.duration.should.eq(-1)
                        clock.tick(1000)
                        clock.tick(60 * 1000) //+1 min

                        bottle.container.pump.getCurrentRemainingDuration(2).should.eq(-1)

                        clock.tick(59 * 60 * 1000) //+1 hr
                        bottle.container.pump.getCurrentRemainingDuration(2).should.eq(-1)
                    }).then(done, done)
                });
                it('API #5: runs pump 1, program 1 for 2 minutes (NEW URL)', function (done) {
                    this.timeout(4 * 1000)
                    global.requestPoolDataWithURLAsync('pumpCommand/run/pump/1/program/1/duration/2').then(function (obj) {
                        obj.text.should.contain('REST API')
                        obj.pump.should.eq(1)
                        obj.program.should.eq(1)

                        obj.duration.should.eq(2)
                        clock.tick(59 * 1000) // +59 seconds
                        bottle.container.pump.getCurrentRemainingDuration(1).should.eq(1)
                        clock.tick(1 * 1000) //1 min
                        bottle.container.pump.getCurrentRemainingDuration(1).should.eq(0.5)
                        clock.tick(59 * 60 * 1000) //+1 hr
                        bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                    }).then(done, done)
                });

                it('API #5: runs pump 1, program 1 for 600 minutes ', function () {

                    return global.requestPoolDataWithURLAsync('pumpCommand/run/pump/1/program/1/duration/600').then(function (obj) {
                        obj.text.should.contain('REST API')
                        obj.pump.should.eq(1)
                        obj.duration.should.eq(600)
                        // console.log('pumpQueue:', queuePacketStub.args)
                        clock.tick(59 * 1000) //+59 seconds

                        bottle.container.pump.getCurrentRemainingDuration(1).should.eq(599)
                        clock.tick(59 * 60 * 1000) //+59 mins (59min 59sec total)
                        bottle.container.pump.getCurrentRemainingDuration(1).should.eq(540)
                    })


                })
                it('API #5: runs pump 1, program 2 for 10 minutes ', function () {
                    this.timeout(4 * 1000)
                    return global.requestPoolDataWithURLAsync('pumpCommand/run/pump/1/program/2/duration/10')
                        .then(function (obj) {
                            obj.text.should.contain('REST API')
                            obj.pump.should.eq(1)
                            obj.duration.should.eq(10)
                            // console.log('pumpQueue:', queuePacketStub.args)
                            clock.tick(59 * 1000) //+59 seconds

                            bottle.container.pump.getCurrentRemainingDuration(1).should.eq(9)

                            clock.tick(59 * 60 * 1000) //+59 mins (59min 59sec total)
                            bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                        })


                })

                it('API #6: runs pump 1, rpm 1000', function (done) {

                    global.requestPoolDataWithURLAsync('pumpCommand/run/pump/1/rpm/1000').then(function (obj) {
                        //console.log('obj: ', obj)
                        obj.text.should.contain('REST API')
                        obj.pump.should.eq(1)
                        obj.duration.should.eq(-1)
                        clock.tick(60 * 1000) //+1 min
                        queuePacketStub.args[0][0].should.deep.eq([165, 0, 96, 33, 4, 1, 255])
                        queuePacketStub.args[1][0].should.deep.eq([165, 0, 96, 33, 6, 1, 10])
                        queuePacketStub.args[2][0].should.deep.eq([165, 0, 96, 33, 1, 4, 2, 196, 3, 232])
                        queuePacketStub.args[3][0].should.deep.eq([165, 0, 96, 33, 7, 0])
                        bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)

                        clock.tick(59 * 60 * 1000) //+1 hr
                        bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                    }).then(done, done)
                });

                it('API #6: runs pump 2, rpm 1000', function (done) {

                    global.requestPoolDataWithURLAsync('pumpCommand/run/pump/2/rpm/1000').then(function (obj) {
                        obj.text.should.contain('REST API')
                        obj.pump.should.eq(2)
                        // obj.duration.should.eq(600)
                        // console.log('pumpQueue:', queuePacketStub.args)
                        clock.tick(60 * 1000) //+1 min

                        bottle.container.pump.getCurrentRemainingDuration(2).should.eq(-1)

                        clock.tick(59 * 60 * 1000) //+1 hr
                        bottle.container.pump.getCurrentRemainingDuration(2).should.eq(-1)
                    }).then(done, done)
                })

                it('API #7: runs pump 2, rpm 1000 for 600 minutes ', function (done) {
                    this.timeout(10 * 1000)
                    global.requestPoolDataWithURLAsync('pumpCommand/run/pump/2/rpm/1000/duration/600').then(function (obj) {
                        obj.text.should.contain('REST API')
                        obj.pump.should.eq(2)
                        obj.duration.should.eq(600)
                        // console.log('pumpQueue:', queuePacketStub.args)
                        clock.tick(59 * 1000) //+59 sec

                        bottle.container.pump.getCurrentRemainingDuration(2).should.eq(599)

                        clock.tick(59 * 60 * 1000) //59 min, 59 sec
                        bottle.container.pump.getCurrentRemainingDuration(2).should.eq(540)
                        clock.tick(9 * 60 * 60 * 1000) //+9 hours(9:59:59 total)
                        bottle.container.pump.getCurrentRemainingDuration(2).should.eq(0)
                        clock.tick(60 * 60 * 1000) //+1 min more
                        bottle.container.pump.getCurrentRemainingDuration(2).should.eq(-1)
                    }).then(done, done)
                })
                it('API #7: runs pump 2, rpm 1000, duration 600, then turns it off', function (done) {

                    global.requestPoolDataWithURLAsync('pumpCommand/run/pump/2/rpm/1000/duration/600').then(function (obj) {
                        obj.text.should.contain('REST API')
                        obj.pump.should.eq(2)
                        // obj.duration.should.eq(600)
                        // console.log('pumpQueue:', queuePacketStub.args)
                        clock.tick(59 * 1000) //+59 secs

                        bottle.container.pump.getCurrentRemainingDuration(2).should.eq(599)
                        bottle.container.pump.getCurrentRunningValue(2).should.eq(1000)

                        clock.tick(59 * 60 * 1000) //+59:59
                        bottle.container.pump.getCurrentRemainingDuration(2).should.eq(540)
                    }).then(function () {
                        global.requestPoolDataWithURLAsync('pumpCommand/off/pump/2').then(function (obj) {
                            clock.tick(1 * 1000)
                            bottle.container.pump.getCurrentRemainingDuration(2).should.eq(-1)
                            bottle.container.pump.getCurrentRunningValue(2).should.eq(0)
                            bottle.container.pump.getCurrentRunningMode(2).should.eq('off')
                        }).then(done, done)
                    })
                })

                it('API #8: saves pump 1 program 1 to 1000 rpm (NEW URL)', function (done) {

                    global.requestPoolDataWithURLAsync('pumpCommand/save/pump/1/program/1/rpm/1010')
                        .then(function (obj) {
                            obj.text.should.contain('REST API')
                            obj.pump.should.eq(1)
                            obj.program.should.eq(1)
                            obj.speed.should.eq(1010)
                            clock.tick(59 * 1000) //+59 sec

                            bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)

                            clock.tick(59 * 60 * 1000) //59:59
                            bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                        }).then(done, done)
                })

                it('API #9: saves and runs pump 1 to program 3 at 2000 rpm for unspecified (NEW URL)', function (done) {

                    global.requestPoolDataWithURLAsync('pumpCommand/saverun/pump/1/program/3/rpm/2000/').then(function (obj) {
                        obj.text.should.contain('REST API')
                        obj.pump.should.eq(1)
                        obj.program.should.eq(3)
                        obj.speed.should.eq(2000)
                        obj.duration.should.eq(-1)
                        clock.tick(59 * 1000) //+59 sec

                        bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)

                        clock.tick(59 * 60 * 1000) //+1 hr
                        bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                    }).then(done, done)

                })


                it('API #10: saves and runs pump 1 to program 1 at 1000 rpm for 2 minutes (NEW URL)', function (done) {
                    this.timeout(5 * 1000)
                    global.requestPoolDataWithURLAsync('pumpCommand/saverun/pump/1/program/1/rpm/1000/duration/2').then(function (obj) {
                        obj.text.should.contain('REST API')
                        obj.pump.should.eq(1)
                        obj.program.should.eq(1)
                        obj.speed.should.eq(1000)
                        obj.duration.should.eq(2)
                        clock.tick(59 * 1000) //+59 sec min

                        bottle.container.pump.getCurrentRemainingDuration(1).should.eq(1)

                        clock.tick(59 * 60 * 1000) //+1 hr
                        bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                    }).then(done, done)
                })

                it('Multiple starts/stops: runs pump 1, rpm 1000, duration 5m, but turns it off after 3 min, then 2 mins later runs it for 3 mins @ 2500 rpm, then monitors off for 2 mins ', function (done) {

                    Promise.resolve()
                        .then(function () {
                            return global.requestPoolDataWithURLAsync('pumpCommand/run/pump/1/rpm/1000/duration/5')
                        })
                        .then(function (obj) {
                            obj.text.should.contain('REST API')
                            obj.pump.should.eq(1)
                            obj.duration.should.eq(5)
                            // console.log('pumpQueue:', queuePacketStub.args)
                            clock.tick(60 * 1000) // 1 min
                            // console.log('after 59 tick')
                            bottle.container.pump.getCurrentRemainingDuration(1).should.eq(3.5)
                            bottle.container.pump.getCurrentRunningValue(1).should.eq(1000)

                            clock.tick(2 * 60 * 1000) // 3 mins total
                            // console.log('pumpQueue2:', queuePacketStub.args)
                            bottle.container.pump.getCurrentRemainingDuration(1).should.eq(1.5)
                            return
                        }).then(function () {
                        return global.requestPoolDataWithURLAsync('pumpCommand/off/pump/1')
                    })
                        .then(function (obj) {
                            //clock.tick(1 * 1000)
                            // console.log('pumpQueue3:', queuePacketStub.args)
                            bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                            bottle.container.pump.getCurrentRunningValue(1).should.eq(0)
                            bottle.container.pump.getCurrentRunningMode(1).should.eq('off')
                            clock.tick(2 * 60 * 1000)
                            // console.log('pumpQueue4:', queuePacketStub.args)
                            return
                        })
                        .then(function () {
                            return global.requestPoolDataWithURLAsync('pumpCommand/run/pump/1/rpm/2500/duration/3')

                        })
                        .then(function (obj) {

                            // console.log('pumpQueue5:', queuePacketStub.args)

                            obj.text.should.contain('REST API')
                            obj.pump.should.eq(1)
                            obj.duration.should.eq(3)
                            clock.tick(2 * 60 * 1000)
                            bottle.container.pump.getCurrentRemainingDuration(1).should.eq(0.5)
                            bottle.container.pump.getCurrentRunningValue(1).should.eq(2500)
                            bottle.container.pump.getCurrentRunningMode(1).should.eq('rpm')
                            // console.log('pumpQueue6:', queuePacketStub.args)
                            clock.tick(2 * 60 * 1000)
                            bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                            bottle.container.pump.getCurrentRunningValue(1).should.eq(0)
                            bottle.container.pump.getCurrentRunningMode(1).should.eq('off')
                            clock.tick(5 * 60 * 1000)
                            bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                            bottle.container.pump.getCurrentRunningValue(1).should.eq(0)
                            bottle.container.pump.getCurrentRunningMode(1).should.eq('off')
                            // console.log('pumpQueue7:', queuePacketStub.args)
                            return
                        })
                        .then(function () {
                            // console.log('finally done')
                            done()
                        })
                        .catch(function (err) {
                            /* istanbul ignore next */
                            console.log('something went wrong:', err)
                            done()
                        })
                })

            })


        })

        describe('#sends pump commands that fail', function () {

            before(function () {
                return global.initAllAsync()
            });

            beforeEach(function () {
                loggers = setupLoggerStubOrSpy('stub','stub')
               // clock = sinon.useFakeTimers()

                queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
                // pumpCommandStub = sinon.spy(bottle.container.pumpControllerMiddleware, 'pumpCommand')
                socketIOStub = sinon.stub(bottle.container.io, 'emitToClients')
                settingsStub = sinon.stub(bottle.container.settings, 'updateExternalPumpProgramAsync')
            })

            afterEach(function () {
                //restore the sinon after each function
                bottle.container.pumpControllerTimers.clearTimer(1)
                bottle.container.pumpControllerTimers.clearTimer(2)
                sinon.restore()

            })

            after(function () {
                return global.stopAllAsync()
            })
            context('with the current HTTP REST API, but sending GPM to a VS pump, Should Fail', function () {



                it('API #13: saves program 3 as 27GPM', function (done) {
                    this.timeout(5 * 1000)
                    global.requestPoolDataWithURLAsync('pumpCommand/save/pump/1/program/3/gpm/27').then(function (obj) {
                        obj.text.should.contain('FAIL');
                    }).then(done, done)
                })

                it('API #14: saves and run program 4 as 28GPM for indefinite duration', function (done) {
                    //[ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
                    // [ [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 32 ] ],
                    //     [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
                    //     [ [ 165, 0, 96, 33, 7, 0 ] ] ]
                    this.timeout(5 * 1000)
                    global.requestPoolDataWithURLAsync('pumpCommand/saverun/pump/1/program/4/gpm/28').then(function (obj) {
                        obj.text.should.contain('FAIL');

                    }).then(done, done)
                })


                it('API #15: saves and run program 4 as 28GPM for 3 mins', function (done) {
                      this.timeout(5 * 1000)
                    global.requestPoolDataWithURLAsync('pumpCommand/saverun/pump/1/program/4/gpm/28/duration/3')
                        .then(function (obj) {
                            obj.text.should.contain('FAIL');
                        })
                        .then(done,done)
                })
            })

            context('with invalid URIs', function () {

                // it('sets pump 1 program 1 to 1000 rpm', function(done) {

                //     global.requestPoolDataWithURLAsync('pumpCommand/1/1/1000').then(function(obj) {
                //         // console.log('obj: ', obj)
                //         obj.text.should.contain('REST API')
                //         obj.pump.should.eq(1)
                //         obj.program.should.eq(1)
                //         obj.value.should.eq(1000)
                //         loggerWarnStub.calledOnce.should.be.true
                //         clock.tick(60 * 1000) //+1 min
                //
                //         bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                //
                //         clock.tick(59 * 60 * 1000) //+1 hr
                //         bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                //         done()
                //     });
                // });


                it('saves pump 1 at program 1 (should fail // no speed)', function (done) {

                    global.requestPoolDataWithURLAsync('pumpCommand/save/pump/1/program/1').then(function (obj) {

                        obj.text.should.contain('FAIL');
                    }).then(done, done)
                });

                it('saves pump 1 and rpm 1000 (should fail // no program)', function (done) {
                    consoleEStub = sinon.stub(console, 'error')
                    consoleStub = sinon.stub(console, 'log')
                    global.requestPoolDataWithURLAsync('pumpCommand/save/pump/1/rpm/1000').then(function (obj) {

                        obj.text.should.contain('Please provide the program')
                    }).then(done, done)
                });
                it('saves speed 1000 to program 1 (should fail // no pump)', function (done) {

                    global.requestPoolDataWithURLAsync('pumpCommand/save/program/1/rpm/1000').then(function (obj) {
                        throw Error('Should Fail Here')
                    })
                        .catch(function(err){
                            err.message.should.contain('404')
                        })
                        .then(done, done)
                });
            })

        })




    })





})
