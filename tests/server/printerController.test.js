const { exec } = require('child_process');
const fs = require('fs').promises;
const printerController = require('../../server/controllers/printerController');

jest.mock('child_process');
jest.mock('fs', () => ({
  promises: {
    copyFile: jest.fn(),
    unlink: jest.fn(),
    stat: jest.fn()
  }
}));

describe('PrinterController', () => {
  let mockExec;
  let originalPrinterName;

  beforeEach(() => {
    // Store original printer name and set it for tests
    originalPrinterName = printerController.printerName;
    printerController.printerName = 'Canon_SELPHY_CP1300';
    
    mockExec = exec.mockImplementation((command, callback) => {
      if (command.includes('lpstat -p')) {
        callback(null, 'printer Canon_SELPHY_CP1300 is idle. enabled since Thu 01 Sep 2024', '');
      } else if (command.includes('lp -d')) {
        callback(null, 'request id is Canon_SELPHY_CP1300-123 (1 file(s))', '');
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
        status: 'printer Canon_SELPHY_CP1300 is idle. enabled since Thu 01 Sep 2024',
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

    beforeEach(() => {
      fs.copyFile.mockResolvedValue();
      fs.unlink.mockResolvedValue();
      fs.stat.mockResolvedValue({ size: 1024 });
    });

    it('should print image successfully with default settings', async () => {
      const result = await printerController.printImage(testImagePath);

      expect(fs.copyFile).toHaveBeenCalledWith(
        testImagePath,
        expect.stringMatching(/_print\.jpg$/)
      );
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringMatching(/lp -d Canon_SELPHY_CP1300 -o media=Postcard -o fit-to-page/),
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
        expect.stringMatching(/lp -d Canon_SELPHY_CP1300 -o media=4x6 -o fit-to-page -n 2/),
        expect.any(Function)
      );
    });

    it('should handle missing image file', async () => {
      fs.stat.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      await expect(printerController.printImage('/nonexistent/file.jpg'))
        .rejects.toThrow('ENOENT: no such file or directory');
    });

    it('should handle print command failures', async () => {
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('lp -d')) {
          callback(new Error('Printer is offline'), '', 'lp: The printer or class does not exist.');
        }
      });

      await expect(printerController.printImage(testImagePath))
        .rejects.toThrow('Printer is offline');
    });

    it('should clean up temporary files after printing', async () => {
      await printerController.printImage(testImagePath);

      expect(fs.unlink).toHaveBeenCalledWith(
        expect.stringMatching(/_print\.jpg$/)
      );
    });

    it('should clean up temporary files even if printing fails', async () => {
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('lp -d')) {
          callback(new Error('Print failed'), '', '');
        }
      });

      try {
        await printerController.printImage(testImagePath);
      } catch (error) {
        // Expected to fail
      }

      expect(fs.unlink).toHaveBeenCalledWith(
        expect.stringMatching(/_print\.jpg$/)
      );
    });
  });

  describe('cancelJob', () => {
    it('should cancel print job successfully', async () => {
      const jobId = 'Canon_SELPHY_CP1300-123';
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
          callback(null, 'Canon_SELPHY_CP1300 is ready\nRank    Owner   Job     File(s)                         Total Size\nactive  user    123     photo_123.jpg                   2048000 bytes', '');
        }
      });

      const queue = await printerController.getQueue();

      expect(queue).toContain('Canon_SELPHY_CP1300 is ready');
      expect(queue).toContain('photo_123.jpg');
      expect(mockExec).toHaveBeenCalledWith('lpq -P Canon_SELPHY_CP1300', expect.any(Function));
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