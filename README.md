# Photobooth 📸

A multi-device photobooth application featuring live camera preview, instant capture, and automatic printing.

## Components

- **iPad**: Touch interface for preview and control
- **MacBook Pro**: Central server and processing hub
- **Canon EOS M50**: DSLR camera for high-quality photos
- **Canon Selphy CP1300**: Instant photo printer

## Features

- ✨ **Live Camera Preview**: Real-time video stream from Canon EOS M50
- 📱 **iPad Control Interface**: Touch-friendly interface with live preview
- 🎯 **Instant Capture**: Direct frame capture from live stream for zero delay
- 🖼️ **Photo Review**: Review captured photos before printing
- 🖨️ **Auto-Printing**: Seamless integration with Canon Selphy printer
- 🎨 **Modern UI**: Elegant design with smooth animations
- 🔄 **Smart Reconnection**: Persistent camera state across page reloads
- 📊 **Error Handling**: Toast notifications instead of intrusive alerts

## Technical Stack

- **Backend**: Node.js, Express.js, Socket.IO
- **Frontend**: Vanilla JavaScript, CSS3, HTML5
- **Camera Control**: gphoto2 CLI
- **Image Processing**: Sharp library
- **Real-time Communication**: WebSocket (Socket.IO)
- **Printing**: CUPS/lp integration

## Setup

### Prerequisites

- Node.js (v14 or higher)
- gphoto2 installed via Homebrew
- Canon EOS M50 connected via USB
- Canon Selphy CP1300 printer configured

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/KuroTsubasa1/photobooth.git
   cd photobooth
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

4. Run setup script (macOS):
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```

### Running the Application

```bash
# Start the server
./start.sh

# Or manually
npm start
```

Access the application:
- **Local**: http://localhost:3112
- **iPad**: http://[YOUR_IP]:3112

## Camera Settings

The application captures photos in:
- **Resolution**: 3000x2000 pixels (6 MP)
- **Aspect Ratio**: 3:2 (landscape)
- **Quality**: 95% JPEG with progressive encoding
- **Preview**: 720x480 optimized for real-time streaming

## Usage

1. Connect your Canon EOS M50 via USB
2. Open the web interface on your iPad
3. Click "Connect to Camera" to start live preview
4. Use "Take Photo" to capture images
5. Review photos in the modal dialog
6. Choose "Print Photo" or "Retake" for each capture

## Architecture

```
┌─────────────┐    WebSocket    ┌─────────────┐
│    iPad     │◄──────────────►│   Server    │
│  (Client)   │                │  (Node.js)  │
└─────────────┘                └─────────────┘
                                       │
                                       ▼
                               ┌─────────────┐
                               │   gphoto2   │
                               │ (Camera)    │
                               └─────────────┘
                                       │
                                       ▼
                               ┌─────────────┐
                               │    CUPS     │
                               │ (Printer)   │
                               └─────────────┘
```

## Development

The application consists of:

- `server/index.js` - Main server and Socket.IO handlers
- `server/controllers/videoStreamManager.js` - Camera streaming logic
- `server/controllers/cameraController.js` - Camera operations
- `server/controllers/printerController.js` - Printer integration
- `client/` - Frontend files (HTML, CSS, JavaScript)

## Troubleshooting

### Camera Issues
- Ensure camera is in PC connection mode
- Kill any interfering processes: `sudo killall PTPCamera`
- Check USB connection and try different ports

### Printing Issues
- Verify printer is configured in System Preferences
- Check CUPS status: `lpstat -p`
- Ensure printer has paper and is powered on

### Network Issues
- Verify iPad and MacBook are on the same WiFi network
- Check firewall settings
- Ensure port 3112 is not blocked

## License

MIT License - see LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Acknowledgments

Built with love for creating memorable photo experiences! 📸✨