import * as http from 'http';
import { settings, logger, server } from '../etc/internal';
import * as io from 'socket.io-client';
// import * as server from '../lib/comms/server';
import * as events from 'events'; 

    var configFile = settings.getConfig()

    var address = configFile.outputToSmartThings.address
    var port = configFile.outputToSmartThings.port
    var secureTransport = configFile.poolController.https.enabled === 1 ? true : false
    var logEnabled = 0


    var serverURL;

    if (configFile.outputToSmartThings.hasOwnProperty("logEnabled")) {
        logEnabled = configFile.outputToSmartThings.logEnabled
    }


    if (secureTransport) {
        serverURL = 'https://localhost:' + configFile.poolController.https.expressPort
    } else {
        serverURL = 'http://localhost:' + configFile.poolController.http.expressPort
    }

    var socket = io.connect(serverURL, {
        secure: secureTransport,
        reconnection: true,
        rejectUnauthorized: false
    });

    function notify(event: string, data: number[]) {
        if (address !== '*') {
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
            req.on('error', function (err: any, req: any, res: any) {
                logger.error(err);
            });
            req.write(json);
            req.end();
            if (logEnabled) {
                logger.debug('outputToSmartThings sent event %s', event)
                logger.silly('outputToSmartThings (' + address + ':' + port + ') Sent ' + event + "'" + json + "'")
            }
        }

    }

    socket.on('all', function (data: number[]) {
        notify('all', data)
    })

    socket.on('circuit', function (data: number[]) {
        notify('circuit', data)
    })


    socket.on('chlorinator', function (data: number[]) {
        notify('chlorinator', data)
    })

    function init() {

            logger.info('outputToSmartThings Loaded. \n\taddress: %s\n\tport: %s\n\tsecure: %s', address, port, secureTransport)
        if (!logEnabled) {
            logger.info('outputToSmartThings log NOT enabled.  This will be the last message displayed by this integration.')

        }
    }

    var mdns = new events.EventEmitter();
    mdns.on('response', function (response) {
        if (address !== response.additionals[2].data) {
            //console.log('in ST: TXT data:', response.additionals[0].data.toString())
            //console.log('in ST: SRV data:', JSON.stringify(response.additionals[1].data))
            //console.log('in ST: IP Address:', response.additionals[2].data)
            address = response.additionals[2].data
            if (logEnabled) {
                logger.info('outputToSmartThings: Hub address updated to:', address)
            }
            // close mdns server if we don't need it... or keep it open if you think the IP address of ST will change
            server.closeAsync('mdns')
        }

    })
    server.mdnsQuery('_smartthings._tcp.local')
