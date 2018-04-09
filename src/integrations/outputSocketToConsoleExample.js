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


//This makes the module available to the app through BottleJS
module.exports = function(container) {

    //load the configuration file
    var configFile = container.settings.getConfig()
        //and read the variables we put there
    var level = configFile.outputSocketToConsoleExample.level
    var protocol_http = configFile.poolController.http.enabled
    var protocol_https = configFile.poolController.https.enabled
    var serverURL;
    var secureTransport;
    //The following IF statement sets the varibles if the transport is either HTTP or HTTPS
    if (protocol_https === 0) {
        serverURL = 'http://localhost:' + bottle.container.settings.get('httpExpressPort') + '/'
        secureTransport = false
    } else {
        serverURL = 'https://localhost:' + bottle.container.settings.get('httpsExpressPort') + '/'
        secureTransport = true
    }

    //we listen to events with the socket client
    var io = container.socketClient
    var socket = io.connect(serverURL, {
        secure: secureTransport,
        reconnect: true,
        rejectUnauthorized: false
    });

    //This is a listener for the time event.  data is what is received.
    socket.on('time', function(data) {
        console.log('outputSocketToConsoleExample: The time was broadcast, and it was received.  The time is: %s', JSON.stringify(data))
    })

    //The 'connect' function fires when the socket is connected
    socket.on('connect', function(err) {
        console.log('outputSocketToConsoleExample: Socket connected to socket @ %s (secure: %s)', serverURL, secureTransport)
    })

    //The 'error' function fires if there is an error connecting to the socket
    socket.on('error', function(err) {
        console.log('outputSocketToConsoleExample: Error connecting to socket @ %s (secure: %s)', serverURL, secureTransport)
    })

    socket.on('schedule', function(data){
      console.log('outputSocketToConsoleExample: The schedules were broadcast, and it was received.  The schedules are: %s', JSON.stringify(data, null, 4))
    })

    //This init can be this simple.  It just lets us know the integration is running
    function init() {
        //to log through all the logger channels (formatting, to the Bootstrap debug, etc, use "container.logger")
        //we are using our variable, level, to set the level of the logger here
        container.logger[level]('outputSocketToConsoleExample Loaded.')
    }

    //This makes the init() function available to the app globally
    return {
        init: init
    }
}
