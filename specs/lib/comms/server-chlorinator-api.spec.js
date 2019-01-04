describe('#set functions', function() {

    describe('#sends chlorinator commands', function() {
        context('with NO chlorinator installed, with a REST API', function () {

            before(function () {

                // return Promise.resolve()
                //     .then(function () {
                //         bottle.container.settings.set('virtual.chlorinatorController', 0)
                //         bottle.container.settings.set('chlorinator.installed', 0)
                //     })
                //     .then(global.initAllAsync)
                return global.initAllAsync()
            });

            beforeEach(function () {
                // sinon = sinon.sinon.create()
                //clock = sinon.useFakeTimers()
                loggers = setupLoggerStubOrSpy('stub', 'spy')
                queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
                socketIOStub = sinon.stub(bottle.container.io, 'emitToClients')
            })

            afterEach(function () {
                sinon.restore()

            })

            after(function () {
                return global.stopAllAsync()
            })


            it('should send a message if chlorinator is not installed', function () {
                return global.requestPoolDataWithURLAsync('chlorinator/0')
                    .then(function (result) {
                        result.text.should.contain('FAIL')
                        queuePacketStub.callCount.should.eq(0)
                    })

            })
        })
    })
    describe('#sends chlorinator commands', function() {

        context('with the VIRTUAL chlorinator with a REST API', function() {

            before(function() {
                return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config_intellichlor_virtual.json'})
            });

            beforeEach(function() {
                loggers = setupLoggerStubOrSpy('stub','stub')
                queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
                settingsStub = sinon.stub(bottle.container.settings, 'updateChlorinatorDesiredOutputAsync')
            })

            afterEach(function() {
                bottle.container.chlorinator.setChlorinatorLevelAsync(0,0,0)
                    .then(function(){
                        bottle.container.chlorinatorController.clearTimer()
                        // Clear out the write queues
                        bottle.container.queuePacket.init()
                        bottle.container.writePacket.init()
                        sinon.restore()
                    })

            })

            after(function() {
                return Promise.resolve()
                    .then(function(){
                        bottle.container.settings.set('virtual.chlorinatorController', 0)
                        bottle.container.settings.set('chlorinator.installed', 0)
                    })
                    .then(global.stopAllAsync)
            })

            it('starts chlorinator at 50%', function() {

                return global.requestPoolDataWithURLAsync('chlorinator/50')
                    .delay(50)
                    .then(function(result) {
                        result.status.should.eq('on')
                        result.value.should.eq(50)
                        queuePacketStub.callCount.should.eq(1)
                        queuePacketStub.args[0][0].should.deep.equal([16, 2, 80, 17, 50])
                    })
            })
            it('starts chlorinator at 100%', function() {

               return global.requestPoolDataWithURLAsync('chlorinator/100')
                    .then(function(result) {
                        result.status.should.eq('on')
                        result.value.should.eq(100)
                        queuePacketStub.callCount.should.eq(1)
                        queuePacketStub.args[0][0].should.deep.equal([16, 2, 80, 17, 100])
                    })

            })
            it('starts chlorinator at 101% (super chlorinate)', function() {

                return global.requestPoolDataWithURLAsync('chlorinator/101')
                    .then(function(result) {
                        result.status.should.eq('on')
                        result.value.should.eq(101)
                        queuePacketStub.callCount.should.eq(1)
                        queuePacketStub.args[0][0].should.deep.equal([16, 2, 80, 17, 101])
                    })

            })
            it('starts chlorinator at -1% (should fail)', function() {

               return global.requestPoolDataWithURLAsync('chlorinator/-1')
                    .then(function(result) {
                        result.text.should.contain('FAIL')
                        queuePacketStub.callCount.should.eq(0)
                    })

            })
            it('starts chlorinator at 150% (should fail)', function() {

              return  global.requestPoolDataWithURLAsync('chlorinator/150')
                    .then(function(result){
                        result.text.should.contain('FAIL')
                        queuePacketStub.callCount.should.eq(0)
                    })

            })
            it('starts chlorinator at 0%', function() {
                //do this one last so
                return global.requestPoolDataWithURLAsync('chlorinator/0')
                    .then(function(result) {
                        result.status.should.eq('off')
                        result.value.should.eq(0)
                        queuePacketStub.callCount.should.eq(1)
                        queuePacketStub.args[0][0].should.deep.equal([16, 2, 80, 17, 0])
                    })

            })
        });
    });


    describe('#sends chlorinator commands', function() {

        context('with a Intellitouch chlorinator with a REST API', function() {

            before(function() {

                return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config_intellitouch_intellichlor.json'})
            });

            beforeEach(function() {
                loggers = setupLoggerStubOrSpy('stub','stub')
                queuePacketStub = sinon.stub(bottle.container.queuePacket, 'queuePacket')
                settingsStub = sinon.stub(bottle.container.settings, 'updateChlorinatorDesiredOutputAsync')
                preambleStub = sinon.stub(bottle.container.intellitouch, 'getPreambleByte').returns(99)
            })

            afterEach(function() {
                bottle.container.chlorinator.setChlorinatorLevelAsync(0,0,0)
                    .then(function(){
                        bottle.container.chlorinatorController.clearTimer()
                        // Clear out the write queues
                        bottle.container.queuePacket.init()
                        bottle.container.writePacket.init()
                        sinon.restore()
                    })

            })

            after(function() {
                return Promise.resolve()
                    .then(function(){
                        bottle.container.settings.set('virtual.chlorinatorController', 0)
                        bottle.container.settings.set('chlorinator.installed', 0)
                    })
                    .then(global.stopAllAsync)
            })

            it('starts chlorinator at 50%', function() {

                return global.requestPoolDataWithURLAsync('chlorinator/50')
                    .delay(50)
                    .then(function(result) {
                        result.status.should.eq('on')
                        result.value.should.eq(50)
                        queuePacketStub.callCount.should.eq(1)
                        // NOTE: this spa setting should be 22 (11%) because that is what is saved in the config file
                        // all others should then be 0 because we reset the value after each test
                        queuePacketStub.args[0][0].should.deep.equal([165,99,16,33,153,10,22,50,0,0,0,0,0,0,0,0])
                    })

            })
            it('starts chlorinator at 100%', function() {

                return global.requestPoolDataWithURLAsync('chlorinator/100')
                    .delay(50)
                    .then(function(result) {
                        result.status.should.eq('on')
                        result.value.should.eq(100)
                        queuePacketStub.callCount.should.eq(1)
                        queuePacketStub.args[0][0].should.deep.equal([165,99,16,33,153,10,0,100,0,0,0,0,0,0,0,0])
                    })

            })
            it('starts chlorinator at 101% (super chlorinate)', function() {

                return global.requestPoolDataWithURLAsync('chlorinator/101')
                    .then(function(result) {
                        result.status.should.eq('on')
                        queuePacketStub.callCount.should.eq(1)
                        queuePacketStub.args[0][0].should.deep.equal([165,99,16,33,153,10,0,0,129,0,0,0,0,0,0,0])
                    })

            })
            it('starts chlorinator at -2% (should fail)', function() {

                return global.requestPoolDataWithURLAsync('chlorinator/-2')
                    .then(function(result) {
                        result.text.should.contain('FAIL')
                        queuePacketStub.callCount.should.eq(0)
                    })

            })
            it('starts chlorinator at 150% (should fail)', function() {

               return global.requestPoolDataWithURLAsync('chlorinator/150')
                    .then(function(result){
                        result.text.should.contain('FAIL')
                        queuePacketStub.callCount.should.eq(0)
                    })

            })

            it('tests /pool API at 75%', function() {

                return global.requestPoolDataWithURLAsync('chlorinator/pool/75')
                    .then(function(result) {
                        queuePacketStub.callCount.should.eq(1)
                        queuePacketStub.args[0][0].should.deep.equal([165,99,16,33,153,10,0,75,0,0,0,0,0,0,0,0])
                    })
            })


            it('tests /spa API at 75%', function() {

                return global.requestPoolDataWithURLAsync('chlorinator/spa/75')
                    .then(function(result) {
                        queuePacketStub.callCount.should.eq(1)
                        queuePacketStub.args[0][0].should.deep.equal([165,99,16,33,153,10,150,0,0,0,0,0,0,0,0,0])
                    })
            })

            it('tests /pool/x/spa/y API at 85%/25%', function() {

                return global.requestPoolDataWithURLAsync('chlorinator/pool/85/spa/25')
                    .then(function(result) {
                        queuePacketStub.callCount.should.eq(1)
                        queuePacketStub.args[0][0].should.deep.equal([165,99,16,33,153,10,50,85,0,0,0,0,0,0,0,0])
                    })
            })


            it('tests /superChlorinateHours/x API at 2', function() {

                return global.requestPoolDataWithURLAsync('chlorinator/superChlorinateHours/2')
                    .then(function(result) {
                        queuePacketStub.callCount.should.eq(1)
                        queuePacketStub.args[0][0].should.deep.equal([165,99,16,33,153,10,0,0,130,0,0,0,0,0,0,0])
                    })
            })

            it('tests /pool/x/spa/y/superChlorinateHours/z API at 2', function() {

                return global.requestPoolDataWithURLAsync('chlorinator/pool/1/spa/2/superChlorinateHours/3')
                    .then(function(result) {
                        queuePacketStub.callCount.should.eq(1)
                        queuePacketStub.args[0][0].should.deep.equal([165,99,16,33,153,10,4,1,131,0,0,0,0,0,0,0])
                    })
            })

            it('sets chlorinator at 0%', function() {
               return global.requestPoolDataWithURLAsync('chlorinator/0')
                    .then(function(result) {
                        queuePacketStub.callCount.should.eq(1)
                        queuePacketStub.args[0][0].should.deep.equal([165,99,16,33,153,10,0,0,0,0,0,0,0,0,0,0])
                    })

            })
        });
    });


})

