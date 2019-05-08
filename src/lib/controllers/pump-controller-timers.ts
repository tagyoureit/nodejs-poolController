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
import { settings, logger, pump, pumpControllerMiddleware, io } from'../../etc/internal';



    /*istanbul ignore next */
    // if (logModuleLoading)
    //     logger.info('Loading: pump-controller-timers.js')

    var pump1Timer: NodeJS.Timeout
    var pump1TimerRunning = 0;

    var pump2Timer: NodeJS.Timeout
    var pump2TimerRunning = 0;

    var pumpStatusTimer: any,
        _runStatusCheck = 0,
        _startPumpController = 0

    /* ----- INTERNAL TIMERS -----*/
export namespace pumpControllerTimers
{
    export function offCycleRemotePowerPump1 () { }


    export function isPumpTimerRunning ( index: number )
    {
        if ( index === 1 )
        {
            return pump1TimerRunning
        } else if ( index === 2 )
        {
            return pump2TimerRunning
        }
    }

    export function pumpStatusCheck ()
    {

        if ( pump.numberOfPumps() >= 1 && isPumpTimerRunning( 1 ) === 0 )
        {
            pumpControllerMiddleware.requestStatusSequence( 1 )
            if ( settings.get( 'logPumpTimers' ) ) logger.silly( 'running pump 1 status check' )
            _runStatusCheck = 1

        }
        if ( pump.numberOfPumps() >= 2 && isPumpTimerRunning( 2 ) === 0 )
        {
            pumpControllerMiddleware.requestStatusSequence( 2 )
            if ( settings.get( 'logPumpTimers' ) ) logger.silly( 'running pump 2 status check' )

            _runStatusCheck = 1
        }
        if ( _runStatusCheck === 1 )
        {
            //make sure that we don't run the same timer twice
            _runStatusCheck = 0
            pumpStatusTimer = setTimeout( pumpStatusCheck, 30 * 1000 );
        }
    }

    //if we are on pump only mode, this will _always_ run a status check at 30s intervals
    export function startPumpController ()
    {
        if ( settings.get( 'virtual' ).pumpController === 'never' )
        {
            //never start if the value is never
            if ( settings.get( 'logPumpTimers' ) ) logger.warn( 'Not starting pump off timers because virtual.pumpController=never' )
            pump.setVirtualControllerStatus( 'disabled' )
            return false
        } else
            if ( settings.get( 'virtual' ).pumpController === 'always' || !( settings.get( 'intellicom.installed' ) || settings.get( 'intellitouch.installed' ) ) )
            {
                //start if the value is always, or (with default) the values of both intellicom and intellitouch are 0 (not [either/both not present])

                // if (settings.get('logPumpTimers')) logger.silly('setInterval(pumpStatusCheck, 30 * 1000, %s', pump.numberOfPumps())


                if ( settings.get( 'logPumpTimers' ) ) logger.info( 'Starting virtual pump off timers for %s pump(s).', pump.numberOfPumps() )
                //must give a short delay to allow the port to open
                //this 4 second pause is necessary to let the SP and Server open/start
                pump.setVirtualControllerStatus( 'enabled' )
                pumpStatusTimer = setTimeout( pumpStatusCheck, 4 * 1000 )
                if ( _startPumpController === 1 )
                {
                    // make sure we only call the startPumpController once
                    _startPumpController = 0
                }
                return true
            } else
            {
                if ( settings.get( 'logPumpTimers' ) ) logger.verbose( 'Not starting virtual pump off timer. (virtualPumpContoller: %s, Intellitouch: %s, Intellicom: %s).', settings.get( 'virtual' ).pumpController, settings.get( 'intellitouch.installed' ), settings.get( 'intellicom.installed' ) )
                pump.setVirtualControllerStatus( 'disabled' )
            }
    }

    export function stopPumpController ()
    {
        if ( settings.get( 'logPumpTimers' ) ) logger.verbose( 'Stopping virtual pump controller.' )
        pump.setVirtualControllerStatus( 'disabled' )
        //clearTimer( pumpStatusCheck )
        clearTimeout( pumpStatusTimer )
        if ( pump1TimerRunning ) clearTimer( 1 )
        if ( pump2TimerRunning ) clearTimer( 2 )
        _startPumpController = 1
    }

