const io = require('socket.io-client');
const fs = require('fs');
const path = require('path');

const socket = io('http://localhost:3001');

socket.on('connect', () => {
    console.log('Connected to photobooth server');
    
    // Test the capture and print workflow
    console.log('Requesting frame capture...');
    socket.emit('execute-capture');
});

socket.on('capture-complete', (data) => {
    console.log('Capture completed:', data);
    if (data.success && data.path) {
        console.log('Captured image path:', data.path);
        console.log('Initiating print...');
        socket.emit('print-photo', { path: data.path });
    } else {
        console.log('Capture failed:', data.error);
        process.exit(1);
    }
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

socket.on('error', (error) => {
    console.error('Socket error:', error);
    process.exit(1);
});

// Timeout after 30 seconds
setTimeout(() => {
    console.log('Test timeout - exiting');
    process.exit(1);
}, 30000);