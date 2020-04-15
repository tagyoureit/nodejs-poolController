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
            extend(true, cfg, st);
            return res.status(200).send(cfg);
        });
    }
}