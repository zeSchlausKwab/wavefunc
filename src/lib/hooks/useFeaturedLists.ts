import { useMemo } from "react";
import { use$ } from "applesauce-react/hooks";
import { storeEvents } from "applesauce-relay/operators";
import { combineLatest, map, of, scan, startWith } from "rxjs";
import { useAdminFeatures } from "./useAdminFeatures";
import { addressesToParameterizedFilters, getAppDataRelayUrls } from "../../config/nostr";
import {
  FAVORITES_LIST_LABEL,
  parseFavoritesListEvent,
} from "../nostr/domain";
import { useWavefuncNostr } from "../nostr/runtime";

/**
 * Resolves the admin's featured-lists feature events into parsed favorites lists.
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
      f.refs.forEach((ref) => {
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

      return combineLatest(
        listAddresses.map((address) => {
          const [, pubkey, identifier] = address.split(":");

          if (!pubkey || !identifier) {
            return of(undefined);
          }

          return eventStore.replaceable(30078, pubkey, identifier);
        })
      ).pipe(
        map((resolved) =>
          resolved.filter((event): event is NonNullable<typeof event> => Boolean(event))
        )
      );
    },
    [eventStore, filtersKey, listAddresses.length]
  ) ?? [];

  const featuredLists = useMemo(() => {
    return events.map((event) => parseFavoritesListEvent(event, relays));
  }, [events, relays]);

  return {
    featuredLists,
    isLoading: featuresLoading || !listsEose,
  };
}
