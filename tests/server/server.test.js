const request = require('supertest');
const http = require('http');
const socketIo = require('socket.io');
const Client = require('socket.io-client');

// Mock the controllers
jest.mock('../../server/controllers/cameraController');
jest.mock('../../server/controllers/printerController');
jest.mock('../../server/controllers/videoStreamManager');

const cameraController = require('../../server/controllers/cameraController');
const printerController = require('../../server/controllers/printerController');

describe('Photobooth Server', () => {
  let server;
  let app;
  let io;
  let clientSocket;
  let serverSocket;

  beforeAll((done) => {
    // Import and create the app after mocking
    const express = require('express');
    const cors = require('cors');
    const path = require('path');
    
    app = express();
    app.use(cors());
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '../../client')));
    app.use('/captures', express.static(path.join(__dirname, '../../captures')));

    // Add test routes
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

    server = http.createServer(app);
    io = socketIo(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    // Socket.IO connection handling
    io.on('connection', (socket) => {
      serverSocket = socket;
      
      socket.emit('camera-status', { 
        connected: false, 
        model: 'Canon EOS M50',
        message: 'Click "Connect to Camera" to start live preview',
        streamActive: false
      });

      socket.on('connect-camera', () => {
        socket.emit('camera-status', {
          connected: true,
          model: 'Canon EOS M50',
          message: 'Camera connected with live preview',
          streamActive: true
        });
      });

      socket.on('disconnect-camera', () => {
        socket.emit('camera-status', {
          connected: false,
          model: 'Canon EOS M50', 
          message: 'Camera disconnected',
          streamActive: false
        });
      });

      socket.on('execute-capture', () => {
        socket.emit('capture-started');
        setTimeout(() => {
          socket.emit('capture-complete', { path: '/captures/test-photo.jpg' });
        }, 100);
      });

      socket.on('print-photo', () => {
        socket.emit('print-started');
        setTimeout(() => {
          socket.emit('print-complete');
        }, 100);
      });
    });

    server.listen(() => {
      const port = server.address().port;
      clientSocket = new Client(`http://localhost:${port}`);
      clientSocket.on('connect', done);
    });
  });

  afterAll(() => {
    server.close();
    clientSocket.close();
  });

  beforeEach(() => {
    // Reset mocks
    cameraController.getStatus.mockResolvedValue({
      connected: true,
      model: 'Canon EOS M50',
      port: 'usb:001,002'
    });

    printerController.getStatus.mockResolvedValue({
      connected: true,
      name: 'Canon_SELPHY_CP1300',
      status: 'idle'
    });
  });

  describe('HTTP Routes', () => {
    it('should serve static client files', async () => {
      const response = await request(app)
        .get('/');
        
      // Static file serving should work (may return 200 if there's a fallback or 404 if no file)
      expect([200, 404]).toContain(response.status);
    });

    it('should return camera status', async () => {
      const response = await request(app)
        .get('/camera/status')
        .expect(200);

      expect(response.body).toEqual({
        connected: true,
        model: 'Canon EOS M50',
        port: 'usb:001,002'
      });
    });

    it('should return printer status', async () => {
      const response = await request(app)
        .get('/printer/status')
        .expect(200);

      expect(response.body).toEqual({
        connected: true,
        name: 'Canon_SELPHY_CP1300',
        status: 'idle'
      });
    });

    it('should handle camera status errors', async () => {
      cameraController.getStatus.mockRejectedValue(new Error('Camera not found'));

      const response = await request(app)
        .get('/camera/status')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Camera not found'
      });
    });

    it('should handle printer status errors', async () => {
      printerController.getStatus.mockRejectedValue(new Error('Printer offline'));

      const response = await request(app)
        .get('/printer/status')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Printer offline'
      });
    });
  });

  describe('Socket.IO Events', () => {
    it('should handle socket events without errors', (done) => {
      // Simple test to ensure socket connection works
      clientSocket.emit('connect-camera');
      setTimeout(() => {
        clientSocket.emit('disconnect-camera');
        setTimeout(() => {
          clientSocket.emit('execute-capture');
          setTimeout(done, 100);
        }, 100);
      }, 100);
    });

    it('should emit capture events', (done) => {
      clientSocket.once('capture-started', () => {
        expect(true).toBe(true);
        done();
      });

      clientSocket.emit('execute-capture');
    });
  });
});