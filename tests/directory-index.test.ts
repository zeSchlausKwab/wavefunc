import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import { importStations, openDirectoryIndex } from "../src/lib/server/directoryIndex";
import { publicStationPointer } from "../src/lib/publicPageMetadata";

test("a complete export replaces membership and removals atomically; ties and old event links survive rescans", async () => {
  const folder = mkdtempSync(join(tmpdir(), "wavefunc-index-"));
  const path = join(folder, "index.sqlite");
  const index = openDirectoryIndex(path);
  const key = generateSecretKey();
  const event = (d: string, time: number, genre: string) => finalizeEvent({
    kind: 31237, content: "", created_at: time, tags: [["d", d], ["c", genre, "genre"]],
  }, key);
  const original = event("one", 1, "Jazz");
  const revised = event("one", 2, "Metal");
  const tied = event("one", 2, "Ambient");
  const other = event("two", 1, "Pop");
  const winner = tied.id < revised.id ? tied : revised;
  const address = publicStationPointer(original);
  try {
    await importStations(path, [original, other]);
    async function* interrupted() {
      yield revised;
      expect((await index.genre("jazz", 1)).status).toBe("found");
      throw new Error("Incomplete export");
    }
    await expect(importStations(path, interrupted())).rejects.toThrow("Incomplete export");
    expect((await index.genres(1, ""))).toMatchObject({ status: "found", value: {genres:[{slug:"jazz"}, {slug:"pop"}],total:2} });
    await importStations(path, [revised, tied, original]);
    expect(index.station(address)?.id).toBe(winner.id);
    expect(index.addressForId(original.id)).toBe(address);
    expect(index.station(publicStationPointer(other))).toBeUndefined();
    expect((await index.genre("jazz", 1)).status).toBe("missing");
    expect((await index.genre("pop", 1)).status).toBe("missing");
    await importStations(path, [tied, revised]);
    expect(index.station(address)?.id).toBe(winner.id);
    await importStations(path, []);
    expect((await index.genres(1, ""))).toEqual({status:"found", value:{genres:[],total:0,page:1,query:""}});
    expect((await index.sitemapBuckets())).toEqual({status:"found", value:[]});
  } finally {
    index.close();
    rmSync(folder, { recursive: true });
  }
});

test("genre sitemaps exclude noise tags and thin low-count genres while keeping real genres", async () => {
  const folder = mkdtempSync(join(tmpdir(), "wavefunc-index-seo-"));
  const path = join(folder, "index.sqlite");
  const index = openDirectoryIndex(path);
  const key = generateSecretKey();
  const makeStation = (d: string, genres: string[]) => finalizeEvent({
    kind: 31237,
    content: "",
    created_at: 100,
    tags: [["d", d], ...genres.map(g => ["c", g, "genre"])],
  }, key);
  const events = [
    ...Array.from({ length: 6 }, (_, i) => makeStation("jazz-" + i, ["Jazz", "100.1 fm", "192kbps", "860"])),
    makeStation("solo", ["Tiny One-Off Genre"]),
  ];
  try {
    await importStations(path, events);
    const buckets = await index.sitemapBuckets();
    expect(buckets.status).toBe("found");
    if (buckets.status !== "found") return;
    const genreBuckets = buckets.value.filter(b => b.kind === "genres");
    expect(genreBuckets).toHaveLength(1);
    expect(genreBuckets[0]?.count).toBe(1);
    const paths = await index.sitemapPaths("genres", genreBuckets[0]!.bucket, 0, 50);
    expect(paths).toEqual({ status: "found", value: ["/genre/jazz"] });
    // Noise & thin genres remain directly accessible by slug for users
    expect((await index.genre("192kbps", 1)).status).toBe("found");
    expect((await index.genre("tiny-one~2doff-genre", 1)).status).toBe("found");
  } finally {
    index.close();
    rmSync(folder, { recursive: true });
  }
});
