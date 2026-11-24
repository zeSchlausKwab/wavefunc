import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Android playback release contract", () => {
  test("packages a native foreground media playback service", () => {
    const manifest = read("app/android/app/src/main/AndroidManifest.xml");
    const pubspec = read("app/pubspec.yaml");

    expect(pubspec).toContain("audio_service:");
    expect(pubspec).toContain("just_audio:");
    expect(manifest).toContain("android.permission.FOREGROUND_SERVICE");
    expect(manifest).toContain(
      "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"
    );
    expect(manifest).toContain("android.permission.POST_NOTIFICATIONS");
    expect(manifest).toContain("android.permission.WAKE_LOCK");
    expect(manifest).toContain('android:foregroundServiceType="mediaPlayback"');
    expect(manifest).toContain("com.ryanheise.audioservice.AudioService");
    expect(manifest).toContain("com.ryanheise.audioservice.MediaButtonReceiver");
  });

  test("keeps arbitrary HTTP radio streams playable in Android and macOS release builds", () => {
    const manifest = read("app/android/app/src/main/AndroidManifest.xml");
    const androidBuild = read("app/android/app/build.gradle.kts");
    const macPlist = read("app/macos/Runner/Info.plist");

    expect(manifest).toContain('android:usesCleartextTraffic="true"');
    expect(androidBuild).toContain('applicationId = "live.wavefunc.app"');
    expect(androidBuild).toContain('rootProject.file("keystore.properties")');
    expect(macPlist).toContain("<key>NSAllowsArbitraryLoads</key>");
    expect(macPlist).toContain("<true/>");
  });

  test("builds native Rust + Flutter release artifacts in GitHub Actions", () => {
    const release = read(".github/workflows/release.yml");
    const checks = read(".github/workflows/checks.yml");

    expect(release).toContain("cargo ndk");
    expect(release).toContain("flutter build apk --release");
    expect(release).toContain("flutter build macos --release");
    expect(release).toContain("flutter build linux --release");
    expect(release).toContain("flutter build windows --release");
    expect(release).toContain("ANDROID_KEYSTORE_BASE64");
    expect(checks).toContain("cargo test --manifest-path crates/wavefunc-core/Cargo.toml");
    expect(checks).toContain("flutter analyze");
    expect(checks).toContain("flutter test");
  });

  test("packages the adaptive icon layers and a device-reachable relay", () => {
    const manifest = read("app/android/app/src/main/AndroidManifest.xml");
    const adaptiveIcon = read(
      "app/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml"
    );
    const frontendBuild = read("build.ts");
    const environment = read("src/config/env.ts");

    expect(manifest).toContain('android:icon="@mipmap/ic_launcher"');
    expect(manifest).toContain('android:roundIcon="@mipmap/ic_launcher_round"');
    expect(adaptiveIcon).toContain("ic_launcher_background");
    expect(adaptiveIcon).toContain("ic_launcher_foreground");
    expect(
      existsSync(
        join(
          root,
          "app/android/app/src/main/res/drawable-xxxhdpi/ic_launcher_foreground.png"
        )
      )
    ).toBe(true);
    expect(frontendBuild).toContain('"process.env.RELAY_URL": definedRelayUrl');
    expect(frontendBuild).toContain("isLoopbackRelayUrl");
    expect(frontendBuild).not.toContain(
      'JSON.stringify(process.env.RELAY_URL || "ws://localhost:3334")'
    );
    expect(environment).toContain('return "wss://relay.wavefunc.live"');
  });

  test("configures macOS release entitlements for native Rust FFI and network playback", () => {
    const releaseEntitlements = read("app/macos/Runner/Release.entitlements");
    const podfile = read("app/macos/Podfile");

    expect(releaseEntitlements).toContain(
      "com.apple.security.cs.disable-library-validation"
    );
    expect(releaseEntitlements).toContain("com.apple.security.network.client");
    expect(podfile).toContain("pod 'wavefunc_bridge'");
  });
});
