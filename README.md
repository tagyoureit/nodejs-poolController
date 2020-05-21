# nodejs-poolController - Version 6.0.0



## What is nodejs-poolController

nodejs-poolController is an application to communicate and control your Pentair compatible pool equipment.

 Want to include a low cost controller for your pool?
 Want a web interface for your system?
 Want to turn your pumps on remotely?
 Want to have your home automation system talk to your pool?
 Want to control your pumps or chlorinator without a pool controller?

 Controllers:  IntelliCenter, Intellitouch, EasyTouch, Intermatic, SunTouch, IntellicomII
 Pumps: Intelliflow, older models
 Chlorinator: Intellichlor, Aqua-Rite and OEM brands
 Home Automation:  ISY.  (Soon to include Siri, Echo, more?)

## What's new in 6.0?

In short, everything!  6.0 is a complete re-write of the application.  Huge props to @rstrouse for his wisdom and guidance in refactoring the code.

1. IntelliCenter - now supported
1. Configuring and running the app - all new.  Start over with the Installation instructions.
1. Automatic detection of your pool equipment.  Previous versions of the app would detect the configuration of your pool but you still had to tell the app if you had IntelliTouch/EasyTouch/IntelliCom.  This is now done automatically.
1. Configuration and state information.  Config.json now only stores information related to the configuration of the app.  There are separate files in the /data directory that store (and persist) pool configuration and state information.
1. API's - completely changed.  See separate API documentation (*link here)
1. Sockets - Now more granular to make the web app more responsive
1. Web app - Now a separate installion for a true client/server metaphore.

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

 <a name="module_nodejs-poolController--install"></a>


## Installation Instructions

**This code requires a physical [RS485](https://github.com/tagyoureit/nodejs-poolController/wiki/RS-485-Adapter-Details) adapter to work.**

**This is only the server code.  See [clients](#module_nodejs-poolController--clients) below for web or other ways to read/control the pool equipment.** 

### Prerequisites
If you don't know anything about NodeJS, these directions might be helpful.

1. Install Nodejs. (https://nodejs.org/en/download/)
1. Update NPM (https://docs.npmjs.com/getting-started/installing-node).
1. Download the latest [code release](https://github.com/tagyoureit/nodejs-poolController/releases)
   OR
   clone with `git clone git@github.com:tagyoureit/nodejs-poolController.git`
1. Unzip into nodejs-poolController.
1. Run 'npm install' in the new folder (where package.json exists).  This will automatically install all the dependencies (serial-port, express, sockets.io, etc).
1. Run the app with 'npm start'* (again, in the root directory). It should now run properly.
   * to run with a specific configuration, run `node index.js arg` where arg is the name of your current config file. eg `npm start configCustomized.json`.  By default, the app will load `config.json`.

## Docker instructions
@wurmr created Docker [Dockerfile](https://hub.docker.com/r/wurmr/nodejs-pool-controller) and [pre-built containers](https://github.com/wurmr/nodejs-poolController-docker).

**UPDATE THIS AND PACKAGE.JSON SCRIPTS**


## Support

For support you can open a [github issue](https://github.com/tagyoureit/nodejs-poolController/issues/new),
for discussions, designs, and clarifications, we recommend you join our [Gitter Chat room](https://gitter.im/pentair_pool/Lobby).

 <a name="module_nodejs-poolController--clients"></a>
## Clients
To do anything with this app, you need a client to connect to it.  A client can be a web application or Home Automation system.

### Web Clients
1. [nodejs-poolControl.dashPanel](https://github.com/rstrouse/nodejs-poolControl.dashPanel).  This is built primarily around the IntelliCenter but will work with *Touch.
1. [nodejs-poolController-webClient](http://github.com/tagyoureit/nodejs-poolController-webClient).  Built primarily around EasyTouch/IntelliTouch but will work with other systems.

* This app has the default to only listen to clients from localhost (127.0.0.1).  If you need to have clients connect from other machines you will need to change the [ip](#module_nodejs-poolController--config.json) in `config.json`.


### Home Automation Integrations
**NOTE: Existing integrations built of 5.3 or earlier WILL NOT WORK.  They need to be upgraded to leverage 6.0.  **

Ready for 6.0;
* [Vera Home Automation Hub](https://github.com/rstrouse/nodejs-poolController-veraPlugin) - A plugin that integrates with nodejs-poolController.
* Alpha - SmartThings integration script.  Run [this](https://github.com/tagyoureit/nodejs-poolController-webClient/tree/master/scripts) file directly from the command line.  Check the IP inside the script.
* [SmartThings](https://github.com/tagyoureit/nodejs-poolController/tree/next) by @bsileo (prev help from @johnny2678, @donkarnag, @arrmo)

Need to be updated:
* [Homebridge/Siri](https://github.com/leftyfl1p/homebridge-poolcontroller) by @leftyfl1p
* [Another SmartThings Controller](https://github.com/dhop90/pentair-pool-controller/blob/master/README.md) by @dhop90
* [ISY](src/integrations/socketISY.js).  Original credit to @blueman2, enhancements by @mayermd
* [ISY Polyglot NodeServer](https://github.com/brianmtreese/nodejs-pool-controller-polyglotv2) created by @brianmtreese
* [MQTT](https://github.com/crsherman/nodejs-poolController-mqtt) created by @crsherman.
* InfluxDB

# Changed/dropped since 5.3
1. Ability to load different config.json files
1. Automatic upgrade of config.json files (tbd)
1. Automatic version notification of newer releases available (tbd)
1. Most of the output to console has been eliminited.


<a name="module_nodejs-poolController--config.json"></a>
# Config.json changes

## Controller section - changes to the communications for the app
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


## Services - None currently available

## Log - Different aspects of logging to the application
 * `app` - Application wide settings
    * `enabled` - Enable/disable logging for the entire application
    * `level` - Different levels of logging from least to most: 'error', 'warn', 'info', 'verbose', 'debug', 'silly'
* `packet` - Configuration for the 

# Credit

1.  @Rstrouse for helping make the 6.0 rewrite and Intellicenter possible.  My knowledge of coding in general has benefitted greatly from working with him.
1.  [Jason Young](http://www.sdyoung.com/home/decoding-the-pentair-easytouch-rs-485-protocol) (Read both posts, they are a great baseline for knowledge)
1.  Michael Russe [ceesco](https://github.com/ceesco53/pentair_examples) [CocoonTech](http://cocoontech.com/forums/topic/13548-intelliflow-pump-rs485-protocol/?p=159671) - Registration required for CocoonTech.  Jason Young used this material for his understanding in the protocol as well.  There is a very detailed .txt file with great information ~~that I won't post unless I get permission~~. Looks like it was publicly posted to [Pastebin](http://pastebin.com/uiAmvNjG).
1.  [Michael Usner](https://github.com/michaelusner/Home-Device-Controller) for taking the work of both of the above and turning it into Javascript code.
1.  [rflemming](https://github.com/rflemming) for being the first to contribute some changes to the code.
1.  Awesome help from @arrmo and @blueman2 on Gitter
