import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { recordingToSongMetadata } from "../src/lib/musicbrainz";
import type { RecordingResult } from "../src/types/musicbrainz";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("MusicBrainz recording actions", () => {
  test("adapts all useful recording metadata into a publishable song", () => {
    const recording: RecordingResult = {
      type: "recording",
      id: "a1b2c3",
      score: 98,
      title: "Dreamwaves",
      artist: "Vogel",
      artistId: "artist-1",
      release: "Signals After Dark",
      releaseId: "release-1",
      releaseDate: "2026-08-28",
      duration: 243_000,
      tags: ["synthwave", "electronic"],
    };

    expect(recordingToSongMetadata(recording)).toEqual({
      song: "Dreamwaves",
      artist: "Vogel",
      musicBrainz: {
        id: "a1b2c3",
        title: "Dreamwaves",
        artist: "Vogel",
        release: "Signals After Dark",
        releaseId: "release-1",
        releaseDate: "2026-08-28",
        duration: 243_000,
        tags: ["synthwave", "electronic"],
      },
    });
  });

  test("track action buttons accept explicit metadata without replacing their existing flows", () => {
    const favorite = read("src/components/SongFavoriteButton.tsx");
    const magic = read("src/components/SongMagicButton.tsx");
    const mediaDialog = read("src/components/SongMediaDialog.tsx");
    const favorites = read("src/lib/hooks/useSongFavorites.ts");

    expect(favorite).toContain("metadata?: SongMetadataInput");
    expect(favorite).toContain("showLabel?: boolean");
    expect(favorite).toContain("metadata ?? storeMetadata");
    expect(favorite).toContain("buildSongTemplateFromMetadata(resolvedMetadata)");
    expect(favorite).toContain("await addToDefaultList(address)");
    expect(favorite).toContain('? "SAVED"');
    expect(favorite).toContain(': "FAVORITE"');
    expect(favorite).toContain("busy || favoritesLoading");

    expect(magic).toContain("metadata?: SongMetadataInput");
    expect(magic).toContain("showLabel?: boolean");
    expect(magic).toContain("metadata ?? storeMetadata");
    expect(magic).toContain("SongMediaDialog");
    expect(magic).toContain("metadata={resolvedMetadata}");
    expect(magic).toContain(">FORGE</span>");

    expect(mediaDialog).toContain("!effectiveBlossomUrl || favoritesLoading");
    expect(favorites).toContain('DEFAULT_LIST_ID = "wavefunc-liked-songs"');
    expect(favorites).toContain("if (isLoading)");
  });
});
