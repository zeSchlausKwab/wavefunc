import { useMemo } from "react";
import { use$ } from "applesauce-react/hooks";
import { storeEvents } from "applesauce-relay/operators";
import { map, of, scan, startWith } from "rxjs";
import { NDKWFFavorites } from "../NDKWFFavorites";
import { useAdminFeatures } from "./useAdminFeatures";
import { FAVORITES_LIST_LABEL } from "../nostr/domain/favorites-list";
import { addressesToParameterizedFilters, getAppDataRelayUrls } from "../../config/nostr";
import { useWavefuncNostr } from "../nostr/runtime";

/**
 * Resolves the admin's featured-lists feature events into actual NDKWFFavorites objects.
 *
 * Flow:
 *   1. Fetch kind-30078 events from ADMIN_PUBKEYS labeled wavefunc:featured:lists
 *   2. Collect all `a`-tag references (30078:pubkey:favId)
 *   3. Fetch those favorites lists from the relay
 *   4. Return them ordered by their position in the feature events
 */
export function useFeaturedLists() {
  const { eventStore, relayPool } = useWavefuncNostr();
  const { features, isLoading: featuresLoading } = useAdminFeatures("lists");
  const relays = getAppDataRelayUrls();
  const relaysKey = JSON.stringify(relays);

  // All referenced favorites-list addresses, deduplicated, preserving order
  const listAddresses = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    features.forEach((f) =>
      f.getRefs().forEach((ref) => {
        if (!seen.has(ref)) {
          seen.add(ref);
          ordered.push(ref);
        }
      })
    );
    return ordered;
  }, [features]);

  const filters = useMemo(
    () =>
      addressesToParameterizedFilters(30078, listAddresses, {
        "#l": [FAVORITES_LIST_LABEL],
      }),
    [listAddresses]
  );
  const filtersKey = JSON.stringify(filters);

  const listsEose =
    use$(
      () => {
        if (listAddresses.length === 0) {
          return of(true);
        }

        return relayPool.subscription(relays, filters).pipe(
          storeEvents(eventStore),
          map((message) => message === "EOSE"),
          startWith(false),
          scan((done, current) => done || current, false),
        );
      },
      [eventStore, filtersKey, listAddresses.length, relayPool, relaysKey]
    ) ?? listAddresses.length === 0;

  const events = use$(
    () => {
      if (listAddresses.length === 0) {
        return of([]);
      }

      return eventStore.timeline(filters).pipe(map((timeline) => [...timeline]));
    },
    [eventStore, filtersKey, listAddresses.length]
  ) ?? [];

  const featuredLists = useMemo(() => {
    const favoritesByAddress = new Map<string, NDKWFFavorites>();

    events.forEach((event) => {
      const favorite = new NDKWFFavorites(undefined, event as any);

      if (favorite.pubkey && favorite.favoritesId) {
        favoritesByAddress.set(
          `30078:${favorite.pubkey}:${favorite.favoritesId}`,
          favorite
        );
      }
    });

    return listAddresses
      .map((address) => favoritesByAddress.get(address) ?? null)
      .filter((favorite): favorite is NDKWFFavorites => Boolean(favorite));
  }, [events, listAddresses]);

  return {
    featuredLists,
    isLoading: featuresLoading || !listsEose,
  };
}
