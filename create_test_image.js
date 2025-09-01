const sharp = require('sharp');
const fs = require('fs');

async function createTestImage() {
  try {
    // Create a simple test image with the exact settings from printerController
    const testImageBuffer = await sharp({
      create: {
        width: 1800,
        height: 1200,
        channels: 3,
        background: { r: 255, g: 0, b: 0 } // Red background
      }
    })
    .jpeg({
      quality: 95,
      progressive: false,
      mozjpeg: false,
      chromaSubsampling: '4:4:4',
      force: true
    })
    .toColorspace('srgb')
    .toBuffer();
    
    // Save the test image
    await fs.promises.writeFile('/tmp/simple_test.jpg', testImageBuffer);
    console.log('Created simple test image: /tmp/simple_test.jpg');
    
    // Check file properties
    const stats = await fs.promises.stat('/tmp/simple_test.jpg');
    console.log(`File size: ${stats.size} bytes`);
    
  } catch (error) {
    console.error('Error creating test image:', error);
  }
}

createTestImage();