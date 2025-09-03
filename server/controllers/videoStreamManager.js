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
    
    console.log('Starting 1080p video stream from HDMI capture card...');
    this.isStreaming = true;
    
    try {
      // Check if ffmpeg is available
      const ffmpegAvailable = await this.checkFFmpegAvailable();
      
      if (!ffmpegAvailable) {
        throw new Error('FFmpeg not found - required for HDMI capture');
      }

      // Check if USB Video capture device is available
      const captureAvailable = await this.checkCaptureDevice();
      
      if (!captureAvailable) {
        throw new Error('USB Video capture device not found');
      }
      
      // Start the HDMI capture pipeline
      this.startHDMICaptureStream();
      
    } catch (error) {
      console.error('Failed to start HDMI capture stream:', error);
      this.isStreaming = false;
      
      // Fallback to gphoto2 if HDMI capture fails
      console.log('Falling back to gphoto2 camera...');
      this.startGPhoto2Fallback();
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

  async checkCaptureDevice() {
    try {
      const devices = await this.executeCommand('ffmpeg -f avfoundation -list_devices true -i ""');
      
      // Extract device index for USB Video
      const lines = devices.split('\n');
      for (let line of lines) {
        if (line.includes('USB Video')) {
          const match = line.match(/\[(\d+)\]\s*USB Video/);
          if (match) {
            this.usbVideoIndex = match[1];
            console.log(`Found USB Video at index: ${this.usbVideoIndex}`);
            return true;
          }
        }
      }
      console.log('USB Video device not found in device list');
      return false;
    } catch (error) {
      console.log('Error checking capture device:', error.message);
      return false;
    }
  }

  async startHDMICaptureStream() {
    console.log('Starting HDMI capture stream at 1920x1080...');
    
    try {
      // Create the ffmpeg process for HDMI capture
      const ffmpegProcess = spawn('ffmpeg', [
        '-hide_banner',
        '-f', 'avfoundation',
        '-pixel_format', 'uyvy422',
        '-video_size', '1920x1080',
        '-framerate', '60',  // Use 60fps as supported by the device
        '-i', this.usbVideoIndex || '0',  // USB Video device index
        '-f', 'mjpeg',
        '-q:v', '2',  // High quality
        'pipe:1'
      ]);
      
      // Handle ffmpeg spawn errors
      ffmpegProcess.on('error', (error) => {
        console.error('HDMI capture ffmpeg process error:', error.message);
        console.log('Falling back to gphoto2...');
        this.startGPhoto2Fallback();
        return;
      });
      
      this.ffmpegProcess = ffmpegProcess;
      this.currentResolution = { 
        configured: true, 
        resolution: '1920x1080',
        width: 1920,
        height: 1080,
        source: 'hdmi'
      };
      
      // Handle ffmpeg output (1080p frames)
      let buffer = Buffer.alloc(0);
      let lastFrameTime = 0;
      const frameInterval = 50; // 20 FPS for preview (reduces bandwidth)
      
      ffmpegProcess.stdout.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        
        // Look for JPEG markers
        const startMarker = buffer.indexOf(Buffer.from([0xFF, 0xD8]));
        const endMarker = buffer.indexOf(Buffer.from([0xFF, 0xD9]));
        
        if (startMarker !== -1 && endMarker !== -1 && endMarker > startMarker) {
          // Extract complete JPEG frame
          const frame = buffer.slice(startMarker, endMarker + 2);
          
          // Store frame for high-resolution capture
          this.lastHighQualityFrame = frame;
          this.frameCounter++;
          
          // Log resolution periodically
          if (this.frameCounter % 90 === 0) {
            sharp(frame).metadata().then(metadata => {
              console.log(`HDMI capture resolution: ${metadata.width}x${metadata.height}`);
            }).catch(() => {});
          }
          
          // Throttle frame emission for preview
          const now = Date.now();
          if (now - lastFrameTime >= frameInterval) {
            // Create preview version (lower resolution for UI performance)
            sharp(frame)
              .resize(960, 540, { fit: 'inside' })  // Half resolution for preview
              .jpeg({ quality: 70 })
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
        if (buffer.length > 8 * 1024 * 1024) { // 8MB buffer for 1080p frames
          buffer = Buffer.alloc(0);
        }
      });
      
      // Error handling
      ffmpegProcess.stderr.on('data', (data) => {
        console.log('HDMI capture stderr:', data.toString());
      });
      
      // Process termination handling
      ffmpegProcess.on('close', (code) => {
        console.log(`HDMI capture process ended with code:`, code);
        const wasStreaming = this.isStreaming;
        this.isStreaming = false;
        
        if (wasStreaming) {
          this.emit('stream-ended', { code });
        }
      });
      
      // Emit stream-started after process is running
      setTimeout(() => {
        if (this.isStreaming && this.ffmpegProcess) {
          console.log('HDMI capture stream started successfully at 1920x1080');
          this.emit('stream-started');
        }
      }, 2000);
      
    } catch (error) {
      console.error('Error in HDMI capture stream:', error);
      console.log('Falling back to gphoto2...');
      this.startGPhoto2Fallback();
    }
  }

  async startGPhoto2Fallback() {
    console.log('Starting gphoto2 fallback stream...');
    this.isStreaming = true;
    
    try {
      // First, set the camera to movie mode with high quality settings
      await this.executeCommand('gphoto2 --set-config capturetarget=0');
      await this.executeCommand('gphoto2 --set-config viewfinder=1');
      
      // Detect and configure the highest available movie resolution
      const resolutionConfig = await this.detectAndConfigureMovieResolution();
      this.currentResolution = resolutionConfig;
      
      // Start the enhanced gphoto2 -> ffmpeg pipeline
      this.startHighResolutionPipeline();
      
    } catch (error) {
      console.error('Failed to start gphoto2 fallback:', error);
      this.startBasicStream();
    }
  }

  async detectAndConfigureMovieResolution() {
    try {
      console.log('Detecting available movie resolution settings...');
      
      // List all configuration options
      const configList = await this.executeCommand('gphoto2 --list-config');
      
      // Look for movie/video resolution settings
      const movieSettings = configList.split('\n').filter(line => 
        line.match(/movie|video|resolution/i) && 
        !line.includes('iso') && 
        !line.includes('quality')
      );
      
      console.log('Found movie-related settings:', movieSettings);
      
      // Check common resolution setting keys
      const possibleKeys = [
        '/main/imgsettings/movierecsize',
        '/main/capturesettings/movierecsize', 
        '/main/settings/movierecsize',
        '/main/imgsettings/videosize',
        '/main/capturesettings/videosize',
        '/main/settings/videosize'
      ];
      
      for (const key of possibleKeys) {
        try {
          const choices = await this.executeCommand(`gphoto2 --get-config ${key}`);
          console.log(`Available resolutions for ${key}:`);
          console.log(choices);
          
          // Look for the highest resolution available
          const resolutionMatch = choices.match(/Choice: \d+ (1920x1080|1280x720|3840x2160|2560x1440)/g);
          if (resolutionMatch && resolutionMatch.length > 0) {
            // Find the highest resolution
            const resolutions = resolutionMatch.map(match => {
              const res = match.match(/(\d+)x(\d+)/);
              return { 
                text: res[0], 
                width: parseInt(res[1]), 
                height: parseInt(res[2]),
                pixels: parseInt(res[1]) * parseInt(res[2])
              };
            });
            
            const highestRes = resolutions.sort((a, b) => b.pixels - a.pixels)[0];
            
            console.log(`Setting highest available resolution: ${highestRes.text}`);
            await this.executeCommand(`gphoto2 --set-config ${key}=${highestRes.text}`);
            
            return { 
              configured: true, 
              resolution: highestRes.text,
              width: highestRes.width,
              height: highestRes.height
            };
          }
        } catch (error) {
          // This key doesn't exist, try next one
          continue;
        }
      }
      
      console.log('No configurable movie resolution settings found');
      console.log('📷 Canon EOS M50 USB movie mode: Fixed 480x320 resolution');
      console.log('💡 For higher resolution (1080p/4K): Use HDMI capture card');
      console.log('   Recommended: Elgato Cam Link 4K, AVerMedia Live Gamer Mini, or similar');
      return { configured: false, resolution: '480x320', native: true };
      
    } catch (error) {
      console.log('Error detecting movie resolution settings:', error.message);
      return { configured: false, resolution: '480x320' };
    }
  }

  async startHighResolutionPipeline() {
    const resInfo = this.currentResolution?.configured 
      ? `configured ${this.currentResolution.resolution}` 
      : `native ${this.currentResolution?.resolution || 'camera'} resolution`;
    console.log(`Starting gphoto2 -> ffmpeg pipeline with ${resInfo}...`);
    
    try {
      // Create the gphoto2 process
      const gphotoProcess = spawn('gphoto2', [
        '--capture-movie',
        '--stdout'
      ]);
      
      // Create the ffmpeg process for native resolution (480x320)
      const ffmpegProcess = spawn('ffmpeg', [
        '-hide_banner',
        '-thread_queue_size', '1024',
        '-f', 'mjpeg',
        '-i', '-',
        '-r', '12',                          // Reduce from 25fps to 12fps
        '-q:v', '2',                         // High quality
        '-f', 'mjpeg',
        'pipe:1'
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
    const frameInterval = 83; // 12 FPS for optimal performance
    
    ffmpegProcess.stdout.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      
      // Look for JPEG markers
      const startMarker = buffer.indexOf(Buffer.from([0xFF, 0xD8]));
      const endMarker = buffer.indexOf(Buffer.from([0xFF, 0xD9]));
      
      if (startMarker !== -1 && endMarker !== -1 && endMarker > startMarker) {
        // Extract complete JPEG frame
        const frame = buffer.slice(startMarker, endMarker + 2);
        
        // Store frame for capture
        this.lastHighQualityFrame = frame;
        this.frameCounter++;
        
        // Log actual resolution periodically
        if (this.frameCounter % 60 === 0) {
          sharp(frame).metadata().then(metadata => {
            console.log(`Native stream resolution: ${metadata.width}x${metadata.height}`);
          }).catch(() => {});
        }
        
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
      if (buffer.length > 4 * 1024 * 1024) { // 4MB buffer for 4K frames
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
    const frameInterval = 83; // 12 FPS for optimal performance
    
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
      
      // Schedule next frame - 12 FPS for optimal performance
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
    const timestamp = Date.now();
    const filename = `photo_${timestamp}.jpg`;
    const filepath = path.join(this.captureDir, filename);
    
    try {
      // Check if we have a high-quality frame from HDMI capture
      if (this.lastHighQualityFrame && this.currentResolution?.source === 'hdmi') {
        console.log('📸 Capturing 1080p frame from HDMI stream...');
        
        const metadata = await sharp(this.lastHighQualityFrame).metadata();
        console.log(`✅ HDMI capture source: ${metadata.width}x${metadata.height}`);
        
        // Save the full 1080p frame with high quality
        await sharp(this.lastHighQualityFrame)
          .jpeg({ 
            quality: 95,
            progressive: true,
            mozjpeg: true
          })
          .toFile(filepath);
        
        console.log(`✅ 1080p photo saved: ${filepath}`);
        return filepath;
      }
      
      // For gphoto2 sources, try full resolution capture
      if (this.currentResolution?.source !== 'hdmi') {
        console.log('🔄 Stopping video stream for full resolution capture...');
        
        // Stop the current video stream
        const wasStreaming = this.isStreaming;
        await this.stopStream();
        
        // Wait for stream to fully stop
        await this.sleep(1000);
        
        console.log('📷 Capturing full resolution photo...');
        
        // Configure camera for full resolution capture
        await this.executeCommand('gphoto2 --set-config imageformat=0'); // JPEG Large
        await this.executeCommand('gphoto2 --set-config imagequality=0'); // Best quality
        await this.executeCommand('gphoto2 --set-config capturetarget=1'); // Memory card
        
        // Capture full resolution photo
        const result = await this.executeCommand(`gphoto2 --capture-image-and-download --filename=${filepath} --force-overwrite`);
        
        // Check if file was created
        const fileExists = await fs.access(filepath).then(() => true).catch(() => false);
        if (!fileExists) {
          throw new Error('Full resolution photo was not created');
        }
        
        // Get actual captured resolution
        const metadata = await sharp(filepath).metadata();
        console.log(`✅ Full resolution captured: ${metadata.width}x${metadata.height} (${(metadata.width * metadata.height / 1000000).toFixed(1)}MP)`);
        
        // Restart the video stream
        if (wasStreaming) {
          console.log('🔄 Restarting video stream...');
          setTimeout(() => {
            this.startStream();
          }, 1000);
        }
        
        return filepath;
      }
      
    } catch (error) {
      console.error('Capture failed:', error.message);
      
      // Fallback to stream capture if we have a frame
      if (this.lastHighQualityFrame) {
        console.log('📸 Falling back to stream frame capture...');
        
        const metadata = await sharp(this.lastHighQualityFrame).metadata();
        console.log(`Fallback source: ${metadata.width}x${metadata.height}`);
        
        await sharp(this.lastHighQualityFrame)
          .jpeg({ 
            quality: 95,
            progressive: true,
            mozjpeg: true
          })
          .toFile(filepath);
        
        // Restart stream if needed
        if (this.currentResolution?.source !== 'hdmi') {
          setTimeout(() => {
            this.startStream();
          }, 1000);
        }
        
        return filepath;
      }
      
      // If no fallback available, still try to restart stream
      setTimeout(() => {
        this.startStream();
      }, 1000);
      
      throw error;
    }
  }
  
  async captureFullResolutionPhoto() {
    // Alternative method for full resolution capture using separate gphoto2 instance
    const timestamp = Date.now();
    const filename = `photo_fullres_${timestamp}.jpg`;
    const filepath = path.join(this.captureDir, filename);
    
    try {
      console.log('📷 Attempting full resolution capture (separate instance)...');
      
      // Use a completely separate gphoto2 command that doesn't interfere with the stream
      // This tries to capture without changing the existing stream settings
      const result = await this.executeCommand(`timeout 10s gphoto2 --capture-image-and-download --filename=${filepath} --force-overwrite --port=usb:`, 15000);
      
      // Check if file was created
      const fileExists = await fs.access(filepath).then(() => true).catch(() => false);
      if (fileExists) {
        const metadata = await sharp(filepath).metadata();
        console.log(`✅ Full resolution captured: ${metadata.width}x${metadata.height} (${(metadata.width * metadata.height / 1000000).toFixed(1)}MP)`);
        return filepath;
      } else {
        throw new Error('Full resolution file not created');
      }
      
    } catch (error) {
      console.log('❌ Full resolution capture failed:', error.message);
      console.log('💡 This is expected - camera is in movie mode');
      
      // Clean up any partial file
      try {
        await fs.unlink(filepath);
      } catch {}
      
      return null;
    }
  }
  
  async startHDMICaptureInstructions() {
    console.log('\n🎥 HDMI Capture Setup for Higher Resolution:');
    console.log('1. Canon EOS M50 HDMI Settings:');
    console.log('   - Menu → Display Settings → HDMI Display → Manual');  
    console.log('   - Set to 1920x1080 or 3840x2160 (4K)');
    console.log('   - Disable HDMI info display');
    console.log('');
    console.log('2. Capture Card Options:');
    console.log('   - Elgato Cam Link 4K (~$130) - 4K30/1080p60');
    console.log('   - AVerMedia Live Gamer Mini (~$80) - 1080p60');
    console.log('   - Blackmagic Web Presenter (~$500) - Professional');
    console.log('');
    console.log('3. After connecting HDMI capture:');
    console.log('   - Device appears as /dev/video0 (or similar)');
    console.log('   - Use: ffmpeg -f v4l2 -i /dev/video0 ...');
    console.log('   - True 1080p/4K without USB limitations\n');
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
      gphoto2 --stdout --capture-movie | \
      ffmpeg -hide_banner -thread_queue_size 1024 -f mjpeg -i - \
        -pix_fmt yuv420p \
        -r 12 -f v4l2 ${videoDevice}
    `]);
    
    pipelineProcess.stderr.on('data', (data) => {
      console.log('Pipeline stderr:', data.toString());
    });
    
    pipelineProcess.on('close', (code) => {
      console.log(`Virtual device pipeline closed with code: ${code}`);
    });
    
    return pipelineProcess;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  executeCommand(command, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const options = { timeout };
      
      exec(command, options, (error, stdout, stderr) => {
        if (error) {
          // For ffmpeg device list command, the output is in stderr but it's not really an error
          if (command.includes('ffmpeg -f avfoundation -list_devices true')) {
            resolve(stderr); // Device list is in stderr for ffmpeg
            return;
          }
          
          // Only log warnings for configuration commands, reject for critical commands
          if (command.includes('ffmpeg -version') || command.includes('ls /dev/video') || command.includes('capture-image-and-download')) {
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