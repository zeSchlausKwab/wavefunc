import { useStationsObserver } from "../lib/hooks/useStations";
import { RadioCard } from "./RadioCard";
import { useMemo } from "react";
import type { NDKFilter } from "@nostr-dev-kit/ndk";
import { useFilterStore } from "../stores/filterStore";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { X, Filter } from "lucide-react";
import { useAutoAnimate } from "@formkit/auto-animate/react";

interface StationViewProps {
  searchQuery: string;
}

export function StationView({ searchQuery }: StationViewProps) {
  const [animationParent] = useAutoAnimate();
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

  // Build filter based on search query
  const filter = useMemo<Omit<NDKFilter, "kinds">>(() => {
    const baseFilter: Omit<NDKFilter, "kinds"> = {
      limit: 500, // Increase limit for client-side filtering
    };

    if (searchQuery.trim()) {
      baseFilter.search = searchQuery.trim();
    }

    return baseFilter;
  }, [searchQuery]);

  // Build client-side filters
  const clientSideFilters = useMemo(
    () => ({
      genres: genres.length > 0 ? genres : undefined,
      languages: languages.length > 0 ? languages : undefined,
      countries: countries.length > 0 ? countries : undefined,
    }),
    [genres, languages, countries]
  );

  // Use the elegant observer hook with flexible filtering
  const { events, eose } = useStationsObserver(filter, clientSideFilters);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          {searchQuery ? `Search: "${searchQuery}"` : "Radio Stations"}
        </h2>
        {eose && events.length > 0 && (
          <span className="text-sm text-gray-600">
            {events.length} station{events.length !== 1 ? "s" : ""} found
          </span>
        )}
      </div>

      {/* Active Filters Bar */}
      {hasActiveFilters() && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center gap-1 text-sm font-medium text-gray-700">
            <Filter className="w-4 h-4" />
            <span>Active Filters ({getActiveFilterCount()}):</span>
          </div>

          {/* Genre Filters */}
          {genres.map((genre) => (
            <Badge
              key={`genre-${genre}`}
              variant="secondary"
              className="cursor-pointer hover:bg-destructive/80 transition-colors"
              onClick={() => removeGenre(genre)}
            >
              {genre}
              <X className="w-3 h-3 ml-1" />
            </Badge>
          ))}

          {/* Language Filters */}
          {languages.map((language) => (
            <Badge
              key={`lang-${language}`}
              variant="secondary"
              className="cursor-pointer hover:bg-destructive/80 transition-colors"
              onClick={() => removeLanguage(language)}
            >
              {language}
              <X className="w-3 h-3 ml-1" />
            </Badge>
          ))}

          {/* Country Filters */}
          {countries.map((country) => (
            <Badge
              key={`country-${country}`}
              variant="secondary"
              className="cursor-pointer hover:bg-destructive/80 transition-colors"
              onClick={() => removeCountry(country)}
            >
              {country}
              <X className="w-3 h-3 ml-1" />
            </Badge>
          ))}

          {/* Clear All Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="ml-auto text-sm"
          >
            Clear All
          </Button>
        </div>
      )}

      {/* Grid layout for RadioCard components */}
      <div
        ref={animationParent}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6"
      >
        {events.map((station) => (
          <RadioCard key={station.id} station={station} />
        ))}
      </div>

      {/* Loading state */}
      {!eose && events.length === 0 && (
        <div className="text-center text-muted-foreground py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-2"></div>
          <p>
            {searchQuery
              ? `Searching for "${searchQuery}"...`
              : "Loading stations..."}
          </p>
        </div>
      )}

      {/* Empty state */}
      {eose && events.length === 0 && (
        <div className="text-center text-muted-foreground py-8">
          <p className="text-lg mb-2">
            {searchQuery
              ? `No stations found for "${searchQuery}"`
              : "No radio stations found."}
          </p>
          {searchQuery && (
            <p className="text-sm">
              Try a different search term or clear the search.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
