import * as express from "express";
import { sys } from "../../../controller/Equipment";
import { read } from "fs";
export class ConfigRoute {
    public static initRoutes(app: express.Application) {
        app.get('/config/:section', (req, res) => {
            return res.status(200).send(sys.getSection(req.params.section));
        });
        app.get('/config/body/:body/heatModes', (req, res) => {
            return res.status(200).send(sys.bodies.getItemById(parseInt(req.params.body, 10)).getHeatModes());
        });
        app.get('/config/circuit/:id/lightThemes', (req, res) => {
            return res.status(200).send(sys.circuits.getItemById(parseInt(req.params.id, 10)).getLightThemes());
        });
        app.get('/config/chlorinator/:id', (req, res) => {
            return res.status(200).send(sys.chlorinators.getItemById(parseInt(req.params.id, 10)).get());
        });
        app.get('/config/pump/:id/circuits', (req, res) => {
            return res.status(200).send(sys.pumps.getItemById(parseInt(req.params.id, 10)).get().circuits);
        });
        app.put('/config/pump/circuitRate', (req, res) => {
            let pump = sys.pumps.getItemById(parseInt(req.body.id, 10));
            pump.setCircuitRate(parseInt(req.body.circuitId, 10), parseInt(req.body.rate, 10));
            return res.status(200).send('OK');
        });
        app.put('/config/schedule', (req, res) => {
            let schedId = parseInt(req.body.id || '0', 10);
            let sched = sys.schedules.getItemById(schedId < 1 ? sys.schedules.length + 1 : schedId, true);
            //sched.set(JSON.parse(req.body));
            return res.status(200).send('OK');
        });
    }
}