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


    if (container.logModuleLoading)
        container.logger.info('Loading: pump-controller-middleware.js')
    /* -----API, SOCKET OR INTERNAL FUNCTION CALLS -----*/

    //generic functions that ends the commands to the pump by setting control to local and requesting the status
    function endPumpCommand(address) {
        container.pumpController.setPumpToLocalControl(address)
        container.pumpController.requestPumpStatus(address)
        if (container.settings.logApi) container.logger.verbose('Pump %s set to Local Control and Status requested \n \n', address)

        container.io.emitToClients('pump')

    }

    //function to set the power on/off of the pump
    function pumpCommandSetPower(index, power) {
        var address = pumpIndexToAddress(index)
        if (address > -1 && (power === 0 || power === 1)) {
            container.pumpController.setPumpToRemoteControl(address)
            if (container.settings.logApi) container.logger.verbose('User request to set pump %s power to %s', index, power === 1 ? 'on' : 'off');

            container.pumpController.sendPumpPowerPacket(address, power)
            endPumpCommand(address)
            return true
        }
        container.logger.warn('FAIL: request to set pump %s (address %s) power to %s', index, address, power === 1 ? 'on' : 'off');
        return false
    }

    //function to save the program & speed
    function pumpCommandSaveProgramSpeed(index, program, rpm) {
        var address = pumpIndexToAddress(index)
        if (address > -1 && validProgram(program)) {
            //set program packet
            if (validRPM(rpm)) {
              if (container.settings.logApi) container.logger.verbose('User request to save pump %s (address %s) to Program %s as %s RPM', index, address, program, rpm);

              container.pumpController.setPumpToRemoteControl(address)
              container.pumpController.saveProgramOnPump(address, program, rpm)
              endPumpCommand(address)
              return true

            } else {
              if (container.settings.logApi) container.logger.warn('FAIL: RPM provided (%s) is outside of tolerances.', rpm)
              return false
            }
        }
        container.logger.warn('FAIL: User request to save pump %s (address %s) to Program %s as %s RPM', index, address, program, rpm);
        return false
    }

    function pumpCommandRunSpeedProgram(index, program, rpm) {
        return (pumpCommandSaveProgramSpeed(index, program, rpm) && pumpCommandRunProgram(index, program))
    }

    //function to run a program
    function pumpCommandRunProgram(index, program) {
        // var address = pumpIndexToAddress(index)
        // if (address > -1) {
        //     if (validProgram(program)) {
        //
        //         if (container.settings.logApi) container.logger.verbose('User request to run pump %s (address %s) Program %s for an unspecified duration', index, address, program);
        //         container.pumpController.setPumpToRemoteControl(address)
        //         container.pumpController.sendPumpPowerPacket(address, 1)
        //         container.pumpController.runProgram(address, program)
        //         //TODO: what do we want to happen when just an program is specified?
        //         container.pumpController.setPumpDuration(address, 1440)
        //
        //         //run the timer update 30s 2x/minute
        //         container.pumpControllerTimers.startTimer(index)
        //         endPumpCommand(address)
        //         return true
        //     }
        // }
        // container.logger.warn('User request to run pump %s (address %s) Program %s for an unspecified duration', index, address, program);
        // return false
        return pumpCommandRunProgramForDuration(index, program, 1440)
    }

    //function to run a given RPM
    function pumpCommandRunRPM(index, rpm) {
        // var address = pumpIndexToAddress(index)
        //
        // if (address > -1 && validRPM(rpm)) {
        //
        //     if (container.settings.logApi) container.logger.verbose('Request to set pump %s (address: %s) to RPM %s  for (not specified) minutes', index, address, rpm);
        //
        //     container.pumpController.setPumpToRemoteControl(address)
        //     container.pumpController.sendPumpPowerPacket(address, 1) //maybe this isn't needed???  Just to save we should not turn power on.
        //     container.pumpController.runRPM(address, rpm)
        //     //TODO: what do we want to happen when just an rpm is specified?
        //     container.pumpController.setPumpDuration(address, 1440)
        //
        //     //run the timer update 30s 2x/minute
        //     container.pumpControllerTimers.startTimer(index)
        //
        //     endPumpCommand(address)
        //     return true
        // }
        // container.logger.warn('FAIL: Request to set pump %s (address: %s) to Program %s for %s minutes', index, address, program, duration);
        // return false
        return pumpCommandRunRPMForDuration(index, rpm, 1440)

    }

    //function to run a given RPM for a specified duration
    function pumpCommandRunProgramForDuration(index, program, duration) {
        var address = pumpIndexToAddress(index)

        if (address > -1 && validProgram(program) && duration > 0 && duration !== null) {

            if (container.settings.logApi) container.logger.verbose('Request to set pump %s (address: %s) to Program %s  for %s minutes', index, address, program, duration);

            container.pumpController.setPumpToRemoteControl(address)
            container.pumpController.sendPumpPowerPacket(address, 1) //maybe this isn't needed???  Just to save we should not turn power on.
            container.pumpController.runProgram(address, program)
            container.pumpController.setPumpDuration(address, duration)

            //run the timer update 30s 2x/minute
            container.pumpControllerTimers.startTimer(index)

            endPumpCommand(address)
            return true
        }
        container.logger.warn('FAIL: Request to set pump %s (address: %s) to Program %s for %s minutes', index, address, program, duration);
        return false
    }

    //function to run a program for a specified duration
    function pumpCommandRunRPMForDuration(index, rpm, duration) {
        var address = pumpIndexToAddress(index)

        if (address > -1 && validRPM(rpm) && duration !== null && duration > 0) {

            if (container.settings.logApi) container.logger.verbose('Request to set pump %s (address: %s) to RPM %s  for %s minutes', index, address, rpm, duration);

            container.pumpController.setPumpToRemoteControl(address)
            container.pumpController.sendPumpPowerPacket(address, 1) //maybe this isn't needed???  Just to save we should not turn power on.
            container.pumpController.runRPM(address, rpm)
            console.log('duration_: ', duration)
            container.pumpController.setPumpDuration(address, duration)

            //run the timer update 30s 2x/minute
            container.pumpControllerTimers.startTimer(index)

            endPumpCommand(address)
            return true
        }
        container.logger.warn('FAIL: Request to set pump %s (address: %s) @ %s RPM for %s minutes', index, address, rpm, duration);
        return false
    }

    //function to save and run a program with rpm for a duration
    function pumpCommandSaveAndRunProgramWithSpeedForDuration(index, program, rpm, duration) {
        var address = pumpIndexToAddress(index)
        if (address > -1) {
            if (pumpCommandSaveProgramSpeed(index, program, rpm) &&
                pumpCommandRunProgramForDuration(index, program, duration)) {
                if (container.settings.logApi) container.logger.verbose('Request to set pump %s to Program %s (address: %s) for @ %s RPM for %s minutes', index, address, program, rpm, duration);
                return true
            }
        }
        container.logger.warn('FAIL: Request to set pump %s (address: %s) to Program %s for @ %s RPM for %s minutes', index, address, program, rpm, duration);
        return false
    }

    //helper function to convert index (1, 2) to pump addres (96, 97)
    pumpIndexToAddress = function(index) {
        index = parseInt(index)
        if (index === 1) {
            return 96

        } else if (index === 2) {
            return 97
        }
        return -1
    }

    //helper function to convert pump address (96, 97) to index (1, 2)
    pumpAddressToIndex = function(address) {
        address = parseInt(address)
        if (address === 96) {
            return 1

        } else if (address === 97) {
            return 2
        }
        return -1
    }

    validRPM = function(rpm) {
        if (rpm >= 450 && rpm <= 3450)
            return true
        else
            return false
    }

    validProgram = function(program) {
        if (program >= 1 && program <= 4)
            return true
        else {
            return false
        }
    }

    // Should be depricated
    function pumpCommand(index, program, rpm, duration) {

        index = parseInt(index)

        if (rpm != null) {
            rpm = parseInt(rpm)
        }
        if (duration != null) {
            duration = parseInt(duration)
        }

        if (program == 'off') {
            pumpCommandSetPower(index, 0)
        } else if (program === 'on') {
            //what does this do on various pumps?
            pumpCommandSetPower(index, 1)
        }

        if (validProgram(program)) {
            if (validRPM(rpm)) {
                if (duration > 0) {
                    pumpCommandSaveAndRunProgramWithSpeedForDuration(index, program, rpm, duration)
                    //if (container.settings.logApi) container.logger.verbose('User request to save and run  pump %s as program %s @ %s RPM for %s minutes', index, program, rpm, duration);

                } else {
                    pumpCommandSaveProgramSpeed(index, program, rpm)
                    //if (container.settings.logApi) container.logger.verbose('User request to save pump %s as program %s @ %s RPM', index, program, rpm);
                }
            } else {
                if (duration > 0) {
                    pumpCommandRunProgramForDuration(index, program, duration)
                    //if (container.settings.logApi) container.logger.verbose('User request to run pump %s as program %s for %s minutes', index, program, duration);
                } else {
                    pumpCommandRunProgram(index, program)
                    //if (container.settings.logApi) container.logger.verbose('User request to run pump %s as program %s for an unspecified duration (will set timer to 24 hours)', index, program);

                }
            }
        }
        //Program not valid
        else {
            if (duration > 0) {
                //With duration, run for duration
                pumpCommandRunRPMForDuration(index, rpm, duration)
                //if (container.settings.logApi) container.logger.verbose('User request to run pump %s @ %s RPM for %s minutes', index, rpm, duration);


            } else {
                //without duration, set timer for 24 hours
                pumpCommandRunRPM(index, rpm)
                //if (container.settings.logApi) container.logger.verbose('User request to run pump %s @ %s RPM for an unspecified duration (will set timer to 24 hours)', index, rpm);

            }
        }


        // //program should be one of 'on', 'off' or 1,2,3,4
        // if (program == 'on' || program == 'off') {
        //     program = program
        // } else {
        //     program = parseInt(program)
        // }
        //
        // var address = pumpIndexToAddress(index);
        //
        //
        // container.pumpController.setPumpToRemoteControl(address)
        //
        // //set program packet
        // if (validRPM(rpm)) {
        //     if (container.settings.logApi) container.logger.warn('rpm provided (%s) is outside of tolerances.  Program being run with rpm that is stored in pump.', rpm)
        // } else
        // if (isNaN(rpm) || rpm == null) {
        //     if (container.settings.logApi) container.logger.warn('Skipping Set Program rpm because it was not included.')
        // } else {
        //     container.pumpController.saveProgramOnPump(address, program, rpm)
        // }
        //
        // if (validProgram(program)) {
        //     container.pumpController.runProgram(address, program)
        //     container.pumpController.setPumpDuration(address, duration)
        //     //run the timer update 30s 2x/minute
        //     container.pumpControllerTimers.startTimer(index)
        // } else {
        //     if (container.settings.logApi) container.logger.verbose('User request to set pump %s to %s @ %s RPM', index, program, rpm);
        //     //if (program === 'off' || program === 'on')
        //
        //     container.pumpController.sendPumpPowerPacket(address, program)
        // }
        //
        // container.pumpController.setPumpToLocalControl(address)
        // container.pumpController.requestPumpStatus(address)
        //if (container.settings.logApi) container.logger.info('pumpCommand: End of Sending Pump Packet \n \n')

        //container.io.emitToClients('pump')
    }

    /* -----API, SOCKET OR INTERNAL FUNCTION CALLS -----*/
    if (container.logModuleLoading)
        container.logger.info('Loaded: pump-controller-middleware.js')

    return {
        pumpCommandRunProgram: pumpCommandRunProgram,
        pumpCommand: pumpCommand,
        pumpCommandSetPower: pumpCommandSetPower,
        pumpCommandSaveProgramSpeed: pumpCommandSaveProgramSpeed,
        pumpCommandRunProgramForDuration: pumpCommandRunProgramForDuration,
        pumpCommandSaveAndRunProgramWithSpeedForDuration: pumpCommandSaveAndRunProgramWithSpeedForDuration,
        pumpCommandRunRPM: pumpCommandRunRPM,
        pumpCommandRunRPMForDuration: pumpCommandRunRPMForDuration,
        //testing
        pumpAddressToIndex: pumpAddressToIndex,
        pumpIndexToAddress: pumpIndexToAddress
    }

}
