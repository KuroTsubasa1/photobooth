// Global test setup
const path = require('path');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3113'; // Different port for testing
process.env.CAPTURES_DIR = path.join(__dirname, 'fixtures/captures');

// Mock console methods to reduce test noise
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};

// Global test timeout
jest.setTimeout(30000);

// Mock external dependencies that require hardware
jest.mock('child_process', () => ({
  spawn: jest.fn(),
  exec: jest.fn()
}));

// Mock Sharp image processing
jest.mock('sharp', () => {
  return jest.fn(() => ({
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toFile: jest.fn().mockResolvedValue(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-image-data')),
    metadata: jest.fn().mockResolvedValue({
      width: 640,
      height: 480,
      format: 'jpeg'
    })
  }));
});

// Mock file system operations
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    ...jest.requireActual('fs').promises,
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
    mkdir: jest.fn()
  }
}));

// Global cleanup
afterEach(() => {
  jest.clearAllMocks();
});