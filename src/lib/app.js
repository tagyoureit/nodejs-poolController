


var Bottle = require('bottlejs')
var bottle = Bottle.pop('poolController-Bottle');


bottle.constant('appVersion', '3.1.1')
bottle.constant('logModuleLoading', 0)

//Multiple
bottle.factory('nanotimer', function(){
  return require('nanotimer')
})

bottle.service('fs', function() {
    return require('fs')
})

//API
bottle.constant('apiSearch', require(__dirname + '/api/api-search.js'))

//ETC
bottle.constant('settings', require(__dirname + '/../etc/settings.js'))
bottle.factory('constants', require(__dirname + '/../etc/constants.js'))

//INTEGRATIONS
bottle.factory('integrations', function() {
    return require(__dirname + '/../etc/integrations.js')
})
bottle.factory('socketClient', function() {
        return require('socket.io-client')
    })
    //bottle.constant('socketISY', require(__dirname + '/comms/outbound/socketISY.js'))
bottle.factory('ISYHelper', require(__dirname + '/comms/outbound/ISY.js'))

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
bottle.factory('server', require(__dirname + '/comms/server.js'))

bottle.factory('serialport', function() {
    return require('serialport')
})
bottle.factory('net', function() {
    return require('net')
})
bottle.factory('socket', function() {
    return require('socket.io')
})
bottle.factory('io', require(__dirname + '/comms/socketio-helper.js'))
bottle.factory('whichPacket', require(__dirname + '/comms/which-packet.js'))
bottle.factory('sp', require(__dirname + '/comms/sp-helper.js'))

//HELPERS
bottle.factory('helpers', require(__dirname + '/helpers/helpers.js'))
bottle.factory('reload', require(__dirname + '/helpers/reload.js'))
bottle.factory('bootstrapConfigEditor', require(__dirname + '/helpers/bootstrap-config-editor.js'))

//COMMS/INBOUND
bottle.service('dequeue', require('dequeue'));
bottle.factory('receiveBuffer', require(__dirname + '/comms/inbound/receive-buffer.js'))
bottle.factory('decodeHelper', require(__dirname + '/comms/inbound/decode-helper.js'))
bottle.factory('packetBuffer', require(__dirname + '/comms/inbound/packet-buffer.js'))
bottle.factory('processController', require(__dirname + '/comms/inbound/process-controller.js'))
bottle.factory('processPump', require(__dirname + '/comms/inbound/process-pump.js'))
bottle.factory('processChlorinator', require(__dirname + '/comms/inbound/process-chlorinator.js'))

//COMMS/INBOUND/CONTROLLER
bottle.factory('controller_2', require(__dirname + '/comms/inbound/controller/2.js'))
bottle.factory('controller_5', require(__dirname + '/comms/inbound/controller/5.js'))
bottle.factory('controller_8', require(__dirname + '/comms/inbound/controller/8.js'))
bottle.factory('controller_10', require(__dirname + '/comms/inbound/controller/10.js'))
bottle.factory('controller_11', require(__dirname + '/comms/inbound/controller/11.js'))
bottle.factory('controller_17', require(__dirname + '/comms/inbound/controller/17.js'))
bottle.factory('controller_25', require(__dirname + '/comms/inbound/controller/25.js'))
bottle.factory('controller_134', require(__dirname + '/comms/inbound/controller/134.js'))
bottle.factory('controller_136', require(__dirname + '/comms/inbound/controller/136.js'))
bottle.factory('controller_153', require(__dirname + '/comms/inbound/controller/153.js'))
bottle.factory('controller_217', require(__dirname + '/comms/inbound/controller/217.js'))
bottle.factory('controller_252', require(__dirname + '/comms/inbound/controller/252.js'))

//COMMS/INBOUND/COMMON
bottle.factory('common_7', require(__dirname + '/comms/inbound/common/7.js'))

//COMMS/INBOUND/PUMP
bottle.factory('pump_1', require(__dirname + '/comms/inbound/pump/1.js'))
bottle.factory('pump_2', require(__dirname + '/comms/inbound/pump/2.js'))
bottle.factory('pump_4', require(__dirname + '/comms/inbound/pump/4.js'))
bottle.factory('pump_5', require(__dirname + '/comms/inbound/pump/5.js'))
bottle.factory('pump_6', require(__dirname + '/comms/inbound/pump/6.js'))
    //bottle.factory('pump_7', require(__dirname + '/comms/inbound/pump/7.js'))

//COMMS/OUTBOUND
bottle.factory('writePacket', require(__dirname + '/comms/outbound/write-packet.js'))
bottle.factory('queuePacket', require(__dirname + '/comms/outbound/queue-packet.js'))

//CONTROLLERS
bottle.factory('pumpController', require(__dirname + '/controllers/pump-controller.js'))
bottle.factory('pumpControllerTimers', require(__dirname + '/controllers/pump-controller-timers.js'))
bottle.factory('pumpControllerMiddleware', require(__dirname + '/controllers/pump-controller-middleware.js'))
bottle.factory('chlorinatorController', require(__dirname + '/controllers/chlorinator-controller.js'))

//EQUIPMENT
bottle.factory('heat', require(__dirname + '/equipment/heat.js'))
bottle.factory('chlorinator', require(__dirname + '/equipment/chlorinator.js'))
bottle.factory('pump', require(__dirname + '/equipment/pump.js'))
bottle.factory('circuit', require(__dirname + '/equipment/circuit.js'))
    //bottle.factory('status', require(__dirname + '/equipment/status.js'))
bottle.factory('temperatures', require(__dirname + '/equipment/temperatures.js'))
bottle.factory('time', require(__dirname + '/equipment/time.js'))
bottle.factory('UOM', require(__dirname + '/equipment/UOM.js'))
bottle.factory('valves', require(__dirname + '/equipment/valves.js'))
bottle.factory('customNames', require(__dirname + '/equipment/customnames.js'))
bottle.factory('schedule', require(__dirname + '/equipment/schedule.js'))
bottle.factory('intellitouch', require(__dirname + '/equipment/intellitouch.js'))

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
bottle.factory('logger', require(__dirname + '/logger/winston-helper.js'))
bottle.service('winstonToIO', require(__dirname + '/logger/winstonToIO.js'))



var init = exports.init = function() {
    //Call the modules to initialize them

    bottle.container.settings.load()
    bottle.container.server.init()
    bottle.container.io.init()
    bottle.container.time.init()
    bottle.container.logger.info('initializing logger')
    bottle.container.winstonToIO.init()
    bottle.container.pump.init()

    bottle.container.logger.info('Intro: ', bottle.container.settings.displayIntroMsg())
    bottle.container.logger.warn('Settings: ', bottle.container.settings.displaySettingsMsg())
    bottle.container.sp.init()
    bottle.container.integrations
    if (bottle.container.settings.pumpOnly && !bottle.container.settings.intellicom && !bottle.container.settings.intellitouch) {
        bottle.container.pumpControllerTimers.startPumpController()
    }
    if (bottle.container.settings.chlorinator) {
        bottle.container.chlorinatorController.startChlorinatorController()
    }
    bottle.container.helpers

}

/* UNCOMMENT TO ALLOW V8 PROFILING */
//var profile = require(__dirname + '/helpers/profiler.js').init(__dirname + '/../profiler')
