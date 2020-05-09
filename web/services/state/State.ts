import * as express from "express";
import { state, ICircuitState } from "../../../controller/State";
import { sys } from "../../../controller/Equipment";
import { utils } from '../../../controller/Constants';
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
        app.put('/state/circuit/toggleState', (req, res) => {
            state.circuits.toggleCircuitStateAsync(parseInt(req.body.id, 10));
            return res.status(200).send('OK');
        });
            app.put('/state/circuit/setTheme', (req, res) => {
            state.circuits.setLightTheme(parseInt(req.body.id, 10), parseInt(req.body.theme, 10));
            return res.status(200).send('OK');
        }); 
        app.put('/state/intellibrite/setTheme', (req, res) => {
            sys.board.circuits.setIntelliBriteThemeAsync(parseInt(req.body.theme, 10));
            return res.status(200).send('OK');
        });
        app.put('/state/circuit/setDimmerLevel', (req, res) => {
            state.circuits.setDimmerLevel(parseInt(req.body.id, 10), parseInt(req.body.level, 10));
            return res.status(200).send('OK');
        });
        app.put('/state/feature/setState', (req, res) => {
            state.features.setFeatureState(req.body.id, req.body.state);
            return res.status(200).send('OK');
        });
        app.put('/state/body/heatMode', (req, res) => {
            // todo: is body 0/1 as in the bodies object or should we also be able to reference this by circuit; 1=spa; 6=pool, etc.
            sys.bodies.setHeatMode(parseInt(req.body.id, 10), parseInt(req.body.mode, 10));
            return res.status(200).send('OK');
        });
        app.put('/state/body/setPoint', (req, res) => {
             // todo: is body 0/1 as in the bodies object or should we also be able to reference this by circuit; 1=spa; 6=pool, etc.
            sys.bodies.setHeatSetpoint(parseInt(req.body.id, 10), parseInt(req.body.setPoint, 10));
            return res.status(200).send('OK');
        });
        app.put('/state/chlorinator/setChlor', (req, res) => {
            state.chlorinators.setChlor(parseInt(req.body.id, 10), parseInt(req.body.poolSetpoint, 10), parseInt(req.body.spaSetpoint, 10), parseInt(req.body.superChlorHours, 10));
            sys.board.virtualChlorinatorController.checkTimer();
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
        app.put('/state/lightGroup/:id/colorSync', (req, res) => {
            sys.board.circuits.sequenceLightGroup(parseInt(req.params.id, 10), 'sync');
            return res.status(200).send('OK');
        });
        app.put('/state/lightGroup/:id/colorSet', (req, res) => {
            sys.board.circuits.sequenceLightGroup(parseInt(req.params.id, 10), 'set');
            return res.status(200).send('OK');
        });
        app.put('/state/lightGroup/:id/colorSwim', (req, res) => {
            sys.board.circuits.sequenceLightGroup(parseInt(req.params.id, 10), 'swim');
            return res.status(200).send('OK');
        });
        app.put('/state/intellibrite/colorSync', (req, res) => {
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
        });
        app.put('/state/circuit/setLightColor', (req, res) => {
            //RKS: This is fundamentally wrong.  These are light groups but Easy/Intelli Touch only have one light group.
            //state.circuits.setLightColor( parseInt( req.body.id, 10 ), parseInt( req.body.color, 10 ) );
            return res.status(404).send('NOT IMPLEMENTED');
        });
        app.put('/state/circuit/setLightSwimDelay', (req, res) => {
            //RKS: This is fundamentally wrong.  These are light groups but Easy/Intelli Touch only have one light group.
            //state.circuits.setLightSwimDelay( parseInt( req.body.id, 10 ), parseInt( req.body.delay, 10 ) );
            return res.status(404).send('NOT IMPLEMENTED');
        });
        app.put('/state/circuit/setLightPosition', (req, res) => {
            //RKS: This is fundamentally wrong.  These are light groups but Easy/Intelli Touch only have one light group.
            //state.circuits.setLightPosition( parseInt( req.body.id, 10 ), parseInt( req.body.color, 10 ) );
            return res.status(404).send('NOT IMPLEMENTED');
        });
        app.get('/state/:section', (req, res) => {
            res.status(200).send(state.getState(req.params.section));
        });
    }
}