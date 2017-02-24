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


var fs = require('promised-io/fs'),

    path = require('path').posix,

    request = require('request')

var _ = require('underscore')
var promised = require("promised-io/promise");
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

    var compareVersions = exports.compareVersions = function() {
        var Deferred = require("promised-io/promise").Deferred;
        var deferred = new Deferred()
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
            return deferred.reject(err)
        }
        //console.log('array of client vars:', clientVerArr)
        var clientVerCompare = 'equal';
        if (clientVerArr.length !== remoteVerArr.length) {
            return deferred.rejected('Version length of client (' + clientVersion + ') and remote ( ' + remoteVersion + ') do not match.')
            //emit(self, 'error', 'Version length of client (' + clientVersion + ') and remote ( ' + remoteVersion + ') do not match.')
        } else {
            for (var i = 0; i < clientVerArr.length; i++) {
                //console.log('client ver: %s    rem ver: %s', clientVerArr[i], remoteVerArr[i])
                if (remoteVerArr[i] > clientVerArr[i]) {
                    clientVerCompare = 'older'
                    break
                } else if (remoteVerArr[i] < clientVerArr[i]) {
                    clientVerCompare = 'newer'
                    break
                }
            }
        }

        // console.log('client version is: ', clientVerCompare)
        jsons.result = clientVerCompare
        deferred.resolve(jsons)
        return deferred

    }

    var getVersionFromJson = function(data) {
        //console.log('latest JSON:', data)
        if (!_.isObject(data)) {
            data = JSON.parse(data)
        }

        if (!data['version']) {
            console.log('Could not read package.json version.  error!')
            throw Error
        }
        return data['version']
    }

    //this var outside of the scope of loadLocalVersion so it can be overwritten by test units.

    var loadLocalVersion = exports.loadLocalVersion = function() {
        var Deferred = require("promised-io/promise").Deferred;
        var deferred = new Deferred();
        container.logger.silly('update_avail: reading local version at:', location)

        fs.readFile(location, 'utf-8').then(function(data) {

            jsons.local = {
                'version': getVersionFromJson(data)
            }
            return deferred.resolve(jsons.local)
        }, function(error) {
            container.logger.warn('update_avail: Error reading local package.json: ', error)
            return deferred.reject(error)
        })

        return deferred

    }

    var parseLatestReleaseJson = function(data) {
        //console.log('jsons.remote (before): ', jsons.remote)
        var jsonsReturn = {
            tag_name: data.tag_name,
            // tarball_url: data.tarball_url,
            // zipball_url: data.zipball_url,
            version: data.tag_name.replace('v', '')
        }
        //console.log('jsonsReturn: ', jsonsReturn)
        return jsonsReturn
    }

    var getLatestReleaseJson = function() {
        var Deferred = require("promised-io/promise").Deferred;
        var deferred = new Deferred(function(cancel) {
            console.log('The action was cancelled because ', cancel)
        })

        var options = {
            method: 'GET',
            uri: 'https://' + gitApiHost + '/' + gitLatestReleaseJSONPath,
            headers: {
                'User-Agent': userAgent
            }

        }
        //console.log('fetching remote JSON for latest version', options)
        request(options, function(error, res, body) {
            //console.log('remoteDownloader: ', opc)
            /*if (error) {
                console.log('error %s', error)
                    //deferred.reject(error)
                return
            }*/
            if (res.statusCode === 403) {
                console.log('error with status code: %s', res.statusCode)
                console.log('body: ', body)
                //throw Error(res.statusCode)
                deferred.reject(res.statusCode)
                //deferred.cancel(res.statusCode)
                return
            }

            try {
                data = JSON.parse(body);
                //console.log('latest release JSON: ', data)
                jsons.remote = parseLatestReleaseJson(data)
                deferred.resolve(data);
                return
            } catch (e) {
                //throw Error('Error reading the dowloaded JSON. ', e);
                deferred.reject('Error parsing the incoming data: ' + e);
                return
            }
        })

        return deferred;
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
                .then(compareVersions)
                .then(emitResults)
                .then(function() {
                        container.logger.silly('update_avail: finished successfully')
                        return jsons
                    },
                    function(err) {
                        container.logger.error('Error getting version information for local or remote systems.', err)
                    })
        } else {
            console.log(jsons)
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
        container.logger.info('Loaded: 8.js')

    return {
        check: check,
        getResults: getResults
    }
}
