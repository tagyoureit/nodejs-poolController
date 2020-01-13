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

var request = require('request')

module.exports = function(container) {

    var io = container.socketClient
    //var ISYTimer = new container.nanotimer
    var fs = container.fs

    
    pump = {}
    chlorinator = {}
    circuit = {}
    temperatures = {}
    var configFile = container.settings.getConfig();
    var enabled = configFile.integrations.socketISY
    var ISYConfig = configFile.socketISY
    var ISYVars = configFile.socketISY.Variables
    var socket;
    if (container.settings.get('httpsEnabled')){
        socket = io.connect('https://localhost:3000', {
            secure: true,
            reconnect: true,
            rejectUnauthorized: false
        });
    }
    else {
        socket = io.connect('http://localhost:3000', {
            secure: false,
            reconnect: true,
            rejectUnauthorized: false
        });
    }
    
    function send(name, connectionString) {

        request(connectionString, function(error, response, body) {
            if (error) {
                container.logger.error('ISY: Error writing ISY Variable %s.  Request: %s  (value: %s)', error, name, connectionString)
            } else {
                container.logger.verbose('ISY: Response from ISY: %s %s', response, body)
            }
        })
    }

    function process(name, ISYport, value) {
        //logger.verbose('Sending ISY Rest API Calls')

        var basePath = '/rest/vars/set/2/'

        var options = {
            hostname: ISYConfig.ipaddr,
            port: ISYConfig.port,
            auth: ISYConfig.username + ':' + ISYConfig.password
        }
        var connectionString
        var logconnectionString

        var delayCounter = 0;

        connectionString = 'http://' + options.auth + '@' + options.hostname + ':' + options.port + basePath + ISYport + '/' + value;
        logconnectionString = 'http://' + 'user:pwd' + '@' + options.hostname + ':' + options.port + basePath + ISYport + '/' + value;


        container.logger.verbose('ISY Socket: Sending %s (value: %s) to ISY with URL (%s)', name, value, logconnectionString)
        setTimeout(send, delayCounter, name, connectionString); //500ms delay between http requests to ISY
        delayCounter += 500

    }

    socket.on('chlorinator', function(dataChlor) {
        var data = dataChlor.data
        //console.log('FROM SOCKET CLIENT: ' + JSON.stringify(data))
        for (var prop in data) {
            for (var ISYVar in ISYVars.chlorinator) {
                if (ISYVar === prop && data[prop] !== -1) {
                    //console.log('true')
                    if (!chlorinator.hasOwnProperty(prop)) {
                        chlorinator[prop] = data[prop]
                        process(prop, ISYVars.chlorinator[ISYVar], chlorinator[prop])
                    } else if (chlorinator[prop] !== data[prop]) {
                        chlorinator[prop] = data[prop]
                        process(prop, ISYVars.chlorinator[ISYVar], chlorinator[prop])
                    } else if (chlorinator[prop] === data[prop]) {
                        container.logger.debug('ISY Socket: Will not send %s to ISY because the value has not changed (%s)', prop, chlorinator[prop])

                    }

                }
            }
        }
    })



    socket.on('pump', function(dataPump) {
        var data = dataPump.pump
        for (var v in Object.keys(ISYVars.pump)) {  //Retrieve number of pumps to retrieve from configFile.socketISY.Variables
            var currPump = parseInt(Object.keys(ISYVars.pump)[v]) //fancy way of converting JSON key "pump"."1" to int (1)
            for (var prop in data[currPump]) {  //retrieve values in pump[1]
                for (var ISYVar in ISYVars.pump[currPump]) { //iterate over JSON "pump"."1"."Variables" for a match
                    var varset = 1;  //variable to tell us if there is a value.
                    if (data[currPump][prop] === -1){
                        varset = 0  //set to 0 if the value is -1
                    }
                    else if (data[currPump][prop].toString().toLowerCase().indexOf("notset") >= 0){
                        varset = 0 //or if the value contains "notset"
                    }
                    if (ISYVar === prop && varset) {  //is the ISYVariable and the pump variable the same?  And is the actual value !== -1 or "notset"
                        if (!pump.hasOwnProperty(prop)) {  //If the value isn't previously set...
                            pump[prop] = data[currPump][prop]
                            process(prop, ISYVars.pump[currPump][ISYVar], pump[prop])
                        } else if (pump[prop] !== data[currPump][prop]) {  //if the value isn't equal to what we have stored locally
                            pump[prop] = data[currPump][prop]
                            process(prop, ISYVars.pump[currPump][ISYVar], pump[prop])  //if the value IS equal to what we have stored locally
                        } else if (pump[prop] === data[currPump][prop]) {
                            container.logger.debug('ISY Socket: Will not send %s to ISY because the value has not changed (%s)', prop, pump[prop])
                        }
                    }
                }
            }
        }
    })

    socket.on('circuit', function(dataCirc) {
        var data = dataCirc.circuit
        for (var v in Object.keys(ISYVars.circuit)) {
            var currCircuit = parseInt(Object.keys(ISYVars.circuit)[v])
            for (var prop in data[currCircuit]) {
                var fullprop = prop + currCircuit
                for (var ISYVar in ISYVars.circuit[currCircuit]) {
                    var varset = 1
                    if (data[currCircuit][prop] === -1){
                        varset = 0
                    }
                    else if (data[currCircuit][prop].toString().toLowerCase().indexOf("notset") >= 0){
                        varset = 0
                    }
                    if (ISYVar === prop && varset) {
                        if(!circuit.hasOwnProperty(prop)) {
                            circuit[fullprop] = data[currCircuit][prop]
                            process(prop, ISYVars.circuit[currCircuit][ISYVar], circuit[fullprop])
                        } else if (circuit[fullprop] != data[currCircuit][prop]) {
                            circuit[fullprop] = data[currCircuit][prop]
                            process(prop, ISYVars.circuit[currCircuit][ISYVar], circuit[fullprop])
                        } else if (circuit[fullprop] === data[currCircuit][prop]) {
                            container.logger.debug('ISY Socket: Will not send %s to ISY because the value has not changed (%s)', prop, circuit[fullprop])
                        }
                    }
                }
            }
        }
    })

    socket.on('temperatures', function(data) {
        //console.log('FROM SOCKET CLIENT: ' + JSON.stringify(data))
        for (var prop in data) {
            for (var ISYVar in ISYVars.temperatures) {
                if (ISYVar === prop && data[prop] !== -1) {
                    //console.log('true')
                    if (!temperatures.hasOwnProperty(prop)) {
                        temperatures[prop] = data[prop]
                        process(prop, ISYVars.temperatures[ISYVar], temperatures[prop])
                    } else if (temperatures[prop] !== data[prop]) {
                        temperatures[prop] = data[prop]
                        process(prop, ISYVars.temperatures[ISYVar], temperatures[prop])
                    } else if (temperatures[prop] === data[prop]) {
                        container.logger.debug('ISY Socket: Will not send %s to ISY because the value has not changed (%s)', prop, temperatures[prop])

                    }

                }
            }
        }
    })

    function init() {
        container.logger.verbose('Socket ISY Loaded')
    }

    return {
        init: init
    }
}
