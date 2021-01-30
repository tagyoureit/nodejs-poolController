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
import { EventEmitter } from 'events';
import * as SerialPort from 'serialport';
import * as MockBinding from '@serialport/binding-mock';
import { config } from '../../config/Config';
import { logger } from '../../logger/Logger';
import * as net from 'net';
import { setTimeout, setInterval } from 'timers';
import { Message, Outbound, Inbound, Response } from './messages/Messages';
import { OutboundMessageError } from '../Errors';
const extend = require("extend");
export class Connection {
    constructor() {
        this.emitter = new EventEmitter();
    }
    public isOpen: boolean=false;
    private _cfg: any;
    private _port: any;
    public mockPort: boolean = false;
    private isPaused: boolean = false;
    public buffer: SendRecieveBuffer;
    private connTimer: NodeJS.Timeout;
    protected resetConnTimer(...args) {
        if (conn.connTimer !== null) clearTimeout(conn.connTimer);
        if (!conn._cfg.mockPort && conn._cfg.inactivityRetry > 0) conn.connTimer = setTimeout(() => conn.openAsync(), conn._cfg.inactivityRetry * 1000);
    }
    public isRTS: boolean=true;
    public emitter: EventEmitter;
    public async openAsync(): Promise<boolean> {
        if (typeof (this.buffer) === 'undefined') {
            this.buffer = new SendRecieveBuffer();
            this.emitter.on('packetread', (pkt) => { this.buffer.pushIn(pkt); });
            this.emitter.on('messagewrite', (msg) => { this.buffer.pushOut(msg); });
        }
        if (this._cfg.netConnect && !this._cfg.mockPort) {
            if (typeof this._port !== 'undefined' && this._port.isOpen) {
                // This used to try to reconnect and recreate events even though the socket was already connected.  This resulted in
                // instances where multiple event processors were present.
                return Promise.resolve(true);
            }
            let nc: net.Socket = new net.Socket();
            nc.on('connect', () => { logger.info(`Net connect (socat) connected to: ${this._cfg.netHost}:${this._cfg.netPort}`); }); // Socket is opened but not yet ready.
            nc.on('ready', () => {
                logger.info(`Net connect (socat) ready and communicating: ${this._cfg.netHost}:${this._cfg.netPort}`);
                nc.on('data', (data) => { if (data.length > 0 && !this.isPaused) this.emitter.emit('packetread', data); });
            });
            nc.on('close', (p) => {
                this.isOpen = false;
                if (typeof this._port !== 'undefined') this._port.destroy();
                this._port = undefined;
                logger.info(`Net connect (socat) closed ${p === true ? 'due to error' : ''}: ${this._cfg.netHost}:${this._cfg.netPort}`);
            });
            nc.on('end', () => { // Happens when the other end of the socket closes.
                this.isOpen = false;
                this.resetConnTimer();
                logger.info(`The end event was fired`);
            }); 
            //nc.on('drain', () => { logger.info(`The drain event was fired.`); });
            //nc.on('lookup', (o) => { logger.info(`The lookup event was fired ${o}`); });
            // Occurs when there is no activity.  This should not reset the connection, the previous implementation did so and
            // left the connection in a weird state where the previous connection was processing events and the new connection was
            // doing so as well.  This isn't an error it is a warning as the RS485 bus will most likely be communicating at all times.
            nc.on('timeout', () => { logger.warn(`Connection Idle: ${this._cfg.netHost}:${this._cfg.netPort}`); });
            return new Promise<boolean>((resolve, reject) => {
                // We only connect an error once as we will destroy this connection on error then recreate a new socket on failure.
                nc.once('error', (err) => {
                    logger.error(`Connection: ${err}. ${this._cfg.inactivityRetry > 0 ? `Retry in ${this._cfg.inactivityRetry} seconds` : `Never retrying; inactivityRetry set to ${this._cfg.inactivityRetry}`}`);
                    this.resetConnTimer();
                    this.isOpen = false;
                    resolve(false);
                });
                nc.connect(conn._cfg.netPort, conn._cfg.netHost, () => {
                    if (typeof this._port !== 'undefined') logger.warn('Net connect (socat) recovered from lost connection.');
                    this._port = nc;
                    this.isOpen = true;
                    resolve(true);
                });
            });
        }
        else {
            if (typeof this._port !== 'undefined' && this._port.isOpen) {
                // This used to try to reconnect even though the serial port was already connected.  This resulted in
                // instances where an access denied error was emitted.
                this.resetConnTimer();
                return Promise.resolve(true);
            }
            let sp: SerialPort = null;
            if (this._cfg.mockPort) {
                this.mockPort = true;
                SerialPort.Binding = MockBinding;
                let portPath = 'FAKE_PORT';
                MockBinding.createPort(portPath, { echo: false, record: true });
                sp = new SerialPort(portPath, { autoOpen: false });
            }
            else {
                this.mockPort = false;
                sp = new SerialPort(conn._cfg.rs485Port, conn._cfg.portSettings);
            }
            return new Promise<boolean>((resolve, _) => {
                // The serial port open method calls the callback just once.  Unfortunately that is not the case for
                // network serial port connections.  There really isn't a way to make it syncronous.  The openAsync will truly
                // be open if a hardware interface is used and this method returns.
                sp.open((err) => {
                    if (err) {
                        this.resetConnTimer();
                        this.isOpen = false;
                        logger.error(`Error opening port: ${err.message}. ${this._cfg.inactivityRetry > 0 ? `Retry in ${this._cfg.inactivityRetry} seconds` : `Never retrying; inactivityRetry set to ${this._cfg.inactivityRetry}`}`);
                        resolve(false);
                    }
                    else resolve(true);
                });
                // The event processors below should not resolve or reject the promise.  This is the misnomer with the stupid javascript promise
                // structure when dealing with serial ports.  The original promise will be either accepted or rejected above with the open method.  These 
                // won't be called until long after the promise is resolved above.  Yes we should never reject this promise.  The resolution is true
                // for a successul connect and false otherwise.
                sp.on('open', () => {
                    if (typeof conn._port !== 'undefined') logger.info(`Serial Port: ${this._cfg.rs485Port} recovered from lost connection.`)
                    else logger.info(`Serial port: ${this._cfg.rs485Port} request to open successful`);
                    this._port = sp;
                    this.isOpen = true;
                    sp.on('data', (data) => { if (!this.mockPort && !this.isPaused) this.emitter.emit('packetread', data); this.resetConnTimer(); });
                    this.resetConnTimer();
                });
                sp.on('close', (err) => {
                    this.isOpen = false;
                    logger.info(`Serial port has been closed: ${err ? JSON.stringify(err) : ''}`);
                });
                sp.on('error', (err) => {
                    this.isOpen = false;
                    if (sp.isOpen) sp.close((err) => { }); // call this with the error callback so that it doesn't emit to the error again.
                    this.resetConnTimer();
                    logger.error(`An error occurred on Port: ${this._cfg.rs485Port}: ${JSON.stringify(err)}`);
                });
            });
        }
    }
    //public open(timeOut?: string) {
    //    if (conn._cfg.netConnect && !conn._cfg.mockPort) {
    //        if (typeof conn._port !== 'undefined' !&& conn._port.destroyed) conn._port.destroy();
    //        let nc = conn._port = new net.Socket();
    //        nc.connect(conn._cfg.netPort, conn._cfg.netHost, function () {
    //            if (timeOut === 'retry_timeout' || timeOut === 'timeout')
    //                logger.warn('Net connect (socat) trying to recover from lost connection.');
    //        });
    //        nc.on('data', function (data) {
    //            conn.isOpen = true;
    //            if (timeOut === 'retry_timeout' || timeOut === 'timeout') {
    //                logger.info(`Net connect (socat) connected to: ${conn._cfg.netHost}:${conn._cfg.netPort}`);
    //                timeOut = undefined;
    //            }
    //            if (data.length > 0 && !conn.isPaused) conn.emitter.emit('packetread', data);
    //            conn.resetConnTimer('timeout');
    //        });
    //    }
    //    else {
    //        var sp: SerialPort = null;
    //        if (conn._cfg.mockPort) {
    //            this.mockPort = true;
    //            SerialPort.Binding = MockBinding;
    //            let portPath = 'FAKE_PORT';
    //            MockBinding.createPort(portPath, { echo: false, record: true });
    //            sp = new SerialPort(portPath, { autoOpen: false });
    //        }
    //        else {
    //            this.mockPort = false;
    //            sp = new SerialPort(conn._cfg.rs485Port, conn._cfg.portSettings);
    //        }

