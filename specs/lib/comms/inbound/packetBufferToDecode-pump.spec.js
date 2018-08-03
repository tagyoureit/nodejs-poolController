describe('receives packets from buffer and follows them to decoding', function() {


    describe('#When packets arrive', function() {
        context('via serialport or Socat and ending with Socket.io', function() {

            before(function() {
                return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config.pump.VS.json'})
            });

            beforeEach(function() {
                // sinon = sinon.sinon.create()
                //clock = sinon.useFakeTimers()
                loggers = setupLoggerStubOrSpy('stub', 'spy')
                updateAvailStub = sinon.stub(bottle.container.updateAvailable, 'getResultsAsync').returns(Promise.resolve({}))
            })

            afterEach(function() {
                bottle.container.pump.init()
                sinon.restore()

            })

            after(function() {
                return global.stopAllAsync()
            })

            it('#decodes pump 1 power off command from the controller', function(done) {
                Promise.resolve()
                    .then(function() {
                        bottle.container.pump.getPower(1).should.eq('powernotset')
                        bottle.container.packetBuffer.push(new Buffer(global.pump1PowerOff_chk))
                        bottle.container.packetBuffer.push(new Buffer(global.pump1PowerOffAck_chk))
                    })
                    .delay(100)
                    .then(function(){
                        // console.log('loggers.logger args:', loggers.loggerVerboseStub.args)
                        // console.log('getCurrentPumpStatus(1) END:', bottle.container.pump.getCurrentPumpStatus(1))
                        loggers.loggerVerboseStub.args[0][2].should.contain('Main')
                        loggers.loggerVerboseStub.args[0][3].should.contain('Pump 1')
                        loggers.loggerVerboseStub.args[0][4].should.contain('off')
                        loggers.loggerVerboseStub.args[1][2].should.contain('Pump 1')
                        loggers.loggerVerboseStub.args[1][3].should.contain('off')
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
                    .then(function() {
                        bottle.container.pump.getPower(1).should.eq('powernotset')
                        bottle.container.packetBuffer.push(new Buffer(global.pump1PowerOn_chk))
                        bottle.container.packetBuffer.push(new Buffer(global.pump1PowerOnAck_chk))
                    })
                    .delay(100)
                    .then(function(){
                        // console.log('loggers.logger args:', loggers.loggerVerboseStub.args)
                        // console.log('getCurrentPumpStatus(1) END:', bottle.container.pump.getCurrentPumpStatus(1))
                        loggers.loggerVerboseStub.args[0][2].should.contain('Main')
                        loggers.loggerVerboseStub.args[0][3].should.contain('Pump 1')
                        loggers.loggerVerboseStub.args[0][4].should.contain('on')
                        loggers.loggerVerboseStub.args[1][2].should.contain('Pump 1')
                        loggers.loggerVerboseStub.args[1][3].should.contain('on')
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
                    .then(function() {

                        bottle.container.pump.getCurrentPumpStatus().pump[1].remotecontrol.should.eq('remotecontrolnotset')
                        bottle.container.packetBuffer.push(new Buffer(global.pump1RemoteControlOn_chk))
                        bottle.container.packetBuffer.push(new Buffer(global.pump1RemoteControlOnAck_chk))
                    })
                    .delay(100)
                    .then(function(){
                        // console.log('loggers.logger args:', loggers.loggerVerboseStub.args)
                        // console.log('getCurrentPumpStatus(1) END:', bottle.container.pump.getCurrentPumpStatus(1))
                        loggers.loggerVerboseStub.args[0][2].should.contain('Main')
                        loggers.loggerVerboseStub.args[0][3].should.contain('Pump 1')
                        loggers.loggerVerboseStub.args[0][4].should.contain('disable')
                        loggers.loggerVerboseStub.args[1][2].should.contain('Pump 1')
                        loggers.loggerVerboseStub.args[1][3].should.contain('disable')
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
                    .then(function() {
                        bottle.container.pump.getCurrentPumpStatus().pump[2].remotecontrol.should.eq('remotecontrolnotset')
                        bottle.container.packetBuffer.push(new Buffer(global.pump2RemoteControlOff_chk))
                        bottle.container.packetBuffer.push(new Buffer(global.pump2RemoteControlOffAck_chk))
                    })
                    .delay(100)
                    .then(function(){
                        // console.log('loggers.logger args:', loggers.loggerVerboseStub.args)
                        // console.log('getCurrentPumpStatus(1) END:', bottle.container.pump.getCurrentPumpStatus(1))
                        loggers.loggerVerboseStub.args[0][2].should.contain('Main')
                        loggers.loggerVerboseStub.args[0][3].should.contain('Pump 2')
                        loggers.loggerVerboseStub.args[0][4].should.contain('enable')
                        loggers.loggerVerboseStub.args[1][2].should.contain('Pump 2')
                        loggers.loggerVerboseStub.args[1][3].should.contain('enable')
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

            // it('#should decode a pump 1 reply with status command from the controller', function() {
            //     //TODO: What are we testing here?
            //     return Promise.resolve()
            //         .then(function(){
            //             iOAOAStub = sinon.spy(bottle.container.receiveBuffer, 'iterateOverArrayOfArrays')
            //             bottle.container.packetBuffer.push(new Buffer(global.pump1SendStatus_chk))
            //         })
            //         .delay(50)
            //         .then(function(){
            //             // packet = {
            //             //     "type": "Buffer",
            //             //     "data": global.pump1PowerOffAck_chk
            //             // }
            //             // bottle.container.packetBuffer.push(new Buffer(packet))
            //             iOAOAStub.callCount.should.eq(1)
            //
            //         })
            // })


        })
    })
})