    //clear the internal timer for pump control
    export function clearTimer ( index: number )
    {


        if ( index === 1 && pump1TimerRunning )
        {
            clearTimeout( pump1Timer );
            pump.setCurrentRunning( index, 'off', 0, -1 )
            pumpControllerMiddleware.runProgramSequence( index, 0 )
            pumpControllerMiddleware.runPowerSequence( index, 0 )
            _startPumpController = 1
            pump1TimerRunning = 0
        } else if ( index === 2 && pump2TimerRunning )
        {
            pump.setCurrentRunning( index, 'off', 0, -1 )
            pumpControllerMiddleware.runProgramSequence( index, 0 )
            pumpControllerMiddleware.runPowerSequence( index, 0 )
            clearTimeout( pump2Timer );
            _startPumpController = 1
            pump2TimerRunning = 0
        }
        if ( _startPumpController === 1 )
        {
            // make sure we only call the startPumpController once
            _startPumpController = 0
            startPumpController()
        }

    }

    export function pump1ProgramTimerMode ()
    {
        var index:Pump.PumpIndex = 1
        var callback = 'pump' + index.toString() + 'ProgramTimerMode'

        //console.log('TIMER1:', index, callback, pump.getCurrentRemainingDuration(index))
        if ( pump.getCurrentRemainingDuration( index ) > 0 )
        {
            //program has remaining duration
            pump.updateCurrentRunningPumpDuration( index, -0.5 )
            if ( settings.get( 'logPumpMessages' ) )
                logger.verbose( 'App -> Pump %s: Sending Run Pump Program %s. %s minutes left. (%s)', index, pump.getCurrentRunningValue( index ), pump.getCurrentRemainingDuration( index ), callback );


            //this function was called via timer and there is still time left on the timer
            pumpControllerMiddleware.runProgramSequence( index, pump.getCurrentRunningValue( 1 ) )

            // if (settings.get('logPumpTimers')) logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            // pump1Timer.setTimeout(pump1SafePumpModeDelay, '', '10s')
            pump1Timer = setTimeout( pump1ProgramTimerMode, 30 * 1000 )

        } else
            if ( pump.getCurrentRemainingDuration( index ) === 0 )
    {
                //program duration has finished
                if ( settings.get( 'logPumpMessages' ) )
                    logger.info( 'Pump %s Program Timer Finished.   Pump will go to 30s off cycle for status.', index )
                //Timer = 0, we are done.  Pump should turn off automatically
                clearTimer( index )
            } else if ( pump.getCurrentRemainingDuration( index ) === -1 )
            {
                //run until stopped
                // if (settings.get('logPumpTimers'))
                //     logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
                if ( settings.get( 'logPumpMessages' ) )
                    logger.verbose( 'App -> Pump %s: Sending Run Pump Program %s. %s minutes left. (%s)', index, pump.getCurrentRunningValue( index ), pump.getCurrentRemainingDuration( index ), callback );
                // pump1Timer.setTimeout(pump1SafePumpModeDelay, '', '10s')
                pumpControllerMiddleware.runProgramSequence( index, pump.getCurrentRunningValue( 1 ) )
                pump1Timer = setTimeout( pump1ProgramTimerMode, 30 * 1000 )
            }
            emit()
        return
    }

    function emit ()
    {
        io.emitToClients( 'pump', { pump: pump.getCurrentPumpStatus() } )
    }

