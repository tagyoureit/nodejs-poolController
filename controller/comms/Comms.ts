/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020, 2021, 2022.  
Russell Goldin, tagyoureit.  russ.goldin@gmail.com

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
import { AutoDetectTypes } from '@serialport/bindings-cpp';
import { EventEmitter } from 'events';
import * as net from 'net';
import { SerialPort, SerialPortMock, SerialPortOpenOptions } from 'serialport';
import { setTimeout } from 'timers';
import { config } from '../../config/Config';
import { logger } from '../../logger/Logger';
import { webApp } from "../../web/Server";
import { utils } from "../Constants";
import { sys } from "../Equipment";
import { InvalidEquipmentDataError, InvalidOperationError, OutboundMessageError } from '../Errors';
import { state } from "../State";
import { Inbound, Message, Outbound, Response } from './messages/Messages';
import { sl } from './ScreenLogic';
const extend = require("extend");
export class Connection {
    constructor() { }
    public rs485Ports: RS485Port[] = [];
    public get mock(): boolean {
        let port = this.findPortById(0);
        return typeof port !== 'undefined' && port.mock ? true : false;
    }
    public isPortEnabled(portId: number) {
        let port: RS485Port = this.findPortById(portId);
        return typeof port === 'undefined' ? false : port.enabled && port.isOpen && !port.closing;
    }
    public async deleteAuxPort(data: any): Promise<any> {
        try {
            let portId = parseInt(data.portId, 10);
            if (isNaN(portId)) return Promise.reject(new InvalidEquipmentDataError(`A valid port id was not provided to be deleted`, 'RS485Port', data.id));
            if (portId === 0) return Promise.reject(new InvalidEquipmentDataError(`You may not delete the primart RS485 Port`, 'RS485Port', data.id));
            let port = this.findPortById(portId);
            this.removePortById(portId);
            let section = `controller.comms` + (portId === 0 ? '' : portId);
            let cfg = config.getSection(section, {});
            config.removeSection(section);
            state.equipment.messages.removeItemByCode(`rs485:${portId}:connection`);
            return cfg;
        } catch (err) { logger.error(`Error deleting aux port`) }
    }
    public async setScreenlogicAsync(data: any) {
        let ccfg = config.getSection('controller.screenlogic');
        if (typeof data.type === 'undefined' || data.type !== 'local' || data.type !== 'remote') return Promise.reject(new InvalidEquipmentDataError(`Invalid Screenlogic type (${data.type}). Allowed values are 'local' or 'remote'`, 'Screenlogic', 'screenlogic'));
        if ((data.address as string).slice(8) !== 'Pentair:') return Promise.reject(new InvalidEquipmentDataError(`Invalid address (${data.address}).  Must start with 'Pentair:'`, 'Screenlogic', 'screenlogic'));
    }

