import * as path from "path";
// import * as express from "express";
import express = require('express')
import { config } from "../config/Config";
import { logger } from "../logger/Logger";
import socketio =require("socket.io");
import { ConfigRoute } from "./services/config/Config";
import { StateRoute } from "./services/state/State";
import { UtilitiesRoute } from "./services/utilities/Utilities";
import * as http2 from "http2";
import * as http from "http";
import * as https from "https";
import { state } from "../controller/State";
import
{
    conn
} from "../controller/comms/Comms"


// This class serves data and pages for
// external interfaces as well as an internal dashboard.
export class WebServer {
    private _servers: ProtoServer[] = []; 
    constructor() { }
    public init() {
        let cfg = config.getSection('web');
        let srv;
        for (let s in cfg.servers) {
            let c = cfg.servers[s];
            switch (s) {
                case 'http':
                    srv = new HttpServer();
                    this._servers.push(srv);
                    srv.init(c);
                    break;
                case 'https':
                    srv = new Http2Server();
                    this._servers.push(srv);
                    srv.init(cfg.servers[s]);
                    break;
            }
        }
    }
    public emitToClients(evt: string, ...data: any) {
        for (let i = 0; i < this._servers.length; i++) {
            this._servers[i].emitToClients(evt, ...data);
        }
    }
}
class ProtoServer {
    // base class for all servers.
    public isRunning: boolean = false;
    public emitToClients(evt: string, ...data: any) {}
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
    private _sockets: socketio.Socket[] = [];
    public emitToClients(evt: string, ...data: any) {
        if (this.isRunning) {
            //console.log({evt:evt, msg: 'Emitting...', data: data });
            this.sockServer.emit(evt, ...data);
        }
    }
    private initSockets() {
        this.sockServer = socketio(this.server);
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
            //sock.conn.emit('controller', state.controllerState);
        } );


        this.app.use('/socket.io-client', express.static(path.join(process.cwd(), '/node_modules/socket.io-client/dist/'), { maxAge: '60d' }));
        this.app.use('/jquery', express.static(path.join(process.cwd(), '/node_modules/jquery/'), { maxAge: '60d' }));
        this.app.use('/jquery-ui', express.static(path.join(process.cwd(), '/node_modules/jquery-ui-dist/'), { maxAge: '60d' }));
        this.app.use( '/font-awesome', express.static( path.join( process.cwd(), '/node_modules/@fortawesome/fontawesome-free/' ), { maxAge: '60d' } ) );
        
    }
    private socketHandler(sock: socketio.Socket) {
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
        sock.on('echo', (msg) => {
            sock.emit('echo', msg);
        } );
        sock.on( 'receivePacketRaw', function ( incomingPacket: any[] )
        {
        
            var str = 'Add packet(s) to incoming buffer: '
            logger.info( 'User request (replay.html) to RECEIVE packet: %s', JSON.stringify( incomingPacket ) );

            // let out = Outbound.createMessage(168, [1, 0,1, 1,1,1, 1,1, 0],3, new Response(16,36, 1, [168], null, function (msg) {
            //         if (!msg.failed) {
            //             circuit.level = level;
            //             cstate.level = level;
            //             cstate.isOn = true;
            //             cstate.emitEquipmentChange();
            //         }
            //     }));
            // out.appendPayloadString(circuit.name, 16);
            // conn.queueSendMessage(out);

            for ( var i = 0; i < incomingPacket.length; i++ )
            {

                // packetBuffer.push( new Buffer( incomingPacket[ i ] ) );
                conn.buffer.pushIn( new Buffer(incomingPacket[ i ]) );
                //conn.emitter.emit('packetread',  new Buffer( incomingPacket[ i ]))

                str += JSON.stringify(incomingPacket[ i ] ) + ' '
            }
            //emitToClientsOnEnabledSockets( 'sendPacketResults', str )
            console.log(str)
            logger.info( str )
        } )
    }
    public init(cfg) {
        if (cfg.enabled) {
            this.app = express();

            //this.app.use();
            this.server = http.createServer(this.app);
            if (cfg.httpsRedirect) {
                var cfgHttps = config.getSection('web.server.https');
                this.app.get('*', (res: express.Response, req: express.Request) => {
                    let host = res.get('host');
                    host = host.replace(/:\d+$/, ':' + cfgHttps.port);
                    return res.redirect('https://' + host + req.url);
                });
            }
            else {

            }
            this.app.use((req, res, next) => {
                res.header('Access-Control-Allow-Origin', '*');
                res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
                res.header('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, PUT, DELETE');
                if ('OPTIONS' === req.method) {
                    res.sendStatus(200);
                } else {
                    console.log(`${req.ip} ${req.method} ${req.url}`);
                    next();
                }
            });
            this.app.use(express.static(path.join(process.cwd(), 'web/dashboard'), { maxAge: '1d' }));
            this.app.use(express.json());
            ConfigRoute.initRoutes(this.app);
            StateRoute.initRoutes(this.app);
            UtilitiesRoute.initRoutes(this.app);
            // start our server on port
            this.server.listen(cfg.port, cfg.ip, function () {
                logger.info('Server is now listening on %s:%s', cfg.ip, cfg.port);
            });
            this.initSockets();
            this.isRunning = true;
        }
    }
}
export class SspdServer extends ProtoServer {
    // Simple service discovery protocol
    public server: any;
}
export class MdnsServer extends ProtoServer {
    // Multi-cast DNS server
    public server: any;
}

export const webApp = new WebServer();
