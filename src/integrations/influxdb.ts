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

import * as Influx from 'influx';
import * as io from 'socket.io-client';
import { settings, logger } from '../etc/internal';
// import * as pfs from 'promised-io/fs';
import rp = require('request-promise');

var influx = new Influx.InfluxDB( {
  host: 'localhost',
  database: 'pool'
} )

//var influxdbTimer = new nanotimer
var url = 'localhost:' + settings.get( 'httpExpressPort' ) + '/'
var socket = io.connect( url, {
  secure: false,
  reconnection: true,
  rejectUnauthorized: false
} );


//var configFile = JSON.parse(pfs.readFileSync(settings.configurationFile));
let configFile = settings.getConfig()

// var enabled = configFile.Integrations.socketinfluxdb
// var influxdbConfig = configFile.socketinfluxdb
// var influxdbVars = configFile.socketinfluxdb.Variables



function process ( tag: string, value: string )
{


  logger.verbose( 'influxdb Socket: Sending %s (value: %s) ', tag, value )

  var options = {
    method: 'POST',
    uri: 'http://localhost:8086/write?db=pool',
    encoding: 'binary',
    body: 'address,' + tag + ' value=' + value

  }
  rp( options )
    .then(
      function ( res: any )
      {
        console.log( 'INFLUX***:  ', res )
      } ).catch( function ( error: any )
      {

        console.log( 'INFLUX___: ', error )
      } );

}

function recurse_json ( data: { [ x: string ]: any; }, path: string )
{
  console.log( '\nanalyzing %s ', JSON.stringify( data ) )
  for ( var value in data )
  {
    //console.log('typeof data[value]: ', typeof data[value])
    if ( typeof data[ value ] === "object" )
    {
      //console.log('%s is an OBJECT,recursing...', JSON.stringify(data[value]))
      //console.log('data.hasOwnProperty(value): ', data.hasOwnProperty(value))
      recurse_json( data[ value ], path + value + '_' )
    } else
    {
      console.log( 'path: %s%s   value: %s', path, value, data[ value ] )
    }
  }
}

socket.on( 'chlorinator', function ( data: { name: string ; status: string; superChlorinate: any; currentOutput: any; outputPoolPercent: any; outputSpaPercent: any; saltPPM: any; } )
{
  //recurse_json(data, 'chlorinator_')
  if ( !data.name.includes('notset') )
  {
    influx.writePoints( [ {
      measurement: 'chlorinator',
      tags: {
        'source': "nodejs_poolController",
        'status': data.status,
        'name': data.name
      },
      fields: {
        'superChlorinate': data.superChlorinate,

        'currentOutput': data.currentOutput,
        'outputPoolPercent': data.outputPoolPercent,
        'outputSpaPercent': data.outputSpaPercent,
      }
    } ] )

    influx.writePoints( [ {
      measurement: 'chemistry',
      tags: {
        'source': "nodejs_poolController",
        'status': data.status,
        'name': data.name
      },
      fields: {
        'saltPPM': data.saltPPM
      }
    } ] )

      .then( function ()
      {
        return influx.query( 'select count(*) from chlorinator' )
      } )
      .then( function ( res )
      {
        logger.info( 'Wrote %s to influx chlorinator measurement', JSON.stringify( res ) )
      } )
      .catch( function ( err )
      {
        logger.error( 'Something bad happened writting to InfluxDB (chlorinator): ', err )
      } )
  }

} )

//write individual circuit data
function writeCircuitData ( data: { number: string; numberStr: string; name: string; circuitFunction: string; light: { group: string; colorStr: string; }; friendlyName: string; status: any; freeze: any; } )
{
  influx.writePoints( [ {
    measurement: 'circuits',
    tags: {
      'number': data.number,
      'numberStr': data.numberStr,
      'name': data.name,
      'circuitFunction': data.circuitFunction,
      'lightgroup': data.light.group,
      'friendlyName': data.friendlyName,
      'colorStr': data.light.colorStr
    },
    fields: {
      'status': data.status,
      'freeze': data.freeze
    }
  } ] )
    .then( function ()
    {
      return influx.query( 'select count(*) from pumps' )
    } )
    .then( function ( res )
    {
      logger.info( 'Wrote %s to influx pumps measurement', JSON.stringify( res ) )
    } )
    .catch( function ( err )
    {
      logger.error( 'Something bad happened writing to InfluxDB (pump): ', err )
    } )
}

socket.on( 'circuit', function ( data: { [ x: string ]: any; } )
{
  //recurse_json(data, 'circuit_')
  Object.keys( data ).forEach( function ( key )
  {
    console.log( 'processing circuit: %s %s', key, data[ key ] )
    if ( data[ key ].name !== "NOT USED" )
    {
      console.log( 'writing circuit %s', data[ key ] )
      writeCircuitData( data[ key ] )
    }
  } )
} )

