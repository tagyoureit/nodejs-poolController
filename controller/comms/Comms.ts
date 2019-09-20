import { EventEmitter } from 'events';
import * as SerialPort from 'serialport';
import * as MockBinding from '@serialport/binding-mock'
import { config } from '../../config/Config';
import { logger } from '../../logger/Logger';
import * as net from 'net';
import { setTimeout, setInterval } from 'timers';
import { Outbound, Inbound, Response } from './messages/Messages';
export class Connection {
    constructor() {
        this.emitter = new EventEmitter();
    }
    public isOpen: boolean = false;
    private _cfg: any;
    private _port: any;
    public mockPort: boolean = false;
    public buffer: SendRecieveBuffer;
    private connTimer: NodeJS.Timeout;
    protected resetConnTimer(...args) {
        if (conn.connTimer !== null) clearTimeout(conn.connTimer);
        // if ( !conn._cfg.mockPort ) conn.connTimer = setTimeout( conn.open, conn._cfg.inactivityRetry * 1000, ...args );
        if (!conn._cfg.mockPort) conn.connTimer = setTimeout(() => conn.open(...args), conn._cfg.inactivityRetry * 1000);
    }
    public emitter: EventEmitter;
    public open(timeOut?: string) {
        if (conn._cfg.netConnect && !conn._cfg.mockPort) {
            let nc: net.Socket;
            nc = new net.Socket();
            conn._port = nc;
            nc.connect(conn._cfg.netPort, conn._cfg.netHost, function () {
                if (timeOut === 'retry_timeout' || timeOut === 'timeout')
                    logger.warn('Net connect (socat) trying to recover from lost connection.');
            });
            nc.on('data', function (data) {
                conn.isOpen = true;
                if (timeOut === 'retry_timeout' || timeOut === 'timeout') {
                    logger.info(`Net connect (socat) connected to: ${conn._cfg.netHost}:${conn._cfg.netPort}`);
                    timeOut = undefined;
                }
                if (data.length > 0) conn.emitter.emit('packetread', data);
                conn.resetConnTimer('timeout');
            });
        }
        else {
            var sp: SerialPort = null;
            if (conn._cfg.mockPort) {
                this.mockPort = true;
                SerialPort.Binding = MockBinding;
                let portPath = 'FAKE_PORT';
                MockBinding.createPort(portPath, { echo: false, record: true });
                sp = new SerialPort(portPath, { autoOpen: false })
            }
            else {
                this.mockPort = false;
                sp = new SerialPort(conn._cfg.rs485Port, conn._cfg.portSettings);
            }

            conn._port = sp;
            sp.open(function (err) {
                if (err) {
                    conn.resetConnTimer();
                    conn.isOpen = false;
                    logger.error('Error opening port: %s. Retry in %s seconds', err, (conn._cfg.inactivityRetry));
                }
                else
                    logger.info(`Serial port: ${this.path} request to open succeeded without error`);
            });
            sp.on('open', function () {
                if (timeOut === 'retry_timeout' || timeOut === 'timeout')
                    logger.error('Serial port %s recovering from lost connection', conn._cfg.rs485Port);
                else
                    logger.info(`Serial port: ${this.path} opened`);
                conn.isOpen = true;
            });
            sp.on('readable', function () {
                if (!this.mockPort) {
                    conn.emitter.emit('packetread', sp.read());
                    conn.resetConnTimer();
                }
            });

        }
        if (typeof (conn.buffer) === 'undefined') {
            conn.buffer = new SendRecieveBuffer();
            conn.emitter.on('packetread', function (pkt) { conn.buffer.pushIn(pkt); });
            conn.emitter.on('messagewrite', function (msg) { conn.buffer.pushOut(msg); })
        }
        conn.resetConnTimer('retry_timeout');
        conn._port.on('error', function (err) {
            logger.error('Error opening port: %s. Retry in %s seconds', err, (conn._cfg.inactivityRetry));
            conn.resetConnTimer();
            conn.isOpen = false;
        });
    }
    public close() {
        if (conn.connTimer) clearTimeout(conn.connTimer);
        if (typeof (conn._port) !== 'undefined' && conn._cfg.netConnect) {
            if (typeof (conn._port.destroy) !== 'function')
                conn._port.close(function (err) {
                    if (err) logger.error('Error closing %s:%s', conn._cfg.netHost, conn._cfg.netPort);
                });
            else
                conn._port.destroy();
        }
        conn.buffer.close();
    }
    public drain(cb: Function) {
        if (typeof (conn._port.drain) === 'function')
            conn._port.drain(cb);
        else // Call the method immediately as the port doesn't wait to send.
            cb();
    }
    public write(bytes: Buffer, cb: Function) {
        if (conn._cfg.netConnect)
            conn._port.write(bytes, 'binary', cb);
        else
            conn._port.write(bytes, cb);
    }
    public stopAsync() {
        Promise.resolve()
            .then(function () { conn.close(); })
            .then(function () { console.log('closed connection'); });
    }
    public init() {
        conn._cfg = config.getSection('controller.comms', {
            rs485Port: "/dev/ttyUSB0",
            portSettings: { "baudRate": 9600, "dataBits": 8, "parity": "none", "stopBits": 1, "flowControl": false, "autoOpen": false, "lock": false },
            mockPort: false,
            netConnect: false,
            netHost: "raspberrypi",
            netPort: 9801,
            inactivityRetry: 10
        });
        conn.open();
    }
    public queueSendMessage(msg: Outbound) {
        conn.emitter.emit('messagewrite', msg);
    }

