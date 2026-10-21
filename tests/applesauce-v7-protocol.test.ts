import { describe, expect, test } from "bun:test";
import { EventStore } from "applesauce-core";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { getSeenRelays } from "applesauce-core/helpers/relays";
import { getCommentReplyPointer, getCommentRootPointer, isValidComment } from "applesauce-common/helpers/comment";
import { getNip10References } from "applesauce-common/helpers/threading";
import { PrivateKeySigner } from "applesauce-signers";
import { createCountService } from "applesauce-loaders/loaders";
import { firstValueFrom, filter, of, Subject, throwError } from "rxjs";
import { buildStationCommentTemplate, buildCommentReplyTemplate } from "../src/lib/nostr/domain/station";
import { buildCommunityReplyTemplate, parseCommunityPostEvent } from "../src/lib/nostr/domain/community-post";
import { buildCommentTree } from "../src/lib/nostr/domain/comment-tree";
import { RelayPreferences, normalizePersonalRelays } from "../src/config/relayPreferences";
import { RelayQueryRegistry } from "../src/lib/nostr/queryRegistry";

const signer = PrivateKeySigner.fromKey("1".repeat(64));
const sign = (draft: { kind: number; tags: string[][]; content?: string; created_at?: number }) => signer.signEvent({ content: "", created_at: 1, ...draft });

describe("v7 protocol compatibility", () => {
  test("station roots and nested replies contain valid NIP-22 pointers", async () => {
    const station = await sign({ kind: 31237, tags: [["d", "test:station"]] });
    const comment = await sign(buildStationCommentTemplate(station, "Hello"));
    expect(isValidComment(comment)).toBe(true);
    expect(getCommentRootPointer(comment)).toMatchObject({ type: "address", identifier: "test:station", kind: 31237 });
    expect(getCommentReplyPointer(comment)).toMatchObject({ type: "address", identifier: "test:station", kind: 31237 });
    const reply = await sign(buildCommentReplyTemplate(comment, `31237:${station.pubkey}:test:station`, station.id, "Reply"));
    expect(isValidComment(reply)).toBe(true);
    expect(getCommentRootPointer(reply)).toMatchObject({ kind: 31237, identifier: "test:station" });
    expect(getCommentReplyPointer(reply)).toMatchObject({ type: "event", id: comment.id, kind: 1111 });
    expect(buildCommentTree([reply, comment], station.id)[0]?.children[0]?.event.id).toBe(reply.id);
  });

  test("legacy comments, missing parents and cycles stay visible without recursion failures", async () => {
    const legacy = await sign({ kind: 1111, tags: [["A", "31237:author:station"], ["e", "station"]] });
    const reply = await sign({ kind: 1111, tags: [["A", "31237:author:station"], ["e", legacy.id, "", "reply"], ["e", "station", "", "root"]] });
    expect(buildCommentTree([legacy, reply], "station")[0]?.children.length).toBe(1);
    expect(buildCommentTree([reply], "station")[0]?.event.id).toBe(reply.id);
    const cycle = [{ ...legacy, id: "a", tags: [["e", "b", "", "reply"]] }, { ...reply, id: "b", tags: [["e", "a", "", "reply"]] }];
    const tree = buildCommentTree(cycle, "station");
    expect(tree.length).toBe(1);
    expect(tree[0]?.children[0]?.children).toEqual([]);
  });

  test("community replies use NIP-10 and retain the original root across nesting", async () => {
    const root = await sign({ kind: 1, tags: [["t", "wavefunc"]] });
    const reply = await sign(buildCommunityReplyTemplate(root, "one"));
    const nested = await sign(buildCommunityReplyTemplate(reply, "two"));
    expect(reply.kind).toBe(1);
    expect(getNip10References(nested).root?.e?.id).toBe(root.id);
    expect(getNip10References(nested).reply?.e?.id).toBe(reply.id);
    expect(parseCommunityPostEvent(reply).isReply).toBe(true);
    expect(parseCommunityPostEvent(root).isReply).toBe(false);
    expect(parseCommunityPostEvent(await sign({ kind: 1111, tags: [["e", root.id, "", "reply"]] })).isReply).toBe(true);
  });

  test("personal relay preferences are validated, account-scoped and reversible", () => {
    const map = new Map<string, string>();
    const preferences = new RelayPreferences({ getItem: key => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value); }, removeItem: key => { map.delete(key); } });
    expect(() => preferences.save([])).toThrow("Sign in");
    preferences.setAccount("alice");
    preferences.save([{ url: "wss://relay.example/", read: true, write: true }]);
    preferences.setAccount("bob");
    expect(preferences.state$.value.relays).toBeNull();
    preferences.setAccount("alice");
    expect(preferences.state$.value.relays?.[0]?.url).toBe("wss://relay.example");
    expect(() => normalizePersonalRelays([{ url: "https://example.com", read: true, write: true }])).toThrow();
    expect(() => preferences.save([{ url: "wss://example.com", read: false, write: false }])).toThrow();
    preferences.save(null);
    expect(preferences.state$.value.relays).toBeNull();
  });

  test("cached content survives relay failure without fabricated provenance or persisting rejected events", async () => {
    const store = new EventStore();
    const cached = await sign({ kind: 1, tags: [] });
    const live = new Subject<NostrEvent>();
    const registry = new RelayQueryRegistry({ eventStore: store,
      cache: { query: async () => [cached, { ...JSON.parse(JSON.stringify(cached)), id: "0".repeat(64) }], put: async () => { throw new Error("query must not persist"); } },
      request: () => throwError(() => new Error("relay offline")), subscription: () => live });
    const query = registry.query({ scope: "test", relays: ["wss://unseen.example"], filters: [{ kinds: [1] }] });
    query.subscribe(() => {});
    await Promise.resolve();
    expect(store.getByFilters([{ kinds: [1] }]).length).toBe(1);
    expect(query.getSnapshot().source).toBe("cache");
    expect(query.getSnapshot().error?.message).toBe("relay offline");
    expect(getSeenRelays(cached)?.size ?? 0).toBe(0);
    live.error(new Error("live disconnected"));
    expect(query.getSnapshot().error?.message).toBe("live disconnected");
    registry.dispose();
  });

  test("COUNT zero is known, two consumers share transport, and relay counts are not added", async () => {
    let requests = 0;
    const service = createCountService({ relay: () => ({ count: () => { requests++; return of({ count: 0 }); } }) }, { relays: ["wss://one.example", "wss://two.example"], minimumRefresh: 1000 });
    const handle = service.event({ id: "a".repeat(64), created_at: 1, kind: 31237, address: `31237:${"b".repeat(64)}:station` });
    const [one, two] = await Promise.all([firstValueFrom(handle.comments.pipe(filter(state => state.value !== undefined))), firstValueFrom(handle.comments.pipe(filter(state => state.value !== undefined)))]);
    expect(one.value).toBe(0);
    expect(two.value).toBe(0);
    expect(one.origin?.relay).toBeDefined();
    expect(requests).toBe(1);
    service.stop();
  });
});