    export function pump2ProgramTimerMode ()
    {
        let index:Pump.PumpIndex = 2
        let callback = 'pump' + index.toString() + 'ProgramTimerMode'
        if ( pump.getCurrentRemainingDuration( index ) > 0 )
        {
            //program has remaining duration
            pump.updateCurrentRunningPumpDuration( index, -0.5 )
            if ( settings.get( 'logPumpMessages' ) )
                logger.verbose( 'App -> Pump %s: Sending Run Pump Program %s. %s minutes left. (%s)', index, pump.getCurrentRunningValue( index ), pump.getCurrentRemainingDuration( index ), callback );

            //this function was called via timer and there is still time left on the timer
            pumpControllerMiddleware.runProgramSequence( index, pump.getCurrentRunningValue( 2 ) )

            // if (settings.get('logPumpTimers')) logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            // pump1Timer.setTimeout(pump1SafePumpModeDelay, '', '10s')
            pump2Timer = setTimeout( pump2ProgramTimerMode, 30 * 1000 )

        } else
            if ( pump.getCurrentRemainingDuration( index ) === 0 )
    {
                //program duration has finished
                if ( settings.get( 'logPumpMessages' ) )
                    logger.info( 'Pump %s Program Timer Finished.   Pump will shut down.', index )
                //Timer = 0, we are done.  Pump should turn off automatically
                clearTimer( index )
            } else if ( pump.getCurrentRemainingDuration( index ) === -1 )
            {
                //run until stopped
                // if (settings.get('logPumpTimers'))
                //     logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
                if ( settings.get( 'logPumpMessages' ) )
                    logger.verbose( 'App -> Pump %s: Sending Run Pump Program %s. %s minutes left. (%s)', index, pump.getCurrentRunningValue( index ), pump.getCurrentRemainingDuration( index ), callback );
                // pump1Timer.setTimeout(pump1SafePumpModeDelay, '', '10s')
                pumpControllerMiddleware.runProgramSequence( index, pump.getCurrentRunningValue( 2 ) )
                pump2Timer = setTimeout( pump2ProgramTimerMode, 30 * 1000 )
            }
        emit()
    }

    export function pump1RPMTimerMode ()
    {
        let index:Pump.PumpIndex = 1
        let callback = 'pump' + index.toString() + 'RPMTimerMode'
        if ( pump.getCurrentRemainingDuration( index ) > 0 )
        {
            //rpm timer has remaining duration
            pump.updateCurrentRunningPumpDuration( index, -0.5 )
            if ( settings.get( 'logPumpMessages' ) )
                logger.verbose( 'App -> Pump %s: Sending Run @ %s RPM. %s minutes left. (%s)', index, pump.getCurrentRunningValue( index ), pump.getCurrentRemainingDuration( index ), callback );


            //this function was called via timer and there is still time left on the timer
            pumpControllerMiddleware.runRPMSequence( index, pump.getCurrentRunningValue( 1 ) )

            // if (settings.get('logPumpTimers')) logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            pump1Timer = setTimeout( pump1RPMTimerMode, 30 * 1000 )

        } else
            if ( pump.getCurrentRemainingDuration( index ) === 0 )
    {
                //rpm duration has finished
                if ( settings.get( 'logPumpMessages' ) )
                    logger.info( 'Pump %s RPM Timer Finished.   Pump will shut down.', index )
                //Timer = 0, we are done.  Pump should turn off automatically
                clearTimer( index )
            } else if ( pump.getCurrentRemainingDuration( index ) === -1 )
            {
                //run until stopped
                // if (settings.get('logPumpTimers'))
                //     logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
                if ( settings.get( 'logPumpMessages' ) )
                    logger.verbose( 'App -> Pump %s: Sending Run @ %s RPM. %s minutes left. (%s)', index, pump.getCurrentRunningValue( index ), pump.getCurrentRemainingDuration( index ), callback );

                pumpControllerMiddleware.runRPMSequence( index, pump.getCurrentRunningValue( 1 ) )
                pump1Timer = setTimeout( pump1RPMTimerMode, 30 * 1000 )
            }
        emit()
    }

    export function pump2RPMTimerMode ()
    {
        let index:Pump.PumpIndex = 2
        let callback = 'pump' + index.toString() + 'RPMTimerMode'
        if ( pump.getCurrentRemainingDuration( index ) > 0 )
        {
            //rpm has remaining duration
            pump.updateCurrentRunningPumpDuration( index, -0.5 )
            if ( settings.get( 'logPumpMessages' ) )
                logger.verbose( 'App -> Pump %s: Sending Run @ %s RPM. %s minutes left. (%s)', index, pump.getCurrentRunningValue( index ), pump.getCurrentRemainingDuration( index ), callback );


            //this function was called via timer and there is still time left on the timer
            pumpControllerMiddleware.runRPMSequence( index, pump.getCurrentRunningValue( 2 ) )

            // if (settings.get('logPumpTimers')) logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            pump2Timer = setTimeout( pump2RPMTimerMode, 30 * 1000 )

        } else
            if ( pump.getCurrentRemainingDuration( index ) === 0 )
    {
                //rpm duration has finished
                if ( settings.get( 'logPumpMessages' ) )
                    logger.info( 'Pump %s RPM Timer Finished.   Pump will shut down.', index )
                clearTimer( index )
            } else if ( pump.getCurrentRemainingDuration( index ) === -1 )
            {
                //run until stopped
                // if (settings.get('logPumpTimers'))
                //     logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
                if ( settings.get( 'logPumpMessages' ) )
                    logger.verbose( 'App -> Pump %s: Sending Run @ %s RPM. %s minutes left. (%s)', index, pump.getCurrentRunningValue( index ), pump.getCurrentRemainingDuration( index ), callback );

                pumpControllerMiddleware.runRPMSequence( index, pump.getCurrentRunningValue( 2 ) )
                pump2Timer = setTimeout( pump2RPMTimerMode, 30 * 1000 )
            }
        emit()
    }

