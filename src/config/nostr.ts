import type { Filter } from "applesauce-core/helpers/filter";
import { config } from "./env";

const PUBLIC_CONTENT_RELAYS = [
  "wss://relay.primal.net",
  "wss://relay.damus.io",
  "wss://purplepag.es",
  "wss://nos.lol",
  "wss://relay.minibits.cash",
  "wss://relay.coinos.io/",
  "wss://relay.nostr.net",
] as const;

export const DEV_ADMIN_PUBKEY =
  "86a82cab18b293f53cbaaae8cdcbee3f7ec427fdf9f9c933db77800bb5ef38a0";

function dedupeRelayUrls(relays: readonly string[]) {
  return Array.from(new Set(relays.filter(Boolean)));
}

export function isDevelopmentEnvironment() {
  return process.env.NODE_ENV !== "production";
}

export function getAppDataRelayUrls() {
  return [config.relayUrl];
}

export function getPublicContentRelayUrls() {
  return [...PUBLIC_CONTENT_RELAYS];
}

export function getReadRelayUrls() {
  return dedupeRelayUrls([config.relayUrl, ...PUBLIC_CONTENT_RELAYS]);
}

export function getWriteRelayUrls() {
  return isDevelopmentEnvironment() ? [config.relayUrl] : getReadRelayUrls();
}

export function getAppDataSubscriptionOptions<T extends object = Record<string, never>>(
  extra?: T
) {
  return {
    relayUrls: getAppDataRelayUrls(),
    ...extra,
  };
}

export function addressesToParameterizedFilters(
  kind: number,
  addresses: string[],
  extra: Omit<Filter, "kinds" | "authors" | "#d"> = {}
): Filter[] {
  if (addresses.length === 0) {
    return [{ kinds: [kind], authors: [], limit: 0 }];
  }

  const authors = [...new Set(addresses.map((addr) => addr.split(":")[1]).filter(Boolean))];
  const dTags = [...new Set(addresses.map((addr) => addr.split(":")[2]).filter(Boolean))];

  return [
    {
      kinds: [kind],
      authors,
      "#d": dTags,
      ...extra,
    },
  ];
}
