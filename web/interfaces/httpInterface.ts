/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com

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
import { HttpInterfaceServer } from "../../web/Server";
import * as http2 from "http2";
import * as http from "http";
import * as https from "https";
import extend=require("extend");
import { logger } from "../../logger/Logger";
import { sys } from "../../controller/Equipment";
import { state } from "../../controller/State";
import { InterfaceContext, InterfaceEvent, BaseInterfaceBindings } from "./baseInterface";

export class HttpInterfaceBindings extends BaseInterfaceBindings {
    constructor(cfg) {
        super(cfg);
    }
    public bindEvent(evt: string, ...data: any) {
        // Find the binding by first looking for the specific event name.  
        // If that doesn't exist then look for the "*" (all events).
        if (typeof this.events !== 'undefined') {
            let evts = this.events.filter(elem => elem.name === evt);
            // If we don't have an explicitly defined event then see if there is a default.
            if (evts.length === 0) {
                let e = this.events.find(elem => elem.name === '*');
                evts = e ? [e] : [];
            }

            let baseOpts = extend(true, { headers: {} }, this.cfg.options, this.context.options);
            if ((typeof baseOpts.hostname === 'undefined' || !baseOpts.hostname) && (typeof baseOpts.host === 'undefined' || !baseOpts.host || baseOpts.host === '*')) {
                logger.warn(`Interface: ${ this.cfg.name } has not resolved to a valid host.`);
                return;
            }
            if (evts.length > 0) {
                let toks = {};
                for (let i = 0; i < evts.length; i++) {
                    let e = evts[i];
                    if (typeof e.enabled !== 'undefined' && !e.enabled) continue;
                    let opts = extend(true, baseOpts, e.options);
                    // Figure out whether we need to check the filter.
                    if (typeof e.filter !== 'undefined') {
                        this.buildTokens(e.filter, evt, toks, e, data[0]);
                        if (eval(this.replaceTokens(e.filter, toks)) === false) continue;
                    }

                    // If we are still waiting on mdns then blow this off.
                    if ((typeof opts.hostname === 'undefined' || !opts.hostname) && (typeof opts.host === 'undefined' || !opts.host || opts.host === '*')) {
                        logger.warn(`Interface: ${ this.cfg.name } Event: ${ e.name } has not resolved to a valid host.`);
                        continue;
                    }

                    // Put together the data object.
                    let sbody = '';
                    switch (this.cfg.contentType) {
                        //case 'application/json':
                        //case 'json':
                        default:
                            sbody = typeof e.body !== 'undefined' ? JSON.stringify(e.body) : '';
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
                    // opts.headers["CONTENT-LENGTH"] = Buffer.byteLength(sbody || '');
                    logger.debug(`Sending [${evt}] request to ${this.cfg.name}: ${JSON.stringify(opts)}`);
                    let req: http.ClientRequest;
                    // We should now have all the tokens.  Put together the request.
                    if (typeof sbody !== 'undefined') {
                        if (sbody.charAt(0) === '"' && sbody.charAt(sbody.length - 1) === '"') sbody = sbody.substr(1, sbody.length - 2);
                        opts.headers["CONTENT-LENGTH"] = Buffer.byteLength(sbody || '');
                    }
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
                        req.write(sbody);
                    }
                    req.end();
                }
            }
        }
    }
}

