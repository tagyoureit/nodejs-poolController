'use strict';
module.change_code = 1;
var _ = require('lodash');
var Alexa = require('alexa-app');
var app = new Alexa.app('poolinfo');
var PoolHelper = require('./poolHelper.js');

var poolHelper = new PoolHelper();
app.dictionary = {
    "circuits": ["spa", "jets", "air blower", "cleaner", "waterfall regular", "pool", "spa light", "pool light", "path lights", "spillway", "waterfall low", "waterfall medium", "waterfall high", "pool low"]
}


app.launch(function(req, res) {
    poolHelper.requestPoolData().then(function(PoolData) {
        var prompt = 'Ask me about your pool.';
        var reprompt = 'I did not hear your response.  What would you like to know.  You can ask for temperature or status of your pool or spa'
        console.log('prompt')
        res.session('poolData', PoolData)
        res.say(prompt).reprompt(reprompt).shouldEndSession(false).send();
    }).catch(function(err) {
        console.log("error:" + err.statusCode);
        var prompt = 'I can\'t connect to your Pool right now, sorry';
        //https://github.com/matt-kruse/alexa-app/blob/master/index.js#L171
        res.say(prompt).shouldEndSession(true).send();
    });
    return false;

});

app.intent('temperature', {
        'slots': {
            'POOLSPA': 'POOLEQUIPMENT'
        },
        'utterances': ["{|what|what's|what is} {|the} {temperature|temp} {|of|for} {|my} {-|POOLSPA}"]
    },
    function(req, res) {
        /*              var str = poolHelper.formatPoolTemperature(req.session('poolData'))
              res.say(str).shouldEndSession(false)*/
        //get the slot
        if (_.isEmpty(req.slot('POOLSPA'))){
          poolHelper.isPoolOn(PoolData)
        }
        var poolEquipment = req.slot('POOLSPA')
        console.log('is empty pool equipment in temperature: ', _.isEmpty(poolEquipment))
        var str = poolHelper.formatPoolTemperature(req.session('poolData'))
        console.log('pool temp? ', str)
        var pcard = poolHelper.formatPoolTemperatureCard(req.session('poolData'))
        res.say(str).card(pcard).shouldEndSession(false)

        return true

    }
);

app.intent('poolStatus', {
        'slots': {
            'EQUIPMENT': 'CIRCUITSTR'
        },
        'utterances': ["{|what|what's|what is} {|the} {status} {|of|for} {|my} {-|EQUIPMENT}"]
    },
    function(req, res) {
        //get the slot
        var poolEquipment = req.slot('EQUIPMENT')
        console.log('poolEquipment: ' + poolEquipment)

        //res.card(request.session('PoolData'))
        if (poolEquipment === 'pool') {
            console.log('pool: ' + poolHelper.formatPoolStatus(req.session('poolData')))
            res.say(poolHelper.formatPoolStatus(req.session('poolData'))).shouldEndSession(false);
        } else //poolEquipment === 'spa'
        {
            var str = poolHelper.formatSpaStatus(req.session('poolData'))
            console.log('spa: ' + str)
            res.say(str).shouldEndSession(false);
        }
        return true
    }
);

app.intent('getCircuitStatus', {
        'slots': {
            'CIRCUIT': 'NUMBER'
        },
        'utterances': ["{|what is|what is the|what's the|tell me|tell me the}  {|status|state} {|of|for}  {circuit} {-|CIRCUIT}"]
    },
    function(req, res) {
        //get the slot
        var circuit = req.slot('CIRCUITNUMBER')
        console.log('Circuit: ' + circuit)
        if (_.isEmpty(circuit)) {
            res.say("Please say that again with a Circuit Number.")
        } else {
            var str = poolHelper.formatCircuitStatus(req.session('poolData'), circuit)
            console.log('spa: ' + str)
            res.say(str).shouldEndSession(false);
        }
        return true
    }
);


