import * as fs from "fs";
import * as path from "path";
import extend = require("extend");
import { logger } from "../../logger/Logger";
import { sys as sysAlias } from "../../controller/Equipment";
import { state as stateAlias} from "../../controller/State";
import { webApp as webAppAlias } from '../Server';
import { config } from "../../config/Config";
export class BindingsFile {
    public static async fromBuffer(filename: string, buff: Buffer) {
        try {
            let bf = new BindingsFile();
            bf.filename = filename;
            bf.filePath = path.join(process.cwd(), 'web/bindings/custom', bf.filename);
            bf.options = await bf.extractBindingOptions(buff);
            return typeof bf.options !== 'undefined' ? bf : undefined;
        } catch (err) { logger.error(`Error creating buffered backup file: ${filename}`); }
    }
    public static async fromFile(pathName: string, fileName: string) {
        try {
            let bf = new BindingsFile();
            bf.filePath = path.posix.join(pathName, fileName);
            bf.filename = fileName;
            bf.options = await bf.extractBindingOptions(bf.filePath);
            return typeof bf.options !== 'undefined' ? bf : undefined;
        } catch (err) { logger.error(`Error creating bindings file from file ${pathName}${fileName}`); }
    }
    public filename: string;
    public filePath: string;
    public options: any;
    protected async extractBindingOptions(file: string | Buffer) {
        try {
            let buff = Buffer.isBuffer(file) ? file.toString() : fs.readFileSync(file, 'utf8');
            let bindings = JSON.parse(buff);
            let interfaces = config.getSection('web.interfaces');
            let ass = [];
            for (let ifname in interfaces) {
                let iface = interfaces[ifname]
                if (typeof iface !== 'undefined' && typeof iface.fileName !== 'undefined')
                    if (iface.fileName.endsWith(`custom/${this.filename}`)) ass.push(ifname);
            }
            if (typeof bindings.context !== 'undefined')
                return {
                    filename: this.filename, filepath: this.filePath, name: bindings.context.name || name, type: bindings.context.type || undefined, assoc: ass
                };
            return this.options;
        } catch (err) { logger.error(`Error extracting binding options from ${Buffer.isBuffer(file) ? 'Buffer' : file}: ${err.message}`); }
    }
}

export class BaseInterfaceBindings {
    constructor(cfg) {
        this.cfg = cfg;
    }
    public context: InterfaceContext;
    public cfg;
    public events: InterfaceEvent[];
    public bindEvent(evt: string, ...data: any) { };
    public bindVarTokens(e: IInterfaceEvent, evt: string, ...data: any) {
        let v = {};
        let toks = {};
        let vars = extend(true, {}, this.context.vars, typeof e !== 'undefined' && e.vars ? e.vars : {}, this.cfg.vars || {});
        for (var s in vars) {
            let ovalue = vars[s];
            if (typeof ovalue === 'string') {
                if (ovalue.includes('@bind')) {
                    this.matchTokens(ovalue, evt, toks, e, data[0], vars);
                    v[s] = toks;
                    ovalue = this.evalTokens(ovalue, toks);
                }
            }
            v[s] = ovalue;
        }
        //console.log(...data);
        //console.log(v);
        return v;
    }
    protected matchTokens(input: string, eventName: string, toks: any, e: IInterfaceEvent, data, vars): any {
        toks = toks || [];
        let s = input;
        let regx = /(?<=@bind\=\s*).*?(?=\;)/g;
        let match;
        let sys = sysAlias;
        let state = stateAlias;
        let webApp = webAppAlias;
        while (match = regx.exec(s)) {
            let bind = match[0];
            if (typeof toks[bind] !== 'undefined') continue;
            let tok: any = {};
            toks[bind] = tok;
            try {
                // we may error out if data can't be found (eg during init)
                tok.reg = new RegExp("@bind=" + this.escapeRegex(bind) + ";", "g");
                tok.value = eval(bind);
            }
            catch (err) {
                // leave value undefined so it isn't sent to bindings
                toks[bind] = null;
            }
        }
        return toks;

    }
    protected buildTokens(input: string, eventName: string, toks: any, e: IInterfaceEvent, data): any {
        toks = toks || [];
        let s = input;
        let regx = /(?<=@bind\=\s*).*?(?=\;)/g;
        let match;
        let vars = this.bindVarTokens(e, eventName, data);
        let sys = sysAlias;
        let state = stateAlias;
        let webApp = webAppAlias;
        // Map all the returns to the token list.  We are being very basic
        // here an the object graph is simply based upon the first object occurrence.
        // We simply want to eval against that object reference.

        while (match = regx.exec(s)) {
            let bind = match[0];
            if (typeof toks[bind] !== 'undefined') continue;
            let tok: any = {};
            toks[bind] = tok;
            try {
                // we may error out if data can't be found (eg during init)
                tok.reg = new RegExp("@bind=" + this.escapeRegex(bind) + ";", "g");
                tok.value = eval(bind);
            }
            catch (err) {
                // leave value undefined so it isn't sent to bindings
                toks[bind] = null;
            }
        }
        return toks;
    }
    protected escapeRegex(reg: string) { return reg.replace(/[-[\]{}()*+?.|,\\^$]/g, '\\$&'); }
    protected replaceTokens(input: string, toks: any) {
        let s = input;
        for (let exp in toks) {
            let tok = toks[exp];
            if (!tok || typeof tok.reg === 'undefined') continue;
            tok.reg.lastIndex = 0; // Start over if we used this before.
            if (typeof tok.value === 'string') s = s.replace(tok.reg, tok.value);
            else if (typeof tok.value === 'undefined') s = s.replace(tok.reg, 'null');
            else s = s.replace(tok.reg, JSON.stringify(tok.value));
        }
        return s;
    }
    protected evalTokens(input: string, toks: any) {
        let s = input;
        for (let exp in toks) {
            let tok = toks[exp];
            if (!tok || typeof tok.reg === 'undefined') continue;
            tok.reg.lastIndex = 0; // Start over if we used this before.
            if (typeof tok.value === 'string') s = s.replace(tok.reg, tok.value);
            else if (typeof tok.value === 'undefined') s = s.replace(tok.reg, 'null');
            else return tok.value;
        }
        return s;
    }
    protected tokensReplacer(input: string, eventName: string, toks: any, e: InterfaceEvent, data): any{
        this.buildTokens(input, eventName, toks, e, data);
        return this.replaceTokens(input, toks);
    }
    public async stopAsync() { }
}
export interface IInterfaceEvent {
    enabled: boolean;
    filter?: string;
    options?: any;
    body?: any;
    vars?: any;
    processor?: string[]
}
export class InterfaceEvent implements IInterfaceEvent {
    public name: string;
    public enabled: boolean = true;
    public filter: string;
    public options: any = {};
    public body: any = {};
    public vars: any = {};
    public processor?: string[]
}
export class InterfaceContext {
    public name: string;
    public mdnsDiscovery: any;
    public upnpDevice: any;
    public options: any = {};
    public vars: any = {};
}
