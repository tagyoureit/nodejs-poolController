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
        container.logger.info('Loading: pump-controller-timers.js')

    var pump1Timer
    var pump1TimerRunning = 0;

    var pump2Timer
    var pump2TimerRunning = 0;

    var pumpStatusTimer,
        _runStatusCheck = 0,
        _startPumpController = 0

    /* ----- INTERNAL TIMERS -----*/

    var offCycleRemotePowerPump1 = function() {}


    var isPumpTimerRunning = function(index) {
        if (index === 1) {
            return pump1TimerRunning
        } else if (index === 2) {
            return pump2TimerRunning
        }
    }

    var pumpStatusCheck = function() {

        if (container.pump.numberOfPumps() >= 1 && isPumpTimerRunning(1) === 0) {
            container.pumpControllerMiddleware.requestStatusSequence(1)
            if (container.settings.get('logPumpTimers')) container.logger.silly('running pump 1 status check')
            _runStatusCheck = 1

        }
        if (container.pump.numberOfPumps() >= 2 && isPumpTimerRunning(2) === 0) {
            container.pumpControllerMiddleware.requestStatusSequence(2)
            if (container.settings.get('logPumpTimers')) container.logger.silly('running pump 2 status check')

            _runStatusCheck = 1
        }
        if (_runStatusCheck === 1) {
            //make sure that we don't run the same timer twice
            _runStatusCheck = 0
            pumpStatusTimer = setTimeout(pumpStatusCheck, 30 * 1000);
        }
    }

    //if we are on pump only mode, this will _always_ run a status check at 30s intervals
    var startPumpController = function() {
        if (container.settings.get('virtual').pumpController === 'never') {
            //never start if the value is never
            if (container.settings.get('logPumpTimers')) container.logger.warn('Not starting pump off timers because virtual.pumpController=never')
            container.pump.setVirtualControllerStatus('disabled')
            return false
        } else
        if (container.settings.get('virtual').pumpController === 'always' || !(container.settings.get('intellicom.installed') || container.settings.get('intellitouch.installed'))) {
            //start if the value is always, or (with default) the values of both intellicom and intellitouch are 0 (not [either/both not present])

            // if (container.settings.get('logPumpTimers')) container.logger.silly('setInterval(pumpStatusCheck, 30 * 1000, %s', container.pump.numberOfPumps())


            if (container.settings.get('logPumpTimers')) container.logger.info('Starting virtual pump off timers for %s pump(s).', container.pump.numberOfPumps())
            //must give a short delay to allow the port to open
            //this 4 second pause is necessary to let the SP and Server open/start
            container.pump.setVirtualControllerStatus('enabled')
            pumpStatusTimer = setTimeout(pumpStatusCheck,4*1000)
            if (_startPumpController === 1) {
                // make sure we only call the startPumpController once
                _startPumpController = 0
            }
            return true
        } else {
            if (container.settings.get('logPumpTimers')) container.logger.verbose('Not starting virtual pump off timer. (virtualPumpContoller: %s, Intellitouch: %s, Intellicom: %s).', container.settings.get('virtual').pumpController, container.settings.get('intellitouch.installed'), container.settings.get('intellicom.installed'))
            container.pump.setVirtualControllerStatus('disabled')
        }
    }

    var stopPumpController = function(){
        if (container.settings.get('logPumpTimers')) container.logger.verbose('Stopping virtual pump controller.')
        container.pump.setVirtualControllerStatus('disabled')
        clearTimer(pumpStatusCheck)
        if (pump1TimerRunning) clearTimer(1)
        if (pump2TimerRunning) clearTimer(2)
        _startPumpController = 1
    }

    //clear the internal timer for pump control
    var clearTimer = function(index) {


        if (index === 1 && pump1TimerRunning) {
            clearTimeout(pump1Timer);
            container.pump.setCurrentRunning(index, 'off', 0, -1)
            container.pumpControllerMiddleware.runProgramSequence(index, 0)
            container.pumpControllerMiddleware.runPowerSequence(index, 0)
            _startPumpController = 1
            pump1TimerRunning = 0
        } else if (index === 2 && pump2TimerRunning) {
            container.pump.setCurrentRunning(index, 'off', 0, -1)
            container.pumpControllerMiddleware.runProgramSequence(index, 0)
            container.pumpControllerMiddleware.runPowerSequence(index, 0)
            clearTimeout(pump2Timer);
            _startPumpController = 1
            pump2TimerRunning = 0
        }
        if (_startPumpController === 1) {
            // make sure we only call the startPumpController once
            _startPumpController = 0
            startPumpController()
        }

    }

    var pump1ProgramTimerMode = function() {
        var index = 1
        var callback = 'pump' + index.toString() + 'ProgramTimerMode'

        //console.log('TIMER1:', index, callback, container.pump.getCurrentRemainingDuration(index))
        if (container.pump.getCurrentRemainingDuration(index) > 0) {
            //program has remaining duration
            container.pump.updateCurrentRunningPumpDuration(index, -0.5)
            if (container.settings.get('logPumpMessages'))
                container.logger.verbose('App -> Pump %s: Sending Run Pump Program %s. %s minutes left. (%s)', index, container.pump.getCurrentRunningValue(index), container.pump.getCurrentRemainingDuration(index), callback);


            //this function was called via timer and there is still time left on the timer
            container.pumpControllerMiddleware.runProgramSequence(index, container.pump.getCurrentRunningValue(1))

            // if (container.settings.get('logPumpTimers')) container.logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            // pump1Timer.setTimeout(pump1SafePumpModeDelay, '', '10s')
            pump1Timer = setTimeout(pump1ProgramTimerMode, 30 * 1000)

        } else
        if (container.pump.getCurrentRemainingDuration(index) === 0)

        {
            //program duration has finished
            if (container.settings.get('logPumpMessages'))
                container.logger.info('Pump %s Program Timer Finished.   Pump will go to 30s off cycle for status.', index)
            //Timer = 0, we are done.  Pump should turn off automatically
            clearTimer(index)
        } else if (container.pump.getCurrentRemainingDuration(index) === -1) {
            //run until stopped
            // if (container.settings.get('logPumpTimers'))
            //     container.logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            if (container.settings.get('logPumpMessages'))
                container.logger.verbose('App -> Pump %s: Sending Run Pump Program %s. %s minutes left. (%s)', index, container.pump.getCurrentRunningValue(index), container.pump.getCurrentRemainingDuration(index), callback);
            // pump1Timer.setTimeout(pump1SafePumpModeDelay, '', '10s')
            container.pumpControllerMiddleware.runProgramSequence(index, container.pump.getCurrentRunningValue(1))
            pump1Timer = setTimeout(pump1ProgramTimerMode, 30 * 1000)
        }
        container.io.emitToClients('pump')
        return
    }

    var pump2ProgramTimerMode = function() {
        var index = 2
        var callback = 'pump' + index.toString() + 'ProgramTimerMode'
        if (container.pump.getCurrentRemainingDuration(index) > 0) {
            //program has remaining duration
            container.pump.updateCurrentRunningPumpDuration(index, -0.5)
            if (container.settings.get('logPumpMessages'))
                container.logger.verbose('App -> Pump %s: Sending Run Pump Program %s. %s minutes left. (%s)', index, container.pump.getCurrentRunningValue(index), container.pump.getCurrentRemainingDuration(index), callback);

            //this function was called via timer and there is still time left on the timer
            container.pumpControllerMiddleware.runProgramSequence(index, container.pump.getCurrentRunningValue(2))

            // if (container.settings.get('logPumpTimers')) container.logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            // pump1Timer.setTimeout(pump1SafePumpModeDelay, '', '10s')
            pump2Timer = setTimeout(pump2ProgramTimerMode, 30 * 1000)

        } else
        if (container.pump.getCurrentRemainingDuration(index) === 0)

        {
            //program duration has finished
            if (container.settings.get('logPumpMessages'))
                container.logger.info('Pump %s Program Timer Finished.   Pump will shut down.', index)
            //Timer = 0, we are done.  Pump should turn off automatically
            clearTimer(index)
        } else if (container.pump.getCurrentRemainingDuration(index) === -1) {
            //run until stopped
            // if (container.settings.get('logPumpTimers'))
            //     container.logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            if (container.settings.get('logPumpMessages'))
                container.logger.verbose('App -> Pump %s: Sending Run Pump Program %s. %s minutes left. (%s)', index, container.pump.getCurrentRunningValue(index), container.pump.getCurrentRemainingDuration(index), callback);
            // pump1Timer.setTimeout(pump1SafePumpModeDelay, '', '10s')
            container.pumpControllerMiddleware.runProgramSequence(index, container.pump.getCurrentRunningValue(2))
            pump2Timer = setTimeout(pump2ProgramTimerMode, 30 * 1000)
        }
        container.io.emitToClients('pump')
    }

    var pump1RPMTimerMode = function() {
        var index = 1
        var callback = 'pump' + index.toString() + 'RPMTimerMode'
        if (container.pump.getCurrentRemainingDuration(index) > 0) {
            //rpm timer has remaining duration
            container.pump.updateCurrentRunningPumpDuration(index, -0.5)
            if (container.settings.get('logPumpMessages'))
                container.logger.verbose('App -> Pump %s: Sending Run @ %s RPM. %s minutes left. (%s)', index, container.pump.getCurrentRunningValue(index), container.pump.getCurrentRemainingDuration(index), callback);


            //this function was called via timer and there is still time left on the timer
            container.pumpControllerMiddleware.runRPMSequence(index, container.pump.getCurrentRunningValue(1))

            // if (container.settings.get('logPumpTimers')) container.logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            pump1Timer = setTimeout(pump1RPMTimerMode, 30 * 1000)

        } else
        if (container.pump.getCurrentRemainingDuration(index) === 0)

        {
            //rpm duration has finished
            if (container.settings.get('logPumpMessages'))
                container.logger.info('Pump %s RPM Timer Finished.   Pump will shut down.', index)
            //Timer = 0, we are done.  Pump should turn off automatically
            clearTimer(index)
        } else if (container.pump.getCurrentRemainingDuration(index) === -1) {
            //run until stopped
            // if (container.settings.get('logPumpTimers'))
            //     container.logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            if (container.settings.get('logPumpMessages'))
                container.logger.verbose('App -> Pump %s: Sending Run @ %s RPM. %s minutes left. (%s)', index, container.pump.getCurrentRunningValue(index), container.pump.getCurrentRemainingDuration(index), callback);

            container.pumpControllerMiddleware.runRPMSequence(index, container.pump.getCurrentRunningValue(1))
            pump1Timer = setTimeout(pump1RPMTimerMode, 30 * 1000)
        }
        container.io.emitToClients('pump')
    }

    var pump2RPMTimerMode = function() {
        var index = 2
        var callback = 'pump' + index.toString() + 'RPMTimerMode'
        if (container.pump.getCurrentRemainingDuration(index) > 0) {
            //rpm has remaining duration
            container.pump.updateCurrentRunningPumpDuration(index, -0.5)
            if (container.settings.get('logPumpMessages'))
                container.logger.verbose('App -> Pump %s: Sending Run @ %s RPM. %s minutes left. (%s)', index, container.pump.getCurrentRunningValue(index), container.pump.getCurrentRemainingDuration(index), callback);


            //this function was called via timer and there is still time left on the timer
            container.pumpControllerMiddleware.runRPMSequence(index, container.pump.getCurrentRunningValue(2))

            // if (container.settings.get('logPumpTimers')) container.logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            pump2Timer = setTimeout(pump2RPMTimerMode, 30 * 1000)

        } else
        if (container.pump.getCurrentRemainingDuration(index) === 0)

        {
            //rpm duration has finished
            if (container.settings.get('logPumpMessages'))
                container.logger.info('Pump %s RPM Timer Finished.   Pump will shut down.', index)
            clearTimer(index)
        } else if (container.pump.getCurrentRemainingDuration(index) === -1) {
            //run until stopped
            // if (container.settings.get('logPumpTimers'))
            //     container.logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            if (container.settings.get('logPumpMessages'))
                container.logger.verbose('App -> Pump %s: Sending Run @ %s RPM. %s minutes left. (%s)', index, container.pump.getCurrentRunningValue(index), container.pump.getCurrentRemainingDuration(index), callback);

            container.pumpControllerMiddleware.runRPMSequence(index, container.pump.getCurrentRunningValue(2))
            pump2Timer = setTimeout(pump2RPMTimerMode, 30 * 1000)
        }
        container.io.emitToClients('pump')
    }

