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

var configClient,
    file = '/src/www/bootstrap/configClient.json',
    path = require('path').posix,
    location

// var Promise = require('bluebird'),
//     fs = require('fs')
// Promise.promisifyAll(fs)

module.exports = function(container) {
    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: bootstrap-config-editor.js')

    var Promise = container.promise,
        //fs = require('fs')
    pfs =  Promise.promisifyAll(container.fs)


    location = path.join(process.cwd(), file)

    var init = function(_location){
        if (_location===undefined)
            location = path.join(process.cwd(), file)
        else
            location = path.join(process.cwd(), _location)

        configClient = {}
        return readConfigClient()
    }

    var resetPanelState = function() {
        for (var key in configClient.panelState) {
            key.state = "visible"
        }
    }

    var readConfigClient = function() {
        if (configClient.hasOwnProperty('panelState')) {
            return Promise.resolve(configClient)
        } else {
            return pfs.readFileAsync(location, 'utf-8').then(function(data) {
                configClient = JSON.parse(data)
                return configClient
            })
                .catch(function(err){
                    container.logger.warn('Error reading %s file:',location, err.message)
                })
        }
    }

    var update = function(a, b, c, d) {
       return Promise.resolve()
            .then(readConfigClient)
            .then(function(data) {
                if (c === null || c === undefined) {
                    data[a][b] = d
                } else {
                    data[a][b][c] = d
                }
                return data

            })
            .then(function(data){
              return pfs.writeFileAsync(location, JSON.stringify(data, null, 4), 'utf-8')
            })
            .then(function() {
                container.logger.verbose('Updated configClient.json.')
            })
            .catch(function(err) {
                container.logger.warn('Error updating bootstrap %s: %s', location, err.message)
            })

    }

    var reset = function() {
        return readConfigClient()
            .then(function(data) {
                for (var key in data.panelState) {
                    data.panelState[key].state = "visible"
                }
                return pfs.writeFileAsync(location, JSON.stringify(data, null, 4), 'utf-8')
            })
            .then(function() {
                container.logger.verbose('Reset bootstrap configClient.json')
            })
            .catch(function(err) {
                container.logger.warn('Error resetting bootstrap %s: ',location, err.message)
            })
    }



    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: bootstrap-config-editor.js')


    return {
        update: update,
        reset: reset,
        init: init
    }
}
