import * as express from "express";
import { state } from "../../../controller/State";
import { sys, Circuit } from "../../../controller/Equipment";
import { Enums } from '../../../controller/Constants';
export class UtilitiesRoute {
    public static initRoutes(app: express.Application) {
       
        app.put('/state/circuit/setTheme', (req, res) => {
            state.circuits.setCircuitTheme(parseInt(req.body.id, 10), parseInt(req.body.theme, 10));
            return res.status(200).send('OK');
        });

    }
}