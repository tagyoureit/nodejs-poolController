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

var config = {},
    location


module.exports = function(container) {
    /*istanbul ignore next */
    if (container.logModuleLoading)
    // container.logger.info('Loading: config-editor.js')
        console.log('Loading: config-editor.js')

    Promise = container.promise
    pfs = Promise.promisifyAll(container.fs)

    // var checkForOldConfigFile = function () {
    //
    //     try {
    //         //the throw will throw an error parsing the file, the catch will catch an error reading the file.
    //         if (!config.hasOwnProperty('poolController')){
    //             throw new Error()
    //         }
    //
    //     } catch (err) {
    //         // ok to catch error because we are looking for non-existent properties
    //         container.logger.error('\x1b[31m %s config file is missing newer property poolController.\x1b[0m', location)
    //         global.exit_nodejs_poolController()
    //     }
    //
    //     try {
    //         //the throw will throw an error parsing the file, the catch will catch an error reading the file.
    //         if (!config.poolController.hasOwnProperty('database')){
    //             throw new Error()
    //         }
    //
    //     } catch (err) {
    //         // ok to catch error because we are looking for non-existent properties
    //         container.logger.error('\x1b[31m %s config file is missing newer property poolController.database.\x1b[0m', location)
    //         global.exit_nodejs_poolController()
    //     }
    //
    //
    //     hasOldSettings = ['Equipment','numberOfPumps','pumpOnly','intellicom','intellitouch']
    //
    //     hasOldSettings.forEach(function(el){
    //         try {
    //             //the throw will throw an error parsing the file, the catch will catch an error reading the file.
    //             // container.logger.silly('testing for config.%s in %s',el,location)
    //             if (config.hasOwnProperty(el)){
    //                 throw new Error()
    //             }
    //
    //         } catch (err) {
    //             // ok to catch error because we are looking for non-existent properties
    //             container.logger.error('\x1b[31m %s config file has outdated property %s.\x1b[0m', location, el)
    //             global.exit_nodejs_poolController()
    //         }
    //     })
    //
    //
    //     // following is to support changing from
    //     // "desiredOutput": -1,
    //     // to
    //     // "desiredOutput": {"pool": -1, "spa":-1},
    //
    //
    //     if (typeof config.equipment.chlorinator.desiredOutput==='number') {
    //         container.logger.error('\x1b[31m %s config file has outdated property config.equipment.chlorinator.desiredOutput.\x1b[0m', location)
    //         global.exit_nodejs_poolController()
    //     }
    //
    //
    // }
    //
    // var initAsync = function(_location) {
    //
    //
    //
    //
    //     return Promise.resolve()
    //         .then(function(){
    //             container.logger.debug('Starting settings.loadAsync()')
    //             config = {}
    //
    //             // if (_location === undefined)
    //             //     location = container.path.join(process.cwd(), container.settings.get('configurationFile'))
    //             // else
    //             location = container.path.join(process.cwd(), _location)
    //             return location
    //         })
    //         .then(function(location){
    //             return pfs.readFileAsync(location, 'utf-8')
    //         })
    //
    //         .then(function (data) {
    //             config = JSON.parse(data)
    //             checkForOldConfigFile()
    //             return config
    //         })
    //
    //         .catch(function (err) {
    //             container.logger.error('Error reading %s.  %s', location, err)
    //         })
    //         .finally(function(){
    //             container.logger.debug('Finished settings.loadAsync()')
    //         })
    //
    // }
    //
    // var updatePumpTypeAsync = function(_pump, _type) {
    //     return Promise.resolve()
    //         .then(function() {
    //             config.equipment.pump[_pump].type = _type
    //             container.settings.get('pump')[_pump].type = _type //TODO: we should re-read the file from disk at this point?
    //             if (!container.helpers.testJson(config)){
    //                 throw new Error('Error with updatePumpTypeAsync format.  Aborting write.')
    //             }
    //             return config
    //         })
    //         .then(function(){
    //             return pfs.writeFileAsync(location, JSON.stringify(config, null, 4), 'utf-8')
    //         })
    //         .then(function() {
    //             container.logger.verbose('Updated pump %s type %s', _pump, _type, location)
    //             container.pump.init()
    //             container.pumpControllerTimers.startPumpController()
    //             container.io.emitToClients('pump')
    //
    //         })
    //         .catch(function(err) {
    //             container.logger.warn('Error updating pump type settings %s: ', location, err)
    //         })
    // }
    //
    // var updateExternalPumpProgramAsync = function(_pump, program, rpm) {
    //     return Promise.resolve()
    //         .then(function() {
    //             config.equipment.pump[_pump].externalProgram[program] = rpm
    //             container.settings.get('pump')[_pump].externalProgram[program] = rpm
    //             if (!container.helpers.testJson(config)){
    //                 throw new Error('Error with updatExternalPumpProgram format.  Aborting write.')
    //             }
    //         })
    //         .then(function(){
    //             return pfs.writeFileAsync(location, JSON.stringify(config, null, 4), 'utf-8')
    //         })
    //         .then(function() {
    //             container.logger.verbose('Updated pump RPM settings %s', location)
    //         })
    //         .catch(function(err) {
    //             container.logger.warn('Error updating pump RPM settings %s: ', location, err)
    //         })
    // }
    //
    // // var updatePumpProgramGPM = function(_pump, program, gpm) {
    // //     return Promise.resolve()
    // //         .then(function() {
    // //             config.equipment.pump[_pump].programGPM[program] = gpm  //TODO: this does not exist.  can we get rid of it?
    // //             return fs.writeFileAsync(location, JSON.stringify(config, null, 4), 'utf-8')
    // //         })
    // //         .then(function() {
    // //             container.logger.verbose('Updated pump GPM settings %s', location)
    // //         })
    // //         .catch(function(err) {
    // //             container.logger.warn('Error updating config GPM pump settings %s: ', location, err)
    // //         })
    // // }
    //
    //
    //
    // var updateVersionNotificationAsync = function(dismissUntilNextRemoteVersionBump, _remote) {
    //     return Promise.resolve()
    //         .then(function() {
    //             config.notifications.version.remote.dismissUntilNextRemoteVersionBump = dismissUntilNextRemoteVersionBump
    //             //var results = container.updateAvailable.getResultsAsync()
    //             if (_remote!==null) {
    //                 config.notifications.version.remote.version = _remote.version
    //                 config.notifications.version.remote.tag_name = _remote.tag_name
    //             }
    //             if (!container.helpers.testJson(config)){
    //                 throw new Error('Error with updateVersionNotificationAsync format.  Aborting write.')
    //             }
    //         })
    //         .then(function(){
    //             return pfs.writeFileAsync(location, JSON.stringify(config, null, 4), 'utf-8')
    //         })
    //         .then(function() {
    //             container.logger.verbose('Updated version notification settings %s', location)
    //             return 'I am done!'
    //         })
    //         .catch(function(err) {
    //             container.logger.warn('Error updating version notification settings %s: ', location, err)
    //         })
    // }
    //
    // var getPumpExternalProgramAsync = function(_pump) {
    //     return Promise.resolve()
    //         .then(function() {
    //             return config.equipment.pump[_pump].externalProgram
    //         })
    //         .catch(function(err) {
    //             container.logger.error('Something went wrong getting pump program from config file.', err)
    //         })
    // }
    //
    //
    // var updateChlorinatorInstalledAsync = function(installed) {
    //     return Promise.resolve()
    //         .then(function(){
    //             config.equipment.chlorinator.installed = installed
    //             container.settings.get('chlorinator').installed = installed
    //             if (!container.helpers.testJson(config)){
    //                 throw new Error('Error with updateChlorinatorInstalledAsync format.  Aborting write.')
    //             }
    //             return         pfs.writeFileAsync(location, JSON.stringify(config, null, 4), 'utf-8')
    //
    //         })
    //
    //         .then(function() {
    //             if (container.settings.get('logChlorinator'))
    //                 container.logger.verbose('Updated chlorinator settings (installed) %s', location)
    //         })
    //         .catch(function(err) {
    //             container.logger.warn('Error updating chlorinator installed %s: ', location, err)
    //         })
    // }
    //
    //
    // var updateChlorinatorDesiredOutputAsync = function(pool, spa) {
    //     return Promise.resolve()
    //         .then(function(){
    //             config.equipment.chlorinator.desiredOutput = {}
    //             config.equipment.chlorinator.desiredOutput.pool = pool
    //             config.equipment.chlorinator.desiredOutput.spa = spa
    //             container.settings.get().equipment.chlorinator.desiredOutput.pool = pool
    //             container.settings.get().equipment.chlorinator.desiredOutput.spa = spa
    //             if (!container.helpers.testJson(config)){
    //                 throw new Error('Error with updateChlorinatorDesiredOutputAsync format.  Aborting write.')
    //             }
    //
    //         })
    //         .then(function(){
    //             return pfs.writeFileAsync(location, JSON.stringify(config, null, 4), 'utf-8')
    //
    //         })
    //         .then(function () {
    //             if (container.settings.get('logChlorinator'))
    //                 container.logger.verbose('Updated chlorinator settings (desired output) %s', location)
    //         })
    //         .catch(function (err) {
    //             container.logger.warn('Error updating chlorinator settings %s: ', location, err)
    //         })
    //
    // }
    //
    // var updateChlorinatorNameAsync = function(name) {
    //
    //     config.equipment.chlorinator.id.productName = name
    //     container.settings.get('equipment').chlorinator.id.productName = name
    //
    //     if (container.helpers.testJson(config)) {
    //         return pfs.writeFileAsync(location, JSON.stringify(config, null, 4), 'utf-8')
    //             .then(function () {
    //                 container.logger.verbose('Updated chlorinator settings (name) %s', location)
    //             })
    //             .catch(function (err) {
    //                 container.logger.warn('Error updating chlorinator name %s: ', location, err)
    //             })
    //     }
    // }
    // var getChlorinatorDesiredOutput = function() {
    //
    //         return config.equipment.chlorinator.desiredOutput
    //
    //
    // }
    //
    // var getChlorinatorName = function() {
    //
    //     return config.equipment.chlorinator.id.productName
    //
    // }
    //
    // var getVersionNotification = function() {
    //
    //     container.logger.silly('updateAvail.getVersionNotification: Local config file has the following settings: %s', JSON.stringify(config.notifications.version))
    //     return config.notifications.version.remote
    // }
    //
    //
    //
    // /*istanbul ignore next */
    // if (container.logModuleLoading)
    // // container.logger.info('Loaded: config-editor.js')
    //     console.log('Loaded: config-editor.js')
    //
    //
    // return {
    //     initAsync: initAsync,
    //     updateExternalPumpProgramAsync: updateExternalPumpProgramAsync,
    //     updatePumpTypeAsync: updatePumpTypeAsync,
    //     //updatePumpProgramGPM: updatePumpProgramGPM,
    //     updateVersionNotificationAsync: updateVersionNotificationAsync,
    //     updateChlorinatorInstalledAsync: updateChlorinatorInstalledAsync,
    //     updateChlorinatorDesiredOutputAsync: updateChlorinatorDesiredOutputAsync,
    //     updateChlorinatorNameAsync: updateChlorinatorNameAsync,
    //     getPumpExternalProgramAsync: getPumpExternalProgramAsync,
    //     getVersionNotification: getVersionNotification,
    //     getChlorinatorDesiredOutput: getChlorinatorDesiredOutput,
    //     getChlorinatorName: getChlorinatorName
    // }
}
