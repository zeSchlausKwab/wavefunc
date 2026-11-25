import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finalizeEvent, generateSecretKey, type NostrEvent } from "nostr-tools/pure";
import { naddrEncode, neventEncode, noteEncode, npubEncode, nprofileEncode } from "nostr-tools/nip19";
import { matchFilter, type Filter } from "nostr-tools/filter";
import { importStations } from "../src/lib/server/directoryIndex";
import { createPublicCatalog } from "../src/lib/server/publicCatalog";
import { FAVORITES_LIST_LABEL } from "../src/lib/nostr/domain/favorites-list";
import { publicCollectionPath } from "../src/lib/publicPageMetadata";
import { renderPublicPage } from "../src/lib/server/publicPage";

const key = generateSecretKey();
const station = (d: string, timestamp: number, genre = "Rock") => finalizeEvent({
  kind: 31237, tags: [["d", d], ["name", d], ["c", genre, "genre"]], created_at: timestamp, content: "",
}, key);
const first = station("radio", 10);
const latest = station("radio", 20);
const jazz = station("jazz", 15, "Jazz");
const rockAddress = naddrEncode({ kind: 31237, pubkey: first.pubkey, identifier: "radio" });
const jazzAddress = naddrEncode({ kind: 31237, pubkey: jazz.pubkey, identifier: "jazz" });
const profile = finalizeEvent({ kind: 0, tags: [], created_at: 20, content: '{"name":"DJ"}' }, key);
const signed = (event: NostrEvent) => expect.objectContaining({ id: event.id, sig: event.sig, content: event.content });
const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function fakeRelay() {
  const requests: Filter[] = [];
  const state = {
    events: [first] as NostrEvent[],
    mode: "complete" as "complete" | "timeout" | "closed",
  };
  const server = Bun.serve({
    port: 0, hostname: "127.0.0.1",
    fetch(request, server) {
      if (!server.upgrade(request)) return new Response("WebSocket expected", { status: 400 });
    },
    websocket: {
      message(socket, message) {
        const [type, id, filter] = JSON.parse(String(message)) as [string, string, Filter];
        if (type !== "REQ") throw new Error("Unexpected catalog write");
        requests.push(filter);
        for (const event of state.events.filter(e => matchFilter(filter, e)).slice(0, filter.limit)) {
          socket.send(JSON.stringify(["EVENT", id, event]));
        }
        if (state.mode === "complete") socket.send(JSON.stringify(["EOSE", id]));
        if (state.mode === "closed") socket.send(JSON.stringify(["CLOSED", id, "rate-limited"]));
      },
    },
  });
  cleanups.push(() => server.stop(true));
  return { url: "ws://127.0.0.1:" + server.port, state, requests };
}

function catalog(relay: ReturnType<typeof fakeRelay>, opts: Parameters<typeof createPublicCatalog>[0] = {}) {
  const value = createPublicCatalog({
    databasePath: ":memory:", relayUrl: relay.url, profileRelays: [relay.url],
    timeoutMs: 300, ...opts,
  });
  cleanups.push(value.close);
  return value;
}

