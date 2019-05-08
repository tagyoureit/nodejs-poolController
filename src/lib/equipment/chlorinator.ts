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


import { settings, logger, chlorinatorController, queuePacket, intellitouch, io} from '../../etc/internal';

import * as influx from '../comms/influx-connector';
import * as constants from '../../etc/constants'
import * as _ from 'underscore';

export namespace chlorinator 
{

    let currentChlorinatorStatus: Chlorinator.IChlorinator;

    /*istanbul ignore next */
    // if (logModuleLoading)
    //     logger.info('Loading: chlorinator.js')

    class Chlorinator implements Chlorinator.IChlorinator
    {
        installed: ZeroOrOne;
        saltPPM: number;
        currentOutput: number;
        outputPoolPercent: number;
        outputSpaPercent: number;
        superChlorinate: number;
        superChlorinateHours: number;
        version: number;
        name: string;
        status: string;
        controlledBy: Chlorinator.ControlledBy;

        constructor()
        {

            this.installed = 0;
            this.saltPPM = -1;
            this.currentOutput = -1 //actual output as reported by the chlorinator
            this.outputPoolPercent = -1; //for intellitouch this is the pool setpoint, for standalone it is the default
            this.outputSpaPercent = -1; //intellitouch has both pool and spa set points
            this.superChlorinate = -1;
            this.superChlorinateHours;
            this.version = -1;
            this.name = 'namenotset';
            this.status = 'notset';
            this.controlledBy = 'none';
        }

        updateName ( _name: string )
        {
            if ( this.name !== _name )
            {
                this.name = _name;
                settings.updateChlorinatorName( _name );
            }
        }

        startChlorinatorController ()
        {
            if ( !chlorinatorController.isChlorinatorTimerRunning() )
            {
                chlorinatorController.startChlorinatorController()
            }
        }

        private updateChlorinatorInstalled ()// _installed:Chlorinator.ZeroOrOne )
        {
            //this.installed = _installed;
            if ( settings.get( 'chlorinator.installed' ) !== this.installed )
            {
                settings.updateChlorinatorInstalled( this.installed )
            }
        }

        updateChlorinatorValues ( chlorinatorStatus: Chlorinator.IBaseChlorinator )
        {
            settings.updateChlorinatorDesiredOutput( chlorinatorStatus.outputPoolPercent, chlorinatorStatus.outputSpaPercent )
            this.updateChlorinatorInstalled()
            Object.assign( this, chlorinatorStatus )
        }

    }

    export function init ()
    {

        currentChlorinatorStatus = new Chlorinator();
        let output: { pool: number, spa: number } = settings.get( 'equipment.chlorinator.desiredOutput' )

        currentChlorinatorStatus.outputPoolPercent = output.pool
        currentChlorinatorStatus.outputSpaPercent = output.spa
        currentChlorinatorStatus.name = settings.get( 'equipment.chlorinator.id.productName' )

        // name used to be set as -1.  Now it is a string; update to be a string
        if ( typeof currentChlorinatorStatus.name === 'number' )
        {
            currentChlorinatorStatus.name = 'namenotset'
            settings.updateChlorinatorName( currentChlorinatorStatus.name )
        }
    }

