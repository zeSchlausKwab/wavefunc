import { ChevronDown, ExternalLink, Radio } from "lucide-react";
import React from "react";
import type { Stream } from "../lib/NDKStation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { canPlayStreamInApp, sortStreamsByPreference } from "../lib/player/adapters";

interface StreamSelectorProps {
  streams: Stream[];
  selectedStreamUrl?: string;
  onStreamSelect: (stream: Stream) => void;
  className?: string;
  align?: "start" | "center" | "end";
  trigger?: React.ReactNode;
}

function normalizeBitrate(bitrate?: number): number | null {
  if (!bitrate || bitrate <= 0) return null;
  return bitrate >= 1000 ? Math.round(bitrate / 1000) : Math.round(bitrate);
}

function formatCodec(stream: Stream): string {
  const codec = stream.quality?.codec || stream.format || "stream";
  return codec.split("/").pop()?.toUpperCase() || codec.toUpperCase();
}

function formatLabel(stream: Stream): string {
  const bitrate = normalizeBitrate(stream.quality?.bitrate);
  return bitrate ? `${formatCodec(stream)} ${bitrate}K` : formatCodec(stream);
}

export const StreamSelector: React.FC<StreamSelectorProps> = ({
  streams,
  selectedStreamUrl,
  onStreamSelect,
  className = "",
  align = "end",
  trigger,
}) => {
  if (streams.length <= 1) {
    return null;
  }

  const selectedStream =
    streams.find((s) => s.url === selectedStreamUrl) ||
    sortStreamsByPreference(streams)[0] ||
    streams[0];

  const sortedStreams = sortStreamsByPreference(streams);
  const defaultTrigger = (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className={cn(
        "h-auto rounded-none border-2 border-on-background bg-surface-container-low px-2 py-1 text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-white",
        className
      )}
      title="Select stream source"
    >
      <Radio className="size-3" />
      <span>{formatLabel(selectedStream)}</span>
      <ChevronDown className="size-3" />
    </Button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? defaultTrigger}
      </DropdownMenuTrigger>

      <DropdownMenuContent align={align} className="z-[120] w-72 rounded-none border-4 border-on-background bg-surface p-1 shadow-[6px_6px_0px_0px_rgba(29,28,19,1)]">
        <DropdownMenuLabel className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.28em] text-on-background/50">
          Signal Source
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-on-background/20" />
        <DropdownMenuRadioGroup
          value={selectedStream?.url}
          onValueChange={(value) => {
            const stream = sortedStreams.find((candidate) => candidate.url === value);
            if (stream) onStreamSelect(stream);
          }}
        >
          {sortedStreams.map((stream) => {
            const externalOnly = !canPlayStreamInApp(stream);
            const bitrate = normalizeBitrate(stream.quality?.bitrate);

            return (
              <DropdownMenuRadioItem
                key={stream.url}
                value={stream.url}
                className="items-start gap-3 rounded-none px-10 py-3 focus:bg-secondary-fixed-dim/15"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="border border-on-background px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider">
                      {formatCodec(stream)}
                    </span>
                    {bitrate && (
                      <span className="text-[10px] font-black uppercase tracking-widest text-on-background/50">
                        {bitrate}K
                      </span>
                    )}
                    {stream.primary && (
                      <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                        Primary
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-on-background/50">
                    <span>{externalOnly ? "Open At Source" : "Play In App"}</span>
                    {externalOnly && <ExternalLink className="size-3" />}
                  </div>
                  <span className="truncate text-[10px] font-mono text-on-background/40">
                    {stream.url}
                  </span>
                </div>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
