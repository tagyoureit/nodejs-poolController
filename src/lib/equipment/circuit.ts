//  nodejs-poolController.  An application to control pool equipment.
//  Copyright (C) 2016, 2017, 2018, 2019.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU Affero General Public License as
//  published by the Free Software Foundation, either version 3 of the
//  License, or (at your option) any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU Affero General Public License for more details.
//
//  You should have received a copy of the GNU Affero General Public License
//  along with this program.  If not, see <http://www.gnu.org/licenses/>.




import { settings, logger, customNames, intellitouch, queuePacket, temperature, io, influx } from '../../etc/internal';
import * as constants from '../../etc/constants';

import * as deepdiff from 'deep-diff';
var _ = require( 'underscore' );

export namespace circuit
{

    class LightGroup implements Circuit.ILightGroups
    {
        [ key: number ]: any;
        circuit: number;
        position: number;
        colorSet: number;
        colorSetStr: string;
        colorSwimDelay: number;
        constructor(
            circuit: number, position: number, colorSet: number, colorSetStr: string, colorSwimDelay: number
        )
        {
            this.circuit = circuit
            this.position = position
            this.colorSet = colorSet
            this.colorSetStr = colorSetStr
            this.colorSwimDelay = colorSwimDelay
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

    var currentCircuitArrObj: Circuit.ICurrentCircuits = {},
        lightGroups: Circuit.ILightGroups = {},
        lightGroupPackets: Circuit.ILightGroupPackets =
        {
            'numPackets': 1
        },
        numberOfCircuits = 20



    class Circuit implements Circuit.CircuitClass
    {
        [ k: number ]: any;
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
            this.number = circuitNum;
            this.numberStr = 'circuit' + circuitNum
            if ( functionByte !== undefined )
            {
                this.setFreeze( functionByte );
                this.setMacro( functionByte );
                this.setFunction( functionByte );
            }
            if ( nameByte !== undefined )
                this.setName( nameByte );
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
            this.friendlyName = this.name // set default, then override if we have a friendlyName
            let configFriendlyName: string = settings.get( 'circuit.friendlyName' )[ this.number ]
            if ( configFriendlyName !== "" || this.circuitFunction === undefined )
                //for now, UI doesn't support renaming 'pool' or 'spa'.  Check for that here.
                if ( ( this.circuitFunction.toUpperCase() === "SPA" ) ||
                    this.circuitFunction.toUpperCase() === "POOL" )
                {
                    logger.warn( 'The %s circuit cannot be renamed at this time.  Skipping.', this.circuitFunction )
                    // this.friendlyName = this.name

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

    class CurrentStatusBytes
    {
        currentStatusBytes: number[];
        constructor()
        {
            this.currentStatusBytes = []
        }

        get ()
        {
            return this.currentStatusBytes
        }

        set ( data: Circuit.Packet, counter: number )
        {

            this.currentStatusBytes = [ ...data ]
        }

        reset ()
        {
            this.currentStatusBytes = []
        }
    }
    /*istanbul ignore next */
    // if ( logModuleLoading )
    //     logger.info( 'Loading: circuit.js' )

    var logIntellibrite: 0 | 1 = 0


    var sendInitialBroadcast = {
        "haveCircuitStatus": 0,
        "haveCircuitNames": 0,
        "initialCircuitsBroadcast": 0
    }




    //persistent variable to hold full bytes of pool status
    const currentStatusBytes = new CurrentStatusBytes()

    export function init (): void
    {
        logIntellibrite = settings.get( 'logIntellibrite' )
        checkFriendlyNamesInConfig()
        currentStatusBytes.reset()
        lightGroups = {  }
        lightGroupPackets = { numPackets: 1 }
        numberOfCircuits = settings.get( 'equipment.controller.intellitouch.numberOfCircuits' )
        for ( var i = 1; i <= numberOfCircuits; i++ )
        {
            currentCircuitArrObj[ i ] = new Circuit( i )
        }
    }

    // add additional slots for friendly names in the config file if there are more circuits 
    // then friendlyNames.
    export function checkFriendlyNamesInConfig (): void
    {
        var configFriendlyNames = settings.get( 'equipment.circuit.friendlyName' )
        var expectedCountFriendlyNames = settings.get( 'equipment.controller.intellitouch.numberOfCircuits' )
        var existingCountFriendlyNames = _.size( configFriendlyNames )
        if ( existingCountFriendlyNames < expectedCountFriendlyNames )
        {
            for ( var i = existingCountFriendlyNames + 1; i <= expectedCountFriendlyNames; i++ )
            {
                configFriendlyNames[ i ] = ""
            }
            settings.set( 'equipment.circuit.friendlyName', configFriendlyNames )
            logger.info( 'Just expanded %s to include additional friendlyNames for circuits.', settings.get( 'configurationFileLocation' ) )
        }
    }


    export function pad ( num: number, size: number ): string
    {
        //makes any digit returned as a string of length size (for outputting formatted byte text)
        var s = "   " + num;
        return s.substr( s.length - size );
    }

    export function printStatus ( data1: Circuit.Packet, data2?: Circuit.Packet ): string
    {

        var str1: any = ''
        var str2: any = ''
        var str3: any = ''

        str1 = JSON.parse( JSON.stringify( data1 ) );
        if ( data2 !== undefined ) str2 = JSON.parse( JSON.stringify( data2 ) );
        str3 = ''; //delta
        var spacepadding = '';
        var spacepaddingNum = 19;
        for ( var i = 0; i <= spacepaddingNum; i++ )
        {
            spacepadding += ' ';
        }


        var header = '\n';
        header += ( spacepadding + '              S       L                                           V           H   P   S   H       A   S           H\n' );
        header += ( spacepadding + '              O       E           M   M   M                       A       D   T   OO  P   T       I   O           E\n' );
        header += ( spacepadding + '          D   U       N   H       O   O   O                   U   L       E   R   L   A   R       R   L           A                           C   C\n' );
        header += ( spacepadding + '          E   R   C   G   O   M   D   D   D                   O   V       L   M   T   T   _       T   T           T                           H   H\n' );
        header += ( spacepadding + '          S   C   M   T   U   I   E   E   E                   M   E       A   D   M   M   O       M   M           M                           K   K\n' );
        header += ( spacepadding + '          T   E   D   H   R   N   1   2   3                       S       Y   E   P   P   N       P   P           D                           H   L\n' );
        //                    e.g.  165, xx, 15, 16,  2, 29, 11, 33, 32,  0,  0,  0,  0,  0,  0,  0, 51,  0, 64,  4, 79, 79, 32,  0, 69,102,  0,  0,  7,  0,  0,182,215,  0, 13,  4,186


        //format status1 so numbers are three digits
        for ( i = 0; i < str1.length - 1; i++ )
        {
            str1[ i ] = pad( str1[ i ], 3 );
        }

        //compare arrays so we can mark which are different
        //doing string 2 first so we can compare string arrays
        if ( data2 !== undefined )
        {
            for ( i = 0; i < str2.length - 1; i++ )
            {
                if ( data1[ i ] === data2[ i ] )
                {
                    str3 += '    '
                } else
                {
                    str3 += '   *'
                }
                str2[ i ] = pad( str2[ i ], 3 );
            }
            str1 = 'Orig: ' + spacepadding.substr( 6 ) + str1 + '\n';
            str2 = ' New: ' + spacepadding.substr( 6 ) + str2 + '\n'
            str3 = 'Diff:' + spacepadding.substr( 6 ) + str3 + '\n'
        } else
        {
            str1 = ' New: ' + spacepadding.substr( 6 ) + str1 + '\n';
            str2 = ''
        }
        var str = header + str1 + str2 + str3;

        return ( str );
    }

    function statusToString ( status: number ): 'on' | 'off'
    {
        if ( status === 1 )
            return 'on'
        else
        {
            return 'off'
        }
    }

    export function outputInitialCircuitsDiscovered (): void
    {
        var circuitStr = '';
        for ( var i = 1; i <= numberOfCircuits; i++ )
        {
            circuitStr += 'Circuit ' + currentCircuitArrObj[ i ].number + ': ' + currentCircuitArrObj[ i ].name
            circuitStr += ' Function: ' + currentCircuitArrObj[ i ].circuitFunction
            if ( currentCircuitArrObj[ i ].status === undefined )
            {
                circuitStr += ' Status: (not received yet)'
            } else
            {
                circuitStr += ' Status: ' + currentCircuitArrObj[ i ].status
            }
            circuitStr += ' Freeze Protection: '
            circuitStr += statusToString( currentCircuitArrObj[ i ].freeze )
            circuitStr += ' Macro: ' + currentCircuitArrObj[ i ].macro
            circuitStr += '\n'
        }
        logger.info( '\n  Circuit Array Discovered from configuration: \n%s \n', circuitStr )
        emit()
    }

    export function doWeHaveAllInformation (): void
    {
        //simple function to see if we have both the circuit names & status (come from 2 different sets of packets)
        if ( sendInitialBroadcast.haveCircuitNames === 1 && sendInitialBroadcast.haveCircuitStatus === 1 )
        {
            outputInitialCircuitsDiscovered()
            sendInitialBroadcast.initialCircuitsBroadcast = 1
        }

    }

    function circuitChanged ( circuit: number, circuitArrObj: Circuit.CircuitClass, counter: number )
    {
        // redo this output...

        /*   var results = currentCircuitArrObj[ circuit ].whatsDifferent( circuitArrObj );
          if ( !( results === "Nothing!" || currentCircuitArrObj[ circuit ].name === 'NOT USED' ) )
          {
              logger.verbose( 'Msg# %s   Circuit %s change:  %s', counter, circuitArrObj.name, results )
  
              if ( settings.get( 'logConfigMessages' ) )
              {
  
                  if ( circuitArrObj.status === undefined )
                  {
                      logger.debug( `Msg# ${ counter }  Circuit ${ circuit }:   Name: ${ currentCircuitArrObj[ circuit ].name }  Function: ${ currentCircuitArrObj[ circuit ].circuitFunction }  Status: (not received yet)  Freeze Protection: ${ currentCircuitArrObj[ circuit ].freeze }` )
                  } else
                  {
                      logger.debug( `Msg# ${ counter }  Circuit ${ circuit }:   Name: ${ currentCircuitArrObj[ circuit ].name }  Function: ${ currentCircuitArrObj[ circuit ].circuitFunction }  Status: ${ currentCircuitArrObj[ circuit ].status }  Freeze Protection: ${ currentCircuitArrObj[ circuit ].freeze }` )
                  }
              }
              io.io.emitToClients( 'circuit' );
  
              // testing... do we move to a monolith?
              io.io.emitToClients( 'all' );
  
          }
          if ( sendInitialBroadcast.initialCircuitsBroadcast === 1 ) influx.writeCircuit( currentCircuitArrObj ) */
    }


    export function getCircuit ( circuit: number ): Circuit.CircuitClass
    {
        return currentCircuitArrObj[ circuit ]
    }


    export function getCircuitName ( circuit: number )
    {

        try
        {
            if ( circuit >= 1 && circuit <= numberOfCircuits )
            {
                return currentCircuitArrObj[ circuit ].name
            }
        }
        catch ( err )
        {
            logger.warn( 'Tried to retrieve circuit %s which is not a valid circuit.', circuit )
            return 'No valid circuit (' + circuit + ')'
        }

    }

    //external method to return the friendlyName
    export function getFriendlyName ( circuit: number ): string
    {
        try
        {
            if ( circuit >= 1 && circuit <= numberOfCircuits )
            {

                if ( currentCircuitArrObj[ circuit ].friendlyName === undefined )
                {
                    if ( currentCircuitArrObj[ circuit ].name.includes( 'notset' ) )
                    {
                        return currentCircuitArrObj[ circuit ].numberStr
                    }
                    else
                    {
                        return currentCircuitArrObj[ circuit ].name
                    }
                }
                else
                {
                    return currentCircuitArrObj[ circuit ].friendlyName
                }
            }
            else
            {
                return constants.strCircuitFunction[ circuit ]
            }
        }

        catch
        ( err )
        {
            logger.warn( 'Tried to retrieve circuit %s which is not a valid circuit.', circuit )
            return 'No valid circuit (' + circuit + ')'
        }

    }

    export function getAllNonLightCircuits (): { [ key: number ]: any, circuitName: string }
    {
        var tempObj: any = {}
        for ( var key in currentCircuitArrObj )
        {
            if ( currentCircuitArrObj[ key ].circuitFunction !== undefined )
            {
                if ( currentCircuitArrObj[ key ].name !== "NOT USED" )
                {
                    if ( [ 'intellibrite', 'light', 'sam light', 'sal light', 'color wheel' ].indexOf( currentCircuitArrObj[ key ].circuitFunction.toLowerCase() ) === -1 )
                    {
                        tempObj[ key ] = {
                            "circuitName": currentCircuitArrObj[ key ].friendlyName
                        }
                    }
                }
            }
        }
        return tempObj
    }

    export function getAllLightCircuits (): { [ key: number ]: any, circuitName: string }
    {
        var tempObj: any = {}
        for ( var key in currentCircuitArrObj )
        {
            if ( currentCircuitArrObj[ key ].circuitFunction !== undefined || currentCircuitArrObj[ key ].name === "NOT USED" )
            {
                if ( currentCircuitArrObj[ key ].isLight() )
                {
                    tempObj[ key ] = {
                        //"circuitFunction": currentCircuitArrObj[key].circuitFunction,
                        "circuitName": currentCircuitArrObj[ key ].friendlyName
                    }
                }
            }
        }
        return tempObj
    }

    export function poolOrSpaIsOn ()
    {
        // return all non-light circuits
        const circuit = getAllNonLightCircuits()

        // loop through the circuits
        for ( var circuitNum in circuit )
        {
            if ( circuit[ circuitNum ].circuitName === "POOL" || circuit[ circuitNum ].circuitName === 'SPA' )
            {
                if ( circuit[ circuitNum ].status )
                {
                    return true
                }
            }
        }
        return false
    }



    // this function assigns circuit name, function, etc from Packet #11
    export function setCircuitFromController ( circuit: number, nameByte: number, functionByte: number, counter: number ): void
    {
        if ( circuit <= numberOfCircuits )
        {

            let circuitArrObj: Circuit.CircuitClass = new Circuit( circuit, nameByte, functionByte );

            if ( currentCircuitArrObj[ circuit ].name === undefined )
            {
                //logger.info("Assigning circuit %s the function %s based on value %s\n\t", circuit, circuitArrObj.circuitFunction, functionByte & 63)
                //assignCircuitVars( circuit, circuitArrObj )
                currentCircuitArrObj[ circuit ].assignCircuitVars( circuitArrObj )
                // assign .light if Intellibrite
                if ( currentCircuitArrObj[ circuit ].circuitFunction === constants.strCircuitFunction[ 16 ] )
                {
                    currentCircuitArrObj[ circuit ].light = new Light()
                }
            }

            if ( circuit === numberOfCircuits && sendInitialBroadcast.haveCircuitNames === 0 )
            {
                sendInitialBroadcast.haveCircuitNames = 1

                doWeHaveAllInformation()
            } else if ( sendInitialBroadcast.initialCircuitsBroadcast === 1 )
            {


                if ( JSON.stringify( currentCircuitArrObj[ circuit ] ) === JSON.stringify( circuit ) )
                {
                    circuitChanged( circuit, circuitArrObj, counter )
                    //assignCircuitVars( circuit, circuitArrObj )
                    currentCircuitArrObj[ circuit ].assignCircuitVars( circuitArrObj )
                } else
                {
                    logger.debug( 'Msg# %s No change in circuit %s', counter, circuit )
                }

            }
            if ( sendInitialBroadcast.initialCircuitsBroadcast === 1 ) influx.writeCircuit( currentCircuitArrObj )
        }
        else
        {
            logger.warn( 'Equipment is requesting status for circuit %s, but only %s are configured in the app.\nConfig file updated, please restart app.', circuit, numberOfCircuits )
            settings.set( 'equipment.controller.intellitouch.numberOfCircuits', circuit )

        }

    }

    // this function assigns circuit delays from Controller Packet #2
    export function assignCircuitDelayFromControllerStatus ( _delay: number, counter: number ): void
    {
        for ( var i = 1; i <= numberOfCircuits; i++ )
        {
            if ( currentCircuitArrObj[ i ].delay === undefined )
            {
                if ( i === _delay )
                {
                    currentCircuitArrObj[ i ].delay = 1
                } else
                {
                    currentCircuitArrObj[ i ].delay = 0
                }
            } else if ( i === _delay )
            {
                if ( currentCircuitArrObj[ i ].delay === 0 )
                {
                    // change in delay from 'no delay' to delay
                    if ( settings.get( 'logConfigMessages' ) ) logger.info( 'Msg# %s   Delay for Circuit %s changed from :  No Delay --> Delay', counter, i )
                    currentCircuitArrObj[ i ].delay = 1
                    emit()
                }
                // else if (currentCircuitArrObj[i].delay === 1) then no change
            } else if ( i !== _delay )
            {
                if ( currentCircuitArrObj[ i ].delay === 1 )
                {
                    // change in delay from delay to 'no delay'
                    if ( settings.get( 'logConfigMessages' ) ) logger.info( 'Msg# %s   Delay for Circuit %s changed from :  Delay --> No Delay', counter, i )
                    currentCircuitArrObj[ i ].delay = 0
                    emit()
                }

            }

        }
    }

    // this function takes the status packet (controller:2) and parses through the equipment fields
    export function assignCircuitStatusFromControllerStatus ( data: any[] | number[], counter: number ): void
    {
        //let circuitArrObj:{ [index:string] : {status: number} } = [];
        let circuitArrObj: Circuit.Status = {}

        var byteCount = Math.floor( numberOfCircuits / 8 );

        for ( var i = 0; i <= byteCount; i++ )
        {
            for ( var j = 0; j < 8; j++ )
            {
                if ( ( j + ( i * 8 ) + 1 ) <= numberOfCircuits )
                {
                    var equip = data[ constants.controllerStatusPacketFields.EQUIP1 + i ]
                    // if (settings.logMessageDecoding)
                    //     logger.silly('Decode Case 2:   i: %s  j:  %s  j + (i * 8) + 1: %s   equip: %s', i, j, j + (i * 8) + 1, equip)

                    circuitArrObj[ j + ( i * 8 ) + 1 ] = { status: ( equip & ( 1 << ( j ) ) ) >> j ? 1 : 0 }
                    if ( settings.get( 'logConfigMessages' ) ) logger.silly( 'Msg# %s   Circuit %s state discovered:  %s', counter, j + ( i * 8 ) + 1, circuitArrObj[ j + ( i * 8 ) + 1 ].status )
                }
            }
        }
        if ( currentCircuitArrObj[ 1 ].status === undefined )
        {
            sendInitialBroadcast.haveCircuitStatus = 1
            //copy all states

            for ( i = 1; i <= numberOfCircuits; i++ )
            {
                currentCircuitArrObj[ i ].status = circuitArrObj[ i ].status
            }

            doWeHaveAllInformation()
        } else
            for ( i = 1; i <= numberOfCircuits; i++ )
            {
                if ( currentCircuitArrObj[ i ].status === circuitArrObj[ i ].status )
                {
                    //nothing changed
                    if ( settings.get( 'logMessageDecoding' ) )
                    {
                        if ( sendInitialBroadcast.haveCircuitNames )
                        {
                            logger.silly( 'Msg# %s   NO change in circuit %s', counter, currentCircuitArrObj[ i ].name )
                        } else
                        {
                            logger.silly( 'Msg# %s   NO change in circuit %s', counter, i )
                        }
                    }
                } else
                {

                    if ( settings.get( 'logMessageDecoding' ) )
                    {

                        var results = "Status: " + statusToString( currentCircuitArrObj[ i ].status ) + " --> " + statusToString( circuitArrObj[ i ].status )
                        if ( sendInitialBroadcast.haveCircuitNames )
                        {



                            logger.verbose( 'Msg# %s   Circuit %s change:  %s', counter, currentCircuitArrObj[ i ].name, results )
                        } else
                        {
                            logger.verbose( 'Msg# %s   Circuit %s change:  %s', counter, i, results )

                        }
                    }
                    // save last known temp if state changes to off
                    if ( currentCircuitArrObj[ i ].circuitFunction.toUpperCase() === "SPA" || currentCircuitArrObj[ i ].circuitFunction.toUpperCase() === "POOL" )
                    {
                        if ( currentCircuitArrObj[ i ].status ) // prior status is on
                        {
                            //saveLastKnownTemp( currentCircuitArrObj[ i ] )
                            temperature.saveLastKnownTemp( currentCircuitArrObj[ i ].circuitFunction )
                        }
                    }
                    currentCircuitArrObj[ i ].status = circuitArrObj[ i ].status
                    emit()
                }
            }
        if ( sendInitialBroadcast.initialCircuitsBroadcast === 1 ) influx.writeCircuit( currentCircuitArrObj )

    }

    function emit ()
    {
        io.emitToClients( 'circuit', { circuit: currentCircuitArrObj } )
    }

    export function requestUpdateCircuit ( source: number, dest: number, circuit: number, action: number, counter: number ): void
    {
        //this is for the request.  Not actual confirmation of circuit update.  So we don't update the object here.
        try
        {
            var status = statusToString( action )
            logger.info( 'Msg# %s   %s --> %s: Change %s to %s', counter, constants.ctrlString[ source ], constants.ctrlString[ dest ], currentCircuitArrObj[ circuit ].name, status )
        } catch ( err )
        {
            logger.error( "We hit an error trying to retrieve circuit: %s, action: %s, at message: %s", circuit, action, counter )
        }

    }

    export function getCurrentCircuits (): { [ key: string ]: any, circuit: Circuit.ICurrentCircuits }
    {
        return { 'circuit': currentCircuitArrObj }
    }


    export function toggleCircuit ( circuit: number, callback?: any ): void
    {
        try
        {
            var desiredStatus = currentCircuitArrObj[ circuit ].status === 1 ? 0 : 1;
            var toggleCircuitPacket = [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 134, 2, circuit, desiredStatus ];
            queuePacket.queuePacket( toggleCircuitPacket );
            var response: API.Response = {}
            response.text = 'User request to toggle ' + currentCircuitArrObj[ circuit ].name + ' to '
            response.text += statusToString( desiredStatus )
            response.status = desiredStatus === 1 ? 'on' : 'off';
            response.value = desiredStatus
            logger.info( JSON.stringify( response, null, 2 ) )
            //callback will be present when we are responding back to the Express auth and showing the user a message.  But not with SocketIO call where we will just log it.
            if ( callback !== undefined )
            {
                callback( response )
            }
        }
        catch ( err )
        {
            logger.error( `Error calling toggleCircuit with circuit: ${ circuit }` )
        }

    }

    export function setCircuit ( circuit: number, state: number, callback: any ): API.Response
    {
        let desiredStatus = state
        let toggleCircuitPacket = [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 134, 2, circuit, desiredStatus ];
        queuePacket.queuePacket( toggleCircuitPacket );
        var response: API.Response = {}
        response.text = 'User request to set ' + currentCircuitArrObj[ circuit ].name + ' to '
        response.text += statusToString( desiredStatus )
        response.status = desiredStatus === 1 ? 'on' : 'off';
        response.value = desiredStatus
        logger.info( response )
        //callback will be present when we are responding back to the Express auth and showing the user a message.  But not with SocketIO call where we will just log it.
        if ( callback !== undefined )
        {
            callback( response )
        }
        return response
    }

    export function assignControllerLightColor ( color: number, param: number, counter: number | string ): void
    {
        let strIntellibriteModes = constants.strIntellibriteModes;
        if ( logIntellibrite )
        {
            logger.verbose( 'Msg# %s  Intellibrite light change.  Color -> %s (%s) for param %s ', counter, color, strIntellibriteModes[ color ], param )
        }

        let str = '';
        for ( var _key in lightGroups )
        {
            let key: number = parseInt( _key )
            // if circuit has the light attribute
            if ( currentCircuitArrObj[ key ].circuitFunction === 'Intellibrite' )
            {

                // NOTE: not exactly sure what the param does here.  Doesn't seem to apply to the light groups.  Is the lightGroup ever another number besides 0?

                if ( color === 0 )
                {
                    // Set to off; save previous colors


                    // save prev colors
                    currentCircuitArrObj[ key ].light.prevColor = currentCircuitArrObj[ key ].light.color
                    currentCircuitArrObj[ key ].light.prevColorStr = currentCircuitArrObj[ key ].light.colorStr
                    // save prev mode
                    currentCircuitArrObj[ key ].light.prevMode = currentCircuitArrObj[ key ].light.mode
                    currentCircuitArrObj[ key ].light.prevModeStr = currentCircuitArrObj[ key ].light.modeStr


                    // set current mode
                    currentCircuitArrObj[ key ].light.mode = color
                    currentCircuitArrObj[ key ].light.modeStr = strIntellibriteModes[ color ]


                    // set current color
                    currentCircuitArrObj[ key ].light.color = color
                    currentCircuitArrObj[ key ].light.colorStr = strIntellibriteModes[ color ]


                }
                else if ( color === 1 )
                {
                    // Set to on; restore previous colors and mode
                    // currentCircuitArrObj[key].light.mode = color
                    // currentCircuitArrObj[key].light.modeStr = strIntellibriteModes[color]

                    currentCircuitArrObj[ key ].light.color = currentCircuitArrObj[ key ].light.prevColor
                    currentCircuitArrObj[ key ].light.colorStr = currentCircuitArrObj[ key ].light.prevColorStr
                    // restore prev mode
                    currentCircuitArrObj[ key ].light.mode = currentCircuitArrObj[ key ].light.prevMode
                    currentCircuitArrObj[ key ].light.modeStr = currentCircuitArrObj[ key ].light.prevModeStr

                    currentCircuitArrObj[ key ].light.prevColor = 0
                    currentCircuitArrObj[ key ].light.prevColorStr = 'n/a'
                    currentCircuitArrObj[ key ].light.prevMode = 0
                    currentCircuitArrObj[ key ].light.prevModeStr = 'n/a'
                }
                else if ( color === 160 )
                {
                    // Color Set
                    currentCircuitArrObj[ key ].light.mode = color
                    currentCircuitArrObj[ key ].light.modeStr = strIntellibriteModes[ color ]

                    currentCircuitArrObj[ key ].light.color = lightGroups[ key ].colorSet
                    currentCircuitArrObj[ key ].light.colorStr = lightGroups[ key ].colorSetStr

                    currentCircuitArrObj[ key ].light.prevColor = 0
                    currentCircuitArrObj[ key ].light.prevColorStr = 'n/a'
                    currentCircuitArrObj[ key ].light.prevMode = 0
                    currentCircuitArrObj[ key ].light.prevModeStr = 'n/a'

                }
                else if ( color === 190 || color === 191 )
                {
                    // save and recall
                    currentCircuitArrObj[ key ].light.mode = color
                    currentCircuitArrObj[ key ].light.modeStr = strIntellibriteModes[ color ]

                    currentCircuitArrObj[ key ].light.color = color
                    currentCircuitArrObj[ key ].light.colorStr = strIntellibriteModes[ color ]

                    currentCircuitArrObj[ key ].light.prevColor = 0
                    currentCircuitArrObj[ key ].light.prevColorStr = 'n/a'
                    currentCircuitArrObj[ key ].light.prevMode = 0
                    currentCircuitArrObj[ key ].light.prevModeStr = 'n/a'
                }
                else
                {
                    // all other direct color and built-in cycle modes
                    currentCircuitArrObj[ key ].light.mode = color
                    currentCircuitArrObj[ key ].light.modeStr = strIntellibriteModes[ color ]

                    currentCircuitArrObj[ key ].light.color = color
                    currentCircuitArrObj[ key ].light.colorStr = strIntellibriteModes[ color ]

                    currentCircuitArrObj[ key ].light.prevColor = 0
                    currentCircuitArrObj[ key ].light.prevColorStr = 'n/a'
                    currentCircuitArrObj[ key ].light.prevMode = 0
                    currentCircuitArrObj[ key ].light.prevModeStr = 'n/a'
                }


                str += getFriendlyName( key ) + '\n'

            }
        }
        emit()

        if ( settings.get( "logIntellibrite" ) )
        {
            logger.info( 'Msg# %s  Intellibrite light change.  Color -> %s for circuit(s): \n%s', counter, strIntellibriteModes[ color ], str )
        }
    }

    export function assignControllerLightGroup ( _lightGroupPacketArr: number[], counter: number ): void
    {
        try
        {

            // log the packets to the local var before proceeding
            if ( _lightGroupPacketArr.length === 32 )
            {
                lightGroupPackets[ 0 ] = _lightGroupPacketArr.slice()
            }
            else if ( _lightGroupPacketArr.length === 25 )
            {
                // lightGroupPacket[6] is either 0 or 1; 12 slots total (6 per packet)
                lightGroupPackets[ _lightGroupPacketArr[ 0 ] ] = _lightGroupPacketArr.slice()
                lightGroupPackets.numPackets = 2
            }
            // don't process the packets/differences unless we have the single packet (len 32) or the 2nd packet of length 25
            // 6.0 - AND we have both packets if the 2nd one comes first.
            if ( _lightGroupPacketArr.length === 32 ||
                ( lightGroupPackets.numPackets === 2 && lightGroupPackets[ 0 ][0]===0 && lightGroupPackets[1][0]===1)
            )
            {
                if ( logIntellibrite )
                {
                    logger.debug( 'Msg# %s  Light all on/off and position packet is: %s', counter, _lightGroupPacketArr )
                }
                // var tempLightGroup:Circuit.TempLightGroup = {} //temporary object to hold light group/position assignments
                let tempLightGroups: Circuit.ILightGroups = {} //temporary object to hold light group/position assignments
                let tempLightGroupPacketArr: number[];
                let discovered = 0;
                if ( Object.keys( lightGroups ).length === 0 )
                {
                    discovered = 1
                }

                if ( lightGroupPackets.numPackets === 1 )
                {
                    tempLightGroupPacketArr = lightGroupPackets[ 0 ].slice()
                }
                else if ( lightGroupPackets.numPackets === 2 )
                {
                    // lightGroupPacket[6] is either 0 or 1; 12 slots total (6 per packet)
                    // concat the arrays excluding the first byte
                    tempLightGroupPacketArr = lightGroupPackets[ 0 ].slice( 1 ).concat( lightGroupPackets[ 1 ].slice( 1 ) )
                }


                let numGroups = tempLightGroupPacketArr.length / 4
                for ( let i = 0; i < numGroups; i++ )
                {

                    // split off groups of 4 packets and assign them to a copy of the lightGroup
                    let _temp = tempLightGroupPacketArr.splice( 0, 4 ) // remove this light group

                    if ( _temp[ 0 ] !== 0 )
                    {
                        let _circuit = _temp[ 0 ]
                        let _position = ( _temp[ 1 ] >> 4 ) + 1  // group/position 0000=1; 0001=2; 0010=3, etc.
                        let _colorSet = ( _temp[ 1 ] & 15 )
                        let _colorSetStr = constants.lightColors[ _temp[ 1 ] & 15 ]
                        let _colorSwimDelay = _temp[ 2 ] >> 1
                        let tempLightGroup = new LightGroup(
                            _circuit,
                            _position,
                            _colorSet,
                            _colorSetStr,
                            _colorSwimDelay
                        )
                        tempLightGroups[ i ] = tempLightGroup;

                        /*                         tempLightGroup[ i ] = {
                                                    'circuit': _temp[ 0 ],
                                                    'position': ( _temp[ 1 ] >> 4 ) + 1,  // group/position 0000=1; 0001=2; 0010=3, etc.
                                                    'colorSet': ( _temp[ 1 ] & 15 ),
                                                    'colorSetStr': constants.lightColors[ _temp[ 1 ] & 15 ],
                                                    'colorSwimDelay': _temp[ 2 ] >> 1
                                                } */
                    }




                }
                /*
    
                   Use IndexBy to Pivot the array.
                   We pivot the array because the positions can change and we don't want to lose any details.
                   For example, if a light group changes from the 4th position to the 3rd, we don't want to delete it from the 4th position when we look for changes.
    
                   Example output:
                       indexBy:  {
                         "7": {
                           "position": 1,
                           "circuit": 7
                         },
                         "8": {
                           "position": 2,
                           "circuit": 8
                         },
                         "9": {
                           "position": 4,
                           "circuit": 9
                         },
                         "16": {
                           "position": 3,
                           "circuit": 16
                         }
                       }
    
                    */
                tempLightGroups = _.indexBy( tempLightGroups, 'circuit' )
                var changed = 0

                var diff1: any = deepdiff.diff( lightGroups, tempLightGroups )


                if ( logIntellibrite )
                {
                    logger.silly( 'Intellibrite All on/off groups indexBy: ', JSON.stringify( tempLightGroups, null, 2 ) )
                }

                if ( diff1 === undefined )
                {
                    if ( logIntellibrite )
                    {

                        logger.silly( 'Intellibrite all on/off packet retrieved, but there were no changes.' )
                    }
                }
                else
                {
                    if ( logIntellibrite )
                    {

                        logger.debug( 'Intellibrite all on/off differences: %s\n\tStored values: %s', JSON.stringify( diff1, null, 2 ), JSON.stringify( lightGroupPackets, null, 2 ) )
                    }
                    for ( var key in diff1 )
                    {
                        let cir: any = diff1[ key ].path;//circuit we want to change

                        if ( diff1[ key ].kind === 'D' )
                        {


                            changed = 1

                            // use the prior value, and set it to 0
                            //currentCircuitArrObj[cir].light = {}
                            delete currentCircuitArrObj[ cir ].light

                            // use the new circuit
                            if ( logIntellibrite )
                            {
                                logger.silly( 'Intellibrite all on/off group DELETED key:', JSON.stringify( diff1[ key ], null, 2 ) )
                                logger.verbose( 'Msg# %s  Light group deleted for circuit %s (%s):', counter, getFriendlyName( cir ), cir, JSON.stringify( lightGroups[ cir ], null, 2 ) )
                            }
                        }

                        else if ( diff1[ key ].kind === 'N' )
                        {

                            changed = 1

                            /*
                            diff1[key].path] is the key for the tempLightGroup
                            when N(ew), we want to add it.
    
                                 {
                                    "kind": "N",
                                    "path": [
                                      "7"
                                    ],
                                    "rhs": {
                                      "position": 1,
                                      "circuit": 7
                                    }
                                  }
                             */

                            // if (currentCircuitArrObj[cir].hasOwnProperty('light')) {
                            currentCircuitArrObj[ cir ].light = new Light( diff1[ key ].rhs.position, 'off', 0 )


                            // }
                            // else {
                            //
                            //     logger.warn('Trying to add light to circuit %s but it has no light property. \n\t %j', currentCircuitArrObj[cir].number, currentCircuitArrObj[cir])
                            // }
                            if ( logIntellibrite )
                            {
                                logger.silly( `NEW key: ${ JSON.stringify( diff1[ key ], null, 2 ) }` )
                                logger.verbose( `Msg# ${ counter }  Light details added for circuit ${ getFriendlyName( cir ) } (${ cir }): ${ diff1[ key ].rhs.position }` )
                            }

                        }
                        else if ( diff1[ key ].kind === 'E' )
                        {
                            cir = diff1[ key ].path[ 0 ] //circuit we want to change; different for edited because of the path

                            changed = 1

                            /*
                            diff1[key].path] is the key for the tempLightGroup
                            when E(dited), we want to change it.
    
                                 [
                                  {
                                    "kind": "E",
                                    "path": [
                                      "7",
                                      "group"
                                    ],
                                    "lhs": 3,
                                    "rhs": 2
                                  }
                                ]
                             */

                            var el = diff1[ key ].path[ 1 ]
                            //var val = diff1[ key ].rhs
                            // currentCircuitArrObj[ cir ].light[ el ] = val
                            // done below??  or copy whole obj here?
                            // currentCircuitArrObj[ cir ].light.position = val


                            if ( logIntellibrite )
                            {
                                logger.silly( 'NEW key:', JSON.stringify( diff1[ key ], null, 2 ) )
                                logger.verbose( 'Msg# %s  Light attribute `%s` changed for circuit %s (%s) to', counter, el, getFriendlyName( cir ), cir, JSON.stringify( diff1[ key ].rhs, null, 2 ) )
                            }
                        }
                        else
                        {
                            logger.warn( 'Msg# %s  Intellibrite all on/off change -- unknown for circuit %s (%s):', counter, getFriendlyName( cir ), cir, JSON.stringify( diff1, null, 2 ) )
                        }
                    }

                    // lightGroup = JSON.parse( JSON.stringify( tempLightGroup ) )

                    // reset and assign the light group
                    lightGroups = Object.assign( {}, lightGroups, tempLightGroups )

                    for ( var _key in lightGroups )
                    {
                        let key = parseInt( _key )
                        Object.assign( currentCircuitArrObj[ key ].light, lightGroups[ key ] )
                        // currentCircuitArrObj[ key ].light.position = lightGroup[ key ].position
                        // currentCircuitArrObj[ key ].light.colorSet = lightGroup[ key ].colorSet
                        // currentCircuitArrObj[ key ].light.colorSetStr = lightGroup[ key ].colorSetStr
                        // currentCircuitArrObj[ key ].light.colorSwimDelay = lightGroup[ key ].colorSwimDelay

                    }

                    if ( discovered === 1 )
                    {
                        if ( logIntellibrite )
                            logger.silly( `Msg# ${ counter }:  Intellibrite All On/Off Light positions discovered:\n${ JSON.stringify( lightGroups, null, 2 ) }` )
                        var str = ''


                        for ( var _key in lightGroups )
                        {
                            let key = parseInt( _key )
                            str += `${ getFriendlyName( key ) } (${ currentCircuitArrObj[ key ].number }): Position ${ lightGroups[ key ].position } \n`
                        }
                        logger.info( `Msg# ${ counter }:  Intellibrite All On/Off and Light positions discovered: \n${ str }` )
                    }

                    if ( changed )
                    {
                        // TODO: this emit isn't catching when the light color is changed (setLightColor)
                        emit()
                    }
                    if ( sendInitialBroadcast.initialCircuitsBroadcast === 1 ) influx.writeCircuit( currentCircuitArrObj )
                }
            }

            emit()
        }

        catch ( err )
        {
            logger.error( `There was an error assigning light controller packets. ${ err.message }` )
        }
    }

    export function getLightGroup (): Circuit.ILightGroups
    {
        return lightGroups
    }

    export function setDelayCancel ( callback?: ( ( response: API.Response ) => {} ) ): void
    {
        var delayCancelPacket = [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 131, 1, 0 ];
        queuePacket.queuePacket( delayCancelPacket );
        var response: API.Response = {}
        response.text = 'User request to cancel delay'
        response.status = 'Sent';
        response.value = 0
        logger.info( response )
        //callback will be present when we are responding back to the Express auth and showing the user a message.  But not with SocketIO call where we will just log it.
        if ( callback !== undefined )
        {
            callback( response )
        }

    }

    export function getNumberOfCircuits (): number
    {
        return numberOfCircuits
    }


    export function setLightMode ( mode: number ): string
    {
        // 255, 0, 255, 165, 33, 16, 34, 96, 2, 1, 0, 1, 91

        var packet = [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 96, 2, mode, 0 ]
        queuePacket.queuePacket( packet );

        var retStr = 'API: Intellibrite Light Mode ' + constants.strIntellibriteModes[ mode ] + ' (' + mode + ') requested'
        if ( settings.get( 'logAPI' ) || logIntellibrite )
        {
            logger.info( retStr )

        }
        // assign color to circuit object
        assignControllerLightColor( mode, 0, 'API' )

        return retStr
    }

    export function whichLightPacket ( circuit: number ): number
    {
        // for the length 25 packets, we need to find out which packet has the circuit we want to modify
        if ( lightGroupPackets.numPackets === 1 )
        {
            return 0
        }
        else
        {
            // search both packets for a match
            for ( var packet = 0; i <= lightGroupPackets.numPackets; packet++ )
            {
                var numGroups = lightGroupPackets[ packet ].length / 4
                for ( var i = 0; i <= numGroups; i++ )
                {

                    // packets are in groups of 4.
                    // lightGroupPacket[0] is circuit
                    // lightGroupPacket[1] xxxxyyyy where xxxx is position and yyyy is the color
                    // 'position': (_temp[1] >> 4) + 1,  // group/position 0000=1; 0001=2; 0010=3, etc.

                    if ( lightGroupPackets[ packet ][ i * 4 ] === circuit )
                    {
                        // return the packet # when we find a match
                        return packet
                    }
                }

            }

        }
        logger.error( 'Light %s not found in either packet.\n\t%j', circuit, lightGroupPackets )

    }

    export function setLightPosition ( circuit: number, position: number ): string
    {
        if ( logIntellibrite )
        {
            logger.silly( 'Light setLightPosition original packet:', lightGroupPackets )

        }

        var packet,
            _lightGroupPacketArr: number[];

        var whichPacket = whichLightPacket( circuit )
        if ( lightGroupPackets.numPackets === 1 )
        {
            _lightGroupPacketArr = lightGroupPackets[ whichPacket ].slice()
        }
        else
        {
            _lightGroupPacketArr = lightGroupPackets[ whichPacket ].slice( 1 )
        }

        var numGroups = _lightGroupPacketArr.length / 4
        for ( var i = 0; i <= numGroups; i++ )
        {

            // packets are in groups of 4.
            // lightGroupPacket[0] is circuit
            // lightGroupPacket[1] xxxxyyyy where xxxx is position and yyyy is the color
            // 'position': (_temp[1] >> 4) + 1,  // group/position 0000=1; 0001=2; 0010=3, etc.

            var positionBinary = ( position - 1 ) << 4
            if ( _lightGroupPacketArr[ i * 4 ] === circuit )
            {
                _lightGroupPacketArr[ ( i * 4 ) + 1 ] = ( positionBinary ) + ( _lightGroupPacketArr[ ( i * 4 ) + 1 ] & 15 )
            }


        }
        lightGroupPackets[ whichPacket ] = ( lightGroupPackets.numPackets === 2 ? [ whichPacket ] : [] ).concat( _lightGroupPacketArr ).slice()
        packet = [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 167, _lightGroupPacketArr.length ].concat( lightGroupPackets[ whichPacket ] )
        queuePacket.queuePacket( packet );


        if ( logIntellibrite )
        {
            logger.silly( 'Light setLightPosition NEW      packet:', lightGroupPackets )

        }
        var retStr = 'API: Light group circuit ' + circuit + ' setPosition is now : ' + position
        if ( settings.get( 'logAPI' ) )
        {
            logger.info( retStr )

        }

        return retStr

    }

    export function setLightColor ( circuit: number, color: number ): string
    {
        if ( logIntellibrite )
        {
            logger.silly( 'Light setLightColor original packet:', lightGroupPackets )

        }

        let packet,
            _lightGroupPacketArr;

        var whichPacket = whichLightPacket( circuit )
        if ( lightGroupPackets.numPackets === 1 )
        {
            _lightGroupPacketArr = lightGroupPackets[ whichPacket ].slice()
        }
        else
        {
            _lightGroupPacketArr = lightGroupPackets[ whichPacket ].slice( 1 )
        }
        var numGroups = _lightGroupPacketArr.length / 4
        for ( var i = 0; i <= numGroups; i++ )
        {

            // packets are in groups of 4.
            // lightGroupPacket[0] is circuit
            // lightGroupPacket[1] xxxxyyyy where xxxx is position and yyyy is the color
            // 'position': (_temp[1] >> 4) + 1,  // group/position 0000=1; 0001=2; 0010=3, etc.

            if ( _lightGroupPacketArr[ i * 4 ] === circuit )
            {
                _lightGroupPacketArr[ ( i * 4 ) + 1 ] = ( color ) + ( _lightGroupPacketArr[ ( i * 4 ) + 1 ] & 240 )
            }


        }
        lightGroupPackets[ whichPacket ] = ( lightGroupPackets.numPackets === 2 ? [ whichPacket ] : [] ).concat( _lightGroupPacketArr ).slice()
        packet = [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 167, _lightGroupPacketArr.length ].concat( lightGroupPackets[ whichPacket ] )
        queuePacket.queuePacket( packet );

        if ( logIntellibrite )
        {
            logger.silly( 'Light setLightColor NEW      packet:', lightGroupPackets )

        }
        var retStr = 'API: Light group circuit ' + circuit + ' setColor is now : ' + constants.lightColors[ color ] + ' (' + color + ')'
        if ( settings.get( 'logAPI' ) )
        {
            logger.info( retStr )

        }

        return retStr

    }

    export function setLightSwimDelay ( circuit: number, delay: number ): string
    {
        if ( logIntellibrite )
        {
            logger.silly( 'Light setLightDelay original packet:', lightGroupPackets )

        }


        /*        var packet;
        
                if (lightGroupPacket.numPackets === 1) {
        
                    for (var i = 0; i <= 7; i++) {
        
                        // packets are in groups of 4.
                        // lightGroupPacket[0] is circuit
                        // lightGroupPacket[2] is the delay
                        if (lightGroupPacket[i * 4] === circuit) {
                            lightGroupPacket[(i * 4) + 2] = (delay << 1) + (lightGroupPacket[(i * 4) + 2] & 1)
                        }
                    }
        
                    // 165,33,16,34,167,32,7,10,4,0,8,22,14,0,16,32,10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,58
                    packet = [165, intellitouch.getPreambleByte(), 16, settings.get('appAddress'), 167, 32].concat(lightGroupPacket)
                }
                else {
                    // unknown at this time if the only options are 28 or 25 in length.
                    // could make this generic (no if-else)...
        
                    // make a copy
                    var _lightGroupPacketArr = lightGroupPacket[whichLightPacket(circuit)].slice()
        
                    // Some intellibrite packets have 25 values with a leading 0.  Not sure why.  See Issue #99.
                    // This code will get the modulo and shift the array by that many.
                    var modulo = _lightGroupPacketArr.length % 4
                    var packetNum = _lightGroupPacketArr.splice(0, modulo)
        
        
                    var numGroups = _lightGroupPacketArr.length / 4
                    for (var i = 0; i <= numGroups; i++) {
        
                        // packets are in groups of 4.
                        // lightGroupPacket[0] is circuit
                        // lightGroupPacket[1] xxxxyyyy where xxxx is position and yyyy is the color
                        // 'position': (_temp[1] >> 4) + 1,  // group/position 0000=1; 0001=2; 0010=3, etc.
        
                        if (_lightGroupPacketArr[i * 4] === circuit) {
                            _lightGroupPacketArr[(i * 4) + 2] = (delay << 1) + (_lightGroupPacketArr[(i * 4) + 2] & 1)
                        }
        
        
                    }
        
                    packet = [165, intellitouch.getPreambleByte(), 16, settings.get('appAddress'), 167, 25].concat(packetNum).concat(_lightGroupPacketArr)
                }*/


        var packet,
            _lightGroupPacketArr;

        var whichPacket = whichLightPacket( circuit )
        if ( lightGroupPackets.numPackets === 1 )
        {
            _lightGroupPacketArr = lightGroupPackets[ whichPacket ].slice()
        }
        else
        {
            _lightGroupPacketArr = lightGroupPackets[ whichPacket ].slice( 1 )
        }
        var numGroups = _lightGroupPacketArr.length / 4
        for ( var i = 0; i <= numGroups; i++ )
        {

            // packets are in groups of 4.
            // lightGroupPacket[0] is circuit
            // lightGroupPacket[1] xxxxyyyy where xxxx is position and yyyy is the color
            // 'position': (_temp[1] >> 4) + 1,  // group/position 0000=1; 0001=2; 0010=3, etc.

            if ( _lightGroupPacketArr[ i * 4 ] === circuit )
            {
                _lightGroupPacketArr[ ( i * 4 ) + 2 ] = ( delay << 1 ) + ( _lightGroupPacketArr[ ( i * 4 ) + 2 ] & 1 )
            }


        }

        lightGroupPackets[ whichPacket ] = ( lightGroupPackets.numPackets === 2 ? [ whichPacket ] : [] ).concat( _lightGroupPacketArr ).slice()
        packet = [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 167, _lightGroupPacketArr.length ].concat( lightGroupPackets[ whichPacket ] )
        queuePacket.queuePacket( packet );

        if ( logIntellibrite )
        {
            logger.silly( 'Light setLightDelay NEW      packet:', lightGroupPackets )

        }
        var retStr = 'API: Light group circuit ' + circuit + ' Swim Delay is now : ' + delay + ' seconds'
        if ( settings.get( 'logAPI' ) )
        {
            logger.info( retStr )

        }

        return retStr

    }
    /**
     * returns an array with the current Status Bytes
     */
    export function getCurrentStatusBytes (): number[]
    {
        return currentStatusBytes.get()
    }

    export function setCurrentStatusBytes ( data: Circuit.Packet, counter: number ): void
    {
        let csb = currentStatusBytes.get()
        if ( csb.length === 0 )
        {
            if ( settings.get( 'logConfigMessages' ) ) logger.verbose( '\n ', printStatus( data ) );
        } else if ( settings.get( 'logConfigMessages' ) )
        {
            logger.verbose( '-->EQUIPMENT Msg# %s   \n', counter )
            logger.verbose( 'Msg# %s: \n', counter, printStatus( csb, data ) );
        }

        currentStatusBytes.set( data, counter )
    }


    // /*istanbul ignore next */
    // if ( logModuleLoading )
    //     logger.info( 'Loaded: circuit.js' )

}