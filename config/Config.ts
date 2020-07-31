/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com

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
import * as path from "path";
import * as fs from "fs";
const extend = require("extend");
import { logger } from "../logger/Logger";
class Config {
    private cfgPath: string;
    private _cfg: any;
    private _isInitialized: boolean=false;
    private _fileTime: Date = new Date(0);
    private _isLoading: boolean = false;
    constructor() {
        let self=this;
        this.cfgPath = path.posix.join(process.cwd(), "/config.json");
        // RKS 05-18-20: This originally had multiple points of failure where it was not in the try/catch.
        try {
            this._isLoading = true;
            this._cfg = fs.existsSync(this.cfgPath) ? JSON.parse(fs.readFileSync(this.cfgPath, "utf8")) : {};
            const def = JSON.parse(fs.readFileSync(path.join(process.cwd(), "/defaultConfig.json"), "utf8").trim());
            const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "/package.json"), "utf8").trim());
            this._cfg = extend(true, {}, def, this._cfg, { appVersion: packageJson.version });
            this._isInitialized = true;
            this.update((err) => {
                if (typeof err === 'undefined') {
                    fs.watch(this.cfgPath, (event, fileName) => {
                        if (fileName && event === 'change') {
                            if (self._isLoading) return; // Need a debounce here.  We will use a semaphore to cause it not to load more than once.
                            const stats = fs.statSync(self.cfgPath);
                            if (stats.mtime.valueOf() === self._fileTime.valueOf()) return;
                            this._cfg = fs.existsSync(this.cfgPath) ? JSON.parse(fs.readFileSync(this.cfgPath, "utf8")) : {};
                            this._cfg = extend(true, {}, def, this._cfg, { appVersion: packageJson.version });
                            logger.init(); // only reload logger for now; possibly expand to other areas of app
                            logger.info(`Reloading app config: ${fileName}`);
                        }
                    });
                }
                else throw err;
            });
            this._isLoading = false;
        } catch (err) {
            console.log(`Error reading configuration information.  Aborting startup: ${ err }`);
            // Rethrow this error so we exit the app with the appropriate pause in the console.
            throw err;
        }
    }
    public update(callback?: (err?) => void) {
        // Don't overwrite the configuration if we failed during the initialization.
        try {
            if (!this._isInitialized) {
                if (typeof callback === 'function') callback(new Error('njsPC has not been initialized.'));
                return;
            }
            this._isLoading = true;
            fs.writeFileSync(
                this.cfgPath,
                JSON.stringify(this._cfg, undefined, 2)
            );
            if (typeof callback === 'function') callback();
            setTimeout(()=>{this._isLoading = false;}, 2000);
        }
        catch (err) {
            logger.error("Error writing configuration file %s", err);
            if (typeof callback === 'function') callback(err);

        }
    }
    public setSection(section: string, val) {
        let c = this._cfg;
        if (section.indexOf('.') !== -1) {
            let arr = section.split('.');
            for (let i = 0; i < arr.length - 1; i++) {
                if (typeof c[arr[i]] === 'undefined')
                    c[arr[i]] = {};
                c = c[arr[i]];
            }
            section = arr[arr.length - 1];
        }
        c[section] = val;
        this.update();
    }
    public getSection(section?: string, opts?: any): any {
        if (typeof section === 'undefined') return this._cfg;
        let c: any = this._cfg;
        if (section.indexOf('.') !== -1) {
            const arr = section.split('.');
            for (let i = 0; i < arr.length; i++) {
                if (typeof c[arr[i]] === "undefined") {
                    c = null;
                    break;
                } else c = c[arr[i]];
            }
        } else c = c[section];
        return extend(true, {}, opts || {}, c || {});
    }
    public init() {
        let baseDir = process.cwd();
        this.ensurePath(baseDir + '/logs/');
        this.ensurePath(baseDir + '/data/');
        // this.ensurePath(baseDir + '/replay/');
        setTimeout(() => { config.update(); }, 100);
    }
    private ensurePath(dir: string) {
        if (!fs.existsSync(dir)) {
            fs.mkdir(dir, (err) => {
                // Logger will not be initialized by the time we reach here so we must
                // simply log these to the console.
                if (err) console.log(`Error creating directory: ${ dir } - ${ err.message }`);
            });
        }
    }
}
export const config: Config = new Config();
