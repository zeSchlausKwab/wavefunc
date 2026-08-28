#!/bin/bash
# Deploy WaveFunc to VPS
# Usage: ./scripts/deploy.sh

set -e

# Load deployment configuration
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please create one based on .env.example"
    exit 1
fi

export $(cat .env | grep -v '^#' | xargs)

# Validate required variables
if [ -z "$VPS_HOST" ] || [ -z "$VPS_USER" ] || [ -z "$VPS_PATH" ]; then
    echo "❌ Required variables missing: VPS_HOST, VPS_USER, VPS_PATH"
    exit 1
fi

echo "🚀 Deploying WaveFunc to $VPS_HOST..."

# Build frontend locally
echo "📦 Building frontend..."
./scripts/build-production.sh

# Create deployment archive
echo "📦 Creating archive..."

# The 133 MB legacy snapshot is only needed to bootstrap a brand-new server.
# Shipping it on every release wastes transfer quota and makes deploys fragile.
LEGACY_ARCHIVE_PATH=""
if [ "${INCLUDE_LEGACY_DB:-false}" = "true" ] && \
   [ -d "legacy-db" ] && [ -f "legacy-db/latest.sql" ]; then
    echo "   Including legacy-db/latest.sql (explicit opt-in)..."
    LEGACY_ARCHIVE_PATH="legacy-db/"
else
    echo "   Skipping legacy-db (set INCLUDE_LEGACY_DB=true for a new-server bootstrap)"
fi

tar -czf deploy.tar.gz \
    --exclude='contextvm/node_modules' \
    --exclude='contextvm/bin' \
    --exclude='relay/relay' \
    --exclude='relay/wavefunc-relay' \
    --exclude='relay/data' \
    --exclude='dist/*.map' \
    --exclude='src-tauri' \
    dist/ src/ relay/ contextvm/ scripts/ \
    $LEGACY_ARCHIVE_PATH \
    ecosystem.config.cjs \
    Caddyfile \
    package.json \
    bun.lock

# Upload files
echo "📤 Uploading to VPS..."
ssh $VPS_USER@$VPS_HOST "mkdir -p $VPS_PATH"
# Legacy SCP streams sequentially and avoids the SFTP request-window stalls
# observed on this quota-constrained VPS after suspension/reactivation.
scp -O deploy.tar.gz $VPS_USER@$VPS_HOST:$VPS_PATH/
scp -O .env.production $VPS_USER@$VPS_HOST:$VPS_PATH/.env 2>/dev/null || \
    echo "⚠️  No .env.production found, using existing VPS .env"
scp -O scripts/deploy-remote.sh $VPS_USER@$VPS_HOST:$VPS_PATH/

# Execute remote deployment
echo "🔧 Running deployment on VPS..."
ssh $VPS_USER@$VPS_HOST "cd $VPS_PATH && bash deploy-remote.sh"

# Cleanup
rm deploy.tar.gz

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "📊 View logs:   ssh $VPS_USER@$VPS_HOST 'pm2 logs'"
echo "📊 Check status: ssh $VPS_USER@$VPS_HOST 'pm2 status'"
