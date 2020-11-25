/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
import * as path from "path";
import * as fs from "fs";
import express = require('express');
import { utils } from "../controller/Constants";
import { config } from "../config/Config";
import { logger } from "../logger/Logger";
import socketio = require("socket.io");
const sockClient = require('socket.io-client');
import { ConfigRoute } from "./services/config/Config";
import { StateRoute } from "./services/state/State";
import { StateSocket } from "./services/state/StateSocket";
import { UtilitiesRoute } from "./services/utilities/Utilities";
import * as http2 from "http2";
import * as http from "http";
import * as https from "https";
import { state } from "../controller/State";
import { conn } from "../controller/comms/Comms";
import { Inbound, Outbound } from "../controller/comms/messages/Messages";
import { EventEmitter } from 'events';
import { sys } from '../controller/Equipment';
import * as multicastdns from 'multicast-dns';
import * as ssdp from 'node-ssdp';
import * as os from 'os';
import { URL } from "url";
import { HttpInterfaceBindings } from './interfaces/httpInterface';
import { InfluxInterfaceBindings } from './interfaces/influxInterface';
import { MqttInterfaceBindings } from './interfaces/mqttInterface';
import { Timestamp } from '../controller/Constants';
import extend = require("extend");
import { ConfigSocket } from "./services/config/ConfigSocket";


