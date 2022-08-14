/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com

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
import * as express from "express";
import * as extend from "extend";

import { state, ICircuitState, LightGroupState, ICircuitGroupState, ChemicalDoseState } from "../../../controller/State";
import { sys } from "../../../controller/Equipment";
import { utils } from '../../../controller/Constants';
import { logger } from "../../../logger/Logger";
import { DataLogger } from "../../../logger/DataLogger";

import { ServiceParameterError } from "../../../controller/Errors";

export class StateRoute {
    public static initRoutes(app: express.Application) {
        app.get('/state/chemController/:id', (req, res) => {
            res.status(200).send(state.chemControllers.getItemById(parseInt(req.params.id, 10)).getExtended());
        });
        app.get('/state/chemDoser/:id', (req, res) => {
            res.status(200).send(state.chemDosers.getItemById(parseInt(req.params.id, 10)).getExtended());
        });
        app.put('/state/chemController', async (req, res, next) => {
            try {
                let schem = await sys.board.chemControllers.setChemControllerStateAsync(req.body);
                return res.status(200).send(schem.getExtended());
            }
            catch (err) { next(err); }
        });
        app.put('/state/chemDoser', async (req, res, next) => {
            try {
                let schem = await sys.board.chemDosers.setChemDoserStateAsync(req.body);
                return res.status(200).send(schem.getExtended());
            }
            catch (err) { next(err); }
        });
        app.put('/state/chemController/manualDose', async (req, res, next) => {
            try {
                let schem = await sys.board.chemControllers.manualDoseAsync(req.body);
                return res.status(200).send(schem.getExtended());
            }
            catch (err) { next(err); }
        });
        app.put('/state/chemDoser/manualDose', async (req, res, next) => {
            try {
                let schem = await sys.board.chemDosers.manualDoseAsync(req.body);
                return res.status(200).send(schem.getExtended());
            }
            catch (err) { next(err); }
        });

        app.put('/state/chemController/manualMix', async (req, res, next) => {
            try {
                logger.debug(`Starting manual mix`);
                let schem = await sys.board.chemControllers.manualMixAsync(req.body);
                logger.debug(`Started manual mix`);
                return res.status(200).send(schem.getExtended());
            }
            catch (err) { next(err); }
        });
        app.put('/state/chemDoser/manualMix', async (req, res, next) => {
            try {
                let schem = await sys.board.chemDosers.manualMixAsync(req.body);
                return res.status(200).send(schem.getExtended());
            }
            catch (err) { next(err); }
        });
        app.get('/state/chemController/:id/doseHistory', (req, res) => {
            let schem = state.chemControllers.getItemById(parseInt(req.params.id));
            let hist = { ph: [], orp: [] };
            for (let i = 0; i < schem.ph.doseHistory.length; i++)
                hist.ph.push(schem.ph.doseHistory[i]);
            for (let i = 0; i < schem.orp.doseHistory.length; i++)
                hist.orp.push(schem.orp.doseHistory[i]);
            return res.status(200).send(hist);
        });
        app.get('/state/chemDoser/:id/doseHistory', (req, res) => {
            let schem = state.chemDosers.getItemById(parseInt(req.params.id));
            return res.status(200).send(schem.doseHistory);
        });

        app.put('/state/chemController/:id/doseHistory/orp/clear', async (req, res, next) => {
            try {
                let schem = state.chemControllers.getItemById(parseInt(req.params.id));
                schem.orp.doseHistory = [];
                schem.orp.calcDoseHistory();
                return res.status(200).send(schem.orp.doseHistory);
            }
            catch (err) { next(err); }
        });
        app.put('/state/chemDoser/:id/doseHistory/clear', async (req, res, next) => {
            try {
                let schem = state.chemDosers.getItemById(parseInt(req.params.id));
                schem.doseHistory = [];
                schem.calcDoseHistory();
                return res.status(200).send(schem.doseHistory);
            }
            catch (err) { next(err); }
        });

        app.put('/state/chemController/:id/doseHistory/ph/clear', async (req, res, next) => {
            try {
                let schem = state.chemControllers.getItemById(parseInt(req.params.id));
                schem.ph.doseHistory = [];
                schem.ph.calcDoseHistory();
                return res.status(200).send(schem.ph.doseHistory);
            }
            catch (err) { next(err); }

        });
        app.get('/state/chemController/:id/doseLog/ph', async (req, res, next) => {
            try {
                let schem = state.chemControllers.getItemById(parseInt(req.params.id));
                let filter = req.body || {};
                let dh = await DataLogger.readFromEndAsync(`chemDosage_${schem.ph.chemType}.log`, ChemicalDoseState, (lineNumber: number, entry: ChemicalDoseState, arr: ChemicalDoseState[]): boolean => {
                    if (entry.id !== schem.id) return false;
                    if (typeof filter.lines !== 'undefined' && filter.lines <= arr.length) return false;
                    if (typeof filter.date !== 'undefined' && entry.end < filter.date) return false;
                    return true;
                });
                return res.status(200).send(dh);
            }
            catch (err) { next(err); }
        });
        app.get('/state/chemDoser/:id/doseLog', async (req, res, next) => {
            try {
                let schem = state.chemDosers.getItemById(parseInt(req.params.id));
                let filter = req.body || {};
                let dh = await DataLogger.readFromEndAsync(`chemDosage_Peristalic.log`, ChemicalDoseState, (lineNumber: number, entry: ChemicalDoseState, arr: ChemicalDoseState[]): boolean => {
                    if (entry.id !== schem.id) return false;
                    if (typeof filter.lines !== 'undefined' && filter.lines <= arr.length) return false;
                    if (typeof filter.date !== 'undefined' && entry.end < filter.date) return false;
                    return true;
                });
                return res.status(200).send(dh);
            }
            catch (err) { next(err); }
        });

        app.search('/state/chemController/:id/doseLog/ph', async (req, res, next) => {
            try {
                let schem = state.chemControllers.getItemById(parseInt(req.params.id));
                let filter = req.body || {};
                let dh = DataLogger.readFromEnd(`chemDosage_${schem.ph.chemType}.log`, ChemicalDoseState, (lineNumber: number, entry: ChemicalDoseState, arr: ChemicalDoseState[]): boolean => {
                    if (entry.id !== schem.id) return;
                    if (typeof filter.lines !== 'undefined' && filter.lines <= arr.length) return false;
                    if (typeof filter.date !== 'undefined' && entry.end < filter.date) return false;
                    return true;
                });
                return res.status(200).send(dh);
            }
            catch (err) { next(err); }
        });
        app.get('/state/chemController/:id/doseLog/orp', async (req, res, next) => {
            try {
                let schem = state.chemControllers.getItemById(parseInt(req.params.id));
                let filter = req.body || {};
                let dh = await DataLogger.readFromEndAsync(`chemDosage_orp.log`, ChemicalDoseState, (lineNumber: number, entry: ChemicalDoseState, arr: ChemicalDoseState[]): boolean => {
                    if (entry.id !== schem.id) return false;
                    if (typeof filter.lines !== 'undefined' && filter.lines <= arr.length) return false;
                    if (typeof filter.date !== 'undefined' && entry.end < filter.date) return false;
                    return true;
                });
                return res.status(200).send(dh);
            }
            catch (err) { next(err); }
        });
        app.search('/state/chemController/:id/doseLog/orp', async (req, res, next) => {
            try {
                let schem = state.chemControllers.getItemById(parseInt(req.params.id));
                let filter = req.body || {};
                let dh = DataLogger.readFromEnd(`chemDosage_orp.log`, ChemicalDoseState, (lineNumber: number, entry: ChemicalDoseState, arr: ChemicalDoseState[]): boolean => {
                    if (entry.id !== schem.id) return;
                    if (typeof filter.lines !== 'undefined' && filter.lines <= arr.length) return false;
                    if (typeof filter.date !== 'undefined' && entry.end < filter.date) return false;
                    return true;
                });
                return res.status(200).send(dh);
            }
            catch (err) { next(err); }
        });
        app.put('/state/chemController/cancelDosing', async (req, res, next) => {
            try {
                let schem = await sys.board.chemControllers.cancelDosingAsync(req.body);
                return res.status(200).send(schem.getExtended());
            }
            catch (err) { next(err); }
        });
        app.put('/state/chemDoser/cancelDosing', async (req, res, next) => {
            try {
                let schem = await sys.board.chemDosers.cancelDosingAsync(req.body);
                return res.status(200).send(schem.getExtended());
            }
            catch (err) { next(err); }
        });
        app.put('/state/chemController/cancelMixing', async (req, res, next) => {
            try {
                let schem = await sys.board.chemControllers.cancelMixingAsync(req.body);
                return res.status(200).send(schem.getExtended());
            }
            catch (err) { next(err); }
        });
        app.put('/state/chemDoser/cancelMixing', async (req, res, next) => {
            try {
                let schem = await sys.board.chemDosers.cancelMixingAsync(req.body);
                return res.status(200).send(schem.getExtended());
            }
            catch (err) { next(err); }
        });

        app.get('/state/chlorinator/:id', (req, res) => {
            res.status(200).send(state.chlorinators.getItemById(parseInt(req.params.id, 10), false).getExtended());
        });
        app.get('/state/circuit/:id', (req, res) => {
            res.status(200).send(state.circuits.getItemById(parseInt(req.params.id, 10)).get());
        });
        app.get('/state/feature/:id', (req, res) => {
            res.status(200).send(state.features.getItemById(parseInt(req.params.id, 10)).get());
        });
        app.get('/state/schedule/:id', (req, res) => {
            res.status(200).send(state.schedules.getItemById(parseInt(req.params.id, 10)).get());
        });
        app.get('/state/circuitGroup/:id', (req, res) => {
            res.status(200).send(state.circuitGroups.getItemById(parseInt(req.params.id, 10)).get());
        });

        app.get('/state/pump/:id', (req, res) => {
            // todo: need getInterfaceById.get() for features
            let pump = state.pumps.getItemById(parseInt(req.params.id, 10));
            return res.status(200).send(pump.getExtended());
        });
        app.put('/state/circuit/setState', async (req, res, next) => {
            try {
                // Do some work to allow the legacy state calls to work.  For some reason the state value is generic while all of the
                // circuits are actually binary states.  While this may need to change in the future it seems like a distant plan
                // that circuits would have more than 2 states.  Not true for other equipment but certainly true for individual circuits/features/groups.
                let isOn = utils.makeBool(typeof req.body.isOn !== 'undefined' ? req.body.isOn : req.body.state);
                //state.circuits.setCircuitState(parseInt(req.body.id, 10), utils.makeBool(req.body.state));
                let cstate = await sys.board.circuits.setCircuitStateAsync(parseInt(req.body.id, 10), isOn);
                return res.status(200).send(cstate.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/circuitGroup/setState', async (req, res, next) => {
            console.log(`request:  ${JSON.stringify(req.body)}... id: ${req.body.id}  state: ${req.body.state} isOn: ${req.body.isOn}`);
            let isOn = utils.makeBool(typeof req.body.isOn !== 'undefined' ? req.body.isOn : req.body.state);
            let cstate = await sys.board.circuits.setCircuitGroupStateAsync(parseInt(req.body.id, 10), isOn);
            return res.status(200).send(cstate.get(true));
        });
        app.put('/state/lightGroup/setState', async (req, res, next) => {
            console.log(`request:  ${JSON.stringify(req.body)}... id: ${req.body.id}  state: ${req.body.state} isOn: ${req.body.isOn}`);
            let isOn = utils.makeBool(typeof req.body.isOn !== 'undefined' ? req.body.isOn : req.body.state);
            let cstate = await sys.board.circuits.setLightGroupStateAsync(parseInt(req.body.id, 10), isOn);
            return res.status(200).send(cstate.get(true));
        });
        app.put('/state/circuit/toggleState', async (req, res, next) => {
            try {
                let cstate = await sys.board.circuits.toggleCircuitStateAsync(parseInt(req.body.id, 10));
                return res.status(200).send(cstate.get(true));
            }
            catch (err) {next(err);}
        });    
        app.put('/state/feature/toggleState', async (req, res, next) => {
            try {
                let fstate = await sys.board.features.toggleFeatureStateAsync(parseInt(req.body.id, 10));
                return res.status(200).send(fstate.get(true));
            }
            catch (err) {next(err);}
        });    
        app.put('/state/circuit/setTheme', async (req, res, next) => {
            try {
                let theme = await state.circuits.setLightThemeAsync(parseInt(req.body.id, 10), sys.board.valueMaps.lightThemes.encode(req.body.theme));
               return res.status(200).send(theme.get(true));
            } 
            catch (err) { next(err); }
        });
        app.put('/state/light/setTheme', async (req, res, next) => {
            try {
                let theme = await state.circuits.setLightThemeAsync(parseInt(req.body.id, 10), sys.board.valueMaps.lightThemes.encode(req.body.theme));
                return res.status(200).send(theme.get(true));
            }
            catch (err) { next(err); }
        });

        app.put('/state/light/runCommand', async (req, res, next) => {
            try {
                let slight = await sys.board.circuits.runLightCommandAsync(req.body);
                return res.status(200).send(slight.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/light/:id/colorSync', async (req, res, next) => {
            try {
                let slight = await sys.board.circuits.runLightCommandAsync({ id: parseInt(req.params.id, 10), command: 'colorsync' });
                return res.status(200).send(slight.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/light/:id/colorHold', async (req, res, next) => {
            try {
                let slight = await sys.board.circuits.runLightCommandAsync({ id: parseInt(req.params.id, 10), command: 'colorhold' });
                return res.status(200).send(slight.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/light/:id/colorRecall', async (req, res, next) => {
            try {
                let slight = await sys.board.circuits.runLightCommandAsync({ id: parseInt(req.params.id, 10), command: 'colorecall' });
                return res.status(200).send(slight.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/light/:id/lightThumper', async (req, res, next) => {
            try {
                let slight = await sys.board.circuits.runLightCommandAsync({ id: parseInt(req.params.id, 10), command: 'lightthumper' });
                return res.status(200).send(slight.get(true));
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
                let cstate = await sys.board.circuits.setDimmerLevelAsync(parseInt(req.body.id, 10), parseInt(req.body.level, 10));
                return res.status(200).send(cstate.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/feature/setState', async (req, res, next) => {
            try {
                let isOn = utils.makeBool(typeof req.body.isOn !== 'undefined' ? req.body.isOn : req.body.state);
                let fstate = await state.features.setFeatureStateAsync(req.body.id, isOn);
                return res.status(200).send(fstate.get(true));
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
                return res.status(200).send(tbody.get(true));
            } catch (err) { next(err); }
        });
        app.put('/state/body/setPoint', async (req, res, next) => {
            // RKS: 06-24-20 -- Changed this so that users can send in the body id, circuit id, or the name.
            // RKS: 05-14-21 -- Added cooling setpoints for the body.
            try {
                let body = sys.bodies.findByObject(req.body);
                if (typeof body === 'undefined') return next(new ServiceParameterError(`Cannot set body setPoint.  You must supply a valid id, circuit, name, or type for the body`, 'body', 'id', req.body.id));
                if (typeof req.body.coolSetpoint !== 'undefined' && !isNaN(parseInt(req.body.coolSetpoint, 10)))
                    await sys.board.bodies.setCoolSetpointAsync(body, parseInt(req.body.coolSetpoint, 10));
                if (typeof req.body.heatSetpoint !== 'undefined' && !isNaN(parseInt(req.body.heatSetpoint, 10)))
                    await sys.board.bodies.setHeatSetpointAsync(body, parseInt(req.body.heatSetpoint, 10));
                else if (typeof req.body.setPoint !== 'undefined' && !isNaN(parseInt(req.body.setPoint, 10)))
                    await sys.board.bodies.setHeatSetpointAsync(body, parseInt(req.body.setpoint, 10));
                let tbody = state.temps.bodies.getItemById(body.id);
                return res.status(200).send(tbody.get(true));
            } catch (err) { next(err); }
        });
        app.put('/state/chlorinator', async (req, res, next) => {
            try {
                let schlor = await sys.board.chlorinator.setChlorAsync(req.body);
                return res.status(200).send(schlor.get(true));
            } catch (err) { next(err); }
        });
        // this ../setChlor should really be EOL for PUT /state/chlorinator above
        app.put('/state/chlorinator/setChlor', async (req, res, next) => {
            try {
                let schlor = await sys.board.chlorinator.setChlorAsync(req.body);
                return res.status(200).send(schlor.get(true));
            } catch (err) { next(err); }
        });
        app.put('/state/chlorinator/poolSetpoint', async (req, res, next) => {
            try {
                let obj = { id: req.body.id, poolSetpoint: parseInt(req.body.setPoint, 10) }
                let schlor = await sys.board.chlorinator.setChlorAsync(obj);
                return res.status(200).send(schlor.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/chlorinator/spaSetpoint', async (req, res, next) => {
            try {
                let obj = { id: req.body.id, spaSetpoint: parseInt(req.body.setPoint, 10) }
                let schlor = await sys.board.chlorinator.setChlorAsync(obj);
                return res.status(200).send(schlor.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/chlorinator/superChlorHours', async (req, res, next) => {
            try {
                let obj = { id: req.body.id, superChlorHours: parseInt(req.body.hours, 10) }
                let schlor = await sys.board.chlorinator.setChlorAsync(obj);
                return res.status(200).send(schlor.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/chlorinator/superChlorinate', async (req, res, next) => {
            try {
                let obj = { id: req.body.id, superChlorinate: utils.makeBool(req.body.superChlorinate) }
                let schlor = await sys.board.chlorinator.setChlorAsync(obj);
                return res.status(200).send(schlor.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/cancelDelay', async (req, res, next) => {
            try {
                let delay = await sys.board.system.cancelDelay();
                return res.status(200).send(delay);
            }
            catch (err) { next(err); }
        });
        app.put('/state/manualOperationPriority', async (req, res, next) => {
            try {
                let cstate = await sys.board.system.setManualOperationPriority(parseInt(req.body.id, 10));
                return res.status(200).send(cstate.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/lightGroup/runCommand', async (req, res, next) => {
            try {
                let sgroup = await sys.board.circuits.runLightGroupCommandAsync(req.body);
                return res.status(200).send(sgroup.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/lightGroup/:id/colorSync', async (req, res, next) => {
            try {
                let sgroup = await sys.board.circuits.sequenceLightGroupAsync(parseInt(req.params.id, 10), 'colorsync');
                return res.status(200).send(sgroup.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/lightGroup/:id/colorSet', async (req, res, next) => {
            try {
                let sgroup = await sys.board.circuits.sequenceLightGroupAsync(parseInt(req.params.id, 10), 'colorset');
                return res.status(200).send(sgroup.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/lightGroup/:id/colorSwim', async (req, res, next) => {
            try {
                let sgroup = await sys.board.circuits.sequenceLightGroupAsync(parseInt(req.params.id, 10), 'colorswim');
                return res.status(200).send(sgroup.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/lightGroup/:id/colorHold', async (req, res, next) => {
            try {
                let sgroup = await sys.board.circuits.runLightGroupCommandAsync({ id: parseInt(req.params.id, 10), command: 'colorhold' });
                return res.status(200).send(sgroup.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/lightGroup/:id/colorRecall', async (req, res, next) => {
            try {
                let sgroup = await sys.board.circuits.runLightGroupCommandAsync({ id: parseInt(req.params.id, 10), command: 'colorrecall' });
                return res.status(200).send(sgroup.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/lightGroup/:id/lightThumper', async (req, res, next) => {
            try {
                let sgroup = await sys.board.circuits.runLightGroupCommandAsync({ id: parseInt(req.params.id, 10), command: 'lightthumper' });
                return res.status(200).send(sgroup.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/state/panelMode', async (req, res, next) => {
            try {
                await sys.board.system.setPanelModeAsync(req.body);
                return res.status(200).send(state.controllerState);
            } catch (err) { next(err); }
        });
        app.put('/state/toggleServiceMode', async (req, res, next) => {
            try {
                let data = extend({}, req.body);
                if (state.mode === 0) {
                    if (typeof data.timeout !== 'undefined' && !isNaN(data.timeout)) data.mode = 'timeout';
                    else data.mode = 'service';
                    await sys.board.system.setPanelModeAsync(req.body);
                }
                else sys.board.system.setPanelModeAsync({ mode: 'auto' });
                return res.status(200).send(state.controllerState);
            } catch (err) { next(err); }
        });
        app.get('/state/emitAll', (req, res) => {
            res.status(200).send(state.emitAllEquipmentChanges());
        });
        app.get('/state/:section', (req, res) => {
            res.status(200).send(state.getState(req.params.section));
        });
    }
}