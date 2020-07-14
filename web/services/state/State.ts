import * as express from "express";
import { state, ICircuitState, LightGroupState } from "../../../controller/State";
import { sys } from "../../../controller/Equipment";
import { utils } from '../../../controller/Constants';
import { logger } from "../../../logger/Logger";
import { ServiceParameterError } from "../../../controller/Errors";

export class StateRoute {
    public static initRoutes(app: express.Application) {
        app.get('/state/chemController/:id', (req, res) => {
            res.status(200).send(state.chemControllers.getItemById(parseInt(req.params.id, 10)).getExtended());
        });
        app.put('/state/chemController', async (req, res, next) => {
            try {
                let chem = await sys.board.chemControllers.setChemControllerAsync(req.body);
                return res.status(200).send(state.chemControllers.getItemById(chem.id).getExtended());
            }
            catch (err) { next(err); }
        });

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
        app.put('/state/temps', async (req, res, next) => {
            try {
                let controller = await sys.board.system.setTempsAsync(req.body);
                return res.status(200).send(controller.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/circuit/setDimmerLevel', async (req, res, next) => {
            try {
                let circuit = await sys.board.circuits.setDimmerLevelAsync(parseInt(req.body.id, 10), parseInt(req.body.level, 10));
                return res.status(200).send(circuit);
            }
            catch (err) { next(err); }
        });
        app.put('/state/feature/setState', async (req, res, next) => {
            try {
                await state.features.setFeatureStateAsync(req.body.id, req.body.state);
                return res.status(200).send('OK');
            }
            catch (err){ next(err); }
        });
        app.put('/state/body/heatMode', async (req, res, next) => {
            // RKS: 06-24-20 -- Changed this so that users can send in the body id, circuit id, or the name.
            try {
                // Map the mode that was passed in.  This should accept the text based name or the ordinal id value.
                let mode = parseInt(req.body.mode, 10);
                let val;
                if (isNaN(mode)) mode = parseInt(req.body.heatMode, 10);
                if (!isNaN(mode)) val = sys.board.valueMaps.heatModes.transform(mode);
                else val = sys.board.valueMaps.heatModes.transformByName(req.body.mode || req.body.heatMode);
                if (typeof val.val === 'undefined') {
                    return next(new ServiceParameterError(`Invalid value for heatMode: ${req.body.mode}`, 'body', 'heatMode', mode));
                }
                mode = val.val;
                let body = sys.bodies.findByObject(req.body);
                if (typeof body === 'undefined') return next(new ServiceParameterError(`Cannot set body heatMode.  You must supply a valid id, circuit, name, or type for the body`, 'body', 'id', req.body.id));
                let tbody = await sys.board.bodies.setHeatModeAsync(body, mode);
                return res.status(200).send(tbody);
            } catch (err) { next(err); }
        });
        app.put('/state/body/setPoint', async (req, res, next) => {
            // RKS: 06-24-20 -- Changed this so that users can send in the body id, circuit id, or the name.
            try {
                let body = sys.bodies.findByObject(req.body);
                if (typeof body === 'undefined') return next(new ServiceParameterError(`Cannot set body setPoint.  You must supply a valid id, circuit, name, or type for the body`, 'body', 'id', req.body.id));
                let tbody = await sys.board.bodies.setHeatSetpointAsync(body, parseInt(req.body.setPoint, 10));
                return res.status(200).send(tbody);
            } catch (err) { next(err); }
        });
        app.put('/state/chlorinator/setChlor', async (req, res, next) => {
            try {
                let chlor = await sys.board.chlorinator.setChlorAsync(req.body);
                return res.status(200).send(chlor);
            } catch (err) { next(err); }
        });
        app.put('/state/chlorinator/poolSetpoint', async (req, res, next) => {
            try {
                let obj = { id: req.body.id, poolSetpoint: parseInt(req.body.setPoint, 10) }
                let chlor = await sys.board.chlorinator.setChlorAsync(obj);
                return res.status(200).send(chlor);
            }
            catch (err) { next(err); }
        });
        app.put('/state/chlorinator/spaSetpoint', async (req, res, next) => {
            try {
                let obj = { id: req.body.id, spaSetpoint: parseInt(req.body.setPoint, 10) }
                let chlor = await sys.board.chlorinator.setChlorAsync(obj);
                return res.status(200).send(chlor);
            }
            catch (err) { next(err); }
        });
        app.put('/state/chlorinator/superChlorHours', async (req, res, next) => {
            try {
                let obj = { id: req.body.id, superChlorHours: parseInt(req.body.hours, 10) }
                let chlor = await sys.board.chlorinator.setChlorAsync(obj);
                return res.status(200).send(chlor);
            }
            catch (err) { next(err); }
        });
        app.put('/state/chlorinator/superChlorinate', async (req, res, next) => {
            try {
                let obj = { id: req.body.id, superChlorinate: utils.makeBool(req.body.superChlorinate) }
                let chlor = await sys.board.chlorinator.setChlorAsync(obj);
                return res.status(200).send(chlor);
            }
            catch (err) { next(err); }
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
        app.get('/state/:section', (req, res) => {
            res.status(200).send(state.getState(req.params.section));
        });
    }
}