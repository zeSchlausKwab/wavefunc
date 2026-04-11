import { useEffect } from "react";
import { useMetadataStore } from "../../stores/metadataStore";
import { usePlayerStore } from "../../stores/playerStore";

/**
 * Wires the current playback state into the OS-level media session.
 *
 * Targets:
 * - Android WebView / Chrome: lockscreen controls, notification with
 *   artwork, Bluetooth / headset buttons
 * - macOS: Now Playing center, Touch Bar, media keys
 * - Windows: SMTC
 * - Linux: MPRIS (most desktop environments)
 * - iOS Safari / WKWebView: lockscreen + control center
 *
 * Feature-detects `navigator.mediaSession`; no-op in environments that
 * lack it. Safe in SSR (falls through via `typeof navigator` guard).
 *
 * Purely a side-effect hook. Mount it once at app level (or inside the
 * FloatingPlayer which is already mounted app-wide). Do not call it
 * more than once per page — a second call would install competing
 * action handlers.
 */
export function useMediaSession() {
  // Read from the state machine for precise status, and from the
  // (decoupled) metadata store for song info. Note that we key most
  // effects on `state.kind` rather than `isPlaying` so transitions
  // like buffering→playing don't flip the lockscreen metadata.
  const state = usePlayerStore((s) => s.state);
  const currentStation = usePlayerStore((s) => s.currentStation);
  const currentMetadata = useMetadataStore((s) => s.currentMetadata);
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);
  const stop = usePlayerStore((s) => s.stop);

  // Push metadata whenever the station or now-playing info changes.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    if (!currentStation) {
      navigator.mediaSession.metadata = null;
      return;
    }

    const stationName = currentStation.name || "WaveFunc";
    const songTitle = currentMetadata?.song?.trim();
    const songArtist = currentMetadata?.artist?.trim();

    // When we have live now-playing metadata, surface song/artist as the
    // headline and push the station name into the album slot. When we
    // don't, show the station name as the title so the lockscreen isn't
    // empty while buffering or between tracks.
    const title = songTitle || stationName;
    const artist = songArtist || (songTitle ? stationName : "WaveFunc Radio");
    const album = songTitle ? stationName : undefined;

    const artwork = currentStation.thumbnail
      ? [
          {
            src: currentStation.thumbnail,
            // We don't know the real dimensions so advertise a few common
            // sizes. The OS picks whichever it wants; if the fetch fails
            // it silently falls back to an app icon.
            sizes: "96x96 192x192 512x512",
            type: "image/png",
          },
        ]
      : [];

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        album,
        artwork,
      });
    } catch (err) {
      // Browsers with partial implementations (e.g., no MediaMetadata
      // constructor) — log once and move on. Everything else still works.
      console.warn("useMediaSession: failed to set metadata", err);
    }
  }, [currentStation, currentMetadata]);

  // Reflect playback state so the OS shows the correct button.
  //
  // Mapping rules, chosen to avoid lockscreen flicker during recovery:
  // - playing          → "playing" (audio advancing)
  // - loading          → "playing" (user intent is play; spinner is
  //                     already visible in our UI)
  // - buffering        → "playing" (transient; do NOT flip to paused —
  //                     that makes the lockscreen play/pause button
  //                     twitch every time the network hiccups)
  // - reconnecting     → "playing" (same reason; user intent is still
  //                     play, we're working on it)
  // - paused           → "paused"
  // - failed / idle    → "none"
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    const kind = state.kind;
    navigator.mediaSession.playbackState =
      kind === "playing" || kind === "loading" || kind === "buffering" || kind === "reconnecting"
        ? "playing"
        : kind === "paused"
        ? "paused"
        : "none";
  }, [state.kind]);

  // Install action handlers once. Resume/pause/stop come from the store
  // closure directly, so the handlers don't need to be reinstalled on
  // every render. We clear them on unmount so a second mount (e.g., under
  // React StrictMode in dev) doesn't leave stale references.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler | null]> = [
      ["play", () => resume()],
      ["pause", () => pause()],
      ["stop", () => stop()],
    ];

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Some actions are unsupported in some WebViews (e.g., "stop" on
        // older Chromium). Ignore — the supported ones still register.
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // ignore
        }
      }
    };
  }, [resume, pause, stop]);
}
