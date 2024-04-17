// Import Socket.IO client
const io = require('socket.io-client');

// Connect to the server
const socket = io('http://localhost:4200');

// Event handler for successful connection
socket.on('connect', () => {
    console.log('Connected to server.');

    // Emit data to the server
    socket.emit('message', 'Hello, server!');
    socket.emit('echo', `testing 123`);
    socket.on('echo', (string)=>{
      console.log(string);
    })
    //const hexData = "02 10 01 01 14 00 03 10 02 10 01 01 14 00 03 10 02 10 01 01 14 00 03 10 02 10 02 01 80 20 00 00 00 00 00 00 b5 00 03 10 02 10 03 01 20 20 6f 50 6c 6f 54 20 6d 65 20 70 37 20 5f 34 20 46 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 07 00 10 d6 10 03 01 02 00 01 10 14 10 03 01 02 00 01 10 14 10 03 01 02 00 01 10 14";
    const hexData = "10 02 01 80 20 00 00 00 00 00 00 b5 00 03 10 02 10 03";
    const formattedHexData = hexData.split(' ').map(hex => parseInt(hex, 16));
    //socket.emit('rawbytes', Buffer.from([1, 2, 3]));
    socket.emit('rawbytes', formattedHexData);
});

// Event handler for receiving data from the server
socket.on('message', (data) => {
    console.log('Received from server:', data);
});

// Event handler for disconnection
socket.on('disconnect', () => {
    console.log('Disconnected from server.');
});