// This class serves data and pages for
// external interfaces as well as an internal dashboard.
export class WebServer {
    private _servers: ProtoServer[] = [];
    private family = 'IPv4';
    constructor() { }
    public init() {
        let cfg = config.getSection('web');
        let srv;
        for (let s in cfg.servers) {
            let c = cfg.servers[s];
            if (typeof c.uuid === 'undefined') {
                c.uuid = utils.uuid();
                config.setSection(`web.servers.${s}`, c);
            }
            switch (s) {
                case 'http':
                    srv = new HttpServer(s, s);
                    break;
                case 'http2':
                    srv = new Http2Server(s, s);
                    break;
                case 'https':
                    srv = new HttpsServer(s, s);
                    break;
                case 'mdns':
                    srv = new MdnsServer(s, s);
                    break;
                case 'ssdp':
                    srv = new SsdpServer(s, s);
                    break;
            }
            if (typeof srv !== 'undefined') {
                this._servers.push(srv);
                srv.init(c);
                srv = undefined;
            }
        }
        for (let s in cfg.interfaces) {
            let int;
            let c = cfg.interfaces[s];
            if (typeof c.uuid === 'undefined') {
                c.uuid = utils.uuid();
                config.setSection(`web.interfaces.${s}`, c);
            }
            if (!c.enabled) continue;
            let type = c.type || 'http';
            logger.info(`Init ${type} interface: ${c.name}`);
            switch (type) {
                case 'http':
                    int = new HttpInterfaceServer(c.name, type);
                    int.init(c);
                    this._servers.push(int);
                    break;
                case 'influx':
                    int = new InfluxInterfaceServer(c.name, type);
                    int.init(c);
                    this._servers.push(int);
                    break;
                case 'mqtt':
                    int = new MqttInterfaceServer(c.name, type);
                    int.init(c);
                    this._servers.push(int);
                    break;
                case 'rem':
                    int = new REMInterfaceServer(c.name, type);
                    int.init(c);
                    this._servers.push(int);
                    break;
            }
        }
    }
    public emitToClients(evt: string, ...data: any) {
        for (let i = 0; i < this._servers.length; i++) {
            this._servers[i].emitToClients(evt, ...data);
        }
    }
    public emitToChannel(channel: string, evt: string, ...data: any) {
        for (let i = 0; i < this._servers.length; i++) {
            this._servers[i].emitToChannel(channel, evt, ...data);
        }
    }
    public get mdnsServer(): MdnsServer { return this._servers.find(elem => elem instanceof MdnsServer) as MdnsServer; }
    public deviceXML() { } // override in SSDP
    public stop() {
        for (let s in this._servers) {
            if (typeof this._servers[s].stop() === 'function') this._servers[s].stop();
        }
    }
    private getInterface() {
        const networkInterfaces = os.networkInterfaces();
        // RKS: We need to get the scope-local nic. This has nothing to do with IP4/6 and is not necessarily named en0 or specific to a particular nic.  We are
        // looking for the first IPv4 interface that has a mac address which will be the scope-local address.  However, in the future we can simply use the IPv6 interface
        // if that is returned on the local scope but I don't know if the node ssdp server supports it on all platforms.
        for (let name in networkInterfaces) {
            let nic = networkInterfaces[name];
            for (let ndx in nic) {
                let addr = nic[ndx];
                // All scope-local addresses will have a mac.  In a multi-nic scenario we are simply grabbing
                // the first one we come across.
                if (!addr.internal && addr.mac.indexOf('00:00:00:') < 0 && addr.family === this.family) {
                    return addr;
                }
            }
        }
    }
    public ip() {
        return typeof this.getInterface() === 'undefined' ? '0.0.0.0' : this.getInterface().address;
    }
    public mac() {
        return typeof this.getInterface() === 'undefined' ? '00:00:00:00' : this.getInterface().mac;
    }
    public findServer(name: string): ProtoServer { return this._servers.find(elem => elem.name === name); }
    public findServersByType(type: string) { return this._servers.filter(elem => elem.type === type);  }
}
class ProtoServer {
    constructor(name: string, type: string) { this.name = name; this.type = type; }
    public name: string;
    public type: string;
    public uuid: string;
    // base class for all servers.
    public isRunning: boolean = false;
    public get isConnected() { return this.isRunning; }
    public emitToClients(evt: string, ...data: any) { }
    public emitToChannel(channel: string, evt: string, ...data: any) { }
    public stop() { }
    protected _dev: boolean = process.env.NODE_ENV !== 'production';
    // todo: how do we know if the client is using IPv4/IPv6?
}
export class Http2Server extends ProtoServer {
    public server: http2.Http2Server;
    public app: Express.Application;
    public init(cfg) {
        this.uuid = cfg.uuid;
        if (cfg.enabled) {
            this.app = express();
            // TODO: create a key and cert at some time but for now don't fart with it.
        }
    }
}
export class HttpServer extends ProtoServer {
    // Http protocol
    public app: express.Application;
    public server: http.Server;
    public sockServer: socketio.Server;
    //public parcel: parcelBundler;
    private _sockets: socketio.Socket[] = [];
    //private _pendingMsg: Inbound;
    public emitToClients(evt: string, ...data: any) {
        if (this.isRunning) {
            // console.log(JSON.stringify({evt:evt, msg: 'Emitting...', data: data },null,2));
            this.sockServer.emit(evt, ...data);
        }
    }
    public emitToChannel(channel: string, evt: string, ...data: any) {
        //console.log(`Emitting to channel ${channel} - ${evt}`)
        if (this.isRunning) this.sockServer.to(channel).emit(evt, ...data);
    }
    public get isConnected() { return typeof this.sockServer !== 'undefined' && this._sockets.length > 0; }
    protected initSockets() {
        this.sockServer = socketio(this.server, { cookie: false });

        //this.sockServer.origins('*:*');
        this.sockServer.on('error', (err) => {
            logger.error('Socket server error %s', err.message);
        });
        this.sockServer.on('connect_error', (err) => {
            logger.error('Socket connection error %s', err.message);
        });
        this.sockServer.on('reconnect_failed', (err) => {
            logger.error('Failed to reconnect with socket %s', err.message);
        });
        this.sockServer.on('connection', (sock: socketio.Socket) => {
            logger.info(`New socket client connected ${sock.id} -- ${sock.client.conn.remoteAddress}`);
            this.socketHandler(sock);
            this.sockServer.emit('controller', state.controllerState);
            sock.conn.emit('controller', state.controllerState);
        });
        this.app.use('/socket.io-client', express.static(path.join(process.cwd(), '/node_modules/socket.io-client/dist/'), { maxAge: '60d' }));
    }

