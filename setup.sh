#!/bin/bash

echo "Photobooth Setup Script"
echo "======================"
echo ""

echo "Checking for required dependencies..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

if ! command -v gphoto2 &> /dev/null; then
    echo "⚠️  gphoto2 is not installed. Installing..."
    if command -v brew &> /dev/null; then
        brew install gphoto2 libgphoto2
    elif command -v apt &> /dev/null; then
        sudo apt update && sudo apt install -y gphoto2 libgphoto2-dev
    elif command -v yum &> /dev/null; then
        sudo yum install -y gphoto2 libgphoto2-devel
    else
        echo "Please install gphoto2 manually:"
        echo "  macOS: brew install gphoto2 libgphoto2"
        echo "  Ubuntu/Debian: sudo apt install gphoto2 libgphoto2-dev"
        echo "  CentOS/RHEL: sudo yum install gphoto2 libgphoto2-devel"
        exit 1
    fi
fi

if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  ffmpeg is not installed. Installing for high-resolution capture..."
    if command -v brew &> /dev/null; then
        brew install ffmpeg
    elif command -v apt &> /dev/null; then
        sudo apt update && sudo apt install -y ffmpeg
    elif command -v yum &> /dev/null; then
        sudo yum install -y ffmpeg
    else
        echo "Please install ffmpeg manually for high-resolution capture:"
        echo "  macOS: brew install ffmpeg"
        echo "  Ubuntu/Debian: sudo apt install ffmpeg"
        echo "  CentOS/RHEL: sudo yum install ffmpeg"
        echo "Note: Photobooth will still work without ffmpeg, but with lower resolution"
    fi
else
    echo "✅ ffmpeg found - high-resolution capture available"
fi

echo "✅ All system dependencies found"
echo ""

echo "Installing npm packages..."
npm install

echo ""
echo "Setting up environment..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file from template"
    echo "⚠️  Please edit .env to set your Canon Selphy printer name"
else
    echo "✅ .env file already exists"
fi

echo ""
echo "Creating directories..."
mkdir -p captures
mkdir -p client/dist
echo "✅ Created required directories"

echo ""
echo "Setup complete! 🎉"
echo ""

# Check what features are available
echo "📷 Available features:"
if command -v ffmpeg &> /dev/null; then
    echo "  ✅ High-resolution capture (2560x1440) via gphoto2 + ffmpeg pipeline"
else
    echo "  ⚠️  Basic resolution capture (ffmpeg not installed)"
fi

echo "  ✅ Live preview streaming"
echo "  ✅ Canon EOS camera support"
echo "  ✅ Canon Selphy printer integration"

echo ""
echo "Next steps:"
echo "1. Connect your Canon DSLR via USB"
echo "2. Ensure your Canon Selphy printer is connected and configured"
echo "3. Edit .env file with your printer name (check with: lpstat -p)"
echo "4. Run 'npm start' to start the server"
echo "5. Open http://[mac-ip]:3000 on your iPad"

if ! command -v ffmpeg &> /dev/null; then
    echo ""
    echo "💡 Pro tip: Install ffmpeg later for higher resolution capture:"
    echo "   brew install ffmpeg"
fi