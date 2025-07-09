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
import * as path from 'path';
import * as fs from 'fs';
import * as winston from 'winston';
import * as os from 'os';
import { utils } from "../controller/Constants";
import { Message } from '../controller/comms/messages/Messages';
import { config } from '../config/Config';
import { webApp } from '../web/Server';
import { sl } from '../controller/comms/ScreenLogic';

const extend = require("extend");

class Logger {
    constructor() {
        if (!fs.existsSync(path.join(process.cwd(), '/logs'))) fs.mkdirSync(path.join(process.cwd(), '/logs'));
        this.pktPath = path.join(process.cwd(), '/logs', this.getPacketPath());
        this.captureForReplayBaseDir = path.join(process.cwd(), '/logs/', this.getLogTimestamp());
        /*         this.captureForReplayPath = path.join(this.captureForReplayBaseDir, '/packetCapture.json'); */
        this.pkts = [];
        this.slMessages = [];
    }
    private cfg;
    private pkts: Message[];
    private slMessages: any[];
    private pktPath: string;
    private consoleToFilePath: string;
    private transports: { console: winston.transports.ConsoleTransportInstance, file?: winston.transports.FileTransportInstance, consoleFile?: winston.transports.FileTransportInstance } = {
        console: new winston.transports.Console({ level: 'silly' })
    };
    private captureForReplayBaseDir: string;
    private captureForReplayPath: string;
    private pktTimer: NodeJS.Timeout;
    private currentTimestamp: string;
    private getPacketPath(): string {
        // changed this to remove spaces from the name
        return 'packetLog(' + this.getLogTimestamp() + ').log';
    }
    private getConsoleToFilePath(): string {
        return 'consoleLog(' + this.getLogTimestamp() + ').log';
    }
    public getLogTimestamp(bNew: boolean = false): string {
        if (!bNew && typeof this.currentTimestamp !== 'undefined') { return this.currentTimestamp; }
        var ts = new Date();
        function pad(n) { return (n < 10 ? '0' : '') + n; }
        this.currentTimestamp = ts.getFullYear() + '-' + pad(ts.getMonth() + 1) + '-' + pad(ts.getDate()) + '_' + pad(ts.getHours()) + '-' + pad(ts.getMinutes()) + '-' + pad(ts.getSeconds());
        return this.currentTimestamp;
    } 

    private myFormat = winston.format.printf(({ level, message, label }) => {
        return `[${new Date().toLocaleString()}] ${level}: ${message}`;
    });

