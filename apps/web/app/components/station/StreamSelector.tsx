"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Stream } from "@wavefunc/common";

interface StreamSelectorProps {
  stationId: number;
  onStreamSelect: (stream: Stream) => void;
  selectedStreamId?: number;
  streams: Stream[];
}

export function StreamSelector({
  stationId,
  onStreamSelect,
  selectedStreamId,
  streams,
}: StreamSelectorProps) {
  const selectedStream = streams.find(
    (stream) => stream.quality.bitrate === selectedStreamId
  );

  return (
    <div className="flex items-center gap-2">
      <Select
        value={selectedStream?.quality.bitrate.toString()}
        onValueChange={(value) => {
          const stream = streams.find(
            (s) => s.quality.bitrate === parseInt(value)
          );
          if (stream) onStreamSelect(stream);
        }}
      >
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="Select quality" />
        </SelectTrigger>
        <SelectContent>
          {streams.map((stream) => (
            <SelectItem
              key={`${stream.quality.bitrate}-${stream.quality.codec}-${stream.url}`}
              value={stream.quality.bitrate.toString()}
              className="text-xs"
            >
              {Math.round(stream.quality.bitrate / 1000)} kbps •{" "}
              {stream.quality.codec}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
