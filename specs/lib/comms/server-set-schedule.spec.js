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
            loggerInfoStub = sandbox.spy(bottle.container.logger, 'info')
            loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
            loggerVerboseStub = sandbox.spy(bottle.container.logger, 'verbose')
            loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
            loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
            queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
            preambleStub = sandbox.stub(bottle.container.intellitouch, 'getPreambleByte').returns(99)
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


            it('sets a valid schedule 12', function(done) {
                requestPoolDataWithURL('schedule/set/12/5/13/20/13/40/131').then(function(obj) {
                    obj.text.should.contain('REST API')
//                    console.log('queuePacketStub', queuePacketStub.args)
                    queuePacketStub.args[0][0].should.contain.members([165,99,16,33,145,7,12,5,13,20,13,40,131])
                    queuePacketStub.args[1][0].should.contain.members([165, 99, 16, 33, 209, 1, 1])
                    queuePacketStub.args[12][0].should.contain.members([165, 99, 16, 33, 209, 1, 12])
                    done()
                })
            })

        })
        context('with an invalid HTTP REST call', function() {


            // it('fails to set a valid date/time with invalid time (should fail)', function(done) {
            //     requestPoolDataWithURL('datetime/set/time/21/61/date/2/01/02/19/0').then(function(obj) {
            //         obj.text.should.contain('FAIL')
            //         var res = bottle.container.time.getTime()
            //         res.controllerTime.should.eq(-1)
            //         done()
            //     })
            // })
            // it('fails to set a valid date/time with invalid date (should fail)', function(done) {
            //     requestPoolDataWithURL('datetime/set/time/21/31/date/128/01/02/19/0').then(function(obj) {
            //         obj.text.should.contain('FAIL')
            //         var res = bottle.container.time.getTime()
            //         res.controllerTime.should.eq(-1)
            //         done()
            //     })
            // })
            // it('fails to set a valid date/time with invalid dst (should fail)', function(done) {
            //     requestPoolDataWithURL('datetime/set/time/21/31/date/8/01/02/19/3').then(function(obj) {
            //         obj.text.should.contain('FAIL')
            //         var res = bottle.container.time.getTime()
            //         res.controllerTime.should.eq(-1)
            //         done()
            //     })
            // })
        })
    })

})
