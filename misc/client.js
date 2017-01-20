var fields = ['pump', 'watts','rpm', 'airTemp', 'run', 'poolTemp', 'spaTemp', 'poolHeatMode', 'spaHeatMode', 'runmode', 'HEATER_ACTIVE'];
var io = require('socket.io-client');
var socket = io.connect('https://localhost:3000', {secure: true, reconnect: true, rejectUnauthorized : false});

// Add a connect listener
//socket.on('connect', function (socket) {
//    console.log('Connected!');
//});

socket.on('circuit', function(data){
  console.log('FROM SOCKET CLIENT: ' + data)
})

// Listen for circuit data, then exit ...
socket.on('pump', function (data) {
    console.log(data);
    if (Object.keys(data).length > 0) {
        for (var key in fields) {
            currData = data[fields[key]];
            if (typeof(currData) === 'string')
                currData = currData.toLowerCase();
            console.log('FROM SOCKET CLIENT: ' + currData);
        }
        //process.exit();
    }
});
