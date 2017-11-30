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

var
    config = {},
    file,
    //path = require('path').posix,
    location


module.exports = function(container) {
    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: config-editor.js')


    var //Promise = require('bluebird'),
//        fs = require('fs')
    //Promise.promisifyAll(fs)
    Promise = container.promise
    pfs = Promise.promisifyAll(container.fs)

    //file = exports.file = container.settings.configurationFile //exported for API Test #8


    var init = function(_location) {
        if (_location===undefined)
            location = container.path.join(process.cwd(), container.settings.configurationFile)
        else
            location = container.path.join(process.cwd(), _location)

        config = {}
        return pfs.readFileAsync(location, 'utf-8')
            .then(function(data) {
                config = JSON.parse(data)
                return config
            })
            .catch(function(err){
                container.logger.error('Error reading %s.  %s', location, err)
            })
    }

    var updatePumpType = function(_pump, _type) {
        return Promise.resolve()
            .then(function() {
                config.equipment.pump[_pump].type = _type
                container.settings.pump[_pump].type = _type //TODO: we should re-read the file from disk at this point?
                return pfs.writeFileAsync(location, JSON.stringify(config, null, 4), 'utf-8')
            })
            .then(function() {
                container.logger.verbose('Updated pump %s type %s', _pump, _type, location)
                container.pump.init()
                container.pumpControllerTimers.startPumpController()
                container.io.emitToClients('pump')

            })
            .catch(function(err) {
                container.logger.warn('Error updating pump type settings %s: ', location, err)
            })
    }

    var updateExternalPumpProgram = function(_pump, program, rpm) {
        return Promise.resolve()
            .then(function() {
                config.equipment.pump[_pump].externalProgram[program] = rpm
                container.settings.pump[_pump].externalProgram[program] = rpm
                return pfs.writeFileAsync(location, JSON.stringify(config, null, 4), 'utf-8')
            })
            .then(function() {
                container.logger.verbose('Updated pump RPM settings %s', location)
            })
            .catch(function(err) {
                container.logger.warn('Error updating pump RPM settings %s: ', location, err)
            })
    }

    // var updatePumpProgramGPM = function(_pump, program, gpm) {
    //     return Promise.resolve()
    //         .then(function() {
    //             config.equipment.pump[_pump].programGPM[program] = gpm  //TODO: this does not exist.  can we get rid of it?
    //             return fs.writeFileAsync(location, JSON.stringify(config, null, 4), 'utf-8')
    //         })
    //         .then(function() {
    //             container.logger.verbose('Updated pump GPM settings %s', location)
    //         })
    //         .catch(function(err) {
    //             container.logger.warn('Error updating config GPM pump settings %s: ', location, err)
    //         })
    // }


    var updateChlorinatorInstalled = function(installed) {
        Promise.resolve()
            .then(function() {
                config.equipment.chlorinator.installed = installed
                container.settings.chlorinator.installed = installed
                return pfs.writeFileAsync(location, JSON.stringify(config, null, 4), 'utf-8')
            })
            .then(function() {
                if (container.settings.logChlorinator)
                    container.logger.verbose('Updated chlorinator settings (installed) %s', location)
            })
            .catch(function(err) {
                container.logger.warn('Error updating chlorinator installed %s: ', location, err)
            })
    }


    var updateChlorinatorDesiredOutput = function(pool, spa) {
        Promise.resolve()
            .then(function() {
                config.equipment.chlorinator.desiredOutput = {}
                config.equipment.chlorinator.desiredOutput.pool = pool
                config.equipment.chlorinator.desiredOutput.spa = spa
                container.settings.equipment.chlorinator.desiredOutput.pool = pool
                container.settings.equipment.chlorinator.desiredOutput.spa = spa
                return pfs.writeFileAsync(location, JSON.stringify(config, null, 4), 'utf-8')
            })
            .then(function() {
                if (container.settings.logChlorinator)
                    container.logger.verbose('Updated chlorinator settings (desired output) %s', location)
            })
            .catch(function(err) {
                container.logger.warn('Error updating chlorinator settings %s: ', location, err)
            })
    }

    var updateChlorinatorName = function(name) {
        Promise.resolve()
            .then(function() {
                config.equipment.chlorinator.id.productName = name
                container.settings.equipment.chlorinator.id.productName = name
                return pfs.writeFileAsync(location, JSON.stringify(config, null, 4), 'utf-8')
            })
            .then(function() {
                container.logger.verbose('Updated chlorinator settings (name) %s', location)
            })
            .catch(function(err) {
                container.logger.warn('Error updating chlorinator name %s: ', location, err)
            })
    }

    var updateVersionNotification = function(dismissUntilNextRemoteVersionBump) {
        return Promise.resolve()
            .then(function() {
                config.poolController.notifications.version.remote.dismissUntilNextRemoteVersionBump = dismissUntilNextRemoteVersionBump
                var results = container.updateAvailable.getResults()
                config.poolController.notifications.version.remote.version = results.remote.version
                config.poolController.notifications.version.remote.tag_name = results.remote.tag_name
                return pfs.writeFileAsync(location, JSON.stringify(config, null, 4), 'utf-8')
            })
            .then(function() {
                return container.logger.verbose('Updated version notification settings %s', location)
            })
            .catch(function(err) {
                container.logger.warn('Error updating version notification settings %s: ', location, err)
            })
    }

    var getPumpExternalProgram = function(_pump) {
        return Promise.resolve()
            .then(function() {
                return config.equipment.pump[_pump].externalProgram
            })
            .catch(function(err) {
                container.logger.error('Something went wrong getting pump program from config file.', err)
            })
    }

    var getChlorinatorDesiredOutput = function() {
        return Promise.resolve()
            .then(function() {
                // following is to support changing from
                // "desiredOutput": -1,
                // to
                // "desiredOutput": {"pool": -1, "spa":-1},
                if (Number.isInteger(config.equipment.chlorinator.desiredOutput)){
                    return updateChlorinatorDesiredOutput(config.equipment.chlorinator.desiredOutput,-1)
                        .then(function() {
                            return config.equipment.chlorinator.desiredOutput
                        })
                }
                else {
                    return config.equipment.chlorinator.desiredOutput
                }

            })
            .catch(function(err) {
                container.logger.error('Something went wrong getting chlorinator desiredOutput from config file.', err)
            })
    }
    var getChlorinatorName = function() {
        return Promise.resolve()
            .then(function() {
                return config.equipment.chlorinator.id.productName
            })
            .catch(function(err) {
                container.logger.error('Something went wrong getting chlorinator product name from config file.', err)
            })
    }

    var getVersionNotification = function() {
        return config.poolController.notifications.version.remote
    }



    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: config-editor.js')


    return {
        init: init,
        updateExternalPumpProgram: updateExternalPumpProgram,
        updatePumpType: updatePumpType,
        //updatePumpProgramGPM: updatePumpProgramGPM,
        updateVersionNotification: updateVersionNotification,
        updateChlorinatorInstalled: updateChlorinatorInstalled,
        updateChlorinatorDesiredOutput: updateChlorinatorDesiredOutput,
        updateChlorinatorName: updateChlorinatorName,
        getPumpExternalProgram: getPumpExternalProgram,
        getVersionNotification: getVersionNotification,
        getChlorinatorDesiredOutput: getChlorinatorDesiredOutput,
        getChlorinatorName: getChlorinatorName
    }
}
