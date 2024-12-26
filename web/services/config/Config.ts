/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020, 2021, 2022.  
Russell Goldin, tagyoureit.  russ.goldin@gmail.com

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
import * as fs from "fs";
import * as path from "path";
import * as express from "express";
import * as extend from 'extend';
import * as multer from 'multer';
import { sys, LightGroup, ControllerType, Pump, Valve, Body, General, Circuit, ICircuit, Feature, CircuitGroup, CustomNameCollection, Schedule, Chlorinator, Heater, Screenlogic } from "../../../controller/Equipment";
import { config } from "../../../config/Config";
import { logger } from "../../../logger/Logger";
import { utils } from "../../../controller/Constants";
import { ServiceProcessError } from "../../../controller/Errors";
import { state } from "../../../controller/State";
import { stopPacketCaptureAsync, startPacketCapture } from '../../../app';
import { conn } from "../../../controller/comms/Comms";
import { webApp, BackupFile, RestoreFile } from "../../Server";
import { release } from "os";
import { ScreenLogicComms, sl } from "../../../controller/comms/ScreenLogic";
import { screenlogic } from "node-screenlogic";

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
                sensors: sys.board.system.getSensors(),
                systemUnits: sys.board.valueMaps.systemUnits.toArray()
            };
            return res.status(200).send(opts);
        });
        app.get('/config/options/rs485', async (req, res, next) => {
            try {
                let opts = { ports: [], local: [], screenlogic: {} }
                let cfg = config.getSection('controller');
                for (let section in cfg) {
                    if (section.startsWith('comms')) {
                        let cport = extend(true, { enabled: false, netConnect: false, mock: false }, cfg[section]);
                        let port = conn.findPortById(cport.portId || 0);
                        if (typeof cport.type === 'undefined'){
                            cport.type = cport.netConnect ? 'netConnect' : cport.mockPort || cport.mock ? 'mock' : 'local'
                        }
                        if (typeof port !== 'undefined') cport.stats = port.stats;
                        if (port.portId === 0 && port.type === 'screenlogic') {
                            cport.screenlogic.stats = sl.stats;
                        }
                        opts.ports.push(cport);
                    }
                    // if (section.startsWith('screenlogic')){
                    //     let screenlogic = cfg[section];
                    //     screenlogic.types =  [{ val: 'local', name: 'Local', desc: 'Local Screenlogic' }, { val: 'remote', name: 'Remote', desc: 'Remote Screenlogic' }];
                    //     screenlogic.stats = sl.stats;
                    //     opts.screenlogic = screenlogic;
                    // }
                }
                opts.local = await conn.getLocalPortsAsync() || [];
                return res.status(200).send(opts);
            } catch (err) { next(err); }
        });
        // app.get('/config/options/screenlogic', async (req, res, next) => {
        //     try {
        //         let cfg = config.getSection('controller.screenlogic');
        //         let data = {
        //             cfg,
        //             types: [{ val: 'local', name: 'Local', desc: 'Local Screenlogic' }, { val: 'remote', name: 'Remote', desc: 'Remote Screenlogic' }]
        //         }
        //         return res.status(200).send(data);
        //     } catch (err) { next(err); }
        // });
        app.get('/config/options/screenlogic/search', async (req, res, next) => {
            try {
                let localUnits = await ScreenLogicComms.searchAsync();
                return res.status(200).send(localUnits);
            } catch (err) { next(err); }
        });
        app.get('/config/options/circuits', async (req, res, next) => {
            try {
                let opts = {
                    maxCircuits: sys.equipment.maxCircuits,
                    equipmentIds: sys.equipment.equipmentIds.circuits,
                    invalidIds: sys.board.equipmentIds.invalidIds.get(),
                    equipmentNames: sys.board.circuits.getCircuitNames(),
                    functions: sys.board.circuits.getCircuitFunctions(),
                    circuits: sys.circuits.get(),
                    controllerType: sys.controllerType,
                    servers: await sys.ncp.getREMServers()
                };
                return res.status(200).send(opts);
            } catch (err) { next(err); }
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
                functions: sys.board.features.getFeatureFunctions(),
                features: sys.features.get()
            };
            return res.status(200).send(opts);
        });
        app.get('/config/options/bodies', (req, res) => {
            let opts = {
                maxBodies: sys.equipment.maxBodies,
                bodyTypes: sys.board.valueMaps.bodies.toArray(),
                bodies: sys.bodies.get(),
                capacityUnits: sys.board.valueMaps.volumeUnits.toArray()
            };
            return res.status(200).send(opts);
        });
        app.get('/config/options/valves', async (req, res, next) => {
            try {
                let opts = {
                    maxValves: sys.equipment.maxValves,
                    valveTypes: sys.board.valueMaps.valveTypes.toArray(),
                    circuits: sys.board.circuits.getCircuitReferences(true, true, true),
                    valves: sys.valves.get(),
                    servers: await sys.ncp.getREMServers()
                };
                opts.circuits.unshift({ id: 256, name: 'Unassigned', type: 0, equipmentType: 'circuit' });
                return res.status(200).send(opts);
            } catch (err) { next(err); }
        });
        app.get('/config/options/pumps', async (req, res, next) => {
            try {
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
                    pumps: sys.pumps.get(),
                    servers: await sys.ncp.getREMServers(),
                    rs485ports: await conn.listInstalledPorts()
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
            } catch (err) { next(err); }
        });
        app.get('/config/options/schedules', async (req, res, next) => {
            try {
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
                    displayTypes: sys.board.valueMaps.scheduleDisplayTypes.toArray(),
                    bodies: [],
                    eggTimers: sys.eggTimers.get() // needed for *Touch to not overwrite real schedules
                };
                // Now get all the body heat sources.
                for (let i = 0; i < sys.bodies.length; i++) {
                    let body = sys.bodies.getItemByIndex(i);
                    opts.bodies.push({ id: body.id, circuit: body.circuit, name: body.name, alias: body.alias, heatSources: sys.board.bodies.getHeatSources(body.id) });
                }
                return res.status(200).send(opts);
            } catch (err) { next(err); }
        });
        app.get('/config/options/heaters', async (req, res, next) => {
            try {
                let opts = {
                    tempUnits: sys.board.valueMaps.tempUnits.transform(state.temps.units),
                    bodies: sys.board.bodies.getBodyAssociations(),
                    maxHeaters: sys.equipment.maxHeaters,
                    heaters: sys.heaters.get(),
                    heaterTypes: sys.board.valueMaps.heaterTypes.toArray(),
                    heatModes: sys.board.valueMaps.heatModes.toArray(),
                    coolDownDelay: sys.general.options.cooldownDelay,
                    servers: [],
                    rs485ports: await conn.listInstalledPorts()
                };
                // We only need the servers data when the controller is a Nixie controller.  We don't need to
                // wait for this information if we are dealing with an OCP.
                if (sys.controllerType === ControllerType.Nixie) opts.servers = await sys.ncp.getREMServers();
                return res.status(200).send(opts);
            } catch (err) { next(err); }
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
                let remServers = await sys.ncp.getREMServers();
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
                    chlorDosingMethods: sys.board.valueMaps.chemChlorDosingMethods.toArray(),
                    orpProbeTypes: sys.board.valueMaps.chemORPProbeTypes.toArray(),
                    phProbeTypes: sys.board.valueMaps.chemPhProbeTypes.toArray(),
                    flowSensorTypes: sys.board.valueMaps.flowSensorTypes.toArray(),
                    acidTypes: sys.board.valueMaps.acidTypes.toArray(),
                    remServers,
                    dosingStatus: sys.board.valueMaps.chemControllerDosingStatus.toArray(),
                    siCalcTypes: sys.board.valueMaps.siCalcTypes.toArray(),
                    alarms,
                    warnings,
                    // waterFlow: sys.board.valueMaps.chemControllerWaterFlow.toArray(), // remove
                    controllers: sys.chemControllers.get(),
                    maxChemControllers: sys.equipment.maxChemControllers,
                    doserTypes: sys.board.valueMaps.chemDoserTypes.toArray(),
                    chlorinators: sys.chlorinators.get(),
                };
                return res.status(200).send(opts);
            }
            catch (err) { next(err); }
        });
        app.get('/config/options/chemDosers', async (req, res, next) => {
            try {
                let remServers = await sys.ncp.getREMServers();
                let opts = {
                    bodies: sys.board.bodies.getBodyAssociations(),
                    tempUnits: sys.board.valueMaps.tempUnits.toArray(),
                    status: sys.board.valueMaps.chemDoserStatus.toArray(),
                    pumpTypes: sys.board.valueMaps.chemPumpTypes.toArray(),
                    volumeUnits: sys.board.valueMaps.volumeUnits.toArray(),
                    flowSensorTypes: sys.board.valueMaps.flowSensorTypes.toArray(),
                    remServers,
                    dosingStatus: sys.board.valueMaps.chemDoserDosingStatus.toArray(),
                    dosers: sys.chemDosers.get(),
                    doserTypes: sys.board.valueMaps.chemDoserTypes.toArray(),
                    maxChemDosers: sys.equipment.maxChemDosers
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
        app.get('/config/options/controllerType', async (req, res, next) => {
            try {
                let opts = {
                    controllerType: sys.controllerType,
                    type: state.controllerState,
                    equipment: sys.equipment.get(),
                    controllerTypes: sys.getAvailableControllerTypes()
                }
                return res.status(200).send(opts);
            } catch (err) { next(err); }
        });
        app.get('/config/options/anslq25ControllerType', async (req, res, next) => {
            try {
                let opts = {
                    // controllerType: typeof sys.anslq25.controllerType === 'undefined' ? '' : sys.anslq25.controllerType,
                    // model: typeof sys.anslq25.model === 'undefined' ? '' : sys.anslq25.model,
                    // equipment: sys.equipment.get(),
                    ...sys.anslq25.get(true),
                    controllerTypes: sys.getAvailableControllerTypes(['easytouch', 'intellitouch', 'intellicenter']),
                    rs485ports: await conn.listInstalledPorts()
                }
                return res.status(200).send(opts);
            } catch (err) { next(err); }
        });
        app.get('/config/options/chlorinators', async (req, res, next) => {
            try {
                let opts = {
                    types: sys.board.valueMaps.chlorinatorType.toArray(),
                    bodies: sys.board.bodies.getBodyAssociations(),
                    chlorinators: sys.chlorinators.get(),
                    maxChlorinators: sys.equipment.maxChlorinators,
                    models: sys.board.valueMaps.chlorinatorModel.toArray(),
                    equipmentMasters: sys.board.valueMaps.equipmentMaster.toArray(),
                    rs485ports: await conn.listInstalledPorts()
                };
                return res.status(200).send(opts);
            } catch (err) { next(err); }
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
        app.get('/app/all/', (req, res) => {
            let opts = config.getSection();
            return res.status(200).send(opts);
        });
        app.get('/config/options/tempSensors', (req, res) => {
            let opts = {
                tempUnits: sys.board.valueMaps.tempUnits.toArray(),
                sensors: sys.board.system.getSensors()
            };
            return res.status(200).send(opts);
        });
        app.get('/config/options/filters', async (req, res, next) => {
            try {
                let opts = {
                    types: sys.board.valueMaps.filterTypes.toArray(),
                    bodies: sys.board.bodies.getBodyAssociations(),
                    filters: sys.filters.get(),
                    areaUnits: sys.board.valueMaps.areaUnits.toArray(),
                    pressureUnits: sys.board.valueMaps.pressureUnits.toArray(),
                    circuits: sys.board.circuits.getCircuitReferences(true, true, true, false),
                    servers: []
                };
                if (sys.controllerType === ControllerType.Nixie) opts.servers = await sys.ncp.getREMServers();
                return res.status(200).send(opts);
            } catch (err) { next(err); }
        });
        /******* END OF CONFIGURATION PICK LISTS/REFERENCES AND VALIDATION ***********/
        /******* ENDPOINTS FOR MODIFYING THE OUTDOOR CONTROL PANEL SETTINGS **********/
        app.put('/config/rem', async (req, res, next) => {
            try {
                // RSG: this is problematic because we now enable multiple rem type interfaces that may not be called REM. 
                // This is now also a dupe of PUT /app/interface and should be consolidated
                // config.setSection('web.interfaces.rem', req.body);
                config.setInterface(req.body);
            }
            catch (err) { next(err); }
        })
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
                let sfilter = await sys.board.filters.setFilterAsync(req.body);
                return res.status(200).send(sfilter.get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/config/controllerType', async (req, res, next) => {
            try {
                let controller = await sys.board.setControllerType(req.body);
                return res.status(200).send(controller.get(true));
            } catch (err) { next(err); }
        });
        app.put('/config/anslq25ControllerType', async (req, res, next) => {
            try {
                // sys.anslq25ControllerType
                await sys.anslq25Board.setAnslq25Async(req.body);
                return res.status(200).send(sys.anslq25.get(true));
            } catch (err) { next(err); }
        });
        app.delete('/config/filter', async (req, res, next) => {
            try {
                let sfilter = await sys.board.filters.deleteFilterAsync(req.body);
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
        app.put('/config/pumpCircuit', async (req, res, next) => {
            try {
                let pmpId = parseInt(req.body.pumpId, 10);
                let circId = parseInt(req.body.circuitId, 10);
                let pmp: Pump;
                if (isNaN(pmpId)) {
                    let pmpAddress = parseInt(req.body.address, 10);
                    if (!isNaN(pmpAddress)) pmp = sys.pumps.find(x => x.address === pmpAddress);
                }
                else
                    pmp = sys.pumps.find(x => x.id === pmpId);
                if (typeof pmp === 'undefined') throw new ServiceProcessError(`Pump not found`, '/config/pumpCircuit', 'Set circuit speed');
                let data = pmp.get(true);
                let c = typeof data.circuits !== 'undefined' && typeof data.circuits.find !== 'undefined' ? data.circuits.find(x => x.circuit === circId) : undefined;
                if (typeof c === 'undefined') throw new ServiceProcessError(`Circuit not found`, '/config/pumpCircuit', 'Set circuit speed');
                if (typeof req.body.speed !== 'undefined') {
                    let speed = parseInt(req.body.speed, 10);
                    if (isNaN(speed)) throw new ServiceProcessError(`Invalid circuit speed supplied`, '/config/pumpCircuit', 'Set circuit speed');
                    c.speed = speed;
                }
                else if (typeof req.body.flow !== 'undefined') {
                    let flow = parseInt(req.body.flow, 10);
                    if (isNaN(flow)) throw new ServiceProcessError(`Invalid circuit flow supplied`, '/config/pumpCircuit', 'Set circuit flow');
                    c.flow = flow;
                }
                else {
                    throw new ServiceProcessError(`You must supply a target flow or speed`, '/config/pumpCircuit', 'Set circuit flow');
                }
                await sys.board.pumps.setPumpAsync(data);
                return res.status(200).send((pmp).get(true));
            } catch (err) { next(err); }

        });
        // RKS: 05-20-22 This is a remnant of the old web ui.  It is not called and the setType method needed to go away.
        //app.delete('/config/pump/:pumpId', async (req, res, next) => {
        //    try {
        //        let pump = sys.pumps.getItemById(parseInt(req.params.pumpId, 10));
        //        await sys.board.pumps.deletePumpAsync()
        //        if (pump.type === 0) {
        //            return res.status(500).send(`Pump ${pump.id} not active`);
        //        }
        //        pump.setType(0);
        //        return res.status(200).send('OK');
        //    } catch (err) { next(err); }
        //});
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
            let featureFunctions = sys.board.features.getFeatureFunctions();
            return res.status(200).send(featureFunctions);
        });
        app.get('/config/circuit/:id', (req, res) => {
            // todo: need getInterfaceById.get() in case features are requested here
            // todo: it seems to make sense to combine with /state/circuit/:id as they both have similiar/overlapping info
            return res.status(200).send(sys.circuits.getItemById(parseInt(req.params.id, 10)).get());
        });
        app.get('/config/circuit/:id/lightThemes', (req, res) => {
            let circuit = sys.circuits.getInterfaceById(parseInt(req.params.id, 10));
            let themes = typeof circuit !== 'undefined' && typeof circuit.getLightThemes === 'function' ? circuit.getLightThemes(circuit.type) : [];
            return res.status(200).send(themes);
        });
        app.get('/config/circuit/:id/lightCommands', (req, res) => {
            let circuit = sys.circuits.getInterfaceById(parseInt(req.params.id, 10));
            let commands = typeof circuit !== 'undefined' && typeof circuit.getLightThemes === 'function' ? circuit.getLightCommands(circuit.type) : [];
            return res.status(200).send(commands);
        });

        app.get('/config/chlorinator/:id', (req, res) => {
            return res.status(200).send(sys.chlorinators.getItemById(parseInt(req.params.id, 10)).get());
        });
        app.get('/config/chlorinators/search', async (req, res, next) => {
            // Change the options for the pool.
            try {
                //await sys.board.virtualChlorinatorController.search();
                return res.status(200).send(sys.chlorinators.getItemById(1).get());
            }
            catch (err) {
                next(err);
            }
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
            let grp = sys.lightGroups.getItemById(parseInt(req.body.id, 10));
            return res.status(200).send(grp.getLightThemes());
        });
        app.get('/config/lightGroups/commands', (req, res) => {
            let grp = sys.lightGroups.getItemById(parseInt(req.body.id, 10));
            return res.status(200).send(grp.getLightCommands());
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
                let id = parseInt(req.params.id, 10);
                let grp = extend(true, { id: id }, req.body);
                await sys.board.circuits.setLightGroupAttribsAsync(grp);
                return res.status(200).send(sys.lightGroups.getItemById(id).getExtended());
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
        /*         app.get('/config/chemController/search', async (req, res, next) => {
                    // Change the options for the pool.
                    try {
                        let result = await sys.board.virtualChemControllers.search();
                        return res.status(200).send(result);
                    }
                    catch (err) {
                        next(err);
                    }
                }); */
        app.put('/config/chemController', async (req, res, next) => {
            try {
                let chem = await sys.board.chemControllers.setChemControllerAsync(req.body);
                return res.status(200).send(chem.get());
            }
            catch (err) { next(err); }
        });
        app.put('/config/chemDoser', async (req, res, next) => {
            try {
                let doser = await sys.board.chemDosers.setChemDoserAsync(req.body);
                return res.status(200).send(doser.get());
            }
            catch (err) { next(err); }

        });
        app.put('/config/chemController/calibrateDose', async (req, res, next) => {
            try {
                let schem = await sys.board.chemControllers.calibrateDoseAsync(req.body);
                return res.status(200).send(schem.getExtended());
            }
            catch (err) { next(err); }
        });
        app.put('/config/chemDoser/calibrateDose', async (req, res, next) => {
            try {
                let schem = await sys.board.chemDosers.calibrateDoseAsync(req.body);
                return res.status(200).send(schem.getExtended());
            }
            catch (err) { next(err); }
        });
        app.put('/config/chemController/feed', async (req, res, next) => {
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
        app.delete('/config/chemDoser', async (req, res, next) => {
            try {
                let doser = await sys.board.chemDosers.deleteChemDoserAsync(req.body);
                return res.status(200).send(doser.get());
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
        app.put('/app/interface', async (req, res, next) => {
            try {
                let iface = await webApp.updateServerInterface(req.body);
                return res.status(200).send(iface);
            }
            catch (err) { next(err); }
        });
        app.put('/app/rs485Port', async (req, res, next) => {
            try {
                let port = await conn.setPortAsync(req.body);
                return res.status(200).send(port);
            }
            catch (err) { next(err); }
        });
        // app.put('/app/screenlogic', async (req, res, next) => {
        //     try {
        //         let screenlogic = await sl.setScreenlogicAsync(req.body);
        //         return res.status(200).send(screenlogic);
        //     }
        //     catch (err) { next(err); }
        // });
        app.delete('/app/rs485Port', async (req, res, next) => {
            try {
                let port = await conn.deleteAuxPort(req.body);
                return res.status(200).send(port);
            }
            catch (err) { next(err); }
        });
        app.get('/app/config/startPacketCapture', (req, res) => {
            startPacketCapture(true);
            return res.status(200).send('OK');
        });
        app.get('/app/config/startPacketCaptureWithoutReset', (req, res) => {
            startPacketCapture(false);
            return res.status(200).send('OK');
        });
        app.get('/app/config/stopPacketCapture', async (req, res, next) => {
            try {
                let file = await stopPacketCaptureAsync();
                res.download(file);
            }
            catch (err) { next(err); }
        });
        app.get('/app/config/:section', (req, res) => {
            return res.status(200).send(config.getSection(req.params.section));
        });
        app.get('/app/config/options/backup', async (req, res, next) => {
            try {
                let opts = config.getSection('controller.backups', { automatic: false, interval: { days: 30, hours: 0 }, keepCount: 5, servers: [] });
                let servers = await sys.ncp.getREMServers();
                if (typeof servers !== 'undefined') {
                    // Just in case somebody deletes the backup section and doesn't put it back properly.
                    for (let i = 0; i < servers.length; i++) {
                        let srv = servers[i];
                        if (typeof opts.servers.find(elem => elem.uuid === srv.uuid) === 'undefined') opts.servers.push({ name: srv.name, uuid: srv.uuid, backup: false, host: srv.interface.options.host });
                    }
                    for (let i = opts.servers.length - 1; i >= 0; i--) {
                        let srv = opts.servers[i];
                        if (typeof servers.find(elem => elem.uuid === srv.uuid) === 'undefined') opts.servers.splice(i, 1);
                    }
                }
                if (typeof opts.servers === 'undefined') opts.servers = [];
                return res.status(200).send(opts);
            } catch (err) { next(err); }
        });
        app.get('/app/config/options/restore', async (req, res, next) => {
            try {
                let opts = config.getSection('controller.backups', { automatic: false, interval: { days: 30, hours: 0 }, keepCount: 5, servers: [], backupFiles: [] });
                let servers = await sys.ncp.getREMServers();
                if (typeof servers !== 'undefined') {
                    for (let i = 0; i < servers.length; i++) {
                        let srv = servers[i];
                        if (typeof opts.servers.find(elem => elem.uuid === srv.uuid) === 'undefined') opts.servers.push({ name: srv.name, uuid: srv.uuid, backup: false });
                    }
                    for (let i = opts.servers.length - 1; i >= 0; i--) {
                        let srv = opts.servers[i];
                        if (typeof servers.find(elem => elem.uuid === srv.uuid) === 'undefined') opts.servers.splice(i, 1);
                    }
                }
                if (typeof opts.servers === 'undefined') opts.servers = [];
                opts.backupFiles = await webApp.readBackupFiles();
                return res.status(200).send(opts);
            } catch (err) { next(err); }

        });
        app.put('/app/config/options/backup', async (req, res, next) => {
            try {
                config.setSection('controller.backups', req.body);
                let opts = config.getSection('controller.backups', { automatic: false, interval: { days: 30, hours: 0 }, keepCount: 5, servers: [] });
                webApp.autoBackup = utils.makeBool(opts.automatic);
                await webApp.checkAutoBackup();
                return res.status(200).send(opts);
            } catch (err) { next(err); }

        });
        app.put('/app/config/createBackup', async (req, res, next) => {
            try {
                let ret = await webApp.backupServer(req.body);
                res.download(ret.filePath);
            }
            catch (err) { next(err); }
        });
        app.delete('/app/backup/file', async (req, res, next) => {
            try {
                let opts = req.body;
                fs.unlinkSync(opts.filePath);
                return res.status(200).send(opts);
            }
            catch (err) { next(err); }
        });
        app.post('/app/backup/file', async (req, res, next) => {
            try {
                let file = multer({
                    limits: { fileSize: 1000000  },
                    storage: multer.memoryStorage()
                }).single('backupFile');
                file(req, res, async (err) => {
                    try {
                        if (err) { next(err); }
                        else {
                            // Validate the incoming data and save it off only if it is valid.
                            let bf = await BackupFile.fromBuffer(req.file.originalname, req.file.buffer);
                            if (typeof bf === 'undefined') {
                                err = new ServiceProcessError(`Invalid backup file: ${req.file.originalname}`, 'POST: app/backup/file', 'extractBackupOptions');
                                next(err);
                            }
                            else {
                                if (fs.existsSync(bf.filePath))
                                    return next(new ServiceProcessError(`File already exists ${req.file.originalname}`, 'POST: app/backup/file', 'writeFile'));
                                else {
                                    try {
                                        fs.writeFileSync(bf.filePath, req.file.buffer);
                                    } catch (e) { logger.error(`Error writing backup file ${e.message}`); }
                                }
                                return res.status(200).send(bf);
                            }
                        }
                    } catch (e) {
                        err = new ServiceProcessError(`Error uploading file: ${e.message}`, 'POST: app/backup/file', 'uploadFile');
                        next(err);
                        logger.error(`Error uploading file ${e.message}`);
                    }
                });
            } catch (err) { next(err); }
        });
        app.put('/app/restore/validate', async (req, res, next) => {
            try {
                // Validate all the restore options.
                let opts = req.body;
                let ctx = await webApp.validateRestore(opts);
                return res.status(200).send(ctx);
            } catch (err) { next(err); }
        });
        app.put('/app/restore/file', async (req, res, next) => {
            try {
                let opts = req.body;
                let results = await webApp.restoreServers(opts);
                return res.status(200).send(results);
            } catch (err) { next(err); }
        });
        app.put('/app/anslq25', async(req, res, next) => {
            try {
                await sys.anslq25Board.setAnslq25Async(req.body);
                return res.status(200).send(sys.anslq25.get(true));
            } catch (err) { next(err); }
        });
        app.delete('/app/anslq25', async(req, res, next) => {
            try {
                await sys.anslq25Board.deleteAnslq25Async(req.body);
                return res.status(200).send(sys.anslq25.get(true));
            } catch (err) { next(err); }
        });
    }
}