test("v7 timeline expands a bounded window and preserves incomplete coverage on failure", async () => {
  const { BehaviorSubject, timeout } = await import("rxjs");
  const { createTimelineLoader } = await import("applesauce-loaders/loaders");
  const { matchFilter } = await import("applesauce-core/helpers/filter");
  const recent = await sign({ kind: 1, tags: [], created_at: 100 });
  const older = await sign({ kind: 1, tags: [], created_at: 50 });
  const store = new EventStore();
  const windows = new BehaviorSubject({ since: 75, until: 110 });
  const loader = createTimelineLoader((_relays, filters) => of(...[recent, older].filter(event => filters.some(filter => matchFilter(filter, event)))), ["wss://fixture.example"], { kinds: [1] }, { eventStore: store, prefetch: 0, limit: 10 });
  const subscription = loader(windows).subscribe();
  await firstValueFrom(loader.status$.pipe(filter(status => status.some(s => s.state === "covered" && s.window.since === 75)), timeout(500)));
  expect(store.getByFilters([{ kinds: [1], since: 75 }]).map(e => e.id)).toEqual([recent.id]);
  windows.next({ since: 25, until: 110 });
  await firstValueFrom(loader.status$.pipe(filter(status => status.some(s => s.state === "covered" && s.window.since === 25)), timeout(500)));
  expect(store.hasEvent(older.id)).toBe(true);
  subscription.unsubscribe();
  const failing = createTimelineLoader(() => throwError(() => new Error("offline")), ["wss://failed.example"], { kinds: [1] }, { prefetch: 0 });
  const failed = failing({ since: 25, until: 110 }).subscribe();
  expect((await firstValueFrom(failing.status$.pipe(filter(status => status.some(s => s.state === "incomplete")), timeout(500))))[0]?.state).toBe("incomplete");
  failed.unsubscribe();
  store.dispose();
});
