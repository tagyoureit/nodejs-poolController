describe('#fails to set various functions', function() {
    describe('#sets the date/time', function() {

        before(function() {
            return global.initAllAsync()
        });

        beforeEach(function() {
            loggers = setupLoggerStubOrSpy('stub', 'stub')
            queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
            preambleStub = sinon.stub(bottle.container.intellitouch, 'getPreambleByte').returns(33)

        })

        afterEach(function() {
            //restore the sinon after each function
            bottle.container.time.init()
            sinon.restore()
        })

        after(function() {
            return global.stopAllAsync()
        })


        context('with an invalid HTTP REST call', function() {


            it('fails to set a valid date/time with invalid time (should fail)', function(done) {
                global.requestPoolDataWithURLAsync('datetime/set/time/21/61/date/2/01/02/19/0')
                    .then(function(obj) {
                        obj.text.should.contain('FAIL')
                        var res = bottle.container.time.getTime().time
                        res.controllerTime.should.eq(-1)
                    })
                    .then(done,done)
            })
            it('fails to set a valid date/time with invalid date (should fail)', function(done) {
                global.requestPoolDataWithURLAsync('datetime/set/time/21/31/date/128/01/02/19/0')
                    .then(function(obj) {
                        obj.text.should.contain('FAIL')
                        var res = bottle.container.time.getTime().time
                        res.controllerTime.should.eq(-1)
                    })
                    .then(done,done)
            })
            it('fails to set a valid date/time with invalid dst (should fail)', function(done) {
                global.requestPoolDataWithURLAsync('datetime/set/time/21/31/date/8/01/02/19/3')
                    .then(function(obj) {
                        obj.text.should.contain('FAIL')
                        var res = bottle.container.time.getTime().time
                        res.controllerTime.should.eq(-1)
                    })
                    .then(done,done)
            })
        })
    })

})
