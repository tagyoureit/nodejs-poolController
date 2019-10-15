import * as express from "express";
import { sys } from "../../../controller/Equipment";
import { state } from "../../../controller/State";
import * as extend from 'extend';
export class ClassicRoute
{
    public static initRoutes ( app: express.Application )
    {
        app.put( '/circuit/:circuit/toggle', ( req, res ) =>
        {
            state.circuits.toggleCircuitState( parseInt( req.params.circuit, 10 ) );
            return res.status( 200 ).send( 'OK' );
        } );
        app.put( '/circuit/:circuit/set/:set', ( req, res ) =>
        {   
            let setBool: boolean;
            switch (req.params.set){
                case '1':
                case 'yes':
                case 'true':
                case 'y':
                case 'on':
                    setBool = true;
                    break;
                default:
                    setBool = false;
                    break;
            }
            if ( sys.circuits.getInterfaceById( parseInt( req.params.circuit, 10 ) ) )
            {
                // todo: make sure setCircut adheres to both circuit/features interface
                state.circuits.setCircuitState( parseInt( req.params.circuit, 10 ), setBool );
                return res.status( 200 ).send( 'OK - Circuit set.  Use /state/circuit/setState moving forward.' );
            }
        
        } );
        app.put( '/spaheat/setpoint/:setpoint', ( req, res ) =>
        {
            sys.bodies.setHeatSetpoint( 2, parseInt( req.params.setpoint, 10 ) );
            return res.status( 200 ).send( 'OK' );
        } );
        app.put( '/poolheat/setpoint/:setpoint', ( req, res ) =>
        {
            sys.bodies.setHeatSetpoint( 1, parseInt( req.params.setpoint, 10 ) );
            return res.status( 200 ).send( 'OK' );
        } );
        app.put( '/spaheat/mode/:heatmode', ( req, res ) =>
        {
            sys.bodies.setHeatMode( 2, parseInt( req.params.mode, 10 ) );
            return res.status( 200 ).send( 'OK' );
        } );
        app.put( '/poolheat/mode/:heatmode', ( req, res ) =>
        {
            sys.bodies.setHeatMode( 1, parseInt( req.params.mode, 10 ) );
            return res.status( 200 ).send( 'OK' );
        } );

        // Get Sections
        app.get( '/all', ( req, res ) =>
        {
            res.status( 200 ).send( extend( true, {}, sys.getSection(), state.getSection() ) );
        } );
        app.get( '/temperature', ( req, res ) =>
        {
            res.status( 200 ).send( state.getSection( 'temps' ) );
        } );
        app.get( '/circuit', ( req, res ) =>
        {
            res.status( 200 ).send( state.getSection( 'circuits' ) );
        } );
        app.get( '/schedule', ( req, res ) =>
        {
            res.status( 200 ).send( state.getSection( 'circuits' ) );
        } );
        app.get( '/chlorinator', ( req, res ) =>
        {
            res.status( 200 ).send( state.getSection( 'chlorinators' ) );
        } );
        app.get( '/pump', ( req, res ) =>
        {
            res.status( 200 ).send( state.getSection( 'pumps' ) );
        } );
        app.get( '/intellichem', ( req, res ) =>
        {
            res.status( 200 ).send( state.getSection( 'intellichem' ) );
        } );
        app.put( '/datetime/set/time/hour/:hour/min/:min/date/dow/:dow/day/:date/mon/:month/year/:year/dst/:dst', ( req, res ) =>
        {
            sys.updateControllerDateTime( parseInt( req.params.hour, 10 ), parseInt( req.params.min, 10 ), parseInt( req.params.date, 10 ), parseInt( req.params.month, 10 ), parseInt( req.params.year, 10 ), parseInt( req.params.dst, 10 ), parseInt( req.params.dow, 10 ) );
            return res.status( 200 ).send( 'OK' );
        } )


        // TODO:  Everything Below
        // reload - maybe not implement this?
        /*
app.get( '/schedule/toggle/id/:id/day/:_day', function ( req: { params: { id: string; _day: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            var id = parseInt( req.params.id );
            var day = parseInt( req.params._day );
            var response: API.Response = {};

            response.text = 'REST API received request to toggle day ' + day + ' on schedule with ID:' + id;
            logger.info( response );
            schedule.toggleDay( id, day );
            res.send( response );

        } );

        app.get( '/schedule/delete/id/:id', function ( req: { params: { id: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            var id = parseInt( req.params.id );
            var response: API.Response = {};
            response.text = 'REST API received request to delete schedule or egg timer with ID:' + id;
            logger.info( response );
            schedule.deleteScheduleOrEggTimer( id );
            res.send( response );
        } );

        app.get( '/schedule/set/id/:id/startOrEnd/:sOE/hour/:hour/min/:min', function ( req: { params: { id: string; hour: string; min: string; sOE: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            var id = parseInt( req.params.id );
            var hour = parseInt( req.params.hour );
            var min = parseInt( req.params.min );
            var response: API.Response = {};
            response.text = 'REST API received request to set ' + req.params.sOE + ' time on schedule with ID (' + id + ') to ' + hour + ':' + min;
            logger.info( response );
            schedule.setControllerScheduleStartOrEndTime( id, req.params.sOE, hour, min );
            res.send( response );
        } );

        app.get( '/schedule/set/id/:id/circuit/:circuit', function ( req: { params: { id: string; circuit: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            let _id = parseInt( req.params.id );
            let _circuit = parseInt( req.params.circuit );
            let _response: API.Response = {};
            _response.text = 'REST API received request to set circuit on schedule with ID (' + _id + ') to ' + circuit.getFriendlyName( _circuit )
            logger.info( _response )
            schedule.setControllerScheduleCircuit( _id, _circuit )
            res.send( _response )
        } )

        app.get( '/eggtimer/set/id/:id/circuit/:circuit/hour/:hour/min/:min', function ( req: { params: { id: string; circuit: string; hour: string; min: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            let _id = parseInt( req.params.id )
            let _circuit = parseInt( req.params.circuit )
            let _hr = parseInt( req.params.hour )
            let _min = parseInt( req.params.min )
            let _response: API.Response = {}
            _response.text = 'REST API received request to set eggtimer with ID (' + _id + '): ' + circuit.getFriendlyName( _circuit ) + ' for ' + _hr + ' hours, ' + _min + ' minutes'
            logger.info( _response )
            schedule.setControllerEggTimer( _id, _circuit, _hr, _min )
            res.send( _response )
        } )

        app.get( '/schedule/set/:id/:circuit/:starthh/:startmm/:endhh/:endmm/:days', function ( req: { params: { id: string; circuit: string; starthh: string; startmm: string; endhh: string; endmm: string; days: string; }; }, res: { send: ( arg0: API.Response ) => void; } )
        {
            var id = parseInt( req.params.id )
            var circuit = parseInt( req.params.circuit )
            var starthh = parseInt( req.params.starthh )
            var startmm = parseInt( req.params.startmm )
            var endhh = parseInt( req.params.endhh )
            var endmm = parseInt( req.params.endmm )
            var days = parseInt( req.params.days )
            var response: API.Response = {}
            response.text = 'REST API received request to set schedule ' + id + ' with values (start) ' + starthh + ':' + startmm + ' (end) ' + endhh + ':' + endmm + ' with days value ' + days
            logger.info( response )
            schedule.setControllerSchedule( id, circuit, starthh, startmm, endhh, endmm, days )
            res.send( response )
        } )
        */
    }
}