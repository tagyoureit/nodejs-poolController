#!/usr/bin/env node
'use strict';

var SerialPort = require('serialport');
var args = require('commander');

args
    .usage('-p <port> [options]')
    .description('A basic terminal interface for communicating over a serial port. Pressing ctrl+c exits.')
    .option('-l --list', 'List available ports then exit')
    // TODO make the port not a flag as it's always required
    .option('-p, --port, --portname <port>', 'Path or Name of serial port')
    .option('-b, --baud <baudrate>', 'Baud rate default: 9600', parseInt, 9600)
    .option('--databits <databits>', 'Data bits default: 8', parseInt, 8)
    .option('--parity <parity>', 'Parity default: none', 'none')
    .option('--stopbits <bits>', 'Stop bits default: 1', parseInt, 1)
    .option('--xp', 'Exclude pump messages', false)
    .option('--xs', 'Exclude status messages', false)
    .option('--xc', 'Exclude chlorinator messages', false)
    .option('--xi', 'Exclude invalid messages', false)
    .option('--xa [action]', 'Exclude an action')
    .option('--echo --localecho', 'Print characters as you type them.')
    .parse(process.argv);

function listPorts() {
    SerialPort.list(function (err, ports) {
        if (err) {
            console.error('Error listing ports', err);
        } else {
            ports.forEach(function (port) {
                console.log(port.comName + '\t' + (port.pnpId || '') + '\t' + (port.manufacturer || ''));
            });
        }
    });
}

if (args.list) {
    console.log(listPorts());
}

if (!args.port) {
    args.outputHelp();
    args.missingArgument('port');
    process.exit(-1);
}

