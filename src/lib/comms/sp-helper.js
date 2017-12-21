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
    var useMockBinding = false
    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: sp-helper.js')

    function init(timeOut) {
        useMockBinding = false
        if (connectionTimer!==null) {
            clearTimeout(connectionTimer)
        }
        // for testing... none wil not try to open the port
        if (timeOut!=='none') {
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
                        return logger.error('Error opening port: %s.  Will retry in 10 seconds', err.message);
                    }
                })
                sp.on('open', function () {
                    if (timeOut === 'retry_timeout') {
                        logger.info('Serial port recovering from lost connection.')
                        container.queuePacket.init()
                        container.writePacket.init()
                    }
                    else
                    if (timeOut !== 'timeout')
                        logger.verbose('Serial Port opened');

                })
                sp.on('readable', function () {
                    container.packetBuffer.push(sp.read())

                    // data = sp.read()
                    // console.log('Data in Buffer as Hex:', data);
                    // console.log('Data as JSON:', JSON.stringify(data.toJSON()))
                });

            } else {
                if (timeOut === 'timeout') {
                    logger.error('Net connect (socat) connection lost.  Will retry every %s seconds to reconnect.', container.settings.get('inactivityRetry'))
                }
                sp = new container.net.Socket();
                sp.connect(container.settings.get('netPort'), container.settings.get('netHost'), function () {
                    if (timeOut === 'retry_timeout') {
                        logger.info('Net connect (socat) recovering from lost connection.')
                        container.queuePacket.init()
                        container.writePacket.init()
                    }
                    else if (timeOut !== 'timeout')
                        logger.info('Net connect (socat) connected to: ' + container.settings.get('netHost') + ':' + container.settings.get('netPort'));
                });
                sp.on('data', function (data) {
                    //Push the incoming array onto the end of the dequeue array
                    container.packetBuffer.push(data)

                    // console.log('Data in Buffer as Hex:', data);
                    // console.log('Data as JSON:', JSON.stringify(data.toJSON()))

                });

            }
            connectionTimer = setTimeout(init, container.settings.get('inactivityRetry') * 1000, 'retry_timeout')


            // error is a common function for Net and Serialport
            sp.on('error', function (err) {
                logger.error('Error with port: %s.  Will retry in 10 seconds', err.message)
                connectionTimer = setTimeout(init, 10 * 1000)
            })

        }

    }

    //for testing
    var mockSPBinding = function(){
        useMockBinding = true
        SerialPort = require('serialport/test');
        MockBinding = SerialPort.Binding
        var portPath = 'FAKE_PORT'
        MockBinding.createPort(portPath, {echo:false, record:true})
        sp = new SerialPort(portPath)
        sp.on('open', function(){
            //container.logger.silly('Mock SerialPort is now open.')  // Commented out because during testing, this will return after we enable logging.
        })
        sp.on('readable', function () {
            container.packetBuffer.push(sp.read())
        });
        sp.on('error', function (err) {
            container.logger.error('Error with Mock SerialPort: %s.  Will retry in 10 seconds', err.message)
        })
        return sp
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
        if (connectionTimer!==null) {
            clearTimeout(connectionTimer)
        }
        if (useMockBinding){
            MockBinding.reset()
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

    var resetConnectionTimer = function(){
        if (connectionTimer!==null) {
            clearTimeout(connectionTimer)
        }
        if (!useMockBinding)
            connectionTimer = setTimeout(init, container.settings.get('inactivityRetry')*1000, 'timeout')
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
        resetConnectionTimer: resetConnectionTimer,
        mockSPBinding: mockSPBinding
    }
}


/*

sp is connecting? false
sp all Socket {
  connecting: false,
  _hadError: false,
  _handle:
   TCP {
     bytesRead: 593,
     _externalStream: {},
     fd: 16,
     reading: true,
     owner: [Circular],
     onread: [Function: onread],
     onconnection: null,
     writeQueueSize: 0 },
  _parent: null,
  _host: null,
  _readableState:
   ReadableState {
     objectMode: false,
     highWaterMark: 16384,
     buffer: BufferList { head: null, tail: null, length: 0 },
     length: 0,
     pipes: null,
     pipesCount: 0,
     flowing: true,
     ended: false,
     endEmitted: false,
     reading: true,
     sync: false,
     needReadable: true,
     emittedReadable: false,
     readableListening: false,
     resumeScheduled: false,
     defaultEncoding: 'utf8',
     ranOut: false,
     awaitDrain: 0,
     readingMore: false,
     decoder: null,
     encoding: null },
  readable: true,
  domain: null,
  _events:
   { end: { [Function: g] listener: [Function: onend] },
     finish: [Function: onSocketFinish],
     _socketEnd: [Function: onSocketEnd],
     data: [Function],
     error: [Function] },
  _eventsCount: 5,
  _maxListeners: undefined,
  _writableState:
   WritableState {
     objectMode: false,
     highWaterMark: 16384,
     needDrain: false,
     ending: false,
     ended: false,
     finished: false,
     decodeStrings: false,
     defaultEncoding: 'utf8',
     length: 0,
     writing: false,
     corked: 0,
     sync: false,
     bufferProcessing: false,
     onwrite: [Function],
     writecb: null,
     writelen: 0,
     bufferedRequest: null,
     lastBufferedRequest: null,
     pendingcb: 0,
     prefinished: false,
     errorEmitted: false,
     bufferedRequestCount: 0,
     corkedRequestsFree: CorkedRequest { next: null, entry: null, finish: [Function] } },
  writable: true,
  allowHalfOpen: false,
  destroyed: false,
  _bytesDispatched: 204,
  _sockname: null,
  _pendingData: null,
  _pendingEncoding: '',
  server: null,
  _server: null,
  read: [Function],
  _consuming: true }
 */
