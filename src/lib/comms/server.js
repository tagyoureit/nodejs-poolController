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

// Setup express server



module.exports = function(container) {

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: server.js')

    var express, app, port, path, server

    function init() {
         express = container.express
         app = express();
         port = process.env.PORT || 3000;
         path = require('path').posix
         server = undefined;
        //if we re-initialize, clear out the server
        if (container.settings.logReload) container.logger.info('calling express server init')

        // And Enable Authentication (if configured)
        if (container.settings.expressAuth === 1) {
            // console.log('server requiring auth with file:', path.join(process.cwd(), container.settings.expressAuthFile))

            var auth = container.auth
            var basic = auth.basic({
                file: path.join(process.cwd(), container.settings.expressAuthFile)
            });
            app.use(auth.connect(basic));
            // basic.on('success', (result, req) => {
            //     console.log(`User authenticated: ${result.user}`);
            // });
            //
            // basic.on('fail', (result, req) => {
            //     console.log(`User authentication failed: ${result.user}`);
            // });
            //
            // basic.on('error', (error, req) => {
            //     console.log(`Authentication error: ${error.code + " - " + error.message}`);
            // });
        } else {
            if (container.settings.logReload) container.logger.info('server NOT using auth')
            //reset auth settings
            app = undefined
            app = express()
        }

        // Create Server (and set https options if https is selected)
        if (container.settings.expressTransport === 'https') {
            var opt_https = {
                key: container.fs.readFileSync(path.join(process.cwd(), '/data/server.key')),
                cert: container.fs.readFileSync(path.join(process.cwd(), '/data/server.crt')),
                requestCert: false,
                rejectUnauthorized: false
            };
            server = container.https.createServer(opt_https, app);
        } else
            //var server = require('http').createServer(app);
            server = container.http.createServer(app);

        //hook to use custom routes
        var customRoutes = require(path.join(process.cwd(), 'src/integrations/customExpressRoutes'))
        customRoutes.init(app)

        server.listen(port, function logRes() {
            container.logger.verbose('Express Server listening at port %d', port);
        });


        // Routing
        app.use(express.static(path.join(process.cwd(), 'src/www')));
        app.use('/bootstrap', express.static(path.join(process.cwd(), '/node_modules/bootstrap/dist/')));
        app.use('/jquery', express.static(path.join(process.cwd(), '/node_modules/jquery-ui-dist/')));
        app.use('/jquery-clockpicker', express.static(path.join(process.cwd(), '/node_modules/jquery-clockpicker/dist/')));
        // app.use('/bootstrap-slider', express.static(path.join(process.cwd(), '/node_modules/bootstrap-slider/dist/')));



        /*app.get('/status', function(req, res) {
            res.send(container.status.getCurrentStatus())
        })*/

        app.get('/all', function(req, res) {
            res.send(container.helpers.allEquipmentInOneJSON())
        })

        app.get('/one', function(req, res) {
            res.send(container.helpers.allEquipmentInOneJSON())
        })

        /*istanbul ignore next */
        app.get('/reload', function(req, res) {

            container.reload.reload()
            res.send('reloading configuration')
        })

        app.get('/cancelDelay', function(req, res) {
            res.send(container.circuit.setDelayCancel())
        })

        app.get('/heat', function(req, res) {
            res.send(container.heat.getCurrentHeat())
        })

        app.get('/circuit', function(req, res) {
            res.send(container.circuit.getCurrentCircuits())
        })

        app.get('/schedule', function(req, res) {
            res.send(container.schedule.getCurrentSchedule())
        })

        app.get('/schedule/toggle/id/:id/day/:day', function(req, res) {
          var id = parseInt(req.params.id)
          var day = req.params.day
            var response = {}
            response.text = 'REST API received request to toggle day ' + day + ' on schedule with ID:' + id
            container.logger.info(response)
            container.schedule.toggleDay(id, day)
            res.send(response)
          })

          app.get('/schedule/set/id/:id/startOrEnd/:sOE/hour/:hour/min/:min', function(req, res) {
            var id = parseInt(req.params.id)
            var hour = parseInt(req.params.hour)
            var min = parseInt(req.params.min)
              var response = {}
              response.text = 'REST API received request to set ' + req.params.sOE + ' time on schedule with ID (' + id + ') to ' +hour+':'+min
              container.logger.info(response)
              container.schedule.setControllerScheduleStartOrEndTime(id, req.params.sOE, hour, min)
              res.send(response)
            })

        app.get('/schedule/set/:id/:circuit/:starthh/:startmm/:endhh/:endmm/:days', function(req, res) {
          var id = parseInt(req.params.id)
          var circuit = parseInt(req.params.circuit)
          var starthh = parseInt(req.params.starthh)
          var startmm = parseInt(req.params.startmm)
          var endhh = parseInt(req.params.endhh)
          var endmm = parseInt(req.params.endmm)
          var days = parseInt(req.params.days)
            var response = {}
            response.text = 'REST API received request to set schedule ' + id + ' with values (start) ' + starthh + ':'+startmm + ' (end) ' + endhh + ':'+ endmm + ' with days value ' + days
            container.logger.info(response)
            container.schedule.setControllerSchedule(id, circuit, starthh, startmm, endhh, endmm, days)
            res.send(response)
          })

          // TODO:  merge above and this code into single function
          app.get('/setSchedule/:id/:circuit/:starthh/:startmm/:endhh/:endmm/:day', function(req, res) {
            var id = parseInt(req.params.id)
            var circuit = parseInt(req.params.circuit)
            var starthh = parseInt(req.params.starthh)
            var startmm = parseInt(req.params.startmm)
            var endhh = parseInt(req.params.endhh)
            var endmm = parseInt(req.params.endmm)
            var days = parseInt(req.params.days)
              var response = {}
              response.text = 'REST API received request to set schedule ' + id + ' with values (start) ' + starthh + ':'+startmm + ' (end) ' + endhh + ':'+ endmm + ' with days value ' + days
              container.logger.info(response)
              container.schedule.setControllerSchedule(id, circuit, starthh, startmm, endhh, endmm, days)
              res.send(response)
          })


        app.get('/temperatures', function(req, res) {
            res.send(container.temperatures.getTemperatures())
        })

        app.get('/time', function(req, res) {
            res.send(container.time.getTime())
        })

        app.get('/datetime', function(req, res) {
            res.send(container.time.getTime())
        })


        app.get('/datetime/set/time/:hh/:mm/date/:dow/:dd/:mon/:yy/:dst', function(req, res) {
            var hour = parseInt(req.params.hh)
            var min = parseInt(req.params.mm)
            var day = parseInt(req.params.dd)
            var month = parseInt(req.params.mon)
            var year = parseInt(req.params.yy)
            var autodst = parseInt(req.params.dst)
            var dayofweek = parseInt(req.params.dow)
            var dowIsValid = container.time.lookupDOW(dayofweek)
            var response = {}
            if ((hour >= 0 && hour <= 23) && (min >= 0 && min <= 59) && (day >= 1 && day <= 31) && (month >= 1 && month <= 12) && (year >= 0 && year <= 99) && dowIsValid !== -1 && (autodst === 0 || autodst === 1)) {
                response.text = 'REST API received request to set date/time to: ' + hour + ':' + min + '(military time)'
                response.text += 'dayofweek: ' + dowIsValid + '(' + dayofweek + ') date: ' + month + '/' + day + '/20' + year + ' (mm/dd/yyyy)'
                response.text += 'automatically adjust dst (currently no effect): ' + autodst
                container.time.setDateTime(hour, min, dayofweek, day, month, year, autodst)
                container.logger.info(response)
            } else {
                response.text = 'FAIL: hour (' + hour + ') should be 0-23 and minute (' + min + ') should be 0-59.  Received: ' + hour + ':' + min
                response.text += 'Day (' + day + ') should be 0-31, month (' + month + ') should be 0-12 and year (' + year + ') should be 0-99.'
                response.text += 'Day of week (' + dayofweek + ') should be one of: [1,2,4,8,16,32,64] [Sunday->Saturday]'
                response.text += 'dst (' + autodst + ') should be 0 or 1'
                container.logger.warn(response)
            }
            res.send(response)
        })

        app.get('/pump', function(req, res) {
            res.send(container.pump.getCurrentPumpStatus())
        })

        app.get('/chlorinator', function(req, res) {
            res.send(container.chlorinator.getChlorinatorStatus())
        })

        app.get('/chlorinator/:chlorinateLevel', function(req, res) {
            container.chlorinator.setChlorinatorLevel(parseInt(req.params.chlorinateLevel), function(response) {
                res.send(response)
            })
        })

        app.get('/circuit/:circuit', function(req, res) {
            if (parseInt(req.params.circuit) > 0 && parseInt(req.params.circuit) <= 20) {
                res.send(container.circuit.getCircuit(parseInt(req.params.circuit)))
            } else {
                res.send('Not a valid circuit')
            }
        })

        app.get('/circuit/:circuit/toggle', function(req, res) {
            container.circuit.toggleCircuit(parseInt(req.params.circuit), function(response) {
                res.send(response)
            })
        })

        app.get('/circuit/:circuit/set/:set', function(req, res) {
            container.circuit.setCircuit(parseInt(req.params.circuit), parseInt(req.params.set), function(response) {
                res.send(response)
            })
        })

        app.get('/spaheat/setpoint/:spasetpoint', function(req, res) {
            container.heat.setSpaSetPoint(parseInt(req.params.spasetpoint), function(response) {
                res.send(response)
            })
        })

        app.get('/spaheat/increment', function(req, res) {
            container.heat.incrementSpaSetPoint(1, function(response) {
                res.send(response)
            })
        })

        app.get('/spaheat/increment/:spasetpoint', function(req, res) {
            container.heat.incrementSpaSetPoint(parseInt(req.params.spasetpoint), function(response) {
                res.send(response)
            })
        })

        app.get('/spaheat/decrement', function(req, res) {
            container.heat.decrementSpaSetPoint(1, function(response) {
                res.send(response)
            })
        })

        app.get('/spaheat/decrement/:spasetpoint', function(req, res) {
            container.heat.decrementSpaSetPoint(parseInt(req.params.spasetpoint), function(response) {
                res.send(response)
            })
        })

        app.get('/spaheat/mode/:spaheatmode', function(req, res) {
            container.heat.setSpaHeatmode(parseInt(req.params.spaheatmode), function(response) {
                res.send(response)
            })
        })

        app.get('/poolheat/setpoint/:poolsetpoint', function(req, res) {
            container.heat.setPoolSetPoint(parseInt(req.params.poolsetpoint), function(response) {
                res.send(response)
            })
        })

        app.get('/poolheat/decrement', function(req, res) {
            container.heat.decrementPoolSetPoint(1, function(response) {
                res.send(response)
            })
        })


        app.get('/poolheat/decrement/:poolsetpoint', function(req, res) {
            container.heat.decrementPoolSetPoint(parseInt(req.params.poolsetpoint), function(response) {
                res.send(response)
            })
        })

        app.get('/poolheat/increment', function(req, res) {
            container.heat.incrementPoolSetPoint(1, function(response) {
                res.send(response)
            })
        })

        app.get('/poolheat/increment/:poolsetpoint', function(req, res) {
            container.heat.incrementPoolSetPoint(parseInt(req.params.poolsetpoint), function(response) {
                res.send(response)
            })
        })

        app.get('/poolheat/mode/:poolheatmode', function(req, res) {
            container.heat.setPoolHeatmode(parseInt(req.params.poolheatmode), function(response) {
                res.send(response)
            })

        })

        app.get('/sendthispacket/:packet', function(req, res) {
            container.queuePacket.sendThisPacket(req.params.packet, function(response) {
                res.send(response)
            })

        })

        /* Return warning with invalid pump URL's  */
        app.get('/pumpCommand/:index/:program', function(req, res) {
            var index = parseInt(req.params.index)
            //don't parseInt program because this could be an Int or 'on/off'
            var program = req.params.program
            container.logger.warn('Please update the URL to the new format: /pumpCommand/{run or save}/pump/' + index + '/program/' + program)
            //TODO: Push the callback into the pump functions so we can get confirmation back and not simply regurgitate the request
            var response = {}
            response.text = 'REST API pumpCommand variables - index: ' + index + ', program: ' + program + ', value: null, duration: null'
            response.pump = index
            response.program = program
            response.value = null
            response.duration = null

            container.pumpControllerMiddleware.pumpCommand(index, program, null, null)
            res.send(response)
        })
        /* END Return warning with invalid pump URL's  */

        /* New pumpCommand API's  */
        //#1  Turn pump off
        app.get('/pumpCommand/off/pump/:pump', function(req, res) {
            var pump = parseInt(req.params.pump)
            var response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', power: off, duration: null'
            response.pump = pump
            response.value = null
            response.duration = -1
            container.pumpControllerTimers.clearTimer(pump)
            res.send(response)
        })

        //#2  Run pump indefinitely.
        app.get('/pumpCommand/run/pump/:pump', function(req, res) {
            var pump = parseInt(req.params.pump)
            var response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', power: on, duration: null'
            response.pump = pump
            response.value = 1
            response.duration = -1
            container.pumpControllerTimers.startPowerTimer(pump, -1) //-1 for indefinite duration
            res.send(response)
        })

        // //variation on #2.  Probably should get rid of this as "on" is synonym to "run"
        // app.get('/pumpCommand/on/pump/:pump', function(req, res) {
        //     var pump = parseInt(req.params.pump)
        //     var response = {}
        //     response.text = 'REST API pumpCommand variables - pump: ' + pump + ', power: on, duration: null'
        //     response.pump = pump
        //     response.value = 1
        //     response.duration = -1
        //     container.pumpControllerTimers.startPowerTimer(pump, -1) //-1 for indefinite duration
        //     res.send(response)
        // })

        //#3  Run pump for a duration.
        app.get('/pumpCommand/run/pump/:pump/duration/:duration', function(req, res) {
            var pump = parseInt(req.params.pump)
            var duration = parseInt(req.params.duration)
            var response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', power: on, duration: ' + duration
            response.pump = pump
            response.value = null
            response.duration = duration
            container.pumpControllerTimers.startPowerTimer(pump, duration) //-1 for indefinite duration
            res.send(response)
        })

        // //variation on #3.  Probably should get rid of this as "on" is synonym to "run"
        // app.get('/pumpCommand/on/pump/:pump/duration/:duration', function(req, res) {
        //     var pump = parseInt(req.params.pump)
        //     var duration = parseInt(req.params.duration)
        //     var response = {}
        //     response.text = 'REST API pumpCommand variables - pump: ' + pump + ', power: on, duration: ' + duration
        //     response.pump = pump
        //     response.value = null
        //     response.duration = duration
        //     container.pumpControllerTimers.startPowerTimer(pump, duration) //-1 for indefinite duration
        //     res.send(response)
        // })


        //#4  Run pump program for indefinite duration
        app.get('/pumpCommand/run/pump/:pump/program/:program', function(req, res) {
            var pump = parseInt(req.params.pump)
            var program = parseInt(req.params.program)

            //TODO: Push the callback into the pump functions so we can get confirmation back and not simply regurgitate the request
            var response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', program: ' + program + ', value: null, duration: null'
            response.pump = pump
            response.program = program
            response.duration = -1
            // container.pumpControllerMiddleware.runProgramSequence(pump, program)
            container.pumpControllerTimers.startProgramTimer(pump, program, -1)
            res.send(response)
        })

        //#5 Run pump program for a specified duration
        app.get('/pumpCommand/run/pump/:pump/program/:program/duration/:duration', function(req, res) {
            var pump = parseInt(req.params.pump)
            var program = parseInt(req.params.program)
            var duration = parseInt(req.params.duration)
            var response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', program: ' + program + ', duration: ' + duration
            response.pump = pump
            response.program = program
            response.duration = duration
            // container.pumpControllerMiddleware.runProgramSequenceForDuration(pump, program, duration)
            container.pumpControllerTimers.startProgramTimer(pump, program, duration)
            res.send(response)
        })

        //#6 Run pump at RPM for an indefinite duration
        app.get('/pumpCommand/run/pump/:pump/rpm/:rpm', function(req, res) {
            var pump = parseInt(req.params.pump)
            var rpm = parseInt(req.params.rpm)
            var response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', rpm: ' + rpm + ', duration: null'
            response.pump = pump
            response.speed = rpm
            response.duration = -1
            // container.pumpControllerMiddleware.runRPMSequence(pump, rpm)
            container.pumpControllerTimers.startRPMTimer(pump, rpm, -1)
            res.send(response)
        })

        //#7 Run pump at RPM for specified duration
        app.get('/pumpCommand/run/pump/:pump/rpm/:rpm/duration/:duration', function(req, res) {
            var pump = parseInt(req.params.pump)
            var rpm = parseInt(req.params.rpm)
            var duration = parseInt(req.params.duration)
            var response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', rpm: ' + rpm + ', duration: ' + duration
            response.pump = pump
            response.value = rpm
            response.duration = duration
            container.pumpControllerTimers.startRPMTimer(pump, rpm, duration)
            res.send(response)
        })

        //#8  Save program to pump
        app.get('/pumpCommand/save/pump/:pump/program/:program/rpm/:speed', function(req, res) {
            var pump = parseInt(req.params.pump)
            var program = parseInt(req.params.program)
            var speed = parseInt(req.params.speed)
            var response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', program: ' + program + ', rpm: ' + speed + ', duration: null'
            response.pump = pump
            response.program = program
            response.speed = speed
            response.duration = null
            container.pumpControllerMiddleware.pumpCommandSaveProgram(pump, program, speed)
            res.send(response)
        })

        //#9  Save and run program for indefinite duration
        app.get('/pumpCommand/saverun/pump/:pump/program/:program/rpm/:speed', function(req, res) {
            var pump = parseInt(req.params.pump)
            var program = parseInt(req.params.program)
            var speed = parseInt(req.params.speed)
            var duration = parseInt(req.params.duration)
            var response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', program: ' + program + ', speed: ' + speed + ', duration: indefinite'
            response.pump = pump
            response.program = program
            response.speed = speed
            response.duration = -1
            container.pumpControllerMiddleware.pumpCommandSaveAndRunProgramWithValueForDuration(pump, program, speed, -1)
            res.send(response)
        })

        //#10  Save and run program for specified duration
        app.get('/pumpCommand/saverun/pump/:pump/program/:program/rpm/:speed/duration/:duration', function(req, res) {
            var pump = parseInt(req.params.pump)
            var program = parseInt(req.params.program)
            var speed = parseInt(req.params.speed)
            var duration = parseInt(req.params.duration)
            var response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', program: ' + program + ', speed: ' + speed + ', duration: ' + duration
            response.pump = pump
            response.program = program
            response.speed = speed
            response.duration = duration
            container.pumpControllerMiddleware.pumpCommandSaveAndRunProgramWithValueForDuration(pump, program, speed, duration)
            res.send(response)
        })

//#11 Run pump at GPM for an indefinite duration
app.get('/pumpCommand/run/pump/:pump/gpm/:gpm', function(req, res) {
    var pump = parseInt(req.params.pump)
    var gpm = parseInt(req.params.gpm)
    var response = {}
    response.text = 'REST API pumpCommand variables - pump: ' + pump + ', gpm: ' + gpm + ', duration: null'
    response.pump = pump
    response.speed = gpm
    response.duration = -1
    // container.pumpControllerMiddleware.runGPMSequence(pump, gpm)
    container.pumpControllerTimers.startGPMTimer(pump, gpm, -1)
    res.send(response)
})

//#12 Run pump at GPM for specified duration
app.get('/pumpCommand/run/pump/:pump/gpm/:gpm/duration/:duration', function(req, res) {
    var pump = parseInt(req.params.pump)
    var gpm = parseInt(req.params.gpm)
    var duration = parseInt(req.params.duration)
    var response = {}
    response.text = 'REST API pumpCommand variables - pump: ' + pump + ', gpm: ' + gpm + ', duration: ' + duration
    response.pump = pump
    response.value = gpm
    response.duration = duration
    container.pumpControllerTimers.startGPMTimer(pump, gpm, duration)
    res.send(response)
})

//#13  Save program to pump
app.get('/pumpCommand/save/pump/:pump/program/:program/gpm/:speed', function(req, res) {
    var pump = parseInt(req.params.pump)
    var program = parseInt(req.params.program)
    var speed = parseInt(req.params.speed)
    var response = {}
    response.text = 'REST API pumpCommand variables - pump: ' + pump + ', program: ' + program + ', gpm: ' + speed + ', duration: null'
    response.pump = pump
    response.program = program
    response.speed = speed
    response.duration = null
    container.pumpControllerMiddleware.pumpCommandSaveProgram(pump, program, speed)
    res.send(response)
})

//#14  Save and run program for indefinite duration
app.get('/pumpCommand/saverun/pump/:pump/program/:program/gpm/:speed', function(req, res) {
    var pump = parseInt(req.params.pump)
    var program = parseInt(req.params.program)
    var speed = parseInt(req.params.speed)
    var duration = parseInt(req.params.duration)
    var response = {}
    response.text = 'REST API pumpCommand variables - pump: ' + pump + ', program: ' + program + ', speed: ' + speed + ', duration: indefinite'
    response.pump = pump
    response.program = program
    response.speed = speed
    response.duration = -1
    container.pumpControllerMiddleware.pumpCommandSaveAndRunProgramWithValueForDuration(pump, program, speed, -1)
    res.send(response)
})

//#14  Save and run program for specified duration
app.get('/pumpCommand/saverun/pump/:pump/program/:program/gpm/:speed/duration/:duration', function(req, res) {
    var pump = parseInt(req.params.pump)
    var program = parseInt(req.params.program)
    var speed = parseInt(req.params.speed)
    var duration = parseInt(req.params.duration)
    var response = {}
    response.text = 'REST API pumpCommand variables - pump: ' + pump + ', program: ' + program + ', speed: ' + speed + ', duration: ' + duration
    response.pump = pump
    response.program = program
    response.speed = speed
    response.duration = duration
    container.pumpControllerMiddleware.pumpCommandSaveAndRunProgramWithValueForDuration(pump, program, speed, duration)
    res.send(response)
})

        /* END New pumpCommand API's  */



        /* Invalid pump commands -- sends response */
        app.get('/pumpCommand/save/pump/:pump/rpm/:rpm', function(req, res) {
            //TODO:  this should be valid.  Just turn the pump on with no program at a specific speed.  Maybe 5,1,1 (manual)?
            var response = {}
            response.text = 'FAIL: Please provide the program number when saving the program.  /pumpCommand/save/pump/#/program/#/rpm/#'
            res.send(response)
        })


        app.get('/pumpCommand/save/pump/:pump/program/:program', function(req, res) {
            var pump = parseInt(req.params.pump)
            var program = parseInt(req.params.program)

            //TODO: Push the callback into the pump functions so we can get confirmation back and not simply regurgitate the request
            var response = {}
            response.text = 'FAIL: Please provide a speed /speed/{speed} when requesting to save the program'
            response.pump = pump
            response.program = program
            response.duration = null
            res.send(response)
        })

        /* END Invalid pump commands -- sends response */









        /*  Original pumpCommand API  */

        app.get('/pumpCommand/:pump/:program/:speed', function(req, res) {
            var pump = parseInt(req.params.pump)
            var program = parseInt(req.params.program)
            var value = parseInt(req.params.speed)
            container.logger.warn('Please update the URL to the new format: /pumpCommand/{run or save}/pump/' + pump + '/program/' + program + '/rpm/' + value)
            var response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', program: ' + program + ', rpm: ' + value + ', duration: null'
            response.pump = pump
            response.program = program
            response.value = value
            response.duration = null
            container.pumpControllerMiddleware.pumpCommand(pump, program, value, null)
            res.send(response)
        })

        app.get('/pumpCommand/:pump/:program/:speed/:duration', function(req, res) {
            var pump = parseInt(req.params.pump)
            var program = parseInt(req.params.program)
            var speed = parseInt(req.params.speed)
            var duration = parseInt(req.params.duration)
            container.logger.warn('Please update the URL to the new format: /pumpCommand/{run or save}/pump/' + pump + '/program/' + program + '/rpm/' + speed + '/duration/' + duration)
            var response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', program: ' + program + ', speed: ' + speed + ', duration: ' + duration
            response.pump = pump
            response.program = program
            response.speed = speed
            response.duration = duration
            container.pumpControllerMiddleware.pumpCommand(pump, program, speed, duration)
            res.send(response)
        })
    }
    /*  END  Original pumpCommand API  */
    var close = function() {
        if (container.settings.logReload) container.logger.info('calling server close')
        if (server !== undefined)
            server.close(function() {
                if (container.settings.logReload) container.logger.info('server closed')
                container.logger.verbose('Express Server closed. (was listening at port %d)', port);
            })
    }

    var getServer = function() {
        return server
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: server.js')


    return {
        getServer: getServer,
        close: close,
        init: init
    }
}