    public queueReceiveMessage(pkt: Inbound) {
        logger.info(`Receiving ${pkt.action}`)
        conn.buffer.pushIn(pkt);
    }
}
export class SendRecieveBuffer {
    constructor() {
        this._inBuffer = [];
        this._outBuffer = [];
        this.procTimer = setInterval(this.processPackets, 300);
    }
    public counter: Counter = new Counter();
    private procTimer: NodeJS.Timeout;
    private _processing: boolean = false;
    private _inBytes: number[] = [];
    private _inBuffer: number[] = [];
    private _outBuffer: Outbound[] = [];
    private _waitingPacket: Outbound;
    private _msg: Inbound;
    public pushIn(pkt) { conn.buffer._inBuffer.push.apply(conn.buffer._inBuffer, pkt.toJSON().data) }
    public pushOut(msg) { conn.buffer._outBuffer.push(msg); }
    public clear() { conn.buffer._inBuffer.length = 0; conn.buffer._outBuffer.length = 0; }
    public close() { clearTimeout(conn.buffer.procTimer); conn.buffer.clear(); }
    private processPackets() {
        if (conn.buffer._processing) return;
        conn.buffer._processing = true;
        conn.buffer.processInbound();
        // If the port is really busy let the process continue.
        if (conn.buffer._inBytes.length === 0 && conn.buffer._inBuffer.length === 0) conn.buffer.processOutbound();
        conn.buffer._processing = false;
    }
    private processWaitPacket(): boolean {
        if (typeof (conn.buffer._waitingPacket) !== 'undefined' && conn.buffer._waitingPacket) {
            let timeout = conn.buffer._waitingPacket.timeout || 2000;
            let dt = new Date();
            if (conn.buffer._waitingPacket.timestamp.getTime() + timeout < dt.getTime()) conn.buffer.writeMessage(conn.buffer._waitingPacket);
            return true;
        }
        return false;
    }
    protected processOutbound() {
        if (conn.isOpen) {
            if (!conn.buffer.processWaitPacket()) {
                var msg: Outbound = conn.buffer._outBuffer.shift();
                if (typeof (msg) === 'undefined' || !msg) return;
                conn.buffer.writeMessage(msg);
            }
        }
    }
    private writeMessage(msg: Outbound) {
        var bytes = msg.toPacket();
        if (conn.isOpen) {
            if (msg.retries < 0) {
                msg.failed = true;
                conn.buffer._waitingPacket = null;
                logger.warn(`Aborting packet ${bytes}.`)
                if (msg.requiresResponse && typeof (msg.response.callback) === 'function') setTimeout(msg.response.callback, 100, msg);
                return;
            }
            conn.buffer.counter.bytesSent += bytes.length;
            msg.timestamp = new Date();
            logger.verbose(`Wrote packet [${bytes}].  Retries remaining: ${msg.retries}`)
            logger.packet(msg);
            conn.write(Buffer.from(bytes), function (err) {
                if (err) {
                    logger.error('Error writing packet %s', err);
                    if (msg.retries <= 0) {
                        msg.failed = true;
                        conn.buffer._waitingPacket = null;
                        if (msg.requiresResponse && typeof (msg.response.callback) === 'function') setTimeout(msg.response.callback, 100, msg);
                    }
                    else conn.buffer._waitingPacket = msg;
                }
                else {
                    if (msg.requiresResponse) conn.buffer._waitingPacket = msg;
                }
            });
            msg.retries--;

        }
    }
    private clearResponses(msg: Inbound) {
        if (conn.buffer._outBuffer.length === 0 && typeof (conn.buffer._waitingPacket) !== 'object' && conn.buffer._waitingPacket) return;
        var callback;
        let msgOut = conn.buffer._waitingPacket;
        if (typeof (conn.buffer._waitingPacket) !== 'undefined' && conn.buffer._waitingPacket) {
            var resp: Response = msgOut.response;
            if (msgOut.requiresResponse && resp.isResponse(msg)) {
                conn.buffer._waitingPacket = null;
                callback = resp.callback;
                if (resp.ack) conn.buffer.writeMessage(resp.ack);
            }
        }
        // Go through and remove all the packets that need to be removed from the queue.
        var i = conn.buffer._outBuffer.length - 1;
        while (i >= 0) {
            let out = conn.buffer._outBuffer[i];
            let resp: Response = out.response;
            if (out.requiresResponse && resp.isResponse(msg)) {
                if (typeof (resp.callback) === 'function' && resp.callback) callback = resp.callback;
                conn.buffer._outBuffer.splice(i, 1);
            }
            i--;
        }
        if (typeof (callback) === 'function') setTimeout(callback, 100, msgOut);
    }
    protected processInbound() {
        if (conn.buffer._inBuffer.length == 0) return;
        conn.buffer._inBytes.push.apply(conn.buffer._inBytes, conn.buffer._inBuffer.splice(0, conn.buffer._inBuffer.length));
        if (conn.buffer._inBytes.length > 10) { // Wait until we get at least 10 bytes.
            conn.buffer.counter.bytesReceived += conn.buffer._inBytes.length;
            var ndx: number = 0;
            var msg: Inbound = conn.buffer._msg;
            do {
                if (typeof (msg) == 'undefined' || msg === null || msg.isComplete || !msg.isValid) {
                    conn.buffer._msg = msg = new Inbound();
                    ndx = msg.readPacket(conn.buffer._inBytes);
                }
                else {
                    ndx = msg.mergeBytes(conn.buffer._inBytes);
                }
                if (msg.isComplete) {
                    logger.packet(msg);
                    if (msg.isValid) {
                        conn.buffer.counter.success++;
                        msg.process();
                        conn.buffer.clearResponses(msg);
                    }
                    else {
                        conn.buffer.counter.failed++;
                        console.log('Failed:' + JSON.stringify(conn.buffer.counter));
                        //console.log(JSON.stringify(conn.buffer._inBytes));
                    }
                    conn.buffer._msg = null;
                }
                conn.buffer._inBytes = conn.buffer._inBytes.slice(ndx);
                ndx = 0;

            } while (ndx < conn.buffer._inBytes.length);
        }
    }
}
export class Counter {
    constructor() {
        this.bytesReceived = 0;
        this.success = 0;
        this.failed = 0;
        this.bytesSent = 0;
    }
    public bytesReceived: number;
    public success: number;
    public failed: number;
    public bytesSent: number;
}
export var conn: Connection = new Connection();