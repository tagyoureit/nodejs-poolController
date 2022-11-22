/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020, 2021, 2022.  
Russell Goldin, tagyoureit.  russ.goldin@gmail.com

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

import extend = require("extend");
import { ClientOptions, DEFAULT_WriteOptions, InfluxDB, Point, WriteApi, WriteOptions, WritePrecisionType } from '@influxdata/influxdb-client';
import { utils, Timestamp } from '../../controller/Constants';
import { logger } from "../../logger/Logger";
import { BaseInterfaceBindings, InterfaceContext, InterfaceEvent } from "./baseInterface";
export class InfluxInterfaceBindings extends BaseInterfaceBindings {
    constructor(cfg) {
        super(cfg);
    }
    private writeApi: WriteApi;
    declare context: InterfaceContext;
    declare cfg;
    declare events: InfluxInterfaceEvent[];
    private init = () => {
        let baseOpts = extend(true, this.cfg.options, this.context.options);
        let url = 'http://';
        if (typeof baseOpts.protocol !== 'undefined' && baseOpts.protocol) url = baseOpts.protocol;
        if (!url.endsWith('://')) url += '://';
        url = `${url}${baseOpts.host}`;
        if(typeof baseOpts.port !== 'undefined' && baseOpts.port !== null && !isNaN(baseOpts.port)) url = `${url}:${baseOpts.port}`;
        let influxDB: InfluxDB;
        let bucket;
        let org;
        if (typeof baseOpts.host === 'undefined' || !baseOpts.host) {
            logger.warn(`Interface: ${this.cfg.name} has not resolved to a valid host.`);
            return;
        }
        if (baseOpts.version === 1) {
            if (typeof baseOpts.database === 'undefined' || !baseOpts.database) {
                logger.warn(`Interface: ${this.cfg.name} has not resolved to a valid database.`);
                return;
            }
            bucket = `${baseOpts.database}/${baseOpts.retentionPolicy}`;
            const clientOptions: ClientOptions = {
                url,
                token: `${baseOpts.username}:${baseOpts.password}`,
            }
            influxDB = new InfluxDB(clientOptions);
        }
        else if (baseOpts.version === 2) {
            org = baseOpts.org;
            bucket = baseOpts.bucket;
            const clientOptions: ClientOptions = {
                url,
                token: baseOpts.token,
            }
            influxDB = new InfluxDB(clientOptions);
        }
        // set global tags from context
        let baseTags = {}
        baseOpts.tags.forEach(tag => {
            let toks = {};
            let sname = this.tokensReplacer(tag.name, undefined, toks, undefined, {})
            let svalue = this.tokensReplacer(tag.value, undefined, toks, { vars: {} } as any, {});
            if (typeof sname !== 'undefined' && typeof svalue !== 'undefined' && !sname.includes('@bind') && !svalue.includes('@bind'))
                baseTags[sname] = svalue;
        })
        //this.writeApi.useDefaultTags(baseTags);
        const writeOptions:WriteOptions = {
            /* the maximum points/line to send in a single batch to InfluxDB server */
            batchSize: baseOpts.batchSize || 100, 
            /* default tags to add to every point */
            defaultTags: baseTags,
            /* maximum time in millis to keep points in an unflushed batch, 0 means don't periodically flush */
            flushInterval: DEFAULT_WriteOptions.flushInterval,
            /* maximum size of the retry buffer - it contains items that could not be sent for the first time */
            maxBufferLines: DEFAULT_WriteOptions.maxBufferLines,
            /* the count of retries, the delays between retries follow an exponential backoff strategy if there is no Retry-After HTTP header */
            maxRetries: DEFAULT_WriteOptions.maxRetries,
            /* maximum delay between retries in milliseconds */
            maxRetryDelay: DEFAULT_WriteOptions.maxRetryDelay,
            /* minimum delay between retries in milliseconds */
            minRetryDelay: DEFAULT_WriteOptions.minRetryDelay, // minimum delay between retries
            /* a random value of up to retryJitter is added when scheduling next retry */
            retryJitter: DEFAULT_WriteOptions.retryJitter,
            // ... or you can customize what to do on write failures when using a writeFailed fn, see the API docs for details
            writeFailed: function(error, lines, failedAttempts){
                /** return promise or void */
                logger.error(`InfluxDB batch write failed writing ${lines.length} lines with ${failedAttempts} failed attempts.  ${error.message}`);
                //console.log(lines);
            },
            writeSuccess: function(lines){
                logger.silly(`InfluxDB successfully wrote ${lines.length} lines.`)
            },
            writeRetrySkipped: function(entry){
                logger.silly(`Influx write retry skipped ${JSON.stringify(entry)}`);
            },
            maxRetryTime: DEFAULT_WriteOptions.maxRetryTime,
            exponentialBase: DEFAULT_WriteOptions.exponentialBase,
            randomRetry: DEFAULT_WriteOptions.randomRetry,
            maxBatchBytes: 4096
           
        }
        this.writeApi = influxDB.getWriteApi(org, bucket, 'ms', writeOptions);



    }
    public bindEvent(evt: string, ...data: any) {

        // if (state.status.value !== sys.board.valueMaps.controllerStatus.getValue('ready')) return; // miss values?  or show errors?  or?
        if (typeof this.events !== 'undefined') {
            if (typeof this.writeApi === 'undefined') this.init();
            let evts = this.events.filter(elem => elem.name === evt);
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
                    for (let j = 0; j < e.points.length; j++) {
                        let _point = e.points[j];
                        // Figure out whether we need to check the filter for each point.
                        if (typeof _point.filter !== 'undefined') {
                            this.buildTokens(_point.filter, evt, toks, e, data[0]);
                            if (eval(this.replaceTokens(_point.filter, toks)) === false) continue;
                        }
                        // iterate through points array
                        let point = new Point(_point.measurement)
                        let point2 = new Point(_point.measurement);
                        _point.tags.forEach(_tag => {
                            let sname = _tag.name;
                            this.buildTokens(sname, evt, toks, e, data[0]);
                            sname = this.replaceTokens(sname, toks);
                            let svalue = _tag.value;
                            this.buildTokens(svalue, evt, toks, e, data[0]);
                            svalue = this.replaceTokens(svalue, toks);
                            if (typeof sname !== 'undefined' && typeof svalue !== 'undefined' && !sname.includes('@bind') && !svalue.includes('@bind') && svalue !== null) {
                                point.tag(sname, svalue);
                                if (typeof _point.storePrevState !== 'undefined' && _point.storePrevState) point2.tag(sname, svalue);
                            }
                            else {
                                logger.error(`InfluxDB tag binding failure on ${evt}:${_tag.name}/${_tag.value} --> ${svalue || 'undefined'}  ${JSON.stringify(data[0])}`);
                                if (typeof sname === 'undefined') logger.error(`InfluxDB tag name is undefined`);
                                if (typeof svalue === 'undefined') logger.error(`InfluxDB value is undefined`);
                                if (svalue.includes('@bind')) logger.error(`InfluxDB value not bound`);
                                if (svalue === null) logger.error(`InfluxDB value is null`);
                            }
                        })
                        _point.fields.forEach(_field => {
                            try {
                                let sname = _field.name;
                                this.buildTokens(sname, evt, toks, e, data[0]);
                                //console.log(toks);
                                sname = this.replaceTokens(sname, toks);
                                let svalue = _field.value;
                                this.buildTokens(svalue, evt, toks, e, data[0]);
                                svalue = this.replaceTokens(svalue, toks);
                                if (typeof sname !== 'undefined' && typeof svalue !== 'undefined' && !sname.includes('@bind') && !svalue.includes('@bind') && svalue !== null)
                                    switch (_field.type) {
                                        case 'int':
                                        case 'integer':
                                            let int = parseInt(svalue, 10);
                                            if (!isNaN(int)) point.intField(sname, int);
                                            // if (!isNaN(int) && typeof _point.storePrevState !== 'undefined' && _point.storePrevState) point2.intField(sname, int);
                                            break;
                                        case 'string':
                                            point.stringField(sname, svalue);
                                            // if (typeof _point.storePrevState !== 'undefined' && _point.storePrevState) point2.stringField(sname, svalue);
                                            break;
                                        case 'boolean':
                                            point.booleanField(sname, utils.makeBool(svalue));
                                            if (typeof _point.storePrevState !== 'undefined' && _point.storePrevState) point2.booleanField(sname, !utils.makeBool(svalue));
                                            break;
                                        case 'float':
                                            let float = parseFloat(svalue);
                                            if (!isNaN(float)) point.floatField(sname, float);
                                            // if (!isNaN(float) && typeof _point.storePrevState !== 'undefined' && _point.storePrevState) point2.intField(sname, int);
                                            break;
                                        case 'timestamp':
                                        case 'datetime':
                                        case 'date':
                                            //let dt = Date.parse(svalue.replace(/^["'](.+(?=["']$))["']$/, '$1'));
                                            // RKS: 07-06-21 - I think this is missing the eval function around all of this. The strings still have the quotes around them.  I think
                                            // maybe we need to create a closure and execute it as a code segment for variable data.
                                            let sdt = eval(svalue);
                                            if (sdt !== null && typeof sdt !== 'undefined') {
                                                let dt = Date.parse(sdt);
                                                if (!isNaN(dt)) point.intField(sname, dt);
                                                else if (svalue !== '') logger.warn(`Influx error parsing date from ${sname}: ${svalue}`);
                                            }
                                            break;
                                    }
                                else {
                                    logger.error(`InfluxDB point binding failure on ${evt}:${_field.name}/${_field.value} --> ${svalue || 'undefined'}`);
                                }
                            } catch (err) { logger.error(`Error binding InfluxDB point fields ${err.message}`); }
                        });
                        if (typeof _point.series !== 'undefined') {
                            try {
                                this.buildTokens(_point.series.value, evt, toks, e, data[0]);
                                let ser = eval(this.replaceTokens(_point.series.value, toks));
                                let ts = Date.parse(ser);
                                if (isNaN(ts)) {
                                    logger.error(`Influx series timestamp is invalid ${ser}`);
                                }
                                else
                                    point.timestamp(new Date(ts));
                            } catch (err) { logger.error(`Error parsing Influx point series for ${evt} - ${_point.series.value}`); }
                        }
                        else
                            point.timestamp(new Date());
                        try {

                            if (typeof _point.storePrevState !== 'undefined' && _point.storePrevState) {
                                // copy the point and subtract a second and keep inverse value
                                let ts = new Date();
                                let sec = ts.getSeconds() - 1;
                                ts.setSeconds(sec);
                                point2.timestamp(ts);
                                logger.silly(`Batching influx ${e.name} inverse data point ${point2.toString()})`)
                                this.writeApi.writePoint(point2);
                            }
                            if (typeof point.toLineProtocol() !== 'undefined') {
                                logger.silly(`Batching influx ${e.name} data point ${point.toString()}`)
                                this.writeApi.writePoint(point);
                                // this.writeApi.flush()
                                //     .catch(error => { logger.error(`Error flushing Influx data point ${point.toString()} ${error}`); });
                                //logger.info(`INFLUX: ${point.toLineProtocol()}`)
                            }
                            else {
                                logger.silly(`Skipping INFLUX write because some data is missing with ${e.name} event on measurement ${_point.measurement}.`)
                            }
                        }
                        catch (err) {
                            logger.error(`Error writing to Influx: ${err.message}`)
                        }
                    }
                }
            }
        }
    }
    public close = () => {

    }
}

class InfluxInterfaceEvent extends InterfaceEvent {
    public points: IPoint[];
}

export interface IPoint {
    measurement: string;
    series?: ISeries;
    tags: ITag[];
    fields: IFields[];
    storePrevState?: boolean;
    filter?: any;
}
export interface ITag {
    name: string;
    value: string;
}
export interface IFields {
    name: string;
    value: string;
    type: string;
}
export interface ISeries {
    value: string;
}