    //        conn._port = sp;
    //        sp.open(function(err) {
    //            if (err) {
    //                conn.resetConnTimer();
    //                conn.isOpen = false;
    //                logger.error(`Error opening port: ${err.message}. ${conn._cfg.inactivityRetry > 0 ? `Retry in ${conn._cfg.inactivityRetry} seconds` : `Never retrying; inactivityRetry set to ${conn._cfg.inactivityRetry}`}`);
    //            }
    //            else
    //                logger.info(`Serial port: ${ this.path } request to open succeeded without error`);
    //        });
    //        sp.on('open', function() {
    //            if (timeOut === 'retry_timeout' || timeOut === 'timeout')
    //                logger.error('Serial port %s recovering from lost connection', conn._cfg.rs485Port);
    //            else
    //                logger.info(`Serial port: ${ this.path } opened`);
    //            conn.isOpen = true;
    //        });
    //        // RKS: 06-16-20 -- Unsure why we are using a stream event here.  The data
    //        // is being sent via the data event and I can find no reference to the readable event.
    //        sp.on('data', function (data) {
    //            if (!this.mockPort) {
    //                if (!conn.isPaused) conn.emitter.emit('packetread', data);
    //            }
    //            conn.resetConnTimer();
    //        });
    //        //sp.on('readable', function () {
    //        //    if (!this.mockPort) {
    //        //        // If we are paused just read the port and do nothing with it.
    //        //        if (conn.isPaused)
    //        //            sp.read();
    //        //        else
    //        //            conn.emitter.emit('packetread', sp.read());
    //        //        conn.resetConnTimer();
    //        //    }
    //        //});

