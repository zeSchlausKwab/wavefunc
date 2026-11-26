#!/bin/sh
# WaveFunc Radio Terminal UI (wf) installer
# Usage: curl -fsSL https://wavefunc.live/install.sh | sh

set -eu

REPO="${WF_REPO:-zeSchlausKwab/wavefunc}"
BIN_NAME="wf"

say() {
  printf '%s\n' "$*"
}

err() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || err "required command not found: $1"
}

detect_os() {
  case "$(uname -s)" in
    Darwin) echo "darwin" ;;
    Linux) echo "linux" ;;
    *) err "unsupported OS: $(uname -s). Download Windows binaries from https://github.com/${REPO}/releases/latest" ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "amd64" ;;
    arm64|aarch64) echo "arm64" ;;
    *) err "unsupported architecture: $(uname -m)" ;;
  esac
}

resolve_version() {
  if [ -n "${WF_VERSION:-}" ]; then
    echo "${WF_VERSION#v}"
    return
  fi
  tag="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' \
    | head -n 1)"
  [ -n "$tag" ] || err "could not determine latest release tag from GitHub"
  echo "${tag#v}"
}

verify_sha256() {
  file="$1"
  expected="$2"
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$file" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$file" | awk '{print $1}')"
  else
    say "warning: neither sha256sum nor shasum found; skipping checksum verification"
    return 0
  fi
  [ "$actual" = "$expected" ] || err "checksum mismatch for $(basename "$file") (expected $expected, got $actual)"
}

pick_install_dir() {
  if [ -n "${WF_INSTALL_DIR:-}" ]; then
    echo "$WF_INSTALL_DIR"
    return
  fi
  if [ -d "/usr/local/bin" ] && [ -w "/usr/local/bin" ]; then
    echo "/usr/local/bin"
    return
  fi
  echo "${HOME}/.local/bin"
}

main() {
  need_cmd curl
  need_cmd tar

  os="$(detect_os)"
  arch="$(detect_arch)"
  version="$(resolve_version)"
  tag="v${version}"

  archive="${BIN_NAME}_${version}_${os}_${arch}.tar.gz"
  base_url="https://github.com/${REPO}/releases/download/${tag}"

  tmpdir="$(mktemp -d 2>/dev/null || mktemp -d -t wf-install)"
  trap 'rm -rf "$tmpdir"' EXIT

  say "((●)) Installing WaveFunc Terminal (${BIN_NAME} ${tag}) for ${os}/${arch}..."

  curl -fsSL --retry 3 "${base_url}/${archive}" -o "${tmpdir}/${archive}" \
    || err "failed to download ${base_url}/${archive}"

  if curl -fsSL --retry 2 "${base_url}/wf_checksums.txt" -o "${tmpdir}/wf_checksums.txt"; then
    expected="$(grep " ${archive}\$" "${tmpdir}/wf_checksums.txt" | awk '{print $1}' | head -n 1 || true)"
    if [ -n "$expected" ]; then
      verify_sha256 "${tmpdir}/${archive}" "$expected"
      say "  ✓ SHA-256 verified"
    fi
  fi

  tar -xzf "${tmpdir}/${archive}" -C "$tmpdir"
  [ -f "${tmpdir}/${BIN_NAME}" ] || err "archive did not contain ${BIN_NAME}"

  install_dir="$(pick_install_dir)"
  mkdir -p "$install_dir"
  mv "${tmpdir}/${BIN_NAME}" "${install_dir}/${BIN_NAME}"
  chmod +x "${install_dir}/${BIN_NAME}"

  say "  ✓ Installed to ${install_dir}/${BIN_NAME}"

  # Check PATH
  case ":${PATH}:" in
    *":${install_dir}:"*) ;;
    *)
      say ""
      say "  Note: ${install_dir} is not in your PATH yet. Add it with:"
      say "    export PATH=\"${install_dir}:\$PATH\""
      ;;
  esac

  # Check audio backend
  say ""
  if command -v mpv >/dev/null 2>&1; then
    say "  ✓ Audio backend ready: mpv"
  elif command -v ffplay >/dev/null 2>&1; then
    say "  ✓ Audio backend ready: ffplay (tip: install mpv for instant live volume/pause)"
  elif command -v cvlc >/dev/null 2>&1 || command -v vlc >/dev/null 2>&1; then
    say "  ✓ Audio backend ready: vlc"
  else
    say "  ⚠ No audio backend found yet. Install mpv to start listening:"
    if [ "$os" = "darwin" ]; then
      say "    brew install mpv"
    else
      say "    sudo apt install mpv   # or: pacman -S mpv / dnf install mpv"
    fi
  fi

  say ""
  say "  Run 'wf' to tune in — or 'wf --lucky' for instant radio!"
}

main "$@"
