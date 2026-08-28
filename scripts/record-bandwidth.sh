#!/bin/sh

# Record cumulative host interface counters without requiring root. Hourly
# samples make provider billing spikes attributable even when WebSocket frame
# bytes are absent from reverse-proxy access logs.
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
app_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
log_dir="$app_dir/logs"
log_file="$log_dir/bandwidth.log"

mkdir -p "$log_dir"

interface=$(awk 'NR > 1 && $2 == "00000000" { print $1; exit }' /proc/net/route 2>/dev/null || true)

if [ -z "$interface" ] || [ ! -d "/sys/class/net/$interface" ]; then
  printf '%s status=no-default-interface\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$log_file"
  exit 1
fi

rx_file="/sys/class/net/$interface/statistics/rx_bytes"
tx_file="/sys/class/net/$interface/statistics/tx_bytes"
rx_bytes=$(cat "$rx_file")
tx_bytes=$(cat "$tx_file")

case "$rx_bytes:$tx_bytes" in
  *[!0-9:]*|:*)
    printf '%s status=invalid-counter interface=%s\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$interface" >> "$log_file"
    exit 1
    ;;
esac

printf '%s interface=%s rx_bytes=%s tx_bytes=%s\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$interface" "$rx_bytes" "$tx_bytes" >> "$log_file"
