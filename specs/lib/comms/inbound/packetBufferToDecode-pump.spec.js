describe('receives packets from buffer and follows them to decoding', function() {


    describe('#When packets arrive', function() {
        context('via serialport or Socat and ending with Socket.io', function() {

            before(function() {
                return global.initAllAsync()
            });

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                //clock = sandbox.useFakeTimers()
                loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
                updateAvailStub = sandbox.stub(bottle.container.updateAvailable, 'getResultsAsync').returns(Promise.resolve({}))
            })

            afterEach(function() {
                bottle.container.pump.init()
                sandbox.restore()

            })

            after(function() {
                return global.stopAllAsync()
            })

            it('#decodes pump 1 power off command from the controller', function(done) {
                Promise.resolve()
                    .then(function(){
                        bottle.container.pump.getPower(1).should.eq('powernotset')
                        bottle.container.packetBuffer.push(new Buffer(global.pump1PowerOff_chk))
                        bottle.container.packetBuffer.push(new Buffer(global.pump1PowerOffAck_chk))
                        // console.log('logger args:', loggerVerboseStub.args)
                        // console.log('getCurrentPumpStatus(1) END:', bottle.container.pump.getCurrentPumpStatus(1))
                        loggerVerboseStub.args[0][2].should.contain('Main')
                        loggerVerboseStub.args[0][3].should.contain('Pump 1')
                        loggerVerboseStub.args[0][4].should.contain('off')
                        loggerVerboseStub.args[1][2].should.contain('Pump 1')
                        loggerVerboseStub.args[1][3].should.contain('off')
                        bottle.container.pump.getPower(1).should.eq(0)
                    })
                    .then(function(){
                        return global.waitForSocketResponseAsync('pump')
                    })
                    .then(function(data){
                        data.pump[1].power.should.eq(0)
                    })
                    .then(done,done)
            })


            it('#decodes pump 1 power on command from the controller', function(done) {
                Promise.resolve()
                    .then(function(){
                        bottle.container.pump.getPower(1).should.eq('powernotset')
                        bottle.container.packetBuffer.push(new Buffer(global.pump1PowerOn_chk))
                        bottle.container.packetBuffer.push(new Buffer(global.pump1PowerOnAck_chk))
                        // console.log('logger args:', loggerVerboseStub.args)
                        // console.log('getCurrentPumpStatus(1) END:', bottle.container.pump.getCurrentPumpStatus(1))
                        loggerVerboseStub.args[0][2].should.contain('Main')
                        loggerVerboseStub.args[0][3].should.contain('Pump 1')
                        loggerVerboseStub.args[0][4].should.contain('on')
                        loggerVerboseStub.args[1][2].should.contain('Pump 1')
                        loggerVerboseStub.args[1][3].should.contain('on')
                        bottle.container.pump.getPower(1).should.eq(1)
                    })
                    .then(function(){
                        return global.waitForSocketResponseAsync('pump')
                    })
                    .then(function(data){
                        data.pump[1].power.should.eq(1)
                    })
                    .then(done,done)

            })

            it('#decodes pump 1 remote control on command from the controller', function(done) {
                Promise.resolve()
                    .then(function(){

                        bottle.container.pump.getCurrentPumpStatus().pump[1].remotecontrol.should.eq('remotecontrolnotset')
                        bottle.container.packetBuffer.push(new Buffer(global.pump1RemoteControlOn_chk))
                        bottle.container.packetBuffer.push(new Buffer(global.pump1RemoteControlOnAck_chk))
                        // console.log('logger args:', loggerVerboseStub.args)
                        // console.log('getCurrentPumpStatus(1) END:', bottle.container.pump.getCurrentPumpStatus(1))
                        loggerVerboseStub.args[0][2].should.contain('Main')
                        loggerVerboseStub.args[0][3].should.contain('Pump 1')
                        loggerVerboseStub.args[0][4].should.contain('disable')
                        loggerVerboseStub.args[1][2].should.contain('Pump 1')
                        loggerVerboseStub.args[1][3].should.contain('disable')
                        bottle.container.pump.getCurrentPumpStatus().pump[1].remotecontrol.should.eq(1)
                    })
                    .then(function(){
                        return global.waitForSocketResponseAsync('pump')
                    })
                    .then(function(data){
                        data.pump[1].remotecontrol.should.eq(1)
                    })
                    .then(done,done)

            })

            it('#decodes pump 2 remote control off command from the controller', function(done) {
                Promise.resolve()
                    .then(function(){
                        bottle.container.pump.getCurrentPumpStatus().pump[2].remotecontrol.should.eq('remotecontrolnotset')
                        bottle.container.packetBuffer.push(new Buffer(global.pump2RemoteControlOff_chk))
                        bottle.container.packetBuffer.push(new Buffer(global.pump2RemoteControlOffAck_chk))
                        // console.log('logger args:', loggerVerboseStub.args)
                        // console.log('getCurrentPumpStatus(1) END:', bottle.container.pump.getCurrentPumpStatus(1))
                        loggerVerboseStub.args[0][2].should.contain('Main')
                        loggerVerboseStub.args[0][3].should.contain('Pump 2')
                        loggerVerboseStub.args[0][4].should.contain('enable')
                        loggerVerboseStub.args[1][2].should.contain('Pump 2')
                        loggerVerboseStub.args[1][3].should.contain('enable')
                        bottle.container.pump.getCurrentPumpStatus().pump[2].remotecontrol.should.eq(0)

                    })
                    .then(function(){
                        return global.waitForSocketResponseAsync('pump')
                    })
                    .then(function(data){
                        data.pump[2].remotecontrol.should.eq(0)
                    })
                    .then(done,done)
            })

            it('#should decode a pump 1 reply with status command from the controller', function() {
                //TODO: What are we testing here?
                iOAOAStub = sandbox.spy(bottle.container.receiveBuffer, 'iterateOverArrayOfArrays')

                bottle.container.packetBuffer.push(new Buffer(global.pump1SendStatus_chk))
                // packet = {
                //     "type": "Buffer",
                //     "data": global.pump1PowerOffAck_chk
                // }
                // bottle.container.packetBuffer.push(new Buffer(packet))
                iOAOAStub.callCount.should.eq(1)
            })


        })
    })
})
