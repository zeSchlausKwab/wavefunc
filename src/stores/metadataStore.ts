/**
 * Metadata store. Decoupled from playback — metadata failures never
 * affect audio, and playback state changes drive this store's poll
 * loop via a subscription to the player store.
 *
 * Responsibilities:
 * - Poll contextvm for stream metadata (artist/title) while the
 *   player is in `playing` or `buffering` state.
 * - Enrich with MusicBrainz lookups when artist+title are available.
 * - Expose `currentMetadata` to UI components that previously read
 *   it from the player store.
 * - Stop polling immediately when playback becomes inactive, so we
 *   don't waste requests on a station we're trying to reconnect to.
 *
 * See docs/PLAYER_V2.md — this is the "decoupled metadata pipeline".
 */

import { create } from "zustand";

import { getMetadataClient } from "../ctxcn/WavefuncMetadataServerClient";
import { usePlayerStore } from "./playerStore";

export const METADATA_POLL_MS = 15000;

export interface CurrentMetadata {
  title?: string;
  artist?: string;
  song?: string;
  station?: string;
  genre?: string;
  bitrate?: string;
  musicBrainz?: {
    id: string;
    title: string;
    artist: string;
    release?: string;
    releaseId?: string;
    releaseDate?: string;
    duration?: number;
    tags?: string[];
  };
}

export type MetadataStatus = "idle" | "fetching" | "error";

interface MetadataStore {
  currentMetadata: CurrentMetadata | null;
  status: MetadataStatus;
  lastError: string | null;
  lastFetchAt: number | null;
  // Internal — don't read from UI
  _currentStreamUrl: string | null;
  _pollTimer: ReturnType<typeof setInterval> | null;
  _reset: () => void;
}

export const useMetadataStore = create<MetadataStore>((_set, _get) => ({
  currentMetadata: null,
  status: "idle",
  lastError: null,
  lastFetchAt: null,
  _currentStreamUrl: null,
  _pollTimer: null,
  _reset: () => {
    useMetadataStore.setState({
      currentMetadata: null,
      status: "idle",
      lastError: null,
      lastFetchAt: null,
    });
  },
}));

/**
 * Fetch metadata once for the given URL. Exported for testing, but
 * the main entry point is the subscription below — callers shouldn't
 * need to invoke this directly.
 */
async function fetchMetadataOnce(url: string): Promise<void> {
  useMetadataStore.setState({ status: "fetching", lastError: null });

  try {
    const { result: metadata } = await getMetadataClient().ExtractStreamMetadata(url);

    // Some streams report `title` but not `song`. Unify under `song`
    // so the UI can rely on one field.
    const normalized: CurrentMetadata = {
      ...metadata,
      song: metadata.song || metadata.title,
    };

    // If we got both artist and song, try to enrich from MusicBrainz.
    // Failure here is non-fatal — we still publish the base metadata.
    if (normalized.artist && normalized.song) {
      try {
        const { result: mbResults } = await getMetadataClient().SearchRecordings(
          normalized.song,
          normalized.artist
        );
        normalized.musicBrainz = mbResults[0];
      } catch (err) {
        console.warn("metadataStore: MusicBrainz lookup failed", err);
      }
    }

    useMetadataStore.setState({
      currentMetadata: normalized,
      status: "idle",
      lastFetchAt: Date.now(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    useMetadataStore.setState({
      status: "error",
      lastError: message,
      lastFetchAt: Date.now(),
    });
    // Intentionally don't clear currentMetadata on error — the user
    // keeps seeing the last successful result, which is usually still
    // accurate for radio.
  }
}

function startPolling(url: string): void {
  const store = useMetadataStore.getState();
  if (store._pollTimer !== null && store._currentStreamUrl === url) {
    return; // already polling this URL
  }
  stopPolling();

  useMetadataStore.setState({ _currentStreamUrl: url });

  // Poll immediately, then on interval.
  void fetchMetadataOnce(url);
  const timer = setInterval(() => {
    void fetchMetadataOnce(url);
  }, METADATA_POLL_MS);

  useMetadataStore.setState({ _pollTimer: timer });
}

function stopPolling(): void {
  const store = useMetadataStore.getState();
  if (store._pollTimer !== null) {
    clearInterval(store._pollTimer);
  }
  useMetadataStore.setState({
    _pollTimer: null,
    _currentStreamUrl: null,
  });
}

/**
 * Wire the metadata store to the player store. Called once at app
 * startup (from playerStore.ts). Subscribes to player state changes
 * and starts/stops polling in response.
 *
 * We key on `state.kind + currentStream.url` so a station change
 * restarts the poller with the new URL, and a transition from
 * playing to reconnecting pauses it.
 */
export function installMetadataSubscription(): () => void {
  const unsub = usePlayerStore.subscribe((store, prev) => {
    const state = store.state;
    const prevState = prev.state;

    // Transition OUT of a playing-ish state: stop polling.
    const wasActive =
      prevState.kind === "playing" || prevState.kind === "buffering";
    const nowActive = state.kind === "playing" || state.kind === "buffering";

    if (wasActive && !nowActive) {
      stopPolling();
      return;
    }

    // Transition INTO or STATIONS-CHANGED within playing-ish state:
    // (re)start polling for the new URL.
    if (nowActive) {
      const url =
        state.kind === "playing" || state.kind === "buffering"
          ? state.stream.url
          : null;
      if (url) startPolling(url);
    }

    // Idle means reset everything.
    if (state.kind === "idle" && prevState.kind !== "idle") {
      stopPolling();
      useMetadataStore.getState()._reset();
    }
  });

  return () => {
    unsub();
    stopPolling();
  };
}
