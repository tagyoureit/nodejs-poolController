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
        container.logger.info('Loading: pump-controller-timers.js')

    //var NanoTimer = require('nanotimer')
    // var pump1Timer = new container.nanotimer
    // var pump2Timer = new container.nanotimer
    // var pumpInitialRequestConfigDelay = new container.nanotimer
    // var pumpStatusTimer = new container.nanotimer

    var pump1Timer
    var pump1TimerRunning = 0;

    var pump2Timer
    var pump2TimerRunning = 0;

    var pumpInitialRequestConfigDelay
    var pumpStatusTimer
    var logger = container.logger;




    /* ----- INTERNAL TIMERS -----*/
    var pumpStatusCheck = function(_numPumps) {
        if (_numPumps === 1) {
            container.pumpControllerMiddleware.requestStatusSequence(1)

        } else if (_numPumps === 2) {
            container.pumpControllerMiddleware.requestStatusSequence(1)
            container.pumpControllerMiddleware.requestStatusSequence(2)
        }
    }

    //if we are on pump only mode, this will _always_ run a status check at 30s intervals
    var startPumpController = function() {
        if (container.settings.numberOfPumps === 1 || container.settings.numberOfPumps === 2) {
            if (container.settings.logPumpTimers) logger.silly('setInterval(pumpStatusCheck, 30 * 1000, numPumps)')

            pumpStatusTimer = setInterval(pumpStatusCheck, 30 * 1000, container.settings.numberOfPumps);
            if (container.settings.logPumpTimers) logger.silly('setTimeout(pumpStatusCheck, 4 * 1000, numPumps);')
            //must give a short delay to allow the port to open
            //this 4 second pause is necessary to let the SP and Server open/start
            pumpInitialRequestConfigDelay = setTimeout(pumpStatusCheck, 4 * 1000, container.settings.numberOfPumps);
            return true
        }
        return false
    }

    //clear the internal timer for pump control
    var clearTimer = function(index) {
        container.pump.setCurrentRunning(index, 'off', 0, -1)
        container.pumpControllerMiddleware.runPowerSequence(index, 0)
        if (index === 1 && pump1TimerRunning) {
            clearTimeout(pump1Timer);
            pump1TimerRunning = 0
        } else if (index === 2 && pump2TimerRunning) {
            clearTimeout(pump2Timer);
            pump2TimerRunning = 0
        }

    }

    var pump1ProgramTimerMode = function() {
        var index = 1
        var callback = 'pump' + index.toString() + 'ProgramTimerMode'

        //console.log('TIMER1:', index, callback, container.pump.getCurrentRemainingDuration(index))
        if (container.pump.getCurrentRemainingDuration(index) > 0) {
            //program has remaining duration

            if (container.settings.logPumpTimers)
                logger.debug('%s: Running pump %s on with remaining duration %s', callback, index, container.pump.getCurrentRemainingDuration(index))
            if (container.settings.logPumpMessages)
                logger.verbose('App -> Pump %s: Sending Run @ %s Program. %s minutes left.', container.pump.getCurrentRunningValue(index), container.pump.getCurrentRemainingDuration(index));
            container.pump.updateCurrentRunningPumpDuration(index, -0.5)

            //this function was called via timer and there is still time left on the timer
            container.pumpControllerMiddleware.runProgramSequence(index, container.pump.getCurrentRunningValue(1))

            if (container.settings.logPumpTimers) logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            // pump1Timer.setTimeout(pump1SafePumpModeDelay, '', '10s')
            pump1Timer = setTimeout(pump1ProgramTimerMode, 30 * 1000)

        } else
        if (container.pump.getCurrentRemainingDuration(index) === 0)

        {
            //program duration has finished
            if (container.settings.logPumpMessages)
                logger.info('Pump %s Program Timer Finished.   Pump will shut down.', index)
            //Timer = 0, we are done.  Pump should turn off automatically
            clearTimer(1)
        } else if (container.pump.getCurrentRemainingDuration(index) === -1) {
            //run until stopped
            if (container.settings.logPumpTimers)
                logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            // pump1Timer.setTimeout(pump1SafePumpModeDelay, '', '10s')
            container.pumpControllerMiddleware.runProgramSequence(index, container.pump.getCurrentRunningValue(1))
            pump1Timer = setTimeout(pump1ProgramTimerMode, 30 * 1000)
        }
        container.io.emitToClients('pump')
        return
    }

    var pump2ProgramTimerMode = function() {
        var index = 2
        var pumpXTimer = 'pump' + index.toString() + 'Timer'
        var callback = 'pump' + index.toString() + 'ProgramTimerMode'
        if (container.pump.getCurrentRemainingDuration(index) > 0) {
            //program has remaining duration

            if (container.settings.logPumpTimers)
                logger.debug('%s: Running pump %s on with remaining duration %s', callback, index, container.pump.getCurrentRemainingDuration(index))
            if (container.settings.logPumpMessages)
                logger.verbose('App -> Pump %s: Sending Run @ %s Program. %s minutes left.', container.pump.getCurrentRunningValue(index), container.pump.getCurrentRemainingDuration(index));
            container.pump.updateCurrentRunningPumpDuration(index, -0.5)

            //this function was called via timer and there is still time left on the timer
            container.pumpControllerMiddleware.runProgramSequence(index, container.pump.getCurrentRunningValue(2))

            if (container.settings.logPumpTimers) logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            // pump1Timer.setTimeout(pump1SafePumpModeDelay, '', '10s')
            pump2Timer = setTimeout(pump2ProgramTimerMode, 30 * 1000)

        } else
        if (container.pump.getCurrentRemainingDuration(index) === 0)

        {
            //program duration has finished
            if (container.settings.logPumpMessages)
                logger.info('Pump %s Program Timer Finished.   Pump will shut down.', index)
            //Timer = 0, we are done.  Pump should turn off automatically
            clearTimer(1)
        } else if (container.pump.getCurrentRemainingDuration(index) === -1) {
            //run until stopped
            if (container.settings.logPumpTimers)
                logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
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

            if (container.settings.logPumpTimers)
                logger.debug('%s: Running pump %s on with remaining duration %s', callback, index, container.pump.getCurrentRemainingDuration(index))
            if (container.settings.logPumpMessages)
                logger.verbose('App -> Pump %s: Sending Run @ %s RPM. %s minutes left.', container.pump.getCurrentRunningValue(index), container.pump.getCurrentRemainingDuration(index));
            container.pump.updateCurrentRunningPumpDuration(index, -0.5)

            //this function was called via timer and there is still time left on the timer
            container.pumpControllerMiddleware.runRPMSequence(index, container.pump.getCurrentRunningValue(1))

            if (container.settings.logPumpTimers) logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            pump1Timer = setTimeout(pump1RPMTimerMode, 30 * 1000)

        } else
        if (container.pump.getCurrentRemainingDuration(index) === 0)

        {
            //rpm duration has finished
            if (container.settings.logPumpMessages)
                logger.info('Pump %s RPM Timer Finished.   Pump will shut down.', index)
            //Timer = 0, we are done.  Pump should turn off automatically
            clearTimer(1)
        } else if (container.pump.getCurrentRemainingDuration(index) === -1) {
            //run until stopped
            if (container.settings.logPumpTimers)
                logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
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

            if (container.settings.logPumpTimers)
                logger.debug('%s: Running pump %s on with remaining duration %s', callback, index, container.pump.getCurrentRemainingDuration(index))
            if (container.settings.logPumpMessages)
                logger.verbose('App -> Pump %s: Sending Run @ %s RPM. %s minutes left.', container.pump.getCurrentRunningValue(index), container.pump.getCurrentRemainingDuration(index));
            container.pump.updateCurrentRunningPumpDuration(index, -0.5)

            //this function was called via timer and there is still time left on the timer
            container.pumpControllerMiddleware.runRPMSequence(index, container.pump.getCurrentRunningValue(2))

            if (container.settings.logPumpTimers) logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            pump2Timer = setTimeout(pump2RPMTimerMode, 30 * 1000)

        } else
        if (container.pump.getCurrentRemainingDuration(index) === 0)

        {
            //rpm duration has finished
            if (container.settings.logPumpMessages)
                logger.info('Pump %s RPM Timer Finished.   Pump will shut down.', index)
            clearTimer(1)
        } else if (container.pump.getCurrentRemainingDuration(index) === -1) {
            //run until stopped
            if (container.settings.logPumpTimers)
                logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            container.pumpControllerMiddleware.runRPMSequence(index, container.pump.getCurrentRunningValue(2))
            pump2Timer = setTimeout(pump2RPMTimerMode, 30 * 1000)
        }
        container.io.emitToClients('pump')
    }


    var pump1PowerTimerMode = function() {
        var index = 1
        var callback = 'pump' + index.toString() + 'PowerTimerMode'
        if (container.pump.getCurrentRemainingDuration(index) > 0) {
            //power has remaining duration

            if (container.settings.logPumpTimers)
                logger.debug('%s: Running pump %s on with remaining duration %s', callback, index, container.pump.getCurrentRemainingDuration(index))
            if (container.settings.logPumpMessages)
                logger.verbose('App -> Pump %s: Sending Run Power On. %s minutes left.', container.pump.getCurrentRemainingDuration(index));
            container.pump.updateCurrentRunningPumpDuration(index, -0.5)

            //this function was called via timer and there is still time left on the timer
            container.pumpController.runPowerSequence(index, container.pump.getCurrentRunningValue(1))

            if (container.settings.logPumpTimers) logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            pump1Timer = setTimeout(pump1PowerTimerMode, 30 * 1000)

        } else
        if (container.pump.getCurrentRemainingDuration(index) === 0)

        {
            //power duration has finished
            if (container.settings.logPumpMessages)
                logger.info('Pump %s Power Timer Finished.   Pump will shut down.', index)
            //Timer = 0, we are done.  Pump should turn off automatically
            clearTimer(1)
        } else if (container.pump.getCurrentRemainingDuration(index) === -1) {
            //run until stopped
            if (container.settings.logPumpTimers)
                logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            container.pumpControllerMiddleware.runPowerSequence(index, container.pump.getCurrentRunningValue(1))
            pump1Timer = setTimeout(pump1PowerTimerMode, 30 * 1000)
        }
        container.io.emitToClients('pump')
    }

    var pump2PowerTimerMode = function() {
        var index = 2
        var callback = 'pump' + index.toString() + 'PowerTimerMode'
        if (container.pump.getCurrentRemainingDuration(index) > 0) {
            //program has remaining duration

            if (container.settings.logPumpTimers)
                logger.debug('%s: Running pump %s on with remaining duration %s', callback, index, container.pump.getCurrentRemainingDuration(index))
            if (container.settings.logPumpMessages)
                logger.verbose('App -> Pump %s: Sending Run Power On. %s minutes left.', container.pump.getCurrentRemainingDuration(index));
            container.pump.updateCurrentRunningPumpDuration(index, -0.5)

            //this function was called via timer and there is still time left on the timer
            container.pumpController.runPowerSequence(index, container.pump.getCurrentRunningValue(2))

            if (container.settings.logPumpTimers) logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            pump2Timer = setTimeout(pump2PowerTimerMode, 30 * 1000)

        } else
        if (container.pump.getCurrentRemainingDuration(index) === 0)

        {
            //program duration has finished
            if (container.settings.logPumpMessages)
                logger.info('Pump %s Power Timer Finished.   Pump will shut down.', index)
            clearTimer(1)
        } else if (container.pump.getCurrentRemainingDuration(index) === -1) {
            //run until stopped
            if (container.settings.logPumpTimers)
                logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            container.pumpControllerMiddleware.runPowerSequence(index, container.pump.getCurrentRunningValue(2))
            pump2Timer = setTimeout(pump2PowerTimerMode, 30 * 1000)
        }
        container.io.emitToClients('pump')
    }

    //set the internal timer for pump controls
    var startProgramTimer = function(index, program, duration) {
      if (duration > 0) {
          duration = duration + 0.5 //timer will decrement at first run.  add this so the full time is used.
      } else if (duration === null || duration === undefined) {
          duration = -1
      }
        container.pump.setCurrentRunning(index, 'program', program, duration)

        if (index === 1) {
            // pump1Timer.setTimeout(pump1SafePumpMode, '', '30s')
            //pump1Timer = setTimeout(pump1SafePumpMode, 30 * 1000)

            pump1ProgramTimerMode(duration)
            pump1TimerRunning = 1
        } else if (index === 2) {
            // pump2Timer.setTimeout(pump2SafePumpMode, '', '30s')
            //pump2Timer = setTimeout(pump2SafePumpMode, 30 * 1000)

            pump2ProgramTimerMode(duration)
            pump2TimerRunning = 1
        } else {
            logger.warn('Request to start pump program timer %s, but config.json numberOfPumps = %s', index, container.settings.numberOfPumps)
        }
    }

    //set the internal timer for pump controls
    var startRPMTimer = function(index, rpm, duration) {
      if (duration > 0) {
          duration = duration + 0.5 //timer will decrement at first run.  add this so the full time is used.
      } else if (duration === null || duration === undefined) {
          duration = -1
      }
        container.pump.setCurrentRunning(index, 'rpm', rpm, duration)

        if (index === 1) {
            // pump1Timer.setTimeout(pump1SafePumpMode, '', '30s')
            //pump1Timer = setTimeout(pump1SafePumpMode, 30 * 1000)

            pump1RPMTimerMode(duration)
            pump1TimerRunning = 1
        } else if (index === 2) {
            // pump2Timer.setTimeout(pump2SafePumpMode, '', '30s')
            //pump2Timer = setTimeout(pump2SafePumpMode, 30 * 1000)

            pump2RPMTimerMode(duration)
            pump2TimerRunning = 1
        } else {
            logger.warn('Request to start pump RPM timer %s, but config.json numberOfPumps = %s', index, container.settings.numberOfPumps)
        }
    }

    //set the internal timer for pump controls
    var startPowerTimer = function(index, duration) {
        if (duration > 0) {
            duration = duration + 0.5 //timer will decrement at first run.  add this so the full time is used.
        } else if (duration === null || duration === undefined) {
            duration = -1
        }
        container.pump.setCurrentRunning(index, 'power', 1, duration)
        if (index === 1) {
            pump1PowerTimerMode(duration)
            pump1TimerRunning = 1
        } else if (index === 2) {
            pump2PowerTimerMode(duration)
            pump2TimerRunning = 1
        } else {
            logger.warn('Request to start pump power timer %s, but config.json numberOfPumps = %s', index, container.settings.numberOfPumps)
        }
    }


    var isPumpTimerRunning = function(index) {
        if (index === 1) {
            return pump1TimerRunning
        } else if (index === 2) {
            return pump2TimerRunning
        }
    }

    if (container.logModuleLoading)
        container.logger.info('Loaded: pump-controller-timers.js')

    return {
        startPowerTimer: startPowerTimer,
        startProgramTimer: startProgramTimer,
        startRPMTimer: startRPMTimer,
        clearTimer: clearTimer,
        isPumpTimerRunning: isPumpTimerRunning,
        startPumpController: startPumpController
    }

}
