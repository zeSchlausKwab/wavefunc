import { useMemo } from "react";
import { useSearchStations } from "../lib/hooks/useStations";
import { RadioCard } from "./RadioCard";
import type { NDKFilter } from "@nostr-dev-kit/ndk";

interface StationViewProps {
  searchQuery: string;
}

export function StationView({ searchQuery }: StationViewProps) {
  const filter = useMemo<NDKFilter>(() => {
    const baseFilter: NDKFilter = {
      kinds: [31237 as any],
      limit: 50,
    };

    if (searchQuery.trim()) {
      baseFilter.search = searchQuery.trim();
    } else {
      console.log("📡 Loading all stations (limit: 50)");
    }

    return baseFilter;
  }, [searchQuery]);

  const { events, eose } = useSearchStations(filter, searchQuery);

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

      {/* Grid layout for RadioCard components */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
