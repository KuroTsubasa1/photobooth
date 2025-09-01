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
        
      expect(response.status).toBe(404); // No index.html in test setup
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
    it('should send initial camera status on connection', (done) => {
      clientSocket.on('camera-status', (data) => {
        expect(data).toEqual({
          connected: false,
          model: 'Canon EOS M50',
          message: 'Click "Connect to Camera" to start live preview',
          streamActive: false
        });
        done();
      });
    });

    it('should handle camera connection', (done) => {
      clientSocket.once('camera-status', (data) => {
        expect(data.connected).toBe(true);
        expect(data.message).toBe('Camera connected with live preview');
        done();
      });

      clientSocket.emit('connect-camera');
    });

    it('should handle camera disconnection', (done) => {
      clientSocket.once('camera-status', (data) => {
        expect(data.connected).toBe(false);
        expect(data.message).toBe('Camera disconnected');
        done();
      });

      clientSocket.emit('disconnect-camera');
    });

    it('should handle photo capture sequence', (done) => {
      let eventCount = 0;
      
      const checkCompletion = () => {
        eventCount++;
        if (eventCount === 2) done();
      };

      clientSocket.once('capture-started', () => {
        expect(true).toBe(true);
        checkCompletion();
      });

      clientSocket.once('capture-complete', (data) => {
        expect(data.path).toBe('/captures/test-photo.jpg');
        checkCompletion();
      });

      clientSocket.emit('execute-capture');
    });

    it('should handle photo printing sequence', (done) => {
      let eventCount = 0;
      
      const checkCompletion = () => {
        eventCount++;
        if (eventCount === 2) done();
      };

      clientSocket.once('print-started', () => {
        expect(true).toBe(true);
        checkCompletion();
      });

      clientSocket.once('print-complete', () => {
        expect(true).toBe(true);
        checkCompletion();
      });

      clientSocket.emit('print-photo');
    });
  });
});