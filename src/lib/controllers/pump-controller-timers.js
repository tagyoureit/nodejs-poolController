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
    var pump1Timer = container.nanoTimer;
    var pump1TimerDelay = container.nanoTimer;
    var pump2Timer = container.nanoTimer;
    var pump2TimerDelay = container.nanoTimer;
    var pumpInitialRequestConfigDelay = container.nanoTimer;
    var pumpStatusTimer = container.nanoTimer;
    var logger = container.logger;

    function startPumpController() {
        //console.log('container # of pumps: ', container.settings.numberOfPumps)
        //console.log('stub of setInterval: ',  pumpStatusTimer.setInterval(pumpStatusCheck, '', '999s'))
        if (container.settings.numberOfPumps == 1) {
            if (container.settings.logPumpTimers) logger.silly('pumpStatusTimer.setInterval(pumpStatusCheck, [1], \'30s\');')
            pumpStatusTimer.setInterval(pumpStatusCheck, [1], '30s');
            if (container.settings.logPumpTimers) logger.silly('pumpInitialRequestConfigDelay.setTimeout(pumpStatusCheck, [1], \'3500m\');')
            pumpInitialRequestConfigDelay.setTimeout(pumpStatusCheck, [1], '3500m'); //must give a short delay to allow the port to open
            return true
        } else if (container.settings.numberOfPumps === 2) {
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
         container.pumpController.setPumpToRemoteControl(96)
        container.pumpController.requestPumpStatus(96)

        if (pump2 === 2) {
            //request pump status
            /*var statusPacket = [165, 0, 97, container.settings.appAddress, 7, 0];
            logger.verbose('Sending Request Pump 2 Status: %s', statusPacket)
            container.queuePacket.queuePacket([165, 0, 97, container.settings.appAddress, 4, 1, 255]);
            container.queuePacket.queuePacket(statusPacket);
            //queuePacket([165, 0, 97, 16, 4, 1, 0]);
            */
             container.pumpController.setPumpToRemoteControl(97)
            container.pumpController.requestPumpStatus(97)
        }
    }


    function pump1SafePumpMode() {
        if (container.settings.logPumpTimers) logger.debug('pump1SafePumpMode: Running pump 1 on setTimer expiration')
        container.pump.updatePumpDuration(1, -0.5)
        if (container.pump.getDuration(1) > 0) {

            //Initially this was resending the 'timer' packet, but that was found to be ineffective.
            //Instead, sending the Program packet again resets the timer.
            //var setProgramPacket = [165, 0, 96, s.appAddress, 1, 4, 3, 33, 0, container.pump.getCurrentProgram(1) * 8];
            logger.verbose('App -> Pump 1: Sending Run Program %s. %s minutes left.', container.pump.getCurrentProgram(1), container.pump.getDuration(1));
            //container.queuePacket.queuePacket(setProgramPacket);
            container.pumpControllerMiddleware.pumpCommandRunProgram(1, container.pump.getCurrentProgram(1))

            if (container.settings.logPumpTimers) logger.verbose('pumpStatusCheck: Setting 10s delay to run pump1SafePumpModeDelay')
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
        if (container.settings.logPumpTimers) logger.debug('pump2SafePumpMode: Running pump 2 on setTimer expiration')
        container.pump.updatePumpDuration(2, -0.5)
        if (container.pump.getDuration(2) > 0) {
            //Initially this was resending the 'timer' packet, but that was found to be ineffective.
            //Instead, sending the Program packet again resets the timer.
            //var setProgramPacket = [165, 0, 97, 34, 1, 4, 3, 33, 0, container.pump.getCurrentProgram(2) * 8];
            logger.info('App -> Pump 2: Sending Run Program %s.  %s minutes left.', container.pump.getCurrentProgram(2), container.pump.getDuration(2));
            //container.queuePacket.queuePacket(setProgramPacket);
            container.pumpControllerMiddleware.pumpCommandRunProgram(2, container.pump.getCurrentProgram(2))

            //pad the timer with 10 seconds so we have a full minute per cycle
            pump2TimerDelay.setTimeout(pump2SafePumpModeDelay, '', '10s')
        } else {
            logger.info('Pump 2 Program Finished.  Pump will shut down in ~10 seconds.')
            //Timer = 0, we are done.  Pump should turn off automatically
            pump2Timer.clearTimeout();
            //set program to 0
            container.pump.setPower(2, 0)
            container.io.emitToClients('pump')
        }
    }

    function pump1SafePumpModeDelay() {
        if (container.settings.logPumpTimers) logger.debug('pumpStatusCheck: Setting 20s delay to run pump1SafePumpMode')
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

    if (container.logModuleLoading)
        container.logger.info('Loaded: pump-controller-timers.js')

    return {
        startPumpController: startPumpController,
        startTimer: startTimer,
        clearTimer: clearTimer
    }

}
