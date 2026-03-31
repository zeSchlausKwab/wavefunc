import { useMemo } from "react";
import { useSubscribe, wrapEvent } from "@nostr-dev-kit/react";
import { NDKWFFavorites } from "../NDKWFFavorites";
import { useAdminFeatures } from "./useAdminFeatures";
import {
  addressesToParameterizedFilters,
  getAppDataSubscriptionOptions,
} from "../../config/nostr";

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
  const { features, isLoading: featuresLoading } = useAdminFeatures("lists");

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
        "#l": ["wavefunc_user_favourite_list"],
      }),
    [listAddresses]
  );

  const { events, eose } = useSubscribe(
    filters,
    getAppDataSubscriptionOptions(),
    [listAddresses]
  );

  // Index by address, then restore the order defined by the admin
  const featuredLists = useMemo(() => {
    const byAddress = new Map<string, NDKWFFavorites>();
    events.forEach((e) => {
      const fav = wrapEvent(e) as NDKWFFavorites;
      if (fav.pubkey && fav.favoritesId) {
        byAddress.set(`30078:${fav.pubkey}:${fav.favoritesId}`, fav);
      }
    });
    return listAddresses
      .map((addr) => byAddress.get(addr))
      .filter((f): f is NDKWFFavorites => Boolean(f));
  }, [events, listAddresses]);

  return {
    featuredLists,
    isLoading: featuresLoading || (listAddresses.length > 0 && !eose),
  };
}
