var fs = require('fs'),
    // fsio = require('promised-io/fs'),
    path = require('path').posix,
    Promise = require('bluebird')
Promise.promisifyAll(fs)

logDebug = 1

initAll = function(configLocation) {


    return Promise.resolve()
        .then(function () {
            if (logDebug) {
                bottle.container.logger.debug('###Starting Init All###')
                enableLogging()
            }
            else
                disableLogging()
        })
        .then(bottle.container.server.init)  // async
        .then(function () {
            sp = bottle.container.sp.mockSPBinding() // synchronous

            bottle.container.heat.init() // synchronous
            bottle.container.time.init() // synchronous
            bottle.container.pump.init() // synchronous
            bottle.container.schedule.init() // synchronous
            bottle.container.circuit.init() // synchronous
            bottle.container.customNames.init() // synchronous
            bottle.container.intellitouch.init() // synchronous
            bottle.container.temperatures.init() // synchronous
            bottle.container.UOM.init() // synchronous
            bottle.container.valves.init() // synchronous
            bottle.container.queuePacket.init() // synchronous
            bottle.container.writePacket.init() // synchronous
            bottle.container.intellitouch.init() // synchronous
            bottle.container.intellichem.init() // synchronous
            bottle.container.io.init() // synchronous
            enableLogging()
        })
        .then(bottle.container.chlorinator.init) // updated... synchronous
        .catch(function (err) {
            bottle.container.logger.error('Error in global.initAll. ', err)
        })
        .finally(function () {
            if (logDebug) bottle.container.logger.debug('###Done Init All###')
        })

}


var spyLogger = function(){

}


stopAll = function() {
return Promise.resolve()
    .then(function(){
        if (logDebug) {
            bottle.container.logger.debug('***Starting Stop All***')
            enableLogging()
        }
        else
            disableLogging()
    })
    .then(bottle.container.server.close)
    .then(function(){
        bottle.container.chlorinatorController.clearTimer()
        bottle.container.writePacket.init()
        bottle.container.packetBuffer.clear()
        bottle.container.queuePacket.init()
        bottle.container.sp.close()
    })
    .catch(function(err) {
        bottle.container.logger.error('Error in stopAll.', err)
    })
    .finally(function(){
        if (logDebug)
            bottle.container.logger.debug('***Stop All Completed***')
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
    //use console.log in here because logger may not be initialiazed first run
    return Promise.resolve()
        .then(function(){
            bottle.container.logger.debug('useShadowConfigFile: Shadow file to be used:', location)
            return fs.readFileAsync(path.join(process.cwd(), location))
        })
        .then(function (orig) {
            return fs.writeFileAsync(path.join(process.cwd(), '/specs/assets/config/_config.json'), orig)
        })
        .then(function() {
             if (logDebug)
                return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/_config.json'), 'utf-8')

                    .then(function(copy) {
                        bottle.container.logger.silly('Shadow file: just copied %s to _config.json ', location, copy.length)
                    })
        })
        .then(function(){

            return bottle.container.settings.load('/specs/assets/config/_config.json')

        })
        .catch(function (err) {
            /* istanbul ignore next */
            bottle.container.logger.error('oops, we hit an error in useShadowConfigFile', err)
        })
        .finally(function(){
            if (logDebug) {
                bottle.container.logger.debug('useShadowConfigFile: Complete')
                enableLogging()
            }
            else
                disableLogging()

        })
}

removeShadowConfigFile = function(){

    return Promise.resolve()
        .then(function(){
            if (logDebug) {
                bottle.container.logger.debug('***Starting removeShadowConfig***')
                enableLogging()
            }
            else
                disableLogging()
        })
        .then(function(){
            shadowLocation = path.join(process.cwd(), '/specs/assets/config/_config.json')
            try {

                a = fs.statSync(shadowLocation)
                bottle.container.logger.silly('file stats', a)
                return fs.unlinkAsync(shadowLocation)
                    .then(function() {
                        if (logDebug)
                            bottle.container.logger.silly('_config.json file removed')
                    })
                    .then(bottle.container.settings.load)
            }
            catch(err){
                bottle.container.logger.error('File /specs/assets/config/_config.json does not exist.', err)
                return false
            }
        })
        // .then(function(bool){
        //     console.log('file /specs/assets/config/_config.json exists?? ', bool)
        //     if (bool){
        //
        //     }
        // })

        .catch(function (err) {
            /* istanbul ignore next */
            bottle.container.logger.error('Error removing file:', err)
        })
        .finally(function(){
            bottle.container.logger.debug('***Finished removeShadowConfig***')
        })
}

waitForSocketResponse = function(_which) {
    var myResolve, myReject
    setTimeout(function(){
        myReject(new Error('timeout in waitForSocketResponse to ' + _which + ' call'))
    },1500)  //in case no response, reject the promise
    client = global.ioclient.connect(global.socketURL, global.socketOptions)
    client.on(_which, function (data) {
        client.disconnect()
        myResolve(data)
    })
    return new Promise(function (resolve, reject) {
        myResolve = resolve
        myReject = reject
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