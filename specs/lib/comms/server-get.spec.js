//var URL = 'https://localhost:3000/';
var URL = 'http://localhost:3000/'
//var ENDPOINT = 'all'
var sandbox;

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

            before(function() {
                bottle.container.server.init()
                bottle.container.logger.transports.console.level = 'silly';
            })

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                clock = sandbox.useFakeTimers()
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
            })

            afterEach(function() {
                sandbox.restore()
            })

            after(function() {
                bottle.container.server.close()
                bottle.container.logger.transports.console.level = 'info'
            })

            // it('reloads the config.json', function(done) {
            //
            //     requestPoolDataWithURL('reload').then(function(obj) {
            //         console.log('obj: ', obj)
            //         obj.should.contain('Reloading')
            //         done()
            //     })
            // });

            it('returns pump status in a JSON', function(done) {

                var pumpStub = sandbox.stub(bottle.container.pump, 'getCurrentPumpStatus', function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'pumpstatus.json')))
                })

                requestPoolDataWithURL('pump').then(function(obj) {
                    //console.log('valuePumpObj:', obj)
                    //console.log('????')
                    //console.log('pumpStub called x times: ', pumpStub.callCount)
                    pumpStub.callCount.should.eq(1)
                    obj[1].watts.should.eq(999);
                    done()
                })
            });


            it('returns everything in a JSON', function(done) {
                var allStub = sandbox.stub(bottle.container.helpers, 'allEquipmentInOneJSON', function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'all.json')))
                })
                requestPoolDataWithURL('all').then(function(obj) {
                    allStub.callCount.should.eq(1)
                    obj.circuits[1].friendlyName.should.eq('SPA')
                    done()
                });

            });

            it('returns circuits in a JSON', function(done) {
                var circuitStub = sandbox.stub(bottle.container.circuit, 'getCurrentCircuits', function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'circuit.json')))
                })
                requestPoolDataWithURL('circuit').then(function(obj) {
                    circuitStub.callCount.should.eq(1)
                    obj[1].number.should.eq(1)
                    done()
                })
            });
            it('returns heat in a JSON', function(done) {
                var heatStub = sandbox.stub(bottle.container.heat, 'getCurrentHeat', function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'heat.json')))
                })
                requestPoolDataWithURL('heat').then(function(obj) {
                    heatStub.callCount.should.eq(1)
                    obj.should.have.property('poolHeatMode');;
                    done()
                });

            });
            it('returns schedule in a JSON', function(done) {
                var scheduleStub = sandbox.stub(bottle.container.schedule, 'getCurrentSchedule', function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'schedule.json')))
                })
                requestPoolDataWithURL('schedule').then(function(obj) {
                    scheduleStub.callCount.should.eq(1)
                    obj[1].should.have.property('DURATION');
                    done()
                })

            });
            it('returns temps in a JSON', function(done) {
                var tempStub = sandbox.stub(bottle.container.temperatures, 'getTemperatures', function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'temperatures.json')))
                })
                requestPoolDataWithURL('temperatures').then(function(obj) {
                    tempStub.callCount.should.eq(1)
                    obj.should.have.property('poolTemp');
                    done()
                });

            });
            it('returns time in a JSON', function(done) {
                var timeStub = sandbox.stub(bottle.container.time, 'getTime', function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'time.json')))
                })
                requestPoolDataWithURL('time').then(function(obj) {
                    timeStub.callCount.should.eq(1)
                    obj.should.have.property('controllerTime');;
                    done()
                });

            });
            it('returns chlorinator in a JSON', function(done) {
                var chlorStub = sandbox.stub(bottle.container.chlorinator, 'getChlorinatorStatus', function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'chlorinator.json')))
                })
                requestPoolDataWithURL('chlorinator').then(function(obj) {
                    chlorStub.callCount.should.eq(1)
                    obj.should.have.property('saltPPM');;
                    done()
                });

            });
            it('returns circuit (9) in a JSON', function(done) {
                var circuit9Stub = sandbox.stub(bottle.container.circuit, 'getCircuit', function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'circuit9.json')))
                })
                requestPoolDataWithURL('circuit/9').then(function(obj) {
                    circuit9Stub.callCount.should.eq(1)
                    obj.should.have.property('status');
                    done()
                });
            });
            it('fails with circuit /circuit/21', function(done) {
                requestPoolDataWithURL('circuit/21').then(function(obj) {
                    obj.should.eq('Not a valid circuit')
                    done()
                });
            });
        });

    });
});
