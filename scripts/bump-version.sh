#!/usr/bin/env bash
set -euo pipefail

# Bump version across all project files in sync
# Usage: ./scripts/bump-version.sh <new-version>
# Example: ./scripts/bump-version.sh 1.0.0

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 1.0.0"
  exit 1
fi

NEW_VERSION="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Validate semver format
if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
  echo "Error: '$NEW_VERSION' is not a valid semver version"
  exit 1
fi

echo "Bumping version to $NEW_VERSION..."

# 1. package.json
cd "$ROOT"
OLD_PKG_VERSION=$(grep -o '"version": "[^"]*"' package.json | head -1 | cut -d'"' -f4)
sed -i '' "s/\"version\": \"$OLD_PKG_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json
echo "  ✓ package.json: $OLD_PKG_VERSION → $NEW_VERSION"

# 2. src-tauri/tauri.conf.json
OLD_TAURI_VERSION=$(grep -o '"version": "[^"]*"' src-tauri/tauri.conf.json | head -1 | cut -d'"' -f4)
sed -i '' "s/\"version\": \"$OLD_TAURI_VERSION\"/\"version\": \"$NEW_VERSION\"/" src-tauri/tauri.conf.json
echo "  ✓ tauri.conf.json: $OLD_TAURI_VERSION → $NEW_VERSION"

# 3. src-tauri/Cargo.toml
OLD_CARGO_VERSION=$(grep '^version = ' src-tauri/Cargo.toml | head -1 | cut -d'"' -f2)
sed -i '' "s/^version = \"$OLD_CARGO_VERSION\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml
echo "  ✓ Cargo.toml: $OLD_CARGO_VERSION → $NEW_VERSION"

# 4. Android tauri.properties (if exists)
TAURI_PROPS="src-tauri/gen/android/app/tauri.properties"
if [ -f "$TAURI_PROPS" ]; then
  # Calculate versionCode: major*1000000 + minor*1000 + patch
  IFS='.' read -r MAJOR MINOR PATCH <<< "${NEW_VERSION%%-*}"
  VERSION_CODE=$((MAJOR * 1000000 + MINOR * 1000 + PATCH))
  sed -i '' "s/tauri.android.versionName=.*/tauri.android.versionName=$NEW_VERSION/" "$TAURI_PROPS"
  sed -i '' "s/tauri.android.versionCode=.*/tauri.android.versionCode=$VERSION_CODE/" "$TAURI_PROPS"
  echo "  ✓ tauri.properties: versionName=$NEW_VERSION, versionCode=$VERSION_CODE"
fi

echo ""
echo "Done! Version bumped to $NEW_VERSION across all files."
echo ""
echo "Next steps:"
echo "  git add -A && git commit -m 'chore: bump version to $NEW_VERSION'"
echo "  git tag v$NEW_VERSION"
echo "  git push origin main --tags"
