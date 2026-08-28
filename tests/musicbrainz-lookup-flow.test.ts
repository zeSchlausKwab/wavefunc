import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("MusicBrainz lookup workflow", () => {
  test("connects catalog recordings to the shared favorite and media forge flows", () => {
    const search = read("src/components/MusicBrainzSearch.tsx");

    expect(search).toContain("recordingToSongMetadata(recording)");
    expect(search).toContain("<SongFavoriteButton");
    expect(search).toContain("<SongMagicButton");
    expect(search).toContain("metadata={metadata}");
    expect(search).toContain("showLabel");
    expect(search).not.toContain("console.log");
  });

  test("supports a real route and now-playing deep link", () => {
    const route = read("src/routes/musicbrainz.tsx");
    const player = read("src/components/FloatingPlayer.tsx");

    expect(route).toContain('createFileRoute("/musicbrainz")');
    expect(route).toContain("validateSearch");
    expect(route).toContain(
      "<MusicBrainzSearch initialQuery={q} initialArtist={artist} />",
    );
    expect(route).toContain(
      'artist: typeof search.artist === "string" ? search.artist : undefined',
    );
    expect(player).toContain("q: currentMetadata.song");
    expect(player).toContain("artist: currentMetadata.artist || undefined");
    expect(player).not.toContain("triggerMusicBrainzSearch(query)");
  });

  test("does not leave the catalog in an endless skeleton state", () => {
    const search = read("src/components/MusicBrainzSearch.tsx");

    expect(search).toContain("withCatalogTimeout");
    expect(search).toContain("CATALOG_TIMEOUT_MS");
    expect(search).toContain("requestId.current");
    expect(search).toContain('setReleaseFilter("")');
    expect(search).toContain('setCountryFilter("")');
    expect(search).toContain("LOOKUP_INTERRUPTED");
    expect(search).toContain("SearchSkeleton");
  });

  test("uses WaveFunc's mobile-first visual and interaction language", () => {
    const route = read("src/routes/musicbrainz.tsx");
    const search = read("src/components/MusicBrainzSearch.tsx");

    expect(route).toContain("SONG_LOOKUP");
    expect(route).toContain("FORGE_TO_BLOSSOM");
    expect(search).toContain("border-4 border-on-background");
    expect(search).toContain("min-h-12");
    expect(search).toContain("MORE_FILTERS");
    expect(search).toContain("METADATA_BY_MUSICBRAINZ");
    expect(search).not.toContain("bg-blue-");
    expect(search).not.toContain("dark:");
  });

  test("keeps one implementation of the labels endpoint", () => {
    const tool = read("contextvm/tools/musicbrainz.ts");
    expect(tool.match(/export async function searchLabels/g)).toHaveLength(1);
  });
});
