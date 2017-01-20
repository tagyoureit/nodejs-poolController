/*jshint expr: true*/
'use strict';
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
var expect = chai.expect;
var poolHelper = require('../poolHelper');
chai.config.includeStack = true;

var allEquipment = {
    "circuits": ["blank", {
        "number": 1,
        "numberStr": "circuit1",
        "name": "SPA",
        "circuitFunction": "Spa",
        "status": 0,
        "freeze": 0,
        "friendlyName": "SPA"
    }, {
        "number": 2,
        "numberStr": "circuit2",
        "name": "JETS",
        "circuitFunction": "Generic",
        "status": 0,
        "freeze": 0,
        "friendlyName": "JETS"
    }, {
        "number": 3,
        "numberStr": "circuit3",
        "name": "AIR BLOWER",
        "circuitFunction": "Generic",
        "status": 0,
        "freeze": 0,
        "friendlyName": "AIR BLOWER"
    }, {
        "number": 4,
        "numberStr": "circuit4",
        "name": "CLEANER",
        "circuitFunction": "Master Cleaner",
        "status": 0,
        "freeze": 0,
        "friendlyName": "CLEANER"
    }, {
        "number": 5,
        "numberStr": "circuit5",
        "name": "WtrFall 1.5",
        "circuitFunction": "Generic",
        "status": 0,
        "freeze": 1,
        "friendlyName": "WATERFALL 1.5"
    }, {
        "number": 6,
        "numberStr": "circuit6",
        "name": "POOL",
        "circuitFunction": "Pool",
        "status": 1,
        "freeze": 1,
        "friendlyName": "POOL"
    }, {
        "number": 7,
        "numberStr": "circuit7",
        "name": "SPA LIGHT",
        "circuitFunction": "Light",
        "status": 0,
        "freeze": 0,
        "friendlyName": "SPA LIGHT"
    }, {
        "number": 8,
        "numberStr": "circuit8",
        "name": "POOL LIGHT",
        "circuitFunction": "Light",
        "status": 0,
        "freeze": 0,
        "friendlyName": "POOL LIGHT"
    }, {
        "number": 9,
        "numberStr": "circuit9",
        "name": "PATH LIGHTS",
        "circuitFunction": "Light",
        "status": 0,
        "freeze": 0,
        "friendlyName": "PATH LIGHTS"
    }, {
        "number": 10,
        "numberStr": "circuit10",
        "name": "NOT USED",
        "circuitFunction": "Generic",
        "status": 0,
        "freeze": 0,
        "friendlyName": "NOT USED"
    }, {
        "number": 11,
        "numberStr": "circuit11",
        "name": "SPILLWAY",
        "circuitFunction": "Spillway",
        "status": 0,
        "freeze": 0,
        "friendlyName": "SPILLWAY"
    }, {
        "number": 12,
        "numberStr": "circuit12",
        "name": "WtrFall 1",
        "circuitFunction": "Generic",
        "status": 0,
        "freeze": 0,
        "friendlyName": "WATERFALL 1"
    }, {
        "number": 13,
        "numberStr": "circuit13",
        "name": "WtrFall 2",
        "circuitFunction": "Generic",
        "status": 0,
        "freeze": 0,
        "friendlyName": "WATERFALL 2"
    }, {
        "number": 14,
        "numberStr": "circuit14",
        "name": "WtrFall 3",
        "circuitFunction": "Generic",
        "status": 0,
        "freeze": 0,
        "friendlyName": "WATERFALL 3"
    }, {
        "number": 15,
        "numberStr": "circuit15",
        "name": "Pool Low2",
        "circuitFunction": "Generic",
        "status": 0,
        "freeze": 0,
        "friendlyName": "POOL LOW"
    }, {
        "number": 16,
        "numberStr": "circuit16",
        "name": "NOT USED",
        "circuitFunction": "Spillway",
        "status": 0,
        "freeze": 0,
        "friendlyName": "NOT USED"
    }, {
        "number": 17,
        "numberStr": "circuit17",
        "name": "NOT USED",
        "circuitFunction": "Spillway",
        "status": 0,
        "freeze": 0
    }, {
        "number": 18,
        "numberStr": "circuit18",
        "name": "NOT USED",
        "circuitFunction": "Spillway",
        "status": 0,
        "freeze": 0
    }, {
        "number": 19,
        "numberStr": "circuit19",
        "name": "NOT USED",
        "circuitFunction": "Generic",
        "status": 0,
        "freeze": 0
    }, {
        "number": 20,
        "numberStr": "circuit20",
        "name": "AUX EXTRA",
        "circuitFunction": "Generic",
        "status": 0,
        "freeze": 0
    }],
    "heat": {
        "poolSetPoint": 84,
        "poolHeatMode": 0,
        "poolHeatModeStr": "OFF",
        "spaSetPoint": 101,
        "spaHeatMode": 1,
        "spaHeatModeStr": "Heater",
        "heaterActive": 0
    },
    "pumps": ["blank", {
        "pump": 1,
        "time": "5:17 PM",
        "run": 4,
        "mode": 0,
        "drivestate": 0,
        "watts": 0,
        "rpm": 0,
        "ppc": 0,
        "err": 0,
        "timer": 0,
        "duration": "durationnotset",
        "currentprogram": "currentprognotset",
        "program1rpm": "prg1notset",
        "program2rpm": "prg2notset",
        "program3rpm": "prg3notset",
        "program4rpm": "prg4notset",
        "remotecontrol": 1,
        "power": "powernotset",
        "name": "Pump 1"
    }, {
        "pump": 2,
        "time": "5:17 PM",
        "run": 4,
        "mode": 0,
        "drivestate": 0,
        "watts": 0,
        "rpm": 0,
        "ppc": 0,
        "err": 0,
        "timer": 0,
        "duration": "durationnotset",
        "currentprogram": "currentprognotset",
        "program1rpm": "prg1notset",
        "program2rpm": "prg2notset",
        "program3rpm": "prg3notset",
        "program4rpm": "prg4notset",
        "remotecontrol": 1,
        "power": 0,
        "name": "Pump 2"
    }],
    "schedule": ["blank", {
        "ID": 1,
        "CIRCUIT": "POOL",
        "CIRCUITNUM": 6,
        "MODE": "Schedule",
        "DURATION": "n/a",
        "START_TIME": "9:25",
        "END_TIME": "15:55",
        "DAYS": "Sunday Monday Tuesday Wednesday Thursday Friday Saturday "
    }, {
        "ID": 2,
        "CIRCUIT": "WtrFall 2",
        "CIRCUITNUM": 13,
        "MODE": "Schedule",
        "DURATION": "n/a",
        "START_TIME": "14:57",
        "END_TIME": "15:8",
        "DAYS": "Sunday Tuesday Thursday Saturday "
    }, {
        "ID": 3,
        "CIRCUIT": "CLEANER",
        "CIRCUITNUM": 4,
        "MODE": "Schedule",
        "DURATION": "n/a",
        "START_TIME": "10:15",
        "END_TIME": "11:0",
        "DAYS": "Sunday Monday Tuesday Wednesday Thursday Friday Saturday "
    }, {
        "ID": 4,
        "CIRCUIT": "POOL",
        "CIRCUITNUM": 6,
        "MODE": "Egg Timer",
        "DURATION": "7:15"
    }, {
        "ID": 5,
        "CIRCUIT": "CLEANER",
        "CIRCUITNUM": 4,
        "MODE": "Egg Timer",
        "DURATION": "4:0"
    }, {
        "ID": 6,
        "CIRCUIT": "Pool Low2",
        "CIRCUITNUM": 15,
        "MODE": "Schedule",
        "DURATION": "n/a",
        "START_TIME": "21:10",
        "END_TIME": "23:55",
        "DAYS": "Sunday Monday Tuesday Wednesday Thursday Friday Saturday "
    }, {
        "ID": 7,
        "CIRCUIT": "Pool Low2",
        "CIRCUITNUM": 15,
        "MODE": "Schedule",
        "DURATION": "n/a",
        "START_TIME": "0:5",
        "END_TIME": "9:20",
        "DAYS": "Sunday Monday Tuesday Wednesday Thursday Friday Saturday "
    }, {
        "ID": 8,
        "CIRCUIT": "SPA LIGHT",
        "CIRCUITNUM": 7,
        "MODE": "Egg Timer",
        "DURATION": "2:0"
    }, {
        "ID": 9,
        "CIRCUIT": "JETS",
        "CIRCUITNUM": 2,
        "MODE": "Egg Timer",
        "DURATION": "3:45"
    }, {
        "ID": 10,
        "CIRCUIT": "PATH LIGHTS",
        "CIRCUITNUM": 9,
        "MODE": "Egg Timer",
        "DURATION": "4:15"
    }, {
        "ID": 11,
        "CIRCUIT": "SPILLWAY",
        "CIRCUITNUM": 11,
        "MODE": "Schedule",
        "DURATION": "n/a",
        "START_TIME": "13:0",
        "END_TIME": "13:11",
        "DAYS": "Sunday Monday Tuesday Wednesday Thursday Friday Saturday "
    }, {
        "ID": 12,
        "CIRCUIT": "WtrFall 1.5",
        "CIRCUITNUM": 5,
        "MODE": "Schedule",
        "DURATION": "n/a",
        "START_TIME": "13:20",
        "END_TIME": "13:40",
        "DAYS": "Sunday Tuesday Thursday "
    }],
    "temperatures": {
        "poolTemp": 60,
        "spaTemp": 60,
        "airTemp": 53,
        "solarTemp": 49
    },
    "time": {
        "controllerTime": "5:17 PM",
        "pump1Time": -1,
        "pump2Time": -1
    },
    "UOM": "° Farenheit",
    "valves": {
        "valves": "Pool"
    }
}

