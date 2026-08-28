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

# Install Node.js if missing (needed by yt-dlp for JS signature solving with YouTube web clients)
if ! command -v node >/dev/null 2>&1; then
    echo "📦 Installing Node.js (LTS)..."
    if command -v apt-get >/dev/null 2>&1; then
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - 2>/dev/null || true
        sudo apt-get install -y nodejs || echo "⚠️  Node.js install failed — run manually"
    else
        echo "⚠️  Cannot install Node.js automatically — install it manually"
    fi
else
    echo "✓ Node.js: $(node --version)"
fi

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

# Install yt-dlp from the generic release asset.
# The linux_exe build regressed on the VPS by failing to detect usable JS runtimes,
# which broke YouTube extraction for videos that need challenge solving.
YTDLP_BIN="contextvm/bin/yt-dlp"
echo "📦 Installing/updating yt-dlp..."
mkdir -p contextvm/bin
rm -rf "$YTDLP_BIN"
curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o "$YTDLP_BIN"
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

# Create persistent runtime directories
echo "📁 Creating runtime directories..."
mkdir -p logs data

# Bound PM2-managed logs before starting services. The relay can receive a very
# high request volume, so an unbounded stderr log can otherwise fill the VPS.
echo "🧹 Configuring PM2 log rotation..."
if ! pm2 describe pm2-logrotate >/dev/null 2>&1; then
    pm2 install pm2-logrotate
fi
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'

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

# Detect bleve/LMDB drift: LMDB has events but search index is missing or was
# wiped (e.g. bluge→bleve auto-reset). Without this rebuild the relay serves
# empty NIP-50 results even though the stations are in storage.
NEEDS_REINDEX=false
if [ "$NEEDS_MIGRATION" = "false" ] && [ -d "relay/data/events" ]; then
    if [ ! -d "relay/data/search" ] || [ ! -f "relay/data/search/index_meta.json" ]; then
        echo "⚠️  LMDB present but bleve search index missing — will rebuild after relay starts."
        NEEDS_REINDEX=true
    fi
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

PORT=3334 \
GOMEMLIMIT="${RELAY_GOMEMLIMIT:-1GiB}" \
RELAY_VERBOSE_LOGGING="${RELAY_VERBOSE_LOGGING:-false}" \
RELAY_POLICY_MODE="${RELAY_POLICY_MODE:-wavefunc}" \
METADATA_SERVER_PUBKEY="${METADATA_SERVER_PUBKEY:-bb0707242a17a4be881919b3dcfea63f42aacedc3ff898a66be30af195ff32b2}" \
pm2 start relay/relay \
    --name wavefunc-relay \
    --log-date-format 'YYYY-MM-DD HH:mm:ss Z' \
    -e logs/relay-error.log \
    -o logs/relay-out.log \
    --merge-logs

NODE_ENV=production \
RELAY_URL="${CONTEXTVM_RELAY_URL:-ws://127.0.0.1:3334}" \
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

# The deployment user may not have permission to create a system-wide PM2
# startup unit. Install an idempotent cron fallback so a VPS reboot still
# resurrects the saved process list. A pm2-deploy systemd unit remains the
# preferred primary mechanism when an administrator is available.
echo "🔄 Installing PM2 reboot safeguard..."
if command -v crontab >/dev/null 2>&1; then
    PM2_BIN="$(command -v pm2)"
    PM2_HOME_DIR="$HOME/.pm2"
    APP_DIR="$(pwd)"
    REBOOT_MARKER="# wavefunc-pm2-resurrect"
    REBOOT_ENTRY="@reboot sleep 20 && PM2_HOME=$PM2_HOME_DIR $PM2_BIN resurrect >> $APP_DIR/logs/pm2-resurrect.log 2>&1 $REBOOT_MARKER"
    BANDWIDTH_MARKER="# wavefunc-bandwidth-sample"
    BANDWIDTH_ENTRY="17 * * * * $APP_DIR/scripts/record-bandwidth.sh $BANDWIDTH_MARKER"
    EXISTING_CRONTAB="$(crontab -l 2>/dev/null || true)"
    {
        printf '%s\n' "$EXISTING_CRONTAB" | grep -vF "$REBOOT_MARKER" | grep -vF "$BANDWIDTH_MARKER" || true
        printf '%s\n' "$REBOOT_ENTRY"
        printf '%s\n' "$BANDWIDTH_ENTRY"
    } | crontab -
    echo "✅ PM2 reboot safeguard installed"
    ./scripts/record-bandwidth.sh
    echo "✅ Hourly bandwidth sampling installed"
else
    echo "⚠️  crontab is unavailable; configure a pm2-$USER systemd service manually"
fi

# Catch the exact reverse-proxy failure mode before a deployment reports
# success. PM2 can say "online" briefly even if an application exits during
# startup, so probe the actual upstreams after they have had time to bind.
echo "🩺 Checking local service health..."
sleep 3
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/ >/dev/null
curl --fail --silent --show-error --max-time 10 \
    -H 'Accept: application/nostr+json' \
    http://127.0.0.1:3334/ >/dev/null
"$BUN_PATH" scripts/check-relay-websocket.ts ws://127.0.0.1:3334/
echo "✅ Web and relay HTTP/WebSocket listeners are reachable"

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

# Rebuild the bleve search index from LMDB if we detected drift earlier.
# This is safe to run with pm2 managing the relay: the reindex script stops
# the relay, runs `./relay/relay --reindex`, then restarts it via pm2.
if [ "$NEEDS_REINDEX" = "true" ]; then
    echo ""
    echo "🔄 Rebuilding search index from LMDB (reindex on startup)..."
    # Give pm2 a moment to finish registering the wavefunc-relay process so
    # reindex-search.sh can cleanly stop/restart it.
    sleep 3
    nohup ./scripts/reindex-search.sh > logs/reindex.log 2>&1 &
    echo "✅ Reindex running in background (PID: $!)"
    echo "   Monitor: tail -f logs/reindex.log"
fi

echo ""
echo "✅ Deployment complete!"
pm2 list