    public async setPortAsync(data: any): Promise<any> {
        try {

            let ccfg = config.getSection('controller');
            let pConfig;
            let portId;
            let maxId = -1;
            for (let sec in ccfg) {
                if (sec.startsWith('comms')) {
                    let p = ccfg[sec];
                    maxId = Math.max(p.portId, maxId);
                    if (p.portId === data.portId) pConfig = p;
                }
            }
            if (typeof pConfig === 'undefined') {
                // We are adding a new one.
                if (data.portId === -1 || typeof data.portId === 'undefined') portId = maxId + 1;
                else portId = data.portId;
            }
            else portId = pConfig.portId;
            if (isNaN(portId) || portId < 0) return Promise.reject(new InvalidEquipmentDataError(`Invalid port id defined ${portId}`, 'RS485Port', data.portId));
            let section = `controller.comms` + (portId === 0 ? '' : portId);
            // Lets set the config data.
            let pdata = config.getSection(section, {
                portId: portId,
                type: 'local',
                rs485Port: "/dev/ttyUSB0",
                portSettings: { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1, flowControl: false, autoOpen: false, lock: false },
                netSettings: { allowHalfOpen: false, keepAlive: false, keepAliveInitialDelay: 1000 },
                mock: false,
                netConnect: false,
                netHost: "raspberrypi",
                netPort: 9801,
                inactivityRetry: 10
            });
            if (portId === 0) {
                pdata.screenlogic = {
                    connectionType: "local",
                    systemName: "Pentair: 00-00-00",
                    password: 1234
                }
            }

            pdata.enabled = typeof data.enabled !== 'undefined' ? utils.makeBool(data.enabled) : utils.makeBool(pdata.enabled);
            pdata.type = data.type;
            pdata.netConnect = data.type === 'network' || data.type === 'netConnect'; // typeof data.netConnect !== 'undefined' ? utils.makeBool(data.netConnect) : utils.makeBool(pdata.netConnect);
            pdata.rs485Port = typeof data.rs485Port !== 'undefined' ? data.rs485Port : pdata.rs485Port;
            pdata.inactivityRetry = typeof data.inactivityRetry === 'number' ? data.inactivityRetry : pdata.inactivityRetry;
            pdata.mock = data.mock; // typeof data.mockPort !== 'undefined' ? utils.makeBool(data.mockPort) : utils.makeBool(pdata.mockPort);
            if (pdata.mock) { pdata.rs485Port = 'MOCK_PORT'; }
            if (pdata.type === 'netConnect') { // (pdata.netConnect) {
                pdata.netHost = typeof data.netHost !== 'undefined' ? data.netHost : pdata.netHost;
                pdata.netPort = typeof data.netPort === 'number' ? data.netPort : pdata.netPort;
            }
            if (typeof data.portSettings !== 'undefined') {
                pdata.portSettings = extend(true, { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1, flowControl: false, autoOpen: false, lock: false }, pdata.portSettings, data.portSettings);
            }
            if (typeof data.netSettings !== 'undefined') {
                pdata.netSettings = extend(true, { keepAlive: false, allowHalfOpen: false, keepAliveInitialDelay: 10000 }, pdata.netSettings, data.netSettings);
            }
            if (pdata.type === 'screenlogic') {
                let password = data.screenlogic.password.toString();
                let regx = /Pentair: (?:(?:\d|[A-Z])(?:\d|[A-Z])-){2}(?:\d|[A-Z])(?:\d|[A-Z])/g;
                let type = data.screenlogic.connectionType;
                let systemName = data.screenlogic.systemName;
                if (type !== 'remote' && type !== 'local') return Promise.reject(new InvalidEquipmentDataError(`An invalid type was supplied for Screenlogic ${type}.  Must be remote or local.`, 'Screenlogic', data));
                if (systemName.match(regx) === null) return Promise.reject(new InvalidEquipmentDataError(`An invalid system name was supplied for Screenlogic ${systemName}}.  Must be in the format 'Pentair: xx-xx-xx'.`, 'Screenlogic', data));
                if (password.length !== 4) return Promise.reject(new InvalidEquipmentDataError(`An invalid password was supplied for Screenlogic ${password}. (Length must be <= 4)}`, 'Screenlogic', data));
                pdata.screenlogic = data.screenlogic;
            }
            let existing = this.findPortById(portId);
            if (typeof existing !== 'undefined')
                if (existing.type === 'screenlogic' || sl.enabled) {
                    await sl.closeAsync();
                }
                else {
                    if (!await existing.closeAsync()) {
                        existing.closing = false;  // if closing fails, reset flag so user can try again
                        return Promise.reject(new InvalidOperationError(`Unable to close the current RS485 port`, 'setPortAsync'));
                    }
                }
            config.setSection(section, pdata);
            let cfg = config.getSection(section, {
                type: 'local',
                rs485Port: "/dev/ttyUSB0",
                portSettings: { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1, flowControl: false, autoOpen: false, lock: false },
                netSettings: { allowHalfOpen: false, keepAlive: false, keepAliveInitialDelay: 5 },
                mock: false,
                netConnect: false,
                netHost: "raspberrypi",
                netPort: 9801,
                inactivityRetry: 10
            });
            if (portId === 0) {
                cfg.screenlogic = {
                    connectionType: "local",
                    systemName: "Pentair: 00-00-00",
                    password: 1234
                }
            }
            existing = this.getPortByCfg(cfg);

            if (typeof existing !== 'undefined') {
                if (pdata.type === 'screenlogic') {
                    await sl.openAsync();
                }
                else {
                    existing.reconnects = 0;
                    //existing.emitPortStats();
                    if (!await existing.openAsync(cfg)) {
                        if (cfg.netConnect) return Promise.reject(new InvalidOperationError(`Unable to open Socat Connection to ${pdata.netHost}`, 'setPortAsync'));
                        return Promise.reject(new InvalidOperationError(`Unable to open RS485 port ${pdata.rs485Port}`, 'setPortAsync'));
                    }
                }
            }
            return cfg;
        } catch (err) { return Promise.reject(err); }
    }
    public async stopAsync() {
        try {
            for (let i = this.rs485Ports.length - 1; i >= 0; i--) {
                let port = this.rs485Ports[i];
                await port.closeAsync();
            }
            logger.info(`Closed all serial communications connection.`);
        } catch (err) { logger.error(`Error closing comms connection: ${err.message} `); }
    }
    public async initAsync() {
        try {
            // So now that we are now allowing multiple comm ports we need to initialize each one.  We are keeping the comms section from the config.json
            // simply because I have no idea what the Docker folks do with this.  So the default comms will be the one with an OCP or if there are no aux ports.
            let cfg = config.getSection('controller');
            for (let section in cfg) {
                if (section.startsWith('comms')) {
                    let c = cfg[section];
                    if (typeof c.type === 'undefined') {
                        let type = 'local';
                        if (c.mockPort) type = 'mock';
                        else if (c.netConnect) type = 'network';
                        config.setSection(`controller.${section}`, c);
                        console.log(section);
                        console.log(c);
                    }
                    let port = new RS485Port(c);
                    // Alright now lets do some conversion of the existing data.

                    this.rs485Ports.push(port);
                    await port.openAsync();
                }
            }
        } catch (err) { logger.error(`Error initializing RS485 ports ${err.message}`); }
    }
    public findPortById(portId?: number): RS485Port { return this.rs485Ports.find(elem => elem.portId === (portId || 0)); }
    public async removePortById(portId: number) {
        for (let i = this.rs485Ports.length - 1; i >= 0; i--) {
            let port = this.rs485Ports[i];
            if (port.portId === portId) {
                await port.closeAsync();
                // Don't remove the primary port.  You cannot delete this one.
                if (portId !== 0) this.rs485Ports.splice(i, 1);
            }
        }
    }
    public 
    getPortByCfg(cfg: any) {
        let port = this.findPortById(cfg.portId || 0);
        if (typeof port === 'undefined') {
            port = new RS485Port(cfg);
            this.rs485Ports.push(port);
        }
        return port;
    }
    public async listInstalledPorts(): Promise<any> {
        try {
            let ports = [];
            // So now that we are now allowing multiple comm ports we need to initialize each one.  We are keeping the comms section from the config.json
            // simply because I have no idea what the Docker folks do with this.  So the default comms will be the one with an OCP or if there are no aux ports.
            let cfg = config.getSection('controller');
            for (let section in cfg) {
                if (section.startsWith('comms')) {
                    let port = config.getSection(`controller.${section}`);
                    if (port.portId === 0) port.name = 'Primary';
                    else port.name = `Aux${port.portId}`;
                    let p = this.findPortById(port.portId);
                    port.isOpen = typeof p !== 'undefined' ? p.isOpen : false;
                    ports.push(port);
                }
            }
            return ports;
        } catch (err) { logger.error(`Error listing installed RS485 ports ${err.message}`); }

    }
    private getBroadcastPorts(currPort: RS485Port) {
        // if an ANSLQ25 controller is present, broadcast outbound writes to all other ports that are not mock or dedicated for a pump or chlor
        let anslq25port = sys.anslq25.portId;
        let duplicateTo: number[] = [];
        if (anslq25port >= 0) {
            let ports = this.rs485Ports;
            for (let i = 0; i < ports.length; i++) {
                // if (ports[i].mockPort) continue;
                if (ports[i].portId === currPort.portId) continue;
                if (ports[i].portId === anslq25port) continue; // don't resend
                if (!ports[i].isOpen) continue;
                duplicateTo.push(ports[i].portId);
            }
            let pumps = sys.pumps.get();
            for (let i = 0; i < pumps.length; i++) {
                if (pumps[i].portId === currPort.portId ||
                    pumps[i].portId === anslq25port) {
                    if (duplicateTo.includes(pumps[i].portId)) duplicateTo.splice(duplicateTo.indexOf(pumps[i].portId, 1));
                }
            }
            let chlors = sys.chlorinators.get();
            for (let i = 0; i < chlors.length; i++) {
                if (chlors[i].portId === currPort.portId ||
                    chlors[i].portId === anslq25port) {
                    if (duplicateTo.includes(chlors[i].portId)) duplicateTo.splice(duplicateTo.indexOf(chlors[i].portId, 1));
                }
            }
        }
        // send to the ansql25 port first, where possible 
        if (currPort.portId !== anslq25port) duplicateTo.unshift(anslq25port);
        return duplicateTo;
    }
    /*     public queueInboundToAnslq25(_msg: Inbound) {
            // if we have a valid inbound packet on any port (besides dedicated pump/chlor) then also send to anslq25
            if (!sys.anslq25.isActive || sys.anslq25.portId < 0 || !sys.anslq25.broadcastComms) return;
            if (typeof _msg.isClone !== 'undefined' && _msg.isClone) return;
            let anslq25port = sys.anslq25.portId;
            if (anslq25port === _msg.portId) return;
            let port = this.findPortById(anslq25port);
            let msg = _msg.clone();
            msg.portId = port.portId;
            msg.isClone = true;
            msg.id = Message.nextMessageId;
            (msg as Inbound).process();
        } */


