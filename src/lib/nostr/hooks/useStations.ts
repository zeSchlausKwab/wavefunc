// Canonical applesauce-react reactivity for station timelines.
// Uses useEventModel + TimelineModel for the read path; a separate effect
// keeps the relay subscription open so the store stays populated.

import { TimelineModel } from "applesauce-core/models";
import type { Filter } from "applesauce-core/helpers/filter";
import { useEventModel } from "applesauce-react/hooks";
import { storeEvents } from "applesauce-relay/operators";
import { useEffect, useMemo, useState } from "react";
import { getAppDataRelayUrls } from "../../../config/nostr";
import {
  parseStationEvent,
  STATION_KIND,
  type ParsedStation,
} from "../domain";
import { useWavefuncNostr } from "../runtime";

type UseStationStreamResult = {
  events: ParsedStation[];
  eose: boolean;
};

type StationClientFilters = {
  genres?: string[];
  languages?: string[];
  countries?: string[];
};

function useStationStream(filters: Filter[]): UseStationStreamResult {
  const { eventStore, relayPool } = useWavefuncNostr();

  const [eose, setEose] = useState(false);
  useEffect(() => {
    if (filters.length === 0) {
      setEose(true);
      return;
    }
    setEose(false);
    const subscription = relayPool
      .subscription(getAppDataRelayUrls(), filters)
      .pipe(storeEvents(eventStore))
      .subscribe({
        next: (message) => {
          if (message === "EOSE") setEose(true);
        },
      });
    return () => subscription.unsubscribe();
  }, [eventStore, relayPool, filters]);

  const rawEvents =
    useEventModel(TimelineModel, filters.length > 0 ? [filters] : null) ?? [];

  const events = useMemo(
    () => rawEvents.map((event) => parseStationEvent(event)),
    [rawEvents],
  );

  return { events, eose };
}

export function useStations(
  additionalFilters: Omit<Filter, "kinds">[] = [{}],
): UseStationStreamResult {
  const filters = useMemo(
    () =>
      additionalFilters.map((filter) => ({
        ...filter,
        kinds: [STATION_KIND],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(additionalFilters)],
  );

  return useStationStream(filters);
}

export function useSearchStations(
  filter: Omit<Filter, "kinds"> = {},
  searchQuery: string,
): UseStationStreamResult {
  const filters = useMemo(
    () => [
      {
        ...filter,
        kinds: [STATION_KIND],
        search: searchQuery,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(filter), searchQuery],
  );
  return useStationStream(filters);
}

export function useStationsObserver(
  filterWithoutKinds: Omit<Filter, "kinds"> = { limit: 50 },
  clientSideFilters?: StationClientFilters,
): UseStationStreamResult {
  const filters = useMemo(
    () => [
      {
        ...filterWithoutKinds,
        kinds: [STATION_KIND],
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(filterWithoutKinds)],
  );

  const { events: allEvents, eose } = useStationStream(filters);

  const events = useMemo(() => {
    if (!clientSideFilters) return allEvents;
    return allEvents.filter((station) => {
      if (clientSideFilters.genres && clientSideFilters.genres.length > 0) {
        const stationGenres = station.genres.map((genre) => genre.toLowerCase());
        const hasMatchingGenre = clientSideFilters.genres.some((genre) =>
          stationGenres.includes(genre.toLowerCase()),
        );
        if (!hasMatchingGenre) return false;
      }

      if (
        clientSideFilters.languages &&
        clientSideFilters.languages.length > 0
      ) {
        const stationLanguages = station.languages.map((language) =>
          language.toLowerCase(),
        );
        const hasMatchingLanguage = clientSideFilters.languages.some(
          (language) => stationLanguages.includes(language.toLowerCase()),
        );
        if (!hasMatchingLanguage) return false;
      }

      if (
        clientSideFilters.countries &&
        clientSideFilters.countries.length > 0
      ) {
        const stationCountry = station.countryCode?.toLowerCase();
        const hasMatchingCountry = clientSideFilters.countries.some(
          (country) => stationCountry === country.toLowerCase(),
        );
        if (!hasMatchingCountry) return false;
      }

      return true;
    });
  }, [allEvents, clientSideFilters]);

  return { events, eose };
}

export function useMyStations(pubkey?: string | null): UseStationStreamResult {
  const filters = useMemo(
    () => [
      {
        authors: pubkey ? [pubkey] : [],
        kinds: [STATION_KIND],
      },
    ],
    [pubkey],
  );
  return useStationStream(filters);
}
