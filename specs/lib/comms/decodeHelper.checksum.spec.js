var myModule = rewire(path.join(process.cwd(), '/lib/comms/inbound/decode-helper.js'))

describe('decodeHelper', function() {
    var testarrayGOOD = [
        [165, 16, 15, 16, 8, 13, 73, 73, 49, 85, 100, 2, 0, 0, 45, 0, 0, 0, 0, 2, 148],
        [165, 16, 15, 16, 10, 12, 3, 87, 116, 114, 70, 97, 108, 108, 32, 51, 0, 251, 4, 247],
        [165, 16, 15, 16, 10, 12, 4, 80, 111, 111, 108, 32, 76, 111, 119, 50, 0, 251, 5, 7],
        [165, 16, 15, 16, 10, 12, 0, 87, 116, 114, 70, 97, 108, 108, 32, 49, 0, 251, 4, 242]
    ]
    var testarrayBAD = [
        [165, 16, 15, 16, 8, 13, 73, 73, 49, 85, 100, 2, 0, 0, 45, 0, 0, 0, 0, 2, 149],
        [165, 16, 15, 17, 10, 12, 3, 87, 116, 114, 70, 97, 108, 108, 32, 51, 1, 251, 4, 247],
        [165, 16, 15, 16, 12, 12, 4, 80, 111, 111, 108, 32, 76, 111, 119, 50, 0, 251, 2, 7],
        [165, 16, 15, 16, 10, 12, 0, 99, 116, 114, 70, 97, 108, 108, 32, 49, 0, 251, 4, 242]
    ]
    var equip = 'controller'

    describe('#Checksum', function() {
        context('when packets arrive', function() {
            it('it should return true with various controller packets', function() {
                var stub = sinon.stub() //(bottle.container.decodeHelper.checksum)
                var loggerStub = sinon.stub()
                myModule.__with__({

                    'bottle.container': {
                        'settings': {
                            'logMessageDecoding': true
                        },
                        'logger': {
                            'info': loggerStub,
                            'silly': loggerStub,
                            'warn': loggerStub
                        }
                    }
                })(function() {
                    for (var i = 0; i < testarrayGOOD.length; i++) {
                        console.log('running test with (valid): ', testarrayGOOD[i].toString())
                        var result = myModule(bottle.container).checksum(testarrayGOOD[i], 25, equip)
                        //console.log('loggerStub: ', loggerStub.args)
                        result.should.be.true
                    }


                })

            })

            it('should return false with various invalid controller packets', function() {
                var stub = sinon.stub() //(bottle.container.decodeHelper.checksum)
                var loggerStub = sinon.stub()
                myModule.__with__({

                    'bottle.container': {
                        'settings': {
                            'logMessageDecoding': true
                        },
                        'logger': {
                            'info': loggerStub,
                            'silly': loggerStub,
                            'warn': loggerStub
                        }
                    }
                })(function() {
                    for (var i = 0; i < testarrayBAD.length; i++) {
                        console.log('running test with (invalid): ', testarrayBAD[i].toString())
                        var result = myModule(bottle.container).checksum(testarrayBAD[i], 25, equip)
                        //console.log('loggerStub: ', loggerStub.args)
                        result.should.be.false
                    }


                })

            })
        })
    })

    describe('#processChecksum', function() {
        //var spiedChecksum = sinon.spy(bottle.container.decodeHelper.decode)

        context('(not a response)', function() {
            it('should call decode once', function() {

                var checksumStub = sinon.stub()
                checksumStub.returns(true)
                var successfulAckStub = sinon.stub()

                var isResponseStub = sinon.stub()
                isResponseStub.returns(true)
                var decodeStub = sinon.stub()

                //myModule.__set__("checksum", checksumStub)

                myModule.__with__({
                    'checksum': function() {
                        return 'hello'
                    },
                    //'fred': function(){console.log('WAS CALLED')},
                    'bottle.container': {
                        'queuePacket': {
                            'getQueuePacketsArrLength': function() {
                                return 0
                            }
                        }
                    },
                    'decode': decodeStub,

                    'isResponse': isResponseStub,
                    'successfulAck': successfulAckStub

                })(function() {
                    for (var i = 0; i < testarrayGOOD.length; i++) {
                        console.log('running test with: ', testarrayGOOD[i].toString())
                        //myModule('fake').processChecksum(testarrayGOOD[i], i * 10, equip)
                        //expect(spiedChecksum).to.be.calledOnce
                        //decodeStub.should.be.calledOnce
                        //successfulAckStub.callCount.should.eq(0)
                        return false
                        //trying to figure out how to rewire checksum function.  not working...
                        //http://stackoverflow.com/questions/41787876/use-rewire-to-stub-function-in-anonymous-export-in-nodejs

                    }
                })
            })

        })
    })

    describe('#isResponse', function() {
        //var spiedChecksum = sinon.spy(bottle.container.decodeHelper.decode)

        context('(with no packets in outbound queue)', function() {
            it('should return false', function() {

                var checksumStub = sinon.stub()
                checksumStub.returns(true)
                var successfulAckStub = sinon.stub()

                var isResponseStub = sinon.stub()
                isResponseStub.returns(true)
                var decodeStub = sinon.stub()

                //myModule.__set__("checksum", checksumStub)

                myModule.__with__({
                    'checksum': function() {
                        return 'hello'
                    },
                    //'fred': function(){console.log('WAS CALLED')},
                    'bottle.container': {
                        'queuePacket': {
                            'first': function() {
                                return [255,0,255,165,0,96,16, 1,4,3,39, 3,32, 1,103]
                            }
                        },
                        'logger': {
                          silly: function() {},
                          error: function() {}
                        }
                    },
                    'decode': decodeStub,

                    'isResponse': isResponseStub,
                    'successfulAck': successfulAckStub

                })(function() {
                    for (var i = 0; i < testarrayGOOD.length; i++) {

                    }
                })
            })

        })
    })

})
