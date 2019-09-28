import * as path from "path";
import * as fs from "fs";
const extend = require("extend");
import { logger } from "../logger/Logger";
class Config {
    private cfgPath: string;
    private _cfg: any;
    constructor() {
        this.cfgPath = path.posix.join(process.cwd(), "/config.json");
        try {
            this._cfg = fs.existsSync(this.cfgPath)
                ? JSON.parse(fs.readFileSync(this.cfgPath, "utf8"))
                : {};
        } catch (err) {
            console.log(`Error reading config.json.  Setting to {}.`);
            this._cfg = {};
        }
        const def = JSON.parse(
            fs
                .readFileSync(path.join(process.cwd(), "/defaultConfig.json"), "utf8")
                .trim()
        );
        this._cfg = extend(true, {}, def, this._cfg);
    }
    public update() {
        // Don't overwrite the configuration if we failed during the initialization.
        if (
            typeof this._cfg === "undefined" ||
            !this._cfg === null ||
            typeof this._cfg.appVersion === "undefined"
        )
            return;
        return fs.writeFile(
            this.cfgPath,
            JSON.stringify(this._cfg, undefined, 2),
            function (err) {
                if (err) logger.error("Error writing configuration file %s", err);
            }
        );
    }
    public getSection(section?: string, opts?: any): any {
        if (typeof section === "undefined") return this._cfg;
        let c: any = this._cfg;
        if (section.indexOf(".") !== -1) {
            const arr = section.split(".");
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
        this.ensurePath(baseDir + '/replay/');

        setTimeout(function () { config.update(); }, 100);
    }
    private ensurePath(dir: string) {
        if (!fs.existsSync(dir)) {
            fs.mkdir(dir, (err) => {
                // Logger will not be initialized by the time we reach here so we must
                // simply log these to the console.
                if (err) console.log(`Error creating directory: ${dir} - ${err.message}`);
            });
        }
    }

}
export const config: Config = new Config();
