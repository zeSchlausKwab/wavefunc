# WaveFunc Open Source Release Checklist

## 1. Legal & Project Basics

- [x] **LICENSE file** — MIT license created
- [x] **Fix author in `src-tauri/Cargo.toml`** — updated to "Schlaus Kwab", added license field
- [x] **CHANGELOG.md** — initial version created
- [ ] **CONTRIBUTING.md** — contribution guidelines
- [ ] **SECURITY.md** — vulnerability reporting process

## 2. Icons & Assets

- [x] **Regenerate all Tauri icon variants** from `base_assets/square_logo_color.svg`
- [x] **Favicon** — updated `favicon.svg` and `favicon.ico` in `src/` and `public/`
- [ ] **OG/social images** — for link previews (web)
- [ ] **Screenshots** — for README and download page

## 3. `/apps` Download Page

- [x] **Create download/apps page** — platform detection, GitHub Releases links, Zapstore + source links
- [x] **Add route** — `/apps` route + nav link in both mobile and desktop nav

## 4. Versioning & Release Pipeline

- [x] **Version bump strategy** — starting at `0.1.0`
- [x] **Version sync script** — `scripts/bump-version.sh` bumps all version files in sync
- [x] **GitHub Actions: Release workflow** — builds desktop + Android, creates GitHub Release
- [ ] **Tauri updater** — configure auto-update endpoint so desktop apps can self-update

## 5. Desktop Apps (direct download, unsigned)

- [ ] **macOS** — `.dmg` direct download (users right-click → Open to bypass Gatekeeper)
- [ ] **Windows** — `.msi`/`.exe` direct download (users click "More info" → "Run anyway" for SmartScreen)
- [ ] **Linux** — `.AppImage` and/or `.deb` direct download
- [ ] **Test all three platforms** end-to-end before release

## 6. Android App (direct APK download)

- [ ] **Signed release APK** — self-signed via existing keystore, distributed as direct download
- [ ] **Keystore in CI** — base64-encode `src-tauri/keystore/wavefunc.keystore` and add to GitHub Secrets
- [ ] **Test on real devices** (phone + Android TV since leanback is configured)

## 7. Web / PWA

- [x] **`manifest.json`** — PWA manifest with name, icons, theme color, standalone display
- [ ] **Service worker** — offline support / caching
- [x] **Meta tags** — theme-color, apple-touch-icon, OG tags in `src/index.html`

## 8. Distribution Channels

- [ ] **GitHub Releases** — primary distribution for all platform binaries
- [ ] **Zapstore publish** — follow [zapstore.dev/docs/publish](https://zapstore.dev/docs/publish), create app listing with Nostr event
- [ ] **Nsite publish** — deploy web version via [nsyte](https://github.com/sandwichfarm/nsyte) for censorship-resistant hosting

## 9. Pre-Release Polish

- [ ] **Update README** — add badges, screenshots, download links, platform support matrix
- [x] **Clean up git** — added `scripts/youtube_cookies*.txt` to `.gitignore`
- [ ] **Audit `.env.example`** — make sure no real keys are committed
- [ ] **Update STATUS.md** — currently dated October 2025

---

## Priority Order

**Done:** ~~LICENSE~~, ~~icons~~, ~~release workflow~~, ~~version bump script~~, ~~gitignore~~, ~~CHANGELOG~~, ~~download page~~, ~~PWA manifest~~, ~~meta tags~~
**Do next:** Keystore in CI, tag v0.1.0 to test release workflow
**Do after:** Zapstore publish, nsite publish, README update
**Do last:** Screenshots, OG images, CONTRIBUTING.md, SECURITY.md, service worker, Tauri auto-updater