    //    }
    //    if (typeof (conn.buffer) === 'undefined') {
    //        conn.buffer = new SendRecieveBuffer();
    //        conn.emitter.on('packetread', function(pkt) { conn.buffer.pushIn(pkt); });
    //        conn.emitter.on('messagewrite', function(msg) { conn.buffer.pushOut(msg); });
    //    }
    //    conn.resetConnTimer('retry_timeout');
    //    conn._port.on('error', function(err) {
    //        logger.error(`Error opening port: ${err.message}. ${conn._cfg.inactivityRetry > 0 ? `Retry in ${conn._cfg.inactivityRetry} seconds` : `Never retrying; inactivityRetry set to ${conn._cfg.inactivityRetry}`}`);
    //        conn.resetConnTimer();
    //        conn.isOpen = false;
    //    });
    //}
    public closeAsync() {
        try {
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
        } catch (err) { logger.error(`Error closing comms connection: ${err.message}`); }
    }
    public drain(cb: Function) {
        if (typeof (conn._port.drain) === 'function')
            conn._port.drain(cb);
        else // Call the method immediately as the port doesn't wait to send.
            cb();
    }
    public write(bytes: Buffer, cb: Function) {
        if (conn._cfg.netConnect) {
            // SOCAT drops the connection and destroys the stream.  Could be weeks or as little as a day.
            if (typeof conn._port === 'undefined' || conn._port.destroyed !== false) conn.openAsync();
            conn._port.write(bytes, 'binary', cb);
        }
        else
            conn._port.write(bytes, cb);
    }
    public async stopAsync() {
        try {
            await conn.closeAsync();
            logger.info(`Closed serial communications connection.`);
        } catch (err) { logger.error(`Error closing comms connection: ${err.message}`); }
    }
    public init() {
        conn._cfg = config.getSection('controller.comms', {
            rs485Port: "/dev/ttyUSB0",
            portSettings: { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1, flowControl: false, autoOpen: false, lock: false },
            mockPort: false,
            netConnect: false,
            netHost: "raspberrypi",
            netPort: 9801,
            inactivityRetry: 10
        });
        conn.openAsync();
        config.emitter.on('reloaded', () => {
            console.log('Config reloaded');
            this.reloadConfig(config.getSection('controller.comms', {
                rs485Port: "/dev/ttyUSB0",
                portSettings: { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1, flowControl: false, autoOpen: false, lock: false },
                mockPort: false,
                netConnect: false,
                netHost: "raspberrypi",
                netPort: 9801,
                inactivityRetry: 10
            }));
        });
    }
    public reloadConfig(cfg) {
        let c = extend({
            rs485Port: "/dev/ttyUSB0",
            portSettings: { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1, flowControl: false, autoOpen: false, lock: false },
            mockPort: false,
            netConnect: false,
            netHost: "raspberrypi",
            netPort: 9801,
            inactivityRetry: 10
        }, cfg);
        if (JSON.stringify(c) !== JSON.stringify(this._cfg)) {
            this.closeAsync();
            this._cfg = c;
            this.openAsync();
        }
    }
    public queueSendMessage(msg: Outbound) { conn.emitter.emit('messagewrite', msg); }
    public pause() { conn.isPaused = true; conn.buffer.clear(); conn.drain(function (err) { }); }
    // RKS: Resume is executed in a closure.  This is because we want the current async process to complete
    // before we resume.  This way the messages are cleared right before we restart.
    public resume() { if (this.isPaused) setTimeout(function () { conn.buffer.clear(); conn.isPaused = false; }, 0); }
    // RKS: This appears to not be used.
    //public queueReceiveMessage(pkt: Inbound) {
    //    logger.info(`Receiving ${ pkt.action }`);
    //    conn.buffer.pushIn(pkt);
    //}
}
export class SendRecieveBuffer {
    constructor() {
        this._inBuffer = [];
        this._outBuffer = [];
        this.procTimer = null;//setInterval(this.processPackets, 175);
    }
    public counter: Counter=new Counter();
    private procTimer: NodeJS.Timeout;
    private _processing: boolean=false;
    private _inBytes: number[]=[];
    private _inBuffer: number[]=[];
    private _outBuffer: Outbound[]=[];
    private _waitingPacket: Outbound;
    private _msg: Inbound;
    public pushIn(pkt) {
        conn.buffer._inBuffer.push.apply(conn.buffer._inBuffer, pkt.toJSON().data); setTimeout(() => { this.processPackets(); }, 0); }
    public pushOut(msg) { conn.buffer._outBuffer.push(msg); setTimeout(() => { this.processPackets(); }, 0); }
    public clear() { conn.buffer._inBuffer.length = 0; conn.buffer._outBuffer.length = 0; }
    public close() { clearTimeout(conn.buffer.procTimer); conn.buffer.clear(); this._msg = undefined; }

