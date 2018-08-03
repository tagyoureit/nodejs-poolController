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

module.exports = function (container) {

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: pump.js')

    function Pump(number, name, type, time, run, mode, drivestate, watts, rpm, gpm, ppc, err, timer, duration, currentrunning, externalProgram, remotecontrol, power) {
        this.pump = number; //1 or 2
        this.name = name;
        this.type = type;
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
        this.externalProgram = externalProgram
        // this.program1rpm = program1rpm;
        // this.program2rpm = program2rpm;
        // this.program3rpm = program3rpm;
        // this.program4rpm = program4rpm;
        this.remotecontrol = remotecontrol;
        this.power = power;
    }

    var pump1,
        pump2,
        pump3,
        pump4,
        pump5,
        pump6,
        pump7,
        pump8,
        pump9,
        pump10,
        pump11,
        pump12,
        pump13,
        pump14,
        pump15,
        pump16,
        currentPumpStatus,
        numPumps = -1


    var externalProgram = {
        "1": -1,
        "2": -1,
        "3": -1,
        "4": -1
    }
    var template = new Pump(1, 'namenotset', 'typenotset', 'timenotset', 'runnotset', 'modenotset', 'drivestatenotset', 'wattsnotset', 'rpmnotset', 'gpmnotset', 'ppcnotset', 'errnotset', 'timernotset', 'durationnotset', {
        'mode': 'off',
        'value': 0,
        'remainingduration': -1
    }, externalProgram, 'remotecontrolnotset', 'powernotset')

    var numberOfPumps = function () {

        return numPumps
    }

    var getPumpConfiguration = function () {
        //get pump Configution
        for (var i = 1; i <= container.pump.numberOfPumps(); i++) {
            if (currentPumpStatus[i].type === 'VS' || currentPumpStatus[i].type === 'VF' || currentPumpStatus[i].type === 'VSF')
                container.queuePacket.queuePacket([165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 219, 1, i]);
        }
    }

    var loadProgramsFromConfig = function () {
        var pumpConfig = container.settings.get('pump')
        for (var _pump in pumpConfig) {
            if (_pump <= numPumps) {
                currentPumpStatus[_pump].externalProgram = JSON.parse(JSON.stringify(pumpConfig[_pump].externalProgram))
                currentPumpStatus[_pump].type = JSON.parse(JSON.stringify(pumpConfig[_pump].type))
                if (pumpConfig[_pump].friendlyName !== "") {
                    currentPumpStatus[_pump].friendlyName = pumpConfig[_pump].friendlyName
                } else {
                    currentPumpStatus[_pump].friendlyName = currentPumpStatus[_pump].name
                }
            }
        }
    }

    var setVirtualControllerStatus = function (status) {
        for (var _pump in container.settings.get('pump')) {
            if (_pump <= numPumps) {
                currentPumpStatus[_pump].virtualController = status
            }
        }
    }

    function checkPumpsInConfig() {

        var pumpTemplate = {
            type: 'none',
            externalProgram: {
                1: -1,
                2: -1,
                3: -1,
                4: -1
            }
        }

        var configPumps = container.settings.get('equipment.pump')
        var expectedCountPumps = container.settings.get('equipment.controller.intellitouch.numberOfPumps')
        var existingCountPumps = container._.size(configPumps)
        if (existingCountPumps < expectedCountPumps) {
            for (var i = existingCountPumps + 1; i <= expectedCountPumps; i++) {
                configPumps[i] = JSON.parse(JSON.stringify(pumpTemplate))
            }
            container.settings.set('equipment.pump', configPumps)
        }
        container.logger.info('Just expanded %s to include additional Pumps for circuits.', container.settings.get('configurationFileLocation'))
    }

    var init = function () {
        currentPumpStatus = {}
        checkPumpsInConfig()
        var pumpConfig = container.settings.get('pump')

        for (var _pump in pumpConfig) {
            if (pumpConfig[_pump].type.toLowerCase() !== 'none') {
                numPumps = parseInt(_pump)
            }
        }

        // this is poor coding.  either use the object as a function or just declare it is an object.
        pump1 = JSON.parse(JSON.stringify(template))
        currentPumpStatus = {}
        currentPumpStatus[1] = pump1

        // assign the right objects to the currentPumpStatus object.
        for (var i = 1; i <= numPumps; i++) {
            currentPumpStatus[i] = JSON.parse(JSON.stringify(pump1));
            currentPumpStatus[i].pump = i;
            currentPumpStatus[i].name = container.constants.ctrlString[i + 95]
        }

        loadProgramsFromConfig()

        if (container.settings.get('logPumpMessages'))
            container.logger.silly('Pump settings reset')
    }

    var pumpType = function (index) {
        if (index <= numPumps + 95) {
            return currentPumpStatus[index].type
        } else {
            return "none"
        }
    }

    function setTime(pump, hour, min) {
        if (pump <= numPumps) {
            var timeStr = container.helpers.formatTime(hour, min)
            currentPumpStatus[pump].time = timeStr
            container.time.setPumpTime(pump, timeStr)
        }
    }


    var isPump = function (data) {

    }

    var packetToPump = function (data) {
        return (data[container.constants.packetFields.DEST] >= container.constants.ctrl.PUMP1 && data[container.constants.packetFields.DEST] <= container.constants.ctrl.PUMP16)
    }

    var packetFromPump = function (data) {
        return (data[container.constants.packetFields.FROM] >= container.constants.ctrl.PUMP1 && data[container.constants.packetFields.FROM] <= container.constants.ctrl.PUMP16)
    }

    var packetToOrFromPump = function (data) {
        return (packetToPump(data) || packetFromPump(data))
    }

    var significantWattsChange = function (pump, watts, counter) {
        if (pump <= numPumps) {
            if ((Math.abs((watts - currentPumpStatus[pump].watts) / watts)) > (5 / 100)) {
                if (container.settings.get('logPumpMessages')) container.logger.info('Msg# %s   Pump %s watts changed >5%: %s --> %s \n', counter, pump, currentPumpStatus[pump].watts, watts)
                return true
            }
            return false
        }
    }


    function getPumpNumber(data) {
        var pump;

        // convert code to support up to 16 pumps`
        // if (data[container.constants.packetFields.FROM] === 96 || data[container.constants.packetFields.DEST] === 96) {
        //           pump = 1
        //         } else {
        //           pump = 2
        //         }
        // }
        if (packetFromPump(data)) {
            pump = data[container.constants.packetFields.FROM] - 95
        } else if (packetToPump(data)) {
            pump = data[container.constants.packetFields.DEST] - 95
        }

        return pump
    }

    function pumpACK(data, from, counter) {
        if (container.settings.get('logPumpMessages'))
            container.logger.verbose('Msg# %s   %s responded with acknowledgement: %s', counter, container.constants.ctrlString[from], JSON.stringify(data));
    }

    function setCurrentProgramFromController(program, from, data, counter) {
        //setAmount = setAmount / 8
        var pump = getPumpNumber(data)
        if (pump <= numPumps) {
            if (currentPumpStatus[pump].currentprogram !== program) {
                currentPumpStatus[pump].currentprogram = program;
                if (container.settings.get('logPumpMessages'))
                    container.logger.verbose('Msg# %s   %s: Set Current Program to %s %s', counter, container.constants.ctrlString[from], program.toString(), JSON.stringify(data));
            }
            container.io.emitToClients('pump')
            container.influx.writePumpData(currentPumpStatus)


        }
    }


    function getCurrentProgram(pump) {
        if (pump <= numPumps) {
            return currentPumpStatus[pump].currentprogram
        } else {
            return -1
        }
    }


    function saveExternalProgramAs(program, value, from, data, counter) {

        var _pump = getPumpNumber(data)
        if (_pump <= numPumps) {
            if (currentPumpStatus[_pump].externalProgram[program] !== value) {
                container.settings.updateExternalPumpProgramAsync(_pump, program, value)
                currentPumpStatus[_pump].externalProgram[program] = value;
                if (container.settings.get('logPumpMessages'))
                    container.logger.verbose('Msg# %s   %s: Save Program %s as %s RPM %s', counter, container.constants.ctrlString[from], program, value, JSON.stringify(data));
            }
            container.io.emitToClients('pump')
            container.influx.writePumpData(currentPumpStatus)

        }
    }

    function setRemoteControl(remotecontrol, from, data, counter) {

        var remoteControlStr = remotecontrol === 0 ? 'enable' : 'disable'
        var pump = getPumpNumber(data)
        if (pump <= numPumps) {
            // code to support up to 16 pumps
            // if (data[container.constants.packetFields.DEST] === 96 || data[container.constants.packetFields.DEST] === 97) //Command to the pump
            if (packetToPump(data)) // command to the pump
            {
                if (container.settings.get('logPumpMessages'))
                    container.logger.verbose('Msg# %s   %s --> %s: Remote control - %s pump control panel: %s', counter, container.constants.ctrlString[from], container.constants.ctrlString[data[container.constants.packetFields.DEST]], remoteControlStr, JSON.stringify(data));
            } else {
                if (container.settings.get('logPumpMessages'))
                    container.logger.verbose('Msg# %s   %s: Remote control -  %s pump control panel: %s', counter, container.constants.ctrlString[from], remoteControlStr, JSON.stringify(data));
            }
            currentPumpStatus[pump].remotecontrol = remotecontrol
        }
    }

    function setRunMode(mode, from, data, counter) {


        var pump = getPumpNumber(data)
        if (pump <= numPumps) {
            // code to support up to 16 pumps
            // if (data[container.constants.packetFields.DEST] === 96 || data[container.constants.packetFields.DEST] === 97) //Command to the pump
            if (packetToPump(data)) // command to the pump
            {

                switch (mode) {
                    case 0: {
                        mode = "Filter";
                        break;
                    }
                    case 1: {
                        mode = "Manual";
                        break;
                    }
                    case 2: {
                        mode = "Speed 1";
                        break;
                    }
                    case 3: {
                        mode = "Speed 2";
                        break;
                    }
                    case 4: {
                        mode = "Speed 3";
                        break;
                    }
                    case 5: {
                        mode = "Speed 4";
                        break;
                    }
                    case 6: {
                        mode = "Feature 1";
                        break;
                    }
                    case 7: {
                        mode = "Unknown pump mode";
                        break;
                    }
                    case 8: {
                        mode = "Unknown pump mode";
                        break;
                    }
                    case 9: {
                        mode = "External Program 1";
                        break;
                    }
                    case 10: {
                        mode = "External Program 2";
                        break;
                    }
                    case 11: {
                        mode = "External Program 3";
                        break;
                    }
                    case 12: {
                        mode = "External Program 4";
                        break;
                    }
                    default: {
                        mode = "Oops, we missed something!"
                    }

                }
                if (currentPumpStatus[pump].mode !== mode) {
                    currentPumpStatus[pump].mode = mode;
                    if (container.settings.get('logPumpMessages'))
                        container.logger.verbose('Msg# %s   %s --> %s: Set pump mode to _%s_: %s', counter, container.constants.ctrlString[from], container.constants.ctrlString[data[container.constants.packetFields.DEST]], mode, JSON.stringify(data));
                }
                container.io.emitToClients('pump')
                container.influx.writePumpData(currentPumpStatus)


            } else {
                if (container.settings.get('logPumpMessages'))
                    container.logger.verbose('Msg# %s   %s confirming it is in mode %s: %s', counter, container.constants.ctrlString[data[container.constants.packetFields.FROM]], data[container.constants.packetFields.CMD], JSON.stringify(data));
            }
        }
    }

    function setPowerFromController(power, from, data, counter) {


        var pump = getPumpNumber(data)
        if (pump <= numPumps) {
            var powerStr = power === 1 ? 'on' : 'off'
            // code to support up to 16 pumps
            // if (data[container.constants.packetFields.DEST] === 96 || data[container.constants.packetFields.DEST] === 97) //Command to the pump
            if (packetToPump(data)) // command to the pump
            {
                if (container.settings.get('logPumpMessages'))
                    container.logger.verbose('Msg# %s   %s --> %s: Pump power to %s: %s', counter, container.constants.ctrlString[from], container.constants.ctrlString[data[container.constants.packetFields.DEST]], powerStr, JSON.stringify(data));
            } else {
                if (currentPumpStatus[pump].power !== power) {
                    currentPumpStatus[pump].power = power;
                    if (container.settings.get('logPumpMessages'))
                        container.logger.verbose('Msg# %s   %s: Pump power %s: %s', counter, container.constants.ctrlString[from], powerStr, JSON.stringify(data));
                    container.io.emitToClients('pump')
                    container.influx.writePumpData(currentPumpStatus)
                }
            }
        }
    }

    function provideStatus(data, counter) {
        if (container.settings.get('logPumpMessages'))
            container.logger.verbose('Msg# %s   %s --> %s: Provide status: %s', counter, container.constants.ctrlString[data[container.constants.packetFields.FROM]], container.constants.ctrlString[data[container.constants.packetFields.DEST]], JSON.stringify(data));
    }

    function setPumpStatus(pump, hour, min, run, mode, drivestate, watts, rpm, gpm, ppc, err, timer, data, counter) {
        if (pump <= numPumps) {

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

                if (container.settings.get('logPumpMessages'))
                    container.logger.verbose('\n Msg# %s  %s Status changed %s : ', counter, container.constants.ctrlString[pump + 95], whatsDifferent, data, '\n');

            }
            if (needToEmit) {
                container.io.emitToClients('pump');
            }
            container.influx.writePumpData(currentPumpStatus)

        }
    }

    var setPower = function (pump, power) {
        if (pump <= numPumps) {
            currentPumpStatus[pump].power = power
            if (power === 0) {
                currentPumpStatus[pump].duration = 0;
                currentPumpStatus[pump].currentprogram = 0;
            }
        }
    }


    var getPower = function (index) {
        if (index <= numPumps + 95) {
            return currentPumpStatus[index].power
        }
    }


    //sets the current running program to pump & program & (optional) rpm
    var setCurrentProgram = function (pump, program, rpm) {
        if (pump <= numPumps) {

            //console.log('pump: %s,  program %s, rpm %s', pump, program, rpm)
            if (rpm === undefined) {
                currentPumpStatus[pump].currentprogram = program;
            } else {
                // var str = 'program' + program + 'rpm';
                // currentPumpStatus[pump][str] = rpm;
                currentPumpStatus[pump].externalProgram[program] = rpm;
                container.settings.updatePump(pump, 'externalProgram', null, rpm)
                currentPumpStatus[pump].currentprogram = program;
            }
        }
    }

    //saves a program & rpm/gpm
    var saveProgram = function (pump, program, val) {
        if (pump <= numPumps) {

            // var str = 'program' + program + 'rpm';
            currentPumpStatus[pump].externalProgram[program] = val;
            container.settings.updateExternalPumpProgramAsync(pump, program, val)
        }
    }
    // var setCurrentRPM = function(index, rpm) {
    //     currentPumpStatus[index].currentrpm = rpm
    //
    // }

    var getCurrentPumpStatus = function () {
        return {'pump': currentPumpStatus}
    }

    var setDuration = function (index, _duration) {
        if (index <= numPumps + 95) {

            currentPumpStatus[index].duration = _duration;
        }
    }

    var getDuration = function (index) {
        if (index <= numPumps + 95) {
            return currentPumpStatus[index].duration;
        }
    }
    var getCurrentRemainingDuration = function (index) {
        if (index <= numPumps + 95) {
            return currentPumpStatus[index].currentrunning.remainingduration;
        }
    }

    var getCurrentRunningMode = function (pump) {
        if (pump <= numPumps) {
            return currentPumpStatus[pump].currentrunning.mode;
        }
    }

    var getCurrentRunningValue = function (pump) {
        if (pump <= numPumps) {
            return currentPumpStatus[pump].currentrunning.value;
        }
    }

    var getFriendlyName = function (pump) {
        if (pump <= numPumps) {
            return currentPumpStatus[pump].friendlyName;
        }
        else return currentPumpStatus[pump - 95].friendlyName
    }

    var updatePumpDuration = function (pump, _duration) {
        if (pump <= numPumps) {
            currentPumpStatus[pump].duration = (currentPumpStatus[pump].duration + _duration);
        }
    }

    var updateCurrentRunningPumpDuration = function (pump, _duration) {
        if (pump <= numPumps) {
            currentPumpStatus[pump].currentrunning.remainingduration += _duration
        }
    }

    var setCurrentRunning = function (index, program, value, duration) {
        if (index <= numPumps + 95) {
            //we have the option to broadcast because when we start the pump for x minutes, we set it for x.5 minutes.  We don't
            //need/want to broadcast this first message as it will be confusing.
            var newCurrentRunning = {
                'mode': program,
                'value': value,
                'remainingduration': duration
            }
            if (currentPumpStatus[index].currentrunning !== newCurrentRunning) {
                if (container.settings.get('logPumpMessages')) {
                    container.logger.info('Pump %s program changing from: \r\n    Mode: %s     Value: %s    remaining duration: %s \r\n    to \r\n    Mode: %s     Value: %s    remainingduration: %s', index, currentPumpStatus[index].currentrunning.mode, currentPumpStatus[index].currentrunning.value,
                        currentPumpStatus[index].currentrunning.remainingduration,
                        program, value, duration)
                }
                currentPumpStatus[index].currentrunning = JSON.parse(JSON.stringify(newCurrentRunning))
                container.io.emitToClients('pump')
            }
        }
    }


    var getPumpOverview = function () {
        // var tempObj = {}
        // currentPumpStatus.forEach(function(key){
        //     if (['VS','VF','VSF','SS','DS'].indexOf(currentPumpStatus[key].type)>=0){
        //       tempObj[key]=
        //     }
        // })
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: pump.js')

    return {
        numberOfPumps: numberOfPumps,
        pumpType: pumpType,
        setPumpStatus: setPumpStatus,
        getCurrentPumpStatus: getCurrentPumpStatus,
        provideStatus: provideStatus,
        getCurrentProgram: getCurrentProgram,
        setCurrentProgramFromController: setCurrentProgramFromController,
        setCurrentProgram: setCurrentProgram,
        saveExternalProgramAs: saveExternalProgramAs,
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
        // setCurrentRPM: setCurrentRPM,
        setCurrentRunning: setCurrentRunning,
        getCurrentRunningMode: getCurrentRunningMode,
        getCurrentRunningValue: getCurrentRunningValue,
        getCurrentRemainingDuration: getCurrentRemainingDuration,
        updateCurrentRunningPumpDuration: updateCurrentRunningPumpDuration,
        isPump: isPump,
        packetToPump: packetToPump,
        packetFromPump: packetFromPump,
        packetToOrFromPump: packetToOrFromPump,
        getPumpNumber: getPumpNumber,
        getPumpConfiguration: getPumpConfiguration,
        getFriendlyName: getFriendlyName,
        setVirtualControllerStatus: setVirtualControllerStatus,
        getPumpOverview: getPumpOverview,
        init: init
    }
}
