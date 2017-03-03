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
        container.logger.info('Loading: pump.js')

    function Pump(number, name, time, run, mode, drivestate, watts, rpm, gpm, ppc, err, timer, duration, currentrunning, programRPM, program1rpm, program2rpm, program3rpm, program4rpm, remotecontrol, power) {
        this.pump = number; //1 or 2
        this.name = name;
        this.time = time;
        this.run = run;
        this.mode = mode;
        this.drivestate = drivestate;
        this.watts = watts;
        this.rpm = rpm;
        this.gpm = gpm;
        this.ppc = ppc;
        this.err = err;
        this.timer = timer;
        this.duration = duration; //duration on pump, not program duration
        this.currentrunning = currentrunning
        this.programRPM = programRPM
        this.program1rpm = program1rpm;
        this.program2rpm = program2rpm;
        this.program3rpm = program3rpm;
        this.program4rpm = program4rpm;
        this.remotecontrol = remotecontrol;
        this.power = power;
    }

    var pump1,
        pump2,
        currentPumpStatus
        // ,        currentPumpStatusPacket


    var numberOfPumps = function() {
        var numberOfPumps = -1
        if (numberOfPumps === -1) {
            numberOfPumps = container._.size(container.settings.pump)
            container.logger.info('Number of pumps:', numberOfPumps)
            return numberOfPumps
        }
        return numberOfPumps
    }

    var loadProgramRPMfromConfig = function() {
        for (var _pump in container.settings.pump) {
        currentPumpStatus[_pump].programRPM = JSON.parse(JSON.stringify(container.settings.pump[_pump].programRPM))
    }
  }

    var init = function() {
        if (container.settings.logPumpMessages)
            if (currentPumpStatus === undefined) {
                container.logger.silly('initializing pumps for first time')
            }
        else {
            container.logger.silly('will reset pumps...')
        }


        pump1 = new Pump(1, 'namenotset', 'timenotset', 'runnotset', 'modenotset', 'drivestatenotset', 'wattsnotset', 'rpmnotset', 'gpmnotset', 'ppcnotset', 'errnotset', 'timernotset', 'durationnotset', {
            'mode': 'off',
            'value': 0,
            'remainingduration': -1
        }, {
            "1": -1,
            "2": -1,
            "3": -1,
            "4": -1
        }, 'prg1notset', 'prg2notset', 'prg3notset', 'prg4notset', 'remotecontrolnotset', 'powernotset');
        pump2 = new Pump(2, 'namenotset', 'timenotset', 'runnotset', 'modenotset', 'drivestatenotset', 'wattsnotset', 'rpmnotset', 'gpmnotset', 'ppcnotset', 'errnotset', 'timernotset', 'durationnotset', {
            'mode': 'off',
            'value': 0,
            'remainingduration': -1
        }, {
            "1": -1,
            "2": -1,
            "3": -1,
            "4": -1
        }, 'prg1notset', 'prg2notset', 'prg3notset', 'prg4notset', 'remotecontrolnotset', 'powernotset');
        //object to hold pump information.  Pentair uses 1 and 2 as the pumps so we will set array[0] to a placeholder.
        currentPumpStatus = {'1': pump1, '2': pump2}


        // currentPumpStatusPacket = ['blank', [],  []]; // variable to hold the status packets of the pumps

        loadProgramRPMfromConfig()

        if (container.settings.logPumpMessages)
            container.logger.silly('just reset pumps...')
    }

    function setTime(pump, hour, min) {
        var timeStr = container.helpers.formatTime(hour, min)
        currentPumpStatus[pump].time = timeStr
        container.time.setPumpTime(pump, timeStr)
    }


    var significantWattsChange = function(pump, watts, counter) {
        if ((Math.abs((watts - currentPumpStatus[pump].watts) / watts)) > (5 / 100)) {
            if (container.settings.logPumpMessages) container.logger.info('Msg# %s   Pump %s watts changed >5%: %s --> %s \n', counter, pump, currentPumpStatus[pump].watts, watts)
            return true
        }
        return false
    }

    function getPumpNumber(data) {
        var pump;
        if (data[container.constants.packetFields.FROM] === 96 || data[container.constants.packetFields.DEST] === 96) {
            pump = 1
        } else {
            pump = 2
        }

        var pumpStatus = JSON.parse(JSON.stringify(currentPumpStatus[pump]));
        if (currentPumpStatus.name === undefined) {
            currentPumpStatus[pump].name = container.constants.ctrlString[pump + 95]
            currentPumpStatus[pump].pump = pumpStatus.pump
        }

        return pump
    }

    function pumpACK(data, from, counter) {
        if (container.settings.logPumpMessages)
            container.logger.verbose('Msg# %s   %s responded with acknowledgement: %s', counter, container.constants.ctrlString[from], JSON.stringify(data));
    }

    function setCurrentProgramFromController(program, from, data, counter) {
        //setAmount = setAmount / 8
        var pump = getPumpNumber(data)

        if (currentPumpStatus[pump].currentprogram !== program) {
            currentPumpStatus[pump].currentprogram = program;
            if (container.settings.logPumpMessages)
                container.logger.verbose('Msg# %s   %s: Set Current Program to %s %s', counter, container.constants.ctrlString[from], program.toString(), JSON.stringify(data));
        }
        container.io.emitToClients('pump')

    }



    function getCurrentProgram(pump) {
        return currentPumpStatus[pump].currentprogram
    }


    function saveProgramAs(program, rpm, from, data, counter) {
        // var programXrpm = 'program' + program.toString() + 'rpm'
        //
        // var pump = getPumpNumber(data)
        //
        // if (currentPumpStatus[pump].programXrpm !== rpm) {
        //     currentPumpStatus[pump].programXrpm = rpm;
        //     if (container.settings.logPumpMessages)
        //         container.logger.verbose('Msg# %s   %s: Save Program %s as %s RPM %s', counter, program, container.constants.ctrlString[from], rpm, JSON.stringify(data));
        // }

        //var programRPM = 'program' + program.toString() + 'rpm'

        var _pump = getPumpNumber(data)

        if (currentPumpStatus[_pump].programRPM[program] !== rpm) {
            // container.settings.pump[_pump].programRPM[program] = rpm
            container.configEditor.updatePumpProgramRPM(_pump, program, rpm)
            currentPumpStatus[_pump].programRPM[program] = rpm;
            if (container.settings.logPumpMessages)
                container.logger.verbose('Msg# %s   %s: Save Program %s as %s RPM %s', counter, program, container.constants.ctrlString[from], rpm, JSON.stringify(data));
        }


        container.io.emitToClients('pump')
    }

    function setRemoteControl(remotecontrol, from, data, counter) {
        var remoteControlStr = remotecontrol === 0 ? 'enable' : 'disable'
        var pump = getPumpNumber(data)
        if (data[container.constants.packetFields.DEST] === 96 || data[container.constants.packetFields.DEST] === 97) //Command to the pump
        {
            if (container.settings.logPumpMessages)
                container.logger.verbose('Msg# %s   %s --> %s: Remote control - %s pump control panel: %s', counter, container.constants.ctrlString[from], container.constants.ctrlString[data[container.constants.packetFields.DEST]], remoteControlStr, JSON.stringify(data));
        } else {
            if (container.settings.logPumpMessages)
                container.logger.verbose('Msg# %s   %s: Remote control -  %s pump control panel: %s', counter, container.constants.ctrlString[from], remoteControlStr, JSON.stringify(data));
        }
        currentPumpStatus[pump].remotecontrol = remotecontrol
    }

    function setRunMode(mode, from, data, counter) {
        var pump = getPumpNumber(data)
        if (data[container.constants.packetFields.DEST] === 96 || data[container.constants.packetFields.DEST] === 97) //Command to the pump
        {

            switch (mode) {
                case 0:
                    {
                        mode = "Filter";
                        break;
                    }
                case 1:
                    {
                        mode = "Manual";
                        break;
                    }
                case 2:
                    {
                        mode = "Speed 1";
                        break;
                    }
                case 3:
                    {
                        mode = "Speed 2";
                        break;
                    }
                case 4:
                    {
                        mode = "Speed 3";
                        break;
                    }
                case 5:
                    {
                        mode = "Speed 4";
                        break;
                    }
                case 6:
                    {
                        mode = "Feature 1";
                        break;
                    }
                case 7:
                    {
                        mode = "Unknown pump mode";
                        break;
                    }
                case 8:
                    {
                        mode = "Unknown pump mode";
                        break;
                    }
                case 9:
                    {
                        mode = "External Program 1";
                        break;
                    }
                case 10:
                    {
                        mode = "External Program 2";
                        break;
                    }
                case 11:
                    {
                        mode = "External Program 3";
                        break;
                    }
                case 12:
                    {
                        mode = "External Program 4";
                        break;
                    }
                default:
                    {
                        mode = "Oops, we missed something!"
                    }

            }

            if (currentPumpStatus[pump].mode !== mode) {
                currentPumpStatus[pump].mode = mode;
                if (container.settings.logPumpMessages)
                    container.logger.verbose('Msg# %s   %s --> %s: Set pump mode to _%s_: %s', counter, container.constants.ctrlString[from], container.constants.ctrlString[data[container.constants.packetFields.DEST]], mode, JSON.stringify(data));
            }
            container.io.emitToClients('pump')

        } else {
            if (container.settings.logPumpMessages)
                container.logger.verbose('Msg# %s   %s confirming it is in mode %s: %s', counter, container.constants.ctrlString[data[container.constants.packetFields.FROM]], data[container.constants.packetFields.CMD], JSON.stringify(data));
        }

    }

    function setPowerFromController(power, from, data, counter) {
        var pump = getPumpNumber(data)
        var powerStr = power === 1 ? 'on' : 'off'

        if (data[container.constants.packetFields.DEST] === 96 || data[container.constants.packetFields.DEST] === 97) //Command to the pump
        {
            if (container.settings.logPumpMessages)
                container.logger.verbose('Msg# %s   %s --> %s: Pump power to %s: %s', counter, container.constants.ctrlString[from], container.constants.ctrlString[data[container.constants.packetFields.DEST]], powerStr, JSON.stringify(data));

        } else {
            if (currentPumpStatus[pump].power !== power) {
                currentPumpStatus[pump].power = power;
                if (container.settings.logPumpMessages)
                    container.logger.verbose('Msg# %s   %s: Pump power %s: %s', counter, container.constants.ctrlString[from], powerStr, JSON.stringify(data));

                container.io.emitToClients('pump')
            }

        }
    }


    function provideStatus(data, counter) {
        if (container.settings.logPumpMessages)
            container.logger.verbose('Msg# %s   %s --> %s: Provide status: %s', counter, container.constants.ctrlString[data[container.constants.packetFields.FROM]], container.constants.ctrlString[data[container.constants.packetFields.DEST]], JSON.stringify(data));

    }

    function setPumpStatus(pump, hour, min, run, mode, drivestate, watts, rpm, gpm, ppc, err, timer, data, counter) {
        setTime(pump, hour, min)
        var needToEmit = 0
        var whatsDifferent = ''

        if (currentPumpStatus[pump].watts === 'wattsnotset') {
            needToEmit = 1
            currentPumpStatus[pump].run = run
            currentPumpStatus[pump].mode = mode
            currentPumpStatus[pump].drivestate = drivestate
            currentPumpStatus[pump].watts = watts
            currentPumpStatus[pump].rpm = rpm
            currentPumpStatus[pump].gpm = gpm
            currentPumpStatus[pump].ppc = ppc
            currentPumpStatus[pump].err = err
            currentPumpStatus[pump].timer = timer
        } else {

            if (significantWattsChange(pump, watts, counter) || currentPumpStatus[pump].run !== run || currentPumpStatus[pump].mode !== mode) {
                needToEmit = 1
            }

            if (currentPumpStatus[pump].run !== run) {
                whatsDifferent += 'Run: ' + currentPumpStatus[pump].run + '-->' + run + ' '
                currentPumpStatus[pump].run = run
                needToEmit = 1
            }
            if (currentPumpStatus[pump].mode !== mode) {
                whatsDifferent += 'Mode: ' + currentPumpStatus[pump].mode + '-->' + mode + ' '
                currentPumpStatus[pump].mode = mode
                needToEmit = 1
            }
            if (currentPumpStatus[pump].drivestate !== drivestate) {
                whatsDifferent += 'Drivestate: ' + currentPumpStatus[pump].drivestate + '-->' + drivestate + ' '
                currentPumpStatus[pump].drivestate = drivestate
            }
            if (currentPumpStatus[pump].watts !== watts) {
                whatsDifferent += 'Watts: ' + currentPumpStatus[pump].watts + '-->' + watts + ' '
                currentPumpStatus[pump].watts = watts
            }
            if (currentPumpStatus[pump].rpm !== rpm) {
                whatsDifferent += 'rpm: ' + currentPumpStatus[pump].rpm + '-->' + rpm + ' '
                currentPumpStatus[pump].rpm = rpm
            }
            if (currentPumpStatus[pump].gpm !== gpm) {
                whatsDifferent += 'gpm: ' + currentPumpStatus[pump].gpm + '-->' + gpm + ' '
                currentPumpStatus[pump].gpm = gpm
            }
            if (currentPumpStatus[pump].ppc !== ppc) {
                whatsDifferent += 'ppc: ' + currentPumpStatus[pump].ppc + '-->' + ppc + ' '
                currentPumpStatus[pump].ppc = ppc
            }
            if (currentPumpStatus[pump].err !== err) {
                whatsDifferent += 'Err: ' + currentPumpStatus[pump].err + '-->' + err + ' '
                currentPumpStatus[pump].err = err
            }
            if (currentPumpStatus[pump].timer !== timer) {
                whatsDifferent += 'Timer: ' + currentPumpStatus[pump].timer + '-->' + timer + ' '
                currentPumpStatus[pump].timer = timer
            }

            if (container.settings.logPumpMessages)
                container.logger.verbose('\n Msg# %s  %s Status changed %s : ', counter, container.constants.ctrlString[pump + 95], whatsDifferent, data, '\n');

        }
        if (needToEmit) {
            container.io.emitToClients('pump');
        }
    }

    var setPower = function(pump, power) {
        currentPumpStatus[pump].power = power
        if (power === 0) {
            currentPumpStatus[pump].duration = 0;
            currentPumpStatus[pump].currentprogram = 0;
        }
    }

    var getPower = function(index) {
        return currentPumpStatus[index].power
    }


    //sets the current running program to pump & program & (optional) rpm
    var setCurrentProgram = function(pump, program, rpm) {
        //console.log('pump: %s,  program %s, rpm %s', pump, program, rpm)
        if (rpm === undefined) {
            currentPumpStatus[pump].currentprogram = program;
        } else {
            // var str = 'program' + program + 'rpm';
            // currentPumpStatus[pump][str] = rpm;
            currentPumpStatus[pump].programRPM[program] = rpm;
            container.configEditor.updatePump(pump, 'programRPM', null, rpm)
            currentPumpStatus[pump].currentprogram = program;
        }

    }

    //saves a program & rpm
    var saveProgram = function(pump, program, rpm) {
        // var str = 'program' + program + 'rpm';
        currentPumpStatus[pump].programRPM[program] = rpm;
        container.configEditor.updatePumpProgramRPM(pump, program, rpm)
    }

    var setCurrentRPM = function(index, rpm) {
        currentPumpStatus[index].currentrpm = rpm

    }

    var getCurrentPumpStatus = function() {
        return currentPumpStatus
    }

    var setDuration = function(index, _duration) {
        currentPumpStatus[index].duration = _duration;
    }

    var getDuration = function(index) {
        return currentPumpStatus[index].duration;
    }

    var getCurrentRemainingDuration = function(index) {
        return currentPumpStatus[index].currentrunning.remainingduration;
    }

    var getCurrentRunningMode = function(pump) {
        return currentPumpStatus[pump].currentrunning.mode;
    }

    var getCurrentRunningValue = function(pump) {
        return currentPumpStatus[pump].currentrunning.value;
    }

    var updatePumpDuration = function(pump, _duration) {
        currentPumpStatus[pump].duration = (currentPumpStatus[pump].duration + _duration);
    }

    var updateCurrentRunningPumpDuration = function(pump, _duration) {
        currentPumpStatus[pump].currentrunning.remainingduration += _duration
    }

    var setCurrentRunning = function(index, program, value, duration) {
        //we have the option to broadcast because when we start the pump for x minutes, we set it for x.5 minutes.  We don't
        //need/want to broadcast this first message as it will be confusing.
        var newCurrentRunning = {
            'mode': program,
            'value': value,
            'remainingduration': duration
        }
        if (currentPumpStatus[index].currentrunning !== newCurrentRunning) {
            if (container.settings.logPumpMessages) {
                container.logger.info('Pump %s program changing from: \r\n    Mode: %s     Value: %s    remainingduration: %s \r\n    to \r\n    Mode: %s     Value: %s    remainingduration: %s', index, currentPumpStatus[index].currentrunning.mode, currentPumpStatus[index].currentrunning.value,
                    currentPumpStatus[index].currentrunning.remainingduration,
                    program, value, duration)
            }
            currentPumpStatus[index].currentrunning = JSON.parse(JSON.stringify(newCurrentRunning))
        }
    }


    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: pump.js')

    return {
        numberOfPumps: numberOfPumps,
        setPumpStatus: setPumpStatus,
        getCurrentPumpStatus: getCurrentPumpStatus,
        provideStatus: provideStatus,
        getCurrentProgram: getCurrentProgram,
        setCurrentProgramFromController: setCurrentProgramFromController,
        setCurrentProgram: setCurrentProgram,
        saveProgramAs: saveProgramAs,
        pumpACK: pumpACK,
        setRemoteControl: setRemoteControl,
        setRunMode: setRunMode,
        setPower: setPower,
        getPower: getPower,
        setPowerFromController: setPowerFromController,
        setDuration: setDuration,
        updatePumpDuration: updatePumpDuration,
        getDuration: getDuration,
        saveProgram: saveProgram,
        setCurrentRPM: setCurrentRPM,
        setCurrentRunning: setCurrentRunning,
        getCurrentRunningMode: getCurrentRunningMode,
        getCurrentRunningValue: getCurrentRunningValue,
        getCurrentRemainingDuration: getCurrentRemainingDuration,
        updateCurrentRunningPumpDuration: updateCurrentRunningPumpDuration,
        init: init


    }
}
