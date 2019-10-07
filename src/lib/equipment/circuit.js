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

function Light(position, colorStr, color) {
    this.position = position;
    this.colorStr = colorStr;
    this.color = color;
    this.colorSet = 0;
    this.colorSetStr = 'White'
    this.prevColor = 0;
    this.prevColorStr = 'White';
    this.colorSwimDelay = 0;
    this.mode = 0;
    this.modeStr = 'Off';
}

function Circuit(number, numberStr, name, circuitFunction, status, freeze, macro, delay) {
    this.number = number; //1
    this.numberStr = numberStr; //circuit1
    this.name = name; //Pool
    this.circuitFunction = circuitFunction; //Generic, Light, etc
    this.status = status; //0, 1
    this.freeze = freeze; //0, 1
    this.macro = macro; //is the circuit a macro?
    this.delay = delay; //0 no delay, 1 in delay
}


var currentCircuitArrObj = {},
    lightGroup = {},
    lightGroupPacket = {'numPackets': 1, "0": [], "1": []},
    numberOfCircuits = 20


module.exports = function (container) {


    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: circuit.js')

    var logIntellibrite = 0


    var sendInitialBroadcast = {
        "haveCircuitStatus": 0,
        "haveCircuitNames": 0,
        "initialCircuitsBroadcast": 0
    }
    var logger = container.logger


    //var bufferArr = []; //variable to process buffer.  interimBufferArr will be copied here when ready to process
    //var interimBufferArr = []; //variable to hold all serialport.open data; incomind data is appended to this with each read
    var currentStatus = {}; // persistent object to hold pool equipment status.
    var currentStatusBytes = []; //persistent variable to hold full bytes of pool status


    var init = function () {


        logIntellibrite = container.settings.get('logIntellibrite')

        checkFriendlyNamesInConfig()
        currentStatus = {}
        currentStatusBytes = []

        lightGroup = {}
        lightGroupPacket = {'numPackets': 1, "0": [], "1": []}
        numberOfCircuits = container.settings.get('equipment.controller.intellitouch.numberOfCircuits')
        for (var i = 1; i <= numberOfCircuits; i++) {
            //lightGroup[i] = new Light(-1, 'off', -1) // assign empty light object
            currentCircuitArrObj[i] = new Circuit()
        }

    }

    function checkFriendlyNamesInConfig() {
        var configFriendlyNames = container.settings.get('equipment.circuit.friendlyName')
        var expectedCountFriendlyNames = container.settings.get('equipment.controller.intellitouch.numberOfCircuits')
        var existingCountFriendlyNames = container._.size(configFriendlyNames)
        if (existingCountFriendlyNames < expectedCountFriendlyNames) {
            for (var i = existingCountFriendlyNames + 1; i <= expectedCountFriendlyNames; i++) {
                configFriendlyNames[i] = ""
            }
            container.settings.set('equipment.circuit.friendlyName', configFriendlyNames)
            container.logger.info('Just expanded %s to include additional friendlyNames for circuits.', container.settings.get('configurationFileLocation'))
        }
    }

    function getCurrentStatus() {
        return currentStatus
    }

    function getCurrentStatusBytes() {
        return currentStatusBytes
    }

    function setCurrentStatusBytes(data, counter) {


        if (currentStatusBytes.length === 0) {
            if (container.settings.get('logConfigMessages')) logger.verbose('\n ', printStatus(data));
        } else if (container.settings.get('logConfigMessages')) {
            logger.verbose('-->EQUIPMENT Msg# %s   \n', counter)
            logger.verbose('Msg# %s: \n', counter, printStatus(currentStatusBytes, data));
        }


        //remove all elements from currentstatus
        currentStatusBytes.splice(0, currentStatusBytes.length)
        //append the new incoming packet (data) to the now empty currentStatusBytes
        Array.prototype.push.apply(currentStatusBytes, data)
        //currentStatusBytes = data
    }

    var pad = function (num, size) {
        //makes any digit returned as a string of length size (for outputting formatted byte text)
        var s = "   " + num;
        return s.substr(s.length - size);
    }

    var printStatus = function (data1, data2) {

        var str1 = ''
        var str2 = ''
        var str3 = ''

        str1 = JSON.parse(JSON.stringify(data1));
        if (data2 !== undefined) str2 = JSON.parse(JSON.stringify(data2));
        str3 = ''; //delta
        var spacepadding = '';
        var spacepaddingNum = 19;
        for (var i = 0; i <= spacepaddingNum; i++) {
            spacepadding += ' ';
        }


        var header = '\n';
        header += (spacepadding + '              S       L                                           V           H   P   S   H       A   S           H\n');
        header += (spacepadding + '              O       E           M   M   M                       A       D   T   OO  P   T       I   O           E\n');
        header += (spacepadding + '          D   U       N   H       O   O   O                   U   L       E   R   L   A   R       R   L           A                           C   C\n');
        header += (spacepadding + '          E   R   C   G   O   M   D   D   D                   O   V       L   M   T   T   _       T   T           T                           H   H\n');
        header += (spacepadding + '          S   C   M   T   U   I   E   E   E                   M   E       A   D   M   M   O       M   M           M                           K   K\n');
        header += (spacepadding + '          T   E   D   H   R   N   1   2   3                       S       Y   E   P   P   N       P   P           D                           H   L\n');
        //                    e.g.  165, xx, 15, 16,  2, 29, 11, 33, 32,  0,  0,  0,  0,  0,  0,  0, 51,  0, 64,  4, 79, 79, 32,  0, 69,102,  0,  0,  7,  0,  0,182,215,  0, 13,  4,186


        //format status1 so numbers are three digits
        for (i = 0; i < str1.length - 1; i++) {
            str1[i] = pad(str1[i], 3);
        }

        //compare arrays so we can mark which are different
        //doing string 2 first so we can compare string arrays
        if (data2 !== undefined) {
            for (i = 0; i < str2.length - 1; i++) {
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
        var str = header + str1 + str2 + str3;

        return (str);
    }

    //internal method to apply the friendly name
    var setCircuitFriendlyNames = function (circuit) {
        var useFriendlyName
        var configFriendlyNames = container.settings.get('circuit.friendlyName')
        if (configFriendlyNames[circuit] === "") {
            useFriendlyName = false
        } else {
            //for now, UI doesn't support renaming 'pool' or 'spa'.  Check for that here.
            if ((currentCircuitArrObj[circuit].circuitFunction.toUpperCase() === "SPA" && configFriendlyNames[circuit].toUpperCase() !== "SPA") ||
                (currentCircuitArrObj[circuit].circuitFunction.toUpperCase() === "POOL" && configFriendlyNames[circuit].toUpperCase() !== "POOL")) {
                logger.warn('The %s circuit cannot be renamed at this time.  Skipping.', currentCircuitArrObj[circuit].circuitFunction)
                useFriendlyName = false
            } else {
                useFriendlyName = true
            }
        }
        if (useFriendlyName) {
            currentCircuitArrObj[circuit].friendlyName = configFriendlyNames[circuit].toUpperCase()
        } else {
            currentCircuitArrObj[circuit].friendlyName = currentCircuitArrObj[circuit].name
        }
    }

    var statusToString = function (status) {
        if (status === 1)
            return 'on'
        else {
            return 'off'
        }
    }
    var outputInitialCircuitsDiscovered = function () {
        var circuitStr = '';
        for (var i = 1; i <= numberOfCircuits; i++) {
            circuitStr += 'Circuit ' + currentCircuitArrObj[i].number + ': ' + currentCircuitArrObj[i].name
            circuitStr += ' Function: ' + currentCircuitArrObj[i].circuitFunction
            if (currentCircuitArrObj[i].status === undefined) {
                circuitStr += ' Status: (not received yet)'
            } else {
                circuitStr += ' Status: ' + currentCircuitArrObj[i].status
            }
            circuitStr += ' Freeze Protection: '
            circuitStr += statusToString(currentCircuitArrObj[i].freeze === 0)
            circuitStr += ' Macro: ' + currentCircuitArrObj[i].macro
            circuitStr += '\n'
        }
        logger.info('\n  Circuit Array Discovered from configuration: \n%s \n', circuitStr)
        container.io.emitToClients('circuit');

    }

    var doWeHaveAllInformation = function () {
        //simple function to see if we have both the circuit names & status (come from 2 different sets of packets)
        if (sendInitialBroadcast.haveCircuitNames === 1 && sendInitialBroadcast.haveCircuitStatus === 1) {
            outputInitialCircuitsDiscovered()
            sendInitialBroadcast.initialCircuitsBroadcast = 1
        }

    }

    var assignCircuitVars = function (circuit, circuitArrObj) {
        //we don't inculde status because it comes from a different packet
        currentCircuitArrObj[circuit].number = circuitArrObj.number
        currentCircuitArrObj[circuit].numberStr = circuitArrObj.numberStr
        currentCircuitArrObj[circuit].name = circuitArrObj.name
        currentCircuitArrObj[circuit].freeze = circuitArrObj.freeze
        currentCircuitArrObj[circuit].circuitFunction = circuitArrObj.circuitFunction
        currentCircuitArrObj[circuit].macro = circuitArrObj.macro
        // if (isLight(circuitArrObj.circuitFunction)) {
        //     currentCircuitArrObj[circuit].light = JSON.parse(JSON.stringify(lightGroup[circuit])) //copy light group object
        // }

        circuitArrObj.friendlyName = setCircuitFriendlyNames(circuit)
    }


    function circuitChanged(circuit, counter) {


        var results = currentCircuitArrObj[circuit].whatsDifferent(circuit);
        if (!(results === "Nothing!" || currentCircuitArrObj[circuit].name === 'NOT USED')) {
            logger.verbose('Msg# %s   Circuit %s change:  %s', counter, circuit.name, results)

            if (container.settings.get('logConfigMessages')) {

                if (circuit.status === undefined) {
                    logger.debug('Msg# %s  Circuit %s:   Name: %s  Function: %s  Status: (not received yet)  Freeze Protection: %s', counter, currentCircuitArrObj[circuit].number, currentCircuitArrObj[circuit].name, currentCircuitArrObj[circuit].circuitFunction, currentCircuitArrObj[circuit].freeze)
                } else {
                    logger.debug('Msg# %s  Circuit %s:   Name: %s  Function: %s  Status: %s  Freeze Protection: %s', counter, currentCircuitArrObj[circuit].number, currentCircuitArrObj[circuit].name, currentCircuitArrObj[circuit].circuitFunction, currentCircuitArrObj[circuit].status, currentCircuitArrObj[circuit].freeze)

                }
            }
            container.io.emitToClients('circuit');

        }
        if (sendInitialBroadcast.initialCircuitsBroadcast === 1) container.influx.writeCircuit(currentCircuitArrObj)
    }


    function getCircuit(circuit) {
        return currentCircuitArrObj[circuit]
    }


    function getCircuitName(circuit) {
        // NOTE: Why are we returning strCircuitFunction for Circuit Name?
        try {
            if (circuit >= 1 && circuit <= numberOfCircuits) {
                return currentCircuitArrObj[circuit].name
            } else {
                // NOTE: This might not be needed anymore now that we have user control over # of circuits, names, etc.
                return container.constants.strCircuitFunction[circuit]
            }
        }
        catch (err) {
            logger.warn('Tried to retrieve circuit %s which is not a valid circuit.', circuit)
            return 'No valid circuit (' + circuit + ')'
        }

    }

    //external method to return the friendlyName
    function getFriendlyName(circuit) {
        try {
            if (circuit >= 1 && circuit <= numberOfCircuits) {
                if (currentCircuitArrObj[circuit].friendlyName === undefined) {
                    return currentCircuitArrObj[circuit].name

                }
                else {
                    return currentCircuitArrObj[circuit].friendlyName

                }
            }
            else {
                return container.constants.strCircuitFunction[circuit]
            }
        }

        catch
            (err) {
            logger.warn('Tried to retrieve circuit %s which is not a valid circuit.', circuit)
            return 'No valid circuit (' + circuit + ')'
        }

    }

    function getAllNonLightCircuits() {
        var tempObj = {}
        for (var key in currentCircuitArrObj) {
            if (currentCircuitArrObj[key].circuitFunction !== undefined) {
                if (currentCircuitArrObj[key].name !== "NOT USED") {
                    if (['intellibrite', 'light', 'sam light', 'sal light', 'color wheel'].indexOf(currentCircuitArrObj[key].circuitFunction.toLowerCase()) === -1) {
                        tempObj[key] = {
                            // "circuitFunction": currentCircuitArrObj[key].circuitFunction,
                            "circuitName": getFriendlyName(key)
                        }
                    }
                }
            }
        }
        return tempObj
    }

    function getAllLightCircuits() {
        var tempObj = {}
        for (var key in currentCircuitArrObj) {
            if (currentCircuitArrObj[key].circuitFunction !== undefined || currentCircuitArrObj[key].name === "NOT USED") {
                if (isLight(key)) {
                    tempObj[key] = {
                        //"circuitFunction": currentCircuitArrObj[key].circuitFunction,
                        "circuitName": getFriendlyName(key)
                    }
                }
            }
        }
        return tempObj
    }

	function poolOrSpaIsOn() {
		// return all non-light circuits
		const circuit = getAllNonLightCircuits()
		//console.log("circuit: " + JSON.stringify(circuit))

		// loop through the circuits
		for (var circuitNum in circuit) {
			//console.log(`${circuit[circuitNum].circuitName} is ${getCircuit(circuitNum).status}`)
			if (circuit[circuitNum].circuitName === "POOL" || circuit[circuitNum].circuitName === 'SPA') {
				if (getCircuit(circuitNum).status) {
					return true
				}
			}
		}
		return false
	}

    function isLight(circuitNum) {

        // return true if circuitFunction is one of Light, SAM Light, SAL Light, Photon Gen, Color Wheel, Intellibrite
        var circuitFunction = currentCircuitArrObj[circuitNum].circuitFunction
        return [container.constants.strCircuitFunction[7],
            container.constants.strCircuitFunction[9],
            container.constants.strCircuitFunction[10],
            container.constants.strCircuitFunction[11],
            container.constants.strCircuitFunction[12],
            container.constants.strCircuitFunction[16]].includes(circuitFunction)

        // return ['intellibrite', 'light', 'sam light', 'sal light', 'color wheel'].indexOf(circuitFunction) >= 0
    }

    function setCircuitFromController(circuit, nameByte, functionByte, counter) {

        if (circuit <= numberOfCircuits) {

            var circuitArrObj = {}
            //if the ID of the circuit name is 1-101 then it is a standard name.  If it is 200-209 it is a custom name.  The mapping between the string value in the getCircuitNames and getCustomNames is 200.  So subtract 200 from the circuit name to get the id in the custom name array.
            // logger.info("Getting the name for circuit: %s \n\tThe circuit nameByte is: ", circuit, nameByte)
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
            circuitArrObj.macro = (functionByte & 128) >> 7 //1 or 0

            if (currentCircuitArrObj[circuit].name === undefined) {
                //logger.info("Assigning circuit %s the function %s based on value %s\n\t", circuit, circuitArrObj.circuitFunction, functionByte & 63)
                assignCircuitVars(circuit, circuitArrObj)

                // assign .light if Intellibrite
                if (currentCircuitArrObj[circuit].circuitFunction === container.constants.strCircuitFunction[16]) {
                    currentCircuitArrObj[circuit].light = new Light()
                }
            }

            if (circuit === numberOfCircuits && sendInitialBroadcast.haveCircuitNames === 0) {
                sendInitialBroadcast.haveCircuitNames = 1

                doWeHaveAllInformation()
            } else if (sendInitialBroadcast.initialCircuitsBroadcast === 1) {
                if (JSON.stringify(currentCircuitArrObj[circuit]) === JSON.stringify(circuit)) {
                    circuitChanged(circuit, circuitArrObj, counter)
                    assignCircuitVars(circuit, circuitArrObj)
                } else {
                    logger.debug('Msg# %s  No change in circuit %s', counter, circuit)
                }

            }
            if (sendInitialBroadcast.initialCircuitsBroadcast === 1) container.influx.writeCircuit(currentCircuitArrObj)
        }
        else {
            logger.warn('Equipment is requesting status for circuit %s, but only %s are configured in the app.\nConfig file updated, please restart app.', circuit, numberOfCircuits)
            container.settings.set('equipment.controller.intellitouch.numberOfCircuits', circuit)

        }

    }

    function assignCircuitDelayFromControllerStatus(_delay, counter) {
        for (var i = 1; i <= numberOfCircuits; i++) {
            if (currentCircuitArrObj[i].delay === undefined) {
                if (i === _delay) {
                    currentCircuitArrObj[i].delay = 1
                } else {
                    currentCircuitArrObj[i].delay = 0
                }
            } else if (i === _delay) {
                if (currentCircuitArrObj[i].delay === 0) {
                    // change in delay from 'no delay' to delay
                    if (container.settings.get('logConfigMessages')) logger.info('Msg# %s   Delay for Circuit %s changed from :  No Delay --> Delay', counter, i)
                    currentCircuitArrObj[i].delay = 1
                    container.io.emitToClients('circuit')
                }
                // else if (currentCircuitArrObj[i].delay === 1) then no change
            } else if (i !== _delay) {
                if (currentCircuitArrObj[i].delay === 1) {
                    // change in delay from delay to 'no delay'
                    if (container.settings.get('logConfigMessages')) logger.info('Msg# %s   Delay for Circuit %s changed from :  Delay --> No Delay', counter, i)
                    currentCircuitArrObj[i].delay = 0
                    container.io.emitToClients('circuit')
                }

            }

        }
    }

//this function takes the status packet (controller:2) and parses through the equipment fields
    function assignCircuitStatusFromControllerStatus(data, counter) {

        var circuitArrObj = []


        //This is an attempt to support >20 circuits when there is an expansion port(s) in use.  Intellitouch can support up to 50.
        var byteCount = Math.floor(numberOfCircuits / 8);

        for (var i = 0; i <= byteCount; i++) {
            for (var j = 0; j < 8; j++) {
                if ((j + (i * 8) + 1) <= numberOfCircuits) {
                    var equip = data[container.constants.controllerStatusPacketFields.EQUIP1 + i]
                    // if (container.settings.logMessageDecoding)
                    //     logger.silly('Decode Case 2:   i: %s  j:  %s  j + (i * 8) + 1: %s   equip: %s', i, j, j + (i * 8) + 1, equip)
                    circuitArrObj[j + (i * 8) + 1] = {}
                    circuitArrObj[j + (i * 8) + 1].status = (equip & (1 << (j))) >> j ? 1 : 0
                    if (container.settings.get('logConfigMessages')) logger.silly('Msg# %s   Circuit %s state discovered:  %s', counter, j + (i * 8) + 1, circuitArrObj[j + (i * 8) + 1].status)
                }
            }
        }
        if (currentCircuitArrObj[1].status === undefined) {
            sendInitialBroadcast.haveCircuitStatus = 1
            //copy all states

            for (i = 1; i <= numberOfCircuits; i++) {
                currentCircuitArrObj[i].status = circuitArrObj[i].status
            }

            doWeHaveAllInformation()
        } else
            for (i = 1; i <= numberOfCircuits; i++) {
                if (currentCircuitArrObj[i].status === circuitArrObj[i].status) {
                    //nothing changed
                    if (container.settings.get('logMessageDecoding')) {
                        if (sendInitialBroadcast.haveCircuitNames) {
                            logger.silly('Msg# %s   NO change in circuit %s', counter, currentCircuitArrObj[i].name)
                        } else {
                            logger.silly('Msg# %s   NO change in circuit %s', counter, i)
                        }
                    }
                } else {

                    if (container.settings.get('logMessageDecoding')) {

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
        if (sendInitialBroadcast.initialCircuitsBroadcast === 1) container.influx.writeCircuit(currentCircuitArrObj)

    }


    function requestUpdateCircuit(source, dest, circuit, action, counter) {
        //this is for the request.  Not actual confirmation of circuit update.  So we don't update the object here.
        try {
            var status = statusToString(action)
            logger.info('Msg# %s   %s --> %s: Change %s to %s', counter, container.constants.ctrlString[source], container.constants.ctrlString[dest], getCircuitName(circuit), status)
        } catch (err) {
            logger.error("We hit an error trying to retrieve circuit: %s, action: %s, at message: %s", circuit, action, counter)
        }

    }

    function getCurrentCircuits() {
        return {'circuit': currentCircuitArrObj}
    }


    function toggleCircuit(circuit, callback) {
        circuit = parseInt(circuit)
        var desiredStatus = currentCircuitArrObj[circuit].status === 1 ? 0 : 1;
        var toggleCircuitPacket = [165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 134, 2, circuit, desiredStatus];
        container.queuePacket.queuePacket(toggleCircuitPacket);
        var response = {}
        response.text = 'User request to toggle ' + currentCircuitArrObj[circuit].name + ' to '
        response.text += statusToString(desiredStatus)
        response.status = desiredStatus === 1 ? 'on' : 'off';
        response.value = desiredStatus
        logger.info(response)
        //callback will be present when we are responding back to the Express auth and showing the user a message.  But not with SocketIO call where we will just log it.
        if (callback !== undefined) {
            callback(response)
        }

    }

    function setCircuit(circuit, state, callback) {
        circuit = parseInt(circuit)
        state = parseInt(state)
        var desiredStatus = state
        var toggleCircuitPacket = [165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 134, 2, circuit, desiredStatus];
        container.queuePacket.queuePacket(toggleCircuitPacket);
        var response = {}
        response.text = 'User request to set ' + currentCircuitArrObj[circuit].name + ' to '
        response.text += statusToString(desiredStatus)
        response.status = desiredStatus === 1 ? 'on' : 'off';
        response.value = desiredStatus
        logger.info(response)
        //callback will be present when we are responding back to the Express auth and showing the user a message.  But not with SocketIO call where we will just log it.
        if (callback !== undefined) {
            callback(response)
        }
        return response
    }

    var assignControllerLightColor = function (color, param, counter) {


        var strIntellibriteModes = container.constants.strIntellibriteModes;
        if (logIntellibrite) {
            container.logger.verbose('Msg# %s  Intellibrite light change.  Color -> %s (%s) for param %s ', counter, color, strIntellibriteModes[color], param)
        }

        var str = '';
        for (var key in lightGroup) {
            // if circuit has the light attribute
            if (currentCircuitArrObj[key].circuitFunction === 'Intellibrite') {

                // TODO: not exactly sure what the param does here.  Doesn't seem to apply to the light groups.  Is the lightGroup ever another number besides 0?

                if (color === 0) {
                    // Set to off; save previous colors


                    // save prev colors
                    currentCircuitArrObj[key].light.prevColor = currentCircuitArrObj[key].light.color
                    currentCircuitArrObj[key].light.prevColorStr = currentCircuitArrObj[key].light.colorStr
                    // save prev mode
                    currentCircuitArrObj[key].light.prevMode = currentCircuitArrObj[key].light.mode
                    currentCircuitArrObj[key].light.prevModeStr = currentCircuitArrObj[key].light.modeStr


                    // set current mode
                    currentCircuitArrObj[key].light.mode = color
                    currentCircuitArrObj[key].light.modeStr = strIntellibriteModes[color]


                    // set current color
                    currentCircuitArrObj[key].light.color = color
                    currentCircuitArrObj[key].light.colorStr = strIntellibriteModes[color]


                }
                else if (color === 1) {
                    // Set to on; restore previous colors and mode
                    // currentCircuitArrObj[key].light.mode = color
                    // currentCircuitArrObj[key].light.modeStr = strIntellibriteModes[color]

                    currentCircuitArrObj[key].light.color = currentCircuitArrObj[key].light.prevColor
                    currentCircuitArrObj[key].light.colorStr = currentCircuitArrObj[key].light.prevColorStr
                    // restore prev mode
                    currentCircuitArrObj[key].light.mode = currentCircuitArrObj[key].light.prevMode
                    currentCircuitArrObj[key].light.modeStr = currentCircuitArrObj[key].light.prevModeStr

                    currentCircuitArrObj[key].light.prevColor = 0
                    currentCircuitArrObj[key].light.prevColorStr = 'n/a'
                    currentCircuitArrObj[key].light.prevMode = 0
                    currentCircuitArrObj[key].light.prevModeStr = 'n/a'
                }
                else if (color === 160) {
                    // Color Set
                    currentCircuitArrObj[key].light.mode = color
                    currentCircuitArrObj[key].light.modeStr = strIntellibriteModes[color]

                    currentCircuitArrObj[key].light.color = lightGroup[key].colorSet
                    currentCircuitArrObj[key].light.colorStr = lightGroup[key].colorSetStr

                    currentCircuitArrObj[key].light.prevColor = 0
                    currentCircuitArrObj[key].light.prevColorStr = 'n/a'
                    currentCircuitArrObj[key].light.prevMode = 0
                    currentCircuitArrObj[key].light.prevModeStr = 'n/a'

                }
                else if (color === 190 || color === 191) {
                    // save and recall
                    currentCircuitArrObj[key].light.mode = color
                    currentCircuitArrObj[key].light.modeStr = strIntellibriteModes[color]

                    currentCircuitArrObj[key].light.color = color
                    currentCircuitArrObj[key].light.colorStr = strIntellibriteModes[color]

                    currentCircuitArrObj[key].light.prevColor = 0
                    currentCircuitArrObj[key].light.prevColorStr = 'n/a'
                    currentCircuitArrObj[key].light.prevMode = 0
                    currentCircuitArrObj[key].light.prevModeStr = 'n/a'
                }
                else {
                    // all other direct color and built-in cycle modes
                    currentCircuitArrObj[key].light.mode = color
                    currentCircuitArrObj[key].light.modeStr = strIntellibriteModes[color]

                    currentCircuitArrObj[key].light.color = color
                    currentCircuitArrObj[key].light.colorStr = strIntellibriteModes[color]

                    currentCircuitArrObj[key].light.prevColor = 0
                    currentCircuitArrObj[key].light.prevColorStr = 'n/a'
                    currentCircuitArrObj[key].light.prevMode = 0
                    currentCircuitArrObj[key].light.prevModeStr = 'n/a'
                }


                str += getFriendlyName(key) + '\n'

            }
        }
        container.io.emitToClients('circuit')

        if (container.settings.get("logIntellibrite")) {
            container.logger.info('Msg# %s  Intellibrite light change.  Color -> %s for circuit(s): \n%s', counter, strIntellibriteModes[color], str)
        }
    }

    var assignControllerLightGroup = function (_lightGroupPacketArr, counter) {

        if (1 === 0) {//(lightGroupPacket === _lightGroupPacketArr) {
            //no change
            if (logIntellibrite) {
                container.logger.silly('Msg# %s  Duplicate Light all on/off and position packet is: %s', counter, _lightGroupPacketArr)
            }
        }
        else {

            // log the packets to the local var before proceeding
            if (_lightGroupPacketArr.length === 32) {
                lightGroupPacket[0] = _lightGroupPacketArr.slice()
            }
            else if (_lightGroupPacketArr.length === 25) {
                // lightGroupPacket[6] is either 0 or 1; 12 slots total (6 per packet)
                lightGroupPacket[_lightGroupPacketArr[0]] = _lightGroupPacketArr.slice()
                lightGroupPacket.numPackets = 2
            }
            // don't process the packets/differences unless we have the single packet (len 32) or the 2nd packet of length 25
            if (_lightGroupPacketArr.length === 32 || (lightGroupPacket.numPackets === 2 && _lightGroupPacketArr[0] === 1)) {
                if (logIntellibrite) {
                    container.logger.debug('Msg# %s  Light all on/off and position packet is: %s', counter, _lightGroupPacketArr)
                }
                var tempLightGroup = {} //temporary object to hold light group/position assignments
                var tempLightGroupPacketArr = []
                var discovered = 0;
                if (Object.keys(lightGroup).length === 0) {
                    discovered = 1
                }

                if (lightGroupPacket.numPackets === 1) {
                    tempLightGroupPacketArr = lightGroupPacket[0].slice()
                }
                else if (lightGroupPacket.numPackets === 2) {
                    // lightGroupPacket[6] is either 0 or 1; 12 slots total (6 per packet)
                    // concat the arrays excluding the
                    tempLightGroupPacketArr = lightGroupPacket[0].slice(1).concat(lightGroupPacket[1].slice(1))
                }


                var numGroups = tempLightGroupPacketArr.length / 4
                for (var i = 0; i < numGroups; i++) {
                    // split off groups of 4 packets and assign them to a copy of the lightGroup
                    var _temp = tempLightGroupPacketArr.splice(0, 4) // remove this light group

                    if (_temp[0] !== 0) {
                        tempLightGroup[i] = {
                            'circuit': _temp[0],
                            'position': (_temp[1] >> 4) + 1,  // group/position 0000=1; 0001=2; 0010=3, etc.
                            'colorSet': (_temp[1] & 15),
                            'colorSetStr': container.constants.lightColors[_temp[1] & 15],
                            'colorSwimDelay': _temp[2] >> 1
                        }
                    }


                    /*

                    Use IndexBy to Pivot the array.
                    We pivot the array because the positions can change and we don't want to lose any details.
                    For example, if a light group changes from the 4th position to the 3rd, we don't want to delete it from the 4th position when we look for changes.

                    Example output:
                        indexBy:  {
                          "7": {
                            "position": 1,
                            "circuit": 7
                          },
                          "8": {
                            "position": 2,
                            "circuit": 8
                          },
                          "9": {
                            "position": 4,
                            "circuit": 9
                          },
                          "16": {
                            "position": 3,
                            "circuit": 16
                          }
                        }

                     */
                    tempLightGroup = container._.indexBy(tempLightGroup, 'circuit')

                }
                var changed = 0

                var diff1 = container.deepdiff.diff(lightGroup, tempLightGroup)


                if (logIntellibrite) {
                    container.logger.silly('Intellibrite All on/off groups indexBy: ', JSON.stringify(tempLightGroup, null, 2))
                }

                if (diff1 === undefined) {
                    if (logIntellibrite) {

                        container.logger.silly('Intellibrite all on/off packet retrieved, but there were no changes.')
                    }
                }
                else {
                    if (logIntellibrite) {

                        container.logger.debug('Intellibrite all on/off differences: %s\n\tStored values: %s', JSON.stringify(diff1, null, 2), JSON.stringify(lightGroupPacket, null, 2))
                    }
                    for (var key in diff1) {
                        var cir = diff1[key].path //circuit we want to change

                        if (diff1[key].kind === 'D') {


                            changed = 1

                            // use the prior value, and set it to 0
                            //currentCircuitArrObj[cir].light = {}
                            delete currentCircuitArrObj[cir].light

                            // use the new circuit
                            if (logIntellibrite) {
                                container.logger.silly('Intellibrite all on/off group DELETED key:', JSON.stringify(diff1[key], null, 2))
                                container.logger.verbose('Msg# %s  Light group deleted for circuit %s (%s):', counter, getFriendlyName(cir), cir, JSON.stringify(lightGroup[cir], null, 2))
                            }
                        }

                        else if (diff1[key].kind === 'N') {

                            changed = 1

                            /*
                            diff1[key].path] is the key for the tempLightGroup
                            when N(ew), we want to add it.

                                 {
                                    "kind": "N",
                                    "path": [
                                      "7"
                                    ],
                                    "rhs": {
                                      "position": 1,
                                      "circuit": 7
                                    }
                                  }
                             */

                            // if (currentCircuitArrObj[cir].hasOwnProperty('light')) {
                            currentCircuitArrObj[cir].light = new Light(diff1[key].rhs.position, 'off', 0)


                            // }
                            // else {
                            //
                            //     logger.warn('Trying to add light to circuit %s but it has no light property. \n\t %j', currentCircuitArrObj[cir].number, currentCircuitArrObj[cir])
                            // }
                            if (logIntellibrite) {
                                container.logger.silly('NEW key:', JSON.stringify(diff1[key], null, 2))
                                container.logger.verbose('Msg# %s  Light details added for circuit %s (%s):', counter, getFriendlyName(cir), cir, diff1[key].rhs.position)
                            }

                        }
                        else if (diff1[key].kind === 'E') {
                            cir = diff1[key].path[0] //circuit we want to change; different for edited because of the path

                            changed = 1

                            /*
                            diff1[key].path] is the key for the tempLightGroup
                            when E(dited), we want to change it.

                                 [
                                  {
                                    "kind": "E",
                                    "path": [
                                      "7",
                                      "group"
                                    ],
                                    "lhs": 3,
                                    "rhs": 2
                                  }
                                ]
                             */

                            var el = diff1[key].path[1]
                            var val = diff1[key].rhs
                            currentCircuitArrObj[cir].light[el] = val

                            if (logIntellibrite) {
                                container.logger.silly('NEW key:', JSON.stringify(diff1[key], null, 2))
                                container.logger.verbose('Msg# %s  Light attribute `%s` changed for circuit %s (%s) to', counter, el, getFriendlyName(cir), cir, JSON.stringify(diff1[key].rhs, null, 2))
                            }
                        }
                        else {
                            container.logger.warn('Msg# %s  Intellibrite all on/off change -- unknown for circuit %s (%s):', counter, getFriendlyName(cir), cir, JSON.stringify(diff1, null, 2))
                        }
                    }

                    lightGroup = JSON.parse(JSON.stringify(tempLightGroup))

                    for (var key in lightGroup) {
                        currentCircuitArrObj[key].light.position = lightGroup[key].position
                        currentCircuitArrObj[key].light.colorSet = lightGroup[key].colorSet
                        currentCircuitArrObj[key].light.colorSetStr = lightGroup[key].colorSetStr
                        currentCircuitArrObj[key].light.colorSwimDelay = lightGroup[key].colorSwimDelay

                    }

                    if (discovered === 1) {
                        if (logIntellibrite)
                            container.logger.silly('Msg# %s:  Intellibrite All On/Off Light positions discovered \n%s:', counter, JSON.stringify(lightGroup, null, 2))
                        var str = ''


                        for (var key in lightGroup) {
                            str += getFriendlyName(key) + ': Position ' + lightGroup[key].position + '\n'
                        }
                        container.logger.info('Msg# %s:  Intellibrite All On/Off and Light positions discovered: \n%s', counter, str)
                    }

                    if (changed) {

                        container.io.emitToClients('circuit')
                    }
                    if (sendInitialBroadcast.initialCircuitsBroadcast === 1) container.influx.writeCircuit(currentCircuitArrObj)
                }
            }
        }
    }


    function getLightGroup() {
        return lightGroup
    }

    function setDelayCancel(callback) {
        var delayCancelPacket = [165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 131, 1, 0];
        container.queuePacket.queuePacket(delayCancelPacket);
        var response = {}
        response.text = 'User request to cancel delay'
        response.status = 'Sent';
        response.value = 0
        logger.info(response)
        //callback will be present when we are responding back to the Express auth and showing the user a message.  But not with SocketIO call where we will just log it.
        if (callback !== undefined) {
            callback(response)
        }

    }

    function getNumberOfCircuits() {
        return numberOfCircuits
    }


    function setLightMode(mode) {
        // 255, 0, 255, 165, 33, 16, 34, 96, 2, 1, 0, 1, 91

        var packet = [165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 96, 2, mode, 0]
        container.queuePacket.queuePacket(packet);

        var retStr = 'API: Intellibrite Light Mode ' + container.constants.strIntellibriteModes[mode] + ' (' + mode + ') requested'
        if (container.settings.get('logAPI') || logIntellibrite) {
            container.logger.info(retStr)

        }
        // assign color to circuit object
        assignControllerLightColor(mode,0,'API')

        return retStr
    }

    function whichLightPacket(circuit) {
        // for the length 25 packets, we need to find out which packet has the circuit we want to modify

        if (lightGroupPacket.numPackets === 1) {
            return 0
        }
        else {
            // search both packets for a match
            for (var packet = 0; i <= lightGroupPacket.numPackets; packet++) {
                var numGroups = lightGroupPacket[packet].length / 4
                for (var i = 0; i <= numGroups; i++) {

                    // packets are in groups of 4.
                    // lightGroupPacket[0] is circuit
                    // lightGroupPacket[1] xxxxyyyy where xxxx is position and yyyy is the color
                    // 'position': (_temp[1] >> 4) + 1,  // group/position 0000=1; 0001=2; 0010=3, etc.

                    if (lightGroupPacket[packet][i * 4] === circuit) {
                        // return the packet # when we find a match
                        return packet
                    }
                }

            }

        }
        logger.error('Light %s not found in either packet.\n\t%j', circuit, lightGroupPacket)

    }

    function setLightPosition(circuit, position) {
        if (logIntellibrite) {
            container.logger.silly('Light setLightPosition original packet:', lightGroupPacket)

        }

        var packet,
            _lightGroupPacketArr;

        var whichPacket = whichLightPacket(circuit)
        if (lightGroupPacket.numPackets === 1) {
            _lightGroupPacketArr = lightGroupPacket[whichPacket].slice()
        }
        else {
            _lightGroupPacketArr = lightGroupPacket[whichPacket].slice(1)
        }

        var numGroups = _lightGroupPacketArr.length / 4
        for (var i = 0; i <= numGroups; i++) {

            // packets are in groups of 4.
            // lightGroupPacket[0] is circuit
            // lightGroupPacket[1] xxxxyyyy where xxxx is position and yyyy is the color
            // 'position': (_temp[1] >> 4) + 1,  // group/position 0000=1; 0001=2; 0010=3, etc.

            var positionBinary = (position - 1) << 4
            if (_lightGroupPacketArr[i * 4] === circuit) {
                _lightGroupPacketArr[(i * 4) + 1] = (positionBinary) + (_lightGroupPacketArr[(i * 4) + 1] & 15)
            }


        }
        lightGroupPacket[whichPacket] = (lightGroupPacket.numPackets === 2 ? whichPacket : []).concat(_lightGroupPacketArr).slice()
        packet = [165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 167, _lightGroupPacketArr.length].concat(lightGroupPacket[whichPacket])
        container.queuePacket.queuePacket(packet);


        if (logIntellibrite) {
            container.logger.silly('Light setLightPosition NEW      packet:', lightGroupPacket)

        }
        var retStr = 'API: Light group circuit ' + circuit + ' setPosition is now : ' + position
        if (container.settings.get('logAPI')) {
            container.logger.info(retStr)

        }

        return retStr

    }

    function setLightColor(circuit, color) {
        if (logIntellibrite) {
            container.logger.silly('Light setLightColor original packet:', lightGroupPacket)

        }

        var packet,
            _lightGroupPacketArr;

        var whichPacket = whichLightPacket(circuit)
        if (lightGroupPacket.numPackets === 1) {
            _lightGroupPacketArr = lightGroupPacket[whichPacket].slice()
        }
        else {
            _lightGroupPacketArr = lightGroupPacket[whichPacket].slice(1)
        }
        var numGroups = _lightGroupPacketArr.length / 4
        for (var i = 0; i <= numGroups; i++) {

            // packets are in groups of 4.
            // lightGroupPacket[0] is circuit
            // lightGroupPacket[1] xxxxyyyy where xxxx is position and yyyy is the color
            // 'position': (_temp[1] >> 4) + 1,  // group/position 0000=1; 0001=2; 0010=3, etc.

            if (_lightGroupPacketArr[i * 4] === circuit) {
                _lightGroupPacketArr[(i * 4) + 1] = (color) + (_lightGroupPacketArr[(i * 4) + 1] & 240)
            }


        }
        lightGroupPacket[whichPacket] = (lightGroupPacket.numPackets === 2 ? whichPacket : []).concat(_lightGroupPacketArr).slice()
        packet = [165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 167, _lightGroupPacketArr.length].concat(lightGroupPacket[whichPacket])
        container.queuePacket.queuePacket(packet);

        if (logIntellibrite) {
            container.logger.silly('Light setLightColor NEW      packet:', lightGroupPacket)

        }
        var retStr = 'API: Light group circuit ' + circuit + ' setColor is now : ' + container.constants.lightColors[color] + ' (' + color + ')'
        if (container.settings.get('logAPI')) {
            container.logger.info(retStr)

        }

        return retStr

    }

    function setLightSwimDelay(circuit, delay) {
        if (logIntellibrite) {
            container.logger.silly('Light setLightDelay original packet:', lightGroupPacket)

        }


/*        var packet;

        if (lightGroupPacket.numPackets === 1) {

            for (var i = 0; i <= 7; i++) {

                // packets are in groups of 4.
                // lightGroupPacket[0] is circuit
                // lightGroupPacket[2] is the delay
                if (lightGroupPacket[i * 4] === circuit) {
                    lightGroupPacket[(i * 4) + 2] = (delay << 1) + (lightGroupPacket[(i * 4) + 2] & 1)
                }
            }

            // 165,33,16,34,167,32,7,10,4,0,8,22,14,0,16,32,10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,58
            packet = [165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 167, 32].concat(lightGroupPacket)
        }
        else {
            // unknown at this time if the only options are 28 or 25 in length.
            // could make this generic (no if-else)...

            // make a copy
            var _lightGroupPacketArr = lightGroupPacket[whichLightPacket(circuit)].slice()

            // Some intellibrite packets have 25 values with a leading 0.  Not sure why.  See Issue #99.
            // This code will get the modulo and shift the array by that many.
            var modulo = _lightGroupPacketArr.length % 4
            var packetNum = _lightGroupPacketArr.splice(0, modulo)


            var numGroups = _lightGroupPacketArr.length / 4
            for (var i = 0; i <= numGroups; i++) {

                // packets are in groups of 4.
                // lightGroupPacket[0] is circuit
                // lightGroupPacket[1] xxxxyyyy where xxxx is position and yyyy is the color
                // 'position': (_temp[1] >> 4) + 1,  // group/position 0000=1; 0001=2; 0010=3, etc.

                if (_lightGroupPacketArr[i * 4] === circuit) {
                    _lightGroupPacketArr[(i * 4) + 2] = (delay << 1) + (_lightGroupPacketArr[(i * 4) + 2] & 1)
                }


            }

            packet = [165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 167, 25].concat(packetNum).concat(_lightGroupPacketArr)
        }*/


        var packet,
            _lightGroupPacketArr;

        var whichPacket = whichLightPacket(circuit)
        if (lightGroupPacket.numPackets === 1) {
            _lightGroupPacketArr = lightGroupPacket[whichPacket].slice()
        }
        else {
            _lightGroupPacketArr = lightGroupPacket[whichPacket].slice(1)
        }
        var numGroups = _lightGroupPacketArr.length / 4
        for (var i = 0; i <= numGroups; i++) {

            // packets are in groups of 4.
            // lightGroupPacket[0] is circuit
            // lightGroupPacket[1] xxxxyyyy where xxxx is position and yyyy is the color
            // 'position': (_temp[1] >> 4) + 1,  // group/position 0000=1; 0001=2; 0010=3, etc.

            if (_lightGroupPacketArr[i * 4] === circuit) {
                _lightGroupPacketArr[(i * 4) + 2] = (delay << 1) + (_lightGroupPacketArr[(i * 4) + 2] & 1)
            }


        }

        lightGroupPacket[whichPacket] = (lightGroupPacket.numPackets === 2 ? whichPacket : []).concat(_lightGroupPacketArr).slice()
        packet = [165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 167, _lightGroupPacketArr.length].concat(lightGroupPacket[whichPacket])
        container.queuePacket.queuePacket(packet);

        if (logIntellibrite) {
            container.logger.silly('Light setLightDelay NEW      packet:', lightGroupPacket)

        }
        var retStr = 'API: Light group circuit ' + circuit + ' Swim Delay is now : ' + delay + ' seconds'
        if (container.settings.get('logAPI')) {
            container.logger.info(retStr)

        }

        return retStr

    }


    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: circuit.js')


    return {
        init: init,
        getCurrentCircuits: getCurrentCircuits,
        getCircuit: getCircuit,
        getCircuitName: getCircuitName,
        getFriendlyName: getFriendlyName,
        getAllNonLightCircuits: getAllNonLightCircuits,
        getAllLightCircuits: getAllLightCircuits,
		poolOrSpaIsOn: poolOrSpaIsOn,
        assignCircuitStatusFromControllerStatus: assignCircuitStatusFromControllerStatus,
        assignCircuitDelayFromControllerStatus: assignCircuitDelayFromControllerStatus,
        requestUpdateCircuit: requestUpdateCircuit,
        setCircuitFromController: setCircuitFromController,
        getCurrentStatus: getCurrentStatus,
        getCurrentStatusBytes: getCurrentStatusBytes,
        setCurrentStatusBytes: setCurrentStatusBytes,
        toggleCircuit: toggleCircuit,
        setCircuit: setCircuit,
        assignControllerLightColor: assignControllerLightColor,
        assignControllerLightGroup: assignControllerLightGroup,
        setDelayCancel: setDelayCancel,
        //TESTING
        setCircuitFriendlyNames: setCircuitFriendlyNames,
        getNumberOfCircuits: getNumberOfCircuits,
        getLightGroup: getLightGroup,
        setLightMode: setLightMode,
        setLightColor: setLightColor,
        setLightSwimDelay: setLightSwimDelay,
        setLightPosition: setLightPosition
    }
}
