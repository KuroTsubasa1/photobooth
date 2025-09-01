const io = require('socket.io-client');

// Connect to the photobooth server
const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('Connected to photobooth server');
  
  // Test printing with the updated JPEG processing
  console.log('Initiating print test with updated JPEG settings...');
  socket.emit('print-photo', '/tmp/test_print.jpg');
});

socket.on('print-started', (data) => {
  console.log('Print started:', data);
});

socket.on('print-complete', (data) => {
  console.log('Print completed:', data);
  socket.disconnect();
  process.exit(0);
});

socket.on('print-error', (error) => {
  console.error('Print error:', error);
  socket.disconnect();
  process.exit(1);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

// Exit after 30 seconds if no response
setTimeout(() => {
  console.log('Test timeout - exiting');
  socket.disconnect();
  process.exit(1);
}, 30000);