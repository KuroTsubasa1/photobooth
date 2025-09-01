const { exec } = require('child_process');
const cameraController = require('../../server/controllers/cameraController');

jest.mock('child_process');

describe('CameraController', () => {
  let mockExec;

  beforeEach(() => {
    mockExec = exec.mockImplementation((command, callback) => {
      if (command.includes('--auto-detect')) {
        callback(null, 'Model                          Port\nCanon EOS M50                  usb:001,002\n', '');
      } else if (command.includes('--get-config')) {
        callback(null, 'Current: AUTO\n', '');
      } else {
        callback(null, 'Command executed successfully', '');
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getStatus', () => {
    it('should return camera status when camera is connected', async () => {
      const status = await cameraController.getStatus();

      expect(status).toEqual({
        connected: true,
        model: 'Canon EOS M50',
        port: 'usb:001,002'
      });
      expect(mockExec).toHaveBeenCalledWith('gphoto2 --auto-detect', expect.any(Function));
    });

    it('should return disconnected status when no camera found', async () => {
      mockExec.mockImplementation((command, callback) => {
        callback(null, 'Model                          Port\n', '');
      });

      const status = await cameraController.getStatus();

      expect(status).toEqual({
        connected: false,
        model: null,
        port: null
      });
    });

    it('should handle gphoto2 command errors', async () => {
      mockExec.mockImplementation((command, callback) => {
        callback(new Error('gphoto2 not found'), '', 'gphoto2: command not found');
      });

      const status = await cameraController.getStatus();

      expect(status).toEqual({
        connected: false,
        model: null,
        port: null,
        error: 'gphoto2 not found'
      });
    });
  });

  describe('getConfig', () => {
    it('should get camera configuration setting', async () => {
      const config = await cameraController.getConfig('iso');

      expect(config).toBe('AUTO');
      expect(mockExec).toHaveBeenCalledWith('gphoto2 --get-config iso', expect.any(Function));
    });

    it('should handle configuration errors', async () => {
      mockExec.mockImplementation((command, callback) => {
        callback(new Error('Invalid configuration key'), '', 'Error: Invalid configuration key');
      });

      await expect(cameraController.getConfig('invalid-key'))
        .rejects.toThrow('Invalid configuration key');
    });
  });

  describe('setConfig', () => {
    it('should set camera configuration successfully', async () => {
      const result = await cameraController.setConfig('iso', '400');

      expect(result).toBe('Command executed successfully');
      expect(mockExec).toHaveBeenCalledWith('gphoto2 --set-config iso=400', expect.any(Function));
    });

    it('should handle invalid configuration values', async () => {
      mockExec.mockImplementation((command, callback) => {
        callback(new Error('Invalid value'), '', 'Error: Invalid value for configuration');
      });

      await expect(cameraController.setConfig('iso', 'invalid'))
        .rejects.toThrow('Invalid value');
    });
  });

  describe('captureImage', () => {
    it('should capture image successfully', async () => {
      const filename = 'test-photo.jpg';
      const result = await cameraController.captureImage(filename);

      expect(result).toBe('Command executed successfully');
      expect(mockExec).toHaveBeenCalledWith(
        `gphoto2 --capture-image-and-download --filename ${filename}`,
        expect.any(Function)
      );
    });

    it('should use default filename if none provided', async () => {
      await cameraController.captureImage();

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringMatching(/gphoto2 --capture-image-and-download --filename photo_\d+\.jpg/),
        expect.any(Function)
      );
    });

    it('should handle capture errors', async () => {
      mockExec.mockImplementation((command, callback) => {
        callback(new Error('Camera not ready'), '', 'Error: Camera not ready');
      });

      await expect(cameraController.captureImage('test.jpg'))
        .rejects.toThrow('Camera not ready');
    });
  });

  describe('capturePreview', () => {
    it('should capture preview successfully', async () => {
      const filename = 'preview.jpg';
      const result = await cameraController.capturePreview(filename);

      expect(result).toBe('Command executed successfully');
      expect(mockExec).toHaveBeenCalledWith(
        `gphoto2 --capture-preview --filename ${filename}`,
        expect.any(Function)
      );
    });

    it('should use default preview filename', async () => {
      await cameraController.capturePreview();

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringMatching(/gphoto2 --capture-preview --filename preview_\d+\.jpg/),
        expect.any(Function)
      );
    });
  });
});