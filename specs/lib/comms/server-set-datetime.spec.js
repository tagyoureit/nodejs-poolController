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
    ).catch(function(err) {
        console.log('error:', err)
    });
}




describe('#sets various functions', function() {



    describe('#sets the date/time', function() {

        before(function() {
            bottle.container.logger.transports.console.level = 'silly'
            bottle.container.server.init()
            bottle.container.time.init()
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
        })

        afterEach(function() {
            //restore the sandbox after each function
            bottle.container.time.init()
            sandbox.restore()

        })

        after(function() {
            bottle.container.logger.transports.console.level = 'info'
            bottle.container.server.close()
        })
        context('with the HTTP REST API', function() {


            it('sets a valid date/time', function(done) {
                requestPoolDataWithURL('datetime/set/time/21/55/date/2/01/02/19/0').then(function(obj) {
                    obj.text.should.contain('REST API')
                    var res = bottle.container.time.getTime()
                    res.controllerDateStr.should.eq('2/1/2019')
                    res.controllerDayOfWeekStr.should.eq('Monday')
                    done()
                })
            })

        })
        context('with an invalid HTTP REST call', function() {


            it('fails to set a valid date/time with invalid time (should fail)', function(done) {
                requestPoolDataWithURL('datetime/set/time/21/61/date/2/01/02/19/0').then(function(obj) {
                    obj.text.should.contain('FAIL')
                    var res = bottle.container.time.getTime()
                    res.controllerTime.should.eq(-1)
                    done()
                })
            })
            it('fails to set a valid date/time with invalid date (should fail)', function(done) {
                requestPoolDataWithURL('datetime/set/time/21/31/date/128/01/02/19/0').then(function(obj) {
                    obj.text.should.contain('FAIL')
                    var res = bottle.container.time.getTime()
                    res.controllerTime.should.eq(-1)
                    done()
                })
            })
            it('fails to set a valid date/time with invalid dst (should fail)', function(done) {
                requestPoolDataWithURL('datetime/set/time/21/31/date/8/01/02/19/3').then(function(obj) {
                    obj.text.should.contain('FAIL')
                    var res = bottle.container.time.getTime()
                    res.controllerTime.should.eq(-1)
                    done()
                })
            })
        })
    })

})
