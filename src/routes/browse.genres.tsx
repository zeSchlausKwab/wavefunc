import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useStationsObserver } from "../lib/hooks/useStations";
import { useFilterStore } from "../stores/filterStore";
import { Music, ChevronRight } from "lucide-react";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

export const Route = createFileRoute("/browse/genres")({
  component: BrowseGenres,
});

function BrowseGenres() {
  const navigate = useNavigate();
  const { setGenres } = useFilterStore();
  const { events, eose } = useStationsObserver({ limit: 500 });

  // Extract and count all genres from stations
  const genreCounts = events.reduce((acc, station) => {
    station.genres.forEach((genre) => {
      const normalizedGenre = genre.toLowerCase();
      acc[normalizedGenre] = (acc[normalizedGenre] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);

  // Sort genres by popularity
  const sortedGenres = Object.entries(genreCounts)
    .sort(([, countA], [, countB]) => countB - countA)
    .map(([genre, count]) => ({ genre, count }));

  const handleGenreClick = (genre: string) => {
    setGenres([genre]);
    // Navigate to home with filter applied (no reload)
    navigate({ to: "/", search: {} });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Browse by Genre</h1>
          <p className="text-gray-600 mt-2">
            Discover radio stations by musical genre
          </p>
        </div>
        {eose && sortedGenres.length > 0 && (
          <span className="text-sm text-gray-600">
            {sortedGenres.length} genre{sortedGenres.length !== 1 ? "s" : ""}{" "}
            available
          </span>
        )}
      </div>

      {/* Loading state */}
      {!eose && (
        <div className="text-center text-muted-foreground py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-2"></div>
          <p>Loading genres...</p>
        </div>
      )}

      {/* Genre Grid */}
      {eose && sortedGenres.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedGenres.map(({ genre, count }) => (
            <Card
              key={genre}
              className="p-4 cursor-pointer hover:shadow-lg hover:border-primary transition-all group"
              onClick={() => handleGenreClick(genre)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Music className="w-6 h-6 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-lg capitalize truncate">
                      {genre}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {count} station{count !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary transition-colors flex-shrink-0" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {eose && sortedGenres.length === 0 && (
        <div className="text-center text-muted-foreground py-8">
          <Music className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-lg mb-2">No genres found</p>
          <p className="text-sm">
            Stations will appear here once they are added to the network.
          </p>
        </div>
      )}
    </div>
  );
}
