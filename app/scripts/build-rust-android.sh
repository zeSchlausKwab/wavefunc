#!/usr/bin/env bash
set -euo pipefail

# Build `app/rust` (which wraps `crates/wavefunc-core`) for Android arm64-v8a
# and copy `libwavefunc_bridge.so` into Flutter's Android jniLibs directory.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUST_DIR="$APP_DIR/rust"

NDK_ROOT="${ANDROID_NDK_HOME:-}"
if [[ -z "$NDK_ROOT" ]]; then
  NDK_BASE="$HOME/Library/Android/sdk/ndk"
  if [[ -d "$NDK_BASE" ]]; then
    NDK_ROOT="$(find "$NDK_BASE" -maxdepth 1 -mindepth 1 -type d | sort -V | tail -n 1)"
  fi
fi

if [[ -z "$NDK_ROOT" || ! -d "$NDK_ROOT" ]]; then
  echo "Android NDK not found. Set ANDROID_NDK_HOME." >&2
  exit 1
fi

HOST_TAG="darwin-x86_64"
if [[ -d "$NDK_ROOT/toolchains/llvm/prebuilt/darwin-arm64" ]]; then
  HOST_TAG="darwin-arm64"
elif [[ -d "$NDK_ROOT/toolchains/llvm/prebuilt/linux-x86_64" ]]; then
  HOST_TAG="linux-x86_64"
fi

BIN="$NDK_ROOT/toolchains/llvm/prebuilt/$HOST_TAG/bin"
PROFILE="${1:-release}"

CARGO_FLAGS=()
TARGET_SUBDIR="debug"
if [[ "$PROFILE" == "release" ]]; then
  CARGO_FLAGS+=(--release)
  TARGET_SUBDIR="release"
fi

echo "Building wavefunc_bridge ($PROFILE) for aarch64-linux-android using $NDK_ROOT..."
(
  cd "$RUST_DIR"
  CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$BIN/aarch64-linux-android24-clang" \
  CARGO_TARGET_AARCH64_LINUX_ANDROID_AR="$BIN/llvm-ar" \
  CC_aarch64_linux_android="$BIN/aarch64-linux-android24-clang" \
  AR_aarch64_linux_android="$BIN/llvm-ar" \
  cargo build --target aarch64-linux-android "${CARGO_FLAGS[@]}"
)

OUT_DIR="$APP_DIR/android/app/src/main/jniLibs/arm64-v8a"
mkdir -p "$OUT_DIR"
cp "$RUST_DIR/target/aarch64-linux-android/$TARGET_SUBDIR/libwavefunc_bridge.so" "$OUT_DIR/libwavefunc_bridge.so"
echo "Installed $OUT_DIR/libwavefunc_bridge.so"
