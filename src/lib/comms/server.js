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

// Setup express server, both http and https (looping over the two types, each can support Auth or not - independently)
module.exports = function (container) {

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: server.js');

    var express = container.express, servers = { http: {}, https: {}, ssdp: {}, mdns: {} }
    var path = require('path').posix;
    var defaultPort = { http: 3000, https: 3001 }
    var mdnsEmitter = new container.events.EventEmitter();
    var mdns = { query: [], answers: [] }
    var emitter = new container.events.EventEmitter();

    var httpShutdown = require('http-shutdown')

    function startServerAsync(type) {
        return new Promise(function (resolve, reject) {

            if (container.settings.get(type + 'Enabled')) {

                servers[type].app = express();

                servers[type].port = container.settings.get(type + 'ExpressPort') || defaultPort[type];
                servers[type].server = undefined;

                container.logger.info('Starting up express server, ' + type + ' (port %d)', servers[type].port);

                // And Enable Authentication (if configured)
                if (container.settings.get(type + 'ExpressAuth') === 1) {
                    var auth = container.auth;
                    var basic = auth.basic({
                        file: path.join(process.cwd(), container.settings.get(type + 'ExpressAuthFile'))
                    });
                    servers[type].app.use(auth.connect(basic));
                }

                // Create Server
                if (type === 'https') {
                    var opt_https = {
                        key: container.fs.readFileSync(path.join(process.cwd(), container.settings.get('httpsExpressKeyFile'))),
                        cert: container.fs.readFileSync(path.join(process.cwd(), container.settings.get('httpsExpressCertFile'))),
                        requestCert: false,
                        rejectUnauthorized: false
                    };
                    servers[type].server = container.https.createServer(opt_https, servers[type].app);
                } else
                    servers[type].server = container.http.createServer(servers[type].app);

                // Configure Server
                if (type === 'http' && container.settings.get('httpRedirectToHttps')) {

                    servers[type].app.get('*', function (req, res) {
                        var host = req.get('Host');
                        // replace the port in the host
                        host = host.replace(/:\d+$/, ":" + container.settings.get('httpsExpressPort'));
                        // determine the redirect destination
                        var destination = ['https://', host, req.url].join('');
                        return res.redirect(destination);
                    });

                }
                else
                    configExpressServer(servers[type].app, express);


                // And Start Listening
                servers[type].server = httpShutdown(servers[type].server.listen(servers[type].port, function () {
                    container.logger.verbose('Express Server ' + type + ' listening at port %d', servers[type].port);
                    container.io.init(servers[type].server, type)
                    resolve('Server ' + type + ' started.');
                }));

                servers[type].server.on('error', function (e) {
                    container.logger.error('error from ' + type + ':', e)
                    console.error(e)
                    reject(e)
                });
            }
            else {
                var res = 'Not starting ' + type + ' server.'
                container.logger.debug(res)
                resolve(res)
            }
        });
    }

    function startSSDPServer(type) {
        return new Promise(function (resolve, reject) {
            return container.helpers.getMac()
                .then(function (mac) {
                    container.logger.info('Starting up SSDP server');
                    var udn = 'uuid:806f52f4-1f35-4e33-9299-' + mac
                    var port = container.settings.get(type + 'ExpressPort') || defaultPort[type]
                    var location = type + '://' + container.ip.address() + ':' + port + '/device'
                    var SSDP = container.ssdp.Server
                    servers['ssdp'].server = new SSDP({
                        logLevel: 'INFO',
                        udn: udn,
                        location: location,
                        sourcePort: 1900
                    })
                    servers['ssdp'].isRunning = 0
                    servers['ssdp'].server.addUSN('urn:schemas-upnp-org:device:PoolController:1');
                    // start the server
                    servers['ssdp'].server.start()
                        .then(function () {
                            container.logger.verbose('SSDP/UPnP Server started.')
                            servers['ssdp'].isRunning = 1
                            resolve('Server SSDP started.')
                        });

                    servers['ssdp'].server.on('error', function (e) {
                        container.logger.error('error from SSDP:', e);
                        console.error(e);
                        reject(e);
                    })

                })

        })
    }

    function startMDNS() {
        return new Promise(function (resolve, reject) {
            container.logger.info('Starting up MDNS server');
            servers['mdns'] = container.mdns()

            servers['mdns'].on('response', function (response) {
                //container.logger.silly('got a response packet:', response)
                try {
                    mdns.query.forEach(function (mdnsname) {
                        container.logger.silly('looking to match on ', mdnsname)
                        if (response.answers[0].name.includes(mdnsname)) {
                            // container.logger.silly('TXT data:', response.additionals[0].data.toString())
                            // container.logger.silly('SRV data:', JSON.stringify(response.additionals[1].data))
                            // container.logger.silly('IP Address:', response.additionals[2].data)
                            mdnsEmitter.emit('response', response)
                        }
                    })
                }
                catch (err) {
                    container.logger.error(`ignoring error: ${err}`);
                }
            })

            servers['mdns'].on('query', function (query) {
                //container.logger.silly('got a query packet:', query)
                // if (query.name === '_nodejs._poolcontroller') {
                //     // send an A-record response for example.local
                //     mdns.respond({
                //         answers: [{
                //             name: 'example.local',
                //             type: 'A',
                //             ttl: 300,
                //             data: '192.168.1.5'
                //         }]
                //     })
                // }
            })


            servers['mdns'].isRunning = 1
            servers['mdns'].query({
                questions: [{
                    name: 'myserver.local',
                    type: 'A'
                }]
            },
                resolve('Server MDNS started.'))


        })
    }

    function mdnsQuery(query) {
        if (mdns.query.indexOf(query) === -1) {
            mdns.query.push(query)
        }
        mdns.query.forEach(function (el) {
            container.logger.debug('MDNS: going to send query for ', el)
            servers['mdns'].query({
                questions: [{
                    name: el,
                    type: 'PTR'
                }]
            })
        })
    }

    function initAsync() {
        var serversPromise = []
        serversPromise.push(startServerAsync('https'))
        serversPromise.push(startServerAsync('http'))
        serversPromise.push(startSSDPServer('http'))
        serversPromise.push(startMDNS())


        return Promise.all(serversPromise)
            .then(function (results) {
                bottle.container.logger.debug('Server starting complete.', results)
                emitter.emit('serverstarted', 'success!')
            })
            .catch(function (e) {
                console.error(e)
                container.logger.error('Error starting servers.', e)
                throw new Error('initAsync failed: Error starting servers. ' + e)
            })


    }

    var closeAsync = function (type) {
        return new Promise(function (resolve, reject) {
            if (type === 'mdns') {
                if (servers['mdns'].isRunning) {
                    servers['mdns'].destroy()
                }
                resolve()
            }
            else if (type === 'ssdp') {
                if (servers['ssdp'].isRunning) {
                    servers['ssdp'].server.stop()
                    container.logger.verbose('SSDP/uPNP Server closed');
                }
                resolve()
                // advertise shutting down and stop listening
            }
            else if (servers[type].server !== undefined) {
                container.io.stop(type)
                servers[type].server.close(function () {
                    container.logger.verbose('Express Server ' + type + ' closed');
                    resolve();
                });

                // graceful shutdown thanks to http-shutdown
                servers[type].server.shutdown()
            } else {
                container.logger.debug('Trying to close ' + type + ', but it is not running.');
                resolve();  //it's ok if it isn't running, so resolve the promise.
            }
            // }
        }).catch(function (err) {
            container.logger.error('error closing express or socket server.', err.toString())
            console.error(err)
        });
    }

    var closeAllAsync = function () {
        var serversPromise = []
        serversPromise.push(closeAsync('http'), closeAsync('https'), closeAsync('ssdp'), closeAsync('mdns'))
        return Promise.all(serversPromise)
            .then(function () {
                container.logger.verbose('All express + ssdp servers closed')
            })
            .catch(function (err) {
                container.logger.error('Problem stopping express + ssdp servers')
                console.error(err)
            })
    }

    var getServer = function () {
        return servers;
    };


    function configExpressServer(app, express) {
        // Hook to use custom routes
        var customRoutes = require(path.join(process.cwd(), 'src/integrations/customExpressRoutes'));
        customRoutes.init(app);

        // Middleware
        app.use(function (req, res, next) {
            // Middleware to capture requests to log
            var reqType = req.originalUrl.split('/')
            if (!['bootstrap', 'assets', 'poolController', 'public'].includes(reqType[1])) {

                // if we are in capture packet mode, capture it
                if (container.settings.get('capturePackets')) {
                    container.logger.packet({
                        type: 'url',
                        counter: 0,
                        url: req.originalUrl,
                        direction: 'inbound'
                    })
                }
            }

            /*            console.log('looking at session: ', req.sessionID)
                       //store session in memory store
                       if (req.session.views) {
                           req.session.views++
                           res.setHeader('Content-Type', 'text/html')
                           res.write('<p>views: ' + req.session.views + '</p>')
                           res.write('<p>expires in: ' + (req.session.cookie.maxAge / 1000) + 's</p>')
                           res.write('<p>json session: <br>' + JSON.stringify(req.session) )
                           res.end()
                         } else {
                           req.session.views = 1
                           res.end('welcome to the session demo. refresh!')
                         }
           
                       //output request variables
                       console.log(`Request session: ${req}`)
            */
            next()
        })

        // Routing
        app.use(express.static(path.join(process.cwd(), 'src/www'), { maxAge: '14d' }));
        app.use('/bootstrap', express.static(path.join(process.cwd(), '/node_modules/bootstrap/dist/'), { maxAge: '60d' }));
        app.use('/jquery', express.static(path.join(process.cwd(), '/node_modules/jquery/'), { maxAge: '60d' }));
        app.use('/jquery-ui', express.static(path.join(process.cwd(), '/node_modules/jquery-ui-dist/'), { maxAge: '60d' }));
        app.use('/jquery-clockpicker', express.static(path.join(process.cwd(), '/node_modules/jquery-clockpicker/dist/'), { maxAge: '60d' }));
        app.use('/socket.io-client', express.static(path.join(process.cwd(), '/node_modules/socket.io-client/dist/'), { maxAge: '60d' }));


        // disable for security
        app.disable('x-powered-by')

        /*app.get('/status', function(req, res) {
            res.send(container.status.getCurrentStatus())
        })*/



        app.get('/all', function (req, res) {
            res.send(container.helpers.allEquipmentInOneJSON());
            container.io.emitToClients('all');
        });

        app.get('/one', function (req, res) {
            res.send(container.helpers.allEquipmentInOneJSON());
            container.io.emitToClients('all');
        });

        app.get('/device', function (req, res) {
            container.helpers.deviceXML()
                .then(function (XML) {
                    res.set('Content-Type', 'text/xml');
                    res.send(XML);
                })

        });

        app.get('/config', function (req, res) {
            res.send(container.settings.getConfigOverview())
        })

        /*istanbul ignore next */
        app.get('/reload', function (req, res) {
            container.reload.reloadAsync();
            res.send('reloading configuration');
        });

        app.get('/cancelDelay', function (req, res) {
            res.send(container.circuit.setDelayCancel());
        });

        app.get('/heat', function (req, res) {
            res.send(container.temperatures.getTemperatures());
        });
        app.get('/temperatures', function (req, res) {
            res.send(container.temperatures.getTemperatures());
        });
        app.get('/temperature', function (req, res) {
            res.send(container.temperatures.getTemperatures());
        });
        app.get('/temp', function (req, res) {
            res.send(container.temperatures.getTemperatures());
        });

        app.get('/circuit', function (req, res) {
            res.send(container.circuit.getCurrentCircuits());
        });

        app.get('/schedule', function (req, res) {
            res.send(container.schedule.getCurrentSchedule());
        });
        app.get('/valve', function (req, res) {
            res.send(container.valve.getValve());
        });

        app.get('/schedule/toggle/id/:id/day/:day', function (req, res) {
            var id = parseInt(req.params.id);
            var day = req.params.day;
            var response = {};
            response.text = 'REST API received request to toggle day ' + day + ' on schedule with ID:' + id;
            container.logger.info(response);
            container.schedule.toggleDay(id, day);
            res.send(response);
        });

        app.get('/schedule/delete/id/:id', function (req, res) {
            var id = parseInt(req.params.id);
            var response = {};
            response.text = 'REST API received request to delete schedule or egg timer with ID:' + id;
            container.logger.info(response);
            container.schedule.deleteScheduleOrEggTimer(id);
            res.send(response);
        });

        app.get('/schedule/set/id/:id/startOrEnd/:sOE/hour/:hour/min/:min', function (req, res) {
            var id = parseInt(req.params.id);
            var hour = parseInt(req.params.hour);
            var min = parseInt(req.params.min);
            var response = {};
            response.text = 'REST API received request to set ' + req.params.sOE + ' time on schedule with ID (' + id + ') to ' + hour + ':' + min;
            container.logger.info(response);
            container.schedule.setControllerScheduleStartOrEndTime(id, req.params.sOE, hour, min);
            res.send(response);
        });

        app.get('/schedule/set/id/:id/circuit/:circuit', function (req, res) {
            var id = parseInt(req.params.id);
            var circuit = parseInt(req.params.circuit);
            var response = {};
            response.text = 'REST API received request to set circuit on schedule with ID (' + id + ') to ' + container.circuit.getFriendlyName(circuit)
            container.logger.info(response)
            container.schedule.setControllerScheduleCircuit(id, circuit)
            res.send(response)
        })

        app.get('/eggtimer/set/id/:id/circuit/:circuit/hour/:hour/min/:min', function (req, res) {
            var id = parseInt(req.params.id)
            var circuit = parseInt(req.params.circuit)
            var hr = parseInt(req.params.hour)
            var min = parseInt(req.params.min)
            var response = {}
            response.text = 'REST API received request to set eggtimer with ID (' + id + '): ' + container.circuit.getFriendlyName(circuit) + ' for ' + hr + ' hours, ' + min + ' minutes'
            container.logger.info(response)
            container.schedule.setControllerEggTimer(id, circuit, hr, min)
            res.send(response)
        })

        app.get('/schedule/set/:id/:circuit/:starthh/:startmm/:endhh/:endmm/:days', function (req, res) {
            var id = parseInt(req.params.id)
            var circuit = parseInt(req.params.circuit)
            var starthh = parseInt(req.params.starthh)
            var startmm = parseInt(req.params.startmm)
            var endhh = parseInt(req.params.endhh)
            var endmm = parseInt(req.params.endmm)
            var days = parseInt(req.params.days)
            var response = {}
            response.text = 'REST API received request to set schedule ' + id + ' with values (start) ' + starthh + ':' + startmm + ' (end) ' + endhh + ':' + endmm + ' with days value ' + days
            container.logger.info(response)
            container.schedule.setControllerSchedule(id, circuit, starthh, startmm, endhh, endmm, days)
            res.send(response)
        })

        // TODO:  merge above and this code into single function
        app.get('/setSchedule/:id/:circuit/:starthh/:startmm/:endhh/:endmm/:days', function (req, res) {
            var id = parseInt(req.params.id)
            var circuit = parseInt(req.params.circuit)
            var starthh = parseInt(req.params.starthh)
            var startmm = parseInt(req.params.startmm)
            var endhh = parseInt(req.params.endhh)
            var endmm = parseInt(req.params.endmm)
            var days = parseInt(req.params.days)
            var response = {}
            response.text = 'REST API received request to set schedule ' + id + ' with values (start) ' + starthh + ':' + startmm + ' (end) ' + endhh + ':' + endmm + ' with days value ' + days
            container.logger.info(response)
            container.schedule.setControllerSchedule(id, circuit, starthh, startmm, endhh, endmm, days)
            res.send(response)
        })

        app.get('/time', function (req, res) {
            res.send(container.time.getTime())
        })

        app.get('/datetime', function (req, res) {
            res.send(container.time.getTime())
        })


        //TODO: do we need DOW in these???
        app.get('/datetime/set/time/:hh/:mm/date/:dow/:dd/:mon/:yy/:dst', function (req, res) {
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


        app.get('/datetime/set/time/hour/:hh/min/:mm/date/dow/:dow/day/:dd/mon/:mon/year/:yy/dst/:dst', function (req, res) {
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

        app.get('/pump', function (req, res) {
            res.send(container.pump.getCurrentPumpStatus())
        })

        app.get('/chlorinator', function (req, res) {
            res.send(container.chlorinator.getChlorinatorStatus())
        })

        app.get('/intellichem', function (req, res) {
            res.send(container.intellichem.getCurrentIntellichem())
        })

        // This should be deprecated
        app.get('/chlorinator/:chlorinateLevel', function (req, res) {
            container.chlorinator.setChlorinatorLevelAsync(parseInt(req.params.chlorinateLevel))
                .then(function (response) {
                    res.send(response)
                })
        })

        app.get('/chlorinator/pool/:poolChlorinateLevel', function (req, res) {
            container.chlorinator.setChlorinatorLevelAsync(parseInt(req.params.poolChlorinateLevel))
                .then(function (response) {
                    res.send(response)
                })
        })

        app.get('/chlorinator/spa/:spaChlorinateLevel', function (req, res) {
            container.chlorinator.setChlorinatorLevelAsync(-1, parseInt(req.params.spaChlorinateLevel))
                .then(function (response) {
                    res.send(response)
                })
        })
        
        app.get('/chlorinator/pool/:poolChlorinateLevel/spa/:spaChlorinateLevel', function (req, res) {
            container.chlorinator.setChlorinatorLevelAsync(parseInt(req.params.poolChlorinateLevel), parseInt(req.params.spaChlorinateLevel))
                .then(function (response) {
                    res.send(response)
                })
        })


        app.get('/chlorinator/superChlorinateHours/:hours', function (req, res) {
            container.chlorinator.setChlorinatorLevelAsync(-1, -1, parseInt(req.params.hours))
                .then(function (response) {
                    res.send(response)
                })
        })

        app.get('/chlorinator/pool/:poolChlorinateLevel/spa/:spaChlorinateLevel/superChlorinateHours/:hours', function (req, res) {
            container.chlorinator.setChlorinatorLevelAsync(parseInt(req.params.poolChlorinateLevel), parseInt(req.params.spaChlorinateLevel), parseInt(req.params.hours))
                .then(function (response) {
                    res.send(response)
                })
        })


        app.get('/light/mode/:mode', function (req, res) {
            if (parseInt(req.params.mode) >= 0 && parseInt(req.params.mode) <= 256) {
                res.send(container.circuit.setLightMode(parseInt(req.params.mode)))
            } else {
                res.send('Not a valid light power command.')
            }
        })

        app.get('/light/circuit/:circuit/setColor/:color', function (req, res) {
            if (parseInt(req.params.circuit) > 0 && parseInt(req.params.circuit) <= container.circuit.getNumberOfCircuits()) {
                if (parseInt(req.params.color) >= 0 && parseInt(req.params.color) <= 256) {
                    res.send(container.circuit.setLightColor(parseInt(req.params.circuit), parseInt(req.params.color)))
                } else {
                    res.send('Not a valid light set color.')
                }
            }
        })

        app.get('/light/circuit/:circuit/setSwimDelay/:delay', function (req, res) {
            if (parseInt(req.params.circuit) > 0 && parseInt(req.params.circuit) <= container.circuit.getNumberOfCircuits()) {
                if (parseInt(req.params.delay) >= 0 && parseInt(req.params.delay) <= 256) {
                    res.send(container.circuit.setLightSwimDelay(parseInt(req.params.circuit), parseInt(req.params.delay)))
                } else {
                    res.send('Not a valid light swim delay.')
                }
            }
        })

        app.get('/light/circuit/:circuit/setPosition/:position', function (req, res) {
            if (parseInt(req.params.circuit) > 0 && parseInt(req.params.circuit) <= container.circuit.getNumberOfCircuits()) {
                if (parseInt(req.params.position) >= 0 && parseInt(req.params.position) <= container.circuit.getNumberOfCircuits()) {
                    res.send(container.circuit.setLightPosition(parseInt(req.params.circuit), parseInt(req.params.position)))
                } else {
                    res.send('Not a valid light position.')
                }
            }
        })

        app.get('/circuit/:circuit', function (req, res) {
            if (parseInt(req.params.circuit) > 0 && parseInt(req.params.circuit) <= container.circuit.getNumberOfCircuits()) {
                res.send(container.circuit.getCircuit(parseInt(req.params.circuit)))
            } else {
                res.send('Not a valid circuit')
            }
        })

        app.get('/circuit/:circuit/toggle', function (req, res) {
            container.circuit.toggleCircuit(parseInt(req.params.circuit), function (response) {
                res.send(response)
            })
        })

        app.get('/circuit/:circuit/set/:set', function (req, res) {
            container.circuit.setCircuit(parseInt(req.params.circuit), parseInt(req.params.set), function (response) {
                res.send(response)
            })
        })

        app.get('/spaheat/setpoint/:spasetpoint', function (req, res) {
            container.heat.setSpaSetPoint(parseInt(req.params.spasetpoint), function (response) {
                res.send(response)
            })
        })

        app.get('/spaheat/increment', function (req, res) {
            container.heat.incrementSpaSetPoint(1, function (response) {
                res.send(response)
            })
        })

        app.get('/spaheat/increment/:spasetpoint', function (req, res) {
            container.heat.incrementSpaSetPoint(parseInt(req.params.spasetpoint), function (response) {
                res.send(response)
            })
        })

        app.get('/spaheat/decrement', function (req, res) {
            container.heat.decrementSpaSetPoint(1, function (response) {
                res.send(response)
            })
        })

        app.get('/spaheat/decrement/:spasetpoint', function (req, res) {
            container.heat.decrementSpaSetPoint(parseInt(req.params.spasetpoint), function (response) {
                res.send(response)
            })
        })

        app.get('/spaheat/mode/:spaheatmode', function (req, res) {
            container.heat.setSpaHeatMode(parseInt(req.params.spaheatmode), function (response) {
                res.send(response)
            })
        })

        app.get('/poolheat/setpoint/:poolsetpoint', function (req, res) {
            container.heat.setPoolSetPoint(parseInt(req.params.poolsetpoint), function (response) {
                res.send(response)
            })
        })

        app.get('/poolheat/decrement', function (req, res) {
            container.heat.decrementPoolSetPoint(1, function (response) {
                res.send(response)
            })
        })


        app.get('/poolheat/decrement/:poolsetpoint', function (req, res) {
            container.heat.decrementPoolSetPoint(parseInt(req.params.poolsetpoint), function (response) {
                res.send(response)
            })
        })

        app.get('/poolheat/increment', function (req, res) {
            container.heat.incrementPoolSetPoint(1, function (response) {
                res.send(response)
            })
        })

        app.get('/poolheat/increment/:poolsetpoint', function (req, res) {
            container.heat.incrementPoolSetPoint(parseInt(req.params.poolsetpoint), function (response) {
                res.send(response)
            })
        })

        app.get('/poolheat/mode/:poolheatmode', function (req, res) {
            container.heat.setPoolHeatMode(parseInt(req.params.poolheatmode), function (response) {
                res.send(response)
            })

        })

        app.get('/sendthispacket/:packet', function (req, res) {
            container.queuePacket.sendThisPacket(req.params.packet, function (response) {
                res.send(response)
            })

        })

        app.get('pumpCommand/pump/:pump/type/:type', function (req, res) {
            var pump = parseInt(req.params.pump)
            var type = type
            var response = {}
            response.text = 'Socket setPumpType variables - pump: ' + pump + ', type: ' + type
            response.pump = pump
            response.type = type
            container.settings.updatePumpTypeAsync(pump, type)
            container.logger.info(response)
        })

        /* New pumpCommand API's  */
        //#1  Turn pump off
        app.get('/pumpCommand/off/pump/:pump', function (req, res) {
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
        app.get('/pumpCommand/run/pump/:pump', function (req, res) {
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
        app.get('/pumpCommand/run/pump/:pump/duration/:duration', function (req, res) {
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
        app.get('/pumpCommand/run/pump/:pump/program/:program', function (req, res) {
            var pump = parseInt(req.params.pump)
            var program = parseInt(req.params.program)

            //TODO: Push the callback into the pump functions so we can get confirmation back and not simply regurgitate the request
            var response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', program: ' + program + ', value: null, duration: null'
            response.pump = pump
            response.program = program
            response.duration = -1
            container.pumpControllerTimers.startProgramTimer(pump, program, -1)
            res.send(response)
        })

        //#5 Run pump program for a specified duration
        app.get('/pumpCommand/run/pump/:pump/program/:program/duration/:duration', function (req, res) {
            var pump = parseInt(req.params.pump)
            var program = parseInt(req.params.program)
            var duration = parseInt(req.params.duration)
            var response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', program: ' + program + ', duration: ' + duration
            response.pump = pump
            response.program = program
            response.duration = duration
            container.pumpControllerTimers.startProgramTimer(pump, program, duration)
            res.send(response)
        })

        //#6 Run pump at RPM for an indefinite duration
        app.get('/pumpCommand/run/pump/:pump/rpm/:rpm', function (req, res) {
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
        app.get('/pumpCommand/run/pump/:pump/rpm/:rpm/duration/:duration', function (req, res) {
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
        app.get('/pumpCommand/save/pump/:pump/program/:program/rpm/:speed', function (req, res) {
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
        app.get('/pumpCommand/saverun/pump/:pump/program/:program/rpm/:speed', function (req, res) {
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
        app.get('/pumpCommand/saverun/pump/:pump/program/:program/rpm/:speed/duration/:duration', function (req, res) {
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
        app.get('/pumpCommand/run/pump/:pump/gpm/:gpm', function (req, res) {
            var pump = parseInt(req.params.pump)
            var gpm = parseInt(req.params.gpm)
            var response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', gpm: ' + gpm + ', duration: -1'
            response.pump = pump
            response.speed = gpm
            response.duration = -1
            // container.pumpControllerMiddleware.runGPMSequence(pump, gpm)
            container.pumpControllerTimers.startGPMTimer(pump, gpm, -1)
            res.send(response)
        })

        //#12 Run pump at GPM for specified duration
        app.get('/pumpCommand/run/pump/:pump/gpm/:gpm/duration/:duration', function (req, res) {
            var pump = parseInt(req.params.pump)
            var gpm = parseInt(req.params.gpm)
            var duration = parseInt(req.params.duration)
            var response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', gpm: ' + gpm + ', duration: ' + duration
            response.pump = pump
            response.speed = gpm
            response.duration = duration
            container.pumpControllerTimers.startGPMTimer(pump, gpm, duration)
            res.send(response)
        })

        //#13  Save program to pump
        app.get('/pumpCommand/save/pump/:pump/program/:program/gpm/:speed', function (req, res) {
            var pump = parseInt(req.params.pump)
            var program = parseInt(req.params.program)
            var speed = parseInt(req.params.speed)
            var response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', program: ' + program + ', gpm: ' + speed + ', duration: null'
            response.pump = pump
            response.program = program
            response.speed = speed
            response.duration = null
            if (container.pumpControllerMiddleware.pumpCommandSaveProgram(pump, program, speed)) {
                res.send(response)

            }
            else {
                response.text = 'FAIL: ' + response.text
                res.send(response)
            }
        })

        //#14  Save and run program for indefinite duration
        app.get('/pumpCommand/saverun/pump/:pump/program/:program/gpm/:speed', function (req, res) {
            var pump = parseInt(req.params.pump)
            var program = parseInt(req.params.program)
            var speed = parseInt(req.params.speed)
            var response = {}
            response.text = 'REST API pumpCommand variables - pump: ' + pump + ', program: ' + program + ', speed: ' + speed + ', duration: indefinite'
            response.pump = pump
            response.program = program
            response.speed = speed
            response.duration = -1
            if (container.pumpControllerMiddleware.pumpCommandSaveAndRunProgramWithValueForDuration(pump, program, speed, -1))
                res.send(response)
            else {
                response.text = 'FAIL: ' + response.text
                res.send(response)
            }
        })

        //#15  Save and run program for specified duration

        app.get('/pumpCommand/saverun/pump/:pump/program/:program/gpm/:speed/duration/:duration', function (req, res) {
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
            if (container.pumpControllerMiddleware.pumpCommandSaveAndRunProgramWithValueForDuration(pump, program, speed, duration)) {
                res.send(response)
            }
            else {
                response.text = 'FAIL: ' + response.text
                res.send(response)
            }

        })

        /* END New pumpCommand API's  */


        /* Invalid pump commands -- sends response */
        app.get('/pumpCommand/save/pump/:pump/rpm/:rpm', function (req, res) {
            //TODO:  this should be valid.  Just turn the pump on with no program at a specific speed.  Maybe 5,1,1 (manual)?
            var response = {}
            response.text = 'FAIL: Please provide the program number when saving the program.  /pumpCommand/save/pump/#/program/#/rpm/#'
            res.send(response)
        })


        app.get('/pumpCommand/save/pump/:pump/program/:program', function (req, res) {
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

    }


    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: server.js');

    return {
        getServer: getServer,
        closeAsync: closeAsync,
        closeAllAsync: closeAllAsync,
        initAsync: initAsync,
        mdnsQuery: mdnsQuery,
        emitter: emitter,
        mdnsEmitter: mdnsEmitter
    };
};

