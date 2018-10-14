var fs = require('fs'),
    path = require('path').posix,
    Promise = require('bluebird'),
    snapshotLogging = 0  // temp variable to hold logging state
    Promise.promisifyAll(fs)

logging = 0;  //variable to tell us if general logging of information is happening during tests.  This should be changed in each test; not here.
logInitAndStop = 0; //variable to tell us if we want to output start/stop/init of each module.  This should be changed here and will be enabled/disabled for all tests



initAllAsync = function(opts = {}) {

    return Promise.resolve()
        .then(function () {
            snapshotLogging = logging
            if (logInitAndStop) {
                enableLogging()
                bottle.container.logger.debug('###Starting Init All###')
            }
            else {

                loggers = setupLoggerStubOrSpy('stub', 'spy')
            }
            if (opts.configLocation===undefined){
                opts.configLocation = path.join('/specs/assets/config/templates/config_vanilla.json')
            }
            return useShadowConfigFileAsync(opts)
        })
        .then(bottle.container.server.initAsync)
        .then(bottle.container.sp.mockSPBindingAsync)
        .then(function (_sp) {
            sp = _sp
            bottle.container.packetBuffer.init()
            bottle.container.receiveBuffer.init()
            bottle.container.heat.init() // synchronous
            bottle.container.time.init() // synchronous
            bottle.container.pump.init() // synchronous
            bottle.container.schedule.init() // synchronous
            bottle.container.customNames.init() // synchronous
            bottle.container.circuit.init() // synchronous
            bottle.container.customNames.init() // synchronous
            bottle.container.intellitouch.init() // synchronous
            bottle.container.temperatures.init() // synchronous
            bottle.container.UOM.init() // synchronous
            bottle.container.valve.init() // synchronous
            bottle.container.queuePacket.init() // synchronous
            bottle.container.writePacket.init() // synchronous
            bottle.container.intellitouch.init() // synchronous
            bottle.container.intellichem.init() // synchronous
        })
        .then(bottle.container.chlorinator.init) // updated... synchronous
        .delay(20) //allow for all processes to start before enable logging or moving to tests
        .catch( /* istanbul ignore next */ function (err) {



            bottle.container.logger.error('Error in global.initAllAsync. ', err)
            //console.error(err)
            throw new Error(err)
        })
        .finally(function () {
            // console.log('###Done Init All###')
            // enableLogging()
            // if (logging) enableLogging()
            if (logInitAndStop) {
                bottle.container.logger.debug('###Done Init All###')
                disableLogging()
            }
            else
                sinon.restore()
            if (snapshotLogging) enableLogging()
            else disableLogging()
        })

}

