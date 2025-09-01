const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

class CameraController {
  constructor() {
    this.captureDir = path.join(__dirname, '../../captures');
    this.ensureCaptureDir();
  }

  async ensureCaptureDir() {
    try {
      await fs.mkdir(this.captureDir, { recursive: true });
    } catch (error) {
      console.error('Error creating capture directory:', error);
    }
  }

  async getStatus() {
    return new Promise((resolve, reject) => {
      exec('gphoto2 --auto-detect', (error, stdout, stderr) => {
        if (error) {
          reject({ connected: false, error: error.message });
        } else {
          const connected = stdout.includes('Canon');
          resolve({ 
            connected,
            model: connected ? stdout.split('\n').find(line => line.includes('Canon')) : null
          });
        }
      });
    });
  }

  async getLiveView() {
    return new Promise((resolve) => {
      // For Canon EOS M50, we'll use a simple capture for preview
      // This is less frequent but more reliable
      const tempFile = path.join(this.captureDir, 'preview.jpg');
      
      exec(`gphoto2 --capture-preview --filename=${tempFile} --force-overwrite`, async (error, stdout, stderr) => {
        if (error) {
          // If preview fails, return null data
          console.log('Preview not available');
          resolve({
            data: null,
            mimeType: 'image/jpeg',
            error: 'Preview temporarily unavailable'
          });
          return;
        }

        try {
          const imageBuffer = await fs.readFile(tempFile);
          const resizedBuffer = await sharp(imageBuffer)
            .resize(800, 600, { fit: 'inside' })
            .jpeg({ quality: 50 })
            .toBuffer();
          
          await fs.unlink(tempFile).catch(() => {});
          
          resolve({
            data: resizedBuffer.toString('base64'),
            mimeType: 'image/jpeg'
          });
        } catch (err) {
          resolve({
            data: null,
            mimeType: 'image/jpeg',
            error: 'Preview processing error'
          });
        }
      });
    });
  }

  async captureImage() {
    return new Promise((resolve, reject) => {
      const timestamp = Date.now();
      const filename = `photo_${timestamp}.jpg`;
      const filepath = path.join(this.captureDir, filename);
      
      // First, set camera to capture JPEG instead of RAW
      exec('gphoto2 --set-config imageformat=0', (error) => {
        if (error) console.log('Could not set image format');
        
        // Now capture the image
        exec(`gphoto2 --capture-image-and-download --filename=${filepath} --force-overwrite`, async (error, stdout, stderr) => {
          if (error) {
            reject(error);
            return;
          }
          
          // Check if we got a CR3 file instead of JPEG
          if (stdout.includes('.cr3') || stdout.includes('.CR3')) {
            // The camera saved as CR3, we need to handle this
            const cr3Path = filepath.replace('.jpg', '.cr3');
            
            try {
              // For now, we'll capture a preview as JPEG instead
              const jpegPath = filepath;
              await this.executeCommand(`gphoto2 --capture-preview --filename=${jpegPath} --force-overwrite`);
              console.log(`Photo captured (preview): ${filename}`);
              resolve(jpegPath);
            } catch (err) {
              reject(new Error('Camera is set to RAW mode. Please set camera to JPEG mode.'));
            }
          } else {
            console.log(`Photo captured: ${filename}`);
            resolve(filepath);
          }
        });
      });
    });
  }
  
  executeCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
  }

  async configureCamera(settings = {}) {
    const defaultSettings = {
      'iso': 'AUTO',
      'f-number': 'f/5.6',
      'shutterspeed': '1/125',
      ...settings
    };

    const configCommands = Object.entries(defaultSettings)
      .map(([key, value]) => `--set-config ${key}=${value}`)
      .join(' ');

    return new Promise((resolve, reject) => {
      exec(`gphoto2 ${configCommands}`, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ success: true, settings: defaultSettings });
        }
      });
    });
  }
}

module.exports = new CameraController();