    export function chlorinatorStatusStr ( status: number )
    {
        // 0: "Ok",
        // 1: "No flow",
        // 2: "Low Salt",
        // 4: "High Salt",
        // 132: "Comm Link Error(?).  Low Salt",
        // 144: "Clean Salt Cell",
        // 145: "???"
        //MSb to LSb [ "Check Flow/PCB","Low Salt","Very Low Salt","High Current","Clean Cell","Low Voltage","Water Temp Low","No Comm","OK" ]
        var chlorStr = ''
        var needDelim = 0;
        if ( ( status === 0 ) )
        {
            chlorStr += 'Ok';
            needDelim = 1
        }

        if ( ( status & 1 ) === 1 )
        {
            needDelim ? chlorStr += ', ' : needDelim = 1
            chlorStr += 'Low Flow'; //1
        }
        if ( ( status & 2 ) >> 1 === 1 )
        {
            needDelim ? chlorStr += ', ' : needDelim = 1
            chlorStr += 'Low Salt'; // 2
        }
        if ( ( status & 4 ) >> 2 === 1 )
        {
            needDelim ? chlorStr += ', ' : needDelim = 1
            chlorStr += 'Very Low Salt'; // 4
        }
        if ( ( status & 8 ) >> 3 === 1 )
        {
            needDelim ? chlorStr += ', ' : needDelim = 1
            chlorStr += 'High Current'; //8
        }
        if ( ( status & 16 ) >> 4 === 1 )
        {
            needDelim ? chlorStr += ', ' : needDelim = 1
            chlorStr += 'Clean Cell'; //16
        }
        if ( ( status & 32 ) >> 5 === 1 )
        {
            needDelim ? chlorStr += ', ' : needDelim = 1
            chlorStr += 'Low Voltage'; //32
        }
        if ( ( status & 64 ) >> 6 === 1 )
        {
            needDelim ? chlorStr += ', ' : needDelim = 1
            chlorStr += 'Water Temp Low'; //64
        }
        // Following seems to result in no communication messages when there is communication.
        if ( ( status & 128 ) >> 7 === 1 )
        {
            needDelim ? chlorStr += ', ' : needDelim = 1
            chlorStr += 'Ok'  // seems to be an ok string despite the check flow from below.
        }
        return chlorStr
        //
        // 0: "Ok",
        // 1: "No communications",
        // 2: "Water Temp Low",
        // 4: "Low Voltage",
        // 8: "Clean Cell",
        // 16: "High Current",
        // 32: "Very Low Salt",
        // 64: "Low Salt",
        // 128: "Check Flow/PCB"
    }

    export function setChlorinatorControlledBy ( which: Chlorinator.ControlledBy )
    {
        currentChlorinatorStatus.controlledBy = which
    }

    export function updateChlorinatorStatusFromController ( saltPPM: number, outputPoolPercent: number, outputSpaPercent: number, superChlorinate: number, _status: number, name: string, counter: number ): Chlorinator.IChlorinator
    {
        var chlorinatorStatus: Chlorinator.IBaseChlorinator;

        currentChlorinatorStatus.startChlorinatorController()
        let _superChlorinate: number;
        let _superChlorinateHours: number
        if ( currentChlorinatorStatus.controlledBy === 'virtual' )
        {
            _superChlorinate = outputPoolPercent >= 100 ? 1 : 0;
            // how many hours does super chlorinate run for?
            // Todo: it runs for specific hours.  why are we guessing here?
            _superChlorinateHours = 96;

        }
        else
        {
            _superChlorinate = superChlorinate > 0 ? 1 : 0
            _superChlorinateHours = superChlorinate
        }

        chlorinatorStatus = {
            saltPPM: saltPPM * 50,
            outputPoolPercent: outputPoolPercent,
            installed: outputSpaPercent && 1 === 1 ? 1 : 0,
            outputSpaPercent: outputSpaPercent >> 1,
            name: name,
            superChlorinate: _superChlorinate,
            superChlorinateHours: _superChlorinateHours,
            status: chlorinatorStatusStr( _status )
        }
        // // without a whole lot of logic, we are relying on the chlorinator packet itself to tell
        // // us if super chlorinate is true
        // chlorinatorStatus.currentOutput = currentChlorinatorStatus.hasOwnProperty( 'currentOutput' ) ? currentChlorinatorStatus.currentOutput : 0; //if chlorinator has reported a current output percent, keep it.  Otherwise set to 0

        // chlorinatorStatus.outputPoolPercent = outputPoolPercent

        // outputSpaPercent field is aaaaaaab (binary) where aaaaaaa = % and b===installed (0=no,1=yes)
        // eg. a value of 41 is 00101001
        // installed = (aaaaaaa)1 so 1 = installed
        // spa percent = 0010100(b) so 10100 = 20
        //chlorinatorStatus.installed = outputSpaPercent && 1 === 1 ? 1 : 0;
        // chlorinatorStatus.outputSpaPercent = outputSpaPercent >> 1;


        // chlorinatorStatus.status = chlorinatorStatusStr( status )
        // chlorinatorStatus.name = name;

        // Create a quick copy because the base object may have additional
        // properties the passed in variables don't have.  Then
        // we can use the isEqual below to do a shorter (code-wise) comparison.
        let tempStatus = Object.assign( currentChlorinatorStatus, chlorinatorStatus )


        if ( _.isEqual( currentChlorinatorStatus, tempStatus ) )
        {
            if ( settings.get( 'logChlorinator' ) )
                logger.debug( 'Msg# %s   Chlorinator status has not changed. ', counter )
        }

        else
        {
            currentChlorinatorStatus.updateChlorinatorValues( chlorinatorStatus )

            if ( settings.get( 'logChlorinator' ) )
                if ( currentChlorinatorStatus.status.includes( 'notset' ) )
                {
                    logger.info( `Msg# ${ counter }   Initial chlorinator settings discovered: ${ JSON.stringify( currentChlorinatorStatus ) }` )
                } else  
                {
                    logger.verbose( `Msg# ${ counter }:   Chlorinator status changed \nfrom: ${ JSON.stringify( currentChlorinatorStatus ) } \nto: ${ JSON.stringify( chlorinatorStatus ) } ` )
                }


            influx.writeChlorinator( currentChlorinatorStatus )
            emit();
            return currentChlorinatorStatus
        }


    }

