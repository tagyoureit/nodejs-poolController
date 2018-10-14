describe('#sends pump commands to a VF pump', function () {
    context('with a HTTP REST API', function () {

        before(function () {

        });

        beforeEach(function(){

            // getCurrentStatusStub = sinon.stub(bottle.container.pump, 'getCurrentPumpStatus').returns({
            //     "pump": {
            //         "1": {type: 'VF'},
            //         "2": {type: 'VF'}
            //     }
            // })
            // pumpCommandStub = sinon.spy(bottle.container.pumpControllerMiddleware, 'pumpCommand')
            //socketIOStub = sinon.stub(bottle.container.io, 'emitToClients')

                    return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config.pump.VF_VSF.json'})


                .then(function(){
                    loggers = setupLoggerStubOrSpy('stub', 'stub')
                    clock = sinon.useFakeTimers()
                    queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
                })
                .then(bottle.container.pump.init)
                .catch(function(e){console.log('error!!!', e)})

        })

        afterEach(function () {

            return Promise.resolve()
                .then(function(){
                    bottle.container.pumpControllerTimers.clearTimer(1)
                    bottle.container.pumpControllerTimers.clearTimer(2)
                    sinon.restore()
                })
                .then(global.stopAllAsync)

        })

        after(function () {

        })


        it('API #11: runs pump 1 at 20GPM for indefinite duration', function () {
            //[ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
            // [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
            //     [ [ 165, 0, 96, 33, 1, 4, 2, 196, 0, 20 ] ],
            // [ [ 165, 0, 96, 33, 7, 0 ] ] ]
            this.timeout(5 * 1000)
            return global.requestPoolDataWithURLAsync('pumpCommand/run/pump/1/gpm/20')
                .then(function (obj) {
                    obj.text.should.contain('REST API')
                    obj.pump.should.eq(1)
                    obj.speed.should.eq(20)
                    obj.duration.should.eq(-1)
                    clock.tick(59 * 1000) //+59 sec min
                    queuePacketStub.args[0][0].should.deep.eq([165, 0, 96, 33, 4, 1, 255])
                    queuePacketStub.args[1][0].should.deep.eq([165, 0, 96, 33, 6, 1, 10])
                    queuePacketStub.args[2][0].should.deep.eq([165, 0, 96, 33, 1, 4, 2, 228, 0, 20])
                    queuePacketStub.args[3][0].should.deep.eq([165, 0, 96, 33, 7, 0])

                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)

                    clock.tick(59 * 60 * 1000) //+1 hr
                    bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
                })
        })

        it('API #12: runs pump 1 at 25GPM for 5 mins', function (done) {
            // api 12: {"text":"REST API pumpCommand variables - pump: 1, gpm: 25, duration: 5","pump":1,"value":25,"duration":5}
            // qps: [ [ [ 165, 0, 96, 33, 4, 1, 255 ] ],
            //     [ [ 165, 0, 96, 33, 6, 1, 10 ] ],
            //     [ [ 165, 0, 96, 33, 1, 4, 2, 196, 0, 25 ] ],
            //     [ [ 165, 0, 96, 33, 7, 0 ] ] ]
            this.timeout(5 * 1000)
            global.requestPoolDataWithURLAsync('pumpCommand/run/pump/1/gpm/25/duration/5').then(function (obj) {
                obj.text.should.contain('REST API')
                obj.pump.should.eq(1)
                obj.speed.should.eq(25)
                obj.duration.should.eq(5)
                queuePacketStub.args[0][0].should.deep.eq([165, 0, 96, 33, 4, 1, 255])
                queuePacketStub.args[1][0].should.deep.eq([165, 0, 96, 33, 6, 1, 10])
                queuePacketStub.args[2][0].should.deep.eq([165, 0, 96, 33, 1, 4, 2, 228, 0, 25])
                queuePacketStub.args[3][0].should.deep.eq([165, 0, 96, 33, 7, 0])
                clock.tick(59 * 1000) //+59 sec min

                bottle.container.pump.getCurrentRemainingDuration(1).should.eq(4)

                clock.tick(59 * 60 * 1000) //+1 hr
                bottle.container.pump.getCurrentRemainingDuration(1).should.eq(-1)
            }).then(done, done)
        })

    })
})
