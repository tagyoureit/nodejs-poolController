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
var bottle = Bottle.pop('pentair-Bottle');
var fs = bottle.container.fs

if (bottle.container.logModuleLoading)
    console.log('Loading: settings.js')

//-------  EQUIPMENT SETUP -----------

//ONE and only 1 of the following should be set to 1.
var intellicom; //set this to 1 if you have the IntelliComII, otherwise 0.
var intellitouch; //set this to 1 if you have the IntelliTouch, otherwise 0.
var pumpOnly; //set this to 1 if you ONLY have pump(s), otherwise 0.

//1 or 0
var chlorinator; //set this to 1 if you have a chlorinator, otherwise 0.

//only relevant if pumpOnly=1
var numberOfPumps; //this is only used with pumpOnly=1.  It will query 1 (or 2) pumps every 30 seconds for their status
var appAddress; //address the app should emulate/use on the serial bus
//-------  END EQUIPMENT SETUP -----------

//-------  MISC SETUP -----------
// Setup for Miscellaneous items
var netConnect; //set this to 1 to use a remote (net) connection, 0 for direct serial connection;
var rs485Port; //port for direct connect to a RS485 adapter
var netPort; //port for the SOCAT communications
var netHost; //host for the SOCAT communications

//-------  END MISC SETUP -----------


//-------  NETWORK SETUP -----------
// Setup for Network Connection (socat or nc)
var expressDir; //set this to the default directory for the web interface (either "/bootstrap" or "/public")
var expressPort; //port for the Express App Server
var expressTransport; //http, https, or both
var expressAuth; // Authentication (username, password) to access web interface (0=no auth, 1=auth)
var expressAuthFile; // Authentication file (created using htpasswd, stores username and password)
//-------  END NETWORK SETUP -----------

//-------  LOG SETUP -----------
//Change the following log message levels as needed
var logLevel; // one of { error: 0, warn: 1, info: 2, verbose: 3, debug: 4, silly: 5 }
var logPumpMessages; //variable if we want to output pump messages or not
var logDuplicateMessages; //variable if we want to output duplicate broadcast messages
var logConsoleNotDecoded; //variable to hide any unknown messages
var logConfigMessages; //variable to show/hide configuration messages
var logMessageDecoding; //variable to show messages regarding the buffer, checksum calculation, etc.
var logChlorinator; //variable to show messages from the chlorinator
var logPacketWrites; //variable to log queueing/writing activities
var logPumpTimers; //variable to output timer debug messages for the pumps
//-------  END EQUIPMENT SETUP -----------





var configurationFile = '';
if (process.argv[2]===undefined){
  configurationFile = 'config.json';
}
else {
  configurationFile = process.argv[2]
}

var configFile = JSON.parse(fs.readFileSync(configurationFile));

getConfig = exports.getConfig = function(){
  return configFile
}

intellicom = exports.intellicom  = configFile.Equipment.intellicom;
intellitouch = exports.intellitouch  = configFile.Equipment.intellitouch;
pumpOnly = exports.pumpOnly  = configFile.Equipment.pumpOnly;
chlorinator = exports.chlorinator  = configFile.Equipment.chlorinator;
numberOfPumps = exports.numberOfPumps  = configFile.Equipment.numberOfPumps;
appAddress = exports.appAddress  = configFile.Equipment.appAddress;
expressDir = exports.expressDir  = configFile.Misc.expressDir;
expressPort = exports.expressPort  = configFile.Misc.expressPort;
expressTransport = exports.expressTransport = configFile.Misc.expressTransport;
expressAuth = exports.expressAuth  = configFile.Misc.expressAuth;
expressAuthFile = exports.expressAuthFile  = configFile.Misc.expressAuthFile;
netConnect = exports.netConnect  = configFile.Network.netConnect;
rs485Port = exports.rs485Port  = configFile.Network.rs485Port;
netPort = exports.netPort  = configFile.Network.netPort;
netHost = exports.netHost  = configFile.Network.netHost;
friendlyNames = exports.friendlyNamesArr = configFile.FriendlyNames
logLevel = exports.logLevel = configFile.Log.logLevel;
extLogLevel = exports.extLogLevel = configFile.Log.extLogLevel;
logPumpMessages = exports.logPumpMessages  = configFile.Log.logPumpMessages;
logDuplicateMessages = exports.logDuplicateMessages  = configFile.Log.logDuplicateMessages;
logConsoleNotDecoded = exports.logConsoleNotDecoded  = configFile.Log.logConsoleNotDecoded;
logConfigMessages = exports.logConfigMessages  = configFile.Log.logConfigMessages;
logMessageDecoding = exports.logMessageDecoding  = configFile.Log.logMessageDecoding;
logChlorinator = exports.logChlorinator  = configFile.Log.logChlorinator;
logPacketWrites = exports.logPacketWrites  = configFile.Log.logPacketWrites;
logPumpTimers = exports.logPumpTimers  = configFile.Log.logPumpTimers;
logApi = exports.logApi  = configFile.Log.logApi;



var introMsg  = '\n*******************************';
introMsg += '\n Important:';
introMsg += '\n Configuration is now read from your pool.  The application will send the commands to retrieve the custom names and circuit names.';
introMsg += '\n It will dynamically load as the information is parsed.  If there is a write error 10 times, the logging will change to debug mode.';
introMsg += '\n If the message fails to be written 20 times, it will abort the packet and go to the next one.';
introMsg += '\n If you have an IntelliComII, or pumps only, set the appropriate flags in lines 21-23 of this app.';
introMsg += '\n In general, if you specify the Intellitouch controller, the app will get the status  (pumps, chlorinator, heater, etc)from the controller directly.  If you specify pumps only or IntellicomII, the app will retrieve the status information from the peripherals themselves.'
introMsg += '\n To change the amount of output to the console, change the "logx" flags in lines 45-51 of this app.';
introMsg += '\n Visit http://_your_machine_name_:3000 to see a basic UI';
introMsg += '\n Visit http://_your_machine_name_:3000/debug.html for a way to listen for specific messages\n\n';
introMsg += '*******************************\n'
exports.introMsg = introMsg

var settingsStr = '' // \n*******************************';
settingsStr += '\n Version: ' + bottle.container.appVersion;
settingsStr += '\n Config File: ' + configurationFile
settingsStr += '\n ';
settingsStr += '\n //-------  EQUIPMENT SETUP -----------';
settingsStr += '\n var intellicom = ' + intellicom;
settingsStr += '\n var intellitouch = ' + intellitouch;
settingsStr += '\n var chlorinator = ' + chlorinator;
settingsStr += '\n var pumpOnly = ' + pumpOnly;
settingsStr += '\n var numberOfPumps = ' + numberOfPumps;
settingsStr += '\n var appAddress = ' + appAddress;
settingsStr += '\n //-------  END EQUIPMENT SETUP -----------';
settingsStr += '\n ';
settingsStr += '\n //-------  MISC SETUP -----------';
settingsStr += '\n var expressDir = ' + expressDir;
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
settingsStr += '\n var extLogLevel = ' + extLogLevel;
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
exports.settingsStr = settingsStr

if (bottle.container.logModuleLoading)
  console.log('Loaded: settings.js')
