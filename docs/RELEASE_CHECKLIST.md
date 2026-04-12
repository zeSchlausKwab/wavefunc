# WaveFunc Open Source Release Checklist

## 1. Legal & Project Basics

- [x] **LICENSE file** — MIT license created
- [x] **Fix author in `src-tauri/Cargo.toml`** — updated to "Schlaus Kwab", added license field
- [x] **CHANGELOG.md** — initial version created
- [ ] **CONTRIBUTING.md** — contribution guidelines
- [ ] **SECURITY.md** — vulnerability reporting process

## 2. Icons & Assets

- [x] **Regenerate all Tauri icon variants** from `base_assets/square_logo_color.svg`:
  - macOS `.icns`
  - Windows `.ico`
  - Linux PNGs (32, 64, 128, 128@2x)
  - Android mipmaps (hdpi through xxxhdpi, foreground, round)
  - iOS AppIcon variants (18 sizes)
  - Windows Store logos (Square30 through Square310)
- [x] **Favicon** — updated `favicon.svg` and `favicon.ico` in `src/` and `public/`
- [ ] **OG/social images** — for link previews (web)
- [ ] **Screenshots** — for stores, README, and download page

## 3. `/apps` or `/download` Page Route

- [ ] **Create download/apps page** in the frontend with:
  - Platform detection (show relevant download first)
  - Download links for each platform binary (from GitHub Releases)
  - Web app link
  - Zapstore link
  - F-Droid link (if applicable)
  - QR code for mobile
- [ ] **Add route** in the app router

## 4. Versioning & Release Pipeline

- [ ] **Version bump strategy** — decide on semver approach, `0.1.0` → `1.0.0`?
- [x] **Version sync script** — `scripts/bump-version.sh` bumps all version files in sync
- [x] **GitHub Actions: Release workflow** (`.github/workflows/release.yml`):
  - Trigger on version tag push (`v*.*.*`)
  - Build desktop binaries (macOS universal, Windows x64, Linux x64/arm64)
  - Build Android APK/AAB
  - Code signing (macOS notarization, Windows signing, Android keystore)
  - Create GitHub Release with all artifacts
  - Auto-generate changelog from commits
- [ ] **Tauri updater** — configure auto-update endpoint so desktop apps can self-update

## 5. Desktop Apps

- [ ] **macOS** — code signing certificate + notarization (Apple Developer account)
- [ ] **Windows** — code signing certificate (or accept SmartScreen warnings initially)
- [ ] **Linux** — AppImage and/or `.deb` builds (Tauri supports both)
- [ ] **Test all three platforms** end-to-end before release

## 6. Android App

- [ ] **Keystore security** — backup `src-tauri/keystore/wavefunc.keystore`, store credentials in CI secrets
- [ ] **App store metadata** — description, screenshots, categories, privacy policy
- [ ] **Signed release APK** in CI pipeline
- [ ] **Test on real devices** (phone + Android TV since leanback is configured)

## 7. Web / PWA

- [ ] **`manifest.json`** — PWA manifest for installability (name, icons, theme color, display mode)
- [ ] **Service worker** — offline support / caching
- [ ] **Meta tags** — `theme-color`, `apple-touch-icon`, OG tags in `src/index.html`

## 8. Distribution Channels

- [ ] **Zapstore publish** — follow [zapstore.dev/docs/publish](https://zapstore.dev/docs/publish), create app listing with Nostr event
- [ ] **Nsite publish** — deploy web version via [nsyte](https://github.com/sandwichfarm/nsyte) for censorship-resistant hosting
- [ ] **F-Droid** — optional, requires reproducible builds and metadata in Fastlane format
- [ ] **GitHub Releases** — primary distribution for desktop + Android binaries

## 9. Pre-Release Polish

- [ ] **Update README** — add badges, screenshots, download links, platform support matrix
- [x] **Clean up git** — added `scripts/youtube_cookies*.txt` to `.gitignore`
- [ ] **Audit `.env.example`** — make sure no real keys are committed
- [ ] **Update STATUS.md** — currently dated October 2025

---

## Priority Order

**Done:** ~~LICENSE~~, ~~icons~~, ~~GitHub Release workflow~~, ~~version bump script~~, ~~gitignore cleanup~~, ~~CHANGELOG~~
**Do next (core):** Version bump strategy, download page, Tauri updater
**Do third (distribution):** Zapstore, nsite, PWA manifest
**Do last (polish):** Screenshots, CONTRIBUTING.md, SECURITY.md, F-Droid, auto-updater
