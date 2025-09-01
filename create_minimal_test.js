const sharp = require('sharp');
const fs = require('fs');

async function createMinimalTestImage() {
    try {
        // Create a very simple 100x100 red square
        const buffer = await sharp({
            create: {
                width: 100,
                height: 100,
                channels: 3,
                background: { r: 255, g: 0, b: 0 }
            }
        })
        .jpeg({
            quality: 80,
            progressive: false,
            mozjpeg: false,
            force: true
        })
        .toBuffer();
        
        fs.writeFileSync('/tmp/minimal_test.jpg', buffer);
        console.log('Created minimal test image: /tmp/minimal_test.jpg');
        console.log('File size:', buffer.length, 'bytes');
        
    } catch (error) {
        console.error('Error creating minimal test image:', error);
    }
}

createMinimalTestImage();