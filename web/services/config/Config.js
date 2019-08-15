"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Equipment_1 = require("../../../controller/Equipment");
class ConfigRoute {
    static initRoutes(app) {
        app.get('/config/:section', (req, res) => {
            return res.status(200).send(Equipment_1.sys.getSection(req.params.section));
        });
        app.get('/config/body/:body/heatModes', (req, res) => {
            return res.status(200).send(Equipment_1.sys.bodies.getItemById(parseInt(req.params.body, 10)).getHeatModes());
        });
        app.get('/config/circuit/:id/lightThemes', (req, res) => {
            return res.status(200).send(Equipment_1.sys.circuits.getItemById(parseInt(req.params.id, 10)).getLightThemes());
        });
        app.get('/config/chlorinator/:id', (req, res) => {
            return res.status(200).send(Equipment_1.sys.chlorinators.getItemById(parseInt(req.params.id, 10)).get());
        });
        app.get('/config/pump/:id/circuits', (req, res) => {
            return res.status(200).send(Equipment_1.sys.pumps.getItemById(parseInt(req.params.id, 10)).get().circuits);
        });
        app.put('/config/pump/circuitRate', (req, res) => {
            let pump = Equipment_1.sys.pumps.getItemById(parseInt(req.body.id, 10));
            pump.setCircuitRate(parseInt(req.body.circuitId, 10), parseInt(req.body.rate, 10));
            return res.status(200).send('OK');
        });
        app.put('/config/schedule', (req, res) => {
            let schedId = parseInt(req.body.id || '0', 10);
            let sched = Equipment_1.sys.schedules.getItemById(schedId < 1 ? Equipment_1.sys.schedules.length + 1 : schedId, true);
            return res.status(200).send('OK');
        });
    }
}
exports.ConfigRoute = ConfigRoute;
//# sourceMappingURL=Config.js.map