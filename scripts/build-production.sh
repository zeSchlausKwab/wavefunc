#!/bin/bash

set -e

echo "🏗️  Building WaveFunc for production..."

# Build the frontend
echo ""
echo "📦 Building frontend..."
bun run build.ts

# Build the Go relay
echo ""
echo "🔧 Building Go relay..."
cd relay
go build -o relay -ldflags="-s -w" .
cd ..

echo ""
echo "✅ Production build complete!"
echo ""
echo "Output:"
echo "  - Frontend: ./dist/"
echo "  - Relay binary: ./relay/relay"