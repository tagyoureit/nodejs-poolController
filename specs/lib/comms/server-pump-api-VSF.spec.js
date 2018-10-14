describe('#sends pump commands to a VSF pump', function () {
    context('with a HTTP REST API', function () {

        before(function () {

        });

        beforeEach(function(){

            return Promise.resolve()
                .then(function(){
                    return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config.pump.VF_VSF.json'})
                })
                .then(function(){
                    loggers = setupLoggerStubOrSpy('stub', 'spy')
                    clock = sinon.useFakeTimers()
                    queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
                    //socketIOStub = sinon.stub(bottle.container.io, 'emitToClients')

                })
                .then(bottle.container.pump.init)
                .catch(function(e){console.log('error!!!', e)})

        })

        afterEach(function () {
            sinon.restore()
            return global.stopAllAsync()

        })

        after(function () {
        })


        it('API #6: runs pump 2, rpm 1000', function (done) {
            global.requestPoolDataWithURLAsync('pumpCommand/run/pump/2/rpm/1000').then(function (obj) {
                // console.log('obj: ', obj)
                obj.text.should.contain('REST API')
                obj.pump.should.eq(2)
                obj.duration.should.eq(-1)
                clock.tick(60 * 1000) //+1 min
                queuePacketStub.args[0][0].should.deep.eq([165, 0, 97, 33, 4, 1, 255])
                queuePacketStub.args[1][0].should.deep.eq([165, 0, 97, 33, 6, 1, 10])
                queuePacketStub.args[2][0].should.deep.eq([165, 0, 97, 33, 10, 4, 2, 196, 3, 232])
                queuePacketStub.args[3][0].should.deep.eq([165, 0, 97, 33, 7, 0])
                bottle.container.pump.getCurrentRemainingDuration(2).should.eq(-1)

                clock.tick(59 * 60 * 1000) //+1 hr
                bottle.container.pump.getCurrentRemainingDuration(2).should.eq(-1)
            }).then(done, done)
        });


        it('API #11: runs pump 2 at 20GPM for indefinite duration', function (done) {
            //[ [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
            // [ [ 165, 0, 97, 33, 6, 1, 10 ] ],
            //     [ [ 165, 0, 97, 33, 1, 4, 2, 196, 0, 20 ] ],
            // [ [ 165, 0, 97, 33, 7, 0 ] ] ]
            this.timeout(5 * 1000)
            global.requestPoolDataWithURLAsync('pumpCommand/run/pump/2/gpm/20').then(function (obj) {
                obj.text.should.contain('REST API')
                obj.pump.should.eq(2)
                obj.speed.should.eq(20)
                obj.duration.should.eq(-1)
                clock.tick(59 * 1000) //+59 sec min
                queuePacketStub.args[0][0].should.deep.eq([165, 0, 97, 33, 4, 1, 255])
                queuePacketStub.args[1][0].should.deep.eq([165, 0, 97, 33, 6, 1, 10])
                queuePacketStub.args[2][0].should.deep.eq([165, 0, 97, 33, 9, 4, 2, 196, 0, 20])
                queuePacketStub.args[3][0].should.deep.eq([165, 0, 97, 33, 7, 0])

                bottle.container.pump.getCurrentRemainingDuration(2).should.eq(-1)

                clock.tick(59 * 60 * 1000) //+1 hr
                bottle.container.pump.getCurrentRemainingDuration(2).should.eq(-1)
            }).then(done, done)
        })

        it('API #12: runs pump 2 at 25GPM for 5 mins', function (done) {
            // api 12: {"text":"REST API pumpCommand variables - pump: 1, gpm: 25, duration: 5","pump":1,"value":25,"duration":5}
            // qps: [ [ [ 165, 0, 97, 33, 4, 1, 255 ] ],
            //     [ [ 165, 0, 97, 33, 6, 1, 10 ] ],
            //     [ [ 165, 0, 97, 33, 1, 4, 2, 196, 0, 25 ] ],
            //     [ [ 165, 0, 97, 33, 7, 0 ] ] ]
            this.timeout(5 * 1000)
            global.requestPoolDataWithURLAsync('pumpCommand/run/pump/2/gpm/25/duration/5').then(function (obj) {
                obj.text.should.contain('REST API')
                obj.pump.should.eq(2)
                obj.speed.should.eq(25)
                obj.duration.should.eq(5)
                queuePacketStub.args[0][0].should.deep.eq([165, 0, 97, 33, 4, 1, 255])
                queuePacketStub.args[1][0].should.deep.eq([165, 0, 97, 33, 6, 1, 10])
                queuePacketStub.args[2][0].should.deep.eq([165, 0, 97, 33, 9, 4, 2, 196, 0, 25])
                queuePacketStub.args[3][0].should.deep.eq([165, 0, 97, 33, 7, 0])
                clock.tick(59 * 1000) //+59 sec min

                bottle.container.pump.getCurrentRemainingDuration(2).should.eq(4)

                clock.tick(59 * 60 * 1000) //+1 hr
                bottle.container.pump.getCurrentRemainingDuration(2).should.eq(-1)
            }).then(done, done)
        })

    })
})
