var URL = 'https://localhost:3000/';
//var URL = 'http://localhost:3000'
//var ENDPOINT = 'all'

var myModule = rewire(path.join(process.cwd(), 'lib/comms', 'server.js'))

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


describe('server', function() {
    describe('#get functions', function() {
        context('with a URL', function() {
            it('returns pump status in a JSON', function() {

                var scope = nock('https://localhost:3000')
                    .get('/pump')
                    .replyWithFile(200, path.join(process.cwd(), 'specs/assets/webJsonReturns', 'pumpstatus.json'));

                return requestPoolDataWithURL('pump').then(function(obj) {
                    //console.log('valuePumpObj:', obj)
                    obj[1].watts.should.eq(999);
                })
            });
            it('returns everything in a JSON', function() {
                var scope = nock('https://localhost:3000')
                    .get('/all')
                    .replyWithFile(200, path.join(process.cwd(), 'specs/assets/webJsonReturns', 'all.json'));

                return requestPoolDataWithURL('all').then(function(obj) {
                    obj.circuits[1].friendlyName.should.eq('SPA')
                });

            });
            it('returns circuits in a JSON', function() {
                var scope = nock('https://localhost:3000')
                    .get('/circuit')
                    .replyWithFile(200, path.join(process.cwd(), 'specs/assets/webJsonReturns', 'circuit.json'));

                return requestPoolDataWithURL('circuit').then(function(obj) {
                    obj[1].number.should.eq(1)
                })
            });
            it('returns heat in a JSON', function() {
                var scope = nock('https://localhost:3000')
                    .get('/heat')
                    .replyWithFile(200, path.join(process.cwd(), 'specs/assets/webJsonReturns', 'heat.json'));

                return requestPoolDataWithURL('heat').then(function(obj) {
                    obj.should.have.property('poolHeatMode');;
                });

            });
            it('returns schedule in a JSON', function() {
                var scope = nock('https://localhost:3000')
                    .get('/schedule')
                    .replyWithFile(200, path.join(process.cwd(), 'specs/assets/webJsonReturns', 'schedule.json'));

                return requestPoolDataWithURL('schedule').then(function(obj) {
                    obj[1].should.have.property('DURATION');
                })

            });
            it('returns temps in a JSON', function() {
                var scope = nock('https://localhost:3000')
                    .get('/temperatures')
                    .replyWithFile(200, path.join(process.cwd(), 'specs/assets/webJsonReturns', 'temperatures.json'));

                return requestPoolDataWithURL('temperatures').then(function(obj) {
                    obj.should.have.property('poolTemp');
                });

            });
            it('returns time in a JSON', function() {
                var scope = nock('https://localhost:3000')
                    .get('/time')
                    .replyWithFile(200, path.join(process.cwd(), 'specs/assets/webJsonReturns', 'time.json'));

                return requestPoolDataWithURL('time').then(function(obj) {
                    obj.should.have.property('controllerTime');;
                });

            });
            it('returns chlorinator in a JSON', function() {
                var scope = nock('https://localhost:3000')
                    .get('/chlorinator')
                    .replyWithFile(200, path.join(process.cwd(), 'specs/assets/webJsonReturns', 'chlorinator.json'));

                return requestPoolDataWithURL('chlorinator').then(function(obj) {
                    obj.should.have.property('saltPPM');;
                });

            });
            it('returns circuit (9) in a JSON', function() {
                var scope = nock('https://localhost:3000')
                    .get('/circuit/9')
                    .replyWithFile(200, path.join(process.cwd(), 'specs/assets/webJsonReturns', 'circuit9.json'));

                return requestPoolDataWithURL('circuit/9').then(function(obj) {
                    obj.should.have.property('status');
                });
            });
        });
    });
    describe('#set functions', function() {
        context('with a URL', function() {
            it('sets chlorinator to 50', function() {
                var scope = nock('https://localhost:3000')
                    .get('/chlorinator/50')
                    .reply(200, 'need to get results and put here');

                return requestPoolDataWithURL('chlorinator/50').then(function(obj) {
                    obj.should.eq('need to get results and put here')
                });
            });
            it('sets chlorinotator to OFF', function() {
                var scope = nock('https://localhost:3000')
                    .get('/chlorinator/0')
                    .reply(200, 'need to get results and put here');

                return requestPoolDataWithURL('chlorinator/0').then(function(obj) {
                    obj.should.eq('need to get results and put here')
                });
            });
            it('toggles circuit (9) in a JSON', function() {
                var scope = nock('https://localhost:3000')
                    .get('/circuit/9/toggle')
                    .reply(200, 'need to get results and put here');

                return requestPoolDataWithURL('circuit/9/toggle').then(function(obj) {
                     obj.should.eq('need to get results and put here');
                });

            });
            it('sets circuit (9) to off', function() {
                var scope = nock('https://localhost:3000')
                    .get('/circuit/9/set/0')
                    .reply(200, 'need to get results and put here');
                return requestPoolDataWithURL('circuit/9/set/0').then(function(obj) {
                     obj.should.eq('need to get results and put here');
                });

            });
            it('sets spa setpoint', function() {
                var scope = nock('https://localhost:3000')
                    .get('/spaheat/setpoint/50')
                    .reply(200, 'need to get results and put here');

                return requestPoolDataWithURL('spaheat/setpoint/50').then(function(obj) {
                     obj.should.eq('need to get results and put here');
                });
            });
            it('sets spa heat mode to off', function() {
                var scope = nock('https://localhost:3000')
                    .get('/spaheat/mode/0')
                    .reply(200, 'need to get results and put here');

                return requestPoolDataWithURL('spaheat/mode/0').then(function(obj) {
                     obj.should.eq('need to get results and put here');
                });
            });
            it('sets pool setpoint to 50', function() {
                var scope = nock('https://localhost:3000')
                    .get('/poolheat/setpoint/50')
                    .reply(200, 'need to get results and put here');

                return requestPoolDataWithURL('poolheat/setpoint/50').then(function(obj) {
                     obj.should.eq('need to get results and put here');
                });
            });
            it('sets pool heat mode to off', function() {
                var scope = nock('https://localhost:3000')
                    .get('/poolheat/mode/0')
                    .reply(200, 'need to get results and put here');

                return requestPoolDataWithURL('poolheat/mode/0').then(function(obj) {
                     obj.should.eq('need to get results and put here');
                });
            });
            it('sends an arbitrary packet (request pump status)', function() {
                var packet = '96-16-7-0'
                var scope = nock('https://localhost:3000')
                    .get('/sendthispacket/' + packet)
                    .reply(200, '96,16,7,0') //packet.replace('-',','));

                return requestPoolDataWithURL('sendthispacket/' + packet).then(function(obj) {
                    //console.log('obj: ', obj)
                    obj.should.eq('96,16,7,0');
                });

            });
        });
        describe('#sends pump commands', function() {
            context('with a URL', function() {
                it('sets pump 1 to program 1', function() {
                    var scope = nock('https://localhost:3000')
                        .get('/pumpCommand/1/1')
                        .reply(200, 'need to get results and put here');

                    return requestPoolDataWithURL('pumpCommand/1/1').then(function(obj) {
                        obj.should.eq('need to get results and put here')
                    });
                });
                it('saves pump 1 to program 1 (should fail)', function() {
                    var scope = nock('https://localhost:3000')
                        .get('/pumpCommand/save/pump/1/program/1')
                        .reply(200, 'need to get results and put here');

                    return requestPoolDataWithURL('pumpCommand/save/pump/1/program/1').then(function(obj) {
                        obj.should.eq('need to get results and put here')
                        //obj.text.should.eq('Please provide a speed /speed/{speed} when requesting to save the program');
                    });
                });
                it('runs pump 1 to program 1 (NEW URL)', function() {
                    var scope = nock('https://localhost:3000')
                        .get('/pumpCommand/run/pump/1/program/1')
                        .reply(200, 'need to get results and put here');

                    return requestPoolDataWithURL('pumpCommand/run/pump/1/program/1').then(function(obj) {
                        obj.should.eq('need to get results and put here')
                        /*obj.should.eq({
                            "text": "REST API pumpCommand variables - pump: 1, program: 1, value: null, duration: null",
                            "pump": "1",
                            "program": "1"
                        });*/
                    });
                });
                it('sets pump 1 program 1 to 1000 rpm', function() {
                    var scope = nock('https://localhost:3000')
                                                .log(console.log)
                        .get('/pumpCommand/1/1/1000')

                        .reply(200, 'need to get results and put here');

                    return requestPoolDataWithURL('pumpCommand/1/1/1000').then(function(obj) {
                        //console.log('myObj sets pump 1 program 1 to 1000 rpm: ', obj)
                        obj.should.eq('need to get results and put here');
                        /*
                        {
                            "text": "REST API pumpCommand variables - pump: 1, program: 1, rpm: 1000, duration: null",
                            "pump": "1",
                            "program": "1",
                            "value": "1000",
                            "duration": null
                        }
                        */
                    });
                });
                it('saves pump 1 program 1 to 1000 rpm (NEW URL)', function() {
                    var scope = nock('https://localhost:3000')
                                            .log(console.log)
                        .get('/pumpCommand/save/pump/1/program/1/rpm/1000')
                        .reply(200, 'need to get results and put here');

                    return requestPoolDataWithURL('pumpCommand/save/pump/1/program/1/rpm/1000').then(function(obj) {
                        return obj.should.eq('need to get results and put here')
                        /*obj.should.eq({
                            "text": "REST API pumpCommand variables - pump: 1, program: 1, rpm: 1000, duration: null",
                            "pump": "1",
                            "program": "1",
                            "speed": "1000"
                        })*/
                    });
                });
                it('saves pump 1 and rpm 1 (should fail // no program)', function() {
                    var scope = nock('https://localhost:3000')
                        .get('/pumpCommand/save/pump/1/rpm/1000')
                        .reply(200, 'need to get results and put here');

                    return  requestPoolDataWithURL('pumpCommand/save/pump/1/rpm/1000').then(function(obj){
                      console.log('bbb: ', obj)
                      return obj.should.eq('need to get results and put here')

                    })

                        /*obj.should.eq({
                            "text": "Please provide the program number when saving the program.  /pumpCommand/save/pump/#/program/#/rpm/#"
                        })*/


                });
                it('runs pump 1 at rpm 1000 (should fail // no program)', function() {
                    var scope = nock('https://localhost:3000')
                        .get('/pumpCommand/save/pump/1/program/1')
                        .reply(200, 'need to get results and put here');

                    return requestPoolDataWithURL('pumpCommand/save/pump/1/program/1').then(function(obj) {
                        obj.should.eq('need to get results and put here')
                        //obj.text.should.eq('Please provide a program when setting the RPM.  /pumpCommand/run/pump/rpm/#');
                    });
                });
                it('sets pump 1 to program 1 at 1000 rpm for 2 minutes', function() {
                    var scope = nock('https://localhost:3000')
                        .get('/pumpCommand/1/1/1000/2')
                        .reply(200, 'need to get results and put here');

                    return requestPoolDataWithURL('pumpCommand/1/1/1000/2').then(function(obj) {
                        obj.should.eq('need to get results and put here')
                          /*{
                            "text": "REST API pumpCommand variables - pump: 1, program: 1, speed: 1000, duration: 2",
                            "pump": "1",
                            "program": "1",
                            "speed": "1000",
                            "duration": "2"
                        });*/
                    });
                });
                it('runs pump 1, program 1 for 2 minutes ', function() {
                    var scope = nock('https://localhost:3000')
                        .get('/pumpCommand/pump/1/program/1/duration/2')
                        .reply(200, 'need to get results and put here');

                    return requestPoolDataWithURL('pumpCommand/pump/1/program/1/duration/2').then(function(obj) {
                        obj.should.eq('need to get results and put here')
                          /*{
                            "text": "REST API pumpCommand variables - pump: 1, program: 1, duration: 2",
                            "pump": "1",
                            "duration": "2"
                        });*/
                    });
                });
                it('runs pump 1, program 1 for 2 minutes (NEW URL)', function() {
                    var scope = nock('https://localhost:3000')
                        .get('/pumpCommand/run/pump/1/program/1/duration/2')
                        .reply(200, 'need to get results and put here');

                    return requestPoolDataWithURL('pumpCommand/run/pump/1/program/1/duration/2').then(function(obj) {
                        obj.should.eq('need to get results and put here');
                    });
                });

                it('saves and runs pump 1 to program 1 at 1000 rpm for 2 minutes (NEW URL)', function() {
                    var scope = nock('https://localhost:3000')
                        .get('/pumpCommand/run/pump/1/program/1/rpm/1000/duration/2')
                        .reply(200, 'need to get results and put here');

                    return requestPoolDataWithURL('pumpCommand/run/pump/1/program/1/rpm/1000/duration/2').then(function(obj) {
                        obj.should.eq('need to get results and put here')
                    });
                });

            });

        });
    });
});
