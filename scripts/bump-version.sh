#!/usr/bin/env bash
set -euo pipefail

# Bump version across web + native Rust + Flutter app in sync
# Usage: ./scripts/bump-version.sh <new-version>
# Example: ./scripts/bump-version.sh 1.0.0

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 1.0.0"
  exit 1
fi

NEW_VERSION="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
  echo "Error: '$NEW_VERSION' is not a valid semver version"
  exit 1
fi

IFS='.' read -r MAJOR MINOR PATCH <<< "${NEW_VERSION%%-*}"
VERSION_CODE=$((MAJOR * 1000000 + MINOR * 1000 + PATCH))

echo "Bumping version to $NEW_VERSION (build $VERSION_CODE)..."

cd "$ROOT"

# 1. package.json
OLD_PKG_VERSION=$(grep -o '"version": "[^"]*"' package.json | head -1 | cut -d'"' -f4)
sed -i '' "s/\"version\": \"$OLD_PKG_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json
echo "  ✓ package.json: $OLD_PKG_VERSION → $NEW_VERSION"

# 2. app/pubspec.yaml
OLD_PUBSPEC_VERSION=$(grep '^version: ' app/pubspec.yaml | head -1 | awk '{print $2}')
sed -i '' "s/^version: .*/version: ${NEW_VERSION}+${VERSION_CODE}/" app/pubspec.yaml
echo "  ✓ app/pubspec.yaml: $OLD_PUBSPEC_VERSION → ${NEW_VERSION}+${VERSION_CODE}"

# 3. crates/wavefunc-core/Cargo.toml & app/rust/Cargo.toml
for cargo_file in crates/wavefunc-core/Cargo.toml app/rust/Cargo.toml; do
  OLD_CARGO=$(grep '^version = ' "$cargo_file" | head -1 | cut -d'"' -f2)
  sed -i '' "s/^version = \"$OLD_CARGO\"/version = \"$NEW_VERSION\"/" "$cargo_file"
  echo "  ✓ $cargo_file: $OLD_CARGO → $NEW_VERSION"
done

echo ""
echo "Done! Version bumped to $NEW_VERSION across all packages."
echo ""
echo "Next steps:"
echo "  git add -A && git commit -m 'chore: bump version to $NEW_VERSION'"
echo "  git tag v$NEW_VERSION"
echo "  git push origin main --tags"