app.intent('toggleCircuitStatus', {
        'slots': {

            'EQUIPMENT': 'CIRCUITSTR'
        },
        'utterances': ["{|set|change|adjust|toggle|switch} {|the} {|circuit|feature} {-|EQUIPMENT}"]
    },
    function(req, res) {
        //get the slot
        var circuit = req.slot('POOLEQUIPMENT')
            //var state = req.slot('STATE')
        console.log('Request to toggle Circuit: ' + circuit) // + ' & state: ' + state)
        if (_.isEmpty(circuit)) {
            res.say("Please say that again with a Circuit Name.")
            return true
        } else {
            //console.log('before prompt')
            //var prompt =
            //console.log('prompt: ', prompt)
            return poolHelper.toggleCircuit(req.session('poolData'), circuit).then(function(obj) {
                console.log('response from setCircuit: ' + obj)
                var prompt = obj
                var reprompt = "would you like to know more?"
                res.say(prompt).reprompt(reprompt).shouldEndSession(false).send();

                //return "your circuit was changed"
                //return obj
            }).catch(function(err) {
                console.log("error:" + JSON.stringify(err))
                var prompt = 'there was an error and it is ' + err.statusCode
                res.say(prompt).shouldEndSession(true).send()
            });


        }
    }
);

app.intent('setCircuitStatus', {
        'slots': {

            'EQUIPMENT': 'CIRCUITSTR',
            'EQUIPSTATE': 'STATESTR'
        },
        'utterances': ["{turn the|set the|}  {-|EQUIPMENT} {|circuit|feature|equipment} {-|EQUIPSTATE}"]
    },
    function(req, res) {
        //get the slot
        var circuit = req.slot('EQUIPMENT')
        var state = req.slot('EQUIPSTATE')
            //var state = req.slot('STATE')
        console.log('Request to toggle Circuit: ' + circuit) // + ' & state: ' + state)
        if (_.isEmpty(circuit) && _.isEmpty(state)) {
            res.say("Please say that again with a Circuit Name and on or off.")
            return true
        } else if (_.isEmpty(circuit)) {
            res.say("Do you want the " + circuit + " on or off?")
            return true
        } else if (_.isEmpty(state)) {
            res.say('Which Circuit do you want ' + state)
        } else {
            //console.log('before prompt')
            //var prompt =
            //console.log('prompt: ', prompt)
            poolHelper.setCircuit(req.session('poolData'), circuit, state).then(function(obj) {
                console.log('response from setCircuit: ' + obj)
                var prompt = obj
                var reprompt = "would you like to know more?"
                res.say(prompt).reprompt(reprompt).shouldEndSession(false).send();

                //return "your circuit was changed"
                //return obj
            }).catch(function(err) {
                console.log("error:" + JSON.stringify(err))
                var prompt = 'there was an error and it is ' + err.statusCode
                res.say(prompt).shouldEndSession(true).send()
            });


        }
        return false
    }
);

app.intent('setPumpToProgram', {
        'slots': {

            'PUMP': 'NUMBER',
            'PROGRAM': 'NUMBER'
        },
        'utterances': ["{set pump|run pump} {-|PUMP} {program|to program} {-|PROGRAM}"]
    },
    function(req, res) {
        //get the slot
        var pump = req.slot('PUMP')
        var program = req.slot('PROGRAM')
            //var state = req.slot('STATE')
        console.log('Request to set pump ' + pump + ' to program: ' + program )
        if (_.isEmpty(pump) && _.isEmpty(program)) {
            res.say("Please say the program number and pump.")
            return true
        } else if (_.isEmpty(program)) {
            res.say('Which program do you want to run on pump '+ program)
            return true
        } else if (_.isEmpty(pump)) {
            res.say('Which pump do you want run ' + program)
        } else {
            //console.log('before prompt')
            //var prompt =
            //console.log('prompt: ', prompt)
            poolHelper.setPumpProgram(req.session('poolData'), pump, program).then(function(obj) {
                console.log('response from setPumpProgram: ' + obj)
                var prompt = obj
                var reprompt = "would you like to know more?"
                res.say(prompt).reprompt(reprompt).shouldEndSession(false).send();

                //return "your circuit was changed"
                //return obj
            }).catch(function(err) {
                console.log("error:" + JSON.stringify(err))
                var prompt = 'there was an error and it is ' + err.statusCode
                res.say(prompt).shouldEndSession(true).send()
            });


        }
        return false
    }
);

