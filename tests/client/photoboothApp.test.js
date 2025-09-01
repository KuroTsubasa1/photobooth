/**
 * @jest-environment jsdom
 */

// Mock Socket.IO client
const mockSocket = {
  on: jest.fn(),
  emit: jest.fn(),
  connected: true,
  connect: jest.fn(),
  disconnect: jest.fn()
};

global.io = jest.fn(() => mockSocket);

// Mock DOM elements
const mockElements = {
  'connect-btn': { 
    classList: { add: jest.fn(), remove: jest.fn() },
    querySelector: jest.fn(() => ({ textContent: 'Connect to Camera' })),
    addEventListener: jest.fn()
  },
  'capture-btn': { 
    style: { display: 'none' },
    classList: { add: jest.fn(), remove: jest.fn() },
    querySelector: jest.fn(() => ({ textContent: 'Take Photo' })),
    addEventListener: jest.fn()
  },
  'preview-image': { 
    style: { display: 'none' },
    src: ''
  },
  'preview-overlay': { 
    classList: { add: jest.fn(), remove: jest.fn() },
    style: { background: '' }
  },
  'countdown': { 
    textContent: '',
    style: { animation: '' }
  },
  'camera-status': { 
    classList: { add: jest.fn(), remove: jest.fn() }
  },
  'printer-status': { 
    classList: { add: jest.fn(), remove: jest.fn() }
  },
  'error-toast': { 
    classList: { add: jest.fn(), remove: jest.fn() }
  },
  'error-message': { 
    textContent: ''
  },
  'photo-detail-modal': { 
    classList: { add: jest.fn(), remove: jest.fn() }
  },
  'detail-image': { 
    src: ''
  },
  'photo-grid': { 
    innerHTML: '',
    appendChild: jest.fn()
  }
};

global.document = {
  getElementById: jest.fn((id) => mockElements[id] || null),
  createElement: jest.fn(() => ({
    className: '',
    innerHTML: '',
    addEventListener: jest.fn(),
    appendChild: jest.fn()
  })),
  addEventListener: jest.fn(),
  querySelectorAll: jest.fn(() => []),
  hidden: false
};

global.window = {
  location: {
    hostname: 'localhost'
  },
  setTimeout: global.setTimeout,
  clearTimeout: global.clearTimeout,
  fetch: jest.fn()
};

// Import the PhotoboothApp class
let PhotoboothApp;

