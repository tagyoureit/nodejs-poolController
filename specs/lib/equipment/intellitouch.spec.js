describe('processes Intellitouch packets', function() {
    describe('#when requested', function() {

        before(function() {

                    return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config_intellitouch.json'})

        })

        beforeEach(function() {
            loggers = setupLoggerStubOrSpy('stub', 'spy')
        })

        afterEach(function() {
            // sinon.restore()

        })

        after(function() {

                    return global.stopAllAsync()

        })


        it('#should request checkIfNeedControllerConfiguration before preamble is set', function() {
            bottle.container.intellitouch.getPreambleByte().should.equal(-1)
            bottle.container.intellitouch.checkIfNeedControllerConfiguration().should.equal(1)
        })

        it('#should set and get the preamble and request configuration', function() {
            return Promise.resolve()
                .then(function(){
                    gCCSpy = sinon.spy(bottle.container.intellitouch, 'getControllerConfiguration')

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
