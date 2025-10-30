#!/bin/bash

set -e

# Load environment variables
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found. Please create one based on .env.example"
    exit 1
fi

# Source .env file
export $(cat .env | grep -v '^#' | xargs)

# Validate required variables
if [ -z "$VPS_HOST" ] || [ -z "$VPS_USER" ] || [ -z "$VPS_PATH" ]; then
    echo "❌ Error: VPS_HOST, VPS_USER, and VPS_PATH must be set in .env"
    exit 1
fi

echo "🚀 Deploying WaveFunc to $VPS_HOST..."

# Build locally
echo ""
echo "📦 Building locally..."
./scripts/build-production.sh

# Create deployment archive
echo ""
echo "📦 Creating deployment archive..."
tar -czf deploy.tar.gz \
    --exclude='contextvm/node_modules' \
    --exclude='relay/relay' \
    --exclude='relay/data' \
    dist/ \
    src/ \
    relay/ \
    contextvm/ \
    ecosystem.config.cjs \
    Caddyfile \
    package.json \
    bun.lock

# Upload to VPS
echo ""
echo "📤 Uploading to VPS..."
ssh $VPS_USER@$VPS_HOST "mkdir -p $VPS_PATH"
scp deploy.tar.gz $VPS_USER@$VPS_HOST:$VPS_PATH/
scp .env.production $VPS_USER@$VPS_HOST:$VPS_PATH/.env 2>/dev/null || echo "⚠️  No .env.production found, skipping..."

# Extract and deploy on VPS
echo ""
echo "🔧 Deploying on VPS..."
ssh $VPS_USER@$VPS_HOST bash << EOF
    set -e
    cd $VPS_PATH

    # Load Bun and Go into PATH
    export BUN_INSTALL="\$HOME/.bun"
    export PATH="\$BUN_INSTALL/bin:/usr/local/go/bin:\$PATH"

    # Verify Bun is available
    if ! command -v bun &> /dev/null; then
        echo "❌ Bun not found in PATH. Please install Bun on the VPS."
        exit 1
    fi

    # Verify Go is available
    if ! command -v go &> /dev/null; then
        echo "❌ Go not found in PATH. Please install Go on the VPS."
        exit 1
    fi

    echo "Using Bun: \$(which bun)"
    echo "Using Go: \$(which go)"

    # Extract archive
    tar -xzf deploy.tar.gz
    rm deploy.tar.gz

    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "📦 Installing dependencies..."
        bun install --production
    fi

    # Build Go relay on VPS with CGO enabled (required for SQLite)
    echo "🔧 Building Go relay..."
    cd relay
    CGO_ENABLED=1 go build -o relay -ldflags="-s -w" .
    cd ..

    # Create logs directory
    mkdir -p logs

    # Reload Caddy configuration (requires passwordless sudo)
    echo "🔄 Attempting to reload Caddy..."
    if sudo -n cp Caddyfile /etc/caddy/Caddyfile 2>/dev/null && sudo -n systemctl reload caddy 2>/dev/null; then
        echo "✅ Caddy configuration reloaded"
    else
        echo "⚠️  Could not reload Caddy automatically (needs passwordless sudo)"
        echo "   To reload Caddy manually, run:"
        echo "   ssh $VPS_USER@$VPS_HOST 'sudo cp /var/www/wavefunc/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy'"
    fi

    # Stop and delete old PM2 processes
    echo "🔄 Stopping old PM2 processes..."
    pm2 delete all || true

    # Start PM2 processes with explicit Bun interpreter and environment variables
    echo "🚀 Starting PM2 processes..."
    BUN_PATH="\$HOME/.bun/bin/bun"

    NODE_ENV=production PORT=3000 pm2 start src/index.tsx \
        --name wavefunc-web \
        --interpreter "\$BUN_PATH" \
        --log-date-format 'YYYY-MM-DD HH:mm:ss Z' \
        --error logs/web-error.log \
        --output logs/web-out.log \
        --merge-logs

    PORT=3334 pm2 start relay/relay \
        --name wavefunc-relay \
        --log-date-format 'YYYY-MM-DD HH:mm:ss Z' \
        --error logs/relay-error.log \
        --output logs/relay-out.log \
        --merge-logs

    NODE_ENV=production pm2 start contextvm/server.ts \
        --name wavefunc-contextvm \
        --interpreter "\$BUN_PATH" \
        --log-date-format 'YYYY-MM-DD HH:mm:ss Z' \
        --error logs/contextvm-error.log \
        --output logs/contextvm-out.log \
        --merge-logs

    pm2 save

    echo ""
    echo "✅ Deployment complete!"
    echo ""
    echo "📊 Process status:"
    pm2 list
EOF

# Cleanup
rm deploy.tar.gz

echo ""
echo "🎉 Deployment finished successfully!"
echo ""
echo "To view logs:"
echo "  ssh $VPS_USER@$VPS_HOST 'pm2 logs'"
echo ""
echo "To check status:"
echo "  ssh $VPS_USER@$VPS_HOST 'pm2 status'"