#!/bin/bash

set -euo pipefail

cd "$(dirname "$0")/.."

echo "🔄 Reindexing relay search..."

if command -v pm2 >/dev/null 2>&1; then
  echo "🛑 Stopping wavefunc-relay..."
  pm2 stop wavefunc-relay
else
  echo "⚠️  pm2 not found; continuing without stopping relay"
fi

cleanup() {
  if command -v pm2 >/dev/null 2>&1; then
    echo "▶️  Starting wavefunc-relay..."
    pm2 restart wavefunc-relay
  fi
}

trap cleanup EXIT

if [ -x "./relay/relay" ]; then
  ./relay/relay --reindex
else
  (
    cd relay
    go run . --reindex
  )
fi

echo "✅ Search reindex finished"
