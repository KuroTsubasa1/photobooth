const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const sharp = require('sharp');

class VideoStreamManager extends EventEmitter {
  constructor() {
    super();
    this.streamProcess = null;
    this.ffmpegProcess = null;
    this.isStreaming = false;
    this.captureDir = path.join(__dirname, '../../captures');
    this.lastHighQualityFrame = null;
    this.frameCounter = 0;
  }

  async startStream() {
    if (this.isStreaming) return;
    
    console.log('Starting high-resolution video stream from Canon EOS M50...');
    this.isStreaming = true;
    
    try {
      // First, set the camera to movie mode with high quality settings
      await this.executeCommand('gphoto2 --set-config capturetarget=0');
      await this.executeCommand('gphoto2 --set-config viewfinder=1');
      
      // Check if ffmpeg is available before trying high-res pipeline
      const ffmpegAvailable = await this.checkFFmpegAvailable();
      
      if (ffmpegAvailable) {
        // Start the enhanced gphoto2 -> ffmpeg pipeline for higher resolution
        this.startHighResolutionPipeline();
      } else {
        console.log('FFmpeg not found, using basic stream');
        this.startBasicStream();
      }
      
    } catch (error) {
      console.error('Failed to start high-resolution video stream:', error);
      this.isStreaming = false;
      
      // Fallback to basic stream
      this.startBasicStream();
    }
  }
  
  async checkFFmpegAvailable() {
    try {
      await this.executeCommand('ffmpeg -version');
      return true;
    } catch (error) {
      return false;
    }
  }

  async startHighResolutionPipeline() {
    console.log('Starting gphoto2 -> ffmpeg pipeline for maximum resolution...');
    
    try {
      // Create the gphoto2 process
      const gphotoProcess = spawn('gphoto2', [
        '--capture-movie',
        '--stdout'
      ]);
      
      // Create the ffmpeg process for maximum resolution processing
      const ffmpegProcess = spawn('ffmpeg', [
        '-f', 'mjpeg',           // Input format
        '-i', '-',               // Read from stdin
        '-vf', 'scale=2560:1440:force_original_aspect_ratio=decrease,pad=2560:1440:(ow-iw)/2:(oh-ih)/2', // Scale to 1440p for higher resolution
        '-pix_fmt', 'yuvj420p',  // Pixel format
        '-q:v', '1',             // Maximum quality (1 = best, 31 = worst)
        '-r', '12',              // 12 FPS - optimal for photobooth (smooth preview, efficient processing)
        '-f', 'mjpeg',           // Output format
        'pipe:1'                 // Output to stdout
      ]);
      
      // Handle ffmpeg spawn errors
      ffmpegProcess.on('error', (error) => {
        console.error('FFmpeg process error:', error.message);
        console.log('Falling back to basic stream...');
        this.startBasicStream();
        return;
      });
      
      // Pipe gphoto2 output to ffmpeg input
      gphotoProcess.stdout.pipe(ffmpegProcess.stdin);
      
      this.streamProcess = gphotoProcess;
      this.ffmpegProcess = ffmpegProcess;
    
    // Handle ffmpeg output (high-resolution frames)
    let buffer = Buffer.alloc(0);
    let lastFrameTime = 0;
    const frameInterval = 83; // 12 FPS
    
    ffmpegProcess.stdout.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      
      // Look for JPEG markers
      const startMarker = buffer.indexOf(Buffer.from([0xFF, 0xD8]));
      const endMarker = buffer.indexOf(Buffer.from([0xFF, 0xD9]));
      
      if (startMarker !== -1 && endMarker !== -1 && endMarker > startMarker) {
        // Extract complete high-resolution JPEG frame
        const frame = buffer.slice(startMarker, endMarker + 2);
        
        // Store high-resolution frame for capture
        this.lastHighQualityFrame = frame;
        this.frameCounter++;
        
        // Throttle frame emission for preview
        const now = Date.now();
        if (now - lastFrameTime >= frameInterval) {
          // Create preview version (lower resolution for UI)
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
      if (buffer.length > 2 * 1024 * 1024) { // 2MB buffer for HD frames
        buffer = Buffer.alloc(0);
      }
    });
    
    // Error handling
    gphotoProcess.stderr.on('data', (data) => {
      console.log('gphoto2 stderr:', data.toString());
    });
    
    ffmpegProcess.stderr.on('data', (data) => {
      console.log('ffmpeg stderr:', data.toString());
    });
    
    // Process termination handling
    const handleProcessEnd = (processName, code) => {
      console.log(`${processName} process ended with code:`, code);
      const wasStreaming = this.isStreaming;
      this.isStreaming = false;
      
      if (wasStreaming) {
        this.emit('stream-ended', { code });
      }
    };
    
    gphotoProcess.on('close', (code) => handleProcessEnd('gphoto2', code));
    ffmpegProcess.on('close', (code) => handleProcessEnd('ffmpeg', code));
    
      // Emit stream-started after processes are running
      setTimeout(() => {
        if (this.isStreaming && this.streamProcess && this.ffmpegProcess) {
          console.log('High-resolution pipeline started successfully');
          this.emit('stream-started');
        }
      }, 2000);
      
    } catch (error) {
      console.error('Error in high-resolution pipeline:', error);
      console.log('Falling back to basic stream...');
      this.startBasicStream();
    }
  }
  
