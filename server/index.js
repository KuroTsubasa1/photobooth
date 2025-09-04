const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Parse command line arguments
const args = process.argv.slice(2);
const isQuiet = args.includes('--quiet') || args.includes('--headless') || args.includes('-q');
const isVerbose = args.includes('--verbose') || args.includes('-v');

// Conditional logging utility
const logger = {
  log: isQuiet ? () => {} : console.log,
  info: isQuiet ? () => {} : console.log,
  warn: console.warn, // Always show warnings
  error: console.error, // Always show errors
  debug: isVerbose ? console.log : () => {},
  performance: isQuiet ? () => {} : console.log
};

const cameraController = require('./controllers/cameraController');
const printerController = require('./controllers/printerController');
const videoStreamManager = require('./controllers/videoStreamManager');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));
app.use('/captures', express.static(path.join(__dirname, '../captures')));

const PORT = process.env.PORT || 3000;

let isStreamActive = false;

// Forward video frames to all connected clients
videoStreamManager.on('frame', (frame) => {
  io.emit('preview-frame', frame);
});

// Handle stream ending unexpectedly
videoStreamManager.on('stream-ended', () => {
  logger.warn('Video stream ended unexpectedly');
  isStreamActive = false;
  io.emit('camera-status', { 
    connected: false, 
    model: 'HDMI Capture (1080p)',
    message: 'Camera stream interrupted - click Connect to restart',
    streamActive: false
  });
});

// Handle stream starting
videoStreamManager.on('stream-started', () => {
  logger.info('Video stream started');
  isStreamActive = true;
  const resolution = videoStreamManager.currentResolution;
  const model = resolution?.source === 'hdmi' ? 'HDMI Capture (1080p)' : 'Canon EOS M50';
  io.emit('camera-status', { 
    connected: true, 
    model: model,
    message: `${model} connected with live preview`,
    streamActive: true
  });
});

io.on('connection', (socket) => {
  logger.info('iPad client connected');
  
  // Send current camera status based on actual stream state
  socket.emit('camera-status', { 
    connected: isStreamActive, 
    model: 'Canon EOS M50',
    message: isStreamActive 
      ? 'Camera connected with live preview'
      : 'Click "Connect to Camera" to start live preview',
    streamActive: isStreamActive
  });

  socket.on('connect-camera', async () => {
    if (!isStreamActive) {
      logger.info('Starting camera stream...');
      await videoStreamManager.startStream();
      // Status update will be sent via stream-started event
    }
  });
  
  socket.on('disconnect-camera', async () => {
    if (isStreamActive) {
      logger.info('Stopping camera stream...');
      await videoStreamManager.stopStream();
      // Status will be updated via stream-ended event
    }
  });

  socket.on('request-preview', async () => {
    // Preview is handled by video stream manager
    // Just acknowledge the request
  });

  let captureState = {
    isCapturing: false,
    prepared: false,
    error: null
  };

  socket.on('prepare-capture', async () => {
    try {
      // Only prevent preparation if currently executing a capture
      if (captureState.isCapturing && captureState.prepared) {
        console.log('Capture currently executing, ignoring preparation request');
        return;
      }
      
      logger.debug('Preparing for stream capture...');
      captureState.isCapturing = false; // Reset any previous state
      captureState.prepared = false;
      captureState.error = null;
      
      // No need to stop stream - we're capturing from it!
      // Just mark as ready immediately
      captureState.prepared = true;
      logger.debug('Stream capture ready');
      
    } catch (error) {
      console.error('Capture preparation error:', error);
      captureState.error = error;
      captureState.prepared = false;
      captureState.isCapturing = false;
    }
  });

  socket.on('execute-capture', async () => {
    try {
      if (!captureState.prepared || captureState.error) {
        throw new Error('Stream not ready - please try again');
      }
      
      // Mark as currently capturing
      captureState.isCapturing = true;
      
      logger.debug('Capturing frame from stream...');
      socket.emit('capture-started');
      
      // Capture directly from the video stream - instant!
      const photoPath = await videoStreamManager.captureFrameFromStream();
      socket.emit('capture-complete', { path: photoPath });
      
      // Photo captured successfully - user can now choose to print
      
      // Reset capture state - but keep stream running!
      captureState.isCapturing = false;
      captureState.prepared = false;
      captureState.error = null;
      
      // Stream continues running - no interruption needed!
      
    } catch (error) {
      console.error('Stream capture error:', error);
      socket.emit('error', { message: 'Failed to capture from stream', error: error.message });
      
      // Reset capture state on error
      captureState.isCapturing = false;
      captureState.prepared = false;
      captureState.error = error;
    }
  });

  socket.on('try-full-resolution', async () => {
    try {
      console.log('Attempting full resolution capture...');
      const fullResPath = await videoStreamManager.captureFullResolutionPhoto();
      
      if (fullResPath) {
        socket.emit('full-resolution-success', { path: fullResPath });
      } else {
        socket.emit('full-resolution-unavailable', { 
          message: 'Camera in movie mode - full resolution capture not available',
          suggestion: 'Use HDMI capture for higher resolution'
        });
      }
    } catch (error) {
      console.error('Full resolution capture error:', error);
      socket.emit('full-resolution-unavailable', { 
        message: 'Full resolution capture failed',
        error: error.message
      });
    }
  });

  socket.on('print-photo', async (data) => {
    try {
      console.log('Printing photo:', data.path);
      socket.emit('print-started');
      
      await printerController.printImage(data.path);
      socket.emit('print-complete');
    } catch (error) {
      console.error('Print error:', error);
      socket.emit('error', { message: 'Printing failed', error: error.message });
    }
  });

  socket.on('toggle-fullscreen', (data) => {
    console.log('Toggling fullscreen:', data.fullscreen);
    socket.broadcast.emit('fullscreen-toggled', data);
  });

  socket.on('disconnect', () => {
    logger.info('iPad client disconnected');
  });
});

app.get('/camera/status', async (req, res) => {
  try {
    const status = await cameraController.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/printer/status', async (req, res) => {
  try {
    const status = await printerController.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  if (!isQuiet) {
    logger.log(`🎪 Photobooth Server ${isQuiet ? '(Headless Mode)' : ''}`);
    logger.log(`📡 Running on port ${PORT}`);
    logger.log(`🏠 Local: http://localhost:${PORT}`);
    logger.log(`📱 iPad: http://192.168.178.35:${PORT}`);
    logger.log(`🎬 30fps video streaming optimized`);
    logger.log(`\n🚀 Ready for photos!\n`);
  }
});

// Graceful shutdown handlers
const gracefulShutdown = () => {
  logger.log('\nShutting down gracefully...');
  
  server.close(() => {
    logger.log('HTTP server closed');
    process.exit(0);
  });

  // Force close after 5 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 5000);
};

// Listen for termination signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Handle nodemon restarts
process.once('SIGUSR2', () => {
  gracefulShutdown();
  process.kill(process.pid, 'SIGUSR2');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown();
});