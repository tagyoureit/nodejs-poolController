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

module.exports = function(container) {


    //var Server = require('./server.js'),
    //var io = require('socket.io')(container.server.server);
    var io = container.socket(container.server.server)


    var logger = container.logger

    if (container.logModuleLoading)
        logger.info('Loading: socketio-helper.js')



    io.on('connection', function(socket, error) {

        socket.on('error', function() {
            logger.error('Error with socket: ', error)
        })


        // when the client emits 'toggleEquipment', this listens and executes
        socket.on('toggleCircuit', function(equipment) {

            container.circuit.toggleCircuit(equipment)


        });
        socket.on('search', function(mode, src, dest, action) {
            //check if we don't have all valid values, and then emit a message to correct.

            logger.debug('from socket.on search: mode: %s  src %s  dest %s  action %s', mode, src, dest, action);
            searchMode = mode;
            searchSrc = src;
            searchDest = dest;
            searchAction = action;
        })

        socket.on('all', function() {
            emitToClients('all')
        })

        socket.on('sendpacket', function(incomingPacket) {


            logger.info('User request (send_request.html) to send packet: %s', incomingPacket);
            var packet;
            packet = incomingPacket.split(',');
            for (i = 0; i < packet.length; i++) {
                packet[i] = parseInt(packet[i])
            }
            if (packet[0] == 16 && packet[1] == c.ctrl.CHLORINATOR) {
                //logger.debug('packet (chlorinator) now: ', packet)
            } else {
                if (packet[0] == 96 || packet[0] == 97 || packet[1] == 96 || packet[1] == 97)
                //If a message to the controller, use the preamble that we have recorded
                {
                    var preamblePacket = [165, container.intellitouch.getPreambleByte()]; //255,0,255 will be added later
                } else
                //if a message to the pumps, use 165,0
                {
                    preamble = [165, 0]
                }
                Array.prototype.push.apply(preamblePacket, packet);
                packet = preamblePacket.slice(0);
                //logger.debug('packet (pool) now: ', packet)
            }
            container.queuePacket.queuePacket(packet);
            var str = 'Sent packet: ' + JSON.stringify(packet)
            io.sockets.emit('sendPacketResults', str)
        })


        socket.on('setchlorinator', function(desiredChlorinatorOutput) {
            container.chlorinator.setChlorinatorLevel(parseInt(desiredChlorinatorOutput))
        })

        socket.on('spasetpoint', function(spasetpoint) {
            container.heat.changeHeatSetPoint('spa', spasetpoint, ' socket.io spasetpoint')
        })

        socket.on('spaheatmode', function(spaheatmode) {
            container.heat.changeHeatMode('spa', spaheatmode, 'socket.io spaheatmode')

        })

        socket.on('poolsetpoint', function(poolsetpoint) {
            container.heat.changeHeatSetPoint('pool', change, 'socket.io poolsetpoint')
        })

        socket.on('poolheatmode', function(poolheatmode) {
            container.heat.changeHeatMode('pool', poolheatmode, 'socket.io poolheatmode')
        })

        socket.on('setHeatSetPoint', function(equip, change) {
            if (equip != null && change != null) {
                container.heat.changeHeatSetPoint(equip, change, 'socket.io setHeatSetPoint')
            } else {
                logger.warn('setHeatPoint called with invalid values: %s %s', equip, change)
            }
        })

        socket.on('setHeatMode', function(equip, change) {
            if (equip == "pool") {
                container.heat.changeHeatMode('pool', change, 'socket.io setHeatMode ' + equip + ' ' + change)

            } else {
                container.heat.changeHeatMode('spa', change, 'socket.io setHeatMode ' + equip + ' ' + change)
            }
        })


        socket.on('pumpCommand', function(equip, program, value, duration) {

            logger.silly('Socket.IO pumpCommand variables - equip %s, program %s, value %s, duration %s', equip, program, value, duration)
            container.pumpControllerMiddleware.pumpCommand(equip, program, value, duration)
        })


        emitToClients('all')
    });




    function emitToClients(outputType) {
        //logger.warn('EMIT: %s', outputType)

        //This code move to the INTEGRATIONS folder
        /*if (container.settings.ISYController) {
            container.ISYHelper.emit(outputType)
        }*/

        if (outputType === 'one' || outputType === 'all') {
            var one = container.helpers.allEquipmentInOneJSON()
            io.sockets.emit('one',
                one
            )
        }

        if (outputType === 'circuit' || outputType === 'all') {
            var currCir = container.circuit.getCurrentCircuits()
            io.sockets.emit('circuit', currCir)
        }

        /*if (outputType === 'config' || outputType === 'all') {
            var currStatus = container.status.getCurrentStatus()
            io.sockets.emit('config',
                currStatus
            )
        }*/

        if (outputType === 'time' || outputType === 'all') {
            var time = container.time.getTime()
            if (time.controllerTime !== -1) {
                io.sockets.emit('time',
                    time
                )
            }
        }

        if (outputType === 'temp' || outputType === 'all') {
            var temp = container.temperatures.getTemperatures()
            io.sockets.emit('temp',
                temp
            )
        }

        if (outputType === 'pump' || outputType === 'all') {
            var pumpStatus = container.pump.getCurrentPumpStatus()
            io.sockets.emit('pump',
                pumpStatus
            )
        }

        if (outputType === 'heat' || outputType === 'all') {
            var heat = container.heat.getCurrentHeat()
            io.sockets.emit('heat',
                heat
            )

        }

        if (outputType === 'schedule' || outputType === 'all') {
            var sched = container.schedule.getCurrentSchedule()
            if (container.schedule.numberOfSchedulesRegistered() > 3) {
                io.sockets.emit('schedule',
                    sched)
            }
        }

        if (outputType === 'chlorinator' || outputType === 'all') {
            var chlor = container.chlorinator.getChlorinatorStatus()
            if (container.chlorinator.getSaltPPM() !== 'undefined')
                io.sockets.emit('chlorinator', chlor)
        }

        if (outputType === 'search' || outputType === 'all') {
            io.sockets.emit('searchResults',
                'Input values and click start.  All values optional.  Please refer to https://github.com/tagyoureit/nodejs-poolController/wiki/Broadcast for values.');
        }
    }

    function emitDebugLog(msg) {
        //console.log('EMITTING DEBUG LOG: %s', msg)
        io.sockets.emit('outputLog', msg)
    }

    if (container.logModuleLoading)
        logger.info('Loaded: socketio-helper.js')

    return {
        io,
        emitToClients: emitToClients,
        emitDebugLog: emitDebugLog
    }

}
