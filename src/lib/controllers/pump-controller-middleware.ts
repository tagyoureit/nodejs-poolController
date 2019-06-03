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

import { settings, logger, pump, pumpController, io } from'../../etc/internal';
// import  as io from '../comms/socketio-helper';

import { PumpIndexToAddress } from '../../etc/pumpAddress';


export namespace pumpControllerMiddleware
{
    export function validSpeed ( index: number, val: number )
    {
        if ( val === null )
        {
            return false
        } else if ( pump.pumpType( index ) === 'VS' ) //pump is speed or speed/flow
        {
            if ( val >= 450 && val <= 3450 )
                return true
            else
            {
                logger.warn( 'Invalid RPM/Pump Type.  Pump type is %s and requested to save RPM %s', pump.pumpType( index ), val )
                return false
            }
        }
        // else if (pump.pumpType(index) === 'VF' || pump.pumpType(index) === 'VSF') {
        //
        //   logger.warn('Invalid RPM/Pump Type.  Pump type is %s and requested to save GPM %s', pump.pumpType(index), val)
        //   return false
        //
        // }
        // else if (pump.pumpType(index) === 'VS') //pump is speed or speed/flow
        // {
        //
        //     logger.warn('Invalid RPM/Pump Type.  Pump type is %s and requested to save RPM %s', pump.pumpType(index), val)
        //     return false
        //
        // }
        else if ( pump.pumpType( index ) === 'VF' )
        {
            if ( val >= 15 && val <= 130 )
                return true
            else
            {
                logger.warn( 'Invalid GPM/Pump Type.  Pump type is %s and requested to save GPM %s', pump.pumpType( index ), val )
                return false
            }
        }
        else if ( pump.pumpType( index ) === 'VSF' )
        {
            if ( ( val >= 15 && val <= 130 ) || ( val >= 450 && val <= 3450 ) )
                return true
            else
            {
                logger.warn( 'Invalid GPM/RPM/Pump Type.  Pump type is %s and requested to save Speed %s', pump.pumpType( index ), val )
                return false
            }
        }
    }

    // export function validGPM(index, val) {
    //   if (val === null) {
    //     return false
    //   } else if (pump.pumpType(index) === 'VS') //pump is speed or speed/flow
    //   {
    //
    //     logger.warn('Invalid RPM/Pump Type.  Pump type is %s and requested to save RPM %s', pump.pumpType(index), val)
    //     return false
    //
    //   } else if (pump.pumpType(index) === 'VF' || pump.pumpType(index) === 'VSF') {
    //     if (val >= 15 && val <= 130)
    //       return true
    //     else {
    //       logger.warn('Invalid GPM/Pump Type.  Pump type is %s and requested to save GPM %s', pump.pumpType(index), val)
    //       return false
    //     }
    //   }
    // }

    export function validProgram ( program: number )
    {
        if ( program >= 1 && program <= 4 )
            return true
        else
        {
            return false
        }
    }
    /* ----- END HELPER FUNCTIONS -----*/


    /* ----- PUMP PACKET SEQUENCES -----*/

    //generic functions that ends the commands to the pump by setting control to local and requesting the status
    export function endPumpCommandSequence ( address: number )
    {
        //pumpController.setPumpToLocalControl(address)
        pumpController.requestPumpStatus( address )

    }

    //function to set the power on/off of the pump
    export function runPowerSequence ( index: Pump.PumpIndex, power: number )
    {
        var address = PumpIndexToAddress( index )

        pumpController.setPumpToRemoteControl( address )
        pumpController.sendPumpPowerPacket( address, power )
        endPumpCommandSequence( address )

    }

    export function requestStatusSequence ( index: Pump.PumpIndex )
    {
        var address = PumpIndexToAddress( index )
        pumpController.setPumpToRemoteControl( address )
        pumpController.requestPumpStatus( address )
    }

    // function pumpCommandRunSpeedProgram(index, program, rpm) {
    //     pumpCommandSaveProgram(index, program, rpm)
    //     //runProgramSequence(index, program))
    // }

    //function to run a program
    export function runProgramSequence ( index: Pump.PumpIndex, program: number )
    {
        var address = <Pump.PumpAddress>PumpIndexToAddress( index )
        pumpController.setPumpToRemoteControl( address )
        pumpController.runProgram( address, program )
        //NOTE: In runRPM we send the power each time.  Do we not need to do that with Program sequence?
        if ( pump.getPower( index ) !== 1 && program !== 0 )
            pumpController.sendPumpPowerPacket( address, 1 )

        endPumpCommandSequence( address )
    }

    //function to run a given RPM for an unspecified time

    export function runRPMSequence ( index: Pump.PumpIndex, rpm: number )
    {
        var address = <Pump.PumpAddress>PumpIndexToAddress( index )
        pumpController.setPumpToRemoteControl( address )
        //when run from Intellitouch, the power on packet is always sent
        pumpController.sendPumpPowerPacket( address, 1 )
        pumpController.runRPM( address, rpm )
        endPumpCommandSequence( address )
    }

    //function to run a given GPM for an unspecified time

    export function runGPMSequence ( index: Pump.PumpIndex, gpm: number )
    {
        var address = PumpIndexToAddress( index )
        pumpController.setPumpToRemoteControl( address )
        //when run from Intellitouch, the power on packet is always sent
        pumpController.sendPumpPowerPacket( address, 1 )
        pumpController.runGPM( address, gpm )
        endPumpCommandSequence( address )
    }

    /* ----- END PUMP PACKET SEQUENCES -----*/


    /* -----API, SOCKET OR INTERNAL FUNCTION CALLS -----*/

    //function to save the program & speed
    export function pumpCommandSaveProgram ( index: Pump.PumpIndex, program: number, speed: number )
    {
        var address = PumpIndexToAddress( index )
        if ( address > -1 && validProgram( program ) )
        {
            //set program packet
            if ( validSpeed( index, speed ) )
            {
                if ( settings.get( 'logApi' ) ) logger.verbose( 'User request to save pump %s (address %s) to Program %s as %s RPM/GPM', index, address, program, speed );

                pumpController.setPumpToRemoteControl( address )
                pumpController.saveProgramOnPump( address, program, speed )
                pump.saveProgram( index, program, speed )
                endPumpCommandSequence( address )
                io.emitToClients( 'pump' )
                return true

            } else
            {
                if ( settings.get( 'logApi' ) ) logger.warn( 'FAIL: RPM/GPM provided (%s) is outside of tolerances.', speed )
                return false
            }
        }
        logger.warn( 'FAIL: User request to save pump %s (address %s) to Program %s as %s RPM/GPM', index, address, program, speed );
        return false
    }

    //function to save and run a program with speed for a duration
    export function pumpCommandSaveProgramWithValueForDuration ( index: Pump.PumpIndex, program: number, speed: number, duration: number )
    {
        var address = PumpIndexToAddress( index )
        if ( address > -1 )
        {
            if ( validSpeed( index, speed ) )
            {
                if ( settings.get( 'logApi' ) ) logger.verbose( 'Request to set pump %s (address: %s) to Program %s @ %s RPM/GPM for %s minutes', index, address, program, speed, duration );
                pumpCommandSaveProgram( index, program, speed )
                return true

            } else
            {
                if ( settings.get( 'logApi' ) ) logger.warn( 'FAIL: RPM/GPM provided (%s) is outside of tolerances.', speed )
                return false
            }
        }
        logger.warn( 'FAIL: Request to set pump %s (address: %s) to Program %s for @ %s RPM for %s minutes', index, address, program, speed, duration );
        return false
    }
}