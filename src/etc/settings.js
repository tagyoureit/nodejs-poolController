/*  nodejs-poolController.  An application to control pool equipment.
 *  Copyright (C) 2016, 2017.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as
 *  published by the Free Software Foundation, either version 3 of the
 *  License, or (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var Bottle = require('bottlejs');
var bottle = Bottle.pop('poolController-Bottle');
var fs = bottle.container.fs
var path = require('path').posix

/* istanbul ignore next */
if (bottle.container.logModuleLoading)
    console.log('Loading: settings.js')

var packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), '/package.json'), 'utf-8'))
var appVersion = packageJson.version + ' alpha 6'
var configurationFile


/*        EQUIPMENT        */
//-------  EQUIPMENT SETUP -----------

var equipment, controller, intellicom, intellitouch, virtual, virtualPumpController, virtualChlorinatorController

var circuitFriendlyNames;

var chlorinator;

var pump;
//-------  END EQUIPMENT SETUP -----------


/*   POOL CONTROLLER SECTION  */
var appAddress
//-------  WEB SETUP -----------
// Setup for Web items
var netConnect, rs485Port, netPort, netHost;
//-------  END MISC SETUP -----------


//-------  NETWORK SETUP -----------
// Setup for Network Connection (socat or nc)
var expressPort, expressTransport, expressAuth, expressAuthFile;
//-------  END NETWORK SETUP -----------

//-------  LOG SETUP -----------
//Change the following log message levels as needed
var logLevel;
var socketLogLevel, fileLog;
var logPumpMessages;
var logDuplicateMessages;
var logConsoleNotDecoded;
var logConfigMessages;
var logMessageDecoding;
var logChlorinator;
var logPacketWrites;
var logPumpTimers;
var logApi;
//-------  END EQUIPMENT SETUP -----------

var envParam = process.argv[2];
var configFile;

var checkForOldConfigFile = function() {
    try {
        //the throw will throw an error parsing the file, the catch will catch an error reading the file.
        if (configFile.hasOwnProperty("Equipment") || configFile.equipment.hasOwnProperty("numberOfPumps") || configFile.equipment.hasOwnProperty("pumpOnly") || configFile.equipment.hasOwnProperty("intellicom") || configFile.equipment.hasOwnProperty("intellitouch") || !configFile.hasOwnProperty("poolController")) {
            throw new Error('Your configuration file is out of date.  Please update to the latest version.')
        }
    } catch (err) {
        throw new Error(err)
    }
}

var load = exports.load = function() {
    /* istanbul ignore next */
    if (envParam === undefined) {
        configurationFile = exports.configurationFile = 'config.json';
    } else {
        configurationFile = exports.configurationFile = envParam
    }
    try {
        configFile = JSON.parse(fs.readFileSync(configurationFile, 'utf-8'));
    } catch (err) {
        console.log('Error reading config file:', err)
    }

    checkForOldConfigFile()

    /*   Equipment   */
    //Controller
    equipment = exports.equipment = configFile.equipment
    controller = exports.controller = configFile.equipment.controller
    intellicom = exports.intellicom = configFile.equipment.controller.intellicom;
    intellitouch = exports.intellitouch = configFile.equipment.controller.intellitouch;
    virtual = exports.virtual = configFile.equipment.controller.virtual
    virtualPumpController = exports.virtualPumpController = configFile.equipment.controller.virtual.pumpController
    virtualChlorinatorController = exports.virtualChlorinatorController = configFile.equipment.controller.virtual.chlorinatorController

    circuitFriendlyNames = exports.circuitFriendlyNames = configFile.equipment.controller.circuitFriendlyNames

    //chlorinator
    chlorinator = exports.chlorinator = configFile.equipment.chlorinator;

    //pump(s)
    pump = exports.pump = configFile.equipment.pump;
    /*   END Equipment   */
    appAddress = exports.appAddress = configFile.poolController.appAddress;
    //Web
    expressPort = exports.expressPort = configFile.poolController.web.expressPort;
    expressTransport = exports.expressTransport = configFile.poolController.web.expressTransport;
    expressAuth = exports.expressAuth = configFile.poolController.web.expressAuth;
    expressAuthFile = exports.expressAuthFile = configFile.poolController.web.expressAuthFile;


    //Network
    netConnect = exports.netConnect = configFile.poolController.network.netConnect;
    rs485Port = exports.rs485Port = configFile.poolController.network.rs485Port;
    netPort = exports.netPort = configFile.poolController.network.netPort;
    netHost = exports.netHost = configFile.poolController.network.netHost;


    //Logs
    logLevel = exports.logLevel = configFile.poolController.log.logLevel;
    socketLogLevel = exports.socketLogLevel = configFile.poolController.log.socketLogLevel;
    fileLog = exports.fileLog = configFile.poolController.log.fileLog;
    logPumpMessages = exports.logPumpMessages = configFile.poolController.log.logPumpMessages;
    logDuplicateMessages = exports.logDuplicateMessages = configFile.poolController.log.logDuplicateMessages;
    logConsoleNotDecoded = exports.logConsoleNotDecoded = configFile.poolController.log.logConsoleNotDecoded;
    logConfigMessages = exports.logConfigMessages = configFile.poolController.log.logConfigMessages;
    logMessageDecoding = exports.logMessageDecoding = configFile.poolController.log.logMessageDecoding;
    logChlorinator = exports.logChlorinator = configFile.poolController.log.logChlorinator;
    logPacketWrites = exports.logPacketWrites = configFile.poolController.log.logPacketWrites;
    logPumpTimers = exports.logPumpTimers = configFile.poolController.log.logPumpTimers;
    logApi = exports.logApi = configFile.poolController.log.logApi;
}




