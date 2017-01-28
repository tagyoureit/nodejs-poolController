var myModule = rewire(path.join(process.cwd(), '/src/lib/controllers/pump-controller-timers.js'))



describe('pump controller', function() {

    describe('#startPumpController starts the timer for 1 or 2 pumps', function() {

        beforeEach(function() {
            sandbox = sinon.sandbox.create()
        })

        afterEach(function() {
            sandbox.restore()
        })




        it('sets pump 1 timer to run every 30 seconds', function() {
            setIntervalStub = sandbox.stub()
            //returns the 3rd (0,1,2) argument, which is the delay time
            //setIntervalStub.returnsArg(2)

            setTimeoutStub = sandbox.stub()
            //returns the 3rd (0,1,2) argument, which is the delay time
            //setTimeoutStub.returnsArg(2)


            myModule.__with__({

                'bottle.container': {
                    'nanoTimer': {

                        'setInterval': setIntervalStub,
                        'setTimeout': setTimeoutStub
                    },
                    'settings': {
                        'numberOfPumps': 1
                    }
                }
            })(function() {

                myModule(bottle.container).startPumpController()

                //setIntervalStub.args === [ [ [Function: pumpStatusCheck], [ 1 ], '30s' ] ]
                //tests for 3rd argument should be the time of 3500m
                setTimeoutStub.args[0][2].should.eq('3500m')
                //tests for arguments (2nd object) should pass the value of 1
                setTimeoutStub.args[0][1][0].should.eq(1)
                setIntervalStub.args[0][1][0].should.eq(1)
                return setIntervalStub.args[0][2].should.eq('30s')
            });


            it('sets pump 1 & 2 timer to run every 30 seconds', function() {
                setIntervalStub = sandbox.stub()
                //returns the 3rd (0,1,2) argument, which is the delay time
                //setIntervalStub.returnsArg(2)

                setTimeoutStub = sandbox.stub()
                //returns the 3rd (0,1,2) argument, which is the delay time
                //setTimeoutStub.returnsArg(2)


                myModule.__with__({

                    'bottle.container': {
                        'nanoTimer': {

                            'setInterval': setIntervalStub,
                            'setTimeout': setTimeoutStub
                        },
                        'settings': {
                            'numberOfPumps': 2
                        }
                    }
                })(function() {

                    myModule(bottle.container).startPumpController()

                    //setIntervalStub.args === [ [ [Function: pumpStatusCheck], [ 1, 2 ], '30s' ] ]
                    //tests for 3rd argument should be the time of 3500m
                    setTimeoutStub.args[0][2].should.eq('3500m')
                    //tests for arguments (2nd object) should pass the value of 1
                    setTimeoutStub.args[0][1][0].should.eq(1)
                    setTimeoutStub.args[0][1][1].should.eq(2)

                    setIntervalStub.args[0][1][0].should.eq(1)
                    setIntervalStub.args[0][1][1].should.eq(2)
                    return setIntervalStub.args[0][2].should.eq('30s')
                });



                //bottle.container.settings.numberOfPumps = 2
                //expect(bottle.container.pumpController.startPumpController()).to.be.true;
            });
        })


    })
})
