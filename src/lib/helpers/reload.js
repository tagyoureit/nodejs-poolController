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

//TODO: make an 'update' function so poolHeatModeStr/spaHeatModeStr update when we set the corresponding modes.



module.exports = function(container) {
    var logger = container.logger
    /*istanbul ignore next */
    if (container.logModuleLoading)
        logger.info('Loading: reload.js')



    var reload = function(callback) {
        var reloadStr = 'Reloading settings.  Stopping/Starting Serialport.  Pool, Pump and Chlorinator controllers will be re-initialized \r\n \
            This will _NOT_ restart the express (web) server and will not affect bootstrap, auth, or ssl.'
        var res = reloadStr + '<p>'
        res += 'Intro: <p>' + container.settings.displayIntroMsg() + '<p>'
        res += 'Settings: <p>' + container.settings.displaySettingsMsg() + '<p>'



        /*  STOP STUFF
        */
        //container.io.stop()
        var spClose = container.sp.close()
        console.log(spClose)
        //container.server.close()
        container.logger.info(reloadStr)
        if (!container.settings.pumpOnly) {
            //only clear timers if we go from 1 or 2 pumps to 0 pumps
            container.pumpControllerTimers.clearTimer(1)
            container.pumpControllerTimers.clearTimer(2)
        }
        if (!container.settings.chlorinator) {
            container.chlorinatorController.clearTimer()
        }


        /*  RELOAD STUFF
        */
        container.settings.load()

        //container.io.start()
        container.logger.info('Intro: ', container.settings.displayIntroMsg())
        container.logger.warn('Settings: ', container.settings.displaySettingsMsg())
        container.sp.init()

        if (container.settings.pumpOnly && !container.settings.intellicom && !container.settings.intellitouch) {
            container.pumpControllerTimers.startPumpController()
        }
        if (container.settings.chlorinator) {
            container.chlorinatorController.startChlorinatorController()
        }
        if (container.settings.intellitouch)
        {
          container.intellitouch.getControllerConfiguration()
        }

        return res
        if (callback !== undefined) {
            return res
        }

          container.logger.info(res)


    }


    /*istanbul ignore next */
    if (container.logModuleLoading)
        logger.info('Loaded: reload.js')


    return {
        reload: reload
    }
}
