# Photobooth Test Suite 🧪

Comprehensive test suite for the multi-device photobooth application with 70%+ code coverage.

## 📋 Test Structure

```
tests/
├── 📁 server/                    # Server-side unit tests
│   ├── videoStreamManager.test.js     # Camera streaming logic
│   ├── cameraController.test.js       # Camera operations
│   ├── printerController.test.js      # Printer integration  
│   └── server.test.js                 # Express server & Socket.IO
├── 📁 client/                    # Client-side unit tests
│   └── photoboothApp.test.js          # iPad interface logic
├── 📁 integration/               # End-to-end integration tests
│   └── photobooth.integration.test.js # Complete workflows
├── 📁 fixtures/                  # Test data and mocks
│   └── mockData.js                    # Mock responses and data
├── 📁 utils/                     # Test utilities
│   └── testUtils.js                   # Helper functions
├── setup.js                      # Global test configuration
└── README.md                     # This documentation
```

## 🚀 Running Tests

### All Tests
```bash
npm test
```

### Watch Mode (Development)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

### Integration Tests Only
```bash
npm run test:integration
```

### Specific Test File
```bash
npm test -- tests/server/videoStreamManager.test.js
```

## 📊 Test Coverage

Current coverage targets (minimum 70%):

| Component | Branches | Functions | Lines | Statements |
|-----------|----------|-----------|--------|------------|
| **Server** | 75%+ | 80%+ | 80%+ | 80%+ |
| **Client** | 70%+ | 75%+ | 75%+ | 75%+ |
| **Integration** | 70%+ | 70%+ | 70%+ | 70%+ |

## 🧪 Test Categories

### 1. Unit Tests

**Server Components:**
- ✅ VideoStreamManager: Camera streaming and frame capture
- ✅ CameraController: gphoto2 camera operations
- ✅ PrinterController: CUPS printer integration
- ✅ Server: Express routes and Socket.IO events

**Client Components:**
- ✅ PhotoboothApp: iPad interface and user interactions
- ✅ Socket communication and event handling
- ✅ UI state management and error handling

### 2. Integration Tests

**Complete Workflows:**
- ✅ Camera connection → Preview → Capture → Print
- ✅ Multi-client support and broadcasting
- ✅ Error handling across components
- ✅ Device status synchronization

### 3. Mocking Strategy

**Hardware Dependencies:**
- 📷 **gphoto2**: Mocked via `child_process` mock
- 🖨️ **CUPS/lp**: Mocked printer commands
- 🖼️ **Sharp**: Mocked image processing
- 💾 **File System**: Mocked read/write operations

**Network Dependencies:**
- 🌐 **Socket.IO**: Real connections in integration tests
- 📡 **HTTP requests**: Mocked via supertest

## 🎯 Test Scenarios

### Camera Operations
```javascript
// Connection handling
✅ Camera detection and status
✅ Stream start/stop lifecycle  
✅ Frame processing and emission
✅ Error recovery and fallback modes

// Capture workflow
✅ Frame capture from live stream
✅ High-quality image processing
✅ File saving and path generation
✅ Metadata extraction and logging
```

### Printer Operations
```javascript
// Status and queue management
✅ Printer availability detection
✅ Print job submission and tracking
✅ Queue status and job cancellation
✅ Error handling (offline, out of paper)

// Image processing for print
✅ File copying and temporary management
✅ Print options (media, quality, copies)
✅ Cleanup after successful/failed prints
```

### Client Interface
```javascript
// User interactions
✅ Camera connection toggle
✅ Photo capture with countdown
✅ Photo review modal (print/retake)
✅ Error toast notifications

// Real-time updates
✅ Live preview frame display
✅ Device status indicators
✅ Connection state persistence
✅ Photo gallery management
```

### Integration Workflows
```javascript
// Complete photo session
✅ Connect → Preview → Capture → Review → Print
✅ Multiple consecutive captures
✅ Multi-client synchronization
✅ Error recovery and graceful degradation

// Edge cases
✅ Network interruptions
✅ Hardware failures
✅ Concurrent user actions
✅ Resource cleanup
```

## 🛠️ Test Utilities

### Socket Testing
```javascript
const { waitForSocketEvent } = require('./utils/testUtils');

// Wait for specific event
const result = await waitForSocketEvent(socket, 'capture-complete');

// Wait for event sequence
const events = await waitForSocketEvents(socket, [
  'capture-started',
  'capture-complete',
  'print-started'
]);
```

### Mock Data
```javascript
const { mockCameraStatus, createMockJPEGFrame } = require('./fixtures/mockData');

// Use predefined mock responses
expect(cameraController.getStatus()).resolves.toEqual(mockCameraStatus.connected);

// Generate test frames
const frame = createMockJPEGFrame();
```

### DOM Mocking
```javascript
const { createMockDOM } = require('./utils/testUtils');

// Create mock DOM environment
const mockDOM = createMockDOM();
global.document = mockDOM;
```

## 📝 Writing New Tests

### Test File Naming
- Unit tests: `componentName.test.js`
- Integration tests: `feature.integration.test.js`
- Place in appropriate directory (`server/`, `client/`, `integration/`)

### Test Structure
```javascript
describe('ComponentName', () => {
  beforeEach(() => {
    // Setup mocks and test environment
  });

  afterEach(() => {
    // Clean up mocks
    jest.clearAllMocks();
  });

  describe('methodName', () => {
    it('should handle success case', () => {
      // Test implementation
    });

    it('should handle error case', () => {
      // Error testing
    });
  });
});
```

### Async Testing
```javascript
// Async/await pattern
it('should capture photo successfully', async () => {
  const result = await videoStreamManager.captureFrameFromStream();
  expect(result).toContain('captures/photo_');
});

// Promise testing
it('should handle capture errors', () => {
  return expect(videoStreamManager.captureFrameFromStream())
    .rejects.toThrow('No frame available');
});
```

## 🚨 Common Issues

### Mock Problems
- **Issue**: Real hardware calls in tests
- **Solution**: Ensure all hardware dependencies are mocked in `setup.js`

### Timeout Issues  
- **Issue**: Tests timeout on async operations
- **Solution**: Increase timeout or use proper async/await patterns

### State Leakage
- **Issue**: Tests affect each other
- **Solution**: Reset mocks in `beforeEach`/`afterEach` hooks

### Socket Cleanup
- **Issue**: Socket connections not closed
- **Solution**: Always close sockets in `afterEach`/`afterAll`

## 📈 Continuous Integration

Tests run automatically on:
- ✅ Every commit (pre-commit hook)
- ✅ Pull requests (GitHub Actions)
- ✅ Main branch merges
- ✅ Release builds

**Quality Gates:**
- All tests must pass
- Coverage must meet thresholds
- No critical linting errors
- Integration tests must pass

## 🎓 Best Practices

1. **Test Structure**: Follow AAA pattern (Arrange, Act, Assert)
2. **Test Names**: Descriptive and behavior-focused
3. **Mocking**: Mock external dependencies, test internal logic
4. **Coverage**: Aim for meaningful coverage, not just numbers
5. **Speed**: Keep unit tests fast (<100ms), integration tests reasonable (<5s)
6. **Isolation**: Tests should be independent and order-agnostic
7. **Documentation**: Comment complex test setups and edge cases

---

<div align="center">

**Happy Testing! 🧪✨**

*Comprehensive testing ensures reliable photo experiences*

</div>