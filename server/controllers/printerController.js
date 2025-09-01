const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

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

  async printImage(imagePath, options = {}) {
    const processedPath = await this.prepareImageForPrint(imagePath);
    
    return new Promise((resolve, reject) => {
      this.printQueue.push({ path: processedPath, options, resolve, reject });
      this.processQueue();
    });
  }

  async prepareImageForPrint(imagePath) {
    try {
      // Check if source file exists
      await fs.stat(imagePath);
      
      const outputPath = imagePath.replace('.jpg', '_print.jpg');
      
      // Copy the file for printing (in production, this would include Sharp processing)
      await fs.copyFile(imagePath, outputPath);
      
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
      await this.sendToPrinter(job.path, job.options);
      job.resolve({ success: true, path: job.path });
    } catch (error) {
      job.reject(error);
    } finally {
      // Clean up temporary files
      if (job.path && job.path.includes('_print.jpg')) {
        try {
          await fs.unlink(job.path);
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
    return new Promise((resolve, reject) => {
      const media = options.media || 'Postcard';
      const copies = options.copies ? `-n ${options.copies}` : '';
      const printCommand = `lp -d ${this.printerName} -o media=${media} -o fit-to-page ${copies} ${imagePath}`.replace(/\s+/g, ' ').trim();
      
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