describe('processes Intellichem packets', function() {
    var intellichemPackets = [
        [255,0,255,165,16,15,16,18,41,2,227,2,175,2,238,2,188,0,0,0,2,0,0,0,42,0,4,0,92,6,5,24,1,144,0,0,0,150,20,0,81,0,0,101,32,60,1,0,0,0,7,80],
        [255,0,255,165,16,15,16,18,41,2,227,2,175,2,238,2,188,0,0,0,2,0,0,0,42,0,4,0,92,6,5,24,1,144,0,0,0,150,20,0,81,0,0,101,32,61,1,0,0,0,7,81]

    ]
    var equip = 'controller'

    describe('#When packets arrive', function() {
        context('via serialport or Socat', function() {

            before(function() {
                return global.initAllAsync()
            });

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                loggers = setupLoggerStubOrSpy(sandbox, 'stub', 'spy')
            })

            afterEach(function() {
                sandbox.restore()

            })

            after(function() {
                return global.stopAllAsync()
            })

            it('#SI should equal -0.31', function() {
                return Promise.resolve()
                    .then(function(){
                        bottle.container.packetBuffer.push(new Buffer(intellichemPackets[0]))

                    })
                    .delay(50)
                    .then(function(){
                        var json = bottle.container.intellichem.getCurrentIntellichem()
                        json.intellichem.readings.SI.should.equal(-0.31)
                    })
                    .catch(function(err){
                        return Promise.reject(new Error('timeout: ' + err))
                    })

            })

            it('#Get Intellichem via API', function(done){
                global.requestPoolDataWithURLAsync('intellichem')
                    .then(function(obj) {
                        obj.intellichem.readings.SI.should.equal(-0.31)
                    }).then(done,done)
            })

            it('#Will not log output with the same packet received twice', function(){
                return Promise.resolve()
                    .then(function(){
                        loggers.loggerInfoStub.callCount.should.eq(0)
                        bottle.container.packetBuffer.push(new Buffer(intellichemPackets[0]))

                    })
                    .delay(50)
                    .then(function(){
                        loggers.loggerInfoStub.callCount.should.eq(0)
                        bottle.container.packetBuffer.push(new Buffer(intellichemPackets[1]))
                    })
                    .delay(50)
                    .then(function(){
                        loggers.loggerInfoStub.callCount.should.eq(2)
                    })

            })

            it('#Get Intellichem via Socket', function(done){
                global.waitForSocketResponseAsync('intellichem')
                    .then(function(data){
                        data.intellichem.readings.SI.should.equal(-0.31)
                    })
                    .then(done,done)
            })

        })
    })
})
