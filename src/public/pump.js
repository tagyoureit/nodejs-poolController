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

    var $pump = $('#pump')
    var $chlorinator = $('#chlorinator')


    //var $statusPage = $('.status.page') // The status page


    var socket = io();

    $pump.show();
    $chlorinator.hide();



    $('#switchToPump').click(function () {
        $pump.show();
        $chlorinator.hide();

    })


    $('#switchToChlorinator').click(function () {
        //alert('#status ' + $('#status') + '   and #config ' + $('#config'))
        $pump.hide()
        $chlorinator.show();

    })


    $('#pu1pr1run').click(function () {
        //alert('pu1pr1set clicked with speed: ' + $('#pump1program1setspeed').val());
        pumpCommand(1, 1,  $('#pump1program1setspeed').val(), $('#pump1duration').val());
    })

    $('#pu1pr2run').click(function () {
        //alert('pu1pr1set clicked with speed: ' + $('#pump1program1setspeed').val());
        pumpCommand(1, 2,  $('#pump1program2setspeed').val(), $('#pump1duration').val());
    })
    $('#pu1pr3run').click(function () {
        //alert('pu1pr1set clicked with speed: ' + $('#pump1program1setspeed').val());
        pumpCommand(1, 3,  $('#pump1program3setspeed').val(), $('#pump1duration').val());
    })
    $('#pu1pr4run').click(function () {
        //alert('pu1pr1set clicked with speed: ' + $('#pump1program1setspeed').val());
        pumpCommand(1, 4,  $('#pump1program4setspeed').val(), $('#pump1duration').val());
    })

    $('#pu2pr1run').click(function () {
        //alert('pu1pr1set clicked with speed: ' + $('#pump1program1setspeed').val());
        pumpCommand(2, 1,  $('#pump2program1setspeed').val(), $('#pump2duration').val());
    })

    $('#pu2pr2run').click(function () {
        //alert('pu1pr1set clicked with speed: ' + $('#pump1program1setspeed').val());
        pumpCommand(2, 2,  $('#pump2program2setspeed').val(), $('#pump2duration').val());
    })
    $('#pu2pr3run').click(function () {
        //alert('pu1pr1set clicked with speed: ' + $('#pump1program1setspeed').val());
        pumpCommand(2, 3,  $('#pump2program3setspeed').val(), $('#pump2duration').val());
    })
    $('#pu2pr4run').click(function () {
        //alert('pu1pr1set clicked with speed: ' + $('#pump1program1setspeed').val());
        pumpCommand(2, 4,  $('#pump2program4setspeed').val(), $('#pump2duration').val());
    })


    $('#pu1off').click(function () {
        //alert('pu1off clicked');
        pumpCommand(1,0,0);
    })

    $('#pu2off').click(function () {

        pumpCommand(2,0, 0)
    })

        $('#pu1on').click(function () {
        //alert('pu1off clicked');
        pumpCommand(1, 1,0);
    })

            $('#pu2on').click(function () {
        //alert('pu1off clicked');
        pumpCommand(1, 1,0);
    })

    function pumpCommand(equip, program, value, duration) {
        socket.emit('pumpCommand', equip, program, value, duration)
    }


    function addPump(data) {
        //$pump.append(JSON.stringify(data[1]))
        //$pump.append(JSON.stringify(data[2]))

        $('#pump1').html(data[1].name
                         + '<br>Watts: ' + data[1].watts
                         + '<br>RPM: ' + data[1].rpm
                         + '<br>Error: ' + data[1].err
                         + '<br>Mode: ' + data[1].mode
                         + '<br>Drive state: ' + data[1].drivestate
                         + '<br>Run Mode: ' + data[1].run
                        + '<br>PPC: ' + data[1].ppc
                        + '<br>Timer (Initial value): '  + data[1].timer
                        + '<br>Current Program: ' + data[1].currentprogram
                        + '<br>Program 1: ' + data[1].program1rpm + ' rpm'
                        + '<br>Program 2: ' + data[1].program2rpm + ' rpm'
                        + '<br>Program 3: ' + data[1].program3rpm + ' rpm'
                        + '<br>Program 4: ' + data[1].program4rpm + ' rpm'
                        + '<br>Remote Control: ' + data[1].remotecontrol
                        + '<br>Power: ' + data[1].power)
        $('#pump2').html(data[2].name
                         + '<br>Watts: ' + data[2].watts
                         + '<br>RPM: ' + data[2].rpm
                         + '<br>Error: ' + data[2].err
                         + '<br>Mode: ' + data[2].mode
                         + '<br>Drive state: ' + data[2].drivestate
                         + '<br>Run Mode: ' + data[2].run
                        + '<br>PPC: ' + data[2].ppc
                        + '<br>Timer (Initial value): ' + data[2].timer
                        + '<br>Current Program: ' + data[2].currentprogram
                        + '<br>Program 1: ' + data[2].program1rpm + ' rpm'
                        + '<br>Program 2: ' + data[2].program2rpm + ' rpm'
                        + '<br>Program 3: ' + data[2].program3rpm + ' rpm'
                        + '<br>Program 4: ' + data[2].program4rpm + ' rpm'
                        + '<br>Remote Control: ' + data[2].remotecontrol
                        + '<br>Power: ' + data[2].power)


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





    // Socket events



    socket.on('pump', function (data) {
        addPump(data);
    })


    socket.on('chlorinator', function (data) {
        addChlorinator(data);
    })


});
