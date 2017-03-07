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
    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: socketio-helper.js')


    var server, io, socketList = [];


    var logger = container.logger

    var emitToClients = function(outputType) {
        //logger.warn('EMIT: %s', outputType)

        //This code move to the INTEGRATIONS folder
        /*if (container.settings.ISYController) {
            container.ISYHelper.emit(outputType)
        }*/

        if (outputType === 'updateAvailable' || outputType === 'all') {
            var updateAvail = container.updateAvailable.getResults()
            io.sockets.emit('updateAvailable', updateAvail)
        }

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
            io.sockets.emit('temperatures', temp)
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


    var init = function() {
        //var Server = require('./server.js'),
        //var io = require('socket.io')(container.server.server);
        server = container.server.getServer()
        io = container.socket(server)
        socketList = [];

        io.on('connection', function(socket, error) {

            socketList.push(socket);
            // socket.emit('socket_is_connected', 'You are connected!');
            socket.on('close', function() {
                console.log('socket closed')
                container.logger.debug('socket closed');
                socketList.splice(socketList.indexOf(socket), 1);
            });
            socket.on('error', function() {
                container.logger.error('Error with socket: ', error)
            })

            socket.on('echo', function(msg) {
                socket.emit('echo', msg)
            })
            // when the client emits 'toggleEquipment', this listens and executes
            socket.on('toggleCircuit', function(equipment) {

                container.circuit.toggleCircuit(equipment)


            });
            socket.on('search', function(mode, src, dest, action) {
                //check if we don't have all valid values, and then emit a message to correct.

                logger.debug('from socket.on search: mode: %s  src %s  dest %s  action %s', mode, src, dest, action);
                container.apiSearch.searchMode = mode;
                container.apiSearch.searchSrc = src;
                container.apiSearch.searchDest = dest;
                container.apiSearch.searchAction = action;
            })

            socket.on('all', function() {
                emitToClients('all')
            })


            socket.on('one', function() {
                emitToClients('one')
            })

            socket.on('setConfigClient', function(a, b, c, d) {
                container.bootstrapConfigEditor.update(a, b, c, d)
            })

            socket.on('resetConfigClient', function() {
                console.log('reset called')
                container.bootstrapConfigEditor.reset()
            })

            socket.on('sendpacket', function(incomingPacket) {


                logger.info('User request (send_request.html) to send packet: %s', incomingPacket);
                var packet, preamblePacket;
                packet = incomingPacket.split(',');
                for (var i = 0; i < packet.length; i++) {
                    packet[i] = parseInt(packet[i])
                }
                if (packet[0] === 16 && packet[1] === container.constants.ctrl.CHLORINATOR) {
                    if (container.settings.logApi) logger.silly('packet (chlorinator) now: ', packet)
                } else {
                    if (packet[0] === 96 || packet[0] === 97 || packet[1] === 96 || packet[1] === 97)
                    //If a message to the controller, use the preamble that we have recorded
                    {
                        preamblePacket = [165, container.intellitouch.getPreambleByte()]; //255,0,255 will be added later
                    } else
                    //if a message to the pumps, use 165,0
                    {
                        preamblePacket = [165, 0]
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
                container.heat.changeHeatSetPoint('pool', poolsetpoint, 'socket.io poolsetpoint')
            })

            socket.on('poolheatmode', function(poolheatmode) {
                container.heat.changeHeatMode('pool', poolheatmode, 'socket.io poolheatmode')
            })

            socket.on('setHeatSetPoint', function(equip, change) {
                if (equip !== null && change !== null) {
                    container.heat.changeHeatSetPoint(equip, change, 'socket.io setHeatSetPoint')
                } else {
                    logger.warn('setHeatPoint called with invalid values: %s %s', equip, change)
                }
            })

            socket.on('setHeatMode', function(equip, change) {
                if (equip === "pool") {
                    container.heat.changeHeatMode('pool', change, 'socket.io setHeatMode ' + equip + ' ' + change)

                } else {
                    container.heat.changeHeatMode('spa', change, 'socket.io setHeatMode ' + equip + ' ' + change)
                }
            })

            //SHOULD DEPRICATE
            socket.on('pumpCommand', function(equip, program, value, duration) {

                logger.silly('Socket.IO pumpCommand variables - equip %s, program %s, value %s, duration %s', equip, program, value, duration)
                container.pumpControllerMiddleware.pumpCommand(equip, program, value, duration)
            })

            socket.on('setPumpCommand', function(action, pump, program, rpm, duration) {
                pump = parseInt(pump)
                if (program !== null) program = parseInt(program)
                if (rpm !== null) rpm = parseInt(rpm)
                if (duration !== null) duration = parseInt(duration)

                console.log('Socket.IO pumpCommand variables - action %s, pump %s, program %s, rpm %s, duration %s', action, pump, program, rpm, duration)

                if (action === 'off') {
                    console.log('called off')
                    container.pumpControllerTimers.clearTimer(pump)
                } else if (action === 'run') {
                    if (program === null) {
                        if (duration === null) {
                            container.pumpControllerTimers.startProgramTimer(pump, program, -1)
                        } else {
                            container.pumpControllerTimers.startProgramTimer(pump, program, duration)
                        }
                    } else if (rpm === null) {
                        if (duration === null) {
                            container.pumpControllerTimers.startRPMTimer(pump, rpm, -1)
                        } else {
                            container.pumpControllerTimers.startRPMTimer(pump, rpm, duration)
                        }
                    } else {
                        if (duration === null) {
                            container.pumpControllerTimers.startPowerTimer(pump, -1) //-1 for indefinite duration
                        } else {
                            container.pumpControllerTimers.startPowerTimer(pump, duration)
                        }
                    }
                } else if (action === "save") {
                    container.pumpControllerMiddleware.pumpCommandSaveProgramSpeed(pump, program, rpm)
                } else if (action === "saverun") {
                    if (duration === null) {
                        container.pumpControllerMiddleware.pumpCommandSaveAndRunProgramWithSpeedForDuration(pump, program, rpm, -1)

                    } else {
                        container.pumpControllerMiddleware.pumpCommandSaveAndRunProgramWithSpeedForDuration(pump, program, rpm, duration)

                    }
                }
            })

            socket.on('setDateTime', function(hh, mm, dow, dd, mon, yy, dst) {
                var hour = parseInt(hh)
                var min = parseInt(mm)
                var day = parseInt(dd)
                var month = parseInt(mon)
                var year = parseInt(yy)
                var autodst = parseInt(dst)
                var dayofweek = parseInt(dow)
                var dowIsValid = container.time.lookupDOW(dayofweek)
                var response = {}
                if ((hour >= 0 && hour <= 23) && (min >= 0 && min <= 59) && (day >= 1 && day <= 31) && (month >= 1 && month <= 12) && (year >= 0 && year <= 99) && dowIsValid !== -1 && (autodst === 0 || autodst === 1)) {
                    response.text = 'SOCKET API received request to set date/time to: ' + hour + ':' + min + '(military time)'
                    response.text += 'dayofweek: ' + dowIsValid + '(' + dayofweek + ') date: ' + month + '/' + day + '/20' + year + ' (mm/dd/yyyy)'
                    response.text += 'automatically adjust dst (currently no effect): ' + autodst
                    container.time.setDateTime(hour, min, dayofweek, day, month, year, autodst)
                    container.logger.info(response)
                } else {
                    response.text = 'FAIL: SOCKET API - hour (' + hour + ') should be 0-23 and minute (' + min + ') should be 0-59.  Received: ' + hour + ':' + min
                    response.text += 'Day (' + day + ') should be 0-31, month (' + month + ') should be 0-12 and year (' + year + ') should be 0-99.'
                    response.text += 'Day of week (' + dayofweek + ') should be one of: [1,2,4,8,16,32,64] [Sunday->Saturday]'
                    response.text += 'dst (' + autodst + ') should be 0 or 1'
                    container.logger.warn(response)
                }

            })

            socket.on('setSchedule', function(id, circuit, starthh, startmm, endhh, endmm, days) {
                id = parseInt(id)
                circuit = parseInt(circuit)
                starthh = parseInt(starthh)
                startmm = parseInt(startmm)
                endhh = parseInt(endhh)
                endmm = parseInt(endmm)
                days = parseInt(days)
                var response = {}
                response.text = 'SOCKET received request to set schedule ' + id + ' with values (start) ' + starthh + ':' + startmm + ' (end) ' + endhh + ':' + endmm + ' with days value ' + days
                container.logger.info(response)
                container.schedule.setControllerSchedule(id, circuit, starthh, startmm, endhh, endmm, days)
            })


            socket.on('reload', function() {
                logger.info('Reload requested from Socket.io')
                container.reload.reload()
            })

            socket.on('updateVersionNotification', function(bool) {
                logger.info('updateVersionNotification requested from Socket.io.  value:', bool)
                container.configEditor.updateVersionNotification(bool)
            })

            emitToClients('all')
        });
    }

    var stop = function() {
        //from http://stackoverflow.com/questions/16000120/socket-io-close-server
        io.close();
        console.log('socket list length: ', socketList.length)
        socketList.forEach(function(socket) {
            socket.destroy();
        });
        console.log('socket list length after close: ', socketList.length)

    }



    var emitDebugLog = function(msg) {
        //console.log('EMITTING DEBUG LOG: %s', msg)
        io.sockets.emit('outputLog', msg)
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        logger.info('Loaded: socketio-helper.js')

    return {
        io: io,
        init: init,
        stop: stop,
        emitToClients: emitToClients,
        emitDebugLog: emitDebugLog
    }

}