    // GPM

    export function pump1GPMTimerMode ()
    {
        let index:Pump.PumpIndex = 1
        var callback = 'pump' + index.toString() + 'GPMTimerMode'
        if ( pump.getCurrentRemainingDuration( index ) > 0 )
        {
            //gpm timer has remaining duration
            pump.updateCurrentRunningPumpDuration( index, -0.5 )
            if ( settings.get( 'logPumpMessages' ) )
                logger.verbose( 'App -> Pump %s: Sending Run @ %s GPM. %s minutes left. (%s)', index, pump.getCurrentRunningValue( index ), pump.getCurrentRemainingDuration( index ), callback );


            //this function was called via timer and there is still time left on the timer
            pumpControllerMiddleware.runGPMSequence( index, pump.getCurrentRunningValue( 1 ) )

            // if (settings.get('logPumpTimers')) logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            pump1Timer = setTimeout( pump1GPMTimerMode, 30 * 1000 )

        } else
            if ( pump.getCurrentRemainingDuration( index ) === 0 )
    {
                //gpm duration has finished
                if ( settings.get( 'logPumpMessages' ) )
                    logger.info( 'Pump %s GPM Timer Finished.   Pump will shut down.', index )
                //Timer = 0, we are done.  Pump should turn off automatically
                clearTimer( index )
            } else if ( pump.getCurrentRemainingDuration( index ) === -1 )
            {
                //run until stopped
                // if (settings.get('logPumpTimers'))
                //     logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
                if ( settings.get( 'logPumpMessages' ) )
                    logger.verbose( 'App -> Pump %s: Sending Run @ %s GPM. %s minutes left. (%s)', index, pump.getCurrentRunningValue( index ), pump.getCurrentRemainingDuration( index ), callback );

                pumpControllerMiddleware.runGPMSequence( index, pump.getCurrentRunningValue( 1 ) )
                pump1Timer = setTimeout( pump1GPMTimerMode, 30 * 1000 )
            }
        emit()
    }

    export function pump2GPMTimerMode ()
    {
        let index:Pump.PumpIndex = 2
        let callback = 'pump' + index.toString() + 'GPMTimerMode'
        if ( pump.getCurrentRemainingDuration( index ) > 0 )
        {
            //gpm has remaining duration
            pump.updateCurrentRunningPumpDuration( index, -0.5 )
            if ( settings.get( 'logPumpMessages' ) )
                logger.verbose( 'App -> Pump %s: Sending Run @ %s GPM. %s minutes left. (%s)', index, pump.getCurrentRunningValue( index ), pump.getCurrentRemainingDuration( index ), callback );


            //this function was called via timer and there is still time left on the timer
            pumpControllerMiddleware.runGPMSequence( index, pump.getCurrentRunningValue( 2 ) )

            // if (settings.get('logPumpTimers')) logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            pump2Timer = setTimeout( pump2GPMTimerMode, 30 * 1000 )

        } else
            if ( pump.getCurrentRemainingDuration( index ) === 0 )
    {
                //gpm duration has finished
                if ( settings.get( 'logPumpMessages' ) )
                    logger.info( 'Pump %s GPM Timer Finished.   Pump will shut down.', index )
                clearTimer( index )
            } else if ( pump.getCurrentRemainingDuration( index ) === -1 )
            {
                //run until stopped
                // if (settings.get('logPumpTimers'))
                //     logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
                if ( settings.get( 'logPumpMessages' ) )
                    logger.verbose( 'App -> Pump %s: Sending Run @ %s GPM. %s minutes left. (%s)', index, pump.getCurrentRunningValue( index ), pump.getCurrentRemainingDuration( index ), callback );

                pumpControllerMiddleware.runGPMSequence( index, pump.getCurrentRunningValue( 2 ) )
                pump2Timer = setTimeout( pump2GPMTimerMode, 30 * 1000 )
            }
        emit()
    }

