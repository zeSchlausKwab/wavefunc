import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("installed-app media acquisition contract", () => {
  test("links web backup actions to the apps download page", () => {
    for (const path of ["src/routes/crate.tsx", "src/components/FloatingPlayer.tsx", "src/components/MusicBrainzSearch.tsx"]) {
      expect(read(path)).toContain("<BackupAppLink");
    }
    expect(read("src/components/BackupAppLink.tsx")).toContain('to="/apps"');
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
