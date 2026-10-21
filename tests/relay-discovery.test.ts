import { expect, test } from "bun:test";
import { finalizeEvent } from "nostr-tools";
import {
  publicRelayUrl,
  relaySuggestions,
  selectAuthorOutboxes,
} from "../src/lib/nostr/relayDiscovery";
const secret = (n: number) => new Uint8Array(32).fill(n);
const report = (n: number, url: string, time = 100000) =>
  finalizeEvent(
    { kind: 30166, content: "", tags: [["d", url]], created_at: time },
    secret(n),
  );
test("relay suggestions ignore stale, private and single-monitor reports", () => {
  const one = report(1, "wss://good.example");
  expect(
    relaySuggestions(
      [
        one,
        one,
        report(2, "wss://good.example", 1),
        report(2, "wss://127.0.0.1"),
      ],
      100000,
    ),
  ).toEqual([]);
  expect(
    relaySuggestions([one, report(2, "wss://good.example")], 100000),
  ).toMatchObject([{ url: "wss://good.example", monitors: 2 }]);
  expect(publicRelayUrl("wss://name:password@relay.example")).toBeNull();
  expect(publicRelayUrl("wss://router.local")).toBeNull();
});
test("outbox selection respects author and connection budgets and retains fallback coverage", () => {
  const authors = Array.from({ length: 120 }, (_, n) =>
    n.toString(16).padStart(64, "0"),
  );
  const selection = selectAuthorOutboxes(
    authors,
    () => undefined,
    Array.from({ length: 12 }, (_, n) => `wss://relay${n}.example`),
    () => true,
  );
  expect(Object.keys(selection).length).toBeLessThanOrEqual(6);
  const counts = new Map<string, number>();
  for (const pointers of Object.values(selection))
    for (const { pubkey } of pointers)
      counts.set(pubkey, (counts.get(pubkey) ?? 0) + 1);
  expect(counts.size).toBe(100);
  expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
});
