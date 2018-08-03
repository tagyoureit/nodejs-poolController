describe('processes Intellitouch packets', function() {
    describe('#when requested', function() {

        before(function() {

                    return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config_intellitouch.json'})

        })

        beforeEach(function() {
            loggers = setupLoggerStubOrSpy('stub', 'spy')
            clock = sinon.useFakeTimers()

            bottle.container.settings.set('intellitouch.installed', 0)
            bottle.container.settings.set('intellicom.installed', 1)
        })

        afterEach(function() {
            sinon.restore()

        })

        after(function() {

                    return global.stopAllAsync()

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
