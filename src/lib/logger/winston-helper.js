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

//var winston = require('winston'),
//  dateFormat = require('dateformat'),
//  util = require('util')

module.exports = function(container) {
    /*istanbul ignore next */
    if (container.logModuleLoading)
        console.log('Loading: winston-helper.js')

    var winston = container.winston,
        dateFormat = container.dateFormat



    var logger

    var init = function(){
        logger = new(winston.Logger)({
            transports: [
                new(winston.transports.Console)({
                    timestamp: function() {
                        return dateFormat(Date.now(), "HH:MM:ss.l");
                    },
                    formatter: function(options) {
                        // Return string will be passed to logger.
                        return options.timestamp() + ' ' + winston.config.colorize(options.level, options.level.toUpperCase()) + ' ' + (undefined !== options.message ? options.message : '') +
                            (options.meta && Object.keys(options.meta).length ? '\n\t' + JSON.stringify(options.meta) : '');
                    },
                    colorize: true,
                    level: container.settings.get('logLevel'),
                    stderrLevels: []
                })
            ]
        });

        if (container.settings.get('fileLog').enable === 1) {
            var path = require('path').posix
            var _level = container.settings.get('fileLog.fileLogLevel')
            var file = path.join(process.cwd(), container.settings.get('fileLog.fileName'))

            var options = {
                timestamp: function() {
                    return dateFormat(Date.now(), "HH:MM:ss.l");
                },
                level: _level,
                formatter: function(options) {
                    // Return string will be passed to logger.
                    return options.timestamp() + ' ' + options.level.toUpperCase() + ' ' + (undefined !== options.message ? options.message : '') +
                        (options.meta && Object.keys(options.meta).length ? '\n\t' + JSON.stringify(options.meta) : '');
                },
                filename: file,
                colorize: false,
                json: false
            }
            logger.add(winston.transports.File, options)
        }

    }

    function error(msg){
        logger.error.apply(this, arguments)
    }

    function warn(msg){
        logger.warn.apply(this, arguments)
    }
    function silly(msg){
        logger.silly.apply(this, arguments)
    }
    function debug(msg){
        logger.debug.apply(this, arguments)
    }
    function verbose(msg){
        logger.verbose.apply(this, arguments)
    }
    function info(msg){
        logger.info.apply(this, arguments)
    }

    function changeLevel(transport, lvl){
        //when testing, we may call this first
        if (logger===undefined)
            init()
        logger.transports[transport].level = lvl;
    }
    function add(transport, options){
        logger.add(transport, options)
    }
    /*istanbul ignore next */
    if (container.logModuleLoading)
        logger.info('Loaded: winston-helper.js')

    return {
        init:init,
        error: error,
        warn: warn,
        silly: silly,
        debug: debug,
        verbose: verbose,
        info: info,
        changeLevel: changeLevel,
        add: add
    }

}
