import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Stream } from "@wavefunc/common";

interface StreamSelectorProps {
  streams: Stream[];
  selectedStream: Stream | null;
  onStreamSelect: (stream: Stream) => void;
}

export function StreamSelector({
  streams,
  selectedStream,
  onStreamSelect,
}: StreamSelectorProps) {
  const handleStreamSelect = (stream: Stream) => {
    onStreamSelect(stream);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Stream Quality:</label>
        <Select
          value={selectedStream?.url}
          onValueChange={(value) => {
            const stream = streams.find((s) => s.url === value);
            if (stream) {
              handleStreamSelect(stream);
            }
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select stream quality" />
          </SelectTrigger>
          <SelectContent>
            {streams.map((stream, index) => (
              <SelectItem
                key={`${stream.quality.bitrate}-${stream.quality.codec}-${stream.url}-${index}`}
                value={stream.url}
              >
                {stream.quality.bitrate ?
                  `${Math.round(stream.quality.bitrate / 1000)} kbps`
                : "Unknown"}{" "}
                ({stream.quality.codec})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selectedStream && (
        <div className="text-xs text-muted-foreground">
          <p>Codec: {selectedStream.quality.codec}</p>
          <p>
            Bitrate:{" "}
            {selectedStream.quality.bitrate ?
              `${Math.round(selectedStream.quality.bitrate / 1000)} kbps`
            : "Unknown"}
          </p>
          <p>
            Sample Rate:{" "}
            {selectedStream.quality.sampleRate ?
              `${selectedStream.quality.sampleRate} Hz`
            : "Unknown"}
          </p>
        </div>
      )}
    </div>
  );
}
