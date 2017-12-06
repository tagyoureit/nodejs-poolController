var io = require('socket.io-client');
var socket = io.connect('http://localhost:3000', {secure: false, reconnect: true, rejectUnauthorized : false});

// Add a connect listener
//socket.on('connect', function (socket) {
//    console.log('Connected!');
//});

socket.on('circuit', function(data){
    console.log('"Circuit" socket example.  Count of circuits: ' + Object.keys(data.circuit).length)
})

// Listen for circuit data, then exit ...
socket.on('pump', function (data) {
    console.log('"Pump" socket data example. ')
});

socket.on('all', function(data){
    console.log('"All" socket data... ')
})
setInterval(function(){
    console.log('waiting... (5 seconds)')
}, 5000)
