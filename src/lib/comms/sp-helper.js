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
module.exports = function (container) {
    var logger = container.logger
    var sp
    var connectionTimer;
    var MockBinding, useMockBinding = false
    var _isOpen = false
    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: sp-helper.js')
    var emitter = new container.events.EventEmitter();

    var isOpen = function () {
        return _isOpen
    }

    function init(timeOut) {
        if (container.settings.get('suppressWrite')){
            useMockBinding = true
            Promise.resolve()
                .then(mockSPBindingAsync)
                .then(function(){
                    container.logger.info('Using MOCK serial port for replaying packets')
                })
        }
        else {
            useMockBinding = false


            if (connectionTimer !== null) {
                clearTimeout(connectionTimer)
            }
            // for testing... none will not try to open the port
            if (timeOut !== 'none') {
                if (container.settings.get('netConnect') === 0) {
                    if (timeOut === 'timeout') {
                        logger.error('Serial port connection lost.  Will retry every %s seconds to reconnect.', container.settings.get('inactivityRetry'))
                    }
                    var serialport = container.serialport
                    sp = new serialport(container.settings.get('rs485Port'), {
                        baudRate: 9600,
                        dataBits: 8,
                        parity: 'none',
                        stopBits: 1,
                        flowControl: false,
                        //parser: container.serialport.parsers.raw,
                        autoOpen: false,
                        lock: false
                    });
                    sp.open(function (err) {
                        if (err) {
                            connectionTimer = setTimeout(init, container.settings.get('inactivityRetry') * 1000)
                            _isOpen = false
                            return logger.error('Error opening port: %s.  Will retry in 10 seconds', err.message);
                        }
                    })
                    sp.on('open', function () {
                        if (timeOut === 'retry_timeout' || timeOut === 'timeout') {
                            logger.info('Serial port recovering from lost connection.')
                        }
                        else {
                            logger.verbose('Serial Port opened');
                        }
                        container.queuePacket.init()
                        container.writePacket.init()
                        _isOpen = true

                    })
                    sp.on('readable', function () {

                        var buf = sp.read()
                        // console.log('Data as JSON:', JSON.stringify(buf.toJSON()))

                        // container.packetBuffer.push(buf)
                        emitter.emit('packetread', buf)
                        // data = sp.read()
                        // console.log('Data in Buffer as Hex:', data);
                        resetConnectionTimer()
                    });

                } else {
                    if (timeOut === 'timeout') {
                        logger.error('Net connect (socat) connection lost.  Will retry every %s seconds to reconnect.', container.settings.get('inactivityRetry'))
                    }
                    sp = new container.net.Socket();
                    sp.connect(container.settings.get('netPort'), container.settings.get('netHost'), function () {
                        if (timeOut === 'retry_timeout' || timeOut === 'timeout') {
                            logger.info('Net connect (socat) recovering from lost connection.')
                        }
                        logger.info('Net connect (socat) connected to: ' + container.settings.get('netHost') + ':' + container.settings.get('netPort'));

                        container.queuePacket.init()
                        container.writePacket.init()
                        _isOpen = true
                    });
                    sp.on('data', function (data) {
                        //Push the incoming array onto the end of the dequeue array
                        // container.packetBuffer.push(data)
                        emitter.emit('packetread', data)
                        // console.log('Data in Buffer as Hex:', data);
                        // console.log('Data as JSON:', JSON.stringify(data.toJSON()))
                        resetConnectionTimer()
                    });

                }
                connectionTimer = setTimeout(init, container.settings.get('inactivityRetry') * 1000, 'retry_timeout')


                // error is a common function for Net and Serialport
                sp.on('error', function (err) {
                    logger.error('Error with port: %s.  Will retry in 10 seconds', err.message)
                    connectionTimer = setTimeout(init, 10 * 1000)
                    _isOpen = false
                })

            }
        }

    }

    //for testing and replaying
    var mockSPBindingAsync = function () {
        return new Promise(function (resolve, reject) {
            useMockBinding = true
            _isOpen = true
            SerialPort = require('serialport/test');
            MockBinding = SerialPort.Binding
            var portPath = 'FAKE_PORT'
            MockBinding.createPort(portPath, {echo: false, record: true})
            sp = new SerialPort(portPath)
            sp.on('open', function () {
                container.logger.silly('Mock SerialPort is now open.')
                resolve(sp)
            })
            sp.on('readable', function () {
                // container.packetBuffer.push(sp.read())
                emitter.emit('packetread', sp.read())
                resetConnectionTimer()
            });
            sp.on('error', function (err) {
                container.logger.error('Error with Mock SerialPort: %s.  Will retry in 10 seconds', err.message)
            })
        })
    }

    var writeNET = function (data, type, callback) {
        sp.write(data, type, callback)

    }

    var writeSP = function (data, callback) {
        sp.write(data, callback)


    }

    var drainSP = function (callback) {
        sp.drain(callback)
    }

    var close = function (callback) {
        _isOpen = false
        if (connectionTimer !== null) {
            clearTimeout(connectionTimer)
        }
        if (useMockBinding) {
            if (sp.isOpen) {
                container.logger.silly('Resetting SerialPort Mock Binding')
                MockBinding.reset()
                useMockBinding = false
            }
            else
                container.logger.silly('Tried to Reset SerialPort Mock Binding, but it is not open.')
        }
        else {
            // TODO: following was over complicated due to testing inaccuracies.  Might be able to simplify this moving forward.
            if (sp !== undefined) {
                if (container.settings.get('netConnect') === 0) {
                    if (!sp.destroy) {
                        sp.close(function (err) {
                            if (err) {
                                return "Error closing sp: " + err
                            } else {
                                return "Serialport closed."
                            }
                        })

                    }
                } else {
                    sp.destroy()
                    container.logger.debug('Net socket closed')
                }

            }
        }
    }

    var resetConnectionTimer = function () {
        if (connectionTimer !== null) {
            clearTimeout(connectionTimer)
        }
        if (!useMockBinding)
            connectionTimer = setTimeout(init, container.settings.get('inactivityRetry') * 1000, 'timeout')
    }

    function getEmitter() {
        return emitter
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
        //resetConnectionTimer: resetConnectionTimer,
        mockSPBindingAsync: mockSPBindingAsync,
        isOpen: isOpen,
        getEmitter: getEmitter
    }
}

