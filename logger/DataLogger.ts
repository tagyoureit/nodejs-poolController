import { Timestamp, utils } from '../controller/Constants';
import * as extend from 'extend';
import * as fs from 'fs';
import * as path from 'path';
import { setTimeout } from 'timers';
import * as util from 'util';
import { logger } from './Logger';
// One of the primary goals of the DataLogger is to keep the memory usage low when reading and writing large files.  This should allow
// the datalogger to manage the file without putting undue pressure on the file system or the heap.  While some of these methods
// read in the entire file, others are designed to keep only a single logger entry buffer in memory.
export class DataLogger {
    // Creates a new entry from the type constructor.  Javascript lacks any real way to factory up an object from a constructor so we
    // are using a workaround that points to the constructor for the object.  Its lame but effective.
    public static createEntry<T>(type: (new () => T), line?: string): T {
        let entry = new type();
        if (typeof line !== 'undefined') (entry as unknown as DataLoggerEntry).parse(line);
        return entry;
    }
    // This reads the entire file into memory and is very expensive because of the buffer.  The readFromStart/End methods should be used in most cases.
    public static readAll<T>(logFile: string, type: (new () => T)): T[] {
        try {
            let logPath = path.join(process.cwd(), '/logs');
            if (!fs.existsSync(logPath)) fs.mkdirSync(logPath);
            logPath += (`/${logFile}`);
            let lines = [];
            if (fs.existsSync(logPath)) {
                let buff = fs.readFileSync(logPath);
                lines = buff.toString().split('\n');
            }
            let arr: T[] = [];
            for (let i = 0; i < lines.length; i++) {
                try {
                    let entry = DataLogger.createEntry<T>(type, lines[i]);
                    arr.push(entry);
                } catch (err) { logger.error(`Skipping invalid dose history entry: ${err.message}`); }
            }
            return arr;
        } catch (err) { logger.error(`Skipping dose history ${err.message}`); }
    }
    // This method uses a callback to end the file read from the end of the file.  If the callback returns false then the iteration through the
    // file will end and the log entries will be returned.  If the callback returns true then the entry will be added to the
    // array and the iteration will continue.  If the callback returns undefined then the entry is ignored and the iteration continues.
    // 
    // This allows for efficient filtering of dataLogger files from the end of the file that reduces writes by appending data and allowing efficient pruning
    // of the file.
    public static async readFromEndAsync<T>(logFile: string, type: (new () => T), fn?: (lineNumber: number, entry?: T, arr?: T[]) => boolean): Promise<T[]> {
        try {
            let logPath = DataLogger.makeLogFilePath(logFile);
            let newLines = ['\r', '\n'];
            let arr: T[] = [];
            if (fs.existsSync(logPath)) {
                console.log(`Reading logfile ${logPath}`);
                // Alright what we have created here is a method to read the data from the end of 
                // a log file in reverse order (tail) that works for all os implementations.  It is
                // really dumb that this isn't part of the actual file processing.
                try {
                    let file = await new Promise<number>((resolve, reject) => {
                        fs.open(logPath, 'r', (err, fileNo) => {
                            if (err) reject(err);
                            else resolve(fileNo);
                        });
                    });
                    try {
                        let stat = await new Promise<fs.Stats>((resolve, reject) => {
                            fs.stat(logPath, (err, data) => {
                                if (err) reject(err);
                                else resolve(data);
                            });
                        });
                        // The file is empty.
                        if (stat.size !== 0) {
                            let pos = stat.size - 1;
                            let chars = [];
                            while (pos >= 0) {
                                // Read a character from the file
                                let char = await new Promise<string>((resolve, reject) => {
                                    fs.read(file, Buffer.allocUnsafe(1), 0, 1, pos, (err, bytesRead, buff) => {
                                        if (err) reject(err);
                                        else resolve(buff.toString());
                                    });
                                });
                                if (!newLines.includes(char)) chars.unshift(char);
                                // If we hit the beginning of the file or a newline from a previous
                                // record then we shoud save off the line and read the next record.
                                if (newLines.includes(char) || pos === 0) {
                                    if (chars.length > 0) {
                                        try {
                                            let entry = DataLogger.createEntry<T>(type, chars.join(''));
                                            if (typeof fn === 'function') {
                                                let rc = fn(arr.length + 1, entry, arr);
                                                if (rc === true) arr.push(entry);
                                                else if (rc === false) break;
                                            }
                                            else
                                                arr.push(entry);
                                        } catch (err) { logger.error(`Skipping invalid dose history entry: ${err.message}`); }
                                    }
                                    chars = [];
                                }
                                pos--;
                            }
                        }
                    }
                    catch (err) { return Promise.reject(err); }
                    finally { if (typeof file !== 'undefined') await new Promise<boolean>((resolve, reject) => fs.close(file, (err) => { if (err) reject(err); else resolve(true); })); }
                } catch (err) { logger.error(`readFromEndAsync: ${err.message}`); }
            }
            return arr;
        }
        catch (err) { logger.error(`readFromEndAsync: ${logFile} ${err.message}`); }

    }
    // This method uses a callback to end the file read from the end of the file.  If the callback returns false then the iteration through the
    // file will end and the log entries will be returned.  If the callback returns true then the entry will be added to the
    // array and the iteration will continue.  If the callback returns undefined then the entry is ignored and the iteration continues.
    // 
    // This allows for efficient filtering of dataLogger files from the end of the file that reduces writes by appending data and allowing efficient pruning
    // of the file.
    public static readFromEnd<T>(logFile: string, type: (new () => T), fn?: (lineNumber: number, entry?: T, arr?: T[]) => boolean): T[] {
        let arr: T[] = [];
        try {
            let logPath = DataLogger.makeLogFilePath(logFile);
            let newLines = ['\r', '\n'];
            if (fs.existsSync(logPath)) {
                // Alright what we have created here is a method to read the data from the end of 
                // a log file in reverse order (tail) that works for all os implementations.  It is
                // really dumb that this isn't part of the actual file processing.
                let file;
                try {
                    file = fs.openSync(logPath, 'r');
                    if (file) {
                        try {
                            let stat = fs.statSync(logPath);
                            // The file is empty.
                            if (stat.size !== 0) {
                                let pos = stat.size - 1;
                                let chars = [];
                                while (pos >= 0) {
                                    // Read a character from the file
                                    let buff = Buffer.allocUnsafe(1);
                                    let len = fs.readSync(file, buff, 0, 1, pos);
                                    if (len === 0) break;
                                    let char = buff.toString();
                                    if (!newLines.includes(char)) chars.unshift(char);
                                    // If we hit the beginning of the file or a newline from a previous
                                    // record then we shoud save off the line and read the next record.
                                    if (newLines.includes(char) || pos === 0) {
                                        if (chars.length > 0) {
                                            try {
                                                let entry = DataLogger.createEntry<T>(type, chars.join(''));
                                                if (typeof fn === 'function') {
                                                    let rc = fn(arr.length + 1, entry, arr);
                                                    if (rc === true) arr.push(entry);
                                                    else if (rc === false) break;
                                                }
                                                else
                                                    arr.push(entry);
                                            } catch (err) { logger.error(`Skipping invalid dose history entry: ${err.message}`); }
                                        }
                                        chars = [];
                                    }
                                    pos--;
                                }
                            }
                        }
                        catch (err) { logger.error(`Error reading from ${logPath}: ${err.message}`); }
                    }
                }
                finally { if (typeof file !== 'undefined') fs.closeSync(file); }
            }
        }
        catch (err) { logger.error(`Error reading file ${logFile}: ${err.message}`); }
        return arr;
    }
    // This method uses a callback to end the file read from the start of the file.  If the callback returns false then the iteration through the
    // file will end and the log entries will be returned.  If the callback returns true then the entry will be added to the
    // array and the iteration will continue.  If the callback returns undefined then the entry is ignored and the iteration continues.
    // 
    // This allows for efficient filtering of dataLogger files from the end of the file that reduces writes by appending data and allowing efficient pruning
    // of the file.
    public static async readFromStartAsync<T>(logFile: string, type: (new () => T), fn?: (lineNumber: number, entry?: T, arr?: T[]) => boolean): Promise<T[]> {
        try {
            let logPath = DataLogger.makeLogFilePath(logFile);
            let newLines = ['\r', '\n'];
            let arr: T[] = [];
            if (fs.existsSync(logPath)) {
                // Alright what we have created here is a method to read the data from the end of 
                // a log file in reverse order (tail) that works for all os implementations.  It is
                // really dumb that this isn't part of the actual file processing.
                try {
                    let file = await new Promise<number>((resolve, reject) => {
                        fs.open(logPath, 'r', (err, fileNo) => {
                            if (err) reject(err);
                            else resolve(fileNo);
                        });
                    });
                    try {
                        let stat = await new Promise<fs.Stats>((resolve, reject) => {
                            fs.stat(logPath, (err, data) => {
                                if (err) reject(err);
                                else resolve(data);
                            });
                        });
                        // The file is empty.
                        if (stat.size !== 0) {
                            let pos = 0;
                            let chars = [];
                            while (pos < stat.size) {
                                // Read a character from the file
                                let char = await new Promise<string>((resolve, reject) => {
                                    fs.read(file, Buffer.allocUnsafe(1), 0, 1, pos, (err, bytesRead, buff) => {
                                        if (err) reject(err);
                                        else resolve(buff.toString());
                                    });
                                });
                                if (!newLines.includes(char)) chars.push(char);
                                // If we hit the beginning of the file or a newline from a previous
                                // record then we shoud save off the line and read the next record.
                                if (newLines.includes(char) || pos === 0) {
                                    if (chars.length > 0) {
                                        let entry = DataLogger.createEntry<T>(type, chars.join(''));
                                        if (typeof fn === 'function') {
                                            let rc = fn(arr.length + 1, entry, arr);
                                            if (rc === true) arr.push(entry);
                                            else if (rc === false) break;
                                        }
                                        else
                                            arr.push(entry);
                                    }
                                    chars = [];
                                }
                                pos++;
                            }
                        }
                    }
                    catch (err) { return Promise.reject(err); }
                    finally { if (typeof file !== 'undefined') await new Promise<boolean>((resolve, reject) => fs.close(file, (err) => { if (err) reject(err); else resolve(true); })); }
                } catch (err) { logger.error(`readFromStart: ${err.message}`); }
            }
            return arr;
        }
        catch (err) { logger.error(`readFromStart ${logFile}: ${err.message}`); }

    }

