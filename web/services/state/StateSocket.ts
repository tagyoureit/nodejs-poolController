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
import { state, ICircuitState, LightGroupState } from "../../../controller/State";
import { sys } from "../../../controller/Equipment";
import { utils } from '../../../controller/Constants';
import { logger } from "../../../logger/Logger";
import { ServiceParameterError } from "../../../controller/Errors";

export class StateSocket {
    public static initSockets(sock: SocketIO.Socket) {
        sock.on('/state/circuit/toggleState', async (data: any) => {
            try {
                data = JSON.parse(data);
                await state.circuits.toggleCircuitStateAsync(parseInt(data.id, 10));
                // return res.status(200).send(cstate);
            }
            catch (err) {logger.error(err);}
        });  
        sock.on('/state/body/heatMode', async (data: any) => {
            // RKS: 06-24-20 -- Changed this so that users can send in the body id, circuit id, or the name.
            try {
                data = JSON.parse(data);
                // Map the mode that was passed in.  This should accept the text based name or the ordinal id value.
                let mode = parseInt(data.mode, 10);
                let val;
                if (isNaN(mode)) mode = parseInt(data.heatMode, 10);
                if (!isNaN(mode)) val = sys.board.valueMaps.heatModes.transform(mode);
                else val = sys.board.valueMaps.heatModes.transformByName(data.mode || data.heatMode);
                if (typeof val.val === 'undefined') {
                    logger.error(new ServiceParameterError(`Invalid value for heatMode: ${data.mode}`, 'body', 'heatMode', mode));
                    return;
                }
                mode = val.val;
                let body = sys.bodies.findByObject(data);
                if (typeof body === 'undefined') {
                    logger.error(new ServiceParameterError(`Cannot set body heatMode.  You must supply a valid id, circuit, name, or type for the body`, 'body', 'id', data.id));
                    return;
                }
                await sys.board.bodies.setHeatModeAsync(body, mode);
                // return res.status(200).send(tbody);
            } catch (err) { logger.error(err); }
        });
        sock.on('/state/body/setPoint', async (data: any) => {
            // RKS: 06-24-20 -- Changed this so that users can send in the body id, circuit id, or the name.
            try {
                data = JSON.parse(data);
                let body = sys.bodies.findByObject(data);
                if (typeof body === 'undefined') {
                    logger.error(new ServiceParameterError(`Cannot set body setPoint.  You must supply a valid id, circuit, name, or type for the body`, 'body', 'id', data.id));
                    return;
                }
                await sys.board.bodies.setHeatSetpointAsync(body, parseInt(data.setPoint, 10));
                // return res.status(200).send(tbody);
            } catch (err) { logger.error(err); }
        });
        

        /*
        app.get('/state/chemController/:id', (req, res) => {
            res.status(200).send(state.chemControllers.getItemById(parseInt(req.params.id, 10)).getExtended());
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
  
        app.put('/state/circuit/setTheme', async (req, res, next) => {
           try {
               let theme = await state.circuits.setLightThemeAsync(parseInt(req.body.id, 10), parseInt(req.body.theme, 10));
               return res.status(200).send(theme);
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
        */
    }
}