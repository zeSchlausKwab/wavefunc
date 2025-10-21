import { ExternalLink, Globe, Languages, MapPin, Radio } from "lucide-react";
import React from "react";
import type { NDKStation } from "../lib/NDKStation";
import { usePlayerStore } from "../stores/playerStore";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import { StreamSelector } from "./StreamSelector";
import { SocialActions } from "./SocialActions";
import { Play, Pause } from "lucide-react";

interface StationDetailSheetProps {
  station: NDKStation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * StationDetailSheet - Full details view for a radio station
 * Mobile: Bottom sheet (70% height)
 * Desktop: Left sheet (40% width)
 */
export const StationDetailSheet: React.FC<StationDetailSheetProps> = ({
  station,
  open,
  onOpenChange,
}) => {
  const { currentStation, isPlaying, playStation, pause } = usePlayerStore();
  const [selectedStream, setSelectedStream] = React.useState(
    station.streams.find((s) => s.primary) || station.streams[0]
  );

  const isCurrentStation = currentStation?.id === station.id;
  const isCurrentlyPlaying = isCurrentStation && isPlaying;

  const handlePlayClick = () => {
    if (isCurrentlyPlaying) {
      pause();
    } else {
      playStation(station, selectedStream);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        responsiveSide={{ mobile: "bottom", desktop: "left" }}
        className="w-full md:w-[40%] md:max-w-2xl h-[70vh] md:h-full overflow-y-auto p-0"
      >
        {/* Header with Thumbnail */}
        <div className="relative">
          {station.thumbnail ? (
            <div className="w-full aspect-video overflow-hidden bg-gray-100">
              <img
                src={station.thumbnail}
                alt={station.name || "Station"}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-full aspect-video bg-secondary flex items-center justify-center">
              <Radio className="w-32 h-32 text-muted-foreground/20" />
            </div>
          )}

          {/* Play Button Overlay */}
          <div className="absolute bottom-4 right-4">
            <Button
              onClick={handlePlayClick}
              className={`rounded-full w-16 h-16 shadow-lg ${
                isCurrentlyPlaying
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-white hover:bg-gray-100"
              }`}
              title={isCurrentlyPlaying ? "Pause" : "Play"}
            >
              {isCurrentlyPlaying ? (
                <Pause className="w-8 h-8 text-white" />
              ) : (
                <Play className="w-8 h-8 text-gray-900" />
              )}
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Title and Description */}
          <SheetHeader className="p-0">
            <SheetTitle className="text-2xl">{station.name || "Unnamed Station"}</SheetTitle>
            {station.description && (
              <SheetDescription className="text-base mt-2">
                {station.description}
              </SheetDescription>
            )}
          </SheetHeader>

          {/* Genres */}
          {station.genres && station.genres.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Genres</h3>
              <div className="flex flex-wrap gap-2">
                {station.genres.map((genre, index) => (
                  <Badge key={index} variant="secondary">
                    {genre}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Stream Quality Selector */}
          {station.streams && station.streams.length > 1 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Stream Quality
              </h3>
              <StreamSelector
                streams={station.streams}
                selectedStreamUrl={selectedStream?.url}
                onStreamSelect={setSelectedStream}
                className="w-full justify-start px-3 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200"
              />
            </div>
          )}

          {/* Station Information */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Information</h3>

            {/* Location */}
            {station.location && (
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Location</p>
                  <p className="text-sm text-gray-600">{station.location}</p>
                </div>
              </div>
            )}

            {/* Languages */}
            {station.languages && station.languages.length > 0 && (
              <div className="flex items-start gap-3">
                <Languages className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Languages</p>
                  <p className="text-sm text-gray-600">
                    {station.languages.join(", ")}
                  </p>
                </div>
              </div>
            )}

            {/* Homepage */}
            {station.homepage && (
              <div className="flex items-start gap-3">
                <Globe className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Website</p>
                  <a
                    href={station.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    {new URL(station.homepage).hostname}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Social Actions */}
          <div className="pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Interact</h3>
              <SocialActions station={station} />
            </div>
          </div>

          {/* Stream URLs (for debugging/advanced users) */}
          {station.streams && station.streams.length > 0 && (
            <div className="pt-4 border-t border-gray-200">
              <details className="group">
                <summary className="text-sm font-semibold text-gray-700 cursor-pointer list-none flex items-center justify-between">
                  <span>Stream URLs ({station.streams.length})</span>
                  <span className="text-gray-400 group-open:rotate-180 transition-transform">
                    ▼
                  </span>
                </summary>
                <div className="mt-3 space-y-2">
                  {station.streams.map((stream, index) => (
                    <div
                      key={index}
                      className="p-3 bg-gray-50 rounded-md text-xs font-mono break-all"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {stream.quality?.codec?.toUpperCase() || "Unknown"}
                        </Badge>
                        {stream.quality?.bitrate && (
                          <span className="text-gray-600">
                            {Math.round(stream.quality.bitrate / 1000)}kbps
                          </span>
                        )}
                        {stream.primary && (
                          <Badge variant="default" className="text-xs">
                            Primary
                          </Badge>
                        )}
                      </div>
                      <a
                        href={stream.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700"
                      >
                        {stream.url}
                      </a>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
