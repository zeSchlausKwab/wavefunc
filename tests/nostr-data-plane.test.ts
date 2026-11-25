import { describe, expect, test } from "bun:test";
import { EventStore } from "applesauce-core";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { Subject, of } from "rxjs";
import { PrivateKeySigner } from "applesauce-signers";
import { eventZapTargetTags, resolvePublicDelivery, resolveZapReceiptRelays } from "../src/lib/nostr/publicDelivery";
import {
  createRelayPolicy,
  selectPublishRelays,
  validateAppDataRelay,
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

  test("allows a co-located production service to use relay loopback", () => {
    expect(
      validateAppDataRelay({
        stage: "production",
        appRelay: "ws://127.0.0.1:3334/",
        consumer: "co-located-service",
      }),
    ).toBe("ws://127.0.0.1:3334");

    expect(() =>
      validateAppDataRelay({
        stage: "development",
        appRelay: "wss://relay.wavefunc.live",
        consumer: "co-located-service",
      }),
    ).toThrow("Development app data must stay on a local relay");
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

  test("public events include author writes, configured general writes, p/P inboxes, and origin hints", async () => {
    const policy = createRelayPolicy({ stage: "production", appRelay: "wss://app.example" });
    policy.generalWriteFallback = ["wss://personal.example"];
    const sender = PrivateKeySigner.fromKey("1".repeat(64));
    const parent = PrivateKeySigner.fromKey("2".repeat(64));
    const root = PrivateKeySigner.fromKey("3".repeat(64));
    const author = await sender.getPublicKey(), p = await parent.getPublicKey(), P = await root.getPublicKey();
    const mailbox = (signer: PrivateKeySigner, url: string, mode: "read" | "write") => signer.signEvent({
      kind: 10002, tags: [["r", url, mode]], content: "", created_at: 1,
    });
    const lists = await Promise.all([
      mailbox(sender, "wss://author.example", "write"), mailbox(parent, "wss://parent.example", "read"),
      mailbox(root, "wss://root.example", "read"),
    ]);
    const store = new EventStore();
    let reads = 0;
    const pool = { request: () => { reads++; return of(...lists); } };
    try {
      for (const kind of [1, 7, 1111, 1985, 30315]) {
        const event = { ...cachedEvent, kind, pubkey: author, tags: [
          ["P", P], ["p", p], ["p", P], ["e", "a".repeat(64), "wss://thread.example:7443"],
        ] };
        const plan = await resolvePublicDelivery(store, pool, policy, event, ["wss://origin.example"]);
        expect(plan.writeRelays).toEqual(["wss://author.example", "wss://personal.example"]);
        expect(plan.targets).toEqual([...plan.writeRelays, "wss://root.example", "wss://parent.example", "wss://app.example", "wss://origin.example", "wss://thread.example:7443"]);
      }
      expect(reads).toBe(1);
      const receipts = await resolveZapReceiptRelays(store, pool, policy, author, p);
      expect(receipts).toEqual(["wss://app.example", "wss://parent.example", "wss://author.example", "wss://personal.example"]);
      expect(reads).toBe(1);
      const follows = await resolvePublicDelivery(store, pool, policy, {
        ...cachedEvent, kind: 3, pubkey: author, tags: [["p", p, "wss://follow.example"]],
      });
      expect(follows.targets).toEqual([...follows.writeRelays, "wss://app.example"]);
    } finally { store.dispose(); }
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

  test("development zap receipts use externally reachable relays", async () => {
    const policy = createRelayPolicy({ stage: "development", appRelay: "ws://localhost:3334" });
    policy.generalWriteFallback = ["wss://personal.example:7443", "wss://test.local", "ws://localhost:4444"];
    const store = new EventStore();
    try {
      expect(await resolveZapReceiptRelays(store, { request: () => of() }, policy, "", ""))
        .toEqual(["wss://personal.example:7443"]);
    } finally { store.dispose(); }
  });

  test("station and feed zaps identify the exact event being paid", () => {
    const station = { ...cachedEvent, kind: 31237, tags: [["d", "station"]] };
    expect(eventZapTargetTags(station)).toContainEqual(["a", `31237:${station.pubkey}:station`]);
    expect(eventZapTargetTags(station)).toContainEqual(["e", station.id]);
    const note = { ...station, kind: 1 };
    expect(eventZapTargetTags(note)).toEqual([["e", note.id], ["p", note.pubkey], ["k", "1"]]);
    const other = { ...note, id: "d".repeat(64) };
    expect(eventZapTargetTags(other)).toContainEqual(["e", other.id]);
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
    expect(stored.length).toBe(0); // The EventStore owns persistence.

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

  test("uses a current boundary for live subscriptions instead of replaying history twice", () => {
    const eventStore = new EventStore({ verifyEvent: () => true });
    const liveFilters: Array<Array<Record<string, unknown>>> = [];
    const registry = new RelayQueryRegistry({
      eventStore,
      cache: { query: async () => [], put: async () => undefined },
      request: () => new Subject<NostrEvent>(),
      subscription: (_relays, filters) => {
        liveFilters.push(filters as Array<Record<string, unknown>>);
        return new Subject<NostrEvent>();
      },
      now: () => 1_800_000_000,
    });

    const query = registry.query({
      scope: "production:wss://relay.wavefunc.live",
      relays: ["wss://relay.wavefunc.live"],
      filters: [
        { kinds: [31237], limit: 500 },
        { kinds: [31238], since: 1_700_000_000, "#a": ["station"] },
      ],
    });
    const unsubscribe = query.subscribe(() => undefined);

    expect(liveFilters).toEqual([
      [
        { kinds: [31237], limit: 500, since: 1_800_000_000 },
        {
          kinds: [31238],
          since: 1_800_000_000,
          "#a": ["station"],
        },
      ],
    ]);

    unsubscribe();
    registry.dispose();
  });
});
