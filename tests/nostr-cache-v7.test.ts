import { beforeEach, describe, expect, test } from "bun:test";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { PrivateKeySigner } from "applesauce-signers";
import { addSeenRelay, getSeenRelays } from "applesauce-core/helpers/relays";
import { IndexedDBEventCache } from "../src/lib/nostr/eventCache";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
});
const signer = PrivateKeySigner.fromKey("5".repeat(64));
const sign = (content: string, created_at = 1) => signer.signEvent({ kind: 1, tags: [], created_at, content });

describe("persistent event cache", () => {
  test("batches events, scopes reads and retains only real relay provenance", async () => {
    const cache = new IndexedDBEventCache();
    const first = await sign("first");
    const second = await sign("second", 2);
    addSeenRelay(first, "wss://actual.example");
    await Promise.all([cache.put(first, "dev"), cache.put(second, "dev"), cache.put(second, "prod")]);
    const events = await cache.query("dev", [{ kinds: [1] }]);
    expect(events.map(event => event.id)).toEqual([second.id, first.id]);
    expect([...getSeenRelays(events[1]!)!]).toEqual(["wss://actual.example"]);
    expect((await cache.query("prod", [{ kinds: [1] }])).length).toBe(1);
    expect(await cache.query("dev", [{ kinds: [1], limit: 0 }])).toEqual([]);
    expect((await cache.query("dev", [{ kinds: [1], limit: 2 }, { kinds: [1], limit: 1 }])).length).toBe(2);
  });

  test("removing an event cancels a pending write, including across batches", async () => {
    const cache = new IndexedDBEventCache();
    const event = await sign("delete");
    await Promise.all([cache.put(event, "scope"), cache.remove(event, "scope")]);
    expect(await cache.query("scope", [{}])).toEqual([]);
    await cache.put(event, "scope");
    await cache.remove(event, "scope");
    expect(await cache.query("scope", [{}])).toEqual([]);
  });

  test("prunes expired and excess records without touching the wallet couch", async () => {
    const seed = new IndexedDBEventCache();
    const event = await sign("seed");
    await seed.put(event, "scope");
    const request = indexedDB.open("wavefunc-nostr-cache", 1);
    const database = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = database.transaction("events", "readwrite");
    for (let i = 0; i < 20_010; i++) tx.objectStore("events").put({ key: `extra:${i}`, scope: "extra", kind: 1, pubkey: event.pubkey, event, cachedAt: i < 10 ? 0 : Date.now() });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    const cache = new IndexedDBEventCache();
    await cache.put(event, "scope");
    const count = database.transaction("events").objectStore("events").count();
    expect(await new Promise<number>(resolve => { count.onsuccess = () => resolve(count.result); })).toBe(20_000);
    database.close();
  });
});
