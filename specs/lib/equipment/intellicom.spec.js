describe('processes Intellitouch packets', function() {
    describe('#when requested', function() {

        before(function() {
            return global.initAll()
                .then(function () {
                    return global.useShadowConfigFile('/specs/assets/config/templates/config_intellitouch.json')
                })
        })

        beforeEach(function() {
            sandbox = sinon.sandbox.create()
            clock = sandbox.useFakeTimers()
            loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
            loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
            loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
            loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
            loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
            bottle.container.settings.set('intellitouch.installed', 0)
            bottle.container.settings.set('intellicom.installed', 1)
        })

        afterEach(function() {
            sandbox.restore()

        })

        after(function() {
            return global.removeShadowConfigFile()
                .then(function(){
                    return global.stopAll()
                })
        })


        it('#should request checkIfNeedControllerConfiguration before preamble is set', function() {
            bottle.container.intellitouch.getPreambleByte().should.equal(-1)
            bottle.container.intellitouch.checkIfNeedControllerConfiguration().should.equal(0)
        })



        it('#will not get configuration with Easytouch installed', function(){
            bottle.container.intellitouch.init()

            bottle.container.intellitouch.checkIfNeedControllerConfiguration().should.equal(0)
        })
    })
})
