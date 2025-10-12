#!/bin/bash

# Kill any process using port 3334
echo "🔍 Looking for processes on port 3334..."

# Find and kill the process
PID=$(lsof -ti:3334)

if [ -z "$PID" ]; then
  echo "✅ No process found on port 3334"
else
  echo "🔫 Killing process $PID on port 3334..."
  kill -9 $PID
  echo "✅ Process killed"
fi

# Also kill any go run processes that might be stuck
echo "🔍 Looking for go run relay processes..."
pkill -f "go run.*relay" && echo "✅ Killed go run relay processes" || echo "✅ No go run relay processes found"

echo "✅ Cleanup complete!"

