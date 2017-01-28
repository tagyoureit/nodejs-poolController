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
        if (container.settings.logApi) container.logger.info('End of Sending Pump Packet \n \n')

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
    function pumpCommandSaveSpeed(index, program, speed) {
        var address = pumpIndexToAddress(index)
        if (address > -1 && program >= 1 && program <= 4) {
            //set program packet
            if (speed < 450 || speed > 3450 || isNaN(speed) || speed == null) {
                if (container.settings.logApi) container.logger.warn('FAIL: Speed provided (%s) is outside of tolerances.', speed)
                return false
            } else {
                if (container.settings.logApi) container.logger.verbose('User request to save pump %s (address %s) to Program %s as %s RPM', index, address, program, speed);

                container.pumpController.setPumpToRemoteControl(address)
                container.pumpController.saveProgramOnPump(address, program, speed)
                endPumpCommand(address)
                return true
            }
        }
        container.logger.warn('FAIL: User request to save pump %s (address %s) to Program %s as %s RPM', index, address, program, speed);
        return false
    }

    //function to run a program
    function pumpCommandRunProgram(index, program) {
        var address = pumpIndexToAddress(index)
        if (address > -1) {
            if (program >= 1 && program <= 4) {

                if (container.settings.logApi) container.logger.verbose('User request to run pump %s (address %s) Program %s for an unspecified duration', index, address, program);
                container.pumpController.setPumpToRemoteControl(address)
                container.pumpController.sendPumpPowerPacket(address, 1)
                container.pumpController.runProgram(address, program)

                endPumpCommand(address)
                return true
            }
        }
        container.logger.warn('User request to run pump %s (address %s) Program %s for an unspecified duration', index, address, program);
        return false
    }

    //function to run a given RPM
    function pumpCommandRunRPM(index, rpm) {
        var address = pumpIndexToAddress(index)

        if (address > -1 && rpm >= 450 && rpm <= 3450) {

            if (container.settings.logApi) container.logger.verbose('Request to set pump %s (address: %s) to RPM %s  for (not specified) minutes', index, address, rpm);

            container.pumpController.setPumpToRemoteControl(address)
            container.pumpController.sendPumpPowerPacket(address, 1) //maybe this isn't needed???  Just to save we should not turn power on.
            container.pumpController.runRPM(address, rpm)
            //TODO: what do we want to happen when just an rpm is specified?
            //container.pumpController.setPumpDuration(address, 1)

            //run the timer update 30s 2x/minute
            //container.pumpControllerTimers.startTimer(index)

            endPumpCommand(address)
            return true
        }
        container.logger.warn('FAIL: Request to set pump %s (address: %s) to Program %s for %s minutes', index, address, program, duration);
        return false
    }

    //function to run a given RPM for a specified duration
    function pumpCommandRunProgramForDuration(index, rpm, duration) {
        var address = pumpIndexToAddress(index)

        if (address > -1 && rpm >= 450 && rpm <= 3450 && duration > 0 && duration !== null) {

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

        if (address > -1 && rpm >= 450 && rpm <= 3450 && duration !== null && duration > 0) {

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
        container.logger.warn('FAIL: Request to set pump %s (address: %s) to Program %s for %s minutes', index, address, program, duration);
        return false
    }

    //function to save and run a program with speed for a duration
    function pumpCommandSaveAndRunProgramWithSpeedForDuration(index, program, speed, duration) {
        var address = pumpIndexToAddress(index)
        if (address > -1) {
            if (pumpCommandSaveSpeed(index, program, speed) &&
                pumpCommandRunProgramForDuration(index, program, duration)) {
                if (container.settings.logApi) container.logger.verbose('Request to set pump %s to Program %s (address: %s) for @ %s RPM for %s minutes', index, address, program, speed, duration);
                return true
            }
        }
        container.logger.warn('FAIL: Request to set pump %s (address: %s) to Program %s for @ %s RPM for %s minutes', index, address, program, speed, duration);
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

    // Should be depricated
    function pumpCommand(index, program, speed, duration) {
        index = parseInt(index)
        if (speed != null) {
            speed = parseInt(speed)
        }
        if (duration != null) {
            duration = parseInt(duration)
        }

        //program should be one of 'on', 'off' or 1,2,3,4
        if (program == 'on' || program == 'off') {
            program = program
        } else {
            program = parseInt(program)
        }

        var address = pumpIndexToAddress(index);


        // container.pumpController.setPumpToRemoteControl(address)

        //set program packet
        if (speed < 450 || speed > 3450) {
            if (container.settings.logApi) container.logger.warn('Speed provided (%s) is outside of tolerances.  Program being run with speed that is stored in pump.', speed)
        } else
        if (isNaN(speed) || speed == null) {
            if (container.settings.logApi) container.logger.warn('Skipping Set Program Speed because it was not included.')
        } else {
            container.pumpController.saveProgramOnPump(address, program, speed)
        }

        if (program >= 1 && program <= 4) {
              container.pumpController.runProgram(address, program)
              container.pumpController.setPumpDuration(address, duration)
              //run the timer update 30s 2x/minute
              container.pumpControllerTimers.startTimer(index)
        } else {
            if (container.settings.logApi) container.logger.verbose('User request to set pump %s to %s @ %s RPM', index, program, speed);
            //if (program === 'off' || program === 'on')

            container.pumpController.sendPumpPowerPacket(address, program)
        }

        container.pumpController.setPumpToLocalControl(address)
        container.pumpController.requestPumpStatus(address)
        if (container.settings.logApi) container.logger.info('End of Sending Pump Packet \n \n')

        container.io.emitToClients('pump')
    }

    /* -----API, SOCKET OR INTERNAL FUNCTION CALLS -----*/
    if (container.logModuleLoading)
        container.logger.info('Loaded: pump-controller-middleware.js')

    return {
        pumpCommandRunProgram: pumpCommandRunProgram,
        pumpCommand: pumpCommand,
        pumpCommandSetPower: pumpCommandSetPower,
        pumpCommandSaveSpeed: pumpCommandSaveSpeed,
        pumpCommandRunProgramForDuration: pumpCommandRunProgramForDuration,
        pumpCommandSaveAndRunProgramWithSpeedForDuration: pumpCommandSaveAndRunProgramWithSpeedForDuration,
        pumpCommandRunRPM: pumpCommandRunRPM,
        pumpCommandRunRPMForDuration: pumpCommandRunRPMForDuration,
        //testing
        pumpAddressToIndex: pumpAddressToIndex,
        pumpIndexToAddress: pumpIndexToAddress
    }

}
