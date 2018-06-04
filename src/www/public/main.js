$(function () {
    var FADE_TIME = 150; // ms
    var TYPING_TIMER_LENGTH = 400; // ms
    var COLORS = [
        '#e21400', '#91580f', '#f8a700', '#f78b00',
        '#58dc00', '#287b00', '#a8f07a', '#4ae8c4',
        '#3b88eb', '#3824aa', '#a700ff', '#d300e7'
    ];

    // Initialize variables



    //var $window = $(window);
    //var $status = $('.status'); //status area
    var $input = $('equipmentChange')
    var $pump = $('#pump')
    var $config = $('#config')
    var $circuit = $('#circuit')
    var $schedule = $('#schedule')
    var $chlorinator = $('#chlorinator')


    //var $statusPage = $('.status.page') // The status page


    var socket = io();
    $config.hide();
    $pump.hide();
    $schedule.hide();
    $circuit.show();
    $chlorinator.hide();

    $('body').on('click', 'input', function () {
        //alert("event.target.id: " + event.target.id + " event.target.attr: " + JSON.stringify(event.target.attributes))
        if (!($(this).attr('id').includes('HeatMode'))) {
            setEquipmentStatus($(this).data($(this).attr('id')));
        }
    })

    //listen for temp adjustments.
    $('#circuit').on('click', 'button', function () {
        setHeatSetPoint($(this).data('equip'), $(this).data('adjust'));
    })

    $('#spaHeatMode').on('click', 'input', function () {
        setHeatMode($('#spaHeatMode').data('equip'), $(this).data('heatModeValue'))
    })

    $('#poolHeatMode').on('click', 'input', function () {
        setHeatMode($('#poolHeatMode').data('equip'), $(this).data('heatModeValue'))
    })



    $('#switchToConfig').click(function () {
        //alert('#status ' + $('#status') + '   and #config ' + $('#config'))
        $pump.hide()
        $circuit.hide();
        $schedule.hide();
        $config.show();
        $chlorinator.hide();

    })


    $('#switchToCircuit').click(function () {
        $config.hide();
        $pump.hide();
        $schedule.hide();
        $circuit.show();
        $chlorinator.hide();
    })

    $('#switchToPump').click(function () {
        $config.hide();
        $circuit.hide();
        $schedule.hide();
        $pump.show();
        $chlorinator.hide();

    })

    $('#switchToSchedule').click(function () {
        $config.hide();
        $circuit.hide();
        $schedule.show();
        $pump.hide();
        $chlorinator.hide();
    })

    $('#switchToChlorinator').click(function () {
        //alert('#status ' + $('#status') + '   and #config ' + $('#config'))
        $pump.hide()
        $circuit.hide();
        $schedule.hide();
        $config.hide();
        $chlorinator.show();

    })

    function addPump(data) {
        //$pump.append(JSON.stringify(data[1]))
        //$pump.append(JSON.stringify(data[2]))

        $('#pump1').html(data[1].name + '<br>Watts: ' + data[1].watts + '<br>RPM: ' + data[1].rpm + '<br>Error: ' + data[1].err + '<br>Mode: ' + data[1].mode + '<br>Drive state: ' + data[1].drivestate + '<br>Run Mode: ' + data[1].run)
        $('#pump2').html(data[2].name + '<br>Watts: ' + data[2].watts + '<br>RPM: ' + data[2].rpm + '<br>Error: ' + data[2].err + '<br>Mode: ' + data[2].mode + '<br>Drive state: ' + data[2].drivestate + '<br>Run Mode: ' + data[2].run)


    }

    function addConfig(data) {


        if (data != null) {
            $('#config').html('Time #: ' + data.TIME +
                    '<br>Water Temp: ' + data.poolTemp +
                    '<br>Spa Temp: ' + data.spaTemp +
                    '<br>Air Temp: ' + data.airTemp +
                    '<br>Solar Temp: ' + data.solarTemp +
                    '<br>Unknown?: ' + data.poolHeatMode2 +
                    '<br>Unknown?: ' + data.spaHeatMode2 +
                    '<br>Pool Heat Mode: ' + data.poolHeatMode +
                    '<br>Spa Heat Mode: ' + data.spaHeatMode +
                    '<br>Valve: ' + data.valve +
                    '<br>Run Mode: ' + data.runmode +
                    '<br>Unit of Measure: ' + data.UOM +
                    '<br>Heater Active(?): ' + data.HEATER_ACTIVE +
                    '<p>');
            $('#poolCurrentTemp').html('Pool Temp: ' + data.poolTemp);
            $('#spaCurrentTemp').html('Spa Temp: ' + data.spaTemp);
        }

        //$config.append(JSON.stringify(data))

    }


    function addChlorinator(data) {


        if (data != null) {
            $('#chlorinator').html('Salt: ' + data.saltPPM + ' PPM' +
                    '<br>[Pool/Default] Output (%): ' + data.outputPercent + '%' +
                    '<br>Spa Output (%): ' + data.outputSpaPercent + '%' +
                    '<br>Output Level: ' + data.outputLevel +
                    '<br>superChlorinate: ' + data.superChlorinate +
                    '<br>version: ' + data.version +
                    '<br>name: ' + data.name +
                    '<br>Status: ' + data.status +
                    '<p>');

        }

        //$config.append(JSON.stringify(data))

    }

    function addSchedule(data) {


        $('#schedules').html('Schedules<p>');
        $('#eggTimer').html('Egg Timers<p>');
        var i = 1;

        for (i; i < data.length; i++) {
            if (data[i] != null) {
                if (data[i].MODE == "Schedule") {
                    $('#schedules').append('Schedule #: ' + data[i].ID +
                            '<br>Circuit: ' + data[i].CIRCUIT +
                            '<br>Start Time: ' + data[i].START_TIME +
                            '<br>End Time: ' + data[i].END_TIME +
                            '<br>Days: ' + data[i].DAYS +
                            '<p>')

                } else //Egg timer
                {
                    $('#eggTimer').append('Schedule #: ' + data[i].ID +
                            '<br>Circuit: ' + data[i].CIRCUIT +
                            '<br>Duration: ' + data[i].DURATION +
                            '<p>')

                }
            }
        }

    }

    function addHeat(data) {
        //$('#pool').append(data.POOLSETPOINT + ' ' + data.POOLHEATMODE)
        //$('#spa').append(data.SPASETPOINT + ' ' + data.SPAHEATMODE)
        //console.log('received' + JSON.stringify(data))


        $('#poolHeatSetPoint').html('Temp Set point: ' + data.poolSetPoint)
        $('#poolHeatSetPoint').append('<button id="poolsetpointplusone">+1</button>')
        $('#poolHeatSetPoint').append('<button id="poolsetpointminusone">-1</button>')
        $('#poolsetpointplusone').data('equip', 'pool');
        $('#poolsetpointplusone').data('adjust', 1);
        $('#poolsetpointminusone').data('equip', 'pool');
        $('#poolsetpointminusone').data('adjust', -1);
        $('#spaHeatSetPoint').html('Temp Set point: ' + data.spaSetPoint)
        $('#spaHeatSetPoint').append('<button id="spasetpointplusone">+1</button>')
        $('#spaHeatSetPoint').append('<button id="spasetpointminusone">-1</button>')
        $('#spasetpointplusone').data('equip', 'spa');
        $('#spasetpointplusone').data('adjust', 1);
        $('#spasetpointminusone').data('equip', 'spa');
        $('#spasetpointminusone').data('adjust', -1);

        $('#spaHeatMode').data('spaHeatMode', data.spaHeatMode)
        $('#spaHeatMode').data('equip', "spa")
        $('#poolHeatMode').data('poolHeatMode', data.poolHeatMode)
        $('#poolHeatMode').data('equip', "pool")

        $('#poolHeatModeOff').data('heatModeValue', 0);
        $('#poolHeatModeHeater').data('heatModeValue', 1);
        $('#poolHeatModeSolarPref').data('heatModeValue', 2);
        $('#poolHeatModeSolarOnly').data('heatModeValue', 3);

        $('#spaHeatModeOff').data('heatModeValue', 0);
        $('#spaHeatModeHeater').data('heatModeValue', 1);
        $('#spaHeatModeSolarPref').data('heatModeValue', 2);
        $('#spaHeatModeSolarOnly').data('heatModeValue', 3);




        switch (data.poolHeatMode) {
            case 0: //Off
            {
                $('#poolHeatModeOff').prop('checked', true);
                $('#poolHeatModeHeater').prop('checked', false);
                $('#poolHeatModeSolarPref').prop('checked', false);
                $('#poolHeatModeSolarOnly').prop('checked', false);
                break;
            }
            case 1: //Heater
            {
                $('#poolHeatModeOff').prop('checked', false);
                $('#poolHeatModeHeater').prop('checked', true);
                $('#poolHeatModeSolarPref').prop('checked', false);
                $('#poolHeatModeSolarOnly').prop('checked', false);
                break;
            }
            case 2: //Solar Pref
            {
                $('#poolHeatModeOff').prop('checked', false);
                $('#poolHeatModeHeater').prop('checked', false);
                $('#poolHeatModeSolarPref').prop('checked', true);
                $('#poolHeatModeSolarOnly').prop('checked', false);
                break;
            }
            case 3: //Solar Only
            {
                $('#poolHeatModeOff').prop('checked', false);
                $('#poolHeatModeHeater').prop('checked', false);
                $('#poolHeatModeSolarPref').prop('checked', false);
                $('#poolHeatModeSolarOnly').prop('checked', true);
            }


        }


        switch (data.spaHeatMode) {
            case 0: //Off
            {
                $('#spaHeatModeOff').prop('checked', true);
                $('#spaHeatModeHeater').prop('checked', false);
                $('#spaHeatModeSolarPref').prop('checked', false);
                $('#spaHeatModeSolarOnly').prop('checked', false);
                break;
            }
            case 1: //Heater
            {
                $('#spaHeatModeOff').prop('checked', false);
                $('#spaHeatModeHeater').prop('checked', true);
                $('#spaHeatModeSolarPref').prop('checked', false);
                $('#spaHeatModeSolarOnly').prop('checked', false);
                break;
            }
            case 2: //Solar Pref
            {
                $('#spaHeatModeOff').prop('checked', false);
                $('#spaHeatModeHeater').prop('checked', false);
                $('#spaHeatModeSolarPref').prop('checked', true);
                $('#spaHeatModeSolarOnly').prop('checked', false);
                break;
            }
            case 3: //Solar Only
            {
                $('#spaHeatModeOff').prop('checked', false);
                $('#spaHeatModeHeater').prop('checked', false);
                $('#spaHeatModeSolarPref').prop('checked', false);
                $('#spaHeatModeSolarOnly').prop('checked', true);
            }
        }
    }

    function addCircuit(data) {

        var i = 1;
        for (i; i < 21; i++) {
            //console.log(i)
            //console.log(JSON.stringify(data[i]))

            if (data[i].hasOwnProperty('name')) {
                if (data[i].name != "NOT USED") {
                    if ((i != 10) || (i != 19)) {

                        if (document.getElementById(data[i].numberStr)) {
                            $('#' + data[i].numberStr).prop('checked', data[i].status == "on" ? true : false);
                        } else {

                            var checked = ""
                            if (data[i].status == "on") {
                                checked = "checked"
                            }
                            console.log(data[i].name + ' : ' + data[i].circuitFunction)
                            var $whichDiv = $('#features');
                            if (data[i].circuitFunction == "Spa") {
                                $whichDiv = $('#spa');
                            } else if (data[i].circuitFunction == "Pool") {
                                $whichDiv = $('#pool')
                            } else if (data[i].circuitFunction == "Light") {
                                $whichDiv = $('#light')
                            }
                            // console.log('whichDiv assigend %s  (%s : %s)', )
                            $whichDiv.append('<br>' + data[i].name + '<input type="checkbox" name="' + data[i].numberStr + '" id="' + data[i].numberStr + '" />');
                            $('#' + data[i].numberStr).data(data[i].numberStr, data[i].number)
                        }
                    }
                }
            }
        }
    }



    // Socket events

    function setHeatSetPoint(equip, change) {
        socket.emit('setHeatSetPoint', equip, change)
    }


    function setHeatMode(equip, change) {
        socket.emit('setHeatMode', equip, change)
    }


    function setEquipmentStatus(equipment) {
        socket.emit('toggleCircuit', equipment)
    }
    ;

    socket.on('circuit', function (data) {
        //console.log(data)
        addCircuit(data);

        //$input.text('Type Equipment Here...')
    });

    socket.on('config', function (data) {
        //console.log(data)
        addConfig(data);

    });

    socket.on('pump', function (data) {
        addPump(data);
    })

    socket.on('heat', function (data) {
        addHeat(data);
    })

    socket.on('schedule', function (data) {
        addSchedule(data);
    })

    socket.on('chlorinator', function (data) {
        addChlorinator(data);
    })


});
