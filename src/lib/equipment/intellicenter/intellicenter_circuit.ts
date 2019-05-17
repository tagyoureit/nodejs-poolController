/*  nodejs-poolController.  An application to control pool equipment.
 *  Copyright (C) 2016, 2017.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as
 *  published by the Free Software Foundation, either version 3 of the
 *  License, or (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import {logger, customNames, settings} from '../../../etc/internal';
import * as constants from '../../../etc/constants'


export namespace intellicenterCircuit
{

    class Circuit implements Circuit.CircuitClass
    {
        [ k: number ]: any,
        name: string;
        number: number;
        numberStr: string;
        circuitFunction: string;
        status: 0 | 1;
        freeze: 0 | 1;
        macro: number;
        friendlyName: string;
        delay: 0 | 1;
        light: Circuit.LightClass;

        constructor( circuitNum: number, nameByte?: number, functionByte?: number )
        {
            this.number = circuitNum; //1
            this.numberStr = 'circuit' + circuitNum;
            this.name = ''; //Pool
            this.circuitFunction = ''; //Generic, Light, etc
            this.status = 0; //0, 1
            this.freeze = 0; //0, 1
            this.macro = 0; //is the circuit a macro?
            this.delay = 0; //0 no delay, 1 in delay
        }

        setFunction ( functionByte: number )
        {
            this.circuitFunction = constants.strCircuitFunction[ functionByte & 63 ]
        }

        setFreeze ( functionByte: number )
        {
            //The &64 masks to 01000000 because it is the freeze protection bit
            this.freeze = ( ( functionByte & 64 ) === 64 ) ? 1 : 0
        }

        setName ( nameByte: number )
        {
            //if the ID of the circuit name is 1-101 then it is a standard name.  If it is 200-209 it is a custom name.  The mapping between the string value in the getCircuitNames and getCustomNames is 200.  So subtract 200 from the circuit name to get the id in the custom name array.
            // logger.info("Getting the name for circuit: %s \n\tThe circuit nameByte is: ", circuit, nameByte)
            if ( nameByte < 200 )
            {
                this.name = constants.strCircuitName[ nameByte ]
            } else
            {
                this.name = customNames.getCustomName( nameByte - 200 );
            }
        }

        setMacro ( functionByte: number )
        {
            this.macro = ( functionByte & 128 ) >> 7 === 0 ? 0 : 1; //1 or 0
        }

        assignCircuitVars ( circuitArrObj: Circuit.CircuitClass )
        {
            Object.assign( this, { ...circuitArrObj } )
            this.setCircuitFriendlyName()
        }

        private setCircuitFriendlyName ()
        {
            let configFriendlyName: string = settings.get( 'circuit.friendlyName' )[ this.number ]
            if ( configFriendlyName !== "" || this.circuitFunction === undefined )
                //for now, UI doesn't support renaming 'pool' or 'spa'.  Check for that here.
                if ( ( this.circuitFunction.toUpperCase() === "SPA" ) ||
                    this.circuitFunction.toUpperCase() === "POOL" )
                {
                    logger.warn( 'The %s circuit cannot be renamed at this time.  Skipping.', this.circuitFunction )
                    this.friendlyName = this.name

                } else
                {
                    this.friendlyName = configFriendlyName.toUpperCase()
                }
        }

        isLight (): boolean
        {

            // return true if circuitFunction is one of Light, SAM Light, SAL Light, Photon Gen, Color Wheel, Intellibrite
            //var circuitFunction = currentCircuitArrObj[ circuitNum ].circuitFunction
            return [ constants.strCircuitFunction[ 7 ],
            constants.strCircuitFunction[ 9 ],
            constants.strCircuitFunction[ 10 ],
            constants.strCircuitFunction[ 11 ],
            constants.strCircuitFunction[ 12 ],
            constants.strCircuitFunction[ 16 ] ].includes( this.circuitFunction )

            // return ['intellibrite', 'light', 'sam light', 'sal light', 'color wheel'].indexOf(circuitFunction) >= 0
        }


    }

    class Light implements Circuit.LightClass
    {
        position: number;
        colorStr: string;
        color: number;
        colorSet: number;
        colorSetStr: string;
        prevColor: number;
        prevColorStr: string;
        colorSwimDelay: number;
        mode: number;
        modeStr: string;
        prevMode: number;
        prevModeStr: string;

        constructor( position?: number, colorStr?: string, color?: number )
        {
            this.position = position;
            this.colorStr = colorStr;
            this.color = color;
            this.colorSet = 0;
            this.colorSetStr = 'White'
            this.prevColor = 0;
            this.prevColorStr = 'White';
            this.colorSwimDelay = 0;
            this.mode = 0;
            this.modeStr = 'Off';
        }
    }


    let currentCircuitArrObj: any = {}

    function customName ( nameBytes: number[] )
    {
        let _customName = ""
        for ( var i = 0; i < nameBytes.length; i++ )
        {
            if ( nameBytes[ i ] )
                _customName += String.fromCharCode( nameBytes[ i ] )
        }
        return _customName;
    }

    export function init ()
    {

    }

    export function updateCircuitFunction ( data: number[] )
    {
        let circFuncArray = data.slice( 8, data.length - 2 )
        let circFunctions = {}
        circFuncArray.forEach( ( el, idx ) =>
        {
            if ( !currentCircuitArrObj[ idx + 1 ] )
            {
                currentCircuitArrObj[ idx + 1 ] = new Circuit( idx + 1 )
            }
            Object.assign( currentCircuitArrObj[ idx + 1 ], { circuitFunction: constants.intellicenterCircuitFunctions[ el ] } )
        } )
        logger.info( 'INTELLICENTER: Circuit Functions Discovered: \n\t%s', circFuncArray )
    }

    export function updateCircuitName ( data: number[] )
    {
        let circ = data[ 7 ] - 2
        if ( !currentCircuitArrObj.circ )
        {
            currentCircuitArrObj[ circ ] = new Circuit( circ )
        }
        if ( !currentCircuitArrObj[ circ + 1 ] )
        {
            currentCircuitArrObj[ circ + 1 ] = new Circuit( circ )
        }

        const tempName1Bytes = data.slice( 8, 24 )
        const tempName2Bytes = data.slice( 24, 40 )
        const name1 = customName( tempName1Bytes )
        const name2 = customName( tempName2Bytes )
        Object.assign( currentCircuitArrObj[ circ ], { name: name1 } )
        Object.assign( currentCircuitArrObj[ circ + 1 ], { name: name2 } )

        logger.info( `INTELLICENTER: Circuit ${ circ } names: ${ name1 }, ${ name2 }` )
    }

    export function updateFreezeProtection ( data: number[] )
    {
        let freezeProt = data.slice( 8, data.length - 2 )

        freezeProt.forEach( ( el, idx ) =>
        {
            if ( !currentCircuitArrObj[ idx + 1 ] )
            {
                currentCircuitArrObj[ idx + 1 ] = new Circuit( idx + 1 )
            }
            Object.assign( currentCircuitArrObj[ idx + 1 ], { freeze: el } )
        } )
        logger.info( 'INTELLICENTER: Circuit Freeze Discovered: \n\t%s', freezeProt )
    }

    export function updateLightingScene ( data: number[] )
    {
        let lighting = data.slice( 8, data.length - 2 )
        lighting.forEach( ( el, idx ) =>
        {
            if ( !currentCircuitArrObj[ idx + 1 ].light )
            {
                currentCircuitArrObj[ idx + 1 ].light = new Light()
            }
            Object.assign( currentCircuitArrObj[ idx + 1 ].light, { colorSet: el } )
        } )
        logger.info( 'INTELLICENTER: Circuit Scene Lighting Discovered: \n\t%s', lighting )
    }

    function getCircuits ()
    {
        return currentCircuitArrObj
    }
}