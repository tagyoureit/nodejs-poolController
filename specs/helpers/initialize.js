

initAll = function() {
    return Promise.resolve()
        .then(function(){
            disableLogging()
            //enableLogging()
            return bottle.container.server.init()
        })
        .delay(25)
        .then(function(){
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
            bottle.container.sp.init('none')
            bottle.container.io.init()
            return enableLogging()

        })
        .catch(function(err){
            console.log('Error in global.initAll. ', err)
        })



}



var spyLogger = function(){

}


stopAll = function() {
    return Promise.resolve()
        .then(function(){
            disableLogging()
            bottle.container.io.stop()
            bottle.container.server.close()
            bottle.container.sp.close()
            bottle.container.settings.set('intellitouch.installed', 1)
            bottle.container.settings.set('intellicom.installed',  0)
            return
        })

}

var enableLogging = function(){
    bottle.container.logger.transports.console.level = 'silly';
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
    bottle.container.logger.transports.console.level = 'info';
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

waitForSocketResponse = function(_which) {
    return new Promise(function (resolve, reject) {

        client = global.ioclient.connect(global.socketURL, global.socketOptions)
        client.on(_which, function (data) {
            // console.log('in promise \n %j', data)
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