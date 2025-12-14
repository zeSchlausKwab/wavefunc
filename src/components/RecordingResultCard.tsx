import { ExternalLink, Music } from "lucide-react";
import type { RecordingResult } from "../types/musicbrainz";

interface RecordingResultCardProps {
  result: RecordingResult;
}

const formatDuration = (ms?: number) => {
  if (!ms) return null;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

export function RecordingResultCard({ result }: RecordingResultCardProps) {
  return (
    <div className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <div className="flex justify-between items-start gap-4">
        <div className="flex gap-3 flex-1 min-w-0">
          {/* Icon */}
          <div className="flex-shrink-0 mt-1">
            <Music className="w-5 h-5 text-blue-500" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded font-medium">
                SONG
              </span>
              <h4 className="font-bold text-base truncate">{result.title}</h4>
            </div>

            <p className="text-gray-600 dark:text-gray-400 text-sm truncate mt-1">
              {result.artist}
            </p>

            {result.release && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 truncate">
                {result.release}
                {result.releaseDate && ` (${result.releaseDate})`}
              </p>
            )}

            <div className="flex gap-3 mt-2 text-xs text-gray-500 dark:text-gray-500">
              {result.duration && (
                <span>{formatDuration(result.duration)}</span>
              )}
              <span>Match: {result.score}%</span>
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
        </div>

        {/* External link */}
        <a
          href={`https://musicbrainz.org/recording/${result.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 text-blue-500 hover:text-blue-600 text-sm flex items-center gap-1"
          title="View on MusicBrainz"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
