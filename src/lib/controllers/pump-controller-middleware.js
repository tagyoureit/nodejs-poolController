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

module.exports = function(container) {


    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: pump-controller-middleware.js')

    /* -----  HELPER FUNCTIONS -----*/

    //helper function to convert index (1, 2) to pump addres (96, 97)
    var pumpIndexToAddress = function(index) {
        index = parseInt(index)

        // changes to (eventually) support 16 pumps
        // if (index === 1) {
        //     return 96
        //
        // } else if (index === 2) {
        //     return 97
        // }
        if (index >= 1 && index <= 16) {
            return index + 95
        }
        return -1
    }

    //helper function to convert pump address (96, 97) to index (1, 2)
    var pumpAddressToIndex = function(address) {

        address = parseInt(address)
        // changes to (eventually) support 16 pumps

        // if (address === 96) {
        //     return 1
        //
        // } else if (address === 97) {
        //     return 2
        // }

        if (address >= container.constants.ctrl.PUMP1 && address <= container.constants.ctrl.PUMP16) {
            return address - 95
        }
        return -1
    }

    var validSpeed = function(index, val) {
        if (val === null) {
            return false
        } else if (container.pump.pumpType(index) === 'VS') //pump is speed or speed/flow
        {
            if (val >= 450 && val <= 3450)
                return true
            else {
                container.logger.warn('Invalid RPM/Pump Type.  Pump type is %s and requested to save RPM %s', container.pump.pumpType(index), val)
                return false
            }
        }
        // else if (container.pump.pumpType(index) === 'VF' || container.pump.pumpType(index) === 'VSF') {
        //
        //   container.logger.warn('Invalid RPM/Pump Type.  Pump type is %s and requested to save GPM %s', container.pump.pumpType(index), val)
        //   return false
        //
        // }
        // else if (container.pump.pumpType(index) === 'VS') //pump is speed or speed/flow
        // {
        //
        //     container.logger.warn('Invalid RPM/Pump Type.  Pump type is %s and requested to save RPM %s', container.pump.pumpType(index), val)
        //     return false
        //
        // }
        else if (container.pump.pumpType(index) === 'VF') {
            if (val >= 15 && val <= 130)
                return true
            else {
                container.logger.warn('Invalid GPM/Pump Type.  Pump type is %s and requested to save GPM %s', container.pump.pumpType(index), val)
                return false
            }
        }
        else if (container.pump.pumpType(index) === 'VSF') {
            if ((val >= 15 && val <= 130) || (val >= 450 && val <= 3450))
                return true
            else {
                container.logger.warn('Invalid GPM/RPM/Pump Type.  Pump type is %s and requested to save Speed %s', container.pump.pumpType(index), val)
                return false
            }
        }
    }

    // var validGPM = function(index, val) {
    //   if (val === null) {
    //     return false
    //   } else if (container.pump.pumpType(index) === 'VS') //pump is speed or speed/flow
    //   {
    //
    //     container.logger.warn('Invalid RPM/Pump Type.  Pump type is %s and requested to save RPM %s', container.pump.pumpType(index), val)
    //     return false
    //
    //   } else if (container.pump.pumpType(index) === 'VF' || container.pump.pumpType(index) === 'VSF') {
    //     if (val >= 15 && val <= 130)
    //       return true
    //     else {
    //       container.logger.warn('Invalid GPM/Pump Type.  Pump type is %s and requested to save GPM %s', container.pump.pumpType(index), val)
    //       return false
    //     }
    //   }
    // }

    var validProgram = function(program) {
        if (program >= 1 && program <= 4)
            return true
        else {
            return false
        }
    }
    /* ----- END HELPER FUNCTIONS -----*/


    /* ----- PUMP PACKET SEQUENCES -----*/

    //generic functions that ends the commands to the pump by setting control to local and requesting the status
    var endPumpCommandSequence = function(address) {
        //container.pumpController.setPumpToLocalControl(address)
        container.pumpController.requestPumpStatus(address)

    }

    //function to set the power on/off of the pump
    var runPowerSequence = function(index, power) {
        var address = pumpIndexToAddress(index)

        container.pumpController.setPumpToRemoteControl(address)
        container.pumpController.sendPumpPowerPacket(address, power)
        endPumpCommandSequence(address)

    }

    var requestStatusSequence = function(index) {
        var address = pumpIndexToAddress(index)
        container.pumpController.setPumpToRemoteControl(address)
        container.pumpController.requestPumpStatus(address)
    }

    // function pumpCommandRunSpeedProgram(index, program, rpm) {
    //     pumpCommandSaveProgram(index, program, rpm)
    //     //runProgramSequence(index, program))
    // }

    //function to run a program
    var runProgramSequence = function(index, program) {
        var address = pumpIndexToAddress(index)
        container.pumpController.setPumpToRemoteControl(address)
        container.pumpController.runProgram(address, program)
        //NOTE: In runRPM we send the power each time.  Do we not need to do that with Program sequence?
        if (container.pump.getPower(index) !== 1 && program !== 0)
            container.pumpController.sendPumpPowerPacket(address, 1)

        endPumpCommandSequence(address)
    }

    //function to run a given RPM for an unspecified time

    var runRPMSequence = function(index, rpm) {
        var address = pumpIndexToAddress(index)
        container.pumpController.setPumpToRemoteControl(address)
        //when run from Intellitouch, the power on packet is always sent
        container.pumpController.sendPumpPowerPacket(address, 1)
        container.pumpController.runRPM(address, rpm)
        endPumpCommandSequence(address)
    }

    //function to run a given GPM for an unspecified time

    var runGPMSequence = function(index, gpm) {
        var address = pumpIndexToAddress(index)
        container.pumpController.setPumpToRemoteControl(address)
        //when run from Intellitouch, the power on packet is always sent
        container.pumpController.sendPumpPowerPacket(address, 1)
        container.pumpController.runGPM(address, gpm)
        endPumpCommandSequence(address)
    }

    /* ----- END PUMP PACKET SEQUENCES -----*/


    /* -----API, SOCKET OR INTERNAL FUNCTION CALLS -----*/

    //function to save the program & speed
    var pumpCommandSaveProgram = function(index, program, speed) {
        var address = pumpIndexToAddress(index)
        if (address > -1 && validProgram(program)) {
            //set program packet
            if (validSpeed(index, speed)) {
                if (container.settings.get('logApi')) container.logger.verbose('User request to save pump %s (address %s) to Program %s as %s RPM/GPM', index, address, program, speed);

                container.pumpController.setPumpToRemoteControl(address)
                container.pumpController.saveProgramOnPump(address, program, speed)
                container.pump.saveProgram(index, program, speed)
                endPumpCommandSequence(address)
                container.io.emitToClients('pump')
                return true

            } else {
                if (container.settings.get('logApi')) container.logger.warn('FAIL: RPM/GPM provided (%s) is outside of tolerances.', speed)
                return false
            }
        }
        container.logger.warn('FAIL: User request to save pump %s (address %s) to Program %s as %s RPM/GPM', index, address, program, speed);
        return false
    }

    //function to save and run a program with speed for a duration
    function pumpCommandSaveAndRunProgramWithValueForDuration(index, program, speed, duration) {
        var address = pumpIndexToAddress(index)
        if (address > -1) {
            if (validSpeed(index, speed)) {
                if (container.settings.get('logApi')) container.logger.verbose('Request to set pump %s (address: %s) to Program %s @ %s RPM/GPM for %s minutes', index, address, program, speed, duration);
                pumpCommandSaveProgram(index, program, speed)
                container.pumpControllerTimers.startProgramTimer(index, program, duration)
                return true

            } else {
                if (container.settings.get('logApi')) container.logger.warn('FAIL: RPM/GPM provided (%s) is outside of tolerances.', speed)
                return false
            }
        }
        container.logger.warn('FAIL: Request to set pump %s (address: %s) to Program %s for @ %s RPM for %s minutes', index, address, program, speed, duration);
        return false
    }


    /* -----API, SOCKET OR INTERNAL FUNCTION CALLS -----*/


    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: pump-controller-middleware.js')

    return {
        runProgramSequence: runProgramSequence,
        pumpCommandSaveProgram: pumpCommandSaveProgram,
        pumpCommandSaveAndRunProgramWithValueForDuration: pumpCommandSaveAndRunProgramWithValueForDuration,
        runRPMSequence: runRPMSequence,
        runGPMSequence: runGPMSequence,
        runPowerSequence: runPowerSequence,
        requestStatusSequence: requestStatusSequence,

        //testing
        pumpAddressToIndex: pumpAddressToIndex,
        pumpIndexToAddress: pumpIndexToAddress
    }

}
