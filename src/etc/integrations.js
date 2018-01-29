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

var Bottle = require('bottlejs');
var bottle = Bottle.pop('poolController-Bottle');
var fs = bottle.container.fs
var path = require('path')
//var glob = require('glob')


if (bottle.container.logModuleLoading)
    console.log('Loading: integrations.js')


//var configFile = bottle.container.settings.getConfig();

//['../integrations'].forEach(dir)

//from http://stackoverflow.com/a/28289589
// async version with basic error handling
function walk(currentDirPath, callback) {
    //console.log('dir:', __dirname)
    fs.readdir(currentDirPath, function(err, files) {
        if (err) {
            throw new Error(err);
        }
        files.forEach(function(name) {
            var filePath = path.join(currentDirPath, name);
            var stat = fs.statSync(filePath);
            if (stat.isFile()) {
                callback(filePath, name, stat);
            } else if (stat.isDirectory()) {
                walk(filePath, callback);
            }
        });
    });
}

function stripJS(name) {
    var arrayOfStrings;
    arrayOfStrings = name.split('.')
    if (arrayOfStrings.length > 2) {
        bottle.container.logger.error('Please only use integration names with no "." other than "*.js".  Error with %s', name)
        process.exit(1)
    }
    return arrayOfStrings[0]
}


var init = exports.init = function() {
    walk(__dirname + '/../integrations', function(filePath, name, stat) {
        if (name.substr(-3)==='.js') {
            var shortName = stripJS(name)
            if (bottle.container.settings.get('integrations')[shortName] === 1) {
                bottle.factory(shortName, require(filePath)) //add the integration to Bottle
                bottle.digest(["'" + shortName + "'"]) //Initialize the integration immediately
                bottle.container[shortName].init()
            }
        }
    });
}


if (bottle.container.logModuleLoading)
    console.log('Loaded: integrations.js')