    private _logger: winston.Logger;
    public init() {
        this.cfg = config.getSection('log');
        logger._logger = winston.createLogger({
            format: winston.format.combine(winston.format.timestamp({format: 'MMMM DD YYYY'}), winston.format.colorize(), winston.format.splat(), this.myFormat),
            transports: [this.transports.console]
        });
        this.transports.console.level = this.cfg.app.level;
        if (this.cfg.app.captureForReplay) this.startCaptureForReplay(false);
        if (this.cfg.app.logToFile) {
            this.transports.consoleFile = new winston.transports.File({
                filename: path.join(process.cwd(), '/logs', this.getConsoleToFilePath()),
                level: 'silly',
                format: winston.format.combine(winston.format.splat(), winston.format.uncolorize(), this.myFormat)
            });
            this.transports.consoleFile.level = this.cfg.app.level;
            this._logger.add(this.transports.consoleFile);
        }
    }
    public async stopAsync() {
        try {
            this.info(`Stopping logger Process.`);
            if (this.cfg.app.captureForReplay) {
                return await this.stopCaptureForReplayAsync();
            }
            // Free up the file handles.  This is yet another goofiness with winston.  Not sure why they
            // need to exclusively lock the file handles when the process always appends.  Just stupid.
            if (typeof this.transports.consoleFile !== 'undefined') {
                this._logger.remove(this.transports.consoleFile);
                this.transports.consoleFile.close();
                this.transports.consoleFile = undefined;
            }
            console.log(`Logger Process Stopped`);
        } catch (err) { console.log(`Error shutting down logger: ${err.message}`); }
    }
    public get options(): any { return this.cfg; }
    public info(...args: any[]) { logger._logger.info.apply(logger._logger, arguments); }
    public debug(...args: any[]) { logger._logger.debug.apply(logger._logger, arguments); }
    public warn(...args: any[]) { logger._logger.warn.apply(logger._logger, arguments); }
    public verbose(...args: any[]) { logger._logger.verbose.apply(logger._logger, arguments); }
    public error(...args: any[]): Error { logger._logger.error.apply(logger._logger, arguments); return new Error(arguments[0]); }
    public silly(...args: any[]) { logger._logger.silly.apply(logger._logger, arguments); }
    public reject(sError: string): Promise<Error> {
        logger.error(sError);
        return Promise.reject(new Error(sError));
    }
    private isIncluded(byte: number, arr: number[]): boolean {
        if (typeof (arr) === "undefined" || !arr || arr.length === 0) return true;
        if (arr.indexOf(byte) !== -1) return true;
        return false;
    }
    private isExcluded(byte: number, arr: number[]): boolean {
        if (typeof (arr) === "undefined" || !arr) return false;
        if (arr && arr.length === 0) return false;
        if (arr.indexOf(byte) !== -1) return true;
        return false;
    }
    public packet(msg: Message) {
        if (logger.cfg.packet.enabled || logger.cfg.app.captureForReplay) {
            // Filter out the messages we do not want.
            var bLog: boolean = true;
            // A random packet may actually find its way into the throws should the bytes get messed up
            // in a fashion where the header byte is 255, 0, 255 but we have not identified the channel.
            // Thus far we have seen 165 and 166.
            var cfgPacket = logger.cfg.packet[msg.protocol] || logger.cfg.packet['unidentified'];
            if (!logger.cfg.app.captureForReplay) {
                // Log invalid messages no matter what if the user has selected invalid message logging.
                if (bLog && !msg.isValid) {
                    if (!logger.cfg.packet.invalid) bLog = false;
                }
                else {
                    if (bLog && !cfgPacket.enabled) bLog = false;
                    if (bLog && !logger.isIncluded(msg.source, cfgPacket.includeSouce)) bLog = false;
                    if (bLog && !logger.isIncluded(msg.dest, cfgPacket.includeDest)) bLog = false;
                    if (bLog && !logger.isIncluded(msg.action, cfgPacket.includeActions)) bLog = false;
                    if (bLog && logger.isExcluded(msg.source, cfgPacket.excludeSource)) bLog = false;
                    if (bLog && logger.isExcluded(msg.dest, cfgPacket.excludeDest)) bLog = false;
                    if (bLog && logger.isExcluded(msg.action, cfgPacket.excludeActions)) bLog = false;
                }
            }
            
            if (bLog) {
                if (logger.cfg.packet.logToFile) {
                    logger.pkts.push(msg);
                    if (logger.pkts.length > 5)
                        logger.flushLogs();
                    else {
                        // Attempt to ease up on the writes if we are logging a bunch of packets.
                        if (logger.pktTimer) clearTimeout(logger.pktTimer);
                        logger.pktTimer = setTimeout(logger.flushLogs, 1000);
                    }
                }
                webApp.emitToChannel('msgLogger', 'logMessage', msg);
            }
        }
        if (logger.cfg.packet.logToConsole) {
            if (msg.isValid && bLog) logger._logger.info(msg.toLog());
            else if (!msg.isValid) logger._logger.warn(msg.toLog());
        }
    }
    public screenlogic(data: any){
        if (logger.cfg.screenlogic.enabled || logger.cfg.app.captureForReplay){
            if (logger.cfg.screenlogic.logToFile) {
                logger.slMessages.push(data);
                if (logger.slMessages.length > 5)
                    logger.flushSLLogs();
                else {
                    // Attempt to ease up on the writes if we are logging a bunch of packets.
                    if (logger.pktTimer) clearTimeout(logger.pktTimer);
                    logger.pktTimer = setTimeout(logger.flushSLLogs, 1000);
                }
            }
            webApp.emitToChannel('msgLogger', 'logMessage', data);

        }
        if (logger.cfg.screenlogic.logToConsole){
            logger._logger.info(sl.toLog(data));
        }
    }
    public logAPI(apiReq:string){
        if (logger.cfg.app.captureForReplay){
            // TODO: buffer this
            fs.appendFile(logger.pktPath, apiReq, function(err) {
                if (err) logger.error('Error writing packet to %s: %s', logger.pktPath, err);
            });
        }

    }
    public clearMessages() {
        if (fs.existsSync(logger.pktPath)) {
            logger.info(`Clearing message log: ${ logger.pktPath }`);
            fs.truncateSync(logger.pktPath, 0);
        }
    }
    public flushLogs() {
        var p: Message[] = logger.pkts.splice(0, logger.pkts.length);
        var buf: string = '';
        if (logger.cfg.packet.enabled) {
            for (let i = 0; i < p.length; i++) {
             
                buf += (p[i].toLog() + os.EOL);
            }
            fs.appendFile(logger.pktPath, buf, function(err) {
                if (err) logger.error('Error writing packet to %s: %s', logger.pktPath, err);
            });
        }
        buf = '';
    }
    public flushSLLogs() {
        var p: any[] = logger.slMessages.splice(0, logger.slMessages.length);
        var buf: string = '';
       
            for (let i = 0; i < p.length; i++) {
                buf += (p[i] + os.EOL);
            }
            fs.appendFile(logger.pktPath, buf, function(err) {
                if (err) logger.error(`Error writing screenlogic message to ${logger.pktPath}: ${err.message}`);
            });
        
        buf = '';
    }
    public setOptions(opts, c?: any) {
        c = typeof c === 'undefined' ? this.cfg : c;
        for (let prop in opts) {
            let o = opts[prop];
            if (o instanceof Array) {
                //console.log({ o: o, c: c, prop: prop });
                c[prop] = o; // Stop here we are replacing the array.
            }
            else if (typeof o === 'object') {
                if (typeof c[prop] === 'undefined') c[prop] = {};
                this.setOptions(o, c[prop]); // Use recursion here.  Harder to follow but much less code.
            }
            else
                c[prop] = opts[prop];
        }
        config.setSection('log', this.cfg);
        if (utils.makeBool(this.cfg.app.logToFile)) {
            if (typeof this.transports.consoleFile === 'undefined') {
                this.transports.consoleFile = new winston.transports.File({
                    filename: path.join(process.cwd(), '/logs', this.getConsoleToFilePath()),
                    level: 'silly',
                    format: winston.format.combine(winston.format.splat(), winston.format.uncolorize(), this.myFormat)
                });
                this._logger.add(this.transports.consoleFile);
            }
        }
        else {
            if (typeof this.transports.consoleFile !== 'undefined') {
                this._logger.remove(this.transports.consoleFile);
                this.transports.consoleFile.close();
                this.transports.consoleFile = undefined;
            }
        }
        for (let [key, transport] of Object.entries(this.transports)) {
            if(typeof transport !== 'undefined') transport.level = this.cfg.app.level;
        }
    }
    public startCaptureForReplay(bResetLogs:boolean) {
        logger.info(`Starting Replay Capture.`);
        // start new replay directory

        if (!fs.existsSync(this.captureForReplayPath)) fs.mkdirSync(this.captureForReplayBaseDir, { recursive: true });
        
        // Create logs subdirectory for additional log files
        let logsSubDir = path.join(this.captureForReplayBaseDir, 'logs');
        if (!fs.existsSync(logsSubDir)) fs.mkdirSync(logsSubDir, { recursive: true });
        if (bResetLogs){
            if (fs.existsSync(path.join(process.cwd(), 'data/poolConfig.json'))) {
                fs.copyFileSync(path.join(process.cwd(), 'data/poolConfig.json'), path.join(process.cwd(),'data/', `poolConfig-${this.getLogTimestamp()}.json`));
                fs.unlinkSync((path.join(process.cwd(), 'data/poolConfig.json')));
            }
            if (fs.existsSync(path.join(process.cwd(), 'data/poolState.json'))) {
                fs.copyFileSync(path.join(process.cwd(), 'data/poolState.json'), path.join(process.cwd(),'data/', `poolState-${this.getLogTimestamp()}.json`));
                fs.unlinkSync((path.join(process.cwd(), 'data/poolState.json')));
            }
            this.clearMessages();
        }
        logger.cfg = extend(true, {}, logger.cfg, {
            "packet": {
                "enabled": true,
                "logToConsole": true,
                "logToFile": true,
                "invalid": true,
                "broadcast": {
                    "enabled": true,
                    "includeActions": [],
                    "includeSource": [],
                    "includeDest": [],
                    "excludeActions": [],
                    "excludeSource": [],
                    "excludeDest": []
                },
                "pump": {
                    "enabled": true,
                    "includeActions": [],
                    "includeSource": [],
                    "includeDest": [],
                    "excludeActions": [],
                    "excludeSource": [],
                    "excludeDest": []
                },
                "chlorinator": {
                    "enabled": true,
                    "includeSource": [],
                    "includeDest": [],
                    "excludeSource": [],
                    "excludeDest": []
                },
                "intellichem": {
                    "enabled": true,
                    "includeActions": [],
                    "exclueActions": [],
                    "includeSource": [],
                    "includeDest": [],
                    "excludeSource": [],
                    "excludeDest": []
                },
                "intellivalve": {
                    "enabled": true,
                    "includeActions": [],
                    "exclueActions": [],
                    "includeSource": [],
                    "includeDest": [],
                    "excludeSource": [],
                    "excludeDest": []
                },
                "unidentified": {
                    "enabled": true,
                    "includeSource": [],
                    "includeDest": [],
                    "excludeSource": [],
                    "excludeDest": []
                },
                "unknown": {
                    "enabled": true,
                    "includeSource": [],
                    "includeDest": [],
                    "excludeSource": [],
                    "excludeDest": []
                }
            },
            "app": {
                "enabled": true,
                "level": "silly",
                "captureForReplay": true
            }
        });
        this.consoleToFilePath = path.join(this.captureForReplayBaseDir, this.getConsoleToFilePath());
        this.transports.file = new winston.transports.File({
            filename: this.consoleToFilePath,
            level: 'silly',
            format: winston.format.combine(winston.format.splat(), winston.format.uncolorize(), this.myFormat)
        });
        logger._logger.add(this.transports.file);
        this.transports.console.level = 'silly';
    }
    public async stopCaptureForReplayAsync(remLogs?: any[]):Promise<string> {
        return new Promise<string>(async (resolve, reject) => {
            try {
                // Get REM server configurations from config
                let configData = config.getSection();
                let remServers = [];
                if (configData.web && configData.web.interfaces) {
                    for (let interfaceName in configData.web.interfaces) {
                        let interfaceConfig = configData.web.interfaces[interfaceName];
                        if (interfaceConfig.type === 'rem' && interfaceConfig.enabled) {
                            remServers.push({
                                name: interfaceConfig.name || interfaceName,
                                uuid: interfaceConfig.uuid,
                                host: interfaceConfig.options?.host || '',
                                backup: true
                            });
                        }
                    }
                }

                // Use the existing backup logic to create the base backup
                let backupOptions = {
                    njsPC: true,
                    servers: remServers,
                    name: `Packet Capture ${this.currentTimestamp}`,
                    automatic: false
                };
                
                let backupFile = await webApp.backupServer(backupOptions);
                
                // Add packet capture logs to the existing backup zip
                let jszip = require("jszip");
                let zip = await jszip.loadAsync(fs.readFileSync(backupFile.filePath));
                
                // Add packet capture logs to the njsPC/logs directory
                zip.file(`njsPC/logs/${this.getPacketPath()}`, fs.readFileSync(logger.pktPath));
                zip.file(`njsPC/logs/${this.getConsoleToFilePath()}`, fs.readFileSync(this.consoleToFilePath));
                
                // Add REM server logs if provided
                if (remLogs && remLogs.length > 0) {
                    logger.info(`Adding ${remLogs.length} REM logs to backup`);
                    for (let remLog of remLogs) {
                        // Create logs directory for the REM server using the hardcoded name
                        let logPath = `Relay Equipment Manager/logs/${remLog.logFileName}`;
                        logger.info(`Adding REM log to backup: ${logPath} (size: ${remLog.logData.length} characters)`);
                        zip.file(logPath, remLog.logData);
                    }
                } else {
                    logger.info(`No REM logs provided to add to backup`);
                }
                
                // Generate the updated zip
                await zip.generateAsync({type:'nodebuffer'}).then(content => {
                    fs.writeFileSync(backupFile.filePath, content);
                });
                
                // Restore original logging configuration
                this.cfg = config.getSection('log');
                logger._logger.remove(this.transports.file);
                this.transports.console.level = this.cfg.app.level;
                
                resolve(backupFile.filePath);
            }
            catch (err) {
                reject(err.message);
            }
        });
    }
}
export var logger = new Logger();
