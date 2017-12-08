var fs = require('fs'),
    // fsio = require('promised-io/fs'),
    path = require('path').posix,
    Promise = require('bluebird')
Promise.promisifyAll(fs)

logDebug = 0

initAll = function(configLocation) {


    return new Promise(function(resolve, reject) {
        if (logDebug) {
            console.log('###Starting Init All###')
            enableLogging()
        }
        else
            disableLogging()

        return bottle.container.server.init()
            .then(function () {
                sp = bottle.container.sp.mockSPBinding()
                bottle.container.chlorinator.init()
                bottle.container.heat.init()
                bottle.container.time.init()
                bottle.container.pump.init()
                bottle.container.schedule.init()
                bottle.container.circuit.init()
                bottle.container.customNames.init()
                bottle.container.intellitouch.init()
                bottle.container.temperatures.init()
                bottle.container.UOM.init()
                bottle.container.valves.init()
                bottle.container.queuePacket.init()
                bottle.container.writePacket.init()
                bottle.container.intellichem.init()
                bottle.container.io.init()
                return enableLogging()
            })
            .catch(function (err) {
                console.error('Error in global.initAll. ', err)
            })
            .finally(function () {
                if (logDebug) console.log('###Done Init All###')
                resolve()
            })
    })
}




var spyLogger = function(){

}


stopAll = function() {
    return new Promise(function(resolve, reject) {
        if (logDebug){
            console.log('***Starting Stop All***')
            enableLogging()
        }
        else
            disableLogging()


        return Promise.delay(1900)
            .then(bottle.container.server.close)
            .then(function () {
                bottle.container.packetBuffer.clear()
                bottle.container.writePacket.init()
                bottle.container.queuePacket.init()
                bottle.container.sp.close()

            })
            .catch(function (err) {
                console.error('Error in stopAll.', err)
            })
            .finally(function () {
                if (logDebug)
                    console.log('***Stop All Completed***')
                resolve()
            })
    })
}

var enableLogging = function(){
    bottle.container.logger.changeLevel('console', 'silly')
    bottle.container.settings.set('logPumpMessages',1)
    bottle.container.settings.set('logDuplicateMessages', 1)
    bottle.container.settings.set('logConsoleNotDecoded', 1)
    bottle.container.settings.set('logConfigMessages', 1)
    bottle.container.settings.set('logMessageDecoding', 1)
    bottle.container.settings.set('logChlorinator', 1)
    bottle.container.settings.set('logPacketWrites', 1)
    bottle.container.settings.set('logPumpTimers', 1)
    bottle.container.settings.set('logIntellichem', 1)
    bottle.container.settings.set('logReload', 1)
    bottle.container.settings.set('logApi', 1)
}

var disableLogging = function(){
    bottle.container.logger.changeLevel('console','info')
    bottle.container.settings.set('logPumpMessages',0)
    bottle.container.settings.set('logDuplicateMessages', 0)
    bottle.container.settings.set('logConsoleNotDecoded', 0)
    bottle.container.settings.set('logConfigMessages', 0)
    bottle.container.settings.set('logMessageDecoding', 0)
    bottle.container.settings.set('logChlorinator', 0)
    bottle.container.settings.set('logPacketWrites', 0)
    bottle.container.settings.set('logPumpTimers', 0)
    bottle.container.settings.set('logIntellichem', 0)
    bottle.container.settings.set('logReload', 0)
    bottle.container.settings.set('logApi', 0)
}

useShadowConfigFile = function(location) {
    return fs.readFileAsync(path.join(process.cwd(), location))
        .then(function (orig) {
            return fs.writeFileAsync(path.join(process.cwd(), '/specs/assets/config/_config.json'), orig)
        })
        .then(function() {
            if (logDebug)
            return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/_config.json'), 'utf-8')
        })
        .then(function(copy) {
            if (logDebug)
            container.logger.debug('Shadow file: just copied %s to _config.json ', location, copy.length)
        })
        .then(bottle.container.settings.load(location))
        .catch(function (err) {
            /* istanbul ignore next */
            console.log('oops, we hit an error in useShadowConfigFile', err)
        })
}

removeShadowConfigFile = function(){
    return fs.unlinkAsync(path.join(process.cwd(), '/specs/assets/config/_config.json'))
    // .then(function() {
    //     console.log('file removed')
    // })
        .then(bottle.container.settings.load)
        .catch(function (err) {
            /* istanbul ignore next */
            console.log('Error removing file:', err)
        })
}

waitForSocketResponse = function(_which) {
    return new Promise(function (resolve, reject) {
        setTimeout(function(){
            reject(new Error('timeout in waitForSocketResponse to ' + _which + ' call'))
        },1500)  //in case no response, reject the promise
        client = global.ioclient.connect(global.socketURL, global.socketOptions)
        client.on(_which, function (data) {
            client.disconnect()
            resolve(data)
        })
    })
}

requestPoolDataWithURL = function(endpoint, URL) {
    if (URL===undefined){
        URL = 'http://localhost:3000/'
    }
    var options = {
        method: 'GET',
        uri: URL + endpoint,
        resolveWithFullResponse: true,
        json: true
    };
    return rp(options)
        .then(function(response){
            return response.body
        })
}