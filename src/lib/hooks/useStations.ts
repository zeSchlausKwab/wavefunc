import type { NDKFilter } from "@nostr-dev-kit/ndk";
import { useSubscribe, wrapEvent, useNDK } from "@nostr-dev-kit/ndk-hooks";
import { useEffect, useState } from "react";
import { NDKStation } from "../NDKStation";

/**
 * A simple hook for subscribing to station events with automatic event wrapping and casting to NDKStation.
 * Automatically filters for NDKStation kinds.
 *
 * @param additionalFilters - Optional additional NDK filters to apply (limit, authors, etc.)
 * @returns Object containing the NDKStation events array and end-of-stream status
 */
export function useStations(
  additionalFilters: Omit<NDKFilter, "kinds">[] = [{}]
) {
  const filters = additionalFilters.map((filter) => ({
    ...filter,
    kinds: NDKStation.kinds,
  }));

  const { events, eose } = useSubscribe(filters);
  const stations = events.map((event) => wrapEvent(event) as NDKStation);

  return {
    events: stations,
    eose,
  };
}

/**
 * A hook for searching station events with proper subscription management.
 * Handles dynamic search queries by restarting subscriptions when the search changes.
 *
 * @param filter - NDK filter (should include kinds, limit, and optional search)
 * @param searchQuery - The search query string to track for re-subscription
 * @returns Object containing the NDKStation events array and end-of-stream status
 */
export function useSearchStations(filter: NDKFilter, searchQuery: string) {
  const { ndk } = useNDK();
  const [events, setEvents] = useState<NDKStation[]>([]);
  const [eose, setEose] = useState(false);

  useEffect(() => {
    if (!ndk) return;

    setEvents([]);
    setEose(false);

    const sub = ndk.subscribe(filter as any, { closeOnEose: false });
    const eventMap = new Map<string, NDKStation>();

    sub.on("event", (event: any) => {
      const station = NDKStation.from(event);
      if (!eventMap.has(station.id)) {
        eventMap.set(station.id, station);
        setEvents(Array.from(eventMap.values()));
      }
    });

    sub.on("eose", () => {
      console.log("✅ EOSE - Total stations:", eventMap.size);
      setEose(true);
    });

    return () => {
      console.log("🛑 Stopping subscription");
      sub.stop();
    };
  }, [ndk, searchQuery]); // Re-run when searchQuery changes

  return {
    events,
    eose,
  };
}
