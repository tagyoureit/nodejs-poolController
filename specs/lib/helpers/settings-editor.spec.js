var fs = require('fs'),
    // fsio = require('promised-io/fs'),
    path = require('path').posix,
    Promise = require('bluebird')
Promise.promisifyAll(fs)

describe('updates config.json variables to match number of circuits and pumps', function () {
    context('when called with the internal function', function () {


        before(function () {

            return global.initAllAsync({'configLocation': '/specs/assets/config/templates/config_multiple_controllers.json'})
                .then(function () {
                    loggers = setupLoggerStubOrSpy('stub', 'stub')

                })
                .delay(25)
        })

        beforeEach(function () {


        })

        afterEach(function () {
        })

        after(function () {
            return global.stopAllAsync()
        })


        it('#gets pumpExternalProgram', function () {

            return Promise.resolve()
                .then(function(){
                    var circuits = bottle.container.settings.get('equipment.circuit.friendlyName')
                    Object.keys(circuits).length.should.eq(50)
                    var pumps = bottle.container.settings.get('equipment.pump')
                    Object.keys(pumps).length.should.eq(8)
                })
  })
    })
})
