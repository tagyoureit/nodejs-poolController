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

var fsio = require('promised-io/fs'),
    configClient,
    dir = '/src/www/bootstrap',
    file = 'configClient.json',
    path = require('path').posix,
    location

var Promise = require('bluebird'),
    fs = require('fs')
Promise.promisifyAll(fs)

module.exports = function(container) {
    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: bootstrap-config-editor.js')
    location = path.join(process.cwd(), dir, file)

    var resetPanelState = function() {
        for (var key in configClient.panelState) {
            key.state = "visible"
        }
    }

    var readConfigClient = function() {
        if (configClient) {
            return Promise.resolve(configClient)
        } else {
            return fs.readFileAsync(location, 'utf-8').then(function(data) {
                configClient = JSON.parse(data)
                return Promise.resolve(configClient)
            })
        }
    }

    var update = function(a, b, c, d) {
        return readConfigClient()
            .then(function(data) {
                if (c === null || c === undefined) {
                    data[a][b] = d
                } else {
                    data[a][b][c] = d
                }
                return Promise.resolve(data)

            })
            .then(function(data){
              return fs.writeFileAsync(location, JSON.stringify(data, null, 4), 'utf-8')
            })
            .then(function() {
                container.logger.verbose('Updated configClient.json.')
            })
            .catch(function(err) {
                container.logger.warn('Error updating bootstrap configClient.json: ', err)
            })
    }

    var reset = function() {
        return readConfigClient()
            .then(function(data) {
                for (var key in data.panelState) {
                    data.panelState[key].state = "visible"
                }
                return fs.writeFileAsync(location, JSON.stringify(data, null, 4), 'utf-8')
            })
            .then(function() {
                container.logger.verbose('Reset bootstrap configClient.json')
            })
            .catch(function(err) {
                container.logger.warn('Error resetting bootstrap configClient.json: ', err)
            })
    }



    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: bootstrap-config-editor.js')


    return {
        update: update,
        reset: reset
    }
}
