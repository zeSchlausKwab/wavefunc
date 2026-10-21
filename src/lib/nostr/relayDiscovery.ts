import { getOutboxes } from "applesauce-core/helpers/mailboxes";
import {
  selectOptimalRelays,
  createOutboxMap,
} from "applesauce-core/helpers/relay-selection";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { verifyEvent } from "nostr-tools";

/** Discovery only proposes public secure URLs. Explicit personal settings remain independent. */
export function publicRelayUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "wss:" ||
      url.username ||
      url.password ||
      url.hash ||
      url.port ||
      !url.hostname.includes(".") ||
      /(^localhost$|\.(local|localhost|internal)$|^\[|^[\d.]+$)/i.test(
        url.hostname,
      )
    )
      return null;
    return url.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}
export function selectAuthorOutboxes(
  authors: string[],
  mailbox: (pubkey: string) => NostrEvent | undefined,
  fallbacks: string[],
  healthy: (url: string) => boolean,
) {
  const pointers = [...new Set(authors)].slice(0, 100).map((pubkey) => {
    const event = mailbox(pubkey);
    const relays = (event ? getOutboxes(event) : [])
      .map(publicRelayUrl)
      .filter((url): url is string => !!url && healthy(url));
    return {
      pubkey,
      relays: relays.length
        ? relays
        : fallbacks
            .map(publicRelayUrl)
            .filter((url): url is string => !!url && healthy(url)),
    };
  });
  return createOutboxMap(
    selectOptimalRelays(pointers, { maxConnections: 6, maxRelaysPerUser: 2 }),
  );
}
export function relaySuggestions(
  events: NostrEvent[],
  now = Math.floor(Date.now() / 1000),
) {
  const reports = new Map<string, Map<string, NostrEvent>>();
  for (const event of events) {
    if (
      event.kind !== 30166 ||
      event.created_at < now - 86400 ||
      event.created_at > now + 60 ||
      !verifyEvent(event)
    )
      continue;
    const url = publicRelayUrl(event.tags.find((t) => t[0] === "d")?.[1] ?? "");
    if (!url) continue;
    const monitors = reports.get(url) ?? new Map<string, NostrEvent>();
    const old = monitors.get(event.pubkey);
    if (!old || old.created_at < event.created_at)
      monitors.set(event.pubkey, event);
    reports.set(url, monitors);
  }
  return [...reports]
    .map(([url, monitors]) => ({
      url,
      monitors: monitors.size,
      updated: Math.max(...[...monitors.values()].map((e) => e.created_at)),
    }))
    .filter((report) => report.monitors >= 2)
    .sort(
      (a, b) =>
        b.monitors - a.monitors ||
        b.updated - a.updated ||
        a.url.localeCompare(b.url),
    )
    .slice(0, 12);
}
