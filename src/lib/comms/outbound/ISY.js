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

//var NanoTimer = require('nanotimer');
//var ISYTimer = new NanoTimer();

module.exports = function(container) {

    var logger = container.logger
    var ISYConfig = container.settings.get('ISYConfig')
    var ISYTimer //= new container.nanotimer

    //var ISYConfig; //object to hold ISY variables.
    //TODO: We don't need to assign this anymore.  Can use the bottle... to access it directly.
    //ISYConfig = JSON.parse(JSON.stringify(s.ISYConfig))

    /*istanbul ignore next */
    if (container.logModuleLoading)
        logger.info('Loading: ISY.js')



    function send(connectionString, logger) {
        //var request = require('request')
        var request = container.request

        request(connectionString, function(error, response, body) {
            if (error) {
                logger.error('ISY: Error writing ISY Request: %s  (value: %s)', error, connectionString)
            } else {
                logger.verbose('ISY: Response from ISY: %s %s', response, body)
            }
        })
    }

    function emit(outputType) {
        //logger.verbose('Sending ISY Rest API Calls')
        var currentPumpStatus = container.pump.getCurrentPumpStatus()
        var currentChlorinatorStatus = container.chlorinator.getChlorinatorStatus()
        var basePath = '/rest/vars/set/2/'

        var options = {
            hostname: ISYConfig.ipaddr,
            port: ISYConfig.port,
            auth: ISYConfig.username + ':' + ISYConfig.password
        }
        var connectionString
        var logconnectionString

        var delayCounter = 0;

        for (var ISYVar in ISYConfig.Variables) {
            if (ISYVar.toLowerCase().indexOf(outputType.toLowerCase()) !== -1 || outputType === 'all') {
                var value = eval(ISYVar)
                connectionString = 'http://' + options.auth + '@' + options.hostname + ':' + options.port + basePath + ISYConfig.Variables[ISYVar] + '/' + value;
                logconnectionString = 'http://' + 'user:pwd' + '@' + options.hostname + ':' + options.port + basePath + ISYConfig.Variables[ISYVar] + '/' + value;
                //options.uri = basePath + ISYConfig.Variables[ISYVar] + '/' + value;
                if (value.toString().toLowerCase().indexOf('notset') === -1) {

                    logger.verbose('ISYC: Sending %s (value: %s) to ISY with URL (%s)', ISYVar, eval(ISYVar), logconnectionString)
                    ISYTimer = setTimeout(send, delayCounter, connectionString, logger); //500ms delay between http requests to ISY
                    delayCounter += 500
                } else {
                    logger.debug('ISYC: Will not send %s to ISY because the value is %s', ISYVar, value)
                }
            }
        }
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        logger.info('Loaded: ISY.js')


    return {
        emit: emit
    }

}
