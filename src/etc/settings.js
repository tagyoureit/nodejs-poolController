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

// var Bottle = require('bottlejs');
// var bottle = Bottle.pop('poolController-Bottle');
module.exports = function(container) {
    var _settings = {}
    var path = require('path').posix

    /* istanbul ignore next */
    if (container.logModuleLoading)
        console.log('Loading: settings.js')

    var packageJson = JSON.parse(container.fs.readFileSync(path.join(process.cwd(), '/package.json'), 'utf-8'))
    _settings.appVersion = packageJson.version


    var envParam = process.argv[2];
    var configFile;

    var get = function(param) {
        if (param === undefined)
            return _settings
        else if (param.indexOf('.') !== -1) {
            tempCopy = JSON.parse(JSON.stringify(_settings))
            var arr = param.split('.')
            while (arr.length) {
                tempCopy = tempCopy[arr.shift()]
            }
            return tempCopy
        }
        else
            return _settings[param]
    }

    var set = function(param, value){
        if (value===undefined)
            container.logger.warn('Trying to set settings parameter %s with no value.', value)
        else if (param.indexOf('.')!==-1) {
            recurseSet(_settings, param.split('.'), value)
        }
        else {
            _settings[param]=value
        }
    }

    function recurseSet(obj, arr, value){
        if (arr.length>1) {
            recurseSet(obj[arr.shift()], arr, value)
        }
        else{
            obj[arr[0]]=value
        }
    }

    var load = function (configLocation) {

        return Promise.resolve()
            .then(function(){
                if (configLocation){
                    _settings.configurationFile = configLocation;
                }
                else if (envParam) {
                    _settings.configurationFile  = envParam
                } else {
                    _settings.configurationFile = 'config.json';
                }
                container.logger.silly('Loading settings with config file: ', _settings.configurationFile) //do not have access to logger yet.  Uncomment if we need to debug this.
            })
            .then(function(){
                return container.configEditor.init(_settings.configurationFile)

            })
            .then(function (parsedData) {
                configFile = JSON.parse(JSON.stringify(parsedData))

                /*   Equipment   */
                //Controller
                _settings.equipment = configFile.equipment
                _settings.controller = configFile.equipment.controller
                _settings.intellicom = configFile.equipment.controller.intellicom;
                _settings.intellitouch = configFile.equipment.controller.intellitouch;
                _settings.virtual = configFile.equipment.controller.virtual
                _settings.virtualPumpController = configFile.equipment.controller.virtual.pumpController
                _settings.virtualChlorinatorController = configFile.equipment.controller.virtual.chlorinatorController

                _settings.circuitFriendlyNames = configFile.equipment.controller.circuitFriendlyNames

                //chlorinator
                _settings.chlorinator = configFile.equipment.chlorinator;

                //pump(s)
                _settings.pump = configFile.equipment.pump;
                /*   END Equipment   */
                _settings.appAddress = configFile.poolController.appAddress;

                //Web
                _settings.httpEnabled = configFile.poolController.http.enabled;
                _settings.httpRedirectToHttps = configFile.poolController.http.httpRedirectToHttps;
                _settings.httpExpressPort = configFile.poolController.http.expressPort;
                _settings.httpExpressAuth = configFile.poolController.http.expressAuth;
                _settings.httpExpressAuthFile = configFile.poolController.http.expressAuthFile;
                _settings.httpsEnabled = configFile.poolController.https.enabled;
                _settings.httpsExpressPort = configFile.poolController.https.expressPort;
                _settings.httpsExpressAuth = configFile.poolController.https.expressAuth;
                _settings.httpsExpressAuthFile = configFile.poolController.https.expressAuthFile;
                _settings.httpsExpressKeyFile = configFile.poolController.https.expressKeyFile;
                _settings.httpsExpressCertFile = configFile.poolController.https.expressCertFile;


                //Network
                _settings.netConnect = configFile.poolController.network.netConnect;
                _settings.rs485Port = configFile.poolController.network.rs485Port;
                _settings.netPort = configFile.poolController.network.netPort;
                _settings.netHost = configFile.poolController.network.netHost;

                if (configFile.poolController.network.hasOwnProperty('inactivityRetry')) {
                    _settings.inactivityRetry = configFile.poolController.network.inactivityRetry;
                }
                else
                    _settings.inactivityRetry = 10

                //Logs
                _settings.logLevel = configFile.poolController.log.logLevel;
                _settings.socketLogLevel = configFile.poolController.log.socketLogLevel;
                _settings.fileLog = configFile.poolController.log.fileLog;
                _settings.logPumpMessages = configFile.poolController.log.logPumpMessages;
                _settings.logDuplicateMessages = configFile.poolController.log.logDuplicateMessages;
                _settings.logConsoleNotDecoded = configFile.poolController.log.logConsoleNotDecoded;
                _settings.logConfigMessages = configFile.poolController.log.logConfigMessages;
                _settings.logMessageDecoding = configFile.poolController.log.logMessageDecoding;
                _settings.logChlorinator = configFile.poolController.log.logChlorinator;
                _settings.logIntellichem = configFile.poolController.log.logIntellichem;
                _settings.logPacketWrites = configFile.poolController.log.logPacketWrites;
                _settings.logPumpTimers = configFile.poolController.log.logPumpTimers;
                _settings.logApi = configFile.poolController.log.logApi;

                // Database
                _settings.influxEnabled = configFile.poolController.database.influx.enabled;
                _settings.influxHost = configFile.poolController.database.influx.host;
                _settings.influxPort = configFile.poolController.database.influx.port;
                _settings.influxDB = configFile.poolController.database.influx.database;

                // Integrations
                _settings.integrations = configFile.integrations;
                container.logger.silly('Finished loading settings.')
                return 'Finished Loading Settings'
            })

    }


    var displayIntroMsg = function () {
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

    var displaySettingsMsg = function () {
        var settingsStr;

        settingsStr = '' // \n*******************************';
        settingsStr += '\n Version: ' + _settings.appVersion;
        settingsStr += '\n Config File: ' + _settings.configurationFile
        settingsStr += '\n ';
        settingsStr += '\n //-------  EQUIPMENT SETUP -----------';
        settingsStr += '\n var intellicom = ' + JSON.stringify(_settings.intellicom, null, 4);
        settingsStr += '\n var intellitouch = ' + JSON.stringify(_settings.intellitouch, null, 4);
        settingsStr += '\n var virtual = ' + JSON.stringify(_settings.virtual, null, 4);
        settingsStr += '\n var controller.id = ' + JSON.stringify(_settings.controller.id, null, 4);
        settingsStr += '\n var circuitFriendlyNames = ' + JSON.stringify(_settings.circuitFriendlyNames, null, 4)
        settingsStr += '\n'
        settingsStr += '\n var chlorinator = ' + JSON.stringify(_settings.chlorinator, null, 4);
        settingsStr += '\n'
        settingsStr += '\n var pump = ' + JSON.stringify(_settings.pump, null, 4)
        settingsStr += '\n //-------  END EQUIPMENT SETUP -----------';
        settingsStr += '\n ';
        settingsStr += '\n //-------  POOLCONTROLLER SETUP -----------';
        settingsStr += '\n var appAddress = ' + _settings.appAddress;
        settingsStr += '\n //-------  WEB SETUP -----------';
        settingsStr += '\n var expressPort = ' + _settings.expressPort;
        settingsStr += '\n var expressTransport = ' + _settings.expressTransport;
        settingsStr += '\n var expressAuth = ' + _settings.expressAuth;
        settingsStr += '\n var expressAuthFile = ' + _settings.expressAuthFile;
        settingsStr += '\n //-------  END MISC SETUP -----------';
        settingsStr += '\n ';
        settingsStr += '\n //-------  NETWORK SETUP -----------';
        settingsStr += '\n // Setup for Network Connection (socat or nc)';
        settingsStr += '\n var netConnect = ' + _settings.netConnect;
        settingsStr += '\n var rs485Port = ' + _settings.rs485Port;
        settingsStr += '\n var netHost = ' + _settings.netHost;
        settingsStr += '\n var netPort = ' + _settings.netPort;
        settingsStr += '\n var timeout = ' + _settings.inactivityRetry;
        settingsStr += '\n //-------  END NETWORK SETUP -----------';
        settingsStr += '\n ';
        settingsStr += '\n //-------  LOG SETUP -----------';
        settingsStr += '\n var logLevel = ' + _settings.logLevel;
        settingsStr += '\n var socketLogLevel = ' + _settings.socketLogLevel;
        settingsStr += '\n var fileLog = ' + JSON.stringify(_settings.fileLog);
        settingsStr += '\n var logPumpMessages = ' + _settings.logPumpMessages;
        settingsStr += '\n var logDuplicateMessages = ' + _settings.logDuplicateMessages;
        settingsStr += '\n var logConsoleNotDecoded = ' + _settings.logConsoleNotDecoded;
        settingsStr += '\n var logConfigMessages = ' + _settings.logConfigMessages;
        settingsStr += '\n var logMessageDecoding = ' + _settings.logMessageDecoding;
        settingsStr += '\n var logChlorinator = ' + _settings.logChlorinator;
        settingsStr += '\n var logIntellichem = ' + _settings.logIntellichem;
        settingsStr += '\n var logPacketWrites = ' + _settings.logPacketWrites;
        settingsStr += '\n var logPumpTimers = ' + _settings.logPumpTimers;
        settingsStr += '\n var logApi = ' + _settings.logApi;
        settingsStr += '\n //-------  END LOG SETUP -----------\n\n';
        settingsStr += '\n ';
        settingsStr += '\n //-------  DATABASE SETUP -----------';
        settingsStr += '\n var influxEnabled = ' + _settings.influxEnabled;
        settingsStr += '\n var influxHost = ' + _settings.influxHost;
        settingsStr += '\n var influxPort = ' + _settings.influxPort;
        settingsStr += '\n var influxDB = ' + _settings.influxDB;
        settingsStr += '\n //-------  END DATABASE SETUP -----------\n\n';
        //settingsStr += '\n*******************************';
        return settingsStr
    }

    var getConfig = function(){
        return configFile
    }

    /* istanbul ignore next */
    if (container.logModuleLoading)
        console.log('Loaded: settings.js')

    return {
        load: load,
        get: get,
        set: set,
        displayIntroMsg: displayIntroMsg,
        displaySettingsMsg: displaySettingsMsg,
        getConfig: getConfig

    }
}
