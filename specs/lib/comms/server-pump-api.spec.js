var URL = 'http://localhost:3000/'

function getAllPoolData(endpoint) {
    var options = {
        method: 'GET',
        uri: URL + endpoint,
        resolveWithFullResponse: true,
        json: true
    };
    return rp(options);
}

function requestPoolDataWithURL(endpoint) {
    //console.log('pending - request sent for ' + endpoint)
    return getAllPoolData(endpoint).then(
        function(response) {
            //  console.log('success - received data for %s request: %s', endpoint, JSON.stringify(response.body));
            return response.body;
        }
    ).catch(
        /* istanbul ignore next */
        function(err) {
            console.log('error:', err)
        });
}




describe('#set functions', function() {

    describe('#sends on->off pump commands in subsequent calls', function() {
        context('with a HTTP REST API', function() {

            before(function() {
                bottle.container.settings.expressAuth = 0
                bottle.container.settings.expressAuthFile = ''
                bottle.container.logger.transports.console.level = 'silly';
                sandbox = sinon.sandbox.create()
                clock = sandbox.useFakeTimers()
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
                queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
                pumpCommandStub = sandbox.spy(bottle.container.pumpControllerMiddleware, 'pumpCommand')
                socketIOStub = sandbox.stub(bottle.container.io, 'emitToClients')
                bottle.container.server.init()
            });


            after(function() {
                bottle.container.pumpControllerTimers.clearTimer(1)
                bottle.container.pumpControllerTimers.clearTimer(2)
                bottle.container.logger.transports.console.level = 'info';
                bottle.container.server.close()
                sandbox.restore()
                bottle.container.settings.logPumpTimers = 1
                bottle.container.settings.logPumpMessages = 1
            })



            it('API #1: turns off pump 1', function(done) {

                requestPoolDataWithURL('pumpCommand/off/pump/1').then(function(obj) {
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
                    done()
                })
            })
            it('API #1: turns off pump 2', function(done) {

                requestPoolDataWithURL('pumpCommand/off/pump/2').then(function(obj) {
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
                    done()

                })
            })
            it('API #2: turns on pump 1', function(done) {

                requestPoolDataWithURL('pumpCommand/run/pump/1').then(function(obj) {
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
                    done()

                })
            })

            it('API #2: turns on pump 2', function(done) {

                requestPoolDataWithURL('pumpCommand/run/pump/2').then(function(obj) {
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
                    done()
                })
            })
            it('API #3: turns on pump 2 for a duration', function(done) {
                requestPoolDataWithURL('pumpCommand/run/pump/2/duration/30').then(function(obj) {
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
                    done()
                })
            })

        })
    })

    describe('#sends pump commands', function() {

        before(function() {
            bottle.container.settings.logPumpMessages = 1
            bottle.container.settings.logPumpTimers = 1
            bottle.container.logger.transports.console.level = 'silly'
            bottle.container.server.init()
        });

        beforeEach(function() {
            sandbox = sinon.sandbox.create()
            clock = sandbox.useFakeTimers()
            loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
            loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
            loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
            loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
            loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
            queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
            pumpCommandStub = sandbox.spy(bottle.container.pumpControllerMiddleware, 'pumpCommand')
            socketIOStub = sandbox.stub(bottle.container.io, 'emitToClients')
        })

        afterEach(function() {
            //restore the sandbox after each function
            bottle.container.pumpControllerTimers.clearTimer(1)
            bottle.container.pumpControllerTimers.clearTimer(2)
            sandbox.restore()

        })

        after(function() {
            bottle.container.settings.logPumpTimers = 0
            bottle.container.settings.logPumpMessages = 0
            bottle.container.logger.transports.console.level = 'info'
            bottle.container.server.close()
        })
        context('with the current HTTP REST API', function() {




            it('API #3: turns on pump 1 for 15 minutes', function(done) {
                bottle.container.settings.logPumpTimers = 1
                bottle.container.settings.logPumpMessages = 1
                requestPoolDataWithURL('pumpCommand/run/pump/1/duration/15').then(function(obj) {
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

                    done()
                })
            })

            it('API #4: runs pump 1, program 1', function(done) {
                requestPoolDataWithURL('pumpCommand/1/1').then(function(result) {
                    // console.log('loggerStub called with: ', loggerStub.args)
                    // console.log('pumpCommandStub2 called with: ', pumpCommandStub.args)
                    // console.log('result: ', result)
                    //loggerStub.args[0][0].should.eq('Please update the URL to the new format: /pumpCommand/{run or save}/pump/1/program/1')
                    pumpCommandStub.args[0][0].should.eq(1)
                    pumpCommandStub.args[0][1].should.eq('1') //should be a sting because it could be 0-4 or on/off
                    loggerWarnStub.calledOnce.should.be.true
                    result.program.should.eq('1')
                    done()

                })

            });
            it('API #4: runs pump 1, program 1 (NEW URL)', function(done) {

                requestPoolDataWithURL('pumpCommand/run/pump/1/program/1').then(function(obj) {
                    // console.log('obj: ', obj)
                    obj.text.should.contain('REST API')
                    obj.pump.should.eq(1)
                    obj.duration.should.eq(-1)
                    clock.tick(60 * 1000) //+1 min

                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)

                    clock.tick(59 * 60 * 1000) //+1 hr
                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                    done()
                });
            });
            it('API #4: runs pump 2, program 1 (NEW URL)', function(done) {

                requestPoolDataWithURL('pumpCommand/run/pump/2/program/4').then(function(obj) {
                    obj.text.should.contain('REST API')
                    obj.pump.should.eq(2)
                    obj.program.should.eq(4)
                    obj.duration.should.eq(-1)
                    clock.tick(1000)
                    clock.tick(60 * 1000) //+1 min

                    bottle.container.pump.getCurrentRemainingDuration(2).should.eq(-1)

                    clock.tick(59 * 60 * 1000) //+1 hr
                    bottle.container.pump.getCurrentRemainingDuration(2).should.eq(-1)
                    done()
                });
            });
            it('API #5: runs pump 1, program 1 for 2 minutes (NEW URL)', function(done) {

                requestPoolDataWithURL('pumpCommand/run/pump/1/program/1/duration/2').then(function(obj) {
                    obj.text.should.contain('REST API')
                    obj.pump.should.eq(1)
                    obj.program.should.eq(1)

                    obj.duration.should.eq(2)
                    clock.tick(59 * 1000) // +59 seconds
                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(1)
                    clock.tick(1 * 1000) //1 min
                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(.5)
                    clock.tick(59 * 60 * 1000) //+1 hr
                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                    done()
                });
            });

            it('API #5: runs pump 1, program 1 for 600 minutes ', function() {

                return requestPoolDataWithURL('pumpCommand/run/pump/1/program/1/duration/600').then(function(obj) {
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
            it('API #5: runs pump 1, program 2 for 10 minutes ', function() {

                return requestPoolDataWithURL('pumpCommand/run/pump/1/program/2/duration/10')
                    .then(function(obj) {
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

            it('API #6: runs pump 1, rpm 1000 (NEW URL)', function(done) {

                requestPoolDataWithURL('pumpCommand/run/pump/1/rpm/1000').then(function(obj) {
                    // console.log('obj: ', obj)
                    obj.text.should.contain('REST API')
                    obj.pump.should.eq(1)
                    obj.duration.should.eq(-1)
                    clock.tick(60 * 1000) //+1 min

                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)

                    clock.tick(59 * 60 * 1000) //+1 hr
                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                    done()
                });
            });
            it('API #6: runs pump 2, rpm 1000', function(done) {

                requestPoolDataWithURL('pumpCommand/run/pump/2/rpm/1000').then(function(obj) {
                    obj.text.should.contain('REST API')
                    obj.pump.should.eq(2)
                    // obj.duration.should.eq(600)
                    // console.log('pumpQueue:', queuePacketStub.args)
                    clock.tick(60 * 1000) //+1 min

                    bottle.container.pump.getCurrentRemainingDuration(2).should.eq(-1)

                    clock.tick(59 * 60 * 1000) //+1 hr
                    bottle.container.pump.getCurrentRemainingDuration(2).should.eq(-1)
                    done()
                })
            })

            it('API #7: runs pump 2, rpm 1000 for 600 minutes ', function(done) {
                this.timeout(10 * 1000)
                requestPoolDataWithURL('pumpCommand/run/pump/2/rpm/1000/duration/600').then(function(obj) {
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
                    done()
                })
            })
            it('API #7: runs pump 2, rpm 1000, duration 600, then turns it off', function(done) {

                requestPoolDataWithURL('pumpCommand/run/pump/2/rpm/1000/duration/600').then(function(obj) {
                    obj.text.should.contain('REST API')
                    obj.pump.should.eq(2)
                    // obj.duration.should.eq(600)
                    // console.log('pumpQueue:', queuePacketStub.args)
                    clock.tick(59 * 1000) //+59 secs

                    bottle.container.pump.getCurrentRemainingDuration(2).should.eq(599)
                    bottle.container.pump.getCurrentRunningValue(2).should.eq(1000)

                    clock.tick(59 * 60 * 1000) //+59:59
                    bottle.container.pump.getCurrentRemainingDuration(2).should.eq(540)
                }).then(function() {
                    requestPoolDataWithURL('pumpCommand/off/pump/2').then(function(obj) {
                        clock.tick(1 * 1000)
                        bottle.container.pump.getCurrentRemainingDuration(2).should.eq(-1)
                        bottle.container.pump.getCurrentRunningValue(2).should.eq(0)
                        bottle.container.pump.getCurrentRunningMode(2).should.eq('off')
                        done()
                    })
                })
            })
            it('API #8: saves pump 1 program 1 to 1000 rpm (NEW URL)', function(done) {

                requestPoolDataWithURL('pumpCommand/save/pump/1/program/1/rpm/1000').then(function(obj) {
                    // console.log('obj: ', obj)
                    obj.text.should.contain('REST API')
                    obj.pump.should.eq(1)
                    obj.program.should.eq(1)
                    obj.speed.should.eq(1000)
                    clock.tick(59 * 1000) //+59 sec

                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)

                    clock.tick(59 * 60 * 1000) //59:59
                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                    done()
                });
            });
            it('API #9: saves and runs pump 1 to program 3 at 2000 rpm for unspecified (NEW URL)', function(done) {

                requestPoolDataWithURL('pumpCommand/saverun/pump/1/program/3/rpm/2000/').then(function(obj) {
                    obj.text.should.contain('REST API')
                    obj.pump.should.eq(1)
                    obj.program.should.eq(3)
                    obj.speed.should.eq(2000)
                    obj.duration.should.eq(-1)
                    clock.tick(59 * 1000) //+59 sec

                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)

                    clock.tick(59 * 60 * 1000) //+1 hr
                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                    done()
                });

            })


            it('API #10: saves and runs pump 1 to program 1 at 1000 rpm for 2 minutes (NEW URL)', function(done) {

                requestPoolDataWithURL('pumpCommand/saverun/pump/1/program/1/rpm/1000/duration/2').then(function(obj) {
                    obj.text.should.contain('REST API')
                    obj.pump.should.eq(1)
                    obj.program.should.eq(1)
                    obj.speed.should.eq(1000)
                    obj.duration.should.eq(2)
                    clock.tick(59 * 1000) //+59 sec min

                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(1)

                    clock.tick(59 * 60 * 1000) //+1 hr
                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                    done()
                });

            })







        })



        context('with the original HTTP REST API', function() {
            it('API #10: sets pump 1 to program 1 at 1000 rpm for 2 minutes', function(done) {

                requestPoolDataWithURL('pumpCommand/1/1/1000/2').then(function(obj) {
                    obj.text.should.contain('REST API')
                    obj.pump.should.eq(1)
                    obj.program.should.eq(1)
                    obj.speed.should.eq(1000)
                    obj.duration.should.eq(2)
                    clock.tick(59 * 1000) //+59 secs

                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(1)

                    clock.tick(59 * 60 * 1000) //+59:59
                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                    done()
                })
            });
        })
        context('with invalid URIs', function() {
            it('sets pump 1 program 1 to 1000 rpm', function(done) {

                requestPoolDataWithURL('pumpCommand/1/1/1000').then(function(obj) {
                    // console.log('obj: ', obj)
                    obj.text.should.contain('REST API')
                    obj.pump.should.eq(1)
                    obj.program.should.eq(1)
                    obj.value.should.eq(1000)
                    loggerWarnStub.calledOnce.should.be.true
                    clock.tick(60 * 1000) //+1 min

                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)

                    clock.tick(59 * 60 * 1000) //+1 hr
                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                    done()
                });
            });



            it('saves pump 1 at rpm 1000 (should fail // no program)', function(done) {

                requestPoolDataWithURL('pumpCommand/save/pump/1/program/1').then(function(obj) {

                    obj.text.should.contain('FAIL');
                    done()
                });
            });
        })
        it('saves pump 1 and rpm 1 (should fail // no program)', function(done) {

            requestPoolDataWithURL('pumpCommand/save/pump/1/rpm/1000').then(function(obj) {
                // console.log('obj: ', obj)
                obj.text.should.contain('Please provide the program')
                done()
            })
        });
        it('saves pump 1 to program 1 (should fail)', function(done) {

            requestPoolDataWithURL('pumpCommand/save/pump/1/program/1').then(function(obj) {
                // console.log('obj: ', obj)
                obj.text.should.contain('FAIL')
                done()
            });
        });
    })

})
