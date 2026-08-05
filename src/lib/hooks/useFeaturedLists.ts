// Resolves the admin's featured-lists feature events into parsed favorites lists.
// Canonical applesauce-react reactivity: useEventModel + TimelineModel.

import { useMemo } from "react";
import { useAdminFeatures } from "./useAdminFeatures";
import {
  addressesToParameterizedFilters,
} from "../../config/nostr";
import {
  FAVORITES_LIST_LABEL,
  parseFavoritesListEvent,
  type ParsedFavoritesList,
} from "../nostr/domain";
import { useAppDataTimeline } from "../nostr/hooks/useRelayTimeline";

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
  const { features, isLoading: featuresLoading } = useAdminFeatures("lists");

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
      }),
    );
    return ordered;
  }, [features]);

  const filters = useMemo(
    () =>
      addressesToParameterizedFilters(30078, listAddresses, {
        "#l": [FAVORITES_LIST_LABEL],
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(listAddresses)],
  );

  const { events: rawEvents, isLoading: listsLoading } = useAppDataTimeline(
    listAddresses.length > 0 ? filters : null,
  );

  // Reorder according to the feature event's reference order
  const featuredLists: ParsedFavoritesList[] = useMemo(() => {
    if (rawEvents.length === 0) return [];
    const byAddress = new Map<string, ParsedFavoritesList>();
    for (const event of rawEvents) {
      const parsed = parseFavoritesListEvent(event);
      if (parsed.address) byAddress.set(parsed.address, parsed);
    }
    return listAddresses
      .map((address) => byAddress.get(address))
      .filter((list): list is ParsedFavoritesList => list !== undefined);
  }, [rawEvents, listAddresses]);

  return {
    featuredLists,
    isLoading: featuresLoading || listsLoading,
  };
}
