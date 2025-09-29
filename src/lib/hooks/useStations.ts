import type { NDKFilter } from "@nostr-dev-kit/ndk";
import { useSubscribe, wrapEvent } from "@nostr-dev-kit/ndk-hooks";
import { NDKStation } from "../NDKStation";

/**
 * A hook for subscribing to station events with automatic event wrapping and casting to NDKStation.
 * Automatically filters for NDKStation kinds.
 *
 * @param additionalFilters - Optional additional NDK filters to apply (limit, authors, etc.)
 * @returns Object containing the NDKStation events array and end-of-stream status
 */
export function useStations(additionalFilters: Omit<NDKFilter, 'kinds'>[] = [{}]) {
  const filters = additionalFilters.map(filter => ({
    ...filter,
    kinds: NDKStation.kinds
  }));

  const { events, eose } = useSubscribe(filters);
  const stations = events.map((event) => wrapEvent(event) as NDKStation);

  return {
    events: stations,
    eose,
  };
}
