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
import { InvalidOperationError, MessageError, OutboundMessageError } from '../Errors';
import { utils } from "../Constants";
import { webApp } from "../../web/Server";
const extend = require("extend");
export class Connection {
    constructor() {
        this.emitter = new EventEmitter();
    }
    public isOpen: boolean = false;
    private _closing: boolean = false;
    private _cfg: any;
    private _port: any;
    public mockPort: boolean = false;
    private isPaused: boolean = false;
    public buffer: SendRecieveBuffer;
    private connTimer: NodeJS.Timeout;
    protected resetConnTimer(...args) {
        //console.log(`resetting connection timer`);
        if (conn.connTimer !== null) clearTimeout(conn.connTimer);
        if (!conn._cfg.mockPort && conn._cfg.inactivityRetry > 0 && !conn._closing) conn.connTimer = setTimeout(async () => {
            try {
                await conn.openAsync()
            }
            catch (err) {};
        }, conn._cfg.inactivityRetry * 1000);
    }
    public isRTS: boolean = true;
    public emitter: EventEmitter;
    public get enabled(): boolean { return typeof this._cfg !== 'undefined' && this._cfg.enabled; }
    public async setPortAsync(data: any) : Promise<any> {
        try {
            // Lets set the config data.
            let pdata = config.getSection('controller.comms', {});
            pdata.enabled = typeof data.enabled !== 'undefined' ? utils.makeBool(data.enabled) : utils.makeBool(pdata.enabled);
            pdata.netConnect = typeof data.netConnect !== 'undefined' ? utils.makeBool(data.netConnect) : utils.makeBool(pdata.netConnect);
            pdata.rs485Port = typeof data.rs485Port !== 'undefined' ? data.rs485Port : pdata.rs485Port;
            pdata.inactivityRetry = typeof data.inactivityRetry === 'number' ? data.inactivityRetry : pdata.inactivityRetry;
            if (pdata.netConnect) {
                pdata.netHost = typeof data.netHost !== 'undefined' ? data.netHost : pdata.netHost;
                pdata.netPort = typeof data.netPort === 'number' ? data.netPort : pdata.netPort;
            }
            if (!await this.closeAsync()) {
                return Promise.reject(new InvalidOperationError(`Unable to close the current RS485 port`, 'setPortAsync'));
            }
            config.setSection('controller.comms', pdata);
            this._cfg = config.getSection('controller.comms', {
                rs485Port: "/dev/ttyUSB0",
                portSettings: { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1, flowControl: false, autoOpen: false, lock: false },
                mockPort: false,
                netConnect: false,
                netHost: "raspberrypi",
                netPort: 9801,
                inactivityRetry: 10
            });
            if (!await this.openAsync()) {
                return Promise.reject(new InvalidOperationError(`Unable to open RS485 port ${pdata.rs485Port}`, 'setPortAsync'));
            }
            return this._cfg;
        } catch (err) { return Promise.reject(err); }
    }
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
                logger.info(`Net connect (socat) end event was fired`);
            });
            //nc.on('drain', () => { logger.info(`The drain event was fired.`); });
            //nc.on('lookup', (o) => { logger.info(`The lookup event was fired ${o}`); });
            // Occurs when there is no activity.  This should not reset the connection, the previous implementation did so and
            // left the connection in a weird state where the previous connection was processing events and the new connection was
            // doing so as well.  This isn't an error it is a warning as the RS485 bus will most likely be communicating at all times.
            nc.on('timeout', () => { logger.warn(`Net connect (socat) Connection Idle: ${this._cfg.netHost}:${this._cfg.netPort}`); });
            return await new Promise<boolean>((resolve, _) => {
                // We only connect an error once as we will destroy this connection on error then recreate a new socket on failure.
                nc.once('error', (err) => {
                    logger.error(`Net connect (socat) Connection: ${err}. ${this._cfg.inactivityRetry > 0 ? `Retry in ${this._cfg.inactivityRetry} seconds` : `Never retrying; inactivityRetry set to ${this._cfg.inactivityRetry}`}`);
                    this.resetConnTimer();
                    this.isOpen = false;
                    // if the promise has already been fulfilled, but the error happens later, we don't want to call the promise again.
                    if (typeof resolve !== 'undefined') { resolve(false); }
                });
                nc.connect(conn._cfg.netPort, conn._cfg.netHost, () => {
                    if (typeof this._port !== 'undefined') logger.warn('Net connect (socat) recovered from lost connection.');
                    logger.info(`Net connect (socat) Connection connected`);
                    this._port = nc;
                    this.isOpen = true;
                    resolve(true);
                    resolve = undefined;
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
                    logger.info(`Serial Port has been closed: ${err ? JSON.stringify(err) : ''}`);
                });
                sp.on('error', (err) => {
                    this.isOpen = false;
                    if (sp.isOpen) sp.close((err) => { }); // call this with the error callback so that it doesn't emit to the error again.
                    this.resetConnTimer();
                    logger.error(`Serial Port: An error occurred : ${this._cfg.rs485Port}: ${JSON.stringify(err)}`);
                });
            });
        }
    }
    public async closeAsync(): Promise<boolean> {
        try {
            this._closing = true;
            if (this.connTimer) clearTimeout(this.connTimer);
            if (typeof this._port !== 'undefined' && this.isOpen) {
                let success = await new Promise<boolean>((resolve, reject) => {
                    if (this._cfg.netConnect) {
                        this._port.removeAllListeners();
                        this._port.once('error', (err) => {
                            if (err) {
                                logger.error(`Error closing ${this._cfg.netHost}:${this._cfg.netPort}/${this._cfg.rs485Port}: ${err}`);
                                resolve(false);
                            }
                            else {
                                conn._port = undefined;
                                this.isOpen = false;
                                logger.info(`Successfully closed (socat) port ${this._cfg.netHost}:${this._cfg.netPort}/${this._cfg.rs485Port}`);
                                resolve(true);
                            }
                        });
                        this._port.once('close', (p) => {
                            this.isOpen = false;
                            this._port = undefined;
                            logger.info(`Net connect (socat) successfully closed: ${this._cfg.netHost}:${this._cfg.netPort}`);
                            resolve(true);
                        });
                        this._port.destroy();
                    }
                    else if (typeof conn._port.close === 'function') {
                        conn._port.close((err) => {
                            if (err) {
                                logger.error(`Error closing ${this._cfg.rs485Port}: ${err}`);
                                resolve(false);
                            }
                            else {
                                conn._port = undefined;
                                logger.info(`Successfully closed seral port ${this._cfg.rs485Port}`);
                                resolve(true);
                                this.isOpen = false;
                            }
                        });
                    }
                    else {
                        resolve(true);
                        conn._port = undefined;
                    }
                });
                if (success) {
                    if (typeof conn.buffer !== 'undefined') conn.buffer.close();
                }
               
                return success;
            }
            return true;
        } catch (err) { logger.error(`Error closing comms connection: ${err.message}`); return Promise.resolve(false); }
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
            if (typeof conn._port === 'undefined' || conn._port.destroyed !== false) {
                conn.openAsync().then(() => {
                    conn._port.write(bytes, 'binary', cb);
                });
            }
            else
                conn._port.write(bytes, 'binary', cb);
        }
        else
            conn._port.write(bytes, cb);
    }
    public async stopAsync() {
        try {
            await conn.closeAsync();
            logger.info(`Closed serial communications connection.`);
        } catch (err) { logger.error(`Error closing comms connection: ${err.message} `); }
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
        if (conn._cfg.enabled) conn.openAsync().then(() => { logger.debug(`Connection opened from init function;`); }).catch((err) => { logger.error(`Connection failed to open from init function. ${err}`); });
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
            if (this._cfg.enabled) this.openAsync();
        }
    }
    public queueSendMessage(msg: Outbound) { conn.emitter.emit('messagewrite', msg); }
    public pause() { conn.isPaused = true; conn.buffer.clear(); conn.drain(function (err) { }); }
    // RKS: Resume is executed in a closure.  This is because we want the current async process to complete
    // before we resume.  This way the messages are cleared right before we restart.
    public resume() { if (this.isPaused) setTimeout(function () { conn.buffer.clear(); conn.isPaused = false; }, 0); }
    // RKS: This appears to not be used.
    //public queueReceiveMessage(pkt: Inbound) {
    //    logger.info(`Receiving ${ pkt.action } `);
    //    conn.buffer.pushIn(pkt);
    //}
}
export class SendRecieveBuffer {
    constructor() {
        this._inBuffer = [];
        this._outBuffer = [];
        this.procTimer = null;//setInterval(this.processPackets, 175);
    }
    public counter: Counter = new Counter();
    private procTimer: NodeJS.Timeout;
    private _processing: boolean = false;
    private _inBytes: number[] = [];
    private _inBuffer: number[] = [];
    private _outBuffer: Outbound[] = [];
    private _waitingPacket: Outbound;
    private _msg: Inbound;
    public pushIn(pkt) {
        let self = this;
        conn.buffer._inBuffer.push.apply(conn.buffer._inBuffer, pkt.toJSON().data); setTimeout(() => { self.processPackets(); }, 0);
    }
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
                logger.silly(`Retrying outbound message after ${(dt.getTime() - conn.buffer._waitingPacket.timestamp.getTime()) / 1000} secs with ${conn.buffer._waitingPacket.remainingTries} attempt(s) left. - ${conn.buffer._waitingPacket.toShortPacket()} `);
                conn.buffer.counter.sndRetries++;
                conn.buffer.writeMessage(conn.buffer._waitingPacket);
            }
            return true;
        }
        return false;
    }
    protected processOutbound() {
        let msg: Outbound;
        if (!conn.buffer.processWaitPacket() && conn.buffer._outBuffer.length > 0) {
            if (conn.isOpen) {
                if (conn.isRTS) {
                    msg = conn.buffer._outBuffer.shift();
                    if (typeof msg === 'undefined' || !msg) return;
                    // If the serial port is busy we don't want to process any outbound.  However, this used to
                    // not process the outbound even when the incoming bytes didn't mean anything.  Now we only delay
                    // the outbound when we actually have a message signatures to process.
                    conn.buffer.writeMessage(msg);
                }
            }
            else {
                // port is closed, reject message
                msg = conn.buffer._outBuffer.shift();
                msg.failed = true;
                logger.warn(`Comms port is not open.Message aborted: ${msg.toShortPacket()} `);
                // This is a hard fail.  We don't have any more tries left and the message didn't
                // make it onto the wire.
                let error = new OutboundMessageError(msg, `Comms port is not open.Message aborted: ${msg.toShortPacket()} `);
                if (typeof msg.onComplete === 'function') msg.onComplete(error, undefined);
                conn.buffer._waitingPacket = null;
            }
        }
        // RG: added the last `|| typeof msg !== 'undef'` because virtual chem controller only sends a single packet
        // but this condition would be eval'd before the callback of conn.write was calls and the outbound packet
        // would be sitting idle for eternity. 
        if (conn.buffer._outBuffer.length > 0 || typeof conn.buffer._waitingPacket !== 'undefined' || conn.buffer._waitingPacket || typeof msg !== 'undefined') {
            // Come back later as we still have items to send.
            let self = this;
            conn.buffer.procTimer = setTimeout(() => self.processPackets(), 100);
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
                if (typeof msg.onAbort === 'function') msg.onAbort();
                else logger.warn(`Message aborted after ${msg.tries} attempt(s): ${msg.toShortPacket()} `);
                let err = new OutboundMessageError(msg, `Message aborted after ${msg.tries} attempt(s): ${msg.toShortPacket()} `);
                if (typeof msg.onComplete === 'function') msg.onComplete(err, undefined);
                if (msg.requiresResponse) {
                    if (msg.response instanceof Response && typeof (msg.response.callback) === 'function') {
                        setTimeout(msg.response.callback, 100, msg);
                    }
                }
                conn.buffer.counter.sndAborted++;
                conn.isRTS = true;
                return;
            }
            conn.buffer.counter.bytesSent += bytes.length;
            msg.timestamp = new Date();
            logger.packet(msg);
            conn.write(Buffer.from(bytes), function (err) {
                msg.tries++;
                conn.isRTS = true;
                if (err) {
                    logger.error('Error writing packet %s', err);
                    // We had an error so we need to set the waiting packet if there are retries
                    if (msg.remainingTries > 0) conn.buffer._waitingPacket = msg;
                    else {
                        msg.failed = true;
                        logger.warn(`Message aborted after ${msg.tries} attempt(s): ${bytes}: ${err} `);
                        // This is a hard fail.  We don't have any more tries left and the message didn't
                        // make it onto the wire.
                        let error = new OutboundMessageError(msg, `Message aborted after ${msg.tries} attempt(s): ${err} `);
                        if (typeof msg.onComplete === 'function') msg.onComplete(error, undefined);
                        conn.buffer._waitingPacket = null;
                        conn.buffer.counter.sndAborted++;
                    }
                }
                else {
                    logger.verbose(`Wrote packet[${bytes}].Retries remaining: ${msg.remainingTries} `);
                    // We have all the success we are going to get so if the call succeeded then
                    // don't set the waiting packet when we aren't actually waiting for a response.
                    if (!msg.requiresResponse) {
                        // As far as we know the message made it to OCP.
                        conn.buffer._waitingPacket = null;
                        if (typeof msg.onComplete === 'function') msg.onComplete(err, undefined);
                        conn.buffer.counter.sndSuccess++;

                    }
                    else if (msg.remainingTries >= 0) {
                        conn.buffer._waitingPacket = msg;
                    }
                }
                conn.buffer.counter.updatefailureRate();
                webApp.emitToChannel('rs485PortStats', 'rs485Stats', conn.buffer.counter);
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
            // RG - added check for msgOut because the *Touch chlor packet 153 adds an status packet 217
            // but if it is the only packet on the queue the outbound will have been cleared out already.
            if (out.requiresResponse && msgOut !== null) {
                if (resp instanceof Response && resp.isResponse(msgIn, out) && (typeof out.scope === 'undefined' || out.scope === msgOut.scope)) {
                    resp.message = msgIn;
                    if (typeof (resp.callback) === 'function' && resp.callback) callback = resp.callback;
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
        conn.buffer.counter.recCollisions += msg.collisions;
        logger.packet(msg);
        webApp.emitToChannel('rs485PortStats', 'rs485Stats', conn.buffer.counter);
        if (msg.isValid) {
            conn.buffer.counter.recSuccess++;
            conn.buffer.counter.updatefailureRate();
            msg.process();
            conn.buffer.clearResponses(msg);
        }
        else {
            conn.buffer.counter.recFailed++;
            conn.buffer.counter.updatefailureRate();
            console.log('RS485 Stats:' + conn.buffer.counter.toLog());
            ndx = this.rewindFailedMessage(msg, ndx);
        }
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
        this.recSuccess = 0;
        this.recFailed = 0;
        this.recCollisions = 0;
        this.bytesSent = 0;
        this.sndAborted = 0;
        this.sndRetries = 0;
        this.sndSuccess = 0;
        this.recFailureRate = 0;
        this.sndFailureRate = 0;
    }
    public bytesReceived: number;
    public bytesSent: number;
    public recSuccess: number;
    public recFailed: number;
    public recCollisions: number;
    public recFailureRate: number;
    public sndSuccess: number;
    public sndAborted: number;
    public sndRetries: number;
    public sndFailureRate: number;
    public updatefailureRate(): void {
        conn.buffer.counter.recFailureRate = (this.recFailed + this.recSuccess) !== 0 ? (this.recFailed / (this.recFailed + this.recSuccess) * 100) : 0;
        conn.buffer.counter.sndFailureRate = (this.sndAborted + this.sndSuccess) !== 0 ? (this.sndAborted / (this.sndAborted + this.sndSuccess) * 100) : 0;
        //conn.buffer.counter.recFailureRate = `${(conn.buffer.counter.recFailed / (conn.buffer.counter.recFailed + conn.buffer.counter.recSuccess) * 100).toFixed(2)}% `;
        //conn.buffer.counter.sndFailureRate = `${(conn.buffer.counter.sndAborted / (conn.buffer.counter.sndAborted + conn.buffer.counter.sndSuccess) * 100).toFixed(2)}% `;
    }
    public toLog(): string {
        return `{ "bytesReceived": ${this.bytesReceived} "success": ${this.recSuccess}, "failed": ${this.recFailed}, "bytesSent": ${this.bytesSent}, "collisions": ${this.recCollisions}, "failureRate": ${this.recFailureRate.toFixed(2)}% }`;
    }
}
export var conn: Connection = new Connection();