var getConfig = exports.getConfig = function() {
    return configFile
}



var displayIntroMsg = exports.displayIntroMsg = function() {
    var introMsg;
    introMsg = '\n*******************************';
    introMsg += '\n poolController in brief (for full details, see README.md):';
    introMsg += '\n Intellitouch: Configuration is read from your pool.  The application will send the commands to retrieve the custom names and circuit names.';
    introMsg += '\n It will dynamically load as the information is parsed.  '
    introMsg += '\n Intellicom: If you have an IntelliCom, set the Intellicom flag to 1 in the config file.'
    introMsg += '\n Pump controller: default: poolController pump controller will start if intellicom and intellitoch = 0'
    introMsg += '\n                  always: poolController pump controller will always start'
    introMsg += '\n                  never: poolController pump controller will never start'

    introMsg += '\n'
    introMsg += '\n Writing: If there is a write error 5 times, there will be a warning message.';
    introMsg += '\n If there is a write error 10 times, the logging will change to debug mode for 2 minutes and.';
    introMsg += '\n it will abort the packet and go to the next one.';
    introMsg += '\n'

    introMsg += '\n To change the amount of output to the console, change the "logx" flags in lines 45-51 of this app.';
    introMsg += '\n Visit http://_your_machine_name_:3000 for a web interface '
    introMsg += '*******************************\n'
    return introMsg
}

var displaySettingsMsg = exports.displaySettingsMsg = function() {
    var settingsStr;

    settingsStr = '' // \n*******************************';
    settingsStr += '\n Version: ' + appVersion;
    settingsStr += '\n Config File: ' + configurationFile
    settingsStr += '\n ';
    settingsStr += '\n //-------  EQUIPMENT SETUP -----------';
    settingsStr += '\n var intellicom = ' + JSON.stringify(intellicom, null, 4);
    settingsStr += '\n var intellitouch = ' + JSON.stringify(intellitouch, null, 4);
    settingsStr += '\n var virtual = ' + JSON.stringify(virtual, null, 4);
    settingsStr += '\n var controller.id = ' + JSON.stringify(controller.id, null, 4);
    settingsStr += '\n var circuitFriendlyNames = ' + JSON.stringify(circuitFriendlyNames, null, 4)
    settingsStr += '\n'
    settingsStr += '\n var chlorinator = ' + JSON.stringify(chlorinator, null, 4);
    settingsStr += '\n'
    settingsStr += '\n var pump = ' + JSON.stringify(pump, null, 4)
    settingsStr += '\n //-------  END EQUIPMENT SETUP -----------';
    settingsStr += '\n ';
    settingsStr += '\n //-------  POOLCONTROLLER SETUP -----------';
    settingsStr += '\n var appAddress = ' + appAddress;
    settingsStr += '\n //-------  WEB SETUP -----------';
    settingsStr += '\n var expressPort = ' + expressPort;
    settingsStr += '\n var expressTransport = ' + expressTransport;
    settingsStr += '\n var expressAuth = ' + expressAuth;
    settingsStr += '\n var expressAuthFile = ' + expressAuthFile;
    settingsStr += '\n //-------  END MISC SETUP -----------';
    settingsStr += '\n ';
    settingsStr += '\n //-------  NETWORK SETUP -----------';
    settingsStr += '\n // Setup for Network Connection (socat or nc)';
    settingsStr += '\n var netConnect = ' + netConnect;
    settingsStr += '\n var rs485Port = ' + rs485Port;
    settingsStr += '\n var netHost = ' + netHost;
    settingsStr += '\n var netPort = ' + netPort;
    settingsStr += '\n //-------  END NETWORK SETUP -----------';
    settingsStr += '\n ';
    settingsStr += '\n //-------  LOG SETUP -----------';
    settingsStr += '\n var logLevel = ' + logLevel;
    settingsStr += '\n var socketLogLevel = ' + socketLogLevel;
    settingsStr += '\n var fileLog = ' + JSON.stringify(fileLog);
    settingsStr += '\n var logPumpMessages = ' + logPumpMessages;
    settingsStr += '\n var logDuplicateMessages = ' + logDuplicateMessages;
    settingsStr += '\n var logConsoleNotDecoded = ' + logConsoleNotDecoded;
    settingsStr += '\n var logConfigMessages = ' + logConfigMessages;
    settingsStr += '\n var logMessageDecoding = ' + logMessageDecoding;
    settingsStr += '\n var logChlorinator = ' + logChlorinator;
    settingsStr += '\n var logPacketWrites = ' + logPacketWrites;
    settingsStr += '\n var logPumpTimers = ' + logPumpTimers;
    settingsStr += '\n var logApi = ' + logApi;
    settingsStr += '\n //-------  END LOG SETUP -----------\n\n';
    //settingsStr += '\n*******************************';
    return settingsStr
}

/* istanbul ignore next */
if (bottle.container.logModuleLoading)
    console.log('Loaded: settings.js')
