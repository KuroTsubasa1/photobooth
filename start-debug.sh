#!/bin/bash

# Photobooth Debug Mode
# Verbose logging for development and troubleshooting

echo "🐛 Starting Photobooth in DEBUG mode..."
echo "📝 Verbose logging enabled"
echo "🔧 Development mode active"
echo ""

# Run with verbose flag for detailed logs
export NODE_ENV=development
node server/index.js --verbose
