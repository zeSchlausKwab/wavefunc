# Releasing WaveFunc

## Overview

Releases are triggered by pushing a semver tag (`v*.*.*`) to GitHub. The release workflow builds desktop apps (macOS, Windows, Linux), Android APK, creates a GitHub Release, and uploads all artifacts.

## Steps

### 1. Bump version

```bash
./scripts/bump-version.sh 0.1.2
```

This updates the version in:
- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/gen/android/app/tauri.properties` (versionName + computed versionCode)

### 2. Commit and tag

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: bump version to 0.1.2"
git tag v0.1.2
```

Note: `src-tauri/gen/` is gitignored — the `tauri.properties` change is local only. CI regenerates it via `tauri android init`.

### 3. Push

```bash
git push origin main v0.1.2
```

This triggers:
- **Release workflow** (`.github/workflows/release.yml`) — builds binaries
- **Deploy workflow** (`.github/workflows/deploy.yml`) — deploys web to VPS

### 4. Monitor

```bash
gh run list --limit 3
gh run watch <run-id>
```

Or check https://github.com/zeSchlausKwab/wavefunc/actions

## What the release workflow does

1. **create-release** — creates a draft GitHub Release with auto-generated changelog
2. **build-desktop** (parallel, 3 runners):
   - macOS universal (`.dmg`) on `macos-latest`
   - Windows x64 (`.msi`, `.exe`) on `windows-latest`
   - Linux x64 (`.AppImage`, `.deb`) on `ubuntu-22.04`
3. **build-android**:
   - Runs `tauri android init` (gen/ is gitignored)
   - Regenerates icons from `src-tauri/icons/icon.png`
   - Copies `src-tauri/android-template/build.gradle.kts` (includes signing config)
   - Writes `keystore.properties` from GitHub Secrets
   - Decodes keystore from `ANDROID_KEYSTORE_BASE64` secret
   - Builds signed APK
4. **publish-release** — marks the draft release as published (only runs if all builds pass)

## GitHub Secrets required

| Secret | Purpose |
|--------|---------|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded `wavefunc.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_PASSWORD` | Key password (same as keystore password) |
| `VPS_SSH_KEY` | SSH key for VPS deployment |
| `VPS_HOST` | VPS hostname |
| `VPS_USER` | VPS deploy user |
| `VPS_PATH` | VPS deployment path |
| `DOMAIN` | Production domain |
| `TLS_EMAIL` | TLS certificate email |
| `METADATA_SERVER_KEY` | Nostr metadata server private key |
| `METADATA_SERVER_PUBKEY` | Nostr metadata server public key |
| `METADATA_CLIENT_KEY` | Nostr metadata client key |

## Distribution channels

### GitHub Releases
Primary distribution. All desktop + Android binaries are uploaded as release assets.
- Direct download links: `https://github.com/zeSchlausKwab/wavefunc/releases/latest`

### Zapstore
Nostr-native app store. Published separately after the GitHub release:
- Listing: https://zapstore.dev/apps/live.wavefunc.app
- Publish docs: https://zapstore.dev/docs/publish

### Nsite
Censorship-resistant web hosting via Nostr:
- Tool: https://github.com/sandwichfarm/nsyte

### Web
Auto-deployed to VPS on every push to `main` via the deploy workflow.

## Notes

- Desktop builds are **unsigned** — users must bypass OS warnings on first launch
- Android APK is **self-signed** with the project keystore — not a Play Store build
- The `v0.1.0` tag was retagged multiple times during initial CI setup — avoid retagging in general; prefer a new patch version
- Version code for Android is computed as `major*1000000 + minor*1000 + patch`
