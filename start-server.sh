#!/bin/bash
# Start Race Team Software V5 Server
# This makes the software accessible on your local network at 10.0.0.30:3000

echo "🚀 Starting Race Team Software V5..."
echo ""

cd "$(dirname "$0")/server"
npm start
