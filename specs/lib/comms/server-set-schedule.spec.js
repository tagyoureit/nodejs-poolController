
describe('#sets various functions', function() {

    describe('#sets the date/time', function() {

        before(function() {
            return global.initAllAsync()
        });

        beforeEach(function() {
            loggers = setupLoggerStubOrSpy('stub', 'spy')


            queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
            preambleStub = sinon.stub(bottle.container.intellitouch, 'getPreambleByte').returns(99)
        })

        afterEach(function() {
            //restore the sinon after each function
            bottle.container.time.init()
            sinon.restore()

        })

        after(function() {
            return global.stopAllAsync()
        })
        context('with the HTTP REST API', function() {


            it('sets a valid schedule 12', function() {
                return global.requestPoolDataWithURLAsync('schedule/set/12/5/13/20/13/40/131')
                    .then(function(obj) {
                    obj.text.should.contain('REST API')
                    //                    console.log('queuePacketStub', queuePacketStub.args)
                    queuePacketStub.args[0][0].should.contain.members([165, 99, 16, 33, 145, 7, 12, 5, 13, 20, 13, 40, 131])
                    queuePacketStub.args[1][0].should.contain.members([165, 99, 16, 33, 209, 1, 1])
                    queuePacketStub.args[12][0].should.contain.members([165, 99, 16, 33, 209, 1, 12])

                })
            })

        })
        context('with an invalid HTTP REST call', function() {


            // it('fails to set a valid date/time with invalid time (should fail)', function(done) {
            //     global.requestPoolDataWithURLAsync('datetime/set/time/21/61/date/2/01/02/19/0').then(function(obj) {
            //         obj.text.should.contain('FAIL')
            //         var res = bottle.container.time.getTime()
            //         res.controllerTime.should.eq(-1)
            //         done()
            //     })
            // })
            // it('fails to set a valid date/time with invalid date (should fail)', function(done) {
            //     global.requestPoolDataWithURLAsync('datetime/set/time/21/31/date/128/01/02/19/0').then(function(obj) {
            //         obj.text.should.contain('FAIL')
            //         var res = bottle.container.time.getTime()
            //         res.controllerTime.should.eq(-1)
            //         done()
            //     })
            // })
            // it('fails to set a valid date/time with invalid dst (should fail)', function(done) {
            //     global.requestPoolDataWithURLAsync('datetime/set/time/21/31/date/8/01/02/19/3').then(function(obj) {
            //         obj.text.should.contain('FAIL')
            //         var res = bottle.container.time.getTime()
            //         res.controllerTime.should.eq(-1)
            //         done()
            //     })
            // })
        })
    })

})
