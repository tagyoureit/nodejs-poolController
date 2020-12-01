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
import * as extend from 'extend';
import { sys, LightGroup, ControllerType, Pump, Valve, Body, General, Circuit, ICircuit, Feature, CircuitGroup, CustomNameCollection, Schedule, Chlorinator, Heater } from "../../../controller/Equipment";
import { config } from "../../../config/Config";
import { logger } from "../../../logger/Logger";
import { utils } from "../../../controller/Constants";
import { state } from "../../../controller/State";
import {stopPacketCaptureAsync, startPacketCapture} from '../../../app';
export class ConfigRoute {
    public static initRoutes(app: express.Application) {
        app.get('/config/body/:body/heatModes', (req, res) => {
            return res.status(200).send(sys.bodies.getItemById(parseInt(req.params.body, 10)).getHeatModes());
        });
        app.get('/config/circuit/names', (req, res) => {
            let circuitNames = sys.board.circuits.getCircuitNames();
            return res.status(200).send(circuitNames);
        });
        app.get('/config/circuit/references', (req, res) => {
            let circuits = typeof req.query.circuits === 'undefined' || utils.makeBool(req.query.circuits);
            let features = typeof req.query.features === 'undefined' || utils.makeBool(req.query.features);
            let groups = typeof req.query.features === 'undefined' || utils.makeBool(req.query.groups);
            let virtual = typeof req.query.virtual === 'undefined' || utils.makeBool(req.query.virtual);
            return res.status(200).send(sys.board.circuits.getCircuitReferences(circuits, features, virtual, groups));
        });

        /******* CONFIGURATION PICK LISTS/REFERENCES and VALIDATION PARAMETERS *********/
        /// Returns an object that contains the general options for setting up the panel.
        app.get('/config/options/general', (req, res) => {
            let opts = {
                countries: sys.board.valueMaps.countries.toArray(),
                tempUnits: sys.board.valueMaps.tempUnits.toArray(),
                timeZones: sys.board.valueMaps.timeZones.toArray(),
                clockSources: sys.board.valueMaps.clockSources.toArray(),
                clockModes: sys.board.valueMaps.clockModes.toArray(),
                pool: sys.general.get(true),
                sensors: sys.board.system.getSensors()
            };
            return res.status(200).send(opts);
        });
        app.get('/config/options/circuits', (req, res) => {
            let opts = {
                maxCircuits: sys.equipment.maxCircuits,
                equipmentIds: sys.equipment.equipmentIds.circuits,
                invalidIds: sys.board.equipmentIds.invalidIds.get(),
                equipmentNames: sys.board.circuits.getCircuitNames(),
                functions: sys.board.circuits.getCircuitFunctions(),
                circuits: sys.circuits.get()
            };
            return res.status(200).send(opts);
        });
        app.get('/config/options/circuitGroups', (req, res) => {
            let opts = {
                maxCircuitGroups: sys.equipment.maxCircuitGroups,
                equipmentNames: sys.board.circuits.getCircuitNames(),
                circuits: sys.board.circuits.getCircuitReferences(true, true, false),
                circuitGroups: sys.circuitGroups.get(),
                circuitStates: sys.board.valueMaps.groupCircuitStates.toArray()
            };
            return res.status(200).send(opts);
        });
        app.get('/config/options/lightGroups', (req, res) => {
            let opts = {
                maxLightGroups: sys.equipment.maxLightGroups,
                equipmentNames: sys.board.circuits.getCircuitNames(),
                themes: sys.board.circuits.getLightThemes(),
                colors: sys.board.valueMaps.lightColors.toArray(),
                circuits: sys.board.circuits.getLightReferences(),
                lightGroups: sys.lightGroups.get(),
                functions: sys.board.circuits.getCircuitFunctions()
            };
            return res.status(200).send(opts);
        });
        app.get('/config/options/features', (req, res) => {
            let opts = {
                maxFeatures: sys.equipment.maxFeatures,
                invalidIds: sys.board.equipmentIds.invalidIds.get(),
                equipmentIds: sys.equipment.equipmentIds.features,
                equipmentNames: sys.board.circuits.getCircuitNames(),
                functions: sys.board.valueMaps.featureFunctions.toArray(),
                features: sys.features.get()
            };
            return res.status(200).send(opts);
        });
        app.get('/config/options/bodies', (req, res) => {
            let opts = {
                maxBodies: sys.equipment.maxBodies,
                bodyTypes: sys.board.valueMaps.bodies.toArray(),
                bodies: sys.bodies.get()
            };
            return res.status(200).send(opts);
        });
        app.get('/config/options/valves', (req, res) => {
            let opts = {
                maxValves: sys.equipment.maxValves,
                valveTypes: sys.board.valueMaps.valveTypes.toArray(),
                circuits: sys.board.circuits.getCircuitReferences(true, true, true),
                valves: sys.valves.get()
            };
            opts.circuits.unshift({ id: 256, name: 'Unassigned', type: 0, equipmentType: 'circuit' });
            return res.status(200).send(opts);
        });
        app.get('/config/options/pumps', (req, res) => {
            let opts: any = {
                maxPumps: sys.equipment.maxPumps,
                pumpUnits: sys.board.valueMaps.pumpUnits.toArray(),
                pumpTypes: sys.board.valueMaps.pumpTypes.toArray(),
                models: {
                    ss: sys.board.valueMaps.pumpSSModels.toArray(),
                    ds: sys.board.valueMaps.pumpDSModels.toArray(),
                    vs: sys.board.valueMaps.pumpVSModels.toArray(),
                    vf: sys.board.valueMaps.pumpVSModels.toArray(),
                    vsf: sys.board.valueMaps.pumpVSFModels.toArray(),
                    vssvrs: sys.board.valueMaps.pumpVSSVRSModels.toArray()
                },
                circuits: sys.board.circuits.getCircuitReferences(true, true, true, true),
                bodies: sys.board.valueMaps.pumpBodies.toArray(),
                pumps: sys.pumps.get()
            };
            // RKS: Why do we need the circuit names?  We have the circuits.  Is this so
            // that we can name the pump.  I thought that *Touch uses the pump type as the name
            // plus a number.
            // RG: because I need the name/val of the Not Used circuit for displaying pumpCircuits that are
            // empty.  EG A pump circuit can be not used even if all the circuits are used.
            if (sys.controllerType !== ControllerType.IntelliCenter) {
                opts.circuitNames = sys.board.circuits.getCircuitNames().filter(c => c.name === 'notused');
            }
            return res.status(200).send(opts);
        });
        app.get('/config/options/schedules', (req, res) => {
            let opts = {
                maxSchedules: sys.equipment.maxSchedules,
                tempUnits: sys.board.valueMaps.tempUnits.transform(state.temps.units),
                scheduleTimeTypes: sys.board.valueMaps.scheduleTimeTypes.toArray(),
                scheduleTypes: sys.board.valueMaps.scheduleTypes.toArray(),
                scheduleDays: sys.board.valueMaps.scheduleDays.toArray(),
                heatSources: sys.board.valueMaps.heatSources.toArray(),
                circuits: sys.board.circuits.getCircuitReferences(true, true, false, true),
                schedules: sys.schedules.get(),
                clockMode: sys.general.options.clockMode || 12,
                eggTimers: sys.eggTimers.get() // needed for *Touch to not overwrite real schedules
            };
            return res.status(200).send(opts);
        });
        app.get('/config/options/heaters', (req, res) => {
            let opts = {
                tempUnits: sys.board.valueMaps.tempUnits.transform(state.temps.units),
                bodies: sys.board.bodies.getBodyAssociations(),
                maxHeaters: sys.equipment.maxHeaters,
                heaters: sys.heaters.get(),
                heaterTypes: sys.board.valueMaps.heaterTypes.toArray(),
                heatModes: sys.board.valueMaps.heatModes.toArray(),
                coolDownDelay: sys.general.options.cooldownDelay
            };
            return res.status(200).send(opts);
        });
        app.get('/config/options/customNames', (req, res) => {
            let opts = {
                maxCustomNames: sys.equipment.maxCustomNames,
                customNames: sys.customNames.get()
            };
            return res.status(200).send(opts);
        });
        app.get('/config/options/chemControllers', async (req, res, next) => {
            try {
                let alarms = {
                    flow: sys.board.valueMaps.chemControllerAlarms.toArray().filter(el => [0, 1].includes(el.val)),
                    pH: sys.board.valueMaps.chemControllerAlarms.toArray().filter(el => [0, 2, 4].includes(el.val)),
                    orp: sys.board.valueMaps.chemControllerAlarms.toArray().filter(el => [0, 8, 16].includes(el.val)),
                    pHTank: sys.board.valueMaps.chemControllerAlarms.toArray().filter(el => [0, 32].includes(el.val)),
                    orpTank: sys.board.valueMaps.chemControllerAlarms.toArray().filter(el => [0, 64].includes(el.val)),
                    probeFault: sys.board.valueMaps.chemControllerAlarms.toArray().filter(el => [0, 128].includes(el.val))
                }
                let warnings = {
                    waterChemistry: sys.board.valueMaps.chemControllerWarnings.toArray().filter(el => [0, 1, 2].includes(el.val)),
                    pHLockout: sys.board.valueMaps.chemControllerLimits.toArray().filter(el => [0, 1].includes(el.val)),
                    pHDailyLimitReached: sys.board.valueMaps.chemControllerLimits.toArray().filter(el => [0, 2].includes(el.val)),
                    orpDailyLimitReached: sys.board.valueMaps.chemControllerLimits.toArray().filter(el => [0, 4].includes(el.val)),
                    invalidSetup: sys.board.valueMaps.chemControllerWarnings.toArray().filter(el => [0, 8].includes(el.val)),
                    chlorinatorCommsError: sys.board.valueMaps.chemControllerWarnings.toArray().filter(el => [0, 16].includes(el.val)),
                }
                let opts = {
                    types: sys.board.valueMaps.chemControllerTypes.toArray(),
                    bodies: sys.board.bodies.getBodyAssociations(),
                    tempUnits: sys.board.valueMaps.tempUnits.toArray(),
                    status: sys.board.valueMaps.chemControllerStatus.toArray(),
                    pumpTypes: sys.board.valueMaps.chemPumpTypes.toArray(),
                    phSupplyTypes: sys.board.valueMaps.phSupplyTypes.toArray(),
                    volumeUnits: sys.board.valueMaps.volumeUnits.toArray(),
                    dosingMethods: sys.board.valueMaps.chemDosingMethods.toArray(),
                    orpProbeTypes: sys.board.valueMaps.chemORPProbeTypes.toArray(),
                    phProbeTypes: sys.board.valueMaps.chemPhProbeTypes.toArray(),
                    acidTypes: sys.board.valueMaps.acidTypes.toArray(),
                    remServers: await sys.ncp.getREMServers(),
                    dosingStatus: sys.board.valueMaps.chemControllerDosingStatus.toArray(),
                    alarms,
                    warnings,
                    // waterFlow: sys.board.valueMaps.chemControllerWaterFlow.toArray(), // remove
                    controllers: sys.chemControllers.get(),
                    maxChemControllers: sys.equipment.maxChemControllers
                };
                return res.status(200).send(opts);
            }
            catch (err) { next(err); }
        });
        app.get('/config/options/rem', async (req, res, next) => {
            try {
                let opts = {
                    servers: await sys.ncp.getREMServers()
                }
                return res.status(200).send(opts);
            } catch (err) { next(err); }
        });
        app.get('/config/options/chlorinators', (req, res) => {
            let opts = {
                types: sys.board.valueMaps.chlorinatorType.toArray(),
                bodies: sys.board.bodies.getBodyAssociations(),
                chlorinators: sys.chlorinators.get(),
                maxChlorinators: sys.equipment.maxChlorinators
            };
            return res.status(200).send(opts);
        });
        app.get('/config/options/dateTime', (req, res) => {
            let opts = {
                dow: sys.board.system.getDOW()
            }
            return res.status(200).send(opts);
        });
        app.get('/app/options/logger', (req, res) => {
            let opts = {
                logger: config.getSection('log')
            }
            return res.status(200).send(opts);
        });
        app.get('/config/options/tempSensors', (req, res) => {
            let opts = {
                tempUnits: sys.board.valueMaps.tempUnits.toArray(),
                sensors: sys.board.system.getSensors()
            };
            return res.status(200).send(opts);
        });
        app.get('/config/options/filters', (req, res) => {
            let opts = {
                types: sys.board.valueMaps.filterTypes.toArray(),
                bodies: sys.board.bodies.getBodyAssociations(),
                filters: sys.filters.get(),
            };
            return res.status(200).send(opts);
        });
        /******* END OF CONFIGURATION PICK LISTS/REFERENCES AND VALIDATION ***********/
        /******* ENDPOINTS FOR MODIFYING THE OUTDOOR CONTROL PANEL SETTINGS **********/
        app.put('/config/tempSensors', async (req, res, next) => {
            try {
                await sys.board.system.setTempSensorsAsync(req.body);
                let opts = {
                    tempUnits: sys.board.valueMaps.tempUnits.toArray(),
                    sensors: sys.board.system.getSensors()
                };
                return res.status(200).send(opts);
            }
            catch (err) { next(err); }
        });
        app.put('/config/filter', async (req, res, next) => {
            try {
                let sfilter = sys.board.filters.setFilter(req.body);
                return res.status(200).send(sfilter.get(true));
            }
            catch (err) { next(err); }
        });
        app.delete('/config/filter', async (req, res, next) => {
            try {
                let sfilter = sys.board.filters.deleteFilter(req.body);
                return res.status(200).send(sfilter.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/config/general', async (req, res, next) => {
            // Change the options for the pool.
            try {
                let rc = await sys.board.system.setGeneralAsync(req.body);
                let opts = {
                    countries: sys.board.valueMaps.countries.toArray(),
                    tempUnits: sys.board.valueMaps.tempUnits.toArray(),
                    timeZones: sys.board.valueMaps.timeZones.toArray(),
                    clockSources: sys.board.valueMaps.clockSources.toArray(),
                    clockModes: sys.board.valueMaps.clockModes.toArray(),
                    pool: sys.general.get(true),
                    sensors: sys.board.system.getSensors()
                };
                return res.status(200).send(opts);
            }
            catch (err) { next(err); }
        });

        app.put('/config/valve', async (req, res, next) => {
            // Update a valve.
            try {
                let valve = await sys.board.valves.setValveAsync(req.body);
                return res.status(200).send((valve).get(true));
            }
            catch (err) { next(err); }
        });
        app.delete('/config/valve', async (req, res, next) => {
            // Update a valve.
            try {
                let valve = await sys.board.valves.deleteValveAsync(req.body);
                return res.status(200).send((valve).get(true));
            }
            catch (err) { next(err); }
        });

        app.put('/config/body', async (req, res, next) => {
            // Change the body attributes.
            try {
                let body = await sys.board.bodies.setBodyAsync(req.body);
                return res.status(200).send((body).get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/config/circuit', async (req, res, next) => {
            // add/update a circuit
            try {
                let circuit = await sys.board.circuits.setCircuitAsync(req.body);
                return res.status(200).send((circuit).get(true));
            }
            catch (err) { next(err); }
        });
        app.delete('/config/circuit', async (req, res, next) => {
            // delete a circuit
            try {
                let circuit = await sys.board.circuits.deleteCircuitAsync(req.body);
                return res.status(200).send((circuit).get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/config/feature', async (req, res, next) => {
            // add/update a feature
            try {
                let feature = await sys.board.features.setFeatureAsync(req.body);
                return res.status(200).send((feature).get(true));
            }
            catch (err) { next(err); }
        });
        app.delete('/config/feature', async (req, res, next) => {
            // delete a feature
            try {
                let feature = await sys.board.features.deleteFeatureAsync(req.body);
                return res.status(200).send((feature).get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/config/circuitGroup', async (req, res, next) => {
            // add/update a circuitGroup
            try {
                let group = await sys.board.circuits.setCircuitGroupAsync(req.body);
                return res.status(200).send((group).get(true));
            }
            catch (err) { next(err); }
        });
        app.delete('/config/circuitGroup', async (req, res, next) => {
            try {
                let group = await sys.board.circuits.deleteCircuitGroupAsync(req.body);
                return res.status(200).send((group).get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/config/lightGroup', async (req, res, next) => {
            try {
                let group = await sys.board.circuits.setLightGroupAsync(req.body);
                return res.status(200).send((group).get(true));
            }
            catch (err) { next(err); }
        });
        app.delete('/config/lightGroup', async (req, res, next) => {
            try {
                let group = await sys.board.circuits.deleteLightGroupAsync(req.body);
                return res.status(200).send((group).get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/config/pump', async (req, res, next) => {
            // Change the pump attributes.  This will add the pump if it doesn't exist, set
            // any affiliated circuits and maintain all attribututes of the pump.
            // RSG: Caveat - you have to send none or all of the pump circuits or any not included be deleted.
            try {
                let pump = await sys.board.pumps.setPumpAsync(req.body);
                return res.status(200).send((pump).get(true));
            }
            catch (err) { next(err); }
        });
        app.delete('/config/pump', async (req, res, next) => {
            try {
                let pump = await sys.board.pumps.deletePumpAsync(req.body);
                return res.status(200).send((pump).get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/config/customNames', async (req, res, next) => {
            try {
                let names = await sys.board.system.setCustomNamesAsync(req.body);
                return res.status(200).send(names.get());
            }
            catch (err) { next(err); }
        });
        app.put('/config/customName', async (req, res, next) => {
            try {
                let name = await sys.board.system.setCustomNameAsync(req.body);
                return res.status(200).send(name.get(true));
            }
            catch (err) { next(err); }
        });
        app.get('/config/schedule/:id', (req, res) => {
            let schedId = parseInt(req.params.id || '0', 10);
            let sched = sys.schedules.getItemById(schedId).get(true);
            return res.status(200).send(sched);
        });
        app.put('/config/schedule', async (req, res, next) => {
            try {
                let sched = await sys.board.schedules.setScheduleAsync(req.body);
                return res.status(200).send((sched as Schedule).get(true));
            }
            catch (err) { next(err); }
        });
        app.delete('/config/schedule', async (req, res, next) => {
            try {
                let sched = await sys.board.schedules.deleteScheduleAsync(req.body);
                return res.status(200).send((sched as Schedule).get(true));
            }
            catch (err) {
                //console.log(`Error deleting schedule... ${err}`);
                next(err);
            }
        });
        app.put('/config/chlorinator', async (req, res, next) => {
            try {
                let chlor = await sys.board.chlorinator.setChlorAsync(req.body);
                return res.status(200).send(sys.chlorinators.getItemById(chlor.id).get(true));
            }
            catch (err) { next(err); }
        });
        app.delete('/config/chlorinator', async (req, res, next) => {
            try {
                let chlor = await sys.board.chlorinator.deleteChlorAsync(req.body);
                return res.status(200).send(chlor.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/config/heater', async (req, res, next) => {
            try {
                let heater = await sys.board.heaters.setHeaterAsync(req.body);
                return res.status(200).send(sys.heaters.getItemById(heater.id).get(true));
            }
            catch (err) { next(err); }
        });
        app.delete('/config/heater', async (req, res, next) => {
            try {
                let heater = await sys.board.heaters.deleteHeaterAsync(req.body);
                return res.status(200).send((heater as Heater).get(true));
            }
            catch (err) { next(err); }
        });

        /***** END OF ENDPOINTS FOR MODIFYINC THE OUTDOOR CONTROL PANEL SETTINGS *****/



        app.get('/config/circuits/names', (req, res) => {
            let circuitNames = sys.board.circuits.getCircuitNames();
            return res.status(200).send(circuitNames);
        });
        app.get('/config/circuit/functions', (req, res) => {
            let circuitFunctions = sys.board.circuits.getCircuitFunctions();
            return res.status(200).send(circuitFunctions);
        });
        app.get('/config/features/functions', (req, res) => {
            let circuitFunctions = sys.board.circuits.getCircuitFunctions();
            return res.status(200).send(circuitFunctions);
        });
        app.get('/config/circuit/:id', (req, res) => {
            // todo: need getInterfaceById.get() in case features are requested here
            // todo: it seems to make sense to combine with /state/circuit/:id as they both have similiar/overlapping info
            return res.status(200).send(sys.circuits.getItemById(parseInt(req.params.id, 10)).get());
        });
        app.get('/config/circuit/:id/lightThemes', (req, res) => {
            let circuit = sys.circuits.getInterfaceById(parseInt(req.params.id, 10));
            let themes = typeof circuit !== 'undefined' && typeof circuit.getLightThemes === 'function' ? circuit.getLightThemes() : [];
            return res.status(200).send(themes);
        });
        app.get('/config/chlorinator/:id', (req, res) => {
            return res.status(200).send(sys.chlorinators.getItemById(parseInt(req.params.id, 10)).get());
        });
        //app.put('/config/chlorinator', (req, res) => {
        //    let chlor = sys.chlorinators.getItemById(parseInt(req.body.id, 10), true);
        //    sys.board.chlorinator.setChlorProps(chlor, req.body);
        //    // if (chlor.isVirtual) { sys.board.virtualChlorinatorController.start(); }
        //    return res.status(200).send(sys.chlorinators.getItemById(parseInt(req.params.id, 10)).get());
        //});
        app.get('/config/chlorinators/search', async (req, res, next) => {
            // Change the options for the pool.
            try {
                await sys.board.virtualChlorinatorController.search();
                return res.status(200).send(sys.chlorinators.getItemById(1).get());
            }
            catch (err) {
                next(err);
            }
        });
        /*         app.get('/config/pump/:id/circuits', (req, res) => {
                    return res.status(200).send(sys.pumps.getItemById(parseInt(req.params.id, 10)).get().circuits);
                });
                app.get('/config/pump/availableCircuits', (req, res) => {
                    return res.status(200).send(sys.board.pumps.availableCircuits());
                });
                app.get('/config/pump/:id/circuit/:circuitid', (req, res) => {
                    return res.status(200).send(sys.pumps.getItemById(parseInt(req.params.id, 10)).get().circuits[parseInt(req.params.circuitid, 10)]);
                });
                app.get('/config/pump/:id/nextAvailablePumpCircuit', (req, res) => {
                    // if no pumpCircuitId is available, 0 will be returned
                    let _id = sys.pumps.getItemById(parseInt(req.params.id, 10)).nextAvailablePumpCircuit();
                    return res.status(200).send(_id.toString());
                }); */
        /*
        app.put('/config/pump/:id/pumpCircuit', (req, res) => {
            // if no pumpCircuitId is specified, set it as 0 and take the next available one
            req.url = `${ req.url }/0`;
            req.next();
        });
         app.put('/config/pump/:id/pumpCircuit/:pumpCircuitId', (req, res) => {
            // RSG - do we want a /config/pump/:id/pumpCircuit/ that will just assume the next circuit?
            let pump = sys.pumps.getItemById(parseInt(req.params.id, 10));
            let _pumpCircuitId = parseInt(req.params.pumpCircuitId, 10);
            let _circuit = parseInt(req.body.circuit, 10);
            let _rate = parseInt(req.body.rate, 10);
            let _units = parseInt(req.body.units, 10) || pump.defaultUnits;
            let pumpCircuit = {
                pump: parseInt(req.params.id, 10),
                pumpCircuitId: isNaN(_pumpCircuitId) ? undefined : _pumpCircuitId,
                circuit: isNaN(_circuit) ? undefined : _circuit,
                rate: isNaN(_rate) ? undefined : _rate,
                units: isNaN(_units) ? undefined : _units
            };
            let { result, reason } = pump.setPumpCircuit(pumpCircuit);
            if (result === 'OK')
                return res.status(200).send({ result: result, reason: reason });
            else
                return res.status(500).send({ result: result, reason: reason });
        }); */
        /*         app.delete('/config/pump/:id/pumpCircuit/:pumpCircuitId', (req, res) => {
                    let pump = sys.pumps.getItemById(parseInt(req.params.id, 10));
                    // pump.circuits.removeItemById(parseInt(req.params.pumpCircuitId, 10));
                    pump.deletePumpCircuit(parseInt(req.params.pumpCircuitId, 10));
                    return res.status(200).send('OK');
                }); */
        /*         app.get('/config/pump/types', (req, res) => {
                    let pumpTypes = sys.board.pumps.getPumpTypes();
                    return res.status(200).send(pumpTypes);
                });
                app.get('/config/pump/units', (req, res) => {
                    // get all units for all system board
                    let pumpTypes = sys.board.pumps.getCircuitUnits();
                    return res.status(200).send(pumpTypes);
                });
                app.get('/config/pump/:id/units', (req, res) => {
                    // get units for all specific pump types
                    // need to coorerce into array if only a single unit is returned; by default getExtended will return an array
                    // if there is 1+ object so this creates parity
                    let pump = sys.pumps.getItemById(parseInt(req.params.id, 10));
                    let pumpTypes = sys.board.pumps.getCircuitUnits(pump);
                    if (!Array.isArray(pumpTypes)) pumpTypes = [pumpTypes];
                    return res.status(200).send(pumpTypes);
                });
                app.put('/config/pump/:pumpId/type', (req, res) => {
                    const _type = parseInt(req.body.pumpType, 10);
                    const _pumpId = parseInt(req.params.pumpId, 10);
                    // RG - this was left as it's own end point because trying to combine changing the pump type (which requires resetting the pump values) while simultaneously setting new pump values was tricky. 
                    let pump = sys.pumps.getItemById(_pumpId);
                    if (sys.controllerType === ControllerType.Virtual) {
                        pump.isVirtual = true;
                    }
                    if (_type !== pump.type) {
                        pump.setType(_type);
                    }
                    return res.status(200).send('OK');
                }); */
        /*       app.get('/config/pump/:pumpId', (req, res) => {
                  let pump = sys.pumps.getItemById(parseInt(req.params.pumpId, 10)).get(true);
                  return res.status(200).send(pump);
              });
              app.put('/config/pump/:pumpId', (req, res) => {
                  // this will change the pump type
                  let _type = parseInt(req.body.pumpType, 10);
                  let pump = sys.pumps.getItemById(parseInt(req.params.pumpId, 10));
                  if (sys.controllerType === ControllerType.Virtual) {
                      // if virtualController, add the virtual pump
                      pump.isVirtual = true;
                  }
      
                  if (_type !== pump.type && typeof _type !== 'undefined') {
                      pump.setType(_type);
                  }
                  // get a new instance of the pump here because setType will remove/add a new instance
                  if (Object.keys(req.body).length) sys.pumps.getItemById(parseInt(req.params.pumpId, 10)).setPump(req.body);
                  return res.status(200).send('OK');
              }); */
        app.delete('/config/pump/:pumpId', (req, res) => {
            let pump = sys.pumps.getItemById(parseInt(req.params.pumpId, 10));
            if (pump.type === 0) {
                return res.status(500).send(`Pump ${pump.id} not active`);
            }
            pump.setType(0);
            return res.status(200).send('OK');
        });
        app.put('/config/dateTime', async (req, res, next) => {
            try {
                let time = await sys.updateControllerDateTimeAsync(req.body);
                return res.status(200).send(time);
            }
            catch (err) { next(err); }
        });
        app.get('/config/lightGroups/themes', (req, res) => {
            // RSG: is this and /config/circuit/:id/lightThemes both needed?

            // if (sys.controllerType === ControllerType.IntelliCenter) {
            let grp = sys.lightGroups.getItemById(parseInt(req.params.id, 10));
            return res.status(200).send(grp.getLightThemes());
            // }
            // else
            //     return res.status(200).send(sys.intellibrite.getLightThemes());
        });
        app.get('/config/lightGroup/:id', (req, res) => {
            // if (sys.controllerType === ControllerType.IntelliCenter) {
            let grp = sys.lightGroups.getItemById(parseInt(req.params.id, 10));
            return res.status(200).send(grp.getExtended());
            // }
            // else
            //     return res.status(200).send(sys.intellibrite.getExtended());
        });
        app.get('/config/lightGroup/colors', (req, res) => {
            return res.status(200).send(sys.board.valueMaps.lightColors.toArray());
        });
        app.put('/config/lightGroup/:id/setColors', async (req, res, next) => {
            try {
                let grp = extend(true, { id: parseInt(req.params.id, 10) }, req.body);
                await sys.board.circuits.setLightGroupAttribsAsync(grp);
                return res.status(200).send(grp.getExtended());
            }
            catch (err) { next(err); }
        });
        app.get('/config/intellibrite/themes', (req, res) => {
            return res.status(200).send(sys.board.circuits.getLightThemes(16));
        });
        app.get('/config/circuitGroup/:id', (req, res) => {
            let grp = sys.circuitGroups.getItemById(parseInt(req.params.id, 10));
            return res.status(200).send(grp.getExtended());
        });
        app.get('/config/chemController/search', async (req, res, next) => {
            // Change the options for the pool.
            try {
                let result = await sys.board.virtualChemControllers.search();
                return res.status(200).send(result);
            }
            catch (err) {
                next(err);
            }
        });
        app.put('/config/chemController', async (req, res, next) => {
            try {
                let chem = await sys.board.chemControllers.setChemControllerAsync(req.body);
                return res.status(200).send(chem.get());
            }
            catch (err) { next(err); }
        });
        app.delete('/config/chemController', async (req, res, next) => {
            try {
                let chem = await sys.board.chemControllers.deleteChemControllerAsync(req.body);
                return res.status(200).send(chem.get());
            }
            catch (err) { next(err); }

        });
/*         app.get('/config/intellibrite', (req, res) => {
            return res.status(200).send(sys.intellibrite.getExtended());
        });
        app.get('/config/intellibrite/colors', (req, res) => {
            return res.status(200).send(sys.board.valueMaps.lightColors.toArray());
        });
        app.put('/config/intellibrite/setColors', (req, res) => {
            let grp = extend(true, { id: 0 }, req.body);
            sys.board.circuits.setIntelliBriteColors(new LightGroup(grp));
            return res.status(200).send('OK');
        }); */
        app.get('/config', (req, res) => {
            return res.status(200).send(sys.getSection('all'));
        });
        app.get('/config/:section', (req, res) => {
            return res.status(200).send(sys.getSection(req.params.section));
        });


        /******* ENDPOINTS FOR MANAGING THE poolController APPLICATION *********/
        app.put('/app/logger/setOptions', (req, res) => {
            logger.setOptions(req.body);
            return res.status(200).send(logger.options);
        });
        app.put('/app/logger/clearMessages', (req, res) => {
            logger.clearMessages();
            return res.status(200).send('OK');
        });
        app.get('/app/messages/broadcast/actions', (req, res) => {
            return res.status(200).send(sys.board.valueMaps.msgBroadcastActions.toArray());
        });
        app.put('/app/config/reload', (req, res) => {
            sys.board.reloadConfig();
            return res.status(200).send('OK');
        });
        app.get('/app/config/startPacketCapture', (req, res) => {
            startPacketCapture(true);
            return res.status(200).send('OK');
        });
        app.get('/app/config/startPacketCaptureWithoutReset', (req, res) => {
            startPacketCapture(false);
            return res.status(200).send('OK');
        });
        app.get('/app/config/stopPacketCapture', async (req, res,next) => {
            try {
                let file = await stopPacketCaptureAsync();
                res.download(file);
            }
            catch (err) {next(err);}
        });
        app.get('/app/config/:section', (req, res) => {
            return res.status(200).send(config.getSection(req.params.section));
        });


    }
}