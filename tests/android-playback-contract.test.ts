import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Android playback release contract", () => {
  test("packages a native Media3 playback service", () => {
    const cargo = read("src-tauri/Cargo.toml");
    const pluginCargo = read("src-tauri/plugins/native-player/Cargo.toml");
    const manifest = read(
      "src-tauri/plugins/native-player/android/src/main/AndroidManifest.xml"
    );
    const service = read(
      "src-tauri/plugins/native-player/android/src/main/java/live/wavefunc/player/WavefuncPlaybackService.kt"
    );
    const plugin = read(
      "src-tauri/plugins/native-player/android/src/main/java/live/wavefunc/player/WavefuncPlayerPlugin.kt"
    );

    expect(cargo).toContain("tauri-plugin-wavefunc-player");
    expect(pluginCargo).toContain('links = "tauri-plugin-wavefunc-player"');
    expect(manifest).toContain("android.permission.FOREGROUND_SERVICE");
    expect(manifest).toContain(
      "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"
    );
    expect(manifest).toContain("android.permission.POST_NOTIFICATIONS");
    expect(manifest).toContain("android.permission.WAKE_LOCK");
    expect(manifest).toContain('android:foregroundServiceType="mediaPlayback"');
    expect(service).toContain("MediaSessionService");
    expect(service).toContain("ExoPlayer.Builder");
    expect(service).toContain("setWakeMode(C.WAKE_MODE_NETWORK)");
    expect(plugin).toContain("requestPermissionForAlias");
  });

  test("keeps arbitrary HTTP radio streams playable in release builds", () => {
    const androidBuild = read("src-tauri/android-template/build.gradle.kts");
    const service = read(
      "src-tauri/plugins/native-player/android/src/main/java/live/wavefunc/player/WavefuncPlaybackService.kt"
    );

    expect(androidBuild).toContain(
      'manifestPlaceholders["usesCleartextTraffic"] = "true"'
    );
    expect(androidBuild).toContain(
      'variant.applicationId.set("live.wavefunc.app.debug")'
    );
    expect(service).toContain("setAllowCrossProtocolRedirects(true)");
    expect(service).toContain('"Icy-MetaData" to "1"');
  });

  test("copies the maintained Android toolchain templates in release CI", () => {
    const rootBuild = read("src-tauri/android-template/root-build.gradle.kts");
    const workflow = read(".github/workflows/release.yml");

    expect(rootBuild).toContain("com.android.tools.build:gradle:8.13.2");
    expect(rootBuild).toContain("kotlin-gradle-plugin:2.2.21");
    expect(workflow).toContain(
      "cp src-tauri/android-template/root-build.gradle.kts src-tauri/gen/android/build.gradle.kts"
    );
  });

  test("packages the adaptive icon layers and a device-reachable relay", () => {
    const androidBuild = read("src-tauri/android-template/build.gradle.kts");
    const frontendBuild = read("build.ts");
    const environment = read("src/config/env.ts");
    const platform = read("src/lib/platform.ts");

    expect(androidBuild).toContain("syncWavefuncIcons");
    expect(androidBuild).toContain('from(file("../../../icons/android"))');
    expect(frontendBuild).toContain(
      '"process.env.RELAY_URL": definedRelayUrl'
    );
    expect(frontendBuild).toContain("isLoopbackRelayUrl");
    expect(frontendBuild).not.toContain(
      'JSON.stringify(process.env.RELAY_URL || "ws://localhost:3334")'
    );
    expect(platform).toContain("__TAURI_INTERNALS__");
    expect(platform).toContain('runtime.location.hostname === "tauri.localhost"');
    expect(environment).toContain('return "wss://relay.wavefunc.live"');
  });

  test("keeps tappable web content outside Android system bars", () => {
    const androidBuild = read("src-tauri/android-template/build.gradle.kts");
    const activity = read("src-tauri/android-template/MainActivity.kt");

    expect(androidBuild).toContain("syncWavefuncMainActivity");
    expect(activity).toContain("WindowInsetsCompat.Type.systemBars()");
    expect(activity).toContain("WindowInsetsCompat.Type.displayCutout()");
    expect(activity).toContain("ViewCompat.setOnApplyWindowInsetsListener");
    expect(activity).toContain("WindowInsetsCompat.CONSUMED");
  });

  test("routes Android playback and live metadata through the native backend", () => {
    const bridge = read("src/lib/nativePlayback.ts");
    const store = read("src/stores/playerStore.ts");
    const mobile = read("src-tauri/plugins/native-player/src/mobile.rs");
    const permissions = read(
      "src-tauri/plugins/native-player/permissions/default.toml"
    );

    expect(bridge).toContain('"plugin:wavefunc-player|play"');
    expect(bridge).toContain('"plugin:wavefunc-player|update_metadata"');
    expect(bridge).toContain("addPluginListener");
    expect(store).toContain("nativePlayback");
    expect(mobile).toContain('"registerListener"');
    expect(mobile).toContain("RegisterListenerRequest { event, handler }");
    expect(permissions).toContain('"allow-register-listener"');
    expect(permissions).toContain('"allow-remove-listener"');
    expect(mobile).not.toContain("compile_error!");
  });
});
