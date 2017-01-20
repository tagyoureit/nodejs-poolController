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
        container.logger.info('Loading: pump-controller.js')

    //var NanoTimer = require('nanotimer')
    var pump1Timer = container.nanoTimer;
    var pump1TimerDelay = container.nanoTimer;
    var pump2Timer = container.nanoTimer;
    var pump2TimerDelay = container.nanoTimer;
    var pumpInitialRequestConfigDelay = container.nanoTimer;
    var pumpStatusTimer = container.nanoTimer;
    var logger = container.logger;

    function startPumpController() {
        if (container.settings.numberOfPumps == 1) {
            if (container.settings.logPumpTimers) logger.silly('pumpStatusTimer.setInterval(pumpStatusCheck, [1], \'30s\');')
            pumpStatusTimer.setInterval(pumpStatusCheck, [1], '30s');
            if (container.settings.logPumpTimers) logger.silly('pumpInitialRequestConfigDelay.setTimeout(pumpStatusCheck, [1], \'3500m\');')
            pumpInitialRequestConfigDelay.setTimeout(pumpStatusCheck, [1], '3500m'); //must give a short delay to allow the port to open
            return true
        } else if (container.settings.numberOfPumps === 2){
            pumpStatusTimer.setInterval(pumpStatusCheck, [1, 2], '30s');
            pumpInitialRequestConfigDelay.setTimeout(pumpStatusCheck, [1, 2], '3500m'); //must give a short delay to allow the port to open
            return true
        }
        return false
    }


    /* ----- INTERNAL TIMERS -----*/
    function pumpStatusCheck(pump1, pump2) {
        //request pump status
        /*if (container.settings.logPumpTimers) logger.silly('pumpStatusCheck: Running pump 1 command on setInterval to check pump status')
        var statusPacket = [165, 0, 96, cotainer.settings.appAddress, 7, 0];
        logger.verbose('Sending Request Pump 1 Status: %s', statusPacket)
        container.queuePacket.queuePacket([165, 0, 96, container.settings.appAddress, 4, 1, 255]);
        container.queuePacket.queuePacket(statusPacket);
        //queuePacket([165, 0, 96, s.appAddress, 4, 1, 0]);
        */
        setPumpToRemoteControl(96)
        requestPumpStatus(96)

        if (pump2 === 2) {
            //request pump status
            /*var statusPacket = [165, 0, 97, container.settings.appAddress, 7, 0];
            logger.verbose('Sending Request Pump 2 Status: %s', statusPacket)
            container.queuePacket.queuePacket([165, 0, 97, container.settings.appAddress, 4, 1, 255]);
            container.queuePacket.queuePacket(statusPacket);
            //queuePacket([165, 0, 97, 16, 4, 1, 0]);
            */
            setPumpToRemoteControl(97)
            requestPumpStatus(97)
        }
    }


    function pump1SafePumpMode() {
        if (container.settings.logPumpTimers) logger.silly('pump1SafePumpMode: Running pump 1 on setTimer expiration')
        container.pump.updatePumpDuration(1, -0.5)
        if (container.pump.getDuration(1) > 0) {
            //set pump to remote control
            setPumpToRemoteControl(96)
                /*var remoteControlPacket = [165, 0, 96, s.appAddress, 4, 1, 255];
                logger.verbose('Sending Set pump to remote control: %s', remoteControlPacket)
                container.queuePacket.queuePacket(remoteControlPacket);
                */
                //Initially this was resending the 'timer' packet, but that was found to be ineffective.
                //Instead, sending the Program packet again resets the timer.
                //var setProgramPacket = [165, 0, 96, s.appAddress, 1, 4, 3, 33, 0, container.pump.getCurrentProgram(1) * 8];
            logger.verbose('App -> Pump 1: Sending Run Program %s. %s minutes left.', container.pump.getCurrentProgram(1), container.pump.getDuration(1));
            //container.queuePacket.queuePacket(setProgramPacket);
            runProgram(96, container.pump.getCurrentProgram(1))

            //set pump to local control
            /*
            var localControlPacket = [165, 0, 96, s.appAddress, 4, 1, 0];
            logger.verbose('Sending Set pump to local control: %s', localControlPacket)
            container.queuePacket.queuePacket(localControlPacket);
            */
            setPumpToLocalControl(96)
            if (container.settings.logPumpTimers) logger.silly('pumpStatusCheck: Setting 10s delay to run pump1SafePumpModeDelay')
            pump1TimerDelay.setTimeout(pump1SafePumpModeDelay, '', '10s')
        } else {
            logger.info('Pump 1 Program Finished.   Pump will shut down in ~10 seconds.')
                //Timer = 0, we are done.  Pump should turn off automatically
            pump1Timer.clearTimeout();
            //set program to 0
            container.pump.setPower(1, 0)
            container.io.emitToClients('pump')
        }
    }

    function pump2SafePumpMode() {
        if (container.settings.logPumpTimers) logger.silly('pump2SafePumpMode: Running pump 2 on setTimer expiration')
        container.pump.updatePumpDuration(2, -0.5)
        if (container.pump.getDuration(2) > 0) {
            //set pump to remote control
            setPumpToRemoteControl(97)
                //Initially this was resending the 'timer' packet, but that was found to be ineffective.
                //Instead, sending the Program packet again resets the timer.
                //var setProgramPacket = [165, 0, 97, 34, 1, 4, 3, 33, 0, container.pump.getCurrentProgram(2) * 8];
            logger.verbose('App -> Pump 2: Sending Run Program %s.  %s minutes left.', container.pump.getCurrentProgram(2), container.pump.getDuration(2));
            //container.queuePacket.queuePacket(setProgramPacket);
            runProgram(97, container.pump.getCurrentProgram(2))
                //set pump to local control
                //var localControlPacket = [165, 0, 97, s.appAddress, 4, 1, 0];
                //logger.verbose('Sending Set pump to local control')
                //container.queuePacket.queuePacket(localControlPacket);
            setPumpToLocalControl(97)
                //pad the timer with 10 seconds so we have a full minute per cycle
            pump2TimerDelay.setTimeout(pump2SafePumpModeDelay, '', '10s')
        } else {
            logger.info('Pump 2 Program Finished.  Pump will shut down in ~10 seconds.')
                //Timer = 0, we are done.  Pump should turn off automatically
            pump2Timer.clearTimeout();
            //set program to 0
            container.pump.setPower(2, 0)
            ToClients('pump')
        }
    }

    function pump1SafePumpModeDelay() {
        if (container.settings.logPumpTimers) logger.silly('pumpStatusCheck: Setting 20s delay to run pump1SafePumpMode')
        pump1Timer.setTimeout(pump1SafePumpMode, '', '20s')
    }

    function pump2SafePumpModeDelay() {
        pump2Timer.setTimeout(pump2SafePumpMode, '', '20s')
    }


    //clear the internal timer for pump control
    function clearTimer(pump) {
        if (pump === 1) {
            pump1Timer.clearTimeout();
            pump1TimerDelay.clearTimeout();
        } else {
            pump2Timer.clearTimeout();
            pump2TimerDelay.clearTimeout();
        }
    }

    //set the internal timer for pump controls
    function startTimer(pump) {
        if (pump === 1) {
            pump1Timer.setTimeout(pump1SafePumpMode, '', '30s')
        } else {
            pump2Timer.setTimeout(pump2SafePumpMode, '', '30s')
        }
    }
    /* ----- INTERNAL TIMERS END -----*/

    /* ----- COMMANDS SENT DIRECTLY TO THE PUMP -----*/

    //turn pump on/off
    function sendPumpPowerPacket(pump, power) {
        var index = pumpAddressToIndex(pump)
        var setPrg;
        //if (container.settings.logApi) logger.info('User request to set pump %s to %s', pump, power);
        if (power === 0) {
            setPrg = [6, 1, 4];
            clearTimer(index)
        } else if (power === 1) // pump set to on
        {
            setPrg = [6, 1, 10];
        } else {
            return false
        }
        container.pump.setPower(index, power)
        var pumpPowerPacket = [165, 0, pump, container.settings.appAddress];
        Array.prototype.push.apply(pumpPowerPacket, setPrg)
            //if (container.settings.logApi) logger.verbose('Sending Turn pump %s %s: %s', pump, power, pumpPowerPacket);
        container.queuePacket.queuePacket(pumpPowerPacket);
    }


    //set pump to remote control
    function setPumpToRemoteControl(pump) {
        var remoteControlPacket = [165, 0, pump, container.settings.appAddress, 4, 1, 255];
        if (container.settings.logApi) logger.verbose('Sending Set pump to remote control: %s', remoteControlPacket)
        container.queuePacket.queuePacket(remoteControlPacket);
    }

    //set pump to local control
    function setPumpToLocalControl(pump) {
        var localControlPacket = [165, 0, pump, container.settings.appAddress, 4, 1, 0];
        if (container.settings.logPumpMessages) logger.verbose('Sending Set pump to local control: %s', localControlPacket)
        container.queuePacket.queuePacket(localControlPacket);
    }

    //NOTE: This pump timer doesn't do what we think it does... I think.
    function setPumpTimer(pump, duration) {
        var index = pumpAddressToIndex(pump)
        var setTimerPacket = [165, 0, pump, container.settings.appAddress, 1, 4, 3, 43, 0, 1];
        if (container.settings.logApi) logger.info('Sending Set a 30 second timer (safe mode enabled, timer will reset 2x/minute for a total of %s minutes): %s', duration, setTimerPacket);
        container.pump.setDuration(index, duration)
        container.queuePacket.queuePacket(setTimerPacket);
    }

    //run program packet
    function runProgram(pump, program) {
        var index = pumpAddressToIndex(pump)
            //run program
        var runPrg = [1, 4, 3, 33, 0]
        runPrg.push(8 * program)

        var runProgramPacket = [165, 0, pump, container.settings.appAddress];
        Array.prototype.push.apply(runProgramPacket, runPrg);
        if (container.settings.logApi) logger.verbose('Sending Run Program %s: %s', program, runProgramPacket)
        container.pump.setCurrentProgram(index, program)
        container.queuePacket.queuePacket(runProgramPacket);
    }

    function saveProgramOnPump(pump, program, speed, setPrg) {
        var index = pumpAddressToIndex(pump)

        //save program on pump
        //set speed
        var setPrg = [1, 4, 3]
        setPrg.push(38 + program);
        setPrg.push(Math.floor(speed / 256))
        setPrg.push(speed % 256);
        var setProgramPacket = [165, 0, pump, container.settings.appAddress];
        Array.prototype.push.apply(setProgramPacket, setPrg);
        //logger.info(setProgramPacket, setPrg)
        if (container.settings.logApi) logger.verbose('Sending Set Program %s to %s RPM: %s', program, speed, setProgramPacket);
        container.pump.saveProgram(index, program, speed)
        container.queuePacket.queuePacket(setProgramPacket);

    }

    //request pump status
    function requestPumpStatus(pump) {
        var statusPacket = [165, 0, pump, container.settings.appAddress, 7, 0];
        if (container.settings.logApi) logger.verbose('Sending Request Pump Status: %s', statusPacket)
        container.queuePacket.queuePacket(statusPacket);
    }


    /* ----- COMMANDS SENT DIRECTLY TO THE PUMP END -----*/




    /* -----API, SOCKET OR INTERNAL FUNCTION CALLS -----*/

    //generic functions that ends the commands to the pump by setting control to local and requesting the status
    function endPumpCommand(pump) {
        setPumpToLocalControl(pump)
        requestPumpStatus(pump)
        if (container.settings.logApi) logger.info('End of Sending Pump Packet \n \n')

        container.io.emitToClients('pump')

    }

    //function to set the power on/off of the pump
    function pumpCommandSetPower(index, power) {
        var pump = pumpIndexToAddress(index)
        if (pump > -1 && (power === 0 || power === 1)) {
            setPumpToRemoteControl(pump)
            if (container.settings.logApi) logger.verbose('User request to set pump %s power to %s', index, power === 1 ? 'on' : 'off');

            sendPumpPowerPacket(pump, power)
            endPumpCommand(pump)
            return true
        }
        logger.warn('FAIL: request to set pump %s (address %s) power to %s', index, pump, power === 1 ? 'on' : 'off');
        return false
    }

    //function to save the program & speed
    function pumpCommandSaveSpeed(index, program, speed) {
        var pump = pumpIndexToAddress(index)
        if (pump > -1 && program >= 1 && program <= 4) {
            //set program packet
            if (speed <= 450 || speed >= 3450 || isNaN(speed) || speed == null) {
                if (container.settings.logApi) logger.warn('Speed provided (%s) is outside of tolerances.  Program being run with speed that is stored in pump.', speed)
                return false
            } else {
                if (container.settings.logApi) logger.verbose('User request to save pump %s (address %s) to Program %s as %s RPM', pumpAddressToIndex(pump), pump, program, speed);

                setPumpToRemoteControl(pump)
                saveProgramOnPump(pump, program, speed)
                endPumpCommand(pump)
            }
            return true
        }
        logger.warn('FAIL: User request to save pump %s (address %s) to Program %s as %s RPM', pumpAddressToIndex(pump), pump, program, speed);
        return false
    }

    //function to run a program
    function pumpCommandRunProgram(index, program) {
        var pump = pumpIndexToAddress(index)
        if (pump > -1) {
            if (program >= 1 && program <= 4) {

                if (container.settings.logApi) logger.verbose('User request to run pump %s (address %s) Program %s for an unspecified duration', index, pump, program);
                setPumpToRemoteControl(pump)
                runProgram(pump, program)
                sendPumpPowerPacket(pump, 1)
                endPumpCommand(pump)
                return true
            }
        }
        logger.warn('User request to run pump %s (address %s) Program %s for an unspecified duration', index, pump, program);
        return false
    }


    //function to run a program for a specified duration
    function pumpCommandRunProgramForDuration(index, program, duration) {
        var pump = pumpIndexToAddress(index)

        if (pump > -1 && program >= 1 && program <= 4 && duration > 0 && duration !== null) {

            if (container.settings.logApi) logger.verbose('Request to set pump %s to Program %s (address: %s) for %s minutes', index, pump, program, duration);

            setPumpToRemoteControl(pump)
            runProgram(pump, program)
            sendPumpPowerPacket(pump, 1) //maybe this isn't needed???  Just to save we should not turn power on.
            setPumpTimer(pump, duration)

            //run the timer update 50s into the 1st minute
            startTimer(index)

            endPumpCommand(pump)
            return true
        }
        logger.warn('FAIL: Request to set pump %s (address: %s) to Program %s for %s minutes', index, pump, program, duration);
        return false
    }

    //function to save and run a program with speed for a duration
    function pumpSaveAndRunProgramWithSpeedForDuration(index, program, speed, duration) {
        var pump = pumpIndexToAddress(index)
        if (pump > -1) {
            if (pumpCommandSaveSpeed(index, program, speed) &&
                pumpCommandRunProgramForDuration(index, program, duration)) {
                if (container.settings.logApi) logger.verbose('Request to set pump %s to Program %s (address: %s) for @ %s RPM for %s minutes', index, pump, program, speed, duration);
                return true
            }
        }
        logger.warn('FAIL: Request to set pump %s (address: %s) to Program %s for @ %s RPM for %s minutes', index, pump, program, speed, duration);
        return false
    }

    //helper function to convert index (1, 2) to pump addres (96, 97)
    function pumpIndexToAddress(index) {

        if (index === 1) {
            return 96

        } else if (index === 2) {
            return 97
        }
        return -1
    }

    //helper function to convert pump address (96, 97) to index (1, 2)
    function pumpAddressToIndex(pump) {

        if (pump === 96) {
            return 1

        } else if (pump === 97) {
            return 2
        }
        return -1
    }

    // Should be depricated
    function pumpCommand(equip, program, speed, duration) {
        equip = parseInt(equip)
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

        var pump;
        if (equip === 1) {
            pump = 96
        } else {
            pump = 97
        }

        setPumpToRemoteControl(pump)

        //set program packet
        if (speed < 450 || speed > 3450) {
            if (container.settings.logApi) logger.warn('Speed provided (%s) is outside of tolerances.  Program being run with speed that is stored in pump.', speed)
        } else
        if (isNaN(speed) || speed == null) {
            if (container.settings.logApi) logger.warn('Skipping Set Program Speed because it was not included.')
        } else {
            saveProgramOnPump(pump, program, speed)
        }

        if (program >= 1 && program <= 4) {


        } else {
            if (container.settings.logApi) logger.verbose('User request to set pump %s to %s @ %s RPM', equip, program, speed);
            //if (program === 'off' || program === 'on')
            //setPrg = powerOnOffPacket(equip, program)

            sendPumpPowerPacket(pump, program)
        }
        setPumpToLocalControl(pump)
        requestPumpStatus(pump)
        if (container.settings.logApi) logger.info('End of Sending Pump Packet \n \n')

        container.io.emitToClients('pump')
    }

    /* -----API, SOCKET OR INTERNAL FUNCTION CALLS -----*/
    if (container.logModuleLoading)
        container.logger.info('Loaded: settings.js')

    return {
        startPumpController: startPumpController,
        pumpCommand: pumpCommand,
        pumpCommandSetPower: pumpCommandSetPower,
        pumpCommandSaveSpeed: pumpCommandSaveSpeed,
        pumpCommandRunProgram: pumpCommandRunProgram,
        pumpCommandRunProgramForDuration: pumpCommandRunProgramForDuration,
        pumpSaveAndRunProgramWithSpeedForDuration: pumpSaveAndRunProgramWithSpeedForDuration
    }

}
