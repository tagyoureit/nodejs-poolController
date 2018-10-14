var Bottle = require('bottlejs')
var bottle = Bottle.pop('poolController-Bottle');


bottle.constant('logModuleLoading', 0)

//Multiple
// bottle.factory('promisedIoPromise', function() {
//     return require("promised-io/promise");
// })

bottle.service('promise', function () {
    return require('bluebird')
})

bottle.service('fs', function () {
    return require('fs')
})

//ETC
bottle.factory('updateAvailable', require(__dirname + '/helpers/update-available.js'))
bottle.factory('settings', require(__dirname + '/../etc/settings.js'))
bottle.factory('constants', require(__dirname + '/../etc/constants.js'))
bottle.factory('deepdiff', function () {
    return require('deep-diff')
})
bottle.factory('events', function () {
    return require('events')
})


//LOGGER
bottle.factory('dateFormat', function () {
    return require('dateformat')
}) //for log formatting
bottle.factory('util', function () {
    return require('util')
})
bottle.factory('winston', function () {
    return require('winston')
})
bottle.factory('logger', require(__dirname + '/logger/winston-helper.js'))
bottle.service('winstonToIO', require(__dirname + '/logger/winstonToIO.js'))

//API
bottle.constant('apiSearch', require(__dirname + '/api/api-search.js'))


//INTEGRATIONS
bottle.factory('integrations', function () {
    return require(__dirname + '/../etc/integrations.js')
})
bottle.factory('socketClient', function () {
    return require('socket.io-client')
})
//bottle.constant('socketISY', require(__dirname + '/comms/outbound/socketISY.js'))
bottle.factory('ISYHelper', require(__dirname + '/comms/outbound/ISY.js'))

//COMMS
bottle.factory('express', function () {
    return require('express')
})
bottle.factory('http', function () {
    return require('http')
})
bottle.factory('https', function () {
    return require('https')
})
bottle.factory('auth', function () {
    return require('http-auth')
})

// COMMS
bottle.factory('influx', require(__dirname + '/comms/influx-connector.js'))
bottle.factory('server', require(__dirname + '/comms/server.js'))
bottle.factory('serialport', function () {
    return require('serialport')
})
bottle.factory('whichPacket', require(__dirname + '/comms/which-packet.js'))
bottle.factory('sp', require(__dirname + '/comms/sp-helper.js'))
bottle.factory('net', function () {
    return require('net')
})
bottle.factory('socket', function () {
    return require('socket.io')
})

bottle.factory('_', function () {
    return require('underscore')
})

bottle.factory('ssdp', function () {
    return require('node-ssdp')
})
bottle.factory('mdns', function () {
    return require('multicast-dns')
})
bottle.factory('io', require(__dirname + '/comms/socketio-helper.js'))

//HELPERS
bottle.factory('helpers', require(__dirname + '/helpers/helpers.js'))
bottle.factory('reload', require(__dirname + '/helpers/reload.js'))
bottle.factory('bootstrapsettings', require(__dirname + '/helpers/bootstrap-config-editor.js'))
bottle.service('getmac', function () {
    return bottle.container.promise.promisifyAll(require('getmac'))
})

