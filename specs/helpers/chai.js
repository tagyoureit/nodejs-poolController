'use strict';

var chai = global.chai = require('chai');
global.sinon = require('sinon')
global.sinonChai = require("sinon-chai");
var nock = global.nock = require('nock')
var rewire = global.rewire = require("rewire");
var nodejspoolcontroller = require('../../lib/app')
var Bottle = global.Bottle = require('bottlejs')
var path = global.path = require('path').posix

var chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
chai.should();
var expect = global.expect = chai.expect;
chai.config.includeStack = true;
var _ = global._ = require('lodash');
var rp = global.rp = require('request-promise')
global.bottle = Bottle.pop('poolController-Bottle');
global.spy = sinon.spy()
chai.config.includeStack = true;
//global.expect = chai.expect;
global.AssertionError = chai.AssertionError;
global.Assertion = chai.Assertion;
global.assert = chai.assert;

var fs = require('promised-io/fs')

 fs.readFile(path.join(process.cwd(), '/specs/assets/webJsonReturns', 'circuit.json'), 'utf8')
    .then(function(data) {
      global.circuitJson = JSON.parse(data)
    }, function(error) {
        console.log('Error reading circuit.json from /specs/assets/webJsonReturns. ', error)
    })
