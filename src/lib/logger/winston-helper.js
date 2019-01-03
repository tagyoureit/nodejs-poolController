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

module.exports = function (container) {
    /*istanbul ignore next */
    if (container.logModuleLoading)
        console.log('Loading: winston-helper.js')

    var winston = container.winston,
        dateFormat = container.dateFormat

    var path = require('path').posix

    var logger, packetLogger

    var init = function () {

        if (container.settings.isReady()) {
            console.log('Winstion initializing with customized settings.')

            logger = new (winston.Logger)({
                transports: [
                    new (winston.transports.Console)({
                        timestamp: function () {
                            return dateFormat(Date.now(), "HH:MM:ss.l");
                        },
                        formatter: function (options) {
                            // Return string will be passed to logger.
                            return options.timestamp() + ' ' + winston.config.colorize(options.level, options.level.toUpperCase()) + ' ' + (undefined !== options.message ? options.message : '') +
                                (options.meta && Object.keys(options.meta).length ? '\n\t' + JSON.stringify(options.meta) : '');
                        },
                        colorize: true,
                        level: container.settings.get('logLevel') || 'info',
                        stderrLevels: [],
                        handleExceptions: true,
                        humanReadableUnhandledException: true
                    })
                ]
            });

            var fileLogEnable = 0
            if (container.settings.has('fileLog.enable')) {
                fileLogEnable = container.settings.get('fileLog.enable')
            }
            if (fileLogEnable) {
                var _level = container.settings.get('fileLog.fileLogLevel')
                var file = path.join(process.cwd(), container.settings.get('fileLog.fileName'))

                var options = {
                    timestamp: function () {
                        return dateFormat(Date.now(), "HH:MM:ss.l");
                    },
                    level: _level,
                    formatter: function (options) {
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


            if (container.settings.get('capturePackets')) {
                packetLogger = new (winston.Logger)({
                    transports: [
                        new (winston.transports.File)({
                            formatter: function (options) {
                                // Return string will be passed to logger.
                                return JSON.stringify(options.message);
                            },
                            colorize: false,
                            level: 'info',
                            handleExceptions: true,
                            humanReadableUnhandledException: false,
                            json: true,
                            filename: path.join(process.cwd(), 'replay/packetCapture.json')
                        })
                    ]
                });
            }


        }
        else {
            console.log('Winstion initializing with default settings.')
            // initialize winston with defaults
            logger = new (winston.Logger)({
                transports: [
                    new (winston.transports.Console)({
                        timestamp: function () {
                            return dateFormat(Date.now(), "HH:MM:ss.l");
                        },
                        formatter: function (options) {
                            // Return string will be passed to logger.
                            return options.timestamp() + ' ' + winston.config.colorize(options.level, options.level.toUpperCase()) + ' ' + (undefined !== options.message ? options.message : '') +
                                (options.meta && Object.keys(options.meta).length ? '\n\t' + JSON.stringify(options.meta) : '');
                        },
                        colorize: true,
                        level: 'info',
                        stderrLevels: [],
                        handleExceptions: true,
                        humanReadableUnhandledException: true
                    })
                ]
            });
        }
    }

      function error(msg){
         if (logger===undefined){
             init()
         }
         logger.error.apply(this, arguments)
     }
 
     function warn(msg){
        if (logger===undefined){
            init()
        }
             logger.warn.apply(this, arguments)
     }
     function silly(msg){
        if (logger===undefined){
            init()
        }
             logger.silly.apply(this, arguments)
     }
     function debug(msg){
        if (logger===undefined){
            init()
        }
             logger.debug.apply(this, arguments)
     }
     function verbose(msg){
        if (logger===undefined){
            init()
        }
             logger.verbose.apply(this, arguments)
     }
     function info(msg){
        if (logger===undefined){
            init()
        }
             logger.info.apply(this, arguments)
     } 

    function changeLevel(transport, lvl) {
        //when testing, we may call this first
        if (logger === undefined) {
            //init() //calling init here may lead to retrieving settings which we don't have yet... so print a message and move on
            console.log('Error trying to call changeLevel when winston is not yet initialized')

        }
        else {
            logger.transports[transport].level = lvl;
        }
    }
    function add(transport, options) {
        logger.add(transport, options)
    }

    function packet(msg) {
        packetLogger.info.apply(this, arguments)
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        logger.info('Loaded: winston-helper.js')

    return {
        init: init,
        error: error,
        warn: warn,
        silly: silly,
        debug: debug,
        verbose: verbose,
        info: info, 
        changeLevel: changeLevel,
        add: add,
        packet: packet
    }

}
