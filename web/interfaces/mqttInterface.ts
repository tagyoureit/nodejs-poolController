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
import { connect, MqttClient, Client } from 'mqtt';
import * as http2 from "http2";
import * as http from "http";
import * as https from "https";
import extend = require("extend");
import { logger } from "../../logger/Logger";
import { sys } from "../../controller/Equipment";
import { state } from "../../controller/State";
import { InterfaceEvent, BaseInterfaceBindings } from "./baseInterface";
import { sys as sysAlias } from "../../controller/Equipment";
import { state as stateAlias } from "../../controller/State";
import { webApp as webAppAlias } from '../Server';
import { utils } from "../../controller/Constants";
import { ServiceParameterError } from 'controller/Errors';

export class MqttInterfaceBindings extends BaseInterfaceBindings {
    constructor(cfg) {
        super(cfg);
        this.subscribed = false;
    }
    private client: MqttClient;
    public events: MqttInterfaceEvent[];
    private subscribed: boolean; // subscribed to events or not
    private sentInitialMessages = false;
    private init = () => {

        let baseOpts = extend(true, { headers: {} }, this.cfg.options, this.context.options);
        if ((typeof baseOpts.hostname === 'undefined' || !baseOpts.hostname) && (typeof baseOpts.host === 'undefined' || !baseOpts.host || baseOpts.host === '*')) {
            logger.warn(`Interface: ${this.cfg.name} has not resolved to a valid host.`);
            return;
        }
        const url = `${baseOpts.protocol || 'mqtt://'}${baseOpts.host}:${baseOpts.port || 1883}`;
        let toks = {};
        const opts = {
            clientId: this.tokensReplacer(baseOpts.clientId, undefined, toks, { vars: {} } as any, {}),
            username: baseOpts.username,
            password: baseOpts.password,
            url
        }
        //this.client = new Client(net.Socket,opts);
        this.client = connect(url, opts);

        this.client.on('connect', () => {
            logger.info(`MQTT connected to ${url}`);
            this.subscribe();
        })

    }

    private subscribe = () => {
        let topics = [`${this.rootTopic()}/state/+/setState`,
        `${this.rootTopic()}/state/+/toggleState`
        ];
        topics.forEach(topic => {
            this.client.subscribe(topic, (err, granted) => {
                if (!err) logger.debug(`MQTT subscribed to ${JSON.stringify(granted)}`)
                else logger.error(`MQTT Subscribe: ${err}`)
            })
        })
        this.client.on('message', this.messageHandler)
        this.subscribed = true;
    }