stopAllAsync = function() {
    return Promise.resolve()
        .then(function(){
            if (logInitAndStop) {
                snapshotLogging = logging
                enableLogging()
                bottle.container.logger.debug('***Starting Stop All***')
            }
            else {
                loggers = setupLoggerStubOrSpy('stub', 'spy')
            }
        })
        .then(bottle.container.server.closeAllAsync)
        .then(function(){
            bottle.container.writePacket.init()
            bottle.container.queuePacket.init()
            bottle.container.packetBuffer.clear()
            bottle.container.chlorinatorController.clearTimer()
            bottle.container.pumpControllerTimers.clearTimer(1)
            bottle.container.pumpControllerTimers.clearTimer(2)
            bottle.container.sp.close()
        })
        .then(removeShadowConfigFileAsync)

        .catch( /* istanbul ignore next */ function(err) {
            bottle.container.logger.error('Error in stopAllAsync.', err)
            console.log(err)
        })
        .finally(function(){
            // console.log('***Stop All Completed***')
            if (logInitAndStop) {
                bottle.container.logger.debug('***Stop All Completed***')
                disableLogging()
            }
            else
                sinon.restore()
            if (snapshotLogging) enableLogging()
            else disableLogging()
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

useShadowConfigFileAsync = function(opts) {
    return Promise.resolve('from use shadow config')
        .then(function(){
            // if (logInitAndStop){
            //     snapshotLogging = logging
            //     bottle.container.logger.debug('useShadowConfigFileAsync: Shadow file to be used:', configLocation)
            //     enableLogging()
            // }
            // else {
            //     loggers = setupLoggerStubOrSpy('stub', 'spy')
            // }
            return fs.readFileAsync(path.join(process.cwd(), opts.configLocation))
        })
        .then(function (orig) {
            return fs.writeFileSync(path.join(process.cwd(), '/specs/assets/config/config.json'), orig)
        })
        .then(function() {
            if (logInitAndStop)
                return fs.readFileAsync(path.join(process.cwd(), '/specs/assets/config/config.json'), 'utf-8')
                    .then(function(copy) {
                        bottle.container.logger.silly('useShadowConfigFileAsync: Shadow file just copied %s (%s bytes) to config.json', opts.configLocation, copy.length)
                    })
        })
        .then(function(){
            if (opts.sysDefaultLocation===undefined){
                opts.sysDefaultLocation=path.join(process.cwd(), '/sysDefault.json')
            }

            return bottle.container.settings.loadAsync({'configLocation':  path.join(process.cwd(), '/specs/assets/config/config.json'), 'sysDefaultLocation': (opts.sysDefaultLocation || false), 'capturePackets': (opts.capturePackets || false), 'suppressWrite': (opts.suppressWrite || false)})
        })
        .catch( /* istanbul ignore next */ function (err) {

            bottle.container.logger.error('oops, we hit an error in useShadowConfigFileAsync', err)
            //console.error(err)
            throw new Error(err)
        })
        .finally(function(){
            // if (logInitAndStop) {
            //     bottle.container.logger.debug('useShadowConfigFileAsync: Complete')
            //     disableLogging()
            // }
            // else {
            //     sinon.restore()
            // }
            // if (snapshotLogging) enableLogging()
            // else disableLogging()
        })
}

removeShadowConfigFileAsync = function(){

    return Promise.resolve()
        .then(function(){
            // if (logInitAndStop) {
            //     snapshotLogging = logging
            //     enableLogging()
            //     bottle.container.logger.debug('***Starting removeShadowConfig***')
            // }
            // else {
            //     loggers = setupLoggerStubOrSpy('stub', 'spy')
            // }
        })
        .then(function(){
            shadowLocation = path.join(process.cwd(), '/specs/assets/config/config.json')
            try {

                a = fs.statSync(shadowLocation)
                return fs.unlinkAsync(shadowLocation)
                    .then(function() {
                        bottle.container.logger.silly('config.json file removed')
                    })
                    // .then(bottle.container.settings.loadAsync)
            }

            catch(err){
                console.error(err)
                throw new Error('File /specs/assets/config/config.json does not exist.', err)

            }
        })
        .delay(25)
        .catch(function (err) {
            bottle.container.logger.error('Error removing file:', err)
            console.error(err)
        })
        .finally(function(){
            // if (logInitAndStop) {
            //     bottle.container.logger.debug('***Finished removeShadowConfig***')
            //     disableLogging()
            // }
            // else {
            //     sinon.restore()
            // }
            // if (snapshotLogging) enableLogging()
            // else disableLogging()
        })
}

waitForSocketResponseAsync = function(_which) {
    var myResolve, myReject
    setTimeout(function(){
        myReject(new Error('timeout in waitForSocketResponseAsync to ' + _which + ' call'))
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

requestPoolDataWithURLAsync = function(endpoint, URL) {
    if (URL===undefined){
        URL = 'http://localhost:' + bottle.container.settings.get('httpExpressPort') + '/'
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
        .catch(function(err){
            bottle.container.logger.error('Error with requestPoolDataWithURLAsync.', err.toString())
            //console.error('Error in requestPoolDataWithURLAsync - settings:', bottle.container.settings.get())
            throw new Error(err)
        })
}

setupLoggerStubOrSpy = function(normalLvL, errorLvl){
    sinon.restore()
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
        _stub.loggerInfoStub = sinon.spy(bottle.container.logger, 'info')
        _stub.loggerVerboseStub = sinon.spy(bottle.container.logger, 'verbose')
        _stub.loggerDebugStub = sinon.spy(bottle.container.logger, 'debug')
        _stub.loggerSillyStub = sinon.spy(bottle.container.logger, 'silly')
    }
    else {
        _stub.loggerInfoStub = sinon.stub(bottle.container.logger, 'info')
        _stub.loggerVerboseStub = sinon.stub(bottle.container.logger, 'verbose')
        _stub.loggerDebugStub = sinon.stub(bottle.container.logger, 'debug')
        _stub.loggerSillyStub = sinon.stub(bottle.container.logger, 'silly')
    }
    if (errorLvl==='spy') {
        _stub.loggerWarnStub = sinon.spy(bottle.container.logger, 'warn')
        _stub.loggerErrorStub = sinon.spy(bottle.container.logger, 'error')
    }
    else
    {
        _stub.loggerWarnStub = sinon.stub(bottle.container.logger, 'warn')
        _stub.loggerErrorStub = sinon.stub(bottle.container.logger, 'error')
    }
    return _stub
}