app.intent('savePumpProgramAs', {
        'slots': {

            'PUMP': 'NUMBER',
            'PROGRAM': 'NUMBER',
            'RPM': 'NUMBER'
        },
        'utterances': ["{save pump} {-|PUMP} {program} {-|PROGRAM} {as} {-|RPM} {rpm}"]
    },
    function(req, res) {
        //get the slot
        var pump = req.slot('PUMP')
        var program = req.slot('PROGRAM')
        var rpm = req.slot('RPM')
            //var state = req.slot('STATE')
        console.log('Request to save pump ' + pump + ' program ' + program + ' at ' + rpm)
        if (_.isEmpty(pump) && _.isEmpty(program)) {
            res.say("Please say the program number and pump.")
            return true
        } else if (_.isEmpty(program)) {
            res.say('Which program do you want to run on pump '+ program)
            return true
        } else if (_.isEmpty(pump)) {
            res.say('Which pump do you want run ' + program)
        } else {
            //console.log('before prompt')
            //var prompt =
            //console.log('prompt: ', prompt)
            poolHelper.savePumpProgramAs(req.session('poolData'), pump, program, rpm).then(function(obj) {
                console.log('response from savePumpProgramAs: ' + obj)
                var prompt = obj
                var reprompt = "would you like to know more?"
                res.say(prompt).reprompt(reprompt).shouldEndSession(false).send();

                //return "your circuit was changed"
                //return obj
            }).catch(function(err) {
                console.log("error:" + JSON.stringify(err))
                var prompt = 'there was an error and it is ' + err.statusCode
                res.say(prompt).shouldEndSession(true).send()
            });


        }
        return false
    }
);

app.intent('runPumpProgramWithDuration', {
        'slots': {

            'PUMP': 'NUMBER',
            'PROGRAM': 'NUMBER',
            'DURATION': 'NUMBER'
        },
        'utterances': ["{run pump} {-|PUMP} {program} {-|PROGRAM} {for} {-|DURATION} {minutes}"]
    },
    function(req, res) {
        //get the slot
        var pump = req.slot('PUMP')
        var program = req.slot('PROGRAM')
        var duration = req.slot('DURATION')
            //var state = req.slot('STATE')
        console.log('Request to run pump ' + pump + ' program ' + program + ' for ' + duration)
        if (_.isEmpty(pump) && _.isEmpty(program)) {
            res.say("Please say the program number and pump and duration.")
            return true
        } else if (_.isEmpty(program)) {
            res.say('Which program do you want to run on pump '+ program)
            return true
        } else if (_.isEmpty(pump)) {
            res.say('Which pump do you want run ' + program)
        } else {
            //console.log('before prompt')
            //var prompt =
            //console.log('prompt: ', prompt)
            return poolHelper.runPumpProgramWithDuration(req.session('poolData'), pump, program, duration).then(function(obj) {
                console.log('response from runPumpProgramWithDuration: ' + obj)
                var prompt = obj
                var reprompt = "would you like to know more?"
                res.say(prompt).reprompt(reprompt).shouldEndSession(false).send();

                //return "your circuit was changed"
                //return obj
            }).catch(function(err) {
                console.log("error:" + JSON.stringify(err))
                var prompt = 'there was an error and it is ' + err.statusCode
                res.say(prompt).shouldEndSession(true).send()
            });


        }

    }
);


/*var poolHelperTest = new PoolHelper();
poolHelperTest.requestPoolData().then(function(PoolData) {
    console.log('card?? ', poolHelper.formatPoolTemperatureCard(PoolData))
    console.log(PoolData);
})
poolHelperTest.toggleCircuit(9).then(function(response){
  console.log('response from test send toggle circuit: ', response.body)
})*/


//hack to support custom utterances in utterance expansion string
console.log(app.utterances().replace(/\{\-\|/g, '{'));
module.exports = app;