    private socketHandler(sock: socketio.Socket) {
        let self = this;
        this._sockets.push(sock);
        sock.on('error', (err) => {
            logger.error('Error with socket: %s', err);
        });
        sock.on('close', (id) => {
            for (let i = this._sockets.length; i >= 0; i--) {
                if (this._sockets[i].id === id) {
                    let s = this._sockets[i];
                    logger.info('Socket diconnecting %s', s.conn.remoteAddress);
                    s.disconnect();
                    this._sockets.splice(i, 1);
                }
            }
        });
        sock.on('echo', (msg) => { sock.emit('echo', msg); });
        sock.on('receivePacketRaw', function (incomingPacket: any[]) {
            //var str = 'Add packet(s) to incoming buffer: ';
            logger.silly('User request (replay.html) to RECEIVE packet: %s', JSON.stringify(incomingPacket));
            for (var i = 0; i < incomingPacket.length; i++) {
                conn.buffer.pushIn(Buffer.from(incomingPacket[i]));
                // str += JSON.stringify(incomingPacket[i]) + ' ';
            }
            //logger.info(str);
        });
        sock.on('replayPackets', function (inboundPkts: number[][]) {
            // used for replay
            logger.debug(`Received replayPackets: ${inboundPkts}`);
            inboundPkts.forEach(inbound => {
                conn.buffer.pushIn(Buffer.from([].concat.apply([], inbound)));
                // conn.queueInboundMessage([].concat.apply([], inbound));
            });
        });
        sock.on('sendPackets', function (bytesToProcessArr: number[][]) {
            // takes an input of bytes (src/dest/action/payload) and sends
            if (!bytesToProcessArr.length) return;
            logger.silly('User request (replay.html) to SEND packet: %s', JSON.stringify(bytesToProcessArr));

            do {
                let bytesToProcess: number[] = bytesToProcessArr.shift();

                // todo: logic for chlor packets
                let out = Outbound.create({
                    source: bytesToProcess.shift(),
                    dest: bytesToProcess.shift(),
                    action: bytesToProcess.shift(),
                    payload: bytesToProcess.splice(1, bytesToProcess[0])
                });
                conn.queueSendMessage(out);
            } while (bytesToProcessArr.length > 0);

        });
        sock.on('sendOutboundMessage', (mdata) => {
            let msg: Outbound = Outbound.create({});
            Object.assign(msg, mdata);
            msg.calcChecksum();
            logger.silly(`sendOutboundMessage ${msg.toLog()}`);
            conn.queueSendMessage(msg);
        });
        sock.on('sendLogMessages', function (sendMessages: boolean) {
            console.log(`sendLogMessages set to ${sendMessages}`);
            if (!sendMessages) sock.leave('msgLogger');
            else sock.join('msgLogger');
        });
        StateSocket.initSockets(sock);
        ConfigSocket.initSockets(sock);
    }
    public init(cfg) {
        this.uuid = cfg.uuid;
        if (cfg.enabled) {
            this.app = express();

            //this.app.use();
            this.server = http.createServer(this.app);
            if (cfg.httpsRedirect) {
                var cfgHttps = config.getSection('web').server.https;
                this.app.get('*', (res: express.Response, req: express.Request) => {
                    let host = res.get('host');
                    // Only append a port if there is one declared.  This will be the case for urls that have have an implicit port.
                    host = host.replace(/:\d+$/, typeof cfgHttps.port !== 'undefined' ? ':' + cfgHttps.port : '');
                    return res.redirect('https://' + host + req.url);
                });
            }
            this.app.use(express.json());
            this.app.use((req, res, next) => {
                res.header('Access-Control-Allow-Origin', '*');
                res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, api_key, Authorization'); // api_key and Authorization needed for Swagger editor live API document calls
                res.header('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, PUT, DELETE');
                if ('OPTIONS' === req.method) { res.sendStatus(200); }
                else {
                    if (req.url !== '/device') {
                        logger.info(`[${new Date().toLocaleTimeString()}] ${req.ip} ${req.method} ${req.url} ${typeof req.body === 'undefined' ? '' : JSON.stringify(req.body)}`);
                        logger.logAPI(`{"dir":"in","proto":"api","requestor":"${req.ip}","method":"${req.method}","path":"${req.url}",${typeof req.body === 'undefined' ? '' : `"body":${JSON.stringify(req.body)},`}"ts":"${Timestamp.toISOLocal(new Date())}"}${os.EOL}`);
                    }
                    next();
                }
            });


            // Put in a custom replacer so that we can send error messages to the client.  If we don't do this the base properties of Error
            // are omitted from the output.
            this.app.set('json replacer', (key, value) => {
                if (value instanceof Error) {
                    var err = {};
                    Object.getOwnPropertyNames(value).forEach((prop) => {
                        if (prop === "level") err[prop] = value[prop].replace(/\x1b\[\d{2}m/g, '') // remove color from level
                        else err[prop] = value[prop];
                    });
                    return err;
                }
                return value;
            });

            ConfigRoute.initRoutes(this.app);
            StateRoute.initRoutes(this.app);
            UtilitiesRoute.initRoutes(this.app);

            // The socket initialization needs to occur before we start listening.  If we don't then
            // the headers from the server will not be picked up.
            this.initSockets();
            this.app.use((error, req, res, next) => {
                logger.error(error);
                if (!res.headersSent) {
                    let httpCode = error.httpCode || 500;
                    res.status(httpCode).send(error);
                }
            });

            // start our server on port
            this.server.listen(cfg.port, cfg.ip, function () {
                logger.info('Server is now listening on %s:%s', cfg.ip, cfg.port);
            });
            this.isRunning = true;
        }
    }
}
export class HttpsServer extends HttpServer {
    public server: https.Server;
    
