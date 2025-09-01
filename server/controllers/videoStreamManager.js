const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const sharp = require('sharp');

class VideoStreamManager extends EventEmitter {
  constructor() {
    super();
    this.streamProcess = null;
    this.isStreaming = false;
    this.captureDir = path.join(__dirname, '../../captures');
    this.lastHighQualityFrame = null;
    this.frameCounter = 0;
  }

  async startStream() {
    if (this.isStreaming) return;
    
    console.log('Starting video stream from Canon EOS M50...');
    this.isStreaming = true;
    
    try {
      // First, set the camera to movie mode
      await this.executeCommand('gphoto2 --set-config capturetarget=0');
      await this.executeCommand('gphoto2 --set-config viewfinder=1');
      
      // Start capturing video stream
      this.streamProcess = spawn('gphoto2', [
        '--capture-movie',
        '--stdout'
      ]);
      
      // Emit stream-started after a brief delay to ensure it's running
      setTimeout(() => {
        if (this.isStreaming && this.streamProcess) {
          this.emit('stream-started');
        }
      }, 1000);
      
      let buffer = Buffer.alloc(0);
      
      let lastFrameTime = 0;
      const frameInterval = 83; // ~12 FPS for smooth preview
      
      this.streamProcess.stdout.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        
        // Look for JPEG markers
        const startMarker = buffer.indexOf(Buffer.from([0xFF, 0xD8]));
        const endMarker = buffer.indexOf(Buffer.from([0xFF, 0xD9]));
        
        if (startMarker !== -1 && endMarker !== -1 && endMarker > startMarker) {
          // Extract complete JPEG frame
          const frame = buffer.slice(startMarker, endMarker + 2);
          
          // Store high-quality version for potential capture
          this.lastHighQualityFrame = frame;
          this.frameCounter++;
          
          // Throttle frame emission to reduce bandwidth
          const now = Date.now();
          if (now - lastFrameTime >= frameInterval) {
            // Emit the frame for preview (can be lower quality)
            sharp(frame)
              .resize(720, 480, { fit: 'inside' })
              .jpeg({ quality: 60 })
              .toBuffer()
              .then(resizedFrame => {
                this.emit('frame', {
                  data: resizedFrame.toString('base64'),
                  mimeType: 'image/jpeg',
                  timestamp: now
                });
              })
              .catch(err => console.log('Frame resize error:', err.message));
            
            lastFrameTime = now;
          }
          
          // Keep remaining data in buffer
          buffer = buffer.slice(endMarker + 2);
        }
        
        // Prevent buffer from growing too large
        if (buffer.length > 1024 * 1024) {
          buffer = Buffer.alloc(0);
        }
      });
      
      this.streamProcess.stderr.on('data', (data) => {
        console.log('Stream stderr:', data.toString());
      });
      
      this.streamProcess.on('close', (code) => {
        console.log('Stream process closed with code:', code);
        const wasStreaming = this.isStreaming;
        this.isStreaming = false;
        
        // Emit stream-ended event to notify server
        if (wasStreaming) {
          this.emit('stream-ended', { code });
        }
      });
      
    } catch (error) {
      console.error('Failed to start video stream:', error);
      this.isStreaming = false;
      
      // Fallback to frame capture mode
      this.startFrameCapture();
    }
  }
  
  async startFrameCapture() {
    console.log('Using frame capture mode as fallback...');
    
    const captureFrame = async () => {
      if (!this.isStreaming) return;
      
      try {
        const tempFile = path.join(this.captureDir, 'frame_temp.jpg');
        
        // Capture a single frame
        await this.executeCommand(`gphoto2 --capture-preview --filename=${tempFile} --force-overwrite`);
        
        // Read and emit the frame
        const frameData = await fs.readFile(tempFile);
        
        // Resize for better performance on iPad
        const resizedBuffer = await sharp(frameData)
          .resize(720, 480, { fit: 'inside' })
          .jpeg({ quality: 40 })
          .toBuffer();
        
        this.emit('frame', {
          data: resizedBuffer.toString('base64'),
          mimeType: 'image/jpeg',
          timestamp: Date.now()
        });
        
        // Clean up
        await fs.unlink(tempFile).catch(() => {});
        
      } catch (error) {
        console.log('Frame capture error:', error.message);
      }
      
      // Schedule next frame - 12 FPS for smooth preview
      if (this.isStreaming) {
        setTimeout(() => captureFrame(), 83); // ~12 FPS
      }
    };
    
    captureFrame();
  }
  
  async stopStream() {
    console.log('Stopping video stream...');
    this.isStreaming = false;
    
    if (this.streamProcess) {
      this.streamProcess.kill('SIGTERM');
      // Give process time to close before clearing reference
      setTimeout(() => {
        this.streamProcess = null;
      }, 1000);
    }
    
    // Reset camera settings
    await this.executeCommand('gphoto2 --set-config viewfinder=0').catch(() => {});
  }
  
  async captureFrameFromStream() {
    if (!this.lastHighQualityFrame) {
      throw new Error('No frame available for capture');
    }
    
    const timestamp = Date.now();
    const filename = `photo_${timestamp}.jpg`;
    const filepath = path.join(this.captureDir, filename);
    
    try {
      // Save the high-quality frame with better processing
      
      // Get the image metadata first
      const metadata = await sharp(this.lastHighQualityFrame).metadata();
      console.log(`Capturing frame: ${metadata.width}x${metadata.height}`);
      
      await sharp(this.lastHighQualityFrame)
        .resize(3000, 2000, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .jpeg({ 
          quality: 95,
          progressive: true,
          mozjpeg: true
        })
        .toFile(filepath);
      
      console.log(`Frame captured from stream: ${filename}`);
      return filepath;
      
    } catch (error) {
      console.error('Error saving frame:', error);
      throw error;
    }
  }
  
  executeCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error && !error.message.includes('not found')) {
          console.log(`Command warning: ${command} - ${error.message}`);
        }
        resolve(stdout);
      });
    });
  }
}

module.exports = new VideoStreamManager();