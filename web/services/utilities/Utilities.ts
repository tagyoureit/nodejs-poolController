import * as express from 'express';
import { SsdpServer} from '../../Server';
export class UtilitiesRoute {

    public static initRoutes(app: express.Application) {
        app.get('/device', function(req, res) {
            // there's got to be a better way to get this than instantiating SsdpServer() again.
            let ssdp = new SsdpServer();
            let xml = ssdp.deviceXML();
            res.status(200).set('Content-Type', 'text/xml').send(xml);
        });
    }
}