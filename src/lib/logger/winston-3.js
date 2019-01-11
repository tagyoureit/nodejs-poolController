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


module.exports = function (container) {
    /*istanbul ignore next */
    if (container.logModuleLoading)
        console.log('Loading: winston-helper.js')

    var dateFormat = container.dateFormat

    var path = require('path').posix

    var logger, packetLogger
    const {createLogger, format, transports} = container.winston;
    const {combine, timestamp, printf} = format;
    const logform = require('logform')
    const { MESSAGE } = require('triple-beam')
    const myFormat = printf(info => {
        info.timestamp = dateFormat(Date.now(), "m/d/yy HH:MM:ss.l")
        // if (info)
//        container._. // split out meta from standard fields here???
        return `${info.timestamp} ${info.level}: ${info.message}`;
    });



    const processObj = logform.format(info => {
            //console.log('raw info: ', info)
            return info
        }
    )


    var init = function () {
        //
        // logger = winston.createLogger({
        //     transports: [
        //         new (winston.transports.Console)({
        //             timestamp: function () {
        //                 return dateFormat(Date.now(), "HH:MM:ss.l");
        //             },
        //             formatter: function (options) {
        //                 // Return string will be passed to logger.
        //                 return options.timestamp() + ' ' + winston.config.colorize(options.level, options.level.toUpperCase()) + ' ' + (undefined !== options.message ? options.message : '') +
        //                     (options.meta && Object.keys(options.meta).length ? '\n\t' + JSON.stringify(options.meta) : '');
        //             },
        //             colorize: true,
        //             level: container.settings.get('logLevel') || 'info',
        //             stderrLevels: [],
        //             handleExceptions: true,
        //             humanReadableUnhandledException: true
        //         })
        //     ]
        // });


        logger = createLogger({
            level: container.settings.get('logLevel') || 'info',
            format: combine(
                //processObj(),
                //format.json(),
                timestamp({format: () => new Date().toLocaleString()}),
                format.colorize(),
                //format.simple(),
                //format.align(),

                format.splat(),
                format.captureAllMeta(),

                format.simple()//,
                //myFormat
            ),
            handleExceptions: true,
            transports: [new transports.Console()]
        });
        // logger.exceptions.handle()
        logger.exitOnError = false;

        var fileLogEnable = 0
        if (container.settings.has('fileLog.enable')) {
            fileLogEnable = container.settings.get('fileLog.enable')
        }
        if (fileLogEnable) {
            var _level = container.settings.get('fileLog.fileLogLevel')
            var file = path.join(process.cwd(), container.settings.get('fileLog.fileName'))

            // var options = {
            //     timestamp: function () {
            //         return dateFormat(Date.now(), "HH:MM:ss.l");
            //     },
            //     level: _level,
            //     formatter: function (options) {
            //         // Return string will be passed to logger.
            //         return options.timestamp() + ' ' + options.level.toUpperCase() + ' ' + (undefined !== options.message ? options.message : '') +
            //             (options.meta && Object.keys(options.meta).length ? '\n\t' + JSON.stringify(options.meta) : '');
            //     },
            //     filename: file,
            //     colorize: false,
            //     json: false
            // }
            // logger.add(winston.transports.File, options)

            logger.add(new container.winston.transports.File({
                    filename: file,
                    format: combine(
                        timestamp({format: () => new Date().toLocaleString()}),
                        format.uncolorize(),
                        format.simple(),
                        //format.align(),
                        format.splat(),
                        myFormat
                    )
                })
            )

        }

        if (container.settings.get('capturePackets')) {
            var packetLevel = container.settings.get('fileLog.fileLogLevel')
            var packetFile = path.join(process.cwd(), 'packetCapture.json')

            packetLogger = createLogger(
                {
                    level: 'info',
                    transports: [new transports.File({filename: packetFile})],
                    handleExceptions: false,
                    format: combine(
                        //format.json(),
                        format(function (info, opts) {
                            // console.log('info[MESSAGE] %j', info.message)
                            info[MESSAGE] = JSON.stringify(info.message)
                            return info;
                        })()

                        //     //format.align(),
                        //     //format.json(),
                        //     // container.winston.format(info => {
                        //     //     return `{`
                        //     // })
                        //     // printf((info) => {
                        //     //     info[MESSAGE] = `{ chatter:${info.chatter}, counter:${info.counter}`
                        //     //         info.message = info[MESSAGE]
                        //     //     // chatter: chatter,
                        //     //     //     counter: counter,
                        //     //     //     packetType: packetType,
                        //     //     //     direction: 'inbound'
                        //     //     return info;
                        //     // })
                        //     format.simple()
                    )

                })

        }

    }

    function packet(msg){
        packetLogger.info(msg)
    }

    // function error(msg) {
    //     if (logger === undefined) {
    //         console.log('Error ', arguments)
    //     }
    //     else
    //         logger.error.apply(this, arguments)
    // }

    function warn(msg) {
        if (logger === undefined) {
            console.log('Warn ', arguments)
        }
        else
            logger.warn.apply(this, arguments)
    }

    function silly(msg) {
        if (logger === undefined) {
            init()

            logger.silly.apply(this, arguments)
        }
        else
            logger.silly.apply(this, arguments)
    }

    function debug(msg) {
        if (logger === undefined) {
            console.log('Debug ', arguments)
        }
        else
            logger.debug.apply(this, arguments)
    }

    function verbose(msg) {
        if (logger === undefined) {
            console.log('Verbose ', arguments)
        }
        else
            logger.verbose.apply(this, arguments)
    }

    function info(msg) {
        if (logger === undefined) {
            console.log('Info ', arguments)
        }
        else
            logger.info.apply(this, arguments)
    }

    function changeLevel(transport, lvl) {
        //when testing, we may call this first
        if (logger === undefined) {
            //init() //calling init here may lead to retrieving settings which we don't have yet... so print a message and move on
            console.log('Error trying to call changeLevel when winston is not yet initialized')

        }
        else {
            trnspt = logger.transports.find(transport => {
                //console.log('transport: %j', transport)
                return transport.name === 'console'

            });
            trnspt.level = lvl
        }
    }

    function add(transport, options) {
        logger.add(transport, options)
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        logger.info('Loaded: winston-helper.js')

    return {
        init: init,
       // error: error,
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
