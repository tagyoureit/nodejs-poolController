// var myModule = rewire(path.join(process.cwd(), '/src/lib/equipment/circuit.js'))
//
//
// describe('circuit controller', function() {
//
//     describe('#sets the friendlyNames', function() {
//
//       before(function() {
//           global.initAllAsync()
//       });
//
//       beforeEach(function() {
//           sandbox = sinon.sandbox.create()
//           clock = sandbox.useFakeTimers()
//           loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
//           loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
//           loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
//           loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
//           loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
//         })
//
//         afterEach(function() {
//             sandbox.restore()
//         })
//
//         after(function() {
//             global.stopAllAsync()
//         })
//
//         it('sets the names for circuits other than pool and spa', function() {
//             var queuePacketStub = sinon.stub()
//             var loggerInfoStub = sinon.stub()
//             var fnArr = JSON.parse(fs.readFileSync(path.join(process.cwd(), '/specs/assets/config', 'configFriendlyNames.json'), 'utf8'))
//             //var _response = {}
//             myModule.__with__({
//                 'currentCircuitArrObj': global.circuitJson,
//                 'bottle.container.settings.circuitFriendlyNames': fnArr
//             })(function() {
//                 myModule(bottle.container).setCircuitFriendlyNames()
//
//                 myModule.__get__('currentCircuitArrObj')[1].friendlyName.should.eq('SPA')
//                 myModule.__get__('currentCircuitArrObj')[5].friendlyName.should.eq('WATERFALL MEDIUM LOW')
//                 fnArr[1]['circuit1'] = "Try to rename spa"
//                 myModule(bottle.container).setCircuitFriendlyNames()
//                 myModule.__get__('currentCircuitArrObj')[1].friendlyName.should.eq('SPA')
//                 myModule.__get__('currentCircuitArrObj')[5].friendlyName.should.eq('WATERFALL MEDIUM LOW')
//                 fnArr[1]['circuit1'] = "SPA"
//                 fnArr[6]['circuit6'] = "Try to rename pool"
//                 myModule(bottle.container).setCircuitFriendlyNames()
//                 myModule.__get__('currentCircuitArrObj')[1].friendlyName.should.eq('SPA')
//                 myModule.__get__('currentCircuitArrObj')[5].friendlyName.should.eq('WATERFALL MEDIUM LOW')
//                 myModule.__get__('currentCircuitArrObj')[6].friendlyName.should.eq('POOL')
//             })
//
//
//
//         });
//     })
//
//
//     describe('#functions that get and set circuits', function() {
//
//       before(function() {
//           global.initAllAsync()
//       });
//
//       beforeEach(function() {
//           sandbox = sinon.sandbox.create()
//           clock = sandbox.useFakeTimers()
//           loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
//           loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
//           loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
//           loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
//           loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
//         })
//
//         afterEach(function() {
//             sandbox.restore()
//         })
//
//         after(function() {
//             global.stopAllAsync()
//         })
//
//         it('gets a circuit (1)', function() {
//
//             myModule.__set__(
//                 'currentCircuitArrObj', ['blank',
//                     {
//                         name: 'myCircuit',
//                         number: 1,
//                         numberStr: 'circuit1',
//                         circuitFunction: 'Generic',
//                         status: 0,
//                         freeze: 0,
//                         friendlyName: 'nice_name'
//                     }
//                 ]
//             )
//
//             //console.log('inside: ', myModule('blank').getCircuit(1))
//
//             //console.log('myMod?? ', myModule.__get__('currentCircuitArrObj'))
//             return myModule(bottle.container).getCircuit(1).name.should.eq('myCircuit')
//         });
//
//         it('gets a circuit (1) name', function() {
//
//             myModule.__set__(
//                 'currentCircuitArrObj', ['blank',
//                     {
//                         name: 'myCircuit',
//                         number: 1,
//                         numberStr: 'circuit1',
//                         circuitFunction: 'Generic',
//                         status: 0,
//                         freeze: 0,
//                         friendlyName: 'nice_name'
//                     }
//                 ]
//             )
//
//             //console.log('inside: ', myModule('blank').getCircuit(1))
//
//             //console.log('myMod?? ', myModule.__get__('currentCircuitArrObj'))
//             var result = myModule(bottle.container).getCircuitName(1)
//             return result.should.eq('myCircuit')
//         });
//
//         it('gets a circuit (1) friendly name', function() {
//
//             myModule.__set__(
//                 'currentCircuitArrObj', ['blank',
//                     {
//                         name: 'myCircuit',
//                         number: 1,
//                         numberStr: 'circuit1',
//                         circuitFunction: 'Generic',
//                         status: 0,
//                         freeze: 0,
//                         friendlyName: 'nice_name'
//                     }
//                 ]
//             )
//
//             //console.log('inside: ', myModule('blank').getCircuit(1))
//
//             //console.log('myMod?? ', myModule.__get__('currentCircuitArrObj'))
//             var result = myModule(bottle.container).getFriendlyName(1)
//             return result.should.eq('nice_name')
//         });
//
//     });
//
//     describe('#functions that get and set circuits', function() {
//         it('toggles circuit 1 with no callback', function() {
//             var queuePacketStub = sinon.stub()
//             var loggerInfoStub = sinon.stub()
//             //var _response = {}
//             myModule.__with__({
//                 'currentCircuitArrObj': global.circuitJson,
//                 //'response': _response,
//                 'bottle.container': {
//                     'queuePacket': {
//                         'queuePacket': queuePacketStub
//                     },
//                     'logger': {
//                         'info': loggerInfoStub
//                     },
//                     'intellitouch': {
//                         'getPreambleByte': function() {
//                             return 99
//                         }
//                     },
//                     'settings': {
//                         'appAddress': 999
//                     }
//                 }
//             })(function() {
//                 myModule(bottle.container).toggleCircuit(1)
//                 //console.log('response: ', _response)
//                 //console.log('stub: ', queuePacketStub.args)
//                 //console.log('logger stub: ', loggerInfoStub.args[0])
//
//                 loggerInfoStub.args[0][0].status.should.eq('on')
//                 loggerInfoStub.args[0][0].value.should.eq(1)
//                 queuePacketStub.args[0][0].should.deep.eq([165, 99, 16, 999, 134, 2, 1, 1])
//
//
//             })
//
//
//
//         });
//
//         it('toggles circuit 1 with a callback', function() {
//             var queuePacketStub = sinon.stub()
//             var loggerInfoStub = sinon.stub()
//             //var _response = {}
//             myModule.__with__({
//                 'currentCircuitArrObj': global.circuitJson,
//                 //'response': _response,
//                 'bottle.container': {
//                     'queuePacket': {
//                         'queuePacket': queuePacketStub
//                     },
//                     'logger': {
//                         'info': loggerInfoStub
//                     },
//                     'intellitouch': {
//                         'getPreambleByte': function() {
//                             return 99
//                         }
//                     },
//                     'settings': {
//                         'appAddress': 999
//                     }
//                 }
//             })(function() {
//                 var response;
//                 myModule(bottle.container).toggleCircuit(1, function(res) {
//                     response = res
//                 })
//
//                 //console.log('response: ', _response)
//                 //console.log('stub: ', queuePacketStub.args)
//                 //console.log('logger stub: ', loggerInfoStub.args[0])
//
//                 loggerInfoStub.args[0][0].status.should.eq('on')
//                 loggerInfoStub.args[0][0].value.should.eq(1)
//                 queuePacketStub.args[0][0].should.deep.eq([165, 99, 16, 999, 134, 2, 1, 1])
//                 response.value.should.eq(1)
//             })
//
//         });
//
//
//     })
// })
