import { useStationsObserver } from "../lib/hooks/useStations";
import { RadioCard } from "./RadioCard";
import { useMemo } from "react";
import type { NDKFilter } from "@nostr-dev-kit/ndk";
import { useFilterStore } from "../stores/filterStore";
import { useAutoAnimate } from "@formkit/auto-animate/react";

interface StationViewProps {
  searchQuery: string;
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

  const filter = useMemo<Omit<NDKFilter, "kinds">>(() => {
    const baseFilter: Omit<NDKFilter, "kinds"> = { limit: 500 };
    if (searchQuery.trim()) baseFilter.search = searchQuery.trim();
    return baseFilter;
  }, [searchQuery]);

  const clientSideFilters = useMemo(
    () => ({
      genres: genres.length > 0 ? genres : undefined,
      languages: languages.length > 0 ? languages : undefined,
      countries: countries.length > 0 ? countries : undefined,
    }),
    [genres, languages, countries]
  );

  const { events, eose } = useStationsObserver(filter, clientSideFilters);

  const isSearching = !!searchQuery.trim();

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
            <h2 className="text-5xl md:text-6xl font-black uppercase tracking-tighter font-headline">
              SEARCH_RESULTS
            </h2>
            <div className="h-2 flex-grow bg-on-background" />
            <span className="font-bold text-primary text-sm hidden md:block tracking-widest uppercase">
              &ldquo;{searchQuery}&rdquo;
            </span>
          </div>

          {!eose && events.length === 0 && (
            <div className="border-4 border-on-background p-8 bg-surface-container-low flex items-center gap-4">
              <span className="material-symbols-outlined text-3xl animate-spin">sync</span>
              <span className="font-black uppercase tracking-tight">SCANNING_FREQUENCIES...</span>
            </div>
          )}

          {eose && events.length === 0 && (
            <div className="border-4 border-on-background p-8 bg-surface-container-low">
              <p className="font-black uppercase text-xl tracking-tight">NO_SIGNAL_FOUND</p>
              <p className="text-sm font-bold text-on-background/50 uppercase tracking-widest mt-1">
                TRY A DIFFERENT SEARCH TERM
              </p>
            </div>
          )}

          <div className="space-y-[-4px]">
            {events.map((station, i) => (
              <RadioCard key={station.id} station={station} variant="search-result" index={i} />
            ))}
          </div>

          {eose && events.length > 0 && (
            <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-on-background/40">
              {events.length} STATION{events.length !== 1 ? "S" : ""} FOUND
            </p>
          )}
        </section>
      )}

      {/* ── TILE GRID ── */}
      {!isSearching && (
        <section>
          <div className="mb-8 flex items-baseline gap-4">
            <h2 className="text-5xl md:text-6xl font-black uppercase tracking-tighter font-headline">
              LIVE_STATIONS
            </h2>
            <div className="h-2 flex-grow bg-on-background" />
            {eose && events.length > 0 && (
              <span className="font-bold text-primary text-sm hidden md:block tracking-widest uppercase">
                {events.length}_BROADCASTING
              </span>
            )}
          </div>

          {!eose && events.length === 0 && (
            <div className="border-4 border-on-background p-8 bg-surface-container-low flex items-center gap-4">
              <span className="material-symbols-outlined text-3xl animate-spin">sync</span>
              <span className="font-black uppercase tracking-tight">LOADING_STATIONS...</span>
            </div>
          )}

          {eose && events.length === 0 && (
            <div className="border-4 border-on-background p-8 bg-surface-container-low">
              <p className="font-black uppercase text-xl tracking-tight">NO_STATIONS_FOUND</p>
            </div>
          )}

          <div
            ref={tileParent}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4"
          >
            {events.map((station) => (
              <RadioCard key={station.id} station={station} />
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
