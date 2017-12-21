describe('processes Intellitouch packets', function() {
    describe('#when requested', function() {

        before(function() {
            return global.initAllAsync()
                .then(function () {
                    return global.useShadowConfigFileAsync('/specs/assets/config/templates/config_intellitouch.json')
                })
        })

        beforeEach(function() {
            sandbox = sinon.sandbox.create()

            loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')

            loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
            loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
            loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')

            loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
        })

        afterEach(function() {
            sandbox.restore()

        })

        after(function() {
            return global.removeShadowConfigFileAsync()
                .then(function(){
                    return global.stopAllAsync()
                })
        })


        it('#should request checkIfNeedControllerConfiguration before preamble is set', function() {
            bottle.container.intellitouch.getPreambleByte().should.equal(-1)
            bottle.container.intellitouch.checkIfNeedControllerConfiguration().should.equal(1)
        })

        it('#should set and get the preamble and request configuration', function() {
            return Promise.resolve()
                .then(function(){
                    gCCSpy = sandbox.spy(bottle.container.intellitouch, 'getControllerConfiguration')

                    bottle.container.intellitouch.setPreambleByte(33)
                    bottle.container.intellitouch.getPreambleByte().should.equal(33)
                    bottle.container.intellitouch.checkIfNeedControllerConfiguration().should.equal(0)
                })
                .delay(500)
                .then(function() {

                    gCCSpy.callCount.should.equal(1)
                })
        })



        it('#will request configuration', function(){
            bottle.container.intellitouch.getControllerConfiguration()

        })


    })
})
