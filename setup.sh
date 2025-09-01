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
    else
        echo "Please install gphoto2 manually:"
        echo "  brew install gphoto2 libgphoto2"
        exit 1
    fi
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
echo "Next steps:"
echo "1. Connect your Canon DSLR via USB"
echo "2. Ensure your Canon Selphy printer is connected and configured"
echo "3. Edit .env file with your printer name (check with: lpstat -p)"
echo "4. Run 'npm start' to start the server"
echo "5. Open http://[mac-ip]:3000 on your iPad"