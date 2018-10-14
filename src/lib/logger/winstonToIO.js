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

/*var winston = require('winston'),
    dateFormat = require('dateformat'),
    util = require('util'),*/
Bottle = require('bottlejs')
bottle = Bottle.pop('poolController-Bottle')

module.exports = function() {

    var winston = bottle.container.winston
    var dateFormat = bottle.container.dateFormat
    var util = bottle.container.util

    function init() {

        winstonToIO = winston.transports.winstonToIO = function(options) {
            this.name = 'winstonToIO'
            this.level = options.level
            this.customFormatter = options.customFormatter
        }

        util.inherits(winstonToIO, winston.Transport)

        var winstonToIOOptions = {
            level: bottle.container.settings.get('socketLogLevel') || 'debug',
            handleExceptions: true,
            humanReadableUnhandledException: true,
            customFormatter: function(level, message, meta) {
                // Return string will be passed to logger.
                return dateFormat(Date.now(), "HH:MM:ss.l") + ' ' + level.toUpperCase() + ' ' + (undefined !== message ? message.split('\n').join('<br \>') : '') +
                    (meta && Object.keys(meta).length ? '\n\t' + JSON.stringify(meta, null, '<br \>') : '');
            }
        }

        winstonToIO.prototype.log = function(level, msg, meta, callback) {
            msg = this.customFormatter ?
                this.customFormatter(level, msg, meta) :
                {
                    text: "[" + level + "] " + msg
                };
            bottle.container.io.emitDebugLog(msg)
            callback(null, true)
        }
        bottle.container.logger.add(winstonToIO, winstonToIOOptions)
    }
    return {
        init: init
    }

}
