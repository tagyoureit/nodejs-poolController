// /*
//
// 09:55:04.008 DEBUG Msg# 12  Incoming controller packet: 165,33,15,16,10,12,2,87,116,114,70,97,108,108,32,50,0,251,5,6
// 09:55:04.192 DEBUG Msg# 13  Incoming controller packet: 165,33,15,16,10,12,3,87,116,114,70,97,108,108,32,51,0,251,5,8
// 09:55:05.055 DEBUG Msg# 16  Incoming controller packet: 165,33,15,16,10,12,5,85,83,69,82,78,65,77,69,45,48,54,3,243
// 09:55:05.201 DEBUG Msg# 17  Incoming controller packet: 165,33,15,16,10,12,6,85,83,69,82,78,65,77,69,45,
// 09:55:05.374 DEBUG Msg# 18  Incoming controller packet: 165,33,15,16,10,12,7,85,83,69,82,78,65,77,69,45
// 09:55:05.550 DEBUG Msg# 19  Incoming controller packet: 165,33,15,16,10,12,8,85,83,69,82,78,65,77,69,45,48,57,3,249
// 09:55:05.728 DEBUG Msg# 20  Incoming controller packet: 165,33,15,16,10,12,9,85,83,69,82,78,65,77,69,45
// 09:55:05.749 INFO
//   Custom Circuit Names retrieved from configuration:
//         ["WtrFall 1","WtrFall 1.5","WtrFall 2","WtrFall 3","Pool Low2","USERNAME-06","USERNAME-07","USERNAME-08","USERNAME-09","USERNAME-10"]
//  */
//
// describe('circuit controller', function() {
//
//     describe('#sets the friendlyNames', function() {
//
//         var equip = 'controller'
//         before(function() {
//             return global.initAllAsync()
//
//         });
//
//         beforeEach(function() {
//             loggers = setupLoggerStubOrSpy('stub', 'stub')
//             clock = sinon.useFakeTimers()
//
//             updateAvailStub = sinon.stub(bottle.container.updateAvailable, 'getResultsAsync').returns(Promise.resolve({}))
//         })
//
//         afterEach(function() {
//             //restore the sinon after each function
//             sinon.restore()
//
//
//         })
//
//         after(function() {
//             return global.stopAllAsync()
//         })
//
//         it('sets the names for circuits other than pool and spa', function() {
//
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
//           sinon = sinon.sinon.create()
//           clock = sinon.useFakeTimers()
//           loggerInfoStub = sinon.stub(bottle.container.logger, 'info')
//           loggerWarnStub = sinon.spy(bottle.container.logger, 'warn')
//           loggerVerboseStub = sinon.stub(bottle.container.logger, 'verbose')
//           loggerDebugStub = sinon.stub(bottle.container.logger, 'debug')
//           loggerSillyStub = sinon.stub(bottle.container.logger, 'silly')
//         })
//
//         afterEach(function() {
//             sinon.restore()
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
