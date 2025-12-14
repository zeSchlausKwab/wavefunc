import { ExternalLink, User } from "lucide-react";
import type { ArtistResult } from "../types/musicbrainz";

interface ArtistResultCardProps {
  result: ArtistResult;
}

export function ArtistResultCard({ result }: ArtistResultCardProps) {
  return (
    <div className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <div className="flex justify-between items-start gap-4">
        <div className="flex gap-3 flex-1 min-w-0">
          {/* Icon */}
          <div className="flex-shrink-0 mt-1">
            <User className="w-5 h-5 text-purple-500" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded font-medium">
                ARTIST
              </span>
              <h4 className="font-bold text-base truncate">{result.name}</h4>
            </div>

            {result.disambiguation && (
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                {result.disambiguation}
              </p>
            )}

            <div className="flex gap-3 mt-2 text-xs text-gray-500 dark:text-gray-500 flex-wrap">
              {result.type_ && (
                <span className="capitalize">{result.type_}</span>
              )}
              {result.country && (
                <span>{result.country}</span>
              )}
              {result.beginDate && (
                <span>
                  {result.beginDate}
                  {result.endDate && ` - ${result.endDate}`}
                </span>
              )}
              <span>Match: {result.score}%</span>
            </div>

            {result.tags && result.tags.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {result.tags.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs"
                  >
                    {tag}
                  </span>
                ))}
                {result.tags.length > 4 && (
                  <span className="px-2 py-0.5 text-xs text-gray-500">
                    +{result.tags.length - 4} more
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* External link */}
        <a
          href={`https://musicbrainz.org/artist/${result.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 text-purple-500 hover:text-purple-600 text-sm flex items-center gap-1"
          title="View on MusicBrainz"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
