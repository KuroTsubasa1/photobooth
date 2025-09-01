const io = require('socket.io-client');
const path = require('path');

const socket = io('http://localhost:3001');

// Use the most recent captured image
const imagePath = '/Users/lharm/Dev/photobooth/captures/photo_1756760319217.jpg';

socket.on('connect', () => {
    console.log('Connected to photobooth server');
    console.log('Printing existing image:', imagePath);
    socket.emit('print-photo', { path: imagePath });
});

socket.on('print-complete', (data) => {
    console.log('Print completed:', data);
    if (data.success) {
        console.log('Print successful!');
    } else {
        console.log('Print failed:', data.error);
    }
    process.exit(0);
});

socket.on('print-failed', (data) => {
    console.log('Print failed event:', data);
    process.exit(1);
});

socket.on('error', (error) => {
    console.error('Socket error:', error);
    process.exit(1);
});

// Timeout after 20 seconds
setTimeout(() => {
    console.log('Test timeout - exiting');
    process.exit(1);
}, 20000);