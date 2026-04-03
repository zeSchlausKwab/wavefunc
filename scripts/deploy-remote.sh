#!/bin/bash
# This script runs ON the VPS during deployment
# It's uploaded and executed by the main deploy script

set -e

echo "🔧 Setting up environment..."

# Load Bun and Go into PATH
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:/usr/local/go/bin:$PATH"

# Verify required tools
command -v bun >/dev/null 2>&1 || { echo "❌ Bun not found"; exit 1; }
command -v go >/dev/null 2>&1 || { echo "❌ Go not found"; exit 1; }

echo "✓ Using Bun: $(which bun)"
echo "✓ Using Go: $(which go)"

# Install ffmpeg if missing (needed by yt-dlp for audio extraction and WebM encoding)
if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "📦 Installing ffmpeg..."
    if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get install -y ffmpeg || echo "⚠️  ffmpeg install failed — run 'sudo apt-get install -y ffmpeg' manually"
    elif command -v yum >/dev/null 2>&1; then
        sudo yum install -y ffmpeg || echo "⚠️  ffmpeg install failed — run 'sudo yum install -y ffmpeg' manually"
    else
        echo "⚠️  Cannot install ffmpeg automatically — install it manually"
    fi
else
    echo "✓ ffmpeg: $(ffmpeg -version 2>&1 | head -1)"
fi

# Install yt-dlp standalone binary (no Python/venv required)
YTDLP_BIN="contextvm/bin/yt-dlp"
echo "📦 Installing/updating yt-dlp..."
mkdir -p contextvm/bin
rm -rf "$YTDLP_BIN"
curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o "$YTDLP_BIN"
chmod +x "$YTDLP_BIN"
echo "✓ yt-dlp: $("$YTDLP_BIN" --version)"

# Extract deployment archive
echo "📦 Extracting files..."
tar -xzf deploy.tar.gz
rm deploy.tar.gz

# Sync dependencies on every deploy so bun.lock/package changes take effect.
echo "📦 Syncing dependencies..."
bun install --production --frozen-lockfile

# Build Go relay (must be built on VPS for correct architecture)
echo "🔧 Building Go relay (this may take a few minutes on first run)..."
cd relay
CGO_ENABLED=1 GOTOOLCHAIN=local go build -v -o relay -ldflags="-s -w" . 2>&1
echo "✅ Relay binary built"
cd ..

# Create logs directory
echo "📁 Creating log directory..."
mkdir -p logs

# Reload Caddy (optional, requires passwordless sudo)
echo "🔄 Reloading Caddy..."
if timeout 10 sudo -n cp Caddyfile /etc/caddy/Caddyfile 2>/dev/null && \
   timeout 15 sudo -n systemctl restart caddy 2>/dev/null; then
    echo "✅ Caddy restarted"
else
    echo "⚠️  Caddy restart skipped (run manually if needed)"
fi

# Detect storage format change: SQLite (events.db) → LMDB (events/)
# This happens on the first deploy after the khatru upgrade.
# The relay data directory is preserved between deploys, so we must clean up
# the incompatible old files and flag that migration needs to run.
NEEDS_MIGRATION=false
if [ -f "relay/data/events.db" ] && [ ! -d "relay/data/events" ]; then
    echo "⚠️  Detected old SQLite storage — migrating to LMDB..."
    rm -f relay/data/events.db
    rm -rf relay/data/search  # also remove old bluge index (incompatible with bleve)
    echo "✅ Old data cleared — relay will start with a fresh database"
    NEEDS_MIGRATION=true
fi

# Restart PM2 processes
echo "🔄 Restarting services..."
pm2 delete all 2>/dev/null || true

if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Start each service with explicit settings
# Using Bun interpreter for TypeScript files
BUN_PATH="$HOME/.bun/bin/bun"
YTDLP_BIN_ABS="$(pwd)/$YTDLP_BIN"

NODE_ENV=production PORT=3000 pm2 start src/index.tsx \
    --name wavefunc-web \
    --interpreter "$BUN_PATH" \
    --max-memory-restart 1G \
    --log-date-format 'YYYY-MM-DD HH:mm:ss Z' \
    -e logs/web-error.log \
    -o logs/web-out.log \
    --merge-logs

PORT=3334 pm2 start relay/relay \
    --name wavefunc-relay \
    --max-memory-restart 500M \
    --log-date-format 'YYYY-MM-DD HH:mm:ss Z' \
    -e logs/relay-error.log \
    -o logs/relay-out.log \
    --merge-logs

NODE_ENV=production \
YTDLP_PATH="${YTDLP_PATH:-$YTDLP_BIN_ABS}" \
pm2 start contextvm/server.ts \
    --name wavefunc-contextvm \
    --interpreter "$BUN_PATH" \
    --max-memory-restart 500M \
    --log-date-format 'YYYY-MM-DD HH:mm:ss Z' \
    -e logs/contextvm-error.log \
    -o logs/contextvm-out.log \
    --merge-logs

pm2 save

# Run migration if this is a fresh database (format change or first deploy)
if [ "$NEEDS_MIGRATION" = "true" ]; then
    echo ""
    echo "🔄 Running station migration (500 stations)..."
    echo "   Waiting for relay to be ready..."
    sleep 3

    # Load env to get APP_PRIVATE_KEY
    if [ -f ".env" ]; then
        export $(grep -v '^#' .env | xargs)
    fi

    if [ -z "$APP_PRIVATE_KEY" ]; then
        echo "⚠️  APP_PRIVATE_KEY not set in .env — skipping migration"
        echo "   Run 'bun run migrate:vps' from your local machine to populate stations"
    else
        echo "🚀 Starting full migration in background (~52k stations)..."
        nohup bun run scripts/migrate_legacy.ts 100000 --relay=ws://localhost:3334 \
            > logs/migration.log 2>&1 &
        echo "✅ Migration running in background (PID: $!)"
        echo "   Monitor: tail -f logs/migration.log"
    fi
fi

echo ""
echo "✅ Deployment complete!"
pm2 list
