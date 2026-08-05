import { describe, expect, test } from "bun:test";
import { EventStore } from "applesauce-core";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { Subject } from "rxjs";
import {
  createRelayPolicy,
  selectPublishRelays,
} from "../src/config/relayPolicy";
import {
  RelayQueryRegistry,
  type EventCache,
} from "../src/lib/nostr/queryRegistry";

const cachedEvent: NostrEvent = {
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  sig: "c".repeat(128),
  kind: 30078,
  created_at: 1,
  content: "",
  tags: [["l", "wavefunc_user_song_list"]],
};

describe("relay policy", () => {
  test("fails closed when an app-data relay belongs to the wrong stage", () => {
    expect(() =>
      createRelayPolicy({
        stage: "production",
        appRelay: "ws://localhost:3334",
      }),
    ).toThrow("Production cannot use a local app-data relay");

    expect(() =>
      createRelayPolicy({
        stage: "development",
        appRelay: "wss://relay.wavefunc.live",
      }),
    ).toThrow("Development app data must stay on a local relay");

    expect(() =>
      createRelayPolicy({
        stage: "development",
        appRelay: "ws://192.168.1.20:3334",
      }),
    ).not.toThrow();
  });

  test("keeps lookup and wallet specialists out of general publishing", () => {
    const policy = createRelayPolicy({
      stage: "production",
      appRelay: "wss://relay.wavefunc.live",
    });

    expect(policy.identityRead).toContain("wss://purplepag.es");
    expect(policy.walletRead).toContain("wss://relay.minibits.cash");
    expect(policy.generalWriteFallback).not.toContain("wss://purplepag.es");
    expect(policy.generalWriteFallback).not.toContain(
      "wss://relay.minibits.cash",
    );
    expect(policy.generalWriteFallback).not.toContain("wss://relay.coinos.io");
    expect(policy.socialRead).not.toContain("wss://relay.minibits.cash");
    expect(policy.socialRead).not.toContain("wss://relay.coinos.io");

    const relays = selectPublishRelays(
      policy,
      {
        ...cachedEvent,
        kind: 1,
        tags: [["t", "wavefunc"]],
      },
      ["wss://author.example"],
    );

    expect(relays).toContain("wss://relay.wavefunc.live");
    expect(relays).toContain("wss://author.example");
    expect(relays).not.toContain("wss://purplepag.es");

    const replyRelays = selectPublishRelays(
      policy,
      { ...cachedEvent, kind: 1111, tags: [["p", "c".repeat(64)]] },
      ["wss://author.example"],
      ["wss://recipient.example"],
    );
    expect(replyRelays).toContain("wss://recipient.example");

    const appEventRelays = selectPublishRelays(
      policy,
      { ...cachedEvent, kind: 31337 },
      ["wss://author.example"],
    );
    expect(appEventRelays).toEqual(["wss://relay.wavefunc.live"]);

    const observerEventRelays = selectPublishRelays(
      policy,
      { ...cachedEvent, kind: 31240 },
      ["wss://author.example"],
    );
    expect(observerEventRelays).toEqual(["wss://relay.wavefunc.live"]);

    const reportRelays = selectPublishRelays(
      policy,
      {
        ...cachedEvent,
        kind: 1985,
        tags: [["a", `31237:${cachedEvent.pubkey}:station-1`]],
      },
      ["wss://author.example"],
    );
    expect(reportRelays).toContain("wss://relay.wavefunc.live");
    expect(reportRelays).toContain("wss://author.example");

    const fallbackRelays = selectPublishRelays(policy, {
      ...cachedEvent,
      kind: 1,
      tags: [],
    });
    expect(fallbackRelays).toContain("wss://relay.primal.net");
    expect(fallbackRelays).not.toContain("wss://purplepag.es");
    expect(fallbackRelays).not.toContain("wss://relay.minibits.cash");

    const profileRelays = selectPublishRelays(policy, {
      ...cachedEvent,
      kind: 0,
      tags: [],
    });
    expect(profileRelays).toContain("wss://purplepag.es");

    const mailboxRelays = selectPublishRelays(policy, {
      ...cachedEvent,
      kind: 10002,
      tags: [["r", "wss://author.example", "write"]],
    });
    expect(mailboxRelays).toContain("wss://purplepag.es");
  });

  test("development publishing cannot escape the app-data relay", () => {
    const policy = createRelayPolicy({
      stage: "development",
      appRelay: "ws://localhost:3334",
    });
    const relays = selectPublishRelays(
      policy,
      { ...cachedEvent, kind: 1, tags: [["t", "wavefunc"]] },
      ["wss://author.example"],
    );
    expect(relays).toEqual(["ws://localhost:3334"]);
  });
});

describe("shared relay queries", () => {
  test("deduplicates callers and releases loading from persistent cache", async () => {
    const request$ = new Subject<NostrEvent>();
    const live$ = new Subject<NostrEvent>();
    let requestCount = 0;
    let subscriptionCount = 0;
    const stored: NostrEvent[] = [];
    const cache: EventCache = {
      async query() {
        return [cachedEvent];
      },
      async put(event) {
        stored.push(event);
      },
    };
    const eventStore = new EventStore({ verifyEvent: () => true });
    const registry = new RelayQueryRegistry({
      eventStore,
      cache,
      request() {
        requestCount += 1;
        return request$;
      },
      subscription() {
        subscriptionCount += 1;
        return live$;
      },
      retainForMs: 1_000,
    });

    const input = {
      scope: "production:wss://relay.wavefunc.live",
      relays: ["wss://relay.wavefunc.live"],
      filters: [{ kinds: [30078], authors: [cachedEvent.pubkey] }],
    };
    const first = registry.query(input);
    const second = registry.query(input);
    const unsubFirst = first.subscribe(() => undefined);
    const unsubSecond = second.subscribe(() => undefined);

    await Bun.sleep(0);

    expect(first).toBe(second);
    expect(requestCount).toBe(1);
    expect(subscriptionCount).toBe(1);
    expect(first.getSnapshot()).toMatchObject({
      ready: true,
      source: "cache",
    });
    expect(eventStore.hasEvent(cachedEvent.id)).toBe(true);

    request$.next({ ...cachedEvent, id: "d".repeat(64) });
    expect(stored.length).toBe(1);

    unsubFirst();
    unsubSecond();
    registry.dispose();
  });

  test("does not show a loading state when the EventStore is already warm", () => {
    const eventStore = new EventStore({ verifyEvent: () => true });
    eventStore.add(cachedEvent);
    const registry = new RelayQueryRegistry({
      eventStore,
      cache: { query: async () => [], put: async () => undefined },
      request: () => new Subject<NostrEvent>(),
      subscription: () => new Subject<NostrEvent>(),
    });

    const query = registry.query({
      scope: "production:wss://relay.wavefunc.live",
      relays: ["wss://relay.wavefunc.live"],
      filters: [{ kinds: [30078], authors: [cachedEvent.pubkey] }],
    });

    expect(query.getSnapshot()).toMatchObject({
      ready: true,
      source: "memory",
    });
    registry.dispose();
  });
});
