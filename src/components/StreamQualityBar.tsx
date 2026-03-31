import { cn } from "@/lib/utils";
import type { Stream } from "../lib/NDKStation";

// Quality scale: 320 kbps = 100% fill.
// Common reference points: 32→10%, 64→20%, 96→30%, 128→40%, 192→60%, 256→80%, 320→100%
function bitrateToFill(bitrate: number): number {
  return Math.min(100, Math.max(8, Math.round((bitrate / 320) * 100)));
}

function normalizeBitrate(bitrate?: number): number | null {
  if (!bitrate || bitrate <= 0) return null;
  return bitrate >= 1000 ? Math.round(bitrate / 1000) : Math.round(bitrate);
}

const MIME_TO_SHORT: Record<string, string> = {
  "audio/mpeg": "MP3",
  "audio/mp3": "MP3",
  "audio/aac": "AAC",
  "audio/mp4": "AAC",
  "audio/ogg": "OGG",
  "audio/flac": "FLAC",
  "audio/wav": "WAV",
  "audio/x-wav": "WAV",
  "application/x-mpegurl": "HLS",
  "application/vnd.apple.mpegurl": "HLS",
  "audio/x-hls": "HLS",
};

// Assumed typical bitrates when the stream doesn't advertise one.
// Used for bar fill only — label gets a "~" prefix to signal it's inferred.
const ASSUMED_BITRATE: Record<string, number> = {
  "MP3":  128,
  "AAC":  128,
  "OGG":  128,
  "FLAC": 1000, // lossless — cap renders as 100%
  "WAV":  1000,
  "HLS":  192,  // adaptive — pick a mid-point
};

function formatShort(mime: string): string {
  return MIME_TO_SHORT[mime.toLowerCase()] ?? mime.split("/").pop()?.toUpperCase() ?? "?";
}

interface StreamQualityBarProps {
  stream?: Stream;
  isActive?: boolean;
  className?: string;
}

export function StreamQualityBar({ stream, isActive, className }: StreamQualityBarProps) {
  const rawBitrate = normalizeBitrate(stream?.quality?.bitrate);
  const fmt = stream?.format ? formatShort(stream.format) : null;

  const hasRealBitrate = rawBitrate != null && rawBitrate > 0;
  const assumed = !hasRealBitrate && fmt ? ASSUMED_BITRATE[fmt] : undefined;
  const effectiveBitrate = hasRealBitrate ? rawBitrate! : assumed;

  const fill = isActive
    ? 100
    : effectiveBitrate
      ? bitrateToFill(effectiveBitrate)
      : 20;

  const bitrateLabel = hasRealBitrate
    ? `${rawBitrate}K`
    : assumed
      ? `~${assumed >= 1000 ? "LOSS" : assumed + "K"}`
      : null;

  const label = [fmt, bitrateLabel].filter(Boolean).join(" ") || "—";

  return (
    <div
      className={cn(
        "relative overflow-hidden border-2 border-on-background bg-on-background/10 shrink-0 h-5",
        className
      )}
    >
      {/* Fill */}
      <div
        className={cn(
          "absolute inset-y-0 left-0 transition-all duration-300",
          isActive ? "bg-primary animate-pulse" : "bg-secondary-fixed-dim",
          !hasRealBitrate && !isActive && "opacity-50"
        )}
        style={{ width: `${fill}%` }}
      />
      {/* Label */}
      <span className="absolute inset-0 flex items-center px-1.5 text-[8px] font-black uppercase tracking-tighter text-on-background leading-none pointer-events-none">
        {label}
      </span>
    </div>
  );
}
