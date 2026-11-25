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
