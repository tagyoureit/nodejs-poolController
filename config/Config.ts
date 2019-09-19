import * as path from 'path';
import * as fs from 'fs';
var extend = require( 'extend' );
import { logger } from '../logger/Logger';
class Config {
    private cfgPath: string;
    private _cfg: any;
    constructor() {
        this.cfgPath = path.posix.join( process.cwd(), '/config.json' );
        try
        {
            
            this._cfg = fs.existsSync(this.cfgPath) ? JSON.parse(fs.readFileSync(this.cfgPath, 'utf8')) : {};
        }
        catch ( err )
        {
            console.log(`Error reading config.json.  Setting to {}.`)
            this._cfg = {}
        }
        var def = JSON.parse(fs.readFileSync(path.join(process.cwd(), '/defaultConfig.json'), 'utf8').trim());
        this._cfg = extend(true, {}, def, this._cfg);
    }
    public update() {
        // Don't overwrite the configuration if we failed during the initialization.
        if (typeof (this._cfg) === "undefined" || !this._cfg === null || typeof (this._cfg.appVersion) === "undefined") return;
        return fs.writeFile(this.cfgPath,
            JSON.stringify(this._cfg, undefined, 2), function (err) { if (err) logger.error('Error writing configuration file %s', err); });
    }
    public getSection(section?: string, opts?: any) : any {
        if (typeof (section) === "undefined") return this._cfg;
        var c: any = this._cfg;
        if (section.indexOf('.') !== -1) {
            var arr = section.split('.');
            for (let i = 0; i < arr.length; i++) {
                if (typeof (c[arr[i]]) === "undefined") {
                    c = null;
                    break;
                }
                else
                    c = c[arr[i]];
            }
        }
        else
            c = c[section];
        return extend(true, {}, opts || {}, c || {});
    }
    public init() {
        this.update();

    }
}
export var config:Config = new Config();