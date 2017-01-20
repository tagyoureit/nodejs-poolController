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

function Circuit(number, numberStr, name, circuitFunction, status, freeze) {
    this.number = number; //1
    this.numberStr = numberStr; //circuit1
    this.name = name; //Pool
    this.circuitFunction = circuitFunction; //Generic, Light, etc
    this.status = status; //0, 1
    this.freeze = freeze; //0, 1
}

module.exports = function(container) {


    if (container.logModuleLoading)
        container.logger.info('Loading: circuit.js')

    var sendInitialBroadcast = {
        "haveCircuitStatus": 0,
        "haveCircuitNames": 0,
        "initialCircuitsBroadcast": 0
    }
    var logger = container.logger

    var circuit1 = new Circuit();
    var circuit2 = new Circuit();
    var circuit3 = new Circuit();
    var circuit4 = new Circuit();
    var circuit5 = new Circuit();
    var circuit6 = new Circuit();
    var circuit7 = new Circuit();
    var circuit8 = new Circuit();
    var circuit9 = new Circuit();
    var circuit10 = new Circuit();
    var circuit11 = new Circuit();
    var circuit12 = new Circuit();
    var circuit13 = new Circuit();
    var circuit14 = new Circuit();
    var circuit15 = new Circuit();
    var circuit16 = new Circuit();
    var circuit17 = new Circuit();
    var circuit18 = new Circuit();
    var circuit19 = new Circuit();
    var circuit20 = new Circuit();
    //array of circuit objects.  Since Pentair uses 1-20, we'll just use a placeholder for the 1st [0] element in the array


    var currentCircuitArrObj = ['blank', circuit1, circuit2, circuit3, circuit4, circuit5, circuit6, circuit7, circuit8, circuit9, circuit10, circuit11, circuit12, circuit13, circuit14, circuit15, circuit16, circuit17, circuit18, circuit19, circuit20];

    //var bufferArr = []; //variable to process buffer.  interimBufferArr will be copied here when ready to process
    //var interimBufferArr = []; //variable to hold all serialport.open data; incomind data is appended to this with each read
    var currentStatus = {}; // persistent object to hold pool equipment status.
    var currentStatusBytes = []; //persistent variable to hold full bytes of pool status

    function getCurrentStatus() {
        return currentStatus
    }

    function getCurrentStatusBytes() {
        return currentStatusBytes
    }

    function setCurrentStatusBytes(data, counter) {


        if (currentStatusBytes.length === 0) {
            if (container.settings.logConfigMessages) logger.verbose('\n ', printStatus(data));
        } else

        if (container.settings.logConfigMessages) {
            logger.verbose('-->EQUIPMENT Msg# %s   \n', counter)
            logger.verbose('Msg# %s: \n', counter, printStatus(currentStatusBytes, data));
        }


        //remove all elements from currentstatus
        currentStatusBytes.splice(0, currentStatusBytes.length)
            //append the new incoming packet (data) to the now empty currentStatusBytes
        Array.prototype.push.apply(currentStatusBytes, data)
            //currentStatusBytes = data
    }



    function printStatus(data1, data2) {

        var str1 = ''
        var str2 = ''
        var str3 = ''

        str1 = JSON.parse(JSON.stringify(data1));
        if (data2 !== undefined) str2 = JSON.parse(JSON.stringify(data2));
        str3 = ''; //delta
        spacepadding = '';
        spacepaddingNum = 19;
        for (var i = 0; i <= spacepaddingNum; i++) {
            spacepadding += ' ';
        }


        header = '\n';
        header += (spacepadding + '              S       L                                           V           H   P   S   H       A   S           H\n');
        header += (spacepadding + '              O       E           M   M   M                       A           T   OO  P   T       I   O           E\n');
        header += (spacepadding + '          D   U       N   H       O   O   O                   U   L           R   L   A   R       R   L           A                           C   C\n');
        header += (spacepadding + '          E   R   C   G   O   M   D   D   D                   O   V           M   T   T   _       T   T           T                           H   H\n');
        header += (spacepadding + '          S   C   M   T   U   I   E   E   E                   M   E           D   M   M   O       M   M           M                           K   K\n');
        header += (spacepadding + '          T   E   D   H   R   N   1   2   3                       S           E   P   P   N       P   P           D                           H   L\n');
        //                    e.g.  165, xx, 15, 16,  2, 29, 11, 33, 32,  0,  0,  0,  0,  0,  0,  0, 51,  0, 64,  4, 79, 79, 32,  0, 69,102,  0,  0,  7,  0,  0,182,215,  0, 13,  4,186



        //format status1 so numbers are three digits
        for (var i = 0; i < str1.length - 1; i++) {
            str1[i] = pad(str1[i], 3);
        }

        //compare arrays so we can mark which are different
        //doing string 2 first so we can compare string arrays
        if (data2 !== undefined) {
            for (var i = 0; i < str2.length - 1; i++) {
                if (data1[i] === data2[i]) {
                    str3 += '    '
                } else {
                    str3 += '   *'
                }
                str2[i] = pad(str2[i], 3);
            }
            str1 = 'Orig: ' + spacepadding.substr(6) + str1 + '\n';
            str2 = ' New: ' + spacepadding.substr(6) + str2 + '\n'
            str3 = 'Diff:' + spacepadding.substr(6) + str3 + '\n'
        } else {
            str1 = ' New: ' + spacepadding.substr(6) + str1 + '\n';
            str2 = ''
        }





        str = header + str1 + str2 + str3;

        return (str);
    }

    function pad(num, size) {
        //makes any digit returned as a string of length size (for outputting formatted byte text)
        var s = "   " + num;
        return s.substr(s.length - size);
    }

    function getCircuit(circuit){
      return currentCircuitArrObj[circuit]
    }


    function getCircuitName(circuit) {
        return currentCircuitArrObj[circuit].name
    }

    //external methode to return the friendlyName
    function getFriendlyName(circuit){
      return currentCircuitArrObj[circuit].friendlyName
    }

    function setCircuitFromController(circuit, nameByte, functionByte, counter) {

        var circuitArrObj = {}
            //if the ID of the circuit name is 1-101 then it is a standard name.  If it is 200-209 it is a custom name.  The mapping between the string value in the getCircuitNames and getCustomNames is 200.  So subtract 200 from the circuit name to get the id in the custom name array.
        if (nameByte < 200) {
            circuitArrObj.name = container.constants.strCircuitName[nameByte]
        } else {
            circuitArrObj.name = container.customNames.getCustomName(nameByte - 200);
        }
        circuitArrObj.number = circuit;
        circuitArrObj.numberStr = 'circuit' + circuit;
        //The &64 masks to 01000000 because it is the freeze protection bit
        var freeze = ((functionByte & 64) === 64) ? 1 : 0
        circuitArrObj.freeze = freeze
        circuitArrObj.circuitFunction = container.constants.strCircuitFunction[functionByte & 63]

        if (currentCircuitArrObj[circuit].name === undefined) {
            assignCircuitVars(circuit, circuitArrObj)

        }

        if (circuit === 20 && sendInitialBroadcast.haveCircuitNames === 0) {
            sendInitialBroadcast.haveCircuitNames = 1
            getFriendlyNames()
            doWeHaveAllInformation()
        } else if (sendInitialBroadcast.initialCircuitsBroadcast === 1) {
            //not sure we can do this ... have to check to see if they will come out the same
            if (JSON.stringify(currentCircuitArrObj[circuit]) === JSON.stringify(circuit)) {
                circuitChanged(circuit, circuitArrObj, counter)
                assignCircuitVars(circuit, circuitArrObj)
            } else {
                logger.debug('Msg# %s  No change in circuit %s', counter, circuit)
            }

        }

    }

    //internal method to apply the friendly name
    function getFriendlyNames(){
      var friendlyNames = container.settings.friendlyNamesArr
      for (var i=1; i<=16; i++){
        if (friendlyNames[i][currentCircuitArrObj[i].numberStr]===""){
            currentCircuitArrObj[i].friendlyName=currentCircuitArrObj[i].name
        }
        else {
          currentCircuitArrObj[i].friendlyName=friendlyNames[i][currentCircuitArrObj[i].numberStr]
        }
      }
    }

    function doWeHaveAllInformation() {
        //simple function to see if we have both the circuit names & status (come from 2 different sets of packets)
        if (sendInitialBroadcast.haveCircuitNames === 1 && sendInitialBroadcast.haveCircuitStatus === 1) {
            outputInitialCircuitsDiscovered()
            sendInitialBroadcast.initialCircuitsBroadcast = 1
        }

    }

    function assignCircuitVars(circuit, circuitArrObj) {
        //we don't inculde status because it comes from a different packet
        currentCircuitArrObj[circuit].number = circuitArrObj.number
        currentCircuitArrObj[circuit].numberStr = circuitArrObj.numberStr
        currentCircuitArrObj[circuit].name = circuitArrObj.name
        currentCircuitArrObj[circuit].freeze = circuitArrObj.freeze
        currentCircuitArrObj[circuit].circuitFunction = circuitArrObj.circuitFunction
    }


    function outputInitialCircuitsDiscovered() {
        var circuitStr = '';
        for (var i = 1; i <= 20; i++) {
            circuitStr += 'Circuit ' + currentCircuitArrObj[i].number + ': ' + currentCircuitArrObj[i].name
            circuitStr += ' Function: ' + currentCircuitArrObj[i].circuitFunction
            if (currentCircuitArrObj[i].status === undefined) {
                circuitStr += ' Status: (not received yet)'
            } else {
                circuitStr += ' Status: ' + currentCircuitArrObj[i].status
            }
            circuitStr += ' Freeze Protection: '
            circuitStr += statusToString(currentCircuitArrObj[i].freeze === 0)
            circuitStr += '\n'
        }
        logger.info('\n  Circuit Array Discovered from configuration: \n%s \n', circuitStr)
        container.io.emitToClients('circuit');

    }

    function circuitChanged(circuit, counter) {


        results = currentCircuitArrObj[circuit].whatsDifferent(circuit);
        if (!(results === "Nothing!" || currentCircuitArrObj[circuit].name === 'NOT USED')) {
            logger.verbose('Msg# %s   Circuit %s change:  %s', counter, circuit.name, results)

            if (container.settings.logConfigMessages) {

                if (circuit.status === undefined) {
                    logger.debug('Msg# %s  Circuit %s:   Name: %s  Function: %s  Status: (not received yet)  Freeze Protection: %s', counter, currentCircuitArrObj[circuit].number, currentCircuitArrObj[circuit].name, currentCircuitArrObj[circuit].circuitFunction, currentCircuitArrObj[circuit].freeze)
                } else {
                    logger.debug('Msg# %s  Circuit %s:   Name: %s  Function: %s  Status: %s  Freeze Protection: %s', counter, currentCircuitArrObj[circuit].number, currentCircuitArrObj[circuit].name, currentCircuitArrObj[circuit].circuitFunction, currentCircuitArrObj[circuit].status, currentCircuitArrObj[circuit].freeze)

                }
            }
            container.io.emitToClients('circuit');
        }




    }

    //this function takes the status packet (controller:2) and parses through the equipment fields
    function assignCircuitStatusFromControllerStatus(data, counter) {

        //temp object so we can compare
        //Is there a faster way to do this?
        var circuitArrObj = []
            //TODO: clean this section up.  probably don't need to broadcast it at all because we broadcast the full circuits later
            //assign circuit status to circuitArrObj

        for (var i = 0; i < 3; i++) {
            for (var j = 0; j < 8; j++) {
                if ((j + (i * 8) + 1) <= 20) {
                    equip = data[container.constants.controllerStatusPacketFields.EQUIP1 + i]
                    if (container.settings.logMessageDecoding)
                        logger.silly('Decode Case 2:   i: %s  j:  %s  j + (i * 8) + 1: %s   equip: %s', i, j, j + (i * 8) + 1, equip)
                    circuitArrObj[j + (i * 8) + 1] = {}
                    circuitArrObj[j + (i * 8) + 1].status = (equip & (1 << (j))) >> j ? 1 : 0
                    if (container.settings.logConfigMessages) logger.silly('Msg# %s   Circuit %s state discovered:  %s', counter, j + (i * 8) + 1, circuitArrObj[j + (i * 8) + 1].status)
                }
            }
        }
        if (currentCircuitArrObj[1].status === undefined) {
            sendInitialBroadcast.haveCircuitStatus = 1
                //copy all states

            for (var i = 1; i <= 20; i++) {
                currentCircuitArrObj[i].status = circuitArrObj[i].status
            }

            doWeHaveAllInformation()
                //logger.verbose('Msg# %s   Circuit %s state discovered:  %s', counter, j + (i * 8) + 1, newStatus)
                //currentCircuitArrObj[j + (i * 8) + 1].status = newStatus
        } else
            for (var i = 1; i <= 20; i++) {
                if (currentCircuitArrObj[i].status === circuitArrObj[i].status) {
                    //nothing changed
                    if (container.settings.logMessageDecoding) {
                        if (sendInitialBroadcast.haveCircuitNames) {
                            logger.silly('Msg# %s   NO change in circuit %s', counter, circuitArrObj[i].name)
                        } else {
                            logger.silly('Msg# %s   NO change in circuit %s', counter, i)
                        }
                    }
                } else {

                    if (container.settings.logMessageDecoding) {

                        var results = "Status: " + statusToString(currentCircuitArrObj[i].status) + " --> " + statusToString(circuitArrObj[i].status)
                        if (sendInitialBroadcast.haveCircuitNames) {
                            logger.verbose('Msg# %s   Circuit %s change:  %s', counter, currentCircuitArrObj[i].name, results)
                        } else {
                            logger.verbose('Msg# %s   Circuit %s change:  %s', counter, i, results)

                        }
                    }
                    currentCircuitArrObj[i].status = circuitArrObj[i].status
                    container.io.emitToClients('circuit')
                }
            }

    }

    function statusToString(status){
      if (status===1)
        return 'On'
        else {
          return 'Off'
        }
    }

    function requestUpdateCircuit(source, dest, circuit, action, counter) {
        //this is for the request.  Not actual confirmation of circuit update.  So we don't update the object here.
        var status = statusToString(action)
        logger.info('Msg# %s   %s --> %s: Change %s to %s', counter, container.constants.ctrlString[source], container.constants.ctrlString[dest], getCircuitName(circuit), status)


    }

    function getCurrentCircuits() {
        return currentCircuitArrObj
    }


    function toggleCircuit(circuit, callback) {
        circuit = parseInt(circuit)
        var desiredStatus = currentCircuitArrObj[circuit].status === 1 ? 0 : 1;
        var toggleCircuitPacket = [165, container.intellitouch.getPreambleByte(), 16, container.settings.appAddress, 134, 2, circuit, desiredStatus];
        container.queuePacket.queuePacket(toggleCircuitPacket);
        var response = {}
        response.text = 'User request to toggle ' + currentCircuitArrObj[circuit].name + ' to '
        response.text += statusToString(desiredStatus)
        response.status = desiredStatus === 1 ? 'on' : 'off';
        response.value = desiredStatus
        logger.info(response)
                //callback will be present when we are responding back to the Express server and showing the user a message.  But not with SocketIO call where we will just log it.
        if (callback !== undefined) {
            callback(response)
        }

    }

    function setCircuit(circuit, state, callback) {
        circuit = parseInt(circuit)
        state = parseInt(state)
        var desiredStatus = state
        var toggleCircuitPacket = [165, container.intellitouch.getPreambleByte(), 16, container.settings.appAddress, 134, 2, circuit, desiredStatus];
        container.queuePacket.queuePacket(toggleCircuitPacket);
        var response = {}
        response.text = 'User request to set ' + currentCircuitArrObj[circuit].name + ' to '
        response.text += statusToString(desiredStatus)
        response.status = desiredStatus === 1 ? 'on' : 'off';
        response.value = desiredStatus
        logger.info(response)
                //callback will be present when we are responding back to the Express server and showing the user a message.  But not with SocketIO call where we will just log it.
        if (callback !== undefined) {
            callback(response)
        }

    }

    if (container.logModuleLoading)
        container.logger.info('Loaded: circuit.js')


    return {
        getCurrentCircuits: getCurrentCircuits,
        getCircuit: getCircuit,
        getCircuitName: getCircuitName,
        getFriendlyName: getFriendlyName,
        assignCircuitStatusFromControllerStatus: assignCircuitStatusFromControllerStatus,
        requestUpdateCircuit: requestUpdateCircuit,
        setCircuitFromController: setCircuitFromController,
        getCurrentStatus: getCurrentStatus,
        getCurrentStatusBytes: getCurrentStatusBytes,
        setCurrentStatusBytes: setCurrentStatusBytes,
        toggleCircuit: toggleCircuit,
        setCircuit: setCircuit
    }
}
