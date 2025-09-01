const { exec } = require('child_process');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

class PrinterController {
  constructor() {
    this.printerName = process.env.SELPHY_PRINTER_NAME || 'Canon_SELPHY';
    this.printQueue = [];
    this.isPrinting = false;
  }

  async processImage(buffer) {
    try {
      // Create a properly formatted JPEG file for printer compatibility
      const processedBuffer = await sharp(buffer)
        .resize(1800, 1200, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255 }
        })
        .jpeg({ 
          quality: 95,
          progressive: false,  // Disable progressive for better printer compatibility
          mozjpeg: false,      // Use standard JPEG instead of mozjpeg for compatibility
          chromaSubsampling: '4:4:4'  // Full chroma sampling for better quality
        })
        .toFormat('jpeg')     // Explicitly set format to JPEG
        .toBuffer();

      // Save to temporary file for printing
      const tempPath = path.join(__dirname, '..', 'temp', `print_${Date.now()}_print.jpg`);
      
      // Ensure temp directory exists
      await fsPromises.mkdir(path.dirname(tempPath), { recursive: true });
      
      await fsPromises.writeFile(tempPath, processedBuffer);
      
      console.log(`Image processed and saved to: ${tempPath}`);
      console.log(`Processed image size: ${processedBuffer.length} bytes`);
      
      return tempPath;
    } catch (error) {
      console.error('Image processing error:', error);
      throw new Error('Failed to process image for printing');
    }
  }

  async getStatus() {
    return new Promise((resolve, reject) => {
      exec(`lpstat -p | grep ${this.printerName}`, (error, stdout, stderr) => {
        if (error) {
          resolve({ 
            connected: false, 
            ready: false,
            error: 'Printer not found' 
          });
        } else {
          const isIdle = stdout.includes('idle');
          const isEnabled = stdout.includes('enabled');
          
          resolve({
            connected: true,
            ready: isIdle && isEnabled,
            status: stdout.trim(),
            queueLength: this.printQueue.length
          });
        }
      });
    });
  }

  async printImage(imagePath, options = {}) {
    const processedPath = await this.prepareImageForPrint(imagePath);
    
    return new Promise((resolve, reject) => {
      this.printQueue.push({ path: processedPath, options, resolve, reject });
      this.processQueue();
    });
  }

  async prepareImageForPrint(imagePath) {
    console.log('Preparing image for print:', imagePath);
    
    const outputPath = imagePath.replace(/\.jpg$/, '_print.jpg');
    
    try {
      // Validate input file exists and is accessible
      await fsPromises.access(imagePath);
      const stats = await fsPromises.stat(imagePath);
      
      if (stats.size === 0) {
        throw new Error('Image file is empty');
      }
      
      if (stats.size > 50 * 1024 * 1024) { // 50MB limit
        throw new Error('Image file is too large (max 50MB)');
      }
      
      // Validate image format using Sharp metadata
      const metadata = await sharp(imagePath).metadata();
      
      if (!metadata.width || !metadata.height) {
        throw new Error('Invalid image: Unable to read image dimensions');
      }
      
      if (metadata.width < 100 || metadata.height < 100) {
        throw new Error('Image resolution too low (minimum 100x100 pixels)');
      }
      
      const supportedFormats = ['jpeg', 'jpg', 'png', 'webp', 'tiff', 'gif'];
      if (!supportedFormats.includes(metadata.format)) {
        throw new Error(`Unsupported image format: ${metadata.format}. Supported formats: ${supportedFormats.join(', ')}`);
      }
      
      console.log(`Processing image: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);
      
      // Process image for Canon SELPHY CP1500 compatibility
      // Canon SELPHY CP1500 specifications:
      // - 300x300 DPI
      // - Postcard size: 1800x1200 pixels (6"x4" at 300 DPI)
      // - High-quality JPEG with proper color space
      
      await sharp(imagePath)
        .resize(1800, 1200, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({
          quality: 95,
          progressive: false,
          mozjpeg: false,
          chromaSubsampling: '4:4:4',
          force: true
        })
        .toColorspace('srgb')
        .toFile(outputPath);
      
      // Validate output file was created successfully
      await fsPromises.access(outputPath);
      const outputStats = await fsPromises.stat(outputPath);
      
      if (outputStats.size === 0) {
        throw new Error('Failed to create processed image file');
      }
      
      console.log('Image prepared for print with Canon SELPHY CP1500 optimization:', outputPath);
      return outputPath;
    } catch (error) {
      console.error('Error preparing image for print:', error.message);
      
      // Clean up partial output file if it exists
      try {
        await fsPromises.unlink(outputPath);
      } catch (unlinkError) {
        // Ignore unlink errors
      }
      
      // Provide user-friendly error messages
      if (error.code === 'ENOENT') {
        throw new Error('Image file not found');
      } else if (error.code === 'EACCES') {
        throw new Error('Permission denied accessing image file');
      } else if (error.message.includes('Input file contains unsupported image format')) {
        throw new Error('Unsupported or corrupted image format');
      }
      
      throw new Error(`Image processing failed: ${error.message}`);
    }
  }

  async processQueue() {
    if (this.isPrinting || this.printQueue.length === 0) {
      return;
    }

    this.isPrinting = true;
    const job = this.printQueue.shift();

    try {
      await this.sendToPrinter(job.path, job.options);
      job.resolve({ success: true, path: job.path });
    } catch (error) {
      job.reject(error);
    } finally {
      // Clean up temporary files
      if (job.path && job.path.includes('_print.jpg')) {
        try {
          await fsPromises.unlink(job.path);
        } catch (unlinkError) {
          console.log('Could not clean up temp file:', unlinkError.message);
        }
      }
      
      this.isPrinting = false;
      if (this.printQueue.length > 0) {
        setTimeout(() => this.processQueue(), 1000);
      }
    }
  }

  async sendToPrinter(imagePath, options = {}) {
    const {
      media = 'Postcard',  // Canon SELPHY CP1500 postcard size
      copies = 1,
      fitToPage = false  // Disable fit-to-page for better compatibility
    } = options;

    const lpOptions = [
      `-d ${this.printerName}`,
      `-o media=${media}`,
      `-o copies=${copies}`,
      '-o ColorModel=CMYK',  // Canon SELPHY uses CMYK
      '-o Resolution=300x300dpi',  // Canon SELPHY CP1500 resolution
      fitToPage ? '-o fit-to-page' : '',
      `"${imagePath}"`
    ].filter(Boolean).join(' ');

    const command = `lp ${lpOptions}`;
    console.log('Print command:', command);

    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error('Print error:', error.message);
          reject(new Error(`Print failed: ${error.message}`));
          return;
        }
        
        if (stderr) {
          console.warn('Print warning:', stderr);
        }
        
        console.log('Print successful:', stdout.trim());
        resolve(stdout.trim());
      });
    });
  }

  async cancelAllJobs() {
    return new Promise((resolve, reject) => {
      exec(`cancel -a ${this.printerName}`, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          this.printQueue = [];
          resolve({ success: true, message: 'All print jobs cancelled' });
        }
      });
    });
  }

  async cancelJob(jobId) {
    return new Promise((resolve, reject) => {
      exec(`cancel ${jobId}`, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
  }

  async getQueue() {
    return new Promise((resolve, reject) => {
      exec(`lpq -P ${this.printerName}`, (error, stdout, stderr) => {
        if (error) {
          resolve('no entries');
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }
}

module.exports = new PrinterController();