describe('#sets various functions', function() {
    describe('#sets the date/time', function() {

        before(function() {
            return global.initAll()
        });

        beforeEach(function() {
            sandbox = sinon.sandbox.create()
            clock = sandbox.useFakeTimers()
            loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
            loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
            loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
            loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
            loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
            queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
            preambleStub = sandbox.stub(bottle.container.intellitouch, 'getPreambleByte').returns(33)

        })

        afterEach(function() {
            //restore the sandbox after each function
            bottle.container.time.init()
            sandbox.restore()
        })

        after(function() {
            return global.stopAll()
        })

        context('with the HTTP REST API', function() {

            it('gets the date/time', function(done) {
                global.requestPoolDataWithURL('datetime')
                    .then(function(obj) {
                        obj.time.controllerTime.should.equal(-1)
                    })
                    .then(done,done)
            })


            it('sets a valid date/time', function(done) {
                global.requestPoolDataWithURL('datetime/set/time/21/55/date/2/01/02/19/0')
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
        context('with an invalid HTTP REST call', function() {


            it('fails to set a valid date/time with invalid time (should fail)', function(done) {
                global.requestPoolDataWithURL('datetime/set/time/21/61/date/2/01/02/19/0')
                    .then(function(obj) {
                        obj.text.should.contain('FAIL')
                        var res = bottle.container.time.getTime().time
                        res.controllerTime.should.eq(-1)
                    })
                    .then(done,done)
            })
            it('fails to set a valid date/time with invalid date (should fail)', function(done) {
                global.requestPoolDataWithURL('datetime/set/time/21/31/date/128/01/02/19/0')
                    .then(function(obj) {
                        obj.text.should.contain('FAIL')
                        var res = bottle.container.time.getTime().time
                        res.controllerTime.should.eq(-1)
                    })
                    .then(done,done)
            })
            it('fails to set a valid date/time with invalid dst (should fail)', function(done) {
                global.requestPoolDataWithURL('datetime/set/time/21/31/date/8/01/02/19/3')
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