    // this will take in the MQTT Formatter options and format each token that is bound
    // otherwise, it's the same as the base buildTokens fn.
    // This could be combined into one fn but for now it's specific to MQTT formatting of topics
    protected buildTokensWithFormatter(input: string, eventName: string, toks: any, e: InterfaceEvent, data, formatter: any): any {
        toks = toks || [];
        let s = input;
        let regx = /(?<=@bind\=\s*).*?(?=\;)/g;
        let match;
        let vars = extend(true, {}, this.cfg.vars, this.context.vars, typeof e !== 'undefined' && e.vars);
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
                if (typeof formatter !== 'undefined') {
                    formatter.forEach(entry => {
                        if (typeof entry.transform !== 'undefined') {
                            let transform = `('${tok.value}')${entry.transform}`;
                            tok.value = eval(transform);
                        }
                        else if (typeof entry === 'object') {
                            let rexp = new RegExp(entry.regexkey, 'g')
                            tok.value = tok.value.replace(rexp, entry.replace);
                        }
                    })
                }
            }
            catch (err) {
                // leave value undefined so it isn't sent to bindings
                tok[bind] = null;
            }
        }
        return toks;
    }

    private rootTopic = () => {
        let toks = {};
        let baseOpts = extend(true, { headers: {} }, this.cfg.options, this.context.options);
        let topic = '';
        this.buildTokensWithFormatter(baseOpts.rootTopic, undefined, toks, undefined, undefined, baseOpts.formatter);
        topic = this.replaceTokens(baseOpts.rootTopic, toks);
        return topic;
    }

    public bindEvent(evt: string, ...data: any) {
        if (!this.sentInitialMessages && evt === 'controller' && data[0].status.val === 1) {
            state.emitAllEquipmentChanges();
            this.sentInitialMessages = true;
        }
        // Find the binding by first looking for the specific event name.  
        // If that doesn't exist then look for the "*" (all events).
        if (typeof this.events !== 'undefined') {
            if (typeof this.client === 'undefined') this.init();
            let evts = this.events.filter(elem => elem.name === evt);
            // If we don't have an explicitly defined event then see if there is a default.
            if (evts.length === 0) {
                let e = this.events.find(elem => elem.name === '*');
                evts = e ? [e] : [];
            }

            if (evts.length > 0) {
                let toks = {};
                let replacer = '';
                for (let i = 0; i < evts.length; i++) {
                    let e = evts[i];
                    if (typeof e.enabled !== 'undefined' && !e.enabled) continue;
                    let baseOpts = extend(true, { headers: {} }, this.cfg.options, this.context.options);
                    let opts = extend(true, baseOpts, e.options);
                    // Figure out whether we need to check the filter.
                    if (typeof e.filter !== 'undefined') {
                        this.buildTokens(e.filter, evt, toks, e, data[0]);
                        if (eval(this.replaceTokens(e.filter, toks)) === false) continue;
                    }

                    let rootTopic = this.rootTopic();
                    if (typeof opts.replacer !== 'undefined') replacer = opts.replacer;

                    if (typeof e.topics !== 'undefined') e.topics.forEach(t => {
                        let topicFormatter = t.formatter || opts.formatter;
                        let topicToks = {};
                        let topic = '';
                        let message: any;
                        // build tokens for Topic
                        // we need to keep separated topic tokens because otherwise
                        // a value like @bind=data.name; would be eval'd the same
                        // across all topics
                        this.buildTokensWithFormatter(t.topic, evt, topicToks, e, data[0], topicFormatter);
                        topic = `${rootTopic}/${this.replaceTokens(t.topic, topicToks)}`;
                        this.buildTokens(t.message, evt, topicToks, e, data[0]);
                        message = this.tokensReplacer(t.message, evt, topicToks, e, data[0]);

                        let retain = baseOpts.retain;
                        if (typeof t.retain !== 'undefined') retain = t.retain;
                        let qos = baseOpts.qos;
                        if (typeof t.qos !== 'undefined') qos = t.qos;
                        let publishOptions = {
                            retain,
                            qos
                        }
                        logger.silly(`MQTT send:\ntopic: ${topic}\nmessage: ${message}\nopts:${JSON.stringify(publishOptions)}`)
                        this.client.publish(topic, message, { retain: true, qos: 2 });
                    })
                }
            }
        }
    }
    private messageHandler = async (topic, message) => {
        let msg = message.toString();
        if (msg[0] === '{') msg = JSON.parse(msg);
        const topics = topic.split('/');
        if (topics[0] === this.rootTopic() && typeof msg === 'object') {

            switch (topics[topics.length - 1].toLowerCase()) {
                case 'setstate': {
                    let id = parseInt(msg.id, 10);
                    if (typeof id !== 'undefined' && isNaN(id)) {
                        logger.error(`Inbound MQTT ${topics} has an invalid id (${id}) in the message (${msg}).`)
                    };
                    let isOn = utils.makeBool(msg.isOn);
                    switch (topics[topics.length - 2].toLowerCase()) {
                        case 'circuits':
                        case 'circuit': {
                            try {
                                logger.debug(`MQTT: Inbound CIRCUIT SETSTATE: ${JSON.stringify(msg)}`);
                                if (msg.isOn !== 'undefined') await sys.board.circuits.setCircuitStateAsync(id, isOn);
                            }
                            catch (err) { logger.error(err); }
                            break;
                        }
                        case 'features':
                        case 'feature': {
                            try {
                                logger.debug(`MQTT: Inbound FEATURE SETSTATE: ${JSON.stringify(msg)}`);
                                if (msg.isOn !== 'undefined') await sys.board.features.setFeatureStateAsync(id, isOn);
                            }
                            catch (err) { logger.error(err); }
                            break;
                        }
                        case 'lightgroups':
                        case 'lightgroup': {
                            try {
                                logger.debug(`MQTT: Inbound LIGHTGROUP SETSTATE: ${JSON.stringify(msg)}`);
                                await sys.board.circuits.setLightGroupStateAsync(id, isOn);
                            }
                            catch (err) { logger.error(err); }
                            break;
                        }
                        case 'circuitgroups':
                        case 'circuitgroup': {
                            try {
                                logger.debug(`MQTT: Inbound CIRCUITGROUP SETSTATE: ${JSON.stringify(msg)}`);
                                await sys.board.circuits.setCircuitGroupStateAsync(id, isOn);
                            }
                            catch (err) { logger.error(err); }
                            break;
                        }
                        default:
                            logger.warn(`MQTT: Inbound topic ${topics[topics.length - 1]} not matched to event ${topics[topics.length - 2].toLowerCase()}. Message ${msg} `)
                    }
                    break;
                }
                case 'togglestate':
                    {
                        let id = parseInt(msg.id, 10);
                        if (typeof id !== 'undefined' && isNaN(id)) {
                            logger.error(`Inbound MQTT ${topics} has an invalid id (${id}) in the message (${msg}).`)
                        };
                        switch (topics[topics.length - 2].toLowerCase()) {
                            case 'circuits':
                            case 'circuit':
                                {
                                    try {
                                        logger.debug(`MQTT: Inbound CIRCUIT TOGGLESTATE: ${JSON.stringify(msg)}`);
                                        await sys.board.circuits.toggleCircuitStateAsync(id);
                                    }
                                    catch (err) { logger.error(err); }
                                    break;
                                }
                            case 'features':
                            case 'feature':
                                {
                                    try {
                                        logger.debug(`MQTT: Inbound FEATURE TOGGLESTATE: ${JSON.stringify(msg)}`);
                                        await sys.board.features.toggleFeatureStateAsync(id);
                                    }
                                    catch (err) { logger.error(err); }
                                    break;
                                }
                            default:
                                logger.warn(`MQTT: Inbound topic ${topics[topics.length - 1]} not matched to event ${topics[topics.length - 2].toLowerCase()}. Message ${msg} `)
                        }

                    }
                case 'setpoint':
                    {
                        try {
                            let body = sys.bodies.findByObject(msg.body);
                            if (topics[topics.length - 2].toLowerCase() === 'body') {
                                if (typeof body === 'undefined') {
                                    logger.error(new ServiceParameterError(`Cannot set body setPoint.  You must supply a valid id, circuit, name, or type for the body`, 'body', 'id', msg.body.id));
                                    return;
                                }
                                let tbody = await sys.board.bodies.setHeatSetpointAsync(body, parseInt(msg.body.setPoint, 10));
                            }
                        }
                        catch (err) { logger.error(err); }

                        break;
                    }
                case 'heatmode':
                    {
                        try {
                            if (topics[topics.length - 2].toLowerCase() !== 'body') return;
                            // Map the mode that was passed in.  This should accept the text based name or the ordinal id value.
                            let mode = parseInt(msg.body.mode, 10);
                            let val;
                            if (isNaN(mode)) mode = parseInt(msg.body.heatMode, 10);
                            if (!isNaN(mode)) val = sys.board.valueMaps.heatModes.transform(mode);
                            else val = sys.board.valueMaps.heatModes.transformByName(msg.body.mode || msg.body.heatMode);
                            if (typeof val.val === 'undefined') {
                                logger.error(new ServiceParameterError(`Invalid value for heatMode: ${msg.body.mode}`, 'body', 'heatMode', mode));
                                return;
                            }
                            mode = val.val;
                            let body = sys.bodies.findByObject(msg.body);
                            if (typeof body === 'undefined') {
                                logger.error(new ServiceParameterError(`Cannot set body heatMode.  You must supply a valid id, circuit, name, or type for the body`, 'body', 'id', msg.body.id));
                                return;
                            }
                            let tbody = await sys.board.bodies.setHeatModeAsync(body, mode);
                        }
                        catch (err) { logger.error(err); }
                        break;
                    }
                case 'chlorinator':
                    {
                        try {
                            let schlor = await sys.board.chlorinator.setChlorAsync(msg.body);
                        }
                        catch (err) { logger.error(err); }
                        break;
                    }
                default:
                    logger.silly(`MQTT: Inbound MQTT topic not matched: ${topic}: ${message.toString()}`)
            }
        }
    }
}

class MqttInterfaceEvent extends InterfaceEvent {
    public topics: IMQTT[]
}

export interface IMQTT {
    topic: string;
    message: string;
    description: string;
    formatter: any[];
    qos: string;
    retain: boolean
}