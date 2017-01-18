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

(function() {
    'use strict';
    // this function is strict...
}());
console.log('\033[2J'); //clear the console



var Bottle = require('bottlejs')
var bottle = Bottle.pop('pentair-Bottle');


bottle.constant('appVersion', '3.0.0')
bottle.constant('logModuleLoading', 0)

//Multiple
bottle.service('nanoTimer', require('nanotimer'))
bottle.service('fs', function() {
    return require('fs')
})

//API
bottle.constant('apiSearch', require('./lib/api/api-search.js'))

//ETC
bottle.constant('settings', require('./etc/settings.js'))
bottle.factory('constants', require('./etc/constants.js'))
bottle.factory('autoUpdater', function() {
        return require('auto-updater')
    }) //for log formatting
bottle.factory('autoUpdaterHelper', require('./etc/autoUpdater-helper.js'))
//INTEGRATIONS
bottle.factory('integrations', function() {
    return require('./etc/integrations.js')
})
bottle.factory('socketClient', function() {
        return require('socket.io-client')
    })
    //bottle.constant('socketISY', require('./lib/comms/outbound/socketISY.js'))
bottle.factory('ISYHelper', require('./lib/comms/outbound/ISY.js'))

//COMMS
bottle.factory('express', function() {
    return require('express')
})
bottle.factory('http', function() {
    return require('http')
})
bottle.factory('https', function() {
    return require('https')
})
bottle.factory('auth', function() {
    return require('http-auth')
})
bottle.factory('server', require('./lib/comms/server.js'))

bottle.factory('serialport', function() {
    return require('serialport')
})
bottle.factory('net', function() {
    return require('net')
})
bottle.factory('socket', function() {
    return require('socket.io')
})
bottle.factory('io', require('./lib/comms/socketio-helper.js'))
bottle.factory('whichPacket', require('./lib/comms/which-packet.js'))
bottle.factory('sp', require('./lib/comms/sp-helper.js'))

//HELPERS
bottle.factory('helpers', require('./lib/helpers/helpers.js'))

//COMMS/INBOUND
bottle.service('dequeue', require('dequeue'));
bottle.factory('receiveBuffer', require('./lib/comms/inbound/receive-buffer.js'))
bottle.factory('decodeHelper', require('./lib/comms/inbound/decode-helper.js'))
bottle.factory('packetBuffer', require('./lib/comms/inbound/packet-buffer.js'))
bottle.factory('processController', require('./lib/comms/inbound/process-controller.js'))
bottle.factory('processPump', require('./lib/comms/inbound/process-pump.js'))
bottle.factory('processChlorinator', require('./lib/comms/inbound/process-chlorinator.js'))

//COMMS/INBOUND/CONTROLLER
bottle.factory('controller_2', require('./lib/comms/inbound/controller/2.js'))
bottle.factory('controller_8', require('./lib/comms/inbound/controller/8.js'))
bottle.factory('controller_10', require('./lib/comms/inbound/controller/10.js'))
bottle.factory('controller_11', require('./lib/comms/inbound/controller/11.js'))
bottle.factory('controller_17', require('./lib/comms/inbound/controller/17.js'))
bottle.factory('controller_25', require('./lib/comms/inbound/controller/25.js'))
bottle.factory('controller_134', require('./lib/comms/inbound/controller/134.js'))
bottle.factory('controller_136', require('./lib/comms/inbound/controller/136.js'))
bottle.factory('controller_153', require('./lib/comms/inbound/controller/153.js'))
bottle.factory('controller_217', require('./lib/comms/inbound/controller/217.js'))
bottle.factory('controller_252', require('./lib/comms/inbound/controller/252.js'))

//COMMS/INBOUND/COMMON
bottle.factory('common_7', require('./lib/comms/inbound/common/7.js'))

//COMMS/INBOUND/PUMP
bottle.factory('pump_1', require('./lib/comms/inbound/pump/1.js'))
bottle.factory('pump_2', require('./lib/comms/inbound/pump/2.js'))
bottle.factory('pump_4', require('./lib/comms/inbound/pump/4.js'))
bottle.factory('pump_5', require('./lib/comms/inbound/pump/5.js'))
bottle.factory('pump_6', require('./lib/comms/inbound/pump/6.js'))
    //bottle.factory('pump_7', require('./lib/comms/inbound/pump/7.js'))

//COMMS/OUTBOUND
bottle.factory('writePacket', require('./lib/comms/outbound/write-packet.js'))
bottle.factory('queuePacket', require('./lib/comms/outbound/queue-packet.js'))

//CONTROLLERS
bottle.factory('pumpController', require('./lib/controllers/pump-controller.js'))
bottle.factory('chlorinatorController', require('./lib/controllers/chlorinator-controller.js'))

//EQUIPMENT
bottle.factory('heat', require('./lib/equipment/heat.js'))
bottle.factory('chlorinator', require('./lib/equipment/chlorinator.js'))
bottle.factory('pump', require('./lib/equipment/pump.js'))
bottle.factory('circuit', require('./lib/equipment/circuit.js'))
    //bottle.factory('status', require('./lib/equipment/status.js'))
bottle.factory('temperatures', require('./lib/equipment/temperatures.js'))
bottle.factory('time', require('./lib/equipment/time.js'))
bottle.factory('UOM', require('./lib/equipment/UOM.js'))
bottle.factory('valves', require('./lib/equipment/valves.js'))
bottle.factory('customNames', require('./lib/equipment/customnames.js'))
bottle.factory('schedule', require('./lib/equipment/schedule.js'))
bottle.factory('intellitouch', require('./lib/equipment/intellitouch.js'))

//LOGGER
bottle.factory('dateFormat', function() {
        return require('dateformat')
    }) //for log formatting
bottle.factory('util', function() {
    return require('util')
})
bottle.factory('winston', function() {
    return require('winston')
})
bottle.factory('logger', require('./lib/logger/winston-helper.js'))
bottle.service('winstonToIO', require('./lib/logger/winstonToIO.js'))



function init() {
    //Call the modules to initialize them
    bottle.container.autoUpdaterHelper.init()
    bottle.container.io.io
    bottle.container.logger.info('initializing logger')
    bottle.container.winstonToIO.init()
    bottle.container.logger.info('Intro: ', bottle.container.settings.introMsg)
    bottle.container.logger.warn('Settings: ', bottle.container.settings.settingsStr)
    bottle.container.server.app
    bottle.container.sp.init()
    bottle.container.integrations
    if (bottle.container.settings.pumpOnly && !bottle.container.settings.intellicom && !bottle.container.settings.intellitouch) {
        bottle.container.pumpController.startPumpController()
    }
    if (bottle.container.settings.chlorinator) {
        bottle.container.chlorinatorController.startChlorinatorController()
    }
    bottle.container.helpers
        /*setTimeout(function() {
        console.log(bottle.list())
    }, 1000)
   setTimeout(function() {
        console.log("alexa skills: ", bottle.container.alexaskills.init())
    }, 1500)
    */

}

init()