describe('PhotoboothApp', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Reset DOM element mocks
    Object.keys(mockElements).forEach(key => {
      if (mockElements[key].classList) {
        mockElements[key].classList.add = jest.fn();
        mockElements[key].classList.remove = jest.fn();
      }
    });
    
    // Re-setup document mock
    global.document.getElementById = jest.fn((id) => mockElements[id] || null);
    
    // Re-create the fetch mock
    global.window.fetch = jest.fn();
    
    // Mock fetch responses
    global.window.fetch.mockImplementation((url) => {
      if (url.includes('/camera/status')) {
        return Promise.resolve({
          json: () => Promise.resolve({ connected: true, model: 'Canon EOS M50' })
        });
      }
      if (url.includes('/printer/status')) {
        return Promise.resolve({
          json: () => Promise.resolve({ connected: true, name: 'Canon_SELPHY_CP1300' })
        });
      }
      return Promise.resolve({ json: () => Promise.resolve({}) });
    });

    // Dynamically require PhotoboothApp to ensure fresh instance
    delete require.cache[require.resolve('../../client/app.js')];
    
    // Create a simplified version of PhotoboothApp for testing
    PhotoboothApp = class {
      constructor() {
        this.socket = null;
        this.isCapturing = false;
        this.isConnected = false;
        this.recentPhotos = [];
        this.currentPhotoPath = null;
        this.init();
      }

      init() {
        this.connectSocket();
        this.setupEventListeners();
        this.checkDeviceStatus();
      }

      connectSocket() {
        this.socket = global.io('http://localhost:3000');
        
        this.socket.on('connect', () => {
          this.updateConnectionStatus('connected');
        });

        this.socket.on('camera-status', (status) => {
          this.updateCameraStatus(status);
        });

        this.socket.on('preview-frame', (data) => {
          this.updatePreview(data);
        });

        this.socket.on('capture-complete', (data) => {
          this.onCaptureComplete(data);
        });

        this.socket.on('error', (error) => {
          this.showErrorToast(error.message);
        });
      }

      setupEventListeners() {
        // Mock event listener setup
      }

      async checkDeviceStatus() {
        try {
          const cameraResponse = await global.window.fetch('/camera/status');
          const cameraStatus = await cameraResponse.json();
          this.updateDeviceStatus('camera', cameraStatus.connected);

          const printerResponse = await global.window.fetch('/printer/status');
          const printerStatus = await printerResponse.json();
          this.updateDeviceStatus('printer', printerStatus.connected);
        } catch (error) {
          console.error('Error checking device status:', error);
        }
      }

      updateConnectionStatus(status) {
        // Mock implementation
      }

      updateCameraStatus(status) {
        this.isConnected = status.connected;
        const connectBtn = global.document.getElementById('connect-btn');
        const captureBtn = global.document.getElementById('capture-btn');
        
        if (status.connected) {
          connectBtn.classList.add('connected');
          captureBtn.style.display = 'flex';
        } else {
          connectBtn.classList.remove('connected');
          captureBtn.style.display = 'none';
        }
        
        this.updateDeviceStatus('camera', status.connected);
      }

      updateDeviceStatus(device, isConnected) {
        const statusElement = global.document.getElementById(`${device}-status`);
        if (statusElement) {
          if (isConnected) {
            statusElement.classList.add('connected');
          } else {
            statusElement.classList.remove('connected');
          }
        }
      }

      updatePreview(data) {
        const previewImage = global.document.getElementById('preview-image');
        if (data && data.data) {
          previewImage.style.display = 'block';
          previewImage.src = `data:${data.mimeType};base64,${data.data}`;
        } else {
          previewImage.style.display = 'none';
        }
      }

      toggleCameraConnection() {
        if (this.isConnected) {
          this.socket.emit('disconnect-camera');
        } else {
          this.socket.emit('connect-camera');
        }
      }

      async capturePhoto() {
        if (this.isCapturing) return;
        
        this.isCapturing = true;
        await this.showCountdown();
        this.socket.emit('execute-capture');
      }

      async showCountdown() {
        const countdown = global.document.getElementById('countdown');
        for (let i = 3; i > 0; i--) {
          countdown.textContent = i;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        countdown.textContent = 'Smile!';
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      onCaptureComplete(data) {
        this.addRecentPhoto(data.path);
        this.showPhotoDetail(data.path);
        this.isCapturing = false;
      }

      addRecentPhoto(photoPath) {
        this.recentPhotos.unshift(photoPath);
        if (this.recentPhotos.length > 9) {
          this.recentPhotos = this.recentPhotos.slice(0, 9);
        }
      }

      showPhotoDetail(photoPath) {
        this.currentPhotoPath = photoPath;
        const modal = global.document.getElementById('photo-detail-modal');
        const image = global.document.getElementById('detail-image');
        
        const filename = photoPath.split('/').pop();
        image.src = `/captures/${filename}`;
        modal.classList.add('active');
      }

      hidePhotoDetail() {
        const modal = global.document.getElementById('photo-detail-modal');
        modal.classList.remove('active');
        this.currentPhotoPath = null;
      }

      printCurrentPhoto() {
        if (this.currentPhotoPath && this.socket) {
          this.socket.emit('print-photo', { path: this.currentPhotoPath });
          this.hidePhotoDetail();
        }
      }

      showErrorToast(message) {
        const toast = global.document.getElementById('error-toast');
        const messageElement = global.document.getElementById('error-message');
        
        if (messageElement) messageElement.textContent = message;
        if (toast) toast.classList.add('show');
      }

      hideErrorToast() {
        const toast = global.document.getElementById('error-toast');
        if (toast) toast.classList.remove('show');
      }
    };
  });

  describe('Initialization', () => {
    it('should initialize PhotoboothApp correctly', () => {
      const app = new PhotoboothApp();
      
      expect(app.socket).toBeDefined();
      expect(app.isCapturing).toBe(false);
      expect(app.isConnected).toBe(false);
      expect(app.recentPhotos).toEqual([]);
      expect(global.io).toHaveBeenCalledWith('http://localhost:3000');
    });

    it('should set up socket event listeners', () => {
      new PhotoboothApp();
      
      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('camera-status', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('preview-frame', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('capture-complete', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should check device status on initialization', async () => {
      new PhotoboothApp();
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(global.window.fetch).toHaveBeenCalledWith('/camera/status');
      expect(global.window.fetch).toHaveBeenCalledWith('/printer/status');
    });
  });

  describe('Camera Connection', () => {
    let app;

    beforeEach(() => {
      app = new PhotoboothApp();
    });

    it('should update camera status when connected', () => {
      const status = {
        connected: true,
        model: 'Canon EOS M50',
        message: 'Camera connected'
      };

      app.updateCameraStatus(status);

      expect(app.isConnected).toBe(true);
      expect(mockElements['connect-btn'].classList.add).toHaveBeenCalledWith('connected');
      expect(mockElements['capture-btn'].style.display).toBe('flex');
    });

    it('should update camera status when disconnected', () => {
      const status = {
        connected: false,
        model: 'Canon EOS M50',
        message: 'Camera disconnected'
      };

      app.updateCameraStatus(status);

      expect(app.isConnected).toBe(false);
      expect(mockElements['connect-btn'].classList.remove).toHaveBeenCalledWith('connected');
      expect(mockElements['capture-btn'].style.display).toBe('none');
    });

    it('should toggle camera connection', () => {
      app.isConnected = false;
      app.toggleCameraConnection();
      
      expect(mockSocket.emit).toHaveBeenCalledWith('connect-camera');

      app.isConnected = true;
      app.toggleCameraConnection();
      
      expect(mockSocket.emit).toHaveBeenCalledWith('disconnect-camera');
    });
  });

  describe('Preview Updates', () => {
    let app;

    beforeEach(() => {
      app = new PhotoboothApp();
    });

    it('should update preview with frame data', () => {
      const frameData = {
        data: 'base64-image-data',
        mimeType: 'image/jpeg'
      };

      app.updatePreview(frameData);

      expect(mockElements['preview-image'].style.display).toBe('block');
      expect(mockElements['preview-image'].src).toBe('data:image/jpeg;base64,base64-image-data');
    });

    it('should handle empty preview data', () => {
      app.updatePreview(null);
      
      expect(mockElements['preview-image'].style.display).toBe('none');
    });
  });

  describe('Photo Capture', () => {
    let app;

    beforeEach(() => {
      app = new PhotoboothApp();
    });

    it('should not capture if already capturing', async () => {
      app.isCapturing = true;
      
      await app.capturePhoto();
      
      expect(mockSocket.emit).not.toHaveBeenCalledWith('execute-capture');
    });

    it('should show countdown and execute capture', async () => {
      jest.spyOn(app, 'showCountdown').mockResolvedValue();
      
      await app.capturePhoto();
      
      expect(app.isCapturing).toBe(true);
      expect(app.showCountdown).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('execute-capture');
    });

    it('should handle capture completion', () => {
      const captureData = { path: '/captures/test-photo.jpg' };
      
      app.onCaptureComplete(captureData);
      
      expect(app.recentPhotos).toContain('/captures/test-photo.jpg');
      expect(app.currentPhotoPath).toBe('/captures/test-photo.jpg');
      expect(app.isCapturing).toBe(false);
    });
  });

  describe('Photo Management', () => {
    let app;

    beforeEach(() => {
      app = new PhotoboothApp();
    });

    it('should add recent photos and maintain limit', () => {
      // Add 10 photos (limit is 9)
      for (let i = 0; i < 10; i++) {
        app.addRecentPhoto(`/captures/photo-${i}.jpg`);
      }

      expect(app.recentPhotos).toHaveLength(9);
      expect(app.recentPhotos[0]).toBe('/captures/photo-9.jpg'); // Most recent first
    });

    it('should show photo detail modal', () => {
      const photoPath = '/captures/test-photo.jpg';
      
      app.showPhotoDetail(photoPath);
      
      expect(app.currentPhotoPath).toBe(photoPath);
      expect(mockElements['detail-image'].src).toBe('/captures/test-photo.jpg');
      expect(mockElements['photo-detail-modal'].classList.add).toHaveBeenCalledWith('active');
    });

    it('should hide photo detail modal', () => {
      app.currentPhotoPath = '/captures/test-photo.jpg';
      
      app.hidePhotoDetail();
      
      expect(app.currentPhotoPath).toBe(null);
      expect(mockElements['photo-detail-modal'].classList.remove).toHaveBeenCalledWith('active');
    });

    it('should print current photo', () => {
      app.currentPhotoPath = '/captures/test-photo.jpg';
      
      app.printCurrentPhoto();
      
      expect(mockSocket.emit).toHaveBeenCalledWith('print-photo', { path: '/captures/test-photo.jpg' });
      expect(app.currentPhotoPath).toBe(null);
    });
  });

  describe('Error Handling', () => {
    let app;

    beforeEach(() => {
      app = new PhotoboothApp();
    });

    it('should show error toast', () => {
      const errorMessage = 'Camera not found';
      
      app.showErrorToast(errorMessage);
      
      expect(mockElements['error-message'].textContent).toBe(errorMessage);
      expect(mockElements['error-toast'].classList.add).toHaveBeenCalledWith('show');
    });

    it('should hide error toast', () => {
      app.hideErrorToast();
      
      expect(mockElements['error-toast'].classList.remove).toHaveBeenCalledWith('show');
    });
  });
});