import type { EventStore } from "applesauce-core";
import { isReplaceable, type NostrEvent } from "applesauce-core/helpers/event";
import type { RelayPool } from "applesauce-relay";
import { lastValueFrom, takeUntil, tap, timer } from "rxjs";
import { socialPublishRelays, type RelayPolicy } from "../../config/relayPolicy";
import { publicDeliveryRelayUrl } from "./relayDiscovery";
import { getAddressableIdentity } from "./domain/shared";

/** NIP-57 identifies every event by ID. Addressable events also have a stable coordinate. */
export function eventZapTargetTags(target: Pick<NostrEvent, "kind" | "pubkey" | "id" | "tags">): string[][] {
  return [
    ["e", target.id], ["p", target.pubkey], ["k", String(target.kind)],
    ...(isReplaceable(target.kind) ? [["a", getAddressableIdentity(target)]] : []),
  ];
}

function advertisedRelays(mailbox: NostrEvent | undefined, direction: "read" | "write"): string[] {
  return [...new Set((mailbox?.tags ?? []).flatMap(([name, value, mode]) => {
    if (name !== "r" || !value || (mode !== undefined && mode !== direction)) return [];
    const relay = publicDeliveryRelayUrl(value);
    return relay ? [relay] : [];
  }))];
}

function taggedRecipients(tags: NostrEvent["tags"]): string[] {
  return [...new Set(tags.flatMap(([name, key]) =>
    (name === "p" || name === "P") && key && /^[a-f0-9]{64}$/i.test(key) ? [key] : [],
  ))].slice(0, 8);
}

/** Resolve missing mailboxes in one bounded request. Already-cached lists work offline. */
async function deliveryMailboxes(
  store: EventStore, pool: Pick<RelayPool, "request">, policy: RelayPolicy,
  author: string, recipients: string[],
) {
  if (policy.stage === "development") return { outboxes: [], inboxes: [] };
  const mailbox = (pubkey: string) => store.getReplaceable(10002, pubkey);
  const missing = [...new Set([author, ...recipients])].filter(key => key && !mailbox(key));
  if (missing.length) {
    await lastValueFrom(pool.request(
      [...new Set([...policy.identityRead, ...policy.appData])],
      missing.map(key => ({ kinds: [10002], authors: [key], limit: 1 })),
      { waitForAuth: false },
    ).pipe(takeUntil(timer(2_000)), tap(event => store.add(event))), { defaultValue: null })
      .catch(() => undefined);
  }
  const sender = mailbox(author);
  return {
    outboxes: advertisedRelays(sender, "write"),
    inboxes: recipients.flatMap(key => advertisedRelays(mailbox(key), "read").slice(0, 8)),
  };
}

export async function resolvePublicDelivery(
  store: EventStore, pool: Pick<RelayPool, "request">, policy: RelayPolicy,
  event: NostrEvent, hints: string[] = [],
) {
  const { outboxes, inboxes } = await deliveryMailboxes(
    store, pool, policy, event.pubkey, event.kind === 3 ? [] : taggedRecipients(event.tags),
  );
  const writes = event.kind === 10002 ? [...advertisedRelays(event, "write"), ...outboxes] : outboxes;
  const taggedHints = event.kind === 3 ? [] : event.tags.flatMap(([name, , hint]) => {
    if (!hint || !["a", "A", "e", "E", "p", "P"].includes(name ?? "")) return [];
    const relay = publicDeliveryRelayUrl(hint);
    return relay ? [relay] : [];
  });
  return socialPublishRelays(policy, event.kind, writes, inboxes, [...hints, ...taggedHints]);
}

/** NIP-57 sends a signed request directly to LNURL. The provider publishes the receipt. */
export async function resolveZapReceiptRelays(
  store: EventStore, pool: Pick<RelayPool, "request">, policy: RelayPolicy,
  author: string, recipient: string,
) {
  const { outboxes, inboxes } = await deliveryMailboxes(store, pool, policy, author, [recipient]);
  const targets = policy.stage === "production"
    ? [...policy.appData, ...inboxes, ...outboxes, ...policy.generalWriteFallback]
    : policy.generalWriteFallback;
  const relays = [...new Set(targets
    .map(publicDeliveryRelayUrl).filter((url): url is string => url !== null))];
  if (!relays.length) throw new Error("No public relay is available to receive the zap receipt");
  return relays;
}