    // This method uses a callback to end the file read from the start of the file.  If the callback returns false then the iteration through the
    // file will end and the log entries will be returned.  If the callback returns true then the entry will be added to the
    // array and the iteration will continue.  If the callback returns undefined then the entry is ignored and the iteration continues.
    // 
    // This allows for efficient filtering of dataLogger files from the end of the file that reduces writes by appending data and allowing efficient pruning
    // of the file.
    public static readFromStart<T>(logFile: string, type: (new () => T), fn?: (lineNumber: number, entry?: T, arr?: T[]) => boolean): T[] {
        let arr: T[] = [];
        try {
            let logPath = DataLogger.makeLogFilePath(logFile);
            let newLines = ['\r', '\n'];
            if (fs.existsSync(logPath)) {
                // Alright what we have created here is a method to read the data from the end of 
                // a log file in reverse order (tail) that works for all os implementations.  It is
                // really dumb that this isn't part of the actual file processing.
                let file;
                try {
                    file = fs.openSync(logPath, 'r');
                    if (file) {
                        try {
                            let stat = fs.statSync(logPath);
                            // The file is empty.
                            if (stat.size !== 0) {
                                let pos = 0;
                                let chars = [];
                                while (pos <= stat.size) {
                                    // Read a character from the file
                                    let buff = Buffer.allocUnsafe(1);
                                    let len = fs.readSync(file, buff, 0, 1, pos);
                                    if (len === 0) break;
                                    let char = buff.toString();
                                    if (!newLines.includes(char)) chars.push(char);
                                    // If we hit the beginning of the file or a newline from a previous
                                    // record then we shoud save off the line and read the next record.
                                    if (newLines.includes(char) || pos === 0) {
                                        if (chars.length > 0) {
                                            let entry = DataLogger.createEntry<T>(type, chars.join(''));
                                            if (typeof fn === 'function') {
                                                let rc = fn(arr.length + 1, entry, arr);
                                                if (rc === true) arr.push(entry);
                                                else if (rc === false) break;
                                            }
                                            else
                                                arr.push(entry);
                                        }
                                        chars = [];
                                    }
                                    pos++;
                                }
                            }
                        }
                        catch (err) { logger.error(`Error reading from ${logPath}: ${err.message}`); }
                    }
                }
                finally { if (typeof file !== 'undefined') fs.closeSync(file); }
            }
        }
        catch (err) { logger.error(`Error reading file ${logFile}: ${err.message}`); }
        return arr;
    }
    public static async writeStart(logFile: string, data: any) {
        try {
            let logPath = DataLogger.makeLogFilePath(logFile);
            let lines = [];
            if (fs.existsSync(logPath)) {
                let buff = fs.readFileSync(logPath);
                lines = buff.toString().split('\n');
            }
            if (typeof data === 'object')
                lines.unshift(JSON.stringify(data));
            else
                lines.unshift(data.toString());
            fs.writeFileSync(logPath, lines.join('\n'));
        } catch (err) { logger.error(`writeStart ${logFile}: ${err.message}`); }
    }
    public static writeEnd(logFile: string, entry: DataLoggerEntry) {
        try {
            let logPath = DataLogger.makeLogFilePath(logFile);
            fs.appendFileSync(logPath, entry.toLog());
        } catch (err) { logger.error(`Error writing ${logFile}: ${err.message}`); }
    }
    public static async writeEndAsync(logFile: string, data: any) {
        try {
            let logPath = DataLogger.makeLogFilePath(logFile);
            let s = typeof data === 'object' ? JSON.stringify(data) : data.toString();
            await new Promise<void>((resolve, reject) => {
                fs.appendFile(logPath, s, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        } catch (err) { logger.error(`Error writing to file ${logFile}: ${err.message}`); }
    }
    // Reads the number of lines in reverse order from the start of the file.
    public static async readEnd(logFile: string, maxLines: number): Promise<string[]> {
        try {
            // Alright what we have created here is a method to read the data from the end of 
            // a log file in reverse order (tail) that works for all os implementations.  It is
            // really dumb that this isn't part of the actual file processing.
            let logPath = DataLogger.makeLogFilePath(logFile);
            let newLines = ['\r', '\n'];
            let lines = [];
            if (fs.existsSync(logPath)) {
                let stat = await new Promise<fs.Stats>((resolve, reject) => {
                    fs.stat(logPath, (err, data) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });
                // The file is empty.
                if (stat.size === 0) return lines;
                let pos = stat.size;
                let file = await new Promise<number>((resolve, reject) => {
                    fs.open(logPath, 'r', (err, fileNo) => {
                        if (err) reject(err);
                        else resolve(fileNo);
                    });
                });
                try {
                    let line = '';
                    while (pos >= 0 && lines.length < maxLines) {
                        // Read a character from the file
                        let char = await new Promise<string>((resolve, reject) => {
                            fs.read(file, Buffer.allocUnsafe(1), 0, 1, pos, (err, bytesRead, buff) => {
                                if (err) reject(err);
                                else resolve(buff.toString());
                            });
                        });
                        pos--;
                        // If we hit the beginning of the file or a newline from a previous
                        // record then we shoud save off the line and read the next record.
                        if (newLines.includes(char) || pos === 0) {
                            if (line.length > 0) lines.push(line);
                            line = '';
                        }
                        else line += char;
                    }
                } catch (err) { }
                finally { if (typeof file !== 'undefined') await new Promise<boolean>((resolve, reject) => fs.close(file, (err) => { if (err) reject(err); else resolve(true); })); }
            }
            return lines;
        } catch (err) { logger.error(`readEnd ${logFile}: ${err.message}`); }
    }
    private static makeLogFilePath(logFile: string) { return `${DataLogger.ensureLogPath()}/${logFile}`; }
    private static ensureLogPath(): string {
        let logPath = path.join(process.cwd(), '/logs');
        if (!fs.existsSync(logPath)) fs.mkdirSync(logPath);
        return logPath;
    }
}
export interface IDataLoggerEntry<T> {
    createInstance(entry?: string): T,
    parse(entry?: string): T
}
export class DataLoggerEntry {
    private static dateTestISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*))(?:Z|(\+|-)([\d|:]*))?$/;
    private static dateTextAjax = /^\/Date\((d|-|.*)\)[\/|\\]$/;
    constructor(entry?: string | object) {
        // Parse the data from the log entry if it exists.
        if (typeof entry === 'object') entry = JSON.stringify(entry);
        if (typeof entry === 'string') this.parse(entry);
        else {
            //console.log(`A DATALOGGER ENTRY DOES NOT HAVE A PROPER TYPE ${typeof entry} *************************************`);
            //console.log(entry);
        }
    }
    public static createInstance(entry?: string) { return new DataLoggerEntry(entry); }
    public parse(entry: string) {
        let obj = typeof entry !== 'undefined' ? JSON.parse(entry, this.dateParser) : {};
        if (typeof entry === 'undefined') {
            console.log(`A DATALOGGER ENTRY WAS NOT DEFINED *************************`);
        }
        else if (entry === '') {
            console.log(`THE INCOMING DATALOGGER ENTRY WAS EMPTY ***************************`)
        }
        let o = extend(true, this, obj);
    }
    protected dateParser(key, value) {
        if (typeof value === 'string') {
            let d = DataLoggerEntry.dateTestISO.exec(value);
            // By parsing the date and then creating a new date from that we will get
            // the date in the proper timezone.
            if (d) return new Date(Date.parse(value));
            d = DataLoggerEntry.dateTextAjax.exec(value);
            if (d) {
                // Not sure we will be seeing ajax dates but this is
                // something that we may see from external sources.
                let a = d[1].split(/[-+,.]/);
                return new Date(a[0] ? +a[0] : 0 - +a[1]);
            }
        }
        return value;
    }
    public toJSON() {
        return utils.replaceProps(this, (key, value) => {
            if (key.startsWith('_')) return undefined;
            if (typeof value === 'undefined' || value === null) return undefined;
            if (typeof value.getMonth === 'function') return Timestamp.toISOLocal(value);
            return value;
        });
    }
    public toLog(): string { return JSON.stringify(this) + '\n'; }
}
