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
  searchQuery?: string;
  genres?: string[];
  languages?: string[];
  countries?: string[];
};

// Mirrors the relay's bleve tokenization (standard analyzer: split on non-word
// chars, lowercase) so the local filter doesn't drop hits the server already
// approved. For a query "flux fm" this tokenizes the station's text into words
// and requires "flux" AND "fm" to appear as whole tokens or prefixes — which
// matches bleve's (match OR prefix)-per-term behavior. Without this we'd fail
// to include e.g. "FLUX FM-KlubRadio" (no literal "flux fm" substring).
function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);
}

function matchesStationSearch(station: ParsedStation, searchQuery: string) {
  const queryTerms = tokenize(searchQuery);
  if (queryTerms.length === 0) {
    return true;
  }

  const haystacks = [
    station.name,
    station.description,
    station.location,
    station.website,
    station.countryCode,
    ...station.genres,
    ...station.languages,
  ].filter((v): v is string => typeof v === "string");

  const stationTokens = new Set(haystacks.flatMap(tokenize));

  // every query term must appear as a full token OR as a prefix of some token
  return queryTerms.every((term) => {
    if (stationTokens.has(term)) return true;
    for (const t of stationTokens) {
      if (t.startsWith(term)) return true;
    }
    return false;
  });
}

// Strip the NIP-50 `search` field from a filter. Required when feeding a filter
// to applesauce's TimelineModel: the in-memory event store treats any filter
// with `search` set as "search not supported, return empty" and refuses to
// match cached events. The server-side subscription still gets the original
// filter with `search` so the relay can do its bleve query.
function stripSearch(filter: Filter): Filter {
  if (filter.search === undefined) return filter;
  const { search: _ignored, ...rest } = filter;
  return rest as Filter;
}

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

  // applesauce's in-memory store returns an empty set for any filter that has
  // `search` set, so we must hand TimelineModel a search-stripped copy. The
  // local matcher in useStationsObserver re-applies the search constraint.
  const readFilters = useMemo(() => filters.map(stripSearch), [filters]);

  const rawEvents =
    useEventModel(TimelineModel, readFilters.length > 0 ? [readFilters] : null) ?? [];

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
  // If the caller gave us a searchQuery, push it into the relay subscription as
  // a NIP-50 `search` field. The relay's bleve index evaluates the query across
  // the entire station corpus (~50k); without this we'd be grep-ing whatever
  // arbitrary `limit` window the relay happened to return.
  const searchQuery = clientSideFilters?.searchQuery?.trim();
  const filters = useMemo(
    () => [
      {
        ...filterWithoutKinds,
        kinds: [STATION_KIND],
        ...(searchQuery ? { search: searchQuery } : {}),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(filterWithoutKinds), searchQuery],
  );

  const { events: allEvents, eose } = useStationStream(filters);

  const events = useMemo(() => {
    if (!clientSideFilters) return allEvents;
    return allEvents.filter((station) => {
      // The relay has already done the NIP-50 search server-side, but
      // applesauce's TimelineModel still feeds us every cached kind-31237
      // event in the eventStore (it doesn't know how to honor `search`), so
      // we re-filter here with the tokenized matcher that mirrors bleve's
      // behavior. Without this pass a search would appear to "leak" older
      // cached stations from previous browse sessions.
      if (
        clientSideFilters.searchQuery &&
        !matchesStationSearch(station, clientSideFilters.searchQuery)
      ) {
        return false;
      }

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
