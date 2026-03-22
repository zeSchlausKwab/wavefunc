#!/bin/bash

# Cleanup function to kill all background processes
cleanup() {
  echo ""
  echo "🛑 Shutting down..."
  
  # Kill all child processes
  pkill -P $$
  
  # Kill specific processes
  pkill -f "go run.*relay"
  pkill -f "bun.*contextvm"
  pkill -f "bun --hot"
  
  # Kill process on port 3334
  lsof -ti:3334 | xargs kill -9 2>/dev/null
  
  echo "✅ Cleanup complete"
  exit 0
}

# Set trap to call cleanup on Ctrl+C or script exit
trap cleanup INT TERM EXIT

echo "🚀 Starting development environment..."
echo "Press Ctrl+C to stop all processes"
echo ""

# Kill any existing processes and wipe database
./scripts/kill-relay.sh

# Start relay in background
echo "📡 Starting relay..."
cd relay && go run . --port 3334 &
RELAY_PID=$!

# Wait for relay to start
sleep 2

# Run migration (pass count as first arg, default 100)
MIGRATE_COUNT="${1:-100}"
echo "🔄 Running migration ($MIGRATE_COUNT stations)..."
bun run scripts/migrate_legacy.ts "$MIGRATE_COUNT"

# Start ContextVM in background
echo "🤖 Starting ContextVM..."
bun run contextvm/server.ts &
CONTEXTVM_PID=$!

# Start frontend (this will stay in foreground)
echo "⚛️  Starting frontend..."
bun --hot src/index.tsx

# If we get here, frontend was stopped
cleanup

