'use strict';

var serialport = require('serialport');
//var port = new SerialPort('/dev/ttyUSB0');

var port = new serialport("/dev/ttyUSB1", {
    baudrate: 9600,
    databits: 8,
    parity: 'none',
    stopBits: 1,
    flowControl: false,
    parser: serialport.parsers.raw
});

var b = ' ';
port.on('data', function (data) {
    b += data.toJSON();
    //console.log('Received: \t', data.toString());
    if (b.length>25){
        console.log('Received: ', b.toString());
    }
});