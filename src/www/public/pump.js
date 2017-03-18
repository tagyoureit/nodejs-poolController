$(function() {
    var FADE_TIME = 150; // ms
    var TYPING_TIMER_LENGTH = 400; // ms
    var COLORS = [
        '#e21400', '#91580f', '#f8a700', '#f78b00',
        '#58dc00', '#287b00', '#a8f07a', '#4ae8c4',
        '#3b88eb', '#3824aa', '#a700ff', '#d300e7'
    ];
    var socket
    var $pump = $('#pump')
    $('#pu1on').click(function() {
        //alert('pu1off clicked');
        socket.emit('pumpCommand', 'run', 1)
    })

    $('#pu1off').click(function() {
        //alert('pu1off clicked');
        socket.emit('setPumpCommand', 'off', 1);
    })

    $('#pu1api3').click(function() {
        //alert('pu1pr1set clicked with speed: ' + $('#pump1program1setspeed').val());
        socket.emit('setPumpCommand', 'run', 1, null, null, null, $('#api3pump1duration').val())
    })

    $('#pu1api4').click(function() {
        //alert('pu1pr1set clicked with speed: ' + $('#pump1program1setspeed').val());
        socket.emit('setPumpCommand', 'run', 1, $('#api4pump1program').val(), null, null, null)
    })
    $('#pu1api5').click(function() {
        //alert('pu1pr1set clicked with speed: ' + $('#pump1program1setspeed').val());
        socket.emit('setPumpCommand', 'run', 1, $('#api5pump1program').val(), null, null, $('#api5pump1duration').val())
    })
    $('#pu1api6').click(function() {
        //alert('pu1pr1set clicked with speed: ' + $('#pump1program1setspeed').val());
        socket.emit('setPumpCommand', 'run', 1, null, $('#api6pump1rpm').val(), null, null)
    })

    $('#pu1api7').click(function() {
        //alert('pu1pr1set clicked with speed: ' + $('#pump1program1setspeed').val());
        socket.emit('setPumpCommand', 'run', 1, null, $('#api7pump1rpm').val(), null, $('#api7pump1duration').val())
    })
    $('#pu1api7').click(function() {
        //alert('pu1pr1set clicked with speed: ' + $('#pump1program1setspeed').val());
        socket.emit('setPumpCommand', 'run', 1, null, $('#api7pump1rpm').val(), null, $('#api7pump1duration').val())
    })
    $('#pu1api8').click(function() {
        socket.emit('setPumpCommand', 'save', 1, $('#api8pump1program').val(), $('#api8pump1rpm').val(), null, null)
    })
    $('#pu1api9').click(function() {
        socket.emit('setPumpCommand', 'saverun', 1, $('#api9pump1program').val(), $('#api9pump1rpm').val(), null, null)
    })
    $('#pu1api10').click(function() {
        socket.emit('setPumpCommand', 'saverun', 1, $('#api10pump1program').val(), $('#api10pump1rpm').val(), null, $('#api10pump1duration').val())
    })

    $('#pu1api11').click(function() {
        //alert('pu1pr1set clicked with speed: ' + $('#pump1program1setspeed').val());
        socket.emit('setPumpCommand', 'run', 1, null, null, $('#api11pump1gpm').val(), null)
    })

    $('#pu1api12').click(function() {
        //alert('pu1pr1set clicked with speed: ' + $('#pump1program1setspeed').val());
        socket.emit('setPumpCommand', 'run', 1, null, null, $('#api12pump1gpm').val(), $('#api12pump1duration').val())
    })
    $('#pu1api13').click(function() {
        socket.emit('setPumpCommand', 'save', 1, $('#api13pump1program').val(), null, $('#api13pump1gpm').val(), null)
    })
    $('#pu1api14').click(function() {
        socket.emit('setPumpCommand', 'saverun', 1, $('#api14pump1program').val(), null, $('#api14pump1gpm').val(), null)
    })
    $('#pu1api15').click(function() {
        socket.emit('setPumpCommand', 'saverun', 1, $('#api15pump1program').val(), null, $('#api15pump1gpm').val(), $('#api15pump1duration').val())
    })


    $('#pu2on').click(function() {
        //alert('pu2off clicked');
        socket.emit('setPumpCommand', 'run', 2)
    })

    $('#pu2off').click(function() {
        //alert('pu2off clicked');
        socket.emit('setPumpCommand', 'off', 2);
    })

    $('#pu2api3').click(function() {
        //alert('pu2pr1set clicked with speed: ' + $('#pump2program1setspeed').val());
        socket.emit('setPumpCommand', 'run', 2, null, null, null, $('#api3pump2duration').val())
    })

    $('#pu2api4').click(function() {
        //alert('pu2pr1set clicked with speed: ' + $('#pump2program1setspeed').val());
        socket.emit('setPumpCommand', 'run', 2, $('#api4pump2program').val(), null, null, null)
    })
    $('#pu2api5').click(function() {
        //alert('pu2pr1set clicked with speed: ' + $('#pump2program1setspeed').val());
        socket.emit('setPumpCommand', 'run', 2, $('#api5pump2program').val(), null, null, $('#api5pump2duration').val())
    })
    $('#pu2api6').click(function() {
        //alert('pu2pr1set clicked with speed: ' + $('#pump2program1setspeed').val());
        socket.emit('setPumpCommand', 'run', 2, null, $('#api6pump2rpm').val(), null, null)
    })

    $('#pu2api7').click(function() {
        //alert('pu2pr1set clicked with speed: ' + $('#pump2program1setspeed').val());
        socket.emit('setPumpCommand', 'run', 2, null, $('#api7pump2rpm').val(), null, $('#api7pump2duration').val())
    })
    $('#pu2api7').click(function() {
        //alert('pu2pr1set clicked with speed: ' + $('#pump2program1setspeed').val());
        socket.emit('setPumpCommand', 'run', 2, null, $('#api7pump2rpm').val(), null, $('#api7pump2duration').val())
    })
    $('#pu2api8').click(function() {
        socket.emit('setPumpCommand', 'save', 2, $('#api8pump2program').val(), $('#api8pump2rpm').val(), null, null)
    })
    $('#pu2api9').click(function() {
        socket.emit('setPumpCommand', 'saverun', 2, $('#api9pump2program').val(), $('#api9pump2rpm').val(), null, null)
    })
    $('#pu2api10').click(function() {
        socket.emit('setPumpCommand', 'saverun', 2, $('#api10pump2program').val(), $('#api10pump2rpm').val(), null, $('#api10pump2duration').val())
    })

    $('#pu2api11').click(function() {
        //alert('pu2pr1set clicked with speed: ' + $('#pump2program1setspeed').val());
        socket.emit('setPumpCommand', 'run', 2, null, null, $('#api11pump2gpm').val(), null)
    })

    $('#pu2api12').click(function() {
        //alert('pu2pr1set clicked with speed: ' + $('#pump2program1setspeed').val());
        socket.emit('setPumpCommand', 'run', 2, null, null,  $('#api12pump2gpm').val(), $('#api12pump2duration').val())
    })

    $('#pu2api13').click(function() {
        socket.emit('setPumpCommand', 'save', 2, $('#api13pump2program').val(), null, $('#api13pump2gpm').val(), null)
    })
    $('#pu2api14').click(function() {
        socket.emit('setPumpCommand', 'saverun', 2, $('#api14pump2program').val(), null, $('#api14pump2gpm').val(), null)
    })
    $('#pu2api15').click(function() {
        socket.emit('setPumpCommand', 'saverun', 2, $('#api15pump2program').val(), null, $('#api15pump2gpm').val(), $('#api15pump2duration').val())
    })






    function addPump(data) {
        // $pump.append(JSON.stringify(data[1]))
        // $pump.append(JSON.stringify(data[2]))

        $('#pump1').html('<b>' + data[1].name + '</b>' +
            '<br>----' +
            '<br>Watts: ' + data[1].watts +
            '<br>RPM: ' + data[1].rpm +
            '<br>GPM:' + data[1].gpm +
            '<br>Error: ' + data[1].err +
            '<br>Mode: ' + data[1].mode +
            '<br>Drive state: ' + data[1].drivestate +
            '<br>Run Mode: ' + data[1].run +
            '<br>PPC: ' + data[1].ppc +
            '<br>Timer (Initial value): ' + data[1].timer +
            '<br>Remote Control: ' + data[1].remotecontrol +
            '<br>Power: ' + data[1].power +
            '<br>----' +
            '<br>Current Running: ' +
            '<br>&nbsp;Mode: ' + data[1].currentrunning.mode +
            '<br>&nbsp;Value: ' + data[1].currentrunning.value +
            '<br>&nbsp;Remaining Duration: ' + data[1].currentrunning.remainingduration +
            '<br>----' +
            '<br>External Programs: <br>' + '&nbsp; 1:'+data[1].externalProgram[1] + ', 2:'+data[1].externalProgram[2] + ', 3:'+data[1].externalProgram[3] + ', 4:'+data[1].externalProgram[4])

            $('#pump2').html('<b>' + data[2].name + '</b>' +
                '<br>----' +
                '<br>Watts: ' + data[2].watts +
                '<br>RPM: ' + data[2].rpm +
                '<br>GPM:' + data[2].gpm +
                '<br>Error: ' + data[2].err +
                '<br>Mode: ' + data[2].mode +
                '<br>Drive state: ' + data[2].drivestate +
                '<br>Run Mode: ' + data[2].run +
                '<br>PPC: ' + data[2].ppc +
                '<br>Timer (Initial value): ' + data[2].timer +
                '<br>Remote Control: ' + data[2].remotecontrol +
                '<br>Power: ' + data[2].power +
                '<br>----' +
                '<br>Current Running: ' +
                '<br>&nbsp;Mode: ' + data[2].currentrunning.mode +
                '<br>&nbsp;Value: ' + data[2].currentrunning.value +
                '<br>&nbsp;Remaining Duration: ' + data[2].currentrunning.remainingduration +
                '<br>----' +
                '<br>External Programs: <br>' + '&nbsp; 1:'+data[2].externalProgram[1] + ', 2:'+data[2].externalProgram[2] + ', 3:'+data[2].externalProgram[3] + ', 4:'+data[2].externalProgram[4])


    }

    // Socket events


function startSocketRx() {
  socket.on('pump', function(data) {
      addPump(data);
  })
}

    $(function() {

        socket = io();
        startSocketRx()
    });
});
