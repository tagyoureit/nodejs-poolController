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

import extend = require("extend");
import { ClientOptions, InfluxDB, Point, WritePrecision, WriteApi } from '@influxdata/influxdb-client';
import { utils } from '../../controller/Constants';
import { logger } from "../../logger/Logger";
import { BaseInterfaceBindings, InterfaceContext, InterfaceEvent } from "./baseInterface";
export class InfluxInterfaceBindings extends BaseInterfaceBindings {
    constructor(cfg) {
        super(cfg);
    }
    private writeApi: WriteApi;
    public context: InterfaceContext;
    public cfg;
    public events: InfluxInterfaceEvent[];
    private init = () => {
        let baseOpts = extend(true, this.cfg.options, this.context.options);
        if (typeof baseOpts.host === 'undefined' || !baseOpts.host) {
            logger.warn(`Interface: ${this.cfg.name} has not resolved to a valid host.`);
            return;
        }
        if (typeof baseOpts.database === 'undefined' || !baseOpts.database) {
            logger.warn(`Interface: ${this.cfg.name} has not resolved to a valid database.`);
            return;
        }
        // let opts = extend(true, baseOpts, e.options);
        let url = 'http';
        if (typeof baseOpts.protocol !== 'undefined' && baseOpts.protocol) url = baseOpts.protocol;
        url = `${url}://${baseOpts.host}:${baseOpts.port}`;
        // TODO: add username/password
        const bucket = `${baseOpts.database}/${baseOpts.retentionPolicy}`;
        const clientOptions: ClientOptions = {
            url,
            token: `${baseOpts.username}:${baseOpts.password}`,
        }
        const influxDB = new InfluxDB(clientOptions);
        this.writeApi = influxDB.getWriteApi('', bucket, 'ms' as WritePrecision);
        
       
        // set global tags from context
        let baseTags = {}
        baseOpts.tags.forEach(tag => {
            let toks = {};
            let sname = this.tokensReplacer(tag.name, undefined, toks, undefined, {})
            let svalue = this.tokensReplacer(tag.value, undefined, toks, { vars: {} } as any, {});
            if (typeof sname !== 'undefined' && typeof svalue !== 'undefined' && !sname.includes('@bind') && !svalue.includes('@bind'))
                baseTags[sname] = svalue;
        })
        this.writeApi.useDefaultTags(baseTags);
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
                    for (let j = 0; j < e.points.length; j++){
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
                                //console.log(`failed on ${_tag.name}/${_tag.value}`);
                            }
                        })
                        _point.fields.forEach(_field => {
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
                                }
                            else {
                                console.log(`failed on ${_field.name}/${_field.value}`);

                            }
                        })
                        point.timestamp(new Date());
                        try {

                            if (typeof _point.storePrevState !== 'undefined' && _point.storePrevState) {
                                // copy the point and subtract a second and keep inverse value
                                let ts = new Date();
                                let sec = ts.getSeconds() - 1;
                                ts.setSeconds(sec);
                                point2.timestamp(ts);
                                this.writeApi.writePoint(point2);
                            }
                            if (typeof point.toLineProtocol() !== 'undefined') {
                                this.writeApi.writePoint(point);
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
