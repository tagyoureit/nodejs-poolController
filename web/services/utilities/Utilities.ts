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
import * as path from "path";
import * as fs from "fs";
import * as multer from 'multer';
import * as express from 'express';
import { SsdpServer} from '../../Server';
import { state } from "../../../controller/State";
import { sys } from "../../../controller/Equipment";
import { webApp } from "../../Server";
import { config } from "../../../config/Config";
import { logger } from "../../../logger/Logger";
import { ServiceParameterError, ServiceProcessError } from "../../../controller/Errors";
import { BindingsFile } from "../../interfaces/baseInterface";
import { Utils, utils } from "../../../controller/Constants";
const extend = require("extend");
export class UtilitiesRoute {

    public static initRoutes(app: express.Application) {
        app.use('/upnp.xml', async (req, res, next) => {
            try {
                // Put together the upnp device description.
                let ssdp = webApp.findServer('ssdp') as SsdpServer;
                if (typeof ssdp === 'undefined') throw new Error(`SSDP Server not initialized.  No upnp information available.`);
                res.status(200).set('Content-Type', 'text/xml').send(ssdp.deviceXML());
            } catch (err) { next(err); }
        });
        app.get('/extended/:section', (req, res) => {
            let cfg = sys.getSection(req.params.section);
            let st = state.getState(req.params.section);
            let arr = [];
            for (let i = 0; i < cfg.length; i++){
                let p = extend(true, {}, cfg[i], st.find(s => s.id === cfg[i].id));
                arr.push(p);
            }
            return res.status(200).send(arr);
        });
        app.put('/app/interfaces/add', async (req, res, next) => {
            try {
                let faces = config.getSection('web.interfaces');
                let opts: any = {};
                switch (req.body.type) {
                    case 'rule':
                        opts = {};
                        break;
                    case 'rem':
                        opts = {
                            options: { protocol: 'http://', host: '', port: 8080, headers: { "content-type": "application/json" } },
                            socket: {
                                transports: ['websocket'], allowEIO3: true, upgrade: false,
                                reconnectionDelay: 2000, reconnection: true, reconnectionDelayMax: 20000
                            }
                        }
                        break;
                    case 'http':
                    case 'rest':
                        opts = {
                            options: { protocol: 'http://', host: '', port: 80 }
                        }
                        break;
                    case 'influx':
                    case 'influxdb':
                        opts = {
                            options: {
                                version: 1,
                                protocol: 'http',
                                database: 'pool',
                                port: 8601,
                                retentionPolicy: 'autogen'
                            }
                        }
                        break;
                    case 'influxdb2':
                        opts = {
                            options: {
                                version: 2,
                                protocol: 'http',
                                port: 9999,
                                database: 'pool',
                                bucket: '57ec4eed2d90a50b',
                                token: '...LuyM84JJx93Qvc7tfaXPbI_mFFjRBjaA==',
                                org: 'njsPC-org'
                            }
                        }
                        break;
                    case 'mqtt':
                        opts = {
                            options: {
                                protocol: 'mqtt://', host: '', port: 1883, username: '', password: '',
                                selfSignedCertificate: false,
                                rootTopic: "pool/@bind=(state.equipment.model).replace(/ /g,'-').replace(' / ','').toLowerCase();",
                                retain: true, qos: 0, changesOnly: true
                            }
                        }
                        break;
                    default:
                        return Promise.reject(new ServiceParameterError(`An invalid type was specified ${req.body.type}`, 'PUT: /app/interfaces/add', 'type', req.body.type));
                }
                opts.uuid = utils.uuid();
                opts.isCustom = true;
                // Now lets create a name for the element.  This would have been much easier if it were an array but alas we are stuck.
                let name = req.body.name.replace(/^[^a-zA-Z_$]|[^0-9a-zA-Z_$]/g, '_');
                if (name.length === 0) return Promise.reject(new ServiceParameterError(`An invalid name was specified ${req.body.name}`, 'PUT: /app/interfaces/add', 'name', req.body.name));
                if (name.charAt(0) >= '0' && name.charAt(0) <= '9') name = 'i' + name;
                let fnEnsureUnique = (name, ord?: number): string => {
                    let isUnique = true;
                    for (let fname in faces) {
                        if (fname === (typeof ord !== 'undefined' ? `${name}_${ord}` : name)) {
                            isUnique = false;
                            break;
                        }
                    }
                    if (!isUnique) name = fnEnsureUnique(name, typeof ord === 'undefined' ? 0 : ord++);
                    return typeof ord !== 'undefined' ? `${name}_${ord}` : name;
                }
                name = fnEnsureUnique(name);
                opts = extend(true, {}, opts, req.body);
                config.setSection(`web.interfaces.${name}`, opts);
                res.status(200).send({ id: name, opts: opts });
            } catch (err) { next(err); }
        });
        app.delete('/app/interface', async (req, res, next) => {
            try {
                let faces = config.getSection('web.interfaces');
                let deleted;
                for (let fname in faces) {
                    let iface = faces[fname];
                    if (typeof req.body.id !== 'undefined') {
                        if (fname === req.body.id) {
                            deleted = iface;
                            iface.enabled = false;
                            await webApp.updateServerInterface(iface);
                            config.removeSection(`web.interfaces.${fname}`);
                        }
                    }
                    else if (typeof req.body.uuid !== 'undefined') {
                        if (req.body.uuid.toLowerCase() === iface.uuid.toLowerCase()) {
                            deleted = iface;
                            iface.enabled = false;
                            await webApp.updateServerInterface(iface);
                            config.removeSection(`web.interfaces.${fname}`);
                        }
                    }
                }
                return res.status(200).send(deleted);
            } catch (err) { next(err); }
        });
        app.get('/app/options/interfaces', async (req, res, next) => {
            try {
                // todo: move bytevaluemaps out to a proper location; add additional definitions
                let opts = {
                    interfaces: config.getSection('web.interfaces'),
                    types: [
                        { name: 'rule', desc: 'Rule', hasBindings: true, hasUrl: false },
                        { name: 'rest', desc: 'Rest', hasBindings: true },
                        { name: 'http', desc: 'Http', hasBindings: true },
                        { name: 'rem', desc: 'Relay Equipment Manager', hasBindings: false },
                        { name: 'mqtt', desc: 'MQTT', hasBindings: true },
                        { name: 'influx', desc: 'InfluxDB', hasBindings: true },
                        { name: 'influxdb2', desc: 'InfluxDB2', hasBindings: true}
                    ],
                    protocols: [
                        { val: 0, name: 'http://', desc: 'http://' },
                        { val: 1, name: 'https://', desc: 'https://' },
                        { val: 2, name: 'mqtt://', desc: 'mqtt://' }
                    ],
                    files: []
                }
                // Read all the files in the custom bindings directory.
                let cpath = path.posix.join(process.cwd(), '/web/bindings/custom/');
                let files = fs.readdirSync(cpath);
                for (let i = 0; i < files.length; i++) {
                    if (path.extname(files[i]) === '.json') {
                        let bf = await BindingsFile.fromFile(path.posix.join(process.cwd(), 'web/bindings/'), `custom/${files[i]}`);
                        if (typeof bf !== 'undefined') opts.files.push(bf.options);
                    }
                }
                return res.status(200).send(opts);
            } catch (err) { next(err); }
        });
        app.post('/app/interfaceBindings/file', async (req, res, next) => {
            try {
                let file = multer({
                    limits: { fileSize: 1000000 },
                    storage: multer.memoryStorage()
                }).single('bindingsFile');
                file(req, res, async (err) => {
                    try {
                        if (err) { next(err); }
                        else {
                            // Validate the incoming data and save it off only if it is valid.
                            let bf = await BindingsFile.fromBuffer(req.file.originalname, req.file.buffer);
                            if (typeof bf === 'undefined') {
                                err = new ServiceProcessError(`Invalid bindings file: ${req.file.originalname}`, 'POST: app/bindings/file', 'extractBindingOptions');
                                next(err);
                            }
                            else {
                                if (fs.existsSync(bf.filePath))
                                    return next(new ServiceProcessError(`File already exists ${req.file.originalname}`, 'POST: app/bindings/file', 'writeFile'));
                                else {
                                    try {
                                        fs.writeFileSync(bf.filePath, req.file.buffer);
                                    } catch (e) { logger.error(`Error writing bindings file ${e.message}`); }
                                }
                                return res.status(200).send(bf);
                            }
                        }
                    } catch (e) {
                        err = new ServiceProcessError(`Error uploading file: ${e.message}`, 'POST: app/backup/file', 'uploadFile');
                        next(err);
                        logger.error(`File upload error: ${e.message}`);
                    }
                });
            } catch (err) { next(err); }
        });

    }
}
