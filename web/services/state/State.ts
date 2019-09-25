import * as express from "express";
import { state } from "../../../controller/State";
import { sys } from "../../../controller/Equipment";
export class StateRoute
{
    public static initRoutes ( app: express.Application )
    {
        app.get( '/state/:section', ( req, res ) =>
        {
            res.status( 200 ).send( state.getSection( req.params.section ) );
        } );
        app.get( '/state/chlorinator/:id', ( req, res ) =>
        {
            res.status( 200 ).send( state.chlorinators.getItemById( parseInt( req.params.id, 10 ) ).get() );
        } );
        app.get( '/state/circuit/:id', ( req, res ) =>
        {
            res.status( 200 ).send( state.circuits.getItemById( parseInt( req.params.id, 10 ) ).get() );
        } );
        app.get( '/state/pump/:id', ( req, res ) =>
        {
            let pump = state.pumps.getItemById( parseInt( req.params.id, 10 ) );
            return res.status( 200 ).send( pump.getExtended() );
        } );
        app.put( '/state/circuit/setState', ( req, res ) =>
        {
            state.circuits.setCircuitState( parseInt( req.body.id, 10 ), req.body.state );
            return res.status( 200 ).send( 'OK' );
        } );
        app.put( '/state/circuit/toggleState', ( req, res ) =>
        {
            state.circuits.toggleCircuitState( parseInt( req.body.id, 10 ) );
            return res.status( 200 ).send( 'OK' );
        } )
        app.put( '/state/circuit/setTheme', ( req, res ) =>
        {
            state.circuits.setLightTheme(parseInt(req.body.id, 10), parseInt(req.body.theme, 10));
            return res.status( 200 ).send( 'OK' );
        } );
        app.put( '/state/circuit/setDimmerLevel', ( req, res ) =>
        {
            state.circuits.setDimmerLevel( parseInt( req.body.id, 10 ), parseInt( req.body.level, 10 ) );
            return res.status( 200 ).send( 'OK' );
        } );
        app.put( '/state/feature/setState', ( req, res ) =>
        {
            state.features.setFeatureState( req.body.id, req.body.state );
            return res.status( 200 ).send( 'OK' );
        } );
        app.put( '/state/body/heatMode', ( req, res ) =>
        {
            sys.bodies.setHeatMode( parseInt( req.body.id, 10 ), parseInt( req.body.mode, 10 ) );
            return res.status( 200 ).send( 'OK' );
        } );
        app.put( '/state/body/setPoint', ( req, res ) =>
        {
            sys.bodies.setHeatSetpoint( parseInt( req.body.id, 10 ), parseInt( req.body.setPoint, 10 ) );
            return res.status( 200 ).send( 'OK' );
        } );
        app.put( '/state/chlorinator/setChlor', ( req, res ) =>
        {
            state.chlorinators.setChlor( parseInt( req.body.id, 10 ), parseInt( req.body.poolSetpoint, 10 ), parseInt(req.body.spaSetpoint, 10), parseInt(req.body.superChlorHours, 10) );
            return res.status( 200 ).send( 'OK' );
        } );
        app.put( '/state/chlorinator/poolSetpoint', ( req, res ) =>
        {
            state.chlorinators.setPoolSetpoint( parseInt( req.body.id, 10 ), parseInt( req.body.setPoint, 10 ) );
            return res.status( 200 ).send( 'OK' );
        } );
        app.put( '/state/chlorinator/spaSetpoint', ( req, res ) =>
        {
            state.chlorinators.setSpaSetpoint( parseInt( req.body.id, 10 ), parseInt( req.body.setPoint, 10 ) );
            return res.status( 200 ).send( 'OK' );
        } );
        app.put( '/state/chlorinator/superChlorHours', ( req, res ) =>
        {
            state.chlorinators.setSuperChlorHours( parseInt( req.body.id, 10 ), parseInt( req.body.hours, 10 ) );
            return res.status( 200 ).send( 'OK' );
        } );
        app.put( '/state/chlorinator/superChlorinate', ( req, res ) =>
        {
            state.chlorinators.superChlorinate( parseInt( req.body.id, 10 ), req.body.superChlorinate );
            return res.status( 200 ).send( 'OK' );
        } );
        app.put( '/state/cancelDelay', ( req, res ) =>
        {
            state.equipment.cancelDelay();
            return res.status( 200 ).send( 'OK' );
        } )
        app.put( '/state/circuit/setLightColor', ( req, res ) =>
        {
            //RKS: This is fundamentally wrong.  These are light groups but Easy/Intelli Touch only have one light group.
            //state.circuits.setLightColor( parseInt( req.body.id, 10 ), parseInt( req.body.color, 10 ) );
            return res.status(404).send('NOT IMPLEMENTED')
        })
        app.put( '/state/circuit/setLightSwimDelay', ( req, res ) =>
        {
            //RKS: This is fundamentally wrong.  These are light groups but Easy/Intelli Touch only have one light group.
            //state.circuits.setLightSwimDelay( parseInt( req.body.id, 10 ), parseInt( req.body.delay, 10 ) );
            return res.status(404).send('NOT IMPLEMENTED')
        })
        app.put( '/state/circuit/setLightPosition', ( req, res ) =>
        {
            //RKS: This is fundamentally wrong.  These are light groups but Easy/Intelli Touch only have one light group.
            //state.circuits.setLightPosition( parseInt( req.body.id, 10 ), parseInt( req.body.color, 10 ) );
            return res.status(404).send('NOT IMPLEMENTED')
        })
    }
}