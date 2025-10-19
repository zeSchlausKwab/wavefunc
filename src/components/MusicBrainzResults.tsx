import { Card } from "./ui/card";
import { ExternalLink } from "lucide-react";

export interface MusicBrainzResult {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  release?: string;
  releaseDate?: string;
  duration?: number;
  score: number;
  tags?: string[];
}

interface MusicBrainzResultsProps {
  results: MusicBrainzResult[];
  loading?: boolean;
  error?: string | null;
}

const formatDuration = (ms?: number) => {
  if (!ms) return null;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

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

  return (
    <div className="absolute top-full left-0 right-0 mt-2 max-h-[70vh] overflow-y-auto rounded-lg border-brutal bg-white dark:bg-gray-900 shadow-brutal z-50">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Found {results.length} track{results.length !== 1 ? "s" : ""}
        </div>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {results.map((result) => (
          <div
            key={result.id}
            className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-base truncate">{result.title}</h4>
                <p className="text-gray-600 dark:text-gray-400 text-sm truncate">
                  {result.artist}
                </p>
                {result.release && (
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 truncate">
                    {result.release}
                    {result.releaseDate && ` (${result.releaseDate})`}
                  </p>
                )}
                <div className="flex gap-3 mt-1 text-xs text-gray-500 dark:text-gray-500">
                  {result.duration && (
                    <span>{formatDuration(result.duration)}</span>
                  )}
                  <span>Score: {result.score}</span>
                </div>
                {result.tags && result.tags.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {result.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                    {result.tags.length > 3 && (
                      <span className="px-2 py-0.5 text-xs text-gray-500">
                        +{result.tags.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>
              <a
                href={`https://musicbrainz.org/recording/${result.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 text-blue-500 hover:text-blue-600 text-sm flex items-center gap-1"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}