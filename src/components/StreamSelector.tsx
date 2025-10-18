import { Check, ChevronDown } from "lucide-react";
import React, { useState } from "react";
import type { Stream } from "../lib/NDKStation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";

interface StreamSelectorProps {
  streams: Stream[];
  selectedStreamUrl?: string;
  onStreamSelect: (stream: Stream) => void;
  className?: string;
}

/**
 * Format bitrate for display (converts bps to kbps)
 */
function formatBitrate(bitrate: number): string {
  return `${Math.round(bitrate / 1000)}kbps`;
}

/**
 * Get codec badge color based on codec type
 */
function getCodecBadgeColor(codec: string): string {
  const c = codec.toLowerCase();
  if (c.includes("aac")) return "bg-green-100 text-green-800";
  if (c.includes("mp3")) return "bg-blue-100 text-blue-800";
  if (c.includes("opus")) return "bg-purple-100 text-purple-800";
  if (c.includes("flac")) return "bg-amber-100 text-amber-800";
  return "bg-gray-100 text-gray-800";
}

/**
 * StreamSelector - Dropdown component for selecting between multiple streams
 */
export const StreamSelector: React.FC<StreamSelectorProps> = ({
  streams,
  selectedStreamUrl,
  onStreamSelect,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // If there's only one stream, don't show the selector
  if (streams.length <= 1) {
    return null;
  }

  // Find the currently selected stream or default to primary
  const selectedStream =
    streams.find((s) => s.url === selectedStreamUrl) ||
    streams.find((s) => s.primary) ||
    streams[0];

  // Sort streams by bitrate (highest first)
  const sortedStreams = [...streams].sort(
    (a, b) => (b.quality?.bitrate || 0) - (a.quality?.bitrate || 0)
  );

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          className={`flex items-center gap-2 text-xs ${className}`}
          title="Select stream quality"
        >
          <span className="font-medium">
            {selectedStream?.quality?.codec?.toUpperCase() || "Unknown"}
          </span>
          <span className="text-gray-500">
            {selectedStream?.quality?.bitrate
              ? formatBitrate(selectedStream.quality.bitrate)
              : "N/A"}
          </span>
          <ChevronDown className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <div className="p-2">
          <div className="text-xs font-semibold text-gray-700 mb-2 px-2">
            Select Stream Quality
          </div>
          {sortedStreams.map((stream, index) => {
            const isSelected = stream.url === selectedStream?.url;
            const isPrimary = stream.primary;

            return (
              <DropdownMenuItem
                key={stream.url || index}
                onClick={() => {
                  onStreamSelect(stream);
                  setIsOpen(false);
                }}
                className="flex items-center justify-between cursor-pointer px-3 py-2 rounded-md hover:bg-gray-100"
              >
                <div className="flex items-center gap-2 flex-1">
                  {/* Codec Badge */}
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${getCodecBadgeColor(
                      stream.quality?.codec || ""
                    )}`}
                  >
                    {stream.quality?.codec?.toUpperCase() || "N/A"}
                  </span>

                  {/* Bitrate */}
                  <span className="text-sm font-medium text-gray-900">
                    {stream.quality?.bitrate
                      ? formatBitrate(stream.quality.bitrate)
                      : "N/A"}
                  </span>

                  {/* Primary indicator */}
                  {isPrimary && (
                    <span className="text-xs text-gray-500 italic">
                      (recommended)
                    </span>
                  )}
                </div>

                {/* Selected indicator */}
                {isSelected && (
                  <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
                )}
              </DropdownMenuItem>
            );
          })}
        </div>

        {/* Additional stream info */}
        <div className="border-t border-gray-200 p-2 text-xs text-gray-500">
          <div className="px-2">
            {sortedStreams.length} stream{sortedStreams.length !== 1 ? "s" : ""}{" "}
            available
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};