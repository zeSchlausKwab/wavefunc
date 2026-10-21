import type { EventStore } from "applesauce-core";
import type { RelayPool } from "applesauce-relay";
import { createUnifiedEventLoader } from "applesauce-loaders/loaders";
import { defer, of } from "rxjs";
import { getAppDataRelayUrls, getContactsRelayUrls, getIdentityRelayUrls, getNostrCacheScope, getWalletRelayUrls } from "../../config/nostr";
import type { IndexedDBEventCache } from "./eventCache";

/** Attach before React creates any models. Each batch reads current role policy;
 * caches and sockets belong to the application, never to a provider render. */
export function attachEventLoading(eventStore: EventStore, pool: RelayPool, cache: IndexedDBEventCache) {
  const create = (getRelays: () => string[]) => {
    const relays = defer(() => of(getRelays()));
    return createUnifiedEventLoader({ request: (urls, filters) => pool.request(urls, filters, { waitForAuth: false }) }, {
      eventStore, extraRelays: relays, lookupRelays: relays,
      cacheRequest: filters => cache.query(getNostrCacheScope(), filters),
      followRelayHints: false,
    });
  };
  const app = create(getAppDataRelayUrls);
  const identity = create(getIdentityRelayUrls);
  const wallet = create(getWalletRelayUrls);
  const contacts = create(getContactsRelayUrls);
  const routed = Object.assign((pointer: Parameters<typeof app>[0]) => {
    const kind = "kind" in pointer ? pointer.kind : undefined;
    return (kind === 0 || kind === 10002 ? identity : kind === 10019 ? wallet : kind === 3 ? contacts : app)(pointer);
  }, {
    stop: () => { app.stop(); identity.stop(); wallet.stop(); contacts.stop(); },
    [Symbol.dispose]() { this.stop(); },
  });
  eventStore.eventLoader = routed;
  return routed;
}
