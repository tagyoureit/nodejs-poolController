describe('server', function() {
    describe('#circuit api calls', function() {

        context('with a URL', function() {

            before(function() {
                return global.initAllAsync()
                    .catch(function(err){
                        console.log('what is the error?', err)
                    })
            })

            beforeEach(function() {
                loggers = setupLoggerStubOrSpy('stub', 'spy')
                //clock = sinon.useFakeTimers()
                writeSPPacketStub = sinon.stub(bottle.container.sp, 'writeSP')//.callsFake(function(){bottle.container.writePacket.postWritePacketHelper()})
                sinon.stub(bottle.container.intellitouch, 'getPreambleByte').returns(33)
                //queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')

            })

            afterEach(function() {
                bottle.container.writePacket.init()
                bottle.container.queuePacket.init()

            })

            after(function() {

                return global.stopAllAsync()
            })

            it('sends a user provided pump packet', function(done) {
                //[255,0,255,165,0,96,16,6,1,10,1,38]
                packet = global.pump1PowerOn_chk.slice(5,10)
                packetWithDash = ''
                packet.forEach(function(el){
                    packetWithDash += el + '-'
                })
                packetWithDash=packetWithDash.slice(0,-1) //remove last -
                global.requestPoolDataWithURLAsync('sendthispacket/'+packetWithDash).then(function(obj) {
                    writeSPPacketStub.args[0][0].should.deep.equal(global.pump1PowerOn_chk)
                }).then(done,done)
            });

            it('sends a user provided controller packet', function(done) {
                //[255,0,255,165,33,15,16,17,7,1,6,9,20,15,59,255,2,106]
                packet = global.schedules_chk[0].slice(5,16)
                packetWithDash = ''
                packet.forEach(function(el){
                    packetWithDash += el + '-'
                })
                packetWithDash=packetWithDash.slice(0,-1) //remove last -
                global.requestPoolDataWithURLAsync('sendthispacket/'+packetWithDash).then(function(obj) {
                    writeSPPacketStub.args[0][0].should.deep.equal(global.schedules_chk[0])
                }).then(done,done)
            });

            it('sends a user provided chlorinator packet', function(done) {
                chlorPkt = [16,2,80,0,0,98,16,3]
                packet = chlorPkt.slice(0,-3)
                packetWithDash = ''
                packet.forEach(function(el){
                    packetWithDash += el + '-'
                })
                packetWithDash=packetWithDash.slice(0,-1) //remove last -
                global.requestPoolDataWithURLAsync('sendthispacket/'+packetWithDash).then(function(obj) {
                    writeSPPacketStub.args[0][0].should.deep.equal(chlorPkt)
                }).then(done,done)
            });

        });

    });
});
