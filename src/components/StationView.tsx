import type { Filter } from "applesauce-core/helpers/filter";
import { useStationsObserver, useStationCount } from "../lib/nostr/hooks/useStations";
import { RadioCard } from "./RadioCard";
import { SectionHeader } from "./SectionHeader";
import { GenreCarousel } from "./GenreCarousel";
import { useMemo } from "react";
import { useFilterStore } from "../stores/filterStore";
import { useAutoAnimate } from "@formkit/auto-animate/react";

const GENRE_SECTIONS = ["rock", "jazz", "dance", "country", "classical", "folk", "punk"];

interface StationViewProps {
  searchQuery: string;
}

function StationGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
      {Array.from({ length: 12 }).map((_, index) => (
        <div
          key={index}
          className="h-[280px] border-4 border-on-background bg-surface-container-low shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] animate-pulse"
        />
      ))}
    </div>
  );
}

function SearchResultsSkeleton() {
  return (
    <div className="space-y-[-4px]">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="h-24 border-4 border-on-background bg-surface-container-low shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] animate-pulse"
        />
      ))}
    </div>
  );
}

export function StationView({ searchQuery }: StationViewProps) {
  const [tileParent] = useAutoAnimate();
  const {
    genres,
    languages,
    countries,
    removeGenre,
    removeLanguage,
    removeCountry,
    clearAllFilters,
    hasActiveFilters,
    getActiveFilterCount,
  } = useFilterStore();

  const filter = useMemo<Omit<Filter, "kinds">>(() => {
    return { limit: 500 };
  }, [searchQuery]);

  const clientSideFilters = useMemo(
    () => ({
      searchQuery: searchQuery.trim() || undefined,
      genres: genres.length > 0 ? genres : undefined,
      languages: languages.length > 0 ? languages : undefined,
      countries: countries.length > 0 ? countries : undefined,
    }),
    [searchQuery, genres, languages, countries]
  );

  const { events: stations, eose } = useStationsObserver(filter, clientSideFilters);

  // Authoritative total (NIP-45 COUNT against the relay's bleve index).
  // The timeline subscription only loads up to 500 events, so we'd
  // otherwise be claiming "N broadcasting" with N capped at 500 even
  // though the corpus is ~50k. Falls back to the loaded count if the
  // relay hasn't answered yet.
  const totalStations = useStationCount();

  const isSearching = !!searchQuery.trim();

  // Group stations by genre for the carousel sections
  const genreStations = useMemo(() => {
    if (isSearching || stations.length === 0) return null;
    const map = new Map<string, typeof stations>();
    for (const genre of GENRE_SECTIONS) {
      const matching = stations.filter((s) =>
        s.genres.some((g) => g.toLowerCase() === genre),
      );
      if (matching.length > 0) map.set(genre, matching);
    }
    return map.size > 0 ? map : null;
  }, [stations, isSearching]);

  return (
    <div className="space-y-8">

      {/* Active Filters Bar */}
      {hasActiveFilters() && (
        <div className="flex flex-wrap items-center gap-2 border-4 border-on-background p-3 bg-surface-container-low">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-on-background shrink-0">
            <span className="material-symbols-outlined text-[16px]">filter_alt</span>
            <span>ACTIVE_FILTERS ({getActiveFilterCount()})</span>
          </div>
          {genres.map((genre) => (
            <button
              key={`genre-${genre}`}
              className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-1 bg-on-background text-surface hover:bg-primary transition-colors"
              onClick={() => removeGenre(genre)}
            >
              {genre}
              <span className="material-symbols-outlined text-[12px]">close</span>
            </button>
          ))}
          {languages.map((language) => (
            <button
              key={`lang-${language}`}
              className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-1 border-2 border-on-background hover:bg-primary hover:text-white transition-colors"
              onClick={() => removeLanguage(language)}
            >
              {language}
              <span className="material-symbols-outlined text-[12px]">close</span>
            </button>
          ))}
          {countries.map((country) => (
            <button
              key={`country-${country}`}
              className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-1 border-2 border-on-background hover:bg-primary hover:text-white transition-colors"
              onClick={() => removeCountry(country)}
            >
              {country}
              <span className="material-symbols-outlined text-[12px]">close</span>
            </button>
          ))}
          <button
            onClick={clearAllFilters}
            className="ml-auto text-[10px] font-black uppercase px-3 py-1 border-2 border-on-background/40 hover:bg-destructive hover:text-white hover:border-destructive transition-colors"
          >
            CLEAR_ALL
          </button>
        </div>
      )}

      {/* ── SEARCH RESULTS ── */}
      {isSearching && (
        <section>
          <div className="mb-8 flex items-baseline gap-4">
            <h2 className="text-2xl sm:text-4xl md:text-6xl font-black uppercase tracking-tighter font-headline">
              SEARCH_RESULTS
            </h2>
            <div className="h-2 flex-grow bg-on-background" />
            <span className="font-bold text-primary text-sm hidden md:block tracking-widest uppercase">
              &ldquo;{searchQuery}&rdquo;
            </span>
          </div>

          {!eose && stations.length === 0 && <SearchResultsSkeleton />}

          {eose && stations.length === 0 && (
            <div className="border-4 border-on-background p-8 bg-surface-container-low">
              <p className="font-black uppercase text-xl tracking-tight">NO_SIGNAL_FOUND</p>
              <p className="text-sm font-bold text-on-background/50 uppercase tracking-widest mt-1">
                TRY A DIFFERENT SEARCH TERM
              </p>
            </div>
          )}

          {/* Mobile: real spacing between cards so they read as separate
             units. Desktop keeps the original tight stacking that pairs
             with the brutalist staggered offset cycle. */}
          <div className="space-y-3 md:space-y-[-4px]">
            {stations.map((station, i) => (
              <RadioCard key={station.id} station={station} variant="search-result" index={i} />
            ))}
          </div>

          {eose && stations.length > 0 && (
            <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-on-background/40">
              {stations.length} STATION{stations.length !== 1 ? "S" : ""} FOUND
            </p>
          )}
        </section>
      )}

      {/* ── GENRE CAROUSELS ── */}
      {/* Only on the "default" landing — once the user has narrowed the
         feed (via /reception → setGenres([…]) etc.) the hardcoded
         genre rows would just duplicate the LIVE_STATIONS section
         below, with the user's chip already applied. */}
      {!isSearching && !hasActiveFilters() && genreStations && (
        <div className="space-y-8">
          {Array.from(genreStations.entries()).map(([genre, stns]) => (
            <GenreCarousel key={genre} genre={genre} stations={stns} />
          ))}
        </div>
      )}

      {/* ── TILE GRID ── */}
      {!isSearching && (
        <section>
          <SectionHeader
            className="mb-8"
            label={
              // If the user has narrowed the feed (search/genre/etc.) the
              // loaded list IS the answer — don't pretend the corpus total
              // is the result count. Otherwise prefer the relay's NIP-45
              // count over our 500-event window.
              eose && stations.length > 0
                ? hasActiveFilters() || isSearching
                  ? `${stations.length}_BROADCASTING`
                  : `${totalStations ?? stations.length}_BROADCASTING`
                : undefined
            }
          >
            LIVE_STATIONS
          </SectionHeader>

          {!eose && stations.length === 0 && <StationGridSkeleton />}

          {eose && stations.length === 0 && (
            <div className="border-4 border-on-background p-8 bg-surface-container-low">
              <p className="font-black uppercase text-xl tracking-tight">NO_STATIONS_FOUND</p>
            </div>
          )}

          <div
            ref={tileParent}
            className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4"
          >
            {stations.map((station) => (
              <RadioCard key={station.id} station={station} />
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
