describe('packetBuffer receives raw packets from serial bus', function() {


    describe('#When packets arrive', function() {
        context('via serialport or Socat', function() {

            before(function() {
                return global.initAllAsync()
            });

            beforeEach(function() {
                loggers = setupLoggerStubOrSpy('stub', 'spy')
                decodeHelperStub = sinon.stub(bottle.container.decodeHelper, 'processChecksum').returns(false)
            })

            afterEach(function() {
                sinon.restore()

            })

            after(function() {
                return global.stopAllAsync()
            })

            it('#should accept all packets and be picked up by processing buffer', function() {
                return Promise.resolve()
                    .then(function(){
                        // console.log('rb:', global.rawBuffer.length, global.rawBuffer[10])
                        for (var i = 0; i < global.rawBuffer.length; i++) {
                            bottle.container.packetBuffer.push(new Buffer(global.rawBuffer[i]))
                        }

                    })
                    .delay(200)
                    .then(function(){
                        decodeHelperStub.callCount.should.eq(281)
                    })
            })



        })
    })
})
