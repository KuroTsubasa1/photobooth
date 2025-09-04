#!/bin/bash

# Photobooth Headless Mode - Maximum Performance
# Runs with minimal console output for optimal 30fps streaming

echo "🚀 Starting Photobooth in HEADLESS mode for maximum performance..."
echo "⚡ 30fps video streaming optimized"
echo "🔇 Console output minimized"
echo ""

# Set high process priority for better real-time performance
export NODE_ENV=production

# Run with quiet flag - minimal console output
node server/index.js --quiet
