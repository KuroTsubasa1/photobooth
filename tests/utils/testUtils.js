const { createMockJPEGFrame } = require('../fixtures/mockData');

// Test utilities for photobooth testing

/**
 * Wait for a specified amount of time
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Wait for a socket event with timeout
 */
const waitForSocketEvent = (socket, event, timeout = 5000) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${event} event`));
    }, timeout);

    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
};

/**
 * Wait for multiple socket events in sequence
 */
const waitForSocketEvents = async (socket, events, timeout = 5000) => {
  const results = [];
  for (const event of events) {
    const result = await waitForSocketEvent(socket, event, timeout);
    results.push(result);
  }
  return results;
};

/**
 * Create a mock child process for testing
 */
const createMockChildProcess = (options = {}) => {
  const {
    stdout = true,
    stderr = false,
    exitCode = 0,
    delay: processDelay = 0
  } = options;

  const mockProcess = {
    stdout: {
      on: jest.fn()
    },
    stderr: {
      on: jest.fn()
    },
    on: jest.fn(),
    kill: jest.fn()
  };

  // Simulate process behavior
  if (stdout) {
    setTimeout(() => {
      const stdoutHandler = mockProcess.stdout.on.mock.calls
        .find(call => call[0] === 'data')?.[1];
      if (stdoutHandler) {
        stdoutHandler(createMockJPEGFrame());
      }
    }, processDelay);
  }

  if (stderr) {
    setTimeout(() => {
      const stderrHandler = mockProcess.stderr.on.mock.calls
        .find(call => call[0] === 'data')?.[1];
      if (stderrHandler) {
        stderrHandler(Buffer.from('test error output'));
      }
    }, processDelay);
  }

  // Simulate process close
  setTimeout(() => {
    const closeHandler = mockProcess.on.mock.calls
      .find(call => call[0] === 'close')?.[1];
    if (closeHandler) {
      closeHandler(exitCode);
    }
  }, processDelay + 100);

  return mockProcess;
};

/**
 * Mock exec command with predefined responses
 */
const mockExecCommand = (responses = {}) => {
  return jest.fn((command, callback) => {
    // Default responses
    const defaultResponses = {
      'gphoto2 --auto-detect': 'Model                          Port\nCanon EOS M50                  usb:001,002\n',
      'gphoto2 --get-config': 'Current: AUTO\n',
      'gphoto2 --set-config': 'Configuration updated\n',
      'gphoto2 --capture-image-and-download': 'Image captured successfully\n',
      'gphoto2 --capture-preview': 'Preview captured\n',
      'lpstat -p': 'printer Canon_SELPHY_CP1300 is idle.\n',
      'lp -d': 'request id is Canon_SELPHY_CP1300-123\n',
      'cancel': 'Job cancelled\n'
    };

    const allResponses = { ...defaultResponses, ...responses };
    
    // Find matching command
    const matchingKey = Object.keys(allResponses).find(key => 
      command.includes(key) || command.startsWith(key)
    );

    if (matchingKey) {
      const response = allResponses[matchingKey];
      if (response instanceof Error) {
        callback(response, '', response.message);
      } else {
        callback(null, response, '');
      }
    } else {
      callback(null, 'Command executed successfully', '');
    }
  });
};

/**
 * Create a mock DOM environment for client tests
 */
const createMockDOM = () => {
  const mockElements = new Map();
  
  const createElement = jest.fn((tagName) => ({
    tagName: tagName.toUpperCase(),
    classList: {
      add: jest.fn(),
      remove: jest.fn(),
      contains: jest.fn(() => false),
      toggle: jest.fn()
    },
    style: {},
    innerHTML: '',
    textContent: '',
    src: '',
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    appendChild: jest.fn(),
    removeChild: jest.fn(),
    querySelector: jest.fn(),
    querySelectorAll: jest.fn(() => [])
  }));

  const getElementById = jest.fn((id) => {
    if (!mockElements.has(id)) {
      mockElements.set(id, createElement('div'));
    }
    return mockElements.get(id);
  });

  return {
    createElement,
    getElementById,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    querySelectorAll: jest.fn(() => []),
    querySelector: jest.fn(),
    body: createElement('body'),
    hidden: false,
    mockElements
  };
};

/**
 * Verify event emission order
 */
const verifyEventOrder = (emittedEvents, expectedOrder) => {
  const actualOrder = emittedEvents.map(event => event.name);
  expect(actualOrder).toEqual(expectedOrder);
};

/**
 * Create test photo file
 */
const createTestPhoto = async (filePath, content = 'fake-image-data') => {
  const fs = require('fs').promises;
  const path = require('path');
  
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content);
  
  return filePath;
};

/**
 * Clean up test files
 */
const cleanupTestFiles = async (directory) => {
  const fs = require('fs').promises;
  const path = require('path');
  
  try {
    const files = await fs.readdir(directory);
    for (const file of files) {
      const filePath = path.join(directory, file);
      await fs.unlink(filePath);
    }
  } catch (error) {
    // Directory might not exist, ignore
  }
};

module.exports = {
  delay,
  waitForSocketEvent,
  waitForSocketEvents,
  createMockChildProcess,
  mockExecCommand,
  createMockDOM,
  verifyEventOrder,
  createTestPhoto,
  cleanupTestFiles
};