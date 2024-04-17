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
import * as dns from "dns";
import { EventEmitter } from 'events';
import * as fs from "fs";
import * as http from "http";
import * as http2 from "http2";
import * as https from "https";
import * as multicastdns from 'multicast-dns';
import * as ssdp from 'node-ssdp';
import * as os from 'os';
import * as path from "path";
import { RemoteSocket, Server as SocketIoServer, Socket } from "socket.io";
import { io as sockClient } from "socket.io-client";
import { URL } from "url";
import { config } from "../config/Config";
import { conn } from "../controller/comms/Comms";
import { Inbound, Outbound } from "../controller/comms/messages/Messages";
import { Timestamp, utils } from "../controller/Constants";
import { sys } from '../controller/Equipment';
import { state } from "../controller/State";
import { logger } from "../logger/Logger";
import { HttpInterfaceBindings } from './interfaces/httpInterface';
import { InfluxInterfaceBindings } from './interfaces/influxInterface';
import { MqttInterfaceBindings } from './interfaces/mqttInterface';
import { RuleInterfaceBindings } from "./interfaces/ruleInterface";
import { ConfigRoute } from "./services/config/Config";
import { ConfigSocket } from "./services/config/ConfigSocket";
import { StateRoute } from "./services/state/State";
import { StateSocket } from "./services/state/StateSocket";
import { UtilitiesRoute } from "./services/utilities/Utilities";
import express = require('express');
import extend = require("extend");
import { setTimeout as setTimeoutSync } from 'timers';
import { setTimeout } from 'timers/promises';

