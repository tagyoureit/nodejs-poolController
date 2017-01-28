var reqString = path.join(process.cwd(), '/src/lib/controllers/pump-controller-middleware.js')

var myModule = rewire(reqString)


describe('pump controller - save speed (2/2)', function() {


    describe('#checks that the right functions are called', function() {


        before(function() {
            sandbox = sinon.sandbox.create()
        });

        beforeEach(function() {})

        afterEach(function() {
            //restore the sandbox after each function
            sandbox.restore()
        })

        after(function() {

        })


        it('sets pump 1 program 1 to 1000 rpm', function() {

            var loggerStub = sandbox.stub().returns()
            var setPumpToRemoteControlStub = sandbox.stub().returns()
            var saveProgramOnPumpStub = sandbox.stub().returns()
            var endPumpCommandStub = sandbox.stub().returns()
            var setPumpToLocalControlStub = sandbox.stub().returns()
            var requestPumpStatusStub = sandbox.stub().returns()
            var emitToClientsStub = sandbox.stub().returns()

            myModule.__with__({
                'bottle.container': {
                    'settings': {
                        'logApi': true
                    },
                    'pumpController': {
                        'setPumpToRemoteControl': setPumpToRemoteControlStub,
                        'saveProgramOnPump': saveProgramOnPumpStub,
                        'setPumpToLocalControl': setPumpToLocalControlStub,
                        'requestPumpStatus': requestPumpStatusStub
                    },
                    'io': {
                        'emitToClients': emitToClientsStub
                    },

                    'logger': {
                        'info': loggerStub,
                        'verbose': loggerStub,
                        'warn': loggerStub
                    }
                }

            })(function() {
                var index = 1
                var program = 1
                var speed = 1000
                var address = myModule('whatever').pumpIndexToAddress(index)
                myModule(bottle.container).pumpCommandSaveProgramSpeed(index, program, speed)


                /* Desired output
                logger:  [ [ 'User request to save pump %s (address %s) to Program %s as %s RPM',
                  1,
                  96,
                  1,
                  1000 ],
                  [ 'End of Sending Pump Packet \n \n' ] ]
                setPumpRemote:  [ [ 96 ] ]
                saveProgram:  [ [ 96, 1, 1000 ] ]
                endPumpCommandStub:  undefined
                setPumpToLocalControlStub  [ [ 96 ] ]
                requestPumpStatusStub [ [ 96 ] ]
                emitToClientsStub [ [ 'pump' ] ]
                */

                //pump 1 (96) should be set to remote
                setPumpToRemoteControlStub.args[0][0].should.eq(address)

                saveProgramOnPumpStub.args[0][0].should.eq(address)
                saveProgramOnPumpStub.args[0][1].should.eq(program)
                saveProgramOnPumpStub.args[0][2].should.eq(speed)
                //or
                saveProgramOnPumpStub.alwaysCalledWith(96, 1, 1000).should.be.true

                //log output should equal string
                var loggerOutput = loggerStub.args[0][0].replace('%s', loggerStub.args[0][1])
                loggerOutput = loggerOutput.replace('%s', loggerStub.args[0][2])
                loggerOutput = loggerOutput.replace('%s', loggerStub.args[0][3])
                loggerOutput = loggerOutput.replace('%s', loggerStub.args[0][4])
                loggerOutput.should.eq('User request to save pump ' + index + ' (address ' + address + ') to Program ' + program + ' as ' + speed + ' RPM')

                //set pump to local
                setPumpToLocalControlStub.args[0][0].should.eq(address)

                //request pump status
                requestPumpStatusStub.calledWith(96).should.be.true

                //and finally emit to any clients
                emitToClientsStub.alwaysCalledWith('pump')
                return
            })
        });

        it('sets pump 1 program 2 to 1000 rpm', function() {

            var loggerStub = sandbox.stub().returns()
            var setPumpToRemoteControlStub = sandbox.stub().returns()
            var saveProgramOnPumpStub = sandbox.stub().returns()
            var endPumpCommandStub = sandbox.stub().returns()
            var setPumpToLocalControlStub = sandbox.stub().returns()
            var requestPumpStatusStub = sandbox.stub().returns()
            var emitToClientsStub = sandbox.stub().returns()

            myModule.__with__({
                'bottle.container': {
                    'settings': {
                        'logApi': true
                    },
                    'pumpController': {
                        'setPumpToRemoteControl': setPumpToRemoteControlStub,
                        'saveProgramOnPump': saveProgramOnPumpStub,
                        'setPumpToLocalControl': setPumpToLocalControlStub,
                        'requestPumpStatus': requestPumpStatusStub
                    },
                    'io': {
                        'emitToClients': emitToClientsStub
                    },

                    'logger': {
                        'info': loggerStub,
                        'verbose': loggerStub,
                        'warn': loggerStub
                    }
                }

            })(function() {
                var index = 1
                var program = 2
                var speed = 1000
                var address = myModule('whatever').pumpIndexToAddress(index)
                myModule(bottle.container).pumpCommandSaveProgramSpeed(index, program, speed)


                /* Desired output
                logger:  [ [ 'User request to save pump %s (address %s) to Program %s as %s RPM',
                  1,
                  96,
                  1,
                  1000 ],
                  [ 'End of Sending Pump Packet \n \n' ] ]
                setPumpRemote:  [ [ 96 ] ]
                saveProgram:  [ [ 96, 1, 1000 ] ]
                endPumpCommandStub:  undefined
                setPumpToLocalControlStub  [ [ 96 ] ]
                requestPumpStatusStub [ [ 96 ] ]
                emitToClientsStub [ [ 'pump' ] ]
                */

                //pump 1 (96) should be set to remote
                setPumpToRemoteControlStub.args[0][0].should.eq(address)

                saveProgramOnPumpStub.args[0][0].should.eq(address)
                saveProgramOnPumpStub.args[0][1].should.eq(program)
                saveProgramOnPumpStub.args[0][2].should.eq(speed)
                //or
                saveProgramOnPumpStub.alwaysCalledWith(96, 2, 1000).should.be.true

                //log output should equal string
                var loggerOutput = loggerStub.args[0][0].replace('%s', loggerStub.args[0][1])
                loggerOutput = loggerOutput.replace('%s', loggerStub.args[0][2])
                loggerOutput = loggerOutput.replace('%s', loggerStub.args[0][3])
                loggerOutput = loggerOutput.replace('%s', loggerStub.args[0][4])
                loggerOutput.should.eq('User request to save pump ' + index + ' (address ' + address + ') to Program ' + program + ' as ' + speed + ' RPM')

                //set pump to local
                setPumpToLocalControlStub.args[0][0].should.eq(address)

                //request pump status
                requestPumpStatusStub.calledWith(96).should.be.true

                //and finally emit to any clients
                emitToClientsStub.alwaysCalledWith('pump')
                return
            })
        });

        it('sets pump 2 program 2 to 2000 rpm', function() {

            var loggerStub = sandbox.stub().returns()
            var setPumpToRemoteControlStub = sandbox.stub().returns()
            var saveProgramOnPumpStub = sandbox.stub().returns()
            var endPumpCommandStub = sandbox.stub().returns()
            var setPumpToLocalControlStub = sandbox.stub().returns()
            var requestPumpStatusStub = sandbox.stub().returns()
            var emitToClientsStub = sandbox.stub().returns()

            myModule.__with__({
                'bottle.container': {
                    'settings': {
                        'logApi': true
                    },
                    'pumpController': {
                        'setPumpToRemoteControl': setPumpToRemoteControlStub,
                        'saveProgramOnPump': saveProgramOnPumpStub,
                        'setPumpToLocalControl': setPumpToLocalControlStub,
                        'requestPumpStatus': requestPumpStatusStub
                    },
                    'io': {
                        'emitToClients': emitToClientsStub
                    },

                    'logger': {
                        'info': loggerStub,
                        'verbose': loggerStub,
                        'warn': loggerStub
                    }
                }

            })(function() {
                var index = 2
                var program = 2
                var speed = 2000
                var address = myModule('whatever').pumpIndexToAddress(index)
                myModule(bottle.container).pumpCommandSaveProgramSpeed(index, program, speed)


                /* Desired output
                logger:  [ [ 'User request to save pump %s (address %s) to Program %s as %s RPM',
                  1,
                  96,
                  1,
                  1000 ],
                  [ 'End of Sending Pump Packet \n \n' ] ]
                setPumpRemote:  [ [ 97 ] ]
                saveProgram:  [ [ 97, 1, 1000 ] ]
                endPumpCommandStub:  undefined
                setPumpToLocalControlStub  [ [ 97 ] ]
                requestPumpStatusStub [ [ 97 ] ]
                emitToClientsStub [ [ 'pump' ] ]
                */

                //pump 1 (96) should be set to remote
                setPumpToRemoteControlStub.args[0][0].should.eq(address)

                saveProgramOnPumpStub.args[0][0].should.eq(address)
                saveProgramOnPumpStub.args[0][1].should.eq(program)
                saveProgramOnPumpStub.args[0][2].should.eq(speed)
                //or
                saveProgramOnPumpStub.alwaysCalledWith(97, 2, 2000).should.be.true

                //log output should equal string
                var loggerOutput = loggerStub.args[0][0].replace('%s', loggerStub.args[0][1])
                loggerOutput = loggerOutput.replace('%s', loggerStub.args[0][2])
                loggerOutput = loggerOutput.replace('%s', loggerStub.args[0][3])
                loggerOutput = loggerOutput.replace('%s', loggerStub.args[0][4])
                loggerOutput.should.eq('User request to save pump ' + index + ' (address ' + address + ') to Program ' + program + ' as ' + speed + ' RPM')

                //set pump to local
                setPumpToLocalControlStub.args[0][0].should.eq(address)

                //request pump status
                requestPumpStatusStub.calledWith(97).should.be.true

                //and finally emit to any clients
                emitToClientsStub.alwaysCalledWith('pump')
                return
            })
        });



        it('sets pump 1 program 5 to 1000 rpm (should fail)', function() {

            var loggerStub = sandbox.stub().returns()
            var setPumpToRemoteControlStub = sandbox.stub().returns()
            var saveProgramOnPumpStub = sandbox.stub().returns()
            var endPumpCommandStub = sandbox.stub().returns()
            var setPumpToLocalControlStub = sandbox.stub().returns()
            var requestPumpStatusStub = sandbox.stub().returns()
            var emitToClientsStub = sandbox.stub().returns()

            myModule.__with__({
                'bottle.container': {
                    'settings': {
                        'logApi': true
                    },
                    'pumpController': {
                        'setPumpToRemoteControl': setPumpToRemoteControlStub,
                        'saveProgramOnPump': saveProgramOnPumpStub,
                        'setPumpToLocalControl': setPumpToLocalControlStub,
                        'requestPumpStatus': requestPumpStatusStub
                    },
                    'io': {
                        'emitToClients': emitToClientsStub
                    },

                    'logger': {
                        'info': loggerStub,
                        'verbose': loggerStub,
                        'warn': loggerStub
                    }
                }

            })(function() {
                var index = 1
                var program = 5
                var speed = 1000
                var address = myModule('whatever').pumpIndexToAddress(index)
                myModule(bottle.container).pumpCommandSaveProgramSpeed(index, program, speed)

                //none of these should be called
                setPumpToRemoteControlStub.callCount.should.eq(0)
                saveProgramOnPumpStub.callCount.should.eq(0)
                setPumpToLocalControlStub.callCount.should.eq(0)
                requestPumpStatusStub.callCount.should.eq(0)
                emitToClientsStub.callCount.should.eq(0)

                //log output should equal string
                var loggerOutput = loggerStub.args[0][0].replace('%s', loggerStub.args[0][1])
                loggerOutput = loggerOutput.replace('%s', loggerStub.args[0][2])
                loggerOutput = loggerOutput.replace('%s', loggerStub.args[0][3])
                loggerOutput = loggerOutput.replace('%s', loggerStub.args[0][4])
                loggerOutput.should.eq('FAIL: User request to save pump ' + index + ' (address ' + address + ') to Program ' + program + ' as ' + speed + ' RPM')

                return
            })
        });


        it('sets pump 55 program 1 to 1000 rpm (should fail)', function() {

            var loggerStub = sandbox.stub().returns()
            var setPumpToRemoteControlStub = sandbox.stub().returns()
            var saveProgramOnPumpStub = sandbox.stub().returns()
            var endPumpCommandStub = sandbox.stub().returns()
            var setPumpToLocalControlStub = sandbox.stub().returns()
            var requestPumpStatusStub = sandbox.stub().returns()
            var emitToClientsStub = sandbox.stub().returns()

            myModule.__with__({
                'bottle.container': {
                    'settings': {
                        'logApi': true
                    },
                    'pumpController': {
                        'setPumpToRemoteControl': setPumpToRemoteControlStub,
                        'saveProgramOnPump': saveProgramOnPumpStub,
                        'setPumpToLocalControl': setPumpToLocalControlStub,
                        'requestPumpStatus': requestPumpStatusStub
                    },
                    'io': {
                        'emitToClients': emitToClientsStub
                    },

                    'logger': {
                        'info': loggerStub,
                        'verbose': loggerStub,
                        'warn': loggerStub
                    }
                }

            })(function() {
                var index = 55
                var program = 1
                var speed = 1000
                var address = myModule('whatever').pumpIndexToAddress(index)
                myModule(bottle.container).pumpCommandSaveProgramSpeed(index, program, speed)

                //none of these should be called
                setPumpToRemoteControlStub.callCount.should.eq(0)
                saveProgramOnPumpStub.callCount.should.eq(0)
                setPumpToLocalControlStub.callCount.should.eq(0)
                requestPumpStatusStub.callCount.should.eq(0)
                emitToClientsStub.callCount.should.eq(0)

                //log output should equal string
                var loggerOutput = loggerStub.args[0][0].replace('%s', loggerStub.args[0][1])
                loggerOutput = loggerOutput.replace('%s', loggerStub.args[0][2])
                loggerOutput = loggerOutput.replace('%s', loggerStub.args[0][3])
                loggerOutput = loggerOutput.replace('%s', loggerStub.args[0][4])
                loggerOutput.should.eq('FAIL: User request to save pump ' + index + ' (address ' + address + ') to Program ' + program + ' as ' + speed + ' RPM')
                return
            })
        });

        it('sets pump 1 program 1 to 5000 rpm (should fail)', function() {

            var loggerStub = sandbox.stub().returns()
            var setPumpToRemoteControlStub = sandbox.stub().returns()
            var saveProgramOnPumpStub = sandbox.stub().returns()
            var endPumpCommandStub = sandbox.stub().returns()
            var setPumpToLocalControlStub = sandbox.stub().returns()
            var requestPumpStatusStub = sandbox.stub().returns()
            var emitToClientsStub = sandbox.stub().returns()

            myModule.__with__({
                'bottle.container': {
                    'settings': {
                        'logApi': true
                    },
                    'pumpController': {
                        'setPumpToRemoteControl': setPumpToRemoteControlStub,
                        'saveProgramOnPump': saveProgramOnPumpStub,
                        'setPumpToLocalControl': setPumpToLocalControlStub,
                        'requestPumpStatus': requestPumpStatusStub
                    },
                    'io': {
                        'emitToClients': emitToClientsStub
                    },

                    'logger': {
                        'info': loggerStub,
                        'verbose': loggerStub,
                        'warn': loggerStub
                    }
                }

            })(function() {
                var index = 1
                var program = 1
                var speed = 5000
                var address = myModule('whatever').pumpIndexToAddress(index)
                myModule(bottle.container).pumpCommandSaveProgramSpeed(index, program, speed)

                //none of these should be called
                setPumpToRemoteControlStub.callCount.should.eq(0)
                saveProgramOnPumpStub.callCount.should.eq(0)
                setPumpToLocalControlStub.callCount.should.eq(0)
                requestPumpStatusStub.callCount.should.eq(0)
                emitToClientsStub.callCount.should.eq(0)
                //log output should equal string
                var loggerOutput = loggerStub.args[0][0].replace('%s', loggerStub.args[0][1])
                loggerOutput = loggerOutput.replace('%s', loggerStub.args[0][2])
                loggerOutput = loggerOutput.replace('%s', loggerStub.args[0][3])
                loggerOutput = loggerOutput.replace('%s', loggerStub.args[0][4])
                return loggerOutput.should.eq('FAIL: RPM provided (' + speed + ') is outside of tolerances.')
                return
            })
        });

    });


})
