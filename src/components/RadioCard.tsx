import React from "react";
import { NDKStation } from "../lib/NDKStation";

interface RadioCardProps {
  station: NDKStation;
}

export const RadioCard: React.FC<RadioCardProps> = ({ station }) => {
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-200">
      {/* Station Thumbnail */}
      {station.thumbnail && (
        <div className="aspect-video w-full overflow-hidden">
          <img
            src={station.thumbnail}
            alt={station.name || "Radio Station"}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Station Content */}
      <div className="p-4">
        {/* Station Name */}
        <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
          {station.name || "Unnamed Station"}
        </h3>

        {/* Station Description */}
        {station.description && (
          <p className="text-gray-600 text-sm mb-3 line-clamp-3">
            {station.description}
          </p>
        )}

        {/* Station Genres */}
        {station.genres && station.genres.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {station.genres.slice(0, 3).map((genre, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
              >
                {genre}
              </span>
            ))}
            {station.genres.length > 3 && (
              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                +{station.genres.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Streams */}
        {station.streams && station.streams.length > 0 && (
          <div className="space-y-2 mb-3">
            <h4 className="text-sm font-medium text-gray-700">Streams:</h4>
            <div className="space-y-1">
              {station.streams.slice(0, 2).map((stream, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-gray-600 truncate flex-1 mr-2">
                    {stream.url}
                  </span>
                  {stream.quality?.bitrate && (
                    <span className="text-gray-500 bg-gray-100 px-1 py-0.5 rounded">
                      {stream.quality.bitrate}kbps
                    </span>
                  )}
                </div>
              ))}
              {station.streams.length > 2 && (
                <div className="text-xs text-gray-500">
                  +{station.streams.length - 2} more streams
                </div>
              )}
            </div>
          </div>
        )}

        {/* Station Metadata */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100">
          <div className="flex items-center space-x-2">
            {station.location && <span>{station.location}</span>}
            {station.languages && station.languages.length > 0 && (
              <span className="capitalize">{station.languages[0]}</span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                console.log("Raw NDK Event:", station.rawEvent());
              }}
              className="text-gray-600 hover:text-gray-800 font-medium"
              title="Log raw event to console"
            >
              Debug
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(station.naddr)}
              className="text-blue-600 hover:text-blue-800 font-medium"
              title="Copy station address"
            >
              Copy naddr
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
