import * as express from "express";
import { state } from "../../../controller/State";
import { sys, Circuit } from "../../../controller/Equipment";
import { Enums } from '../../../controller/Constants';
export class UtilitiesRoute {
    public static initRoutes(app: express.Application) {

        // duplicate of State        
        // app.put('/state/circuit/setTheme', (req, res) => {
        //     state.circuits.setCircuitTheme(parseInt(req.body.id, 10), parseInt(req.body.theme, 10));
        //     return res.status(200).send('OK');
        // });


        // TODO:  All below
/*         app.get( '/device', function ( req: any, res: { set: ( arg0: string, arg1: string ) => void; send: ( arg0: string ) => void; } )
        {
            helpers.deviceXML()
                .then( function ( XML )
                {
                    res.set( 'Content-Type', 'text/xml' );
                    res.send( XML );
                } )

        } ); */

    }
}