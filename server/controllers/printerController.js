const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

class PrinterController {
  constructor() {
    this.printerName = process.env.SELPHY_PRINTER_NAME || 'Canon_SELPHY';
    this.printQueue = [];
    this.isPrinting = false;
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

  async printImage(imagePath) {
    const processedPath = await this.prepareImageForPrint(imagePath);
    
    return new Promise((resolve, reject) => {
      this.printQueue.push({ path: processedPath, resolve, reject });
      this.processQueue();
    });
  }

  async prepareImageForPrint(imagePath) {
    try {
      // Check if source file exists
      await fs.access(imagePath);
      
      const outputPath = imagePath.replace('.jpg', '_print.jpg');
      
      await sharp(imagePath)
        .resize(1800, 1200, { 
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 95 })
        .toFile(outputPath);
      
      return outputPath;
    } catch (error) {
      console.error('Error preparing image for print:', error);
      throw error;
    }
  }

  async processQueue() {
    if (this.isPrinting || this.printQueue.length === 0) {
      return;
    }

    this.isPrinting = true;
    const job = this.printQueue.shift();

    try {
      await this.sendToPrinter(job.path);
      job.resolve({ success: true, path: job.path });
    } catch (error) {
      job.reject(error);
    } finally {
      this.isPrinting = false;
      if (this.printQueue.length > 0) {
        setTimeout(() => this.processQueue(), 1000);
      }
    }
  }

  async sendToPrinter(imagePath) {
    return new Promise((resolve, reject) => {
      const printCommand = `lp -d ${this.printerName} -o media=Postcard -o fit-to-page ${imagePath}`;
      
      exec(printCommand, (error, stdout, stderr) => {
        if (error) {
          console.error('Print error:', error);
          reject(error);
        } else {
          console.log('Print job sent:', stdout);
          resolve(stdout);
        }
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
}

module.exports = new PrinterController();