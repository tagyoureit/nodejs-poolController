var URL = 'http://localhost:3000/'
var sandbox;

function requestPoolDataWithURL(endpoint) {
    //console.log('pending - request sent for ' + endpoint)
    return getAllPoolData(endpoint).then(
        function(response) {
            //  console.log('success - received data for %s request: %s', endpoint, JSON.stringify(response.body));
            return response.body;
        }
    );
};

function getAllPoolData(endpoint) {
    var options = {
        method: 'GET',
        uri: URL + endpoint,
        resolveWithFullResponse: true,
        json: true
    };
    return rp(options);
};


describe('server', function() {
    describe('#circuit api calls', function() {

        context('with a URL', function() {

            before(function() {
                bottle.container.server.init()
                bottle.container.logger.transports.console.level = 'silly';
            })

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                clock = sandbox.useFakeTimers()
                writeSPPacketStub = sandbox.stub(bottle.container.sp, 'writeSP')//.callsFake(function(){bottle.container.writePacket.postWritePacketHelper()})
                sandbox.stub(bottle.container.intellitouch, 'getPreambleByte').returns(33)
                queuePacketStub = sandbox.stub(bottle.container.queuePacket, 'queuePacket')
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
            })

            afterEach(function() {
                bottle.container.writePacket.init()
                bottle.container.queuePacket.init()
                sandbox.restore()
            })

            after(function() {
                bottle.container.server.close()
                bottle.container.logger.transports.console.level = 'info'
            })

            it('sends a user provided pump packet', function(done) {
                //[255,0,255,165,0,96,16,6,1,10,1,38]
                packet = global.pump1PowerOn_chk.slice(5,10)
                packetWithDash = ''
                packet.forEach(function(el){
                    packetWithDash += el + '-'
                })
                packetWithDash=packetWithDash.slice(0,-1) //remove last -
                requestPoolDataWithURL('sendthispacket/'+packetWithDash).then(function(obj) {
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
                requestPoolDataWithURL('sendthispacket/'+packetWithDash).then(function(obj) {
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
                requestPoolDataWithURL('sendthispacket/'+packetWithDash).then(function(obj) {
                    writeSPPacketStub.args[0][0].should.deep.equal(chlorPkt)
                }).then(done,done)
            });

        });

    });
});
