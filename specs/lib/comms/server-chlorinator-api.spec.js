//var URL = 'https://localhost:3000/';
var URL = 'http://localhost:3000/'
//var ENDPOINT = 'all'

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

function getAllPoolData(endpoint) {
    var options = {
        method: 'GET',
        uri: URL + endpoint,
        resolveWithFullResponse: true,
        json: true
    };
    return rp(options);
}


describe('#set functions', function() {

    describe('#sends chlorinator commands', function() {
        context('with a REST API', function() {

            before(function() {
                bottle.container.server.init()
                bottle.container.settings.chlorinator = 1
            });

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                //bottle.container.server.init()
                clock = sandbox.useFakeTimers()
                //loggerStub = sandbox.stub(bottle.container.logger, 'warn')
                queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
                loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
                socketIOStub = sandbox.stub(bottle.container.io, 'emitToClients')


            })

            afterEach(function() {
                //restore the sandbox after each function
                              bottle.container.chlorinator.setChlorinatorLevel(0)
                bottle.container.chlorinatorController.clearTimer()
                sandbox.restore()

            })

            after(function() {

                bottle.container.settings.chlorinator = 0
                bottle.container.server.close()
            })


            it('should send a message if chlorinator is not enabled', function(done) {
                bottle.container.settings.chlorinator = 0
                requestPoolDataWithURL('chlorinator/0').then(function(result) {
                    // console.log('loggerStub called with: ', loggerStub.args)
                    // console.log('result: ', result)
                    result.text.should.contain('FAIL')
                    queuePacketStub.callCount.should.eq(0)
                    bottle.container.settings.chlorinator = 1
                    done()

                })



            })

            it('starts chlorinator at 50%', function(done) {

                requestPoolDataWithURL('chlorinator/50').then(function(result) {
                    // console.log('loggerStub called with: ', loggerStub.args)
                    // console.log('result: ', result)
                    result.status.should.eq('on')
                    result.value.should.eq(50)
                    queuePacketStub.callCount.should.eq(1)
                    queuePacketStub.args[0][0].should.include.members([16, 2, 80, 17, 50])
                    done()
                })
            })
            it('starts chlorinator at 100%', function(done) {

                requestPoolDataWithURL('chlorinator/100').then(function(result) {
                    // console.log('loggerStub called with: ', loggerStub.args)
                    // console.log('result: ', result)
                    result.status.should.eq('on')
                    result.value.should.eq(100)
                    queuePacketStub.callCount.should.eq(1)
                    queuePacketStub.args[0][0].should.include.members([16, 2, 80, 17, 100])
                    done()
                })
            })
            it('starts chlorinator at 101% (super chlorinate)', function(done) {

                requestPoolDataWithURL('chlorinator/101').then(function(result) {
                    // console.log('loggerStub called with: ', loggerStub.args)
                    // console.log('result: ', result)
                    result.status.should.eq('on')
                    result.value.should.eq(101)
                    queuePacketStub.callCount.should.eq(1)
                    queuePacketStub.args[0][0].should.include.members([16, 2, 80, 17, 101])
                    done()
                })
            })
            it('starts chlorinator at -1% (should fail)', function(done) {

                requestPoolDataWithURL('chlorinator/-1').then(function(result) {
                    // console.log('loggerStub called with: ', loggerStub.args)
                    // console.log('result: ', result)
                    result.text.should.contain('FAIL')
                    queuePacketStub.callCount.should.eq(0)
                    done()
                })
            })
            it('starts chlorinator at 150% (should fail)', function(done) {

                requestPoolDataWithURL('chlorinator/150').then(function(result) {
                    // console.log('loggerStub called with: ', loggerStub.args)
                    // console.log('result: ', result)
                    result.text.should.contain('FAIL')
                    queuePacketStub.callCount.should.eq(0)
                    done()
                })
            })
            it('starts chlorinator at 0%', function(done) {
              //do this one last so
                requestPoolDataWithURL('chlorinator/0').then(function(result) {
                    // console.log('loggerStub called with: ', loggerStub.args)
                    // console.log('result: ', result)
                    result.status.should.eq('off')
                    result.value.should.eq(0)
                    queuePacketStub.callCount.should.eq(1)
                    queuePacketStub.args[0][0].should.include.members([16, 2, 80, 17, 0])
                    done()
                })
            })
        });
    });
})
