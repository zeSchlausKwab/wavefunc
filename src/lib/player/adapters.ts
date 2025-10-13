import Hls from "hls.js";
import type { Stream } from "../NDKStation";

// Normalize URLs coming from events (trim spaces/backticks)
export function normalizeUrl(url: string): string {
  return (url || "").trim().replace(/^`+|`+$/g, "");
}

// Basic helpers
export function isHlsUrl(url: string): boolean {
  return /\.m3u8(\?.*)?$/i.test(url);
}

export function inferMimeFromUrl(url: string): string | null {
  const clean = normalizeUrl(url).toLowerCase();
  if (clean.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (clean.endsWith(".mp3")) return "audio/mpeg";
  if (clean.endsWith(".aac")) return "audio/aac";
  if (clean.endsWith(".ogg") || clean.endsWith(".oga")) return "audio/ogg";
  return null;
}

export function getMime(stream: Stream): string | null {
  return stream.format || inferMimeFromUrl(stream.url);
}

export function canBrowserPlay(audio: HTMLAudioElement, mime: string | null): boolean {
  if (!mime) return true; // when unknown, attempt anyway
  const support = audio.canPlayType(mime);
  return support === "probably" || support === "maybe";
}

// Adapter: choose how to attach and start playback; resolves on successful play
export async function playWithAdapter(
  stream: Stream,
  audio: HTMLAudioElement
): Promise<{ hls?: Hls }> {
  const url = normalizeUrl(stream.url);
  const mime = getMime(stream);

  // HLS via hls.js
  if (isHlsUrl(url) && Hls.isSupported()) {
    const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
    return new Promise((resolve, reject) => {
      hls.loadSource(url);
      hls.attachMedia(audio);

      hls.on(Hls.Events.MANIFEST_PARSED, async () => {
        try {
          await audio.play();
          resolve({ hls });
        } catch (err) {
          hls.destroy();
          reject(err instanceof Error ? err : new Error("Failed to play HLS"));
        }
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          hls.destroy();
          reject(new Error(`HLS fatal error: ${data.type}`));
        }
      });
    });
  }

  // Native HLS (Safari)
  if (isHlsUrl(url) && audio.canPlayType("application/vnd.apple.mpegurl")) {
    audio.src = url;
    audio.load();
    await audio.play();
    return {};
  }

  // Regular audio (mp3/aac/ogg/streams with ';')
  if (canBrowserPlay(audio, mime)) {
    audio.src = url;
    audio.load();
    await audio.play();
    return {};
  }

  // If browser reports no support, still attempt as last resort
  audio.src = url;
  audio.load();
  await audio.play();
  return {};
}

// Rank formats for selection preference
const FORMAT_RANK: Record<string, number> = {
  "application/vnd.apple.mpegurl": 100,
  "audio/aac": 90,
  "audio/mpeg": 80,
  "audio/ogg": 70,
};

export function sortStreamsByPreference(streams: Stream[]): Stream[] {
  return [...streams]
    .map((s) => ({
      stream: s,
      url: normalizeUrl(s.url),
      mime: getMime(s) || "",
      rank: (s.primary ? 1000 : 0) + (FORMAT_RANK[getMime(s) || ""] || 0),
    }))
    .filter((x) => x.url.length > 0)
    .sort((a, b) => b.rank - a.rank)
    .map((x) => ({ ...x.stream, url: x.url }));
}