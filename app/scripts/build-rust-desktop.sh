#!/usr/bin/env bash
set -euo pipefail

# Build the native Rust wavefunc_bridge dynamic library for the current desktop OS.
# Usage: ./app/scripts/build-rust-desktop.sh [debug|release]

PROFILE="${1:-release}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
RUST_DIR="${APP_DIR}/rust"

CARGO_ARGS=(build --manifest-path "${RUST_DIR}/Cargo.toml")
if [[ "${PROFILE}" == "release" ]]; then
  CARGO_ARGS+=(--release)
fi

OS="$(uname -s)"
echo "Building wavefunc_bridge (${PROFILE}) for ${OS} ($(uname -m))..."
cargo "${CARGO_ARGS[@]}"

case "${OS}" in
  Darwin)
    SRC="${RUST_DIR}/target/${PROFILE}/libwavefunc_bridge.dylib"
    DEST_DIR="${APP_DIR}/macos/Runner/Frameworks"
    mkdir -p "${DEST_DIR}"
    cp -f "${SRC}" "${DEST_DIR}/libwavefunc_bridge.dylib"
    echo "Installed ${DEST_DIR}/libwavefunc_bridge.dylib"
    ;;
  Linux)
    SRC="${RUST_DIR}/target/${PROFILE}/libwavefunc_bridge.so"
    DEST_DIR="${APP_DIR}/linux/lib"
    mkdir -p "${DEST_DIR}"
    cp "${SRC}" "${DEST_DIR}/libwavefunc_bridge.so"
    echo "Installed ${DEST_DIR}/libwavefunc_bridge.so"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    SRC="${RUST_DIR}/target/${PROFILE}/wavefunc_bridge.dll"
    DEST_DIR="${APP_DIR}/windows/lib"
    mkdir -p "${DEST_DIR}"
    cp "${SRC}" "${DEST_DIR}/wavefunc_bridge.dll"
    echo "Installed ${DEST_DIR}/wavefunc_bridge.dll"
    ;;
  *)
    echo "Unsupported desktop OS: ${OS}" >&2
    exit 1
    ;;
esac
