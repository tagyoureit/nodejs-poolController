describe('recieves packets from buffer and follows them to decoding', function() {


    describe('#When packets arrive', function() {
        context('via serialport or Socat and ending with Socket.io', function() {

            before(function() {
                bottle.container.logger.transports.console.level = 'silly';
                bottle.container.server.init()
                bottle.container.io.init()
            });

            beforeEach(function() {
                sandbox = sinon.sandbox.create()
                clock = sandbox.useFakeTimers()
                loggerInfoStub = sandbox.spy(bottle.container.logger, 'info')
                loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
                loggerVerboseStub = sandbox.spy(bottle.container.logger, 'verbose')
                loggerDebugStub = sandbox.spy(bottle.container.logger, 'debug')
                loggerSillyStub = sandbox.spy(bottle.container.logger, 'silly')
                socketIOSpy = sandbox.spy(bottle.container.io, 'emitToClients')
            })

            afterEach(function() {
                bottle.container.pump.init()
                sandbox.restore()

            })

            after(function() {
                bottle.container.logger.transports.console.level = 'info'
                bottle.container.server.close()
            })

            it('#checks local version to latest published release', function() {
                return bottle.container.updateAvailable.check()
            })

        })
    })
})
