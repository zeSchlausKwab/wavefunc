import type { Filter } from "applesauce-core/helpers/filter";
import { use$ } from "applesauce-react/hooks";
import { storeEvents } from "applesauce-relay/operators";
import { map, scan, startWith } from "rxjs";
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
  const relays = getAppDataRelayUrls();
  const relaysKey = JSON.stringify(relays);
  const filtersKey = JSON.stringify(filters);

  const eose =
    use$(
      () =>
        relayPool.subscription(relays, filters).pipe(
          storeEvents(eventStore),
          map((message) => message === "EOSE"),
          startWith(false),
          scan((done, current) => done || current, false),
        ),
      [eventStore, filtersKey, relayPool, relaysKey],
    ) ?? false;

  const events =
    use$(
      () =>
        eventStore.timeline(filters).pipe(
          map((timeline) =>
            [...timeline].map((event) => parseStationEvent(event, relays)),
          ),
        ),
      [eventStore, filtersKey, relaysKey],
    ) ?? [];

  return { events, eose };
}

export function useStations(
  additionalFilters: Omit<Filter, "kinds">[] = [{}],
): UseStationStreamResult {
  const filters = additionalFilters.map((filter) => ({
    ...filter,
    kinds: [STATION_KIND],
  }));

  return useStationStream(filters);
}

export function useSearchStations(
  filter: Omit<Filter, "kinds"> = {},
  searchQuery: string,
): UseStationStreamResult {
  return useStationStream([
    {
      ...filter,
      kinds: [STATION_KIND],
      search: searchQuery,
    },
  ]);
}

export function useStationsObserver(
  filterWithoutKinds: Omit<Filter, "kinds"> = { limit: 50 },
  clientSideFilters?: StationClientFilters,
): UseStationStreamResult {
  const { events: allEvents, eose } = useStationStream([
    {
      ...filterWithoutKinds,
      kinds: [STATION_KIND],
    },
  ]);

  const events = clientSideFilters
    ? allEvents.filter((station) => {
        if (clientSideFilters.genres && clientSideFilters.genres.length > 0) {
          const stationGenres = station.genres.map((genre) => genre.toLowerCase());
          const hasMatchingGenre = clientSideFilters.genres.some((genre) =>
            stationGenres.includes(genre.toLowerCase()),
          );
          if (!hasMatchingGenre) return false;
        }

        if (clientSideFilters.languages && clientSideFilters.languages.length > 0) {
          const stationLanguages = station.languages.map((language) => language.toLowerCase());
          const hasMatchingLanguage = clientSideFilters.languages.some((language) =>
            stationLanguages.includes(language.toLowerCase()),
          );
          if (!hasMatchingLanguage) return false;
        }

        if (clientSideFilters.countries && clientSideFilters.countries.length > 0) {
          const stationCountry = station.countryCode?.toLowerCase();
          const hasMatchingCountry = clientSideFilters.countries.some((country) =>
            stationCountry === country.toLowerCase(),
          );
          if (!hasMatchingCountry) return false;
        }

        return true;
      })
    : allEvents;

  return { events, eose };
}

export function useMyStations(pubkey?: string | null): UseStationStreamResult {
  return useStationStream([
    {
      authors: pubkey ? [pubkey] : [],
      kinds: [STATION_KIND],
    },
  ]);
}
