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

import { settings, logger } from'../../etc/internal';

    /*istanbul ignore next */
    // if (logModuleLoading)
    //     logger.info('Loading: influx-connector.js')

    var Influx = require('influx')
    var conn = {
        host: settings.get('influxHost'),
        port: settings.get('influxPort'),
        database: settings.get( 'influxDB' )
    }
    

    var influx = new Influx.InfluxDB(conn)

    export function writeChlorinator (data: Chlorinator.IChlorinator) {
        if (settings.get('influxEnabled')) {
            if (!data.name.includes('notset') ) {
                influx.writePoints([{
                    measurement: 'chlorinator',
                    tags: {
                        'superChlorinate': data.superChlorinate,
                        'status': data.status,
                        'name': data.name
                    },
                    fields: {
                        'saltPPM': data.saltPPM,
                        'currentOutput': data.currentOutput,
                        'outputPoolPercent': data.outputPoolPercent,
                        'outputSpaPercent': data.outputSpaPercent,
                    }
                }])
                    .then(function () {
                        // return influx.query('select count(*) from chlorinator')
                    })
                    .then(function (res: any) {
                        // logger.info('Wrote %s to influx chlorinator measurement', JSON.stringify(res))
                    })
                    .catch(function (err: { message: any; }) {
                        logger.error('Something bad happened writing to InfluxDB (chlorinator): ', err.message)
                    })
            }
        }
    }

    //write individual circuit data
    export function writeCircuit (data: Circuit.ICurrentCircuits ) {
        if (settings.get('influxEnabled')) {
            var data_array = []
            if (data[1].number !== undefined) {
                // push the object into an array so we can batch send
                // which is more efficient for Influx
                for (var key in data) {
                    data_array.push({
                        measurement: 'circuit',
                        tags: {
                            'number': data[key].number,
                            'numberStr': data[key].numberStr,
                            'name': data[key].name,
                            'circuitFunction': data[key].circuitFunction,
                            //'lightgroup': data[key].light.group,
                            'friendlyName': data[key].friendlyName,
                            //'colorStr': data[key].light.colorStr,
                            'freeze': data[key].freeze
                        },
                        fields: {
                            'status': data[key].status
                        }
                    })

                }
                influx.writePoints(data_array)
                    .then(function () {
                        // return influx.query('select count(*) from circuits')
                    })
                    .then(function (res: any) {
                        // logger.info('Wrote %s to influx circuits measurement', JSON.stringify(res))
                    })
                    .catch(function (err: { message: any; }) {
                        logger.error('Something bad happened writing to InfluxDB (circuit): ', err.message)
                    })
            }
        }

    }

    //write individual pump data
    export function writePumpData(data: Pump.PumpStatus) {
        if (settings.get('influxEnabled')) {
            var data_array = []
            for (var key in data) {
                if (typeof(data[key].rpm) === 'number' && typeof(data[key].power)==='number' && typeof(data[key].power) === 'number' ) {
                    data_array.push({
                        measurement: 'pump',
                        tags: {
                            'source': 'nodejs-poolcontroller',
                            'pump': data[key].pump,
                            'type': data[key].type,
                            'name': data[key].name,
                            'friendlyName': data[key].friendlyName
                        },
                        fields: {
                            'watts': data[key].watts,
                            'rpm': data[key].rpm,
                            'gpm': data[key].gpm,
                            'run': data[key].run,
                            'mode': data[key].mode,
                            'remotecontrol': data[key].remotecontrol,
                            'power': data[key].power
                        }
                    })
                }
            }
            influx.writePoints(data_array)
                .then(function () {
                    // return influx.query('select count(*) from pumps')
                })
                .then(function (res: any) {
                    // logger.info('Wrote %s to influx pumps measurement', res)
                })
                .catch(function (err: { message: any; }) {
                    logger.error('Something bad happened writing to InfluxDB (pump): ', err.message)
                })
        }
    }

    function poolOrSpaIsOn (circuit: Circuit.ICurrentCircuits)
    {
        // loop through the circuits
        for ( var circuitNum in circuit )
        {
            if ( circuit[ circuitNum ].name === "POOL" || circuit[ circuitNum ].name === 'SPA' )
            {
                if ( circuit[circuitNum].status )
                {
                    return true
                }
            }
        }
        return false
    }

    export function writeTemperatureData(data: { poolTemp: any; spaTemp: any; airTemp: any; solarTemp: any; freeze: any; spaLastKnownTemperature?: any; poolLastKnownTemperature?: any; poolHeatMode?: any; poolSetPoint?: any; spaSetPoint?: any; poolHeatModeStr?: any; spaHeatMode?: any; spaHeatModeStr?: any; }) {
        if (settings.get('influxEnabled')) {
            // sanity check to only send with real data
            if (typeof(data.poolHeatMode) === 'number') {
                var temp_fields
                // if pump is off
                if (!poolOrSpaIsOn(data)) {
					temp_fields = {
                        'poolSetPoint': data.poolSetPoint,
                        'spaSetPoint': data.spaSetPoint,
                        'airTemp': data.airTemp
                    }
                }
                // if pump is on
                else {
                    temp_fields = {
                        'poolSetPoint': data.poolSetPoint,
                        'spaSetPoint': data.spaSetPoint,
                        'poolTemp': data.poolTemp,
                        'spaTemp': data.spaTemp,
                        'airTemp': data.airTemp,
                        'solarTemp': data.solarTemp,
                        'poolHeatMode': data.poolHeatMode,
                        'poolHeatModeStr': data.poolHeatModeStr,
                        'spaHeatMode': data.spaHeatMode,
                        'spaHeatModeStr': data.spaHeatModeStr,
                        'freeze': data.freeze
                    }
                }

                influx.writePoints([{
                    'measurement': 'temperature',
                    'tags': {
                        'source': 'nodejs-poolcontroller'
                    },
                    'fields': temp_fields
                }])
                    .then(function () {
                        // return influx.query('select count(*) from temperatures')
                    })
                    .then(function (r: any) {
                        // logger.info('Wrote %s to influx temperatures measurement', r)
                    })
                    .catch(function (e: { message: any; }) {
                        logger.error('Something bad happened writing to InfluxDB (temperatures): ', e.message)
                    })
            }
        }

    }




    export function init () {

    }

    /*istanbul ignore next */
    // if (logModuleLoading)
    //     logger.info('Loaded: influx-connector.js')
