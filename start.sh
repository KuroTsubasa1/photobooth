#!/bin/bash

# Kill any existing process on the port
PORT=$(grep PORT .env | cut -d'=' -f2)
if [ -z "$PORT" ]; then
    PORT=3000
fi

echo "Checking for existing processes on port $PORT..."
lsof -ti:$PORT | xargs kill -9 2>/dev/null

echo "Starting photobooth server on port $PORT..."
npm start