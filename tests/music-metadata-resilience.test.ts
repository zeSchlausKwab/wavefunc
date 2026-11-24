import { afterEach, describe, expect, test } from "bun:test";
import {
  buildLuceneClause,
  escapeLuceneTerm,
  getMusicMetadataStats,
  searchRecordings,
  searchRecordingsCombined,
} from "../contextvm/tools/musicbrainz";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Music metadata Lucene escaping & API hopping", () => {
  test("escapeLuceneTerm escapes special Lucene punctuation cleanly", () => {
    expect(escapeLuceneTerm("54-46 Was My Number (Remix)")).toBe(
      "54\\-46 Was My Number \\(Remix\\)"
    );
    expect(escapeLuceneTerm("AC/DC: Back in Black!")).toBe(
      "AC\\/DC\\: Back in Black\\!"
    );
  });

  test("buildLuceneClause quotes multi-word titles and preserves single-word fuzziness", () => {
    expect(buildLuceneClause("recording", "54-46 Was My Number")).toBe(
      'recording:"54\\-46 Was My Number"~2'
    );
    expect(buildLuceneClause("artist", "Kraftwerk")).toBe("artist:Kraftwerk~1");
    expect(buildLuceneClause("artist", "U2")).toBe("artist:U2");
  });

  test("hops from MusicBrainz 503 to Deezer and caches subsequent lookups", async () => {
    const calledHosts: string[] = [];

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      );
      calledHosts.push(url.hostname);

      if (url.hostname === "musicbrainz.org") {
        return new Response("Service Unavailable", {
          status: 503,
          headers: { "Retry-After": "0" },
        });
      }

      if (url.hostname === "api.deezer.com") {
        return Response.json({
          data: [
            {
              id: 123456,
              title: "54-46 Was My Number",
              duration: 201,
              artist: { id: 99, name: "Toots & The Maytals" },
              album: { id: 77, title: "400% Dynamite!" },
            },
          ],
        });
      }

      return new Response("Unexpected host", { status: 500 });
    }) as typeof fetch;

    const first = await searchRecordings("54-46 Was My Number", undefined, 5);
    expect(first).toHaveLength(1);
    expect(first[0]?.id).toBe("deezer:123456");
    expect(first[0]?.title).toBe("54-46 Was My Number");
    expect(first[0]?.artist).toBe("Toots & The Maytals");
    expect(first[0]?.duration).toBe(201000);
    expect(calledHosts).toContain("api.deezer.com");

    // Circuit breaker should now be active after MB 503
    expect(getMusicMetadataStats().musicBrainzCooldownMs).toBeGreaterThan(0);

    // Second identical call should come straight from the LRU cache with zero extra fetches
    const callsBefore = calledHosts.length;
    const second = await searchRecordings("54-46 Was My Number", undefined, 5);
    expect(second).toEqual(first);
    expect(calledHosts.length).toBe(callsBefore);
  });

  test("hops past Deezer failure to Apple iTunes Search API", async () => {
    const calledHosts: string[] = [];

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      );
      calledHosts.push(url.hostname);

      if (url.hostname === "musicbrainz.org") {
        return new Response("Rate Limited", { status: 503 });
      }
      if (url.hostname === "api.deezer.com") {
        return new Response("Bad Gateway", { status: 502 });
      }
      if (url.hostname === "itunes.apple.com") {
        return Response.json({
          results: [
            {
              trackId: 888999,
              trackName: "Trans-Europe Express",
              artistId: 42,
              artistName: "Kraftwerk",
              collectionId: 55,
              collectionName: "Trans-Europe Express",
              releaseDate: "1977-03-01T08:00:00Z",
              trackTimeMillis: 396000,
              primaryGenreName: "Electronic",
            },
          ],
        });
      }
      return new Response("Unexpected host", { status: 500 });
    }) as typeof fetch;

    const results = await searchRecordingsCombined(
      { recording: "Trans-Europe Express", artist: "Kraftwerk" },
      5
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("itunes:888999");
    expect(results[0]?.artist).toBe("Kraftwerk");
    expect(results[0]?.releaseDate).toBe("1977-03-01");
    expect(results[0]?.tags).toEqual(["electronic"]);
    expect(calledHosts).toContain("itunes.apple.com");
  });
});
