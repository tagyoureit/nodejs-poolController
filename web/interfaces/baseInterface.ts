import extend = require("extend");
import { logger } from "../../logger/Logger";
import { sys as sysAlias } from "../../controller/Equipment";
import { state as stateAlias} from "../../controller/State";
import { webApp as webAppAlias} from '../Server';

export class BaseInterfaceBindings {
    constructor(cfg) {
        this.cfg = cfg;
    }
    public context: InterfaceContext;
    public cfg;
    public events: InterfaceEvent[];
    public bindEvent(evt: string, ...data: any) { };
    protected bindVarTokens(e: InterfaceEvent, evt: string, ...data: any) {
        let v = {};
        let toks = {};
        let vars = extend(true, {}, this.cfg.vars, this.context.vars, typeof e !== 'undefined' && e.vars ? e.vars : {});
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
    protected matchTokens(input: string, eventName: string, toks: any, e: InterfaceEvent, data, vars): any {
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
    protected buildTokens(input: string, eventName: string, toks: any, e: InterfaceEvent, data): any {
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
    }
    protected tokensReplacer(input: string, eventName: string, toks: any, e: InterfaceEvent, data): any{
        this.buildTokens(input, eventName, toks, e, data);
        return this.replaceTokens(input, toks);
    }
    public async stopAsync() { }
}

export class InterfaceEvent {
    public name: string;
    public enabled: boolean = true;
    public filter: string;
    public options: any = {};
    public body: any = {};
    public vars: any = {};
}
export class InterfaceContext {
    public name: string;
    public mdnsDiscovery: any;
    public upnpDevice: any;
    public options: any = {};
    public vars: any = {};
}
