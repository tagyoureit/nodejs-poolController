import * as express from "express";
import * as extend from 'extend';
import {sys, LightGroup, ControllerType, Pump} from "../../../controller/Equipment";
import {read} from "fs";
import { config } from "../../../config/Config";
import { logger } from "../../../logger/Logger";
export class ConfigRoute {
    public static initRoutes(app: express.Application) {
        app.get('/config/body/:body/heatModes', (req, res) => {
            return res.status(200).send(sys.bodies.getItemById(parseInt(req.params.body, 10)).getHeatModes());
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
            let _rate = parseInt(req.body.rate, 10);
            let _units = parseInt(req.body.units, 10); 
            let pumpCircuit = {
                pump: parseInt(req.params.id, 10),
                pumpCircuitId: isNaN(_pumpCircuitId) ? undefined : _pumpCircuitId,
                circuit: isNaN(_circuit) ? undefined : _circuit,
                rate: isNaN(_rate) ? undefined : _rate,
                units: isNaN(_units) ? undefined : _units
            };
            let { result, reason } = pump.setPumpCircuit(pumpCircuit);
            if (result === 'OK') 
                return res.status(200).send(result);
            else 
                return res.status(500).send(reason);
            
            // circuit rate
            // pump.setCircuitRate(parseInt(req.body.pumpCircuitId, 10), parseInt(req.body.rate, 10));
            // return res.status(200).send('OK');

            // circuit
            // pump.setCircuitId(parseInt(req.body.pumpCircuitId, 10), parseInt(req.body.circuitId, 10));
            // return res.status(200).send('OK');
            
            // circuit rate units
            // pump.setCircuitRateUnits(parseInt(req.body.pumpCircuitId, 10), parseInt(req.body.units, 10));
            // return res.status(200).send('OK');
        });
        app.delete('/config/pump/:id/pumpCircuit/:pumpCircuitId', (req, res) => {
            let pump = sys.pumps.getItemById(parseInt(req.params.id, 10));
            pump.circuits.removeItemById(parseInt(req.params.pumpCircuitId, 10));
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
            // RG - this was left as it's own end point because trying to combine changing the pump type (which requires resetting the pump values) while simultaneously setting new pump values was tricky. 
            let pump = sys.pumps.getItemById(parseInt(req.params.pumpId, 10));
            let _type = parseInt(req.body.pumpType, 10);
            if (_type !== pump.type) {
                //pump.clear();
                pump.setType(_type);
            }
            return res.status(200).send('OK');
        });
        app.get('/config/pump/:pumpId', (req, res) => {
            let pump = sys.pumps.getItemById(parseInt(req.params.pumpId, 10)).get(true);
            return res.status(200).send(pump);
        });
        app.put('/config/pump/:pumpId', (req, res) => {
            // this is for all pump properties EXCEPT changing type
            let pump = sys.pumps.getItemById(parseInt(req.params.pumpId, 10));
            // If other properties, now set them.
            if (Object.keys(req.body).length) pump.setPump(req.body);
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
        app.get('/app/config/:section', (req, res) => {
            return res.status(200).send(config.getSection(req.params.section));
        });
        app.put('/app/logger/setOptions', (req, res) => {
            logger.setOptions(req.body);
            return res.status(200).send('OK');
        });
        app.get('/app/messages/broadcast/actions', (req, res) => {
            return res.status(200).send(sys.board.valueMaps.msgBroadcastActions.toArray());
        });
    }
}