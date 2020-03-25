import * as path from 'path';
import * as fs from 'fs';
import * as winston from 'winston';
import * as os from 'os';
import { Message } from '../controller/comms/messages/Messages.js';
import { config } from '../config/Config';
import {fips} from 'crypto';
class Logger {
    constructor() {
        if (!fs.existsSync(path.join(process.cwd(), '/logs'))) fs.mkdirSync(path.join(process.cwd(), '/logs'));
        this.pktPath = path.join(process.cwd(), '/logs', this.getPacketPath());
        this.replayBaseDir = path.join(process.cwd(), '/replay', this.getLogTimestamp());
        this.replayPath = path.join(this.replayBaseDir, '/packetCapture.json');
        this.cfg = config.getSection('log');
        this.pkts = [];
    }
    private cfg;
    private pkts: Message[];
    private pktPath: string;
    private replayBaseDir: string;
    private replayPath: string;
    private pktTimer: NodeJS.Timeout;
    private getPacketPath() : string {
        // changed this to remove spaces from the name
        return 'packetLog(' + this.getLogTimestamp() + ').log';
    }
    private getLogTimestamp(): string {
        var ts = new Date();
        function pad(n) { return (n < 10 ? '0' : '') + n; }
        return ts.getFullYear() + '-' + pad(ts.getMonth() + 1) + '-' + pad(ts.getDate()) + '_' + pad(ts.getHours()) + '-' + pad(ts.getMinutes()) + '-' + pad(ts.getSeconds());
    }

    private _logger: winston.Logger;
    public init() {
        if (logger.cfg.packet.replay && !fs.existsSync(this.replayPath)) {
            // todo : RG would prefer to version the replay files.  
            // todo: check if we are capturing logs/config.json with replay files
            //fs.unlinkSync(this.replayPath);
            fs.mkdirSync(this.replayBaseDir, {recursive: true});

        }
        logger._logger = winston.createLogger({
            level: logger.cfg.app.level,
            format: winston.format.combine(winston.format.colorize(), winston.format.splat(), winston.format.simple()),
            transports: [new winston.transports.Console()]
        });
    }
    public info(...args: any[]) { logger._logger.info.apply(logger._logger, arguments); }
    public debug(...args: any[]) { logger._logger.debug.apply(logger._logger, arguments); }
    public warn(...args: any[]) { logger._logger.warn.apply(logger._logger, arguments); }
    public verbose(...args: any[]) { logger._logger.verbose.apply(logger._logger, arguments); }
    public error(...args: any[]) { logger._logger.error.apply(logger._logger, arguments); }
    public silly(...args: any[]) { logger._logger.silly.apply(logger._logger, arguments); }
    private isIncluded(byte: number, arr: number[]): boolean {
        if (typeof(arr) === "undefined" || !arr || arr.length === 0) return true;
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
        if (logger.cfg.packet.enabled || logger.cfg.packet.replay) {
            // Filter out the messages we do not want.
            var bLog: boolean = true;
            var cfgPacket = logger.cfg.packet[msg.protocol];
            if (bLog && !cfgPacket.enabled) bLog = false;
            if (bLog && !logger.isIncluded(msg.source, cfgPacket.includeSouce)) bLog = false;
            if (bLog && !logger.isIncluded(msg.dest, cfgPacket.includeDest)) bLog = false;
            if (bLog && !logger.isIncluded(msg.action, cfgPacket.includeActions)) bLog = false;
            if (bLog && logger.isExcluded(msg.source, cfgPacket.excludeSource)) bLog = false;
            if (bLog && logger.isExcluded(msg.dest, cfgPacket.excludeDest)) bLog = false;
            if (bLog && logger.isExcluded(msg.action, cfgPacket.excludeActions)) bLog = false;
            if (bLog) {
                logger.pkts.push(msg);
                if (logger.pkts.length > 5)
                    logger.flushLogs();
                else {
                    // Attempt to ease up on the writes if we are logging a bunch of packets.
                    if (logger.pktTimer) clearTimeout(logger.pktTimer);
                    logger.pktTimer = setTimeout(logger.flushLogs, 1000);
                }

            }
        }
        if (logger.cfg.packet.logToConsole) {
            if (msg.isValid && bLog) logger._logger.info(msg.toLog());
            else if (!msg.isValid) logger._logger.warn(msg.toLog());
        }
    }
    public flushLogs() {
        var p: Message[] = logger.pkts.splice(0, logger.pkts.length);
        var buf: string = '';
        if (logger.cfg.packet.enabled) {
            for (let i = 0; i < p.length; i++) {
                buf += (p[i].toLog() + os.EOL);
            }
            fs.appendFile(logger.pktPath, buf, function (err) {
                if (err) logger.error('Error writing packet to %s: %s', logger.pktPath, err);
            });
        }
        buf = '';
        if (logger.cfg.packet.replay) {
            for (let i = 0; i < p.length; i++) {
                buf += (p[i].toReplay() + os.EOL);
            }
            fs.appendFile(logger.replayPath, buf, function (err) {
                if (err) logger.error('Error writing replay to %s: %s', logger.replayPath, err);
            });
        }
    }
    public setOptions(opts, c?: any) {
        c = typeof c === 'undefined' ? this.cfg : c;
        for (let prop in opts) {
            let o = opts[prop];
            if (o instanceof Array) {
                //console.log({ o: o, c: c, prop: prop });
                c[prop] = o; // Stop here we are replacing the array.
            }
            else if (typeof o == 'object') {
                if (typeof c[prop] === 'undefined') c[prop] = {};
                this.setOptions(o, c[prop]); // Use recursion here.  Harder to follow but much less code.
            }
            else
                c[prop] = opts[prop];
        }
        config.setSection('log', this.cfg);
        logger._logger.level = this.cfg.app.level;
    }
}
export var logger = new Logger();
