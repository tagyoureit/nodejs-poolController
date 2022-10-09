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
import { connect, MqttClient, Client, IClientPublishOptions, CloseCallback } from 'mqtt';
import * as http2 from "http2";
import * as http from "http";
import * as https from "https";
import extend = require("extend");
import { logger } from "../../logger/Logger";
import { PoolSystem, sys } from "../../controller/Equipment";
import { State, state } from "../../controller/State";
import { InterfaceEvent, BaseInterfaceBindings, InterfaceContext, IInterfaceEvent } from "./baseInterface";
import { sys as sysAlias } from "../../controller/Equipment";
import { state as stateAlias } from "../../controller/State";
import { webApp as webAppAlias } from '../Server';
import { Timestamp, Utils, utils } from "../../controller/Constants";
import { ServiceParameterError } from '../../controller/Errors';

export class MqttInterfaceBindings extends BaseInterfaceBindings {
    constructor(cfg) {
        super(cfg);
        this.subscribed = false;
    }
    public client: MqttClient;
    private topics: MqttTopicSubscription[] = [];
    declare events: MqttInterfaceEvent[];
    declare subscriptions: MqttTopicSubscription[];
    private subscribed: boolean; // subscribed to events or not
    private sentInitialMessages = false;
    private init = () => { (async () => { await this.initAsync(); })(); }
    public async initAsync() {
        try {
            if (this.client) await this.stopAsync();
            logger.info(`Initializing MQTT client ${this.cfg.name}`);
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
                rejectUnauthorized: !baseOpts.selfSignedCertificate,
                url
            }
            this.setWillOptions(opts);
            this.client = connect(url, opts);
            this.client.on('connect', async () => {
                try {
                    logger.info(`MQTT connected to ${url}`);
                    await this.subscribe();
                    // make sure status is up to date immediately
                    // especially in the case of a re-connect
                    this.bindEvent("controller", state.controllerState);
                } catch (err) { logger.error(err); }
            });
            this.client.on('reconnect', () => {
                try {
                    logger.info(`Re-connecting to MQTT broker ${this.cfg.name}`);
                } catch (err) { logger.error(err); }

            });
            this.client.on('error', (error) => {
                logger.error(`MQTT error ${error}`)
                this.clearWillState();
            });
        } catch (err) { logger.error(`Error initializing MQTT client ${this.cfg.name}: ${err}`); }
    }
    public async stopAsync() {
        try {
            if (typeof this.client !== 'undefined') {
                await this.unsubscribe();
                await new Promise<boolean>((resolve, reject) => {
                    this.client.end(true, { reasonCode: 0, reasonString: `Shutting down MQTT Client` }, () => {
                        resolve(true);
                        logger.info(`Successfully shut down MQTT Client`);
                    });
                });
                if (this.client) this.client.removeAllListeners();
                this.client = null;
            }
        } catch (err) { logger.error(`Error stopping MQTT Client: ${err.message}`); }
    }
    public async reload(data) {
        try {
            await this.unsubscribe();
            this.context = Object.assign<InterfaceContext, any>(new InterfaceContext(), data.context);
            this.events = Object.assign<MqttInterfaceEvent[], any>([], data.events);
            this.subscriptions = Object.assign<MqttTopicSubscription[], any>([], data.subscriptions);
            await this.subscribe();
        } catch (err) { logger.error(`Error reloading MQTT bindings`); }
    }
    private async unsubscribe() {
        try {
            this.client.off('message', this.messageHandler);
            while (this.topics.length > 0) {
                let topic = this.topics.pop();
                if (typeof topic !== 'undefined') {
                    await new Promise<boolean>((resolve, reject) => {
                        this.client.unsubscribe(topic.topicPath, (err, packet) => {
                            if (err) {
                                logger.error(`Error unsubscribing from MQTT topic ${topic.topicPath}: ${err}`);
                                resolve(false);
                            }
                            else {
                                logger.debug(`Unsubscribed from MQTT topic ${topic.topicPath}`);
                                resolve(true);
                            }
                        });
                    });
                }
            }
            this.subscribed = false;
        } catch (err) { logger.error(`Error unsubcribing to MQTT topic: ${err.message}`); }
    }
    protected async subscribe() {
        if (this.topics.length > 0) await this.unsubscribe();
        let root = this.rootTopic();
        if (typeof this.subscriptions !== 'undefined') {
            for (let i = 0; i < this.subscriptions.length; i++) {
                let sub = this.subscriptions[i];
                if(sub.enabled !== false) this.topics.push(new MqttTopicSubscription(root, sub));
            }
        }
        else if (typeof root !== 'undefined') {
            let arrTopics = [
                `state/+/setState`,
                `state/+/setstate`,
                `state/+/toggleState`,
                `state/+/togglestate`,
                `state/body/setPoint`,
                `state/body/setpoint`,
                `state/body/heatSetpoint`,
                `state/body/coolSetpoint`,
                `state/body/heatMode`,
                `state/body/heatmode`,
                `state/+/setTheme`,
                `state/+/settheme`,
                `state/temps`,
                `config/tempSensors`,
                `config/chemController`,
                `state/chemController`,
                `config/chlorinator`,
                `state/chlorinator`];
            for (let i = 0; i < arrTopics.length; i++) {
                this.topics.push(new MqttTopicSubscription(root, { topic: arrTopics[i] }));
            }
        }
        for (let i = 0; i < this.topics.length; i++) {
            let topic = this.topics[i];
            this.client.subscribe(topic.topicPath, (err, granted) => {
                if (!err) logger.verbose(`MQTT subscribed to ${JSON.stringify(granted)}`);
                else logger.error(`MQTT Subscribe: ${err}`);
            });
        }
        this.client.on('message', this.messageHandler);
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
        let sys = sysAlias;
        let state = stateAlias;
        let webApp = webAppAlias;
        let vars = this.bindVarTokens(e, eventName, data);
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
    private setWillOptions = (connectOpts) => {
        const baseOpts = extend(true, { headers: {} }, this.cfg.options, this.context.options);

        if (baseOpts.willTopic !== 'undefined') {
          const rootTopic = this.rootTopic();
          const topic = `${rootTopic}/${baseOpts.willTopic}`;
          const publishOptions = {
              retain: typeof baseOpts.retain !== 'undefined' ? baseOpts.retain : true,
              qos: typeof baseOpts.qos !== 'undefined' ? baseOpts.qos : 2
          };

          connectOpts.will = {
              topic: topic,
              payload: baseOpts.willPayload,
              retain: publishOptions.retain,
              qos: publishOptions.qos
          };
        }
    }
    private clearWillState() {
        if (typeof this.client.options.will === 'undefined')  return;
        let willTopic = this.client.options.will.topic;
        let willPayload = this.client.options.will.payload;

        if (typeof this.events !== 'undefined') this.events.forEach(evt => {
            if (typeof evt.topics !== 'undefined') evt.topics.forEach(t => {
                if (typeof t.lastSent !== 'undefined') {
                    let lm = t.lastSent.find(elem => elem.topic === willTopic);
                    if (typeof lm !== 'undefined') {
                        lm.message = willPayload.toString();
                    }
                }
            });
        });
    }
    public rootTopic = () => {
        let toks = {};
        let baseOpts = extend(true, { headers: {} }, this.cfg.options, this.context.options);
        let topic = '';
        this.buildTokensWithFormatter(baseOpts.rootTopic, undefined, toks, undefined, undefined, baseOpts.formatter);
        topic = this.replaceTokens(baseOpts.rootTopic, toks);
        return topic;
    }
    public bindEvent(evt: string, ...data: any) {
        try {
            if (!this.sentInitialMessages && evt === 'controller' && data[0].status.val === 1) {
                // Emitting all the equipment messages
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
                            let topicToks = {};
                            if (typeof t.enabled !== 'undefined' && !t.enabled) return;
                            if (typeof t.filter !== 'undefined') {
                                this.buildTokens(t.filter, evt, topicToks, e, data[0]);
                                if (eval(this.replaceTokens(t.filter, topicToks)) === false) return;
                            }
                            let topicFormatter = t.formatter || opts.formatter;
                            let topic = '';
                            let message: any;
                            // build tokens for Topic
                            // we need to keep separated topic tokens because otherwise
                            // a value like @bind=data.name; would be eval'd the same
                            // across all topics
                            this.buildTokensWithFormatter(t.topic, evt, topicToks, e, data[0], topicFormatter);
                            topic = this.replaceTokens(t.topic, topicToks);
                            if (t.useRootTopic !== false) topic = `${rootTopic}/${topic}`;
                            // Filter out any topics where there may be undefined in it.  We don't want any of this if that is the case.
                            if (topic.endsWith('/undefined') || topic.indexOf('/undefined/') !== -1 || topic.startsWith('null/') || topic.indexOf('/null') !== -1) return;
                            let publishOptions: IClientPublishOptions = { retain: typeof baseOpts.retain !== 'undefined' ? baseOpts.retain : true, qos: typeof baseOpts.qos !== 'undefined' ? baseOpts.qos : 2 };
                            let changesOnly = typeof baseOpts.changesOnly !== 'undefined' ? baseOpts.changesOnly : true;
                            if (typeof e.options !== 'undefined') {
                                if (typeof e.options.retain !== 'undefined') publishOptions.retain = e.options.retain;
                                if (typeof e.options.qos !== 'undefined') publishOptions.retain = e.options.qos;
                                if (typeof e.options.changesOnly !== 'undefined') changesOnly = e.options.changesOnly;
                            }
                            if (typeof t.options !== 'undefined') {
                                if (typeof t.options.retain !== 'undefined') publishOptions.retain = t.options.retain;
                                if (typeof t.options.qos !== 'undefined') publishOptions.qos = t.options.qos;
                                if (typeof t.options.changeOnly !== 'undefined') changesOnly = t.options.changesOnly;
                            }

                            if (typeof t.processor !== 'undefined') {
                                if (t.ignoreProcessor) message = "err";
                                else {
                                    if (typeof t._fnProcessor !== 'function') {
                                        let fnBody = Array.isArray(t.processor) ? t.processor.join('\n') : t.processor;
                                        try {
                                            // Try to compile it.
                                            t._fnProcessor = new Function('ctx', 'pub', 'sys', 'state', 'data', fnBody) as (ctx: any, pub: MQTTPublishTopic, sys: PoolSystem, state: State, data: any) => any;
                                        } catch (err) { logger.error(`Error compiling subscription processor: ${err} -- ${fnBody}`); t.ignoreProcessor = true; }
                                    }
                                    if (typeof t._fnProcessor === 'function') {
                                        let vars = this.bindVarTokens(e, evt, data);
                                        let ctx = { util: utils, rootTopic: rootTopic, topic: topic, opts: opts, vars: vars }
                                        try {
                                            message = t._fnProcessor(ctx, t, sys, state, data[0]).toString();
                                            topic = ctx.topic;
                                        } catch (err) { logger.error(`Error publishing MQTT data for topic ${t.topic}: ${err.message}`); message = "err"; }
                                    }
                                }
                            }
                            else {
                                this.buildTokens(t.message, evt, topicToks, e, data[0]);
                                message = this.tokensReplacer(t.message, evt, topicToks, e, data[0]);
                            }

                            if (changesOnly) {
                                if (typeof t.lastSent === 'undefined') t.lastSent = [];
                                let lm = t.lastSent.find(elem => elem.topic === topic);
                                if (typeof lm === 'undefined' || lm.message !== message) {
                                    setImmediate(() => { this.client.publish(topic, message, publishOptions); });
                                    logger.silly(`MQTT send:\ntopic: ${topic}\nmessage: ${message}\nopts:${JSON.stringify(publishOptions)}`);
                                }
                                if (typeof lm === 'undefined') t.lastSent.push({ topic: topic, message: message });
                                else lm.message = message;

                            }
                            else {
                                logger.silly(`MQTT send:\ntopic: ${topic}\nmessage: ${message}\nopts:${JSON.stringify(publishOptions)}`);
                                setImmediate(() => { this.client.publish(topic, message, publishOptions); });
                                if (typeof t.lastSent !== 'undefined') t.lastSent = undefined;
                            }

                        })
                    }
                }
            }
        }
        catch (err) {
            logger.error(err);
        }
    }
    // This needed to be refactored so we could extract it from an anonymous function.  We want to be able to unbind
    // from it
    private messageHandler = (topic, message) =>  { (async () => { await this.processMessage(topic, message); })(); }
    private processMessage = async (topic, message) => {
        try {
            if (!state.isInitialized){
                logger.info(`MQTT: **TOPIC IGNORED, SYSTEM NOT READY** Inbound ${topic}: ${message.toString()}`);
                return;
            }
            let msg = message.toString();
            if (msg[0] === '{') msg = JSON.parse(msg);

            let sub: MqttTopicSubscription = this.topics.find(elem => topic === elem.topicPath);
            if (typeof sub !== 'undefined') {
                logger.debug(`MQTT: Inbound ${topic} ${message.toString()}`);
                // Alright so now lets process our results.
                if (typeof sub.fnProcessor === 'function') {
                    sub.executeProcessor(this, msg);
                    return;
                }
            }
            const topics = topic.split('/');
            if (topic.startsWith(this.rootTopic() + '/') && typeof msg === 'object') {
                // RKS: Not sure why there is no processing of state vs config here.  Right now the topics are unique
                // between them so it doesn't matter but it will become an issue.
                switch (topics[topics.length - 1].toLowerCase()) {
                    case 'setstate': {
                        let id = parseInt(msg.id, 10);
                        if (typeof id !== 'undefined' && isNaN(id)) {
                            logger.error(`Inbound MQTT ${topics} has an invalid id (${id}) in the message (${msg}).`)
                        };
                        let isOn = typeof msg.isOn !== 'undefined' ? utils.makeBool(msg.isOn) : typeof msg.state !== 'undefined' ? utils.makeBool(msg.state) : undefined;
                        switch (topics[topics.length - 2].toLowerCase()) {
                            case 'circuits':
                            case 'circuit': {
                                try {
                                    if(typeof isOn !== 'undefined') await sys.board.circuits.setCircuitStateAsync(id, isOn);
                                }
                                catch (err) { logger.error(err); }
                                break;
                            }
                            case 'features':
                            case 'feature': {
                                try {
                                    if (typeof isOn !== 'undefined') await sys.board.features.setFeatureStateAsync(id, isOn);
                                }
                                catch (err) { logger.error(err); }
                                break;
                            }
                            case 'lightgroups':
                            case 'lightgroup': {
                                try {
                                    if (typeof isOn !== 'undefined') await sys.board.circuits.setLightGroupStateAsync(id, isOn);
                                }
                                catch (err) { logger.error(err); }
                                break;
                            }
                            case 'circuitgroups':
                            case 'circuitgroup': {
                                try {
                                    if (typeof isOn !== 'undefined') await sys.board.circuits.setCircuitGroupStateAsync(id, isOn);
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
                                    try {
                                        await sys.board.circuits.toggleCircuitStateAsync(id);
                                    }
                                    catch (err) { logger.error(err); }
                                    break;
                                case 'features':
                                case 'feature':
                                    try {
                                        await sys.board.features.toggleFeatureStateAsync(id);
                                    }
                                    catch (err) { logger.error(err); }
                                    break;
                                default:
                                    logger.warn(`MQTT: Inbound topic ${topics[topics.length - 1]} not matched to event ${topics[topics.length - 2].toLowerCase()}. Message ${msg} `)
                            }
                            break;
                        }
                    case 'heatsetpoint':
                        try {
                            let body = sys.bodies.findByObject(msg);
                            if (topics[topics.length - 2].toLowerCase() === 'body') {
                                if (typeof body === 'undefined') {
                                    logger.error(new ServiceParameterError(`Cannot set body heatSetpoint.  You must supply a valid id, circuit, name, or type for the body`, 'body', 'id', msg.id));
                                    return;
                                }
                                if (typeof msg.setPoint !== 'undefined' || typeof msg.heatSetpoint !== 'undefined') {
                                    let setPoint = parseInt(msg.setPoint, 10) || parseInt(msg.heatSetpoint, 10);
                                    if (!isNaN(setPoint)) {
                                        await sys.board.bodies.setHeatSetpointAsync(body, setPoint);
                                    }
                                }
                            }
                        }
                        catch (err) { logger.error(err); }
                        break;
                    case 'coolsetpoint':
                        try {
                            let body = sys.bodies.findByObject(msg);
                            if (topics[topics.length - 2].toLowerCase() === 'body') {
                                if (typeof body === 'undefined') {
                                    logger.error(new ServiceParameterError(`Cannot set body coolSetpoint.  You must supply a valid id, circuit, name, or type for the body`, 'body', 'id', msg.id));
                                    return;
                                }
                                if (typeof msg.setPoint !== 'undefined' || typeof msg.coolSetpoint !== 'undefined') {
                                    let setPoint = parseInt(msg.coolSetpoint, 10) || parseInt(msg.coolSetpoint, 10);
                                    if (!isNaN(setPoint)) {
                                        await sys.board.bodies.setCoolSetpointAsync(body, setPoint);
                                    }
                                }
                            }
                        } catch (err) { logger.error(err); }
                        break;
                    case 'setpoint':
                        try {
                            let body = sys.bodies.findByObject(msg);
                            if (topics[topics.length - 2].toLowerCase() === 'body') {
                                if (typeof body === 'undefined') {
                                    logger.error(new ServiceParameterError(`Cannot set body setPoint.  You must supply a valid id, circuit, name, or type for the body`, 'body', 'id', msg.id));
                                    return;
                                }
                                if (typeof msg.setPoint !== 'undefined' || typeof msg.heatSetpoint !== 'undefined') {
                                    let setPoint = parseInt(msg.setPoint, 10) || parseInt(msg.heatSetpoint, 10);
                                    if (!isNaN(setPoint)) {
                                        await sys.board.bodies.setHeatSetpointAsync(body, setPoint);
                                    }
                                }
                                if (typeof msg.coolSetpoint !== 'undefined') {
                                    let setPoint = parseInt(msg.coolSetpoint, 10);
                                    if (!isNaN(setPoint)) {
                                        await sys.board.bodies.setCoolSetpointAsync(body, setPoint);
                                    }
                                }
                            }
                        }
                        catch (err) { logger.error(err); }
                        break;
                    case 'heatmode':
                        try {
                            if (topics[topics.length - 2].toLowerCase() !== 'body') return;
                            // Map the mode that was passed in.  This should accept the text based name or the ordinal id value.
                            let mode = parseInt(msg.mode, 10);
                            let val;
                            if (isNaN(mode)) mode = parseInt(msg.heatMode, 10);
                            if (!isNaN(mode)) val = sys.board.valueMaps.heatModes.transform(mode);
                            else val = sys.board.valueMaps.heatModes.transformByName(msg.mode || msg.heatMode);
                            if (typeof val.val === 'undefined') {
                                logger.error(new ServiceParameterError(`Invalid value for heatMode: ${msg.mode}`, 'body', 'heatMode', mode));
                                return;
                            }
                            mode = val.val;
                            let body = sys.bodies.findByObject(msg);
                            if (typeof body === 'undefined') {
                                logger.error(new ServiceParameterError(`Cannot set body heatMode.  You must supply a valid id, circuit, name, or type for the body`, 'body', 'id', msg.id));
                                return;
                            }
                            let tbody = await sys.board.bodies.setHeatModeAsync(body, mode);
                        }
                        catch (err) { logger.error(err); }
                        break;
                    case 'chlorinator':
                        try {
                            let schlor = await sys.board.chlorinator.setChlorAsync(msg);
                        }
                        catch (err) { logger.error(err); }
                        break;
                    case 'chemcontroller':
                        try {
                            await sys.board.chemControllers.setChemControllerAsync(msg);
                        }
                        catch (err) { logger.error(err); }
                        break;
                    case 'settheme':
                        try {
                            let theme = await state.circuits.setLightThemeAsync(parseInt(msg.id, 10), sys.board.valueMaps.lightThemes.encode(msg.theme));
                        }
                        catch (err) { logger.error(err); }
                        break;
                    case 'temp':
                    case 'temps':
                        try {
                            await sys.board.system.setTempsAsync(msg);
                        }
                        catch (err) { logger.error(err); }
                        break;
                    case 'tempsensor':
                    case 'tempsensors':
                        try {
                            await sys.board.system.setTempSensorsAsync(msg);
                        }
                        catch (err) { logger.error(err); }
                        break;
                    default:
                        logger.silly(`MQTT: Inbound MQTT topic not matched: ${topic}: ${message.toString()}`)
                        break;
                }
            }
        }
        catch (err) {
            logger.error(`Error processing MQTT request ${topic}: ${err}.  ${message}`)
        }
    }
}
class MqttInterfaceEvent extends InterfaceEvent {
    public topics: MQTTPublishTopic[]
}
export class MQTTPublishTopic {
    topic: string;
    useRootTopic: boolean;
    message: string;
    description: string;
    formatter: any[];
    qos: string;
    retain: boolean;
    enabled?: boolean;
    filter?: string;
    lastSent: MQTTMessage[];
    options: any;
    processor?: string[];
    ignoreProcessor: boolean = false;
    _fnProcessor: (ctx: any, pub: MQTTPublishTopic, sys: PoolSystem, state: State, data: any) => any
}
class MQTTMessage {
    topic: string;
    message: string;
}

class MqttSubscriptions {
    public subscriptions: IMQTTSubscription[]
}
class MqttTopicSubscription implements IInterfaceEvent {
    root: string;
    topic: string;
    enabled: boolean;
    fnProcessor: (ctx: any, sub: MqttTopicSubscription, sys: PoolSystem, state: State, value: any) => void;
    options: any = {};
    constructor(root: string, sub: any) {
        this.root = sub.root || root;
        this.topic = sub.topic;
        if (typeof sub.processor !== 'undefined') {
            let fnBody = Array.isArray(sub.processor) ? sub.processor.join('\n') : sub.processor;
            try {
                this.fnProcessor = new Function('ctx', 'sub', 'sys', 'state', 'value', fnBody) as (ctx: any, sub: MqttTopicSubscription, sys: PoolSystem, state: State, value: any) => void;
            } catch (err) { logger.error(`Error compiling subscription processor: ${err} -- ${fnBody}`); }
        }
    }
    public get topicPath(): string { return `${this.root}/${this.topic}` };
    public executeProcessor(bindings: MqttInterfaceBindings, value: any) {
        let baseOpts = extend(true, { headers: {} }, bindings.cfg.options, bindings.context.options);
        let opts = extend(true, baseOpts, this.options);
        let vars = bindings.bindVarTokens(this, this.topic, value);

        let ctx = {
            util: utils,
            client: bindings.client,
            vars: vars || {},
            publish: (topic: string, message: any, options?: any) => {
                try {
                    let msg: string;
                    if (typeof message === 'undefined') msg = '';
                    else if (typeof message === 'string') msg = message;
                    else if (typeof message === 'boolean') msg = message ? 'true' : 'false';
                    else if (message instanceof Timestamp) (message as Timestamp).format();
                    else if (typeof message.getTime === 'function') msg = Timestamp.toISOLocal(message);
                    else {
                        msg = Utils.stringifyJSON(message);
                    }
                    let baseOpts = extend(true, { headers: {} }, bindings.cfg.options, bindings.context.options);
                    let pubOpts: IClientPublishOptions = { retain: typeof baseOpts.retain !== 'undefined' ? baseOpts.retain : true, qos: typeof baseOpts.qos !== 'undefined' ? baseOpts.qos : 2 };
                    if (typeof options !== 'undefined') {
                        if (typeof options.retain !== 'undefined') pubOpts.retain = options.retain;
                        if (typeof options.qos !== 'undefined') pubOpts.qos = options.qos;
                        if (typeof options.headers !== 'undefined') pubOpts.properties = extend(true, {}, baseOpts.properties, options.properties);
                    }
                    let top = `${this.root}`;
                    if (!top.endsWith('/') && !topic.startsWith('/')) top += '/';
                    top += topic;
                    logger.silly(`Publishing ${top}-${msg}`);
                    // Now we should be able to send this to the broker.
                    bindings.client.publish(top, msg, pubOpts, (err) => {
                        if (err) {
                            logger.error(`Error publishing topic ${top}-${msg} : ${err}`);
                        }
                    });
                } catch (err) { logger.error(`Error publishing ${topic} to server ${bindings.cfg.name} from ${this.topic}`); }
            }
        };
        
        this.fnProcessor(ctx, this, sys, state, value);
        state.emitEquipmentChanges();
    }
}
export interface IMQTTSubscription {
    topic: string,
    description: string,
    processor?: string,
    enabled?: boolean
}