bottle.factory('path', function () {
    return require('path').posix
})
bottle.service('ip', function () {
    return require('ip')
})


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
bottle.factory('controller_18', require(__dirname + '/comms/inbound/controller/18.js'))
bottle.factory('controller_25', require(__dirname + '/comms/inbound/controller/25.js'))
bottle.factory('controller_27', require(__dirname + '/comms/inbound/controller/27.js'))
bottle.factory('controller_29', require(__dirname + '/comms/inbound/controller/29.js'))
bottle.factory('controller_30', require(__dirname + '/comms/inbound/controller/30.js'))
bottle.factory('controller_32_33', require(__dirname + '/comms/inbound/controller/32_33.js'))
bottle.factory('controller_34', require(__dirname + '/comms/inbound/controller/34.js'))
bottle.factory('controller_35', require(__dirname + '/comms/inbound/controller/35.js'))
bottle.factory('controller_40', require(__dirname + '/comms/inbound/controller/40.js'))
bottle.factory('controller_39', require(__dirname + '/comms/inbound/controller/39.js'))
bottle.factory('controller_96', require(__dirname + '/comms/inbound/controller/96.js'))
bottle.factory('controller_134', require(__dirname + '/comms/inbound/controller/134.js'))
bottle.factory('controller_136', require(__dirname + '/comms/inbound/controller/136.js'))
bottle.factory('controller_150', require(__dirname + '/comms/inbound/controller/150.js'))
bottle.factory('controller_153', require(__dirname + '/comms/inbound/controller/153.js'))
bottle.factory('controller_get', require(__dirname + '/comms/inbound/controller/get.js'))
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
bottle.factory('valve', require(__dirname + '/equipment/valve.js'))
bottle.factory('customNames', require(__dirname + '/equipment/customnames.js'))
bottle.factory('schedule', require(__dirname + '/equipment/schedule.js'))
bottle.factory('intellitouch', require(__dirname + '/equipment/intellitouch.js'))
bottle.factory('intellichem', require(__dirname + '/equipment/intellichem.js'))

/* istanbul ignore next */
var initAsync = exports.initAsync = function () {
    //Call the modules to initialize them
    Promise = bottle.container.promise
    return Promise.resolve()
        .then(function () {
            bottle.container.logger.init('default')
        })
        .then(function () {
            return bottle.container.settings.loadAsync()
        })
        .delay(25)
        .then(function () {
            bottle.container.logger.init()
            bottle.container.winstonToIO.init()
        })
        .delay(25)


        .then(function () {


            bottle.container.server.initAsync()
            bottle.container.sp.init()
            bottle.container.packetBuffer.init()
            bottle.container.receiveBuffer.init()
            bottle.container.logger.info('initializing logger')
            bottle.container.bootstrapsettings.init()
            bottle.container.integrations.init()

            bottle.container.updateAvailable.initAsync()


            // initialize variables to hold status
            bottle.container.pump.init()
            bottle.container.chlorinator.init()
            bottle.container.heat.init()
            bottle.container.time.init()
            bottle.container.schedule.init()
            bottle.container.customNames.init()
            bottle.container.circuit.init()
            bottle.container.intellitouch.init()
            bottle.container.temperatures.init()
            bottle.container.UOM.init()
            bottle.container.valve.init()
            bottle.container.intellichem.init()

            // bottle.container.logger.info('Intro: ', bottle.container.settings.displayIntroMsg())
            // bottle.container.logger.info('Settings: ', bottle.container.settings.displaySettingsMsg())
            bottle.container.settings.displaySettingsMsg()
            //logic if we start the virtual pump/chlorinator controller is in the function
            bottle.container.pumpControllerTimers.startPumpController()
            bottle.container.chlorinatorController.startChlorinatorController()

            bottle.container.helpers

        })
        .catch(function (err) {
            bottle.container.logger.error('Error with initialization:', err)
            console.error(err)
        })


}

/* UNCOMMENT TO ALLOW V8 PROFILING */
//var profile = require(__dirname + '/helpers/profiler.js').init(__dirname + '/../profiler')


// Exit process cleanly.  From http://stackoverflow.com/questions/10021373/what-is-the-windows-equivalent-of-process-onsigint-in-node-js
/* istanbul ignore next */
process.on('exit', function () {
    //handle your on exit code
    console.log("nodejs-poolController has closed successfully.");
});

/* istanbul ignore next */
if (process.platform === "win32") {
    var rl = require("readline").createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.on("SIGINT", function () {
        process.emit("SIGINT");
    });
}

/* istanbul ignore next */
process.on('SIGINT', function () {
    console.log('Shutting down open processes')
    return bottle.container.reload.stopAsync()
        .then(function () {
            process.exit();
        })

});

/* istanbul ignore next */
global.exit_nodejs_poolController = function () {
    process.exit()
}
