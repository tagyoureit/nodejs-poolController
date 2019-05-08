'use strict';

/**
 * Run tests using ts-node per https://journal.artfuldev.com/unit-testing-node-applications-with-typescript-using-mocha-and-chai-384ef05f32b2
 * 
 * Global declaration pattern: https://stackoverflow.com/questions/38906359/create-a-global-variable-in-typescript
 * 
 * When compliling with ts-node, include all files to get Declarations per https://github.com/TypeStrong/ts-node#help-my-types-are-missing.  This is the "TS_NODE_FILES=true" in the 
 */

// source map support - not needed as ts-node has built-in support
// import 'source-map-support/register'

import { server, settings, logger, reload, sp, pumpControllerTimers, packetBuffer, receiveBuffer, pump, chlorinator, heat, time, schedule, customNames, circuit, intellitouch, temperature, UOM, valve, intellichem, chlorinatorController } from '../../src/etc/internal';

var path = require( 'path' ).posix

// register Chai's assertion library.
import * as _chai from 'chai'
import * as fs from  'fs' 

// Workaround for Global from https://stackoverflow.com/questions/40743131/how-to-prevent-property-does-not-exist-on-type-global-with-jsdom-and-t
const globalAny: any = global;

var sinon = require( 'sinon' )

_chai.should();
_chai.config.includeStack = true;


globalAny.socketURL = 'http://localhost:3000'
globalAny.socketOptions = {
  'transports': [ 'websocket' ],
  'forceNew': true
}
globalAny.wait = require( 'util' ).promisify( setTimeout )

// side effect imports
let pumpCommands = require('./pumpCommands') 
let checksum = require('./packetsWithChecksum' )
let buffer = require( './bufferCapture' )

// bring in helper functions
import * as initialize from './initialize'
initialize.load()

//remove corrupt config.json if present
var configLocation = path.join( process.cwd(), '/specs/assets/config/config.json' )
fs.writeFileSync( configLocation, '{}' )

// Initialize the logger and load initial settings
logger.init()
settings.load( { "configLocation": './specs/assets/config/config.json' } )