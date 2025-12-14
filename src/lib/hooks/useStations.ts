import type { NDKFilter } from "@nostr-dev-kit/ndk";
import { useSubscribe, wrapEvent, useNDK } from "@nostr-dev-kit/react";
import { useEffect, useState, useMemo } from "react";
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
 * @param clientSideFilters - Optional client-side filters for genres, languages, countries
 * @returns Object containing the NDKStation events array and EOSE status
 */
export function useStationsObserver(
  filterWithoutKinds: Omit<NDKFilter, "kinds"> = { limit: 50 },
  clientSideFilters?: {
    genres?: string[];
    languages?: string[];
    countries?: string[];
  }
) {
  const { ndk } = useNDK();
  const [allEvents, setAllEvents] = useState<NDKStation[]>([]);
  const [eose, setEose] = useState(false);

  useEffect(() => {
    if (!ndk) return;

    // Build complete filter with hardcoded station kinds
    const filter: NDKFilter = {
      ...filterWithoutKinds,
      kinds: [31237 as any],
    };

    // Reset state
    setAllEvents([]);
    setEose(false);

    const sub = ndk.subscribe(filter, { closeOnEose: false });
    const eventMap = new Map<string, NDKStation>();

    sub.on("event", (event: any) => {
      const station = NDKStation.from(event);
      if (!eventMap.has(station.id)) {
        eventMap.set(station.id, station);
        setAllEvents(Array.from(eventMap.values()));
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

  // Apply client-side filters
  const filteredEvents = useMemo(() => {
    if (!clientSideFilters) return allEvents;

    return allEvents.filter((station) => {
      // Genre filter (OR logic - station must have at least one matching genre)
      if (clientSideFilters.genres && clientSideFilters.genres.length > 0) {
        const stationGenres = station.genres.map(g => g.toLowerCase());
        const hasMatchingGenre = clientSideFilters.genres.some((filterGenre) =>
          stationGenres.includes(filterGenre.toLowerCase())
        );
        if (!hasMatchingGenre) return false;
      }

      // Language filter (OR logic - station must have at least one matching language)
      if (clientSideFilters.languages && clientSideFilters.languages.length > 0) {
        const stationLanguages = station.languages.map(l => l.toLowerCase());
        const hasMatchingLanguage = clientSideFilters.languages.some((filterLang) =>
          stationLanguages.includes(filterLang.toLowerCase())
        );
        if (!hasMatchingLanguage) return false;
      }

      // Country filter (OR logic - station must match at least one country)
      if (clientSideFilters.countries && clientSideFilters.countries.length > 0) {
        const stationCountry = station.countryCode?.toLowerCase();
        const hasMatchingCountry = clientSideFilters.countries.some((filterCountry) =>
          stationCountry === filterCountry.toLowerCase()
        );
        if (!hasMatchingCountry) return false;
      }

      return true;
    });
  }, [allEvents, JSON.stringify(clientSideFilters)]);

  return {
    events: filteredEvents,
    eose,
  };
}
