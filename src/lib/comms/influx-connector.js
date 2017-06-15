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
    container.logger.info('Loading: influx-connector.js')

  var Influx = require('influx')
  var conn = {
    host: container.settings.influxHost,
    port: container.settings.influxPort,
    database: container.settings.influxDB
  }

  console.log("CONNECTION: ", conn)
  var influx = new Influx.InfluxDB(conn)

  var writeChlorinator = function(data) {
    if (container.settings.influxEnabled) {
      if (data.name !== -'-1') {
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
          .then(function() {
            // return influx.query('select count(*) from chlorinator')
          })
          .then(function(res) {
            // container.logger.info('Wrote %s to influx chlorinator measurement', JSON.stringify(res))
          })
          .catch(function(err) {
            container.logger.error('Something bad happened writing to InfluxDB (chlorinator): ', err)
          })
      }
    }
  }

  //write individual circuit data
  var writeCircuit = function(data) {
    if (container.settings.influxEnabled) {
      var data_array = []


      // push the object into an array so we can batch send
      // which is more efficient for Influx
      for (var key in data) {
        data_array.push({
          measurement: 'circuits',
          tags: {
            'number': data[key].number,
            'numberStr': data[key].numberStr,
            'name': data[key].name,
            'circuitFunction': data[key].circuitFunction,
            'lightgroup': data[key].light.group,
            'friendlyName': data[key].friendlyName,
            'colorStr': data[key].light.colorStr,
            'freeze': data[key].freeze
          },
          fields: {
            'status': data[key].status
          }
        })

      }

      influx.writePoints(data_array)
        .then(function() {
          // return influx.query('select count(*) from circuits')
        })
        .then(function(res) {
          // container.logger.info('Wrote %s to influx circuits measurement', JSON.stringify(res))
        })
        .catch(function(err) {
          container.logger.error('Something bad happened writing to InfluxDB (circuit): ', err)
        })
    }

  }

  //write individual pump data
  function writePumpData(data) {
    if (container.settings.influxEnabled) {
      var data_array = []
      for (var key in data) {
        if (typeof(data[key].rpm)==='number') {
          data_array.push({
            measurement: 'pumps',
            tags: {
              'pump': data[key].pump,
              'type': data[key].type,
              'run': data[key].run,
              'mode': data[key].mode,
              'remotecontrol': data[key].remotecontrol,
              'power': data[key].power
            },
            fields: {
              'watts': data[key].watts,
              'rpm': data[key].rpm,
              'gpm': data[key].gpm
            }
          })
        }
      }
      influx.writePoints(data_array)
        .then(function() {
          // return influx.query('select count(*) from pumps')
        })
        .then(function(res) {
          // container.logger.info('Wrote %s to influx pumps measurement', JSON.stringify(res))
        })
        .catch(function(err) {
          container.logger.error('Something bad happened writing to InfluxDB (pump): ', err)
        })
    }
  }



  function writeTemperatureData(data) {
    influx.writePoints([{
        measurement: 'temperatures',
        tags: {
          'poolHeatMode': data.poolHeatMode,
          'poolHeatModeStr': data.poolHeatModeStr,
          'spaHeatMode': data.spaHeatMode,
          'spaHeatModeStr': data.spaHeatModeStr,
          'freeze': data.freeze
        },
        fields: {
          'poolSetPoint': data.poolSetPoint,
          'spaSetPoint': data.spaSetPoint,
          'poolTemp': data.poolTemp,
          'spaTemp': data.spaTemp,
          'airTemp': data.airTemp,
          'solarTemp': data.solarTemp
        }
      }])
      .then(function() {
        // return influx.query('select count(*) from temperatures')
      })
      .then(function(res) {
        // container.logger.info('Wrote %s to influx temperatures measurement', JSON.stringify(res))
      })
      .catch(function(err) {
        container.logger.error('Something bad happened writing to InfluxDB (temperatures): ', err)
      })

  }

  var init = function() {

  }

  /*istanbul ignore next */
  if (container.logModuleLoading)
    container.logger.info('Loaded: influx-connector.js')


  return {
    init: init,
    writeChlorinator: writeChlorinator,
    writeCircuit: writeCircuit,
    writePumpData: writePumpData,
    writeTemperatureData: writeTemperatureData
  }
}