    //END GPM
    export function pump1PowerTimerMode ()
    {
        let index:Pump.PumpIndex = 1
        let callback = 'pump' + index.toString() + 'PowerTimerMode'
        if ( pump.getCurrentRemainingDuration( index ) > 0 )
        {
            //power has remaining duration
            pump.updateCurrentRunningPumpDuration( index, -0.5 )
            if ( settings.get( 'logPumpMessages' ) )
                logger.verbose( 'App -> Pump %s: Sending Run Power On. %s minutes left. (%s)', pump.getCurrentRemainingDuration( index ), callback );


            //this function was called via timer and there is still time left on the timer
            pumpControllerMiddleware.runPowerSequence( index, pump.getCurrentRunningValue( index ) )

            // if (settings.get('logPumpTimers')) logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            pump1Timer = setTimeout( pump1PowerTimerMode, 30 * 1000 )

        } else
            if ( pump.getCurrentRemainingDuration( index ) === 0 )
    {
                //power duration has finished
                if ( settings.get( 'logPumpMessages' ) )
                    logger.info( 'Pump %s Power Timer Finished.   Pump will shut down.', index )
                //Timer = 0, we are done.  Pump should turn off automatically
                clearTimer( index )
            } else if ( pump.getCurrentRemainingDuration( index ) === -1 )
            {
                //run until stopped
                // if (settings.get('logPumpTimers'))
                //     logger.verbose('%s: Setting 30s delay to run %s', callback, callback)

                if ( settings.get( 'logPumpMessages' ) )
                    logger.verbose( 'App -> Pump %s: Sending Run Power On. %s minutes left. (%s)', index, pump.getCurrentRemainingDuration( index ), callback );
                pumpControllerMiddleware.runPowerSequence( index, pump.getCurrentRunningValue( index ) )
                pump1Timer = setTimeout( pump1PowerTimerMode, 30 * 1000 )
            }
        emit()
    }

    export function pump2PowerTimerMode ()
    {
        let index:Pump.PumpIndex = 2
        let callback = 'pump' + index.toString() + 'PowerTimerMode'
        if ( pump.getCurrentRemainingDuration( index ) > 0 )
        {
            //program has remaining duration
            pump.updateCurrentRunningPumpDuration( index, -0.5 )
            if ( settings.get( 'logPumpMessages' ) )
                logger.verbose( 'App -> Pump %s: Sending Run Power On. %s minutes left. (%s)', index, pump.getCurrentRemainingDuration( index ), callback );


            //this function was called via timer and there is still time left on the timer
            pumpControllerMiddleware.runPowerSequence( index, pump.getCurrentRunningValue( 2 ) )

            // if (settings.get('logPumpTimers')) logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
            pump2Timer = setTimeout( pump2PowerTimerMode, 30 * 1000 )

        } else
            if ( pump.getCurrentRemainingDuration( index ) === 0 )
            {
                //program duration has finished
                if ( settings.get( 'logPumpMessages' ) )
                    logger.info( 'Pump %s Power Timer Finished.   Pump will shut down.', index )
                clearTimer( index )
            } else if ( pump.getCurrentRemainingDuration( index ) === -1 )
            {
                //run until stopped
                // if (settings.get('logPumpTimers'))
                //     logger.verbose('%s: Setting 30s delay to run %s', callback, callback)
                if ( settings.get( 'logPumpMessages' ) )
                    logger.verbose( 'App -> Pump %s: Sending Run Power On. %s minutes left. (%s)', index, pump.getCurrentRemainingDuration( index ), callback );
                pumpControllerMiddleware.runPowerSequence( index, pump.getCurrentRunningValue( 2 ) )

                pump2Timer = setTimeout( pump2PowerTimerMode, 30 * 1000 )
            }
        emit()
    }



