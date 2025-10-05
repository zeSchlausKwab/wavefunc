# Tauri Setup Guide

## 🎉 Your web app is now a Tauri v2 app!

Your existing React app has been wrapped with Tauri while keeping **100% of your code unchanged**.

## Project Structure

```
wavefunc-rewrite/
├── src/                    # Your React app (unchanged)
├── relay/                  # Go Nostr relay
├── src-tauri/             # NEW: Tauri backend
│   ├── src/
│   │   ├── main.rs        # Rust entry point
│   │   └── lib.rs         # Tauri app logic
│   ├── tauri.conf.json    # Tauri configuration
│   ├── Cargo.toml         # Rust dependencies
│   └── icons/             # App icons (TODO: add real icons)
└── dist/                  # Built web app
```

## Prerequisites

### For Desktop (Mac/Windows/Linux)

- ✅ Bun (already installed)
- ✅ Rust (install from https://rustup.rs)

### For Android

- ✅ Android Studio with NDK
- ✅ Java JDK 17+
- ✅ Android SDK (API 24+)

Install Android prerequisites:

```bash
bunx tauri android init
```

## Running the App

### Desktop Development

```bash
# Run Tauri app in development mode (with hot reload)
bun run tauri:dev
```

This will:

1. Start the Go relay server on port 3334
2. Run database migrations
3. Build your React app to `dist/`
4. Launch Tauri app with dev tools

### Desktop Production Build

```bash
# Build distributable desktop app
bun run tauri:build
```

Creates platform-specific installers in `src-tauri/target/release/bundle/`

### Android Development

```bash
# First time setup
bun run tauri:android

# After setup, just run:
bunx tauri android dev
```

### Android Production Build

```bash
bun run tauri:android:build
```

## What Changed?

### ✅ No Changes to Your Code

- All React components unchanged
- All hooks unchanged
- All styles unchanged
- Build process unchanged

### ✨ What Was Added

1. **src-tauri/** - Tauri backend (Rust)
2. **package.json** - New scripts:
   - `tauri:dev` - Desktop development
   - `tauri:build` - Desktop production
   - `tauri:android` - Android development
   - `tauri:android:build` - Android production
3. **Tauri APIs** - Available in frontend via `@tauri-apps/api`

## Go Relay Integration

### Desktop

The Go relay runs as a separate process (like in web dev mode).

### Mobile (TODO)

For mobile, you have two options:

1. **Remote Relay** (Recommended for now)

   - Connect to a remote relay server
   - Modify relay URL in your NDK config

2. **Bundled Relay** (Future)
   - Compile Go relay as a library
   - Use Tauri sidecar feature
   - Requires CGO for Android/iOS

## Icons

⚠️ **TODO**: Replace placeholder icons in `src-tauri/icons/`

Create a square PNG (1024x1024) and run:

```bash
bunx tauri icon path/to/your/icon.png
```

## Android Configuration

After running `bunx tauri android init`, edit:

- `src-tauri/gen/android/app/src/main/AndroidManifest.xml` - Permissions
- `src-tauri/tauri.conf.json` - App metadata

Required permissions (already in config):

- INTERNET - For Nostr relay connections
- WAKE_LOCK - For audio playback

## Using Tauri APIs in Your React Code

```typescript
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";

// Example: Open URL in system browser
await open("https://example.com");

// Example: Check if running in Tauri
const isTauri = window.__TAURI__ !== undefined;
```

## Development Workflow

### Web (Original)

```bash
bun run dev        # Bun dev server (browser)
```

### Desktop

```bash
bun run tauri:dev  # Tauri desktop app
```

### Android

```bash
bunx tauri android dev  # Android emulator/device
```

## Troubleshooting

### "Failed to build" on first run

Run: `cargo build` in `src-tauri/` to download Rust dependencies

### Blank screen in Tauri

1. Check `dist/` was built: `bun run build`
2. Check console: `Ctrl+Shift+I` (dev tools)

### Relay connection issues

- Desktop: Ensure relay is running on `localhost:3334`
- Android: Use remote relay or configure network security

### Android build fails

1. Run `bunx tauri android init` first
2. Ensure Android Studio is installed
3. Check `ANDROID_HOME` environment variable

## Next Steps

1. **Replace icons** - Add real app icons
2. **Test desktop build** - `bun run tauri:build`
3. **Setup Android** - `bunx tauri android init`
4. **Configure relay** - Decide on remote vs bundled relay for mobile
5. **Add mobile optimizations** - Consider touch gestures, responsive layouts
6. **Add routing** - If you want multiple pages (TanStack Router or React Router)
7. **Add state management** - Consider Zustand for global state (player, preferences)

## Resources

- [Tauri v2 Docs](https://v2.tauri.app)
- [Android Guide](https://v2.tauri.app/start/prerequisites/#android)
- [Tauri API Reference](https://v2.tauri.app/reference/javascript/api/)
- [Bun Docs](https://bun.sh/docs)

## Questions?

Check the official Tauri Discord: https://discord.com/invite/tauri