// This class serves data and pages for
// external interfaces as well as an internal dashboard.
export class WebServer {
    public autoBackup = false;
    public lastBackup;
    private _servers: ProtoServer[] = [];
    private family = 'IPv4';
    private _autoBackupTimer: NodeJS.Timeout;
    private _httpPort: number;
    constructor() { }
    public async init() {
        try {
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
                        if (c.enabled !== false) this._httpPort = c.port;
                        break;
                    case 'http2':
                        srv = new Http2Server(s, s);
                        if (c.enabled !== false) this._httpPort = c.port;
                        break;
                    case 'https':
                        srv = new HttpsServer(s, s);
                        if (c.enabled !== false) this._httpPort = c.port;
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
                    await srv.init(c);
                    srv = undefined;
                }
            }
            this.initInterfaces(cfg.interfaces);

        } catch (err) { logger.error(`Error initializing web server ${err.message}`) }
    }
    public async initInterfaces(interfaces: any) {
        try {
            for (let s in interfaces) {
                let int;
                let c = interfaces[s];
                if (typeof c.uuid === 'undefined') {
                    c.uuid = utils.uuid();
                    config.setSection(`web.interfaces.${s}`, c);
                }
                if (!c.enabled) continue;
                let type = c.type || 'http';
                logger.info(`Init ${type} interface: ${c.name}`);
                switch (type) {
                    case 'rest':
                    case 'http':
                        int = new HttpInterfaceServer(c.name, type);
                        int.init(c);
                        this._servers.push(int);
                        break;
                    case 'rule':
                        int = new RuleInterfaceServer(c.name, type);
                        int.init(c);
                        this._servers.push(int);
                        break;
                    case 'influx':
                    case 'influxdb2':
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
        } catch (err) { logger.error(`Error initializing Interface servers ${err.message}`); }
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
    public async stopAsync() {
        try {
            // We want to stop all the servers in reverse order so let's pop them out.
            for (let s in this._servers) {
                try {
                    let serv = this._servers[s];
                    if (typeof serv.stopAsync === 'function') {
                        await serv.stopAsync();
                    }
                    this._servers[s] = undefined;
                } catch (err) { console.log(`Error stopping server ${s}: ${err.message}`); }
            }
        } catch (err) { `Error stopping servers` }
    }
    private getInterface() {
        const networkInterfaces = os.networkInterfaces();
        // RKS: We need to get the scope-local nic. This has nothing to do with IP4/6 and is not necessarily named en0 or specific to a particular nic.  We are
        // looking for the first IPv4 interface that has a mac address which will be the scope-local address.  However, in the future we can simply use the IPv6 interface
        // if that is returned on the local scope but I don't know if the node ssdp server supports it on all platforms.
        let fallback; // Use this for WSL adapters.
        for (let name in networkInterfaces) {
            let nic = networkInterfaces[name];
            for (let ndx in nic) {
                let addr = nic[ndx];
                // All scope-local addresses will have a mac.  In a multi-nic scenario we are simply grabbing
                // the first one we come across.
                if (!addr.internal && addr.mac.indexOf('00:00:00:') < 0 && addr.family === this.family) {
                    if (!addr.mac.startsWith('00:'))
                        return addr;
                    else if (typeof fallback === 'undefined') fallback = addr;
                }
            }
        }
        return fallback;
    }
    public getNetworkInterfaces() {
        const networkInterfaces = os.networkInterfaces();
        // RKS: We need to get the scope-local nics. This has nothing to do with IP4/6 and is not necessarily named en0 or specific to a particular nic.  We are
        // looking for the first IPv4 interface that has a mac address which will be the scope-local address.  However, in the future we can simply use the IPv6 interface
        // if that is returned on the local scope but I don't know if the node ssdp server supports it on all platforms.
        let ips = [];
        let nics = { physical: [], virtual: [] }
        for (let name in networkInterfaces) {
            let nic = networkInterfaces[name];
            for (let ndx in nic) {
                let addr = nic[ndx];
                // All scope-local addresses will have a mac.  In a multi-nic scenario we are simply grabbing
                // the first one we come across.
                if (!addr.internal && addr.mac.indexOf('00:00:00:') < 0 && addr.family === this.family) {
                    if (typeof ips.find((x) => x === addr.address) === 'undefined') {
                        ips.push(addr.address);
                        if (!addr.mac.startsWith('00:'))
                            nics.physical.push(extend(true, { name: name }, addr));
                        else
                            nics.virtual.push(extend(true, { name: name }, addr));
                    }
                }
            }
        }
        return nics;
    }
    public ip() { return typeof this.getInterface() === 'undefined' ? '0.0.0.0' : this.getInterface().address; }
    public mac() { return typeof this.getInterface() === 'undefined' ? '00:00:00:00' : this.getInterface().mac; }
    public httpPort(): number { return this._httpPort }
    public findServer(name: string): ProtoServer { return this._servers.find(elem => elem.name === name); }
    public findServersByType(type: string) { return this._servers.filter(elem => elem.type === type); }
    public findServerByGuid(uuid: string) { return this._servers.find(elem => elem.uuid === uuid); }
    public removeServerByGuid(uuid: string) {
        for (let i = 0; i < this._servers.length; i++) {
            if (this._servers[i].uuid === uuid) this._servers.splice(i, 1);
        }
    }
    public async updateServerInterface(obj: any): Promise<any> {
        let int = config.setInterface(obj);
        let srv = this.findServerByGuid(obj.uuid);
        // if server is not enabled; stop & remove it from local storage
        if (typeof srv !== 'undefined') {
            await srv.stopAsync();
            this.removeServerByGuid(obj.uuid);
        }
        // if it's enabled, restart it or initialize it
        if (obj.enabled) {
            if (typeof srv === 'undefined') {
                this.initInterfaces(int);
            }
            else srv.init(obj);
        }
        return config.getInterfaceByUuid(obj.uuid);
    }
    public async initAutoBackup() {
        try {
            let bu = config.getSection('controller.backups');
            this.autoBackup = false;
            // These will be returned in reverse order with the newest backup first.
            let files = await this.readBackupFiles();
            let afiles = files.filter(elem => elem.options.automatic === true);
            this.lastBackup = (afiles.length > 0) ? Date.parse(afiles[0].options.backupDate).valueOf() || 0 : 0;
            // Set the last backup date.
            this.autoBackup = utils.makeBool(bu.automatic);
            if (this.autoBackup) {
                let nextBackup = this.lastBackup + (bu.interval.days * 86400000) + (bu.interval.hours * 3600000);
                logger.info(`Auto-backup initialized Last Backup: ${Timestamp.toISOLocal(new Date(this.lastBackup))} Next Backup: ${Timestamp.toISOLocal(new Date(nextBackup))}`);
            }
            else
                logger.info(`Auto-backup initialized Last Backup: ${Timestamp.toISOLocal(new Date(this.lastBackup))}`);
            // Lets wait a good 20 seconds before we auto-backup anything.  Now that we are initialized let the OCP have its way with everything.
            setTimeoutSync(()=>{this.checkAutoBackup();}, 20000);
        }
        catch (err) { logger.error(`Error initializing auto-backup: ${err.message}`); }
    }
    public async stopAutoBackup() {
        this.autoBackup = false;
        if (typeof this._autoBackupTimer !== 'undefined' || this._autoBackupTimer) clearTimeout(this._autoBackupTimer);
    }
    public async readBackupFiles(): Promise<BackupFile[]> {
        try {
            let backupDir = path.join(process.cwd(), 'backups');
            let files = fs.readdirSync(backupDir);
            let backups = [];
            if (typeof files !== 'undefined') {
                for (let i = 0; i < files.length; i++) {
                    let file = files[i];
                    if (path.extname(file) === '.zip') {
                        let bf = await BackupFile.fromFile(path.join(backupDir, file));
                        if (typeof bf !== 'undefined') backups.push(bf);
                    }
                }
            }
            backups.sort((a, b) => { return Date.parse(b.options.backupDate) - Date.parse(a.options.backupDate) });
            return backups;
        }
        catch (err) { logger.error(`Error reading backup file directory: ${err.message}`); }
    }
    protected async extractBackupOptions(file: string | Buffer): Promise<{ file: string, options: any }> {
        try {
            let opts = { file: Buffer.isBuffer(file) ? 'Buffer' : file, options: {} as any };
            let jszip = require("jszip");
            let buff = Buffer.isBuffer(file) ? file : fs.readFileSync(file);
            await jszip.loadAsync(buff).then(async (zip) => {
                await zip.file('options.json').async('string').then((data) => {
                    opts.options = JSON.parse(data);
                    if (typeof opts.options.backupDate === 'undefined' && typeof file === 'string') {
                        let name = path.parse(file).name;
                        if (name.length === 19) {
                            let date = name.substring(0, 10).replace(/-/g, '/');
                            let time = name.substring(11).replace(/-/g, ':');
                            let dt = Date.parse(`${date} ${time}`);
                            if (!isNaN(dt)) opts.options.backupDate = Timestamp.toISOLocal(new Date(dt));
                        }
                    }
                });
            });
            return opts;
        } catch (err) { logger.error(`Error extracting backup options from ${file}: ${err.message}`); }
    }
    public async pruneAutoBackups(keepCount: number) {
        try {
            // We only automatically prune backups that njsPC put there in the first place so only
            // look at auto-backup files.
            let files = await this.readBackupFiles();
            let afiles = files.filter(elem => elem.options.automatic === true);
            if (afiles.length > keepCount) {
                // Prune off the oldest backups until we get to our keep count.  When we read in the files
                // these were sorted newest first.
                while (afiles.length > keepCount) {
                    let afile = afiles.pop();
                    logger.info(`Pruning auto-backup file: ${afile.filePath}`);
                    try {
                        fs.unlinkSync(afile.filePath);
                    } catch (err) { logger.error(`Error deleting auto-backup file: ${afile.filePath}`); }
                }
            }
        } catch (err) { logger.error(`Error pruning auto-backups: ${err.message}`); }
    }
    public async backupServer(opts: any): Promise<BackupFile> {
        let ret = new BackupFile();
        ret.options = extend(true, {}, opts, { version: 1.1, errors: [] });
        //{ file: '', options: extend(true, {}, opts, { version: 1.0, errors: [] }) };
        let jszip = require("jszip");
        function pad(n) { return (n < 10 ? '0' : '') + n; }
        let zip = new jszip();
        let ts = new Date();
        let baseDir = process.cwd();
        ret.filename = ts.getFullYear() + '-' + pad(ts.getMonth() + 1) + '-' + pad(ts.getDate()) + '_' + pad(ts.getHours()) + '-' + pad(ts.getMinutes()) + '-' + pad(ts.getSeconds()) + '.zip';
        ret.filePath = path.join(baseDir, 'backups', ret.filename);
        if (opts.njsPC === true) {
            zip.folder('njsPC');
            zip.folder('njsPC/data');
            // Create the backup file and copy it into it.
            zip.file('njsPC/config.json', fs.readFileSync(path.join(baseDir, 'config.json')));
            zip.file('njsPC/data/poolConfig.json', fs.readFileSync(path.join(baseDir, 'data', 'poolConfig.json')));
            zip.file('njsPC/data/poolState.json', fs.readFileSync(path.join(baseDir, 'data', 'poolState.json')));
        }
        if (typeof ret.options.servers !== 'undefined' && ret.options.servers.length > 0) {
            // Back up all our servers.
            for (let i = 0; i < ret.options.servers.length; i++) {
                let srv = ret.options.servers[i];
                if (typeof srv.errors === 'undefined') srv.errors = [];
                if (srv.backup === false) continue;
                let server = this.findServerByGuid(srv.uuid) as REMInterfaceServer;
                if (typeof server === 'undefined') {
                    srv.errors.push(`Could not find server ${srv.name} : ${srv.uuid}`);
                    srv.success = false;
                }
                else if (!server.isConnected) {
                    srv.success = false;
                    srv.errors.push(`Server ${srv.name} : ${srv.uuid} not connected cannot back up`);
                }
                else {
                    // Try to get the data from the server.
                    zip.folder(server.name);
                    zip.file(`${server.name}/serverConfig.json`, JSON.stringify(server.cfg));
                    zip.folder(`${server.name}/data`);
                    try {
                        let resp = await server.getControllerConfig();
                        if (typeof resp !== 'undefined') {
                            if (resp.status.code === 200 && typeof resp.data !== 'undefined') {
                                let ccfg = JSON.parse(resp.data);
                                zip.file(`${server.name}/data/controllerConfig.json`, JSON.stringify(ccfg));
                                srv.success = true;
                            }
                            else {
                                srv.errors.push(`Error getting controller configuration: ${resp.error.message}`);
                                srv.success = false;
                            }
                        }
                        else {
                            srv.success = false;
                            srv.errors.push(`No response from server`);
                        }
                    } catch (err) { srv.success = false; srv.errors.push(`Could not obtain server configuration`); }
                }
            }
        }
        ret.options.backupDate = Timestamp.toISOLocal(ts);
        zip.file('options.json', JSON.stringify(ret.options));
        await zip.generateAsync({ type: 'nodebuffer' }).then(content => {
            fs.writeFileSync(ret.filePath, content);
            this.lastBackup = ts.valueOf();
        });
        return ret;
    }
    public async checkAutoBackup() {
        if (typeof this._autoBackupTimer !== 'undefined' || this._autoBackupTimer) clearTimeout(this._autoBackupTimer);
        this._autoBackupTimer = undefined;
        let bu = config.getSection('controller.backups');
        if (bu.automatic === true) {
            if (typeof this.lastBackup === 'undefined' ||
                (this.lastBackup < new Date().valueOf() - (bu.interval.days * 86400000) - (bu.interval.hours * 3600000))) {
                bu.name = 'Automatic Backup';
                await this.backupServer(bu);
            }
        }
        else this.autoBackup = false;
        if (this.autoBackup) {
            await this.pruneAutoBackups(bu.keepCount);
            let nextBackup = this.lastBackup + (bu.interval.days * 86400000) + (bu.interval.hours * 3600000);
            setTimeoutSync(async () => {
                try {
                    await this.checkAutoBackup();
                } catch (err) { logger.error(`Error checking auto-backup: ${err.message}`); }
            }, Math.max(Math.min(nextBackup - new Date().valueOf(), 2147483647), 60000));
            logger.info(`Last auto-backup ${Timestamp.toISOLocal(new Date(this.lastBackup))} Next auto - backup ${Timestamp.toISOLocal(new Date(nextBackup))}`);
        }
    }
    public async validateRestore(opts): Promise<any> {
        try {
            let stats = { njsPC: {}, servers: [] };
            // Step 1: Extract all the files from the zip file.
            let rest = await RestoreFile.fromFile(opts.filePath);
            // Step 2: Validate the njsPC data against the board. The return
            // from here shoudld give a very detailed view of what it is about to do.
            if (opts.options.njsPC === true) {
                stats.njsPC = await sys.board.system.validateRestore(rest.njsPC);
            }
            // Step 3: For each REM server we need to validate the restore
            // file.
            if (typeof opts.options.servers !== 'undefined' && opts.options.servers.length > 0) {
                for (let i = 0; i < opts.options.servers.length; i++) {
                    let s = opts.options.servers[i];
                    if (s.restore) {
                        let ctx: any = { server: { uuid: s.uuid, name: s.name, errors: [], warnings: [] } };
                        // Check to see if the server is on-line. 
                        // First, try by UUID.  
                        let srv = this.findServerByGuid(s.uuid) as REMInterfaceServer;
                        let cfg = rest.servers.find(elem => elem.uuid === s.uuid);
                        // Second, try by host
                        if (typeof srv === 'undefined' && parseFloat(opts.options.version) >= 1.1) {
                            let srvs = this.findServersByType('rem') as REMInterfaceServer[];
                            cfg = rest.servers.find(elem => elem.serverConfig.options.host === s.host);
                            for (let j = 0; j < srvs.length; j++){
                                if (srvs[j].cfg.options.host === cfg.serverConfig.options.host){
                                    srv = srvs[j];
                                    ctx.server.warnings.push(`REM Server from backup file (${srv.uuid}/${srv.cfg.options.host}) matched to current REM Server (${cfg.uuid}/${cfg.serverConfig.options.host}) by host name or IP and not UUID.  UUID in current config.json for REM will be updated.`)
                                    break;
                                }
                            }
                        } 
                        stats.servers.push(ctx);
                        if (typeof cfg === 'undefined' || typeof cfg.controllerConfig === 'undefined') ctx.server.errors.push(`Server configuration not found in zip file`);
                        else if (typeof srv === 'undefined') ctx.server.errors.push(`Server ${s.name} is not enabled in njsPC cannot restore.`);
                        else if (!srv.isConnected) ctx.server.errors.push(`Server ${s.name} is not connected or cannot be found by UUID and cannot restore.  If this is a version 1.0 file, update your current REM UUID to match the backup REM UUID.`);
                        else {
                            let resp = await srv.validateRestore(cfg.controllerConfig);
                            if (typeof resp !== 'undefined') {
                                if (resp.status.code === 200 && typeof resp.data !== 'undefined') {
                                    let cctx = JSON.parse(resp.data);
                                    ctx = extend(true, ctx, cctx);
                                }
                                else
                                    ctx.server.errors.push(`Error validating controller configuration: ${resp.error.message}`);
                            }
                            else 
                                ctx.server.errors.push(`No response from server`);
                        }
                    }

                }
            }
           
            return stats;
        } catch (err) { logger.error(`Error validating restore options: ${err.message}`); return Promise.reject(err);}
    }
    public async restoreServers(opts): Promise<any> {
        let stats: { backupOptions?: any, njsPC?: RestoreResults, servers: any[] } = { servers: [] };
        try {
            // Step 1: Extract all the files from the zip file.
            let rest = await RestoreFile.fromFile(opts.filePath);
            stats.backupOptions = rest.options;
            // Step 2: Validate the njsPC data against the board. The return
            // from here shoudld give a very detailed view of what it is about to do.
            if (opts.options.njsPC === true) {
                logger.info(`Begin Restore njsPC`);
                stats.njsPC = await sys.board.system.restore(rest.njsPC);
                logger.info(`End Restore njsPC`);
            }
            // Step 3: For each REM server we need to validate the restore
            // file.
            if (typeof opts.options.servers !== 'undefined' && opts.options.servers.length > 0) {
                for (let i = 0; i < opts.options.servers.length; i++) {
                    let s = opts.options.servers[i];
                    if (s.restore) {
                        // Check to see if the server is on-line.
                        let srv = this.findServerByGuid(s.uuid) as REMInterfaceServer;
                        let cfg = rest.servers.find(elem => elem.uuid === s.uuid);
                        let ctx: any = { server: { uuid: s.uuid, name: s.name, errors: [], warnings: [] } };
                        if (typeof srv === 'undefined' && parseFloat(opts.options.version) >= 1.1) {
                            let srvs = this.findServersByType('rem') as REMInterfaceServer[];
                            cfg = rest.servers.find(elem => elem.serverConfig.options.host === s.host);
                            for (let j = 0; j < srvs.length; j++){
                                if (srvs[j].cfg.options.host === cfg.serverConfig.options.host){
                                    srv = srvs[j];
                                    let oldSrvCfg = srv.cfg;
                                    oldSrvCfg.enabled = false;
                                    await this.updateServerInterface(oldSrvCfg); // unload prev server interface
                                    srv.uuid = srv.cfg.uuid = cfg.uuid;
                                    config.setSection('web.interfaces.rem', cfg.serverConfig);
                                    await this.updateServerInterface(cfg.serverConfig); // reset server interface
                                    srv = this.findServerByGuid(s.uuid) as REMInterfaceServer;
                                    logger.info(`Restore REM: Current UUID updated to UUID of backup.`);
                                    break;
                                }
                            }
                        }
                        stats.servers.push(ctx);
                        if (!srv.isConnected) await setTimeout(6000); // rem server waits to connect 5s before isConnected will be true. Server.ts#1256 = REMInterfaceServer.init();  What's a better way to do this?
                        if (typeof cfg === 'undefined' || typeof cfg.controllerConfig === 'undefined') ctx.server.errors.push(`Server configuration not found in zip file`);
                        else if (typeof srv === 'undefined') ctx.server.errors.push(`Server ${s.name} is not enabled in njsPC cannot restore.`);
                        else if (!srv.isConnected) ctx.server.errors.push(`Server ${s.name} is not connected cannot restore.`);
                        else {
                            let resp = await srv.validateRestore(cfg.controllerConfig);
                            if (typeof resp !== 'undefined') {
                                if (resp.status.code === 200 && typeof resp.data !== 'undefined') {
                                    let cctx = JSON.parse(resp.data);
                                    ctx = extend(true, ctx, cctx);
                                    // Ok so now here we are ready to restore the data.
                                    let r = await srv.restoreConfig(cfg.controllerConfig);

                                }
                                else
                                    ctx.server.errors.push(`Error validating controller configuration: ${resp.error.message}`);
                            }
                            else
                                ctx.server.errors.push(`No response from server`);
                        }
                    }

                }
            }

            return stats;
        } catch (err) { logger.error(`Error validating restore options: ${err.message}`); return Promise.reject(err); }
        finally {
            try {
                let baseDir = process.cwd();
                let ts = new Date();
                function pad(n) { return (n < 10 ? '0' : '') + n; }
                let filename = 'restoreLog(' + ts.getFullYear() + '-' + pad(ts.getMonth() + 1) + '-' + pad(ts.getDate()) + '_' + pad(ts.getHours()) + '-' + pad(ts.getMinutes()) + '-' + pad(ts.getSeconds()) + ').log';
                let filePath = path.join(baseDir, 'logs', filename);
                fs.writeFileSync(filePath, JSON.stringify(stats, undefined, 3));
            } catch (err) { logger.error(`Error writing restore log ${err.message}`); }
        }
    }
}
class ProtoServer {
    constructor(name: string, type: string) { this.name = name; this.type = type; }
    public name: string;
    public type: string;
    public uuid: string;
    public remoteConnectionId: string;
    // base class for all servers.
    public isRunning: boolean = false;
    public get isConnected() { return this.isRunning; }
    public emitToClients(evt: string, ...data: any) { }
    public emitToChannel(channel: string, evt: string, ...data: any) { }
    public async init(obj: any) { };
    public async stopAsync() { }
    protected _dev: boolean = process.env.NODE_ENV !== 'production';
    // todo: how do we know if the client is using IPv4/IPv6?
}
export class Http2Server extends ProtoServer {
    public server: http2.Http2Server;
    public app: Express.Application;
    public async init(cfg) {
        this.uuid = cfg.uuid;
        if (cfg.enabled) {
            this.app = express();
            // TODO: create a key and cert at some time but for now don't fart with it.
        }
    }
}
interface ClientToServerEvents {
    noArg: () => void;
    basicEmit: (a: number, b: string, c: number[]) => void;
}

interface ServerToClientEvents {
    withAck: (d: string, cb: (e: number) => void) => void;
    [event: string]: (...args: any[]) => void;
}
export class HttpServer extends ProtoServer {
    // Http protocol
    private static dateTestISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*))(?:Z|(\+|-)([\d|:]*))?$/;
    private static dateTextAjax = /^\/Date\((d|-|.*)\)[\/|\\]$/;

    public app: express.Application;
    public server: http.Server;
    public sockServer: SocketIoServer<ClientToServerEvents, ServerToClientEvents>;
    private _sockets: RemoteSocket<ServerToClientEvents, any>[] = [];
    public emitToClients(evt: string, ...data: any) {
        if (this.isRunning) {
            this.sockServer.emit(evt, ...data);
        }
    }
    public emitToChannel(channel: string, evt: string, ...data: any) {
        //console.log(`Emitting to channel ${channel} - ${evt}`)
        if (this.isRunning) {
            this.sockServer.to(channel).emit(evt, ...data);
        }
    }
    public get isConnected() { return typeof this.sockServer !== 'undefined' && this._sockets.length > 0; }
    protected initSockets() {
        let options = {
            allowEIO3: true,
            cors: {
                origin: true,
                methods: ["GET", "POST"],
                credentials: true
            }
        }
        this.sockServer = new SocketIoServer(this.server, options);
        this.sockServer.on("connection", (sock: Socket) => {
            logger.info(`New socket client connected ${sock.id} -- ${sock.client.conn.remoteAddress}`);
            this.socketHandler(sock);
            sock.emit('controller', state.controllerState);
            sock.conn.emit('controller', state.controllerState); // do we need both of these?
            //this.sockServer.origins('*:*');
            sock.on('connect_error', (err) => {
                logger.error('Socket server error %s', err.message);
            });
            sock.on('reconnect_failed', (err) => {
                logger.error('Failed to reconnect with socket %s', err.message);
            });
        });
        this.app.use('/socket.io-client', express.static(path.join(process.cwd(), '/node_modules/socket.io-client/dist/'), { maxAge: '60d' }));
    }

    private socketHandler(sock: Socket) {
        let self = this;
        // this._sockets.push(sock);
        setTimeoutSync(async () => {
            // refresh socket list with every new socket
            self._sockets = await self.sockServer.fetchSockets();
        }, 100)

        sock.on('error', (err) => {
            logger.error('Error with socket: %s', err);
        });
        sock.on('close', async (id) => {
            logger.info('Socket diconnecting %s', id);
            self._sockets = await self.sockServer.fetchSockets();
        });
        sock.on('echo', (msg) => { sock.emit('echo', msg); });
        sock.on('sendOutboundMessage', (mdata) => {
            let msg: Outbound = Outbound.create({});
            Object.assign(msg, mdata);
            msg.calcChecksum();
            logger.silly(`sendOutboundMessage ${msg.toLog()}`);
            conn.queueSendMessage(msg);
        });
        sock.on('sendInboundMessage', (mdata) => {
            try {

                let msg: Inbound = new Inbound();
                msg.direction = mdata.direction;
                msg.header = mdata.header;
                msg.payload = mdata.payload;
                msg.preamble = mdata.preamble;
                msg.protocol = mdata.protocol;
                msg.term = mdata.term;
                if (msg.isValid) msg.process();
            }
            catch (err){
                logger.error(`Error replaying packet: ${err.message}`);
            }
        });
        sock.on('rawbytes', (data:any)=>{
            let port = conn.findPortById(0);
            port.pushIn(Buffer.from(data));
        })
        sock.on('sendLogMessages', function (sendMessages: boolean) {
            console.log(`sendLogMessages set to ${sendMessages}`);
            if (!sendMessages) sock.leave('msgLogger');
            else sock.join('msgLogger');
        });
        sock.on('sendRS485PortStats', function (sendPortStats: boolean) {
            console.log(`sendRS485PortStats set to ${sendPortStats}`);
            if (!sendPortStats) sock.leave('rs485PortStats');
            else sock.join('rs485PortStats');
        });
        sock.on('sendScreenlogicStats', function (sendScreenlogicStats: boolean) {
            console.log(`sendScreenlogicStats set to ${sendScreenlogicStats}`);
            if (!sendScreenlogicStats) sock.leave('screenlogicStats');
            else sock.join('screenlogicStats');
        });
        StateSocket.initSockets(sock);
        ConfigSocket.initSockets(sock);
    }
    public async init(cfg) {
        try {
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
                this.app.use(express.json(
                    {
                        reviver: (key, value) => {
                            if (typeof value === 'string') {
                                let d = HttpServer.dateTestISO.exec(value);
                                // By parsing the date and then creating a new date from that we will get
                                // the date in the proper timezone.
                                if (d) return new Date(Date.parse(value));
                                d = HttpServer.dateTextAjax.exec(value);
                                if (d) {
                                    // Not sure we will be seeing ajax dates but this is
                                    // something that we may see from external sources.
                                    let a = d[1].split(/[-+,.]/);
                                    return new Date(a[0] ? +a[0] : 0 - +a[1]);
                                }
                            }
                            return value;
                        }
                    })
                );
                this.app.use((req, res, next) => {
                    res.header('Access-Control-Allow-Origin', '*');
                    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, api_key, Authorization'); // api_key and Authorization needed for Swagger editor live API document calls
                    res.header('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, PUT, DELETE');
                    if ('OPTIONS' === req.method) { res.sendStatus(200); }
                    else {
                        if (req.url !== '/upnp.xml') {
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
                    logger.info('Server is now listening on %s:%s - %s:%s', cfg.ip, cfg.port, webApp.ip(), webApp.httpPort());
                });
                this.isRunning = true;
            }
        } catch (err) { logger.error(`Error initializing server ${err.message}`); }
    }
    public addListenerOnce(event: any, f: (data: any) => void) {
        // for (let i = 0; i < this._sockets.length; i++) {
        //     this._sockets[i].once(event, f);
        // }
        this.sockServer.once(event, f);
    }
}
export class HttpsServer extends HttpServer {
    declare server: https.Server;

    public async init(cfg) {
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
                    if (!req.url.startsWith('/upnp.xml')) {
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
    public server: ssdp.Server; //node-ssdp;
    public deviceUUID: string;
    public upnpPath: string;
    public modelName: string;
    public modelNumber: string;
    public serialNumber: string;
    public deviceType = 'urn:schemas-tagyoureit-org:device:PoolController:1';
    public async init(cfg) {
        this.uuid = cfg.uuid;
        if (cfg.enabled) {
            let self = this;
            logger.info('Starting up SSDP server');
            let ver = JSON.parse(fs.readFileSync(path.posix.join(process.cwd(), '/package.json'), 'utf8')).version || '0.0.0';
            this.deviceUUID = 'uuid:806f52f4-1f35-4e33-9299-' + webApp.mac().replace(/:/g, '');
            this.serialNumber = webApp.mac();
            this.modelName = `njsPC v${ver}`;
            this.modelNumber = `njsPC${ver.replace(/\./g, '-')}`;
            // todo: should probably check if http/https is enabled at this point
            //let port = config.getSection('web').servers.http.port || 7777;
            this.upnpPath = 'http://' + webApp.ip() + ':' + webApp.httpPort() + '/upnp.xml';
            let nics = webApp.getNetworkInterfaces();
            let SSDP = ssdp.Server;
            if (nics.physical.length + nics.virtual.length > 1) {
                // If there are multiple nics (docker...etc) then
                // this will bind on all of them.
                this.server = new SSDP({
                    //customLogger: (...args) => console.log.apply(null, args),
                    logLevel: 'INFO',
                    udn: this.deviceUUID,
                    location: {
                        protocol: 'http://',
                        port: webApp.httpPort(),
                        path: '/upnp.xml'
                    },
                    explicitSocketBind: true,
                    sourcePort: 1900
                });
            }
            else {
                this.server = new SSDP({
                    //customLogger: (...args) => console.log.apply(null, args),
                    logLevel: 'INFO',
                    udn: this.deviceUUID,
                    location: this.upnpPath,
                    sourcePort: 1900
                });


            }
            this.server.addUSN('upnp:rootdevice'); // This line will make the server show up in windows.
            this.server.addUSN(this.deviceType);
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
    public deviceXML(): string {
        let ver = sys.appVersion.split('.');
        let friendlyName = 'njsPC: unknown model';
        if (typeof sys !== 'undefined' && typeof sys.equipment !== 'undefined' && typeof sys.equipment.model !== 'undefined') friendlyName = `${sys.equipment.model}`
        let XML = `<?xml version="1.0"?>
        <root xmlns="urn:schemas-upnp-org:device-1-0">
            <specVersion>
                <major>1</major>
                <minor>0</minor>
            </specVersion>
            <device>
                <deviceType>${this.deviceType}</deviceType>
                <friendlyName>${friendlyName}</friendlyName>
                <manufacturer>tagyoureit</manufacturer>
                <manufacturerURL>https://github.com/tagyoureit/nodejs-poolController</manufacturerURL>
                <presentationURL>http://${webApp.ip()}:${webApp.httpPort()}/state/all</presentationURL>
                <appVersion>
                   <major>${ver[0] || 1}</major>
                   <minor>${ver[1] || 0}</minor>
                   <patch>${ver[2] || 0}</patch>
                </appVersion>
                <modelName>${this.modelName}</modelName>
                <modelNumber>${this.modelNumber}</modelNumber>
                <modelDescription>An application to control pool equipment.</modelDescription>
                <serialNumber>${this.serialNumber}</serialNumber>
                <UDN>${this.deviceUUID}::${this.deviceType}</UDN>
                <serviceList></serviceList>
                <deviceList></deviceList>
            </device>
        </root>`;
        //console.log(XML.match(/<device>[\s|\S]+<appVersion>[\s|\S]+<major>(\d+)<\/major>/)[1]);
        //console.log(XML.match(/<device>[\s|\S]+<appVersion>[\s|\S]+<minor>(\d+)<\/minor>/)[1]);
        //console.log(XML.match(/<device>[\s|\S]+<appVersion>[\s|\S]+<patch>(\d+)<\/patch>/)[1]);
        return XML;
    }
    public async stopAsync() {
        try {
            if (typeof this.server !== 'undefined') {
                this.server.stop();
                logger.info(`Stopped SSDP server: ${this.name}`);
            }
        } catch (err) { logger.error(`Error stopping SSDP server ${err.message}`); }
    }
}
export class MdnsServer extends ProtoServer {
    // Multi-cast DNS server
    public server;
    public mdnsEmitter = new EventEmitter();
    private queries = [];
    public async init(cfg) {
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
                            answers: [
                                {
                                    name: '_poolcontroller._tcp.local',
                                    type: 'A',
                                    ttl: 300,
                                    data: webApp.ip()
                                },
                                {
                                    name: '_poolcontroller._tcp.local',
                                    type: 'SRV',
                                    data: {
                                        port: webApp.httpPort().toString(),
                                        target: '_poolcontroller._tcp.local',
                                        weight: 0,
                                        priority: 10
                                    }
                                },
                                {
                                    name: 'model',
                                    type: 'TXT',
                                    data: 'njsPC'
                                },
                            ]
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
    public async stopAsync() {
        try {
            if (typeof this.server !== 'undefined')
                await new Promise<void>((resolve, reject) => {
                    this.server.destroy((err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            logger.info(`Shut down MDNS Server ${this.name}`);
        } catch (err) { logger.error(`Error shutting down MDNS Server ${this.name}: ${err.message}`); }
    }
}
export class HttpInterfaceServer extends ProtoServer {
    public bindingsPath: string;
    public bindings: HttpInterfaceBindings;
    private _fileTime: Date = new Date(0);
    private _isLoading: boolean = false;
    public async init(cfg) {
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
    public async stopAsync() {
        try {
            logger.info(`${this.name} Interface Server Shut down`);
        }
        catch (err) { }
    }
}
export class RuleInterfaceServer extends ProtoServer {
    public bindingsPath: string;
    public bindings: RuleInterfaceBindings;
    private _fileTime: Date = new Date(0);
    private _isLoading: boolean = false;
    public async init(cfg) {
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
                this.bindings = Object.assign<RuleInterfaceBindings, any>(new RuleInterfaceBindings(cfg), ext);
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
    public async stopAsync() {
        try {
            logger.info(`${this.name} Interface Server Shut down`);
        }
        catch (err) { }
    }
}

export class InfluxInterfaceServer extends ProtoServer {
    public bindingsPath: string;
    public bindings: InfluxInterfaceBindings;
    private _fileTime: Date = new Date(0);
    private _isLoading: boolean = false;
    public async init(cfg) {
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
    public bindings: MqttInterfaceBindings;
    private _fileTime: Date = new Date(0);
    private _isLoading: boolean = false;
    public get isConnected() { return this.isRunning && this.bindings.events.length > 0; }
    public async init(cfg) {
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
                if (this.bindings && this.bindings.client) {
                    // RKS: 05-29-22 - This was actually orphaning the subscriptions and event processors.  Instead of simply doing
                    // an assign we ned to assign the underlying data and clear the old info out.  The reload method takes care of the
                    // bindings for us.
                    (async () => {
                        await this.bindings.reload(ext);
                    })();
                }
                else {
                    this.bindings = Object.assign<MqttInterfaceBindings, any>(new MqttInterfaceBindings(cfg), ext);
                    (async () => {
                        await this.bindings.initAsync();
                    })();
                }
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
    public async stopAsync() {
        try {
            fs.unwatchFile(this.bindingsPath);
            if (this.bindings) await this.bindings.stopAsync();
        } catch (err) { logger.error(`Error shutting down MQTT Server ${this.name}: ${err.message}`); }
    }
}
export class InterfaceServerResponse {
    constructor(statusCode?: number, statusMessage?: string) {
        if (typeof statusCode !== 'undefined') this.status.code = statusCode;
        if (typeof statusMessage !== 'undefined') this.status.message = statusMessage;
    }
    status: { code: number, message: string } = { code: -1, message: '' };
    error: Error;
    data: string;
    obj: any;
    public static createError(err: Error, data?: string, obj?: any) {
        let resp = new InterfaceServerResponse(500, err.message);
        resp.error = err;
        return resp;
    }
}
export class REMInterfaceServer extends ProtoServer {
    public async init(cfg) {
        let self = this;
        this.cfg = cfg;
        this.uuid = cfg.uuid;
        if (cfg.enabled) {
            this.initSockets();
            setTimeoutSync(async () => {
                try {
                    await self.initConnection();
                }
                catch (err) {
                    logger.error(`Error establishing bi-directional Nixie/REM connection: ${err}`)
                }
            }, 5000);
        }
    }
    public async getControllerConfig() : Promise<InterfaceServerResponse> {
        try {
            let response = await this.sendClientRequest('GET', '/config/backup/controller', undefined, 10000);
            return response;
        } catch (err) { logger.error(`Error requesting GET /config/backup/controller: ${err.message}`); }
    }
    public async validateRestore(cfg): Promise<InterfaceServerResponse> {
        try {
            let response = await this.sendClientRequest('PUT', '/config/restore/validate', cfg, 10000);
            return response;
        } catch (err) { logger.error(`Error requesting PUT /config/restore/validate ${err.message}`); }
    }
    public async restoreConfig(cfg): Promise<InterfaceServerResponse> {
        try {
            return await this.sendClientRequest('PUT', '/config/restore/file', cfg, 20000);
        } catch (err) { logger.error(`Error requesting PUT /config/restore/file ${err.message}`); }
    }
    private async initConnection() {
        try {
            // find HTTP server
            return new Promise<void>(async (resolve, reject) => {
                let self = this;
                // First, send the connection info for njsPC and see if a connection exists.
                let url = '/config/checkconnection/';
                // can & should extend for https/username-password/ssl
                let data: any = { type: "njspc", isActive: true, id: null, name: "njsPC - automatic", protocol: "http:", ipAddress: webApp.ip(), port: config.getSection('web').servers.http.port || 4200, userName: "", password: "", sslKeyFile: "", sslCertFile: "", hostnames: [] }
                if (typeof this.cfg.options !== 'undefined' && this.cfg.options.host !== 'undefined' &&
                    this.cfg.options.host.toLowerCase() === 'localhost' || this.cfg.options.host === '127.0.0.1') data.loopback = true;
                logger.info(`Checking REM Connection ${data.name} ${data.ipAddress}:${data.port}`);
                try {
                    data.hostnames = await dns.promises.reverse(data.ipAddress);
                } catch (err) { logger.error(`Error getting hostnames for njsPC REM connection`); }
                let result = await this.putApiService(url, data, 5000);
                // If the result code is > 200 we have an issue. (-1 is for timeout)
                if (result.status.code > 200 || result.status.code < 0) return reject(new Error(`initConnection: ${result.error.message}`));
                else {
                    this.remoteConnectionId = result.obj.id;
                };

                // The passed connection has been setup/verified; now test for emit
                // if this fails, it could be because the remote connection is disabled.  We will not 
                // automatically re-enable it
                url = '/config/checkemit'
                data = { eventName: "checkemit", property: "result", value: 'success', connectionId: result.obj.id }
                // wait for REM server to finish resetting
                setTimeoutSync(async () => {
                    try {
                        let _tmr = setTimeoutSync(() => { return reject(new Error(`initConnection: No socket response received.  Check REM→njsPC communications.`)) }, 5000);
                        let srv: HttpServer = webApp.findServer('http') as HttpServer;
                        srv.addListenerOnce('/checkemit', (data: any) => {
                            // if we receive the emit, data will work both ways.
                            // console.log(data);
                            clearTimeout(_tmr);
                            logger.info(`${this.name} bi-directional communications established.`)
                            resolve();
                        });
                        result = await self.putApiService(url, data);
                        // If the result code is > 200 or -1 we have an issue.
                        if (result.status.code > 200 || result.status.code === -1) return reject(new Error(`initConnection: ${result.error.message}`));
                        else {
                            clearTimeout(_tmr);
                            resolve();
                        }
                    }
                    catch (err) { reject(new Error(`initConnection setTimeout: ${result.error.message}`)); }
                }, 3000);
            });
        }
        catch (err) {
            logger.error(`Error with REM Interface Server initConnection: ${err}`)
        }
    }
    public async stopAsync() {
        try {
            if (typeof this.agent !== 'undefined') this.agent.destroy();
            if (typeof this.sockClient !== 'undefined') this.sockClient.destroy();
            logger.info(`Stopped REM Interface Server ${this.name}`);
        } catch (err) { logger.error(`Error closing REM Server ${this.name}: ${err.message}`); }
    }
    public cfg;
    public sockClient;
    protected agent: http.Agent = new http.Agent({ keepAlive: true });
    public get isConnected() { return this.sockClient !== 'undefined' && this.sockClient.connected; };
    private _sockets: RemoteSocket<ServerToClientEvents, any>[] = [];
    private async sendClientRequest(method: string, url: string, data?: any, timeout: number = 10000): Promise<InterfaceServerResponse> {
        try {

            let ret = new InterfaceServerResponse();
            let opts = extend(true, { headers: {} }, this.cfg.options);
            if ((typeof opts.hostname === 'undefined' || !opts.hostname) && (typeof opts.host === 'undefined' || !opts.host || opts.host === '*')) {
                ret.error = new Error(`Interface: ${this.cfg.name} has not resolved to a valid host.`)
                logger.warn(ret.error);
                return ret;
            }
            let sbody = typeof data === 'undefined' ? '' : typeof data === 'string' ? data : typeof data === 'object' ? JSON.stringify(data) : data.toString();
            if (typeof sbody !== 'undefined') {
                if (sbody.charAt(0) === '"' && sbody.charAt(sbody.length - 1) === '"') sbody = sbody.substr(1, sbody.length - 2);
                opts.headers["CONTENT-LENGTH"] = Buffer.byteLength(sbody || '');
            }
            opts.path = url;
            opts.method = method || 'GET';
            ret.data = '';
            opts.agent = this.agent;
            logger.verbose(`REM server request initiated. ${opts.method} ${opts.path} ${sbody}`);
            await new Promise<void>((resolve, reject) => {
                let req: http.ClientRequest;
                if (opts.port === 443 || (opts.protocol || '').startsWith('https')) {
                    opts.protocol = 'https:';
                    req = https.request(opts, (response: http.IncomingMessage) => {
                        ret.status.code = response.statusCode;
                        ret.status.message = response.statusMessage;
                        response.on('error', (err) => { ret.error = err; resolve(); });
                        response.on('data', (data) => { ret.data += data; });
                        response.on('end', () => { resolve(); });
                    });
                }
                else {
                    opts.protocol = undefined;
                    req = http.request(opts, (response: http.IncomingMessage) => {
                        ret.status.code = response.statusCode;
                        ret.status.message = response.statusMessage;
                        response.on('error', (err) => {
                            logger.error(`An error occurred with request: ${err}`);
                            ret.error = err; resolve();
                        });
                        response.on('data', (data) => { ret.data += data; });
                        response.on('end', () => { resolve(); });
                    });
                }
                req.setTimeout(timeout, () => { reject(new Error(`Request timeout after ${timeout}ms: ${method} ${url}`)); });
                req.on('error', (err, req, res) => {
                    logger.error(`Error sending Request: ${opts.method} ${url} ${err.message}`);
                    ret.error = err;
                    reject(new Error(`Error sending Request: ${opts.method} ${url} ${err.message}`));
                });
                req.on('abort', () => { logger.warn('Request Aborted'); reject(new Error('Request Aborted.')); });
                req.end(sbody);
            }).catch((err) => { logger.error(`Error Sending REM Request: ${opts.method} ${url} ${err.message}`); ret.error = err; });
            logger.verbose(`REM server request returned. ${opts.method} ${opts.path} ${sbody}`);
            if (ret.status.code > 200) {
                // We have an http error so let's parse it up.
                try {
                    ret.error = JSON.parse(ret.data);
                } catch (err) { ret.error = new Error(`Unidentified ${ret.status.code} Error: ${ret.status.message}`) }
                ret.data = '';
            }
            else if (ret.status.code === 200 && this.isJSONString(ret.data)) {
                try { ret.obj = JSON.parse(ret.data); }
                catch (err) { }
            }
            logger.debug(`REM server request returned. ${opts.method} ${opts.path} ${sbody} ${JSON.stringify(ret)}`);
            return ret;
        }
        catch (err) {
            logger.error(`Error sending HTTP ${method} command to ${url}: ${err.message}`);
            return Promise.reject(`Http ${method} Error ${url}:${err.message}`);
        }
    }
    private initSockets() {
        try {
            let self = this;
            let url = `${this.cfg.options.protocol || 'http://'}${this.cfg.options.host}${typeof this.cfg.options.port !== 'undefined' ? ':' + this.cfg.options.port : ''}`;
            logger.info(`Opening ${this.cfg.name} socket on ${url}`);
            //console.log(this.cfg);
            this.sockClient = sockClient(url, extend(true,
                { reconnectionDelay: 2000, reconnection: true, reconnectionDelayMax: 20000, transports: ['websocket'], upgrade: true, }, this.cfg.socket));
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
        catch (err) { logger.error(`Error Initializing Sockets: ${err.message}`); }
    }
    private isJSONString(s: string): boolean {
        if (typeof s !== 'string') return false;
        if (s.startsWith('{') || s.startsWith('[')) return true;
        return false;
    }
    public async getApiService(url: string, data?: any, timeout: number = 3600): Promise<InterfaceServerResponse> {
        // Calls a rest service on the REM to set the state of a connected device.
        try { let ret = await this.sendClientRequest('GET', url, data, timeout); return ret; }
        catch (err) { return Promise.reject(err); }
    }
    public async putApiService(url: string, data?: any, timeout: number = 3600): Promise<InterfaceServerResponse> {
        // Calls a rest service on the REM to set the state of a connected device.
        try { let ret = await this.sendClientRequest('PUT', url, data, timeout); return ret; }
        catch (err) { return Promise.reject(err); }
    }
    public async searchApiService(url: string, data?: any, timeout: number = 3600): Promise<InterfaceServerResponse> {
        // Calls a rest service on the REM to set the state of a connected device.
        try { let ret = await this.sendClientRequest('SEARCH', url, data, timeout); return ret; }
        catch (err) { return Promise.reject(err); }
    }
    public async deleteApiService(url: string, data?: any, timeout: number = 3600): Promise<InterfaceServerResponse> {
        // Calls a rest service on the REM to set the state of a connected device.
        try { let ret = await this.sendClientRequest('DELETE', url, data, timeout); return ret; }
        catch (err) { return Promise.reject(err); }
    }
    public async getDevices() {
        try {
            let response = await this.sendClientRequest('GET', '/devices/all', undefined, 3000);
            if (response.status.code !== 200) {
                // Let's try again.  Sometimes the resolver for calls like this are stupid.
                response = await this.sendClientRequest('GET', '/devices/all', undefined, 10000);
            }
            return (response.status.code === 200) ? JSON.parse(response.data) : [];
        }
        catch (err) { logger.error(`getDevices: ${err.message}`); }
    }
}
export class BackupFile {
    public static async fromBuffer(filename: string, buff: Buffer) {
        try {
            let bf = new BackupFile();
            bf.filename = filename;
            bf.filePath = path.join(process.cwd(), 'backups', bf.filename);
            await bf.extractBackupOptions(buff);
            return typeof bf.options !== 'undefined' ? bf : undefined;
        } catch (err) { logger.error(`Error creating buffered backup file: ${filename}`); }
    }
    public static async fromFile(filePath: string) {
        try {
            let bf = new BackupFile();
            bf.filePath = filePath;
            bf.filename = path.parse(filePath).base;
            await bf.extractBackupOptions(filePath);
            return typeof bf.options !== 'undefined' ? bf : undefined;
        } catch (err) { logger.error(`Error creating backup file from file ${filePath}`); }
    }
    public options: any;
    public filename: string;
    public filePath: string;
    public errors = [];
    protected async extractBackupOptions(file: string | Buffer) {
        try {
            let jszip = require("jszip");
            let buff = Buffer.isBuffer(file) ? file : fs.readFileSync(file);
            let zip = await jszip.loadAsync(buff);
            await zip.file('options.json').async('string').then((data) => {
                this.options = JSON.parse(data);
                if (typeof this.options.backupDate === 'undefined' && typeof file === 'string') {
                    let name = path.parse(file).name;
                    name = name.indexOf('(') !== -1 ? name.substring(0, name.indexOf('(')) : name;
                    if (name.length === 19) {
                        let date = name.substring(0, 10).replace(/-/g, '/');
                        let time = name.substring(11).replace(/-/g, ':');
                        let dt = Date.parse(`${date} ${time}`);
                        if (!isNaN(dt)) this.options.backupDate = Timestamp.toISOLocal(new Date(dt));
                    }
                }
            });
        } catch (err) { this.errors.push(err); logger.error(`Error extracting backup options from ${file}: ${err.message}`); }
    }
}
export class RestoreFile {
    public static async fromFile(filePath: string) {
        try {
            let rf = new RestoreFile();
            rf.filePath = filePath;
            rf.filename = path.parse(filePath).base;
            await rf.extractRestoreOptions(filePath);
            return rf;
        } catch (err) { logger.error(`Error created restore file options`); }
    }
    public filename: string;
    public filePath: string;
    public njsPC: { config:any, poolConfig: any, poolState: any };
    public servers: { name: string, uuid: string, serverConfig: any, controllerConfig: any }[] = [];
    public options: any;
    public errors = [];
    protected async extractFile(zip, path): Promise<any> {
        try {
            let obj;
            await zip.file(path).async('string').then((data) => { obj = JSON.parse(data); });
            return obj;
        } catch (err) { logger.error(`Error extracting restore data from ${this.filename}[${path}]: ${err.message}`); }
    }
    protected async extractRestoreOptions(file: string | Buffer) {
        try {
            let jszip = require("jszip");
            let buff = Buffer.isBuffer(file) ? file : fs.readFileSync(file);
            let zip = await jszip.loadAsync(buff);
            this.options = await this.extractFile(zip, 'options.json');
            // Now we need to extract all the servers from the file.
            if (this.options.njsPC) {
                this.njsPC = { config: {}, poolConfig: {}, poolState: {} };
                this.njsPC.config = await this.extractFile(zip, 'njsPC/config.json');
                this.njsPC.poolConfig = await this.extractFile(zip, 'njsPC/data/poolConfig.json');
                this.njsPC.poolState = await this.extractFile(zip, 'njsPC/data/poolState.json');
            }
            if (typeof this.options.servers !== 'undefined') {
                for (let i = 0; i < this.options.servers.length; i++) {
                    // Extract each server from the file.
                    let srv = this.options.servers[i];
                    if (srv.backup && srv.success) {
                        this.servers.push({
                            name: srv.name,
                            uuid: srv.uuid,
                            serverConfig: await this.extractFile(zip, `${srv.name}/serverConfig.json`),
                            controllerConfig: await this.extractFile(zip, `${srv.name}/data/controllerConfig.json`)
                        });
                    }
                }
            }
        } catch(err) { this.errors.push(err); logger.error(`Error extracting restore options from ${file}: ${err.message}`); }
    }
}
export class RestoreResults {
    public errors = [];
    public warnings = [];
    public success = [];
    public modules: { name: string, errors: any[], warnings: any[], success:any[], restored: number, ignored: number }[] = [];
    protected getModule(name: string): { name: string, errors: any[], warnings: any[], success:any[], restored: number, ignored: number } {
        let mod = this.modules.find(elem => name === elem.name);
        if (typeof mod === 'undefined') {
            mod = { name: name, errors: [], warnings: [], success: [], restored: 0, ignored: 0 };
            this.modules.push(mod);
        }
        return mod;
    }
    public addModuleError(name: string, err: any): { name: string, errors: any[], warnings: any[], success:any[], restored: number, ignored: number } {
        let mod = this.getModule(name);
        mod.errors.push(err);
        mod.ignored++;
        logger.error(`Restore ${name} -> ${err}`);
        return mod;
    }
    public addModuleWarning(name: string, warn: any): { name: string, errors: any[], warnings: any[], success:any[], restored: number, ignored: number }  {
        let mod = this.getModule(name);
        mod.warnings.push(warn);
        mod.restored++;
        logger.warn(`Restore ${name} -> ${warn}`);
        return mod;
    }
    public addModuleSuccess(name: string, success: any): { name: string, errors: any[], warnings: any[], success: any[], restored: number, ignored: number } {
        let mod = this.getModule(name);
        mod.success.push(success);
        mod.restored++;
        logger.info(`Restore ${name} -> ${success}`);
        return mod;
    }
}
export const webApp = new WebServer();
