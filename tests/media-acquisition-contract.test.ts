import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("installed-app media acquisition contract", () => {
  test("shares one responsive media dialog between Crate and now playing", () => {
    const crate = read("src/routes/crate.tsx");
    const player = read("src/components/FloatingPlayer.tsx");
    const dialogPath = join(root, "src/components/SongMediaDialog.tsx");

    expect(existsSync(dialogPath)).toBe(true);
    if (!existsSync(dialogPath)) return;
    const dialog = read("src/components/SongMediaDialog.tsx");

    expect(crate).toContain("SongMediaDialog");
    expect(player).toContain("SongMagicButton");
    expect(dialog).toContain("mediaAcquisitionAvailability(platform)");
    expect(dialog).toContain("createInstalledMediaAcquirer()");
    expect(dialog).toContain("ShareSongDialog");
    expect(dialog).toContain("forgeAndFavoriteSong");
    expect(dialog).toContain("addToDefaultList(address)");
    expect(dialog).toContain("setShareSong(persistedSong)");
    expect(dialog).toContain("WAITING_FOR_SIGNER_APPROVAL");
    expect(dialog).toContain('DEFAULT_BLOSSOM_URL = "https://blossom.band"');
    expect(dialog).toContain("grid-cols-2");
    expect(dialog).toContain("break-words");
    expect(dialog).toContain('href="/apps"');
    expect(crate).not.toContain(".PrepareDownload(");
    expect(crate).not.toContain(".UploadToBlossom(");
    expect(crate).not.toContain("VIDEO_FORMATS.map");
  });

  test("ships yt-dlp and a supported JS challenge runtime in desktop releases", () => {
    const config = read("src-tauri/tauri.conf.json");
    const workflow = read(".github/workflows/release.yml");
    const desktop = read("src-tauri/plugins/media-acquisition/src/desktop.rs");

    expect(config).toContain('"resources/bin/*": "bin/"');
    expect(workflow).toContain("Prepare desktop media engine");
    expect(workflow).toContain("yt-dlp_macos");
    expect(workflow).toContain("yt-dlp_linux");
    expect(workflow).toContain("yt-dlp.exe");
    expect(workflow).toContain("deno-aarch64-apple-darwin.zip");
    expect(desktop).toContain("WAVEFUNC_DENO_PATH");
    expect(desktop).toContain('format!("deno:{}"');
  });

  test("keeps Android downloads alive with its embedded native engine", () => {
    const appBuild = read("src-tauri/android-template/build.gradle.kts");
    const build = read(
      "src-tauri/plugins/media-acquisition/android/build.gradle.kts",
    );
    const manifest = read(
      "src-tauri/plugins/media-acquisition/android/src/main/AndroidManifest.xml",
    );
    const plugin = read(
      "src-tauri/plugins/media-acquisition/android/src/main/java/live/wavefunc/media/WavefuncMediaPlugin.kt",
    );

    expect(build).toContain("youtubedl-android:library:0.18.1");
    expect(build).toContain("youtubedl-android:ffmpeg:0.18.1");
    expect(build).toContain('bundledYtDlpVersion = "2026.07.04"');
    expect(build).toContain(
      'bundledYtDlpSha256 = "495be29ff4d9d4e9be7eabdfef225221e5d5282e77f2f505abc6dca80349f3fd"',
    );
    expect(build).toContain("prepareBundledYtDlp");
    expect(build).toContain("prepareYoutubedlAndroidLicense");
    expect(build).toContain(
      "raw.githubusercontent.com/yausername/youtubedl-android/0.18.1/LICENSE",
    );
    expect(manifest).toContain("android.permission.FOREGROUND_SERVICE_DATA_SYNC");
    expect(manifest).toContain('android:foregroundServiceType="dataSync"');
    expect(manifest).toContain('android:extractNativeLibs="true"');
    expect(appBuild).toContain("jniLibs.useLegacyPackaging = true");
    expect(plugin).toContain("YoutubeDL.execute(request, jobId)");
    expect(plugin).toContain("fun status(invoke: Invoke)");
    expect(plugin).toContain('response.put("state", "prepared")');
    expect(plugin).toContain("preparingJobs");
    expect(plugin).toContain("YoutubeDL.UpdateChannel.STABLE");
    expect(plugin).toContain("refreshYtDlpIfNeeded");
    expect(plugin).toContain('message.contains("HTTP Error 403")');
    expect(plugin).toContain('"360p" -> videoFormatSelector(360)');
    expect(plugin).toContain(
      "bestvideo[height<=$height][ext=mp4]+bestaudio[ext=m4a]",
    );
    expect(plugin).toContain("X-SHA-256");
    expect(plugin).toContain("Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING");
  });

  test("publishes the Android downloader license and corresponding source", () => {
    const workflow = read(".github/workflows/release.yml");

    expect(workflow).toContain("youtubedl-android-0.18.1-source.tar.gz");
    expect(workflow).toContain("GPL-3.0-youtubedl-android.txt");
    expect(workflow).toContain(
      "08833449d671142c34325203cbfcca31c4fa668a0c4b8c0c31a2e4354ce11b98",
    );
  });

  test("desktop video downloads use the same split-stream fallback", () => {
    const desktop = read("src-tauri/plugins/media-acquisition/src/desktop.rs");

    expect(desktop).toContain(
      "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]",
    );
    expect(desktop).toContain("bestvideo[height<=720]+bestaudio");
  });
});
