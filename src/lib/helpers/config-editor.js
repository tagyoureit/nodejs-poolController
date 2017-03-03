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

var //fsio = require('promised-io/fs'),
    config,
    dir = '/',
    file,
    path = require('path').posix,
    location

var Promise = require('bluebird'),
    fs = require('fs')
Promise.promisifyAll(fs)

module.exports = function(container) {
    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: config-editor.js')

    file = container.settings.configurationFile
    location = path.join(process.cwd(), dir, file)


    var init = function() {
        if (config) {
            return Promise.resolve(config)
        } else {
            return fs.readFileAsync(location, 'utf-8').then(function(data) {
                config = JSON.parse(data)
                return config
            })
        }
    }

    var updatePumpProgramRPM = function(_pump, program, rpm) {
        return init()
            .then(function(data) {
                    data.equipment.pump[_pump].programRPM[program] = rpm

                return fs.writeFileAsync(location, JSON.stringify(data, null, 4), 'utf-8')
            })
            .then(function() {
                container.logger.verbose('Updated pump settings %s', location)
            })
            .catch(function(err) {
                container.logger.warn('Error updating config pump settings %s: ', location, err)
            })
    }

    var getProgramRPM = function(_pump){
        return init()
          .then(function(){
            return config.equipment[_pump].programRPM
          })
    }

    // var reset = function() {
    //     var promise = init()
    //         .then(function(data) {
    //             for (var key in data.panelState) {
    //                 data.panelState[key].state = "visible"
    //             }
    //             return fs.writeFileAsync(location, JSON.stringify(data, null, 4), 'utf-8')
    //         })
    //         .then(function() {
    //             container.logger.verbose('Reset bootstrap %s', location)
    //         })
    //         .catch(function(err) {
    //             container.logger.warn('Error resetting bootstrap %s: ', location, err)
    //         })
    // }



    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: config-editor.js')


    return {
        updatePumpProgramRPM: updatePumpProgramRPM,
        // reset: reset,
        init: init,
        getProgramRPM: getProgramRPM
    }
}
