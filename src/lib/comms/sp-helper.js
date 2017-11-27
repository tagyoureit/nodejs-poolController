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

/*istanbul ignore next */
module.exports = function(container) {
    var logger = container.logger
    var sp
    var connectionTimer;
    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: sp-helper.js')

    function init(timeOut) {
        if (connectionTimer!==null) {
            clearTimeout(connectionTimer)
        }
        if (container.settings.netConnect === 0) {
            if (timeOut==='timeout'){
                logger.error('Serial port connection lost.  Will retry every %s seconds to reconnect.', container.settings.inactivityRetry)
            }
            var serialport = container.serialport
            sp = new serialport(container.settings.rs485Port, {
                baudrate: 9600,
                databits: 8,
                parity: 'none',
                stopBits: 1,
                flowControl: false,
                //parser: container.serialport.parsers.raw,
                autoOpen: false,
                lock: false
            });
            sp.open(function(err) {
                if (err) {
                    connectionTimer = setTimeout(init, 10*1000)
                    return logger.error('Error opening port: %s.  Will retry in 10 seconds', err.message);
                }
            })
            sp.on('open', function() {
                if (timeOut==='retry_timeout')
                    logger.verbose('Serial port not receiving data.  Will retry connection...')
                else if (timeOut!=='timeout')
                    logger.verbose('Serial Port opened');


            })
        } else {
            if (timeOut==='timeout'){
                logger.error('Net connect (socat) connection lost.  Will retry every %s seconds to reconnect.',container.settings.inactivityRetry)
            }
            sp = new container.net.Socket();
            sp.connect(container.settings.netPort, container.settings.netHost, function() {
                if (timeOut==='retry_timeout')
                    logger.verbose('Net connect (socat) not receiving data.  Will retry connection...')
                else if (timeOut!=='timeout')
                    logger.info('Net connect (socat) connected to: ' + container.settings.netHost + ':' + container.settings.netPort);
            });

            // sp.setTimeout(container.settings.inactivityRetry*1000, function(){
            //     sp.destroy()
            //     if (timeOut==='timeout')
            //         init('retry_timeout')
            //     else
            //         init('timeout')
            // })
            // sp.on('timeout',function(){
            //     console.log('serial port net connect timeout')
            // })

        }
        connectionTimer = setTimeout(init, container.settings.inactivityRetry*1000, 'retry_timeout')



        sp.on('data', function(data) {
            //Push the incoming array onto the end of the dequeue array
            //bufferArrayOfArrays.push(Array.prototype.slice.call(data));
            //process.stdout.write(JSON.stringify(data.toJSON())  + '\n');
            container.packetBuffer.push(data)

            //console.log(JSON.stringify(data.toJSON()))
            //console.log(data)

        });
        sp.on('error', function(err) {
            logger.error('Error with port: %s.  Will retry in 10 seconds', err.message)
            connectionTimer = setTimeout(init, 10*1000)
        })




        //TEST function:  This function should simply output whatever comes into the serialport.  Comment out the one above and use this one if you want to test what serialport logs.
        /*
        var bufferArrayOfArrays = [];
        sp.on('data', function (data) {
            console.log('Input: ', JSON.stringify(data.toJSON().data) + '\n');
            bufferArrayOfArrays.push(Array.prototype.slice.call(data));
            console.log('Array: \n[[%s]]\n\n', bufferArrayOfArrays.join('],\n['))

        });*/



    }

    var writeNET = function(data, type, callback) {
        sp.write(data, type, callback)

    }

    var writeSP = function(data, callback) {
        sp.write(data, callback)
    }

    var drainSP = function(callback){
        sp.drain(callback)
    }

    var close = function(callback) {
        if (container.settings.netConnect === 0) {
            sp.close(function(err) {
                if (err) {
                    return "Error closing sp: " + err
                } else {
                    return "Serialport closed."
                }
            })
        } else {
            sp.end()
            sp.destroy()
            //console.log('sp destroyed?; ', sp.destroyed)
        }

    }

    var resetConnectionTimer = function(){
        if (connectionTimer!==null) {
            clearTimeout(connectionTimer)
        }
        // if (container.settings.netConnect === 0)
        connectionTimer = setTimeout(init, container.settings.inactivityRetry*1000, 'timeout')
    }


    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: sp-helper.js')


    return {
        //sp: sp,
        init: init,
        writeNET: writeNET,
        writeSP: writeSP,
        drainSP: drainSP,
        close: close,
        resetConnectionTimer: resetConnectionTimer
    }
}