// GPM

    var pump1GPMTimerMode = function() {
        var index = 1
        var callback = 'pump' + index.toString() + 'GPMTimerMode'
        if (container.pump.getCurrentRemainingDuration(index) > 0) {
            //gpm timer has remaining duration
            container.pump.updateCurrentRunningPumpDuration(index, -0.5)
            if (container.settings.get('logPumpMessages'))
                container.logger.verbose('App -> Pump %s: Sending Run @ %s GPM. %s minutes left. (%s)', index, container.pump.getCurrentRunningValue(index), container.pump.getCurrentRemainingDuration(index), callback);


            //this function was called via timer and there is still time left on the timer
            container.pumpControllerMiddleware.runGPMSequence(index, container.pump.getCurrentRunningValue(1))

            // if (container.settings.get('logPumpTimers')) container.logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            pump1Timer = setTimeout(pump1GPMTimerMode, 30 * 1000)

        } else
        if (container.pump.getCurrentRemainingDuration(index) === 0)

        {
            //gpm duration has finished
            if (container.settings.get('logPumpMessages'))
                container.logger.info('Pump %s GPM Timer Finished.   Pump will shut down.', index)
            //Timer = 0, we are done.  Pump should turn off automatically
            clearTimer(index)
        } else if (container.pump.getCurrentRemainingDuration(index) === -1) {
            //run until stopped
            // if (container.settings.get('logPumpTimers'))
            //     container.logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            if (container.settings.get('logPumpMessages'))
                container.logger.verbose('App -> Pump %s: Sending Run @ %s GPM. %s minutes left. (%s)', index, container.pump.getCurrentRunningValue(index), container.pump.getCurrentRemainingDuration(index), callback);

            container.pumpControllerMiddleware.runGPMSequence(index, container.pump.getCurrentRunningValue(1))
            pump1Timer = setTimeout(pump1GPMTimerMode, 30 * 1000)
        }
        container.io.emitToClients('pump')
    }

    var pump2GPMTimerMode = function() {
        var index = 2
        var callback = 'pump' + index.toString() + 'GPMTimerMode'
        if (container.pump.getCurrentRemainingDuration(index) > 0) {
            //gpm has remaining duration
            container.pump.updateCurrentRunningPumpDuration(index, -0.5)
            if (container.settings.get('logPumpMessages'))
                container.logger.verbose('App -> Pump %s: Sending Run @ %s GPM. %s minutes left. (%s)', index, container.pump.getCurrentRunningValue(index), container.pump.getCurrentRemainingDuration(index), callback);


            //this function was called via timer and there is still time left on the timer
            container.pumpControllerMiddleware.runGPMSequence(index, container.pump.getCurrentRunningValue(2))

            // if (container.settings.get('logPumpTimers')) container.logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            pump2Timer = setTimeout(pump2GPMTimerMode, 30 * 1000)

        } else
        if (container.pump.getCurrentRemainingDuration(index) === 0)

        {
            //gpm duration has finished
            if (container.settings.get('logPumpMessages'))
                container.logger.info('Pump %s GPM Timer Finished.   Pump will shut down.', index)
            clearTimer(index)
        } else if (container.pump.getCurrentRemainingDuration(index) === -1) {
            //run until stopped
            // if (container.settings.get('logPumpTimers'))
            //     container.logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            if (container.settings.get('logPumpMessages'))
                container.logger.verbose('App -> Pump %s: Sending Run @ %s GPM. %s minutes left. (%s)', index, container.pump.getCurrentRunningValue(index), container.pump.getCurrentRemainingDuration(index), callback);

            container.pumpControllerMiddleware.runGPMSequence(index, container.pump.getCurrentRunningValue(2))
            pump2Timer = setTimeout(pump2GPMTimerMode, 30 * 1000)
        }
        container.io.emitToClients('pump')
    }

    //END GPM
    var pump1PowerTimerMode = function() {
        var index = 1
        var callback = 'pump' + index.toString() + 'PowerTimerMode'
        if (container.pump.getCurrentRemainingDuration(index) > 0) {
            //power has remaining duration
            container.pump.updateCurrentRunningPumpDuration(index, -0.5)
            if (container.settings.get('logPumpMessages'))
                container.logger.verbose('App -> Pump %s: Sending Run Power On. %s minutes left. (%s)', container.pump.getCurrentRemainingDuration(index), callback);


            //this function was called via timer and there is still time left on the timer
            container.pumpControllerMiddleware.runPowerSequence(index, container.pump.getCurrentRunningValue(index))

            // if (container.settings.get('logPumpTimers')) container.logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            pump1Timer = setTimeout(pump1PowerTimerMode, 30 * 1000)

        } else
        if (container.pump.getCurrentRemainingDuration(index) === 0)

        {
            //power duration has finished
            if (container.settings.get('logPumpMessages'))
                container.logger.info('Pump %s Power Timer Finished.   Pump will shut down.', index)
            //Timer = 0, we are done.  Pump should turn off automatically
            clearTimer(index)
        } else if (container.pump.getCurrentRemainingDuration(index) === -1) {
            //run until stopped
            // if (container.settings.get('logPumpTimers'))
            //     container.logger.verbose('%s: Setting 30s delay to run %s', callback, callback)

            if (container.settings.get('logPumpMessages'))
                container.logger.verbose('App -> Pump %s: Sending Run Power On. %s minutes left. (%s)', index, container.pump.getCurrentRemainingDuration(index), callback);
            container.pumpControllerMiddleware.runPowerSequence(index, container.pump.getCurrentRunningValue(index))
            pump1Timer = setTimeout(pump1PowerTimerMode, 30 * 1000)
        }
        container.io.emitToClients('pump')
    }

    var pump2PowerTimerMode = function() {
        var index = 2
        var callback = 'pump' + index.toString() + 'PowerTimerMode'
        if (container.pump.getCurrentRemainingDuration(index) > 0) {
            //program has remaining duration
            container.pump.updateCurrentRunningPumpDuration(index, -0.5)
            if (container.settings.get('logPumpMessages'))
                container.logger.verbose('App -> Pump %s: Sending Run Power On. %s minutes left. (%s)', index, container.pump.getCurrentRemainingDuration(index), callback);


            //this function was called via timer and there is still time left on the timer
            container.pumpControllerMiddleware.runPowerSequence(index, container.pump.getCurrentRunningValue(2))

            // if (container.settings.get('logPumpTimers')) container.logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            pump2Timer = setTimeout(pump2PowerTimerMode, 30 * 1000)

        } else
        if (container.pump.getCurrentRemainingDuration(index) === 0) {
            //program duration has finished
            if (container.settings.get('logPumpMessages'))
                container.logger.info('Pump %s Power Timer Finished.   Pump will shut down.', index)
            clearTimer(index)
        } else if (container.pump.getCurrentRemainingDuration(index) === -1) {
            //run until stopped
            // if (container.settings.get('logPumpTimers'))
            //     container.logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            if (container.settings.get('logPumpMessages'))
                container.logger.verbose('App -> Pump %s: Sending Run Power On. %s minutes left. (%s)', index, container.pump.getCurrentRemainingDuration(index), callback);
            container.pumpControllerMiddleware.runPowerSequence(index, container.pump.getCurrentRunningValue(2))

            pump2Timer = setTimeout(pump2PowerTimerMode, 30 * 1000)
        }
        container.io.emitToClients('pump')
    }



    //set the internal timer for pump controls
    var startProgramTimer = function(index, program, duration) {
        var padDuration = 0
        if (duration > 0) {
            padDuration = 0.5 //timer will decrement at first run.  add this so the full time is used.
        } else if (duration === null || duration === undefined) {
            duration = -1
        }

        if (index === 1) {
            if (isPumpTimerRunning(1)) clearTimer(1)
            container.pump.setCurrentRunning(index, 'program', program, duration)
            duration += padDuration
            pump1ProgramTimerMode()
            pump1TimerRunning = 1
        } else if (index === 2) {
            if (isPumpTimerRunning(2)) clearTimer(2)
            container.pump.setCurrentRunning(index, 'program', program, duration)
            duration += padDuration
            pump2ProgramTimerMode()
            pump2TimerRunning = 1
        } else {
            container.logger.warn('Request to start pump program timer %s, but config.json numberOfPumps = %s', index, container.pump.numberOfPumps())
        }
    }

    //set the internal timer for pump controls
    var startGPMTimer = function(index, gpm, duration) {
        var padDuration = 0
        if (duration > 0) {
            padDuration = 0.5 //timer will decrement at first run.  add this so the full time is used.
        } else if (duration === null || duration === undefined) {
            duration = -1
        }
        if (index === 1) {
            if (isPumpTimerRunning(1)) clearTimer(1)
            container.pump.setCurrentRunning(index, 'gpm', gpm, duration)
            duration += padDuration
            pump1GPMTimerMode()
            pump1TimerRunning = 1
        } else if (index === 2) {
            if (isPumpTimerRunning(2)) clearTimer(2)
            container.pump.setCurrentRunning(index, 'gpm', gpm, duration)
            duration += padDuration

            pump2GPMTimerMode()
            pump2TimerRunning = 1
        } else {
            container.logger.warn('Request to start pump GPM timer %s, but config.json numberOfPumps = %s', index, container.pump.numberOfPumps())
        }
    }

    //set the internal timer for pump controls
    var startRPMTimer = function(index, rpm, duration) {
        var padDuration = 0
        if (duration > 0) {
            padDuration = 0.5 //timer will decrement at first run.  add this so the full time is used.
        } else if (duration === null || duration === undefined) {
            duration = -1
        }
        if (index === 1) {
            if (isPumpTimerRunning(1)) clearTimer(1)
            container.pump.setCurrentRunning(index, 'rpm', rpm, duration)
            duration += padDuration
            pump1RPMTimerMode()
            pump1TimerRunning = 1
        } else if (index === 2) {
            if (isPumpTimerRunning(2)) clearTimer(2)
            container.pump.setCurrentRunning(index, 'rpm', rpm, duration)
            duration += padDuration

            pump2RPMTimerMode()
            pump2TimerRunning = 1
        } else {
            container.logger.warn('Request to start pump RPM timer %s, but config.json numberOfPumps = %s', index, container.pump.numberOfPumps())
        }
    }

    //set the internal timer for pump controls
    var startPowerTimer = function(index, duration) {
        if (duration > 0) {
            duration = duration + 0.5 //timer will decrement at first run.  add this so the full time is used.
        } else if (duration === null || duration === undefined) {
            duration = -1
        }

        if (index === 1) {
            if (isPumpTimerRunning(1)) clearTimer(1)
            container.pump.setCurrentRunning(index, 'power', 1, duration, 0)
            pump1PowerTimerMode()
            pump1TimerRunning = 1
        } else if (index === 2) {
            if (isPumpTimerRunning(2)) clearTimer(2)
            container.pump.setCurrentRunning(index, 'power', 1, duration, 0)
            pump2PowerTimerMode()
            pump2TimerRunning = 1
        } else {
            container.logger.warn('Request to start pump power timer %s, but config.json numberOfPumps = %s', index, container.pump.numberOfPumps())
        }
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: pump-controller-timers.js')

    return {
        startPowerTimer: startPowerTimer,
        startProgramTimer: startProgramTimer,
        startRPMTimer: startRPMTimer,
        startGPMTimer: startGPMTimer,
        clearTimer: clearTimer,
        isPumpTimerRunning: isPumpTimerRunning,
        startPumpController: startPumpController,
        stopPumpController: stopPumpController
    }

}
