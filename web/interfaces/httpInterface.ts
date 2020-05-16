import { HttpInterfaceServer } from "../../web/Server";
import * as http2 from "http2";
import * as http from "http";
import * as https from "https";
import extend = require("extend");
import { logger } from "../../logger/Logger";
import { sys } from "../../controller/Equipment";
import { state } from "../../controller/State";

export class HttpInterfaceBindings {
    constructor(cfg) {
        this.cfg = cfg;
    }
    public context: HttpInterfaceContext;
    public cfg;
    public events: HttpInterfaceEvent[];
    public bindEvent(evt: string, ...data: any) {
        // Find the binding by first looking for the specific event name.  If that doesn't exist then look for the "*" (all events).
        if (typeof this.events !== 'undefined') {
            let evts = this.events.filter(elem => elem.name === evt);
            // If we don't have an explicitly defined event then see if there is a default.
            if (evts.length === 0) {
                let e = this.events.find(elem => elem.name === '*');
                evts = e ? [e] : [];
            }

            let baseOpts = extend(true, { headers: {} }, this.cfg.options, this.context.options);
            if ((typeof baseOpts.hostname === 'undefined' || !baseOpts.hostname) && (typeof baseOpts.host === 'undefined' || !baseOpts.host || baseOpts.host === '*')) {
                logger.warn(`Interface: ${this.cfg.name} has not resolved to a valid host.`)
                return;
            }
            if (evts.length > 0) {
                let toks = {};
                for(let i = 0; i < evts.length; i++) {
                    let e = evts[i];
                    if (typeof e.enabled !== 'undefined' && !e.enabled) continue;
                    let opts = extend(true, baseOpts, e.options);
                    
                    // If we are still waiting on mdns then blow this off.
                    if ((typeof opts.hostname === 'undefined' || !opts.hostname) && (typeof opts.host === 'undefined' || !opts.host || opts.host === '*')) {
                        logger.warn(`Interface: ${this.cfg.name} Event: ${e.name} has not resolved to a valid host.`)
                        continue;
                    }

                    // Put together the data object.
                    let sbody = '';
                    switch (this.cfg.contentType) {
                        //case 'application/json':
                        //case 'json':
                        default:
                            sbody = JSON.stringify(e.body);
                            break;
                        // We may need an XML output and can add transforms for that
                        // later.  There isn't a native xslt processor in node and most
                        // of them that I looked at seemed pretty amatuer hour or overbearing
                        // as they used SAX. => Need down and clean not down and dirty... we aren't building 
                        // a web client at this point.
                    }
                    this.buildTokens(sbody, evt, toks, e, data[0]);
                    sbody = this.replaceTokens(sbody, toks);
                    for (let prop in opts) {
                        if (prop === 'headers') {
                            for (let header in opts.headers) {
                                this.buildTokens(opts.headers[header], evt, toks, e, data[0]);
                                opts.headers[header] = this.replaceTokens(opts.headers[header], toks);
                            }
                        }
                        else if (typeof opts[prop] === 'string') {
                            this.buildTokens(opts[prop], evt, toks, e, data[0]);
                            opts[prop] = this.replaceTokens(opts[prop] || '', toks);
                        }
                    }
                    if (typeof opts.path !== 'undefined') opts.path = encodeURI(opts.path); // Encode the data just in case we have spaces.
                    opts.headers["CONTENT-LENGTH"] = Buffer.byteLength(sbody || '');
                    logger.verbose(`Sending [${evt}] request to ${this.cfg.name}: ${JSON.stringify(opts)}`);
                    let req: http.ClientRequest;
                    // We should now have all the tokens.  Put together the request.
                    if (opts.port === 443 || (opts.protocol || '').startsWith('https')) {
                        req = https.request(opts, (response: http.IncomingMessage) => {
                            //console.log(response);
                        });
                    }
                    else {
                        req = http.request(opts, (response: http.IncomingMessage) => {
                            //console.log(response.statusCode);
                        });
                    }
                    req.on('error', (err, req, res) => { logger.error(err); });
                    if (typeof sbody !== 'undefined') {
                        if (sbody.charAt(0) === '"' && sbody.charAt(sbody.length - 1) === '"') sbody = sbody.substr(1, sbody.length - 2);
                        req.write(sbody);
                    }
                    req.end();



                }
            }
        }
    }
    private buildTokens(input: string, eventName: string, toks: any, e: HttpInterfaceEvent, data) : any {
        toks = toks || [];
        let s = input;
        let regx = /(?<=@bind\=\s*).*?(?=\;)/g;
        let match;
        let vars = extend(true, {}, this.cfg.vars, this.context.vars, e.vars);
        // Map all the returns to the token list.  We are being very basic
        // here an the object graph is simply based upon the first object occurrence.
        // We simply want to eval against that object reference.
        while (match = regx.exec(s)) {
            let bind = match[0];
            if (typeof toks[bind] !== 'undefined') continue;
            let tok:any = {};
            toks[bind] = tok;
            tok.value = eval(bind);
            tok.reg = new RegExp("@bind=" + this.escapeRegex(bind) + ";", "g");
        }
        return toks;
    }
    private escapeRegex(reg: string) {
        return reg.replace(/[-[\]{}()*+?.,\\^$]/g, '\\$&');
    }
    private replaceTokens(input: string, toks: any) {
        let s = input;
        for (let exp in toks) {
            let tok = toks[exp];
            tok.reg.lastIndex = 0; // Start over if we used this before.
            if (typeof tok.value === 'string') s = s.replace(tok.reg, tok.value);
            else if (typeof tok.value === 'undefined') s = s.replace(tok.reg, 'null');
            else s = s.replace(tok.reg, JSON.stringify(tok.value));
        }
        return s;
    }
}
export class HttpInterfaceEvent {
    public name: string;
    public enabled: boolean = true
    public options: any = {};
    public body: any = {};
    public vars: any = {};
}
export class HttpInterfaceContext {
    public mdnsDiscovery: any;
    public upnpDevice: any;
    public options: any = {};
    public vars: any = {}
}
