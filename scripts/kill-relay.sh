#!/bin/bash
set -euo pipefail
RELAY_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../relay" && pwd -P)"
REPO_DIR="$(dirname -- "$RELAY_DIR")"
command -v lsof >/dev/null
PORT="${1:-3334}"
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo "Invalid relay port" >&2; exit 1; }
PIDS="$(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN || true)"
if [[ -z "$PIDS" ]]; then
  echo "No relay is listening on port $PORT. Data preserved."
  exit 0
fi

# Validate every listener before signalling any of them. Never kill an arbitrary
# port owner, a client connected to that port, or another checkout's Go process.
for pid in $PIDS; do
  cwd="$(lsof -a -p "$pid" -d cwd -Fn | sed -n 's/^n//p')"
  executable="$(ps -p "$pid" -o comm=)"
  if [[ ( "$cwd" != "$RELAY_DIR" && "$cwd" != "$REPO_DIR" ) || "${executable##*/}" != "wavefunc-relay" ]]; then
    echo "Refusing to stop PID $pid: it is not this checkout's wavefunc-relay. Stop it from its terminal." >&2
    exit 1
  fi
done
kill -TERM $PIDS
for ((attempt=0; attempt<50; attempt++)); do
  remaining=false
  for pid in $PIDS; do
    if kill -0 "$pid" 2>/dev/null; then remaining=true; fi
  done
  if [[ "$remaining" == false ]]; then
    echo "Relay stopped. Data preserved; relay:reset explicitly clears it."
    exit 0
  fi
  sleep 0.1
done
echo "Relay has not exited; refusing to reset its data while it may still be running." >&2
exit 1
