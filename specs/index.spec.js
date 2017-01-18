var expect = require('chai').expect
var nodejspentair = require('../index')
var Bottle = require('bottlejs')
var bottle = Bottle.pop('pentair-Bottle');

setTimeout(function() {
    describe('nodejs-Pentair', function() {
        describe('Bottle should exist', function() {
            it('should start the app', function() {
                expect(bottle).to.exist

            })
        })

        describe('Bottle should load logger', function() {
            it('should load logger', function() {
                expect(bottle.container.logger).to.exist

            })
        })


    })
    run()
}, 10000)
