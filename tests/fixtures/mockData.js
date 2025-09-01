// Mock data for tests

const mockCameraStatus = {
  connected: {
    connected: true,
    model: 'Canon EOS M50',
    port: 'usb:001,002'
  },
  disconnected: {
    connected: false,
    model: null,
    port: null
  },
  error: {
    connected: false,
    model: null,
    port: null,
    error: 'Camera not found'
  }
};

const mockPrinterStatus = {
  connected: {
    connected: true,
    name: 'Canon_SELPHY_CP1300',
    status: 'idle'
  },
  busy: {
    connected: true,
    name: 'Canon_SELPHY_CP1300',
    status: 'printing'
  },
  offline: {
    connected: false,
    name: 'Canon_SELPHY_CP1300',
    status: 'offline',
    error: 'Printer not found'
  },
  outOfPaper: {
    connected: true,
    name: 'Canon_SELPHY_CP1300',
    status: 'disabled - out of paper'
  }
};

const mockFrameData = {
  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', // 1x1 transparent PNG
  mimeType: 'image/jpeg',
  timestamp: 1693526400000
};

const mockCaptureData = {
  path: '/captures/photo_1693526400000.jpg',
  timestamp: 1693526400000,
  size: 2048576
};

const mockSocketEvents = {
  connect: 'connect',
  disconnect: 'disconnect',
  cameraStatus: 'camera-status',
  previewFrame: 'preview-frame',
  captureStarted: 'capture-started',
  captureComplete: 'capture-complete',
  printStarted: 'print-started',
  printComplete: 'print-complete',
  error: 'error',
  connectCamera: 'connect-camera',
  disconnectCamera: 'disconnect-camera',
  executeCapture: 'execute-capture',
  printPhoto: 'print-photo'
};

const mockGphoto2Output = {
  autoDetect: `Model                          Port
Canon EOS M50                  usb:001,002`,
  autoDetectEmpty: `Model                          Port`,
  getConfigISO: `Current: AUTO`,
  captureSuccess: `New file is in location /captures/photo_123.jpg on the camera`,
  previewSuccess: `Preview saved as preview.jpg`
};

const mockCUPSOutput = {
  printerStatus: `printer Canon_SELPHY_CP1300 is idle.  enabled since Thu 01 Sep 2024`,
  printSuccess: `request id is Canon_SELPHY_CP1300-123 (1 file(s))`,
  queueEmpty: `no entries`,
  queueBusy: `Canon_SELPHY_CP1300 is ready
Rank    Owner   Job     File(s)                         Total Size
active  user    123     photo_123.jpg                   2048000 bytes`
};

const createMockImage = (width = 100, height = 100) => {
  // Create a minimal mock image buffer
  return Buffer.from(`fake-image-${width}x${height}`);
};

const createMockJPEGFrame = () => {
  const jpegStart = Buffer.from([0xFF, 0xD8]); // JPEG start marker
  const jpegEnd = Buffer.from([0xFF, 0xD9]);   // JPEG end marker
  const fakeData = Buffer.from('fake-jpeg-frame-data');
  return Buffer.concat([jpegStart, fakeData, jpegEnd]);
};

module.exports = {
  mockCameraStatus,
  mockPrinterStatus,
  mockFrameData,
  mockCaptureData,
  mockSocketEvents,
  mockGphoto2Output,
  mockCUPSOutput,
  createMockImage,
  createMockJPEGFrame
};