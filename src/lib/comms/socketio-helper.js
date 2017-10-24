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


  var emitToClients = function(outputType, data) {
    //container.logger.warn('EMIT: %s', outputType)

    //This code move to the INTEGRATIONS folder
    /*if (container.settings.ISYController) {
        container.ISYHelper.emit(outputType)
    }*/

    if (outputType === 'updateAvailable' || outputType === 'all') {
      var Promise = container.promise
      Promise.resolve()
        .then(function() {
          return container.configEditor.getVersionNotification()
        })
        .then(function(remote) {
          if (remote.dismissUntilNextRemoteVersionBump !== true) {
            // true = means that we will suppress the update until the next available version bump
            return Promise.resolve()
              .then(function() {
                return container.updateAvailable.getResults()
              })
              .then(function(updateAvail) {
                // console.log('updateAvail', updateAvail)
                return io.sockets.emit('updateAvailable', updateAvail)
              })

          }

        })
        .catch(function(err) {
          container.logger.warn('Error emitting updateAvailable. ', err)
        })
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

    if (outputType === 'searchResults') {
      io.sockets.emit('searchResults', data);
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
      socket.once('close', function() {
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

      // when the client emits 'cancelDelay', this listens and executes
      socket.on('cancelDelay', function() {
        container.circuit.setDelayCancel()
      });


      socket.on('search', function(mode, src, dest, action) {
        //check if we don't have all valid values, and then emit a message to correct.

        container.logger.debug('from socket.on search: mode: %s  src %s  dest %s  action %s', mode, src, dest, action);
        container.apiSearch.searchMode = mode;
        container.apiSearch.searchSrc = parseInt(src);
        container.apiSearch.searchDest = parseInt(dest);
        container.apiSearch.searchAction = parseInt(action);
        if (mode === 'start') {
          var resultStr = "Listening for source: " + src + ", destination: "+ dest +", action: " + action
          emitToClients("searchResults", resultStr)
        } else if (mode === 'stop'){
          emitToClients("searchResults", 'Stopped listening.')
        }
        else if (mode === 'load')
        {
          emitToClients("searchResults", 'Input values and click start. All values optional. Please refer to https://github.com/tagyoureit/nodejs-poolController/wiki/Broadcast for possible action values.')
        }

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
        container.logger.info('reset called')
        container.bootstrapConfigEditor.reset()
      })

      socket.on('sendPacket', function(incomingPacket) {
        var preamblePacket, sendPacket;
        var str = 'Queued packet(s): '
        container.logger.info('User request (send_request.html) to send packet: %s', JSON.stringify(incomingPacket));

        for (var packet in incomingPacket) {
          // for (var byte in incomingPacket[packet]) {
          //     incomingPacket[packet][byte] = parseInt(incomingPacket[packet][byte])
          // }

          if (incomingPacket[packet][0] === 16 && incomingPacket[packet][1] === container.constants.ctrl.CHLORINATOR) {
            sendPacket = incomingPacket[packet]
            if (container.settings.logApi) container.logger.silly('packet (chlorinator) now: ', packet)
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
        io.sockets.emit('sendPacketResults', str)
        container.logger.info(str)
      })


      socket.on('setchlorinator', function(desiredChlorinatorOutput) {
        container.chlorinator.setChlorinatorLevel(parseInt(desiredChlorinatorOutput))
      })

      // deprecate this
      socket.on('spasetpoint', function(spasetpoint) {
        container.heat.setSpaSetPoint(parseInt(spasetpoint))
      })


      socket.on('setSpaSetPoint', function(spasetpoint) {
        container.heat.setSpaSetPoint(parseInt(spasetpoint))
      })

      socket.on('incrementSpaSetPoint', function(increment) {
        container.heat.incrementSpaSetPoint(parseInt(increment))
      })

      socket.on('decrementSpaSetPoint', function(decrement) {
        container.heat.decrementSpaSetPoint(parseInt(decrement))
      })


      socket.on('spaheatmode', function(spaheatmode) {
        container.heat.changeHeatMode(spaheatmode)

      })

      // deprecate this
      socket.on('poolsetpoint', function(poolsetpoint) {
        container.heat.setHeatSetPoint('pool', poolsetpoint, 'socket.io poolsetpoint')
      })

      socket.on('setPoolSetPoint', function(poolsetpoint) {
        container.heat.setPoolSetPoint(parseInt(poolsetpoint))
      })

      socket.on('incrementPoolSetPoint', function(increment) {
        container.heat.incrementPoolSetPoint(parseInt(increment))
      })

      socket.on('decrementPoolSetPoint', function(decrement) {
        container.heat.decrementPoolSetPoint(parseInt(decrement))
      })

      socket.on('poolheatmode', function(poolheatmode) {
        container.heat.changeHeatMode('pool', poolheatmode, 'socket.io poolheatmode')
      })

      socket.on('setHeatSetPoint', function(equip, change) {
        if (equip !== null && change !== null) {
          container.heat.setHeatSetPoint(equip, change, 'socket.io setHeatSetPoint')
        } else {
          container.logger.warn('setHeatPoint called with invalid values: %s %s', equip, change)
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
        container.logger.error('This API (pumpCommand) has been depricated.  Please use setPumpCommand')
        // container.logger.silly('Socket.IO pumpCommand variables - equip %s, program %s, value %s, duration %s', equip, program, value, duration)
        // container.pumpControllerMiddleware.pumpCommand(equip, program, value, duration)
      })

      socket.on('setPumpCommand', function(action, pump, program, rpm, gpm, duration) {
        pump = parseInt(pump)

        // if commands are missing, assing them null
        if (isNaN(program)) program = null
        if (isNaN(rpm)) rpm = null
        if (isNaN(gpm)) gpm = null
        if (isNaN(duration)) duration = null


        if (program !== null) program = parseInt(program)
        if (rpm !== null) rpm = parseInt(rpm)
        if (gpm !== null) gpm = parseInt(gpm)
        if (duration !== null) duration = parseInt(duration)

        var mapping = 0
        // Quick mapping to make calling the right command easier
        // duration null = 0; not null = 1
        if (duration !== null) mapping += 1
        // gpm null = 0; not null = 2
        if (gpm !== null) mapping += 2
        // rpm null =0; not null = 4
        if (rpm !== null) mapping += 4
        // program null = 0; not null = 8
        if (program !== null) mapping += 8
        // action; off = 0; run = 16; save = 32; saverun = 64
        if (action === 'run') mapping += 16
        if (action === 'save') mapping += 32
        if (action === 'saverun') mapping += 64
        console.log('In Socket; mapping = %s', mapping)
        console.log('Socket.IO setPumpCommand variables - action %s, pump %s, program %s, rpm %s, gpm %s, duration %s', action, pump, program, rpm, gpm, duration)


        switch (mapping) {
          case 0:
            {
              // Api #1 off
              console.log('called off')
              container.pumpControllerTimers.clearTimer(pump)
              break;
            }
          case 16:
            {
              // Api #2 Run pump until cancelled
              console.log('Api #2 Run pump until cancelled')
              container.pumpControllerTimers.startPowerTimer(pump, -1) //-1 for indefinite duration
              break
            }
          case 17:
            {
              // Api #3 Run pump for duration
              container.pumpControllerTimers.startPowerTimer(pump, duration)
              break
            }
          case 18:
            {
              // Api #11 Run pump at GPM until cancelled
              container.logger.error('Api #11 Run pump at GPM until cancelled NOT IMPLEMENTED YET ')
              break
            }
          case 19:
            {
              // Api #12 Run pump at GPM for duration
              container.logger.error('Api #12 Run pump at GPM for duration NOT IMPLEMENTED YET ')
              break
            }
          case 20:
            {
              // Api #6 Run pump at RPM until cancelled
              container.pumpControllerTimers.startRPMTimer(pump, rpm, -1)
              break
            }
          case 21:
            {
              // Api #7 Run pump at RPM for duration
              container.pumpControllerTimers.startRPMTimer(pump, rpm, duration)
              break
            }
          case 24:
            {
              // Api #4 Run pump program until cancelled
              container.pumpControllerTimers.startProgramTimer(pump, program, -1)
              break
            }
          case 25:
            {
              // Api #5 Run pump program for duration
              container.pumpControllerTimers.startProgramTimer(pump, program, duration)
              break
            }
          case 42:
            {
              // Api #13 Save program with GPM
              container.logger.error('Api #13 Save program with GPM NOT IMPLEMENTED YET')
              break
            }
          case 44:
            {
              // Api #8 Save program with RPM
              container.pumpControllerMiddleware.pumpCommandSaveProgram(pump, program, rpm)
              break
            }
          case 74:
            {
              // Api #14 Save and run program at GPM until cancelled
              container.logger.error('Api #14 Save and run program at GPM until cancelled NOT IMPLEMENTED YET')
              break
            }
          case 75:
            {
              // Api #15 Save and run program with GPM for duration
              container.logger.error('Api #15 Save and run program with GPM for duration NOT IMPLEMENTED YET')
              break
            }
          case 76:
            {
              // Api #9 Save and run program at rpm until cancelled
              container.pumpControllerMiddleware.pumpCommandSaveAndRunProgramWithValueForDuration(pump, program, rpm, -1)
              break
            }
          case 77:
            {
              // Api #10 Save and run program with rpm for duration
              container.pumpControllerMiddleware.pumpCommandSaveAndRunProgramWithValueForDuration(pump, program, rpm, duration)
              break
            }
          default:
            {
              container.logger.warn('No pump commands found')
            }
            mapping = 0;
        }



        // if (action === 'off') {
        //     console.log('called off')
        //     container.pumpControllerTimers.clearTimer(pump)
        // } else if (action === 'run') {
        //     if (program === null) {
        //         if (duration === null) {
        //             container.pumpControllerTimers.startProgramTimer(pump, program, -1)
        //         } else {
        //             container.pumpControllerTimers.startProgramTimer(pump, program, duration)
        //         }
        //     } else if (rpm === null) {
        //         if (duration === null) {
        //             container.pumpControllerTimers.startRPMTimer(pump, rpm, -1)
        //         } else {
        //             container.pumpControllerTimers.startRPMTimer(pump, rpm, duration)
        //         }
        //     } else {
        //         if (duration === null) {
        //             container.pumpControllerTimers.startPowerTimer(pump, -1) //-1 for indefinite duration
        //         } else {
        //             container.pumpControllerTimers.startPowerTimer(pump, duration)
        //         }
        //     }
        // } else if (action === "save") {
        //     container.pumpControllerMiddleware.pumpCommandSaveProgram(pump, program, rpm)
        // } else if (action === "saverun") {
        //     if (duration === null) {
        //         container.pumpControllerMiddleware.pumpCommandSaveAndRunProgramWithValueForDuration(pump, program, rpm, -1)
        //
        //     } else {
        //         container.pumpControllerMiddleware.pumpCommandSaveAndRunProgramWithValueForDuration(pump, program, rpm, duration)
        //
        //     }
        // }
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

      socket.on('toggleScheduleDay', function(id, day) {
        id = parseInt(id)
          var response = {}
          response.text = 'REST API received request to toggle day ' + day + ' on schedule with ID:' + id
          container.logger.info(response)
          container.schedule.toggleDay(id, day)
        })

        socket.on('setScheduleStartOrEndTime', function(id, sOE, hour, min) {
          id = parseInt(id)
          hour = parseInt(hour)
          min = parseInt(min)
            var response = {}
            response.text = 'REST API received request to set ' + sOE + ' time on schedule with ID (' + id + ') to ' +hour+':'+min
            container.logger.info(response)
            container.schedule.setControllerScheduleStartOrEndTime(id, sOE, hour, min)
          })

          socket.on('setScheduleCircuit', function(id, circuit) {
            id = parseInt(id)
            circuit = parseInt(circuit)
              var response = {}
              response.text = 'REST API received request to set circuit on schedule with ID (' + id + ') to ' + container.circuit.getFriendlyName(circuit)
              container.logger.info(response)
              container.schedule.setControllerScheduleCircuit(id, circuit)
            })

            socket.on('setEggTimer', function(id, circuit, hour, min) {
              id = parseInt(id)
              circuit = parseInt(circuit)
              hour = parseInt(hour)
              min = parseInt(min)
                var response = {}
                response.text = 'REST API received request to set eggtimer with ID (' + id + '): ' + container.circuit.getFriendlyName(circuit) + 'for ' + hour + ' hours, ' +min+' minutes'
                container.logger.info(response)
                container.schedule.setControllerEggTimer(id, circuit, hour, min)
              })

      socket.on('reload', function() {
        container.logger.info('Reload requested from Socket.io')
        container.reload.reload()
      })

      socket.on('updateVersionNotification', function(bool) {
        container.logger.info('updateVersionNotification requested from Socket.io.  value:', bool)
        container.configEditor.updateVersionNotification(bool)
      })

      emitToClients('all')
    });
  }

  var stop = function() {

    container.logger.silly('Stopping Socket IO Server')
    //from http://stackoverflow.com/questions/16000120/socket-io-close-server
    io.close();


    socketList.forEach(function(el) {
      container.logger.silly('sockets in list: ', socketList.length, el.id)

    })
    for (var socket in socketList) {
      container.logger.silly('removing socket:', socketList[socket].id)
      socketList[socket].disconnect();
      var removed = socketList.shift()
      container.logger.silly('socket removed:', socket, removed.id)

    }
    socketList.forEach(function(el) {
      container.logger.silly('what sockets are left?: ', socketList.length, el.id)

    })
  }



  var emitDebugLog = function(msg) {
    //console.log('EMITTING DEBUG LOG: %s', msg)
    io.sockets.emit('outputLog', msg)
  }

  /*istanbul ignore next */
  if (container.logModuleLoading)
    container.logger.info('Loaded: socketio-helper.js')

  return {
    io: io,
    init: init,
    stop: stop,
    emitToClients: emitToClients,
    emitDebugLog: emitDebugLog
  }

}
