var myModule = rewire(path.join(process.cwd(), '/lib/equipment/circuit.js'))


describe('circuit controller', function() {


    describe('#functions that get and set circuits', function() {

        before(function() {
            //this.clock = sinon.useFakeTimers();

        })

        after(function() {
            //this.clock.restore();
        })

        it('gets a circuit (1)', function() {

            myModule.__set__(
                'currentCircuitArrObj', ['blank',
                    {
                        name: 'myCircuit',
                        number: 1,
                        numberStr: 'circuit1',
                        circuitFunction: 'Generic',
                        status: 0,
                        freeze: 0,
                        friendlyName: 'nice_name'
                    }
                ]
            )

            //console.log('inside: ', myModule('blank').getCircuit(1))

            //console.log('myMod?? ', myModule.__get__('currentCircuitArrObj'))
            return myModule(bottle.container).getCircuit(1).name.should.eq('myCircuit')
        });

        it('gets a circuit (1) name', function() {

            myModule.__set__(
                'currentCircuitArrObj', ['blank',
                    {
                        name: 'myCircuit',
                        number: 1,
                        numberStr: 'circuit1',
                        circuitFunction: 'Generic',
                        status: 0,
                        freeze: 0,
                        friendlyName: 'nice_name'
                    }
                ]
            )

            //console.log('inside: ', myModule('blank').getCircuit(1))

            //console.log('myMod?? ', myModule.__get__('currentCircuitArrObj'))
            var result = myModule(bottle.container).getCircuitName(1)
            return result.should.eq('myCircuit')
        });

        it('gets a circuit (1) friendly name', function() {

            myModule.__set__(
                'currentCircuitArrObj', ['blank',
                    {
                        name: 'myCircuit',
                        number: 1,
                        numberStr: 'circuit1',
                        circuitFunction: 'Generic',
                        status: 0,
                        freeze: 0,
                        friendlyName: 'nice_name'
                    }
                ]
            )

            //console.log('inside: ', myModule('blank').getCircuit(1))

            //console.log('myMod?? ', myModule.__get__('currentCircuitArrObj'))
            var result = myModule(bottle.container).getFriendlyName(1)
            return result.should.eq('nice_name')
        });

    });

    describe('#functions that get and set circuits', function() {
        it('toggles circuit 1 with no callback', function() {
            var queuePacketStub = sinon.stub()
            var loggerStub = sinon.stub()
            //var _response = {}
            myModule.__with__({
                'currentCircuitArrObj': global.circuitJson,
                //'response': _response,
                'bottle.container': {
                    'queuePacket': {
                        'queuePacket': queuePacketStub
                    },
                    'logger': {
                        'info': loggerStub
                    },
                    'intellitouch': {
                        'getPreambleByte': function() {
                            return 99
                        }
                    },
                    'settings': {
                        'appAddress': 999
                    }
                }
            })(function() {
                myModule(bottle.container).toggleCircuit(1)
                //console.log('response: ', _response)
                //console.log('stub: ', queuePacketStub.args)
                //console.log('logger stub: ', loggerStub.args[0])

                loggerStub.args[0][0].status.should.eq('on')
                loggerStub.args[0][0].value.should.eq(1)
                queuePacketStub.args[0][0].should.deep.eq([165, 99, 16, 999, 134, 2, 1, 1])


            })



        });

        it('toggles circuit 1 with a callback', function() {
            var queuePacketStub = sinon.stub()
            var loggerStub = sinon.stub()
            //var _response = {}
            myModule.__with__({
                'currentCircuitArrObj': global.circuitJson,
                //'response': _response,
                'bottle.container': {
                    'queuePacket': {
                        'queuePacket': queuePacketStub
                    },
                    'logger': {
                        'info': loggerStub
                    },
                    'intellitouch': {
                        'getPreambleByte': function() {
                            return 99
                        }
                    },
                    'settings': {
                        'appAddress': 999
                    }
                }
            })(function() {
                var response;
                myModule(bottle.container).toggleCircuit(1, function(res) {
                    response = res
                    console.log('response; ', res)
                })

                //console.log('response: ', _response)
                //console.log('stub: ', queuePacketStub.args)
                //console.log('logger stub: ', loggerStub.args[0])

                loggerStub.args[0][0].status.should.eq('on')
                loggerStub.args[0][0].value.should.eq(1)
                queuePacketStub.args[0][0].should.deep.eq([165, 99, 16, 999, 134, 2, 1, 1])
                response.value.should.eq(1)
            })

        });


    })
})
