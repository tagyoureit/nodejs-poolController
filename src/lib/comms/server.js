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
    //var express = require('express');
    var express = container.express
    var app = express();
    var port = process.env.PORT || 3000;
    var path = require('path').posix,
        server

    function init() {

        // console.log('calling express server init')

        // And Enable Authentication (if configured)
        if (container.settings.expressAuth === 1) {
            //var auth = require('http-auth');
            var auth = container.auth
            var basic = auth.basic({
                file: path.join(process.cwd(), container.settings.expressAuthFile)
            });
            app.use(auth.connect(basic));
        } else {
            //reset auth settings
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


        server.listen(port, function logRes() {
            container.logger.verbose('Express Server listening at port %d', port);
        });


        // Routing
        app.use(express.static(path.join(process.cwd(), 'src', container.settings.expressDir)));
        app.use('/bootstrap', express.static(path.join(process.cwd(), '/node_modules/bootstrap/dist/')));
        app.use('/jquery', express.static(path.join(process.cwd(), '/node_modules/jquery-ui-dist/')));



        /*app.get('/status', function(req, res) {
            res.send(container.status.getCurrentStatus())
        })*/

        app.get('/all', function(req, res) {
            res.send(container.helpers.allEquipmentInOneJSON())
        })

        /*istanbul ignore next */
        app.get('/reload', function(req, res) {

            container.reload.reload()
            res.send('reloading configuration')
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

        app.get('/temperatures', function(req, res) {
            res.send(container.temperatures.getTemperatures())
        })

        app.get('/time', function(req, res) {
            res.send(container.time.getTime())
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
            container.heat.setSpaSetpoint(parseInt(req.params.spasetpoint), function(response) {
                res.send(response)
            })
        })


        app.get('/spaheat/mode/:spaheatmode', function(req, res) {
            container.heat.setSpaHeatmode(parseInt(req.params.spaheatmode), function(response) {
                res.send(response)
            })
        })

        app.get('/poolheat/setpoint/:poolsetpoint', function(req, res) {
            container.heat.setPoolSetpoint(parseInt(req.params.poolsetpoint), function(response) {
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

        //URI call to save program to pump
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

        //URI call to run program to pump
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

        app.get('/pumpCommand/save/pump/:pump/rpm/:rpm', function(req, res) {
            //TODO:  this should be valid.  Just turn the pump on with no program at a specific speed.  Maybe 5,1,1 (manual)?
            var response = {}
            response.text = 'Please provide the program number when saving the program.  /pumpCommand/save/pump/#/program/#/rpm/#'
            res.send(response)
        })

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

        app.get('/pumpCommand/on/pump/:pump', function(req, res) {
            var pump = parseInt(req.params.pump)
            var response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', power: on, duration: null'
            response.pump = pump
            response.value = 1
            response.duration = -1
            container.pumpControllerTimers.startPowerTimer(pump, -1) //-1 for indefinite duration
            res.send(response)
        })

        app.get('/pumpCommand/on/pump/:pump/duration/:duration', function(req, res) {
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
            container.pumpControllerMiddleware.pumpCommandSaveProgramSpeed(pump, program, speed)
            res.send(response)
        })

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

        app.get('/pumpCommand/run/pump/:pump/program/:program/rpm/:speed/duration/:duration', function(req, res) {
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
            container.pumpControllerMiddleware.pumpCommandSaveAndRunProgramWithSpeedForDuration(pump, program, speed, duration)
            res.send(response)
        })

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

    var close = function() {
        // console.log('calling server close')
        if (server !== undefined)
            server.close(function() {
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