    function emit ()
    {
        io.emitToClients( 'chlorinator', { chlorinator: currentChlorinatorStatus } );
    }
    export function getChlorinatorNameByBytes ( nameArr: number[] ): string
    {
        var name = ''
        for ( var i = 0; i < nameArr.length; i++ )
        {
            name += String.fromCharCode( nameArr[ i ] );
            //console.log('i: %s ,namearr[i]: %s, char: %s  name: %s', i, nameArr[i],  String.fromCharCode(nameArr[i]) ,name )
        }
        return name
    }

    export function getChlorinatorName (): string
    {
        return currentChlorinatorStatus.name
    }

    export function getSaltPPM (): number
    {
        return currentChlorinatorStatus.saltPPM
    }

    export function getChlorinatorStatus (): Chlorinator.IChlorinatorOutput
    {
        return { 'chlorinator': currentChlorinatorStatus }
    }


    export function setChlorinatorLevel ( chlorPoolLvl: number, chlorSpaLvl: number = -1, chlorSuperChlorinateHours: number = 0, callback?: ( func: any ) => void ): API.Response
    {

        // if the system is running just the chlorinator (virtual controller) then we just set a single value of 0 (off) through 100 (full) or 101 (superchlorinate).
        // intellicom only supports a single body of water, so we can set the chlorPoolLvl (0-100) and superChlorinate (in # of hours up to 96)
        // intellitouch/easytouch supports pool, spa and superchlorinate.

         //NOTE: do we really need to do this logic?  If the controller is on, it will request the updates.  If the virtual controller is enabled, it should be active anyway.

        currentChlorinatorStatus.startChlorinatorController()


        let response: API.Response = {}
        if ( currentChlorinatorStatus.controlledBy === 'virtual' )
        {
            // check for valid settings to be sent to Chlorinator directly
            if ( chlorPoolLvl >= 0 && chlorPoolLvl <= 101 )
            {
                currentChlorinatorStatus.outputPoolPercent = chlorPoolLvl
            }
            else
            {
                response.text = 'FAIL: Request for invalid value for chlorinator (' + chlorPoolLvl + ').  Chlorinator will continue to run at previous level (' + currentChlorinatorStatus.outputPoolPercent + ')'
                response.status = currentChlorinatorStatus.status
                response.value = currentChlorinatorStatus.outputPoolPercent
                if ( settings.get( 'logChlorinator' ) )
                {
                    logger.warn( 'API Response', response )
                }
                return response
            }
        }
        else
        {
            // check for valid values with Intellicom/Intellitouch
            if ( chlorPoolLvl === 101 )
            {
                // assume we will set the superchlorinate for 24 hours
                chlorSuperChlorinateHours = 24
            }
            else if ( chlorPoolLvl >= 0 && chlorPoolLvl <= 100 )
            {
                currentChlorinatorStatus.outputPoolPercent = chlorPoolLvl
            }
            else
            {
                if ( !chlorPoolLvl || chlorPoolLvl < -1 || chlorPoolLvl > 101 )
                {
                    // -1 is valid if we don't want to change the setting.  Anything else is invalid and should trigger a fail.
                    currentChlorinatorStatus.outputPoolPercent = 0;
                    response.text = 'FAIL: Request for invalid value for chlorinator (' + chlorPoolLvl + ').  Chlorinator will continue to run at previous level (' + currentChlorinatorStatus.outputPoolPercent + ')'
                    response.status = currentChlorinatorStatus.status
                    response.value = currentChlorinatorStatus.outputPoolPercent
                    response.status += ' ' + currentChlorinatorStatus // not useful
                    if ( settings.get( 'logChlorinator' ) )
                    {
                        logger.warn( 'API Response', response )
                    }
                    return response
                }
            }
        }

        if ( chlorSpaLvl >= 0 && chlorSpaLvl <= 100 )
        {
            currentChlorinatorStatus.outputSpaPercent = chlorSpaLvl
        }
        else
        {
            if ( !currentChlorinatorStatus.outputSpaPercent || currentChlorinatorStatus.outputSpaPercent < 0 )
            {
                // just in case it isn't set.  otherwise we don't want to touch it
                currentChlorinatorStatus.outputSpaPercent = 0;
            }
        }

        if ( ( chlorSuperChlorinateHours > 0 && chlorSuperChlorinateHours <= 96 ) || currentChlorinatorStatus.superChlorinateHours > 0 )
        {
            currentChlorinatorStatus.superChlorinate = 1
            currentChlorinatorStatus.superChlorinateHours = chlorSuperChlorinateHours
        }
        else if ( chlorSuperChlorinateHours === 0 )
        {
            currentChlorinatorStatus.superChlorinate = 0
            currentChlorinatorStatus.superChlorinateHours = 0
        }

        if ( settings.get( 'chlorinator.installed' ) )
        {
            if ( currentChlorinatorStatus.controlledBy === 'virtual' )
            {
                // chlorinator only has one setting; it doesn't know the difference between pool/spa

                //response.chlorinator = currentChlorinatorStatus
                if ( currentChlorinatorStatus.outputPoolPercent === 0 )
                {
                    response.text = 'Chlorinator set to off.  Chlorinator will be queried every 30 mins for PPM'
                    response.status = 'off'
                    response.value = 0
                } else if ( currentChlorinatorStatus.outputPoolPercent >= 1 && currentChlorinatorStatus.outputPoolPercent <= 100 )
                {
                    response.text = 'Chlorinator set to ' + currentChlorinatorStatus.outputPoolPercent + '%.'
                    response.status = 'on'
                    response.value = currentChlorinatorStatus.outputPoolPercent
                } else if ( currentChlorinatorStatus.outputPoolPercent === 101 )
                {
                    response.text = 'Chlorinator set to super chlorinate'
                    response.status = 'on'
                    response.value = currentChlorinatorStatus.outputPoolPercent
                }
                settings.updateChlorinatorDesiredOutput( currentChlorinatorStatus.outputPoolPercent, currentChlorinatorStatus.outputSpaPercent )

                if ( chlorinatorController.isChlorinatorTimerRunning() )
                    chlorinatorController.chlorinatorStatusCheck()  //This is causing problems if the chlorinator is offline (repeated calls to send status packet.)
                else
                    queuePacket.queuePacket( [ 16, 2, 80, 17, currentChlorinatorStatus.outputPoolPercent ] )
                if ( settings.get( 'logChlorinator' ) )
                {
                    logger.info( 'API Response', response )
                }
                emit()
                return response
            }

            else if ( currentChlorinatorStatus.controlledBy === 'intellicom' )
            {
                // chlorinator controlled by intellicom; it only has the pool setting
                //response.chlorinator = currentChlorinatorStatus
                response.text = `Chlorinator set to ${ currentChlorinatorStatus.outputPoolPercent } and SuperChlorinate is ${ currentChlorinatorStatus.superChlorinate } for ${ currentChlorinatorStatus.superChlorinateHours } hours.`
                response.status = 'on'
                response.value = currentChlorinatorStatus.outputPoolPercent

                if ( settings.get( 'logChlorinator' ) )
                {
                    logger.info( 'API Response', response )
                }
                settings.updateChlorinatorDesiredOutput( currentChlorinatorStatus.outputPoolPercent, currentChlorinatorStatus.outputSpaPercent )

                // TODO: Check if the packet is the same on Intellicom (sans Spa setting)... currently it is the same as Intellichlor but the response is formatted differently.
                queuePacket.queuePacket( [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 153, 10, outputSpaByte(), currentChlorinatorStatus.outputPoolPercent, 0, superChlorinateByte(), 0, 0, 0, 0, 0, 0, 0 ] )

                emit()
            }
            else
            {
                // controlled by Intellitouch.  We should set both pool and spa levels at the controller
                if ( currentChlorinatorStatus.outputPoolPercent !== 0 || currentChlorinatorStatus.superChlorinate!==0 || currentChlorinatorStatus.superChlorinateHours>0 )
                {
                    response.status = 'on'
                }
                else
                {
                    response.status = 'off'
                }
                response.text = `Chlorinator pool set to ${ currentChlorinatorStatus.outputPoolPercent }, spa set to ${ currentChlorinatorStatus.outputSpaPercent } and SuperChlorinate is ${ currentChlorinatorStatus.superChlorinate } for ${ currentChlorinatorStatus.superChlorinateHours } hours.`
                response.value = currentChlorinatorStatus.outputPoolPercent

                settings.updateChlorinatorDesiredOutput( currentChlorinatorStatus.outputPoolPercent, currentChlorinatorStatus.outputSpaPercent )

                queuePacket.queuePacket( [ 165, intellitouch.getPreambleByte(), 16, settings.get( 'appAddress' ), 153, 10, outputSpaByte(), currentChlorinatorStatus.outputPoolPercent, superChlorinateByte(), 0, 0, 0, 0, 0, 0, 0 ] )
                if ( settings.get( 'logChlorinator' ) )
                {
                    logger.info( 'API Response', response )
                }
                emit()
                return response
            }
        }
        else
        {
            // chlor NOT installed
            response.text = 'FAIL: Chlorinator not enabled.  Set Chlorinator=1 in config.json'
            return response
        }
    }

