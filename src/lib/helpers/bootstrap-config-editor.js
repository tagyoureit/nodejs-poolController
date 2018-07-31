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
        return pfs.readFileAsync(location, 'utf-8')
            .then(function (data) {
                configClient = JSON.parse(data)
                return configClient
            })
            .catch(function (err) {
                container.logger.warn('Error reading in bootstrap-config-editor.js %s file:', location, err.message)
            })

    }

    var updateAsync = function(a, b, c, d) {
        return Promise.resolve()
            .then(readConfigClient)
            .then(function(data) {
                if (c === null || c === undefined) {
                    data[a][b] = d
                } else {
                    data[a][b][c] = d
                }
                if (!container.helpers.testJson(data)) {
                    throw new Error('Error with update bootstrap config format.  Aborting write.')
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

    var resetAsync = function() {
        return readConfigClient()
            .then(function(data) {
                for (var key in data.panelState) {
                    data.panelState[key].state = "visible"
                }
                if (!container.helpers.testJson(data)) {
                    throw new Error('Error with readConfigClient bootstrap config format.  Aborting write.')
                }
                return data
            })
            .then(function(data){
                return pfs.writeFileAsync(location, JSON.stringify(data, null, 4), 'utf-8')
            })
            .then(function() {
                container.io.emitToClients('all')
                container.logger.verbose('Reset bootstrap configClient.json')
            })
            .catch(function(err) {
                container.logger.warn('Error resetting bootstrap %s: ',location, err.message)
                console.log('err', err)
            })
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: bootstrap-config-editor.js')


    return {
        updateAsync: updateAsync,
        resetAsync: resetAsync,
        init: init
    }
}