var openOptions = {
    baudRate: args.baud,
    dataBits: args.databits,
    parity: args.parity,
    stopBits: args.stopbits
};
var msgOptions = {
    exclude: {
        status: args.xs || false,
        chlor: args.xc || false,
        invalid: args.xi || false,
        pump: args.xp || false,
        actions: []
    }
};
for (var a = 0; a < args.rawArgs.length; a++) {
    if (args.rawArgs[a] === '--xa' && a < args.rawArgs.length - 1) msgOptions.exclude.actions.push(parseInt(args.rawArgs[a + 1], 10));
}
function msg(bytes) {
    this.protocol = 'Unknown';
    this.timestamp = new Date();
    this.padding = [];
    this.preamble = [];
    this.header = [];
    this.payload = [];
    this.term = [];
    this.action = -1;
    this.isValid = true;
    this.isComplete = false;
    this.sub = -1;
    this.source = -1;
    this.dest = -1;
    this.sum = 0;
    this.datalen = 0;
    this.chkHi = 0;
    this.chkLo = 0;
    this.payloadLen = 0;
    this.pktCount = 0;
    this.readHeader = function (bytes, ndx) {
        if (bytes.length > 2 && bytes[0] === 16 && bytes[1] === 2) {
            this.preamble = [16, 2];
            this.protocol = 'Chlorinator';
            this.action = 0;
            ndx = 2;
        }
        else if (bytes.length >= 8) {
            //[255, 0, 255, 165, 0, 96, 16, 4, 1, 255, 2, 25]
            for (ndx = ndx; ndx < bytes.length - 1;) {
                if (bytes[ndx] === 255 && bytes[ndx + 1] === 255) {
                    this.padding.push(bytes[ndx++]);
                }
                else if (bytes[ndx] === 255 && bytes[ndx + 1] === 0 && bytes[ndx + 2] === 255 && bytes[ndx + 3] === 165) {
                    this.preamble = [255, 0, 255, 165];
                    this.protocol = 'Broadcast';
                    ndx += 4;
                    if (ndx < bytes.length) {
                        this.header.push(bytes[ndx]);
                        this.sub = bytes[ndx++];
                    }
                    if (ndx < bytes.length) {
                        this.header.push(bytes[ndx]);
                        this.dest = bytes[ndx++];
                    }
                    if (ndx < bytes.length) {
                        this.header.push(bytes[ndx]);
                        this.source = bytes[ndx++];
                    }
                    if (ndx < bytes.length) {
                        this.header.push(bytes[ndx]);
                        this.action = bytes[ndx++];
                    }
                    if (ndx < bytes.length) {
                        this.header.push(bytes[ndx]);
                        this.datalen = bytes[ndx++];
                    }
                    this.sum = 165 + this.sub + this.dest + this.source + this.action + this.datalen;
                    break;
                }
                else
                    ndx++;
            }
        }
        else {
            // Invalid packet
            this.isValid = false;
            this.isComplete = true;
            this.payload = bytes;
        }
        return ndx;
    };
    this.readData = function (bytes, ndx) {
        this.pktCount++;
        //if (!this.isValid || this.protocol === 'Unknown') return ndx;
        switch (this.protocol) {
            case 'Chlorinator':
                for (ndx = ndx; ndx < bytes.length;) {
                    if (ndx < bytes.length - 2 && bytes[ndx + 1] === 16 && bytes[ndx + 2] === 3) break; // ndx now points to the checksum.
                    else {
                        this.sum += bytes[ndx];
                        this.payload.push(bytes[ndx]);
                        this.datalen++;
                    }
                    ndx++;
                }
                break;
            case 'Broadcast':
                for (ndx = ndx; ndx < bytes.length && this.payload.length < this.datalen;) {
                    this.sum += bytes[ndx];
                    this.payload.push(bytes[ndx++]);
                    if (this.payload.length >= this.datalen) break; // The next byte will be the checksum.
                }
                this.isComplete = this.payload.length >= this.datalen;
                break;
            default:
                this.isComplete = true;
                break;
        }
        this.payloadLen = this.payload.length;
        return ndx;
    };
    this.readChecksum = function (bytes, ndx) {
        if (ndx >= bytes.length) return ndx;
        switch (this.protocol) {
            case 'Chlorinator':
                if (ndx < bytes.length - 2 && bytes[ndx + 1] === 16 && bytes[ndx + 2] === 3)
                    this.term = [16, 3];
                this.source = 2;
                this.dest = 15;
                this.chkHi = bytes[ndx++];
                ndx += 2;
                this.isComplete = true;
                this.isValid = this.chkHi === this.sum + 18;
                break;
            case 'Broadcast':
                if (this.payload.length >= this.datalen) {
                    if (ndx < bytes.length) this.chkHi = bytes[ndx++];
                    if (ndx < bytes.length) this.chkLo = bytes[ndx++];
                    this.isComplete = true;
                    this.isValid = (this.chkHi * 256) + this.chkLo === this.sum;
                    this.term = [this.chkHi, this.chkLo];
                }
                break;
        }
        return ndx;
    };
    this.readPacket = function (bytes) {
        var ndx = this.readHeader(bytes, 0);
        ndx = this.readData(bytes, ndx);
        ndx = this.readChecksum(bytes, ndx);
        return ndx;
    };
    this.mergeBytes = function (bytes) {
        var ndx = this.readData(bytes, 0);
        ndx = this.readChecksum(bytes, ndx);
    };
    this.compareTo = function (pkt) {
        if (pkt.chkHi === this.chkHi && pkt.chkLo === this.chkLo && pkt.sum === this.sum && pkt.datalen === this.datalen) return true;
        if (this.action === 204) {
            // Trim out the time portion of this as we really don't want all these packets to evaluate.
            // 204 registers changes every second in the first 7 bytes of data.
            for (var i = 6; i < this.payload.length; i++) {
                //if (i === 0 || i === 1 || i === 5) continue;
                if (this.payload[i] !== pkt.payload[i]) return false;
            }
            return true;
        }
        return false;
    };
    this.toLog = function () {
        if (!this.isValid && msgOptions.exclude.invalid) return;
        if (this.protocol === 'Chlorinator' && msgOptions.exclude.chlor) return;
        if (msgOptions.exclude.pump && ((this.source >= 96 && this.source <= 111) || (this.dest >= 96 && this.dest <= 111))) return;
        if (msgOptions.exclude.status && this.protocol === 'Broadcast' && (this.action === 204 || this.action === 2)) return;
        if (msgOptions.exclude.actions.length > 0 && msgOptions.exclude.actions.indexOf(this.action) >= 0) return;
        //if (!this.isValid || this.protocol === 'Chlorinator' || this.protocol === 'Unknown' || this.source === 96 || this.source === 97 || this.dest === 96 || this.dest === 97) return;
        //if (this.protocol === 'Broadcast' && (this.action === 204 || this.action === 2)) return;
        // Stop logging the status message as this is currently just noise.
        //if (this.protocol === 'Broadcast' && (this.action === 2)) return;
        //if (this.action !== 204) return;
        //if (this.action === 164) return;
        var pkt = [];
        //Array.prototype.push.apply(pkt, this.padding);
        Array.prototype.push.apply(pkt, this.preamble);
        Array.prototype.push.apply(pkt, this.header);
        Array.prototype.push.apply(pkt, this.payload);
        Array.prototype.push.apply(pkt, this.term);
        console.log('{"type":"' + this.protocol + '", "direction":"inbound", "packet":[' + pkt.join(', ') + '], "message":"' + this.payload.length.toString() + '", "timestamp": "' + this.timestamp.toISOString() + '"}');
        //            console.log('{"type":' + ((i === 0) ? '"packet"' : '"' + i.toString() + '"') + '"direction": "inbound", "packet": [' + bufferArrayOfArrays[i].join(', ') + '], "message": "", "timestamp": "' + new Date().toISOString() + '"} ');

    };
    this.readPacket(bytes);
    this.msgKey = this.source.toString() + '_' + this.dest.toString() + '_' + this.action.toString() + '_' + this.datalen.toString();
}
var port = new SerialPort(args.port, openOptions);
var logMessages = true;
process.stdin.resume();
process.stdin.setRawMode(true);
process.stdin.on('data', function (s) {
    if (s[0] === 0x03) {
        port.close();
        process.exit(0);
    }
    else {
        if (args.localecho) {
            if (s[0] === 0x0d) {
                process.stdout.write('\n');
            } else {
                process.stdout.write(s);
                console.log(s);
            }
        }
        port.write(s);
    }
});
var lstMsg = null;
var msgDiff = {};
port.on('data', function (data) {
    var arrPkt = [];
    arrPkt.push(Array.prototype.slice.call(data));
    for (var i = 0; i < arrPkt.length; i++) {
        if (lstMsg === null || lstMsg.isComplete) lstMsg = new msg(arrPkt[i]);
        else lstMsg.mergeBytes(arrPkt[i]);
        if (lstMsg.isComplete && lstMsg.isValid) {
            var p = msgDiff[lstMsg.msgKey];
            if (typeof (p) === 'undefined' || !p) {
                msgDiff[lstMsg.msgKey] = lstMsg;
                lstMsg.toLog();
            }
            else if (p && !p.compareTo(lstMsg)) {
                msgDiff[lstMsg.msgKey] = lstMsg;
                lstMsg.toLog();
            }
        }
    }
});

port.on('error', function (err) {
    console.log('Error', err);
    process.exit(1);
});