    export function outputSpaByte (): number
    {
        return ( currentChlorinatorStatus.outputSpaPercent << 1 ) + currentChlorinatorStatus.installed
    }

    export function superChlorinateByte (): number
    {

        if ( currentChlorinatorStatus.superChlorinate === 1 )
        {
            if ( currentChlorinatorStatus.superChlorinateHours >= 1 )
            {
                return 128 + currentChlorinatorStatus.superChlorinateHours
            }
            else
            {
                // default to 1 hour
                return 129
            }
        }
        else
        {
            return 0
        }
    }

    export function getDesiredChlorinatorOutput (): number
    {
        return currentChlorinatorStatus.outputPoolPercent
    }

    export function setChlorinatorStatusFromChlorinator ( data: number[], counter: number ): void
    {
        //TODO: refactor to be a better promise/async return
        var destination, from, currentOutput;
        if ( data[ constants.chlorinatorPacketFields.DEST ] === 80 )
        {
            destination = 'Salt cell';
            from = 'Controller'
        } else
        {
            destination = 'Controller'
            from = 'Salt cell'
        }


        switch ( data[ constants.chlorinatorPacketFields.ACTION ] )
        {
            case 0: //Get status of Chlorinator
                {
                    if ( settings.get( 'logChlorinator' ) )
                        logger.verbose( 'Msg# %s   %s --> %s: Please provide status: %s', counter, from, destination, data )

                    break;
                }
            case 1: //Response to get status
                {
                    if ( settings.get( 'logChlorinator' ) )
                        logger.verbose( 'Msg# %s   %s --> %s: I am here: %s', counter, from, destination, data )

                    break;
                }
            case 3: //Response to version
                {
                    var name = '';
                    var version = data[ 4 ];
                    for ( var i = 5; i <= 20; i++ )
                    {
                        name += String.fromCharCode( data[ i ] );
                    }

                    if ( currentChlorinatorStatus.name !== name && currentChlorinatorStatus.version !== version )
                    {
                        if ( settings.get( 'logChlorinator' ) )
                            logger.verbose( 'Msg# %s   %s --> %s: Chlorinator version (%s) and name (%s): %s', counter, from, destination, version, name, data );
                        currentChlorinatorStatus.name = name
                        currentChlorinatorStatus.version = version
                        settings.updateChlorinatorName( name )
                        emit()
                    }

                    break;
                }
            case 17: //Set Generate %
                {
                    currentOutput = data[ 4 ];
                    var superChlorinate
                    if ( data[ 4 ] >= 100 )
                    {
                        superChlorinate = 1
                    } else
                    {
                        superChlorinate = 0
                    }
                    if ( currentChlorinatorStatus.currentOutput !== currentOutput || currentChlorinatorStatus.superChlorinate !== superChlorinate )
                    {
                        if ( settings.get( 'logChlorinator' ) )
                            logger.verbose( 'Msg# %s   %s --> %s: Set current output to %s %: %s', counter, from, destination, superChlorinate === 1 ? 'Super Chlorinate' : currentOutput, data );
                        currentChlorinatorStatus.currentOutput = currentOutput
                        currentChlorinatorStatus.superChlorinate = superChlorinate
                        emit()
                    }

                    break
                }
            case 18: //Response to 17 (set generate %)
                {

                    var saltPPM = data[ 4 ] * 50;
                    var status = chlorinatorStatusStr( data[ 5 ] )

                    if ( currentChlorinatorStatus.saltPPM !== saltPPM || currentChlorinatorStatus.status !== status )
                    {
                        if ( settings.get( 'logChlorinator' ) )
                            logger.verbose( 'Msg# %s   %s --> %s: Current Salt level is %s PPM: %s', counter, from, destination, saltPPM, data );
                        currentChlorinatorStatus.saltPPM = saltPPM
                        currentChlorinatorStatus.status = status
                        emit()

                    }

                    if ( settings.get( 'logChlorinator' ) )
                        logger.debug( 'Msg# %s   %s --> %s: Current Salt level is %s PPM: %s', counter, from, destination, saltPPM, data );


                    break
                }
            case 20: //Get version
                {
                    if ( settings.get( 'logChlorinator' ) )
                        logger.verbose( 'Msg# %s   %s --> %s: What is your version?: %s', counter, from, destination, data )
                    break
                }
            case 21: //Set Generate %, but value / 10??
                {
                    currentOutput = data[ 6 ] / 10;

                    if ( currentChlorinatorStatus.currentOutput !== currentOutput )
                    {
                        if ( settings.get( 'logChlorinator' ) )
                            logger.verbose( 'Msg# %s   %s --> %s: Set current output to %s %: %s', counter, from, destination, currentOutput, data );
                        currentChlorinatorStatus.currentOutput = currentOutput
                        emit()
                    }
                    break
                }
            default: {
                /* istanbul ignore next */
                if ( settings.get( 'logChlorinator' ) )
                    logger.verbose( 'Msg# %s   %s --> %s: Other chlorinator packet?: %s', counter, from, destination, data )
            }
        }


        // need better logic for this.  If we set intellitouch=0 and chlorinator=0 then this will still try to control the chlorinator by writing packets.  Not ideal for purely listening mode.
        if ( currentChlorinatorStatus.installed === 0 && settings.get( 'virtual.chlorinatorController' ) !== 'never' )
        {
            currentChlorinatorStatus.installed = 1
            settings.updateChlorinatorInstalled( 1 )
            currentChlorinatorStatus.startChlorinatorController()
        }

        // check and see if we should start the chlorinator virtual controller
        if ( currentChlorinatorStatus.name.includes( 'notset' ) )
        {
            if ( chlorinatorController.isChlorinatorTimerRunning() )
            // If we see a chlorinator status packet, then request the name, but only if the chlorinator virtual
            // controller is enabled.  Note that if the Intellichlor is used, it doesn't respond to the following;
            // it's name will be in the Intellitouch status packet.
            {
                logger.verbose( 'Queueing messages to retrieve Salt Cell Name (AquaRite or OEM)' )
                //get salt cell name
                if ( settings.get( 'logPacketWrites' ) )
                {
                    logger.debug( 'decode: Queueing packet to retrieve Chlorinator Salt Cell Name: [16, 2, 80, 20, 0]' )
                }
                queuePacket.queuePacket( [ 16, 2, 80, 20, 0 ] );
            }
        }
    }


    /*istanbul ignore next */
    // if (logModuleLoading)
    //     logger.info('Loaded: chlorinator.js')
}