    /********************************************************************
     * RKS: 06-06-20
     * This used to process every 175ms.  While the processing was light
     * when there was nothing to process this should have always been
     * event based so the processing timer has been reworked.  
     * 
     * Now this method gets called only during the following conditions.
     * 1. A packetread event comes from the serial port and has data
     * 2. A message is placed onto the outbound queue
     * 3. The outbound queue has messages that are waiting to send. In
     * this instance this method is called every 200ms until the queue
     * is empty.  If one of the above conditions are met then this method
     * will be triggered earlier. 
     * 
     ****************************************************************** */
    private processPackets() {
        if (conn.buffer._processing) return;
        if (conn.buffer.procTimer) {
            clearTimeout(conn.buffer.procTimer);
            conn.buffer.procTimer = null;
        }
        conn.buffer._processing = true;
        conn.buffer.processInbound();
        conn.buffer.processOutbound();
        conn.buffer._processing = false;
    }
    private processWaitPacket(): boolean {
        if (typeof conn.buffer._waitingPacket !== 'undefined' && conn.buffer._waitingPacket) {
            let timeout = conn.buffer._waitingPacket.timeout || 1000;
            let dt = new Date();
            if (conn.buffer._waitingPacket.timestamp.getTime() + timeout < dt.getTime()) {
                logger.silly(`Retrying outbound message after ${(dt.getTime() - conn.buffer._waitingPacket.timestamp.getTime()) / 1000}secs with ${conn.buffer._waitingPacket.remainingTries} attempt(s) left. - ${conn.buffer._waitingPacket.toShortPacket()}`);
                conn.buffer.writeMessage(conn.buffer._waitingPacket);
            }
            return true;
        }
        return false;
    }
    protected processOutbound() {
        if (conn.isOpen && conn.isRTS) {
            if (!conn.buffer.processWaitPacket() && conn.buffer._outBuffer.length > 0) {
                // If the serial port is busy we don't want to process any outbound.  However, this used to
                // not process the outbound even when the incoming bytes didn't mean anything.  Now we only delay
                // the outbound when we actually have a message signatures to process.
                var msg: Outbound = conn.buffer._outBuffer.shift();
                if (typeof msg === 'undefined' || !msg) return;
                conn.buffer.writeMessage(msg);
            }
        }
        // RG: added the last `|| typeof msg !== 'undef'` because virtual chem controller only sends a single packet
        // but this condition would be eval'd before the callback of conn.write was calles and the outbound packet
        // would be sitting idle for eternity. 
        if (conn.buffer._outBuffer.length > 0 || typeof conn.buffer._waitingPacket !== 'undefined' || conn.buffer._waitingPacket || typeof msg !== 'undefined') {
            // Come back later as we still have items to send.
            conn.buffer.procTimer = setTimeout(() => this.processPackets(), 100);
        }
    }
    /*
     * Writing messages on the queue is tricky to harden.  The async nature of the serial port in node doesn't appropriately drain the port after each message
     * so even though the callback is called for the .write method it doesn't guarantee that it has been written.  Not such an issue when we are dealing with full-duplex
     * but in this half-duplex environment we don't have an RTS.  This is further complicated by the fact that no event is raised when the port finally gets around to
     * dumping it's buffer on the wire.  The only time we are notified is when there is a failure.  Even then it does not point to a particular message since the
     * port is unaware of our protocol.
     * 
     * To that end we need to create a semaphore so that we don't place two messages back to back while we are waiting on the callback to return.
     */