    /*     public queueInboundToBroadcast(_msg: Outbound) {
            // if we have a valid inbound packet on any port (besides dedicated pump/chlor) then also send to anslq25
            if (!sys.anslq25.isActive || sys.anslq25.portId < 0 || !sys.anslq25.broadcastComms) return;
            if (typeof _msg.isClone !== 'undefined' && _msg.isClone) return;
            let anslq25port = sys.anslq25.portId;
            if (anslq25port === _msg.portId) return;
            let port = this.findPortById(anslq25port);
            let msg = _msg.clone();
            msg.portId = port.portId;
            msg.isClone = true;
            msg.id = Message.nextMessageId;
            (msg as Inbound).process();
        } */

    /*     public queueOutboundToAnslq25(_msg: Outbound) {
            // if we have a valid inbound packet on any port (besides dedicated pump/chlor) then also send to anslq25
            if (!sys.anslq25.isActive || sys.anslq25.portId < 0 || !sys.anslq25.broadcastComms) return;
            if (typeof _msg.isClone !== 'undefined' && _msg.isClone) return;
            let anslq25port = sys.anslq25.portId;
            let _ports = this.getBroadcastPorts(this.findPortById(_msg.portId));
            let msgs: Outbound[] = [];
            for (let i = 0; i < _ports.length; i++) {
                let port = this.findPortById(_ports[i]);
                if (port.portId === _msg.portId) continue;
                let msg = _msg.clone() as Outbound;
                msg.isClone = true;
                msg.portId = port.portId;
                msg.response = _msg.response;
                msgs.push(msg);
            }
            return msgs;
        } */
    public queueOutboundToBroadcast(_msg: Outbound) {
        // if we have a valid inbound packet on any port (besides dedicated pump/chlor) then also send to anslq25
        if (!sys.anslq25.isActive || sys.anslq25.portId < 0 || !sys.anslq25.broadcastComms) return;
        if (typeof _msg.isClone !== 'undefined' && _msg.isClone) return;
        let anslq25port = sys.anslq25.portId;
        let _ports = this.getBroadcastPorts(this.findPortById(_msg.portId));
        let msgs: Inbound[] = [];
        for (let i = 0; i < _ports.length; i++) {
            let port = this.findPortById(_ports[i]);
            if (port.portId === _msg.portId) continue;
            // // let msg = _msg.clone() as Inbound;
            // let msg = Message.convertOutboundToInbound(_msg);
            // msg.isClone = true;
            // msg.portId = port.portId;

            //     msg.process();
            setTimeout(() => { port.pushIn(Buffer.from(_msg.toPacket())) }, 100);
            logger.silly(`mock inbound write bytes port:${_msg.portId} id:${_msg.id} bytes:${_msg.toShortPacket()}`)
            // logger.packet()
            // (msg as Inbound).process();
            // msgs.push(msg);
        }
        // return msgs;
    }
    public queueSendMessage(msg: Outbound) {
        let port = this.findPortById(msg.portId);
        if (typeof port !== 'undefined') {
            port.emitter.emit('messagewrite', msg);
        }
        else
            logger.error(`queueSendMessage: Message was targeted for undefined port ${msg.portId || 0}`);
    }

    public async queueSendMessageAsync(msg: Outbound): Promise<boolean> {
        return new Promise(async (resolve, reject) => {


            let port = this.findPortById(msg.portId);

            if (typeof port === 'undefined') {
                logger.error(`queueSendMessage: Message was targeted for undefined port ${msg.portId || 0}`);
                return;
            }
            // also send to other broadcast ports
            // let msgs = conn.queueOutboundToAnslq25(msg);
            let msgs = [];
            // conn.queueInboundToBroadcast(msg);
            conn.queueOutboundToBroadcast(msg);
            /* if (msgs.length > 0) {
                msgs.push(msg);
                let promises: Promise<boolean>[] = [];
                for (let i = 0; i < msgs.length; i++) {
                    let p: Promise<boolean> = new Promise((_resolve, _reject) => {
                        msgs[i].onComplete = (err) => {
                            if (err) {
                                console.log(`rejecting ${msg.id} ${msg.portId} ${msg.action}`);
                                _reject(err);
                            }
                            else 
                            {
                                console.log(`resolving id:${msg.id} portid:${msg.portId} dir:${msg.direction} action:${msg.action}`);
                                _resolve(true);
                            }
                        }
                        let _port = this.findPortById(msgs[i].portId);
                        _port.emitter.emit('messagewrite', msgs[i]);
                    });
                    promises.push(p);
                }
                let res = false;
                await Promise.allSettled(promises).
                    then((results) => {

                        results.forEach((result) => {
                            console.log(result.status);
                            if (result.status === 'fulfilled') {res = true;}
                        });
                    });
                    if (res) resolve(true); else reject(`No packets had responses.`);
            }
            else { */
            msg.onComplete = (err) => {
                if (err) {
                    reject(err);
                }
                else resolve(true);
            }
            port.emitter.emit('messagewrite', msg);
            // let ports = this.getBroadcastPorts(port);
            //}




        })
    }

    // public sendMockPacket(msg: Inbound) {
    //     let port = this.findPortById(msg.portId);
    //     port.emitter.emit('mockmessagewrite', msg);
    // }

