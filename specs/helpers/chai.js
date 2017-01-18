'use strict';

var chai = require('chai');
global.sinon = require('sinon')
global.sinonChai = require("sinon-chai");
var nodejspentair = require('../../index')
var Bottle = require('bottlejs')

var chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
var expect = global.expect = chai.expect;
chai.config.includeStack = true;
var _ = global._ = require('lodash');
var rp = global.rp = require('request-promise')
global.bottle = Bottle.pop('pentair-Bottle');
global.spy = sinon.spy()
chai.config.includeStack = true;
//global.expect = chai.expect;
global.AssertionError = chai.AssertionError;
global.Assertion = chai.Assertion;
global.assert = chai.assert;
