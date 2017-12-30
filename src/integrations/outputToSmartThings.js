module.exports = function(container) {

    var http = require('http');

    var configFile = container.settings.getConfig()

    var address = configFile.outputToSmartThings.address
    var port = configFile.outputToSmartThings.port
    var protocol = configFile.outputToSmartThings.serverProtocol || 'http'

    var serverURL;
    var secureTransport;
    
    if (protocol === 'http') {
        serverURL = 'http://localhost:' + container.settings.get('httpExpressPort')
        secureTransport = false
    } else {
        serverURL = 'https://localhost:' + container.settings.get('httpsExpressPort')
        secureTransport = true
    }

    var io = container.socketClient
    var socket = io.connect(serverURL, {
        secure: secureTransport,
        reconnect: true,
        rejectUnauthorized: false
    });

    function notify(event, data) {
        var json = JSON.stringify(data)

        var opts = {
            method: 'NOTIFY',
            host: address,
            port: port,
            path: '/notify',
            headers: {
              'CONTENT-TYPE': 'application/json',
              'CONTENT-LENGTH': Buffer.byteLength(json),
              'X-EVENT': event,
            }
          };

        var req = http.request(opts);
        req.on('error', function(err, req, res) {
          container.logger.error(err);
        });
        req.write(json);
        req.end();
		container.logger.verbose('smartthings Sent ' + event + "'" + json + "'")		
    }

    socket.on('all', function(data) {
      notify('all', data)
    })

	 socket.on('circuit', function(data) {
      notify('circuit', data)
    })
	
    socket.on('temp', function(data) {
      notify('temp', data)
    })

	socket.on('chlorinator', function(data) {
		notify('chlorinator',data)
	})
	
    function init() {
        container.logger.verbose('smartthings Loaded.')
    }

    return {
        init: init
    }
}