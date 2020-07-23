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
import * as express from 'express';
import { SsdpServer} from '../../Server';
import { state } from "../../../controller/State";
import { sys } from "../../../controller/Equipment";

const extend = require("extend");
export class UtilitiesRoute {

    public static initRoutes(app: express.Application) {
        app.get('/device', function(req, res) {
            // there's got to be a better way to get this than instantiating SsdpServer() again.
            let ssdp = new SsdpServer();
            let xml = ssdp.deviceXML();
            res.status(200).set('Content-Type', 'text/xml').send(xml);
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
    }
}