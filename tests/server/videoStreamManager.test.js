// Mock Sharp before any imports
jest.mock('sharp', () => {
  const mockSharpInstance = {
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toFile: jest.fn().mockResolvedValue(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-image-data')),
    metadata: jest.fn().mockResolvedValue({
      width: 640,
      height: 480,
      format: 'jpeg'
    })
  };
  
  const mockSharp = jest.fn(() => mockSharpInstance);
  mockSharp.cache = jest.fn();
  mockSharp.concurrency = jest.fn();
  return mockSharp;
});

// Mock child_process
jest.mock('child_process');
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    unlink: jest.fn()
  }
}));

const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const VideoStreamManager = require('../../server/controllers/videoStreamManager');

describe('VideoStreamManager', () => {
  let videoStreamManager;
  let mockSpawn;
  let mockExec;
  let mockProcess;

  beforeEach(() => {
    // Use the singleton instance
    videoStreamManager = VideoStreamManager;
    
    // Reset singleton state
    videoStreamManager.isStreaming = false;
    videoStreamManager.streamProcess = null;
    videoStreamManager.lastHighQualityFrame = null;
    
    mockProcess = {
      stdout: {
        on: jest.fn()
      },
      stderr: {
        on: jest.fn()
      },
      on: jest.fn(),
      kill: jest.fn()
    };
    
    mockSpawn = spawn.mockReturnValue(mockProcess);
    mockExec = exec.mockImplementation((cmd, callback) => {
      callback(null, 'success', '');
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('startStream', () => {
    it('should start video stream successfully', async () => {
      const streamStartedSpy = jest.fn();
      videoStreamManager.on('stream-started', streamStartedSpy);

      await videoStreamManager.startStream();

      expect(mockExec).toHaveBeenCalledWith('gphoto2 --set-config capturetarget=0', expect.any(Function));
      expect(mockExec).toHaveBeenCalledWith('gphoto2 --set-config viewfinder=1', expect.any(Function));
      expect(mockSpawn).toHaveBeenCalledWith('gphoto2', ['--capture-movie', '--stdout']);
      expect(videoStreamManager.isStreaming).toBe(true);
      
      // Wait for stream-started event
      await new Promise(resolve => setTimeout(resolve, 1100));
      expect(streamStartedSpy).toHaveBeenCalled();
    });

    it('should not start stream if already streaming', async () => {
      videoStreamManager.isStreaming = true;
      
      await videoStreamManager.startStream();
      
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should fall back to frame capture on error', async () => {
      mockSpawn.mockImplementation(() => {
        throw new Error('Camera not found');
      });

      const frameCaptureSpy = jest.spyOn(videoStreamManager, 'startFrameCapture');
      
      await videoStreamManager.startStream();
      
      expect(frameCaptureSpy).toHaveBeenCalled();
      expect(videoStreamManager.isStreaming).toBe(false);
    });
  });

  describe('stopStream', () => {
    beforeEach(() => {
      videoStreamManager.streamProcess = mockProcess;
      videoStreamManager.isStreaming = true;
    });

    it('should stop video stream successfully', async () => {
      await videoStreamManager.stopStream();

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(videoStreamManager.isStreaming).toBe(false);
      expect(mockExec).toHaveBeenCalledWith(
        'gphoto2 --set-config viewfinder=0',
        expect.any(Function)
      );
    });

    it('should handle missing stream process gracefully', async () => {
      videoStreamManager.streamProcess = null;
      
      await videoStreamManager.stopStream();
      
      expect(videoStreamManager.isStreaming).toBe(false);
    });
  });

  describe('captureFrameFromStream', () => {
    it('should capture frame successfully', async () => {
      const mockFrameData = Buffer.from('fake-jpeg-data');
      videoStreamManager.lastHighQualityFrame = mockFrameData;

      const sharp = require('sharp');
      const mockSharp = sharp();
      mockSharp.toFile.mockResolvedValue();
      mockSharp.metadata.mockResolvedValue({ width: 1920, height: 1280 });

      const result = await videoStreamManager.captureFrameFromStream();

      expect(sharp).toHaveBeenCalledWith(mockFrameData);
      expect(mockSharp.resize).toHaveBeenCalledWith(3000, 2000, {
        fit: 'inside',
        withoutEnlargement: true
      });
      expect(mockSharp.jpeg).toHaveBeenCalledWith({
        quality: 95,
        progressive: true,
        mozjpeg: true
      });
      expect(result).toContain('captures/photo_');
      expect(result).toContain('.jpg');
    });

    it('should throw error if no frame available', async () => {
      videoStreamManager.lastHighQualityFrame = null;

      await expect(videoStreamManager.captureFrameFromStream())
        .rejects.toThrow('No frame available for capture');
    });

    it('should handle Sharp processing errors', async () => {
      const mockFrameData = Buffer.from('fake-jpeg-data');
      videoStreamManager.lastHighQualityFrame = mockFrameData;

      const sharp = require('sharp');
      const mockSharp = sharp();
      mockSharp.metadata.mockRejectedValue(new Error('Invalid image data'));

      await expect(videoStreamManager.captureFrameFromStream())
        .rejects.toThrow('Invalid image data');
    });
  });

  describe('frame processing', () => {
    it('should process and emit frames from stdout data', async () => {
      const frameSpy = jest.fn();
      videoStreamManager.on('frame', frameSpy);
      
      await videoStreamManager.startStream();
      
      // Simulate JPEG frame data
      const jpegStart = Buffer.from([0xFF, 0xD8]); // JPEG start marker
      const jpegEnd = Buffer.from([0xFF, 0xD9]);   // JPEG end marker
      const frameData = Buffer.concat([jpegStart, Buffer.from('frame-data'), jpegEnd]);
      
      // Get the stdout data handler and call it
      const stdoutHandler = mockProcess.stdout.on.mock.calls
        .find(call => call[0] === 'data')[1];
      
      stdoutHandler(frameData);
      
      // Wait for frame processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(frameSpy).toHaveBeenCalled();
      expect(videoStreamManager.lastHighQualityFrame).toBeDefined();
    });
  });

  describe('executeCommand', () => {
    it('should execute command successfully', async () => {
      const result = await videoStreamManager.executeCommand('test-command');
      
      expect(mockExec).toHaveBeenCalledWith('test-command', expect.any(Function));
      expect(result).toBe('success');
    });

    it('should handle command errors gracefully', async () => {
      mockExec.mockImplementation((cmd, callback) => {
        callback(new Error('Command failed'), '', 'error');
      });
      
      const result = await videoStreamManager.executeCommand('test-command');
      
      expect(result).toBe('');
    });
  });
});