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
      sub.stop();
    };
  }, [ndk, searchQuery]);

  return {
    events,
    eose,
  };
}

/**
 * A unified, elegant hook for station events with flexible filtering.
 * Uses manual subscription management for reliable NIP-50 search support.
 * Automatically restarts subscription when the filter changes.
 *
 * This is the recommended hook for search-enabled station views.
 *
 * @param filterWithoutKinds - NDK filter without kinds (kinds is hardcoded to station kind 31237)
 * @returns Object containing the NDKStation events array and EOSE status
 */
export function useStationsObserver(
  filterWithoutKinds: Omit<NDKFilter, "kinds"> = { limit: 50 }
) {
  const { ndk } = useNDK();
  const [events, setEvents] = useState<NDKStation[]>([]);
  const [eose, setEose] = useState(false);

  useEffect(() => {
    if (!ndk) return;

    // Build complete filter with hardcoded station kinds
    const filter: NDKFilter = {
      ...filterWithoutKinds,
      kinds: [31237 as any],
    };

    // Reset state
    setEvents([]);
    setEose(false);

    const sub = ndk.subscribe(filter, { closeOnEose: false });
    const eventMap = new Map<string, NDKStation>();

    sub.on("event", (event: any) => {
      const station = NDKStation.from(event);
      console.log(`📋 station: ${station.streams[0]?.url}`);
      if (!eventMap.has(station.id)) {
        eventMap.set(station.id, station);
        setEvents(Array.from(eventMap.values()));
      }
    });

    sub.on("eose", () => {
      console.log("✅ EOSE - Total:", eventMap.size);
      setEose(true);
    });

    return () => {
      sub.stop();
    };
  }, [ndk, JSON.stringify(filterWithoutKinds)]); // Stringify to detect deep changes

  return {
    events,
    eose,
  };
}
