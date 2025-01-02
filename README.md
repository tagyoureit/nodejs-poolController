```diff
- INTELLICENTER USERS: Do not upgrade Intellicenter to 2.006.  Rollback to 1.064 to use this application. 
```
# nodejs-poolController - Version 8.1

## What is nodejs-poolController

nodejs-poolController is an application to communicate and control your Pentair compatible pool equipment.

 * Want to include a low cost controller for your pool?
 * Want a web interface for your system?
 * Want to turn your pumps on remotely?
 * Want to have your home automation system talk to your pool?
 * Want to control your pumps or chlorinator without a pool controller?

Equipment supported
1. Controllers:  IntelliCenter, Intellitouch, EasyTouch, Nixie (standalone equimpent), Aqualink
1. Pumps: Intelliflow VS/VSF/VF, older models, relay controlled pumps, Whisperflo
1. Chlorinators: Intellichlor, Aqua-Rite and OEM brands
1. Heaters: Gas, solar, heatpump
1. Intellichem and Relay Equipment Manager (REM) chemical controllers
1. Intellivalve (coming soon)
1. Home Automation:  SmartThings, Hubitat, ISY, Vera, Siri, Echo
1. Chemical probes (pH, ORP, flow sensors, EC, etc.)

## Latest Changes
See [Changelog](https://github.com/tagyoureit/nodejs-poolController/blob/master/Changelog)

## What's new in 8.1?

Support for dual chlorinators with REM chem controllers.  It is now possible to have two separate chlorinators controlled in 'dynamic' mode by two separate REM chems.  Note: In order for REM chem to control each chlorinator, each needs to be on a dedicated RS-485 port (not shared with an OCP or any other chlorinator).

## What's new in 8.0?

Screenlogic can now be used as a direct connection point.  If you feel that integrating an RS-485 adapter is a bit too much, then this is an option for you.  The preferred method is still RS-485 as it is more fully featured.

## What's new in 7.0?

The current version includes very tight intergation with [relayEquipmentManager](https://github.com/rstrouse/relayEquipmentManager) which allows for hardware control over your ancillary pool equipment (chemical probes, pumps, tanks, heaters, pumps, etc).  

Starting with this version, all code will immediately be pushed to `master` branch.  The version of a `next` branch for feature development will disappear.
 

 <a name="module_nodejs-poolController--install"></a>

Dashpanel Client Screenshot

<img src="https://tagyoureit.github.io/nodejs-poolController/images/v6/clients/dashPanel.png?raw=true" height="300">

## Installation Instructions

This code requires a physical [RS485](https://github.com/tagyoureit/nodejs-poolController/wiki/RS-485-Adapter-Details) adapter to work.

This is only the server code.  See [clients](#module_nodejs-poolController--clients) below for web or other ways to read/control the pool equipment. 

### Prerequisites
If you don't know anything about NodeJS, these directions might be helpful.

1. Install Nodejs (v16+ required). (https://nodejs.org/en/download/)
1. Update NPM (https://docs.npmjs.com/getting-started/installing-node).
1. It is recommended to clone the source code as updates are frequently pushed while releases are infrequent
   clone with `git clone https://github.com/tagyoureit/nodejs-poolController.git`
   (Alternate - not recommended - Download the latest [code release](https://github.com/tagyoureit/nodejs-poolController/releases)
1. Change directory into nodejs-poolController.
1. Run `npm install` in the new folder (where package.json exists).  This will automatically install all the dependencies (serial-port, express, sockets.io, etc).
1. Run the app with `npm start`.
   * `npm start` will compile the Typescript code.  You should use this every time you download/clone/pull the latest code.
   * `npm run start:cached` will run the app without compiling the code which can be much faster.
1. Install a [webclient](module_nodejs-poolController--clients) for a browser experience and/or a [binding](module_nodejs-poolController--bindings) to have two way control with Home Automation systems.

For a very thorough walk-through, see [this](https://www.troublefreepool.com/threads/pentair-intellicenter-pool-control-dashboard-instructional-guide.218514/) great thread on Trouble Free Pool.  Thanks @MyAZPool.

#### Upgrade Instructions
Assuming you cloned the repo, the following are easy steps to get the latest version:
1. Change directory to the njsPC app
2. `git pull`
3. `npm i` (not always necessary, but if dependencies are upgraded this will bring them up to date)
4. Start application as normal, or if using `npm run start:cached` then run `npm run build` to compile the code.

### Docker instructions

See the [wiki](https://github.com/tagyoureit/nodejs-poolController/wiki/Docker). Thanks @wurmr @andylippitt @emes.

### Automate startup of app
See the [wiki](https://github.com/tagyoureit/nodejs-poolController/wiki/Automatically-start-at-boot---PM2-&-Systemd).

# Clients & Bindings
To do anything with this app, you need a client to connect to it.  A client can be a web application or Home Automation system.

<a name="module_nodejs-poolController--clients"></a>

## REM (Relay Equipment Manager)
[Relay Equipment Manager](https://github.com/rstrouse/relayEquipmentManager) is a companion app developed by @rstrouse that integrates standalone hardware control.  Controls GPIO, i2c, and SPI devices including:
* Atlas Scientific pH, orp, ec, hum, prs, pmp, rtd
* ADS1x15 a/d converters
* Pressure Tranducers
* Flow sensors
* Temperature sensors (10k, NTC)

## Web Clients
1. [nodejs-poolController-dashPanel](https://github.com/rstrouse/nodejs-poolController-dashPanel).  Full compatibility with IntelliCenter, *Touch, REM (RelayEquipmentManager).


<a name="module_nodejs-poolController--bindings"></a>

## Home Automation Bindings (previously Integrations)

Available automations:
* [Vera Home Automation Hub](https://github.com/rstrouse/nodejs-poolController-veraPlugin) - A plugin that integrates with nodejs-poolController.  [Bindings Directions](https://github.com/tagyoureit/nodejs-poolController/wiki/Bindings-Integrations-in-2.0#vera)
* [Hubitat](https://github.com/bsileo/hubitat_poolcontroller) by @bsileo (prev help from @johnny2678, @donkarnag, @arrmo).  [Bindings Directions](https://github.com/tagyoureit/nodejs-poolController/wiki/Bindings-Integrations-in-2.0#smartthingshubitat)
* [Homebridge/Siri/EVE](https://github.com/gadget-monk/homebridge-poolcontroller) by @gadget-monk, adopted from @leftyflip
* InfluxDB - [Bindings Directions](https://github.com/tagyoureit/nodejs-poolController/wiki/Bindings-Integrations-in-2.0#influx)
* [MQTT](https://github.com/crsherman/nodejs-poolController-mqtt) original release by @crsherman, re-write by @kkzonie, testing by @baudfather and others.  [Bindings Directions](https://github.com/tagyoureit/nodejs-poolController/wiki/Bindings-Integrations-in-2.0#mqtt)
   * [Homeseer](https://github.com/tagyoureit/nodejs-poolController/wiki/Homeseer-Setup-Instructions) - Integration directions by @miamijerry to integrate Homeseer through MQTT

Outdated:
* [Another SmartThings Controller](https://github.com/dhop90/pentair-pool-controller/blob/master/README.md) by @dhop90
* [ISY](src/integrations/socketISY.js).  Original credit to @blueman2, enhancements by @mayermd
* [ISY Polyglot NodeServer](https://github.com/brianmtreese/nodejs-pool-controller-polyglotv2) created by @brianmtreese

# Support
1. For discussions, recommendations, designs, and clarifications, we recommend you join the [Github discussions](https://github.com/tagyoureit/nodejs-poolController/discussions.
1. Check the [wiki](https://github.com/tagyoureit/nodejs-poolController/wiki) for tips, tricks and additional documentation.
1. For bug reports you can open a [github issue](https://github.com/tagyoureit/nodejs-poolController/issues/new),


# Changes
See [Changelog](https://github.com/tagyoureit/nodejs-poolController/blob/master/Changelog)

<a name="module_nodejs-poolController--config.json"></a>
# Config.json changes

## Controller section - changes to the communications for the app
Most of these can be configured directly from the UI in dashPanel.
* `rs485Port` - set to the name of you rs485 controller.  See [wiki](https://github.com/tagyoureit/nodejs-poolController/wiki/RS-485-Adapter-Details) for details and testing.
* `portSettings` - should not need to be changed for RS485
* `mockPort` - opens a "fake" port for this app to communicate on.  Can be used with [packet captures/replays](https://github.com/tagyoureit/nodejs-poolController/wiki/How-to-capture-all-packets-for-issue-resolution).
* `netConnect` - used to connect via [Socat](https://github.com/tagyoureit/nodejs-poolController/wiki/Socat)
  * `netHost` and `netPort` - host and port for Socat connection.
* `inactivityRetry` - # of seconds the app should wait before trying to reopen the port after no communications.  If your equipment isn't on all the time or you are running a virtual controller you may want to dramatically increase the timeout so you don't get console warnings.

## Web section - controls various aspects of external communications
* `servers` - setting for different servers/services
 * `http2` - not used currently
 * `http` - primary server used for api connections without secure communications
    * `enabled` - self-explanatory
    * `ip` - The ip of the network address to listen on.  Default of `127.0.0.1` will only listen on the local loopback (localhost) adapter.  `0.0.0.0` will listen on all network interfaces.  Any other address will listen exclusively on that interface.
    * `port` - Port to listen on.  Default is `4200`.
    * `httpsRedirect` - Redirect http traffic to https
    * `authentication` - Enable basic username/password authentication.  (Not implemented yet.)
    * `authFile` - Location of the encrypted password file.  By default, `/users.htpasswd`. If you have `authentication=1` then create the file users.htpasswd in the root of the application.  Use a tool such as http://www.htaccesstools.com/htpasswd-generator/ and paste your user(s) into this file.  You will now be prompted for authentication.
 * `https` - See http options above.
    * `sslKeyFile` - Location of key file
    * `sslCertFile` - Location of certificate file
 * `mdns` - Not currently used.
 * `ssdp` - Enable for automatic configuration by the webClient and other platforms.


## Log - Different aspects of logging to the application
 * `app` - Application wide settings
    * `enabled` - Enable/disable logging for the entire application
    * `level` - Different levels of logging from least to most: 'error', 'warn', 'info', 'verbose', 'debug', 'silly'
* `packet` - Configuration for the 


# Credit

1.  @Rstrouse for helping make the 6.0 rewrite and Intellicenter possible, continuing to make monumental changes, and driving this project forward in numerous ways.  My knowledge of coding in general has benefitted greatly from working with him.
1.  [Jason Young](http://www.sdyoung.com/home/decoding-the-pentair-easytouch-rs-485-protocol) (Read both posts, they are a great baseline for knowledge)
1.  Michael Russe [ceesco](https://github.com/ceesco53/pentair_examples) [CocoonTech](http://cocoontech.com/forums/topic/13548-intelliflow-pump-rs485-protocol/?p=159671) - Registration required for CocoonTech.  Jason Young used this material for his understanding in the protocol as well.  There is a very detailed .txt file with great information ~~that I won't post unless I get permission~~. Looks like it was publicly posted to [Pastebin](http://pastebin.com/uiAmvNjG).
1.  [Michael Usner](https://github.com/michaelusner/Home-Device-Controller) for taking the work of both of the above and turning it into Javascript code.
1.  [rflemming](https://github.com/rflemming) for being the first to contribute some changes to the code.
1.  Awesome help from @arrmo and @blueman2 on Gitter

# License

nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>