    private writeMessage(msg: Outbound) {
        // Make sure we are not re-entrant while the the port.write is going on.
        // This ends in goofiness as it can send more than one message at a time while it
        // waits for the command buffer to be flushed.  NOTE: There is no success message and the callback to
        // write only verifies that the buffer got ahold of it.
        if (!conn.isRTS || conn.mockPort) return;
        conn.isRTS = false;
        var bytes = msg.toPacket();
        if (conn.isOpen) {
            if (msg.remainingTries <= 0) {
                // It will almost never fall into here.  The rare case where
                // we have an RTS semaphore and a waiting response might make it go here.
                msg.failed = true;
                conn.buffer._waitingPacket = null;
                logger.warn(`Message aborted after ${ msg.tries } attempt(s): ${ msg.toShortPacket() }`);
                let err = new OutboundMessageError(msg, `Message aborted after ${ msg.tries } attempt(s): ${ msg.toShortPacket() }`);
                if (typeof msg.onComplete === 'function') msg.onComplete(err, undefined);
                if (msg.requiresResponse) {
                    if (msg.response instanceof Response && typeof (msg.response.callback) === 'function') {
                        setTimeout(msg.response.callback, 100, msg);
                    }
                    /*  RSG: This shouldn't be here, correct?  No reason to get back a boolean value here. 
                    else if (typeof msg.response === 'function')
                        setTimeout(msg.response, 100, undefined, msg); */

                }
                // RSG - I'm not even sure this needs to be in the requiresResponse closure.  If it's set, shouldn't we just call it?
                // RKS: Still not sure what this does.  We already have the onComplete.  The response callback is already being called above and in this
                // case I suspect that there was actually no requested response as it would have been handled by either of the two message above.
                if (typeof msg.onResponseProcessed === 'function') setTimeout(msg.onResponseProcessed, 100);
                conn.isRTS = true;
                return;
            }
            conn.buffer.counter.bytesSent += bytes.length;
            msg.timestamp = new Date();
            logger.packet(msg);
            conn.write(Buffer.from(bytes), function(err) {
                msg.tries++;
                conn.isRTS = true;
                if (err) {
                    logger.error('Error writing packet %s', err);
                    // We had an error so we need to set the waiting packet if there are retries
                    if (msg.remainingTries > 0) conn.buffer._waitingPacket = msg;
                    else {
                        msg.failed = true;
                        logger.warn(`Message aborted after ${ msg.tries } attempt(s): ${ bytes }: ${ err }`);
                        // This is a hard fail.  We don't have any more tries left and the message didn't
                        // make it onto the wire.
                        let error = new OutboundMessageError(msg, `Message aborted after ${ msg.tries } attempt(s): ${ err }`);
                        if (typeof msg.onComplete === 'function') msg.onComplete(error, undefined);
                        conn.buffer._waitingPacket = null;
                    }
                }
                else {
                    logger.verbose(`Wrote packet [${ bytes }].  Retries remaining: ${ msg.remainingTries }`);
                    // We have all the success we are going to get so if the call succeeded then
                    // don't set the waiting packet when we aren't actually waiting for a response.
                    if (!msg.requiresResponse) {
                        // As far as we know the message made it to OCP.
                        conn.buffer._waitingPacket = null;
                        if (typeof msg.onComplete === 'function') msg.onComplete(err, undefined);
                    }
                    else if (msg.remainingTries >= 0) {
                        conn.buffer._waitingPacket = msg;
                    }
                }
            });
        }
    }
    private clearResponses(msgIn: Inbound) {
        if (conn.buffer._outBuffer.length === 0 && typeof (conn.buffer._waitingPacket) !== 'object' && conn.buffer._waitingPacket) return;

        var callback;
        let msgOut = conn.buffer._waitingPacket;
        if (typeof (conn.buffer._waitingPacket) !== 'undefined' && conn.buffer._waitingPacket) {
            var resp = msgOut.response;
            if (msgOut.requiresResponse) {
                if (resp instanceof Response && resp.isResponse(msgIn, msgOut)) {
                    conn.buffer._waitingPacket = null;
                    if (typeof msgOut.onComplete === 'function') msgOut.onComplete(undefined, msgIn);
                    callback = resp.callback;
                    resp.message = msgIn;
                    if (resp.ack) conn.queueSendMessage(resp.ack);
                }
                else {
                    if (typeof resp === 'function' && resp(msgIn, msgOut)) {
                        conn.buffer._waitingPacket = null;
                        if (typeof msgOut.onComplete === 'function') msgOut.onComplete(undefined, msgIn);
                        callback = msgOut.onResponseProcessed;
                    }
                }
            }
        }
        // Go through and remove all the packets that need to be removed from the queue.
        // RG - when would there be additional packets besides the first in the outbuffer that needs to be removed from a single incoming packet?
        // RKS: This occurs when two of the same message signature is thrown onto the queue.  Most often when there is a queue full of configuration requests.  The
        // triggers that cause the outbound message may come at the same time that another controller makes a call.
        var i = conn.buffer._outBuffer.length - 1;
        while (i >= 0) {
            let out = conn.buffer._outBuffer[i--];
            if (typeof out === 'undefined') continue;
            let resp = out.response;
            if (out.requiresResponse) {
                if (resp instanceof Response && resp.isResponse(msgIn, out)) {
                    resp.message = msgIn;
                    if (typeof (resp.callback) === 'function' && resp.callback) callback = resp.callback;
                    conn.buffer._outBuffer.splice(i, 1);
                }
                else if (typeof resp === 'function' && resp(msgIn, out)) {
                    if (typeof out.onResponseProcessed !== 'undefined') callback = out.onResponseProcessed;
                    conn.buffer._outBuffer.splice(i, 1);
                }
            }
        }
        // RKS: This callback is important because we are managing queues. The position of this callback
        // occurs after all things related to the message have been processed including removal of subsequent
        // messages from the queue.  This is because another panel on the bus may throw additional messages
        // that we also need.  This occurs when more than one panel on the bus requests a reconfig at the same time.
        if (typeof (callback) === 'function') { setTimeout(callback, 100, msgOut); }
    }
    private processCompletedMessage(msg: Inbound, ndx): number {
        msg.timestamp = new Date();
        msg.id = Message.nextMessageId;
        conn.buffer.counter.collisions += msg.collisions;
        if (msg.isValid) {
            conn.buffer.counter.success++;
            msg.process();
            conn.buffer.clearResponses(msg);
        }
        else {
            conn.buffer.counter.failed++;
            console.log('RS485 Stats:' + JSON.stringify(conn.buffer.counter));
            ndx = this.rewindFailedMessage(msg, ndx);
        }
        logger.packet(msg);
        return ndx;
    }
    private rewindFailedMessage(msg: Inbound, ndx: number): number {
        // Lets see if we can do a rewind to capture another message from the 
        // crap on the bus.  This will get us to the innermost message.  While the outer message may have failed the inner message should
        // be able to buck up and make it happen.
        conn.buffer._inBytes = conn.buffer._inBytes.slice(ndx);  // Start by removing all of the bytes related to the original message.
        // Add all of the elements of the message back in reverse.
        conn.buffer._inBytes.unshift(...msg.term);
        conn.buffer._inBytes.unshift(...msg.payload);
        conn.buffer._inBytes.unshift(...msg.header.slice(1)); // Trim off the first byte from the header.  This means it won't find 16,2 or start with a 165. The
        // algorithm looks for the header bytes to determine the protocol so the rewind shouldn't include the 16 in 16,2 otherwise it will just keep rewinding.
        conn.buffer._msg = msg = new Inbound();
        ndx = msg.readPacket(conn.buffer._inBytes);
        if (msg.isComplete) { ndx = this.processCompletedMessage(msg, ndx); }
        return ndx;
    }
    protected processInbound() {
        conn.buffer.counter.bytesReceived += conn.buffer._inBuffer.length;
        conn.buffer._inBytes.push.apply(conn.buffer._inBytes, conn.buffer._inBuffer.splice(0, conn.buffer._inBuffer.length));
        if (conn.buffer._inBytes.length >= 1) { // Wait until we have something to process.
            let ndx: number = 0;
            let msg: Inbound = conn.buffer._msg;
            do {
                if (typeof (msg) === 'undefined' || msg === null || msg.isComplete || !msg.isValid) {
                    conn.buffer._msg = msg = new Inbound();
                    ndx = msg.readPacket(conn.buffer._inBytes);
                }
                else ndx = msg.mergeBytes(conn.buffer._inBytes);
                if (msg.isComplete) ndx = this.processCompletedMessage(msg, ndx);
                if (ndx > 0) {
                    conn.buffer._inBytes = conn.buffer._inBytes.slice(ndx);
                    ndx = 0;
                }
                else break;

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
        this.collisions = 0;
    }
    public bytesReceived: number;
    public success: number;
    public failed: number;
    public bytesSent: number;
    public collisions: number;
}
export var conn: Connection = new Connection();