    public init(cfg) {
        // const auth = require('http-auth');
        this.uuid = cfg.uuid;
        if (!cfg.enabled) return;
        try {
            this.app = express();
            // Enable Authentication (if configured)
/*             if (cfg.authentication === 'basic') {
                let basic = auth.basic({
                    realm: "nodejs-poolController.",
                    file: path.join(process.cwd(), cfg.authFile)
                })
                this.app.use(function(req, res, next) {
                        (auth.connect(basic))(req, res, next);
                });
            } */
            if (cfg.sslKeyFile === '' || cfg.sslCertFile === '' || !fs.existsSync(path.join(process.cwd(), cfg.sslKeyFile)) || !fs.existsSync(path.join(process.cwd(), cfg.sslCertFile))) { 
                logger.warn(`HTTPS not enabled because key or crt file is missing.`); 
                return;
            }
            let opts = {
                key: fs.readFileSync(path.join(process.cwd(), cfg.sslKeyFile), 'utf8'),
                cert: fs.readFileSync(path.join(process.cwd(), cfg.sslCertFile), 'utf8'),
                requestCert: false,
                rejectUnauthorized: false
            }
            this.server = https.createServer(opts, this.app);

            this.app.use(express.json());
            this.app.use((req, res, next) => {
                res.header('Access-Control-Allow-Origin', '*');
                res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, api_key, Authorization'); // api_key and Authorization needed for Swagger editor live API document calls
                res.header('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, PUT, DELETE');
                if ('OPTIONS' === req.method) { res.sendStatus(200); }
                else {
                    if (req.url !== '/device') {
                        logger.info(`[${new Date().toLocaleString()}] ${req.ip} ${req.method} ${req.url} ${typeof req.body === 'undefined' ? '' : JSON.stringify(req.body)}`);
                        logger.logAPI(`{"dir":"in","proto":"api","requestor":"${req.ip}","method":"${req.method}","path":"${req.url}",${typeof req.body === 'undefined' ? '' : `"body":${JSON.stringify(req.body)},`}"ts":"${Timestamp.toISOLocal(new Date())}"}${os.EOL}`);
                    }
                    next();
                }
            });


            // Put in a custom replacer so that we can send error messages to the client.  If we don't do this the base properties of Error
            // are omitted from the output.
            this.app.set('json replacer', (key, value) => {
                if (value instanceof Error) {
                    var err = {};
                    Object.getOwnPropertyNames(value).forEach((prop) => {
                        if (prop === "level") err[prop] = value[prop].replace(/\x1b\[\d{2}m/g, '') // remove color from level
                        else err[prop] = value[prop];
                    });
                    return err;
                }
                return value;
            });

            ConfigRoute.initRoutes(this.app);
            StateRoute.initRoutes(this.app);
            UtilitiesRoute.initRoutes(this.app);

            // The socket initialization needs to occur before we start listening.  If we don't then
            // the headers from the server will not be picked up.
            this.initSockets();
            this.app.use((error, req, res, next) => {
                logger.error(error);
                if (!res.headersSent) {
                    let httpCode = error.httpCode || 500;
                    res.status(httpCode).send(error);
                }
            });

            // start our server on port
            this.server.listen(cfg.port, cfg.ip, function () {
                logger.info('Server is now listening on %s:%s', cfg.ip, cfg.port);
            });
            this.isRunning = true;
        }
        catch (err) {
            logger.error(`Error starting up https server: ${err}`)
        }
    }
}
export class SsdpServer extends ProtoServer {
    // Simple service discovery protocol
    public server: any; //node-ssdp;
    public init(cfg) {
        this.uuid = cfg.uuid;
        if (cfg.enabled) {
            let self = this;

            logger.info('Starting up SSDP server');
            var udn = 'uuid:806f52f4-1f35-4e33-9299-' + webApp.mac();
            // todo: should probably check if http/https is enabled at this point
            var port = config.getSection('web').servers.http.port || 4200;
            //console.log(port);
            let location = 'http://' + webApp.ip() + ':' + port + '/device';
            var SSDP = ssdp.Server;
            this.server = new SSDP({
                logLevel: 'INFO',
                udn: udn,
                location: location,
                sourcePort: 1900
            });
            this.server.addUSN('urn:schemas-upnp-org:device:PoolController:1');

            // start the server
            this.server.start()
                .then(function () {
                    logger.silly('SSDP/UPnP Server started.');
                    self.isRunning = true;
                });

            this.server.on('error', function (e) {
                logger.error('error from SSDP:', e);
            });
        }
    }
    public static deviceXML() {
        let ver = sys.appVersion;
        let XML = `<?xml version="1.0"?>
                        <root xmlns="urn:schemas-upnp-org:PoolController-1-0">
                            <specVersion>
                                <major>${ver.split('.')[0]}</major>
                                <minor>${ver.split('.')[1]}</minor>
                                <patch>${ver.split('.')[2]}</patch>
                            </specVersion>
                            <device>
                                <deviceType>urn:echo:device:PoolController:1</deviceType>
                                <friendlyName>NodeJS Pool Controller</friendlyName> 
                                <manufacturer>tagyoureit</manufacturer>
                                <manufacturerURL>https://github.com/tagyoureit/nodejs-poolController</manufacturerURL>
                                <modelDescription>An application to control pool equipment.</modelDescription>
                                <serialNumber>0</serialNumber>
                    			<UDN>uuid:806f52f4-1f35-4e33-9299-${webApp.mac()}</UDN>
                                <serviceList></serviceList>
                            </device>
                        </root>`;
        return XML;
    }
    public stop() {
        this.server.stop();
    }
}
export class MdnsServer extends ProtoServer {
    // Multi-cast DNS server
    public server;
    public mdnsEmitter = new EventEmitter();
    private queries = [];
    public init(cfg) {
        this.uuid = cfg.uuid;
        if (cfg.enabled) {
            logger.info('Starting up MDNS server');
            this.server = multicastdns({ loopback: true });
            var self = this;

            // look for responses to queries we send
            // todo: need timeout on queries to remove them in case a bad query is sent
            this.server.on('response', function (responses) {
                self.queries.forEach(function (query) {
                    logger.silly(`looking to match on ${query.name}`);
                    responses.answers.forEach(answer => {
                        if (answer.name === query.name) {
                            logger.info(`MDNS: found response: ${answer.name} at ${answer.data}`);
                            // need to send response back to client here
                            self.mdnsEmitter.emit('mdnsResponse', answer);
                            // remove query from list
                            self.queries = self.queries.filter((value, index, arr) => {
                                if (value.name !== query.name) return arr;
                            });
                        }
                    });

                });
            });

            // respond to incoming MDNS queries
            this.server.on('query', function (query) {
                query.questions.forEach(question => {
                    if (question.name === '_poolcontroller._tcp.local') {
                        logger.info(`received mdns query for nodejs_poolController`);
                        self.server.respond({
                            answers: [{
                                name: '_poolcontroller._tcp.local',
                                type: 'A',
                                ttl: 300,
                                data: webApp.ip()
                            },
                            {
                                name: 'api._poolcontroller._tcp.local',
                                type: 'SRV',
                                data: {
                                    port: '4200',
                                    target: '_poolcontroller._tcp.local',
                                    weight: 0,
                                    priority: 10
                                }
                            }]
                        });
                    }
                });
            });

            this.isRunning = true;
        }
    }
    public queryMdns(query) {
        // sample query
        // queryMdns({name: '_poolcontroller._tcp.local', type: 'A'});
        if (this.queries.indexOf(query) === -1) {
            this.queries.push(query);
        }
        this.server.query({ questions: [query] });
    }
}
export class HttpInterfaceServer extends ProtoServer {
    public bindingsPath: string;
    public bindings: HttpInterfaceBindings;
    private _fileTime: Date = new Date(0);
    private _isLoading: boolean = false;
    public init(cfg) {
        this.uuid = cfg.uuid;
        if (cfg.enabled) {
            if (cfg.fileName && this.initBindings(cfg)) this.isRunning = true;
        }
    }
    public loadBindings(cfg): boolean {
        this._isLoading = true;
        if (fs.existsSync(this.bindingsPath)) {
            try {
                let bindings = JSON.parse(fs.readFileSync(this.bindingsPath, 'utf8'));
                let ext = extend(true, {}, typeof cfg.context !== 'undefined' ? cfg.context.options : {}, bindings);
                this.bindings = Object.assign<HttpInterfaceBindings, any>(new HttpInterfaceBindings(cfg), ext);
                this.isRunning = true;
                this._isLoading = false;
                const stats = fs.statSync(this.bindingsPath);
                this._fileTime = stats.mtime;
                return true;
            }
            catch (err) {
                logger.error(`Error reading interface bindings file: ${this.bindingsPath}. ${err}`);
                this.isRunning = false;
                this._isLoading = false;
            }
        }
        return false;
    }
    public initBindings(cfg): boolean {
        let self = this;
        try {
            this.bindingsPath = path.posix.join(process.cwd(), "/web/bindings") + '/' + cfg.fileName;
            let fileTime = new Date(0).valueOf();
            fs.watch(this.bindingsPath, (event, fileName) => {
                if (fileName && event === 'change') {
                    if (self._isLoading) return; // Need a debounce here.  We will use a semaphore to cause it not to load more than once.
                    const stats = fs.statSync(self.bindingsPath);
                    if (stats.mtime.valueOf() === self._fileTime.valueOf()) return;
                    self.loadBindings(cfg);
                    logger.info(`Reloading ${cfg.name || ''} interface config: ${fileName}`);
                }
            });
            this.loadBindings(cfg);
            if (this.bindings.context.mdnsDiscovery) {
                let srv = webApp.mdnsServer;
                let qry = typeof this.bindings.context.mdnsDiscovery === 'string' ? { name: this.bindings.context.mdnsDiscovery, type: 'A' } : this.bindings.context.mdnsDiscovery;
                if (typeof srv !== 'undefined') {
                    srv.queryMdns(qry);
                    srv.mdnsEmitter.on('mdnsResponse', (response) => {
                        let url: URL;
                        url = new URL(response);
                        this.bindings.context.options.host = url.host;
                        this.bindings.context.options.port = url.port || 80;
                    });
                }
            }
            return true;
        }
        catch (err) {
            logger.error(`Error initializing interface bindings: ${err}`);
        }
        return false;
    }
    public emitToClients(evt: string, ...data: any) {
        if (this.isRunning) {
            // Take the bindings and map them to the appropriate http GET, PUT, DELETE, and POST.
            this.bindings.bindEvent(evt, ...data);
        }
    }
}

export class InfluxInterfaceServer extends ProtoServer {
    public bindingsPath: string;
    public bindings: InfluxInterfaceBindings;
    private _fileTime: Date = new Date(0);
    private _isLoading: boolean = false;
    public init(cfg) {
        this.uuid = cfg.uuid;
        if (cfg.enabled) {
            if (cfg.fileName && this.initBindings(cfg)) this.isRunning = true;
        }
    }
    public loadBindings(cfg): boolean {
        this._isLoading = true;
        if (fs.existsSync(this.bindingsPath)) {
            try {
                let bindings = JSON.parse(fs.readFileSync(this.bindingsPath, 'utf8'));
                let ext = extend(true, {}, typeof cfg.context !== 'undefined' ? cfg.context.options : {}, bindings);
                this.bindings = Object.assign<InfluxInterfaceBindings, any>(new InfluxInterfaceBindings(cfg), ext);
                this.isRunning = true;
                this._isLoading = false;
                const stats = fs.statSync(this.bindingsPath);
                this._fileTime = stats.mtime;
                return true;
            }
            catch (err) {
                logger.error(`Error reading interface bindings file: ${this.bindingsPath}. ${err}`);
                this.isRunning = false;
                this._isLoading = false;
            }
        }
        return false;
    }
    public initBindings(cfg): boolean {
        let self = this;
        try {
            this.bindingsPath = path.posix.join(process.cwd(), "/web/bindings") + '/' + cfg.fileName;
            fs.watch(this.bindingsPath, (event, fileName) => {
                if (fileName && event === 'change') {
                    if (self._isLoading) return; // Need a debounce here.  We will use a semaphore to cause it not to load more than once.
                    const stats = fs.statSync(self.bindingsPath);
                    if (stats.mtime.valueOf() === self._fileTime.valueOf()) return;
                    self.loadBindings(cfg);
                    logger.info(`Reloading ${cfg.name || ''} interface config: ${fileName}`);
                }
            });
            this.loadBindings(cfg);
            return true;
        }
        catch (err) {
            logger.error(`Error initializing interface bindings: ${err}`);
        }
        return false;
    }
    public emitToClients(evt: string, ...data: any) {
        if (this.isRunning) {
            // Take the bindings and map them to the appropriate http GET, PUT, DELETE, and POST.
            this.bindings.bindEvent(evt, ...data);
        }
    }
}

export class MqttInterfaceServer extends ProtoServer {
    public bindingsPath: string;
    public bindings: HttpInterfaceBindings;
    private _fileTime: Date = new Date(0);
    private _isLoading: boolean = false;
    public get isConnected() { return this.isRunning && this.bindings.events.length > 0; }
    public init(cfg) {
        this.uuid = cfg.uuid;
        if (cfg.enabled) {
            if (cfg.fileName && this.initBindings(cfg)) this.isRunning = true;
        }
    }
    public loadBindings(cfg): boolean {
        this._isLoading = true;
        if (fs.existsSync(this.bindingsPath)) {
            try {
                let bindings = JSON.parse(fs.readFileSync(this.bindingsPath, 'utf8'));
                let ext = extend(true, {}, typeof cfg.context !== 'undefined' ? cfg.context.options : {}, bindings);
                this.bindings = Object.assign<MqttInterfaceBindings, any>(new MqttInterfaceBindings(cfg), ext);
                this.isRunning = true;
                this._isLoading = false;
                const stats = fs.statSync(this.bindingsPath);
                this._fileTime = stats.mtime;
                return true;
            }
            catch (err) {
                logger.error(`Error reading interface bindings file: ${this.bindingsPath}. ${err}`);
                this.isRunning = false;
                this._isLoading = false;
            }
        }
        return false;
    }
    public initBindings(cfg): boolean {
        let self = this;
        try {
            this.bindingsPath = path.posix.join(process.cwd(), "/web/bindings") + '/' + cfg.fileName;
            let fileTime = new Date(0).valueOf();
            fs.watch(this.bindingsPath, (event, fileName) => {
                if (fileName && event === 'change') {
                    if (self._isLoading) return; // Need a debounce here.  We will use a semaphore to cause it not to load more than once.
                    const stats = fs.statSync(self.bindingsPath);
                    if (stats.mtime.valueOf() === self._fileTime.valueOf()) return;
                    self.loadBindings(cfg);
                    logger.info(`Reloading ${cfg.name || ''} interface config: ${fileName}`);
                }
            });
            this.loadBindings(cfg);
            return true;
        }
        catch (err) {
            logger.error(`Error initializing interface bindings: ${err}`);
        }
        return false;
    }
    public emitToClients(evt: string, ...data: any) {
        if (this.isRunning) {
            // Take the bindings and map them to the appropriate http GET, PUT, DELETE, and POST.
            this.bindings.bindEvent(evt, ...data);
        }
    }
}
export class REMInterfaceServer extends ProtoServer {
    public init(cfg) {
        this.cfg = cfg;
        this.uuid = cfg.uuid;
        if (cfg.enabled) {
            this.initSockets();
        }
    }
    public cfg;
    public sockClient;
    public get isConnected() { return this.sockClient !== 'undefined' && this.sockClient.connected; };
    private _sockets: socketio.Socket[] = [];
    private async sendClientRequest(method: string, url: string, data?: any): Promise<string> {
        try {
            let opts = extend(true, { headers: {} }, this.cfg.options);
            if ((typeof opts.hostname === 'undefined' || !opts.hostname) && (typeof opts.host === 'undefined' || !opts.host || opts.host === '*')) {
                logger.warn(`Interface: ${this.cfg.name} has not resolved to a valid host.`);
                return;
            }
            let sbody = typeof data === 'undefined' ? '' : typeof data === 'string' ? data : typeof data === 'object' ? JSON.stringify(data) : data.toString();
            if (typeof sbody !== 'undefined') {
                if (sbody.charAt(0) === '"' && sbody.charAt(sbody.length - 1) === '"') sbody = sbody.substr(1, sbody.length - 2);
                opts.headers["CONTENT-LENGTH"] = Buffer.byteLength(sbody || '');
            }
            opts.path = url;
            opts.method = method || 'GET';
            let ret = await new Promise<any>((resolve, reject) => {
                let req: http.ClientRequest;
                let result = '';
                if (opts.port === 443 || (opts.protocol || '').startsWith('https')) {
                    opts.protocol = 'https:';
                    req = https.request(opts, (response: http.IncomingMessage) => {
                        response.on('error', (err) => { reject(err); });
                        response.on('data', (data) => { result += data; });
                        response.on('end', () => { resolve(result); });
                    });
                }
                else {
                    opts.protocol = undefined;
                    req = http.request(opts, (response: http.IncomingMessage) => {
                        response.on('error', (err) => { logger.error(err); reject(err); });
                        response.on('data', (data) => {
                            result += data;
                        });
                        response.on('end', () => { resolve(result); });
                    });
                }
                req.on('error', (err, req, res) => { logger.error(err); reject(err); });
                req.on('abort', () => { logger.warn('Request Aborted'); reject(new Error('Request Aborted.')); });
                req.end();
            }).catch((err) => { logger.error(err); });
            return Promise.resolve(ret);
        }
        catch (err) { logger.error(err); return Promise.reject(err); }
    }
    private initSockets() {
        try {
            let self = this;
            let url = `${this.cfg.options.protocol || 'http://'}${this.cfg.options.host}${typeof this.cfg.options.port !== 'undefined' ? ':' + this.cfg.options.port : ''}`;
            logger.info(`Opening ${this.cfg.name} socket on ${url}`);
            //console.log(this.cfg);
            this.sockClient = sockClient(url, extend(true,
                { reconnectionDelay: 2000, reconnection: true, reconnectionDelayMax: 20000, transports: ['websocket'], upgrade: false }, this.cfg.socket));
            if (typeof this.sockClient === 'undefined') return Promise.reject(new Error('Could not Initialize REM Server.  Invalid configuration.'));
            //this.sockClient = io.connect(url, { reconnectionDelay: 2000, reconnection: true, reconnectionDelayMax: 20000 });
            //console.log(this.sockClient);
            //console.log(typeof this.sockClient.on);
            this.sockClient.on('connect_error', (err) => { logger.error(`${this.cfg.name} socket connection error: ${err}`); });
            this.sockClient.on('connect_timeout', () => { logger.error(`${this.cfg.name} socket connection timeout`); });
            this.sockClient.on('reconnect', (attempts) => { logger.info(`${this.cfg.name} socket reconnected after ${attempts}`); });
            this.sockClient.on('reconnect_attempt', () => { logger.warn(`${this.cfg.name} socket attempting to reconnect`); });
            this.sockClient.on('reconnecting', (attempts) => { logger.warn(`${this.cfg.name} socket attempting to reconnect: ${attempts}`); });
            this.sockClient.on('reconnect_failed', (err) => { logger.warn(`${this.cfg.name} socket failed to reconnect: ${err}`); });
            this.sockClient.on('close', () => { logger.info(`${this.cfg.name} socket closed`); });
            this.sockClient.on('connect', () => {
                logger.info(`${this.cfg.name} socket connected`);
                this.sockClient.on('i2cDataValues', function (data) {
                    //logger.info(`REM Socket i2cDataValues ${JSON.stringify(data)}`);

                });
            });
            this.isRunning = true;
        }
        catch (err) { logger.error(err); }
    }
    public async setDevice(binding: string, data): Promise<boolean> {
        // Calls a rest service on the REM to set the state of a connected device.
        try {
            let req: http.ClientRequest;
            let opts = extend(true, { headers: {} }, this.cfg.options);
            if ((typeof opts.hostname === 'undefined' || !opts.hostname) && (typeof opts.host === 'undefined' || !opts.host || opts.host === '*')) {
                logger.warn(`Interface: ${this.cfg.name} has not resolved to a valid host.`);
                return;
            }

            let sbody = JSON.stringify(data);
            // We should now have all the tokens.  Put together the request.
            if (typeof sbody !== 'undefined') {
                if (sbody.charAt(0) === '"' && sbody.charAt(sbody.length - 1) === '"') sbody = sbody.substr(1, sbody.length - 2);
                opts.headers["CONTENT-LENGTH"] = Buffer.byteLength(sbody || '');
            }
            if (opts.port === 443 || (opts.protocol || '').startsWith('https')) {
                req = https.request(opts, (response: http.IncomingMessage) => {
                    //console.log(response);
                });
            }
            else {
                req = http.request(opts, (response: http.IncomingMessage) => {
                    //console.log(response.statusCode);
                });
            }
            req.on('error', (err, req, res) => { logger.error(err); });
            if (typeof sbody !== 'undefined') {
                req.write(sbody);
            }
            req.end();

        }
        catch (err) { return Promise.reject(err); }
    }
    public async getDevices() {
        try {
            let response = await this.sendClientRequest('GET', '/devices/all');
            return Promise.resolve(typeof response !== 'undefined' ? JSON.parse(response) : response);
        }
        catch (err) { logger.error(err); }
    }
}
export const webApp = new WebServer();
