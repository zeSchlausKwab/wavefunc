import type { NDKFilter } from "@nostr-dev-kit/ndk";
import { useSubscribe, wrapEvent } from "@nostr-dev-kit/ndk-hooks";
import { NDKStation } from "../NDKStation";

/**
 * A hook for subscribing to station events with automatic event wrapping and casting to NDKStation.
 *
 * @param filters - Array of NDK filters to subscribe to
 * @returns Object containing the NDKStation events array and end-of-stream status
 */
export function useStations(filters: NDKFilter[]) {
  const { events, eose } = useSubscribe(filters);

  // Wrap and cast events to NDKStation
  const stations = events.map((event) => wrapEvent(event) as NDKStation);

  return {
    events: stations,
    eose,
  };
}
