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
import { webApp } from "../../web/Server";
import extend=require("extend");
import { logger } from "../../logger/Logger";
import { PoolSystem, sys } from "../../controller/Equipment";
import { State, state } from "../../controller/State";
import { InterfaceContext, InterfaceEvent, BaseInterfaceBindings } from "./baseInterface";

export class RuleInterfaceBindings extends BaseInterfaceBindings {
    constructor(cfg) { super(cfg);}
    declare events: RuleInterfaceEvent[];
    public bindProcessor(evt: RuleInterfaceEvent) {
        if (evt.processorBound) return;
        if (typeof evt.fnProcessor === 'undefined') {
            let fnBody = Array.isArray(evt.processor) ? evt.processor.join('\n') : evt.processor;
            if (typeof fnBody !== 'undefined' && fnBody !== '') {
                //let AsyncFunction = Object.getPrototypeOf(async => () => { }).constructor;
                let AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
                try {
                    evt.fnProcessor = new AsyncFunction('rule', 'options', 'vars', 'logger', 'webApp', 'sys', 'state', 'data', fnBody) as (rule: RuleInterfaceEvent, vars: any, sys: PoolSystem, state: State, data: any) => void;
                } catch (err) { logger.error(`Error compiling rule event processor: ${err} -- ${fnBody}`); }
            }
        }
        evt.processorBound = true;
    }
    public executeProcessor(eventName: string, evt: RuleInterfaceEvent, ...data: any) {
        this.bindProcessor(evt);
        let vars = this.bindVarTokens(evt, eventName, data);
        let opts = extend(true, this.cfg.options, this.context.options, evt.options);
        if (typeof evt.fnProcessor !== undefined) evt.fnProcessor(evt, opts, vars, logger, webApp, sys, state, data);
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
            if (evts.length > 0) {
                let toks = {};
                for (let i = 0; i < evts.length; i++) {
                    let e = evts[i];
                    if (typeof e.enabled !== 'undefined' && !e.enabled) continue;
                    // Figure out whether we need to check the filter.
                    if (typeof e.filter !== 'undefined') {
                        this.buildTokens(e.filter, evt, toks, e, data[0]);
                        if (eval(this.replaceTokens(e.filter, toks)) === false) continue;
                    }
                    // Look for the processor.
                    this.executeProcessor(evt, e, ...data);
                }
            }
        }
    }
}
class RuleInterfaceEvent extends InterfaceEvent {
    event: string;
    description: string;
    fnProcessor: (rule: RuleInterfaceEvent, options:any, vars: any, logger: any, webApp: any, sys: PoolSystem, state: State, data: any) => void;
    processorBound: boolean = false;
}
export interface IRuleInterfaceEvent {
    event: string,
    description: string,
    processor?: string
}


