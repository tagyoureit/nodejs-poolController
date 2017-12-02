

initAll = function() {

    disableLogging()
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
    bottle.container.server.init()
    bottle.container.io.init()
    bottle.container.sp.init()
    enableLogging()
}

var spyLogger = function(){

}


stopAll = function() {


    bottle.container.server.close()
    bottle.container.sp.close()
    // bottle.container.chlorinator.init()
    // bottle.container.heat.init()
    // bottle.container.time.init()
    // bottle.container.pump.init()
    // bottle.container.schedule.init()
    // bottle.container.circuit.init()
    // bottle.container.customNames.init()
    // bottle.container.intellitouch.init()
    // bottle.container.temperatures.init()
    // bottle.container.UOM.init()
    // bottle.container.valves.init()
    // bottle.container.queuePacket.init()
    // bottle.container.writePacket.init()
    disableLogging()
}

var enableLogging = function(){
    bottle.container.logger.transports.console.level = 'silly';
    bottle.container.settings.logPumpMessages=1
    bottle.container.settings.logDuplicateMessages= 1
    bottle.container.settings.logConsoleNotDecoded= 1
    bottle.container.settings.logConfigMessages= 1
    bottle.container.settings.logMessageDecoding= 1
    bottle.container.settings.logChlorinator= 1
    bottle.container.settings.logPacketWrites= 1
    bottle.container.settings.logPumpTimers= 1
    bottle.container.settings.logApi= 1
}

var disableLogging = function(){
    bottle.container.logger.transports.console.level = 'info';
    bottle.container.settings.logPumpMessages=0
    bottle.container.settings.logDuplicateMessages= 0
    bottle.container.settings.logConsoleNotDecoded= 0
    bottle.container.settings.logConfigMessages= 0
    bottle.container.settings.logMessageDecoding= 0
    bottle.container.settings.logChlorinator= 0
    bottle.container.settings.logPacketWrites= 0
    bottle.container.settings.logPumpTimers= 0
    bottle.container.settings.logApi= 0
}