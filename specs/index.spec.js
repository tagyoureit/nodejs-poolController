//var expect = require('chai').expect
//var nodejspentair = require('../index')
var Bottle = require('bottlejs')
var bottle = Bottle.pop('poolController-Bottle');

//setTimeout(function() {
    describe('nodejs-poolController', function() {
        describe('Bottle should exist', function() {
            it('should start the app', function() {
                bottle.should.exist

            })
        })

        describe('Bottle should load logger', function() {
            it('should load logger', function() {
                bottle.container.logger.should.exist

            })
        })


    })
    //run()
//}, 10000)
