"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Stream } from "@wavefunc/common";
import { useMemo } from "react";

interface StreamSelectorProps {
  stationId: number;
  onStreamSelect: (stream: Stream) => void;
  selectedStreamId?: number;
}

export function StreamSelector({
  stationId,
  onStreamSelect,
  selectedStreamId,
}: StreamSelectorProps) {
  // const stationStreams = useMemo(
  //   () => streams.filter((stream) => stream.stationId === stationId),
  //   [stationId]
  // );

  // const selectedStream = stationStreams.find(
  //   (stream) => stream.id === selectedStreamId
  // );

  return (
    <div className="flex items-center gap-2">
      {/* <Select
        value={selectedStream?.id.toString()}
        onValueChange={(value) => {
          const stream = stationStreams.find((s) => s.id === parseInt(value));
          if (stream) onStreamSelect(stream);
        }}
      >
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="Select quality" />
        </SelectTrigger>
        <SelectContent>
          {stationStreams.map((stream) => (
            <SelectItem
              key={stream.id}
              value={stream.id.toString()}
              className="text-xs"
            >
              {stream.bitrate} kbps
            </SelectItem>
          ))}
        </SelectContent>
      </Select> */}
    </div>
  );
}