describe("public station catalog", () => {
  test("collection links resolve the signed list and preserve its ordered public station references", async () => {
    const relay = fakeRelay();
    const dir = mkdtempSync(join(tmpdir(), "wavefunc-collection-"));
    cleanups.push(() => rmSync(dir, { recursive: true }));
    const directoryDatabasePath = join(dir, "index.sqlite");
    const c = catalog(relay, { directoryDatabasePath, freshMs: 0 });
    const other = station("station:with:colons", 15);
    await importStations(directoryDatabasePath, [first, jazz, other]);
    const identifier = "curator:jazz";
    const list = finalizeEvent({
      kind: 30078, created_at: 1,
      tags: [["d", identifier], ["l", FAVORITES_LIST_LABEL], ["a", `31237:${jazz.pubkey}:jazz`],
        ["a", `31237:${other.pubkey}:station:with:colons`], ["a", `31237:${jazz.pubkey}:jazz`]],
      content: JSON.stringify({ name: "Jazz <after hours>", banner: "https://art.example/list.png" }),
    }, key);
    relay.state.events = [list];
    const path = publicCollectionPath(list);
    const result = await c.collection(path.split("/")[2]!);
    if (result.status !== "found") throw new Error("Expected collection");
    expect(result.value.event.id).toBe(list.id);
    expect(result.value.stations.map(station => station.id)).toEqual([jazz.id, other.id]);
    const html = renderPublicPage('<html><head></head><body><div id="root"></div></body></html>', { kind: "collection", ...result.value });
    expect(html).toContain('rel="canonical" href="https://wavefunc.live' + path + '"');
    expect(html).toContain('property="og:title" content="Jazz &lt;after hours&gt; | WaveFunc Radio"');
    expect(html).toContain('property="og:image" content="https://art.example/list.png"');
    expect(html).toContain('href="/station/' + jazzAddress + '"');
    expect(html).not.toContain("AUTHENTICATION_REQUIRED");

    relay.state.events = [finalizeEvent({ kind: 30078, created_at: 2, tags: [["d", identifier], ["l", "other-app-data"]], content: "unrelated data" }, key)];
    expect(await c.collection(path.split("/")[2]!)).toEqual({ status: "missing" });
    expect(await c.collection(jazzAddress)).toEqual({ status: "missing" });
  });
  test("a snapshot serves all indexed genre and station pages without relay lookups", async () => {
    const relay = fakeRelay();
    const dir = mkdtempSync(join(tmpdir(), "wavefunc-directory-"));
    cleanups.push(() => rmSync(dir, { recursive: true }));
    const directoryDatabasePath = join(dir, "index.sqlite");
    const c = catalog(relay, { directoryDatabasePath });
    expect(await c.genres(1, "")).toEqual({ status: "unavailable" });
    await importStations(directoryDatabasePath, [first, jazz]);
    expect(await c.genres(1, "")).toMatchObject({ status: "found", value: {genres:[{slug:"jazz",count:1},{slug:"rock",count:1}],total:2} });
    expect(await c.genre("jazz", 1)).toMatchObject({ status: "found", value: { events: [signed(jazz)] } });
    expect(await c.genre("blues", 1)).toEqual({ status: "missing" });
    expect(await c.station(jazzAddress)).toEqual({ status: "found", value: signed(jazz) });
    expect(relay.requests).toHaveLength(0);
    expect(await c.station("e".repeat(64))).toEqual({ status: "missing" });
    expect(relay.requests.at(-1)).toMatchObject({ ids: ["e".repeat(64)] });
  });

  test("resolves cached historical hex/note/nevent to the latest address after process restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "wavefunc-public-catalog-"));
    cleanups.push(() => rmSync(directory, { recursive: true }));
    const databasePath = join(directory, "catalog.sqlite");
    const relay = fakeRelay();
    const old = createPublicCatalog({ databasePath, relayUrl: relay.url });
    try {
      expect(await old.station(rockAddress)).toEqual({ status: "found", value: signed(first) });
    } finally {
      old.close();
    }
    relay.state.events = [latest];
    const c = catalog(relay, { databasePath, freshMs: 0 });
    const ids = [
      first.id, noteEncode(first.id), neventEncode({ id: first.id, relays: ["ws://untrusted.invalid"] }),
      naddrEncode({ kind: 31237, pubkey: first.pubkey, identifier: "radio", relays: ["ws://untrusted.invalid"] }),
    ];
    for (const id of ids) expect(await c.station(id)).toEqual({ status: "found", value: signed(latest) });
    expect(relay.requests.slice(1).every((filter) => filter["#d"]?.[0] === "radio")).toBe(true);
    relay.state.mode = "timeout";
    expect(await c.station(rockAddress)).toEqual({ status: "found", value: signed(latest) });
    expect(await c.station(jazzAddress)).toEqual({ status: "unavailable" });
    // A subsequent exact, complete empty read honors deletion under both forms.
    relay.state.mode = "complete";
    relay.state.events = [];
    expect(await c.station(first.id)).toEqual({ status: "missing" });
    relay.state.mode = "closed";
    expect(await c.station(rockAddress)).toEqual({ status: "unavailable" });
  });

  test("resolves a previously unseen event ID via an exact second lookup by coordinate", async () => {
    const relay = fakeRelay();
    relay.state.events = [latest, first];
    const c = catalog(relay);
    expect(await c.station(first.id)).toEqual({ status: "found", value: signed(latest) });
    expect(relay.requests[0]).toMatchObject({ ids: [first.id] });
    expect(relay.requests[1]).toMatchObject({ "#d": ["radio"], authors: [first.pubkey] });
  });

  test("rejects unverified or incomplete station lookups", async () => {
    const relay = fakeRelay();
    relay.state.events = [{ ...latest, content: "forged" }];
    const c = catalog(relay);
    expect(await c.station(latest.id)).toEqual({ status: "unavailable" });
    relay.state.events = [first];
    relay.state.mode = "closed";
    expect(await c.station(rockAddress)).toEqual({ status: "unavailable" });
  });

  test("uses configured identity relays and shares one profile across hex/npub/hinted nprofile", async () => {
    const appRelay = fakeRelay();
    const identities = fakeRelay();
    identities.state.events = [profile];
    const c = catalog(appRelay, { profileRelays: [identities.url] });
    for (const id of [nprofileEncode({ pubkey: profile.pubkey, relays: [appRelay.url] }), npubEncode(profile.pubkey), profile.pubkey]) {
      expect(await c.profile(id)).toEqual({ status: "found", value: signed(profile) });
    }
    expect(identities.requests).toEqual([{ kinds: [0], authors: [profile.pubkey], limit: 1 }]);
    expect(appRelay.requests).toEqual([]);
    identities.state.events = [];
    appRelay.state.mode = "closed";
    const c2 = catalog(appRelay, { profileRelays: [identities.url, appRelay.url] });
    expect(await c2.profile(profile.pubkey)).toEqual({ status: "unavailable" });
  });
});
