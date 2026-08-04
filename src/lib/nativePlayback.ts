import { isTauri } from "../config/env";
import type { ParsedStation, Stream } from "./nostr/domain";
import { normalizeUrl, sortStreamsByPreference } from "./player/adapters";
import { useMetadataStore } from "../stores/metadataStore";
import { usePlayerStore } from "../stores/playerStore";

export type NativePlaybackState =
  | "idle"
  | "loading"
  | "playing"
  | "buffering"
  | "paused"
  | "failed";

export interface NativePlaybackEvent {
  state: NativePlaybackState;
  error?: string;
  url?: string;
}

export interface NativePlaybackAdapter {
  play(station: ParsedStation, stream: Stream): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  updateMetadata(station: ParsedStation): Promise<void>;
  setVolume(volume: number, muted: boolean): Promise<void>;
}

interface CommandResponse {
  ok: boolean;
}

/**
 * Installs Media3 as the Android playback backend.
 *
 * Web and desktop deliberately keep using the existing HTML audio
 * supervisor. Android instead sends station URLs to a native
 * MediaSessionService so playback and notification controls survive WebView
 * suspension and screen locking.
 */
export async function installNativePlayback(): Promise<() => void> {
  if (!isTauri()) return () => {};

  const [{ platform }, { invoke, addPluginListener }] = await Promise.all([
    import("@tauri-apps/plugin-os"),
    import("@tauri-apps/api/core"),
  ]);
  if (platform() !== "android") return () => {};

  const metadataPayload = (station: ParsedStation) => {
    const metadata = useMetadataStore.getState().currentMetadata;
    return {
      stationName: station.name || "WaveFunc",
      artworkUrl: station.thumbnail || null,
      song: metadata?.song?.trim() || metadata?.title?.trim() || null,
      artist: metadata?.artist?.trim() || null,
    };
  };

  const adapter: NativePlaybackAdapter = {
    async play(station, stream) {
      const primaryUrl = normalizeUrl(stream.url);
      const alternatives = sortStreamsByPreference(station.streams)
        .map((candidate) => normalizeUrl(candidate.url))
        .filter((url) => url && url !== primaryUrl);

      await invoke<CommandResponse>("plugin:wavefunc-player|play", {
        payload: {
          url: primaryUrl,
          alternatives,
          stationId: station.naddr || station.id,
          ...metadataPayload(station),
        },
      });
    },
    async pause() {
      await invoke<CommandResponse>("plugin:wavefunc-player|pause");
    },
    async resume() {
      await invoke<CommandResponse>("plugin:wavefunc-player|resume");
    },
    async stop() {
      await invoke<CommandResponse>("plugin:wavefunc-player|stop");
    },
    async updateMetadata(station) {
      await invoke<CommandResponse>("plugin:wavefunc-player|update_metadata", {
        payload: metadataPayload(station),
      });
    },
    async setVolume(volume, muted) {
      await invoke<CommandResponse>("plugin:wavefunc-player|set_volume", {
        payload: { volume, muted },
      });
    },
  };

  const stateListener = await addPluginListener<NativePlaybackEvent>(
    "wavefunc-player",
    "state",
    (event) => usePlayerStore.getState().handleNativePlaybackEvent(event)
  );

  usePlayerStore.getState().setNativePlayback(adapter);
  const initial = usePlayerStore.getState();
  void adapter.setVolume(initial.volume, initial.isMuted).catch((error) => {
    console.warn("nativePlayback: initial volume update failed", error);
  });

  const unsubscribeMetadata = useMetadataStore.subscribe((store, previous) => {
    if (store.currentMetadata === previous.currentMetadata) return;
    const station = usePlayerStore.getState().currentStation;
    if (station) {
      void adapter.updateMetadata(station).catch((error) => {
        console.warn("nativePlayback: metadata update failed", error);
      });
    }
  });

  return () => {
    unsubscribeMetadata();
    void stateListener.unregister();
    if (usePlayerStore.getState().nativePlayback === adapter) {
      usePlayerStore.getState().setNativePlayback(null);
    }
  };
}
