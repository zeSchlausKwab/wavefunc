#!/bin/bash

set -e

echo "🏗️  Building WaveFunc for production..."

# Build the frontend
echo ""
echo "📦 Building frontend..."
bun run build.ts

echo ""
echo "✅ Frontend build complete!"
echo ""
echo "Output:"
echo "  - Frontend: ./dist/"
echo ""
echo "Note: Go relay will be built on the VPS during deployment"