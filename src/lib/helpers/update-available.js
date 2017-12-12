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





module.exports = function(container) {
    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: update_avail.js')

    var userAgent = 'tagyoureit-nodejs-poolController-app',
        jsons = {},
        gitApiHost = 'api.github.com',
        gitLatestReleaseJSONPath = 'repos/tagyoureit/nodejs-poolController/releases/latest'



    var //fs = require('fs'),
        //path = require('path').posix,
        //Promise = require('bluebird'),
        Promise = container.promise
    Promise.promisifyAll(container.fs)
    request = Promise.promisify(require("request"))
    //_ = require('underscore')
    // Promise.promisifyAll(fs)


    // = exports.compareLocalToRemoteVersion
    var compareLocalToRemoteVersion  = function() {
        return new Promise(function(resolve, reject){
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
                /*istanbul ignore next */
                container.logger.warn('update_avail: error comparing versions: ', err)
                /*istanbul ignore next */
                reject(new Error(err))
            }
            var clientVerCompare = 'equal';
            if (clientVerArr.length !== remoteVerArr.length) {
                /*istanbul ignore next */
                // this is in case local a.b.c doesn't have same # of elements as another version a.b.c.d.  We should never get here.
                return Promise.reject('Version length of client (' + clientVersion + ') and remote ( ' + remoteVersion + ') do not match.')
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
            resolve(jsons)
        })

    }

    var compareLocalToSavedLocalVersion = function() {
        return new Promise(function(resolve, reject){
            Promise.resolve()
                .then(function(){
                    return container.configEditor.getVersionNotification()
                })
                .then(function(_cachedJsonRemote) {

                    container.logger.silly('updateAvail.compareLocaltoSavedLocal: (current) published release (%s) to cached/last published config.json version (%s)', jsons.remote.version, _cachedJsonRemote.version)
                    var configJsonRemote = _cachedJsonRemote,
                        remoteVersion = jsons.remote.version,
                        configJsonVerArr,
                        remoteVerArr
                    //compare the version numbers sequentially (major, minor, patch) to make sure there is a newer version and not just a different version
                    //nice to have the try block here in case we can't split the result
                    console.log('MAATCH??', configJsonRemote.version, configJsonRemote.version==='')
                    if (configJsonRemote.version === '') configJsonRemote.version = '0.0.0'

                    configJsonVerArr = configJsonRemote.version.split(".").map(function(val) {
                        return Number(val);
                    });
                    remoteVerArr = jsons.remote.version.split(".").map(function(val) {
                        return Number(val);
                    });
                    var configJsonVerCompare = 'equal';
                    if (configJsonVerArr.length !== remoteVerArr.length) {
                        /*istanbul ignore next */
                        reject(new Error('Version length of configJson (' + configJsonRemote + ') and remote ( ' + remoteVersion + ') do not match.'))
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
                        container.logger.silly('update_avail: no change in current remote version compared to local cached config.json version of app')
                    } else if (configJsonVerCompare === 'older') {
                        container.logger.info('Remote version of nodejs-poolController has been updated to %s.  Resetting local updateVersionNotification in config.json.', jsons.remote.version)
                        return container.configEditor.updateVersionNotification(false, jsons.remote)
                    } else if (configJsonVerCompare === 'newer') {
                        container.logger.silly('update_avail: The local version is newer than the GitHub release.  Probably running a dev build.')
                    }
                }).then(resolve)
        })

    }

    var getVersionFromJson = function(data) {
        if (!container._.isObject(data)) {
            data = JSON.parse(data)
        }
        /*istanbul ignore next */
        if (!data['version']) {
            container.logger.error('Could not read package.json version.  error!')
            throw Error('Could not read package.json version.  error!')
        }
        return data['version']
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
                container.logger.silly('updateAvailable.getLatestRelease from Github (latest published release)...', JSON.parse(data.body).tag_name)
                data = JSON.parse(data.body);
                jsons.remote = {
                    tag_name: data.tag_name,
                    version: data.tag_name.replace('v', '')
                }
                return jsons
            })

            .catch( /*istanbul ignore next */ function(e) {

                container.logger.error('Error contacting Github for latest published release: ' + e);
                return Promise.reject(e)
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
        // if (Object.keys(jsons).length === 0) {
        return getLatestReleaseJson()
            .then(compareLocalToSavedLocalVersion)
            .then(compareLocalToRemoteVersion)
            .then(emitResults)
            .then(function() {
                container.logger.silly('update_avail: finished successfully')
                return jsons
            })
            .catch( /*istanbul ignore next */ function(err) {
                container.logger.error('Error getting version information for local or remote systems.', err)
                console.log(err)
            })
        // } else {
        //     return emitResults(jsons)
        // }
    }

    var getResults = function() {
        if (Object.keys(jsons).length === 0) {
            init()
                .then(function(res) {
                    return res
                })
        } else {
            return jsons
        }
    }
    var init = function(_location){
        jsons = {}
        location = ''
        if (_location===undefined)
            location = container.path.join(process.cwd(), '/package.json')
        else
            location = container.path.join(process.cwd(), _location)

        container.logger.silly('update_avail: reading local version at:', location)

        return container.fs.readFileAsync(location, 'utf-8')
            .then(function(data) {
                jsons.local = {
                    'version': getVersionFromJson(data)
                }
            })
            .then(check)
            .catch( /*istanbul ignore next */ function(error) {
                container.logger.warn('update_avail: Error reading local package.json: ', error)
            })

    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: update-avail.js')

    return {
        check: check,
        getResults: getResults,
        init: init
    }
}
