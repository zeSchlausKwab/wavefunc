import Hls from "hls.js";
import type { Stream } from "../nostr/domain";
import { isTauri } from "@/config/env";

// Normalize URLs coming from events (trim spaces/backticks)
export function normalizeUrl(url: string): string {
  return (url || "").trim().replace(/^`+|`+$/g, "");
}

/**
 * Returns true if this URL points at localhost (any port). Mixed-content rules
 * generally allow localhost even from https origins, and we don't want to
 * silently rewrite a developer's local dev server.
 */
function isLocalhost(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

/**
 * Returns the URL we'd actually try to feed the <audio> element.
 *
 * On an https web page, browsers block any http:// audio resource as mixed
 * content. JavaScript can't bypass that. The cheapest workaround that doesn't
 * involve a proxy is to optimistically upgrade the scheme: a huge fraction of
 * radio servers serve the same stream over both http and https on the same
 * hostname (e.g. radioca.st, somafm.com, fluxfm.de, laut.fm, ...). For those,
 * upgrading just works. For the rare upstream that genuinely has no TLS, the
 * audio element fires an error and the supervisor's candidate-fallback / fail
 * state handles it the same way it would have anyway.
 *
 * We skip the upgrade in three cases:
 *   - we're inside Tauri (no mixed-content restriction; native http works)
 *   - the page itself is http (e.g. localhost dev) — no upgrade needed
 *   - the URL is localhost (preserve developer expectations)
 */
export function effectivePlayUrl(url: string): string {
  const normalized = normalizeUrl(url);
  if (typeof window === "undefined") return normalized;
  if (isTauri()) return normalized;
  if (window.location.protocol !== "https:") return normalized;
  if (!normalized.startsWith("http://")) return normalized;
  if (isLocalhost(normalized)) return normalized;
  return "https://" + normalized.slice("http://".length);
}

/**
 * True only when even after the best-effort upgrade we still have a non-https
 * URL on an https page (i.e. the upgrade was suppressed by the localhost
 * exception). Everything else gets a chance to play in-app first; if that
 * fails the supervisor surfaces a failed state and the user can still choose
 * to open the original stream externally.
 */
export function requiresExternalPlayback(url: string): boolean {
  if (typeof window === "undefined") return false;
  if (isTauri()) return false;
  if (window.location.protocol !== "https:") return false;
  const effective = effectivePlayUrl(url);
  return effective.startsWith("http://");
}

export function canPlayStreamInApp(stream: Stream): boolean {
  return !requiresExternalPlayback(stream.url);
}

export function openStreamExternally(url: string): void {
  const normalized = normalizeUrl(url);
  if (typeof window === "undefined") return;
  window.open(normalized, "_blank", "noopener,noreferrer");
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
  // Use effectivePlayUrl so an http stream from an https page becomes an
  // https request the browser will actually let through (best-effort upgrade;
  // see comment on the function for why this is safe).
  const url = effectivePlayUrl(stream.url);
  const mime = getMime(stream);

  if (requiresExternalPlayback(url)) {
    throw new Error("This stream must be opened externally");
  }

  // HLS via hls.js
  if (isHlsUrl(url) && Hls.isSupported()) {
    // Tuned for live radio robustness over latency. Most radio HLS
    // streams aren't LL-HLS, so `lowLatencyMode` tightens buffer
    // targets pointlessly and makes stalls more likely on jittery
    // connections. A larger buffer gives us headroom to survive
    // short network drops without a visible buffering state.
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      maxBufferLength: 60,
      maxMaxBufferLength: 600,
      // Let hls.js retry on its own for transient loader errors
      // before we see a fatal event and escalate to the supervisor.
      fragLoadingMaxRetry: 4,
      manifestLoadingMaxRetry: 4,
      levelLoadingMaxRetry: 4,
    });
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
    .map((s) => {
      const url = normalizeUrl(s.url);
      const playableInApp = canPlayStreamInApp(s);
      // Prefer truly-https URLs over urls we'd merely *try* to upgrade. A
      // station that already lists an https variant is more reliable than one
      // that only has http (where the upgrade may or may not work upstream).
      const nativeHttps = url.startsWith("https://") ? 500 : 0;
      return {
        stream: s,
        url,
        mime: getMime(s) || "",
        rank:
          (playableInApp ? 10_000 : 0) +
          nativeHttps +
          (s.primary ? 1000 : 0) +
          (FORMAT_RANK[getMime(s) || ""] || 0),
      };
    })
    .filter((x) => x.url.length > 0)
    .sort((a, b) => b.rank - a.rank)
    .map((x) => ({ ...x.stream, url: x.url }));
}

export function getDefaultSelectedStream(streams: Stream[]): Stream | undefined {
  const sorted = sortStreamsByPreference(streams);
  return sorted[0];
}