  async startBasicStream() {
    console.log('Starting basic video stream as fallback...');
    
    // Original stream logic as fallback
    this.streamProcess = spawn('gphoto2', [
      '--capture-movie',
      '--stdout'
    ]);
    
    // Emit stream-started after a brief delay
    setTimeout(() => {
      if (this.isStreaming && this.streamProcess) {
        this.emit('stream-started');
      }
    }, 1000);
    
    let buffer = Buffer.alloc(0);
    let lastFrameTime = 0;
    const frameInterval = 83; // 12 FPS
    
    this.streamProcess.stdout.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      
      // Look for JPEG markers
      const startMarker = buffer.indexOf(Buffer.from([0xFF, 0xD8]));
      const endMarker = buffer.indexOf(Buffer.from([0xFF, 0xD9]));
      
      if (startMarker !== -1 && endMarker !== -1 && endMarker > startMarker) {
        const frame = buffer.slice(startMarker, endMarker + 2);
        this.lastHighQualityFrame = frame;
        this.frameCounter++;
        
        const now = Date.now();
        if (now - lastFrameTime >= frameInterval) {
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
        
        buffer = buffer.slice(endMarker + 2);
      }
      
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
      
      if (wasStreaming) {
        this.emit('stream-ended', { code });
      }
    });
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
        
        // Store full resolution for capture, resize only for preview
        this.lastHighQualityFrame = frameData;
        
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
        setTimeout(() => captureFrame(), 83); // 12 FPS
      }
    };
    
    captureFrame();
  }
  
  async stopStream() {
    console.log('Stopping video stream...');
    this.isStreaming = false;
    
    // Stop gphoto2 process
    if (this.streamProcess) {
      this.streamProcess.kill('SIGTERM');
    }
    
    // Stop ffmpeg process if it exists
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGTERM');
    }
    
    // Give processes time to close before clearing references
    setTimeout(() => {
      this.streamProcess = null;
      this.ffmpegProcess = null;
    }, 1000);
    
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
      // Get the source image metadata first
      const metadata = await sharp(this.lastHighQualityFrame).metadata();
      console.log(`Capturing frame from stream: ${metadata.width}x${metadata.height}`);
      
      // Save at maximum available resolution from stream without upscaling
      // Use the actual stream resolution, don't artificially resize
      await sharp(this.lastHighQualityFrame)
        .jpeg({ 
          quality: 95,
          progressive: true,
          mozjpeg: true
        })
        .toFile(filepath);
      
      console.log(`High-quality frame captured: ${filename} at ${metadata.width}x${metadata.height}`);
      return filepath;
      
    } catch (error) {
      console.error('Error saving frame:', error);
      throw error;
    }
  }
  
  async startVirtualDeviceStream(videoDevice = '/dev/video4') {
    console.log(`Starting gphoto2 -> ffmpeg -> ${videoDevice} pipeline...`);
    
    // Check if v4l2loopback device exists
    try {
      await this.executeCommand(`ls ${videoDevice}`);
    } catch (error) {
      console.log(`Virtual video device ${videoDevice} not found. Creating v4l2loopback device...`);
      console.log('Run: sudo modprobe v4l2loopback video_nr=4 card_label="Photobooth Camera"');
      throw new Error(`Virtual video device ${videoDevice} not available. Please set up v4l2loopback first.`);
    }
    
    // Create the gphoto2 -> ffmpeg -> v4l2 pipeline
    const pipelineProcess = spawn('bash', ['-c', `
      gphoto2 --stdout --capture-movie | ffmpeg -i - \
        -vf "scale=2560:1440:force_original_aspect_ratio=decrease,pad=2560:1440:(ow-iw)/2:(oh-ih)/2" \
        -pix_fmt yuv420p \
        -r 12 \
        -f v4l2 ${videoDevice}
    `]);
    
    pipelineProcess.stderr.on('data', (data) => {
      console.log('Pipeline stderr:', data.toString());
    });
    
    pipelineProcess.on('close', (code) => {
      console.log(`Virtual device pipeline closed with code: ${code}`);
    });
    
    return pipelineProcess;
  }

  executeCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          // Only log warnings for configuration commands, reject for critical commands
          if (command.includes('ffmpeg -version') || command.includes('ls /dev/video')) {
            reject(error);
          } else {
            console.log(`Command warning: ${command} - ${error.message}`);
            resolve(stdout);
          }
        } else {
          resolve(stdout);
        }
      });
    });
  }
}

module.exports = new VideoStreamManager();