var fs = require('fs'),
    // fsio = require('promised-io/fs'),
    path = require('path').posix,
    Promise = require('bluebird')
Promise.promisifyAll(fs)

logging = 0  //variable to tell us if general logging of information is happening during tests.  This should be changed in each test; not here.

logInitAndStop = 0 //variable to tell us if we want to output start/stop/init of each module.  This should be changed here and will be enabled/disabled for all tests

changeInitAndStop = function(val){
    logInitAndStop = val
}

initAll = function() {

    return Promise.resolve()
        .then(function () {
            if (logInitAndStop) {
                enableLogging()
                bottle.container.logger.debug('###Starting Init All###')
            }
            else disableLogging()

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
        })
        .then(bottle.container.chlorinator.init) // updated... synchronous
        .delay(20) //allow for all processes to start before enable logging or moving to tests
        .catch( /* istanbul ignore next */ function (err) {
            bottle.container.logger.error('Error in global.initAll. ', err)
        })
        .finally(function () {
            bottle.container.logger.debug('###Done Init All###')
            enableLogging()
            if (logging) enableLogging()
        })

}


var spyLogger = function(sinon){

}


stopAll = function() {
    return Promise.resolve()
        .then(function(){
            if (logInitAndStop) {
                enableLogging()
                bottle.container.logger.debug('***Starting Stop All***')
            }
            else disableLogging()
        })
        .then(bottle.container.server.close)
        .then(function(){
            bottle.container.chlorinatorController.clearTimer()
            bottle.container.writePacket.init()
            bottle.container.packetBuffer.clear()
            bottle.container.queuePacket.init()
            bottle.container.sp.close()
        })

        .catch( /* istanbul ignore next */ function(err) {
            bottle.container.logger.error('Error in stopAll.', err)
        })
        .finally(function(){
            if (logInitAndStop)
                bottle.container.logger.debug('***Stop All Completed***')
            if (logging) enableLogging()
        })
}

var enableLogging = function(){
    logging = 1
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
    logging = 0
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
            if (logInitAndStop){
                bottle.container.logger.debug('useShadowConfigFile: Shadow file to be used:', location)
                enableLogging()
            }
            else disableLogging()
            return fs.readFileAsync(path.join(process.cwd(), location))
        })
        .then(function (orig) {
            return fs.writeFileAsync(path.join(process.cwd(), '/specs/assets/config/_config.json'), orig)
        })
        .then(function() {
            if (logInitAndStop)
                return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/_config.json'), 'utf-8')

                    .then(function(copy) {
                        bottle.container.logger.silly('Shadow file: just copied %s (%s bytes) to _config.json', location, copy.length)
                    })
        })
        .then(function(){
            return bottle.container.settings.load('/specs/assets/config/_config.json')
        })
        .catch( /* istanbul ignore next */ function (err) {
            bottle.container.logger.error('oops, we hit an error in useShadowConfigFile', err)
        })
        .finally(function(){


            bottle.container.logger.debug('useShadowConfigFile: Complete')
            if (logging) enableLogging()
        })
}

removeShadowConfigFile = function(){

    return Promise.resolve()
        .then(function(){
            /* istanbul ignore next */
            if (logInitAndStop) {
                enableLogging()
                bottle.container.logger.debug('***Starting removeShadowConfig***')
            }
            else disableLogging()
        })
        .then(function(){
            shadowLocation = path.join(process.cwd(), '/specs/assets/config/_config.json')
            try {

                a = fs.statSync(shadowLocation)
                return fs.unlinkAsync(shadowLocation)
                    .then(function() {
                        bottle.container.logger.silly('_config.json file removed')
                    })
                    .then(bottle.container.settings.load)
            }

            catch(err){
                throw new Error('File /specs/assets/config/_config.json does not exist.', err)
            }
        })
        .catch(function (err) {
            bottle.container.logger.error('Error removing file:', err)
        })
        .finally(function(){
            bottle.container.logger.debug('***Finished removeShadowConfig***')
            if (logging) enableLogging()
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

setupLoggerStubOrSpy = function(sandbox, normalLvL, errorLvl){


    enableLogging()
    if (normalLvL===undefined){
        if (logInitAndStop === 0){
            normalLvL = 'stub'
        }
        else normalLvL = 'spy'
    }

    if (errorLvl===undefined){
        if (logInitAndStop === 0){
            errorLvl = 'stub'
        }
        else errorLvl = 'spy'
    }
    _stub = {}
    if (normalLvL==='spy') {
        _stub.loggerInfoStub = sandbox.spy(bottle.container.logger, 'info')
        _stub.loggerVerboseStub = sandbox.spy(bottle.container.logger, 'verbose')
        _stub.loggerDebugStub = sandbox.spy(bottle.container.logger, 'debug')
        _stub.loggerSillyStub = sandbox.spy(bottle.container.logger, 'silly')
    }
    else {
        _stub.loggerInfoStub = sandbox.stub(bottle.container.logger, 'info')
        _stub.loggerVerboseStub = sandbox.stub(bottle.container.logger, 'verbose')
        _stub.loggerDebugStub = sandbox.stub(bottle.container.logger, 'debug')
        _stub.loggerSillyStub = sandbox.stub(bottle.container.logger, 'silly')
    }
    if (errorLvl==='spy') {
        _stub.loggerWarnStub = sandbox.spy(bottle.container.logger, 'warn')
        _stub.loggerErrorStub = sandbox.spy(bottle.container.logger, 'error')
    }
    else
    {
        _stub.loggerWarnStub = sandbox.stub(bottle.container.logger, 'warn')
        _stub.loggerErrorStub = sandbox.stub(bottle.container.logger, 'error')
    }
    return _stub
}