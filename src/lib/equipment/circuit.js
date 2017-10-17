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

function Light(group, colorStr, color) {
  this.group = group;
  this.colorStr = colorStr;
  this.color = color;
}

function Circuit(number, numberStr, name, circuitFunction, status, freeze, macro, delay, group, colorStr, color) {
  this.number = number; //1
  this.numberStr = numberStr; //circuit1
  this.name = name; //Pool
  this.circuitFunction = circuitFunction; //Generic, Light, etc
  this.status = status; //0, 1
  this.freeze = freeze; //0, 1
  this.macro = macro; //is the circuit a macro?
  this.delay = delay; //0 no delay, 1 in delay
  this.light = {
    'group': group,
    'colorStr': colorStr,
    'color': color
  };
}


var currentCircuitArrObj = {},
  lightGroup = {},
  numberOfCircuits = 20


module.exports = function(container) {


  /*istanbul ignore next */
  if (container.logModuleLoading)
    container.logger.info('Loading: circuit.js')

  var init = function() {

    for (var i = 1; i <= numberOfCircuits; i++) {
      lightGroup[i] = new Light(-1, 'off', -1) // assign empty light object
      currentCircuitArrObj[i] = new Circuit()
    }

  }

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

  var pad = function(num, size) {
    //makes any digit returned as a string of length size (for outputting formatted byte text)
    var s = "   " + num;
    return s.substr(s.length - size);
  }

  var printStatus = function(data1, data2) {

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
  var getCircuitFriendlyNames = function() {
    var useFriendlyName
    for (var i = 1; i <= numberOfCircuits; i++) {
      if (container.settings.circuitFriendlyNames[i] === "") {
        useFriendlyName = false
      } else {
        //for now, UI doesn't support renaming 'pool' or 'spa'.  Check for that here.
        if ((currentCircuitArrObj[i].circuitFunction === "Spa" && container.settings.circuitFriendlyNames[i] !== "Spa") ||
          (currentCircuitArrObj[i].circuitFunction === "Pool" && container.settings.circuitFriendlyNames[i] !== "Pool")) {
          logger.warn('The %s circuit cannot be renamed at this time.  Skipping.', currentCircuitArrObj[i].circuitFunction)
          useFriendlyName = false
        } else {
          useFriendlyName = true
        }
      }
      if (useFriendlyName) {
        currentCircuitArrObj[i].friendlyName = container.settings.circuitFriendlyNames[i].toUpperCase()
      } else {
        currentCircuitArrObj[i].friendlyName = currentCircuitArrObj[i].name
      }
    }
  }

  var statusToString = function(status) {
    if (status === 1)
      return 'on'
    else {
      return 'off'
    }
  }
  var outputInitialCircuitsDiscovered = function() {
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

  var doWeHaveAllInformation = function() {
    //simple function to see if we have both the circuit names & status (come from 2 different sets of packets)
    if (sendInitialBroadcast.haveCircuitNames === 1 && sendInitialBroadcast.haveCircuitStatus === 1) {
      outputInitialCircuitsDiscovered()
      sendInitialBroadcast.initialCircuitsBroadcast = 1
    }

  }

  var assignCircuitVars = function(circuit, circuitArrObj) {
    //we don't inculde status because it comes from a different packet
    currentCircuitArrObj[circuit].number = circuitArrObj.number
    currentCircuitArrObj[circuit].numberStr = circuitArrObj.numberStr
    currentCircuitArrObj[circuit].name = circuitArrObj.name
    currentCircuitArrObj[circuit].freeze = circuitArrObj.freeze
    currentCircuitArrObj[circuit].circuitFunction = circuitArrObj.circuitFunction
    currentCircuitArrObj[circuit].macro = circuitArrObj.macro

    currentCircuitArrObj[circuit].light = JSON.parse(JSON.stringify(lightGroup[circuit])) //copy light group object
  }




  function circuitChanged(circuit, counter) {


    var results = currentCircuitArrObj[circuit].whatsDifferent(circuit);
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
    if (sendInitialBroadcast.initialCircuitsBroadcast === 1) container.influx.writeCircuit(currentCircuitArrObj)
  }


  function getCircuit(circuit) {
    return currentCircuitArrObj[circuit]
  }


  function getCircuitName(circuit) {
    try {
        if (circuit >= 1 && circuit <= numberOfCircuits) {
          return currentCircuitArrObj[circuit].name
        } else {
          return container.constants.strCircuitFunction[circuit]
        }
      }
      catch(err) {
        logger.warn('Tried to retrieve circuit %s which is not a valid circuit.', circuit)
        return 'No valid circuit (' + circuit + ')'
      }

  }

  //external methode to return the friendlyName
  function getFriendlyName(circuit) {
    try {
      if (circuit >= 1 && circuit <= numberOfCircuits) {
        return currentCircuitArrObj[circuit].friendlyName
      } else {
        return container.constants.strCircuitFunction[circuit]
      }
    } catch (err) {
      logger.warn('Tried to retrieve circuit %s which is not a valid circuit.', circuit)
      return 'No valid circuit (' + circuit + ')'
    }

  }

  function setCircuitFromController(circuit, nameByte, functionByte, counter) {

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
    }

    if (circuit === numberOfCircuits && sendInitialBroadcast.haveCircuitNames === 0) {
      sendInitialBroadcast.haveCircuitNames = 1
      getCircuitFriendlyNames()
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
    if (sendInitialBroadcast.initialCircuitsBroadcast === 1) container.influx.writeCircuit(currentCircuitArrObj)

  }

  function assignCircuitDelayFromControllerStatus(_delay, counter) {
    logger.info("CHECKING DELAY!  %s", _delay)
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
          if (container.settings.logConfigMessages) logger.info('Msg# %s   Delay for Circuit %s changed from :  No Delay --> Delay', counter, i)
          currentCircuitArrObj[i].delay = 1
          container.io.emitToClients('circuit')
        }
        // else if (currentCircuitArrObj[i].delay === 1) then no change
      } else if (i !== _delay) {
        if (currentCircuitArrObj[i].delay === 1) {
          // change in delay from delay to 'no delay'
          if (container.settings.logConfigMessages) logger.info('Msg# %s   Delay for Circuit %s changed from :  Delay --> No Delay', counter, i)
          currentCircuitArrObj[i].delay = 0
          container.io.emitToClients('circuit')
        }

      }

    }
  }

  //this function takes the status packet (controller:2) and parses through the equipment fields
  function assignCircuitStatusFromControllerStatus(data, counter) {

    //temp object so we can compare
    //Is there a faster way to do this?
    var circuitArrObj = []
    //TODO: clean this section up.  probably don't need to broadcast it at all because we broadcast the full circuits later
    //assign circuit status to circuitArrObj


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
          if (container.settings.logConfigMessages) logger.silly('Msg# %s   Circuit %s state discovered:  %s', counter, j + (i * 8) + 1, circuitArrObj[j + (i * 8) + 1].status)
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
      //logger.verbose('Msg# %s   Circuit %s state discovered:  %s', counter, j + (i * 8) + 1, newStatus)
      //currentCircuitArrObj[j + (i * 8) + 1].status = newStatus
    } else
      for (i = 1; i <= numberOfCircuits; i++) {
        if (currentCircuitArrObj[i].status === circuitArrObj[i].status) {
          //nothing changed
          if (container.settings.logMessageDecoding) {
            if (sendInitialBroadcast.haveCircuitNames) {
              logger.silly('Msg# %s   NO change in circuit %s', counter, currentCircuitArrObj[i].name)
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
    return response
  }

  var setControllerLightColor = function(color, lightGroup, counter) {
    console.log('clr %s, lgrp %s, counter %s', color, lightGroup, counter)
    var strIntellibriteModes = container.constants.strIntellibriteModes;
    // if (container.settings.logConfigMessages)
    container.logger.verbose('Msg# %s  Detected a light change.  Color -> %s (%s) for light group %s ', counter, color, strIntellibriteModes[color], lightGroup)

    for (var key in currentCircuitArrObj) {
      if (currentCircuitArrObj[key].light.group === lightGroup) {
        currentCircuitArrObj[key].light.color = color
        currentCircuitArrObj[key].light.colorStr = strIntellibriteModes[color]
        lightGroup[key].light.color = color
        lightGroup[key].light.colorStr = strIntellibriteModes[color]
        // if (container.settings.logConfigMessages)
        container.logger.info('Msg# %s  Detected a light change.  Color -> %s (%s) for circuit %s (%s)', counter, color, strIntellibriteModes[color], JSON.stringify(currentCircuitArrObj[key].light, null, 2), key)
      }
    }

  }

  var setControllerLightGroup = function(_lightGroupPacketArr, counter) {
    container.logger.info('Msg# %s  Light group/positions are: %s', counter, _lightGroupPacketArr)

    var _temp = {} //temporary object to hold light group/position assignments
    for (var i = 0; i <= 7; i++) {
      // split off groups of 4 packets and assign them to a copy of the lightGroup
      var _this = _lightGroupPacketArr.splice(0, 4) // remove this light groupt

      if (_this[0] !== 0) {
        _temp[_this[0]] = {
          'group': (_this[1] / 16) + 1
        } // group/position reported as 0, 16, 32, 48
      }
    }

    var changed = 0
    for (var key in lightGroup) {
      if (lightGroup[key].group !== -1 && !_temp.hasOwnProperty(key)) {
        // compare existing light group to passed light group assignments.
        // if the group is not 0 in the existing lightGroup, and does
        // not exist in the passed light assignments than it was deleted
        // light group deleted
        changed = 1
        lightGroup[key].group = new Light(0, 'off', 0)
        currentCircuitArrObj[key].light = new Light(0, 'off', 0)
        if (container.settings.logConfigMessages)
          container.logger.verbose('Msg# %s  Light group deleted on circuit %s (%s):', counter, currentCircuitArrObj[key].friendlyName, key, JSON.stringify(lightGroup[key], null, 2))
      } else
      if (_temp.hasOwnProperty(key)) {
        // if the group does exist in the passed light group
        if (lightGroup[key].group !== _temp[key].group) {
          // check to see if it is the same as what we already have
          // if it's different, we can determine that there is an
          // add/change in group assignment
          changed = 1
          lightGroup[key].group = _temp[key].group
          currentCircuitArrObj[key].light.group = _temp[key].group
          if (container.settings.logConfigMessages)
            container.logger.verbose('Msg# %s  Light group added or changed for circuit %s (%s):', counter, currentCircuitArrObj[key].friendlyName, key, JSON.stringify(lightGroup[key], null, 2))
        } else if (lightGroup[key].group !== _temp[key].group) {
          // if it is the same, then no change
          if (container.settings.logConfigMessages)
            container.logger.silly('Msg# %s  No change in light group for circuit %s (%s):', counter, currentCircuitArrObj[key].friendlyName, key, lightGroup[key])
        }
      }
    }
    if (changed)
      container.io.emitToClients('circuit');

    if (sendInitialBroadcast.initialCircuitsBroadcast === 1) container.influx.writeCircuit(currentCircuitArrObj)
  }

  function setDelayCancel(callback) {
    var delayCancelPacket = [165, container.intellitouch.getPreambleByte(), 16, container.settings.appAddress, 131, 1, 0];
    container.queuePacket.queuePacket(delayCancelPacket);
    var response = {}
    response.text = 'User request to cancel delay'
    response.status = 'Sent';
    response.value = 0
    logger.info(response)
    //callback will be present when we are responding back to the Express server and showing the user a message.  But not with SocketIO call where we will just log it.
    if (callback !== undefined) {
      callback(response)
    }

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
    assignCircuitStatusFromControllerStatus: assignCircuitStatusFromControllerStatus,
    assignCircuitDelayFromControllerStatus: assignCircuitDelayFromControllerStatus,
    requestUpdateCircuit: requestUpdateCircuit,
    setCircuitFromController: setCircuitFromController,
    getCurrentStatus: getCurrentStatus,
    getCurrentStatusBytes: getCurrentStatusBytes,
    setCurrentStatusBytes: setCurrentStatusBytes,
    toggleCircuit: toggleCircuit,
    setCircuit: setCircuit,
    setControllerLightColor: setControllerLightColor,
    setControllerLightGroup: setControllerLightGroup,
    setDelayCancel: setDelayCancel,
    //TESTING
    getCircuitFriendlyNames: getCircuitFriendlyNames,
    numberOfCircuits: numberOfCircuits
  }
}
