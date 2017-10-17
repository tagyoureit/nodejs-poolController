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


var fs = require('fs'),
    path = require('path').posix,
    Promise = require('bluebird'),
    request = Promise.promisify(require("request")),
    _ = require('underscore')
    Promise.promisifyAll(fs)


var userAgent = 'tagyoureit-nodejs-poolController-app',
    jsons = {},
    gitApiHost = 'api.github.com',
    gitLatestReleaseJSONPath = 'repos/tagyoureit/nodejs-poolController/releases/latest',
    data = '',
    location = path.join(process.cwd(), '/package.json')

module.exports = function(container) {
    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: update_avail.js')

    var compareLocalToRemoteVersion = exports.compareLocalToRemoteVersion = function() {
        container.logger.silly('update_avail: versions discovered: ', jsons)
        var clientVersion = jsons.local.version,
            remoteVersion = jsons.remote.version,
            clientVerArr,
            remoteVerArr
        // container.logger.silly('update_avail: local ver: %s    latest published release ver: %s', clientVersion, remoteVersion)
        //compare the version numbers sequentially (major, minor, patch) to make sure there is a newer version and not just a different version
        //nice to have the try block here in case we can't split the result
        try {
            clientVerArr = jsons.local.version.split(".").map(function(val) {
                return Number(val);
            });
            remoteVerArr = jsons.remote.version.split(".").map(function(val) {
                return Number(val);
            });

        } catch (err) {
            container.logger.warn('update_avail: error comparing versions: ', err)
            return Promise.reject(err)
        }
        var clientVerCompare = 'equal';
        if (clientVerArr.length !== remoteVerArr.length) {
            return Promise.reject('Version length of client (' + clientVersion + ') and remote ( ' + remoteVersion + ') do not match.')
            //emit(self, 'error', 'Version length of client (' + clientVersion + ') and remote ( ' + remoteVersion + ') do not match.')
        } else {
            for (var i = 0; i < clientVerArr.length; i++) {
                if (remoteVerArr[i] > clientVerArr[i]) {
                    clientVerCompare = 'older'
                    break
                } else if (remoteVerArr[i] < clientVerArr[i]) {
                    clientVerCompare = 'newer'
                    break
                }
            }
        }

        jsons.result = clientVerCompare
        return Promise.resolve(jsons)
    }

    var compareLocalToSavedLocalVersion = function() {
        return Promise.resolve()
            .then(container.configEditor.getVersionNotification)
            .then(function(_configJsonRemote) {
                container.logger.silly('update_avail compare remote to saved: ', jsons.remote.version, _configJsonRemote.version)
                var configJsonRemote = _configJsonRemote,
                    remoteVersion = jsons.remote.version,
                    configJsonVerArr,
                    remoteVerArr
                //compare the version numbers sequentially (major, minor, patch) to make sure there is a newer version and not just a different version
                //nice to have the try block here in case we can't split the result
                if (configJsonRemote.version === '') configJsonRemote = '0.0.0'

                configJsonVerArr = configJsonRemote.version.split(".").map(function(val) {
                    return Number(val);
                });
                remoteVerArr = jsons.remote.version.split(".").map(function(val) {
                    return Number(val);
                });
                var configJsonVerCompare = 'equal';
                if (configJsonVerArr.length !== remoteVerArr.length) {
                    return Promise.reject('Version length of configJson (' + configJsonRemote + ') and remote ( ' + remoteVersion + ') do not match.')
                    //emit(self, 'error', 'Version length of configJson (' + configJsonRemote + ') and remote ( ' + remoteVersion + ') do not match.')
                } else {
                    for (var i = 0; i < configJsonVerArr.length; i++) {
                        if (remoteVerArr[i] > configJsonVerArr[i]) {
                            configJsonVerCompare = 'older'
                            break
                        } else if (remoteVerArr[i] < configJsonVerArr[i]) {

                            configJsonVerCompare = 'newer'
                            break
                        }
                    }
                }
                if (configJsonVerCompare === 'equal') {
                    container.logger.silly('update_avail: no change in remote version compared to config.json version of app')
                } else if (configJsonVerCompare === 'older') {
                    container.logger.info('Remote version of nodejs-poolController has been updated.  Resetting local updateVersionNotification in config.json.')
                    return container.configEditor.updateVersionNotification(false)
                } else if (configJsonVerCompare === 'newer') {
                    container.logger.silly('update_avail: Somehow the local version is newer than the GitHub release.  Did something get pulled?')
                }
            })
    }

    var getVersionFromJson = function(data) {
        if (!_.isObject(data)) {
            data = JSON.parse(data)
        }

        if (!data['version']) {
            container.logger.error('Could not read package.json version.  error!')
            throw Error
        }
        return data['version']
    }

    //this var outside of the scope of loadLocalVersion so it can be overwritten by test units.

    var loadLocalVersion = exports.loadLocalVersion = function() {

        container.logger.silly('update_avail: reading local version at:', location)

        return fs.readFileAsync(location, 'utf-8')
            .then(function(data) {
                jsons.local = {
                    'version': getVersionFromJson(data)
                }
            })
            .catch(function(error) {
                container.logger.warn('update_avail: Error reading local package.json: ', error)
            })

    }

    var parseLatestReleaseJson = function(data) {
        var jsonsReturn = {
            tag_name: data.tag_name,
            version: data.tag_name.replace('v', '')
        }
        return jsonsReturn
    }

    var getLatestReleaseJson = function() {

        var options = {
            method: 'GET',
            uri: 'https://' + gitApiHost + '/' + gitLatestReleaseJSONPath,
            headers: {
                'User-Agent': userAgent
            }
        }
        return request(options)
            .then(function(data) {
                data = JSON.parse(data.body);
                jsons.remote = parseLatestReleaseJson(data)
                return Promise.resolve(jsons)
            })
            .catch(function(e) {
                container.logger.error('Error parsing the incoming data: ' + e);

            })
    }



    var emitResults = function(jsons) {
        if (jsons.result === 'older') {
            jsons.resultStr = 'Update available!  Version ' + jsons.remote.version + ' can be installed.  You have ' + jsons.local.version
            container.logger.warn(jsons.resultStr)
        } else if (jsons.result === 'newer') {
            jsons.resultStr = 'You are running a newer release (' + jsons.local.version + ') than the published release (' + jsons.remote.version + ')'
            container.logger.info(jsons.resultStr)
        } else if (jsons.result === 'equal') {
            jsons.resultStr = 'Your version (' + jsons.local.version + ') is the same as the latest published release.'
            container.logger.info(jsons.resultStr)
        }
        container.io.emitToClients('updateAvailable')
    }

    var check = function() {
        if (Object.keys(jsons).length === 0) {
            return loadLocalVersion()
                .then(getLatestReleaseJson)
                .then(compareLocalToSavedLocalVersion)
                .then(compareLocalToRemoteVersion)
                .then(emitResults)
                .then(function() {
                        container.logger.silly('update_avail: finished successfully')
                        return jsons
                    },
                    function(err) {
                        container.logger.error('Error getting version information for local or remote systems.', err)
                    })
        } else {
            return emitResults(jsons)
        }
    }

    var getResults = function() {
        if (Object.keys(jsons).length === 0) {
            return check().then(function(res) {
                return res
            })
        } else {
            return jsons
        }
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: update-avail.js')

    return {
        check: check,
        getResults: getResults
    }
}
