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

**Important**: Set the NDK environment variable in your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/29.0.14206865"  # or your NDK version
export PATH="$PATH:$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/darwin-x86_64/bin"
```

Then reload: `source ~/.zshrc` (or restart terminal)

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
# Complete workflow: build, install, launch, and show logs
bun run tauri:android
```

This command will:
1. Build the frontend
2. Compile the Rust library for Android
3. Build the APK
4. Install it on your connected device/emulator
5. Launch the app
6. Stream logs (press Ctrl+C to stop logging)

**Alternative - Build only (no auto-install):**
```bash
bun run tauri:android:build-only
```

**Manual install after build:**
```bash
adb install src-tauri/gen/android/app/build/outputs/apk/arm64/debug/app-arm64-debug.apk
adb shell am start -n com.wavefunc.app/.MainActivity
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

### Important: Tauri Detection in Development

The `useTauri()` hook checks for `window.__TAURI__` to detect if running in Tauri.

**This will NOT work when using `bun dev`** (the regular web dev server). The `__TAURI__` global is only injected when:

- Running `bun run tauri:dev` (desktop Tauri app)
- Running `bunx tauri android dev` (Android Tauri app)
- Using the built app (`bun run tauri:build`)

If you need to test Tauri-specific features during development, use `bun run tauri:dev` instead of `bun dev`.

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

### Android build fails with "can't find crate for `core`"

This usually means you're using Homebrew's Rust instead of rustup's Rust.

**Check which Rust you're using:**
```bash
which rustc
# If it shows /opt/homebrew/bin/rustc, that's the problem
```

**Solution 1: Prioritize rustup's Rust in PATH**

Add this to the **beginning** of your `~/.zshrc`:
```bash
# Put rustup's Rust before Homebrew in PATH
export PATH="$HOME/.cargo/bin:$PATH"
```

Then reload: `source ~/.zshrc`

**Solution 2: Use rustup to override Homebrew**
```bash
rustup default stable
```

**Verify the fix:**
```bash
which rustc
# Should show: /Users/schlaus/.cargo/bin/rustc (not /opt/homebrew/bin/rustc)
```

You also need the NDK configured. Create `.cargo/config.toml` in your project root:

```toml
# .cargo/config.toml
[target.aarch64-linux-android]
ar = "/Users/schlaus/Library/Android/sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-ar"
linker = "/Users/schlaus/Library/Android/sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/darwin-x86_64/bin/aarch64-linux-android24-clang"

[target.armv7-linux-androideabi]
ar = "/Users/schlaus/Library/Android/sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-ar"
linker = "/Users/schlaus/Library/Android/sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/darwin-x86_64/bin/armv7a-linux-androideabi24-clang"

[target.i686-linux-android]
ar = "/Users/schlaus/Library/Android/sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-ar"
linker = "/Users/schlaus/Library/Android/sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/darwin-x86_64/bin/i686-linux-android24-clang"

[target.x86_64-linux-android]
ar = "/Users/schlaus/Library/Android/sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-ar"
linker = "/Users/schlaus/Library/Android/sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/darwin-x86_64/bin/x86_64-linux-android24-clang"
```

(This file has already been created for you)

### Other Android build issues

1. Run `bunx tauri android init` first
2. Ensure Android Studio is installed
3. Check `ANDROID_HOME` environment variable is set
4. Verify NDK is installed: `ls "$ANDROID_HOME/ndk"`

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
