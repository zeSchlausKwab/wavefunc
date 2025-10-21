import type { MusicBrainzResultsProps, MusicBrainzResult } from "../types/musicbrainz";
import { RecordingResultCard } from "./RecordingResultCard";
import { ArtistResultCard } from "./ArtistResultCard";
import { ReleaseResultCard } from "./ReleaseResultCard";

// Re-export types for backwards compatibility
export type { MusicBrainzResult } from "../types/musicbrainz";

export function MusicBrainzResults({ results, loading, error }: MusicBrainzResultsProps) {
  if (loading) {
    return (
      <div className="absolute top-full left-0 right-0 mt-2 max-h-96 overflow-y-auto rounded-lg border-brutal bg-white dark:bg-gray-900 shadow-brutal p-4 z-50">
        <div className="text-center text-gray-500 dark:text-gray-400">
          Searching MusicBrainz...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="absolute top-full left-0 right-0 mt-2 rounded-lg border-brutal bg-white dark:bg-gray-900 shadow-brutal p-4 z-50">
        <div className="text-red-600 dark:text-red-400">
          Error: {error}
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return null;
  }

  // Count result types
  const counts = results.reduce((acc, r) => {
    const type = r.type || 'recording';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const resultSummary = Object.entries(counts)
    .map(([type, count]) => `${count} ${type}${count !== 1 ? 's' : ''}`)
    .join(', ');

  return (
    <div className="absolute top-full left-0 right-0 mt-2 max-h-[70vh] overflow-y-auto rounded-lg border-brutal bg-white dark:bg-gray-900 shadow-brutal z-50">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Found {results.length} result{results.length !== 1 ? "s" : ""} ({resultSummary})
        </div>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {results.map((result) => {
          // Route to appropriate component based on type
          switch (result.type) {
            case 'artist':
              return <ArtistResultCard key={result.id} result={result} />;
            case 'release':
              return <ReleaseResultCard key={result.id} result={result} />;
            case 'recording':
            default:
              return <RecordingResultCard key={result.id} result={result} />;
          }
        })}
      </div>
    </div>
  );
}