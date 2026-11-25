import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finalizeEvent, generateSecretKey, type NostrEvent } from "nostr-tools/pure";
import { naddrEncode, neventEncode, noteEncode, npubEncode, nprofileEncode } from "nostr-tools/nip19";
import { matchFilter, type Filter } from "nostr-tools/filter";
import { createPublicCatalog } from "../src/lib/server/publicCatalog";

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
  test("discovers signed stations from a bounded genre without using that sample for detail misses", async () => {
    const relay = fakeRelay();
    relay.state.events = [first, jazz];
    const c = catalog(relay);
    expect(await Promise.all([c.genre("rock"), c.genre("rock")])).toEqual([
      { status: "found", value: [signed(first)] }, { status: "found", value: [signed(first)] },
    ]);
    expect(relay.requests).toHaveLength(1);
    expect(relay.requests[0]?.limit).toBe(32);
    expect(await c.genre("jazz")).toEqual({ status: "missing" });
    expect(await c.station(jazzAddress)).toEqual({ status: "found", value: signed(jazz) });
    expect(relay.requests[1]).toMatchObject({ "#d": ["jazz"], authors: [jazz.pubkey] });
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
      expect(await old.genre("rock")).toEqual({ status: "found", value: [signed(first)] });
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
    expect(await c.genre("rock")).toEqual({ status: "found", value: [signed(latest)] });
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

  test("rejects unverified relay data and incomplete reads, accepts complete empty genres", async () => {
    const relay = fakeRelay();
    const c = catalog(relay);
    relay.state.events = [{ ...latest, content: "forged" }];
    expect(await c.genre("rock")).toEqual({ status: "unavailable" });
    expect(await c.station(latest.id)).toEqual({ status: "unavailable" });
    relay.state.events = [first];
    relay.state.mode = "closed";
    expect(await c.genre("rock")).toEqual({ status: "unavailable" });
    relay.state.events = [];
    relay.state.mode = "complete";
    expect(await c.genre("rock")).toEqual({ status: "found", value: [] });
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
