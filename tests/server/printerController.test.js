const { exec } = require('child_process');
const fs = require('fs').promises;
const printerController = require('../../server/controllers/printerController');

// Mock sharp
const mockSharp = {
  resize: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  toColorspace: jest.fn().mockReturnThis(),
  toFile: jest.fn().mockResolvedValue(),
  metadata: jest.fn().mockResolvedValue({
    width: 1920,
    height: 1080,
    format: 'jpeg',
    size: 204800
  })
};

jest.mock('child_process');
jest.mock('fs', () => ({
  promises: {
    copyFile: jest.fn(),
    unlink: jest.fn(),
    stat: jest.fn(),
    access: jest.fn()
  }
}));
jest.mock('fs/promises', () => ({
  copyFile: jest.fn(),
  unlink: jest.fn(),
  stat: jest.fn(),
  access: jest.fn()
}));
jest.mock('sharp', () => jest.fn(() => mockSharp));

describe('PrinterController', () => {
  let mockExec;
  let originalPrinterName;

  beforeEach(() => {
    // Store original printer name and set it for tests
    originalPrinterName = printerController.printerName;
    printerController.printerName = 'Canon_SELPHY_CP1500';
    
    // Reset sharp mocks
    mockSharp.resize.mockReturnValue(mockSharp);
    mockSharp.jpeg.mockReturnValue(mockSharp);
    mockSharp.toColorspace.mockReturnValue(mockSharp);
    mockSharp.toFile.mockResolvedValue();
    mockSharp.metadata.mockResolvedValue({
      width: 1200,
      height: 800,
      format: 'jpeg'
    });
    
    // Reset fs/promises mocks - handle both input and output file stats
    require('fs').promises.copyFile.mockResolvedValue();
    require('fs').promises.unlink.mockResolvedValue();
    require('fs').promises.stat.mockImplementation((path) => {
      console.log(`DEBUG: stat called for path: ${path}`);
      const result = { size: 204800 };
      console.log(`DEBUG: stat returning:`, result);
      return Promise.resolve(result);
    });
    require('fs').promises.access.mockResolvedValue();
    
    mockExec = exec.mockImplementation((command, callback) => {
      if (command.includes('lpstat -p')) {
        callback(null, 'printer Canon_SELPHY_CP1500 is idle. enabled since Thu 01 Sep 2024', '');
      } else if (command.includes('lp -d')) {
        callback(null, 'request id is Canon_SELPHY_CP1500-123 (1 file(s))', '');
      } else {
        callback(null, 'Command executed successfully', '');
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Restore original printer name
    printerController.printerName = originalPrinterName;
  });

  describe('getStatus', () => {
    it('should return printer status when printer is available', async () => {
      const status = await printerController.getStatus();

      expect(status).toEqual({
        connected: true,
        ready: true,
        status: 'printer Canon_SELPHY_CP1500 is idle. enabled since Thu 01 Sep 2024',
        queueLength: 0
      });
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('lpstat -p'), expect.any(Function));
    });

    it('should return disconnected status when printer not found', async () => {
      mockExec.mockImplementation((command, callback) => {
        callback(new Error('No destinations added'), '', 'lpstat: No destinations added.');
      });

      const status = await printerController.getStatus();

      expect(status).toEqual({
        connected: false,
        ready: false,
        error: 'Printer not found'
      });
    });

    it('should handle printer errors', async () => {
      mockExec.mockImplementation((command, callback) => {
        callback(null, 'printer Canon_SELPHY_CP1300 disabled since Thu 01 Sep 2024 - out of paper', '');
      });

      const status = await printerController.getStatus();

      expect(status).toEqual({
        connected: true,
        ready: false,
        status: 'printer Canon_SELPHY_CP1300 disabled since Thu 01 Sep 2024 - out of paper',
        queueLength: 0
      });
    });
  });

  describe('printImage', () => {
    const testImagePath = '/path/to/test-image.jpg';

    // No need for additional beforeEach - using global mocks from main beforeEach

    it('should print image successfully with default settings', async () => {
      const result = await printerController.printImage(testImagePath);

      // Sharp handles image processing directly, no copyFile needed
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringMatching(/lp -d Canon_SELPHY_CP1500 -o media=Custom\.148x100mm -o copies=1 -o ColorModel=CMYK -o Resolution=300x300dpi/),
        expect.any(Function)
      );
      expect(result).toEqual({
        success: true,
        path: expect.stringMatching(/_print\.jpg$/)
      });
    });

    it('should print image with custom options', async () => {
      const options = {
        media: '4x6',
        copies: 2,
        quality: 'high'
      };

      await printerController.printImage(testImagePath, options);

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringMatching(/lp -d Canon_SELPHY_CP1500 -o media=4x6 -o copies=2 -o ColorModel=CMYK -o Resolution=300x300dpi/),
        expect.any(Function)
      );
    });

    it('should handle missing image file', async () => {
        require('fs').promises.access.mockRejectedValue(new Error('ENOENT: no such file or directory'));
        require('fs').promises.stat.mockRejectedValue(new Error('ENOENT: no such file or directory'));

        await expect(printerController.printImage('/nonexistent/file.jpg'))
          .rejects.toThrow('Image processing failed');
      });

    it('should handle print command failures', async () => {
      
      // Mock failed exec call
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('lp -d')) {
          callback(new Error('Printer is offline'), '', 'lp: The printer or class does not exist.');
        }
      });

      await expect(printerController.printImage(testImagePath))
        .rejects.toThrow('Print failed');
    });

    it('should clean up temporary files after printing', async () => {
        await printerController.printImage(testImagePath);

        expect(require('fs').promises.unlink).toHaveBeenCalledWith(
          expect.stringMatching(/_print\.jpg$/)
        );
      });

    it('should clean up temporary files even if printing fails', async () => {
      
      // Mock failed printing
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('lp -d')) {
          callback(new Error('Print failed'), '', 'Print failed');
        }
      });

      try {
        await printerController.printImage(testImagePath);
      } catch (error) {
        // Expected to fail
      }

      expect(require('fs').promises.unlink).toHaveBeenCalledWith(
        expect.stringMatching(/_print\.jpg$/)
      );
    });
  });

  describe('cancelJob', () => {
    it('should cancel print job successfully', async () => {
      const jobId = 'Canon_SELPHY_CP1500-123';
      const result = await printerController.cancelJob(jobId);

      expect(result).toBe('Command executed successfully');
      expect(mockExec).toHaveBeenCalledWith(`cancel ${jobId}`, expect.any(Function));
    });

    it('should handle invalid job ID', async () => {
      mockExec.mockImplementation((command, callback) => {
        callback(new Error('Job not found'), '', 'cancel: Job not found');
      });

      await expect(printerController.cancelJob('invalid-job'))
        .rejects.toThrow('Job not found');
    });
  });

  describe('getQueue', () => {
    it('should return print queue status', async () => {
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('lpq')) {
          callback(null, 'Canon_SELPHY_CP1500 is ready\nRank    Owner   Job     File(s)                         Total Size\nactive  user    123     photo_123.jpg                   2048000 bytes', '');
        }
      });

      const queue = await printerController.getQueue();

      expect(queue).toContain('Canon_SELPHY_CP1500 is ready');
      expect(queue).toContain('photo_123.jpg');
      expect(mockExec).toHaveBeenCalledWith('lpq -P Canon_SELPHY_CP1500', expect.any(Function));
    });

    it('should handle empty queue', async () => {
      mockExec.mockImplementation((command, callback) => {
        callback(null, 'no entries', '');
      });

      const queue = await printerController.getQueue();

      expect(queue).toBe('no entries');
    });
  });
});