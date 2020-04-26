import * as express from "express";
import * as extend from 'extend';
import { sys, LightGroup, ControllerType, Pump, Valve, Body, General, Circuit, ICircuit, Feature, CircuitGroup } from "../../../controller/Equipment";
import { config } from "../../../config/Config";
import { logger } from "../../../logger/Logger";
import { utils } from "../../../controller/Constants";
import { state } from "../../../controller/State";
export class ConfigRoute {
    public static initRoutes(app: express.Application) {
        app.get('/config/body/:body/heatModes', (req, res) => {
            return res.status(200).send(sys.bodies.getItemById(parseInt(req.params.body, 10)).getHeatModes());
        });
        app.get('/config/circuit/names', (req, res)=>{
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
                countries: [{ id: 1, name: 'United States' }, { id: 2, name: 'Mexico' }, { id: 3, name: 'Canada' }],
                tempUnits: sys.board.valueMaps.tempUnits.transform(state.temps.units),
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
                circuitGroups: sys.circuitGroups.get()
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
                lightGroups: sys.lightGroups.get()
            };
            return res.status(200).send(opts);
        });
        app.get('/config/options/features', (req, res) => {
            let opts = {
                maxFeatures: sys.equipment.maxFeatures,
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
            return res.status(200).send(opts);
        });
        app.get('/config/options/pumps', (req, res) => {
            let opts:any = {
                maxPumps: sys.equipment.maxPumps,
                pumpUnits: sys.board.valueMaps.pumpUnits.toArray(),
                pumpTypes: sys.board.valueMaps.pumpTypes.toArray(),
                circuits: sys.board.circuits.getCircuitReferences(true, true, true, true),
                pumps: sys.pumps.get()
            };
            if (sys.controllerType !== ControllerType.IntelliCenter){
                opts.circuitNames = sys.board.circuits.getCircuitNames();
            }
            return res.status(200).send(opts);
        });
        app.get('/config/options/schedules', (req, res) => {
            let opts = {
                maxSchedules: sys.equipment.maxSchedules,
                scheduleTimeTypes: sys.board.valueMaps.scheduleTimeTypes.toArray(),
                scheduleTypes: sys.board.valueMaps.scheduleTypes.toArray(),
                scheduleDays: sys.board.valueMaps.scheduleDays.toArray(),
                circuits: sys.board.circuits.getCircuitReferences(true, true, false, true),
                schedules: sys.schedules.get()
            };
            return res.status(200).send(opts);
        });
        app.get('/config/options/heaters', (req, res) => {
            let opts = {
                maxHeaters: sys.equipment.maxHeaters,
                heaters: sys.heaters.get(),
                heaterTypes: sys.board.valueMaps.heaterTypes.toArray()
            };
            return res.status(200).send(opts);
        });
        /******* END OF CONFIGURATION PICK LISTS/REFERENCES AND VALIDATION ***********/
        /******* ENDPOINTS FOR MODIFYING THE OUTDOOR CONTROL PANEL SETTINGS *********/
        app.put('/config/general', async (req, res, next) => {
            // Change the options for the pool.
            try {
                await sys.board.system.setGeneral(req.body);
                return res.status(200).send(sys.general.get());
            }
            catch (err) {
                console.log(err);
                next(err);
            }
        });
        app.put('/config/valve', async(req, res, next) => {
            // Update a valve.
            try {
                let valve = await sys.board.valves.setValve(req.body);
                return res.status(200).send((valve as Valve).get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/config/body', async (req, res, next) => {
            // Change the body attributes.
            try {
                let body = await sys.board.bodies.setBody(req.body);
                return res.status(200).send((body as Body).get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/config/circuit', async (req, res, next) => {
            // add/update a circuit
            try {
                let circuit = await sys.board.circuits.setCircuit(req.body);
                return res.status(200).send((circuit as ICircuit).get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/config/feature', async (req, res, next) => {
            // add/update a feature
            try {
                let feature = await sys.board.features.setFeature(req.body);
                return res.status(200).send((feature as Feature).get(true));
            }
            catch (err) { next(err); }
        });
        app.delete('/config/feature', async (req, res, next) => {
            // delete a feature
            try {
                let feature = await sys.board.features.deleteFeature(req.body);
                return res.status(200).send((feature as Feature).get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/config/circuitGroup', async (req, res, next) => {
            // add/update a circuitGroup
            try {
                let group = await sys.board.circuits.setCircuitGroup(req.body);
                return res.status(200).send((group as CircuitGroup).get(true));
            }
            catch (err) { next(err); }
        });
        app.delete('/config/circuitGroup', async (req, res, next) => {
            // add/update a circuitGroup
            try {
                let group = await sys.board.circuits.deleteCircuitGroup(req.body);
                return res.status(200).send((group as CircuitGroup).get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/config/lightGroup', async (req, res, next) => {
            // add/update a lightGroup
            try {
                let group = await sys.board.circuits.setLightGroup(req.body);
                return res.status(200).send((group as LightGroup).get(true));
            }
            catch (err) { next(err); }
        });
        app.put('/config/pump', async (req, res, next) => {
            // Change the pump attributes.  This will add the pump if it doesn't exist.
            try {
                let pump = await sys.board.pumps.setPumpConfig(req.body);
                return res.status(200).send((pump as Pump).get(true));
            }
            catch (err) { next(err); }
        });


        app.delete('/config/circuit', (req, res) => {
            // delete a circuit

            // deleteCircuit and setCircuit can prob be combined...
            sys.board.circuits.deleteCircuit(req.body);
            // RG: this was throwing a 500 error because we are waiting for the controller to respond
            // and this code is executing before we get the response
            // change to a callback(?)
            // if (sys.circuits.getInterfaceById(parseInt(req.body.id)).isActive)
            // return res.status(500).send({result: 'Error', reason: 'Unknown'});
            // else
            return res.status(200).send('OK');
        });
        app.get('/config/circuits/names', (req, res)=>{
            let circuitNames = sys.board.circuits.getCircuitNames();
            return res.status(200).send(circuitNames);
        });
        app.get('/config/circuit/functions', (req, res)=>{
            let circuitFunctions = sys.board.circuits.getCircuitFunctions();
            return res.status(200).send(circuitFunctions);
        });
        app.get('/config/features/functions', (req, res)=>{
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
        app.get('/config/pump/:id/circuits', (req, res) => {
            return res.status(200).send(sys.pumps.getItemById(parseInt(req.params.id, 10)).get().circuits);
        });
        app.get('/config/pump/availableCircuits', (req, res) => {
            return res.status(200).send( sys.board.pumps.availableCircuits());
        });
        app.get('/config/pump/:id/circuit/:circuitid', (req, res) => {
            return res.status(200).send(sys.pumps.getItemById(parseInt(req.params.id, 10)).get().circuits[parseInt(req.params.circuitid, 10)]);
        });
        app.get('/config/pump/:id/nextAvailablePumpCircuit', (req, res) => {
            // if no pumpCircuitId is available, 0 will be returned
            let _id = sys.pumps.getItemById(parseInt(req.params.id, 10)).nextAvailablePumpCircuit();
            return res.status(200).send(_id.toString());
        });
        app.put('/config/pump/:id/pumpCircuit', (req, res) => {
            // if no pumpCircuitId is specified, set it as 0 and take the next available one
            req.url = `${req.url}/0`;
            req.next();
        });
        app.put('/config/pump/:id/pumpCircuit/:pumpCircuitId', (req, res) => {
            // RSG - do we want a /config/pump/:id/pumpCircuit/ that will just assume the next circuit?
            let pump = sys.pumps.getItemById(parseInt(req.params.id, 10));
            let _pumpCircuitId = parseInt(req.params.pumpCircuitId, 10);
            let _circuit = parseInt(req.body.circuit, 10);
            let _rate = parseInt(req.body.rate, 10) || 1000;
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
                return res.status(200).send({result: result, reason: reason});
            else 
                return res.status(500).send({result: result, reason: reason});
        });
        app.delete('/config/pump/:id/pumpCircuit/:pumpCircuitId', (req, res) => {
            let pump = sys.pumps.getItemById(parseInt(req.params.id, 10));
            // pump.circuits.removeItemById(parseInt(req.params.pumpCircuitId, 10));
            pump.deletePumpCircuit(parseInt(req.params.pumpCircuitId, 10));
            return res.status(200).send('OK');
        });
        app.get('/config/pump/types', (req, res) => {
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
            if (!Array.isArray(pumpTypes)) pumpTypes = [ pumpTypes ];
            return res.status(200).send(pumpTypes);
        });
        app.put('/config/pump/:pumpId/type', (req, res) => {
            const _type = parseInt(req.body.pumpType, 10);
            const _pumpId = parseInt(req.params.pumpId, 10);
            // RG - this was left as it's own end point because trying to combine changing the pump type (which requires resetting the pump values) while simultaneously setting new pump values was tricky. 
            let pump = sys.pumps.getItemById(_pumpId);
            if (sys.controllerType === ControllerType.Virtual){
                pump.isVirtual = true;
            }
            if (_type !== pump.type) {
                pump.setType(_type);
            }
            return res.status(200).send('OK');
        });
        app.get('/config/pump/:pumpId', (req, res) => {
            let pump = sys.pumps.getItemById(parseInt(req.params.pumpId, 10)).get(true);
            return res.status(200).send(pump);
        });
        app.put('/config/pump/:pumpId', (req, res) => {
            // this will change the pump type
            let _type = parseInt(req.body.pumpType, 10);
            let pump = sys.pumps.getItemById(parseInt(req.params.pumpId, 10));
            if (sys.controllerType === ControllerType.Virtual){
                // if virtualController, add the virtual pump
                pump.isVirtual = true;
            }

            if (_type !== pump.type  && typeof _type !== 'undefined') {
                pump.setType(_type);
            }
            // get a new instance of the pump here because setType will remove/add a new instance
            if (Object.keys(req.body).length) sys.pumps.getItemById(parseInt(req.params.pumpId, 10)).setPump(req.body);
            return res.status(200).send('OK');
        });
        app.delete('/config/pump/:pumpId', (req, res) => {
            let pump = sys.pumps.getItemById(parseInt(req.params.pumpId, 10));
            if (pump.type === 0) {
                return res.status(500).send(`Pump ${pump.id} not active`);    
            }
            pump.setType(0);
            return res.status(200).send('OK');
        });
        app.get('/config/schedule/:id', (req, res) => {
            let schedId = parseInt(req.params.id || '0', 10);
            let sched = sys.schedules.getItemById(schedId).get(true);
            return res.status(200).send(sched);
        });
        app.put('/config/schedule/:id', (req, res) => {
            let schedId = parseInt(req.params.id || '0', 10);
            let eggTimer = sys.eggTimers.getItemById(schedId);
            let sched = sys.schedules.getItemById(schedId);
            if (eggTimer.circuit) eggTimer.set(req.body);
            else if (sched.circuit) sched.set(req.body);
            else return res.status(500).send('Not a valid id');
            return res.status(200).send('OK');
        });
        app.delete('/config/schedule/:id', (req, res) => {
            let schedId = parseInt(req.params.id || '0', 10);
            let eggTimer = sys.eggTimers.getItemById(schedId);
            let sched = sys.schedules.getItemById(schedId);
            if (eggTimer.circuit) eggTimer.delete();
            else if (sched.circuit) sched.delete();
            else return res.status(500).send('Not a valid id');
            return res.status(200).send('OK');
        });
        app.put('/config/dateTime', (req, res) => {
            sys.updateControllerDateTime(req.body);
            return res.status(200).send('OK');
        });
        app.get('/config/DaysOfWeek', (req, res) => {
            let dow = sys.board.system.getDOW();
            return res.status(200).send(dow);
        });
        app.get('/config/lightGroups/themes', (req, res) => {
            // RSG: is this and /config/circuit/:id/lightThemes both needed?
            // todo: if no intellibrite/lightThemes are available is [] returned?
            if (sys.controllerType === ControllerType.IntelliCenter){
                let grp = sys.lightGroups.getItemById(parseInt(req.params.id, 10));
                return res.status(200).send(grp.getLightThemes());
            }
            else
            return res.status(200).send(sys.intellibrite.getLightThemes());
        });
        app.get('/config/lightGroup/:id', (req, res) => {
            if (sys.controllerType === ControllerType.IntelliCenter){  
                let grp = sys.lightGroups.getItemById(parseInt(req.params.id, 10));
                return res.status(200).send(grp.getExtended());
            }
            else    
                return res.status(200).send(sys.intellibrite.getExtended());
        });
        app.get('/config/lightGroup/colors', (req, res) => {
            return res.status(200).send(sys.board.valueMaps.lightColors.toArray());
        });
        app.put('/config/lightGroup/:id/setColors', (req, res) => {
            let grp = extend(true, {id: parseInt(req.params.id, 10)}, req.body);
            sys.board.circuits.setLightGroupColors(new LightGroup(grp));
            return res.status(200).send('OK');
        });
        app.get('/config/intellibrite/themes', (req, res) => {
            return res.status(200).send(sys.intellibrite.getLightThemes());
        });
        app.get('/config/circuitGroup/:id', (req, res) => {
            let grp = sys.circuitGroups.getItemById(parseInt(req.params.id, 10));
            return res.status(200).send(grp.getExtended());
        });
        app.get('/config/intellibrite', (req, res) => {
            return res.status(200).send(sys.intellibrite.getExtended());
        });
        app.get('/config/intellibrite/colors', (req, res) => {
            return res.status(200).send(sys.board.valueMaps.lightColors.toArray());
        });
        app.put('/config/intellibrite/setColors', (req, res) => {
            let grp = extend(true, {id: 0}, req.body);
            sys.board.circuits.setIntelliBriteColors(new LightGroup(grp));
            return res.status(200).send('OK');
        });
        app.get('/config', (req, res) => {
            return res.status(200).send(sys.getSection('all'));
        });
        app.get('/config/:section', (req, res) => {
            return res.status(200).send(sys.getSection(req.params.section));
        });


        /******* ENDPOINTS FOR MANAGING THE poolController APPLICATION *********/
        app.get('/app/config/:section', (req, res) => {
            return res.status(200).send(config.getSection(req.params.section));
        });
        app.put('/app/logger/setOptions', (req, res) => {
            logger.setOptions(req.body);
            return res.status(200).send('OK');
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


    }
}