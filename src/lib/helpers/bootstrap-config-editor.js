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
    dir = '/src/bootstrap',
    file = 'configClient.json',
    path = require('path').posix,
    location

module.exports = function(container) {
    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: bootstrap-config-editor.js')
    location = path.join(process.cwd(), dir, file)

    var readConfigClient = function() {
        var Deferred = require("promised-io/promise").Deferred;
        var deferred = new Deferred();

        fsio.readFile(location, 'utf-8').then(function(data) {
          try {
            configClient = JSON.parse(data)
            console.log('in bce...', configClient)
            return deferred.resolve()
          }
          catch (err){
            return deferred.reject(err)
          }
        }, function(error) {
            container.logger.warn('can not read local configClient.json: ', error)
            return deferred.reject(error)
        })
        return deferred
    }

    var alter = function(a, b, c, d) {
        if (c === null || c===undefined) {
                configClient[a][b] = d
        } else {
                configClient[a][b][c] = d
        }
    }

    var writeConfigClient = function() {
        var Deferred = require("promised-io/promise").Deferred;
        var deferred = new Deferred();

        fsio.writeFile(location, JSON.stringify(configClient, null, 4),  'utf-8').then(function(msg) {
            return deferred.resolve()
        }, function(error) {
            return deferred.reject(error)
        })
        return deferred
    }

    var update = function(a, b, c, d) {
        var promise = readConfigClient()
            .then(function() {
              alter(a, b, c, d)
              // console.log('and finally', configClient)
            })
            .then(writeConfigClient)
            .then(function(){
              container.logger.verbose('Updated configClient.json')

            }, function(err) {
                container.logger.warn('Error updating bootstrap configClient.json: ', err)
            })
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: bootstrap-config-editor.js')


    return {
        update: update
    }
}
