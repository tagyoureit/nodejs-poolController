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

module.exports = function (container) {
    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: socketio-helper.js')


    var io = {http: {}, https: {}, httpEnabled: 0, httpsEnabled: 0}, socketList = {http: [], https: []};

    var emitToClientsOnEnabledSockets = function (channel, data) {
        if (io['httpEnabled'] === 1) {
            io['http'].sockets.emit(channel, data)
        }
        if (io['httpsEnabled'] === 1) {
            io['https'].sockets.emit(channel, data)
        }
    }

    var emitToClients = function (outputType, data) {
        container.logger.silly('Outputting socket ', outputType)
        if (outputType === 'updateAvailable' || outputType === 'all') {
            var remote = container.settings.get('notifications.version.remote')
            container.logger.silly('Socket.IO checking if we need to output updateAvail: %s (will send if false)', remote.dismissUntilNextRemoteVersionBump)
            if (remote.dismissUntilNextRemoteVersionBump !== true) {
                // true = means that we will suppress the update until the next available version bump
                container.updateAvailable.getResultsAsync()
                    .then(function (updateAvail) {
                        if (updateAvail.hasOwnProperty('result')) {
                            container.logger.silly('Socket.IO outputting updateAvail: %s ', JSON.stringify(updateAvail))
                            emitToClientsOnEnabledSockets('updateAvailable', updateAvail)
                        }
                        else {
                            container.logger.silly('Socket.IO NOT outputting updateAvail because it is missing the result string: %s ', JSON.stringify(updateAvail))
                        }
                    })
                    .catch(function (err) {
                        container.logger.error("Error getting update available results: ", err)
                    })
            }
        }

        if (outputType === 'one' || outputType === 'all') {
            var one = container.helpers.allEquipmentInOneJSON()
            emitToClientsOnEnabledSockets('one', one)
            emitToClientsOnEnabledSockets('all', one)
        }

        if (outputType === 'circuit' || outputType === 'all') {
            var currCir = container.circuit.getCurrentCircuits()
            emitToClientsOnEnabledSockets('circuit', currCir)
        }

        /*if (outputType === 'config' || outputType === 'all') {
            var currStatus = container.status.getCurrentStatus()
            emitToClientsOnEnabledSockets('config',
                currStatus
            )
        }*/

        if (outputType === 'time' || outputType === 'all') {
            var time = container.time.getTime()
            if (time.controllerTime !== -1) {
                emitToClientsOnEnabledSockets('time',
                    time
                )
            }
        }

        if (outputType === 'temp' || outputType === 'all') {
            var temp = container.temperatures.getTemperatures()
            emitToClientsOnEnabledSockets('temp',
                temp
            )
            emitToClientsOnEnabledSockets('temperature',
                temp
            )
            emitToClientsOnEnabledSockets('temperatures', temp)
        }

        if (outputType === 'pump' || outputType === 'all') {
            var pumpStatus = container.pump.getCurrentPumpStatus()
            emitToClientsOnEnabledSockets('pump', pumpStatus)
        }

        if (outputType === 'heat' || outputType === 'all') {
            var heat = container.heat.getCurrentHeat()
            emitToClientsOnEnabledSockets('heat',
                heat
            )
        }

        if (outputType === 'schedule' || outputType === 'all') {
            var sched = container.schedule.getCurrentSchedule()
            if (container.schedule.numberOfSchedulesRegistered() > 3) {
                emitToClientsOnEnabledSockets('schedule',
                    sched)
            }
        }

        if (outputType === 'chlorinator' || outputType === 'all') {
            var chlor = container.chlorinator.getChlorinatorStatus()
            if (container.chlorinator.getSaltPPM() !== 'undefined')
                emitToClientsOnEnabledSockets('chlorinator', chlor)
        }

        if (outputType === 'UOM' || outputType === 'all') {
            emitToClientsOnEnabledSockets('UOM', container.UOM.getUOM())
        }

        if (outputType === 'all') {
            emitToClientsOnEnabledSockets('all', container.helpers.allEquipmentInOneJSON())
        }

        if (outputType === 'searchResults') {
            emitToClientsOnEnabledSockets('searchResults', data);
        }

        if (outputType === 'intellichem' || outputType === 'all') {
            var intellichem = container.intellichem.getCurrentIntellichem()
            emitToClientsOnEnabledSockets('intellichem',
                intellichem)
        }

        if (outputType === 'valve' || outputType === 'all') {
            emitToClientsOnEnabledSockets('valve', container.valve.getValve())
        }
    }

    var init = function (server, type) {

        io[type] = container.socket(server)
        socketList[type] = [];
        container.logger.verbose('Socket.IO %s server listening. ', type)

        io[type].on('error', function (err) {
            container.logger.error('Something went wrong with the Socket.IO server error.  ', err.message)
            console.log(err)
        })
        io[type].on('connect_error', function (err) {
            container.logger.error('Something went wrong with the Socket.IO server connect_error.  ', err.message)
            console.log(err)
        })
        io[type].on('reconnect_failed', function (err) {
            container.logger.error('Something went wrong with the Socket.IO server reconnect_failed.  ', err.message)
            console.log(err)
        })

        io[type].on('connection', function (socket) {
            container.logger.silly('New SOCKET.IO Client connected, ', socket.id)
            socketHandler(socket, type)
        })


        // TODO: Want to figure out how to log Socket requests.
        // io[type].use((socket, next) => {
        //
        //
        //     // if we are in capture packet mode, capture it
        //     if (container.settings.get('capturePackets')) {
        //         container.logger.packet({
        //             type: 'socket',
        //             counter: 0,
        //             url: socket.handshake.query,
        //             direction: 'inbound'
        //         })
        //
        //     }
        //     console.log('socket.io')
        //
        //     console.log(JSON.stringify(socket.handshake.query,null,2))
        //     next()
        // })

        io[type + 'Enabled'] = 1

    }

    var stop = function (type) {
        if (type === undefined) {
            container.logger.error('io.stop() should be called with http or https')
        }
        else {
            try {
                container.logger.debug(`Stopping Socket IO ${type} Server`)

                while (socketList[type].length !== 0) {
                    container.logger.silly('total sockets in list: ', socketList[type].length)
                    container.logger.silly('removing socket:', socketList[type][0].id)
                    socketList[type][0].disconnect();
                    var removed = socketList[type].shift()
                    container.logger.silly('socket removed:', removed.id)
                }
                container.logger.silly('All sockets removed from connection')


                if (typeof io[type].close === 'function') {
                    io[type].close();
                    io[type + 'Enabled'] = 0
                    container.logger.debug(`Socket IO ${type} Server closed`)
                }
                else {
                    container.logger.silly('Trying to close IO server, but already closed.')
                }
            }
            catch (err) {
                container.logger.error('oops, we hit an error closing the socket server', err)
                throw new Error(err)
            }
        }

    }

    function socketHandler(socket, type) {
        socketList[type].push(socket);
        // socket.emit('socket_is_connected', 'You are connected!');
        socket.on('error', function (err) {
            container.logger.error('Error with socket: ', err)
        })

        socket.on('close', function (myid) {
            for (var i = 0; i < socketList[type].length; i++) {
                if (socketList[type][i].id === myid) {
                    container.logger.debug('socket closed');
                    socketList[type][i].disconnect();
                    socketList[type].splice(socketList[type][i], 1);
                }
            }

        });

        socket.on('echo', function (msg) {
            socket.emit('echo', msg)
        })
        // when the client emits 'toggleEquipment', this listens and executes
        socket.on('toggleCircuit', function (equipment) {
            container.circuit.toggleCircuit(equipment)
        });

        socket.on('setCircuit', function (circuit, set) {
            container.circuit.setCircuit(circuit, set)
        });


        // when the client emits 'cancelDelay', this listens and executes
        socket.on('cancelDelay', function () {
            container.circuit.setDelayCancel()
        });


        socket.on('search', function (mode, src, dest, action) {
            //check if we don't have all valid values, and then emit a message to correct.

            container.logger.debug('from socket.on search: mode: %s  src %s  dest %s  action %s', mode, src, dest, action);
            container.apiSearch.searchMode = mode;
            container.apiSearch.searchSrc = parseInt(src);
            container.apiSearch.searchDest = parseInt(dest);
            container.apiSearch.searchAction = parseInt(action);
            if (mode === 'start') {
                var resultStr = "Listening for source: " + src + ", destination: " + dest + ", action: " + action
                emitToClients("searchResults", resultStr)
            } else if (mode === 'stop') {
                emitToClients("searchResults", 'Stopped listening.')
            }
            else if (mode === 'load') {
                emitToClients("searchResults", 'Input values and click start. All values optional. Please refer to https://github.com/tagyoureit/nodejs-poolController/wiki/Broadcast for possible action values.')
            }

        })

        socket.on('all', function () {
            emitToClients('all')
        })


        socket.on('one', function () {
            emitToClients('one')
        })

        socket.on('setConfigClient', function (a, b, c, d) {
            container.logger.debug('Setting config_client properties: ', a, b, c, d)
            container.bootstrapsettings.updateAsync(a, b, c, d)

        })

        socket.on('resetConfigClient', function () {
            container.logger.info('Socket received:  Reset bootstrap config')
            container.bootstrapsettings.resetAsync()
        })

        socket.on('sendPacket', function (incomingPacket) {
            var preamblePacket, sendPacket;
            var str = 'Queued packet(s): '
            container.logger.info('User request (send_request.html) to send packet: %s', JSON.stringify(incomingPacket));

            for (var packet in incomingPacket) {
                // for (var byte in incomingPacket[packet]) {
                //     incomingPacket[packet][byte] = parseInt(incomingPacket[packet][byte])
                // }

                if (incomingPacket[packet][0] === 16 && incomingPacket[packet][1] === container.constants.ctrl.CHLORINATOR) {
                    sendPacket = incomingPacket[packet]
                    if (container.settings.get('logApi')) container.logger.silly('packet (chlorinator) now: ', packet)
                } else {
                    if (incomingPacket[packet][0] === 96 || incomingPacket[packet][0] === 97 || incomingPacket[packet][1] === 96 || incomingPacket[packet][1] === 97)
                    //if a message to the pumps, use 165,0
                    {
                        preamblePacket = [165, 0]
                    } else
                    //If a message to the controller, use the preamble that we have recorded
                    {
                        preamblePacket = [165, container.intellitouch.getPreambleByte()]; //255,0,255 will be added later

                    }
                    sendPacket = preamblePacket.concat(incomingPacket[packet]);
                }
                container.queuePacket.queuePacket(sendPacket);
                str += JSON.stringify(sendPacket) + ' '
            }
            emitToClientsOnEnabledSockets('sendPacketResults', str)
            container.logger.info(str)
        })

        socket.on('receivePacket', function (incomingPacket) {
            var preamblePacket, sendPacket;
            var str = 'Receiving packet(s): '
            container.logger.info('User request (send_request.html) to RECEIVE packet: %s', JSON.stringify(incomingPacket));

            for (var packet in incomingPacket) {
                // for (var byte in incomingPacket[packet]) {
                //     incomingPacket[packet][byte] = parseInt(incomingPacket[packet][byte])
                // }

                if (incomingPacket[packet][0] === 16 && incomingPacket[packet][1] === container.constants.ctrl.CHLORINATOR) {
                    sendPacket = incomingPacket[packet]
                    if (container.settings.get('logApi')) container.logger.silly('packet (chlorinator) now: ', packet)
                } else {
                    if (incomingPacket[packet][0] === 96 || incomingPacket[packet][0] === 97 || incomingPacket[packet][1] === 96 || incomingPacket[packet][1] === 97)
                    //if a message to the pumps, use 165,0
                    {
                        preamblePacket = [255, 0, 255, 165, 0]
                    } else
                    //If a message to the controller, use the preamble that we have recorded
                    {
                        preamblePacket = [255, 0, 255, 165, container.intellitouch.getPreambleByte()]; //255,0,255 will be added later

                    }
                    sendPacket = preamblePacket.concat(incomingPacket[packet]);
                }
                //container.queuePacket.queuePacket(sendPacket);
                container.packetBuffer.push(new Buffer(sendPacket));
                str += JSON.stringify(sendPacket) + ' '
            }
            emitToClientsOnEnabledSockets('sendPacketResults', str)
            container.logger.info(str)
        })

        socket.on('receivePacketRaw', function (incomingPacket) {

            var str = 'Add packet(s) to incoming buffer: '
            container.logger.info('User request (replay.html) to RECEIVE packet: %s', JSON.stringify(incomingPacket));

            for (var i=0; i<incomingPacket.length; i++) {

                container.packetBuffer.push(new Buffer(incomingPacket[i]));
                str += JSON.stringify(incomingPacket[i]) + ' '
            }
            emitToClientsOnEnabledSockets('sendPacketResults', str)
            container.logger.info(str)
        })

        socket.on('setchlorinator', function (desiredChlorinatorPoolOutput, desiredChlorinatorSpaOutput = -1, desiredSuperChlorHours = -1) {
            if (desiredChlorinatorSpaOutput===-1){
                container.chlorinator.setChlorinatorLevelAsync(parseInt(desiredChlorinatorPoolOutput))
            }
            else {
                container.chlorinator.setChlorinatorLevelAsync(parseInt(desiredChlorinatorPoolOutput), parseInt(desiredChlorinatorSpaOutput), parseInt(desiredSuperChlorHours))
            }

        })

        socket.on('setSpaSetPoint', function (spasetpoint) {
            container.heat.setSpaSetPoint(parseInt(spasetpoint))
        })

        socket.on('incrementSpaSetPoint', function (increment) {
            container.heat.incrementSpaSetPoint(parseInt(increment))
        })

        socket.on('decrementSpaSetPoint', function (decrement) {
            container.heat.decrementSpaSetPoint(parseInt(decrement))
        })


        socket.on('spaheatmode', function (spaheatmode) {
            container.heat.setSpaHeatMode(parseInt(spaheatmode))

        })

        socket.on('setPoolSetPoint', function (poolsetpoint) {
            container.heat.setPoolSetPoint(parseInt(poolsetpoint))
        })

        socket.on('incrementPoolSetPoint', function (increment) {
            container.heat.incrementPoolSetPoint(parseInt(increment))
        })

        socket.on('decrementPoolSetPoint', function (decrement) {
            container.heat.decrementPoolSetPoint(parseInt(decrement))
        })

        //TODO: make the heat mode call either setHeatMode or the specific setPoolHeatMode/setSpaHeatMode
        socket.on('poolheatmode', function (poolheatmode) {
            // container.heat.setHeatMode('pool', poolheatmode, 'socket.io poolheatmode')
            container.heat.setPoolHeatMode(parseInt(poolheatmode))
        })

        socket.on('setHeatSetPoint', function (equip, change) {
            if (equip !== null && change !== null) {
                container.heat.setHeatSetPoint(equip, change, 'socket.io setHeatSetPoint')
            } else {
                container.logger.warn('setHeatPoint called with invalid values: %s %s', equip, change)
            }
        })

        socket.on('setHeatMode', function (equip, change) {
            if (equip === "pool") {
                container.heat.changeHeatMode('pool', change, 'socket.io setHeatMode ' + equip + ' ' + change)

            } else {
                container.heat.changeHeatMode('spa', change, 'socket.io setHeatMode ' + equip + ' ' + change)
            }
        })

        socket.on('pump', function () {
            emitToClients('pump')
        })

        socket.on('setLightMode', function (mode) {
            if (parseInt(mode) >= 0 && parseInt(mode) <= 256) {
                container.circuit.setLightMode(parseInt(mode))
            } else {
                container.logger.warn('Socket lightMode: Not a valid light power command.')
            }
        })

        socket.on('setLightColor', function (circuit, color) {
            if (parseInt(circuit) > 0 && parseInt(circuit) <= container.circuit.getNumberOfCircuits()) {
                if (parseInt(color) >= 0 && parseInt(color) <= 256) {
                    (container.circuit.setLightColor(parseInt(circuit), parseInt(color)))
                } else {
                    container.logger.warn('Socket lightSetColor: Not a valid light set color.')
                }
            }
        })

        socket.on('setLightSwimDelay', function (circuit, delay) {
            if (parseInt(circuit) > 0 && parseInt(circuit) <= container.circuit.getNumberOfCircuits()) {
                if (parseInt(delay) >= 0 && parseInt(delay) <= 256) {
                    (container.circuit.setLightSwimDelay(parseInt(circuit), parseInt(delay)))
                } else {
                    container.logger.warn('Socket lightSetSwimDelay: Not a valid light swim delay.')
                }
            }
        })


        socket.on('setLightPosition', function (circuit, position) {
            if (parseInt(circuit) > 0 && parseInt(circuit) <= container.circuit.getNumberOfCircuits()) {
                if (parseInt(position) >= 0 && parseInt(position) <= container.circuit.getNumberOfCircuits()) {
                    (container.circuit.setLightPosition(parseInt(circuit), parseInt(position)))
                } else {
                    container.logger.warn('Socket lightSetPosition: Not a valid light swim position.')
                }
            }
        })

        /* New pumpCommand API's  */
        //#1  Turn pump off
        socket.on('pumpCommandOff', function (pump) {
            var pump = parseInt(pump)
            var response = {}
            response.text = 'Socket pumpCommand variables - pump: ' + pump + ', power: off, duration: null'
            response.pump = pump
            response.value = null
            response.duration = -1
            container.pumpControllerTimers.clearTimer(pump)
            container.logger.info(response)
        })

        //#2  Run pump indefinitely.
        //#3  Run pump for a duration
        socket.on('pumpCommandRun', function (_pump, _duration) {
            var pump = parseInt(_pump)
            var duration = -1
            if (_duration !== null || _duration !== undefined)
                duration = parseInt(_duration)
            var response = {}
            response.text = 'Socket pumpCommand variables - pump: ' + pump + ', power: on, duration: ' + duration
            response.pump = pump
            response.value = 1
            response.duration = _duration
            container.pumpControllerTimers.startPowerTimer(pump, duration) //-1 for indefinite duration
            container.logger.info(response)
        })

        //#4  Run pump program for indefinite duration
        //#5  Run pump program for a specified
        socket.on('pumpCommandRunProgram', function (_pump, _program, _duration) {
            var pump = parseInt(_pump)
            var program = parseInt(_program)
            var duration = -1
            if (_duration !== null || _duration !== undefined)
                duration = parseInt(_duration)

            //TODO: Push the callback into the pump functions so we can get confirmation back and not simply regurgitate the request
            var response = {}
            response.text = 'Socket pumpCommand variables - pump: ' + pump + ', program: ' + program + ', value: null, duration: ' + duration
            response.pump = pump
            response.program = program
            response.duration = duration
            container.pumpControllerTimers.startProgramTimer(pump, program, duration)
            container.logger.info(response)
        })

        //#6 Run pump at RPM for an indefinite duration
        //#7 Run pump at RPM for specified duration
        socket.on('pumpCommandRunRpm', function (_pump, _rpm, _duration) {
            var pump = parseInt(_pump)
            var rpm = parseInt(_rpm)
            var duration = -1
            if (_duration !== null || _duration !== undefined)
                duration = parseInt(_duration)
            var response = {}
            response.text = 'Socket pumpCommand variables - pump: ' + pump + ', rpm: ' + rpm + ', duration: ' + duration
            response.pump = pump
            response.value = rpm
            response.duration = duration
            container.pumpControllerTimers.startRPMTimer(pump, rpm, duration)
            container.logger.info(response)
        })

        //#8  Save program to pump
        socket.on('setPumpProgramSpeed', function (pump, program, speed) {
            var pump = parseInt(pump)
            var program = parseInt(program)
            var speed = parseInt(speed)
            var response = {}
            response.text = 'Socket setPumpProgramSpeed variables - pump: ' + pump + ', program: ' + program + ', speed: ' + speed + ', duration: n/a'
            response.pump = pump
            response.program = program
            response.speed = speed
            response.duration = null
            container.pumpControllerMiddleware.pumpCommandSaveProgram(pump, program, speed)
            container.logger.info(response)
        })

        //#9  Save and run program for indefinite duration
        //#10  Save and run program for specified duration
        socket.on('pumpCommandSaveRunRpm', function (_pump, _program, _speed, _duration) {
            var pump = parseInt(_pump)
            var program = parseInt(_program)
            var speed = parseInt(_speed)
            var duration = -1
            if (_duration !== null || _duration !== undefined)
                duration = parseInt(_duration)
            var response = {}
            response.text = 'Socket pumpCommand variables - pump: ' + pump + ', program: ' + program + ', speed: ' + speed + ', duration: ' + duration
            response.pump = pump
            response.program = program
            response.speed = speed
            response.duration = duration
            container.pumpControllerMiddleware.pumpCommandSaveAndRunProgramWithValueForDuration(pump, program, speed, duration)
            container.logger.info(response)
        })

        //#11 Run pump at GPM for an indefinite duration
        //#12 Run pump at GPM for specified duration
        socket.on('pumpCommandRunGpm', function (_pump, _gpm, _duration) {
            var pump = parseInt(_pump)
            var gpm = parseInt(_gpm)
            var duration = -1
            if (_duration !== null || _duration !== undefined)
                duration = parseInt(_duration)
            var response = {}
            response.text = 'Socket pumpCommand variables - pump: ' + pump + ', gpm: ' + gpm + ', duration: ' + duration
            response.pump = pump
            response.speed = gpm
            response.duration = duration
            container.pumpControllerTimers.startGPMTimer(pump, gpm, duration)
            container.logger.info(response)
        })

        //#13  Save program to pump
        socket.on('/pumpCommand/save/pump/:pump/program/:program/gpm/:speed', function (req, res) {
            var pump = parseInt(_pump)
            var program = parseInt(_program)
            var speed = parseInt(_speed)
            var response = {}
            response.text = 'Socket pumpCommand variables - pump: ' + pump + ', program: ' + program + ', gpm: ' + speed + ', duration: null'
            response.pump = pump
            response.program = program
            response.speed = speed
            response.duration = null
            container.pumpControllerMiddleware.pumpCommandSaveProgram(pump, program, speed)
            container.logger.info(response)
        })

        //#14  Save and run program for indefinite duration
        //#15  Save and run program for specified duration
        socket.on('pumpCommandSaveRunGpm', function (_pump, _program, _speed, _duration) {
            var pump = parseInt(_pump)
            var program = parseInt(_program)
            var speed = parseInt(_speed)
            var duration = -1
            if (_duration !== null || _duration !== undefined)
                duration = parseInt(_duration)
            var response = {}
            response.text = 'Socket pumpCommand variables - pump: ' + pump + ', program: ' + program + ', speed: ' + speed + ', duration: ' + duration
            response.pump = pump
            response.program = program
            response.speed = speed
            response.duration = duration
            container.pumpControllerMiddleware.pumpCommandSaveAndRunProgramWithValueForDuration(pump, program, speed, duration)
            container.logger.info(response)
        })

        socket.on('setPumpType', function (pump, type) {
            var pump = parseInt(pump)
            var type = type
            var response = {}
            response.text = 'Socket setPumpType variables - pump: ' + pump + ', type: ' + type
            response.pump = pump
            response.type = type
            container.settings.updatePumpTypeAsync(pump, type)
            container.logger.info(response)
        })


        socket.on('setDateTime', function (hh, mm, dow, dd, mon, yy, dst) {
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

        socket.on('setSchedule', function (id, circuit, starthh, startmm, endhh, endmm, days) {
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

        socket.on('toggleScheduleDay', function (id, day) {
            id = parseInt(id)
            var response = {}
            if (day !== undefined) {
                response.text = 'Socket received request to toggle day ' + day + ' on schedule with ID:' + id
                container.logger.info(response)
                container.schedule.toggleDay(id, day)
            }
            else {
                container.logger.warn('Socket toggleScheduleDay received with no valid day value.')
            }
        })

        socket.on('deleteScheduleOrEggTimer', function (id) {
            id = parseInt(id)
            var response = {}
            response.text = 'Socket received request delete schedule with ID:' + id
            container.logger.info(response)
            container.schedule.deleteScheduleOrEggTimer(id)
        })

        socket.on('setScheduleStartOrEndTime', function (id, sOE, hour, min) {
            id = parseInt(id)
            hour = parseInt(hour)
            min = parseInt(min)
            var response = {}
            response.text = 'Socket received request to set ' + sOE + ' time on schedule with ID (' + id + ') to ' + hour + ':' + min
            container.logger.info(response)
            container.schedule.setControllerScheduleStartOrEndTime(id, sOE, hour, min)
        })

        socket.on('setScheduleCircuit', function (id, circuit) {
            id = parseInt(id)
            circuit = parseInt(circuit)
            var response = {}
            response.text = 'Socket received request to set circuit on schedule with ID (' + id + ') to ' + container.circuit.getFriendlyName(circuit)
            container.logger.info(response)
            container.schedule.setControllerScheduleCircuit(id, circuit)
        })

        socket.on('setEggTimer', function (id, circuit, hour, min) {
            id = parseInt(id)
            circuit = parseInt(circuit)
            hour = parseInt(hour)
            min = parseInt(min)
            var response = {}
            response.text = 'Socket received request to set eggtimer with ID (' + id + '): ' + container.circuit.getFriendlyName(circuit) + 'for ' + hour + ' hours, ' + min + ' minutes'
            container.logger.info(response)
            container.schedule.setControllerEggTimer(id, circuit, hour, min)
        })

        socket.on('reload', function () {
            container.logger.info('Reload requested from Socket.io')
            container.reload.reloadAsync()
        })

        socket.on('updateVersionNotificationAsync', function (bool) {
            container.logger.info('updateVersionNotificationAsync requested from Socket.io.  value:', bool)
            container.settings.updateVersionNotificationAsync(bool, null)
            // .then(function(res){
            //     console.log('returned from updatever', res)
            // })
        })

        emitToClients('all')
    }


    var emitDebugLog = function (msg) {
        //console.log('EMITTING DEBUG LOG: %s', msg)
        emitToClientsOnEnabledSockets('outputLog', msg)
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: socketio-helper.js')

    return {
        //io: io,
        init: init,
        stop: stop,
        emitToClients: emitToClients,
        emitDebugLog: emitDebugLog
    }

}

