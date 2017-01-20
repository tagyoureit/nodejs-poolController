'use strict';
var _ = require('lodash');
var rp = require('request-promise');
var URL = 'http://DDNS_OF_YOUR_SERVER:3000/';

function PoolHelper() {}

PoolHelper.prototype.requestPoolData = function() {
    console.log('request pool status')
    return this.sendCommand('all').then(
        function(response) {
            console.log('success - received Pool info: %s', JSON.stringify(response.body));
            return response.body;
        }
    );
};

PoolHelper.prototype.sendCommand = function(command) {
    var options = {
        method: 'GET',
        uri: URL + command,
        resolveWithFullResponse: true,
        json: true
    };
    return rp(options);
};

PoolHelper.prototype.isPoolOn = function(PoolData){
  for (var i=1; i<=16; i++){
    console.log('pool i: ' + i + ' func: ' + PoolData.circuits[i].circuitFunction + ' status: ' +  PoolData.circuits[i].status)
    if (PoolData.circuits[i].circuitFunction==='Pool'){
      return PoolData.circuits[i].status
    }
  }
  return 0
}

PoolHelper.prototype.isSpaOn = function(PoolData){
  for (var i=1; i<=16; i++){
        console.log('spa i: ' + i + ' func: ' + PoolData.circuits[i].circuitFunction + ' status: ' +  PoolData.circuits[i].status)
    if (PoolData.circuits[i].circuitFunction==='Spa'){
      return PoolData.circuits[i].status
    }
  }
  return 0
}

PoolHelper.prototype.toggleCircuit = function(PoolData, circuit) {
    console.log('request circuit ' + circuit + ' toggle')
    if (!(circuit>=1 && circuit<=16)){
      var res = this.lookupCircuitFromFriendlyName(PoolData,circuit)
      if (res===-1){return 'I could not find a circuit called ' + circuit}
      else {
        circuit = res
      }
    }
    var command = 'circuit/' + circuit + '/toggle'
    return this.sendCommand(command).then(
        function(response) {
            console.log('success - received confirmation of circuit toggle: %s', JSON.stringify(response.body))
            return response.body
        }
    )
}

PoolHelper.prototype.setCircuit = function(PoolData, circuit, state) {
    console.log('request circuit ' + circuit + ' set to' + state)
    var stateBin = state==='off'?0:1
    if (!(circuit>=1 && circuit<=16)){
      var res = this.lookupCircuitFromFriendlyName(PoolData,circuit)
      if (res===-1){return 'I could not find a circuit called ' + circuit}
      else {
        circuit = res
      }
    }
    var command = 'circuit/' + parseInt(circuit) + '/set/' + parseInt(state)
    return this.sendCommand(command).then(
        function(response) {
            console.log('success - received confirmation of circuit toggle: %s', JSON.stringify(response.body))
            return response.body
        }
    )
}

PoolHelper.prototype.setPumpProgram = function(PoolData, pump, program) {
    console.log('request pump ' + pump + ' to run program ' + program)
    var command = 'pumpCommand/pump/' + parseInt(pump) + '/program/' + parseInt(program)
    return this.sendCommand(command).then(
        function(response) {
            console.log('success - received confirmation of pump program: %s', JSON.stringify(response.body))
            var str = 'Pump ' + response.body.equip + ' has been set to program ' + response.body.program + '.'
            return str
        }
    )
}


PoolHelper.prototype.savePumpProgramAs = function(PoolData, pump, program, rpm) {
    console.log('request pump ' + pump + ' to save program ' + program + ' as ' + rpm + ' rpm')
    var command = 'pumpCommand/' + pump+ '/'+ program + '/' + rpm
    return this.sendCommand(command).then(
        function(response) {
            console.log('success - received confirmation of pump program: %s', JSON.stringify(response.body))
            var str = 'Pump ' + response.body.equip + ' program ' + response.body.program + ' has been saved as ' + response.body.value + ' rpm.'
            return str
        }
    )
}

PoolHelper.prototype.runPumpProgramWithDuration = function(PoolData, pump, program, duration) {
    console.log('request pump ' + pump + ' to run program ' + program + ' for ' + duration + ' rpm')
    var command = 'pumpCommand/pump/' + pump+ '/program/'+ program + '/duration/' + duration
    return this.sendCommand(command).then(
        function(response) {
            console.log('success - received confirmation of pump program: %s', JSON.stringify(response.body))
            var str = 'Pump ' + response.body.equip + ' will now run program ' + response.body.program + ' for ' + response.body.duration + ' minutes.'
            return str
        }
    )
}

PoolHelper.prototype.lookupCircuitFromFriendlyName = function(PoolData, circuitstr){
  for (var i=1; i<=16; i++){
    if (PoolData.circuits[i].friendlyName.toLowerCase()===circuitstr.toLowerCase()){
      return PoolData.circuits[i].number  //or just i, but this is more fun
    }
  }
  return -1
}



PoolHelper.prototype.formatPoolTemperature = function(PoolData) {
    var temperature = _.template('The pool temperature is ${pooltemperature}, spa temperature is ${spatemperature} and air temperature ${airtemperature}.')({
        pooltemperature: PoolData.temperatures.poolTemp,
        spatemperature: PoolData.temperatures.spaTemp,
        airtemperature: PoolData.temperatures.airTemp
    });

    return temperature;
};

PoolHelper.prototype.formatPoolTemperatureCard = function(PoolData) {
    var card = {
        type: "Simple",
        title: "Pool Temperature",
        content: "Pool temperature: " + PoolData.temperatures.poolTemp + ", Spa Temperature: " + PoolData.temperatures.spaTemp + ", Air Temperature: " + PoolData.temperatures.airTemp
    }

    return card;
};

PoolHelper.prototype.formatPoolStatus = function(PoolData) {
    var poolStatus = PoolData.circuits[6].status === 0 ? "off" : "on"
    var status;
    if (poolStatus === "off") {
        status = _.template('The pool is ${poolstatus} and the last reported water temperature was ${pooltemperature}.')({
            poolstatus: poolStatus,
            pooltemperature: PoolData.temperatures.poolTemp
        });
    } else {
        status = _.template('The pool is ${poolstatus} and the water temperature is ${pooltemperature}.')({
            poolstatus: poolStatus,
            pooltemperature: PoolData.temperatures.poolTemp
        });
    }

    return status;
};

PoolHelper.prototype.formatSpaStatus = function(PoolData) {

    var status = _.template('The spa is ${spastatus} and the water temperature is ${spatemperature}.')({
        spastatus: PoolData.circuits[1].status === 0 ? "off" : "on",
        spatemperature: PoolData.temperatures.spaTemp
    });

    return status;
};


PoolHelper.prototype.formatCircuitStatus = function(PoolData, circuit) {
    var str = _.template('Circuit ' + circuit + ' is ${circuitname} and it is ${circuitstatus}.')({
        circuitname: PoolData.circuits[circuit].friendlyName.toLowerCase(),
        circuitstatus: PoolData.circuits[circuit].status === 0 ? 'off' : 'on'
    });

    return str;
};


module.exports = PoolHelper;