    //set the internal timer for pump controls
    export function startProgramTimer ( index: Pump.PumpIndex, program: number, duration: number )
    {
        var padDuration = 0
        if ( duration > 0 )
        {
            padDuration = 0.5 //timer will decrement at first run.  add this so the full time is used.
        } else if ( duration === null || duration === undefined )
        {
            duration = -1
        }

        if ( index === 1 )
        {
            if ( isPumpTimerRunning( 1 ) ) clearTimer( 1 )
            pump.setCurrentRunning( index, 'program', program, duration )
            duration += padDuration
            pump1ProgramTimerMode()
            pump1TimerRunning = 1
        } else if ( index === 2 )
        {
            if ( isPumpTimerRunning( 2 ) ) clearTimer( 2 )
            pump.setCurrentRunning( index, 'program', program, duration )
            duration += padDuration
            pump2ProgramTimerMode()
            pump2TimerRunning = 1
        } else
        {
            logger.warn( 'Request to start pump program timer %s, but config.json numberOfPumps = %s', index, pump.numberOfPumps() )
        }
    }

    //set the internal timer for pump controls
    export function startGPMTimer ( index: number, gpm: number, duration: number )
    {
        var padDuration = 0
        if ( duration > 0 )
        {
            padDuration = 0.5 //timer will decrement at first run.  add this so the full time is used.
        } else if ( duration === null || duration === undefined )
        {
            duration = -1
        }
        if ( index === 1 )
        {
            if ( isPumpTimerRunning( 1 ) ) clearTimer( 1 )
            pump.setCurrentRunning( index, 'gpm', gpm, duration )
            duration += padDuration
            pump1GPMTimerMode()
            pump1TimerRunning = 1
        } else if ( index === 2 )
        {
            if ( isPumpTimerRunning( 2 ) ) clearTimer( 2 )
            pump.setCurrentRunning( index, 'gpm', gpm, duration )
            duration += padDuration

            pump2GPMTimerMode()
            pump2TimerRunning = 1
        } else
        {
            logger.warn( 'Request to start pump GPM timer %s, but config.json numberOfPumps = %s', index, pump.numberOfPumps() )
        }
    }

    //set the internal timer for pump controls
    export function startRPMTimer ( index: number, rpm: number, duration: number )
    {
        var padDuration = 0
        if ( duration > 0 )
        {
            padDuration = 0.5 //timer will decrement at first run.  add this so the full time is used.
        } else if ( duration === null || duration === undefined )
        {
            duration = -1
        }
        if ( index === 1 )
        {
            if ( isPumpTimerRunning( 1 ) ) clearTimer( 1 )
            pump.setCurrentRunning( index, 'rpm', rpm, duration )
            duration += padDuration
            pump1RPMTimerMode()
            pump1TimerRunning = 1
        } else if ( index === 2 )
        {
            if ( isPumpTimerRunning( 2 ) ) clearTimer( 2 )
            pump.setCurrentRunning( index, 'rpm', rpm, duration )
            duration += padDuration

            pump2RPMTimerMode()
            pump2TimerRunning = 1
        } else
        {
            logger.warn( 'Request to start pump RPM timer %s, but config.json numberOfPumps = %s', index, pump.numberOfPumps() )
        }
    }

    //set the internal timer for pump controls
    export function startPowerTimer ( index: number, duration: number )
    {
        if ( duration > 0 )
        {
            duration = duration + 0.5 //timer will decrement at first run.  add this so the full time is used.
        } else if ( duration === null || duration === undefined )
        {
            duration = -1
        }

        if ( index === 1 )
        {
            if ( isPumpTimerRunning( 1 ) ) clearTimer( 1 )
            pump.setCurrentRunning( index, 'power', 1, duration )
            pump1PowerTimerMode()
            pump1TimerRunning = 1
        } else if ( index === 2 )
        {
            if ( isPumpTimerRunning( 2 ) ) clearTimer( 2 )
            pump.setCurrentRunning( index, 'power', 1, duration )
            pump2PowerTimerMode()
            pump2TimerRunning = 1
        } else
        {
            logger.warn( 'Request to start pump power timer %s, but config.json numberOfPumps = %s', index, pump.numberOfPumps() )
        }
    }

    /*istanbul ignore next */
    // if (logModuleLoading)
    //     logger.info('Loaded: pump-controller-timers.js')
}