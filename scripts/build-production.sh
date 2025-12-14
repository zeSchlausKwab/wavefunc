#!/bin/bash

set -e

echo "🏗️  Building WaveFunc for production..."

# Load RELAY_URL from .env.production if it exists (for production builds)
# Otherwise it will default to ws://localhost:3334 in build.ts
if [ -f .env.production ]; then
    export $(cat .env.production | grep RELAY_URL | xargs)
    echo "📡 Using RELAY_URL: $RELAY_URL"
elif [ -f .env ]; then
    export $(cat .env | grep RELAY_URL | xargs) 2>/dev/null || true
    [ -n "$RELAY_URL" ] && echo "📡 Using RELAY_URL: $RELAY_URL"
fi

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