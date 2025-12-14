import { ExternalLink, Disc3 } from "lucide-react";
import { useState } from "react";
import type { ReleaseResult } from "../types/musicbrainz";

interface ReleaseResultCardProps {
  result: ReleaseResult;
}

export function ReleaseResultCard({ result }: ReleaseResultCardProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  // Cover Art Archive API - provides album artwork
  const coverArtUrl = `https://coverartarchive.org/release/${result.id}/front-250`;

  return (
    <div className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <div className="flex justify-between items-start gap-4">
        {/* Album Artwork */}
        <div className="flex-shrink-0">
          {!imageError ? (
            <div className="relative w-16 h-16 rounded overflow-hidden bg-gray-200 dark:bg-gray-700">
              {imageLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Disc3 className="w-6 h-6 text-gray-400 animate-pulse" />
                </div>
              )}
              <img
                src={coverArtUrl}
                alt={`${result.title} cover`}
                className="w-full h-full object-cover"
                onLoad={() => setImageLoading(false)}
                onError={() => {
                  setImageError(true);
                  setImageLoading(false);
                }}
              />
            </div>
          ) : (
            <div className="w-16 h-16 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
              <Disc3 className="w-8 h-8 text-gray-400" />
            </div>
          )}
        </div>

        <div className="flex gap-3 flex-1 min-w-0">
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded font-medium">
                💿 ALBUM
              </span>
              <h4 className="font-bold text-base truncate">{result.title}</h4>
            </div>

            <p className="text-gray-600 dark:text-gray-400 text-sm truncate mt-1">
              {result.artist}
            </p>

            <div className="flex gap-3 mt-2 text-xs text-gray-500 dark:text-gray-500 flex-wrap">
              {result.date && <span>{result.date}</span>}
              {result.country && <span>{result.country}</span>}
              {result.trackCount && (
                <span>
                  {result.trackCount} track{result.trackCount !== 1 ? "s" : ""}
                </span>
              )}
              {result.status && (
                <span className="capitalize">{result.status}</span>
              )}
              <span>Match: {result.score}%</span>
            </div>

            {result.barcode && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 font-mono">
                {result.barcode}
              </p>
            )}

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
          href={`https://musicbrainz.org/release/${result.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 text-green-500 hover:text-green-600 text-sm flex items-center gap-1"
          title="View on MusicBrainz"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
