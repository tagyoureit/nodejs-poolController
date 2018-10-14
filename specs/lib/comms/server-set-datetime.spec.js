describe('#sets various functions', function() {
    describe('#sets the date/time', function() {

        before(function() {
            return global.initAllAsync()
        });

        beforeEach(function() {
            // sinon = sinon.sinon.create()

            loggers = setupLoggerStubOrSpy('stub', 'stub')
            //clock = sinon.useFakeTimers();
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

        context('with the HTTP REST API', function() {

            it('gets the date/time', function(done) {
                global.requestPoolDataWithURLAsync('datetime')
                    .then(function(obj) {
                        obj.time.controllerTime.should.equal(-1)
                    })
                    .then(done,done)
            })


            it('sets a valid date/time', function(done) {
                global.requestPoolDataWithURLAsync('datetime/set/time/21/55/date/2/01/02/19/0')
                    .then(function(obj) {
                        obj.text.should.contain('REST API')
                        var res = bottle.container.time.getTime().time
                        res.controllerDateStr.should.eq('2/1/2019')
                        res.controllerDayOfWeekStr.should.eq('Monday')
                        queuePacketStub.args[0][0].should.deep.equal([ 165, 33, 16, 33, 133, 8, 21, 55, 2, 1, 2, 19, 0, 0 ])
                    })
                    .then(done,done)
            })
        })
    })

})
