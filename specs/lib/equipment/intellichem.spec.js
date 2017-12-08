describe('processes Intellichem packets', function() {
    var intellichemPackets = [
        [165,16,15,16,18,41,2,227,2,175,2,238,2,188,0,0,0,2,0,0,0,42,0,4,0,92,6,5,24,1,144,0,0,0,150,20,0,81,0,0,101,32,60,1,0,0,0,7,116],
        [165,16,15,16,18,41,2,227,2,175,2,238,2,188,0,0,0,2,0,0,0,42,0,4,0,92,6,5,24,1,144,0,0,0,150,20,0,81,0,0,101,32,61,1,0,0,0,7,117]

    ]
    var equip = 'controller'

    describe('#When packets arrive', function() {
        context('via serialport or Socat', function() {

            before(function() {
                return global.initAll()
            });

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

            it('#SI should equal -0.31', function() {
                bottle.container.controller_18.process(intellichemPackets[0], 0)
                var json = bottle.container.intellichem.getCurrentIntellichem()
                //console.log('json for intellichem: ', JSON.stringify(json,null,2))
                json.intellichem.readings.SI.should.equal(-0.31)
            })

            it('#Get Intellichem via API', function(done){
                global.requestPoolDataWithURL('intellichem')
                    .then(function(obj) {
                        obj.intellichem.readings.SI.should.equal(-0.31)
                    }).then(done,done)
            })

            it('#Will not log output with the same packet received twice', function(){
                loggerDebugStub.callCount.should.eq(0)
                bottle.container.controller_18.process(intellichemPackets[0], 1)
                loggerDebugStub.callCount.should.eq(0)
                bottle.container.controller_18.process(intellichemPackets[1], 2)
                loggerDebugStub.callCount.should.eq(1)
            })

            it('#Get Intellichem via Socket', function(done){
                global.waitForSocketResponse('intellichem')
                    .then(function(data){
                        data.intellichem.readings.SI.should.equal(-0.31)
                    })
                    .then(done,done)
            })

        })
    })
})