describe('poolHelper', function() {
    var subject = new poolHelper();
    describe('#getPoolData', function() {
        context('with a URL', function() {
            it('returns pool stuff', function() {
                return expect(subject.requestPoolData().then(function(obj) {
                    return obj;
                })).to.eventually.have.property('circuits');
            });
        });
    });
    describe('#formatPoolTemperature', function() {
        context('with a request', function() {
            it('formats the status as expected', function() {
                expect(subject.formatPoolTemperature(allEquipment)).to.eq('The pool temperature is 60, spa temperature is 60 and air temperature 53.');
            });
        });
    });

    describe('#formatPoolStatus', function() {
      context('with an internal request', function() {
          it('returns the pool status', function() {
              expect(subject.isPoolOn(allEquipment)).to.be.eq(1);
          });
          it('returns the spa status', function() {
              expect(subject.isSpaOn(allEquipment)).to.be.eq(0);
          });
      })
        context('with a request', function() {
            it('formats the status as expected with the POOL ON', function() {
                expect(subject.formatPoolStatus(allEquipment)).to.eq('The pool is on and the water temperature is 60.');
            });
            it('formats the status as expected with the POOL OFF', function() {
                allEquipment.circuits[6].status = 0
                expect(subject.formatPoolStatus(allEquipment)).to.eq('The pool is off and the last reported water temperature was 60.');
            });
            it('formats the status as expected with the SPA ON', function() {
                allEquipment.circuits[1].status = 1
                allEquipment.temperatures.spaTemp = 98
                expect(subject.formatSpaStatus(allEquipment)).to.eq('The spa is on and the water temperature is 98.');
            });
            it('returns a formatted pool card', function() {
                expect(subject.formatPoolTemperatureCard(allEquipment)).to.be.an('object');
            });
        });



    });



    describe('#formatCircuitStatus', function() {
        context('with a request', function() {
            it('finds and formats the response for the circuit status', function() {
                expect(subject.formatCircuitStatus(allEquipment, 9)).to.eq('Circuit 9 is path lights and it is off.');
            });

        });

    });

    describe('#lookupCircuitFromFriendlyName', function() {
        context('with a valid circuit string', function() {
            it('returns the circuit number', function() {
                console.log('lookup waterfall 1 result: ', subject.lookupCircuitFromFriendlyName(allEquipment, 'waterfall 1'))
                expect(subject.lookupCircuitFromFriendlyName(allEquipment, 'waterfall 1')).to.eq(12);
            });

        });

    });

    describe('#toggleCircuitStatus', function() {
        context('with a request/promise', function() {
            it('returns a confirmation of the request', function() {

                var value = subject.toggleCircuit(allEquipment, 9).then(function(obj) {
                    console.log('response from test send toggle circuit: ', obj)
                    return obj
                })
                return expect(value).to.eventually.have.property('status');
            });

        });
    });
    describe('#SetCircuitStatus', function() {
        context('with a request/promise', function() {
            it('returns a confirmation of the request', function() {

                var value = subject.setCircuit(allEquipment, 9, 0).then(function(obj) {
                    console.log('response from test send toggle circuit: ', obj)
                    return obj
                })
                return expect(value).to.eventually.have.property('status');
            });

        });

    });
    describe('#PumpPrograms', function() {
        context('with a request/promise', function() {
            it('sets a program to run on a pump', function() {

                var value = subject.setPumpProgram(allEquipment, 1, 1).then(function(obj) {
                    console.log('response from test send pump program: ', obj)
                    return obj
                })
                return expect(value).to.eventually.eq('Pump 1 has been set to program 1.');
            });
            it('saves a program with a RPM to run on a pump', function() {

                var value = subject.savePumpProgramAs(allEquipment, 1, 1, 1000).then(function(obj) {
                    console.log('response from test send pump program: ', obj)
                    return obj
                })
                return expect(value).to.eventually.eq('Pump 1 program 1 has been saved as 1000 rpm.');
            });
        });
        it('runs a program on a pump with a duration', function() {

            var value = subject.runPumpProgramWithDuration(allEquipment, 1, 1, 3).then(function(obj) {
                console.log('response from test send pump program: ', obj)
                return obj
            })
            return expect(value).to.eventually.eq('Pump 1 will now run program 1 for 3 minutes.');
        });
    });
});
