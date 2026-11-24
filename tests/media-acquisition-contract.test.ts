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

  test("implements native desktop yt-dlp and Blossom BUD-02 upload in wavefunc-core", () => {
    const mediaRs = read("crates/wavefunc-core/src/media.rs");
    const forgeSheet = read(
      "app/lib/ui/features/crate/views/media_forge_sheet.dart"
    );

    expect(mediaRs).toContain("pub async fn prepare_youtube_media");
    expect(mediaRs).toContain("pub async fn upload_to_blossom");
    expect(mediaRs).toContain("yt-dlp");
    expect(mediaRs).toContain("X-SHA-256");
    expect(forgeSheet).toContain("MEDIA_FORGE // BLOSSOM BACKUP");
    expect(forgeSheet).toContain("https://blossom.band");
  });

  test("keeps native release artifacts pure MIT without GPL binary bundling", () => {
    const workflow = read(".github/workflows/release.yml");
    const androidBuild = read("app/android/app/build.gradle.kts");

    expect(workflow).not.toContain("youtubedl-android");
    expect(androidBuild).not.toContain("youtubedl-android");
  });
});