//write individual pump data
function writePumpData ( data: { pump: string; type: string; run: string; mode: string; power: string; watts: any; rpm: any; gpm: any; } )
{
  influx.writePoints( [ {
    measurement: 'pumps',
    tags: {
      'pump': data.pump,
      'type': data.type,
      'run': data.run,
      'mode': data.mode,
      'power': data.power
    },
    fields: {
      'watts': data.watts,
      'rpm': data.rpm,
      'gpm': data.gpm
    }
  } ] )
    .then( function ()
    {
      return influx.query( 'select count(*) from pumps' )
    } )
    .then( function ( res )
    {
      logger.info( 'Wrote %s to influx pumps measurement', JSON.stringify( res ) )
    } )
    .catch( function ( err )
    {
      logger.error( 'Something bad happened writing to InfluxDB (pump): ', err )
    } )
}

socket.on( 'pump', function ( data: any[] )
{
  //recurse_json(data, 'pump_')
  if ( data[ 1 ].rpm !== 'rpmnotset' )
  {
    console.log( 'data[1].rpm=', data[ 1 ].rpm )
    writePumpData( data[ 1 ] )
  }
  if ( data[ 2 ].type.toLowerCase() !== 'none' )
  {
    if ( data[ 2 ].rpm !== 'rpmnotset' )
      writePumpData( data[ 2 ] )
  }

} )

socket.on( 'temperatures', function ( data: { poolSetPoint: number; poolHeatMode: string; poolHeatModeStr: string; spaHeatMode: string; spaHeadModeStr: string; freeze: string; spaSetPoint: any; poolTemp: any; spaTemp: any; airTemp: any; solarTemp: any; } )
{

  if ( data.poolSetPoint !== -1 )
    influx.writePoints( [ {
      measurement: 'temperatures',
      tags: {
        'poolHeatMode': data.poolHeatMode,
        'poolHeatModeStr': data.poolHeatModeStr,
        'spaHeatMode': data.spaHeatMode,
        'spaHeadModeStr': data.spaHeadModeStr,
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
    } ] )
      .then( function ()
      {
        return influx.query( 'select count(*) from temperatures' )
      } )
      .then( function ( res )
      {
        logger.info( 'Wrote %s to influx temperatures measurement', JSON.stringify( res ) )
      } )
      .catch( function ( err )
      {
        logger.error( 'Something bad happened writing to InfluxDB (temperatures): ', err )
      } )

} )

socket.on( 'pump', function ( data: any )
{
  //recurse_json(data, 'pump_')
} )

var jsontest = {
  "1": {
    "pump": 1,
    "name": "namenotset",
    "type": "VS",
    "time": "timenotset",
    "run": "runnotset",
    "mode": "modenotset",
    "drivestate": "drivestatenotset",
    "watts": "wattsnotset",
    "rpm": "rpmnotset",
    "gpm": "gpmnotset",
    "ppc": "ppcnotset",
    "err": "errnotset",
    "timer": "timernotset",
    "duration": "durationnotset",
    "currentrunning": {
      "mode": "off",
      "value": 0,
      "remainingduration": -1
    },
    "externalProgram": {
      "1": 1000,
      "2": -1,
      "3": -1,
      "4": -1
    },
    "remotecontrol": "remotecontrolnotset",
    "power": "powernotset"
  },
  "2": {
    "pump": 2,
    "name": "namenotset",
    "type": "none",
    "time": "timenotset",
    "run": "runnotset",
    "mode": "modenotset",
    "drivestate": "drivestatenotset",
    "watts": "wattsnotset",
    "rpm": "rpmnotset",
    "gpm": "gpmnotset",
    "ppc": "ppcnotset",
    "err": "errnotset",
    "timer": "timernotset",
    "duration": "durationnotset",
    "currentrunning": {
      "mode": "off",
      "value": 0,
      "remainingduration": -1
    },
    "externalProgram": {
      "1": -1,
      "2": -1,
      "3": -1,
      "4": -1
    },
    "remotecontrol": "remotecontrolnotset",
    "power": "powernotset"
  }
}
// data[pump]: {"pump":2,"name":"namenotset","type":"none","time":"timenotset","run":"runnotset","mode":"modenotset","drivestate":"drivestatenotset","watts":"wattsnotset","rpm":"rpmnotset","gpm":"gpmnotset","ppc":"ppcnotset","err":"errnotset","timer":"timernotset","duration":"durationnotset","currentrunning":{"mode":"off","value":0,"remainingduration":-1},"externalProgram":{"1":-1,"2":-1,"3":-1,"4":-1},"remotecontrol":"remotecontrolnotset","power":"powernotset"}
//

function init ()
{
  logger.verbose( 'Socket influxdb Loaded' )
  //recurse_json(jsontest, 'mytest'+'_')
}