    public pauseAll() {
        for (let i = 0; i < this.rs485Ports.length; i++) {
            let port = this.rs485Ports[i];
            port.pause();
        }
    }
    public resumeAll() {
        for (let i = 0; i < this.rs485Ports.length; i++) {
            let port = this.rs485Ports[i];
            port.resume();
        }
    }
    public async getLocalPortsAsync(): Promise<any> {
        try {
            return await SerialPort.list();
        } catch (err) { logger.error(`Error retrieving local ports ${err.message}`); }
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
        this.recRewinds = 0;
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
    public recRewinds: number;
    public updatefailureRate(): void {
        this.recFailureRate = (this.recFailed + this.recSuccess) !== 0 ? (this.recFailed / (this.recFailed + this.recSuccess) * 100) : 0;
        this.sndFailureRate = (this.sndAborted + this.sndSuccess) !== 0 ? (this.sndAborted / (this.sndAborted + this.sndSuccess) * 100) : 0;
    }
    public toLog(): string {
        return `{ "bytesReceived": ${this.bytesReceived} "success": ${this.recSuccess}, "failed": ${this.recFailed}, "bytesSent": ${this.bytesSent}, "collisions": ${this.recCollisions}, "failureRate": ${this.recFailureRate.toFixed(2)}% }`;
    }
}
// The following class allows njsPC to have multiple RS485 buses.  Each port has its own buffer and message processor
// so that devices on the bus can be isolated to a particular port.  By doing this the communications are such that multiple
// ports can be used to accommodate differing port speeds and fixed port addresses.  If an 
export class RS485Port {
    constructor(cfg: any) {
        this._cfg = cfg;

        this.emitter = new EventEmitter();
        this._inBuffer = [];
        this._outBuffer = [];
        this.procTimer = null;
        this.emitter.on('messagewrite', (msg) => { this.pushOut(msg); });
        this.emitter.on('mockmessagewrite', (msg) => {
            let bytes = msg.toPacket();
            this.counter.bytesSent += bytes.length;
            this.counter.sndSuccess++;
            this.emitPortStats();
            msg.process();
        });

    }
    public get name(): string { return this.portId === 0 ? 'Primary' : `Aux${this.portId}` }
    public isRTS: boolean = true;
    public reconnects: number = 0;
    public emitter: EventEmitter;
    public get portId() { return typeof this._cfg !== 'undefined' && typeof this._cfg.portId !== 'undefined' ? this._cfg.portId : 0; }
    public get type() { return typeof this._cfg.type !== 'undefined' ? this._cfg.type : this._cfg.netConnect ? 'netConnect' : this._cfg.mockPort || this._cfg.mock ? 'mock' : 'local' };
    public isOpen: boolean = false;
    public closing: boolean = false;
    private _cfg: any;
    private _port: SerialPort | SerialPortMock | net.Socket;
    public mock: boolean = false;
    private isPaused: boolean = false;
    private connTimer: NodeJS.Timeout;
    //public buffer: SendRecieveBuffer;
    public get enabled(): boolean { return typeof this._cfg !== 'undefined' && this._cfg.enabled; }
    public counter: Counter = new Counter();
    private procTimer: NodeJS.Timeout;
    public writeTimer: NodeJS.Timeout
    private _processing: boolean = false;
    private _inBytes: number[] = [];
    private _inBuffer: number[] = [];
    private _outBuffer: Outbound[] = [];
    private _waitingPacket: Outbound;
    private _msg: Inbound;
    // Connection management functions
    public async openAsync(cfg?: any): Promise<boolean> {
        if (this.isOpen) await this.closeAsync();
        if (typeof cfg !== 'undefined') this._cfg = cfg;
        if (!this._cfg.enabled) {
            this.emitPortStats();
            state.equipment.messages.removeItemByCode(`rs485:${this.portId}:connection`);
            return true;
        }
        if (this._cfg.netConnect && !this._cfg.mock) {
            if (typeof this._port !== 'undefined' && this.isOpen) {
                // This used to try to reconnect and recreate events even though the socket was already connected.  This resulted in
                // instances where multiple event processors were present.  Node doesn't give us any indication that the socket is
                // still viable or if it is closing from either end.
                return true;
            }
            else if (typeof this._port !== 'undefined') {
                // We need to kill the existing connection by ending it.
                let port = this._port as net.Socket;
                await new Promise<boolean>((resolve, _) => {
                    port.end(() => {
                        resolve(true);
                    });
                });
                port.destroy();
            }
            let opts = extend(true, { keepAliveInitialDelay: 0 }, this._cfg.netSettings);
            // Convert the initial delay to milliseconds.
            if (typeof this._cfg.netSettings !== 'undefined' && typeof this._cfg.netSettings.keepAliveInitialDelay === 'number') opts.keepAliveInitialDelay = this._cfg.netSettings.keepAliveInitialDelay * 1000;
            let nc: net.Socket = new net.Socket(opts);
            nc.once('connect', () => { logger.info(`Net connect (socat) ${this._cfg.portId} connected to: ${this._cfg.netHost}:${this._cfg.netPort}`); }); // Socket is opened but not yet ready.
            nc.once('ready', () => {
                this.isOpen = true;
                this.isRTS = true;
                logger.info(`Net connect (socat) ${this._cfg.portId} ready and communicating: ${this._cfg.netHost}:${this._cfg.netPort}`);
                nc.on('data', (data) => {
                    //this.resetConnTimer();
                    if (data.length > 0 && !this.isPaused) this.pushIn(data);
                });
                this.emitPortStats();
                this.processPackets(); // if any new packets have been added to queue, process them.
                state.equipment.messages.removeItemByCode(`rs485:${this.portId}:connection`);
            });

            nc.once('close', (p) => {
                this.isOpen = false;
                if (typeof this._port !== 'undefined' && !this._port.destroyed) this._port.destroy();
                this._port = undefined;
                this.clearOutboundBuffer();
                this.emitPortStats();
                if (!this.closing) {
                    // If we are closing manually this event should have been cleared already and should never be called.  If this is fired out
                    // of sequence then we will check the closing flag to ensure we are not forcibly closing the socket.
                    if (typeof this.connTimer !== 'undefined' && this.connTimer) {
                        clearTimeout(this.connTimer);
                        this.connTimer = null;
                    }
                    this.connTimer = setTimeout(async () => {
                        try {
                            // We are already closed so give some inactivity retry and try again.
                            await this.openAsync();
                        } catch (err) { }
                    }, this._cfg.inactivityRetry * 1000);
                }
                logger.info(`Net connect (socat) ${this._cfg.portId} closed ${p === true ? 'due to error' : ''}: ${this._cfg.netHost}:${this._cfg.netPort}`);
            });
            nc.on('end', () => { // Happens when the other end of the socket closes.
                this.isOpen = false;
                logger.info(`Net connect (socat) ${this.portId} end event was fired`);
            });
            //nc.on('drain', () => { logger.info(`The drain event was fired.`); });
            //nc.on('lookup', (o) => { logger.info(`The lookup event was fired ${o}`); });
            // Occurs when there is no activity.  This should not reset the connection, the previous implementation did so and
            // left the connection in a weird state where the previous connection was processing events and the new connection was
            // doing so as well.  This isn't an error it is a warning as the RS485 bus will most likely be communicating at all times.
            //nc.on('timeout', () => { logger.warn(`Net connect (socat) Connection Idle: ${this._cfg.netHost}:${this._cfg.netPort}`); });
            if (this._cfg.inactivityRetry > 0) {
                nc.setTimeout(Math.max(this._cfg.inactivityRetry, 10) * 1000, async () => {
                    logger.warn(`Net connect (socat) connection idle: ${this._cfg.netHost}:${this._cfg.netPort} retrying connection.`);
                    try {
                        await this.closeAsync();
                        await this.openAsync();
                    } catch (err) { logger.error(`Net connect (socat)$ {this.portId} error retrying connection ${err.message}`); }
                });
            }

            return await new Promise<boolean>((resolve, _) => {
                // We only connect an error once as we will destroy this connection on error then recreate a new socket on failure.
                nc.once('error', (err) => {
                    logger.error(`Net connect (socat) error: ${err.message}`);
                    //logger.error(`Net connect (socat) Connection: ${err}. ${this._cfg.inactivityRetry > 0 ? `Retry in ${this._cfg.inactivityRetry} seconds` : `Never retrying; inactivityRetry set to ${this._cfg.inactivityRetry}`}`);
                    //this.resetConnTimer();
                    this.isOpen = false;
                    this.emitPortStats();
                    this.processPackets(); // if any new packets have been added to queue, process them.

                    // if the promise has already been fulfilled, but the error happens later, we don't want to call the promise again.
                    if (typeof resolve !== 'undefined') { resolve(false); }
                    if (this._cfg.inactivityRetry > 0) {
                        logger.error(`Net connect (socat) connection ${this.portId} error: ${err}.  Retry in ${this._cfg.inactivityRetry} seconds`);
                        if (this.connTimer) clearTimeout(this.connTimer);
                        this.connTimer = setTimeout(async () => { try { await this.openAsync(); } catch (err) { } }, this._cfg.inactivityRetry * 1000);
                    }
                    else logger.error(`Net connect (socat) connection ${this.portId} error: ${err}.  Never retrying -- No retry time set`);
                    state.equipment.messages.setMessageByCode(`rs485:${this.portId}:connection`, 'error', `${this.name} RS485 port disconnected`);
                });
                nc.connect(this._cfg.netPort, this._cfg.netHost, () => {
                    if (typeof this._port !== 'undefined') logger.warn(`Net connect (socat) ${this.portId} recovered from lost connection.`);
                    logger.info(`Net connect (socat) Connection ${this.portId} connected`);
                    this._port = nc;
                    // if just changing existing port, reset key flags
                    this.isOpen = true;
                    this.isRTS = true;
                    this.closing = false;
                    this._processing = false;
                    this.emitPortStats();
                    resolve(true);
                    resolve = undefined;
                });
            });
        }
        else {
            if (typeof this._port !== 'undefined' && this.isOpen) {
                // This used to try to reconnect even though the serial port was already connected.  This resulted in
                // instances where an access denied error was emitted.  So if the port is open we will simply return.
                this.resetConnTimer();
                return true;
            }
            let sp: SerialPort | SerialPortMock = null;
            if (this._cfg.mock) {
                this.mock = true;
                let portPath = 'MOCK_PORT';
                SerialPortMock.binding.createPort(portPath)
                // SerialPortMock.binding = SerialPortMock;
                // SerialPortMock.createPort(portPath, { echo: false, record: true });
                let opts: SerialPortOpenOptions<AutoDetectTypes> = { path: portPath, autoOpen: false, baudRate: 9600 };
                sp = new SerialPortMock(opts);
            }
            else if (this._cfg.type === 'screenlogic') {
                return await sl.openAsync();
            }
            else {
                this.mock = false;
                let opts: SerialPortOpenOptions<AutoDetectTypes> = extend(true, { path: this._cfg.rs485Port }, this._cfg.portSettings);
                sp = new SerialPort(opts);
            }
            return await new Promise<boolean>((resolve, _) => {
                // The serial port open method calls the callback just once.  Unfortunately that is not the case for
                // network serial port connections.  There really isn't a way to make it syncronous.  The openAsync will truly
                // be open if a hardware interface is used and this method returns.
                sp.open((err) => {
                    if (err) {
                        this.resetConnTimer();
                        this.isOpen = false;
                        logger.error(`Error opening port ${this.portId}: ${err.message}. ${this._cfg.inactivityRetry > 0 && !this.mock ? `Retry in ${this._cfg.inactivityRetry} seconds` : `Never retrying; (fwiw, inactivityRetry set to ${this._cfg.inactivityRetry})`}`);
                        resolve(false);
                        state.equipment.messages.setMessageByCode(`rs485:${this.portId}:connection`, 'error', `${this.name} RS485 port disconnected`);
                    }
                    else {
                        state.equipment.messages.removeItemByCode(`rs485:${this.portId}:connection`);
                        resolve(true);
                    }
                    this.emitPortStats();

                });
                // The event processors below should not resolve or reject the promise.  This is the misnomer with the stupid javascript promise
                // structure when dealing with serial ports.  The original promise will be either accepted or rejected above with the open method.  These 
                // won't be called until long after the promise is resolved above.  Yes we should never reject this promise.  The resolution is true
                // for a successul connect and false otherwise.
                sp.on('open', () => {
                    if (typeof this._port !== 'undefined') logger.info(`Serial Port ${this.portId}: ${this._cfg.rs485Port} recovered from lost connection.`)
                    else logger.info(`Serial port: ${sp.path} request to open successful ${sp.baudRate}b ${sp.port.openOptions.dataBits}-${sp.port.openOptions.parity}-${sp.port.openOptions.stopBits}`);
                    this._port = sp;
                    this.isOpen = true;
                    /// if just changing existing port, reset key flags
                    this.isRTS = true;
                    this.closing = false;
                    this._processing = false;
                    sp.on('data', (data) => {
                        if (!this.mock && !this.isPaused) this.resetConnTimer();
                        this.pushIn(data);
                    });
                    this.resetConnTimer();
                    this.emitPortStats();
                });
                sp.on('close', (err) => {
                    this.isOpen = false;
                    if (err && err.disconnected) {
                        logger.info(`Serial Port  ${this.portId} - ${this._cfg.rs485Port} has been disconnected and closed.  ${JSON.stringify(err)}`)
                    }
                    else {
                        logger.info(`Serial Port ${this.portId} - ${this._cfg.rs485Port} has been closed. ${err ? JSON.stringify(err) : ''}`);
                    }
                });
                sp.on('error', (err) => {
                    // an underlying streams error from a SP write may call the error event
                    // instead/in leiu of the error callback
                    if (typeof this.writeTimer !== 'undefined') { clearTimeout(this.writeTimer); this.writeTimer = null; }
                    this.isOpen = false;
                    if (sp.isOpen) sp.close((err) => { }); // call this with the error callback so that it doesn't emit to the error again.
                    this.resetConnTimer();
                    logger.error(`Serial Port ${this.portId}: An error occurred : ${this._cfg.rs485Port}: ${JSON.stringify(err)}`);
                    this.emitPortStats();

                });
            });
        }
    }
    public async closeAsync(): Promise<boolean> {
        try {
            if (this.closing) return false;
            this.closing = true;
            if (this.connTimer) clearTimeout(this.connTimer);
            if (typeof this._port !== 'undefined' && this.isOpen) {
                let success = await new Promise<boolean>(async (resolve, reject) => {
                    if (this._cfg.netConnect) {
                        this._port.removeAllListeners();
                        this._port.once('error', (err) => {
                            if (err) {
                                logger.error(`Error closing ${this.portId} ${this._cfg.netHost}: ${this._cfg.netPort} / ${this._cfg.rs485Port}: ${err}`);
                                resolve(false);
                            }
                            else {
                                // RSG - per the docs the error event will subsequently
                                // fire the close event.  This block should never be called and
                                // likely isn't needed; error listener should always have an err passed
                                this._port.removeAllListeners();  // call again since we added 2x .once below.
                                this._port = undefined;
                                this.isOpen = false;
                                logger.info(`Successfully closed (socat) ${this.portId} port ${this._cfg.netHost}:${this._cfg.netPort} / ${this._cfg.rs485Port}`);
                                resolve(true);
                            }
                        });
                        this._port.once('end', () => {
                            logger.info(`Net connect (socat) ${this.portId} closing: ${this._cfg.netHost}:${this._cfg.netPort}`);
                        });
                        this._port.once('close', (p) => {
                            this._port.removeAllListeners();  // call again since we added 2x .once above.
                            this.isOpen = false;
                            this._port = undefined;
                            logger.info(`Net connect (socat) ${this.portId} successfully closed: ${this._cfg.netHost}:${this._cfg.netPort}`);
                            resolve(true);
                        });
                        logger.info(`Net connect (socat) ${this.portId} request close: ${this._cfg.netHost}:${this._cfg.netPort}`);
                        // Unfortunately the end call does not actually work in node.  It will simply not return anything so we are going to
                        // just call destroy and forcibly close it.
                        let port = this._port as net.Socket;
                        await new Promise<boolean>((resfin, _) => {
                            port.end(() => {
                                logger.info(`Net connect (socat) ${this.portId} sent FIN packet: ${this._cfg.netHost}:${this._cfg.netPort}`);
                                resfin(true);
                            });
                        });

                        if (typeof this._port !== 'undefined') {
                            logger.info(`Net connect (socat) destroy socket: ${this._cfg.netHost}:${this._cfg.netPort}`);
                            this._port.destroy();
                        }
                    }
                    else if (!(this._port instanceof net.Socket) && typeof this._port.close === 'function') {
                        this._port.close((err) => {
                            if (err) {
                                logger.error(`Error closing ${this.portId} serial port ${this._cfg.rs485Port}: ${err}`);
                                resolve(false);
                            }
                            else {
                                this._port.removeAllListeners(); // remove any listeners still around
                                this._port = undefined;
                                logger.info(`Successfully closed portId ${this.portId} for serial port ${this._cfg.rs485Port}`);
                                this.isOpen = false;
                                resolve(true);
                            }
                        });
                    }
                    else {
                        resolve(true);
                        this._port = undefined;
                    }
                });
                if (success) { this.closeBuffer(); }
                return success;
            }
            return true;
        } catch (err) { logger.error(`Error closing comms connection ${this.portId}: ${err.message}`); return false; }
        finally { this.emitPortStats(); }
    }
    public pause() { this.isPaused = true; this.clearBuffer(); this.drain(function (err) { }); }
    // RKS: Resume is executed in a closure.  This is because we want the current async process to complete
    // before we resume.  This way the messages are cleared right before we restart.
    public resume() { if (this.isPaused) setTimeout(() => { this.clearBuffer(); this.isPaused = false; }, 0); }
    protected resetConnTimer(...args) {
        //console.log(`resetting connection timer`);
        if (this.connTimer !== null) clearTimeout(this.connTimer);
        if (!this._cfg.mockPort && this._cfg.inactivityRetry > 0 && !this.closing) this.connTimer = setTimeout(async () => {
            try {
                if (this._cfg.netConnect)
                    logger.warn(`Inactivity timeout for ${this.portId} serial port ${this._cfg.netHost}:${this._cfg.netPort}/${this._cfg.rs485Port} after ${this._cfg.inactivityRetry} seconds`);
                else
                    logger.warn(`Inactivity timeout for ${this.portId} serial port ${this._cfg.rs485Port} after ${this._cfg.inactivityRetry} seconds`);
                //await this.closeAsync();
                this.reconnects++;
                await this.openAsync();
            }
            catch (err) { logger.error(`Error resetting RS485 port on inactivity: ${err.message}`); };
        }, this._cfg.inactivityRetry * 1000);
    }
    // Data management functions
    public drain(cb: (err?: Error) => void) {
        if (typeof this._port === 'undefined') {
            logger.debug(`Serial Port ${this.portId}: Cannot perform drain function on port that is not open.`);
            cb();
        }
        if ((this._port instanceof SerialPort || this._port instanceof SerialPortMock) && typeof (this._port.drain) === 'function')
            this._port.drain(cb as (err) => void);
        else // Call the method immediately as the port doesn't wait to send.
            cb();
    }
    public write(msg: Outbound, cb: (err?: Error) => void) {
        let bytes = Buffer.from(msg.toPacket());
        let _cb = cb;
        if (this._cfg.netConnect) {
            // SOCAT drops the connection and destroys the stream.  Could be weeks or as little as a day.
            if (typeof this._port === 'undefined' || this._port.destroyed !== false) {
                this.openAsync().then(() => {
                    (this._port as net.Socket).write(bytes, 'binary', cb);
                });
            }
            else
                (this._port as net.Socket).write(bytes, 'binary', cb);
        }
        else {
            if (this._port instanceof SerialPortMock && this.mock === true) {
                msg.processMock();
                cb();
            }
            else {

                this.writeTimer = setTimeout(() => {
                    // RSG - I ran into a scenario where the underlying stream
                    // processor was not retuning the CB and comms would 
                    // completely stop.  This timeout is a failsafe.
                    // Further, the underlying stream may throw an event error 
                    // and not call the callback (per node docs) hence the
                    // public writeTimer.
                    if (typeof cb === 'function') {
                        cb = undefined;
                        _cb(new Error(`Serialport stream has not called the callback in 3s.`));
                    }
                }, 3000);
                this._port.write(bytes, (err) => {
                    if (typeof this.writeTimer !== 'undefined') {
                        clearTimeout(this.writeTimer);
                        this.writeTimer = null;
                        // resolve();
                        if (typeof cb === 'function') {
                            cb = undefined;
                            _cb(err);
                        }
                    }
                });
            }

        }
    }
    // make public for now; should enable writing directly to mock port at Conn level...
    public pushIn(pkt: Buffer) {
        this._inBuffer.push.apply(this._inBuffer, pkt.toJSON().data); if (sys.isReady) setImmediate(() => { this.processPackets(); });
    }
    private pushOut(msg) {
        this._outBuffer.push(msg); setImmediate(() => { this.processPackets(); });
    }
    private clearBuffer() { this._inBuffer.length = 0; this.clearOutboundBuffer(); }
    private closeBuffer() { clearTimeout(this.procTimer); this.clearBuffer(); this._msg = undefined; }
    private clearOutboundBuffer() {
        // let processing = this._processing; // we are closing the port.  don't need to reinstate this status afterwards
        clearTimeout(this.procTimer);
        this.procTimer = null;
        this._processing = true;
        this.isRTS = false;
        let msg: Outbound = typeof this._waitingPacket !== 'undefined' ? this._waitingPacket : this._outBuffer.shift();
        this._waitingPacket = null;
        while (typeof msg !== 'undefined' && msg) {
            // Fail the message.
            msg.failed = true;
            if (typeof msg.onAbort === 'function') msg.onAbort();
            else logger.warn(`Message cleared from outbound buffer: ${msg.toShortPacket()} `);
            let err = new OutboundMessageError(msg, `Message cleared from outbound buffer: ${msg.toShortPacket()} `);
            if (typeof msg.onComplete === 'function') msg.onComplete(err, undefined);
            if (msg.requiresResponse) {
                // Wait for this current process to complete then bombard all the processes with the callback.
                if (msg.response instanceof Response && typeof (msg.response.callback) === 'function') setImmediate(msg.response.callback, msg);
            }
            this.counter.sndAborted++;
            msg = this._outBuffer.shift();
        }
        //this._processing = false; // processing; - we are closing the port
        //this.isRTS = true; // - we are closing the port
    }
    private processPackets() {
        if (this._processing || this.closing) return;
        if (this.procTimer) {
            clearTimeout(this.procTimer);
            this.procTimer = null;
        }
        this._processing = true;
        this.processInboundPackets();
        this.processOutboundPackets();
        this._processing = false;
    }
    private processWaitPacket(): boolean {
        if (typeof this._waitingPacket !== 'undefined' && this._waitingPacket) {
            let timeout = this._waitingPacket.timeout || 1000;
            let dt = new Date();
            if (this._waitingPacket.timestamp.getTime() + timeout < dt.getTime()) {
                logger.silly(`Retrying outbound message after ${(dt.getTime() - this._waitingPacket.timestamp.getTime()) / 1000} secs with ${this._waitingPacket.remainingTries} attempt(s) left. - ${this._waitingPacket.toShortPacket()} `);
                this.counter.sndRetries++;
                this.writeMessage(this._waitingPacket);
            }
            return true;
        }
        return false;
    }
    protected processOutboundPackets() {
        let msg: Outbound;
        if (!this.processWaitPacket() && this._outBuffer.length > 0) {
            if (this.isOpen || this.closing) {
                if (this.isRTS) {
                    msg = this._outBuffer.shift();
                    if (typeof msg === 'undefined' || !msg) return;
                    // If the serial port is busy we don't want to process any outbound.  However, this used to
                    // not process the outbound even when the incoming bytes didn't mean anything.  Now we only delay
                    // the outbound when we actually have a message signatures to process.
                    this.writeMessage(msg);
                }
            }
            else {
                // port is closed, reject message
                msg = this._outBuffer.shift();
                msg.failed = true;
                logger.warn(`Comms port ${msg.portId} is not open. Message aborted: ${msg.toShortPacket()} `);
                // This is a hard fail.  We don't have any more tries left and the message didn't
                // make it onto the wire.
                if (typeof msg.onAbort === 'function') msg.onAbort();
                else logger.warn(`Message aborted after ${msg.tries} attempt(s): ${msg.toShortPacket()} `);
                let error = new OutboundMessageError(msg, `Comms port ${msg.portId} is not open. Message aborted: ${msg.toShortPacket()} `);
                if (typeof msg.onComplete === 'function') msg.onComplete(error, undefined);
                this._waitingPacket = null;
                this.counter.sndAborted++;
                this.counter.updatefailureRate();
                this.emitPortStats();
                // return; // if port isn't open, do not continue and setTimeout 
            }
        }
        // RG: added the last `|| typeof msg !== 'undef'` because virtual chem controller only sends a single packet
        // but this condition would be eval'd before the callback of port.write was calls and the outbound packet
        // would be sitting idle for eternity. 
        if (this._outBuffer.length > 0 || typeof this._waitingPacket !== 'undefined' || this._waitingPacket || typeof msg !== 'undefined') {
            // Come back later as we still have items to send.
            let self = this;
            this.procTimer = setTimeout(() => self.processPackets(), 100);
        }
    }
    private writeMessage(msg: Outbound) {
        // Make sure we are not re-entrant while the the port.write is going on.
        // This ends in goofiness as it can send more than one message at a time while it
        // waits for the command buffer to be flushed.  NOTE: There is no success message and the callback to
        // write only verifies that the buffer got ahold of it.
        let self = this;
        try {
            if (!this.isRTS || this.closing) return;
            var bytes = msg.toPacket();
            if (this.isOpen) {
                this.isRTS = false;  // only set if port is open, otherwise it won't be set back to true
                if (msg.remainingTries <= 0) {
                    // It will almost never fall into here.  The rare case where
                    // we have an RTS semaphore and a waiting response might make it go here.
                    msg.failed = true;
                    this._waitingPacket = null;
                    if (typeof msg.onAbort === 'function') msg.onAbort();
                    else logger.warn(`Message aborted after ${msg.tries} attempt(s): ${msg.toShortPacket()} `);
                    let err = new OutboundMessageError(msg, `Message aborted after ${msg.tries} attempt(s): ${msg.toShortPacket()} `);
                    if (typeof msg.onComplete === 'function') msg.onComplete(err, undefined);
                    if (msg.requiresResponse) {
                        if (msg.response instanceof Response && typeof (msg.response.callback) === 'function') {
                            setTimeout(msg.response.callback, 100, msg);
                        }
                    }
                    this.counter.sndAborted++;
                    this.isRTS = true;
                    return;
                }
                this.counter.bytesSent += bytes.length;
                msg.timestamp = new Date();
                logger.packet(msg);
                this.write(msg, (err) => {
                    clearTimeout(this.writeTimer);
                    this.writeTimer = null;
                    msg.tries++;
                    this.isRTS = true;
                    if (err) {
                        if (msg.remainingTries > 0) self._waitingPacket = msg;
                        else {
                            msg.failed = true;
                            logger.warn(`Message aborted after ${msg.tries} attempt(s): ${bytes}: ${err} `);
                            // this is a hard fail.  We don't have any more tries left and the message didn't
                            // make it onto the wire.
                            let error = new OutboundMessageError(msg, `Message aborted after ${msg.tries} attempt(s): ${err} `);
                            if (typeof msg.onComplete === 'function') msg.onComplete(error, undefined);
                            self._waitingPacket = null;
                            self.counter.sndAborted++;
                        }
                        return;
                    }
                    else {
                        logger.verbose(`Wrote packet [Port ${this.portId} id: ${msg.id}] [${bytes}].Retries remaining: ${msg.remainingTries} `);
                        // We have all the success we are going to get so if the call succeeded then
                        // don't set the waiting packet when we aren't actually waiting for a response.
                        if (!msg.requiresResponse) {
                            // As far as we know the message made it to OCP.
                            self._waitingPacket = null;
                            self.counter.sndSuccess++;
                            if (typeof msg.onComplete === 'function') msg.onComplete(err, undefined);

                        }
                        else if (msg.remainingTries >= 0) {
                            self._waitingPacket = msg;
                        }
                    }
                    self.counter.updatefailureRate();
                    self.emitPortStats();
                });
            }
        }
        catch (err) {
            logger.error(`Error sending message: ${err.message}
            for message: ${msg.toShortPacket()}`)
            // the show, err, messages, must go on!
            if (this.isOpen) {
                clearTimeout(this.writeTimer);
                this.writeTimer = null;
                msg.tries++;
                this.isRTS = true;
                msg.failed = true;
                // this is a hard fail.  We don't have any more tries left and the message didn't
                // make it onto the wire.
                let error = new OutboundMessageError(msg, `Message aborted after ${msg.tries} attempt(s): ${err} `);
                if (typeof msg.onComplete === 'function') msg.onComplete(error, undefined);
                this._waitingPacket = null;
                this.counter.sndAborted++;

            }
        }
    }
    private clearResponses(msgIn: Inbound) {
        if (this._outBuffer.length === 0 && typeof (this._waitingPacket) !== 'object' && this._waitingPacket) return;
        var callback;
        let msgOut = this._waitingPacket;
        if (typeof (this._waitingPacket) !== 'undefined' && this._waitingPacket) {
            var resp = msgOut.response;
            if (msgOut.requiresResponse) {
                if (resp instanceof Response && resp.isResponse(msgIn, msgOut)) {
                    this._waitingPacket = null;
                    if (typeof msgOut.onComplete === 'function') msgOut.onComplete(undefined, msgIn);
                    callback = resp.callback;
                    resp.message = msgIn;
                    this.counter.sndSuccess++;
                    if (resp.ack) this.pushOut(resp.ack);
                }
            }
        }
        // Go through and remove all the packets that need to be removed from the queue.
        // RG - when would there be additional packets besides the first in the outbuffer that needs to be removed from a single incoming packet?
        // RKS: This occurs when two of the same message signature is thrown onto the queue.  Most often when there is a queue full of configuration requests.  The
        // triggers that cause the outbound message may come at the same time that another controller makes a call.
        var i = this._outBuffer.length - 1;
        while (i >= 0) {
            let out = this._outBuffer[i--];
            if (typeof out === 'undefined') continue;
            let resp = out.response;
            // RG - added check for msgOut because the *Touch chlor packet 153 adds an status packet 217
            // but if it is the only packet on the queue the outbound will have been cleared out already.
            if (out.requiresResponse && msgOut !== null) {
                if (resp instanceof Response && resp.isResponse(msgIn, out) && (typeof out.scope === 'undefined' || out.scope === msgOut.scope)) {
                    resp.message = msgIn;
                    if (typeof (resp.callback) === 'function' && resp.callback) callback = resp.callback;
                    this._outBuffer.splice(i, 1);
                }
            }
        }
        // RKS: This callback is important because we are managing queues. The position of this callback
        // occurs after all things related to the message have been processed including removal of subsequent
        // messages from the queue.  This is because another panel on the bus may throw additional messages
        // that we also need.  This occurs when more than one panel on the bus requests a reconfig at the same time.
        if (typeof (callback) === 'function') { setTimeout(callback, 100, msgOut); }
    }
    public get stats() {
        let status = this.isOpen ? 'open' : this._cfg.enabled ? 'closed' : 'disabled';
        return extend(true, { portId: this.portId, status: status, reconnects: this.reconnects }, this.counter)
    }
    public emitPortStats() {
        webApp.emitToChannel('rs485PortStats', 'rs485Stats', this.stats);
    }
    private processCompletedMessage(msg: Inbound, ndx): number {
        msg.timestamp = new Date();
        msg.portId = this.portId;
        msg.id = Message.nextMessageId;
        //console.log(`msg id ${msg.id} assigned to port${msg.portId} action:${msg.action} ${msg.toShortPacket()}`)
        this.counter.recCollisions += msg.collisions;
        this.counter.recRewinds += msg.rewinds;
        this.emitPortStats();
        if (msg.isValid) {
            this.counter.recSuccess++;
            this.counter.updatefailureRate();
            msg.process();
            //conn.queueInboundToAnslq25(msg);
            this.clearResponses(msg);
        }
        else {
            this.counter.recFailed++;
            this.counter.updatefailureRate();
            console.log('RS485 Stats:' + this.counter.toLog());
            ndx = this.rewindFailedMessage(msg, ndx);
        }
        logger.packet(msg); // RSG - Moving this after msg clearing responses so emit will include responseFor data
        return ndx;
    }
    private rewindFailedMessage(msg: Inbound, ndx: number): number {
        this.counter.recRewinds++;
        // Lets see if we can do a rewind to capture another message from the 
        // crap on the bus.  This will get us to the innermost message.  While the outer message may have failed the inner message should
        // be able to buck up and make it happen.
        this._inBytes = this._inBytes.slice(ndx);  // Start by removing all of the bytes related to the original message.
        // Add all of the elements of the message back in reverse.
        this._inBytes.unshift(...msg.term);
        this._inBytes.unshift(...msg.payload);
        this._inBytes.unshift(...msg.header.slice(1)); // Trim off the first byte from the header.  This means it won't find 16,2 or start with a 165. The
        // algorithm looks for the header bytes to determine the protocol so the rewind shouldn't include the 16 in 16,2 otherwise it will just keep rewinding.
        this._msg = msg = new Inbound();
        ndx = msg.readPacket(this._inBytes);
        if (msg.isComplete) { ndx = this.processCompletedMessage(msg, ndx); }
        return ndx;
    }
    protected processInboundPackets() {
        this.counter.bytesReceived += this._inBuffer.length;
        this._inBytes.push.apply(this._inBytes, this._inBuffer.splice(0, this._inBuffer.length));
        if (this._inBytes.length >= 1) { // Wait until we have something to process.
            let ndx: number = 0;
            let msg: Inbound = this._msg;
            do {
                if (typeof (msg) === 'undefined' || msg === null || msg.isComplete || !msg.isValid) {
                    this._msg = msg = new Inbound();
                    ndx = msg.readPacket(this._inBytes);
                }
                else ndx = msg.mergeBytes(this._inBytes);
                if (msg.isComplete) ndx = this.processCompletedMessage(msg, ndx);
                if (ndx > 0) {
                    this._inBytes = this._inBytes.slice(ndx);
                    ndx = 0;
                }
                else break;

            } while (ndx < this._inBytes.length);
        }
    }
    public hasAssignedEquipment() {
        let pumps = sys.pumps.get();
        for (let i = 0; i < pumps.length; i++) {
            if (pumps[i].portId === this.portId) {
                return true;
            }
        }
        let chlors = sys.chlorinators.get();
        for (let i = 0; i < chlors.length; i++) {
            if (chlors[i].portId === this.portId) {
                return true;
            }
        }
        return false;
    }
}
export var conn: Connection = new Connection();
