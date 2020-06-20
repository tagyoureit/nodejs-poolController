import * as express from "express";
import { state, ICircuitState, LightGroupState } from "../../../controller/State";
import { sys } from "../../../controller/Equipment";
import { utils } from '../../../controller/Constants';
import { logger } from "../../../logger/Logger";

export class StateRoute {
    public static initRoutes(app: express.Application) {
        app.get('/state/chlorinator/:id', (req, res) => {
            res.status(200).send(state.chlorinators.getItemById(parseInt(req.params.id, 10)).get());
        });
        app.get('/state/circuit/:id', (req, res) => {
            res.status(200).send(state.circuits.getItemById(parseInt(req.params.id, 10)).get());
        });
        app.get('/state/pump/:id', (req, res) => {
            // todo: need getInterfaceById.get() for features
            let pump = state.pumps.getItemById(parseInt(req.params.id, 10));
            return res.status(200).send(pump.getExtended());
        });
        app.put('/state/circuit/setState', async (req, res, next) => {
            try {
                console.log(`request:  ${JSON.stringify(req.body)}... id: ${req.body.id}  state: ${req.body.state}`);
                //state.circuits.setCircuitState(parseInt(req.body.id, 10), utils.makeBool(req.body.state));
                let circuit = await sys.board.circuits.setCircuitStateAsync(parseInt(req.body.id, 10), utils.makeBool(req.body.state));
                return res.status(200).send((circuit as ICircuitState).get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/circuit/toggleState', async (req, res, next) => {
            try {
                let cstate = await state.circuits.toggleCircuitStateAsync(parseInt(req.body.id, 10));
                return res.status(200).send(cstate);
            }
            catch (err) {next(err);}
        });    
        app.put('/state/circuit/setTheme', async (req, res, next) => {
           try {
               let theme = await state.circuits.setLightThemeAsync(parseInt(req.body.id, 10), parseInt(req.body.theme, 10));
               return res.status(200).send(theme);
            } 
            catch (err) { next(err); }
        }); 
/*         app.put('/state/intellibrite/setTheme', (req, res) => {
            let id = sys.board.equipmentIds.circuitGroups.start; 
            if (typeof req.body.theme !== 'undefined') id = parseInt(req.body.id, 10);
            sys.board.circuits.setLightGroupThemeAsync(id ,parseInt(req.body.theme, 10));
            return res.status(200).send('OK');
        }); */
        app.put('/state/circuit/setDimmerLevel', (req, res) => {
            state.circuits.setDimmerLevel(parseInt(req.body.id, 10), parseInt(req.body.level, 10));
            return res.status(200).send('OK');
        });
        app.put('/state/feature/setState', async (req, res, next) => {
            try {
                await state.features.setFeatureStateAsync(req.body.id, req.body.state);
                return res.status(200).send('OK');
            }
            catch (err){ next(err); }
        });
        app.put('/state/body/heatMode', (req, res, next) => {
            // todo: is body 0/1 as in the bodies object or should we also be able to reference this by circuit; 1=spa; 6=pool, etc.
            let mode = parseInt(req.body.mode, 10);
            if (isNaN(mode)) {
                // The user sent us a text based name.
                let val = sys.board.valueMaps.heatModes.transformByName(req.body.mode);
                if (typeof val.val === 'undefined') {
                    return next(new Error(`Invalid value for heatMode: ${req.body.mode}`));
                }
                mode = val.val;
            }
            sys.bodies.setHeatModeAsync(parseInt(req.body.id, 10), mode);
            return res.status(200).send('OK');
        });
        app.put('/state/body/setPoint', (req, res) => {
             // todo: is body 0/1 as in the bodies object or should we also be able to reference this by circuit; 1=spa; 6=pool, etc.
            sys.bodies.setHeatSetpointAsync(parseInt(req.body.id, 10), parseInt(req.body.setPoint, 10));
            return res.status(200).send('OK');
        });
        app.put('/state/chlorinator/setChlor', (req, res) => {
            state.chlorinators.setChlor(parseInt(req.body.id, 10), parseInt(req.body.poolSetpoint, 10), parseInt(req.body.spaSetpoint, 10) || 0, parseInt(req.body.superChlorHours, 10) || 0);
            // if (sys.chlorinators.getItemById(1).isVirtual) sys.board.virtualChlorinatorController.start();
            return res.status(200).send('OK');
        });
        app.put('/state/chlorinator/poolSetpoint', (req, res) => {
            state.chlorinators.setPoolSetpoint(parseInt(req.body.id, 10), parseInt(req.body.setPoint, 10));
            return res.status(200).send('OK');
        });
        app.put('/state/chlorinator/spaSetpoint', (req, res) => {
            state.chlorinators.setSpaSetpoint(parseInt(req.body.id, 10), parseInt(req.body.setPoint, 10));
            return res.status(200).send('OK');
        });
        app.put('/state/chlorinator/superChlorHours', (req, res) => {
            state.chlorinators.setSuperChlorHours(parseInt(req.body.id, 10), parseInt(req.body.hours, 10));
            return res.status(200).send('OK');
        });
        app.put('/state/chlorinator/superChlorinate', (req, res) => {
            state.chlorinators.superChlorinate(parseInt(req.body.id, 10), req.body.superChlorinate);
            return res.status(200).send('OK');
        });
        app.put('/state/cancelDelay', (req, res) => {
            state.equipment.cancelDelay();
            return res.status(200).send('OK');
        });
        app.put('/state/lightGroup/:id/colorSync', async (req, res, next) => {
            try {
                let sgroup = await sys.board.circuits.sequenceLightGroupAsync(parseInt(req.params.id, 10), 'sync');
                return res.status(200).send(sgroup.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/lightGroup/:id/colorSet', async (req, res, next) => {
            try {
                let sgroup = await sys.board.circuits.sequenceLightGroupAsync(parseInt(req.params.id, 10), 'set');
                return res.status(200).send(sgroup.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/lightGroup/:id/colorSwim', async (req, res, next) => {
            try {
                let sgroup = await sys.board.circuits.sequenceLightGroupAsync(parseInt(req.params.id, 10), 'swim');
                return res.status(200).send(sgroup.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/chemController', async (req, res, next) => {
            try {
                let chem = await state.chemControllers.setChemControllerAsync(req.body);
                return res.status(200).send(chem.get(true));
            }
            catch (err) { next(err); }
        });
/*         app.put('/state/intellibrite/colorSync', (req, res) => {
            sys.board.circuits.sequenceIntelliBrite('sync');
            return res.status(200).send('OK');
        });
        app.put('/state/intellibrite/colorSet', (req, res) => {
            sys.board.circuits.sequenceIntelliBrite('set');
            return res.status(200).send('OK');
        });
        app.put('/state/intellibrite/colorSwim', (req, res) => {
            sys.board.circuits.sequenceIntelliBrite('swim');
            return res.status(200).send('OK');
        }); */
        app.get('/state/:section', (req, res) => {
            res.status(200).send(state.getState(req.params.section));
        });
    }
}