import { useState } from "react";
import { Disc3 } from "lucide-react";
import { Card } from "./ui/card";

interface ReleaseResultProps {
  release: {
    id: string;
    title: string;
    artist: string;
    date?: string;
    country?: string;
    trackCount?: number;
    status?: string;
    barcode?: string;
    score: number;
    tags?: string[];
  };
  onClick?: () => void;
  onArtistClick?: () => void;
}

export function ReleaseResultWithImage({
  release,
  onClick,
  onArtistClick,
}: ReleaseResultProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const coverArtUrl = `https://coverartarchive.org/release/${release.id}/front-250`;

  return (
    <Card
      key={release.id}
      className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div className="flex gap-4 items-start">
        {/* Album Artwork */}
        <div className="flex-shrink-0">
          {!imageError ? (
            <div className="relative w-20 h-20 rounded overflow-hidden bg-gray-200 dark:bg-gray-700">
              {imageLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Disc3 className="w-8 h-8 text-gray-400 animate-pulse" />
                </div>
              )}
              <img
                src={coverArtUrl}
                alt={`${release.title} cover`}
                className="w-full h-full object-cover"
                onLoad={() => setImageLoading(false)}
                onError={() => {
                  setImageError(true);
                  setImageLoading(false);
                }}
              />
            </div>
          ) : (
            <div className="w-20 h-20 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
              <Disc3 className="w-10 h-10 text-gray-400" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-lg">💿 {release.title}</h4>
          <p
            className="text-gray-600 dark:text-gray-400 cursor-pointer hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              onArtistClick?.();
            }}
          >
            {release.artist}
          </p>
          <div className="flex gap-3 mt-1 text-sm text-gray-500 dark:text-gray-500">
            {release.date && <span>📅 {release.date}</span>}
            {release.country && <span>🌍 {release.country}</span>}
            {release.trackCount && <span>{release.trackCount} tracks</span>}
            {release.status && (
              <span className="capitalize">{release.status}</span>
            )}
          </div>
          {release.barcode && (
            <p className="text-xs text-gray-500 mt-1">
              Barcode: {release.barcode}
            </p>
          )}
          {release.tags && release.tags.length > 0 && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {release.tags.slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-2 text-right">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Score: {release.score}
            </div>
            <a
              href={`https://musicbrainz.org/release/${release.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-600 text-sm mt-1 inline-block"
              onClick={(e) => e.stopPropagation()}
            >
              View on MusicBrainz →
            </a>
          </div>
        </div>
      </div>
    </Card>
  );
}
