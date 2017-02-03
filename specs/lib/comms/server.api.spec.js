//var URL = 'https://localhost:3000/';
var URL = 'http://localhost:3000/'
//var ENDPOINT = 'all'

var myModule = rewire(path.join(process.cwd(), '/src/lib/comms', 'server.js'))

function requestPoolDataWithURL(endpoint) {
    //console.log('pending - request sent for ' + endpoint)
    return getAllPoolData(endpoint).then(
        function(response) {
            //  console.log('success - received data for %s request: %s', endpoint, JSON.stringify(response.body));
            return response.body;
        }
    );
};

function getAllPoolData(endpoint) {
    var options = {
        method: 'GET',
        uri: URL + endpoint,
        resolveWithFullResponse: true,
        json: true
    };
    return rp(options);
};


describe('#set functions', function() {

    before(function() {
        nock.restore()
        bottle.container.server.app
    })
    describe('#sends pump commands', function() {
        context('with a REST API', function() {

          before(function() {
              sandbox = sinon.sandbox.create()
          });

          beforeEach(function() {})

          afterEach(function() {
              //restore the sandbox after each function
              sandbox.restore()
              bottle.container.logger.warn.restore()
              bottle.container.pumpControllerMiddleware.pumpCommand.restore()
          })

            it('sets pump 1 to program 1', function() {
                var loggerStub = sinon.stub(bottle.container.logger, 'warn')


                var pumpCommandStub = sinon.stub(bottle.container.pumpControllerMiddleware, 'pumpCommand')
                return requestPoolDataWithURL('pumpCommand/1/1').then(function(result) {


                    // console.log('loggerStub called with: ', loggerStub.args)
                    // console.log('pumpCommandStub2 called with: ', pumpCommandStub.args)
                    // console.log('result: ', result)
                    loggerStub.args[0][0].should.eq('Please update the URL to the new format: /pumpCommand/{run or save}/pump/1/program/1')
                    pumpCommandStub.args[0][0].should.eq(1)
                    pumpCommandStub.args[0][1].should.eq('1')  //should be a sting because it could be 0-4 or on/off
                    result.program.should.eq('1')


                })

            });

            // it('runs pump 1, program 1 for 600 minutes ', function(done) {
            //
            //     requestPoolDataWithURL('pumpCommand/pump/1/program/1/duration/600').then(function(obj) {
            //         obj.should.eq({
            //             "text": "REST API pumpCommand variables - pump: 1, program: 1, duration: 2",
            //             "pump": "1",
            //             "duration": "600"
            //         });
            //         done()
            //     });
            // });

            /*            it('saves pump 1 to program 1 (should fail)', function(done) {

                            requestPoolDataWithURL('pumpCommand/save/pump/1/program/1').then(function(obj) {
                                obj.should.eq('need to get results and put here')
                                //obj.text.should.eq('Please provide a speed /speed/{speed} when requesting to save the program');
                                done()
                            });
                        });
                        it('runs pump 1 to program 1 (NEW URL)', function(done) {

                            requestPoolDataWithURL('pumpCommand/run/pump/1/program/1').then(function(obj) {

                                obj.should.eq({
                                    "text": "REST API pumpCommand variables - pump: 1, program: 1, value: null, duration: null",
                                    "pump": "1",
                                    "program": "1"
                                });
                                done()
                            });
                        });
                        it('sets pump 1 program 1 to 1000 rpm', function(done) {

                            requestPoolDataWithURL('pumpCommand/1/1/1000').then(function(obj) {
                                //console.log('myObj sets pump 1 program 1 to 1000 rpm: ', obj)


                                obj.should.eq({
                                    "text": "REST API pumpCommand variables - pump: 1, program: 1, rpm: 1000, duration: null",
                                    "pump": "1",
                                    "program": "1",
                                    "value": "1000",
                                    "duration": null
                                })

                                done()
                            });
                        });
                        it('saves pump 1 program 1 to 1000 rpm (NEW URL)', function() {

                            requestPoolDataWithURL('pumpCommand/save/pump/1/program/1/rpm/1000').then(function(obj) {

                                obj.should.eq({
                                    "text": "REST API pumpCommand variables - pump: 1, program: 1, rpm: 1000, duration: null",
                                    "pump": "1",
                                    "program": "1",
                                    "speed": "1000"
                                })
                                done()
                            });
                        });
                        it('saves pump 1 and rpm 1 (should fail // no program)', function(done) {

                            requestPoolDataWithURL('pumpCommand/save/pump/1/rpm/1000').then(function(obj) {
                                console.log('bbb: ', obj)
                                obj.should.eq({
                                    "text": "Please provide the program number when saving the program.  /pumpCommand/save/pump/#/program/#/rpm/#"
                                })
                                done()
                            })




                        });
                        it('runs pump 1 at rpm 1000 (should fail // no program)', function(done) {

                            requestPoolDataWithURL('pumpCommand/save/pump/1/program/1').then(function(obj) {

                                obj.text.should.eq('Please provide a program when setting the RPM.  /pumpCommand/run/pump/rpm/#');
                                done()
                            });
                        });
                        it('sets pump 1 to program 1 at 1000 rpm for 2 minutes', function(done) {

                            requestPoolDataWithURL('pumpCommand/1/1/1000/2').then(function(obj) {
                                obj.should.eq({
                                    "text": "REST API pumpCommand variables - pump: 1, program: 1, speed: 1000, duration: 2",
                                    "pump": "1",
                                    "program": "1",
                                    "speed": "1000",
                                    "duration": "2"
                                })
                                done()
                            });
                        });

                        it('runs pump 1, program 1 for 2 minutes (NEW URL)', function(done) {

                            requestPoolDataWithURL('pumpCommand/run/pump/1/program/1/duration/2').then(function(obj) {
                                obj.should.eq('need to get results and put here');
                                done()
                            });
                        });

                        it('saves and runs pump 1 to program 1 at 1000 rpm for 2 minutes (NEW URL)', function(done) {

                            requestPoolDataWithURL('pumpCommand/run/pump/1/program/1/rpm/1000/duration/2').then(function(obj) {
                                obj.should.eq('need to get results and put here')
                                done()
                            });
                        });
            */
        });

    });
});
