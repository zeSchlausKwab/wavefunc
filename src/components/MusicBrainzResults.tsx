import type {
  MusicBrainzResultsProps,
  MusicBrainzResult,
} from "../types/musicbrainz";
import { RecordingResultCard } from "./RecordingResultCard";
import { ArtistResultCard } from "./ArtistResultCard";
import { ReleaseResultCard } from "./ReleaseResultCard";
import { LabelResultCard } from "./LabelResultCard";

// Re-export types for backwards compatibility
export type { MusicBrainzResult } from "../types/musicbrainz";

export function MusicBrainzResults({
  results,
  loading,
  error,
}: MusicBrainzResultsProps) {
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
        <div className="text-red-600 dark:text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (results.length === 0) {
    return null;
  }

  // Get entity type label from first result
  const getEntityLabel = () => {
    if (results.length === 0 || !results[0]) return "";
    const type = results[0].type;
    switch (type) {
      case "artist":
        return results.length === 1 ? "Artist" : "Artists";
      case "release":
        return results.length === 1 ? "Album" : "Albums";
      case "recording":
        return results.length === 1 ? "Song" : "Songs";
      case "label":
        return results.length === 1 ? "Label" : "Labels";
      default:
        return results.length === 1 ? "Result" : "Results";
    }
  };

  const getEntityIcon = () => {
    if (results.length === 0 || !results[0]) return "";
    const type = results[0].type;
    switch (type) {
      case "artist":
        return "🎤";
      case "release":
        return "💿";
      case "recording":
        return "🎵";
      case "label":
        return "🏷️";
      default:
        return "🔍";
    }
  };

  return (
    <div className="absolute top-full left-0 right-0 mt-2 max-h-[70vh] overflow-y-auto rounded-lg border-brutal bg-white dark:bg-gray-900 shadow-brutal z-50">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {getEntityIcon()} Found {results.length} {getEntityLabel()}
        </div>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {results.map((result) => {
          // Route to appropriate component based on type
          switch (result.type) {
            case "artist":
              return <ArtistResultCard key={result.id} result={result} />;
            case "release":
              return <ReleaseResultCard key={result.id} result={result} />;
            case "label":
              return <LabelResultCard key={result.id} result={result} />;
            case "recording":
            default:
              return <RecordingResultCard key={result.id} result={result} />;
          }
        })}
      </div>
    </div>
  );
}
