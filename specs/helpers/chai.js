'use strict';
var path = global.path = require('path').posix
var chai = global.chai = require('chai');
global.sinon = require('sinon')
global.sinonChai = require("sinon-chai");
var nock = global.nock = require('nock')
var rewire = global.rewire = require("rewire");
var nodejspoolcontroller = require(path.join(process.cwd(),'/src/lib/app'))
var Bottle = global.Bottle = require('bottlejs')
bottle.container.settings.load()

var chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
chai.should();
// var expect = global.expect = chai.expect;
// chai.config.includeStack = true;
var _ = global._ = require('underscore');  //changed from lodash in 3.1.9
var rp = global.rp = require('request-promise')
global.bottle = Bottle.pop('poolController-Bottle');
global.spy = sinon.spy()
chai.config.includeStack = true;
// //global.expect = chai.expect;
// global.AssertionError = chai.AssertionError;
// global.Assertion = chai.Assertion;
// global.assert = chai.assert;
bottle.container.pump.init()
            bottle.container.time.init()
 ioclient = global.ioclient = require('socket.io-client')
 socketURL = global.socketURL = 'http://localhost:3000'
 socketOptions = global.socketOptions = {'transports': ['websocket'],
'force new connection': false}

var pumpCommands = require(__dirname + '/pumpCommands.js')
var packetsWithChecksum = require(__dirname + '/packetsWithChecksum.js')
var bufferCapture = require(__dirname + '/bufferCapture.js')

var fs = global.fs = require('promised-io/fs')

 fs.readFile(path.join(process.cwd(), '/specs/assets/webJsonReturns', 'circuit.json'), 'utf8')
    .then(function(data) {
      global.circuitJson = JSON.parse(data)
    }, function(error) {
        console.log('Error reading circuit.json from /specs/assets/webJsonReturns. ', error)
    })
