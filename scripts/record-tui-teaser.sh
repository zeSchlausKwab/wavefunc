#!/bin/sh
# Records an authentic 1280x720 WebM + MP4 teaser + PNG poster directly from
# the live wf Bubble Tea UI (macOS CoreText + ffmpeg).
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/public/media"
mkdir -p "${OUT_DIR}"

RENDERER_BIN="$(mktemp /tmp/wf-render-ansi-XXXXXX)"
trap 'rm -f "${RENDERER_BIN}"' EXIT

echo "Compiling CoreText ANSI renderer..."
swiftc -O "${ROOT_DIR}/scripts/render-ansi-video.swift" -o "${RENDERER_BIN}"

echo "Capturing wf frames and encoding WebM + MP4..."
(cd "${ROOT_DIR}/tui" && go run ./cmd/wf-teaser-frames) \
  | "${RENDERER_BIN}" "${OUT_DIR}/wf-teaser-poster.png" 126 \
  | ffmpeg -y -loglevel error \
      -f rawvideo -pix_fmt rgba -s 1280x720 -r 20 -i - \
      -map 0:v -c:v libvpx-vp9 -b:v 0 -crf 28 -deadline good -cpu-used 2 -pix_fmt yuv420p \
        "${OUT_DIR}/wf-teaser.webm" \
      -map 0:v -c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p -movflags +faststart \
        "${OUT_DIR}/wf-teaser.mp4"

ls -lh "${OUT_DIR}/wf-teaser.webm" "${OUT_DIR}/wf-teaser.mp4" "${OUT_DIR}/wf-teaser-poster.png"
echo "Done!"
