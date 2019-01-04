

# nodejs-poolController - Version 5.3.0



[![Join the chat at https://gitter.im/nodejs-poolController/Lobby](https://badges.gitter.im/nodejs-poolController/Lobby.svg)](https://gitter.im/nodejs-poolController/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge) [![Build Status](https://travis-ci.org/tagyoureit/nodejs-poolController.svg?branch=master)](https://travis-ci.org/tagyoureit/nodejs-poolController) [![Coverage Status](https://coveralls.io/repos/github/tagyoureit/nodejs-poolController/badge.svg?branch=master)](https://coveralls.io/github/tagyoureit/nodejs-poolController?branch=master) [![Known Vulnerabilities](https://snyk.io/test/github/tagyoureit/nodejs-poolcontroller/badge.svg)](https://snyk.io/test/github/tagyoureit/nodejs-poolcontroller)

[Full Changelog](#module_nodejs-poolController--changelog)


### 5.3.0
1. Fix for #106
1. Fix for "Error 60" messages
1. Improved caching of files on browsers.  Thanks @arrmo!  Now files will be loaded once in the browser and kept in cache instead of reloaded each time.
1. Improved handling of sessions and graceful closing of the HTTP(s) servers.



# License

nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.


## What is nodejs-poolController

nodejs-poolController is an application to communicate and control your Pentair compatible pool equipment.

 Want to include a low cost controller for your pool?
 Want a web interface for your system?
 Want to turn your pumps on remotely?
 Want to have your home automation system talk to your pool?
 Want to control your pumps or chlorinator without a pool controller?

 Controllers:  Intellitouch, EasyTouch, Intermatic, SunTouch, IntellicomII
 Pumps: Intelliflow, older models
 Chlorinator: Intellichlor, Aqua-Rite and OEM brands
 Home Automation:  ISY.  (Soon to include Siri, Echo, more?)

<img src="https://raw.githubusercontent.com/tagyoureit/tagyoureit.github.io/master/images/bootstrap.png?raw=true" height="300">

***

## Plug-ins / Extensions / Contributions
Extend nodejs-Poolcontroller with these additional integration points
* [outputSocketToConsoleExample](src/integrations/outputSocketToConsoleExample.js) A sample included with the code to demonstrate correct usage.
* [Homebridge/Siri](https://github.com/leftyfl1p/homebridge-poolcontroller) by @leftyfl1p
* [SmartThings](https://github.com/bsileo/SmartThings_Pentair) by @bsileo, @johnny2678, @donkarnag, @arrmo
* [Another SmartThings Controller](https://github.com/dhop90/pentair-pool-controller/blob/master/README.md) by @dhop90
* [ISY](src/integrations/socketISY.js) included with this app.  Original credit to @blueman2, enhancements by @mayermd
* [ISY Polyglot NodeServer](https://github.com/brianmtreese/nodejs-pool-controller-polyglotv2) created by @brianmtreese

***

<a name="module_nodejs-poolController--install"></a>

## Installation Instructions

**This code requires a physical [RS485](#module_nodejs-poolController--RS485) adapter to work.**


If you don't know anything about NodeJS, these directions might be helpful.

1. Install Nodejs. (https://nodejs.org/en/download/)
1. Update NPM (https://docs.npmjs.com/getting-started/installing-node).
1. Download the latest [code release](https://github.com/tagyoureit/nodejs-poolController/releases)
   OR
   clone with `git clone git@github.com:tagyoureit/nodejs-poolController.git`
1. Unzip into nodejs-poolController.
1. Run 'npm install' in the new folder (where package.json exists).  This will automatically install all the dependencies (serial-port, express, sockets.io, etc).
1. Run the app by calling 'npm start'* (again, in the root directory). It should now run properly.
   * to run with a specific configuration, run `node index.js arg` where arg is the name of your current config file. eg `npm start configCustomized.json`.  By default, the app will load `config.json`.

***

## Upgrade instructions

Universal notes

1. For precaution, make a backup copy of your `config.json` or customized configuration file.  New in the 5.0.0 release is that the app will automatically upgrade this file.


Git clone method - Harder way, but you can create PR's and help with development
1. `git clone git@github.com:tagyoureit/nodejs-poolController.git` (clone the repo if you are starting fresh)
~~1. `git checkout 5.0.0` (switch to 5.0.0 branch - Development branch only)~~  Will update when there is a new Dev branch.
1. `git pull` (anytime you want to grab the latest code)
1. `npm update` (update dependencies)

Download method - Easier way
1.  Download the latest release from the release page or branch page big `Clone or download v` button
1.  Unzip and overwrite your existing directory*.  See note above about `config.json` file.

## Support

For support you can open a [github issue](https://github.com/tagyoureit/nodejs-poolController/issues/new),
for discussions, designs, and clarifications, we recommend you join our [Gitter Chat room](https://gitter.im/pentair_pool/Lobby).

***

## Web Interfaces

  - A slick [Bootstrap](http://getbootstrap.com/) interface by [@arrmo](https://github.com/arrmo). Set variable: <code>["expressDir": "/bootstrap"](#module_nodejs-poolController--config)</code>
  - A boring, basic, functional interface. Set variable:  <code>["expressDir": "/public"](#module_nodejs-poolController--config)</code>
  To choose, set the `expressDir` variable in the 'config.json'.  Load both interfaces from `http://localhost:3000/index.html`

## Useful URL's included with the boring, basic, functional interface

  *  Control standalone pumps: `http://_your_machine_name_:3000/pump.html`
  *  Listen for specific messages: `http://_your_machine_name_:3000/debug.html`
  *  Send a message on the serial bus: `http://<server>:3000/public/send_packet.html`

#### Technical notes:

 The web UI will dynamically load as the information is received from the app.  Yes, Socket.io, we love you!  Full loading may take 20-30 seconds depending on your equipment setup.

***

##  REST Interface & Socket.IO


 You can also call REST URI's like:
 * Get circuit status: /circuit/# to get the status of circuit '#'
 * Toggle circuit status: /circuit/#/toggle to get the toggle circuit '#'
 * ~~Get system status: /status~~ Depricated.
 * Get schedules: /schedule
 * Get pump status: /pump
 * Get all equipment as one JSON: /all
 * Set spa heat setpoint: /spaheat/setpoint/#
 * Set spa heat mode: /spaheat/mode/#  (0=off, 1=heater, 2=solar pref, 3=solar only)
 * Set pool heat setpoint: /poolheat/setpoint/#
 * Set pool heat mode: /poolheat/mode/# (0=off, 1=heater, 2=solar pref, 3=solar only)
 * Run pumps in stand-alone mode
 * Cancel delay: /cancelDelay

### APIs
 You can use Sockets.IO  (see the "basic UI" example).  Valid sockets:

#### General

| Direction | Socket  | API | Description |
| --- | --- | ---  | --- |
| To app | <code>echo(equipment)</code> | no api | test socket
| To client | <code>echo</code> |  | outputs the incoming echo (for testing)
| To app | <code>search(mode, src, dest, action)</code> | | Searches for specific packets that match all four bytes and outputs to the socket <code>searchResults</code>
| To client | <code>searchResults</code> | |outputs packets that match the <code>search</code> socket
| To app | <code>sendPacket(packet)</code> | |Send a `packet` as an array of values [xx,yy,zz...] to the bus.  Pump and Controller packets should start with [DEST, SRC,...].  Chlorinator packets should start with [16,2...]
| To client | <code>all</code>| |outputs an object with all equipment in one JSON
| To app | <code>all</code>| <code>/all</code> |sends all information in one socket
| To client | <code>time</code> | <code>/time</code> ||outputs an object with the time and date information
| To app | <code>setDateTime(hour, min, dow*, day, mon, yy, dst) |<code>/datetime/set/time/{hour}/{min}/{dow}/{day}/{mon}/{year}/{dst}</code> | |set the date/time on the controller.  dow= day of week as expressed as [0=Sunday, 1=Monday, 2=Tuesday, 4=Wednesday, 8=Thursday, 16=Friday, 32=Saturday] and DST = 0(manually adjst for DST) or 1(automatically adjust DST)
| To app | <code>updateVersionNotification(bool)</code> | |true = do not send the updateAvailable socket until the next version is available.  false = send updateAvailable everytime.
| To client | <code>updateAvailable</code> | |outputs an object with current running version vs latest published release on GitHub (local is the running app, remote is the GitHub version)
| To client | <code>valve</code> | |outputs an object with the valve information
| To client | <code>UOM</code> | |outputs the unit of measure (C or F)


#### Circuits

| Direction | Socket  | API | Description |
| --- | --- | ---  | --- |
| To client | <code>circuit</code> | |outputs an object of circuits and their status
| To app |  | <code>/circuit</code>| outputs an object of circuits and their status
| To app | <code>circuit/{#}</code> | <code>/circuit</code>|outputs an object of a single circuit and its status
| To app | <code>toggleCircuit(equipment)</code> | <code>/circuit/{#}/toggle</code>|toggles the circuit (as a circuit number)  |
| To app | | <code>/circuit/{#}/set/{0/1}</code>|set the circuit (as a circuit number) to 1 (on) or 0 (off)|
| To app | <code>cancelDelay</code>| <code>/cancelDelay</code> | Cancel and current circuit (valves/heater cool down?) delay.


#### Temperatures and Heat

| Direction | Socket  | API | Description |
| --- | --- | ---  | --- |
| To client | <code>temperature</code> |  | outputs an object with the temperatures, heat and set point information
| To app |  | <code>/temperature</code> | outputs an object with the temperatures, heat and set point information
| To app | <code>setSpaSetPoint(spasetpoint)</code> | <code>/spaheat/setpoint/{#}</code> |Change the spa to setpoint (degrees)
| To app | <code>incrementSpaSetPoint(degrees)</code> | <code>/spaheat/increment/{degrees}</code> |Increment the spa by [optional] degrees; default=1
| To app | <code>decrementSpaSetPoint(degrees)</code> | <code>/spaheat/decrement/{degrees}</code> |Decrement the spa by [optional] degrees; default=1
| To app | <code>spaheatmode(spaheatmode)</code> | <code>/spaheat/mode/{mode}</code> |Change the spa heat mode (integer 0=off, 1=heater, 2=solar pref, 3=solar only)
| To app | <code>setPoolSetPoint(poolsetpoint)</code> | <code>/poolheat/setpoint/{degrees}</code> |Change the pool to setpoint (degrees)
| To app | <code>incrementPoolSetPoint(degrees)</code> | <code>/poolheat/increment/{degrees}</code> |Increment the pool by [optional] degrees; default=1
| To app | <code>decrementPoolSetPoint(degrees)</code> | <code>/poolheat/decrement/{degrees}</code> |Decrement the pool by [optional] degrees; default=1
| To app | <code>poolheatmode(poolheatmode)</code> | <code>/poolheat/mode/{mode}</code> |Change the pool heat mode (integer 0=off, 1=heater, 2=solar pref, 3=solar only)


#### Chlorinator and Intellichem
(Note: As of 5.3 the Chlorinator API's will route the commands either through the Intellitouch/Intellicom or directly to the chlorinator depending upon your setup)
| Direction | Socket  | API | Description |
| --- | --- | ---  | --- |
| To app | <code>setchlorinator(poolLevel, spaLevel, superChlorinateHours)</code> |  <code>/chlorinator/{level}/spa/{level}/superChlorinateHours/{hours}</code>|sets the level of output for chlorinator (spa/superchlorinate can be omitted)
| To app |  |  <code>/chlorinator/pool/{level}</code>|sets the pool output %
| To app |  |  <code>/chlorinator/spa/{level}</code>|sets the spa output %
| To app |  |  <code>/chlorinator/pool/{level}/spa/{level}</code>|sets the pool & spa output %
| To app |  |  <code>/chlorinator/superChlorinateHours/{hours}</code>|sets the hours for super chlorination
| To client | <code>chlorinator</code> | outputs an object with the chlorinator information
| To app | | <code>/chlorinator</code> | outputs an object with the chlorinator information
| To app | <code>intellichem</code> | <code>/intellichem</code> |outputs an object with the intellichem information

#### Pumps

| Direction | Socket  | API | Description |
| --- | --- | ---  | --- |
| To client | <code>pump</code> |   |outputs an object with the pump information
| To app | |  <code>/pump</code> | requests an object with the pump information
| To app | ~<code>setPumpCommand(action, pump, program, rpm, duration)</code>~ | action=off,run, save, saverun; pump=1 or 2, program = 1 to 4, rpm = 450-3450, duration in minutes (or null for indefinite); leave parameters as null for any values that are not relevant.  For example, to run program 4 on pump 1, call setPumpCommand('run',1,4,null,null)
| To app | <code>setPumpType(pump, type)</code> | <code>/pumpCommand/pump/{pump}/type/{type}</code> |Set [pump] to [type] (one of `VS`,`VF`,`VSF`,`None`)

#### Standalone pump controllers or Easytouch (Not Intellitouch)

| Direction | Socket  | API | Description |
| --- | --- | ---  | --- |
| To app | |  <code>/pumpCommand/off/pump/{pump}</code> | Turns {pump} off
| To app | |  <code>/pumpCommand/run/pump/{pump}</code> | Runs {pump} indefinitely
| To app | |  <code>/pumpCommand/run/pump/{pump}/duration/{duration}</code> | Runs {pump} for a duration
| To app | |  <code>/pumpCommand/run/pump/{pump}/program/{program}</code> | Runs {pump} {program} indefinitely
| To app | |  <code>/pumpCommand/run/pump/{pump}/program/{program}/duration/{duration}</code> | Runs {pump} {program} for a {duration}
| To app | |  <code>/pumpCommand/run/pump/{pump}/rpm/{rpm}</code> | Runs {pump} at {rpm} indefinitely
| To app | |  <code>/pumpCommand/run/pump/{pump}/rpm/{rpm}/duration/{duration}</code> | Runs {pump} at {rpm} for a {duration}
| To app | |  <code>/pumpCommand/save/pump/{pump}/program/{program}/rpm/{rpm}</code> | Saves {pump} {external program} as {rpm}
| To app | |  <code>/pumpCommand/saverun/pump/{pump}/program/{program}/rpm/{rpm}</code> | Saves {external program} as {rpm}, then runs {pump} {program} indefinitely
| To app | |  <code>/pumpCommand/saverun/pump/{pump}/program/{program}/rpm/{rpm}/duration/{duration}</code> | Saves {external program} as {rpm}, then runs {pump} {program} for {duration}
| To app | |  <code>/pumpCommand/run/pump/{pump}/gpm/{gpm}</code> | Runs {pump} at {gpm} indefinitely
| To app | |  <code>/pumpCommand/run/pump/{pump}/gpm/{gpm}/duration/{duration}</code> | Runs {pump} at {gpm} for a {duration}
| To app | |  <code>/pumpCommand/save/pump/{pump}/program/{program}/gpm/{gpm}</code> | Saves {pump} {external program} as {gpm}
| To app | |  <code>/pumpCommand/saverun/pump/{pump}/program/{program}/gpm/{gpm}</code> | Saves {external program} as {gpm}, then runs {pump} {program} indefinitely
| To app | |  <code>/pumpCommand/saverun/pump/{pump}/program/{program}/gpm/{gpm}/duration/{duration}</code> | Saves {external program} as {gpm}, then runs {pump} {program} for {duration}


#### Schedules

| Direction | Socket  | API | Description |
| --- | --- | ---  | --- |
| To client | <code>schedule</code> | <code>/schedule</code> |outputs an object with the schedule information
| To app | <code>setSchedule(id, circuit, starthh, startmm, endhh, endmm, dow*) | set the schedule on the controller for the particular schedule ID.  dow= day of week as expressed as [0=Sunday, 1=Monday, 2=Tuesday, 4=Wednesday, 8=Thursday, 16=Friday, 32=Saturday] or a combination thereof [3=Monday+Tuesday].  To set a schedule set a valid start and end time (hh:mm).  To set an egg timer, set the start time to 25:00 and the endtime to the duration (hh:mm) you want the egg timer to run.
| To app | <code>toggleScheduleDay(id,dow)</code> | <code>/schedule/toggle/id/{id}/day/{day}</code> |Toggle the day of schedule [id]. [dow] can be expressed as a single day (three letters, eg Sun; full name, eg Sunday; or dow as described in setSchedule.
| To app | <code>deleteScheduleOrEggTimer(id)</code> | <code>/schedule/delete/id/{id}/day/{day}</code> |Delete the [id] with the corresponding schedule
| To app | <code>setScheduleStartOrEndTime(id,sOE,hour,min)</code> |<code>/schedule/set/id/{id}/startOrEnd/{sOE}/hour/{hour}/min/{min}</code> | Edit schedule with [id]. sOE=`start` or `end`. hour in 24h notation 0-23. min 0-59.
| To app | <code>setScheduleCircuit(id,circuit)</code> | <code>/schedule/set/id/{id}/circuit/{circuit}</code> |Assign [circuit] (as id of circuit) to schedule [id]
| To app | <code>setEggTimer(id,circuit,hour,min)</code> | <code>/eggtimer/set/id/{id}/circuit/{circuit}/hour/{hour}/min/{min}</code> |Assign egg timer to schedule with [id], [circuit] as circuit id, and hour 0-23 and min 0-59.


***

# Config.JSON

<a name="module_nodejs-poolController--config"></a>
The poolController app runs on a configuration file.  As noted in the [Install Instructions](#module_nodejs-poolController--install), you can launch from a custom file or use the default name of `config.json`.

New as of 4.1.33, the app will not come with `config.json`.  This makes upgrading easy because the app will not overwrite your existing settings if you use the default name.

## First launch

When you first launch the app, or launch the app specifying a configuration file that does not exist, it will be created from a template.  The template is `sysDefault.json` and this file should NOT be modified directly.

### Subsequent launches and upgrades

Every time the app runs, or the code is upgraded, the app will check the specified configuration file against the `sysDefaults.json` file and add any new keys.

Summary

 * Any edits are retained (eg you change logConfigMessages=1, but it is logConfigMessages=0 in the template, the value will not be changed in the configuration file).  The only exception is the `version` key which will be updated to the latest value.
 * New keys are automatically added with default values.
 * Old keys will output a warning, but will not be deleted*.

#### Example Messages
In the logs, you will see

Keys that can be deleted:
```
20:49:15.181 INFO Potential expired/deprecated keys in
	file: config_local.json
	key: Hi I am an extra key:0
```

Keys that are automatically added:

```
20:50:55.718 INFO New keys copied
	from: sysDefault.json
	  to: config.json
	key: poolController.log.logApi:0
```

### Only output changes in config.json

If you want to only see what would be changed, or if you want the app to also delete keys, you can run an npm script.

* <code>npm run configTester %config.json% [overwriteFile or outputToScreen]</code>

where %config.json% is the path to your configuration file.  Defaults to `config.json` and
[overwriteFile or outputToScreen], if present, will write the entire changed file to the file (_with deletes_) or output the contents to the screen.

See below for descriptions

```
{
    "equipment": {
        "controller": {
            "intellicom": {
                "installed": 0,
                "friendlyName": ""
            },
            "intellitouch": {
                "installed": 1,
                "friendlyName": "",
                "numberOfCircuits": 20,
                "numberOfPumps": 2,
                "numberOfCustomNames": 10
            },
            "virtual": {
                "pumpController": "default",
                "chlorinatorController": "default"
            },
            "id": {
                "productName": "",
                "productNumber": "",
                "manufacturer": "",
                "description": ""
            },
            "circuitFriendlyNames": {
                "1": "",
                "2": "",
                "3": "",
                "4": "",
                "5": "",
                "6": "",
                "7": "",
                "8": "",
                "9": "",
                "10": "",
                "11": "",
                "12": "",
                "13": "",
                "14": "",
                "15": "",
                "16": "",
                "17": "",
                "18": "",
                "19": "",
                "20": ""
            }
        },
        "chlorinator": {
            "installed": 1,
            "desiredOutput": {
                "pool": -1,
                "spa": -1
            },
            "friendlyName": "",
            "id": {
                "productName": "",
                "productNumber": "",
                "manufacturer": "",
                "description": ""
            }
        },
        "pump": {
            "1": {
                "type": "VS",
                "externalProgram": {
                    "1": -1,
                    "2": -1,
                    "3": -1,
                    "4": -1
                },
                "friendlyName": ""
            },
            "2": {
                "type": "VS",
                "externalProgram": {
                    "1": -1,
                    "2": -1,
                    "3": -1,
                    "4": -1
                },
                "friendlyName": ""
            }
        }
    },
    "poolController": {
        "appAddress": 33,
        "http": {
            "enabled": 1,
            "expressPort": 3000,
            "redirectToHttps": 0,
            "expressAuth": 0,
            "expressAuthFile": "/users.htpasswd"
        },
        "https": {
            "enabled": 1,
            "expressPort": 3001,
            "expressAuth": 0,
            "expressAuthFile": "/users.htpasswd",
            "expressKeyFile": "/data/server.key",
            "expressCertFile": "/data/server.crt"
        },
        "network": {
            "rs485Port": "/dev/ttyUSB0",
            "netConnect": 0,
            "netHost": "raspberrypi",
            "netPort": 9801,
            "inactivityRetry": 10
        },
        "notifications": {
            "version": {
                "remote": {
                    "version": "4.0.0",
                    "tag_name": "v4.0.0",
                    "dismissUntilNextRemoteVersionBump": false
                }
            }
        },
        "log": {
            "logLevel": "info",
            "socketLogLevel": "info",
            "fileLog": {
                "enable": 0,
                "fileLogLevel": "silly",
                "fileName": "output.log"
            },
            "logPumpMessages": 0,
            "logDuplicateMessages": 0,
            "logConsoleNotDecoded": 0,
            "logConfigMessages": 0,
            "logMessageDecoding": 0,
            "logChlorinator": 0,
            "logIntellichem": 0,
            "logPacketWrites": 0,
            "logPumpTimers": 0,
            "logReload": 0,
            "logApi": 0
        },
        "database": {
            "influx": {
                "enabled": 0,
                "host": "localhost",
                "port": 8086,
                "database": "pool"
            }
        }
    },
    "integrations": {
        "socketISY": 0,
        "outputSocketToConsoleExample": 0
    },
 "socketISY": {
        "username": "blank",
        "password": "blank",
        "ipaddr": "127.0.0.1",
        "port": 12345,
        "Variables": {
            "chlorinator": {
                "saltPPM": 16
            },
            "pump": {
                "1": {
                    "watts": 25,
                    "rpm": 24,
                    "currentprogram": 13,
                    "program1rpm": 10,
                    "program2rpm": 11,
                    "program3rpm": 12,
                    "program4rpm": 13,
                    "power": 14,
                    "timer": 15
                }
            },
            "circuit": {
                "1": {
                    "status": 8
                },
                "2": {
                    "status": 3
                },
                "3": {
                    "status": 2
                }
            },
            "temperatures": {
                "poolTemp": 17,
                "spaTemp": 18,
                "airTemp": 19,
                "spaSetPoint": 20
            }
        }
    },
    "outputSocketToConsoleExample": {
        "level": "warn"
    }
}
```

***

## Equipment
This section defines the equipment setup.

### controller
Physical or virtual controllers

### intellicom
 * If you have this, set `"installed": 1`
 * `friendlyName` - not implemented as of 4.0 alpha 8

### intellitouch
 * If you have this, set `"installed": 1`
 * `friendlyName` - not implemented as of 4.0 alpha 8
 * If you have expansion boards, set the number in the appropriate variables.  The app will expand your sections of your config.json to have the appropriate variables.

    1. "numberOfCircuits": default=20; increases by 10 per board up to 50
    1. "numberOfPumps": default=2; increases by 2 per board up to 10
    1. "numberOfCustomNames": default=10; increases by 10 per board up to 40

### virtual
Options to use the nodejs-poolController app as the controller on your system.  You should not enable these if you have another controller (intellicom/intellitouch)
* `pumpController` - will actively manage the pumps when they are off or running
* `chlorinatorController` - will actively manage the chlorinatorController

Valid options are:
* `default`: If intellicom and intellitouch are not installed, start the controller
* `always`: Start the controller irregardless of other controllers
* `never`: Do not start the controller

### id
Descriptive strings used to describe the controller.
Not implemented as of 4.0 alpha 8.

### circuitFriendlyNames
If you want to expand the names of your circuits beyond the 11 (lame!) character limit, add them here.  These will filter through to the UI, but more importantly if you need to name your circuit "WTRFALL 1.5" in the Pentair controller but want to refer to it as "waterfall medium" through Siri/Alexa (hint, hint) this is the place to do it.

For more detail, the app will first determine if the circuit is using one of the ~200 built-in names, then it will check if it using a Pentair custom name, and finally, it will check to see if you want to assign it a friendly name from this config file.

### chlorinator
 * If you have this, set `"installed": 1`
 * `desiredOutput`: A value between 0-100 for % of chlorination time.  This value will be read/updated as it is changed in the UI or through the API.
 * `friendlyName`: Used to identify the chlorinator.  Not implemented as of 4.0 alpha 8
 * `id`: Descriptive strings used to describe the chlorinator. Not implemented as of 4.0 alpha 8.


### pump
Enumerated object of the pumps.
* `type`:
   1. `none`: if you do not have this pump
   1. `VF`: if you have a Variable Flow model pump
   1. `VS`: if you have a Variable Speed model pump
   1. `VSF`: if you have a Variable Speed/Flow model pump (Note: this will act the same as a VF model)
* `externalProgram`: Stores the 4 external programs on the pump when the UI or one of the `save` API's is called.  For VS this will be RPM values, for VF/VSF this will be GPM values.  Please set these through the UI or they will not be synced with the pump.
* `id`: Descriptive strings used to describe the chlorinator. Not implemented as of 4.0 alpha 8.

## poolController
Sets options related to how the app works

### appAddress
The address on the serial bus that this app will use.
The pumps don't seem to care what number you use, but Intellitouch won't respond unless this address is one of 32, 33, 34.


### http
* `enabled`: 1 for yes, 0 for no
* `expressPort`: set to the value that you want the web pages to be served to.  3000 = http://localhost:3000
* `redirectToHttps`: 1 for yes, 0 for no.  If this is 1, all other options except for the port will be ignored.
* `expressAuth`: `0` for no username/password.  `1` for username/password.
* `expressAuthFile` : input the path to the file.  By default, `/users.htpasswd`. If you have `expressAuth=1` then create the file users.htpasswd in the root of the application.  Use a tool such as http://www.htaccesstools.com/htpasswd-generator/ and paste your user(s) into this file.  You will now be prompted for authentication.

### https
* `enabled`: 1 for yes, 0 for no
* `expressPort`: set to the value that you want the web pages to be served to.  3001 = https://localhost:3001
* `expressKeyFile`: path to CA Key file
* `expressCertFile`: path to CA Cert file
* `expressAuth`: `0` for no username/password.  `1` for username/password.
* `expressAuthFile` : input the path to the file.  By default, `/users.htpasswd`. If you have `expressAuth=1` then create the file users.htpasswd in the root of the application.  Use a tool such as http://www.htaccesstools.com/htpasswd-generator/ and paste your user(s) into this file.  You will now be prompted for authentication.

### network
* `rs485Port`: If you are running the code on the same machine as your local rs485 adapter, set the address of the adapter here.  Typically `/dev/ttyUSB0` on Unix machines.
* To connect to native rs485 traffic for connectivity/debugging using <code>[SOCAT](#module_nodejs-poolController--socat)</code>
        1. `netConnect`: `1` to enable or `0` to disable.  If you enable this option, it will NOT connect to the local RS485 adapter
        1. `netHost`: Name/IP of your remote computer.  EG `raspberrypi`
        1. `"netPort":`: `9801` is a standard port
* `inactivityRetry` : time in seconds to retry a connection to the port (RS485 or Socat) if a connection is lost.  Default is 10 seconds.

### notifications
Section for how/when the app will notify you about certain actions/conditions.

#### version
The app will check to see if you have the latest published release.
* `version`: Latest published version
* `tag_name`: Tag of latest published version
* `dismissUntilNextRemoteVersionBump`: Silence the notifications until version/tag_name changes again.


###log
Settings for the console, UI and file logs.

* `logLevel` is the console output level (see below for valid levels)
* `socketLogLevel` is the bootstrap UI output level in the debug panel (see below for valid levels)
* `fileLog` enable output to a fileLog
    1.  `enable`: `1` for yes, `0` for no
    1. `fileLogLevel`: output file for level (see below for valid levels)
    1. `fileName`: `output.log` is the default.  Can take an optional path relative to the main directory.

| Valid output levels |
| --- | --- |
| Error | Only output error messages |
| Warn | Output the above, plus warnings |
| **Info** | Output the above, plus information about circuit/status changes |
| Debug | Output the above, plus debugging information |
| Silly | Output the above, plus code-level troubleshooting messages |

* `logPumpMessages`: 1 = show messages from the pump in the logs, 0 = hide
* `logDuplicateMessages`: 1 = show messages that are repeated on the bus in the logs, 0 = hide
* `logConsoleNotDecoded`: 1 = log any messages that have not been [documented](https://github.com/tagyoureit/nodejs-poolController/wiki)
* `logConfigMessages`: 1 = log messages that relate to the configuration of the pool (from controllers), 0 = hide
* `logMessageDecoding`: 1 = log the internal decoding of packets
* `logChlorinator`: 1 = log messages directly from the chlorinator, 0 = hide
(If you have Intellitouch, status will be received from the controller directly)
* `logPacketWrites`: 1 = log debug messages about packet writes, 0 = hide
* `logPumpTimers`: 1 = log debug messages about pump timers, 0 = hide
* `logReload`: 1 = log requests to reload the application, 0 = hide

### Integrations
See below for Integration instructions.
* `integrations`:
  1. `_name_of_module_`: `1` to enable, `0` to disable
* `_name_of_module_`: configuration options to be used by the integration component


<a name="module_nodejs-poolController--RS485"></a>

***

## RS485 Adapter

1. This code **REQUIRES** a RS485 serial module.  There are plenty of sites out there that describe the RS485 and differences from RS232 so I won't go into detail here.
The inexpensive [JBTek](https://www.amazon.com/gp/product/B00NKAJGZM/ref=oh_aui_search_detailpage?ie=UTF8&psc=1) adapter works great.

2.  Connect the DATA+ and DATA-.

3.  To see if you are getting the proper communications from the bus, before you even try to run this program, run from your unix command line

```
od -x < /dev/ttyUSB0
```

Of course, you'll need to change the address of your RS-485 adapter if it isn't the same as mine (here and in the code).

*   You'll know you have the wires right when the output of this command looks like (you should see multiple repetitions of ffa5ff):

```
0002240 0000 0000 0000 0000 0000 ff00 ffff ffff
0002260 **ffff 00ff a5ff** 0f0a 0210 161d 000c 0040
0002300 0000 0000 0300 4000 5004 2050 3c00 0039
0002320 0400 0000 597a 0d00 af03 00ff a5ff 100a
0002340 e722 0001 c901 ffff ffff ffff ffff ff00
```

*  This is the WRONG wiring (no ffa5ff present).
```
0001440 0000 0000 0000 0000 0000 0000 0000 6a01
0001460 e1d6 fbdf d3c5 fff3 ff7f ffff ffff f9ff
0001500 7fff 5ff7 bf5f 87ff ff8d f7ff ffff 4d0b
0001520 e5ff adf9 0000 0000 0000 0000 0100 d66a
0001540 dfe1 c5fb f3d3 7fff ffff ffff ffff fff9
```

***

## Sample Output

Set the <code>["logLevel": "info"](#module_nodejs-poolController--config)</code> variable to your liking.


The RS-485 bus is VERY active!  It sends a lot of broadcasts, and instructions/acknowledgements.  Many commands are known, but feel free to help debug more if you are up for the challenge!  See the wiki for what we know.  Below are a sample of the message

Request for a status change:
```
08:47:51.368 INFO User request to toggle PATH LIGHTS to On

```

When the app starts, it will show the circuits that it discovers.  For my pool, the circuits are:
```
08:45:46.948 INFO
  Custom Circuit Names retrieved from configuration:
	["WtrFall 1","WtrFall 1.5","WtrFall 2","WtrFall 3","Pool Low2","USERNAME-06","USERNAME-07","USERNAME-08","USERNAME-09","USERNAME-10"]

08:45:50.989 INFO
  Circuit Array Discovered from configuration:
Circuit 1: SPA Function: Spa Status: 0 Freeze Protection: Off
Circuit 2: JETS Function: Generic Status: 0 Freeze Protection: Off
Circuit 3: AIR BLOWER Function: Generic Status: 0 Freeze Protection: Off
Circuit 4: CLEANER Function: Master Cleaner Status: 0 Freeze Protection: Off
Circuit 5: WtrFall 1.5 Function: Generic Status: 0 Freeze Protection: Off
Circuit 6: POOL Function: Pool Status: 0 Freeze Protection: Off
Circuit 7: SPA LIGHT Function: Light Status: 0 Freeze Protection: Off
Circuit 8: POOL LIGHT Function: Light Status: 0 Freeze Protection: Off
Circuit 9: PATH LIGHTS Function: Light Status: 0 Freeze Protection: Off
Circuit 10: NOT USED Function: Generic Status: 0 Freeze Protection: Off
Circuit 11: SPILLWAY Function: Spillway Status: 0 Freeze Protection: Off
Circuit 12: WtrFall 1 Function: Generic Status: 0 Freeze Protection: Off
Circuit 13: WtrFall 2 Function: Generic Status: 0 Freeze Protection: Off
Circuit 14: WtrFall 3 Function: Generic Status: 0 Freeze Protection: Off
Circuit 15: Pool Low2 Function: Generic Status: 1 Freeze Protection: Off
Circuit 16: NOT USED Function: Spillway Status: 0 Freeze Protection: Off
Circuit 17: NOT USED Function: Spillway Status: 0 Freeze Protection: Off
Circuit 18: NOT USED Function: Spillway Status: 0 Freeze Protection: Off
Circuit 19: NOT USED Function: Generic Status: 0 Freeze Protection: Off
Circuit 20: AUX EXTRA Function: Generic Status: 0 Freeze Protection: Off

08:45:54.136 INFO Msg# 69  Schedules discovered:
ID: 1  CIRCUIT:(6)POOL  MODE:Schedule START_TIME:9:25 END_TIME:15:55 DAYS:Sunday Monday Tuesday Wednesday Thursday Friday Saturday
ID: 2  CIRCUIT:(13)WtrFall 2  MODE:Schedule START_TIME:14:57 END_TIME:15:8 DAYS:Sunday Tuesday Thursday Saturday
ID: 3  CIRCUIT:(4)CLEANER  MODE:Schedule START_TIME:10:15 END_TIME:11:0 DAYS:Sunday Monday Tuesday Wednesday Thursday Friday Saturday
ID: 4  CIRCUIT:(6)POOL  MODE:Egg Timer DURATION:7:15
ID: 5  CIRCUIT:(4)CLEANER  MODE:Egg Timer DURATION:4:0
ID: 6  CIRCUIT:(15)Pool Low2  MODE:Schedule START_TIME:21:10 END_TIME:23:55 DAYS:Sunday Monday Tuesday Wednesday Thursday Friday Saturday
ID: 7  CIRCUIT:(15)Pool Low2  MODE:Schedule START_TIME:0:5 END_TIME:9:20 DAYS:Sunday Monday Tuesday Wednesday Thursday Friday Saturday
ID: 8  CIRCUIT:(7)SPA LIGHT  MODE:Egg Timer DURATION:2:0
ID: 9  CIRCUIT:(2)JETS  MODE:Egg Timer DURATION:3:45
ID:10  CIRCUIT:(9)PATH LIGHTS  MODE:Egg Timer DURATION:4:15
ID:11  CIRCUIT:(11)SPILLWAY  MODE:Schedule START_TIME:13:0 END_TIME:13:11 DAYS:Sunday Monday Tuesday Wednesday Thursday Friday Saturday
ID:12  CIRCUIT:(5)WtrFall 1.5  MODE:Schedule START_TIME:13:20 END_TIME:13:40 DAYS:Sunday Tuesday Thursday


```

To display the messages below, change the logging level to `VERBOSE` and enable `logConfigMessages`.
```
08:47:51.606 VERBOSE Msg# 266:

                                  S       L                                           V           H   P   S   H       A   S           H
                                  O       E           M   M   M                       A           T   OO  P   T       I   O           E
                              D   U       N   H       O   O   O                   U   L           R   L   A   R       R   L           A                           C   C
                              E   R   C   G   O   M   D   D   D                   O   V           M   T   T   _       T   T           T                           H   H
                              S   C   M   T   U   I   E   E   E                   M   E           D   M   M   O       M   M           M                           K   K
                              T   E   D   H   R   N   1   2   3                       S           E   P   P   N       P   P           D                           H   L
Orig:               165, 16, 15, 16,  2, 29,  8, 57,  0, 64,  0,  0,  0,  0,  0,  0,  3,  0, 64,  4, 61, 61, 32,  0, 49, 45,  0,  0,  4,  0,  0,137,192,  0, 13,  4,13
 New:               165, 16, 15, 16,  2, 29,  8, 57,  0, 65,  0,  0,  0,  0,  0,  0,  3,  0, 64,  4, 61, 61, 32,  0, 49, 45,  0,  0,  4,  0,  0,137,192,  0, 13,  4,14
Diff:                                                     *

08:47:51.609 DEBUG No change in time.
08:47:51.624 VERBOSE Msg# 266   Circuit PATH LIGHTS change:  Status: Off --> On
```

An example of pump communication.  To show these, enable `logPumpMessages`.

```
08:50:10.805 VERBOSE Msg# 79   Main --> Pump 1: Pump power to on: [165,0,96,16,6,1,10,1,38]
```

=======


***

## Integrations
You can now (pretty) easily add your own code to interface with any other home automation (or other) systems.  See https://github.com/tagyoureit/nodejs-poolController/wiki/Integrations-in-2.0

The `outputSocketToConsoleExample` is a very simple module that echos out a few socket messages.  The ISY sample is a bit more complex and keeps track of the state of variables.

<a name="module_nodejs-poolController--socat"></a>
***

## Socat

Want to have a RaspberryPi Zero, or other $5 computer, sitting by your pool equipment while the main code runs elsewhere on your network?
Or want to help get involved with the project and debug in an app like [Netbeans](https://netbeans.org/)?

@arrmo was super slick in getting this to run.

There are two options:

1. Run socat each time to enable the pipe
1. Setup a daemon to automatically start socat

### The "run it each time" method
Run these commands on the remote machine

1. `sudo apt-get install socat` to install socat
1. `/usr/bin/socat TCP-LISTEN:9801,fork,reuseaddr FILE:/dev/ttyUSB0,b9600,raw`
1. Setup the app parameters (below)

### The "run under a daemon" method
Run these commands on the remote machine

1.  `sudo apt-get install socat` to install socat
1.  `sudo apt-get install daemon` to install daemon
1.  Copy the `poolTTY` file (in /scripts directory) to your remote machine directory `/etc/init.d`
1.  Run the following command to make the daemon run the socat upon startup:
`sudo update-rc.d poolTTY defaults`
1. Setup the app parameters (below)

### Another alternative method
Props to @antamy.  Another approach to an `etc/init.d` script.  The script is `runAtBoot.sh`.  See https://github.com/chovy/node-startup for instructions to use this script.

#### Test socat

From your local machine, you should be able to telnet to port 9801 and see incoming packets.

#### nodejs-poolController app configuration
In the <code>["network"](#module_nodejs-poolController--config)</code> section, set `netConnet=1`.  `netHost` is your remote machine.  `netPort` should be 9801 if you followed these instructions.

***

## Standalone mode

### Pump controller (as of 4.0 alpha 8)
Start the app and navigate to http://localhost:3000/public/pump.html.  Addition of the pump control to `/bootstrap` is in progress


***

## Bootstrap UI

Configuration is saved automatically to `./src/www/bootstrap/configClient.json` when you make changes in the UI.

1. `visible` - This panel will be shown and expanded
1. `collapse` - This panel will be shown and collapsed
1. `hidden` - This panel will not be shown


***

## InfluxDB

["InfluxDB"](https://github.com/influxdata/influxdb) is an open-source time series database that make storage of all pool data extremely easy.  Much thanks to ["@johnny2678"](https://github.com/johnny2678) for pointing me in this direction!

Direct Install
1. Follow install instructions from ["Influx install instructions"](https://docs.influxdata.com/influxdb/v1.2/introduction/installation/)
1. Create database `pool` or whatever you choose that matches your `config.json` file settings.


Docker Instructions
1. Install Docker with a single command on RasPi3 - `curl -sSL https://get.docker.com | sh` ["from"](https://www.raspberrypi.org/blog/docker-comes-to-raspberry-pi/)
1. ...
1. ...
1. More to come...

***

<a name="module_nodejs-poolController--changelog"></a>
# Versions

1.0.0 -
 * Much of the code reworked and refactored
 * Added Bootstrap UI by @arrmo
 * Better standalone pump control (@bluemantwo was super-helpful here, too!)
 * More accurate recognition of packets
 * Super fast speed improvements
 * Outgoing packets are now sent based on a timer (previously number of incoming packets)
 * Added ISY support (@bluemantwo was super-helpful here, too!)

2.0.0 -
 * https, Authentication
 * Completely refactored code.  Integrated BottleJS (https://github.com/young-steveo/bottlejs) for dependency injection and service locator functions
 * Integrations to loosely couple add-ons

3.0.0 -
 * Upgraded pump logic

3.1.x -
 * Added unit testing for certain areas
 * Added setDateTime API/Socket
 * Bootstrap panel states are now persistent

4.0.0 -
 * Changed much in the config.json file
 * Save pump programs and chlorinator level to config.json
 * Added support for GPM with pumps
 * Check for newer versions of the app on github, and dismiss notifications until next release
 * Bootstrap configuration is automatically saved in clientConfig.json via UI actions
 * Started to introduce some promises into the workflow (mostly with read/write operations)
 * Added log-to-file option
 * Added capture for Ctrl-C/SIGINT to have a clean exit
 * Added InfluxDB database capabilities
 * Added support for reading the data from up to 16 pumps.  (You can still only control two.)
 * Support for up to 50 circuits, 8 pumps
 * Delay and Cancel Delay for circuits

5.0.0 -
Make sure to run `npm upgrade`.  There are many package updates and changes.

 * Added add/delete/edit schedule
 * All sockets/API now singular (`circuits`->`circuit`)
 * All sockets/API data now returned with a JSON qualifier. EG `{pump:...}`, `{circuit:...}`
 * Intellichem decoding and display
 * Changes to `/config` endpoint.  It's now included with the `/all` end point since there would be quite a bit of duplication.  It still exists standalone (for now) but has much less information in it.
 * Moved `hideAux` setting from `configClient.json` (web UI settings) to `config.json` template.  In `config.json` template, moved
    ```
    {equipment: {controller: {circuitFriendlyNames:{1..20}}}}

     // to

    {equipment: {circuit: friendlyName:{1..20},
                              hideAux: boolean
                              },
    }
    ```
    to be in line with the other equipment in the pool setup and accomodate the `hideAux` setting.

 * Fixed issue #82
 * Extra info from `/config` was being added to the circuit section in `config.json`
 * This release includes a new mechanism for updating config.json files. See notes in [config.json](#module_nodejs-poolController--config) section.
 * mDNS server.  Currently included for SmartThings integration, but in the future can be used for autodiscovery by other applications/devices.
 * New `/config` endpoint (beta) to allow applications to get a high level summary of the system.
 * Support for two separate (http/https) web servers, each/both with Auth, and also the option to redirect all http to https traffic.  Thanks to @arrmo for driving this with #65 and #68.
 * A UI for standalone pumps
 * All sockets and API's renamed to be SINGULAR.  Circuits -> circuit, Schedules->schedule, etc.
 * All returned JSON data (API/socket) now has the type qualifier per [#57](https://github.com/tagyoureit/nodejs-poolController/issues/57)
 * Make sure to run `npm upgrade`.  There are many package updates and changes.
 * Intellichem initial support.
 * Inactivity timer for both internal connections and web page connections.  If a connection is broken, it should re-establish itself automatically now.
 * SSDP for auto-discovery by SmartThings or other services

5.0.1 -
1. Fixed Influx error on startup #90
1. Fixed bad characters in custom names

5.1.0 -
1. Intellibrite support - API's, Sockets and a WebUI.  Lights should have the 'Intellbrite' an their circuit function (set this up at the controller) to show up in this section.
Will document more later, but...
/light/mode/:mode
/light/circuit/:circuit/setColor/:color
/light/circuit/:circuit/setSwimDelay/:delay
/light/circuit/:circuit/setPosition/:position

See the constants.js file and the sections:
  strIntellibriteModes (for modes)
  lightColors (for setColor)

5.1.1 -
1.  Renamed all 'valves' items to valve to be in line with singular renaming of items
1.  InfluxDB - moved some items that were in tag fields to field keys; added valves
1.  Added days of week (with editing) back to the schedules.  Not sure when they disappeared, but they are back now.  #92
1.  Added MySQL integration to log all packets to a DB
1.  Fixed PR #95 to allow sub-hour egg timers
1.  Fixed Intellibrite bugs
1.  Started to move some of the inter-communications to emitter events for better micro-services and shorter call stacks (easier debugging; loosely coupled code).
1.  Changed some Influx tags/queries.

### 5.2.0
1. Node 6+ is supported.  This app no longer supports Node 4.
1. Update of modules.  Make sure to run `npm i` or `npm upgrade` to get the latest.
1. Much better support of multiple Intellibrite controllers.  We can read both controllers now.  There are still some issues with sending changes and help is needed to debug these.
1. Chlorinator API calls (and UI) will now make changes through Intellitouch when available, or directly to the Intellichlor if it is standalone (aka using the virtual controller)
1. Decoupled serial port and processing of packets.  Should help recovery upon packet errors.
1. Implementation of #89.  Expansion boards are now (better) supported by setting variables in your config.json.  See the [config.json](#module_nodejs-poolController--config) section below.
1. Fix for #95
1. Fix for #99
1. Fix for #100







# Wish list
1.  Still many messages to debug
2.  Alexa, Siri integration coming soon!
3.  Integration directly with Screenlogic (IP based).  Awesome job @ceisenach.  https://github.com/ceisenach/screenlogic_over_ip


# Protocol
If you read through the below links, you'll quickly learn that the packets can vary their meaning based upon who they are sending the message to, and what they want to say.  It appears the same message can come in 35, 38 or 32 bytes, but of course there will be some differences there.


# Credit

1.  [Jason Young](http://www.sdyoung.com/home/decoding-the-pentair-easytouch-rs-485-protocol) (Read both posts, they are a great baseline for knowledge)
2.  Michael Russe [ceesco](https://github.com/ceesco53/pentair_examples) [CocoonTech](http://cocoontech.com/forums/topic/13548-intelliflow-pump-rs485-protocol/?p=159671) - Registration required for CocoonTech.  Jason Young used this material for his understanding in the protocol as well.  There is a very detailed .txt file with great information ~~that I won't post unless I get permission~~. Looks like it was publicly posted to [Pastebin](http://pastebin.com/uiAmvNjG).
3.  [Michael Usner](https://github.com/michaelusner/Home-Device-Controller) for taking the work of both of the above and turning it into Javascript code.
4.  [rflemming](https://github.com/rflemming) for being the first to contribute some changes to the code.
5.  Awesome help from @arrmo and @blueman2 on Gitter
