
describe('server', function() {
    describe('#get functions', function() {

        context('with a URL', function() {

            before(function() {
                return global.initAll()
            })

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                clock = sandbox.useFakeTimers()
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
            })

            afterEach(function() {
                sandbox.restore()
            })

            after(function() {

                return global.stopAll()
            })

            // it('reloads the config.json', function(done) {
            //
            //     global.requestPoolDataWithURL('reload').then(function(obj) {
            //         console.log('obj: ', obj)
            //         obj.should.contain('Reloading')
            //         done()
            //     })
            // });

            it('returns pump status in a JSON', function(done) {

                var pumpStub = sandbox.stub(bottle.container.pump, 'getCurrentPumpStatus').callsFake(function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'pumpstatus.json')))
                })

                global.requestPoolDataWithURL('pump').then(function(obj) {
                    //console.log('valuePumpObj:', obj)
                    //console.log('????')
                    //console.log('pumpStub called x times: ', pumpStub.callCount)
                    pumpStub.callCount.should.eq(1)
                    obj[1].watts.should.eq(999);
                }).then(done,done)
            });


            it('returns everything in a JSON (/all)', function(done) {
                updateAvailStub = sandbox.stub(bottle.container.updateAvailable, 'getResults').returns({})
                var allStub = sandbox.stub(bottle.container.helpers, 'allEquipmentInOneJSON').callsFake(function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'all.json')))
                })
                global.requestPoolDataWithURL('all').then(function(obj) {
                    obj.circuits[1].friendlyName.should.eq('SPA')
                }).then(done,done);

            });


            it('returns everything in a JSON (/one)', function(done) {
                updateAvailStub = sandbox.stub(bottle.container.updateAvailable, 'getResults').returns({})

                var allStub = sandbox.stub(bottle.container.helpers, 'allEquipmentInOneJSON').callsFake(function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'all.json')))
                })
                global.requestPoolDataWithURL('one').then(function(obj) {
                    obj.circuits[1].friendlyName.should.eq('SPA')
                }).then(done,done);

            });

            it('returns circuits in a JSON', function(done) {
                var circuitStub = sandbox.stub(bottle.container.circuit, 'getCurrentCircuits').callsFake(function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'circuit.json')))
                })
                global.requestPoolDataWithURL('circuit').then(function(obj) {
                    circuitStub.callCount.should.eq(1)
                    obj[1].number.should.eq(1)
                }).then(done,done)
            });
            it('returns heat in a JSON', function(done) {
                var heatStub = sandbox.stub(bottle.container.heat, 'getCurrentHeat').callsFake(function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'heat.json')))
                })
                global.requestPoolDataWithURL('heat').then(function(obj) {
                    heatStub.callCount.should.eq(1)
                    obj.temperature.should.have.property('poolHeatMode');;
                }).then(done,done);

            });
            it('returns schedule in a JSON', function(done) {
                var scheduleStub = sandbox.stub(bottle.container.schedule, 'getCurrentSchedule').callsFake(function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'schedule.json')))
                })
                global.requestPoolDataWithURL('schedule').then(function(obj) {
                    scheduleStub.callCount.should.eq(1)
                    obj[1].should.have.property('DURATION');
                }).then(done,done)

            });

            it('returns time in a JSON', function(done) {
                var timeStub = sandbox.stub(bottle.container.time, 'getTime').callsFake(function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'time.json')))
                })
                global.requestPoolDataWithURL('time').then(function(obj) {
                    timeStub.callCount.should.eq(1)
                    obj.should.have.property('controllerTime');;
                }).then(done,done);

            });
            it('returns chlorinator in a JSON', function(done) {
                var chlorStub = sandbox.stub(bottle.container.chlorinator, 'getChlorinatorStatus').callsFake(function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'chlorinator.json')))
                })
                global.requestPoolDataWithURL('chlorinator').then(function(obj) {
                    chlorStub.callCount.should.eq(1)
                    obj.should.have.property('saltPPM');;
                }).then(done,done);

            });
            it('returns circuit (9) in a JSON', function(done) {
                var circuit9Stub = sandbox.stub(bottle.container.circuit, 'getCircuit').callsFake(function() {
                    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'specs/assets/webJsonReturns', 'circuit9.json')))
                })
                global.requestPoolDataWithURL('circuit/9').then(function(obj) {
                    circuit9Stub.callCount.should.eq(1)
                    obj.should.have.property('status');
                }).then(done,done);
            });
            it('fails with circuit /circuit/21', function(done) {
                global.requestPoolDataWithURL('circuit/21').then(function(obj) {
                    obj.should.eq('Not a valid circuit')
                }).then(done,done);
            });
        });

    });
});
