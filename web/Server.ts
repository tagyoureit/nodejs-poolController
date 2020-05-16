import * as path from "path";
import * as fs from "fs";
import express=require('express');
import { config } from "../config/Config";
import { logger } from "../logger/Logger";
import socketio=require("socket.io");
import { ConfigRoute } from "./services/config/Config";
import { StateRoute } from "./services/state/State";
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
import extend = require("extend");
// This class serves data and pages for
// external interfaces as well as an internal dashboard.
export class WebServer {
    private _servers: ProtoServer[]=[];
    constructor() { }
    public init() {
        let cfg = config.getSection('web');
        let srv;
        for (let s in cfg.servers) {
            let c = cfg.servers[s];
            switch (s) {
                case 'http':
                    srv = new HttpServer();
                    break;
                case 'https':
                    srv = new Http2Server();
                    break;
                case 'mdns':
                    srv = new MdnsServer();
                    break;
                case 'ssdp':
                    srv = new SsdpServer();
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
            if (!c.enabled) continue;
            let type = c.type || 'http';
            logger.info(`Init ${type} interface: ${c.name}`);
            switch (type) {
                case 'http':
                    int = new HttpInterfaceServer();
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
    public get mdnsServer(): MdnsServer { return this._servers.find(elem => elem instanceof MdnsServer) as MdnsServer; }
    public deviceXML() { } // override in SSDP
    public stop() {
        for (let s in this._servers) {
            if (typeof this._servers[s].stop() === 'function') this._servers[s].stop();
        }
    }
}
class ProtoServer {
    // base class for all servers.
    public isRunning: boolean=false;
    public emitToClients(evt: string, ...data: any) { }
    public stop() { }
    protected _dev: boolean=process.env.NODE_ENV !== 'production';
    // todo: how do we know if the client is using IPv4/IPv6?
    private family='IPv4';
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
    protected ip() {
        return typeof this.getInterface() === 'undefined' ? '0.0.0.0' : this.getInterface().address;
    }
    protected mac() {
        return typeof this.getInterface() === 'undefined' ? '00:00:00:00' : this.getInterface().mac;
    }
}
export class Http2Server extends ProtoServer {
    public server: http2.Http2Server;
    public app: Express.Application;
    public init(cfg) {
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
    private _sockets: socketio.Socket[]=[];
    private _pendingMsg: Inbound;
    public emitToClients(evt: string, ...data: any) {
        if (this.isRunning) {
            // console.log(JSON.stringify({evt:evt, msg: 'Emitting...', data: data },null,2));
            this.sockServer.emit(evt, ...data);
        }
    }
    private initSockets() {
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
            logger.info('New socket client connected %s -- %s', sock.id, sock.client.conn.remoteAddress);
            this.socketHandler(sock);
            this.sockServer.emit('controller', state.controllerState);
            sock.conn.emit('controller', state.controllerState);
        });
        this.app.use('/socket.io-client', express.static(path.join(process.cwd(), '/node_modules/socket.io-client/dist/'), { maxAge: '60d' }));
        // this.app.use('/jquery', express.static(path.join(process.cwd(), '/node_modules/jquery/'), {maxAge: '60d'}));
        // this.app.use('/jquery-ui', express.static(path.join(process.cwd(), '/node_modules/jquery-ui-dist/'), {maxAge: '60d'}));
        // this.app.use('/font-awesome', express.static(path.join(process.cwd(), '/node_modules/@fortawesome/fontawesome-free/'), {maxAge: '60d'}));

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
        sock.on('receivePacketRaw', function(incomingPacket: any[]) {
            //var str = 'Add packet(s) to incoming buffer: ';
            logger.silly('User request (replay.html) to RECEIVE packet: %s', JSON.stringify(incomingPacket));
            for (var i = 0; i < incomingPacket.length; i++) {
                conn.buffer.pushIn(Buffer.from(incomingPacket[i]));
                // str += JSON.stringify(incomingPacket[i]) + ' ';
            }
            //logger.info(str);
        });
        sock.on('replayPackets', function(bytesToProcessArr: number[][]) {
            // takes an input of raw bytes and will merge bytes to make a full packet if needed
            // used for replay
            logger.debug(`Received ${ bytesToProcessArr }`);
            for (let i = 0; i < bytesToProcessArr.length; i++) {
                let bytesToProcess: number[] = bytesToProcessArr.shift();

                let msg: Inbound = self._pendingMsg;
                let ndx: number = 0;
                do {
                    if (typeof (msg) === "undefined" || msg === null || msg.isComplete || !msg.isValid) {
                        msg = new Inbound();
                        ndx = msg.readPacket(bytesToProcess);
                    }
                    else {
                        ndx = msg.mergeBytes(bytesToProcess);
                    }
                    if (msg.isComplete) {
                        if (msg.isValid) {

                            let out = new Outbound(msg.protocol, msg.source, msg.dest, msg.action, msg.payload);
                            conn.queueSendMessage(out);
                            logger.info(`Sending ${ out.toShortPacket() }`);
                        }
                        else {
                            logger.info(`replay: discarding packet ${ msg.toShortPacket() }`);
                        }
                        ndx = 0;
                        msg = new Inbound();
                        bytesToProcess = [];
                    }
                    else self._pendingMsg = msg;
                    bytesToProcess = bytesToProcess.slice(ndx);
                }
                while (ndx < bytesToProcess.length);
            }
        });
        sock.on('sendPackets', function(bytesToProcessArr: number[][]) {
            // takes an input of bytes (src/dest/action/payload) and adds preamble/checksum and sends
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
    }
    public init(cfg) {
        if (cfg.enabled) {
            this.app = express();

            //this.app.use();
            this.server = http.createServer(this.app);
            if (cfg.httpsRedirect) {
                var cfgHttps = config.getSection('web').server.https;
                this.app.get('*', (res: express.Response, req: express.Request) => {
                    let host = res.get('host');
                    host = host.replace(/:\d+$/, ':' + cfgHttps.port);
                    return res.redirect('https://' + host + req.url);
                });
            }
            this.app.use((req, res, next) => {
                res.header('Access-Control-Allow-Origin', '*');
                res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
                res.header('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, PUT, DELETE');
                if ('OPTIONS' === req.method) { res.sendStatus(200); }
                else {
                    if (req.url !== '/device'){
                        console.log(`${ req.ip } ${ req.method } ${ req.url } ${ typeof req.body === 'undefined' ? '' : JSON.stringify(req.body) }`);
                    }
                    next();
                }
            });
            this.app.use(express.json());
            // Put in a custom replacer so that we can send error messages to the client.  If we don't do this the base properties of Error
            // are omitted from the output.
            this.app.set('json replacer', (key, value) => {
                if (value instanceof Error) {
                    var err = {};
                    Object.getOwnPropertyNames(value).forEach((prop) => { err[prop] = value[prop]; });
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
            this.server.listen(cfg.port, cfg.ip, function() {
                logger.info('Server is now listening on %s:%s', cfg.ip, cfg.port);
            });
            this.isRunning = true;
        }
    }
}
export class SsdpServer extends ProtoServer {
    // Simple service discovery protocol
    public server: any; //node-ssdp;
    public init(cfg) {
        if (cfg.enabled) {
            let self = this;

            logger.info('Starting up SSDP server');
            var udn = 'uuid:806f52f4-1f35-4e33-9299-' + this.mac();
            // todo: should probably check if http/https is enabled at this point
            var port = config.getSection('web').servers.http.port || 4200;
            //console.log(port);
            let location = 'http://' + this.ip() + ':' + port + '/device';
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
                .then(function() {
                    logger.silly('SSDP/UPnP Server started.');
                    self.isRunning = true;
                });

            this.server.on('error', function(e) {
                logger.error('error from SSDP:', e);
            });
        }
    }
    public deviceXML() {
        let ver = sys.appVersion;
        let XML = `<?xml version="1.0"?>
                        <root xmlns="urn:schemas-upnp-org:PoolController-1-0">
                            <specVersion>
                                <major>${ver.split('.')[0] }</major>
                                <minor>${ver.split('.')[1] }</minor>
                                <patch>${ver.split('.')[2] }</patch>
                            </specVersion>
                            <device>
                                <deviceType>urn:echo:device:PoolController:1</deviceType>
                                <friendlyName>NodeJS Pool Controller</friendlyName> 
                                <manufacturer>tagyoureit</manufacturer>
                                <manufacturerURL>https://github.com/tagyoureit/nodejs-poolController</manufacturerURL>
                                <modelDescription>An application to control pool equipment.</modelDescription>
                                <serialNumber>0</serialNumber>
                    			<UDN>uuid:806f52f4-1f35-4e33-9299-${this.mac() }</UDN>
                                <serviceList></serviceList>
                            </device>
                        </root>`;
        return XML;
    }
    public stop(){
        this.server.stop();
    }
}

export class MdnsServer extends ProtoServer {
    // Multi-cast DNS server
    public server;
    public mdnsEmitter=new EventEmitter();
    private queries=[];
    public init(cfg) {
        if (cfg.enabled) {
            logger.info('Starting up MDNS server');
            this.server = multicastdns({ loopback: true });
            var self = this;

            // look for responses to queries we send
            // todo: need timeout on queries to remove them in case a bad query is sent
            this.server.on('response', function(responses) {
                self.queries.forEach(function(query) {
                    logger.silly(`looking to match on ${ query.name }`);
                    responses.answers.forEach(answer => {
                        if (answer.name === query.name) {
                            logger.info(`MDNS: found response: ${ answer.name } at ${ answer.data }`);
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
            this.server.on('query', function(query) {
                query.questions.forEach(question => {
                    if (question.name === '_poolcontroller._tcp.local') {
                        logger.info(`received mdns query for nodejs_poolController`);
                        self.server.respond({
                            answers: [{
                                name: '_poolcontroller._tcp.local',
                                type: 'A',
                                ttl: 300,
                                data: self.ip()
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
export const webApp = new WebServer();
export class HttpInterfaceServer extends ProtoServer {
    public bindingsPath: string;
    public bindings: HttpInterfaceBindings;
    public init(cfg) {
        if (cfg.enabled) {
            if (cfg.fileName && this.initBindings(cfg)) this.isRunning = true;
        }
    }
    public loadBindings(cfg): boolean {
        if (fs.existsSync(this.bindingsPath)) {
            try {
                let bindings = JSON.parse(fs.readFileSync(this.bindingsPath, 'utf8'));
                let ext = extend(true, {}, typeof cfg.context !== 'undefined' ? cfg.context.options : {}, bindings);
                this.bindings = Object.assign<HttpInterfaceBindings, any>(new HttpInterfaceBindings(cfg), ext);
                this.isRunning = true;
                return true;
            }
            catch (err) {
                logger.error(`Error reading interface bindings file: ${this.bindingsPath}. ${err}`);
                this.isRunning = false;
                return false;
            }
        }
        return false;
    }
    public initBindings(cfg): boolean {
        let self = this;
        try {
            this.bindingsPath = path.posix.join(process.cwd(), "/web/bindings") + '/' + cfg.fileName;
            fs.watch(this.bindingsPath, (event, file) => { self.loadBindings(cfg); });
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
