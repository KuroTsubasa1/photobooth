const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const EventEmitter = require('events');

class LiveViewManager extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.captureProcess = null;
    this.captureDir = path.join(__dirname, '../../captures');
    this.frameCounter = 0;
  }

  async start() {
    if (this.isRunning) return;
    
    console.log('Starting live view...');
    this.isRunning = true;
    
    // Enable viewfinder mode
    await this.executeCommand('gphoto2 --set-config viewfinder=1');
    
    // Start continuous capture loop
    this.captureLoop();
  }

  async captureLoop() {
    while (this.isRunning) {
      try {
        const frame = await this.captureFrame();
        if (frame) {
          this.emit('frame', frame);
        }
      } catch (error) {
        console.error('Frame capture error:', error);
      }
      
      // Wait before next capture (adjust for performance)
      await this.sleep(500); // 2 FPS
    }
  }

  async captureFrame() {
    return new Promise((resolve) => {
      const tempFile = path.join(this.captureDir, `liveview_${this.frameCounter++ % 2}.jpg`);
      
      // Use capture-preview for live view frames
      exec(`gphoto2 --capture-preview --filename=${tempFile} --force-overwrite`, async (error, stdout, stderr) => {
        if (error) {
          // Try alternative method
          exec(`gphoto2 --capture-image-and-download --keep --filename=${tempFile} --force-overwrite`, async (error2) => {
            if (error2) {
              resolve(null);
              return;
            }
            const frame = await this.processFrame(tempFile);
            resolve(frame);
          });
        } else {
          const frame = await this.processFrame(tempFile);
          resolve(frame);
        }
      });
    });
  }

  async processFrame(filepath) {
    try {
      const imageBuffer = await fs.readFile(filepath);
      
      // Resize and optimize for web streaming
      const optimizedBuffer = await sharp(imageBuffer)
        .resize(1024, 768, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .jpeg({ 
          quality: 70,
          progressive: true,
          mozjpeg: true
        })
        .toBuffer();
      
      // Clean up temp file
      await fs.unlink(filepath).catch(() => {});
      
      return {
        data: optimizedBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error processing frame:', error);
      return null;
    }
  }

  async stop() {
    console.log('Stopping live view...');
    this.isRunning = false;
    
    if (this.captureProcess) {
      this.captureProcess.kill();
      this.captureProcess = null;
    }
    
    // Disable viewfinder
    await this.executeCommand('gphoto2 --set-config viewfinder=0');
  }

  executeCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.log(`Command warning: ${error.message}`);
        }
        resolve(stdout);
      });
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new LiveViewManager();