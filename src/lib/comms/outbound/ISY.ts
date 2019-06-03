//  nodejs-poolController.  An application to control pool equipment.
//  Copyright (C) 2016, 2017, 2018, 2019.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU Affero General Public License as
//  published by the Free Software Foundation, either version 3 of the
//  License, or (at your option) any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU Affero General Public License for more details.
//
//  You should have received a copy of the GNU Affero General Public License
//  along with this program.  If not, see <http://www.gnu.org/licenses/>.

import { settings, logger, pump, chlorinator } from'../../../etc/internal';
import request =require('request')

var ISYConfig = settings.get( 'ISYConfig' )
let ISYTimer: NodeJS.Timeout;

    function send(connectionString: any, logger: any) {
        request(connectionString, function(error: any, response: any, body: any) {
            if (error) {
                logger.error('ISY: Error writing ISY Request: %s  (value: %s)', error, connectionString)
            } else {
                logger.verbose('ISY: Response from ISY: %s %s', response, body)
            }
        })
    }

    export function emit(outputType: string) {
        //logger.verbose('Sending ISY Rest API Calls')
        var currentPumpStatus = pump.getCurrentPumpStatus()
        var currentChlorinatorStatus = chlorinator.getChlorinatorStatus()
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